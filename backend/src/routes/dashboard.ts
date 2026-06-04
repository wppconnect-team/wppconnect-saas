import { Elysia } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';

export const dashboardRoutes = new Elysia({ prefix: '/api/dashboard' })
  .use(authPlugin)

  // GET /api/dashboard
  .get('/',
    async () => {
      // Métricas de sessões
      const [sessionStats] = await sql<{
        total: number; connected: number; pending: number; offline: number; messagesToday: number;
      }[]>`
        SELECT
          COUNT(*)                                               AS total,
          COUNT(*) FILTER (WHERE status = 'connected')         AS connected,
          COUNT(*) FILTER (WHERE status IN ('pending','qr'))   AS pending,
          COUNT(*) FILTER (WHERE status = 'offline')           AS offline,
          COALESCE(SUM(messages_today), 0)                     AS "messagesToday"
        FROM sessions
      `;

      // Métricas de webhooks
      const [webhookStats] = await sql<{
        total: number; failing: number; avgDelivery: number;
      }[]>`
        SELECT
          COUNT(*)                                               AS total,
          COUNT(*) FILTER (WHERE status = 'falhando')          AS failing,
          COALESCE(AVG(delivery_rate), 0)                      AS "avgDelivery"
        FROM webhooks
      `;

      // Métricas de contatos
      const [contactStats] = await sql<{ total: number; active: number }[]>`
        SELECT
          COUNT(*)                                               AS total,
          COUNT(*) FILTER (WHERE status = 'ativo')             AS active
        FROM contacts
      `;

      // Logs recentes (últimos 10)
      const recentLogs = await sql<{
        id: number; level: string; message: string; source: string; createdAt: Date;
      }[]>`
        SELECT id, level, message, source, created_at AS "createdAt"
        FROM logs
        ORDER BY created_at DESC
        LIMIT 10
      `;

      // Sessões com mais tráfego hoje
      const topSessions = await sql<{
        id: string; name: string; phone: string; status: string; messagesToday: number;
      }[]>`
        SELECT
          id, name, phone, status,
          messages_today AS "messagesToday"
        FROM sessions
        ORDER BY messages_today DESC
        LIMIT 5
      `;

      return {
        sessions:   sessionStats,
        webhooks:   webhookStats,
        contacts:   contactStats,
        recentLogs,
        topSessions,
      };
    }
  );
