CREATE TABLE IF NOT EXISTS extension_license_usage_daily (
  app_id UUID NOT NULL REFERENCES extension_apps(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  verification_count BIGINT NOT NULL DEFAULT 0 CHECK (verification_count >= 0),
  activation_count BIGINT NOT NULL DEFAULT 0 CHECK (activation_count >= 0),
  heartbeat_count BIGINT NOT NULL DEFAULT 0 CHECK (heartbeat_count >= 0),
  deactivation_count BIGINT NOT NULL DEFAULT 0 CHECK (deactivation_count >= 0),
  first_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_extension_license_usage_date
  ON extension_license_usage_daily(usage_date DESC, app_id);
