-- ═══════════════════════════════════════════════════════════════
-- 99 · ROLLBACK — deshace la absorción entera
-- Absorción de Sushi Fun al despliegue principal — 2026-09-06
--
-- Se pega en el SQL Editor del Supabase **PRINCIPAL**.
--
-- CUÁNDO SE USA
-- ─────────────
-- Cuando algo salió mal DESPUÉS de haber corrido uno o más archivos y se quiere
-- volver al estado anterior. Los archivos 01–07 están cada uno envuelto en su
-- propio BEGIN/COMMIT: si uno falla a mitad, se deshace SOLO y no hace falta este
-- archivo. Este es para deshacer archivos que YA hicieron COMMIT.
--
-- 🔴 LO QUE ESTE ARCHIVO NO PUEDE DESHACER
-- ────────────────────────────────────────
-- Un WhatsApp que ya salió. Si el tenant estuvo vivo y despachó mensajes, borrar
-- las filas no los devuelve. Por eso el runbook manda VERIFICAR ANTES de repuntar
-- el DNS: hasta que el DNS no apunte acá, nadie puede disparar un envío.
--
-- QUÉ HACE
-- ────────
-- Borra TODO lo del tenant Sushi Fun, en orden inverso al de las dependencias, y
-- deja la base exactamente como estaba antes del 01. Las otras marcas no se tocan:
-- cada DELETE lleva `WHERE tenant_id = <Sushi Fun>` — sin excepción.
--
-- Es SEGURO correrlo aunque solo se hayan corrido algunos archivos: un DELETE
-- sobre una tabla sin filas de Sushi Fun borra 0 y sigue.
--
-- ⚠️ NO borra nada del Supabase de Sushi Fun. Ese sigue intacto y es el respaldo
--    de verdad: mientras exista, la absorción es reversible sin pérdida.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

DO $rollback$
DECLARE
  v_sf    uuid := 'b2c3d4e5-f6a7-8901-bcde-f23456789012';
  v_n     bigint;
  v_tot   bigint := 0;
  tabla   text;
  -- Orden INVERSO al de la carga: primero los hijos, al final los padres.
  -- Si esta lista se queda corta, el DELETE de `tenants` falla con 23503 y avisa
  -- en vez de dejar filas huérfanas.
  tablas  text[] := ARRAY[
    'message_logs',
    'campaign_messages',
    'review_events',
    'reward_redemptions',
    'reward_grants',
    'mystery_box_results',
    'point_transactions',
    'visits',
    'restaurant_events',
    'campaign_rewards',
    'campaigns',
    'customers',
    'imported_contacts',
    'staff_devices',
    'staff_users',
    'authorized_numbers',
    'admin_settings',
    'mystery_box_global_caps',
    'rewards',
    'reward_tiers',
    'tenant_wallet_transactions',
    'send_queue',
    'send_reservations',
    'consent_events',
    'line_health_snapshots',
    'template_versions',
    'dashboard_user_locations',
    'restaurant_locations'
  ];
BEGIN
  -- Guard: si el tenant no existe, no hay nada que deshacer. Se avisa y se sale
  -- sin tocar nada, en vez de correr 28 DELETE contra un uuid inexistente.
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = v_sf) THEN
    RAISE NOTICE '99: el tenant Sushi Fun no existe en esta base. No hay nada que deshacer.';
    RETURN;
  END IF;

  FOREACH tabla IN ARRAY tablas
  LOOP
    -- Una tabla puede no existir todavía (una migración sin aplicar): se salta.
    IF to_regclass(format('public.%I', tabla)) IS NULL THEN
      RAISE NOTICE '99: %  — la tabla no existe, se salta.', tabla;
      CONTINUE;
    END IF;

    EXECUTE format('DELETE FROM %I WHERE tenant_id = $1', tabla) USING v_sf;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_tot := v_tot + v_n;
    IF v_n > 0 THEN
      RAISE NOTICE '%', format('99: %-28s %s fila(s) borradas', tabla, v_n);
    END IF;
  END LOOP;

  DELETE FROM tenants WHERE id = v_sf;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_tot := v_tot + v_n;

  RAISE NOTICE '99: % fila(s) de Sushi Fun borradas en total.', v_tot;
END $rollback$;

-- ───────────────────────────────────────────────
-- Verificación del rollback
-- ───────────────────────────────────────────────
DO $ver$
DECLARE
  v_sf  uuid := 'b2c3d4e5-f6a7-8901-bcde-f23456789012';
  r     record;
  v_n   bigint;
  v_err text := '';
BEGIN
  -- Barre TODAS las tablas con tenant_id, no la lista de arriba: si quedó una
  -- fila en una tabla que el ARRAY no nombra, esto la encuentra.
  FOR r IN
    SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'tenant_id'
     ORDER BY table_name
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id = $1', r.table_name)
      INTO v_n USING v_sf;
    IF v_n > 0 THEN
      v_err := v_err || format('  · %s: quedan %s fila(s)', r.table_name, v_n) || chr(10);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM tenants WHERE id = v_sf) THEN
    v_err := v_err || '  · tenants: la fila de Sushi Fun sigue ahi' || chr(10);
  END IF;

  IF v_err <> '' THEN
    RAISE EXCEPTION E'99 FALLO: el rollback dejo filas de Sushi Fun.\n%\nAgrega esas tablas al ARRAY y volve a correr.', v_err;
  END IF;

  -- Y que el trigger de billetera no haya quedado desactivado por el 07.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_debit_wallet'
       AND tgrelid = 'message_logs'::regclass
       AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION '99 FALLO: trg_debit_wallet sigue DESACTIVADO. Reactivalo: ALTER TABLE message_logs ENABLE TRIGGER trg_debit_wallet;';
  END IF;

  RAISE NOTICE 'OK 99: no queda ni una fila de Sushi Fun. La base volvio al estado previo al 01.';
END $ver$;

COMMIT;
