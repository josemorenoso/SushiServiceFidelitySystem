-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 00058: la SEDE deja de ser un dato nuestro y pasa a ser del cliente
-- Fecha: 2026-09-08
-- Spec: docs/superpowers/specs/2026-09-02-multisede-design.md §7.1 (la parte que
--       la 00041 dejó a medias) · Feature: docs/features/multi-sede.md §7
--
-- DE DÓNDE SALE
-- ─────────────
-- El dueño, 2026-09-08: *"el cliente debe poder ver sus sedes, seleccionarlas y
-- modificarlas desde un solo lugar, punto final"*, *"cada sede tiene su propio
-- google maps, tiene su propia info, lo que se comparten son los clientes"*, y
-- *"hasta las recompensas deben variar, eso depende de cada restaurante; que
-- compartamos un número no afecta eso"*.
--
-- Hoy nada de eso es posible, y no por falta de diseño sino porque el diseño se
-- aplicó a medias: la 00041 creó la columna `restaurant_locations.config` y su
-- propio comentario lo dice —*"Acá va la COLUMNA y nada más"*—, dejando la
-- whitelist y la función de escritura para "después". Ese después es hoy. Sin
-- esto, las dos sedes de una marca mandan a reseñar la MISMA ficha de Google:
-- la ficha de la segunda sede nace muerta.
--
-- QUÉ TRAE
-- ────────
--   1. `merge_location_config_deep()` — escribir UN campo del `config` de UNA
--      sede sin pisar el resto, y sin poder tocar la sede de otra marca.
--   2. El CHECK de whitelist sobre `restaurant_locations.config`: qué claves
--      puede llevar una sede, en la BASE y no solo en TypeScript.
--   3. `location_id` en `reward_tiers`, `rewards` y `campaign_rewards`, con FK
--      COMPUESTA `(location_id, tenant_id)` — recompensas por sede.
--   4. Los índices únicos de esas tres tablas, recalculados para que los NULL
--      **sí** colisionen entre sí (la trampa de siempre; ver el bloque 4).
--
-- LO QUE NO TRAE, A PROPÓSITO
-- ───────────────────────────
--   · Ni una columna nueva en `dashboard_user_locations`. Los dos roles que pide
--     el dueño —«super usuario» que ve toda la marca y «administrador» que ve su
--     sede— son EXACTAMENTE los `role='brand'` y `role='location'` que la 00045
--     ya modela, con su CHECK, sus dos únicos parciales y su FK compuesta. Lo
--     que faltaba no era el modelo: era una pantalla que escribiera esa tabla.
--   · Ningún backfill. `location_id IS NULL` sigue significando «de la marca» y
--     es lo que tienen las 5 marcas vivas: el día del despliegue nada cambia.
--
-- RIESGO: BAJO. Agrega 3 columnas nullable, 1 función, 1 CHECK sobre una columna
--   que hoy vale `{}` en todas las filas, 3 FK y reemplaza 2 índices únicos por
--   otros equivalentes mientras `location_id` sea NULL en todo. NO toca una sola
--   fila de historia. NO toca RLS.
-- REVERSIBLE: sí — `DROP FUNCTION merge_location_config_deep`, `DROP CONSTRAINT`
--   de los CHECK y las FK, `DROP COLUMN` de las 3 columnas y volver a crear los
--   dos índices únicos de la 00028 tal cual.
-- ORDEN: después de la 00057. Necesita la 00041 (la columna `config` y
--   `restaurant_locations_id_tenant_key`) y la 00047 (`jsonb_deep_merge`), y lo
--   comprueba en el bloque 0.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 0. Guardas de dependencia
-- ─────────────────────────────────────────────────────────────
-- Fallar acá NOMBRA el archivo que falta. Sin esto, el bloque 1 fallaría con
-- "function jsonb_deep_merge(jsonb, jsonb) does not exist" y el 3 con un 42830
-- ("no unique constraint matching given keys"), dos errores que no dicen nada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'jsonb_deep_merge'
  ) THEN
    RAISE EXCEPTION
      '00058 requiere la 00047: falta jsonb_deep_merge(), el merge profundo que esta migración reusa para las sedes.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'restaurant_locations_id_tenant_key'
       AND conrelid = 'public.restaurant_locations'::regclass
  ) THEN
    RAISE EXCEPTION
      '00058 requiere la 00041: falta restaurant_locations_id_tenant_key, el índice único que soporta las FK compuestas del bloque 3.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'restaurant_locations'
       AND column_name  = 'config'
  ) THEN
    RAISE EXCEPTION
      '00058 requiere la 00041: falta restaurant_locations.config.';
  END IF;
