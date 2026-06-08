import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';

export const groupRoutes = new Elysia({ prefix: '/api/groups' })
  .use(authPlugin)

  // GET /api/groups
  .get('/',
    async ({ query, workspaceId }) => {
      const { search, status } = query;

      const rows = await sql<{
        id: number; name: string; description: string;
        participantsCount: number; tags: string[]; status: string;
        messagesCount: number; lastInteraction: string;
      }[]>`
        SELECT
          id, name, description,
          participants_count  AS "participantsCount",
          tags, status,
          messages_count      AS "messagesCount",
          last_interaction    AS "lastInteraction"
        FROM groups
        WHERE workspace_id = ${workspaceId}
          AND (${status ?? null}::text IS NULL OR status = ${status ?? null}::text)
          AND (
            ${search ?? null}::text IS NULL
            OR name        ILIKE ${'%' + (search ?? '') + '%'}
            OR description ILIKE ${'%' + (search ?? '') + '%'}
          )
        ORDER BY created_at DESC
      `;

      const [stats] = await sql<{
        total: number; ativos: number; inativos: number; totalParticipants: number;
      }[]>`
        SELECT
          COUNT(*)                                          AS total,
          COUNT(*) FILTER (WHERE status = 'ativo')         AS ativos,
          COUNT(*) FILTER (WHERE status = 'inativo')       AS inativos,
          COALESCE(SUM(participants_count), 0)             AS "totalParticipants"
        FROM groups
        WHERE workspace_id = ${workspaceId}
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

  // POST /api/groups
  .post('/',
    async ({ body, set, userId, workspaceId }) => {
      const { name, description, participantsCount, tags, status } = body;

      const [group] = await sql`
        INSERT INTO groups (name, description, participants_count, tags, status, user_id, workspace_id)
        VALUES (
          ${name},
          ${description ?? ''},
          ${participantsCount ?? 0},
          ${tags ?? []},
          ${status ?? 'ativo'},
          ${userId},
          ${workspaceId}
        )
        RETURNING
          id, name, description,
          participants_count  AS "participantsCount",
          tags, status,
          messages_count      AS "messagesCount",
          last_interaction    AS "lastInteraction"
      `;

      set.status = 201;
      return { data: group };
    },
    {
      body: t.Object({
        name:              t.String({ minLength: 1 }),
        description:       t.Optional(t.String()),
        participantsCount: t.Optional(t.Number()),
        tags:              t.Optional(t.Array(t.String())),
        status:            t.Optional(t.Union([t.Literal('ativo'), t.Literal('inativo')])),
      }),
    }
  )

  // PUT /api/groups/:id
  .put('/:id',
    async ({ params, body, set, workspaceId }) => {
      const { name, description, participantsCount, tags, status } = body;

      const [updated] = await sql`
        UPDATE groups
        SET
          name               = COALESCE(${name               ?? null}::text,    name),
          description        = COALESCE(${description        ?? null}::text,    description),
          participants_count = COALESCE(${participantsCount  ?? null}::int,     participants_count),
          tags               = COALESCE(${tags               ?? null}::text[],  tags),
          status             = COALESCE(${status             ?? null}::text,    status)
        WHERE id = ${Number(params.id)}
          AND workspace_id = ${workspaceId}
        RETURNING
          id, name, description,
          participants_count  AS "participantsCount",
          tags, status,
          messages_count      AS "messagesCount",
          last_interaction    AS "lastInteraction"
      `;

      if (!updated) { set.status = 404; return { error: 'Grupo não encontrado' }; }
      return { data: updated };
    },
    {
      body: t.Object({
        name:              t.Optional(t.String()),
        description:       t.Optional(t.String()),
        participantsCount: t.Optional(t.Number()),
        tags:              t.Optional(t.Array(t.String())),
        status:            t.Optional(t.Union([t.Literal('ativo'), t.Literal('inativo')])),
      }),
    }
  )

  // DELETE /api/groups/:id
  .delete('/:id',
    async ({ params, set, workspaceId }) => {
      const [deleted] = await sql`
        DELETE FROM groups
        WHERE id = ${Number(params.id)}
          AND workspace_id = ${workspaceId}
        RETURNING id
      `;
      if (!deleted) { set.status = 404; return { error: 'Grupo não encontrado' }; }
      set.status = 204;
      return null;
    }
  );
