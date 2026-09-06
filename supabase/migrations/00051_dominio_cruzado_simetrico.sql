-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00051: el guardarraíl de dominio cruzado deja de ser de una sola dirección
-- Fecha: 2026-09-06
-- Cierra: deuda **D2** de `docs/features/multi-sede.md`
-- Spec: docs/superpowers/specs/2026-09-02-multisede-design.md §3.3
--
-- QUÉ HACE
-- ────────
-- Un solo trigger: `trg_tenants_domain_guard` sobre `tenants`, el espejo exacto del
-- `trg_restaurant_locations_domain_guard` que la 00041 puso sobre `restaurant_locations`.
--
-- POR QUÉ AHORA, Y NO CUANDO SE ESCRIBIÓ LA 00041
-- ───────────────────────────────────────────────
-- La 00041 dejó la deuda anotada con una CONDICIÓN, textual en su bloque 6:
--
--   > «Hoy no es explotable — ninguna sede tiene `domain` distinto del de su marca
--   >  hasta que exista la sede 2 (F8).»
--
-- El 2026-09-06 el dueño fijó la regla que rompe esa condición: **un restaurante con
-- sedes le pone la ciudad al subdominio desde el principio, y todas las sedes son
-- pares** (`laureles.marca.com`, `envigado.marca.com` — no hay una principal con
-- subramas). En cuanto una sede estrena `domain` propio, la condición deja de valer.
--
-- QUÉ SE PUEDE HACER HOY SIN ESTE TRIGGER
-- ───────────────────────────────────────
-- La sede `laureles.marca-a.com` existe. Se da de alta la marca B con
-- `tenants.domain = 'laureles.marca-a.com'`:
--
--   · `idx_tenants_domain` (00029) no dice nada: es único DENTRO de `tenants`.
--   · `idx_restaurant_locations_domain` (00041) tampoco: es único DENTRO de esa tabla.
--   · `trg_restaurant_locations_domain_guard` (00041) NO se dispara: su trigger está
--     sobre `restaurant_locations`, y acá el INSERT es sobre `tenants`.
--
-- Y entonces `resolveHostContext()` (`src/lib/tenant.ts:101`) tiene DOS dueños para el
-- mismo host. Su camino 1 (`getTenantByDomain`) contesta la marca B; su camino 2 (el
-- `domain` de la sede) habría contestado la marca A. Gana el camino 1, así que el host
-- de una sede de la marca A empieza a servir la marca B: su tarjeta, su catálogo y su
-- check-in. Es exactamente lo que CLAUDE.md llama el principio que no se negocia.
--
-- POR QUÉ NO FILTRA POR `is_active`
-- ─────────────────────────────────
-- Una sede desactivada conserva su `domain`, y ni este trigger ni el de la 00041 se
-- disparan cuando alguien vuelve a activarla (los dos escuchan `domain`/`tenant_id`, no
-- `is_active`). Si se permitiera que un tenant tomara el dominio de una sede dormida, el
-- choque nacería en silencio el día que esa sede reviva, sin ningún INSERT que auditar.
-- Ser estricto acá es lo único que cierra esa ventana. Es el mismo criterio que ya usa
-- la 00041, que mira `tenants` sin filtrar su `is_active`.
--
-- RIESGO: BAJO. No toca ni una fila: agrega una función y un trigger `BEFORE`. Los 5
--   tenants vivos pasan el prevuelo por construcción — la 00042 le dio a cada sede
--   principal EL MISMO dominio de SU marca, y el solape dentro del mismo tenant está
--   permitido a propósito (es lo que evita reimprimir los QR).
-- REVERSIBLE: sí — `DROP TRIGGER trg_tenants_domain_guard ON tenants;` y
--   `DROP FUNCTION tenants_domain_guard();`. No deja rastro en los datos.
-- ORDEN: después de la 00041 (que crea `restaurant_locations.domain`). Independiente de
--   la 00047 y de todo lo que haya entre medio.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- 1. Prevuelo — que el guardarraíl no tape un choque que YA existe
-- ───────────────────────────────────────────────
-- Un trigger `BEFORE` solo mira lo que entra: si en producción ya hubiera un dominio
-- compartido entre marcas, instalarlo lo dejaría congelado y además invisible (ningún
-- INSERT futuro lo tocaría). Preferimos que la migración ABORTE y se vea.
DO $$
DECLARE
  v_choques text;
