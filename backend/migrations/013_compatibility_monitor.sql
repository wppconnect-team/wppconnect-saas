CREATE TABLE IF NOT EXISTS compatibility_incidents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_key           VARCHAR(160) NOT NULL,
  project               VARCHAR(160) NOT NULL,
  severity              VARCHAR(20) NOT NULL DEFAULT 'critical',
  status                VARCHAR(20) NOT NULL DEFAULT 'open',
  whatsapp_version      VARCHAR(80),
  affected_capabilities TEXT[] NOT NULL DEFAULT '{}',
  evidence_url          TEXT,
  opened_at             TIMESTAMPTZ NOT NULL,
  last_observed_at      TIMESTAMPTZ NOT NULL,
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compatibility_incidents_status_check
    CHECK (status IN ('open', 'resolved')),
  CONSTRAINT compatibility_incidents_severity_check
    CHECK (severity IN ('warning', 'critical'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compatibility_incidents_open_monitor
  ON compatibility_incidents(monitor_key)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_compatibility_incidents_status_observed
  ON compatibility_incidents(status, last_observed_at DESC);

CREATE TABLE IF NOT EXISTS product_entitlements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product     VARCHAR(80) NOT NULL,
  entitlement VARCHAR(120) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'active',
  expires_at  TIMESTAMPTZ,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_entitlements_status_check
    CHECK (status IN ('active', 'revoked')),
  CONSTRAINT product_entitlements_workspace_product_unique
    UNIQUE (workspace_id, product, entitlement)
);

CREATE INDEX IF NOT EXISTS idx_product_entitlements_active
  ON product_entitlements(workspace_id, product, entitlement)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS compatibility_monitors (
  monitor_key           VARCHAR(160) PRIMARY KEY,
  project               VARCHAR(160) NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'unknown',
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  current_incident_id   UUID REFERENCES compatibility_incidents(id) ON DELETE SET NULL,
  last_idempotency_key  VARCHAR(200),
  last_observed_at      TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compatibility_monitors_status_check
    CHECK (status IN ('passing', 'failing', 'unknown')),
  CONSTRAINT compatibility_monitors_failures_check
    CHECK (consecutive_failures >= 0)
);

CREATE TABLE IF NOT EXISTS compatibility_signals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key       VARCHAR(200) NOT NULL UNIQUE,
  monitor_key           VARCHAR(160) NOT NULL,
  project               VARCHAR(160) NOT NULL,
  status                VARCHAR(20) NOT NULL,
  severity              VARCHAR(20) NOT NULL DEFAULT 'critical',
  whatsapp_version      VARCHAR(80),
  affected_capabilities TEXT[] NOT NULL DEFAULT '{}',
  evidence_url          TEXT,
  observed_at           TIMESTAMPTZ NOT NULL,
  payload               JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compatibility_signals_status_check
    CHECK (status IN ('passing', 'failing', 'unknown')),
  CONSTRAINT compatibility_signals_severity_check
    CHECK (severity IN ('warning', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_compatibility_signals_monitor_observed
  ON compatibility_signals(monitor_key, observed_at DESC);

CREATE TABLE IF NOT EXISTS compatibility_webhook_endpoints (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url                      TEXT NOT NULL,
  description              VARCHAR(120) NOT NULL DEFAULT '',
  events                   TEXT[] NOT NULL,
  encrypted_signing_secret TEXT NOT NULL,
  status                   VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compatibility_webhook_endpoints_status_check
    CHECK (status IN ('active', 'disabled')),
  CONSTRAINT compatibility_webhook_endpoints_events_check
    CHECK (cardinality(events) > 0)
);

CREATE INDEX IF NOT EXISTS idx_compatibility_webhook_endpoints_workspace
  ON compatibility_webhook_endpoints(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS compatibility_webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id     UUID NOT NULL REFERENCES compatibility_webhook_endpoints(id) ON DELETE CASCADE,
  incident_id     UUID REFERENCES compatibility_incidents(id) ON DELETE SET NULL,
  event           VARCHAR(80) NOT NULL,
  payload         JSONB NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_status INTEGER,
  last_error      TEXT,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compatibility_webhook_deliveries_status_check
    CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  CONSTRAINT compatibility_webhook_deliveries_attempts_check
    CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_compatibility_webhook_deliveries_due
  ON compatibility_webhook_deliveries(status, next_attempt_at)
  WHERE status IN ('pending', 'processing');
