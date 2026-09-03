-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00041: `restaurant_locations` deja de ser una geocerca y pasa a SER LA SEDE
-- Fecha: 2026-09-03
-- Spec: docs/superpowers/specs/2026-09-02-multisede-design.md §2, §3.3, §4 (F1)
-- Requerimientos: docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md §23 / §23.bis / §23.ter
--
-- QUÉ HACE
-- ────────
--   1. Columnas nuevas: `slug`, `domain`, `config`, `is_primary`, `sort_order`.
--   2. `lat` / `lon` pasan a NULLABLE con CHECK pareado — una sede sin coordenadas
--      es legítima (la geocerca de la 00014 está apagada desde v1.0.5-3).
--   3. `restaurant_locations_id_tenant_key UNIQUE (id, tenant_id)` — el soporte de
--      TODAS las FK compuestas `(location_id, tenant_id)` de la 00043 (F2).
--   4. Único GLOBAL sobre `domain` + único `(tenant_id, slug)`, los dos parciales.
--   5. Trigger de unicidad CRUZADA contra `tenants.domain`.
--   6. CHECK de formato para `slug` y `domain`.
--
-- POR QUÉ `lat`/`lon` NULLABLE NO ES COSMÉTICO
-- ────────────────────────────────────────────
-- La tabla nació en la 00014 para una geocerca anti QR-scam que hoy está apagada, y
-- por eso `lat`/`lon` son NOT NULL. Hoy el AIOS solo manda `locations[]` si vienen LAS
-- DOS coordenadas (`provisioning.ts:717-731`) y `aios_provision_tenant` solo entra al
-- bucle si el array existe (00036:199-213): **un negocio dado de alta sin coordenadas
-- se crea SIN NINGUNA SEDE, en silencio**. Con este modelo la sede es lo que carga el
-- subdominio, la ficha de Google, los meseros y toda la atribución, así que un tenant
-- sin sedes es inservible. El arreglo son dos cosas, no una: esta columna nullable **y**
-- que el AIOS cree la sede siempre (§9 del spec — `provisioning.ts`, mismo commit).
--
-- ⚠️ ORDEN CRUZADO ENTRE REPOS: esta migración va PRIMERO. Si el AIOS se despliega
--    antes, el INSERT de `aios_provision_tenant` (00036:202-211) manda lat/lon NULL,
--    revienta con 23502 y el ALTA ENTERA falla.
--
-- POR QUÉ `UNIQUE (id, tenant_id)` SI `id` YA ES PK
-- ────────────────────────────────────────────────
-- Redundante para la unicidad, imprescindible para la referencia: Postgres exige que
-- el lado referenciado de una FK compuesta tenga un índice único que cubra EXACTAMENTE
-- esas columnas. Sin esto, la 00043 solo podría poner `FK (location_id) → id`, y una
-- FK simple deja grabar una visita de la marca A con la sede de la marca B. El nombre
-- `restaurant_locations_id_tenant_key` es **contrato con F2**: no se cambia.
--
-- RIESGO: BAJO. Solo agrega columnas nullable/con default, relaja dos NOT NULL y crea
--   índices sobre columnas nuevas (todas NULL en las filas existentes, así que los
--   índices parciales nacen vacíos). NO toca ni una fila de historia. NO toca RLS: la
--   policy `tenant_all_restaurant_locations` de la 00026 sigue igual.
-- REVERSIBLE: sí — `ALTER TABLE ... DROP COLUMN` de las 5 columnas nuevas + volver a
--   poner NOT NULL en lat/lon (solo si ninguna sede quedó sin coordenadas).
-- ORDEN: después de la 00040. Antes de la 00042.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- 1. Columnas nuevas
-- ───────────────────────────────────────────────
-- `slug`   — identificador estable de la sede dentro de la marca ('sede-principal',
--            'laureles'). Nullable: las filas que ya existen no tienen y se lo pone
--            la 00042.
-- `domain` — subdominio propio de la sede (§3.3). La sede principal de cada tenant
--            vivo REPITE el `tenants.domain` ya impreso en los QR: cero reimpresión.
-- `config` — override por sede de las 4 claves de `tenants.config` que son "a dónde
--            te mando / cómo te contacto" (§7.1). Sede vacía = hereda la marca, que es
--            el comportamiento de hoy bit a bit.
--            ⚠️ La whitelist de claves en un CHECK y la función espejo
--            `merge_location_config()` viven en §7.1 del spec, que NO lleva número de
--            migración: se deciden aparte. Acá va la COLUMNA y nada más.
-- `is_primary`  — la sede que hereda el dominio y el material impreso de la marca.
-- `sort_order`  — orden de presentación (mismo patrón que `reward_tiers`, 00013:24).
ALTER TABLE restaurant_locations
  ADD COLUMN IF NOT EXISTS slug       text,
  ADD COLUMN IF NOT EXISTS domain     text,
  ADD COLUMN IF NOT EXISTS config     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- ───────────────────────────────────────────────
