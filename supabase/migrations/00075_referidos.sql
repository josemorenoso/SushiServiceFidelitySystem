-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 00075: referidos — el cliente trae a un amigo y los dos ganan
-- Fecha: 2026-10-15
-- Prompt: docs/prompts/2026-10-15-referidos.md
-- Feature: docs/features/referral-program.md (§2, ahora «lo que hay»)
--          docs/features/invite-campaigns.md · docs/features/reward-grants.md
--
-- DE DÓNDE SALE
-- ─────────────
-- El dueño (septiembre, S-6): *«Ya tenemos el apartado de invitaciones: necesito que
-- creemos ya el apartado de referidos»*. Las invitaciones (00063) ya ponen un premio en
-- la tarjeta de quien se registra por un enlace y lo entregan cuando el mesero escanea.
-- Lo que faltaba: un enlace POR CLIENTE, saber quién trajo a quién, y que quien trajo
-- gane cuando su amigo VIENE (el mesero valida su primera visita), una sola vez.
--
-- QUÉ TRAE
-- ────────
--   1. `customers_id_tenant_key UNIQUE (id, tenant_id)`: el soporte de las FK
--      COMPUESTAS hacia un cliente. Hasta hoy ninguna tabla apuntaba a `customers` con
--      la marca en la llave; sin esto, una fila de la marca A podría nombrar a un
--      cliente de la marca B y el motor no diría nada (la misma razón que la
--      `restaurant_locations_id_tenant_key` de la 00041 para las sedes).
--   2. `referral_codes`: el código de cada cliente (uno por cliente y marca, se crea
--      la primera vez que lo pide su tarjeta). Único POR MARCA: el enlace `/r/{código}`
--      se resuelve bajo el dominio de la marca, y el de la marca A no existe en la B.
--   3. `referrals`: quién trajo a quién, con su estado (pendiente · completado ·
--      vencido) y sus fechas. **Un teléfono se refiere UNA sola vez por marca**
--      (UNIQUE `(tenant_id, referred_phone)`), nadie se refiere a sí mismo (CHECK), y
--      `expires_at` se fija al registrarse (los días de vencimiento de ESE momento).
--   4. `reward_grants`: la fuente `referral`, la columna `referral_id`, y el freno de
--      «una vez»: UNIQUE `(referral_id, customer_id)` — un premio por referido y por
--      persona (el regalo del amigo y el premio de quien lo trajo son dos filas).
--      El índice de la 00031 (un premio de campaña ACTIVO por cliente y fuente) deja
--      de aplicar a `referral`: quien trae a tres amigos tiene que poder tener tres
--      premios pendientes; con el índice viejo el segundo moría como `duplicate_active`.
--   5. `completar_referido()`: la única puerta de pendiente → completado. Toma la fila
--      con `FOR UPDATE` (dos escaneos simultáneos del mismo amigo: el segundo espera y
--      ve «ya resuelto») y, para el tope del mes, un `pg_advisory_xact_lock` por quien
--      invita (dos amigos distintos del mismo referidor validados a la vez no pasan el
--      tope entre los dos). Es el mismo patrón que SEG-2 (00072).
--
-- LO QUE NO TRAE, A PROPÓSITO
-- ───────────────────────────
--   · Ninguna columna de sede. La sede de registro del amigo y la de su visita se
--     anotan como siempre (F3: `customers.origin_location_id`, `visits.location_id`), y
--     la del premio de quien invita va en `reward_grants.granted_location_id`.
--   · Ningún backfill, ninguna fila tocada. Nace vacío y el programa nace APAGADO en
--     todas las marcas (`admin_settings.referral_enabled`, sin fila = apagado).
--   · Ningún cron: los pendientes que pasan su `expires_at` se marcan al leer (panel,
--     tarjeta) y al intentar completarlos (`completar_referido()`).
--   · Ninguna plantilla de WhatsApp. El enlace sale por el WhatsApp PERSONAL de quien
--     invita (`wa.me/?text=…`), así que quien invita nunca escribe el teléfono del amigo:
--     el amigo da su propio consentimiento al registrarse (Ley 1581).
--
-- RIESGO: BAJO. Dos tablas nuevas vacías; un índice único sobre `customers (id,
--   tenant_id)` que se cumple solo (`id` ya es PK); el CHECK de fuentes de
--   `reward_grants` se amplía; el índice de la 00031 se rehace con un predicado MÁS
--   estrecho (todo lo que cumplía, cumple: excluye una fuente que hoy no tiene filas).
-- REVERSIBLE: sí — `DROP FUNCTION completar_referido`, `DROP TABLE referrals,
--   referral_codes`, `ALTER TABLE reward_grants DROP COLUMN referral_id`, y volver a
--   crear el índice y el CHECK de la 00031/00063 — SIEMPRE que no haya grants con
--   `source = 'referral'` (si los hay, borrarlos o recrear el índice falla).
-- ORDEN: después de la 00074. ⚠️ VA ANTES DEL CÓDIGO: sin ella, la pestaña Referidos
--   responde 500 y el registro por `/r/{código}` cae al registro normal (el código lee
--   tablas que no existen: 42P01, que se loguea). Con el programa apagado —todas las
--   marcas el día del despliegue— el check-in no toca nada de esto.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 0. Guardas de dependencia
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname  = 'reward_grants_source_check'
       AND conrelid = 'public.reward_grants'::regclass
  ) THEN
    RAISE EXCEPTION
      '00075 requiere la 00063: falta reward_grants_source_check (la fuente invite), que esta migración amplía.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'idx_reward_grants_unique_active_campaign'
  ) THEN
    RAISE EXCEPTION
      '00075 requiere la 00031: falta idx_reward_grants_unique_active_campaign, que esta migración rehace.';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 1. El soporte de las FK compuestas hacia un cliente
