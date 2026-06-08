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

-- Nenhum usuário admin padrão é criado aqui.
-- No primeiro acesso, utilize POST /api/auth/register para criar o administrador inicial.

-- Sessões de demonstração
INSERT INTO sessions (id, name, phone, status, tag, messages_today, last_activity) VALUES
  ('wa_01', 'Suporte Brasil',       '+55 11 90000-0001', 'connected', 'atendimento', 1243, 'há 2 min'),
  ('wa_02', 'Vendas Outbound',      '+55 11 90000-0002', 'qr',        'marketing',      0, '—'),
  ('wa_03', 'Notificações CRM',     '+55 11 90000-0003', 'pending',   'sistema',       87, 'há 1 h'),
  ('wa_04', 'Recuperação Checkout', '+55 11 90000-0004', 'offline',   'recuperacao',    0, 'há 3 d'),
  ('wa_05', 'Onboarding Clientes',  '+55 11 90000-0005', 'connected', 'onboarding',   318, 'há 12 min')
ON CONFLICT (id) DO NOTHING;

-- Contatos de demonstração
INSERT INTO contacts (name, phone, tags, status, messages_count, last_interaction) VALUES
  ('Luiza Martins',  '+55 11 90000-0011', ARRAY['VIP','Pro'],  'ativo',   128, 'há 2 min'),
  ('Carlos Andrade', '+55 11 90000-0012', ARRAY['Trial'],      'ativo',    42, 'há 12 min'),
  ('Renata Souza',   '+55 11 90000-0013', ARRAY['VIP'],        'ativo',   203, 'há 1 h'),
  ('João Almeida',   '+55 11 90000-0014', ARRAY['Pro','Anual'],'ativo',    87, 'há 2 h'),
  ('Bruna Ferreira', '+55 11 90000-0015', ARRAY['Trial'],      'ativo',    18, 'há 5 h'),
  ('Pedro Lima',     '+55 11 90000-0016', ARRAY['Free'],       'inativo',   5, 'ontem'),
  ('Amanda Rocha',   '+55 11 90000-0017', ARRAY['Pro'],        'ativo',    67, 'ontem'),
  ('Felipe Dias',    '+55 11 90000-0018', ARRAY['Free'],       'inativo',   2, '3 dias'),
  ('Marina Costa',   '+55 11 90000-0019', ARRAY['VIP','Anual'],'ativo',   311, 'há 30 min'),
  ('Ricardo Neto',   '+55 11 90000-0020', ARRAY['Pro'],        'ativo',    94, 'há 4 h')
ON CONFLICT DO NOTHING;

-- Webhooks de demonstração
INSERT INTO webhooks (url, events, status, last_status, last_at, delivery_rate) VALUES
  ('https://api.minhaloja.com/wa/inbound', ARRAY['message.received','message.read'],          'ativo',    200, 'há 12s',  99.8),
  ('https://crm.startup.io/wppconnect',   ARRAY['session.connected','session.disconnected'],  'ativo',    200, 'há 2min', 100.0),
  ('https://hooks.zapier.com/hooks/abc123', ARRAY['contact.created'],                         'falhando', 502, 'há 8min', 68.2)
ON CONFLICT DO NOTHING;

-- Logs de demonstração
INSERT INTO logs (level, message, source, created_at) VALUES
  ('ok',    'Sessão wa_01 conectada com sucesso',               'wa_01',       NOW() - INTERVAL '2 min'),
  ('info',  'Mensagem enviada com sucesso',                      'wa_01',       NOW() - INTERVAL '5 min'),
  ('warn',  'Rate limit atingido, aguardando 30s',               'wa_02',       NOW() - INTERVAL '8 min'),
  ('error', 'Webhook POST hooks.zapier.com retornou 502',        'webhook',     NOW() - INTERVAL '8 min'),
  ('info',  'Contato criado via API',                            'api',         NOW() - INTERVAL '15 min'),
  ('ok',    'Template "otp_login" renderizado',                  'wa_03',       NOW() - INTERVAL '20 min'),
  ('info',  'QR Code regenerado',                                'wa_02',       NOW() - INTERVAL '25 min'),
  ('ok',    'Heartbeat OK',                                      'system',      NOW() - INTERVAL '30 min'),
  ('error', 'Falha de autenticação — token inválido',            'api',         NOW() - INTERVAL '35 min'),
  ('info',  'Sessão wa_05 reconectada automaticamente',          'wa_05',       NOW() - INTERVAL '40 min')
ON CONFLICT DO NOTHING;
