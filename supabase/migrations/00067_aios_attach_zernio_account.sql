-- ═══════════════════════════════════════════════════════════════════════════
-- 00067 — Conectar Zernio EN PARALELO a Twilio (sin cambiar de proveedor)
-- 2026-09-12
--
--   `aios_attach_zernio_account(slug, profile, account, phone)` — deja los tres
--   `tenants.zernio_*` en una marca que sigue en `messaging_provider='twilio'`.
--
-- POR QUÉ EXISTE (y por qué es una EXCEPCIÓN, no el camino)
--   Sushi Service manda lo normal por Twilio y funciona; a la DIFUSIÓN (Golden
--   Bullet) la gente la toma por número falso viniendo de esa línea. La difusión
--   tiene que salir por la línea de coexistencia (Zernio) YA, y lo demás quedarse
--   en Twilio hasta que ese número muera (~1 mes). El Golden Bullet ya sabe salir
--   por Zernio con la marca en Twilio (`golden_bullet_provider`, mismo día), pero
--   necesita `zernio_account_id` y `zernio_phone_number` en la fila — y el único
--   escritor de esas columnas, `aios_activate_whatsapp()` (00036), cambia el
--   proveedor a `zernio` en la misma transacción, a propósito.
--
--   Esta función es el «a propósito» al revés, con nombre propio: escribe SOLO los
--   `zernio_*` y NUNCA `messaging_provider`. No es una sobrecarga de
--   `aios_activate_whatsapp` (agregarle un parámetro crearía una SOBRECARGA y la
--   llamada vieja quedaría ambigua, 42725 — pasó con `log_review_shown_deduped()`).
--
-- QUÉ NO ES
--   No es un segundo camino de activación. Cuando Twilio muera, el paso 4 de la
--   sede del AIOS («Activar») corre `aios_activate_whatsapp()` con los MISMOS
--   valores y ahí sí cambia el proveedor. Esta función se niega si la marca ya
--   está en `zernio`: para eso está la otra.
--
-- RIESGO: NULO. Un UPDATE de tres columnas nullable en una fila, con el índice
--   único `idx_tenants_zernio_account_id` (00036) impidiendo que dos marcas
--   reclamen la misma cuenta. El camino Twilio no lee `zernio_*`.
-- ⚠️ Se aplica en Supabase ANTES de desplegar el AIOS que la usa. Sin ella el
--    AIOS responde «esa función todavía no existe» (42883) y no rompe nada más.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION aios_attach_zernio_account(
  p_slug       text,
  p_profile_id text,
  p_account_id text,
  p_phone      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id       uuid;
  v_provider text;
  v_previous text;
BEGIN
  SELECT id, messaging_provider, zernio_account_id
    INTO v_id, v_provider, v_previous
    FROM tenants WHERE slug = p_slug;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'tenant_no_existe' USING DETAIL = p_slug;
  END IF;

  -- Mismas validaciones que aios_activate_whatsapp (00036): el contrato del dato
  -- es el mismo, solo cambia qué NO se toca.
  IF p_phone !~ '^\+[0-9]{7,15}$' THEN
    RAISE EXCEPTION 'phone_invalido'
      USING DETAIL = 'formato esperado E.164 con +, recibido: ' || COALESCE(p_phone, '(null)');
  END IF;
  IF p_account_id IS NULL OR length(trim(p_account_id)) = 0 THEN
    RAISE EXCEPTION 'account_id_requerido';
  END IF;

  -- Una marca que ya manda por Zernio no está «en paralelo»: se activa con
  -- aios_activate_whatsapp. Negarse acá evita que alguien crea que cambió algo.
  IF v_provider = 'zernio' THEN
    RAISE EXCEPTION 'ya_es_zernio'
      USING DETAIL = 'la marca ya manda por Zernio; usar aios_activate_whatsapp';
  END IF;

  UPDATE tenants
     SET zernio_profile_id   = p_profile_id,
         zernio_account_id   = p_account_id,
         zernio_phone_number = p_phone
   WHERE id = v_id;

  RETURN jsonb_build_object(
    'slug',              p_slug,
    'messaging_provider', v_provider,       -- sigue siendo el de antes, a propósito
    'zernio_account_id', p_account_id,
    'zernio_phone_number', p_phone,
    'replaced_account',  v_previous IS NOT NULL AND v_previous <> p_account_id
  );
END;
$fn$;

REVOKE ALL ON FUNCTION aios_attach_zernio_account(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aios_attach_zernio_account(text, text, text, text) TO aios_constelarys;

COMMENT ON FUNCTION aios_attach_zernio_account(text, text, text, text) IS
  'AIOS: deja zernio_* en una marca que sigue en Twilio (difusión por la línea de coexistencia, Golden Bullet). NUNCA cambia messaging_provider; para eso, aios_activate_whatsapp. Se niega si la marca ya es zernio.';
