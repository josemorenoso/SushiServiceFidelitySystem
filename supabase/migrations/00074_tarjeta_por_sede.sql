-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 00074: la tarjeta de cada sede
-- Fecha: 2026-10-14
-- Prompt: docs/prompts/2026-10-14-sedes-separadas.md §4 (parte 2)
-- Feature: docs/features/multi-sede.md §3.nonies · docs/features/identidad-visual.md
--
-- DE DÓNDE SALE
-- ─────────────
-- El dueño, mirando el panel de Tepuy (Envigado y Laureles), 2026-10-14: *«Si escojo
-- una sede u otra, cuando voy a modificar la tarjeta sale la misma para las dos,
-- incoherente, a menos que haya un botón que diga "tarjetas separadas"»*.
--
-- «Tarjeta principal» gana una elección (solo con 2+ sedes): «La misma tarjeta para
-- todas las sedes» (lo de siempre, el default) o «Una tarjeta para cada sede». La
-- elección vive en `tenants.config.card.mode`, que no tiene CHECK (su whitelist es
-- la de TypeScript y el PUT exige alcance de marca). Lo que cada sede pone en su
-- tarjeta vive en `restaurant_locations.config.card`, y ESE jsonb sí tiene CHECK
-- (00058 §1): sin esta migración la base rechazaría las claves nuevas con 23514.
--
-- QUÉ TRAE
-- ────────
--   1. `location_config_es_valida()` acepta, dentro de `card`, las cuatro claves de
--      la TARJETA de la sede: `stamp_icon`, `motif`, `description`, `policies`.
--      Nada más: el nombre, el logo y los colores siguen siendo de la marca (los
--      puntos y los sellos del cliente son de la marca; una tarjeta con otro nombre
--      u otro logo en la sede de al lado mentiría), y `mode` es de la marca.
--
-- LO QUE NO TRAE, A PROPÓSITO
-- ───────────────────────────
--   · Ni una columna. Ni una fila tocada: todas las sedes siguen con su `config`.
--   · Validación de VALORES en SQL. El CHECK de la 00058 mira solo los NOMBRES de las
--     claves; los valores (las listas cerradas de dibujos, los largos) los valida
--     `src/lib/tenant-config-paths.ts` con las MISMAS funciones para la marca y para
--     la sede. Meter las listas de dibujos acá haría un tercer espejo de
--     `src/constants/card-extras.ts`, y el resolver ya cae al default ante un id que
--     no conoce.
--
-- ⚠️ MISMA FIRMA, ASÍ QUE ES UN REEMPLAZO DE VERDAD: `(p_config jsonb) RETURNS boolean`.
--    La trampa del 42725 (una sobrecarga nueva que deja ambigua la llamada vieja) es de
--    AGREGAR un parámetro, no de cambiar el cuerpo; el bloque 2 lo comprueba.
--
-- RIESGO: BAJO. Afloja un CHECK (acepta cuatro claves más); las filas que ya cumplían
--   siguen cumpliendo. Con «La misma tarjeta para todas las sedes» (lo de todas las
--   marcas el día del despliegue) esas claves ni se leen: `mergeLocationOverConfig()`.
-- REVERSIBLE: sí — volver a crear la función con el cuerpo de la 00058, SIEMPRE que
--   ninguna sede haya guardado ya una de las cuatro claves (si alguna lo hizo, el
--   `CREATE OR REPLACE` pasa pero esa fila deja de cumplir el CHECK en su próxima
--   escritura: borrar antes esas claves con `merge_location_config_deep()`).
-- ORDEN: después de la 00073. Necesita la 00058 y lo comprueba en el bloque 0.
--   ⚠️ VA ANTES DEL CÓDIGO: sin ella, guardar la tarjeta de una sede responde 503
--   («Falta aplicar la migración 00074»), el resto del panel no cambia.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 0. Guardas de dependencia
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'location_config_es_valida'
  ) THEN
    RAISE EXCEPTION
      '00074 requiere la 00058: falta location_config_es_valida(), la whitelist de restaurant_locations.config que esta migración amplía.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname  = 'chk_restaurant_locations_config_whitelist'
       AND conrelid = 'public.restaurant_locations'::regclass
  ) THEN
    RAISE EXCEPTION
      '00074 requiere la 00058: falta el CHECK chk_restaurant_locations_config_whitelist.';
  END IF;
END $$;


