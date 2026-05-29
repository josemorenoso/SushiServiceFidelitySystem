-- Migration: 00014_geolocation.sql
-- Fecha: 2026-05-25
-- Descripción: Tabla restaurant_locations, columnas checkin_lat/checkin_lon/checkin_distance_meters en customers

-- ───────────────────────────────────────────────
-- 1. Nuevas columnas en customers (ubicación del check-in)
-- ───────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS checkin_lat NUMERIC(10, 8),
  ADD COLUMN IF NOT EXISTS checkin_lon NUMERIC(11, 8),
  ADD COLUMN IF NOT EXISTS checkin_distance_meters INTEGER;

-- ───────────────────────────────────────────────
-- 2. Índice parcial para búsquedas por ubicación
-- ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_checkin_location
  ON customers (checkin_lat, checkin_lon)
  WHERE checkin_lat IS NOT NULL;

-- ───────────────────────────────────────────────
-- 3. Tabla restaurant_locations
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurant_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Sede principal',
  address TEXT,
  lat NUMERIC(10, 8) NOT NULL,
  lon NUMERIC(11, 8) NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 20,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger auto-updated_at para restaurant_locations
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS restaurant_locations_updated_at ON restaurant_locations;
CREATE TRIGGER restaurant_locations_updated_at
  BEFORE UPDATE ON restaurant_locations
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- ───────────────────────────────────────────────
-- 4. RLS Policies para restaurant_locations
-- ───────────────────────────────────────────────
ALTER TABLE restaurant_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_restaurant_locations ON restaurant_locations;
CREATE POLICY "admin_all_restaurant_locations" ON restaurant_locations
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS service_select_restaurant_locations ON restaurant_locations;
CREATE POLICY "service_select_restaurant_locations" ON restaurant_locations
  FOR SELECT USING (true);

-- ───────────────────────────────────────────────
-- 5. Seed data: ubicación por defecto
--    ⚠️ ACTUALIZAR coordenadas reales del restaurante
-- ───────────────────────────────────────────────
INSERT INTO restaurant_locations (name, address, lat, lon, radius_meters, is_active)
VALUES (
  'Sede principal',
  'Actualizar dirección',
  6.244203,
  -75.581211,
  20,
  true
)
ON CONFLICT DO NOTHING;
