-- O schema legado mantinha o hash na coluna `password`, marcada NOT NULL.
-- Novos usuários usam somente `password_hash`; contas antigas continuam
-- legíveis durante a transição, mas novos cadastros não precisam duplicar hash.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password'
  ) THEN
    ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
  END IF;
END $$;
