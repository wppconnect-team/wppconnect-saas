ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS billing_email VARCHAR(254),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_status_check CHECK (status IN ('active', 'private', 'retired'))
);

CREATE TABLE IF NOT EXISTS product_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  billing_model VARCHAR(30) NOT NULL DEFAULT 'subscription',
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  unit_amount INTEGER,
  billing_interval VARCHAR(20),
  limits JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_plans_billing_model_check
    CHECK (billing_model IN ('subscription', 'usage', 'hybrid', 'manual')),
  CONSTRAINT product_plans_interval_check
    CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year')),
  CONSTRAINT product_plans_amount_check CHECK (unit_amount IS NULL OR unit_amount >= 0),
  CONSTRAINT product_plans_product_slug_unique UNIQUE (product_id, slug)
);

CREATE TABLE IF NOT EXISTS workspace_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES product_plans(id) ON DELETE RESTRICT,
  provider VARCHAR(30) NOT NULL DEFAULT 'manual',
  provider_customer_id VARCHAR(255),
  provider_subscription_id VARCHAR(255),
  status VARCHAR(30) NOT NULL,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  ended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspace_subscriptions_status_check
    CHECK (status IN ('trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_subscriptions_provider_id
  ON workspace_subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_workspace
  ON workspace_subscriptions(workspace_id, status, created_at DESC);

ALTER TABLE product_entitlements
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES workspace_subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS limit_value BIGINT,
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product VARCHAR(80) NOT NULL,
  meter VARCHAR(120) NOT NULL,
  quantity BIGINT NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usage_events_quantity_check CHECK (quantity > 0),
  CONSTRAINT usage_events_workspace_idempotency_unique UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_usage_events_workspace_meter_time
  ON usage_events(workspace_id, product, meter, occurred_at DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  refresh_token_hash CHAR(64) NOT NULL UNIQUE,
  current_jti UUID NOT NULL,
  user_agent TEXT,
  ip_address INET,
  expires_at TIMESTAMPTZ NOT NULL,
  rotated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
  ON auth_sessions(user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rotated_from_id BIGINT REFERENCES api_tokens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

INSERT INTO products (slug, name, description, status) VALUES
  ('compatibility-monitor', 'Compatibility Monitor', 'Incidentes de compatibilidade e webhooks assinados.', 'active'),
  ('extension-licensing', 'Extension Licensing', 'Licenças, ativações e entitlements para extensões.', 'private'),
  ('media-api', 'Media API', 'Conversão PTT e transcrição de áudio.', 'private'),
  ('telemetry', 'Telemetry', 'Telemetria agregada e auditoria opt-in.', 'private'),
  ('catalog-sync', 'Catalog Sync', 'Sincronização Shopify e WooCommerce para catálogo.', 'private')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

INSERT INTO product_plans (
  product_id, slug, name, billing_model, currency, unit_amount, billing_interval, limits
)
SELECT id, 'webhook-1', 'Webhook', 'subscription', 'USD', 2900, 'month', '{"endpoints": 1}'::jsonb
FROM products WHERE slug = 'compatibility-monitor'
ON CONFLICT (product_id, slug) DO UPDATE SET
  name = EXCLUDED.name, unit_amount = EXCLUDED.unit_amount, limits = EXCLUDED.limits;

INSERT INTO product_plans (
  product_id, slug, name, billing_model, currency, unit_amount, billing_interval, limits
)
SELECT id, 'webhook-5', 'Webhook Plus', 'subscription', 'USD', 9900, 'month', '{"endpoints": 5}'::jsonb
FROM products WHERE slug = 'compatibility-monitor'
ON CONFLICT (product_id, slug) DO UPDATE SET
  name = EXCLUDED.name, unit_amount = EXCLUDED.unit_amount, limits = EXCLUDED.limits;

INSERT INTO product_plans (
  product_id, slug, name, billing_model, currency, unit_amount, billing_interval, limits
)
SELECT id, tier.slug, tier.name, 'manual', 'USD', tier.amount, 'month', tier.limits
FROM products
CROSS JOIN (VALUES
  ('pro', 'B2B Pro', 25000, '{"responseBusinessHours": 8, "mitigationHours": 48}'::jsonb),
  ('enterprise', 'B2B Enterprise', 50000, '{"responseBusinessHours": 2, "mitigationHours": 24}'::jsonb)
) AS tier(slug, name, amount, limits)
WHERE products.slug = 'compatibility-monitor'
ON CONFLICT (product_id, slug) DO UPDATE SET
  name = EXCLUDED.name, unit_amount = EXCLUDED.unit_amount, limits = EXCLUDED.limits;
