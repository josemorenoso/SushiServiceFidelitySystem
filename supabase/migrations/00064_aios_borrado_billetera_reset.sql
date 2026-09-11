-- ═══════════════════════════════════════════════════════════════════════════
-- 00064 — Tres cosas que el AIOS no podía hacer y el dueño necesita ya
-- 2026-09-11
--
--   1. `aios_delete_tenant(slug, dry_run)`  — borrar una marca ENTERA del producto.
--   2. `aios_deactivate_whatsapp(slug)`     — deshacer `aios_activate_whatsapp`.
--   3. `aios_wallet_topup(slug, cop, nota)` — recargar la billetera de un Twilio.
--
-- POR QUÉ LAS TRES JUNTAS
--   El rol `aios_constelarys` (00035 v2) no tiene DELETE ni UPDATE ni INSERT
--   directo sobre nada — a propósito. Cada escritura pasa por una función
--   SECURITY DEFINER con su guardia adentro. Estas tres son lo que faltaba:
--
--   · El dueño creó dos marcas de prueba desde el AIOS y no hay forma de
--     sacarlas: `Borrar` en el AIOS solo borra SU fila; el tenant, sus sedes,
--     sus admin_settings y sus 4 reward_tiers se quedan en el producto para
--     siempre, ocupando el slug y el subdominio.
--   · Tepuy quedó activado en Zernio con el número del SIMULADOR
--     (`+573000000000`) y hay que registrarle el número real. No existía el
--     camino de vuelta: un tenant que entra a `zernio` no salía nunca.
--   · Los clientes que mandan por Twilio pagan la mensualidad y hay que
--     cargarles mensajes. Eso hoy exige entrar al panel del producto como
--     super-admin: el AIOS, que es donde se ve el cobro, no podía.
--
-- RIESGO
--   ALTA la primera (borra datos de verdad), por eso lleva TRES candados:
--     · se niega sobre el tenant «puente» (el DEFAULT de `tenant_id` de la 00028:
--       borrarlo dejaría sin destino cada INSERT que olvide la marca);
--     · se niega con más de 100 clientes registrados (una marca así está viva:
--       se borra a mano, con la migración a la vista, no con un botón);
--     · `dry_run = true` por defecto: devuelve QUÉ borraría, tabla por tabla,
--       sin tocar nada. El AIOS lo enseña antes de pedir la confirmación.
--   NULA las otras dos: un UPDATE de cuatro columnas y un INSERT en el ledger.
--
-- LO QUE NO HACE `aios_delete_tenant`
--   No toca `auth.users`: el rol no llega ahí y la función tampoco debe. Los
--   usuarios del panel de esa marca los borra `POST /api/aios/tenant-delete`
--   (service role, API de GoTrue) ANTES de llamar a esto. Tampoco toca el
--   storage (`event-media`): los flyers de una marca de prueba quedan huérfanos
--   en el bucket, sin dueño, sin daño y sin costo que importe.
--
-- ⚠️ Se aplica en Supabase ANTES de desplegar el AIOS que la usa. Sin ella el
--    AIOS responde «esa función todavía no existe» (42883) y no rompe nada más.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- 1. Borrar una marca entera
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION aios_delete_tenant(
  p_slug    text,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id        uuid;
  v_name      text;
  v_customers bigint;
  v_table     text;
  v_n         bigint;
  v_counts    jsonb := '{}'::jsonb;
  v_total     bigint := 0;
  v_pending   text[];
  v_pass      int;
BEGIN
  SELECT id, name INTO v_id, v_name FROM tenants WHERE slug = p_slug;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'tenant_no_existe' USING DETAIL = p_slug;
  END IF;

  -- Candado 1: el tenant puente. La 00028 dejó `tenant_id` con DEFAULT al id de
  -- Sushi Service en 18 tablas (la 00030 nunca se aplicó). Borrar ESE tenant
  -- rompería el DEFAULT de todas y cada INSERT sin marca fallaría por FK.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND column_name = 'tenant_id'
       AND column_default LIKE '%' || v_id::text || '%'
  ) THEN
    RAISE EXCEPTION 'tenant_puente' USING DETAIL =
      'La marca ' || p_slug || ' es el DEFAULT puente de tenant_id (00028). No se borra desde el AIOS bajo ninguna circunstancia.';
  END IF;

  -- Candado 2: tamaño. Un botón del panel borra una marca de PRUEBA; una marca
  -- con cientos de clientes es una marca viva y eso se decide con la migración
  -- a la vista, no con un formulario.
  SELECT count(*) INTO v_customers FROM customers WHERE tenant_id = v_id;
  IF v_customers > 100 THEN
    RAISE EXCEPTION 'tenant_demasiado_grande' USING DETAIL =
      v_customers::text || ' clientes registrados. Desde el AIOS solo se borra una marca con hasta 100; esta está viva y se borra a mano.';
  END IF;

  -- Inventario: TODA tabla del esquema con columna `tenant_id`, sin lista fija.
  -- Una lista escrita a mano envejece con la primera migración que agregue una
  -- tabla; esto no. Solo tablas base (las vistas no se borran).
  FOR v_table IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name = 'tenant_id'
       AND t.table_type = 'BASE TABLE'
       AND c.table_name <> 'tenants'
     ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id = $1', v_table)
       INTO v_n USING v_id;
    IF v_n > 0 THEN
      v_counts := v_counts || jsonb_build_object(v_table, v_n);
      v_total  := v_total + v_n;
    END IF;
  END LOOP;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run',    true,
      'tenant_id',  v_id,
      'slug',       p_slug,
      'name',       v_name,
      'customers',  v_customers,
      'rows',       v_counts,
      'total_rows', v_total
    );
  END IF;

  -- Borrado en PASADAS. Las FK entre tablas del tenant son ON DELETE RESTRICT
  -- (00025) y el orden correcto cambia con cada migración: en vez de fijarlo,
  -- se intenta cada tabla y la que choque con una FK espera a la pasada
  -- siguiente, cuando la que la referenciaba ya esté vacía. Diez pasadas
  -- sobran para cualquier profundidad razonable; si algo queda, se aborta
  -- ENTERO (una sola transacción) y se dice qué tabla fue.
  v_pending := ARRAY(SELECT jsonb_object_keys(v_counts));
  FOR v_pass IN 1..10 LOOP
    EXIT WHEN coalesce(array_length(v_pending, 1), 0) = 0;
    FOREACH v_table IN ARRAY v_pending LOOP
      BEGIN
        EXECUTE format('DELETE FROM %I WHERE tenant_id = $1', v_table) USING v_id;
        v_pending := array_remove(v_pending, v_table);
      EXCEPTION WHEN foreign_key_violation THEN
        NULL; -- otra tabla del tenant la referencia: se reintenta en la siguiente pasada
      END;
    END LOOP;
  END LOOP;

  IF coalesce(array_length(v_pending, 1), 0) > 0 THEN
    RAISE EXCEPTION 'borrado_incompleto' USING DETAIL =
      'No se pudieron vaciar por dependencias: ' || array_to_string(v_pending, ', ') || '. No se borró nada.';
  END IF;

  DELETE FROM tenants WHERE id = v_id;

  RETURN jsonb_build_object(
    'dry_run',    false,
    'tenant_id',  v_id,
    'slug',       p_slug,
    'name',       v_name,
    'customers',  v_customers,
    'rows',       v_counts,
    'total_rows', v_total
  );
