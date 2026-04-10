-- ═══════════════════════════════════════════════════════════
-- RestaurantQR — Migración Inicial
-- Tablas: customers, visits, rewards
-- Fecha: 2026-04-07
-- ═══════════════════════════════════════════════════════════

-- Función para auto-actualizar updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── TABLA: customers ───
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text NOT NULL,
  birthday date,
  total_visits integer NOT NULL DEFAULT 0,
  last_visit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER on_customers_updated
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- ─── TABLA: visits ───
CREATE TABLE IF NOT EXISTS visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'qr',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visits_customer_id ON visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_visits_created_at ON visits(created_at);

-- ─── TABLA: rewards ───
CREATE TABLE IF NOT EXISTS rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_milestone integer NOT NULL,
  title text NOT NULL,
  message_template text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ───
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

-- Políticas para admins autenticados
CREATE POLICY "admin_select_customers" ON customers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin_insert_customers" ON customers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "admin_update_customers" ON customers
  FOR UPDATE USING (true);

CREATE POLICY "admin_select_visits" ON visits
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin_insert_visits" ON visits
  FOR INSERT WITH CHECK (true);

CREATE POLICY "admin_select_rewards" ON rewards
  FOR SELECT USING (true);

CREATE POLICY "admin_insert_rewards" ON rewards
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "admin_update_rewards" ON rewards
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ─── DATOS INICIALES: Recompensas por defecto ───
INSERT INTO rewards (visit_milestone, title, message_template) VALUES
  (3, 'Bebida gratis', '¡Felicidades {{name}}! 🎉 Llevas {{visits}} visitas y te has ganado una bebida gratis. ¡Muestra este mensaje en tu próxima visita!'),
  (5, 'Postre gratis', '¡Increíble {{name}}! 🍰 ¡{{visits}} visitas! Te ganaste un postre gratis. ¡Muestra este mensaje para reclamarlo!'),
  (7, '20% de descuento', '¡Wow {{name}}! 🌟 ¡{{visits}} visitas! Eres un cliente VIP. Tienes 20% de descuento en tu próxima cuenta. ¡Muestra este mensaje!');
