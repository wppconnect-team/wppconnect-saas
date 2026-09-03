CREATE TABLE extension_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'sandbox' CHECK (status IN ('sandbox', 'active', 'suspended')),
  offline_grace_seconds INTEGER NOT NULL DEFAULT 86400 CHECK (offline_grace_seconds BETWEEN 0 AND 2592000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, slug)
);

CREATE TABLE extension_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES extension_apps(id) ON DELETE CASCADE,
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  unit_amount INTEGER NOT NULL CHECK (unit_amount >= 0),
  billing_interval VARCHAR(20) NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month', 'year')),
  entitlements JSONB NOT NULL DEFAULT '{}',
  limits JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (app_id, slug)
);

CREATE TABLE extension_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES extension_apps(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES extension_plans(id) ON DELETE RESTRICT,
  key_hash CHAR(64) NOT NULL UNIQUE,
  key_prefix VARCHAR(24) NOT NULL,
  external_customer_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'cancelled', 'refunded', 'disputed', 'revoked')),
  expires_at TIMESTAMPTZ,
  max_installations INTEGER NOT NULL DEFAULT 1 CHECK (max_installations BETWEEN 1 AND 1000),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE extension_license_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES extension_licenses(id) ON DELETE CASCADE,
  installation_hash CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  UNIQUE (license_id, installation_hash)
);

CREATE TABLE extension_license_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES extension_apps(id) ON DELETE CASCADE,
  license_id UUID REFERENCES extension_licenses(id) ON DELETE CASCADE,
  activation_id UUID REFERENCES extension_license_activations(id) ON DELETE SET NULL,
  event VARCHAR(80) NOT NULL,
  actor VARCHAR(40) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_extension_apps_workspace ON extension_apps(workspace_id, created_at DESC);
CREATE INDEX idx_extension_licenses_app_status ON extension_licenses(app_id, status, created_at DESC);
CREATE INDEX idx_extension_activations_license_status ON extension_license_activations(license_id, status);
CREATE INDEX idx_extension_audit_app_created ON extension_license_audit_events(app_id, created_at DESC);
