-- Preferências de UI persistentes por usuário (tema, cor de destaque, etc.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';

-- Cache do QR Code por sessão (evita re-geração desnecessária após refresh)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS qr_image      TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS qr_expires_at TIMESTAMPTZ;
