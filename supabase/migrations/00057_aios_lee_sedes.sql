-- ═══════════════════════════════════════════════════════════════════════════
-- 00057 — El rol del AIOS puede LEER las sedes (una línea: USAGE en `auth`)
-- 2026-09-08
--
-- QUÉ PASA HOY
--   El AIOS lee `restaurant_locations` para verificar que el subdominio de una
--   sede es de ese negocio, y el producto le contesta:
--
--       ERROR 42501: permission denied for schema auth
--
--   No es que le falte el GRANT: la `00056` ya le dio `SELECT` por columnas y su
--   propia policy `aios_constelarys_select_locations ... USING (true)`. Lo que
--   falla es EVALUAR las OTRAS policies de la tabla.
--
-- POR QUÉ
--   Las policies de la `00026` se crearon **sin cláusula `TO`**, así que aplican
--   a `PUBLIC` — o sea también a `aios_constelarys`. Su USING llama a
--   `current_tenant_id()` (`00024:32`), que es `LANGUAGE sql STABLE` y **no**
--   `SECURITY DEFINER`, y por dentro hace `auth.jwt()`. Para llamar a una
--   función del esquema `auth` hace falta USAGE sobre ese esquema, y este rol
--   no lo tiene. Postgres ni llega a mirar la policy permisiva del AIOS: revienta
--   al evaluar la otra.
--
--   (`is_super_admin()` sí es SECURITY DEFINER desde la `00040` y por eso no
--   estorba. `current_tenant_id()` se quedó atrás. Que la lectura de `tenants`
--   sí funcione hoy es SUERTE: depende de que Postgres corte el OR al evaluar
--   primero la policy `USING (true)`, y ese orden no está garantizado. Esta
--   migración también le quita ese azar.)
--
-- POR QUÉ ESTA SOLUCIÓN Y NO OTRA
--   · `GRANT USAGE ON SCHEMA auth` es lo mínimo que destraba: deja **entrar** al
--     esquema para resolver el nombre de la función. **NO da acceso a ninguna
--     tabla de `auth`** — leer `auth.users` seguiría necesitando su propio GRANT,
--     que este rol no tiene y no va a tener. Comprobado en el bloque 3.
--   · La alternativa era volver `current_tenant_id()` SECURITY DEFINER, pero esa
--     función la evalúa CADA policy del sistema: cambiarle el modo de ejecución
--     por un permiso del AIOS es mover el suelo de todo el aislamiento por un
--     problema de una esquina.
--
-- RIESGO: BAJO. No toca ni una fila ni una policy. Un solo GRANT de USAGE.
--
-- Orden: la 00035 (el rol) antes. Se comprueba en el bloque 0.
--
-- Rollback:  REVOKE USAGE ON SCHEMA auth FROM aios_constelarys;
--            (deja al AIOS otra vez sin poder verificar subdominios de sede)
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- 0. Que el rol exista — fallar temprano y nombrando qué falta
-- ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    RAISE NOTICE '00057: el rol aios_constelarys no existe (falta la 00035). No hay nada que otorgar.';
  ELSE
    -- ───────────────────────────────────────────
    -- 1. El permiso
    -- ───────────────────────────────────────────
    EXECUTE 'GRANT USAGE ON SCHEMA auth TO aios_constelarys';
    RAISE NOTICE '00057: USAGE sobre el esquema auth otorgado a aios_constelarys.';
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- 2. Verificación: el permiso quedó
-- ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    RETURN;
  END IF;

  IF NOT has_schema_privilege('aios_constelarys', 'auth', 'USAGE') THEN
    RAISE EXCEPTION '00057 ABORTADA: el GRANT no quedó — aios_constelarys sigue sin USAGE sobre auth.';
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- 3. Verificación de lo que NO se abrió
-- ───────────────────────────────────────────────
-- El punto entero de esta migración es que abre la PUERTA del esquema y nada
-- más. Si algún día alguien le diera SELECT sobre `auth.users` a este rol, el
-- AIOS pasaría a poder leer los correos y los metadatos de todos los admins de
-- las 25 marcas. Que hoy no puede, queda comprobado acá y no en un comentario.
DO $$
DECLARE
  v_tablas text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    RETURN;
  END IF;

  SELECT string_agg(c.relname, ', ')
    INTO v_tablas
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'auth'
     AND c.relkind IN ('r', 'v', 'm', 'p')
     AND has_table_privilege('aios_constelarys', c.oid, 'SELECT');

  IF v_tablas IS NOT NULL THEN
    RAISE EXCEPTION
      '00057 ABORTADA: aios_constelarys puede LEER tablas de auth (%). USAGE sobre el esquema no debe traer datos: revocá esos SELECT.',
      v_tablas;
  END IF;

  RAISE NOTICE '00057 OK: el AIOS puede entrar al esquema auth para evaluar las policies, y NO puede leer ninguna de sus tablas.';
END $$;
