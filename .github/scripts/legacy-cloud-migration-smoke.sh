#!/usr/bin/env bash
set -euo pipefail

db_name=legacy_cloud
connection=(--host 127.0.0.1 --username wppconnect --dbname "$db_name")

dropdb --if-exists --host 127.0.0.1 --username wppconnect "$db_name"
createdb --host 127.0.0.1 --username wppconnect "$db_name"

psql --set ON_ERROR_STOP=1 "${connection[@]}" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password TEXT NOT NULL
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_type VARCHAR(50) NOT NULL,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  price_amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  api_key VARCHAR(255) NOT NULL UNIQUE,
  api_type VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

INSERT INTO users (id, name, email, password) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Legacy One', 'legacy-one@example.test', crypt('known-password', gen_salt('bf'))),
  ('10000000-0000-0000-0000-000000000002', 'Legacy Two', 'legacy-two@example.test', crypt('known-password', gen_salt('bf')));

INSERT INTO subscriptions (id, user_id, api_type, stripe_subscription_id, stripe_customer_id, status, price_amount) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'evolution', 'sub_legacy_one', 'cus_legacy_one', 'active', 3500),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'wuzapi', 'sub_legacy_two', 'cus_legacy_two', 'canceled', 2500);

INSERT INTO api_keys (id, user_id, subscription_id, api_key, api_type, is_active) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'wpp_live_legacy-one', 'evolution', TRUE),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'wpp_live_legacy-two', 'wuzapi', FALSE);
SQL

for migration in backend/migrations/*.sql; do
  echo "Applying ${migration} to legacy Cloud fixture"
  psql --set ON_ERROR_STOP=1 "${connection[@]}" --file "$migration"
done

psql --set ON_ERROR_STOP=1 "${connection[@]}" <<'SQL'
SELECT 1 / CASE WHEN COUNT(*) = 2 AND COUNT(DISTINCT workspace_id) = 2 THEN 1 ELSE 0 END FROM users;
SELECT 1 / CASE WHEN COUNT(*) = 2 THEN 1 ELSE 0 END FROM workspaces WHERE slug LIKE 'cloud-%';
SELECT 1 / CASE WHEN COUNT(*) = 2 THEN 1 ELSE 0 END FROM workspace_subscriptions;
SELECT 1 / CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END FROM workspace_subscriptions WHERE status = 'cancelled';
SELECT 1 / CASE WHEN COUNT(*) = 2 THEN 1 ELSE 0 END FROM product_entitlements WHERE product = 'cloud-runtime';
SELECT 1 / CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END FROM product_entitlements WHERE product = 'cloud-runtime' AND status = 'active';
SELECT 1 / CASE WHEN COUNT(*) = 2 THEN 1 ELSE 0 END FROM api_tokens;
SELECT 1 / CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END
  FROM api_tokens WHERE token_hash = encode(digest('wpp_live_legacy-one', 'sha256'), 'hex') AND revoked_at IS NULL;
SELECT 1 / CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END
  FROM api_tokens WHERE token_hash = encode(digest('wpp_live_legacy-two', 'sha256'), 'hex') AND revoked_at IS NOT NULL;
SELECT 1 / CASE WHEN COUNT(*) = 2 THEN 1 ELSE 0 END
  FROM api_keys WHERE api_key LIKE 'migrated_%' AND is_active = FALSE;
SELECT 1 / CASE WHEN COUNT(*) = 2 THEN 1 ELSE 0 END
  FROM users WHERE crypt('known-password', password_hash) = password_hash;
SQL
