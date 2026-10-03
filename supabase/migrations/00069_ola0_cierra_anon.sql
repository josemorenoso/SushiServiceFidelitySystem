-- ═══════════════════════════════════════════════════════════════════════════
-- 00069 — Ola 0: nada de `public` abierto a la anon key
-- 2026-10-03
--
--   1. AISLA-2: `aios_attach_zernio_account` y `aios_list_locations`, cerradas
--      a `anon`/`authenticated` y abiertas solo a `aios_constelarys`.
--   2. El barrido: TODA función SECURITY DEFINER de `public` pierde el EXECUTE
--      de PUBLIC, `anon` y `authenticated`, salvo los cuatro helpers de RLS.
--   3. OPUS-4: las cinco políticas `service_role_*` de la 00015, borradas.
--   4. Verificación: si algo quedó abierto, la migración FALLA y lo nombra.
--
-- POR QUÉ
--   La 00067 (`:92`) y la 00057 (`:126`) revocaron EXECUTE solo `FROM PUBLIC`.
--   En Supabase toda función nueva de `public` nace además con un EXECUTE
--   NOMINAL para `anon` y `authenticated` (privilegios por defecto del
--   proyecto; `tests/setup/bootstrap.sql` los imita), y ése no lo quita un
--   REVOKE de PUBLIC. Con la anon key —que viaja en el JS público— cualquiera
--   llamaba `POST /rest/v1/rpc/aios_attach_zernio_account` y reescribía los
--   `zernio_*` de cualquier marca en Twilio sabiendo solo su slug (= su
--   subdominio); la 00057 dejaba leer las sedes de cualquier marca. Es el
--   mismo agujero que la 00038 (bloque 10) tuvo que cerrar en las del AIOS de
--   la 00036. Por eso el bloque 2 no enumera funciones: barre todas, y
--   `tests/db/ola0-seguridad.test.ts` falla si una futura se olvida del REVOKE.
--
--   La 00015 crea políticas `USING (true)` / `WITH CHECK (true)` SIN
--   `TO service_role`: valen para todos los roles. Aplicada EN ORDEN no hace
--   daño (la 00026 borra todas las políticas de `customers` y `visits`), pero
--   pegada DESPUÉS de la 00026 —«aplicar todas las pendientes», 2026-09-29—
--   abre clientes y visitas de TODAS las marcas a la anon key. El service role
--   no las necesita: se salta RLS.
--
-- LOS CUATRO QUE QUEDAN ABIERTOS, Y POR QUÉ
--   `is_super_admin()`, `can_see_location(uuid)`, `current_dashboard_user_id()`
--   y `tenant_active_location_count(uuid)` (00040, 00045). Las políticas se
--   evalúan COMO el rol que consulta: sin EXECUTE, cada SELECT del panel daría
--   42501. Solo leen el JWT de quien llama o cuentan sedes activas. Agregar
--   otra a esa lista es una decisión de seguridad.
--
-- LO QUE NO SE TOCA
--   · `service_role` y `aios_constelarys`: sus GRANT nominales quedan como
--     estaban (toda llamada `.rpc()` de la app va con la service role; el AIOS,
--     con `aios_constelarys`, y cada función que llama tiene su GRANT).
--   · Las funciones `event_trigger` (p. ej. `rls_auto_enable()`, que crea
--     Supabase): no se pueden llamar como RPC y no son nuestras.
--   · Las que pertenecen a una extensión.
--   · Un trigger no necesita EXECUTE del que dispara: Postgres no lo mira al
--     ejecutarlo (la 00041, la 00045 y la 00051 ya revocan así los suyos).
--
-- IDEMPOTENTE
--   Corre igual sobre una base donde el dueño ya pegó a mano el SQL del
--   prompt de la ola 0 (REVOKE/GRANT de las dos y los DROP POLICY), y corre
--   dos veces seguidas. La prueba lo hace las dos cosas.
--
-- RIESGO
--   BAJO: solo quita EXECUTE a roles que no deberían tenerlo. Si en
--   producción hubiera una SECURITY DEFINER que el editor SQL no puede
--   revocar (no es su dueño), el bloque 4 falla y la nombra: nada queda a medias.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- 1. AISLA-2, por nombre (lo mismo que el SQL del prompt de la ola 0)
-- ───────────────────────────────────────────────
DO $$
DECLARE
  v_fn text;
  v_aios boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys');
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.aios_attach_zernio_account(text, text, text, text)',
    'public.aios_list_locations(text)'
  ]
  LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE NOTICE '00069: % no existe (¿falta su migración?), nada que cerrar.', v_fn;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    IF v_aios THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO aios_constelarys', v_fn);
    END IF;
  END LOOP;
