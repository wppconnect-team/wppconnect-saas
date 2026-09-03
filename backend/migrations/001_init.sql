-- Extensões
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────
-- Usuários
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- Sessões WhatsApp
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id             VARCHAR(50)  PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  phone          VARCHAR(50)  NOT NULL DEFAULT '—',
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('connected','qr','pending','offline')),
  tag            VARCHAR(100) NOT NULL DEFAULT 'atendimento',
  messages_today INTEGER      NOT NULL DEFAULT 0,
  last_activity  TEXT         NOT NULL DEFAULT '—',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- Contatos
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id               BIGSERIAL    PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  phone            VARCHAR(50)  NOT NULL,
  tags             TEXT[]       NOT NULL DEFAULT '{}',
  status           VARCHAR(20)  NOT NULL DEFAULT 'ativo'
                     CHECK (status IN ('ativo','inativo')),
  messages_count   INTEGER      NOT NULL DEFAULT 0,
  last_interaction TEXT         NOT NULL DEFAULT 'nunca',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- Webhooks
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhooks (
  id            BIGSERIAL    PRIMARY KEY,
  url           TEXT         NOT NULL,
  events        TEXT[]       NOT NULL DEFAULT '{}',
  status        VARCHAR(20)  NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo','falhando')),
  last_status   INTEGER      NOT NULL DEFAULT 200,
  last_at       TEXT         NOT NULL DEFAULT '—',
  delivery_rate NUMERIC(5,2) NOT NULL DEFAULT 100.0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- Tokens de API
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_tokens (
  id           BIGSERIAL    PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  token_hash   TEXT         NOT NULL UNIQUE,
  token_prefix VARCHAR(30)  NOT NULL,
  scopes       TEXT[]       NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- Logs
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
  id         BIGSERIAL   PRIMARY KEY,
  level      VARCHAR(10) NOT NULL CHECK (level IN ('info','warn','error','ok')),
  message    TEXT        NOT NULL,
  source     VARCHAR(100) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- Índices
-- ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_status   ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_contacts_name     ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_phone    ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_logs_level        ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_created_at   ON logs(created_at DESC);

-- ──────────────────────────────────────────
-- Dados iniciais
-- ──────────────────────────────────────────

-- Dados de demonstração não pertencem ao schema de produção. O primeiro
-- workspace e usuário são criados pelo bootstrap seguro após as migrations.
