-- Colunas para redefinição de senha via e-mail

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_token         VARCHAR(64),
  ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_reset_token
  ON users(reset_token)
  WHERE reset_token IS NOT NULL;
