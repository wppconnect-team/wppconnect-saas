-- ──────────────────────────────────────────
-- Grupos WhatsApp
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id                 BIGSERIAL    PRIMARY KEY,
  name               VARCHAR(255) NOT NULL,
  description        TEXT         NOT NULL DEFAULT '',
  participants_count INTEGER      NOT NULL DEFAULT 0,
  tags               TEXT[]       NOT NULL DEFAULT '{}',
  status             VARCHAR(20)  NOT NULL DEFAULT 'ativo'
                       CHECK (status IN ('ativo','inativo')),
  messages_count     INTEGER      NOT NULL DEFAULT 0,
  last_interaction   TEXT         NOT NULL DEFAULT 'nunca',
  user_id            UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_user_id    ON groups(user_id);
CREATE INDEX IF NOT EXISTS idx_groups_status     ON groups(status);
CREATE INDEX IF NOT EXISTS idx_groups_created_at ON groups(created_at DESC);

-- Dados de demonstração são criados somente por fixtures de desenvolvimento,
-- nunca por migrations executadas em bancos reais.
