-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00027: Billetera prepagada COP por tenant
-- Fecha: 2026-07-04
-- Descripción: Modelo B — el cliente recarga COP en Cada1 (super-admin) y Cada1
--   fondea el subaccount Twilio equivalente. Esta tabla registra TODOS los
--   movimientos (recargas, ajustes, reembolsos). El balance del subaccount Twilio
--   se consulta en tiempo real vía API; el balance COP se calcula de esta tabla.
-- Riesgo: NULO — tabla nueva independiente. (Requiere 00024 por el FK a tenants.)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tenant_wallet_transactions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  type          text        NOT NULL CHECK (type IN ('topup', 'adjustment', 'refund')),
  amount_cop    numeric     NOT NULL,   -- positivo = recarga, negativo = ajuste
  amount_usd    numeric     NULL,       -- USD fondeado en Twilio (si aplica)
  usd_cop_rate  numeric     NULL,       -- TRM usada en la conversión
  notes         text        NULL,       -- referencia del pago (Nequi ID, etc.)
  created_by    text        NOT NULL,   -- UUID del super_admin que lo registró
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_txns_tenant
  ON tenant_wallet_transactions(tenant_id, created_at DESC);

ALTER TABLE tenant_wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_wallet_txns" ON tenant_wallet_transactions;
CREATE POLICY "super_admin_all_wallet_txns" ON tenant_wallet_transactions
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Balance COP actual de un tenant (suma de movimientos).
CREATE OR REPLACE FUNCTION tenant_wallet_balance_cop(p_tenant_id uuid)
RETURNS numeric
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(SUM(amount_cop), 0)
  FROM tenant_wallet_transactions
  WHERE tenant_id = p_tenant_id
$$;

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00027
-- ═══════════════════════════════════════════════════════════════
