-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00015: Políticas RLS para service_role
-- Fecha: 2026-05-30
-- Descripción: Agrega políticas explícitas para el service role
--   en customers y visits, resolviendo "permission denied"
--   que ocurría cuando el service client intentaba leer/escribir.
-- ═══════════════════════════════════════════════════════════════

-- ─── customers ────────────────────────────────────────────────
DROP POLICY IF EXISTS "service_role_select_customers" ON customers;
CREATE POLICY "service_role_select_customers" ON customers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "service_role_insert_customers" ON customers;
CREATE POLICY "service_role_insert_customers" ON customers
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_update_customers" ON customers;
CREATE POLICY "service_role_update_customers" ON customers
  FOR UPDATE USING (true);

-- ─── visits ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "service_role_select_visits" ON visits;
CREATE POLICY "service_role_select_visits" ON visits
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "service_role_insert_visits" ON visits;
CREATE POLICY "service_role_insert_visits" ON visits
  FOR INSERT WITH CHECK (true);
