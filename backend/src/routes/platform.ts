import { Elysia, t } from 'elysia';
import { sql } from '../db';
import { assertUsageQuantity, grantsScope, PLATFORM_PRODUCTS } from '../lib/platform';
import { apiKeyPlugin } from '../plugins/apiKeyAuth';
import { authPlugin } from '../plugins/auth';

const productSchema = t.Union(PLATFORM_PRODUCTS.map((product) => t.Literal(product)));

export const publicPlatformRoutes = new Elysia({ prefix: '/api/platform' })
  .get('/catalog', async () => {
    const rows = await sql`
      SELECT
        product.slug AS product, product.name, product.description, product.status,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', plan.id,
              'slug', plan.slug,
              'name', plan.name,
              'billingModel', plan.billing_model,
              'currency', plan.currency,
              'unitAmount', plan.unit_amount,
              'billingInterval', plan.billing_interval,
              'limits', plan.limits
            ) ORDER BY plan.unit_amount NULLS LAST, plan.slug
          ) FILTER (WHERE plan.id IS NOT NULL),
          '[]'::jsonb
        ) AS plans
      FROM products product
      LEFT JOIN product_plans plan ON plan.product_id = product.id AND plan.active = TRUE
      WHERE product.status = 'active'
      GROUP BY product.id
      ORDER BY product.created_at
    `;
    return { data: rows };
  });

export const platformRoutes = new Elysia({ prefix: '/api/platform' })
  .use(authPlugin)
  .get('/overview', async ({ workspaceId }) => {
    const [workspace] = await sql`
      SELECT id, name, slug, status, billing_email AS "billingEmail", metadata,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM workspaces WHERE id = ${workspaceId}
    `;
    const subscriptions = await sql`
      SELECT
        subscription.id, product.slug AS product, plan.slug AS plan,
        plan.name AS "planName", subscription.provider, subscription.status,
        subscription.current_period_start AS "currentPeriodStart",
        subscription.current_period_end AS "currentPeriodEnd",
        subscription.cancel_at_period_end AS "cancelAtPeriodEnd"
      FROM workspace_subscriptions subscription
      JOIN product_plans plan ON plan.id = subscription.plan_id
      JOIN products product ON product.id = plan.product_id
      WHERE subscription.workspace_id = ${workspaceId}
      ORDER BY subscription.created_at DESC
    `;
    const entitlements = await sql`
      SELECT product, entitlement, status, limit_value AS "limitValue",
             expires_at AS "expiresAt", metadata
      FROM product_entitlements
      WHERE workspace_id = ${workspaceId}
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY product, entitlement
    `;
    const usage = await sql`
      SELECT product, meter, SUM(quantity)::text AS quantity
      FROM usage_events
      WHERE workspace_id = ${workspaceId}
        AND occurred_at >= NOW() - INTERVAL '30 days'
      GROUP BY product, meter
      ORDER BY product, meter
    `;
    return { workspace, subscriptions, entitlements, usage };
  })
  .get('/usage', async ({ workspaceId, query }) => {
    const rows = await sql`
      SELECT
        product, meter,
        date_trunc(${query.granularity ?? 'day'}, occurred_at) AS bucket,
        SUM(quantity)::text AS quantity
      FROM usage_events
      WHERE workspace_id = ${workspaceId}
        AND occurred_at >= ${query.from ? new Date(query.from) : new Date(Date.now() - 30 * 86_400_000)}
        AND (${query.product ?? null}::text IS NULL OR product = ${query.product ?? null})
      GROUP BY product, meter, bucket
      ORDER BY bucket DESC, product, meter
      LIMIT 1000
    `;
    return { data: rows };
  }, {
    query: t.Object({
      product: t.Optional(productSchema),
      from: t.Optional(t.String({ format: 'date-time' })),
      granularity: t.Optional(t.Union([t.Literal('hour'), t.Literal('day'), t.Literal('month')])),
    }),
  });

export const usageIngestRoutes = new Elysia({ prefix: '/api/v1/usage' })
  .use(apiKeyPlugin)
  .post('/events', async ({ body, apiWorkspaceId, apiScopes, set }) => {
    if (!grantsScope(apiScopes, 'usage:write') && !grantsScope(apiScopes, `${body.product}:usage`)) {
      set.status = 403;
      return { error: 'A chave não possui escopo para registrar este uso' };
    }

    let quantity: number;
    try {
      quantity = assertUsageQuantity(body.quantity);
    } catch (error) {
      set.status = 422;
      return { error: String(error) };
    }

    const [event] = await sql`
      INSERT INTO usage_events (
        workspace_id, product, meter, quantity, idempotency_key, dimensions, occurred_at
      ) VALUES (
        ${apiWorkspaceId}, ${body.product}, ${body.meter}, ${quantity},
        ${body.idempotencyKey}, ${sql.json(body.dimensions ?? {})}, ${new Date(body.occurredAt)}
      )
      ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
      RETURNING id, created_at AS "createdAt"
    `;

    if (!event) {
      const [existing] = await sql`
        SELECT id, created_at AS "createdAt"
        FROM usage_events
        WHERE workspace_id = ${apiWorkspaceId}
          AND idempotency_key = ${body.idempotencyKey}
      `;
      return { duplicate: true, data: existing };
    }

    set.status = 202;
    return { duplicate: false, data: event };
  }, {
    body: t.Object({
      schemaVersion: t.Literal('1'),
      idempotencyKey: t.String({ minLength: 8, maxLength: 200 }),
      product: productSchema,
      meter: t.String({ minLength: 1, maxLength: 120, pattern: '^[a-z0-9][a-z0-9._-]*$' }),
      quantity: t.Integer({ minimum: 1, maximum: 1_000_000_000 }),
      dimensions: t.Optional(t.Record(t.String({ maxLength: 80 }), t.String({ maxLength: 255 }))),
      occurredAt: t.String({ format: 'date-time' }),
    }),
  });