END $$;


-- ═════════════════════════════════════════════════════════════
-- 1. La whitelist de `restaurant_locations.config`, en la BASE
-- ═════════════════════════════════════════════════════════════
--
-- POR QUÉ EN LA BASE Y NO SOLO EN TYPESCRIPT
-- ──────────────────────────────────────────
-- La app corre con `service_role` en 55 archivos, y `service_role` se salta el
-- RLS por definición. Una whitelist que viva solo en TypeScript es una
-- SUGERENCIA: el primer `.update({ config })` escrito de apuro la esquiva sin
-- que nada se queje. El §7.1 del spec pidió el CHECK por esto exactamente.
--
-- QUÉ BAJA A LA SEDE Y QUÉ NO (§7.1, ampliado por el dueño el 2026-09-08)
-- ──────────────────────────────────────────────────────────────────────
-- El criterio NO es "qué podría variar" sino **"qué es coherente con lo que el
-- cliente ya ve"**. La tarjeta muestra puntos y visitas que son DE LA MARCA, así
-- que la identidad que los envuelve tiene que ser la de la marca o la tarjeta
-- miente: un cliente que sumó 8 sellos comiendo en Laureles y abre su tarjeta en
-- Envigado no puede ver otro nombre ni otro logo, porque sus sellos siguen ahí.
--
--   SE QUEDAN EN LA MARCA            BAJAN A LA SEDE
--   ─────────────────────           ─────────────────
--   brand_name, tagline, short       google_maps_url   ← la ficha de Google
--   branding.*  (logo, colores)      whatsapp_link
--   card.stamp_icon, card.motif      instagram_url
--   card.description, card.policies  delivery_phone
--   qr_studio.*                      card.google_profile_url
--                                    card.facebook_url / tiktok_url / website_url
--                                    card.contact_phone / contact_email
--                                    card.address / card.hours
--
-- Todo lo de la derecha es literalmente *"dónde estoy y cómo me contactás"*, que
-- es lo único que de verdad cambia entre dos locales de la misma marca.
--
-- SEDE VACÍA = HEREDA LA MARCA, que es el comportamiento de hoy bit a bit: el
-- resolvedor mezcla `location.config` SOBRE `tenants.config`, y `{}` no pisa
-- nada. Las 5 marcas vivas tienen `config = '{}'` en todas sus sedes.

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
      -- …y ninguna clave suya fuera de la lista.
      AND NOT EXISTS (
        SELECT 1
          FROM jsonb_object_keys(COALESCE(p_config -> 'card', '{}'::jsonb)) AS k
         WHERE k NOT IN (
           'google_profile_url', 'facebook_url', 'tiktok_url', 'website_url',
           'contact_phone', 'contact_email', 'address', 'hours'
         )
      )
    );
$$;

