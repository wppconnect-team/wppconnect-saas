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
    async ({ userId }) => {
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
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;

      return { data: rows };
    }
  )

  // POST /api/tokens
  .post('/',
    async ({ body, set, userId }) => {
      const { name, scopes } = body;
      const env = process.env.NODE_ENV ?? 'development';
      const { plain, hash, prefix } = generateToken(env);

      const [token] = await sql`
        INSERT INTO api_tokens (name, token_hash, token_prefix, scopes, user_id)
        VALUES (${name}, ${hash}, ${prefix}, ${scopes ?? []}, ${userId})
        RETURNING
          id, name,
          token_prefix AS "tokenPrefix",
          scopes,
          created_at   AS "createdAt"
      `;

      set.status = 201;
      // plain só é retornado uma vez — não fica armazenado
      return { data: token, token: plain };
    },
    {
      body: t.Object({
        name:   t.String({ minLength: 1 }),
        scopes: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // PUT /api/tokens/:id  (editar nome/escopos)
  .put('/:id',
    async ({ params, body, set, userId }) => {
      const { name, scopes } = body;

      const [updated] = await sql`
        UPDATE api_tokens
        SET
          name   = COALESCE(${name   ?? null}::text,    name),
          scopes = COALESCE(${scopes ?? null}::text[],  scopes)
        WHERE id = ${Number(params.id)}
          AND user_id = ${userId}
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

  // DELETE /api/tokens/:id  (revogar)
  .delete('/:id',
    async ({ params, set, userId }) => {
      const [deleted] = await sql`
        DELETE FROM api_tokens
        WHERE id = ${Number(params.id)}
          AND user_id = ${userId}
        RETURNING id
      `;
      if (!deleted) { set.status = 404; return { error: 'Token não encontrado' }; }
      set.status = 204;
      return null;
    }
  );