END;
$fn$;

COMMENT ON FUNCTION aios_delete_tenant(text, boolean) IS
  'Borra una marca ENTERA del producto (toda tabla con tenant_id + la fila de tenants). '
  'Se niega sobre el tenant puente de la 00028 y sobre marcas con más de 100 clientes. '
  'dry_run=true devuelve el inventario sin tocar nada. No toca auth.users ni storage.';

-- ───────────────────────────────────────────────
-- 2. Deshacer la activación de WhatsApp
-- ───────────────────────────────────────────────
-- Es el espejo exacto de `aios_activate_whatsapp` (00036) + de lo que
-- `aios_set_template_settings` sembró: el tenant vuelve al estado en que nace
-- (`twilio`, sin credenciales Zernio, sin *_template_sid). Con `twilio` y sin
-- sids no sale ni un mensaje: es el estado «WhatsApp apagado» de siempre.
--
-- Idempotente: sobre un tenant que ya está en `twilio` no toca nada y devuelve
-- `reset = false`.
CREATE OR REPLACE FUNCTION aios_deactivate_whatsapp(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id       uuid;
  v_provider text;
  v_phone    text;
  v_sids     int;
BEGIN
  SELECT id, messaging_provider, zernio_phone_number
    INTO v_id, v_provider, v_phone
    FROM tenants WHERE slug = p_slug;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'tenant_no_existe' USING DETAIL = p_slug;
  END IF;

  IF v_provider <> 'zernio' THEN
    RETURN jsonb_build_object('reset', false, 'slug', p_slug, 'provider', v_provider);
  END IF;

  UPDATE tenants
     SET messaging_provider     = 'twilio',
         zernio_profile_id      = NULL,
         zernio_account_id      = NULL,
         zernio_phone_number    = NULL,
         quality_rating         = 'unknown',
         line_status            = 'active',
         line_status_reason     = NULL,
         line_status_changed_at = now()
   WHERE id = v_id;

  -- Las mismas claves que `aios_set_template_settings` acepta, y ninguna otra.
  DELETE FROM admin_settings
   WHERE tenant_id = v_id
     AND (key ~ '^[a-z0-9_]+_template_sid$'
          OR key IN ('event_template_image_sid', 'event_template_video_sid', 'zernio_template_language'));
  GET DIAGNOSTICS v_sids = ROW_COUNT;

  RETURN jsonb_build_object(
    'reset',          true,
    'slug',           p_slug,
    'previous_phone', v_phone,
    'sids_removed',   v_sids
  );
END;
$fn$;

COMMENT ON FUNCTION aios_deactivate_whatsapp(text) IS
  'Deshace aios_activate_whatsapp: messaging_provider vuelve a twilio, zernio_* a NULL, '
  'y se retiran los *_template_sid que el AIOS sembró. Idempotente.';

-- ───────────────────────────────────────────────
-- 3. Recargar la billetera de un Twilio
-- ───────────────────────────────────────────────
-- Un tenant Zernio NO se recarga: la 00037 (D-2) apagó su billetera y la plata
-- entraría a una bolsa que nadie debita. Se rechaza con nombre.
CREATE OR REPLACE FUNCTION aios_wallet_topup(
  p_slug       text,
  p_amount_cop numeric,
  p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id       uuid;
  v_provider text;
  v_price    numeric;
  v_balance  numeric;
BEGIN
  SELECT id, messaging_provider, price_per_message_cop
    INTO v_id, v_provider, v_price
    FROM tenants WHERE slug = p_slug;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'tenant_no_existe' USING DETAIL = p_slug;
  END IF;
  IF v_provider <> 'twilio' THEN
    RAISE EXCEPTION 'solo_tenants_twilio' USING DETAIL =
      'La marca ' || p_slug || ' manda por ' || v_provider || ': su billetera está apagada (00037) y una recarga no le daría ni un mensaje.';
  END IF;
  IF p_amount_cop IS NULL OR p_amount_cop <= 0 THEN
    RAISE EXCEPTION 'monto_invalido' USING DETAIL = 'La recarga tiene que ser mayor que cero.';
  END IF;
  -- Tope de sanidad: nadie recarga cinco millones de pesos en mensajes de una
  -- sentada; un cero de más se frena acá y no en el extracto.
  IF p_amount_cop > 5000000 THEN
    RAISE EXCEPTION 'monto_invalido' USING DETAIL = 'Una recarga de más de $5.000.000 se registra a mano, no desde el AIOS.';
  END IF;

  INSERT INTO tenant_wallet_transactions (tenant_id, type, amount_cop, notes, created_by)
  VALUES (v_id, 'topup', round(p_amount_cop), NULLIF(trim(coalesce(p_notes, '')), ''), 'aios_constelarys');

  SELECT COALESCE(SUM(amount_cop), 0) INTO v_balance
    FROM tenant_wallet_transactions WHERE tenant_id = v_id;

  RETURN jsonb_build_object(
    'slug',                  p_slug,
    'amount_cop',            round(p_amount_cop),
    'balance_cop',           v_balance,
    'price_per_message_cop', COALESCE(NULLIF(v_price, 0), 100),
    'messages_available',    floor(GREATEST(v_balance, 0) / COALESCE(NULLIF(v_price, 0), 100))
  );
END;
$fn$;

COMMENT ON FUNCTION aios_wallet_topup(text, numeric, text) IS
  'Recarga (topup) en la billetera de un tenant TWILIO desde el AIOS. Rechaza Zernio, '
  'cero y más de $5.000.000. Devuelve saldo y mensajes disponibles resultantes.';

-- ───────────────────────────────────────────────
-- 4. Permisos
-- ───────────────────────────────────────────────
-- Las tres nacen ejecutables por PUBLIC (así nace toda SECURITY DEFINER): se
-- cierra primero y después se abre solo a quien corresponde.
--   · `aios_constelarys`  las tres (el AIOS por pg directo, como siempre).
--   · `service_role`      solo el borrado: `POST /api/aios/tenant-delete` del
--                          producto la llama por PostgREST después de borrar
--                          los usuarios de Auth, que el rol del AIOS no ve.
REVOKE ALL ON FUNCTION aios_delete_tenant(text, boolean)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION aios_deactivate_whatsapp(text)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION aios_wallet_topup(text, numeric, text)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aios_delete_tenant(text, boolean) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    RAISE NOTICE '00064: el rol aios_constelarys no existe (falta la 00035). Las funciones quedan creadas; los GRANT, pendientes.';
    RETURN;
  END IF;
  EXECUTE 'GRANT EXECUTE ON FUNCTION aios_delete_tenant(text, boolean) TO aios_constelarys';
  EXECUTE 'GRANT EXECUTE ON FUNCTION aios_deactivate_whatsapp(text) TO aios_constelarys';
  EXECUTE 'GRANT EXECUTE ON FUNCTION aios_wallet_topup(text, numeric, text) TO aios_constelarys';
  RAISE NOTICE '00064: aios_delete_tenant, aios_deactivate_whatsapp y aios_wallet_topup otorgadas a aios_constelarys.';
END $$;

-- ───────────────────────────────────────────────
-- 5. Verificación (sale como NOTICE; nada que aplicar)
-- ───────────────────────────────────────────────
DO $$
DECLARE v_falta text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'aios_delete_tenant') THEN v_falta := v_falta || ' aios_delete_tenant'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'aios_deactivate_whatsapp') THEN v_falta := v_falta || ' aios_deactivate_whatsapp'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'aios_wallet_topup') THEN v_falta := v_falta || ' aios_wallet_topup'; END IF;
  IF has_function_privilege('anon', 'aios_delete_tenant(text, boolean)', 'EXECUTE') THEN v_falta := v_falta || ' [anon puede ejecutar aios_delete_tenant]'; END IF;
  IF v_falta <> '' THEN
    RAISE EXCEPTION '00064: verificación fallida:%', v_falta;
  END IF;
  RAISE NOTICE '00064: OK.';
END $$;