COMMENT ON FUNCTION location_config_es_valida(jsonb) IS
  'Whitelist de restaurant_locations.config (00058 §1). Espejo en TypeScript: src/lib/location-config-paths.ts. Se cambian los dos lados o ninguno; hay un test que lo vigila.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname  = 'chk_restaurant_locations_config_whitelist'
       AND conrelid = 'public.restaurant_locations'::regclass
  ) THEN
    -- NOT VALID a propósito: valida lo que se escriba de ahora en adelante sin
    -- exigir un escaneo completo de la tabla, y sin poder fallar por una fila
    -- vieja que nadie miró. Se valida acto seguido, porque hoy todas son `{}` y
    -- la tabla tiene ~6 filas — pero si algún día no lo fueran, el VALIDATE es
    -- lo único que hay que posponer, no la migración entera.
    ALTER TABLE restaurant_locations
      ADD CONSTRAINT chk_restaurant_locations_config_whitelist
      CHECK (location_config_es_valida(config)) NOT VALID;

    ALTER TABLE restaurant_locations
      VALIDATE CONSTRAINT chk_restaurant_locations_config_whitelist;
  END IF;
END $$;


-- ═════════════════════════════════════════════════════════════
-- 2. `merge_location_config_deep()` — el único escritor
-- ═════════════════════════════════════════════════════════════
--
-- Espejo LITERAL de `merge_tenant_config_deep()` (00047) salvo por una cosa que
-- no es cosmética: **recibe el `tenant_id` y filtra por él**.
--
-- POR QUÉ EL tenant_id NO SOBRA AUNQUE `id` SEA LA PK
-- ──────────────────────────────────────────────────
-- Quien llama a esto es una ruta del panel que ya sabe de qué marca es el
-- usuario, pero recibe el uuid de la sede DEL NAVEGADOR. Sin el filtro, un uuid
-- de la sede de otra marca —adivinado, copiado de un enlace, o simplemente mal
-- pegado— escribiría en la marca ajena, y `config` es lo que viaja a la tarjeta
-- pública: sería el dato de la marca A apareciendo en la marca B, que es el
-- único principio que este producto no negocia. La comprobación va acá, en el
-- mismo sitio donde ocurre la escritura, y no en el llamador, para que no haya
-- una segunda versión de esta función sin ella.
--
-- Devuelve el `config` resultante, o NULL si no encontró la sede en esa marca:
-- el llamador distingue "guardado" de "esa sede no es tuya" sin una consulta más.
--
-- ⚠️ NO crea sobrecarga: la función es NUEVA (no existía con otra firma). La
--    trampa del 42725 aplica a AGREGARLE un parámetro a una que ya existe.
CREATE OR REPLACE FUNCTION merge_location_config_deep(
  p_tenant_id   uuid,
  p_location_id uuid,
  p_patch       jsonb
)
RETURNS jsonb
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE restaurant_locations
     SET config     = jsonb_deep_merge(COALESCE(config, '{}'::jsonb), p_patch),
         updated_at = now()
   WHERE id        = p_location_id
     AND tenant_id = p_tenant_id
  RETURNING config;
$$;

COMMENT ON FUNCTION merge_location_config_deep(uuid, uuid, jsonb) IS
  'Único escritor de restaurant_locations.config. Filtra por tenant_id además del id: el uuid de la sede llega del navegador. Espejo de merge_tenant_config_deep() (00047).';


