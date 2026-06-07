-- Adiciona papel e status de convite na tabela de usuários
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'admin'
    CHECK (role IN ('admin', 'editor', 'viewer'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS member_status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (member_status IN ('active', 'invited'));

-- Usuário inicial é sempre admin
UPDATE users SET role = 'admin' WHERE email = 'admin@wppconnect.io';
