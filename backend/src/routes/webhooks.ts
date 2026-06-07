import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';
import { insertLog } from '../lib/log';

export const webhookRoutes = new Elysia({ prefix: '/api/webhooks' })
  .use(authPlugin)

  // GET /api/webhooks
  .get('/',
    async ({ query, userId }) => {
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
        WHERE user_id = ${userId}
          AND (${status ?? null}::text IS NULL OR status = ${status ?? null}::text)
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
        WHERE user_id = ${userId}
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
    async ({ body, set, userId }) => {
      const { url, events } = body;

      const [webhook] = await sql`
        INSERT INTO webhooks (url, events, user_id)
        VALUES (${url}, ${events}, ${userId})
        RETURNING
          id, url, events, status,
          last_status   AS "lastStatus",
          last_at       AS "lastAt",
          delivery_rate AS "deliveryRate"
      `;

      await insertLog('info', `Webhook criado: ${url}`, 'webhook', userId);

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
    async ({ params, body, set, userId }) => {
      const { url, events, status } = body;

      const [updated] = await sql`
        UPDATE webhooks
        SET
          url    = COALESCE(${url    ?? null}::text,  url),
          events = COALESCE(${events ?? null}::text[], events),
          status = COALESCE(${status ?? null}::text,  status)
        WHERE id = ${Number(params.id)}
          AND user_id = ${userId}
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

  // POST /api/webhooks/:id/test — dispara uma requisição de teste
  .post('/:id/test',
    async ({ params, set, userId }) => {
      const [webhook] = await sql<{ id: number; url: string }[]>`
        SELECT id, url FROM webhooks
        WHERE id = ${Number(params.id)} AND user_id = ${userId}
      `;
      if (!webhook) { set.status = 404; return { error: 'Webhook não encontrado' }; }

      const payload = {
        event:      'test.ping',
        session_id: 'test',
        timestamp:  Math.floor(Date.now() / 1000),
        test:       true,
      };

      try {
        const res = await fetch(webhook.url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'X-WppConnect-Test': '1' },
          body:    JSON.stringify(payload),
          signal:  AbortSignal.timeout(10_000),
        });
        const body = await res.text().catch(() => '');

        await sql`
          UPDATE webhooks
          SET last_status = ${res.status}, last_at = NOW()
          WHERE id = ${Number(params.id)} AND user_id = ${userId}
        `;

        return { status: res.status, ok: res.ok, body: body.slice(0, 500) };
      } catch (err) {
        set.status = 502;
        return { error: 'Não foi possível conectar ao endpoint', detail: String(err) };
      }
    }
  )

  // DELETE /api/webhooks/:id
  .delete('/:id',
    async ({ params, set, userId }) => {
      const [deleted] = await sql`
        DELETE FROM webhooks
        WHERE id = ${Number(params.id)}
          AND user_id = ${userId}
        RETURNING id
      `;
      if (!deleted) { set.status = 404; return { error: 'Webhook não encontrado' }; }

      await insertLog('info', `Webhook #${params.id} removido`, 'webhook', userId);

      set.status = 204;
      return null;
    }
  );
