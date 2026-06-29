ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS runtime  VARCHAR(50) NOT NULL DEFAULT 'embedded',
  ADD COLUMN IF NOT EXISTS provider VARCHAR(50) NOT NULL DEFAULT 'wppconnect';

CREATE INDEX IF NOT EXISTS idx_sessions_runtime  ON sessions(runtime);
CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider);
