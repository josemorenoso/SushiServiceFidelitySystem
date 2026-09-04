-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00045: Permisos de sede del dashboard (D10)
-- Fecha: 2026-09-03
-- Spec: docs/superpowers/specs/2026-09-02-multisede-design.md §5.1, §5.2 (F7)
-- Feature: docs/features/multi-sede.md — cierra la deuda #16
--
-- QUÉ HACE
-- ────────
--   1. `dashboard_user_locations (user_id, tenant_id, location_id, role)`: el
--      alcance de sede de cada usuario del panel.
--   2. Tres helpers de RLS, todos SECURITY DEFINER con `search_path` fijo:
--      `current_dashboard_user_id()`, `tenant_active_location_count()` y
--      `can_see_location(uuid)`.
--   3. El trigger que estampa `role='brand'` a los usuarios que YA existen en el
--      instante en que nace la segunda sede activa de su marca.
--   4. Una policy RESTRICTIVE por cada tabla que tenga `location_id`,
--      autodescubierta por catálogo.
--
-- POR QUÉ UNA TABLA Y NO UN CLAIM DEL JWT (§5.1)
-- ──────────────────────────────────────────────
-- El `tenant_id` del JWT hoy se escribe A MANO con un `UPDATE` sobre `auth.users`
-- (00028:56-60); no hay Auth Hook, así que cada cambio exige re-login. Un claim de
-- sede heredaría los tres problemas —se escribe a mano, tarda un re-login, y un
-- usuario mal aprovisionado sería indistinguible de un admin legítimo— y además el
-- RLS no lo podría leer sin volver a `auth.jwt()`. Una tabla se corrige en caliente
-- y es legible desde SQL, que es justo lo que el RLS necesita.
--
-- EL FAIL-SAFE, RECALIBRADO — la tabla literal del §5.1
-- ────────────────────────────────────────────────────
--   │ Sin fila y el tenant tiene ≤1 sede activa │ Ve la marca (= su única sede) │
--   │ Sin fila y el tenant tiene ≥2 sedes activas │ 403                         │
--   │ `role='brand'`                            │ todas las sedes + "Sin sede"  │
--   │ `role='location'`                         │ solo esas sedes, NUNCA NULL   │
--
-- Un fail-safe absoluto ("sin fila, nada") dejaría fuera a los admins de los 4
-- tenants vivos EL DÍA DEL DESPLIEGUE. Un fail-open absoluto es el agujero. La
-- salida es notar que la ausencia solo es AMBIGUA cuando hay más de una sede: con
-- una sola, "la marca" y "mi sede" son exactamente el mismo conjunto de filas.
-- El trigger del bloque 4 hace que el 403 sea la RED y no el camino normal.
--
-- RIESGO: BAJO. Crea una tabla nueva (nace vacía), tres funciones nuevas, un
--   trigger nuevo y policies RESTRICTIVE nuevas. NO borra, NO reescribe y NO
--   parsea ninguna policy existente, así que `aios_constelarys_select_*` (00035),
--   `super_admin_all_*` (00024/00027) y las 18 `tenant_all_*` (00026) sobreviven
--   intactas.
-- REVERSIBLE: sí — `DROP POLICY` de las `sede_visible_*`, `DROP TRIGGER`,
--   `DROP FUNCTION` de las tres y `DROP TABLE dashboard_user_locations`.
-- ORDEN: después de la 00044. La 00044 va ANTES en producción, no solo en el repo:
--   sin ella `staff_users`/`staff_devices` no tienen `location_id` y el bloque 5
--   simplemente no las descubre (no falla — no las toca).
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 0. Guarda de dependencia
-- ─────────────────────────────────────────────────────────────
-- Sin la 00041 no existe `restaurant_locations_id_tenant_key` y el ADD CONSTRAINT
-- del bloque 1 fallaría con un 42830 críptico ("no unique constraint matching
-- given keys"). Fallar acá nombra el archivo que falta.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'restaurant_locations_id_tenant_key'
       AND conrelid = 'public.restaurant_locations'::regclass
  ) THEN
    RAISE EXCEPTION
      '00045 requiere la 00041: falta restaurant_locations_id_tenant_key, el índice único que soporta la FK compuesta (location_id, tenant_id).';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 1. La tabla
