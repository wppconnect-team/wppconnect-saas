CREATE TABLE IF NOT EXISTS media_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(200) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('conversion', 'transcription')),
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('staging', 'queued', 'processing', 'succeeded', 'failed', 'expired')),
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('upload', 'url')),
  source_url TEXT,
  source_filename VARCHAR(255),
  input_mime VARCHAR(120),
  input_path TEXT,
  output_path TEXT,
  language VARCHAR(20),
  webhook_url TEXT,
  result JSONB NOT NULL DEFAULT '{}',
  error_code VARCHAR(80),
  error_message TEXT,
  input_bytes BIGINT,
  output_bytes BIGINT,
  duration_seconds NUMERIC(12, 3),
  attempts INTEGER NOT NULL DEFAULT 0,
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  retain_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS media_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES media_jobs(id) ON DELETE CASCADE,
  event VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_status_code INTEGER,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, event)
);

CREATE INDEX IF NOT EXISTS idx_media_jobs_workspace_created
  ON media_jobs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_jobs_queue
  ON media_jobs(status, created_at) WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_media_jobs_retention
  ON media_jobs(retain_until) WHERE status <> 'expired';
CREATE INDEX IF NOT EXISTS idx_media_webhook_due
  ON media_webhook_deliveries(status, next_attempt_at)
  WHERE status IN ('pending', 'failed');
