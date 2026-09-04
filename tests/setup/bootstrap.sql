-- ═══════════════════════════════════════════════════════════════
-- Bootstrap: el "trozo de Supabase" que las migraciones dan por hecho
-- ═══════════════════════════════════════════════════════════════
--
-- Se aplica ANTES de 00001 sobre un Postgres vainilla. NO es una migración del
-- producto y NUNCA debe aplicarse en Supabase: allí todos estos objetos ya
-- existen, con implementaciones reales.
--
-- Sale de auditar los 37 archivos de supabase/migrations. La cadena completa
-- depende de MUY POCOS objetos propios de Supabase, y son estos:
--
--   auth.role()        — 00001:62 y 23 usos más. Aunque 00026 borra después
--                        todas esas políticas, la expresión tiene que PARSEAR
--                        en el CREATE POLICY, así que debe existir desde antes
--                        de 00001.
--   auth.jwt()         — 00024:36 y :44, dentro de current_tenant_id() e
--                        is_super_admin(). Es la dependencia DURA: esas dos son
--                        LANGUAGE sql, y Postgres SÍ valida el cuerpo de una
--                        función sql al crearla.
--   auth.users         — 00028:56, único uso en toda la cadena.
--   storage.buckets    — 00012:152, único archivo que toca storage.
--   storage.objects
--   roles anon /       — 00037:533 (REVOKE UPDATE, DELETE ON consent_events).
--   authenticated        Único sitio donde se usan como ROLES de verdad.
--
-- NO hacen falta: auth.uid() (cero usos), pgcrypto ni uuid-ossp (gen_random_uuid()
-- es core desde PG 13), pg_cron, pg_net, vault, realtime, ni el rol service_role
-- (a pesar del nombre de 00015, ninguna política lo nombra).
-- ═══════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS auth;

-- Stub de auth.jwt(). Devuelve lo que se haya puesto en `request.jwt.claims`,
-- que es exactamente el mecanismo que usa PostgREST en producción. Gracias a
-- eso una prueba puede simular un JWT concreto con:
--     SET LOCAL request.jwt.claims = '{"tenant_id":"..."}';
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'anon')
$$;

-- Solo se necesita la columna que toca 00028:56. La tabla queda vacía: ese
-- UPDATE afecta 0 filas y no falla.
CREATE TABLE IF NOT EXISTS auth.users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_app_meta_data jsonb
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  -- Ninguna migración lo pide, pero existe en Supabase y tenerlo permite
  -- probar el aislamiento por RLS con SET ROLE sin sorpresas.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Privilegios por defecto de Supabase — SIN ESTO LAS PRUEBAS MIENTEN
-- ═══════════════════════════════════════════════════════════════
-- Todo proyecto Supabase trae configurado, de fábrica:
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON TABLES/FUNCTIONS/SEQUENCES TO postgres, anon, authenticated, service_role;
--
-- O sea: cada función creada en `public` desde el SQL Editor nace con un GRANT
-- EXECUTE **nominal** a `anon` y `authenticated`, además del EXECUTE que
-- Postgres concede a PUBLIC.
--
-- Eso hace que `REVOKE ALL ... FROM PUBLIC` **no baste**: quita el privilegio de
-- PUBLIC y deja intactos los nominales. Sin replicar esto aquí, una prueba de
-- permisos pasa en local y el agujero sigue abierto en producción — que es
-- exactamente lo que pasó con el primer intento del bloque 13 de 00037.
--
-- La evidencia de que en esta base esos roles SÍ tienen grants nominales está
-- en el propio repo: 00037:533 hace `REVOKE UPDATE, DELETE ON consent_events
-- FROM authenticated, anon`, una línea que sería un no-op si no los tuvieran.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Todo proyecto Supabase real concede USAGE sobre `auth` a `anon` y
-- `authenticated` de fábrica — es lo que permite que una policy de RLS llame
-- `auth.jwt()`/`auth.uid()` evaluándose COMO esos roles. Sin este GRANT, un
-- `SET ROLE authenticated` seguido de una lectura real (no a través de un
-- helper SECURITY DEFINER) revienta con "permission denied for schema auth" —
-- el mismo 42501 que `docs/03-security.md` documenta para `aios_constelarys`,
-- pero aquí sería un falso positivo del arnés, no del esquema: en producción
-- `authenticated` SÍ puede.
--
-- `docs/features/testing.md` § "Lo que estas pruebas NO cubren" ya avisaba de
-- este hueco: "el stub de auth.jwt() del bootstrap está escrito para
-- permitirlo, pero todavía no hay pruebas que lo usen" (multi-sede F7,
-- `tests/db/multisede-permisos.test.ts`, es la primera).
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id     text PRIMARY KEY,
  name   text,
  public boolean
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name      text
);
-- 00012:165-215 crea políticas sobre storage.objects; sin RLS habilitado
-- Postgres las acepta igual, pero así el estado se parece al real.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
