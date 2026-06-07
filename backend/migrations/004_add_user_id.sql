-- Isolamento multi-tenant: cada recurso pertence a um usuário

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
UPDATE sessions
  SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
  WHERE user_id IS NULL;
ALTER TABLE sessions ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
UPDATE contacts
  SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
  WHERE user_id IS NULL;
ALTER TABLE contacts ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE webhooks
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
UPDATE webhooks
  SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
  WHERE user_id IS NULL;
ALTER TABLE webhooks ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
UPDATE api_tokens
  SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
  WHERE user_id IS NULL;
ALTER TABLE api_tokens ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE logs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
UPDATE logs
  SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
  WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_user_id   ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_user_id     ON logs(user_id);
