CREATE TABLE IF NOT EXISTS telemetry_settings (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  retention_days INTEGER NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 365),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telemetry_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id VARCHAR(100) NOT NULL,
  idempotency_key VARCHAR(200) NOT NULL,
  schema_version VARCHAR(10) NOT NULL,
  sdk_version VARCHAR(40),
  wa_version VARCHAR(80),
  observed_from TIMESTAMPTZ NOT NULL,
  observed_to TIMESTAMPTZ NOT NULL,
  messages_sent BIGINT NOT NULL DEFAULT 0 CHECK (messages_sent >= 0),
  messages_received BIGINT NOT NULL DEFAULT 0 CHECK (messages_received >= 0),
  messages_deleted BIGINT NOT NULL DEFAULT 0 CHECK (messages_deleted >= 0),
  errors_total BIGINT NOT NULL DEFAULT 0 CHECK (errors_total >= 0),
  response_latency_sum_ms DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (response_latency_sum_ms >= 0),
  response_latency_count BIGINT NOT NULL DEFAULT 0 CHECK (response_latency_count >= 0),
  connected_seconds INTEGER NOT NULL DEFAULT 0 CHECK (connected_seconds >= 0),
  observed_seconds INTEGER NOT NULL CHECK (observed_seconds BETWEEN 1 AND 86400),
  function_metrics JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, idempotency_key),
  CHECK (observed_to > observed_from)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_workspace_observed
  ON telemetry_snapshots(workspace_id, observed_to DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_created
  ON telemetry_snapshots(created_at);