-- ─────────────────────────────────────────────────────────────
-- `location_id` NULLABLE con FK COMPUESTA `(location_id, tenant_id)` y
-- ON DELETE RESTRICT — la regla transversal de multi-sede, sin excepción. Una FK
-- simple sobre `id` a secas dejaría darle a un admin de la marca A permiso sobre
-- una sede de la marca B, y el motor no diría nada: el aislamiento del producto NO
-- lo da el RLS (55 archivos corren con `service_role`), lo dan los filtros a mano
-- y las FK compuestas.
--
-- `role`:
--   'brand'    → toda la marca. `location_id` DEBE ser NULL: nombrar una sede en
--                una fila de marca son dos verdades a la vez.
--   'location' → esa sede y solo esa. `location_id` DEBE venir. Un usuario de sede
--                se representa con N filas 'location', una por sede.
--
-- `tenant_id` EXPLÍCITO en todo INSERT: la 00030 nunca se aplicó y el DEFAULT
-- puente de la 00028 sigue mandando a Sushi Service lo que se olvide de pasarlo.
-- Esta tabla nace SIN ese DEFAULT, así que un INSERT sin `tenant_id` falla con
-- 23502 en vez de irse calladito al tenant equivocado.
CREATE TABLE IF NOT EXISTS dashboard_user_locations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id   uuid        NOT NULL REFERENCES tenants (id)    ON DELETE CASCADE,
  location_id uuid        NULL,
  role        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'dashboard_user_locations_role_check'
       AND conrelid = 'public.dashboard_user_locations'::regclass
  ) THEN
    ALTER TABLE dashboard_user_locations
      ADD CONSTRAINT dashboard_user_locations_role_check
      CHECK (role IN ('brand', 'location'));
  END IF;

  -- El par role↔location_id, igual que `restaurant_events_audience_pareja_check`
  -- (00043): el alcance es EXPLÍCITO, nunca deducido de un NULL.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'dashboard_user_locations_pareja_check'
       AND conrelid = 'public.dashboard_user_locations'::regclass
  ) THEN
    ALTER TABLE dashboard_user_locations
      ADD CONSTRAINT dashboard_user_locations_pareja_check
      CHECK (
        (role = 'brand'    AND location_id IS NULL)
        OR
        (role = 'location' AND location_id IS NOT NULL)
      );
  END IF;

  -- La FK COMPUESTA. ON DELETE RESTRICT, nunca SET NULL: degradar un permiso de
  -- sede a permiso de marca al desactivar una sede sería una AMPLIACIÓN silenciosa
  -- de privilegios. Una sede no se borra, se desactiva (`is_active = false`).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'dashboard_user_locations_location_id_tenant_fkey'
       AND conrelid = 'public.dashboard_user_locations'::regclass
  ) THEN
    ALTER TABLE dashboard_user_locations
      ADD CONSTRAINT dashboard_user_locations_location_id_tenant_fkey
      FOREIGN KEY (location_id, tenant_id)
      REFERENCES public.restaurant_locations (id, tenant_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ─── Índices ───
-- Sin CONCURRENTLY: el arnés de tests manda el archivo entero en un solo
-- `client.query()`, que el protocolo simple envuelve en transacción implícita, y
-- `CREATE INDEX CONCURRENTLY` moriría ahí con 25001. La tabla nace vacía.

-- Una sola fila de marca por (usuario, tenant). Parcial porque en un UNIQUE normal
-- los NULL son distintos entre sí y un usuario podría acumular 5 filas 'brand'.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_user_locations_brand
  ON dashboard_user_locations (user_id, tenant_id)
  WHERE location_id IS NULL;

-- Una sola fila por (usuario, tenant, sede).
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_user_locations_sede
  ON dashboard_user_locations (user_id, tenant_id, location_id)
  WHERE location_id IS NOT NULL;

-- El índice que la FK compuesta necesita: Postgres indexa el lado REFERENCIADO,
-- nunca el que referencia. Sin esto, cada intento de desactivar/borrar una sede
-- haría un seq scan para comprobar el RESTRICT. Parcial por el mismo motivo que
-- los 15 de la 00043.
CREATE INDEX IF NOT EXISTS idx_dashboard_user_locations_tenant_location
  ON dashboard_user_locations (tenant_id, location_id)
  WHERE location_id IS NOT NULL;

-- La lectura caliente: "¿qué alcance tiene este usuario en esta marca?"
CREATE INDEX IF NOT EXISTS idx_dashboard_user_locations_user_tenant
  ON dashboard_user_locations (user_id, tenant_id);

COMMENT ON TABLE dashboard_user_locations IS
  'D10: alcance de sede de cada usuario del dashboard. NO es un claim del JWT a propósito '
  '(§5.1 del spec de multi-sede): el JWT se escribe a mano y exige re-login. Sin fila el '
  'usuario ve la marca si el tenant tiene ≤1 sede activa, y recibe 403 si tiene ≥2.';

-- ─────────────────────────────────────────────────────────────
-- 2. Los helpers de RLS
-- ─────────────────────────────────────────────────────────────
-- Los tres nacen SECURITY DEFINER con `search_path` fijo. Es exactamente lo que le
-- FALTA a `current_tenant_id()` (00024) y por lo que el rol `aios_constelarys`
-- revienta con `42501 permission denied for schema auth` — ver
-- `docs/03-security.md` § "Helpers de RLS y el rol del AIOS Constelarys".
--
-- ⚠️⚠️ NO SE LES REVOCA EL EXECUTE A PUBLIC. Las policies del bloque 5 las invocan
--    en el contexto de `anon` y `authenticated`; un `REVOKE` acá deja sin leer a la
--    app entera. Es la regla nº2 de `docs/03-security.md` y el motivo por el que la
--    00040 no revoca nada sobre `is_super_admin()`. El único REVOKE de este archivo
--    es sobre la función de TRIGGER del bloque 4, que ninguna policy invoca.

-- El `sub` del JWT es el `auth.users.id` del que llama: es lo mismo que devuelve
-- `auth.uid()` en Supabase. Se lee de `auth.jwt()` y no de `auth.uid()` a propósito:
-- `auth.uid()` NO tiene ningún uso en las 44 migraciones y el bootstrap de tests
-- (`tests/setup/bootstrap.sql`) por eso no lo stubbea. Usar `auth.jwt()` reutiliza
-- el único stub que ya existe y evita tocar el arnés.
CREATE OR REPLACE FUNCTION current_dashboard_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
$$;

COMMENT ON FUNCTION current_dashboard_user_id() IS
  'Helper de RLS (00045): el auth.users.id del JWT que llama, o NULL. Equivale a auth.uid(); '
  'se lee de auth.jwt() porque es el único objeto de `auth` que el arnés de tests stubbea.';

-- Cuántas sedes ACTIVAS tiene una marca. Es el umbral del fail-safe: con ≤1, la
-- ausencia de fila no es ambigua.
CREATE OR REPLACE FUNCTION tenant_active_location_count(p_tenant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT count(*)::integer
    FROM public.restaurant_locations
   WHERE tenant_id = p_tenant_id
     AND is_active = true
$$;

COMMENT ON FUNCTION tenant_active_location_count(uuid) IS
  'Helper de RLS (00045): sedes activas de una marca. SECURITY DEFINER porque '
  'restaurant_locations tiene RLS y el conteo tiene que ser el real, no el visible.';

-- ⚠️ SECURITY DEFINER también porque tiene que contar las sedes REALES. Corriendo
--    con los privilegios del que llama, un usuario de sede solo vería las suyas y
--    "≥2 sedes" se evaluaría contra un universo recortado — justo el error que
--    convertiría el 403 en un fail-open.

-- El corazón del §5.1: las 4 filas de la tabla del fail-safe, en una función.
--
-- ⚠️ `p_location_id IS NULL` significa "sede desconocida" (el cubo "Sin sede"), NO
--    "toda la marca". La única tabla donde NULL significa otra cosa es
--    `restaurant_events`, y por eso el bloque 5 la EXCLUYE explícitamente.
CREATE OR REPLACE FUNCTION can_see_location(p_location_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_tenant   uuid;
  v_user     uuid;
  v_filas    integer;
  v_es_marca boolean;
BEGIN
  -- `current_tenant_id()` (00024) NO es SECURITY DEFINER y revienta con 42501 en
  -- roles sin USAGE sobre `auth`. Llamarla DESDE AQUÍ es seguro: dentro de una
  -- función SECURITY DEFINER el contexto de privilegios es el del dueño mientras
  -- dure la llamada, así que `auth.jwt()` resuelve. Esto NO arregla la deuda de la
  -- 00024 para el resto del esquema — solo para este camino.
  v_tenant := current_tenant_id();
  IF v_tenant IS NULL THEN
    RETURN false;
  END IF;

  v_user := current_dashboard_user_id();
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  SELECT count(*), bool_or(d.role = 'brand')
    INTO v_filas, v_es_marca
    FROM public.dashboard_user_locations d
   WHERE d.user_id   = v_user
     AND d.tenant_id = v_tenant;

  -- Fila 1 y 2 de la tabla: SIN FILA.
  IF v_filas = 0 THEN
    RETURN tenant_active_location_count(v_tenant) <= 1;
  END IF;

  -- Fila 3: role='brand' → todas las sedes Y el cubo "Sin sede".
  IF COALESCE(v_es_marca, false) THEN
    RETURN true;
  END IF;

  -- Fila 4: role='location' → solo esas sedes, y NUNCA las filas con
  -- `location_id IS NULL`. El `IS NOT NULL` no es redundante con el EXISTS: sin él,
  -- `can_see_location(NULL)` compararía NULL = NULL, que es NULL y no true, pero
  -- dejarlo implícito es exactamente el descuido que este comentario evita.
  RETURN p_location_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.dashboard_user_locations d
        WHERE d.user_id     = v_user
          AND d.tenant_id   = v_tenant
          AND d.location_id = p_location_id
     );
END;
$fn$;

COMMENT ON FUNCTION can_see_location(uuid) IS
  'Helper de RLS (00045, D10): las 4 filas del fail-safe del §5.1. Sin fila y ≤1 sede activa '
  '→ true; sin fila y ≥2 → false; role=brand → true siempre (incluido el cubo "Sin sede"); '
  'role=location → solo sus sedes y NUNCA location_id IS NULL.';

-- ─────────────────────────────────────────────────────────────
-- 3. RLS de la propia tabla de permisos
-- ─────────────────────────────────────────────────────────────
-- Va DESPUÉS de los helpers a propósito: Postgres valida la expresión de la
-- policy en el `CREATE POLICY`, así que `current_dashboard_user_id()` tiene que
-- existir ya o el archivo muere con 42883.
--
-- Más estricta que el patrón `tenant_all_*` de la 00026 a propósito: quién manda a
-- quién NO es dato de todos los admins de la marca. Cada quien ve SU alcance; el
-- super-admin ve todo; la escritura va por `service_role`, que salta RLS.
--
-- ⚠️ NO se pone `FORCE ROW LEVEL SECURITY`: `can_see_location()` es SECURITY
--    DEFINER y necesita leer ESTA tabla entera. Con FORCE, ni el dueño la leería y
--    el helper devolvería false para todo el mundo.
ALTER TABLE dashboard_user_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_own_dashboard_user_locations" ON dashboard_user_locations;
CREATE POLICY "tenant_own_dashboard_user_locations" ON dashboard_user_locations FOR ALL
  USING      (is_super_admin() OR (tenant_id = current_tenant_id() AND user_id = current_dashboard_user_id()))
  WITH CHECK (is_super_admin() OR (tenant_id = current_tenant_id() AND user_id = current_dashboard_user_id()));

-- ─────────────────────────────────────────────────────────────
-- 4. El trigger que hace que el 403 sea la RED y no el camino
-- ─────────────────────────────────────────────────────────────
-- En el instante en que nace la SEGUNDA sede activa de una marca, los usuarios que
-- ya existían pasan de "sin fila con 1 sede" (ven la marca) a "sin fila con 2
-- sedes" (403). Este trigger les estampa `role='brand'`, que es exactamente lo que
-- veían el segundo anterior: la marca entera. Sin él, dar de alta la sede 2 dejaría
-- al dueño fuera de su propio panel, en silencio y sin nada que lo explique.
--
-- SECURITY DEFINER porque lee `auth.users`: el rol que inserta la sede (el AIOS con
-- `aios_add_location`, o el `service_role` del wizard de F8) no tiene USAGE sobre
-- el schema `auth`.
--
-- `tenant_id` EXPLÍCITO en el INSERT (`NEW.tenant_id`), nunca por DEFAULT: la 00030
-- sigue sin aplicarse.
CREATE OR REPLACE FUNCTION dashboard_user_locations_estampa_marca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_activas integer;
  v_nuevas  integer;
BEGIN
  v_activas := tenant_active_location_count(NEW.tenant_id);

  -- Con 0 o 1 sede activa no hay nada que estampar: la ausencia de fila NO es
  -- ambigua y el fail-safe ya deja ver la marca. Se comprueba `>= 2` y no `= 2` a
  -- propósito — así el trigger es idempotente y también cubre reactivar una sede
  -- apagada o dar de alta la sede 3, 4, N.
  IF v_activas < 2 THEN
    RETURN NULL;
  END IF;

  -- Solo los usuarios de ESTA marca que NO tienen ninguna fila todavía. El
  -- NOT EXISTS es lo que impide pisar a un usuario al que alguien ya le asignó
  -- `role='location'` a mano: ése no se promueve a marca por dar de alta una sede.
  INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role)
  SELECT u.id, NEW.tenant_id, NULL, 'brand'
    FROM auth.users u
   WHERE u.raw_app_meta_data ->> 'tenant_id' = NEW.tenant_id::text
     AND NOT EXISTS (
       SELECT 1 FROM dashboard_user_locations d
        WHERE d.user_id = u.id AND d.tenant_id = NEW.tenant_id
     )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_nuevas = ROW_COUNT;
  IF v_nuevas > 0 THEN
    RAISE NOTICE '00045: % usuario(s) del tenant % estampados con role=brand al llegar a % sedes activas.',
      v_nuevas, NEW.tenant_id, v_activas;
  END IF;

  RETURN NULL;  -- AFTER trigger: el valor de retorno se ignora.
END;
$fn$;

-- Patrón de blindaje de la 00038/00041: en Supabase las default privileges
-- conceden EXECUTE NOMINAL a `anon` y `authenticated`, así que `REVOKE ... FROM
-- PUBLIC` a secas no basta. Acá SÍ se revoca —al revés que en los tres helpers del
-- bloque 2— porque ninguna policy invoca esta función: solo la llama el trigger.
REVOKE ALL ON FUNCTION dashboard_user_locations_estampa_marca() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_restaurant_locations_estampa_marca ON restaurant_locations;
CREATE TRIGGER trg_restaurant_locations_estampa_marca
  AFTER INSERT OR UPDATE OF is_active, tenant_id ON restaurant_locations
  FOR EACH ROW
  EXECUTE FUNCTION dashboard_user_locations_estampa_marca();

-- ─────────────────────────────────────────────────────────────
-- 5. El RLS, como red barata — policies RESTRICTIVE autodescubiertas
-- ─────────────────────────────────────────────────────────────
-- El aislamiento REAL de F7 está en el tipo `LocationScope` de TypeScript, no acá:
-- verificado que en toda la app hay UNA sola lectura por el camino autenticado
-- (`src/app/api/dashboard/twilio-metrics/route.ts:217`, sobre `customers`, que ni
-- siquiera tiene `location_id`); las otras 55 corren con `service_role`, que se
-- salta el RLS por definición. Poner el permiso solo en RLS daría una sensación de
-- seguridad que 55 archivos desmienten. Esto es la red barata, y hay que decirlo.
--
-- POR QUÉ `AS RESTRICTIVE` Y NO REESCRIBIR LA POLICY EXISTENTE
-- ───────────────────────────────────────────────────────────
-- El spec pide el predicado `is_super_admin() OR (tenant_id = current_tenant_id()
-- AND can_see_location(location_id))`, y que sea un refinamiento ESTRICTO del
-- actual. Postgres combina las permissive con OR y luego les hace AND con las
-- restrictive, así que añadir
--
--     RESTRICTIVE USING (is_super_admin() OR can_see_location(location_id))
--
-- sobre la permissive que ya existe da, por la distributiva:
--
--     (T ∨ S) ∧ (S ∨ C)  ≡  S ∨ (T ∧ C)
--
-- que es LITERALMENTE el predicado pedido, con T = `tenant_id = current_tenant_id()`,
-- S = `is_super_admin()` y C = `can_see_location(location_id)`. Y lo consigue sin
-- DROPear, parsear ni reescribir una sola policy existente. Eso importa por dos
-- motivos concretos:
--
--   · El loop de la 00026 borra TODAS las policies de la tabla por catálogo antes
--     de recrear la suya. Copiar ese gesto acá se llevaría por delante
--     `aios_constelarys_select_wallet_txn` (00035) sobre `tenant_wallet_transactions`
--     y `super_admin_all_wallet_txns` (00027), y el panel del AIOS se quedaría a
--     oscuras sin que nada lo diga. (Corrección al encargo: el loop de 00026:32-52
--     autodescubre POLICIES, no TABLAS — la lista de 18 tablas está escrita a mano.
--     Lo que acá se autodescubre por catálogo son las TABLAS, que es lo que pedía
--     el spec.)
--   · Una policy RESTRICTIVE es matemáticamente incapaz de CONCEDER: solo puede
--     quitar filas. El "no puede conceder más de lo que concede hoy" deja de ser
--     una promesa que hay que revisar a ojo y pasa a ser una propiedad del motor.
--
-- `TO authenticated` y no a todos los roles, también a propósito:
--   · `service_role` se salta el RLS entero — le da igual.
--   · `anon` no tiene `tenant_id` en el JWT, así que la permissive ya lo bloquea.
--   · `aios_constelarys` NO debe entrar acá. Su JWT no tiene `sub` ni `tenant_id`,
--     así que `can_see_location()` le devolvería false y sus dos SELECT
--     (`tenants`, `tenant_wallet_transactions`) se irían a cero filas. Es el mismo
--     modo de fallo silencioso del 42501 que documenta `docs/03-security.md`, por
--     otra puerta.
DO $$
DECLARE
  r        record;
  v_policy text;
  v_cuenta integer := 0;
BEGIN
  FOR r IN
    -- Autodescubrimiento por catálogo: toda tabla BASE de `public` que tenga a la
    -- vez `tenant_id` y una columna llamada EXACTAMENTE `location_id`.
    --
    -- Las tablas cuya columna de sede se llama de otra forma quedan FUERA, y no es
    -- un descuido:
    --   · `customers` (`origin_location_id`, `last_visit_location_id`) — el cliente
    --     es de la MARCA para siempre; ésa es la petición literal del dueño ("que
    --     los clientes conserven su recorrido en las dos sedes"). Filtrarlo por
    --     sede contradiría el pedido, no lo refinaría.
    --   · `reward_grants` (`granted_location_id`) y `reward_redemptions`
    --     (`redeemed_location_id`) — son DOS sedes distintas, dónde se ganó y dónde
    --     se entregó. Cuál de las dos manda para ver la fila es la matriz
    --     origen→destino de D12, que es F6. No se decide desde una red barata.
    --   · `message_logs.line_location_id` — depende de D6, que el dueño no decidió.
    --     La otra columna de esa tabla, `location_id` (la sede del acto), SÍ entra.
    SELECT c.relname AS tabla
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND EXISTS (
         SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
            AND a.attnum > 0 AND NOT a.attisdropped
       )
       AND EXISTS (
         SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid AND a.attname = 'location_id'
            AND a.attnum > 0 AND NOT a.attisdropped
       )
       -- ⚠️ LA EXCEPCIÓN, y la única. En `restaurant_events` un `location_id` NULL
       --    NO significa "sede desconocida": significa "toda la marca", y es
       --    explícito en `audience_scope` (00043). Aplicarle el predicado genérico
       --    escondería los eventos de MARCA a los usuarios de sede — que es al revés
       --    de lo que el calendario tiene que hacer. El alcance de esa tabla lo
       --    resuelve `LocationScope` en TypeScript, que sí sabe leer `audience_scope`.
       AND c.relname <> 'restaurant_events'
     ORDER BY c.relname
  LOOP
    v_policy := 'sede_visible_' || r.tabla;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tabla);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, r.tabla);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING      (is_super_admin() OR can_see_location(location_id)) '
      'WITH CHECK (is_super_admin() OR can_see_location(location_id))',
      v_policy, r.tabla
    );

    v_cuenta := v_cuenta + 1;
  END LOOP;

  RAISE NOTICE '00045: % policies RESTRICTIVE sede_visible_* creadas (tablas con tenant_id + location_id, restaurant_events excluida a propósito).', v_cuenta;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 6. Verificación
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_falta    text := '';
  v_policies integer;
  v_secdef   integer;
