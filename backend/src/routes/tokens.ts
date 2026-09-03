import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';
import { createApiCredential, normalizeScopes } from '../lib/platform';

export const tokenRoutes = new Elysia({ prefix: '/api/tokens' })
  .use(authPlugin)

  // GET /api/tokens
  .get('/',
    async ({ workspaceId }) => {
      const rows = await sql<{
        id: number; name: string; tokenPrefix: string; scopes: string[];
        lastUsedAt: Date | null; expiresAt: Date | null; revokedAt: Date | null;
        createdAt: Date; updatedAt: Date;
      }[]>`
        SELECT
          id, name,
          token_prefix  AS "tokenPrefix",
          scopes,
          last_used_at  AS "lastUsedAt",
          expires_at    AS "expiresAt",
          revoked_at    AS "revokedAt",
          created_at    AS "createdAt",
          updated_at    AS "updatedAt"
        FROM api_tokens
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC
      `;

      return { data: rows };
    }
  )

  // POST /api/tokens
  .post('/',
    async ({ body, set, userId, workspaceId }) => {
      const { name, scopes, expiresAt } = body;
      const env = process.env.NODE_ENV ?? 'development';
      const { plain, hash, prefix } = createApiCredential(env);
      const normalizedScopes = normalizeScopes(scopes ?? []);

      const [token] = await sql`
        INSERT INTO api_tokens (
          name, token_hash, token_prefix, scopes, user_id, workspace_id, expires_at
        )
        VALUES (
          ${name}, ${hash}, ${prefix}, ${normalizedScopes}, ${userId}, ${workspaceId},
          ${expiresAt ? new Date(expiresAt) : null}
        )
        RETURNING
          id, name,
          token_prefix AS "tokenPrefix",
          scopes,
          expires_at   AS "expiresAt",
          created_at   AS "createdAt"
      `;

      set.status = 201;
      return { data: token, token: plain };
    },
    {
      body: t.Object({
        name:   t.String({ minLength: 1 }),
        scopes: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 120 }), { maxItems: 100 })),
        expiresAt: t.Optional(t.String({ format: 'date-time' })),
      }),
    }
  )

  // PUT /api/tokens/:id
  .put('/:id',
    async ({ params, body, set, workspaceId }) => {
      const { name, scopes } = body;
      const normalizedScopes = scopes ? normalizeScopes(scopes) : null;

      const [updated] = await sql`
        UPDATE api_tokens
        SET
          name   = COALESCE(${name   ?? null}::text,    name),
          scopes = COALESCE(${normalizedScopes}::text[], scopes),
          updated_at = NOW()
        WHERE id = ${Number(params.id)}
          AND workspace_id = ${workspaceId}
          AND revoked_at IS NULL
        RETURNING
          id, name,
          token_prefix AS "tokenPrefix",
          scopes,
          last_used_at AS "lastUsedAt",
          created_at   AS "createdAt"
      `;

      if (!updated) { set.status = 404; return { error: 'Token não encontrado' }; }
      return { data: updated };
    },
    {
      body: t.Object({
        name:   t.Optional(t.String()),
        scopes: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 120 }), { maxItems: 100 })),
      }),
    }
  )

  // POST /api/tokens/:id/rotate — returns the new secret exactly once
  .post('/:id/rotate', async ({ params, workspaceId, userId, set }) => {
    const env = process.env.NODE_ENV ?? 'development';
    const credential = createApiCredential(env);

    const rotated = await sql.begin(async (tx) => {
      const [current] = await tx<{
        id: number; name: string; scopes: string[]; expiresAt: Date | null;
      }[]>`
        SELECT id, name, scopes, expires_at AS "expiresAt"
        FROM api_tokens
        WHERE id = ${Number(params.id)}
          AND workspace_id = ${workspaceId}
          AND revoked_at IS NULL
        FOR UPDATE
      `;
      if (!current) return null;

      const [replacement] = await tx`
        INSERT INTO api_tokens (
          name, token_hash, token_prefix, scopes, user_id, workspace_id,
          expires_at, rotated_from_id
        ) VALUES (
          ${current.name}, ${credential.hash}, ${credential.prefix}, ${current.scopes},
          ${userId}, ${workspaceId}, ${current.expiresAt}, ${current.id}
        )
        RETURNING id, name, token_prefix AS "tokenPrefix", scopes,
                  expires_at AS "expiresAt", created_at AS "createdAt"
      `;

      await tx`
        UPDATE api_tokens
        SET revoked_at = NOW(), updated_at = NOW()
        WHERE id = ${current.id}
      `;
      return replacement;
    });

    if (!rotated) {
      set.status = 404;
      return { error: 'Token ativo não encontrado' };
    }
    set.status = 201;
    return { data: rotated, token: credential.plain };
  })

  // DELETE /api/tokens/:id
  .delete('/:id',
    async ({ params, set, workspaceId }) => {
      const [deleted] = await sql`
        UPDATE api_tokens
        SET revoked_at = NOW(), updated_at = NOW()
        WHERE id = ${Number(params.id)}
          AND workspace_id = ${workspaceId}
          AND revoked_at IS NULL
        RETURNING id
      `;
      if (!deleted) { set.status = 404; return { error: 'Token não encontrado' }; }
      set.status = 204;
      return null;
    }
  );
