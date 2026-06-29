import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';
import { insertLog } from '../lib/log';
import {
  callRuntimeJson,
  callRuntimeQrCode,
  defaultProvider,
  generateSessionToken,
  type RuntimeSession,
} from '../lib/embeddedSessionManager';

export const sessionRoutes = new Elysia({ prefix: '/api/sessions' })
  .use(authPlugin)

  // GET /api/sessions
  .get('/',
    async ({ query, userId, workspaceId }) => {
      const { status, search } = query;

      await sql`
        UPDATE sessions
        SET status = 'offline', qr_image = NULL, qr_expires_at = NULL
        WHERE workspace_id = ${workspaceId}
          AND status = 'qr'
          AND (qr_expires_at IS NULL OR qr_expires_at < NOW())
      `;

      const rows = await sql<{
        id: string; name: string; phone: string; status: string;
        tag: string; messagesToday: number; lastActivity: string; created: string;
        webhook: string; proxy: unknown; runtime: string; provider: string;
      }[]>`
        SELECT
          id, name, phone, status, tag,
          messages_today                         AS "messagesToday",
          last_activity                          AS "lastActivity",
          TO_CHAR(created_at, 'DD/MM/YYYY')      AS created,
          webhook,
          proxy,
          runtime,
          provider
        FROM sessions
        WHERE workspace_id = ${workspaceId}
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
        WHERE workspace_id = ${workspaceId}
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

  // POST /api/sessions
  .post('/',
    async ({ body, set, userId, workspaceId }) => {
      const { id, name, phone, tag, webhook, proxy } = body;
      const sessionId = id ?? 'wa_' + Math.random().toString(36).slice(2, 6);
      const provider = body.provider ?? defaultProvider();

      let wppToken: string;
      try {
        wppToken = await generateSessionToken(sessionId);
      } catch (err) {
        set.status = 502;
        return {
          error: 'Não foi possível criar token da sessão no runtime interno',
          details: err instanceof Error ? err.message : String(err),
        };
      }

      const [session] = await sql`
        INSERT INTO sessions (
          id, name, phone, tag, status, wpp_token, webhook, proxy,
          user_id, workspace_id, runtime, provider
        )
        VALUES (
          ${sessionId},
          ${name},
          ${phone ?? '—'},
          ${tag ?? 'atendimento'},
          'qr',
          ${wppToken},
          ${webhook ?? ''},
          ${proxy ? sql.json(proxy as Parameters<typeof sql.json>[0]) : null},
          ${userId},
          ${workspaceId},
          'embedded',
          ${provider}
        )
        RETURNING
          id, name, phone, status, tag, wpp_token AS "wppToken",
          webhook, proxy, runtime, provider,
          messages_today                    AS "messagesToday",
          last_activity                     AS "lastActivity",
          TO_CHAR(created_at, 'DD/MM/YYYY') AS created
      `;

      await insertLog('info', `Sessão "${session.name}" criada`, session.id, userId, workspaceId);

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
        provider: t.Optional(t.Union([
          t.Literal('wppconnect'),
          t.Literal('baileys'),
          t.Literal('whaileys'),
          t.Literal('zapo'),
          t.String(),
        ])),
        proxy:   t.Optional(t.Object({
          url:      t.String({ format: 'uri', maxLength: 2048 }),
          username: t.Optional(t.String({ maxLength: 200 })),
          password: t.Optional(t.String({ maxLength: 200 })),
        })),
      }),
    }
  )

  // GET /api/sessions/:id
  .get('/:id',
    async ({ params, set, workspaceId }) => {
      const [session] = await sql`
        SELECT
          id, name, phone, status, tag, wpp_token AS "wppToken",
          webhook, proxy, runtime, provider,
          messages_today                    AS "messagesToday",
          last_activity                     AS "lastActivity",
          TO_CHAR(created_at, 'DD/MM/YYYY') AS created,
          qr_image                          AS "qrImage",
          qr_expires_at                     AS "qrExpiresAt"
        FROM sessions
        WHERE id = ${params.id}
          AND workspace_id = ${workspaceId}
      `;

      if (!session) { set.status = 404; return { error: 'Sessão não encontrada' }; }
      return { data: session };
    }
  )

  // POST /api/sessions/:id/start
  .post('/:id/start',
    async ({ params, body, set, workspaceId }) => {
      const session = await getRuntimeSession(params.id, workspaceId);
      if (!session) { set.status = 404; return { error: 'Sessão não encontrada' }; }

      const result = await callRuntimeJson(session, 'start-session', {
        method: 'POST',
        body: JSON.stringify({
          ...(body ?? {}),
          provider: session.provider ?? defaultProvider(),
          webhook: session.webhook || undefined,
        }),
      });

      if (!result.ok) set.status = result.status;
      if (result.ok) await syncRuntimeState(session.id, workspaceId, result.data);
      return result.data;
    },
    {
      body: t.Optional(t.Object({
        waitQrCode: t.Optional(t.Boolean()),
        phone: t.Optional(t.String()),
      })),
    }
  )

  // GET /api/sessions/:id/status
  .get('/:id/status',
    async ({ params, query, set, workspaceId }) => {
      const session = await getRuntimeSession(params.id, workspaceId);
      if (!session) { set.status = 404; return { error: 'Sessão não encontrada' }; }

      const wait = query.waitQrCode === 'true' ? '?waitQrCode=true' : '';
      const result = await callRuntimeJson(session, `check-connection-session${wait}`);
      if (!result.ok) set.status = result.status;
      if (result.ok) await syncRuntimeState(session.id, workspaceId, result.data);
      return result.data;
    },
    {
      query: t.Object({
        waitQrCode: t.Optional(t.String()),
      }),
    }
  )

  // GET /api/sessions/:id/qrcode
  .get('/:id/qrcode',
    async ({ params, set, workspaceId }) => {
      const session = await getRuntimeSession(params.id, workspaceId);
      if (!session) { set.status = 404; return { error: 'Sessão não encontrada' }; }

      const result = await callRuntimeQrCode(session);
      if (!result.ok) set.status = result.status;
      if (typeof result.data.qrcode === 'string') {
        await syncRuntimeState(session.id, workspaceId, result.data);
      }
      return result.data;
    }
  )

  // POST /api/sessions/:id/send-message
  .post('/:id/send-message',
    async ({ params, body, set, workspaceId }) => {
      const session = await getRuntimeSession(params.id, workspaceId);
      if (!session) { set.status = 404; return { error: 'Sessão não encontrada' }; }

      const result = await callRuntimeJson(session, 'send-message', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!result.ok) set.status = result.status;
      return result.data;
    },
    {
      body: t.Object({
        phone: t.Union([t.String(), t.Array(t.String())]),
        message: t.String({ minLength: 1 }),
        isGroup: t.Optional(t.Boolean()),
      }),
    }
  )

  // PUT /api/sessions/:id
  .put('/:id',
    async ({ params, body, set, userId, workspaceId }) => {
      const fields = body as Record<string, unknown>;
      const allowed = ['name','phone','status','tag','messages_today','last_activity','webhook','qr_image','qr_expires_at','provider'] as const;

      const patch: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in fields) patch[key] = fields[key];
      }

      if (Object.keys(patch).length === 0) {
        set.status = 400;
        return { error: 'Nenhum campo para atualizar' };
      }

      const [updated] = await sql`
        UPDATE sessions
        SET ${sql(patch)}
        WHERE id = ${params.id}
          AND workspace_id = ${workspaceId}
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
        await insertLog('ok',   `Sessão ${params.id} conectada com sucesso`, params.id, userId, workspaceId);
      } else if (newStatus === 'offline') {
        await insertLog('warn', `Sessão ${params.id} desconectada`, params.id, userId, workspaceId);
      } else if (newStatus === 'qr') {
        await insertLog('info', `QR Code regenerado para ${params.id}`, params.id, userId, workspaceId);
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
        provider:       t.Optional(t.String()),
      }),
    }
  )

  // DELETE /api/sessions/:id
  .delete('/:id',
    async ({ params, set, userId, workspaceId }) => {
      const session = await getRuntimeSession(params.id, workspaceId);
      if (session) {
        await callRuntimeJson(session, 'close-session', { method: 'POST' }).catch(() => null);
        await callRuntimeJson(session, 'logout-session', { method: 'POST' }).catch(() => null);
      }

      const [deleted] = await sql`
        DELETE FROM sessions
        WHERE id = ${params.id}
          AND workspace_id = ${workspaceId}
        RETURNING id
      `;

      if (!deleted) { set.status = 404; return { error: 'Sessão não encontrada' }; }

      await insertLog('info', `Sessão ${params.id} removida`, params.id, userId, workspaceId);

      set.status = 204;
      return null;
    }
  );