END $$;

-- ───────────────────────────────────────────────
-- 2. El barrido: toda SECURITY DEFINER de `public`, salvo los helpers de RLS
-- ───────────────────────────────────────────────
DO $$
DECLARE
  v_fn regprocedure;
  v_n  integer := 0;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND p.prorettype <> 'event_trigger'::regtype
       AND NOT EXISTS (
             SELECT 1 FROM pg_depend d
              WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
       AND p.proname || '(' || oidvectortypes(p.proargtypes) || ')' <> ALL (ARRAY[
             'is_super_admin()',
             'can_see_location(uuid)',
             'current_dashboard_user_id()',
             'tenant_active_location_count(uuid)'
           ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE '00069: % funciones SECURITY DEFINER cerradas a PUBLIC, anon y authenticated.', v_n;
END $$;

-- ───────────────────────────────────────────────
-- 3. OPUS-4: las cinco políticas de la 00015
-- ───────────────────────────────────────────────
DROP POLICY IF EXISTS "service_role_select_customers" ON customers;
DROP POLICY IF EXISTS "service_role_insert_customers" ON customers;
DROP POLICY IF EXISTS "service_role_update_customers" ON customers;
DROP POLICY IF EXISTS "service_role_select_visits"    ON visits;
DROP POLICY IF EXISTS "service_role_insert_visits"    ON visits;

-- ───────────────────────────────────────────────
-- 4. Verificación: si algo sigue abierto, FALLA (y se deshace todo)
-- ───────────────────────────────────────────────
-- A diferencia de las verificaciones con NOTICE de otras migraciones, ésta
-- aborta: la migración existe para garantizar este invariante, y un «OK» con
-- una función abierta sería peor que no haberla corrido.
DO $$
DECLARE
  v_abiertas text;
  v_politicas text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1)
    INTO v_abiertas
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND p.prorettype <> 'event_trigger'::regtype
     AND NOT EXISTS (
           SELECT 1 FROM pg_depend d
            WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
     AND p.proname || '(' || oidvectortypes(p.proargtypes) || ')' <> ALL (ARRAY[
           'is_super_admin()',
           'can_see_location(uuid)',
           'current_dashboard_user_id()',
           'tenant_active_location_count(uuid)'
         ])
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  SELECT string_agg(tablename || '.' || policyname, ', ' ORDER BY 1)
    INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('customers', 'visits')
     AND policyname IN ('service_role_select_customers', 'service_role_insert_customers',
                        'service_role_update_customers', 'service_role_select_visits',
                        'service_role_insert_visits');

  IF v_abiertas IS NOT NULL THEN
    RAISE EXCEPTION '00069: siguen ejecutables por anon/authenticated: %. '
      'Probablemente el editor SQL no es su dueño (pg_get_userbyid(proowner) en pg_proc lo dice): '
      'revocar a mano con REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated, o con su dueño.', v_abiertas;
  END IF;
  IF v_politicas IS NOT NULL THEN
    RAISE EXCEPTION '00069: siguen las políticas de la 00015: %', v_politicas;
  END IF;
  RAISE NOTICE '00069: OK — ninguna SECURITY DEFINER abierta fuera de los helpers de RLS, y sin políticas de la 00015.';
END $$;
