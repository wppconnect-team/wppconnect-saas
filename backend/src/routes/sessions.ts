import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';

export const sessionRoutes = new Elysia({ prefix: '/api/sessions' })
  .use(authPlugin)

  // GET /api/sessions  — lista com filtro e contagens
  .get('/',
    async ({ query }) => {
      const { status, search } = query;

      const rows = await sql<{
        id: string; name: string; phone: string; status: string;
        tag: string; messagesToday: number; lastActivity: string; created: string;
      }[]>`
        SELECT
          id, name, phone, status, tag,
          messages_today                         AS "messagesToday",
          last_activity                          AS "lastActivity",
          TO_CHAR(created_at, 'DD/MM/YYYY')      AS created
        FROM sessions
        WHERE
          (${status ?? null}::text IS NULL OR status = ${status ?? null}::text)
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
    async ({ body, set }) => {
      const { id, name, phone, tag } = body;

      const [session] = await sql<{ id: string }[]>`
        INSERT INTO sessions (id, name, phone, tag, status)
        VALUES (
          ${id ?? 'wa_' + Math.random().toString(36).slice(2, 6)},
          ${name},
          ${phone ?? '—'},
          ${tag ?? 'atendimento'},
          'qr'
        )
        RETURNING
          id, name, phone, status, tag,
          messages_today                    AS "messagesToday",
          last_activity                     AS "lastActivity",
          TO_CHAR(created_at, 'DD/MM/YYYY') AS created
      `;

      set.status = 201;
      return { data: session };
    },
    {
      body: t.Object({
        id:    t.Optional(t.String()),
        name:  t.String({ minLength: 1 }),
        phone: t.Optional(t.String()),
        tag:   t.Optional(t.String()),
      }),
    }
  )

  // GET /api/sessions/:id — detalhes
  .get('/:id',
    async ({ params, set }) => {
      const [session] = await sql`
        SELECT
          id, name, phone, status, tag,
          messages_today                    AS "messagesToday",
          last_activity                     AS "lastActivity",
          TO_CHAR(created_at, 'DD/MM/YYYY') AS created
        FROM sessions
        WHERE id = ${params.id}
      `;

      if (!session) { set.status = 404; return { error: 'Sessão não encontrada' }; }
      return { data: session };
    }
  )

  // PUT /api/sessions/:id — atualizar
  .put('/:id',
    async ({ params, body, set }) => {
      const fields = body as Record<string, unknown>;
      const allowed = ['name','phone','status','tag','messages_today','last_activity'] as const;

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

      // Monta SET dinâmico sem ORM
      const setParts = updates.map((col, i) => sql`${sql(col)} = ${values[i]}`);
      const [updated] = await sql`
        UPDATE sessions
        SET ${sql.join(setParts, sql`, `)}
        WHERE id = ${params.id}
        RETURNING
          id, name, phone, status, tag,
          messages_today                    AS "messagesToday",
          last_activity                     AS "lastActivity",
          TO_CHAR(created_at, 'DD/MM/YYYY') AS created
      `;

      if (!updated) { set.status = 404; return { error: 'Sessão não encontrada' }; }
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
      }),
    }
  )

  // DELETE /api/sessions/:id
  .delete('/:id',
    async ({ params, set }) => {
      const [deleted] = await sql`
        DELETE FROM sessions WHERE id = ${params.id} RETURNING id
      `;

      if (!deleted) { set.status = 404; return { error: 'Sessão não encontrada' }; }
      set.status = 204;
      return null;
    }
  );
