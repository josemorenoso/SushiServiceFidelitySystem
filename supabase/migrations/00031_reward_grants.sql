-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00031: Premios Otorgados (Reward Grants)
-- Fecha: 2026-07-11
-- Descripción: Introduce el concepto que faltaba entre "ganar" y "entregar":
--   un premio que le PERTENECE a un cliente y está pendiente de reclamar.
--
--     GANAR                    TENER                  ENTREGAR
--     mystery_box_results  →   reward_grants      →   reward_redemptions
--     cron reactivación    →   (nuevo)                (mesa + mesero)
--
--   Sin esta pieza el mesero solo podía registrar la entrega durante los 3
--   segundos posteriores al escaneo — cuando el cliente TODAVÍA no había
--   elegido su Mystery Box. Por eso reward_redemptions estaba vacía.
--
-- Ref: docs/features/reward-grants.md
--      docs/superpowers/specs/2026-07-11-reward-grants-design.md
--      docs/requerimientos/REQUERIMIENTOS_JULIO_2026.md (R1, R2, R3)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Catálogo de premios de campaña ──────────────────────────
-- Editable por el dueño en Dashboard > Premios de campaña.
-- Lo reutilizarán referidos, promos y la recompensa por reseña.
CREATE TABLE IF NOT EXISTS campaign_rewards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text DEFAULT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_rewards_tenant_active
  ON campaign_rewards (tenant_id, is_active);

-- ─── 2. Premios otorgados ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  grant_type  text NOT NULL CHECK (grant_type IN ('tier_prize', 'campaign_prize')),
  source      text NOT NULL
    CHECK (source IN ('mystery_box', 'safe_choice', 'reactivation', 'review', 'manual')),

  -- Snapshot: si el dueño renombra el premio del catálogo, lo ya otorgado no cambia.
  prize_title text NOT NULL,

  -- Solo para tier_prize
  tier_id               uuid DEFAULT NULL REFERENCES reward_tiers(id) ON DELETE SET NULL,
  mystery_box_result_id uuid DEFAULT NULL REFERENCES mystery_box_results(id) ON DELETE SET NULL,

  -- Solo para campaign_prize
  campaign_reward_id uuid DEFAULT NULL REFERENCES campaign_rewards(id) ON DELETE SET NULL,
  campaign_id        uuid DEFAULT NULL REFERENCES campaigns(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'redeemed', 'expired')),

  -- NULL = no vence. Los premios de tier no vencen; los de campaña sí.
  expires_at      timestamptz DEFAULT NULL,
  reminder_sent_at timestamptz DEFAULT NULL,

  granted_at  timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz DEFAULT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Consulta caliente: los premios activos de un cliente (tarjeta + escaneo del mesero).
CREATE INDEX IF NOT EXISTS idx_reward_grants_customer
  ON reward_grants (tenant_id, customer_id, status);

-- Cron de recordatorio y barrido de vencidos.
CREATE INDEX IF NOT EXISTS idx_reward_grants_expiry
  ON reward_grants (tenant_id, status, expires_at);

-- Anti-duplicado de campaña: un cliente no puede tener dos premios de reactivación
-- activos a la vez (ni dos de reseña, ni dos de referido: la unicidad es por `source`).
--
-- Deliberadamente NO aplica a tier_prize: un cliente sí puede desbloquear dos tiers
-- antes de que le entreguen el primero, y un índice único ahí rompería el check-in
-- con un 23505.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_grants_unique_active_campaign
  ON reward_grants (customer_id, source)
  WHERE status = 'active' AND grant_type = 'campaign_prize';

-- ─── 3. reward_redemptions: soportar premios de campaña ─────────
-- Un premio de campaña NO tiene tier. Hasta ahora `tier_id NOT NULL` hacía
-- literalmente imposible registrarlo, pese a que source='campaign_reward' ya
-- existía en el CHECK. Este es el fix del hallazgo 3.2.
ALTER TABLE reward_redemptions
  ALTER COLUMN tier_id DROP NOT NULL;

ALTER TABLE reward_redemptions
  ADD COLUMN IF NOT EXISTS grant_id uuid DEFAULT NULL REFERENCES reward_grants(id) ON DELETE SET NULL;

-- Anti doble-entrega: si dos meseros tocan "Entregar" sobre el mismo premio al mismo
-- tiempo, el segundo INSERT choca con un 23505 y recordRedemption() ya lo traduce a
-- `already_redeemed`. La garantía está en la base de datos, no en la UI.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_redemptions_unique_grant
  ON reward_redemptions (grant_id)
  WHERE grant_id IS NOT NULL;

-- ─── 4. campaigns.source: añadir 'reward_reminder' ──────────────
-- El CHECK se recrea dinámicamente porque su nombre puede variar según cómo se
-- aplicaron las migraciones previas.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'campaigns'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE campaigns DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_source_check
  CHECK (source IN ('manual', 'calendar', 'reactivation', 'birthday', 'reward_reminder'));

-- ─── 5. Trigger: al entregar, cerrar el grant ───────────────────
-- Mismo patrón que mark_mystery_box_redeemed() (migración 00022), que se conserva
-- intacto: un premio de tier cierra AMBOS (el mystery_box_result y el grant).
CREATE OR REPLACE FUNCTION mark_grant_redeemed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.grant_id IS NOT NULL THEN
    UPDATE reward_grants
    SET status        = 'redeemed',
        redeemed_at   = NEW.redeemed_at
    WHERE id = NEW.grant_id
      AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reward_redemptions_grant ON reward_redemptions;
CREATE TRIGGER trg_reward_redemptions_grant
  AFTER INSERT ON reward_redemptions
  FOR EACH ROW
  EXECUTE FUNCTION mark_grant_redeemed();

-- ─── 6. RLS (patrón multitenant de la migración 00026) ──────────
-- El service role bypasa RLS por diseño; el aislamiento real lo hace el código
-- filtrando tenant_id en cada query. Esta policy protege el path autenticado.
ALTER TABLE campaign_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_grants    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_all_campaign_rewards" ON campaign_rewards;
CREATE POLICY "tenant_all_campaign_rewards" ON campaign_rewards FOR ALL
  USING      (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "tenant_all_reward_grants" ON reward_grants;
CREATE POLICY "tenant_all_reward_grants" ON reward_grants FOR ALL
  USING      (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ─── 7. Backfill ────────────────────────────────────────────────
-- Los premios que los clientes YA eligieron y nadie les entregó (porque no había
-- dónde tocar) no se pierden: se convierten en grants activos y aparecen en la
-- lista del mesero desde el primer día.
INSERT INTO reward_grants (
  tenant_id, customer_id, grant_type, source, prize_title,
  tier_id, mystery_box_result_id, status, granted_at, created_at
)
SELECT
  mbr.tenant_id,
  mbr.customer_id,
  'tier_prize',
  CASE WHEN mbr.choice = 'safe' THEN 'safe_choice' ELSE 'mystery_box' END,
  mbr.prize_title,
  mbr.tier_id,
  mbr.id,
  'active',
  mbr.created_at,
  now()
FROM mystery_box_results mbr
WHERE mbr.redeemed = false
  AND mbr.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM reward_grants g WHERE g.mystery_box_result_id = mbr.id
  );

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00031
-- ═══════════════════════════════════════════════════════════════
