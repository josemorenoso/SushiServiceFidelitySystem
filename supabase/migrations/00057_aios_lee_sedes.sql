-- ═══════════════════════════════════════════════════════════════════════════
-- 00057 — El AIOS puede LEER las sedes: `aios_list_locations()`
-- 2026-09-08
--
-- QUÉ PASA HOY
--   El AIOS lee `restaurant_locations` para verificar que el subdominio de una
--   sede es de ese negocio, y el producto le contesta:
--
--       ERROR 42501: permission denied for schema auth
--
--   Con eso, el paso 3 del alta («Verificar el subdominio») falla en TODO negocio
--   con dos locales. Lo destapó Tepuy.
--
-- POR QUÉ, EXACTAMENTE
--   No falta el GRANT: la `00056` ya le dio a `aios_constelarys` un SELECT por
--   columnas y su propia policy `USING (true)`. Lo que falla es **evaluar las
--   OTRAS policies** de la tabla: las de la `00026` se crearon **sin cláusula
--   `TO`**, así que aplican a `PUBLIC` —el rol del AIOS incluido— y su `USING`
--   llama a `current_tenant_id()` (`00024:32`), que es `LANGUAGE sql STABLE`,
--   **no** `SECURITY DEFINER`, y por dentro hace `auth.jwt()`. Sin `USAGE` sobre
--   el esquema `auth`, Postgres revienta ahí y ni llega a la policy del AIOS.
--
-- ⚠️ POR QUÉ NO SE ARREGLA CON UN GRANT (intento fallido del mismo día)
--   La primera versión de esta migración hacía
--   `GRANT USAGE ON SCHEMA auth TO aios_constelarys`. **No funciona en Supabase**:
--   el esquema `auth` es de `supabase_auth_admin`, y un GRANT que el ejecutor no
--   tiene derecho a otorgar sale como **WARNING, no como ERROR** — se ve exitoso
--   y no hace nada. Lo cazó la verificación (`has_schema_privilege` seguía en
--   false). Queda escrito acá porque es una trampa que vuelve: en este proyecto
--   nada se da por hecho porque el motor no se haya quejado.
--
-- ⚠️ Y POR QUÉ TAMPOCO SE TOCA `current_tenant_id()`
--   Volverla `SECURITY DEFINER` arreglaría esto y de paso cualquier otra lectura,
--   pero esa función la evalúa **cada policy del sistema**: cambiarle el modo de
--   ejecución por un permiso del AIOS es mover el suelo de todo el aislamiento
--   por un problema de una esquina.
--
-- QUÉ TRAE
--   `aios_list_locations(p_tenant_slug)` — SECURITY DEFINER, como
--   `aios_health()` (00053), `aios_add_location()` (00056) y todo lo que el AIOS
--   ya usa. Corre como su dueño, así que ni pasa por las policies ni necesita
--   permiso sobre `auth`. Devuelve las MISMAS columnas que el GRANT de la 00056
--   ya autorizaba — `config` sigue FUERA, que es el espacio de override por sede
--   y el AIOS no tiene por qué verlo.
--
-- RIESGO: BAJO. No toca ni una fila, ni una policy, ni un GRANT existente.
--   Agrega una función de solo lectura y su EXECUTE.
--
-- Orden: 00035 (el rol) y 00041 (slug/domain en la sede) antes. Bloque 0.
--
-- Rollback:  DROP FUNCTION IF EXISTS aios_list_locations(text);
--            (el AIOS vuelve a no poder verificar subdominios de sede)
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- 0. Guarda de dependencia — fallar temprano y nombrando qué falta
-- ───────────────────────────────────────────────
DO $$
DECLARE
  v_falta text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.restaurant_locations') IS NULL THEN
    v_falta := v_falta || 'restaurant_locations (tabla)';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'restaurant_locations'
       AND column_name = 'domain'
  ) THEN
    v_falta := v_falta || 'restaurant_locations.domain (falta la 00041)';
  END IF;

  IF array_length(v_falta, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00057 no se puede aplicar, falta: %', array_to_string(v_falta, ', ');
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- 1. La función
-- ───────────────────────────────────────────────
-- Mismo orden que `getActiveLocations()` del producto y que el SELECT que el
-- AIOS hacía a mano: la principal primero, después `sort_order`, `name` de
-- desempate. Que los dos listen igual es lo que hace comparables sus pantallas.
CREATE OR REPLACE FUNCTION aios_list_locations(p_tenant_slug text)
RETURNS TABLE (
  id          uuid,
  name        text,
  slug        text,
  domain      text,
  address     text,
  is_active   boolean,
  is_primary  boolean,
  sort_order  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT l.id, l.name, l.slug, l.domain, l.address,
         l.is_active, l.is_primary, l.sort_order
    FROM restaurant_locations l
    JOIN tenants t ON t.id = l.tenant_id
   WHERE t.slug = p_tenant_slug
   ORDER BY l.is_primary DESC, l.sort_order ASC, l.name ASC;
$fn$;

COMMENT ON FUNCTION aios_list_locations(text) IS
  'Las sedes de una marca, para el AIOS. SECURITY DEFINER porque el rol '
  'aios_constelarys no puede evaluar las policies de la 00026 (llaman a '
  'current_tenant_id() → auth.jwt(), y no tiene USAGE sobre el esquema auth). '
  'NO devuelve `config`: es el espacio de override por sede y el AIOS no lo ve.';

-- ───────────────────────────────────────────────
-- 2. El permiso, solo para el rol del AIOS
-- ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    RAISE NOTICE '00057: el rol aios_constelarys no existe (falta la 00035). La función queda creada; el GRANT, pendiente.';
    RETURN;
  END IF;

  -- `REVOKE ... FROM PUBLIC` primero: una función SECURITY DEFINER nace
  -- ejecutable por todo el mundo, y esta lee sedes de CUALQUIER marca por slug.
  -- Solo el rol del AIOS tiene por qué llamarla.
  EXECUTE 'REVOKE EXECUTE ON FUNCTION aios_list_locations(text) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION aios_list_locations(text) TO aios_constelarys';
  RAISE NOTICE '00057: aios_list_locations() creada y otorgada a aios_constelarys.';
END $$;

-- ───────────────────────────────────────────────
-- 3. Verificación
-- ───────────────────────────────────────────────
DO $$
DECLARE
  v_falta text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.proname = 'aios_list_locations' AND p.prosecdef
  ) THEN
    v_falta := v_falta || 'aios_list_locations() SECURITY DEFINER';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    -- El GRANT de verdad, no el que "no dio error": lo mismo que destapó el
    -- intento fallido del GRANT sobre el esquema auth.
    IF NOT has_function_privilege(
             'aios_constelarys', 'aios_list_locations(text)', 'EXECUTE') THEN
      v_falta := v_falta || 'EXECUTE de aios_list_locations() para aios_constelarys';
    END IF;

    -- Y que la puerta siga cerrada para el resto.
    IF has_function_privilege('public', 'aios_list_locations(text)', 'EXECUTE') THEN
      v_falta := v_falta || 'PUBLIC NO debería poder ejecutar aios_list_locations()';
    END IF;
  END IF;

  IF array_length(v_falta, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00057 ABORTADA: %', array_to_string(v_falta, ', ');
  END IF;

  RAISE NOTICE '00057 OK: el AIOS lee las sedes por función, sin tocar el esquema auth.';
END $$;