-- ═════════════════════════════════════════════════════════════
-- 1. La whitelist de `restaurant_locations.config`, con la tarjeta de la sede
-- ═════════════════════════════════════════════════════════════
--
--   LA FICHA DE LA SEDE (00058)          LA TARJETA DE LA SEDE (00074)
--   ─────────────────────────────        ─────────────────────────────
--   google_maps_url, whatsapp_link,      card.stamp_icon   (el sello)
--   instagram_url, delivery_phone,       card.motif        (la decoración)
--   card.google_profile_url,             card.description  («Quiénes somos»)
--   card.facebook_url / tiktok_url /     card.policies     (las políticas)
--     website_url,
--   card.contact_phone / contact_email,
--   card.address / card.hours
--
-- La ficha la escribe «Mis sedes» (`PATCH /api/dashboard/locations/[id]`); la tarjeta,
-- «Tarjeta principal» con una sede elegida (`PUT /api/dashboard/locations/[id]/card`,
-- solo con alcance de marca). Las dos pasan por `merge_location_config_deep()`.
--
-- Espejo en TypeScript: `src/lib/location-config-paths.ts` (`LOCATION_EDITABLE_PATH_NAMES`
-- + `LOCATION_CARD_PATH_NAMES`). Se cambian los dos lados o ninguno;
-- `tests/unit/location-config-paths.test.ts` lee ESTE archivo y los compara.

CREATE OR REPLACE FUNCTION location_config_es_valida(p_config jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    -- `{}` y la ausencia son válidas. Una sede sin overrides es lo normal.
    p_config IS NULL
    OR (
      jsonb_typeof(p_config) = 'object'
      -- Ninguna clave de primer nivel fuera de la lista…
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_object_keys(p_config) AS k
         WHERE k NOT IN (
           'google_maps_url', 'whatsapp_link', 'instagram_url', 'delivery_phone', 'card'
         )
      )
      -- …`card`, si viene, es un objeto…
      AND (NOT p_config ? 'card' OR jsonb_typeof(p_config -> 'card') = 'object')
      -- …y ninguna clave suya fuera de la lista (la ficha y, desde la 00074, la tarjeta).
      AND NOT EXISTS (
        SELECT 1
          FROM jsonb_object_keys(COALESCE(p_config -> 'card', '{}'::jsonb)) AS k
         WHERE k NOT IN (
           'google_profile_url', 'facebook_url', 'tiktok_url', 'website_url',
           'contact_phone', 'contact_email', 'address', 'hours',
           'stamp_icon', 'motif', 'description', 'policies'
         )
      )
    );
$$;

COMMENT ON FUNCTION location_config_es_valida(jsonb) IS
  'Whitelist de restaurant_locations.config (00058 §1; la tarjeta de la sede, 00074). Espejo en TypeScript: src/lib/location-config-paths.ts. Se cambian los dos lados o ninguno; hay un test que lo vigila.';


-- ─────────────────────────────────────────────────────────────
-- 2. Verificación: una sola versión, y dice lo que tiene que decir
-- ─────────────────────────────────────────────────────────────
-- Que el motor no se queje no significa que algo haya pasado (la lección de la 00057).
DO $$
DECLARE
  v_versiones int;
BEGIN
  SELECT count(*) INTO v_versiones
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'location_config_es_valida';
  IF v_versiones <> 1 THEN
    RAISE EXCEPTION '00074: location_config_es_valida() quedó con % versiones (se esperaba 1).', v_versiones;
  END IF;

  -- La tarjeta de la sede entra…
  IF NOT location_config_es_valida(
    '{"card":{"stamp_icon":"star","motif":"ondas","description":"Terraza","policies":"Sin reservas","address":"Cra 70"}}'::jsonb
  ) THEN
    RAISE EXCEPTION '00074: la whitelist no acepta la tarjeta de la sede.';
  END IF;

  -- …y lo que es de la marca sigue fuera: el modo, el logo, los colores, el nombre.
  IF location_config_es_valida('{"card":{"mode":"per_location"}}'::jsonb)
     OR location_config_es_valida('{"branding":{"primary":"#000000"}}'::jsonb)
     OR location_config_es_valida('{"card":{"logo_url":"https://x.test/l.png"}}'::jsonb)
     OR location_config_es_valida('{"brand_name":"Otra"}'::jsonb) THEN
    RAISE EXCEPTION '00074: la whitelist deja pasar algo que es de la marca.';
  END IF;
END $$;
