-- ═══════════════════════════════════════════════════════════════
-- 09 · ENCENDER Sushi Fun — el último paso, y el único irreversible en la práctica
-- Absorción de Sushi Fun al despliegue principal — 2026-09-06
--
-- Se pega en el SQL Editor del Supabase **PRINCIPAL**.
--
-- ⚠️ NO CORRAS ESTE ARCHIVO HASTA QUE LAS TRES COSAS SEAN CIERTAS:
--
--   1. El 08 dio OK.
--   2. Los DOS crons del Vercel VIEJO de Sushi Fun están APAGADOS
--      (/api/cron/birthday 08:00 UTC y /api/cron/reactivation 10:00 UTC, en su
--      vercel.json). Mientras vivan, los crons del despliegue principal —que sin
--      ?tenant= recorren TODOS los tenants activos— mandan el MISMO cumpleaños a
--      los MISMOS clientes desde el MISMO número. Dos veces.
--   3. El webhook de entrada de Twilio de Sushi Fun ya apunta al despliegue
--      principal (…/api/webhook/twilio-incoming). Si sigue apuntando al Vercel
--      viejo y ese se apaga, los "SALIR" de los clientes dejan de registrarse:
--      se les sigue escribiendo a personas que pidieron no recibir más.
--
-- Hasta acá, todo lo anterior era reversible con 99-ROLLBACK.sql sin que ningún
-- cliente se enterara. A partir de este COMMIT, Sushi Fun opera de verdad en el
-- despliegue principal: entran check-ins y salen WhatsApp. Un rollback posterior
-- borra las filas, pero no des-envía un mensaje.
--
-- PARA APAGARLO OTRA VEZ (vuelta atrás rápida, sin borrar nada):
--   UPDATE tenants SET is_active = false WHERE slug = 'sushi-fun';
-- ═══════════════════════════════════════════════════════════════

BEGIN;

DO $activar$
DECLARE
  v_sf uuid := 'b2c3d4e5-f6a7-8901-bcde-f23456789012';
  v_t  record;
  v_n  bigint;
BEGIN
  SELECT * INTO v_t FROM tenants WHERE id = v_sf;
  IF v_t IS NULL THEN
    RAISE EXCEPTION '09 ABORTA: el tenant Sushi Fun no existe. Corré primero el 01.';
  END IF;

  IF v_t.is_active THEN
    RAISE NOTICE '09: Sushi Fun ya estaba activo. Nada que hacer.';
    RETURN;
  END IF;

  -- No se enciende un tenant a medio cargar: sería abrir el check-in sobre una
  -- base sin sus clientes, y el primero que escanee se registraría como nuevo.
  SELECT count(*) INTO v_n FROM customers WHERE tenant_id = v_sf;
  IF v_n = 0 THEN
    RAISE EXCEPTION '09 ABORTA: Sushi Fun no tiene ni un cliente cargado. Corré 02-07 y el 08 antes de encender.';
  END IF;

  -- Las tres de Twilio, otra vez. Es lo último que se mira antes de que pueda
  -- salir un mensaje de verdad.
  IF v_t.twilio_subaccount_sid IS NULL
     OR v_t.twilio_subaccount_auth_token IS NULL
     OR v_t.twilio_whatsapp_number IS NULL THEN
    RAISE EXCEPTION '09 ABORTA: alguna columna twilio_* esta en NULL. Encender asi manda los WhatsApp de Sushi Fun desde el numero de Sushi Service.';
  END IF;

  -- Una sola sede activa, o su dueño recibe 403 en el panel el primer día.
  SELECT count(*) INTO v_n FROM restaurant_locations WHERE tenant_id = v_sf AND is_active;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '09 ABORTA: Sushi Fun tiene % sedes activas y debe tener 1.', v_n;
  END IF;

  UPDATE tenants SET is_active = true WHERE id = v_sf;

  RAISE NOTICE '09: Sushi Fun ENCENDIDO. Desde ahora resuelve por %, entra a los crons y responde su webhook de Twilio.', v_t.domain;
END $activar$;

DO $ver$
DECLARE v_sf uuid := 'b2c3d4e5-f6a7-8901-bcde-f23456789012'; v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM tenants WHERE id = v_sf AND is_active;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '09 FALLO: Sushi Fun no quedo activo.';
  END IF;
  RAISE NOTICE 'OK 09: Sushi Fun esta vivo en el despliegue principal.';
END $ver$;

COMMIT;