-- ═════════════════════════════════════════════════════════════
-- 3. Recompensas por sede — la columna y su FK COMPUESTA
-- ═════════════════════════════════════════════════════════════
--
-- LA SEMÁNTICA, EN UNA FRASE: `location_id IS NULL` = **de la marca**, la
-- heredan todas las sedes. Una sede que define AL MENOS UNA fila propia
-- **reemplaza el conjunto entero** de la marca para esa tabla.
--
-- POR QUÉ REEMPLAZA Y NO SE MEZCLA
-- ────────────────────────────────
-- La alternativa era mezclar fila a fila (los niveles de la marca, más los de la
-- sede, con la sede pisando los umbrales repetidos). Se descartó por dos motivos:
--
--   1. **Nadie puede explicárselo a un restaurantero.** «Tenés los niveles de la
--      marca EXCEPTO los que redefiniste, y si borrás uno vuelve el de la marca»
--      es una regla que se entiende leyendo código, no mirando una pantalla.
--      «Esta sede usa los premios de la marca» / «Esta sede tiene los suyos» sí.
--   2. Mezclar deja estados imposibles de deshacer sin adivinar: una sede que
--      quiere TENER MENOS niveles que la marca no podría expresarlo nunca.
--
-- LA REGLA DE ORO SE MANTIENE (§8.3): con **0 o 1 sede activa** ninguna marca ve
-- un solo cambio. `location_id` es NULL en las 5 marcas vivas, el conjunto de la
-- marca es el único que hay, y cada consulta devuelve exactamente lo de hoy.
--
-- POR QUÉ FK COMPUESTA Y NO `REFERENCES restaurant_locations(id)`
-- ──────────────────────────────────────────────────────────────
-- Es el guardrail del proyecto: una FK simple deja grabar un premio de la marca A
-- apuntando a una sede de la marca B, y el motor no se queja. `ON DELETE
-- RESTRICT` porque un premio que perdió su sede es un premio mal atribuido, no un
-- premio de la marca: preferimos que borrar la sede falle y alguien decida.
ALTER TABLE reward_tiers      ADD COLUMN IF NOT EXISTS location_id uuid NULL;
ALTER TABLE rewards           ADD COLUMN IF NOT EXISTS location_id uuid NULL;
ALTER TABLE campaign_rewards  ADD COLUMN IF NOT EXISTS location_id uuid NULL;

COMMENT ON COLUMN reward_tiers.location_id IS
  'Sede dueña del nivel. NULL = de la MARCA (lo heredan todas las sedes). Una sede con al menos una fila propia reemplaza el conjunto de la marca. 00058 §3.';
COMMENT ON COLUMN rewards.location_id IS
  'Sede dueña del premio por visitas. NULL = de la MARCA. Misma regla que reward_tiers. 00058 §3.';
COMMENT ON COLUMN campaign_rewards.location_id IS
  'Sede dueña del premio de campaña. NULL = de la MARCA. Misma regla que reward_tiers. 00058 §3.';

-- Mismo bucle, mismo formato de nombre y mismo índice de apoyo que la 00043: si
-- alguien busca "de qué tablas cuelga una sede", los encuentra todos escritos
-- igual. Ver el comentario largo de 00043:150-210 para el porqué de cada línea.
DO $$
DECLARE
  r        record;
  v_nombre text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('reward_tiers',     'location_id'),
      ('rewards',          'location_id'),
      ('campaign_rewards', 'location_id')
    ) AS t(tabla, col)
  LOOP
    v_nombre := r.tabla || '_' || r.col || '_tenant_fkey';

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = format('public.%I', r.tabla)::regclass
         AND conname  = v_nombre
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I '
        'FOREIGN KEY (%I, tenant_id) '
        'REFERENCES public.restaurant_locations (id, tenant_id) '
        'ON DELETE RESTRICT',
        r.tabla, v_nombre, r.col
      );
    END IF;

    -- NUNCA `CONCURRENTLY`: el harness de tests manda el archivo entero en un
    -- solo `client.query()` y el protocolo simple lo envuelve en una transacción
    -- implícita, donde `CREATE INDEX CONCURRENTLY` muere con 25001.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, %I) WHERE %I IS NOT NULL',
      'idx_' || r.tabla || '_' || r.col, r.tabla, r.col, r.col
    );
  END LOOP;
END $$;


