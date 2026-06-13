-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00023: Importación Masiva de Contactos (Golden Bullet)
-- Fecha: 2026-06-12
-- Descripción: Contactos importados desde CSV externos (bases de terceros)
--   para campañas de reactivación masiva de UN solo disparo. Se mantienen
--   SEPARADOS de `customers` porque NO han dado consentimiento de marketing.
--   Si el contacto vuelve y se registra, se convierte en customer (trazabilidad).
-- Ref: docs/features/golden-bullet.md
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Tabla imported_contacts ─────────────────────────────────
-- IMPORTANTE: se crea ANTES de la FK en customers, porque customers
-- referencia a esta tabla (orden de dependencias).
CREATE TABLE IF NOT EXISTS imported_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  name text DEFAULT NULL,
  email text DEFAULT NULL,
  source_file text NOT NULL,
  source_batch text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'valid', 'invalid', 'sent', 'delivered', 'bounced', 'converted', 'blocked')),
  validation_error text DEFAULT NULL,
  message_sent_at timestamptz DEFAULT NULL,
  twilio_sid text DEFAULT NULL,
  converted_to_customer_id uuid DEFAULT NULL REFERENCES customers(id) ON DELETE SET NULL,
  campaign_id uuid DEFAULT NULL REFERENCES campaigns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE UNIQUE INDEX IF NOT EXISTS idx_imported_contacts_phone ON imported_contacts (phone);
CREATE INDEX IF NOT EXISTS idx_imported_contacts_batch ON imported_contacts (source_batch, status);
CREATE INDEX IF NOT EXISTS idx_imported_contacts_status ON imported_contacts (status);
CREATE INDEX IF NOT EXISTS idx_imported_contacts_converted ON imported_contacts (converted_to_customer_id);

-- ─── 2. Campo de trazabilidad de origen en customers ────────────
-- (Ahora sí podemos referenciar imported_contacts porque ya existe.)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS imported_contact_id uuid DEFAULT NULL
    REFERENCES imported_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_imported_contact ON customers (imported_contact_id);

-- ─── 3. RLS ─────────────────────────────────────────────────────
ALTER TABLE imported_contacts ENABLE ROW LEVEL SECURITY;

-- Postgres NO soporta `CREATE POLICY IF NOT EXISTS` → patrón DROP + CREATE.
DROP POLICY IF EXISTS "admin_all_imported_contacts" ON imported_contacts;
CREATE POLICY "admin_all_imported_contacts"
  ON imported_contacts FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "service_select_imported" ON imported_contacts;
CREATE POLICY "service_select_imported"
  ON imported_contacts FOR SELECT USING (true);

DROP POLICY IF EXISTS "service_insert_imported" ON imported_contacts;
CREATE POLICY "service_insert_imported"
  ON imported_contacts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "service_update_imported" ON imported_contacts;
CREATE POLICY "service_update_imported"
  ON imported_contacts FOR UPDATE USING (true);

-- ─── 4. Seed feature flag + tarifa de mensajería ────────────────
-- golden_bullet_enabled: feature flag (apaga el módulo en clientes que no lo usan).
-- twilio_cost_per_message_usd: tarifa total Meta+Twilio por plantilla MARKETING.
INSERT INTO admin_settings (key, value) VALUES
  ('golden_bullet_enabled', 'false'),
  ('twilio_cost_per_message_usd', '0.0175')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00023
-- ═══════════════════════════════════════════════════════════════
