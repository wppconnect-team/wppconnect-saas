import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';

export const logRoutes = new Elysia({ prefix: '/api/logs' })
  .use(authPlugin)

  // GET /api/logs
  .get('/',
    async ({ query }) => {
      const { level, search, limit = '100' } = query;
      const take = Math.min(Number(limit), 500);

      const rows = await sql<{
        id: number; level: string; message: string; source: string; createdAt: Date;
      }[]>`
        SELECT
          id, level, message, source,
          created_at AS "createdAt"
        FROM logs
        WHERE
          (${level ?? null}::text IS NULL OR level = ${level ?? null}::text)
          AND (
            ${search ?? null}::text IS NULL
            OR message ILIKE ${'%' + (search ?? '') + '%'}
            OR source  ILIKE ${'%' + (search ?? '') + '%'}
          )
        ORDER BY created_at DESC
        LIMIT ${take}
      `;

      const [counts] = await sql<{
        total: number; ok: number; info: number; warn: number; error: number;
      }[]>`
        SELECT
          COUNT(*)                                          AS total,
          COUNT(*) FILTER (WHERE level = 'ok')             AS ok,
          COUNT(*) FILTER (WHERE level = 'info')           AS info,
          COUNT(*) FILTER (WHERE level = 'warn')           AS warn,
          COUNT(*) FILTER (WHERE level = 'error')          AS error
        FROM logs
      `;

      return { data: rows, counts };
    },
    {
      query: t.Object({
        level:  t.Optional(t.String()),
        search: t.Optional(t.String()),
        limit:  t.Optional(t.String()),
      }),
    }
  )

  // POST /api/logs — inserir entrada de log
  .post('/',
    async ({ body, set }) => {
      const { level, message, source } = body;

      const [log] = await sql`
        INSERT INTO logs (level, message, source)
        VALUES (${level}, ${message}, ${source ?? 'system'})
        RETURNING id, level, message, source, created_at AS "createdAt"
      `;

      set.status = 201;
      return { data: log };
    },
    {
      body: t.Object({
        level:   t.Union([t.Literal('info'), t.Literal('warn'), t.Literal('error'), t.Literal('ok')]),
        message: t.String({ minLength: 1 }),
        source:  t.Optional(t.String()),
      }),
    }
  );
