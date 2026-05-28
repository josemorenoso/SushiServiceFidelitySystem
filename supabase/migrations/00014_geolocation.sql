-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00014: Geolocalización — Validación de proximidad al local
-- Fecha: 2026-05-25
-- Descripción: Evita QR scams al requerir que el cliente esté
--   físicamente dentro del radio del restaurante para hacer check-in.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Tabla restaurant_locations ──────────────────────────
-- Cada restaurante puede tener 1+ ubicaciones (sucursales)
CREATE TABLE IF NOT EXISTS restaurant_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Sede principal',
  address text,
  lat numeric(10, 8) NOT NULL,
  lon numeric(11, 8) NOT NULL,
  radius_meters integer NOT NULL DEFAULT 20,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE restaurant_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_restaurant_locations" ON restaurant_locations
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "service_select_restaurant_locations" ON restaurant_locations
  FOR SELECT USING (true);

-- ─── 2. Nuevas columnas en customers ────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS checkin_lat numeric(10, 8) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS checkin_lon numeric(11, 8) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS checkin_distance_meters integer DEFAULT NULL;

-- Índice para análisis de ubicaciones
CREATE INDEX IF NOT EXISTS idx_customers_checkin_location
  ON customers (checkin_lat, checkin_lon)
  WHERE checkin_lat IS NOT NULL;

-- ─── 3. Función Haversine para calcular distancia ───────────
CREATE OR REPLACE FUNCTION calculate_distance(
  lat1 numeric, lon1 numeric,
  lat2 numeric, lon2 numeric
)
RETURNS numeric AS $$
DECLARE
  R integer := 6371000; -- Radio de la Tierra en metros
  phi1 numeric;
  phi2 numeric;
  delta_phi numeric;
  delta_lambda numeric;
  a numeric;
  c numeric;
BEGIN
  phi1 := radians(lat1);
  phi2 := radians(lat2);
  delta_phi := radians(lat2 - lat1);
  delta_lambda := radians(lon2 - lon1);

  a := sin(delta_phi / 2)^2 +
       cos(phi1) * cos(phi2) * sin(delta_lambda / 2)^2;
  c := 2 * atan2(sqrt(a), sqrt(1 - a));

  RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── 4. Seed: ubicación por defecto (Medellín, Colombia) ────
-- El admin debe actualizar esto con la ubicación real del local
INSERT INTO restaurant_locations (name, address, lat, lon, radius_meters)
VALUES ('Sede principal', 'Actualizar dirección', 6.244203, -75.581211, 20)
ON CONFLICT DO NOTHING;