BEGIN
  IF to_regclass('public.dashboard_user_locations') IS NULL THEN
    v_falta := v_falta || ' tabla-dashboard_user_locations';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'dashboard_user_locations_location_id_tenant_fkey'
       AND conrelid = 'public.dashboard_user_locations'::regclass
       AND confrelid = 'public.restaurant_locations'::regclass
       AND confdeltype = 'r'   -- 'r' = RESTRICT
  ) THEN
    v_falta := v_falta || ' FK-compuesta-ON-DELETE-RESTRICT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_restaurant_locations_estampa_marca'
       AND tgrelid = 'public.restaurant_locations'::regclass
  ) THEN
    v_falta := v_falta || ' trg_restaurant_locations_estampa_marca';
  END IF;

  -- Los tres helpers TIENEN que ser SECURITY DEFINER con search_path fijo. Sin
  -- `proconfig`, el que pueda crear objetos cuela un `jwt()` propio en un schema
  -- anterior del path y secuestra la función (regla nº1 de docs/03-security.md).
  SELECT count(*) INTO v_secdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('current_dashboard_user_id', 'tenant_active_location_count', 'can_see_location')
     AND p.prosecdef
     AND p.proconfig IS NOT NULL;
  IF v_secdef <> 3 THEN
    v_falta := v_falta || format(' helpers-SECURITY-DEFINER(%s/3)', v_secdef);
  END IF;

  SELECT count(*) INTO v_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND policyname LIKE 'sede_visible_%';
  IF v_policies = 0 THEN
    v_falta := v_falta || ' policies-sede_visible_*';
  END IF;

  -- `restaurant_events` NO puede haber entrado: su NULL significa otra cosa.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND policyname = 'sede_visible_restaurant_events'
  ) THEN
    v_falta := v_falta || ' restaurant_events-NO-debia-entrar';
  END IF;

  IF v_falta <> '' THEN
    RAISE EXCEPTION 'MIGRACIÓN 00045 INCOMPLETA, falta:%', v_falta;
  END IF;

  RAISE NOTICE 'OK 00045: dashboard_user_locations + 3 helpers + trigger de estampado + % policies RESTRICTIVE sede_visible_*.', v_policies;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00045
-- El aislamiento real vive en `src/lib/location-scope.ts` (tipo opaco
-- `LocationScope`): la ruta que se olvide del filtro no compila. Esto es la red.
-- ═══════════════════════════════════════════════════════════════