-- ─────────────────────────────────────────────────────────────
-- `id` ya es PK, así que `(id, tenant_id)` es único por construcción: el índice no
-- puede fallar al crearse. Es lo que deja escribir `(customer_id, tenant_id)
-- REFERENCES customers (id, tenant_id)` y mover al motor la garantía de que un
-- referido de la marca A nunca nombre a un cliente de la B.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname  = 'customers_id_tenant_key'
       AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_id_tenant_key UNIQUE (id, tenant_id);
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 2. El código de cada cliente
-- ─────────────────────────────────────────────────────────────
-- Alfabeto sin caracteres que se confunden al dictarlos o leerlos (sin 0/O, 1/I/L):
-- el código viaja en un enlace, pero también se lee en voz alta en la mesa.
CREATE TABLE IF NOT EXISTS referral_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  code        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_codes_customer_fkey
    FOREIGN KEY (customer_id, tenant_id) REFERENCES customers (id, tenant_id) ON DELETE CASCADE,
  -- Un código por cliente: el enlace de la tarjeta no cambia cada vez que se abre.
  CONSTRAINT referral_codes_tenant_customer_key UNIQUE (tenant_id, customer_id),
  -- Único POR MARCA, no global: se resuelve bajo el dominio de la marca.
  CONSTRAINT referral_codes_tenant_code_key UNIQUE (tenant_id, code),
  CONSTRAINT referral_codes_code_format CHECK (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6,8}$')
);

COMMENT ON TABLE referral_codes IS
  'Código de referido de cada cliente (docs/features/referral-program.md). Uno por cliente y marca, se crea la primera vez que la tarjeta lo pide. El enlace es /r/{code} bajo el dominio de la marca.';