-- 2. Coordenadas opcionales, pero nunca a medias
-- ───────────────────────────────────────────────
ALTER TABLE restaurant_locations ALTER COLUMN lat DROP NOT NULL;
ALTER TABLE restaurant_locations ALTER COLUMN lon DROP NOT NULL;

-- CHECK pareado: media coordenada no es una ubicación, es un dato roto que
-- `calculate_distance()` (00014) convertiría en NULL sin avisar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'restaurant_locations_latlon_pair_check'
       AND conrelid = 'public.restaurant_locations'::regclass
  ) THEN
    ALTER TABLE restaurant_locations
      ADD CONSTRAINT restaurant_locations_latlon_pair_check
      CHECK ((lat IS NULL) = (lon IS NULL));
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- 3. Formato de `slug` y `domain`
-- ───────────────────────────────────────────────
-- Espejo de `isValidSubdomainLabel` / `isValidHostname` del AIOS
-- (`Level 2.0/aios-constelarys/src/lib/domains.ts`), que es donde el dueño teclea
-- estos valores. Se pone TAMBIÉN en la base porque 55 archivos del producto escriben
-- con `service_role`, que se salta RLS: una validación que vive solo en TypeScript es
-- una sugerencia.
--
--   slug   → kebab-case estricto, 1..63 (largo máximo de un label DNS).
--   domain → hostname en minúsculas, al menos dos labels, SIN esquema ni ruta.
--            El regex ya excluye 'https://x.com' (por ':' y '/'), 'Foo.com' (mayúscula)
--            y 'a b.com' (espacio) sin necesidad de comprobarlos aparte.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'restaurant_locations_slug_format_check'
       AND conrelid = 'public.restaurant_locations'::regclass
  ) THEN
    ALTER TABLE restaurant_locations
      ADD CONSTRAINT restaurant_locations_slug_format_check
      CHECK (
        slug IS NULL
        OR (length(slug) BETWEEN 1 AND 63 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'restaurant_locations_domain_format_check'
       AND conrelid = 'public.restaurant_locations'::regclass
  ) THEN
    ALTER TABLE restaurant_locations
      ADD CONSTRAINT restaurant_locations_domain_format_check
      CHECK (
        domain IS NULL
        OR (
          length(domain) <= 253
          AND domain ~ '^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$'
        )
      );
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- 4. UNIQUE (id, tenant_id) — el contrato con F2
-- ───────────────────────────────────────────────
-- ⚠️ NOMBRE EXACTO. La 00043 (F2) declara sus FK compuestas contra él.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'restaurant_locations_id_tenant_key'
       AND conrelid = 'public.restaurant_locations'::regclass
  ) THEN
    ALTER TABLE restaurant_locations
      ADD CONSTRAINT restaurant_locations_id_tenant_key UNIQUE (id, tenant_id);
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- 5. Unicidad de `domain` y de `slug`
-- ───────────────────────────────────────────────
-- `domain` es único GLOBAL (no por tenant): un host resuelve a UNA sede en todo el
-- producto, igual que `idx_tenants_domain` (00029) hace con la marca. Parcial, porque
-- una sede sin subdominio propio es lo normal.
--
-- Sin CONCURRENTLY a propósito: el harness de tests manda el archivo entero en un solo
-- `client.query()`, que el protocolo simple envuelve en una transacción implícita, y
-- `CREATE INDEX CONCURRENTLY` moriría ahí con 25001. La tabla tiene ~1 fila.
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_locations_domain
  ON restaurant_locations (domain)
  WHERE domain IS NOT NULL;

-- `slug` es único DENTRO de la marca: dos marcas pueden tener su sede 'laureles'.
CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_locations_tenant_slug
  ON restaurant_locations (tenant_id, slug)
  WHERE slug IS NOT NULL;

