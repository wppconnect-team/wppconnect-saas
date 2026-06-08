import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';

type PlanSlug = 'free' | 'pro' | 'business' | 'enterprise';

const PLAN_DEFS: Record<PlanSlug, {
  label: string; sessions: number; messages: number; members: number;
  price_monthly: number | null; price_annual: number | null;
}> = {
  free:       { label: 'Free',       sessions: 1,  messages:   5_000, members:  1, price_monthly: 0,    price_annual: 0    },
  pro:        { label: 'Pro',        sessions: 5,  messages:  50_000, members: 10, price_monthly: 249,  price_annual: 199  },
  business:   { label: 'Business',   sessions: 20, messages: 250_000, members: 25, price_monthly: 699,  price_annual: 559  },
  enterprise: { label: 'Enterprise', sessions: -1, messages:      -1, members: -1, price_monthly: null, price_annual: null },
};

function fmtPrice(slug: PlanSlug, cycle: string): string {
  const def = PLAN_DEFS[slug];
  if (!def) return '—';
  const price = cycle === 'annual' ? def.price_annual : def.price_monthly;
  if (price === null) return 'Sob consulta';
  if (price === 0)    return 'Grátis';
  return `R$ ${price.toLocaleString('pt-BR')}/mês`;
}

async function usageFor(userId: string) {
  const [sessions] = await sql<{ used: string }[]>`
    SELECT COUNT(*) AS used FROM sessions WHERE user_id = ${userId}
  `;
  const [messages] = await sql<{ used: string }[]>`
    SELECT COALESCE(SUM(messages_today), 0) AS used FROM sessions WHERE user_id = ${userId}
  `;
  const [members] = await sql<{ used: string }[]>`
    SELECT COUNT(*) AS used FROM users
  `;
  return { sessions: parseInt(sessions.used), messages: parseInt(messages.used), members: parseInt(members.used) };
}

export const planRoutes = new Elysia({ prefix: '/api/plan' })
  .use(authPlugin)

  // GET /api/plan
  .get('/', async ({ userId }) => {
    const [user] = await sql<{
      planSlug: string; billingCycle: string; planRenewsAt: string;
    }[]>`
      SELECT plan_slug       AS "planSlug",
             billing_cycle   AS "billingCycle",
             plan_renews_at::text AS "planRenewsAt"
      FROM users WHERE id = ${userId}
    `;

    const slug  = (user?.planSlug  ?? 'pro')     as PlanSlug;
    const cycle =  user?.billingCycle ?? 'monthly';
    const def   = PLAN_DEFS[slug] ?? PLAN_DEFS.pro;
    const usage = await usageFor(userId);

    return {
      plan:     def.label,
      slug,
      cycle,
      price:    fmtPrice(slug, cycle),
      renewal:  user?.planRenewsAt ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      sessions: { used: usage.sessions, limit: def.sessions },
      messages: { used: usage.messages, limit: def.messages },
      members:  { used: usage.members,  limit: def.members  },
    };
  })

  // POST /api/plan/upgrade
  .post('/upgrade',
    async ({ body, userId, set }) => {
      const { plan, cycle } = body;
      const slug = plan as PlanSlug;

      if (!PLAN_DEFS[slug]) {
        set.status = 400;
        return { error: 'Plano inválido.' };
      }
      if (slug === 'enterprise') {
        set.status = 400;
        return { error: 'Para o plano Enterprise, entre em contato com vendas.' };
      }

      const renewsAt = new Date();
      renewsAt.setDate(renewsAt.getDate() + (cycle === 'annual' ? 365 : 30));

      await sql`
        UPDATE users
        SET plan_slug      = ${slug},
            billing_cycle  = ${cycle},
            plan_renews_at = ${renewsAt.toISOString().slice(0, 10)},
            plan_cancelled = FALSE
        WHERE id = ${userId}
      `;

      const def   = PLAN_DEFS[slug];
      const usage = await usageFor(userId);

      return {
        plan:     def.label,
        slug,
        cycle,
        price:    fmtPrice(slug, cycle),
        renewal:  renewsAt.toISOString().slice(0, 10),
        sessions: { used: usage.sessions, limit: def.sessions },
        messages: { used: usage.messages, limit: def.messages },
        members:  { used: usage.members,  limit: def.members  },
      };
    },
    {
      body: t.Object({
        plan:  t.String(),
        cycle: t.Union([t.Literal('monthly'), t.Literal('annual')]),
      }),
    }
  )

  // POST /api/plan/cancel
  .post('/cancel', async ({ userId }) => {
    const [user] = await sql<{ planRenewsAt: string }[]>`
      SELECT plan_renews_at::text AS "planRenewsAt" FROM users WHERE id = ${userId}
    `;

    await sql`
      UPDATE users SET plan_cancelled = TRUE WHERE id = ${userId}
    `;

    return { ok: true, cancelAt: user?.planRenewsAt };
  });
