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

-- Dados de demonstração (inseridos para o usuário admin)
INSERT INTO groups (name, description, participants_count, tags, status, messages_count, last_interaction, user_id)
SELECT
  g.name, g.description, g.participants_count, g.tags, g.status, g.messages_count, g.last_interaction, u.id
FROM (
  VALUES
    ('Suporte VIP',          'Clientes premium com atendimento prioritário',  18, ARRAY['VIP','Suporte'],    'ativo',   342, 'há 5 min'),
    ('Marketing Q2',         'Campanhas do segundo trimestre',                 7, ARRAY['Marketing'],        'ativo',    89, 'há 1 h'),
    ('Parceiros Estratégicos','Rede de parceiros e revendedores',              12, ARRAY['Parceiros','B2B'],  'ativo',   127, 'há 2 h'),
    ('Onboarding Novos',     'Grupo de boas-vindas para novos clientes',      24, ARRAY['Onboarding'],       'ativo',   201, 'há 3 h'),
    ('Financeiro Interno',   'Avisos e cobranças automáticas',                 5, ARRAY['Interno'],          'inativo',  12, 'há 2 d'),
    ('Trial Users',          'Usuários em período de avaliação',              31, ARRAY['Trial','Lead'],     'ativo',   156, 'ontem')
) AS g(name, description, participants_count, tags, status, messages_count, last_interaction)
JOIN users u ON u.email = 'admin@wppconnect.io'
WHERE NOT EXISTS (SELECT 1 FROM groups LIMIT 1);