-- ───────────────────────────────────────────────
-- 6. Unicidad CRUZADA contra `tenants.domain`
-- ───────────────────────────────────────────────
-- Los dos índices únicos de arriba son cada uno de SU tabla, así que ninguno impide
-- que la sede de la marca A se quede con el dominio principal de la marca B — y ahí
-- `getTenantByDomain` (`src/lib/tenant.ts`) tendría dos dueños para el mismo host.
--
-- Postgres no tiene índices únicos entre tablas, así que va por trigger. El solape se
-- PERMITE dentro del mismo tenant, que es justamente el caso de la 00042: la sede
-- principal de Sushi Service repite `clubsushiservice.constelarys.com`, el subdominio
-- que ya está impreso en los QR.
--
-- SECURITY DEFINER a propósito: la comprobación lee `tenants`, que tiene RLS. Corriendo
-- con los privilegios del que llama, un usuario autenticado no vería la fila del OTRO
-- tenant y el guardarraíl dejaría pasar justo el caso que existe para bloquear.
-- `search_path` fijo por el mismo motivo que la 00040.
CREATE OR REPLACE FUNCTION restaurant_locations_domain_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.domain IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM tenants t
     WHERE t.domain = NEW.domain
       AND t.id <> NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'dominio_de_otra_marca'
      USING DETAIL = 'El dominio ' || NEW.domain || ' ya es el dominio principal de otro tenant. '
                     || 'Una sede solo puede repetir el dominio de SU propia marca.';
  END IF;

  RETURN NEW;
END;
$$;

-- Patrón de blindaje de la 00038 (bloques 9-10): en Supabase las default privileges
-- conceden EXECUTE NOMINAL a `anon` y `authenticated`, así que `REVOKE ... FROM PUBLIC`
-- solo no basta. Una función que devuelve `trigger` no la expone PostgREST, pero el
-- patrón se aplica igual por consistencia (Mandamiento XI).
REVOKE ALL ON FUNCTION restaurant_locations_domain_guard() FROM PUBLIC, anon, authenticated;

-- `UPDATE OF domain, tenant_id`: mover una sede de marca también puede crear el choque.
DROP TRIGGER IF EXISTS trg_restaurant_locations_domain_guard ON restaurant_locations;
CREATE TRIGGER trg_restaurant_locations_domain_guard
  BEFORE INSERT OR UPDATE OF domain, tenant_id ON restaurant_locations
  FOR EACH ROW
  EXECUTE FUNCTION restaurant_locations_domain_guard();

-- ⚠️ DEUDA CONOCIDA, NO SE CIERRA ACÁ: el guardarraíl es de UNA sola dirección.
--    Falta el simétrico sobre `tenants` (un tenant nuevo tomando un `domain` que ya usa
--    la sede de otra marca). El §3.3 del spec habla de UN trigger y el Mandamiento I
--    manda no ampliarlo por cuenta propia: queda anotado en `docs/features/multi-sede.md`
--    para decisión del dueño. Hoy no es explotable — ninguna sede tiene `domain` distinto
--    del de su marca hasta que exista la sede 2 (F8).

-- ───────────────────────────────────────────────
-- 7. Verificación
-- ───────────────────────────────────────────────
DO $$
DECLARE
  v_missing text := '';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'restaurant_locations_id_tenant_key'
       AND conrelid = 'public.restaurant_locations'::regclass
  ) THEN
    v_missing := v_missing || ' restaurant_locations_id_tenant_key';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'restaurant_locations'
       AND column_name IN ('lat', 'lon') AND is_nullable = 'NO'
  ) THEN
    v_missing := v_missing || ' lat/lon-siguen-NOT-NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'idx_restaurant_locations_domain'
  ) THEN
    v_missing := v_missing || ' idx_restaurant_locations_domain';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_restaurant_locations_domain_guard'
       AND tgrelid = 'public.restaurant_locations'::regclass
  ) THEN
    v_missing := v_missing || ' trg_restaurant_locations_domain_guard';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'MIGRACIÓN 00041 INCOMPLETA, falta:%', v_missing;
  END IF;

  RAISE NOTICE 'OK 00041: restaurant_locations es la sede (slug/domain/config/is_primary/sort_order, lat-lon opcionales, UNIQUE (id, tenant_id) listo para las FK compuestas de la 00043).';
END $$;

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00041
-- Siguiente: 00042 le da su "Sede principal" a los tenants que ya existen.
-- ═══════════════════════════════════════════════════════════════
