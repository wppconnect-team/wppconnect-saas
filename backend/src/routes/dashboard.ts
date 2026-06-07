import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';

export const dashboardRoutes = new Elysia({ prefix: '/api/dashboard' })
  .use(authPlugin)

  .get('/',
    async ({ query, userId }) => {
      const period = query.period ?? '7d';

      const intervalMs = period === '24h' ? 86_400_000
                       : period === '30d' ? 2_592_000_000
                       :                   604_800_000;
      const since     = new Date(Date.now() - intervalMs);
      const truncUnit = period === '24h' ? 'hour' : 'day';

      const [sessionStats] = await sql<{
        total: number; connected: number; pending: number; offline: number; messagesToday: number;
      }[]>`
        SELECT
          COUNT(*)                                              AS total,
          COUNT(*) FILTER (WHERE status = 'connected')        AS connected,
          COUNT(*) FILTER (WHERE status IN ('pending','qr'))  AS pending,
          COUNT(*) FILTER (WHERE status = 'offline')          AS offline,
          COALESCE(SUM(messages_today), 0)                    AS "messagesToday"
        FROM sessions WHERE user_id = ${userId}
      `;

      const [webhookStats] = await sql<{
        total: number; failing: number; avgDelivery: number;
      }[]>`
        SELECT
          COUNT(*)                                              AS total,
          COUNT(*) FILTER (WHERE status = 'falhando')         AS failing,
          COALESCE(AVG(delivery_rate), 0)                     AS "avgDelivery"
        FROM webhooks WHERE user_id = ${userId}
      `;

      const recentLogs = await sql<{
        id: number; level: string; message: string; source: string; createdAt: Date;
      }[]>`
        SELECT id, level, message, source, created_at AS "createdAt"
        FROM logs WHERE user_id = ${userId}
        ORDER BY created_at DESC LIMIT 10
      `;

      const topSessions = await sql<{
        id: string; name: string; phone: string; status: string; messagesToday: number;
      }[]>`
        SELECT id, name, phone, status, messages_today AS "messagesToday"
        FROM sessions WHERE user_id = ${userId}
        ORDER BY messages_today DESC LIMIT 5
      `;

      // Atividade (logs) agrupada por bucket temporal
      const chartRaw = await sql<{ bucket: Date; count: string }[]>`
        SELECT date_trunc(${truncUnit}, created_at) AS bucket, COUNT(*) AS count
        FROM logs
        WHERE user_id = ${userId} AND created_at >= ${since}
        GROUP BY 1 ORDER BY 1 ASC
      `;

      const bucketCount = period === '24h' ? 24 : period === '30d' ? 30 : 7;
      const bucketMs    = period === '24h' ? 3_600_000 : 86_400_000;

      const chartData = Array.from({ length: bucketCount }, (_, i) => {
        const t     = new Date(since.getTime() + i * bucketMs);
        const key   = period === '24h' ? t.toISOString().slice(0, 13) : t.toISOString().slice(0, 10);
        const found = chartRaw.find(r => {
          const rk = period === '24h'
            ? new Date(r.bucket).toISOString().slice(0, 13)
            : new Date(r.bucket).toISOString().slice(0, 10);
          return rk === key;
        });
        return { bucket: t.toISOString(), count: found ? Number(found.count) : 0 };
      });

      return { sessions: sessionStats, webhooks: webhookStats, recentLogs, topSessions, chartData, period };
    },
    {
      query: t.Object({
        period: t.Optional(t.Union([t.Literal('24h'), t.Literal('7d'), t.Literal('30d')])),
      }),
    }
  );
