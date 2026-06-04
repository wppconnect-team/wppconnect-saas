import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';

export const webhookRoutes = new Elysia({ prefix: '/api/webhooks' })
  .use(authPlugin)

  // GET /api/webhooks
  .get('/',
    async ({ query }) => {
      const { status } = query;

      const rows = await sql<{
        id: number; url: string; events: string[]; status: string;
        lastStatus: number; lastAt: string; deliveryRate: number;
      }[]>`
        SELECT
          id, url, events, status,
          last_status   AS "lastStatus",
          last_at       AS "lastAt",
          delivery_rate AS "deliveryRate"
        FROM webhooks
        WHERE ${status ?? null}::text IS NULL OR status = ${status ?? null}::text
        ORDER BY created_at DESC
      `;

      const [stats] = await sql<{
        total: number; ativos: number; falhando: number; avgRate: number;
      }[]>`
        SELECT
          COUNT(*)                                          AS total,
          COUNT(*) FILTER (WHERE status = 'ativo')         AS ativos,
          COUNT(*) FILTER (WHERE status = 'falhando')      AS falhando,
          COALESCE(AVG(delivery_rate), 0)                  AS "avgRate"
        FROM webhooks
      `;

      return { data: rows, stats };
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
      }),
    }
  )

  // POST /api/webhooks
  .post('/',
    async ({ body, set }) => {
      const { url, events } = body;

      const [webhook] = await sql`
        INSERT INTO webhooks (url, events)
        VALUES (${url}, ${events})
        RETURNING
          id, url, events, status,
          last_status   AS "lastStatus",
          last_at       AS "lastAt",
          delivery_rate AS "deliveryRate"
      `;

      set.status = 201;
      return { data: webhook };
    },
    {
      body: t.Object({
        url:    t.String({ format: 'uri' }),
        events: t.Array(t.String(), { minItems: 1 }),
      }),
    }
  )

  // PUT /api/webhooks/:id
  .put('/:id',
    async ({ params, body, set }) => {
      const { url, events, status } = body;

      const [updated] = await sql`
        UPDATE webhooks
        SET
          url    = COALESCE(${url    ?? null}::text,  url),
          events = COALESCE(${events ?? null}::text[], events),
          status = COALESCE(${status ?? null}::text,  status)
        WHERE id = ${Number(params.id)}
        RETURNING
          id, url, events, status,
          last_status   AS "lastStatus",
          last_at       AS "lastAt",
          delivery_rate AS "deliveryRate"
      `;

      if (!updated) { set.status = 404; return { error: 'Webhook não encontrado' }; }
      return { data: updated };
    },
    {
      body: t.Object({
        url:    t.Optional(t.String()),
        events: t.Optional(t.Array(t.String())),
        status: t.Optional(t.String()),
      }),
    }
  )

  // DELETE /api/webhooks/:id
  .delete('/:id',
    async ({ params, set }) => {
      const [deleted] = await sql`
        DELETE FROM webhooks WHERE id = ${Number(params.id)} RETURNING id
      `;
      if (!deleted) { set.status = 404; return { error: 'Webhook não encontrado' }; }
      set.status = 204;
      return null;
    }
  );
