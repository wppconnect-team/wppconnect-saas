import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';

export const contactRoutes = new Elysia({ prefix: '/api/contacts' })
  .use(authPlugin)

  // GET /api/contacts
  .get('/',
    async ({ query }) => {
      const { search, status } = query;

      const rows = await sql<{
        id: number; name: string; phone: string; tags: string[];
        status: string; messagesCount: number; lastInteraction: string;
      }[]>`
        SELECT
          id, name, phone, tags, status,
          messages_count    AS "messagesCount",
          last_interaction  AS "lastInteraction"
        FROM contacts
        WHERE
          (${status ?? null}::text IS NULL OR status = ${status ?? null}::text)
          AND (
            ${search ?? null}::text IS NULL
            OR name  ILIKE ${'%' + (search ?? '') + '%'}
            OR phone ILIKE ${'%' + (search ?? '') + '%'}
          )
        ORDER BY created_at DESC
      `;

      const [stats] = await sql<{
        total: number; ativos: number; inativos: number; totalMessages: number;
      }[]>`
        SELECT
          COUNT(*)                                          AS total,
          COUNT(*) FILTER (WHERE status = 'ativo')         AS ativos,
          COUNT(*) FILTER (WHERE status = 'inativo')       AS inativos,
          COALESCE(SUM(messages_count), 0)                 AS "totalMessages"
        FROM contacts
      `;

      return { data: rows, stats };
    },
    {
      query: t.Object({
        search: t.Optional(t.String()),
        status: t.Optional(t.String()),
      }),
    }
  )

  // POST /api/contacts
  .post('/',
    async ({ body, set }) => {
      const { name, phone, tags, status } = body;

      const [contact] = await sql`
        INSERT INTO contacts (name, phone, tags, status)
        VALUES (${name}, ${phone}, ${tags ?? []}, ${status ?? 'ativo'})
        RETURNING
          id, name, phone, tags, status,
          messages_count   AS "messagesCount",
          last_interaction AS "lastInteraction"
      `;

      set.status = 201;
      return { data: contact };
    },
    {
      body: t.Object({
        name:   t.String({ minLength: 1 }),
        phone:  t.String({ minLength: 1 }),
        tags:   t.Optional(t.Array(t.String())),
        status: t.Optional(t.String()),
      }),
    }
  )

  // DELETE /api/contacts/:id
  .delete('/:id',
    async ({ params, set }) => {
      const [deleted] = await sql`
        DELETE FROM contacts WHERE id = ${Number(params.id)} RETURNING id
      `;
      if (!deleted) { set.status = 404; return { error: 'Contato não encontrado' }; }
      set.status = 204;
      return null;
    }
  );
