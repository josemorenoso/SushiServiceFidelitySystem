-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00040: is_super_admin() pasa a SECURITY DEFINER
-- Fecha: 2026-09-01
-- Descripción: Versiona un cambio que hasta hoy SOLO existía aplicado A MANO
--   sobre la base de producción. Sin esta migración, cualquier reconstrucción
--   de la base desde `supabase/migrations/` deja el AIOS Constelarys roto con
--   un `42501 permission denied for schema auth` que no apunta a ningún lado.
--
-- ─── El mecanismo, verificado contra la base el 2026-09-01 ──────
--
--   1. `is_super_admin()` (migración 00024) llama a `auth.jwt()`.
--   2. El rol `aios_constelarys` (migración 00035 v2) NO tiene USAGE sobre el
--      schema `auth`. Comprobado:
--        SELECT has_schema_privilege('aios_constelarys','auth','USAGE') -- false
--        SELECT auth.jwt();                                            -- 42501
--   3. `tenants` tiene RLS activo y el rol NO es su dueño ni tiene BYPASSRLS
--      (rolsuper=false, rolbypassrls=false, sin membresías), así que sus
--      SELECT SÍ evalúan las policies.
--   4. Sobre `tenants` hay DOS policies permisivas, que Postgres combina con OR:
--        aios_constelarys_select_tenants  USING (true)              -- 00035 v2
--        super_admin_all_tenants          USING (is_super_admin())  -- 00024
--      Que la primera sea `true` NO salva a la segunda: Postgres no garantiza
--      cortocircuitar el OR, y al evaluar `is_super_admin()` en el contexto del
--      rol que llama, `auth.jwt()` revienta con 42501 — y se cae el SELECT
--      entero, aunque la otra policy lo habría permitido.
--
--   Con SECURITY DEFINER la función corre como su dueño (`postgres`), que sí
--   alcanza el schema `auth`, y la policy devuelve `false` sin explotar.
--
-- ─── Por qué es seguro ──────────────────────────────────────────
--
--   `auth.jwt()` lee `current_setting('request.jwt.claims', true)`, que es un
--   ajuste de SESIÓN, no un permiso del rol. Correr como `postgres` devuelve
--   EXACTAMENTE los mismos claims del que llama: la función sigue respondiendo
--   por el JWT del usuario, no por el del dueño. No hay escalada — lo único que
--   cambia es que deja de necesitar permiso sobre el schema para leer un valor
--   que ya era suyo. Es el patrón estándar de Supabase para helpers de RLS.
--
--   `search_path` fijo es OBLIGATORIO en SECURITY DEFINER: sin él, alguien con
--   permiso de crear objetos podría colar un `jwt()` propio en un schema
--   anterior en el path y secuestrar la función. Se fija a `pg_catalog, public`
--   — el mismo valor que ya tiene la base en producción. `auth.jwt()` va
--   calificado con su schema, así que no necesita `auth` en el path.
--
-- Riesgo: BAJO. `CREATE OR REPLACE` conserva dueño y GRANTs existentes, y el
--   cuerpo es idéntico al de la 00024. Para las bases donde el ALTER ya se
--   aplicó a mano (producción hoy) esto es un no-op.
--
-- ⚠️ NO se otorga ni revoca NADA acá. El EXECUTE por defecto a PUBLIC tiene que
--   seguir: las policies de RLS de `tenants`, `tenant_wallet_transactions`,
--   `reward_grants`, `review_events`, `send_queue` y compañía llaman a esta
--   función en el contexto de `anon` y `authenticated`. Un REVOKE acá dejaría
--   sin leer a la app entera.
--
-- Dependencias: 00024 (define is_super_admin), 00035 v2 (crea el rol
--   aios_constelarys y su policy sobre tenants).
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. La función, con el MISMO cuerpo de la 00024 ─────────────
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin',
    false
  )
$$;

COMMENT ON FUNCTION is_super_admin() IS
  'Helper de RLS: true si el JWT del que llama trae app_metadata.role = super_admin. '
  'SECURITY DEFINER (migración 00040) para que los roles sin USAGE sobre el schema auth '
  '—en concreto aios_constelarys— puedan evaluar las policies que la invocan sin un 42501.';

-- ─── 2. Verificación ────────────────────────────────────────────
DO $$
DECLARE
  v_secdef  boolean;
  v_config  text[];
BEGIN
  SELECT p.prosecdef, p.proconfig
    INTO v_secdef, v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_super_admin';

  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'FALLO: is_super_admin() no existe — falta aplicar la 00024';
  END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'FALLO: is_super_admin() NO quedó en SECURITY DEFINER';
  END IF;
  IF v_config IS NULL OR NOT (v_config::text LIKE '%search_path%') THEN
    RAISE EXCEPTION 'FALLO: is_super_admin() quedó SECURITY DEFINER SIN search_path fijo';
  END IF;

  RAISE NOTICE 'OK: is_super_admin() SECURITY DEFINER, config = %', v_config;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- ⚠️ DEUDA CONOCIDA QUE ESTA MIGRACIÓN **NO** TOCA
--
-- `current_tenant_id()` (00024) tiene EXACTAMENTE el mismo defecto y sigue sin
-- arreglar — verificado el 2026-09-01 contra producción:
--
--   SELECT current_tenant_id();   -- 42501 permission denied for schema auth
--
-- Hoy no rompe nada porque las DOS únicas tablas que el AIOS lee
-- (`tenants`, `tenant_wallet_transactions`) tienen policies que solo llaman a
-- `is_super_admin()`. Pero el patrón dominante del resto del esquema es
-- `USING (tenant_id = current_tenant_id() OR is_super_admin())`: el día que
-- alguien le agregue a una de esas tablas una policy `aios_constelarys_select_*`
-- para que el panel la lea, la lectura va a morir con el mismo 42501 silencioso
-- que esta migración acaba de documentar.
--
-- NO se cambia acá a propósito: tocar `current_tenant_id()` altera cómo se
-- evalúa el RLS de CADA tabla multitenant del producto, y eso es una decisión
-- del dueño con su propia verificación, no un efecto colateral de versionar un
-- ALTER que ya estaba aplicado. Ver docs/03-security.md.
-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00040
-- ═══════════════════════════════════════════════════════════════
