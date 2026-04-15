-- Migration: admin_settings
-- Tabla key-value para configuraciones del admin (ticket promedio, etc.)

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: ticket promedio por defecto (COP)
INSERT INTO admin_settings (key, value) VALUES ('avg_ticket', '35000')
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_settings" ON admin_settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin_update_settings" ON admin_settings
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "admin_insert_settings" ON admin_settings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
