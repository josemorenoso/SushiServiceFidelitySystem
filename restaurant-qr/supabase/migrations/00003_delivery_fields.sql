-- ═══════════════════════════════════════════════════════════
-- RestaurantQR — Migración: campos de delivery en visits
-- Fecha: 2026-04-08
-- ═══════════════════════════════════════════════════════════

-- Campos opcionales para visitas de tipo "delivery"
ALTER TABLE visits ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS amount numeric(10,2);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS raw_message text;