-- ─────────────────────────────────────────────────────────────
-- 3. Quién trajo a quién
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  referrer_customer_id uuid NOT NULL,
  referred_customer_id uuid NOT NULL,
  -- El celular del amigo tal como lo guarda `customers.phone` (10 dígitos). Es la
  -- regla «un teléfono se refiere una sola vez por marca», escrita en la base.
  referred_phone       text NOT NULL,
  -- El código con el que llegó (copia: el de la tarjeta no cambia, pero la fila
  -- cuenta su historia sin depender de otra tabla).
  code                 text NOT NULL,
  status               text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired')),
  -- ¿Quien invitó ganó su premio con ESTE amigo? `false` en un completado = el tope
  -- del mes ya estaba lleno, o la marca no tenía premio para quien invita. Es lo que
  -- cuenta el tope: solo los premiados.
  referrer_rewarded    boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  -- Se fija al registrarse, con los días de vencimiento de ese momento: cambiar el
  -- ajuste después no le mueve la fecha a nadie.
  expires_at           timestamptz NOT NULL,
  completed_at         timestamptz NULL,
  expired_at           timestamptz NULL,
  CONSTRAINT referrals_referrer_fkey
    FOREIGN KEY (referrer_customer_id, tenant_id) REFERENCES customers (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT referrals_referred_fkey
    FOREIGN KEY (referred_customer_id, tenant_id) REFERENCES customers (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT referrals_tenant_phone_key    UNIQUE (tenant_id, referred_phone),
  CONSTRAINT referrals_tenant_referred_key UNIQUE (tenant_id, referred_customer_id),
  CONSTRAINT referrals_no_self CHECK (referred_customer_id <> referrer_customer_id),
  CONSTRAINT referrals_completed_pareja CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CONSTRAINT referrals_expired_pareja   CHECK ((status = 'expired')   = (expired_at   IS NOT NULL)),
  CONSTRAINT referrals_rewarded_solo_completado CHECK (NOT referrer_rewarded OR status = 'completed'),
  CONSTRAINT referrals_vence_despues CHECK (expires_at > created_at)
);

COMMENT ON TABLE referrals IS
  'Referidos (docs/features/referral-program.md): quién trajo a quién. pending al registrarse el amigo por /r/{code}; completed cuando el mesero valida su primera visita (completar_referido()); expired si pasa expires_at sin venir. Un teléfono se refiere una sola vez por marca.';
COMMENT ON COLUMN referrals.referrer_rewarded IS
  'Si quien invitó ganó su premio con este amigo. false en un completado = tope del mes lleno o la marca sin premio para quien invita. El tope del mes cuenta SOLO estos.';

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON referrals (tenant_id, referrer_customer_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_pending_expiry
  ON referrals (tenant_id, expires_at)
  WHERE status = 'pending';


-- ─────────────────────────────────────────────────────────────
-- 4. reward_grants: la fuente `referral` y el freno de «una vez»
-- ─────────────────────────────────────────────────────────────
ALTER TABLE reward_grants
  ADD COLUMN IF NOT EXISTS referral_id uuid NULL REFERENCES referrals(id) ON DELETE SET NULL;

COMMENT ON COLUMN reward_grants.referral_id IS
  'Referido que otorgó este premio (source = referral): el regalo del amigo (customer_id = el amigo) o el premio de quien lo trajo (customer_id = quien invitó). Uno de cada uno por referido: idx_reward_grants_referral_once.';

ALTER TABLE reward_grants DROP CONSTRAINT IF EXISTS reward_grants_source_check;
ALTER TABLE reward_grants ADD CONSTRAINT reward_grants_source_check
  CHECK (source IN ('mystery_box', 'safe_choice', 'reactivation', 'review', 'manual', 'invite', 'referral'));

-- El índice de la 00031 decía: un cliente no puede tener dos premios de campaña
-- ACTIVOS de la misma fuente. Para `referral` eso está mal: quien trae a tres amigos
-- que vienen antes de que reclame el primero tiene tres premios ganados, y con el
-- índice viejo el segundo y el tercero se perdían como `duplicate_active`. Para las
-- demás fuentes no cambia nada (mismo índice, misma regla).
DROP INDEX IF EXISTS idx_reward_grants_unique_active_campaign;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_grants_unique_active_campaign
  ON reward_grants (customer_id, source)
  WHERE status = 'active' AND grant_type = 'campaign_prize' AND source <> 'referral';

-- El freno que lo reemplaza para `referral`, y que además es más fuerte: no depende
-- del estado. Un premio por referido y por persona, para siempre — ni dos escaneos
-- simultáneos, ni un reintento después de entregado, le dan dos premios a nadie.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_grants_referral_once
  ON reward_grants (referral_id, customer_id)
  WHERE referral_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 5. completar_referido(): pendiente → completado, una sola vez
-- ─────────────────────────────────────────────────────────────
-- La llama el check-in del mesero (`POST /api/check-in`, `checkin`) en cada escaneo
-- de una marca con referidos encendidos. Devuelve qué pasó; el premio lo otorga el
-- código SOLO cuando `resultado = 'completado'` y `referrer_rewarded = true`, y esa
-- respuesta sale una vez por referido: la fila queda `completed` en la misma
-- transacción que la decide.
--
--   sin_referido  · el cliente no llegó por un referido de esta marca.
--   ya_resuelto   · ya estaba completado o vencido (el segundo de dos escaneos).
--   vencido       · pasó `expires_at` sin venir: queda `expired`, nadie gana.
--   completado    · el amigo vino. `referrer_rewarded` dice si quien invitó gana.
--   tope          · el amigo vino, pero quien invitó ya llenó su tope del mes.
--
-- El tope cuenta los premiados de quien invita desde el primer día del mes EN BOGOTÁ.
-- `p_monthly_cap` NULL = sin tope (el código siempre manda uno; el default es 10).
CREATE OR REPLACE FUNCTION completar_referido(
  p_tenant_id            uuid,
  p_referred_customer_id uuid,
  p_monthly_cap          integer,
  p_reward_referrer      boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r            referrals%ROWTYPE;
  v_inicio_mes timestamptz;
  v_premiados  integer;
  v_premia     boolean := COALESCE(p_reward_referrer, false);
  v_resultado  text := 'completado';
BEGIN
  -- FOR UPDATE: un segundo escaneo simultáneo del mismo amigo espera acá; cuando el
  -- primero confirma, lee la fila ya `completed` y sale por «ya_resuelto».
  SELECT * INTO r
    FROM referrals
   WHERE tenant_id = p_tenant_id
     AND referred_customer_id = p_referred_customer_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('resultado', 'sin_referido');
  END IF;

  IF r.status <> 'pending' THEN
    RETURN jsonb_build_object('resultado', 'ya_resuelto', 'referral_id', r.id, 'status', r.status);
  END IF;

  IF r.expires_at <= now() THEN
    UPDATE referrals SET status = 'expired', expired_at = now() WHERE id = r.id;
    RETURN jsonb_build_object(
      'resultado', 'vencido',
      'referral_id', r.id,
      'referrer_customer_id', r.referrer_customer_id
    );
  END IF;

  IF v_premia THEN
    -- Un candado por QUIEN INVITA: dos amigos distintos suyos validados en el mismo
    -- segundo cuentan el tope de a uno. Se libera al confirmar.
    PERFORM pg_advisory_xact_lock(hashtextextended('referidos:' || r.referrer_customer_id::text, 0));

    v_inicio_mes := date_trunc('month', now() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota';
    SELECT count(*) INTO v_premiados
      FROM referrals
     WHERE tenant_id = p_tenant_id
       AND referrer_customer_id = r.referrer_customer_id
       AND referrer_rewarded
       AND completed_at >= v_inicio_mes;

    IF p_monthly_cap IS NOT NULL AND v_premiados >= p_monthly_cap THEN
      v_premia := false;
      v_resultado := 'tope';
    END IF;
  END IF;

  UPDATE referrals
     SET status = 'completed',
         completed_at = now(),
         referrer_rewarded = v_premia
   WHERE id = r.id;

  RETURN jsonb_build_object(
    'resultado', v_resultado,
    'referral_id', r.id,
    'referrer_customer_id', r.referrer_customer_id,
    'referrer_rewarded', v_premia
  );
END;
$$;

COMMENT ON FUNCTION completar_referido(uuid, uuid, integer, boolean) IS
  'Referidos: pasa el referido del cliente de pendiente a completado UNA vez (FOR UPDATE) y decide si quien invitó gana, contando el tope del mes con un candado por referidor. La llama POST /api/check-in en el escaneo del mesero. docs/features/referral-program.md.';

REVOKE ALL ON FUNCTION completar_referido(uuid, uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION completar_referido(uuid, uuid, integer, boolean) TO service_role;


-- ─────────────────────────────────────────────────────────────
-- 6. RLS — el mismo patrón que qr_campaigns (00063)
-- ─────────────────────────────────────────────────────────────
-- Todo pasa por rutas con service role (que se salta RLS); esto es la red barata para
-- un cliente con sesión de panel. Ni la landing `/r/{código}` ni la tarjeta leen estas
-- tablas con la anon key.
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_all_referral_codes" ON referral_codes;
CREATE POLICY "tenant_all_referral_codes" ON referral_codes FOR ALL
  USING      (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "tenant_all_referrals" ON referrals;
CREATE POLICY "tenant_all_referrals" ON referrals FOR ALL
  USING      (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());
