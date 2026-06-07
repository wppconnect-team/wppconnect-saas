import { Elysia } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';

export const planRoutes = new Elysia({ prefix: '/api/plan' })
  .use(authPlugin)

  // GET /api/plan
  .get('/', async ({ userId }) => {
    const [sessions] = await sql<{ used: string }[]>`
      SELECT COUNT(*) AS used FROM sessions WHERE user_id = ${userId}
    `;
    const [messages] = await sql<{ used: string }[]>`
      SELECT COALESCE(SUM(messages_today), 0) AS used
      FROM sessions WHERE user_id = ${userId}
    `;
    const [members] = await sql<{ used: string }[]>`
      SELECT COUNT(*) AS used FROM users
    `;

    return {
      plan:     'Pro',
      price:    'R$ 249/mês',
      renewal:  '2026-07-18',
      sessions: { used: parseInt(sessions.used),  limit: 5     },
      messages: { used: parseInt(messages.used),  limit: 50000 },
      members:  { used: parseInt(members.used),   limit: 10    },
    };
  });
