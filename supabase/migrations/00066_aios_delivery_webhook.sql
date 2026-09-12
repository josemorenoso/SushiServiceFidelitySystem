-- ═══════════════════════════════════════════════════════════════════════════
-- 00066 — El AIOS enciende (y apaga) los domicilios por WhatsApp de una marca
-- 2026-09-12
--
--   1. `aios_delivery_webhook_enabled(slug)`     — leer el estado.
--   2. `aios_set_delivery_webhook(slug, enabled)` — cambiarlo.
--
-- POR QUÉ
--   Toda marca que nace desde el AIOS sale con `config.has_delivery_webhook =
--   false` (`aios_provision_tenant`, 00056 §3). El panel del cliente lo dice en
--   ámbar: «Los domicilios por WhatsApp no están activados en tu marca… hace
--   falta que Cada1 lo prenda en la ficha de tu marca». Esa ficha NO tenía el
--   botón: el rol `aios_constelarys` no puede leer `tenants.config` (el GRANT
--   por columnas de la 00035 lo deja fuera a propósito) ni escribirlo. Hasta
--   hoy se prendía por SQL a mano. Planeta Wings, 2026-09-12.
--
-- QUÉ ES LA BANDERA
--   Solo informativa: la lee `buildDeliveryChannel()` para el aviso del panel.
--   Nada en el webhook la consulta — un pedido de un número autorizado entra
--   igual. Encenderla es decirle al cliente «ya está», y por eso se enciende
--   cuando la línea de la marca está de verdad recibiendo.
--
--   Ausente se lee como `true` (los tenants que ya recibían domicilios nunca
--   la tuvieron puesta): la lectura de acá replica esa regla para que el AIOS
--   y el panel del cliente digan lo mismo.
--
-- CÓMO ESCRIBE
--   Por `merge_tenant_config_deep()` (00047), el único escritor de `config`:
--   un `||` plano borraría `branding`, `qr_studio` e `integrations` enteros.
--
-- RIESGO
--   NULO: una clave booleana dentro de `config`. Se aplica en Supabase ANTES de
--   desplegar el AIOS que la usa; sin ella el AIOS dice «esa función todavía no
--   existe» (42883) y la tarjeta se muestra sin el interruptor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- 1. Leer
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION aios_delivery_webhook_enabled(p_slug text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_config jsonb;
BEGIN
  SELECT config INTO v_config FROM tenants WHERE slug = p_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_no_existe' USING DETAIL = p_slug;
  END IF;
  -- Misma regla que `buildDeliveryChannel()`: solo un `false` explícito apaga.
  RETURN COALESCE((v_config ->> 'has_delivery_webhook')::boolean, true);
END;
$fn$;

COMMENT ON FUNCTION aios_delivery_webhook_enabled(text) IS
  'Espejo de tenants.config.has_delivery_webhook para el AIOS (ausente = true, como en el panel). El rol aios_constelarys no lee config.';

-- ───────────────────────────────────────────────
-- 2. Cambiar
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION aios_set_delivery_webhook(p_slug text, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id       uuid;
  v_previous boolean;
BEGIN
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'enabled_requerido';
  END IF;

  SELECT id, COALESCE((config ->> 'has_delivery_webhook')::boolean, true)
    INTO v_id, v_previous
    FROM tenants WHERE slug = p_slug;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'tenant_no_existe' USING DETAIL = p_slug;
  END IF;

  -- Se escribe siempre, también cuando ya coincide: un tenant «ausente = true»
  -- que se enciende queda con la clave EXPLÍCITA, que es lo que se puede leer.
  PERFORM merge_tenant_config_deep(v_id, jsonb_build_object('has_delivery_webhook', p_enabled));

  RETURN jsonb_build_object(
    'slug',     p_slug,
    'enabled',  p_enabled,
    'previous', v_previous
  );
END;
$fn$;

COMMENT ON FUNCTION aios_set_delivery_webhook(text, boolean) IS
  'Enciende o apaga tenants.config.has_delivery_webhook desde el AIOS, vía merge_tenant_config_deep(). Solo informa al panel del cliente: el webhook no la consulta.';

-- ───────────────────────────────────────────────
-- 3. Permisos
-- ───────────────────────────────────────────────
-- Nacen ejecutables por PUBLIC (así nace toda SECURITY DEFINER): se cierran y
-- se abren solo a `aios_constelarys`.
REVOKE ALL ON FUNCTION aios_delivery_webhook_enabled(text)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION aios_set_delivery_webhook(text, boolean)  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    RAISE NOTICE '00066: el rol aios_constelarys no existe (falta la 00035). Las funciones quedan creadas; los GRANT, pendientes.';
    RETURN;
  END IF;
  EXECUTE 'GRANT EXECUTE ON FUNCTION aios_delivery_webhook_enabled(text) TO aios_constelarys';
  EXECUTE 'GRANT EXECUTE ON FUNCTION aios_set_delivery_webhook(text, boolean) TO aios_constelarys';
  RAISE NOTICE '00066: aios_delivery_webhook_enabled y aios_set_delivery_webhook otorgadas a aios_constelarys.';
END $$;

-- ───────────────────────────────────────────────
-- 4. Verificación (sale como NOTICE; nada que aplicar)
-- ───────────────────────────────────────────────
DO $$
DECLARE v_falta text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'aios_delivery_webhook_enabled') THEN v_falta := v_falta || ' aios_delivery_webhook_enabled'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'aios_set_delivery_webhook') THEN v_falta := v_falta || ' aios_set_delivery_webhook'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'merge_tenant_config_deep') THEN v_falta := v_falta || ' merge_tenant_config_deep (falta la 00047)'; END IF;
  IF v_falta <> '' THEN
    RAISE WARNING '00066: falta%', v_falta;
  ELSE
    RAISE NOTICE '00066: OK.';
  END IF;
END $$;
