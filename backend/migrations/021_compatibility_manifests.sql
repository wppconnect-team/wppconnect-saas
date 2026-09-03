CREATE TABLE IF NOT EXISTS compatibility_manifests (
  id UUID PRIMARY KEY,
  package_name VARCHAR(160) NOT NULL,
  revision BIGINT NOT NULL CHECK (revision > 0),
  key_id VARCHAR(80) NOT NULL,
  public_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  token TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (package_name, revision)
);

CREATE INDEX IF NOT EXISTS idx_compatibility_manifests_latest
  ON compatibility_manifests(package_name, revision DESC);
CREATE INDEX IF NOT EXISTS idx_compatibility_manifest_keys
  ON compatibility_manifests(key_id);
