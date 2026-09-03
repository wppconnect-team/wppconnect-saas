-- Adapta o schema anterior do wppconnect-cloud sem expor ou invalidar contas.
-- Todas as operações são condicionais para instalações novas do SaaS.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password'
  ) THEN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    UPDATE users SET password_hash = password WHERE password_hash IS NULL;
    ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO workspace_subscriptions (
    id, workspace_id, plan_id, provider, provider_customer_id,
    provider_subscription_id, status, metadata, created_at, updated_at
  )
  SELECT
    legacy.id,
    account.workspace_id,
    plan.id,
    'stripe',
    legacy.stripe_customer_id,
    legacy.stripe_subscription_id,
    CASE legacy.status
      WHEN 'active' THEN 'active'
      WHEN 'trialing' THEN 'trialing'
      WHEN 'past_due' THEN 'past_due'
      WHEN 'canceled' THEN 'cancelled'
      WHEN 'cancelled' THEN 'cancelled'
      ELSE 'expired'
    END,
    jsonb_build_object('legacyApiType', legacy.api_type, 'legacyPriceAmount', legacy.price_amount),
    legacy.created_at,
    legacy.updated_at
  FROM subscriptions legacy
  JOIN users account ON account.id = legacy.user_id
  JOIN products product ON product.slug = 'cloud-runtime'
  JOIN product_plans plan ON plan.product_id = product.id AND plan.slug = legacy.api_type
  WHERE account.workspace_id IS NOT NULL
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO product_entitlements (
    workspace_id, product, entitlement, status, subscription_id, limit_value, metadata
  )
  SELECT
    subscription.workspace_id,
    'cloud-runtime',
    'api-access',
    CASE WHEN subscription.status IN ('active', 'trialing') THEN 'active' ELSE 'revoked' END,
    subscription.id,
    1,
    jsonb_build_object('source', 'legacy-cloud')
  FROM workspace_subscriptions subscription
  JOIN product_plans plan ON plan.id = subscription.plan_id
  JOIN products product ON product.id = plan.product_id AND product.slug = 'cloud-runtime'
  ON CONFLICT (workspace_id, product, entitlement) DO UPDATE SET
    status = EXCLUDED.status,
    subscription_id = EXCLUDED.subscription_id,
    limit_value = EXCLUDED.limit_value,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();
END $$;

DO $$
BEGIN
  IF to_regclass('public.api_keys') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO api_tokens (
    name, token_hash, token_prefix, scopes, user_id, workspace_id,
    last_used_at, created_at, revoked_at
  )
  SELECT
    'Migrated ' || legacy.api_type || ' key',
    encode(digest(legacy.api_key, 'sha256'), 'hex'),
    left(legacy.api_key, 18),
    ARRAY['sessions:*', 'messages:*', 'groups:*', 'numbers:check', 'webhooks:*'],
    legacy.user_id,
    account.workspace_id,
    legacy.last_used_at,
    legacy.created_at,
    CASE WHEN COALESCE(legacy.is_active, TRUE) THEN NULL ELSE NOW() END
  FROM api_keys legacy
  JOIN users account ON account.id = legacy.user_id
  WHERE account.workspace_id IS NOT NULL
    AND legacy.api_key NOT LIKE 'migrated_%'
  ON CONFLICT (token_hash) DO NOTHING;

  UPDATE api_keys
  SET api_key = 'migrated_' || replace(id::text, '-', ''),
      is_active = FALSE
  WHERE api_key NOT LIKE 'migrated_%';
END $$;