async function getRuntimeSession(id: string, workspaceId: string): Promise<RuntimeSession | null> {
  const [session] = await sql<RuntimeSession[]>`
    SELECT
      id,
      wpp_token AS "wppToken",
      provider,
      webhook
    FROM sessions
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
  `;

  return session ?? null;
}

function normalizeRuntimeStatus(status: unknown): 'connected' | 'qr' | 'pending' | 'offline' | null {
  if (typeof status !== 'string') return null;
  const normalized = status.toLowerCase();
  if (['connected', 'inchat', 'islogged', 'authenticated'].includes(normalized)) return 'connected';
  if (['qrcode', 'qr', 'scan', 'notlogged'].includes(normalized)) return 'qr';
  if (['starting', 'opening', 'initializing', 'pairing'].includes(normalized)) return 'pending';
  if (['closed', 'disconnected', 'desconnected', 'offline'].includes(normalized)) return 'offline';
  return null;
}

async function syncRuntimeState(
  id: string,
  workspaceId: string,
  data: Record<string, unknown>
): Promise<void> {
  const status = normalizeRuntimeStatus(data.status);
  const qrcode = typeof data.qrcode === 'string' ? data.qrcode : null;

  if (!status && !qrcode) return;

  await sql`
    UPDATE sessions
    SET
      status = COALESCE(${status}, status),
      qr_image = ${qrcode},
      qr_expires_at = CASE WHEN ${qrcode}::text IS NULL THEN qr_expires_at ELSE NOW() + INTERVAL '60 seconds' END
    WHERE id = ${id}
      AND workspace_id = ${workspaceId}
  `;
}
