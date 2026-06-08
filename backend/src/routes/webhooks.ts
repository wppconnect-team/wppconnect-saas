import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';
import { insertLog } from '../lib/log';

// Bloqueia URLs que apontam para redes privadas/loopback (proteção contra SSRF)
function isPrivateUrl(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return true; }

  if (!['http:', 'https:'].includes(url.protocol)) return true;

  const h = url.hostname;
  if (h === 'localhost') return true;
  if (/^127\./.test(h)) return true;
  if (h === '::1' || h === '[::1]') return true;
  if (/^0\./.test(h)) return true;
  // RFC 1918 privados
  if (/^10\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  // Link-local (AWS metadata, Azure IMDS, etc.)
  if (/^169\.254\./.test(h)) return true;
  // IPv6 link-local
  if (/^fe80:/i.test(h)) return true;
  // Loopback IPv6 completo
  if (/^\[?::1\]?$/.test(h)) return true;

  return false;
}

export const webhookRoutes = new Elysia({ prefix: '/api/webhooks' })
  .use(authPlugin)

  // GET /api/webhooks
  .get('/',
    async ({ query, workspaceId }) => {
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
        WHERE workspace_id = ${workspaceId}
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
        WHERE workspace_id = ${workspaceId}
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
    async ({ body, set, userId, workspaceId }) => {
      const { url, events } = body;

      if (isPrivateUrl(url)) {
        set.status = 422;
        return { error: 'URL inválida. Endereços de rede privada não são permitidos.' };
      }

      const [webhook] = await sql`
        INSERT INTO webhooks (url, events, user_id, workspace_id)
        VALUES (${url}, ${events}, ${userId}, ${workspaceId})
        RETURNING
          id, url, events, status,
          last_status   AS "lastStatus",
          last_at       AS "lastAt",
          delivery_rate AS "deliveryRate"
      `;

      await insertLog('info', `Webhook criado: ${url}`, 'webhook', userId, workspaceId);

      set.status = 201;
      return { data: webhook };
    },
    {
      body: t.Object({
        url:    t.String({ format: 'uri', maxLength: 2048 }),
        events: t.Array(t.String(), { minItems: 1 }),
      }),
    }
  )

  // PUT /api/webhooks/:id
  .put('/:id',
    async ({ params, body, set, workspaceId }) => {
      const { url, events, status } = body;

      if (url && isPrivateUrl(url)) {
        set.status = 422;
        return { error: 'URL inválida. Endereços de rede privada não são permitidos.' };
      }

      const [updated] = await sql`
        UPDATE webhooks
        SET
          url    = COALESCE(${url    ?? null}::text,  url),
          events = COALESCE(${events ?? null}::text[], events),
          status = COALESCE(${status ?? null}::text,  status)
        WHERE id = ${Number(params.id)}
          AND workspace_id = ${workspaceId}
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
        url:    t.Optional(t.String({ maxLength: 2048 })),
        events: t.Optional(t.Array(t.String())),
        status: t.Optional(t.String()),
      }),
    }
  )

  // POST /api/webhooks/:id/test
  .post('/:id/test',
    async ({ params, set, workspaceId }) => {
      const [webhook] = await sql<{ id: number; url: string }[]>`
        SELECT id, url FROM webhooks
        WHERE id = ${Number(params.id)} AND workspace_id = ${workspaceId}
      `;
      if (!webhook) { set.status = 404; return { error: 'Webhook não encontrado' }; }

      if (isPrivateUrl(webhook.url)) {
        set.status = 422;
        return { error: 'URL inválida. Endereços de rede privada não são permitidos.' };
      }

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
          WHERE id = ${Number(params.id)} AND workspace_id = ${workspaceId}
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
    async ({ params, set, userId, workspaceId }) => {
      const [deleted] = await sql`
        DELETE FROM webhooks
        WHERE id = ${Number(params.id)}
          AND workspace_id = ${workspaceId}
        RETURNING id
      `;
      if (!deleted) { set.status = 404; return { error: 'Webhook não encontrado' }; }

      await insertLog('info', `Webhook #${params.id} removido`, 'webhook', userId, workspaceId);

      set.status = 204;
      return null;
    }
  );
