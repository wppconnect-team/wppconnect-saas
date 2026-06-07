-- Usuários convidados por admin devem definir nova senha no primeiro acesso
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
