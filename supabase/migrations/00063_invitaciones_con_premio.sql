-- ═══════════════════════════════════════════════════════════════════════════
-- 00063 — Invitaciones con premio: un enlace o QR que regala algo a quien se registre
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ref: docs/features/invite-campaigns.md
--      docs/features/referral-program.md §3 (es la parte "QR dinámicos" de ese diseño,
--      construida sola; el programa de referidos propiamente dicho NO se toca acá)
--      docs/features/reward-grants.md
--
-- QUÉ ES, EN UNA FRASE: el dueño crea "2x1 en sushi", el sistema le da un enlace
-- `/c/{slug}` y su QR, lo manda por WhatsApp o lo pone en redes; quien lo abre se
-- registra, el premio le aparece en la tarjeta y lo reclama cuando el mesero lo
-- escanea en el local.
--
-- POR QUÉ NO HACE FALTA UNA "TARJETA PROVISIONAL": otros sistemas la inventan porque
-- no tienen el concepto de premio con dueño pendiente de reclamar. Este lo tiene
-- desde la 00031 (`reward_grants`). El premio de la invitación es un `reward_grant`
-- de tipo `campaign_prize` con `source = 'invite'`: aparece en la tarjeta desde el
-- registro (R3 del spec de julio) y SOLO se entrega cuando el mesero escanea —
-- presencia física verificada, sin estados nuevos ni segunda tarjeta.
--
-- LA REGLA QUE HACE ESTO SEGURO: quien se registra por una invitación NO recibe la
-- visita #1 automática aunque la marca tenga `checkin_first_visit_free` encendido.
-- Se registra desde su casa, no desde la mesa. Eso vive en el código
-- (`pendingStaffScan = true` en el registro), no acá; esta migración solo guarda el
-- de dónde vino.

-- ─────────────────────────────────────────────────────────────
-- 1. La invitación
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_campaigns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Sede dueña. NULL = de la MARCA. Nullable y con FK compuesta, como toda columna
  -- de sede (bloque 3 de abajo). No se backfillea.
  location_id        uuid NULL,
  slug               text NOT NULL,
  name               text NOT NULL,
  reward_title       text NOT NULL,
  reward_description text,
  -- Días que tiene la persona para venir a reclamar, contados desde que se
  -- registra. NULL = el premio no vence. Es lo que `grantReward()` recibe como
  -- `windowDays`.
  window_days        integer CHECK (window_days IS NULL OR window_days >= 0),
  starts_at          timestamptz,
  ends_at            timestamptz,
  -- Cupo de PREMIOS OTORGADOS (registros con premio), no de entregas. Es lo que
  -- el dueño controla: cuántos regalos promete. NULL = sin cupo.
  max_grants         integer CHECK (max_grants IS NULL OR max_grants > 0),
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- El slug se resuelve bajo el dominio de la marca, así que es único POR MARCA,
  -- no global: dos restaurantes pueden tener su `/c/apertura`.
  CONSTRAINT qr_campaigns_tenant_slug_key UNIQUE (tenant_id, slug),
  CONSTRAINT qr_campaigns_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 40)
);

COMMENT ON TABLE qr_campaigns IS
  'Invitaciones con premio (docs/features/invite-campaigns.md). Un enlace /c/{slug} que regala un reward_grant a quien se registre por él. El premio se reclama SOLO con escaneo del mesero. Es la parte "QR dinámicos" del diseño de referidos, construida sola.';
COMMENT ON COLUMN qr_campaigns.max_grants IS
  'Cupo de premios OTORGADOS (gente que se registró y recibió el premio en su tarjeta), no de entregas. NULL = sin cupo.';
COMMENT ON COLUMN qr_campaigns.window_days IS
  'Días para venir a reclamar desde el registro. NULL = no vence. Va directo a reward_grants.expires_at vía grantReward(windowDays).';

CREATE INDEX IF NOT EXISTS idx_qr_campaigns_tenant_active
  ON qr_campaigns (tenant_id, is_active);

-- ─────────────────────────────────────────────────────────────
-- 2. El premio sabe de qué invitación salió
-- ─────────────────────────────────────────────────────────────
ALTER TABLE reward_grants
  ADD COLUMN IF NOT EXISTS qr_campaign_id uuid REFERENCES qr_campaigns(id) ON DELETE SET NULL;

COMMENT ON COLUMN reward_grants.qr_campaign_id IS
  'Invitación que otorgó este premio (source = invite). Es lo que deja contar por invitación: cuántos se registraron, cuántos vinieron, cuántos vencieron.';

CREATE INDEX IF NOT EXISTS idx_reward_grants_qr_campaign
  ON reward_grants (qr_campaign_id, status)
  WHERE qr_campaign_id IS NOT NULL;

-- 'invite' entra al CHECK de origen. El índice único parcial de la 00031
-- `(customer_id, source) WHERE active AND campaign_prize` sigue igual y significa,
-- para este origen: UNA invitación activa por cliente a la vez. Es más estricto
-- que "una vez por invitación" y se acepta a propósito en la v1 — el caso "tengo
-- dos regalos pendientes de dos promos distintas" no existe todavía y abrirlo
-- exigiría cambiar el índice, que es el freno contra el premio doble.
ALTER TABLE reward_grants DROP CONSTRAINT IF EXISTS reward_grants_source_check;
ALTER TABLE reward_grants ADD CONSTRAINT reward_grants_source_check
  CHECK (source IN ('mystery_box', 'safe_choice', 'reactivation', 'review', 'manual', 'invite'));

-- ─────────────────────────────────────────────────────────────
-- 3. La sede, como en la 00043 y la 00058: FK compuesta, nunca simple
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_nombre text := 'qr_campaigns_location_id_tenant_fkey';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.qr_campaigns'::regclass AND conname = v_nombre
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.qr_campaigns ADD CONSTRAINT %I '
      'FOREIGN KEY (location_id, tenant_id) '
      'REFERENCES public.restaurant_locations (id, tenant_id) '
      'ON DELETE RESTRICT',
      v_nombre
    );
  END IF;
  -- Nunca CONCURRENTLY: el harness manda el archivo en una sola transacción.
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_qr_campaigns_location_id ON public.qr_campaigns (tenant_id, location_id) WHERE location_id IS NOT NULL';
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. RLS — el mismo patrón que campaign_rewards (00031)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE qr_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_all_qr_campaigns" ON qr_campaigns;
CREATE POLICY "tenant_all_qr_campaigns" ON qr_campaigns FOR ALL
  USING      (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- La landing pública `/c/{slug}` NO lee esta tabla con la anon key: pasa por una
-- API route con service role que devuelve solo nombre, premio y vigencia. Por eso
-- no hay política de lectura pública.
