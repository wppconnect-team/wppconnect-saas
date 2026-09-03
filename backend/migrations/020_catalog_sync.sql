CREATE TABLE IF NOT EXISTS catalog_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('shopify', 'woocommerce')),
  store_url TEXT NOT NULL,
  encrypted_source_credentials TEXT NOT NULL,
  wpp_server_url TEXT NOT NULL,
  wpp_session VARCHAR(120) NOT NULL,
  encrypted_wpp_token TEXT NOT NULL,
  webhook_url TEXT,
  encrypted_webhook_secret TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS catalog_product_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES catalog_connections(id) ON DELETE CASCADE,
  source_product_id VARCHAR(255) NOT NULL,
  wpp_product_id VARCHAR(255) NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  image_urls JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, source_product_id),
  UNIQUE (connection_id, wpp_product_id)
);

CREATE TABLE IF NOT EXISTS catalog_shopify_oauth_states (
  state_hash CHAR(64) PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  store_url TEXT NOT NULL,
  wpp_server_url TEXT NOT NULL,
  wpp_session VARCHAR(120) NOT NULL,
  encrypted_wpp_token TEXT NOT NULL,
  webhook_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES catalog_connections(id) ON DELETE CASCADE,
  preview_run_id UUID REFERENCES catalog_sync_runs(id) ON DELETE SET NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('preview', 'apply')),
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed')),
  counts JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS catalog_sync_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES catalog_sync_runs(id) ON DELETE CASCADE,
  source_product_id VARCHAR(255) NOT NULL,
  wpp_product_id VARCHAR(255),
  action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'hide', 'unhide', 'noop')),
  canonical_product JSONB,
  fingerprint CHAR(64),
  previous_image_urls JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES catalog_sync_runs(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_status INTEGER,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_connections_workspace ON catalog_connections(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_runs_queue ON catalog_sync_runs(status, created_at) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_catalog_operations_pending ON catalog_sync_operations(run_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_catalog_webhooks_due ON catalog_webhook_deliveries(status, next_attempt_at);
