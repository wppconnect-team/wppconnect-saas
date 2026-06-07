import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';
import { insertLog } from '../lib/log';

const WPP_SERVER     = process.env.WPP_SERVER     ?? 'http://localhost:21465/api';
const WPP_SECRET_KEY = process.env.WPP_SECRET_KEY ?? 'THISISMYSECURETOKEN';

export const sessionRoutes = new Elysia({ prefix: '/api/sessions' })
  .use(authPlugin)

  // GET /api/sessions  — lista (sem wppToken; buscar GET /:id para obter o token)
  .get('/',
    async ({ query, userId }) => {
      const { status, search } = query;

      // Sessões presas em 'qr' há mais de 90s são automaticamente desconectadas
      await sql`
        UPDATE sessions
        SET status = 'offline', qr_image = NULL, qr_expires_at = NULL
        WHERE user_id = ${userId}
          AND status = 'qr'
          AND (qr_expires_at IS NULL OR qr_expires_at < NOW())
      `;

      const rows = await sql<{
        id: string; name: string; phone: string; status: string;
        tag: string; messagesToday: number; lastActivity: string; created: string;
        webhook: string; proxy: unknown;
      }[]>`
        SELECT
          id, name, phone, status, tag,
          messages_today                         AS "messagesToday",
          last_activity                          AS "lastActivity",
          TO_CHAR(created_at, 'DD/MM/YYYY')      AS created,
          webhook,
          proxy
        FROM sessions
        WHERE user_id = ${userId}
          AND (${status ?? null}::text IS NULL OR status = ${status ?? null}::text)
          AND (
            ${search ?? null}::text IS NULL
            OR name  ILIKE ${'%' + (search ?? '') + '%'}
            OR phone ILIKE ${'%' + (search ?? '') + '%'}
          )
        ORDER BY created_at DESC
      `;

      const [counts] = await sql<{
        total: number; connected: number; pending: number; offline: number;
      }[]>`
        SELECT
          COUNT(*)                                                                    AS total,
          COUNT(*) FILTER (WHERE status = 'connected')                              AS connected,
          COUNT(*) FILTER (WHERE status IN ('pending','qr'))                        AS pending,
          COUNT(*) FILTER (WHERE status = 'offline')                                AS offline
        FROM sessions
        WHERE user_id = ${userId}
      `;

      return { data: rows, counts };
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    }
  )

  // POST /api/sessions — criar sessão
  .post('/',
    async ({ body, set, userId }) => {
      const { id, name, phone, tag, webhook, proxy } = body;
      const sessionId = id ?? 'wa_' + Math.random().toString(36).slice(2, 6);

      // Gera token no servidor WppConnect
      let wppToken = '';
      try {
        const res = await fetch(
          `${WPP_SERVER}/${sessionId}/${WPP_SECRET_KEY}/generate-token`,
          { method: 'POST' }
        );
        if (res.ok) {
          const data = await res.json() as { token?: string };
          wppToken = data.token ?? '';
        }
      } catch (err) {
        console.error('[WppConnect] generate-token falhou:', err);
      }

      const [session] = await sql`
        INSERT INTO sessions (id, name, phone, tag, status, wpp_token, webhook, proxy, user_id)
        VALUES (
          ${sessionId},
          ${name},
          ${phone ?? '—'},
          ${tag ?? 'atendimento'},
          'qr',
          ${wppToken},
          ${webhook ?? ''},
          ${proxy ? sql.json(proxy as Record<string, unknown>) : null},
          ${userId}
        )
        RETURNING
          id, name, phone, status, tag, wpp_token AS "wppToken",
          webhook, proxy,
          messages_today                    AS "messagesToday",
          last_activity                     AS "lastActivity",
          TO_CHAR(created_at, 'DD/MM/YYYY') AS created
      `;

      await insertLog('info', `Sessão "${session.name}" criada`, session.id, userId);

      set.status = 201;
      return { data: session };
    },
    {
      body: t.Object({
        id:      t.Optional(t.String()),
        name:    t.String({ minLength: 1 }),
        phone:   t.Optional(t.String()),
        tag:     t.Optional(t.String()),
        webhook: t.Optional(t.String()),
        proxy:   t.Optional(t.Object({
          url:      t.String(),
          username: t.Optional(t.String()),
          password: t.Optional(t.String()),
        })),
      }),
    }
  )

  // GET /api/sessions/:id — detalhes com wppToken
  .get('/:id',
    async ({ params, set, userId }) => {
      const [session] = await sql`
        SELECT
          id, name, phone, status, tag, wpp_token AS "wppToken",
          webhook, proxy,
          messages_today                    AS "messagesToday",
          last_activity                     AS "lastActivity",
          TO_CHAR(created_at, 'DD/MM/YYYY') AS created,
          qr_image                          AS "qrImage",
          qr_expires_at                     AS "qrExpiresAt"
        FROM sessions
        WHERE id = ${params.id}
          AND user_id = ${userId}
      `;

      if (!session) { set.status = 404; return { error: 'Sessão não encontrada' }; }
      return { data: session };
    }
  )

  // PUT /api/sessions/:id — atualizar
  .put('/:id',
    async ({ params, body, set, userId }) => {
      const fields = body as Record<string, unknown>;
      const allowed = ['name','phone','status','tag','messages_today','last_activity','webhook','qr_image','qr_expires_at'] as const;

      const updates: string[] = [];
      const values: unknown[] = [];

      for (const key of allowed) {
        if (key in fields) {
          updates.push(key);
          values.push(fields[key]);
        }
      }

      if (updates.length === 0) {
        set.status = 400;
        return { error: 'Nenhum campo para atualizar' };
      }

      const setParts = updates.map((col, i) => sql`${sql(col)} = ${values[i]}`);
      const [updated] = await sql`
        UPDATE sessions
        SET ${sql.join(setParts, sql`, `)}
        WHERE id = ${params.id}
          AND user_id = ${userId}
        RETURNING
          id, name, phone, status, tag,
          webhook, proxy,
          messages_today                    AS "messagesToday",
          last_activity                     AS "lastActivity",
          TO_CHAR(created_at, 'DD/MM/YYYY') AS created
      `;

      if (!updated) { set.status = 404; return { error: 'Sessão não encontrada' }; }

      const newStatus = (fields as Record<string, unknown>).status as string | undefined;
      if (newStatus === 'connected') {
        await insertLog('ok',   `Sessão ${params.id} conectada com sucesso`, params.id, userId);
      } else if (newStatus === 'offline') {
        await insertLog('warn', `Sessão ${params.id} desconectada`, params.id, userId);
      } else if (newStatus === 'qr') {
        await insertLog('info', `QR Code regenerado para ${params.id}`, params.id, userId);
      }

      return { data: updated };
    },
    {
      body: t.Object({
        name:           t.Optional(t.String()),
        phone:          t.Optional(t.String()),
        status:         t.Optional(t.String()),
        tag:            t.Optional(t.String()),
        messages_today: t.Optional(t.Number()),
        last_activity:  t.Optional(t.String()),
        qr_image:       t.Optional(t.Union([t.String(), t.Null()])),
        qr_expires_at:  t.Optional(t.Union([t.String(), t.Null()])),
      }),
    }
  )

  // DELETE /api/sessions/:id
  .delete('/:id',
    async ({ params, set, userId }) => {
      const [deleted] = await sql`
        DELETE FROM sessions
        WHERE id = ${params.id}
          AND user_id = ${userId}
        RETURNING id
      `;

      if (!deleted) { set.status = 404; return { error: 'Sessão não encontrada' }; }

      await insertLog('info', `Sessão ${params.id} removida`, params.id, userId);

      set.status = 204;
      return null;
    }
  );
