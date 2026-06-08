-- Arquitetura multi-tenant: workspaces isolam dados por empresa/organização

-- 1. Tabela de workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,
  slug            VARCHAR(100) NOT NULL UNIQUE,
  plan_slug       VARCHAR(20)  NOT NULL DEFAULT 'pro',
  billing_cycle   VARCHAR(10)  NOT NULL DEFAULT 'monthly',
  plan_renews_at  DATE         NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
  plan_cancelled  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Adiciona workspace_id nas tabelas de usuários e recursos
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE webhooks
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE logs
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- 3. Migra dados existentes para um workspace único
DO $$
DECLARE
  v_workspace_id UUID;
  v_name         TEXT;
  v_plan_slug    TEXT;
  v_billing      TEXT;
  v_renews_at    DATE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users LIMIT 1) THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(name, 'Workspace Principal'),
    COALESCE(plan_slug, 'pro'),
    COALESCE(billing_cycle, 'monthly'),
    COALESCE(plan_renews_at, CURRENT_DATE + INTERVAL '30 days')
  INTO v_name, v_plan_slug, v_billing, v_renews_at
  FROM users
  WHERE role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_name IS NULL THEN
    SELECT COALESCE(name, 'Workspace Principal')
    INTO v_name
    FROM users ORDER BY created_at ASC LIMIT 1;
  END IF;

  INSERT INTO workspaces (name, slug, plan_slug, billing_cycle, plan_renews_at)
  VALUES (
    v_name || ' Workspace',
    'workspace-principal',
    v_plan_slug,
    v_billing,
    v_renews_at
  )
  RETURNING id INTO v_workspace_id;

  UPDATE users      SET workspace_id = v_workspace_id WHERE workspace_id IS NULL;
  UPDATE sessions   SET workspace_id = v_workspace_id WHERE workspace_id IS NULL;
  UPDATE contacts   SET workspace_id = v_workspace_id WHERE workspace_id IS NULL;
  UPDATE webhooks   SET workspace_id = v_workspace_id WHERE workspace_id IS NULL;
  UPDATE api_tokens SET workspace_id = v_workspace_id WHERE workspace_id IS NULL;
  UPDATE logs       SET workspace_id = v_workspace_id WHERE workspace_id IS NULL;
  UPDATE groups     SET workspace_id = v_workspace_id WHERE workspace_id IS NULL;
END $$;

-- 4. Índices de performance
CREATE INDEX IF NOT EXISTS idx_users_workspace_id      ON users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id   ON sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_id   ON contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_workspace_id   ON webhooks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_workspace_id ON api_tokens(workspace_id);
CREATE INDEX IF NOT EXISTS idx_logs_workspace_id       ON logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_groups_workspace_id     ON groups(workspace_id);