-- ═════════════════════════════════════════════════════════════
-- 4. Los índices únicos, recalculados — LA TRAMPA DE LOS NULL
-- ═════════════════════════════════════════════════════════════
--
-- **Los NULL no colisionan entre sí.** Es la trampa que este proyecto ya tiene
-- escrita en su CLAUDE.md, y acá se activaría sola: si el único quedara como
-- `(point_threshold, tenant_id, location_id)`, dos niveles DE LA MARCA con el
-- mismo umbral —los dos con `location_id` NULL— convivirían tan campantes, y el
-- panel mostraría dos «Oro a los 100 puntos» sin poder explicar cuál gana.
-- El único que existe hoy (`reward_tiers_threshold_tenant_unique`, 00028:78) SÍ
-- protege eso; añadir una columna nullable a secas lo APAGARÍA EN SILENCIO.
--
-- La salida es un centinela: `COALESCE(location_id, uuid cero)`. El uuid cero no
-- puede ser una sede real —`gen_random_uuid()` no lo produce y la FK lo
-- rechazaría— así que "de la marca" pasa a ser un valor concreto que colisiona
-- consigo mismo, y la garantía queda igual de fuerte por sede que por marca.
--
-- Se reemplazan, no se acumulan: dejar el viejo vivo prohibiría que Laureles y
-- Envigado tuvieran los dos su nivel «Oro a los 100», que es justamente lo que
-- esta migración viene a permitir.
DROP INDEX IF EXISTS reward_tiers_threshold_tenant_unique;
CREATE UNIQUE INDEX IF NOT EXISTS reward_tiers_threshold_tenant_sede_unique
  ON reward_tiers (
    tenant_id,
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    point_threshold
  )
  WHERE is_active = true;

COMMENT ON INDEX reward_tiers_threshold_tenant_sede_unique IS
  'Un umbral activo por sede. El COALESCE al uuid cero hace que los NULL (= de la marca) SÍ colisionen entre sí: sin él, agregar location_id nullable apagaría la garantía en silencio. Reemplaza a reward_tiers_threshold_tenant_unique (00028).';

DROP INDEX IF EXISTS rewards_visit_milestone_tenant_unique;
CREATE UNIQUE INDEX IF NOT EXISTS rewards_visit_milestone_tenant_sede_unique
  ON rewards (
    tenant_id,
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    visit_milestone
  )
  WHERE visit_milestone IS NOT NULL;

COMMENT ON INDEX rewards_visit_milestone_tenant_sede_unique IS
  'Un premio por hito de visitas y por sede. Mismo centinela que reward_tiers_threshold_tenant_sede_unique. Reemplaza a rewards_visit_milestone_tenant_unique (00028).';

-- `campaign_rewards` NO tenía ningún índice único (00031:32) y no se le agrega
-- uno: su clave natural sería el título, que es texto libre que el restaurante
-- reescribe. Solo lleva la columna y su índice de apoyo, ya creados arriba.


-- ═════════════════════════════════════════════════════════════
-- 5. Verificación — que la migración no se haya aplicado a medias
-- ═════════════════════════════════════════════════════════════
-- Barato y explícito: si algo de arriba no quedó, el error nombra QUÉ falta en
-- vez de aparecer semanas después como un 42703 disfrazado de 403.
DO $$
DECLARE
  v_faltan text[] := '{}';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'merge_location_config_deep'
  ) THEN v_faltan := v_faltan || 'merge_location_config_deep()'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'chk_restaurant_locations_config_whitelist'
  ) THEN v_faltan := v_faltan || 'chk_restaurant_locations_config_whitelist'; END IF;

  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('reward_tiers', 'rewards', 'campaign_rewards')
         AND column_name = 'location_id') <> 3
  THEN v_faltan := v_faltan || 'las 3 columnas location_id de recompensas'; END IF;

  IF (SELECT count(*) FROM pg_constraint
       WHERE conname IN ('reward_tiers_location_id_tenant_fkey',
                         'rewards_location_id_tenant_fkey',
                         'campaign_rewards_location_id_tenant_fkey')) <> 3
  THEN v_faltan := v_faltan || 'las 3 FK compuestas (location_id, tenant_id)'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'reward_tiers_threshold_tenant_sede_unique'
  ) THEN v_faltan := v_faltan || 'reward_tiers_threshold_tenant_sede_unique'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'rewards_visit_milestone_tenant_sede_unique'
  ) THEN v_faltan := v_faltan || 'rewards_visit_milestone_tenant_sede_unique'; END IF;

  IF array_length(v_faltan, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00058 quedó a medias. Falta: %', array_to_string(v_faltan, ', ');
  END IF;
END $$;
