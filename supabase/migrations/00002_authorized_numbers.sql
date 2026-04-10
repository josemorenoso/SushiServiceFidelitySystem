-- ═══════════════════════════════════════════════════════════
-- RestaurantQR — Migración: authorized_numbers
-- Fecha: 2026-04-08
-- ═══════════════════════════════════════════════════════════

-- ─── TABLA: authorized_numbers ───
CREATE TABLE IF NOT EXISTS authorized_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ───
ALTER TABLE authorized_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_select_authorized" ON authorized_numbers
  FOR SELECT USING (true);

CREATE POLICY "admin_insert_authorized" ON authorized_numbers
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_update_authorized" ON authorized_numbers
  FOR UPDATE USING (auth.role() = 'authenticated');
