-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00022: Tracking de Redención Física de Premios
-- Fecha: 2026-06-12
-- Descripción: Registra cuándo un cliente reclama FÍSICAMENTE un premio
--   en el local (mesero entrega bebida/plato). Permite cuadrar con el POS,
--   analizar turnos por hora y prevenir redenciones duplicadas.
-- Ref: docs/features/redemption-tracking.md
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Campos nuevos en mystery_box_results ────────────────────
-- Marcan si el premio ya fue canjeado físicamente (estado de entrega).
ALTER TABLE mystery_box_results
  ADD COLUMN IF NOT EXISTS redeemed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS redeemed_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_mystery_box_results_redeemed
  ON mystery_box_results (customer_id, redeemed, created_at DESC);

-- ─── 2. Tabla reward_redemptions ────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  mystery_box_result_id uuid DEFAULT NULL REFERENCES mystery_box_results(id) ON DELETE SET NULL,
  tier_id uuid NOT NULL REFERENCES reward_tiers(id) ON DELETE RESTRICT,
  prize_title text NOT NULL,
  source text NOT NULL DEFAULT 'mystery_box'
    CHECK (source IN ('mystery_box', 'safe_choice', 'staff_override', 'campaign_reward')),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  redeemed_by_staff_id uuid DEFAULT NULL REFERENCES staff_users(id) ON DELETE SET NULL,
  table_number integer DEFAULT NULL,
  notes text DEFAULT NULL,
  pos_reference text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_customer ON reward_redemptions (customer_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_staff ON reward_redemptions (redeemed_by_staff_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_date ON reward_redemptions (redeemed_at);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_pos ON reward_redemptions (pos_reference);

-- Anti-duplicado: un mismo mystery_box_result_id sólo puede redimirse una vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_redemptions_unique_mystery_box
  ON reward_redemptions (mystery_box_result_id)
  WHERE mystery_box_result_id IS NOT NULL;

-- ─── 3. RLS ─────────────────────────────────────────────────────
ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;

-- NOTA: el patrón estándar del proyecto es DROP POLICY IF EXISTS + CREATE POLICY,
-- porque Postgres NO soporta `CREATE POLICY IF NOT EXISTS`.
DROP POLICY IF EXISTS "admin_select_redemptions" ON reward_redemptions;
CREATE POLICY "admin_select_redemptions"
  ON reward_redemptions FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "service_insert_redemptions" ON reward_redemptions;
CREATE POLICY "service_insert_redemptions"
  ON reward_redemptions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_redemptions" ON reward_redemptions;
CREATE POLICY "admin_update_redemptions"
  ON reward_redemptions FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "service_select_redemptions" ON reward_redemptions;
CREATE POLICY "service_select_redemptions"
  ON reward_redemptions FOR SELECT USING (true);

-- ─── 4. Trigger: al insertar, marcar mystery_box_results.redeemed ─
CREATE OR REPLACE FUNCTION mark_mystery_box_redeemed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mystery_box_result_id IS NOT NULL THEN
    UPDATE mystery_box_results
    SET redeemed = true,
        redeemed_at = NEW.redeemed_at
    WHERE id = NEW.mystery_box_result_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reward_redemptions_insert ON reward_redemptions;
CREATE TRIGGER trg_reward_redemptions_insert
  AFTER INSERT ON reward_redemptions
  FOR EACH ROW
  EXECUTE FUNCTION mark_mystery_box_redeemed();

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00022
-- ═══════════════════════════════════════════════════════════════
