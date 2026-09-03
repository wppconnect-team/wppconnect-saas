CREATE TABLE IF NOT EXISTS extension_license_billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES extension_apps(id) ON DELETE CASCADE,
  license_id UUID NOT NULL REFERENCES extension_licenses(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(200) NOT NULL,
  event_type VARCHAR(40) NOT NULL
    CHECK (event_type IN (
      'purchase.completed',
      'renewal.succeeded',
      'payment.failed',
      'subscription.cancelled',
      'refund.completed',
      'dispute.opened'
    )),
  previous_status VARCHAR(20) NOT NULL,
  resulting_status VARCHAR(20) NOT NULL,
  previous_expires_at TIMESTAMPTZ,
  resulting_expires_at TIMESTAMPTZ,
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (app_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_extension_billing_events_license
  ON extension_license_billing_events(license_id, occurred_at DESC, created_at DESC);
