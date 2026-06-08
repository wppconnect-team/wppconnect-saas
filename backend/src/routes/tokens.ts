import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';

function generateToken(env: string): { plain: string; hash: string; prefix: string } {
  const kind   = env === 'production' ? 'live' : 'test';
  const random = Buffer.from(crypto.getRandomValues(new Uint8Array(20))).toString('hex');
  const plain  = `wpp_${kind}_${random}`;
  const hash   = new Bun.CryptoHasher('sha256').update(plain).digest('hex');
  const prefix = plain.slice(0, 14); // wpp_live_xxxxxx
  return { plain, hash, prefix };
}

export const tokenRoutes = new Elysia({ prefix: '/api/tokens' })
  .use(authPlugin)

  // GET /api/tokens
  .get('/',
    async ({ workspaceId }) => {
      const rows = await sql<{
        id: number; name: string; tokenPrefix: string; scopes: string[];
        lastUsedAt: Date | null; createdAt: Date;
      }[]>`
        SELECT
          id, name,
          token_prefix  AS "tokenPrefix",
          scopes,
          last_used_at  AS "lastUsedAt",
          created_at    AS "createdAt"
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
      const { name, scopes } = body;
      const env = process.env.NODE_ENV ?? 'development';
      const { plain, hash, prefix } = generateToken(env);

      const [token] = await sql`
        INSERT INTO api_tokens (name, token_hash, token_prefix, scopes, user_id, workspace_id)
        VALUES (${name}, ${hash}, ${prefix}, ${scopes ?? []}, ${userId}, ${workspaceId})
        RETURNING
          id, name,
          token_prefix AS "tokenPrefix",
          scopes,
          created_at   AS "createdAt"
      `;

      set.status = 201;
      return { data: token, token: plain };
    },
    {
      body: t.Object({
        name:   t.String({ minLength: 1 }),
        scopes: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // PUT /api/tokens/:id
  .put('/:id',
    async ({ params, body, set, workspaceId }) => {
      const { name, scopes } = body;

      const [updated] = await sql`
        UPDATE api_tokens
        SET
          name   = COALESCE(${name   ?? null}::text,    name),
          scopes = COALESCE(${scopes ?? null}::text[],  scopes)
        WHERE id = ${Number(params.id)}
          AND workspace_id = ${workspaceId}
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
        scopes: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // DELETE /api/tokens/:id
  .delete('/:id',
    async ({ params, set, workspaceId }) => {
      const [deleted] = await sql`
        DELETE FROM api_tokens
        WHERE id = ${Number(params.id)}
          AND workspace_id = ${workspaceId}
        RETURNING id
      `;
      if (!deleted) { set.status = 404; return { error: 'Token não encontrado' }; }
      set.status = 204;
      return null;
    }
  );
