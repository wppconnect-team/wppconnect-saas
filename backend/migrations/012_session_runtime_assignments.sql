ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS origin             VARCHAR(50)  NOT NULL DEFAULT 'wppconnect-cloud',
  ADD COLUMN IF NOT EXISTS runtime            VARCHAR(50)  NOT NULL DEFAULT 'wppconnect-server',
  ADD COLUMN IF NOT EXISTS provider           VARCHAR(50)  NOT NULL DEFAULT 'wppconnect',
  ADD COLUMN IF NOT EXISTS worker             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS container_port     INTEGER,
  ADD COLUMN IF NOT EXISTS manager_assignment JSONB;

CREATE INDEX IF NOT EXISTS idx_sessions_origin   ON sessions(origin);
CREATE INDEX IF NOT EXISTS idx_sessions_runtime  ON sessions(runtime);
CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider);
CREATE INDEX IF NOT EXISTS idx_sessions_worker   ON sessions(worker);