BEGIN
  SELECT string_agg(
           format('%s (marca %s) ya es la sede "%s" de la marca %s',
                  t.domain, t.slug, rl.name, t2.slug),
           E'\n')
    INTO v_choques
    FROM tenants t
    JOIN restaurant_locations rl
      ON rl.domain = t.domain
     AND rl.tenant_id <> t.id
    JOIN tenants t2 ON t2.id = rl.tenant_id
   WHERE t.domain IS NOT NULL;

  IF v_choques IS NOT NULL THEN
    RAISE EXCEPTION E'00051 ABORTADA: ya hay dominios compartidos ENTRE MARCAS.\n%\nResolvé a quién pertenece cada host ANTES de instalar el guardarraíl.', v_choques;
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- 2. El espejo del bloque 6 de la 00041
-- ───────────────────────────────────────────────
-- SECURITY DEFINER por la misma razón que su gemelo, invertida: la comprobación lee
-- `restaurant_locations`, que tiene RLS desde la 00026 (`tenant_all_restaurant_locations`).
-- Corriendo con los privilegios del que llama, un usuario autenticado no vería la sede
-- del OTRO tenant y el guardarraíl dejaría pasar justo el caso que existe para bloquear.
-- `search_path` fijo por el mismo motivo que la 00040.
CREATE OR REPLACE FUNCTION tenants_domain_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.domain IS NULL THEN
    RETURN NEW;
  END IF;

  -- El solape se PERMITE dentro del mismo tenant: es el caso de la 00042, donde la sede
  -- principal repite el dominio de su marca para no reimprimir un solo QR.
  IF EXISTS (
    SELECT 1 FROM restaurant_locations rl
     WHERE rl.domain = NEW.domain
       AND rl.tenant_id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'dominio_de_otra_marca'
      USING DETAIL = 'El dominio ' || NEW.domain || ' ya es el subdominio de una sede de otra marca. '
                     || 'Una marca solo puede repetir el dominio de SUS propias sedes.';
  END IF;

  RETURN NEW;
END;
$$;

-- Patrón de blindaje de la 00038 (bloques 9-10): en Supabase las default privileges
-- conceden EXECUTE NOMINAL a `anon` y `authenticated`, así que `REVOKE ... FROM PUBLIC`
-- solo no basta. Una función que devuelve `trigger` no la expone PostgREST, pero el
-- patrón se aplica igual por consistencia (Mandamiento XI).
REVOKE ALL ON FUNCTION tenants_domain_guard() FROM PUBLIC, anon, authenticated;

-- `UPDATE OF domain` y no `tenant_id`: `tenants` no tiene a quién pertenecer, su propia
-- `id` es el lado dueño. Un tenant no cambia de id.
DROP TRIGGER IF EXISTS trg_tenants_domain_guard ON tenants;
CREATE TRIGGER trg_tenants_domain_guard
  BEFORE INSERT OR UPDATE OF domain ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION tenants_domain_guard();

COMMENT ON FUNCTION tenants_domain_guard() IS
  'D2: el simetrico de restaurant_locations_domain_guard() (00041). Impide que una marca '
  'tome como tenants.domain un host que ya es el subdominio de la sede de OTRA marca. '
  'Sin los dos triggers, resolveHostContext() puede tener dos duenos para el mismo host: '
  'su camino 1 gana y el subdominio de la sede de A pasa a servir la marca B. '
  'No filtra is_active a proposito — una sede dormida conserva su domain y reactivarla '
  'no dispara ningun trigger, asi que el choque nacería en silencio.';

-- ───────────────────────────────────────────────
-- 3. Verificación
-- ───────────────────────────────────────────────
DO $$
DECLARE
  v_falta text := '';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_tenants_domain_guard'
       AND tgrelid = 'tenants'::regclass
  ) THEN
    v_falta := v_falta || ' trg_tenants_domain_guard';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'tenants_domain_guard' AND n.nspname = 'public'
  ) THEN
    v_falta := v_falta || ' tenants_domain_guard()';
  END IF;

  -- El gemelo de la 00041 tiene que seguir ahí: la garantía es de los DOS o de ninguno.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_restaurant_locations_domain_guard'
       AND tgrelid = 'restaurant_locations'::regclass
  ) THEN
    v_falta := v_falta || ' trg_restaurant_locations_domain_guard (00041 — la mitad que ya existía)';
  END IF;

  IF v_falta <> '' THEN
    RAISE EXCEPTION 'FALTA:%', v_falta;
  END IF;

  RAISE NOTICE 'OK 00051: el dominio cruzado queda cerrado en las DOS direcciones (D2). Una marca ya no puede tomar el subdominio de la sede de otra, ni al reves.';
END $$;
