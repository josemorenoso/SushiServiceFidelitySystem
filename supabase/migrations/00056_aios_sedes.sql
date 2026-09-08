-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00056: el AIOS puede crear y editar SEDES (F8 de multi-sede)
-- Fecha: 2026-09-07
-- Diseño:  docs/features/multi-sede.md §2.bis y §5 (deuda 17)
-- Decisión: Level 2.0/aios-constelarys/docs/DECISION-MULTISEDE-2026-09-07.md
--
-- QUÉ RESUELVE
--   Hasta hoy el AIOS crea **un tenant por cada sede**, así que un negocio con
--   dos locales nace como DOS MARCAS. Eso rompe las dos cosas que el dueño
--   pidió: que el cliente conserve su recorrido entre sedes
--   (`customers_phone_tenant_key (phone, tenant_id)` lo garantiza gratis, pero
--   POR MARCA) y que el número de WhatsApp se comparta
--   (`idx_tenants_zernio_account_id` es único y rechaza el segundo tenant —
--   hace bien: impide que dos MARCAS distintas compartan línea).
--
--   Nada de esto está roto en producción: las 5 marcas vivas son de una sola
--   sede. Lo destapó Tepuy (dos locales), que llega ANTES de tener datos.
--
-- QUÉ TRAE
--   1. `aios_add_location()`  — agregar la sede 2..N a un tenant que ya existe.
--   2. `aios_set_location()`  — editar nombre/dirección/estado/orden de una sede.
--   3. `aios_provision_tenant()` REEMPLAZADA — su bucle de `locations` ahora
--      escribe también `slug`, `domain`, `is_primary` y `sort_order`.
--   4. GRANT SELECT **por columnas** sobre `restaurant_locations` + su policy.
--
-- ⚠️ POR QUÉ EL PUNTO 3 NO ES OPCIONAL (hallazgo del 2026-09-07)
--   `aios_provision_tenant` (00036:199-213) YA itera `payload->'locations'`,
--   pero su INSERT escribe solo `tenant_id, name, address, lat, lon,
--   radius_meters, is_active`: **no escribe `slug` ni `domain`**.
--   Y por D21 (§3.5 + ESTADO §4) una marca con 2+ sedes activas deja de
--   atribuir por el dominio raíz — el registro de clientes nuevos responde
--   409 con la lista de sedes. O sea: un alta de dos sedes hecha con la
--   función tal como estaba **nacería creada pero MUERTA**, con dos sedes sin
--   subdominio y ningún cliente nuevo pudiendo registrarse.
--
-- ⚠️ NO CREA SOBRECARGA (la trampa del 42725)
--   La firma sigue siendo EXACTAMENTE `aios_provision_tenant(payload jsonb)`.
--   La trampa de `CREATE OR REPLACE` aplica a AGREGAR UN PARÁMETRO, que crea
--   una función nueva y vuelve ambigua la llamada vieja. Cambiar el CUERPO con
--   la misma firma es un reemplazo de verdad. Las claves nuevas viajan DENTRO
--   del jsonb, que es justamente por qué ese payload es jsonb.
--   El bloque 5 lo VERIFICA: si quedan dos versiones, la migración aborta.
--
-- Orden: 00035 (rol) y 00036 (funciones) y 00041 (la sede como entidad) ANTES.
--   Esta migración las asume aplicadas y lo comprueba en el bloque 0.
--
-- Riesgo: BAJO-MEDIO. No toca ni una fila de datos. Agrega dos funciones,
--   reemplaza una tercera conservando su contrato, y otorga lecturas nuevas
--   al rol del AIOS. El camino de alta de UNA sola sede se comporta
--   exactamente igual que antes (el bucle sigue aceptando `locations` sin
--   `slug`/`domain`: quedan NULL, que es lo que hace hoy).
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- 0. Guarda de dependencia — fallar temprano y nombrando qué falta
-- ───────────────────────────────────────────────
DO $$
DECLARE
  v_falta text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.restaurant_locations') IS NULL THEN
    v_falta := v_falta || 'restaurant_locations (tabla)';
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'restaurant_locations'
         AND column_name = 'slug'
    ) THEN
      v_falta := v_falta || 'restaurant_locations.slug (falta la 00041)';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'restaurant_locations'
         AND column_name = 'domain'
    ) THEN
      v_falta := v_falta || 'restaurant_locations.domain (falta la 00041)';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'aios_provision_tenant') THEN
    v_falta := v_falta || 'aios_provision_tenant() (falta la 00036)';
  END IF;

  IF array_length(v_falta, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00056 no se puede aplicar, falta: %', array_to_string(v_falta, ', ');
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- 1. Helper interno: validar una sede antes de escribirla
-- ───────────────────────────────────────────────
-- Vive aparte porque lo usan las DOS vías de escritura (el alta completa y el
-- alta de una sede suelta). Tenerlo en un solo sitio es lo que impide que las
-- dos diverjan — el mismo criterio con el que la 00054 dejó
-- `connection_apply_whatsapp()` como único cuerpo.
--
-- NO escribe nada: solo levanta la excepción con nombre. Los CHECK y los
-- índices de la 00041 siguen siendo la red REAL; esto existe para que el AIOS
-- reciba `sede_slug_repetido` en vez de un 23505 crudo sobre un índice cuyo
-- nombre no le dice nada al dueño.
CREATE OR REPLACE FUNCTION aios_validar_sede(
  p_tenant_id   uuid,
  p_slug        text,
  p_domain      text,
  p_lat         numeric,
  p_lon         numeric,
  p_location_id uuid DEFAULT NULL   -- la fila que se está editando, para excluirla
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_brand_domain text;
BEGIN
  -- ── slug ──────────────────────────────────────────────────────
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'sede_slug_requerido' USING DETAIL =
      'Cada sede necesita su slug (ej: poblado, laureles): es su identificador estable dentro de la marca.';
  END IF;
  IF length(p_slug) > 63 OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'sede_slug_invalido' USING DETAIL =
      'El slug de la sede debe ser kebab-case de 1 a 63 caracteres (minúsculas, números y guiones internos), recibido: ' || p_slug;
  END IF;
  IF EXISTS (
    SELECT 1 FROM restaurant_locations
     WHERE tenant_id = p_tenant_id
       AND slug = p_slug
       AND (p_location_id IS NULL OR id <> p_location_id)
  ) THEN
    RAISE EXCEPTION 'sede_slug_repetido' USING DETAIL =
      'Esta marca ya tiene una sede con el slug ' || p_slug || '.';
  END IF;

  -- ── domain ────────────────────────────────────────────────────
  -- OBLIGATORIO, y no es rigor de más: es D21. Con 2+ sedes activas el
  -- dominio raíz de la marca deja de atribuir y el registro responde 409, así
  -- que una sede sin subdominio propio NO PUEDE REGISTRAR CLIENTES NUEVOS.
  -- Dejarlo opcional sería permitir crear una sede nacida muerta.
  IF p_domain IS NULL OR length(trim(p_domain)) = 0 THEN
    RAISE EXCEPTION 'sede_sin_dominio' USING DETAIL =
      'Toda sede lleva su propio subdominio (ej: laureles.marca.com). Con 2 o más sedes el dominio raíz de la marca deja de registrar clientes nuevos (409), así que una sede sin subdominio no puede operar.';
  END IF;
  IF length(p_domain) > 253
     OR p_domain !~ '^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$' THEN
    RAISE EXCEPTION 'sede_dominio_invalido' USING DETAIL =
      'El dominio va en minúsculas, con al menos dos labels, sin esquema ni ruta. Recibido: ' || p_domain;
  END IF;

  -- Único GLOBAL dentro de restaurant_locations (idx_restaurant_locations_domain).
  IF EXISTS (
    SELECT 1 FROM restaurant_locations
     WHERE domain = p_domain
       AND (p_location_id IS NULL OR id <> p_location_id)
  ) THEN
    RAISE EXCEPTION 'sede_dominio_ocupado' USING DETAIL =
      'El dominio ' || p_domain || ' ya lo usa otra sede. Un host resuelve a UNA sola sede en todo el producto.';
  END IF;

  -- Y contra `tenants.domain`. Los dos índices únicos son cada uno de SU
  -- tabla, así que ninguno ve al otro: `resolveHostContext()` mira las DOS, y
  -- un host repetido entre ellas tendría dos dueños. El trigger
  -- `trg_restaurant_locations_domain_guard` (00041) ya cubre el caso de OTRA
  -- marca; acá se agrega el de la PROPIA, que el trigger permite a propósito
  -- (es como vive la sede principal de la 00042, repitiendo el dominio ya
  -- impreso en los QR). Una sede NUEVA no debe tomarlo: el dominio raíz tiene
  -- que seguir significando "la marca" y con 2+ sedes tiene que dar 409.
  SELECT t.domain INTO v_brand_domain FROM tenants t WHERE t.id = p_tenant_id;

  IF v_brand_domain IS NOT NULL AND v_brand_domain = p_domain THEN
    RAISE EXCEPTION 'sede_dominio_es_el_de_la_marca' USING DETAIL =
      'El dominio ' || p_domain || ' es el dominio principal de la marca. La sede necesita el SUYO (ej: laureles.' || p_domain || '): el raíz tiene que seguir sirviendo para elegir sede.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM tenants t
     WHERE t.domain = p_domain
       AND t.id <> p_tenant_id
  ) THEN
    RAISE EXCEPTION 'sede_dominio_de_otra_marca' USING DETAIL =
      'El dominio ' || p_domain || ' ya es el dominio principal de otra marca.';
  END IF;

  -- ── coordenadas ───────────────────────────────────────────────
  -- Van en pareja o no van (restaurant_locations_latlon_pair_check). Media
  -- coordenada no es una ubicación, y sin esto el alta entera moriría con un
  -- 23514 crudo por un campo OPCIONAL a medias.
  IF (p_lat IS NULL) <> (p_lon IS NULL) THEN
    RAISE EXCEPTION 'sede_coordenadas_a_medias' USING DETAIL =
      'Latitud y longitud van las dos o ninguna.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION aios_validar_sede(uuid, text, text, numeric, numeric, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION aios_validar_sede(uuid, text, text, numeric, numeric, uuid) IS
  'Validación compartida por aios_add_location() y aios_provision_tenant(). No escribe: solo levanta excepciones con nombre para que el AIOS las traduzca. Los CHECK y los índices de la 00041 siguen siendo la red real.';

-- ───────────────────────────────────────────────
-- 2. aios_add_location() — la sede 2..N de un tenant que ya existe
-- ───────────────────────────────────────────────
-- El rol `aios_constelarys` NO tiene INSERT sobre `restaurant_locations`: la
-- 00035 v2 eliminó a propósito TODOS los GRANT INSERT directos y dejó la
-- escritura detrás de funciones SECURITY DEFINER con validación interna. Esta
-- es el mismo patrón exacto que las tres de la 00036.
CREATE OR REPLACE FUNCTION aios_add_location(
  p_tenant_slug text,
  payload       jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant   uuid;
  v_slug     text := payload->>'slug';
  v_domain   text := lower(trim(COALESCE(payload->>'domain', '')));
  v_lat      numeric := NULLIF(payload->>'lat', '')::numeric;
  v_lon      numeric := NULLIF(payload->>'lon', '')::numeric;
  v_huerfana text;
  v_location uuid;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug = p_tenant_slug;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_no_existe' USING DETAIL = p_tenant_slug;
  END IF;

  IF v_domain = '' THEN v_domain := NULL; END IF;

  PERFORM aios_validar_sede(v_tenant, v_slug, v_domain, v_lat, v_lon, NULL);

  -- ⚠️ LA GUARDA QUE EVITA APAGAR LA SEDE QUE YA FUNCIONABA.
  -- Si la marca tenía UNA sola sede, esa sede casi siempre repite el dominio
  -- de la marca (así la dejó la 00042, para no reimprimir un solo QR) o no
  -- tiene dominio. Mientras es única, no importa: el dominio raíz atribuye
  -- sola ("sede única implícita", `location_source = 'host_single'`).
  --
  -- En el instante en que nace la sede 2, esa regla se apaga: el raíz pasa a
  -- responder 409 y la sede 1 se queda SIN NINGUNA VÍA para registrar
  -- clientes nuevos. Crear la sede 2 sin avisar convertiría un alta en una
  -- caída de la sede que ya estaba operando.
  --
  -- Por eso se rechaza acá, nombrando la sede y diciendo qué hacer. El AIOS
  -- lo traduce y ofrece ponerle su subdominio con aios_set_location().
  SELECT string_agg(l.name, ', ' ORDER BY l.name) INTO v_huerfana
  FROM restaurant_locations l
  JOIN tenants t ON t.id = l.tenant_id
  WHERE l.tenant_id = v_tenant
    AND l.is_active
    AND (l.domain IS NULL OR l.domain IS NOT DISTINCT FROM t.domain);

  IF v_huerfana IS NOT NULL THEN
    RAISE EXCEPTION 'sede_previa_sin_subdominio' USING DETAIL =
      'Antes de agregar otra sede hay que darle su propio subdominio a: ' || v_huerfana ||
      '. Hoy esa sede se atribuye por el dominio raíz de la marca, y ese atajo se apaga en cuanto exista la segunda sede (el registro pasa a responder 409).';
  END IF;

  -- `tenant_id` EXPLÍCITO. La 00030 nunca se aplicó, así que 18 tablas
  -- conservan el DEFAULT puente de la 00028: un INSERT que lo olvide se va
  -- CALLADITO a Sushi Service, sin error.
  --
  -- `is_primary` SIEMPRE false: la principal ya la fijó la 00042 y elegir de
  -- nuevo delegaría el material impreso a la sede equivocada.
  INSERT INTO restaurant_locations (
    tenant_id, name, slug, domain, address, lat, lon,
    radius_meters, is_active, is_primary, sort_order
  ) VALUES (
    v_tenant,
    COALESCE(NULLIF(trim(payload->>'name'), ''), 'Sede ' || v_slug),
    v_slug,
    v_domain,
    NULLIF(trim(COALESCE(payload->>'address', '')), ''),
    v_lat,
    v_lon,
    COALESCE(NULLIF(payload->>'radius_meters', '')::int, 150),
    COALESCE(NULLIF(payload->>'is_active', '')::boolean, true),
    false,
    COALESCE(
      NULLIF(payload->>'sort_order', '')::int,
      (SELECT COALESCE(max(sort_order), 0) + 1 FROM restaurant_locations WHERE tenant_id = v_tenant)
    )
  )
  RETURNING id INTO v_location;

  RETURN v_location;
END;
$$;

REVOKE ALL ON FUNCTION aios_add_location(text, jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION aios_add_location(text, jsonb) IS
  'Agrega la sede 2..N a un tenant existente. Única vía de INSERT en restaurant_locations para el rol aios_constelarys (la 00035 v2 le quitó el INSERT directo). is_primary siempre false. Rechaza si alguna sede activa de la marca todavía no tiene subdominio propio: crear la sede 2 apagaria el registro de esa.';

-- ───────────────────────────────────────────────
-- 3. aios_set_location() — editar una sede
-- ───────────────────────────────────────────────
-- El brief pedía "sin tocar domain: se fija al crear". Se cumple para el caso
-- normal, con UNA excepción escrita y acotada, sin la cual §3.c del brief
-- ("single → multi tiene que poder hacerse") produce una marca rota:
--
--   Una marca que hoy tiene UNA sede la tiene con `domain = tenants.domain`
--   (así la dejó la 00042) o sin dominio. Para pasar a multi, esa sede
--   necesita su propio subdominio ANTES de que exista la segunda — si no,
--   `aios_add_location` la rechaza con `sede_previa_sin_subdominio` y no hay
--   forma de avanzar.
--
-- Por eso el domain se puede fijar SOLO cuando la sede todavía no tiene uno
-- propio (NULL, o igual al de su marca). Una sede que ya estrenó subdominio
-- NO se puede mover: ahí sí está impreso en QR y en enlaces guardados.
-- Cambiarlo entonces sería el error irreversible que el brief quiere evitar.
CREATE OR REPLACE FUNCTION aios_set_location(
  p_tenant_slug text,
  p_location_id uuid,
  payload       jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant       uuid;
  v_brand_domain text;
  v_actual       record;
  v_domain       text;
BEGIN
  SELECT id, domain INTO v_tenant, v_brand_domain FROM tenants WHERE slug = p_tenant_slug;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_no_existe' USING DETAIL = p_tenant_slug;
  END IF;

  -- Filtrado por tenant_id además del id: una sede de OTRA marca no se toca
  -- desde acá aunque llegue su uuid.
  SELECT * INTO v_actual
  FROM restaurant_locations
  WHERE id = p_location_id AND tenant_id = v_tenant;

  -- `NOT FOUND` y no `v_actual IS NULL`: sobre un record, `IS NULL` solo es
  -- cierto si TODOS sus campos son NULL, así que confundiría "no hay fila" con
  -- "hay fila y está toda vacía".
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sede_no_existe' USING DETAIL =
      'No hay ninguna sede ' || p_location_id || ' en la marca ' || p_tenant_slug || '.';
  END IF;

  -- ── domain: solo si todavía no tiene uno PROPIO ───────────────
  v_domain := v_actual.domain;
  IF payload ? 'domain' THEN
    DECLARE
      v_nuevo text := lower(trim(COALESCE(payload->>'domain', '')));
    BEGIN
      IF v_nuevo = '' THEN v_nuevo := NULL; END IF;

      IF v_nuevo IS DISTINCT FROM v_actual.domain THEN
        IF v_actual.domain IS NOT NULL
           AND v_actual.domain IS DISTINCT FROM v_brand_domain THEN
          RAISE EXCEPTION 'sede_dominio_congelado' USING DETAIL =
            'La sede ya estrenó el subdominio ' || v_actual.domain ||
            ', que puede estar impreso en QR y guardado en enlaces de clientes. No se cambia desde el AIOS.';
        END IF;
        v_domain := v_nuevo;
      END IF;
    END;
  END IF;

  PERFORM aios_validar_sede(
    v_tenant,
    COALESCE(NULLIF(trim(COALESCE(payload->>'slug', '')), ''), v_actual.slug),
    v_domain,
    CASE WHEN payload ? 'lat' THEN NULLIF(payload->>'lat', '')::numeric ELSE v_actual.lat END,
    CASE WHEN payload ? 'lon' THEN NULLIF(payload->>'lon', '')::numeric ELSE v_actual.lon END,
    p_location_id
  );

  -- COALESCE por clave presente: lo que el payload no trae, no se toca. Un
  -- UPDATE que pisara con NULL lo ausente borraría la dirección cada vez que
  -- alguien renombra la sede.
  UPDATE restaurant_locations SET
    name          = COALESCE(NULLIF(trim(COALESCE(payload->>'name', '')), ''), v_actual.name),
    slug          = COALESCE(NULLIF(trim(COALESCE(payload->>'slug', '')), ''), v_actual.slug),
    domain        = v_domain,
    address       = CASE WHEN payload ? 'address'
                         THEN NULLIF(trim(COALESCE(payload->>'address', '')), '')
                         ELSE v_actual.address END,
    lat           = CASE WHEN payload ? 'lat' THEN NULLIF(payload->>'lat', '')::numeric ELSE v_actual.lat END,
    lon           = CASE WHEN payload ? 'lon' THEN NULLIF(payload->>'lon', '')::numeric ELSE v_actual.lon END,
    radius_meters = COALESCE(NULLIF(payload->>'radius_meters', '')::int, v_actual.radius_meters),
    is_active     = COALESCE(NULLIF(payload->>'is_active', '')::boolean, v_actual.is_active),
    sort_order    = COALESCE(NULLIF(payload->>'sort_order', '')::int, v_actual.sort_order),
    updated_at    = now()
  WHERE id = p_location_id AND tenant_id = v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION aios_set_location(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION aios_set_location(text, uuid, jsonb) IS
  'Edita una sede desde el AIOS. is_primary y tenant_id NO se tocan. El domain solo se puede FIJAR mientras la sede no tenga uno propio (NULL o igual al de su marca): es lo que permite el paso single -> multi. Una sede que ya estrenó subdominio queda congelada.';

-- ───────────────────────────────────────────────
-- 4. aios_provision_tenant() — MISMA FIRMA, bucle de sedes corregido
-- ───────────────────────────────────────────────
-- Cambios respecto de la 00036, y NADA más:
--   · el bucle escribe `slug`, `domain`, `is_primary` y `sort_order`;
--   · la primera sede del array nace `is_primary = true` (antes NINGUNA lo era,
--     porque la 00042 solo arregló los tenants que ya existían: un tenant
--     creado por el AIOS después de la 00042 nacía sin sede principal);
--   · valida cada sede con `aios_validar_sede()` — pero SOLO si trae `slug`,
--     para no romper al AIOS viejo, que manda `locations` sin él.
--
-- Todo lo demás (tiers, admin_settings, config, el rechazo de slug duplicado)
-- es idéntico, carácter por carácter, a la 00036.
CREATE OR REPLACE FUNCTION aios_provision_tenant(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug          text := payload->>'slug';
  v_name          text := payload->>'name';
  v_business_type text := COALESCE(payload->>'business_type', 'restaurant');
  v_domain        text := payload->>'domain';
  v_provider      text := COALESCE(payload->>'messaging_provider', 'zernio');
  v_avg_ticket    text := COALESCE(payload->>'avg_ticket', '35000');
  v_checkin_mode  text := COALESCE(payload->>'checkin_mode', 'auto');
  v_geo_strict    text := COALESCE(payload->>'geo_strict_mode', 'false');
  v_config        jsonb;
  v_tenant        uuid;
  v_location      jsonb;
  v_loc_slug      text;
  v_loc_domain    text;
  v_n             int := 0;
BEGIN
  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9][a-z0-9-]*$' THEN
    RAISE EXCEPTION 'slug_invalido' USING DETAIL = 'slug debe ser kebab-case: ^[a-z0-9][a-z0-9-]*$, recibido: ' || COALESCE(v_slug, '(null)');
  END IF;
  IF v_name IS NULL OR length(trim(v_name)) = 0 THEN
    RAISE EXCEPTION 'name_requerido';
  END IF;
  IF v_business_type NOT IN ('restaurant', 'barbershop', 'beauty_salon') THEN
    RAISE EXCEPTION 'business_type_invalido' USING DETAIL = 'debe ser restaurant | barbershop | beauty_salon, recibido: ' || v_business_type;
  END IF;
  IF v_provider NOT IN ('twilio', 'zernio') THEN
    RAISE EXCEPTION 'messaging_provider_invalido' USING DETAIL = 'debe ser twilio | zernio, recibido: ' || v_provider;
  END IF;
  IF EXISTS (SELECT 1 FROM tenants WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'tenant_ya_existe' USING DETAIL = 'slug ya en uso: ' || v_slug;
  END IF;

  v_config := jsonb_strip_nulls(jsonb_build_object(
    'brand_name',           payload->>'brand_name',
    'brand_short',          payload->>'brand_short',
    'brand_tagline',        payload->>'brand_tagline',
    'staff_role_label',     COALESCE(payload->>'staff_role_label', 'Mesero'),
    'visit_label',          COALESCE(payload->>'visit_label', 'visita'),
    'station_label',        COALESCE(payload->>'station_label', 'mesa'),
    'whatsapp_link',        payload->>'whatsapp_link',
    'instagram_url',        payload->>'instagram_url',
    'google_maps_url',      payload->>'google_maps_url',
    'delivery_phone',       payload->>'delivery_phone',
    'card_bg',              payload->>'card_bg',
    'page_bg',              payload->>'page_bg',
    'has_delivery_webhook', false
  ));

  INSERT INTO tenants (
    slug, name, business_type, config, domain, is_active, is_demo,
    messaging_provider, owner_email, owner_phone, price_per_message_cop
  ) VALUES (
    v_slug, trim(v_name), v_business_type, v_config, v_domain, true, false,
    v_provider, payload->>'owner_email', payload->>'owner_phone',
    COALESCE(NULLIF(trim(payload->>'price_per_message_cop'), '')::numeric, 100)
  )
  RETURNING id INTO v_tenant;

  INSERT INTO reward_tiers (
    tenant_id, tier_name, point_threshold, safe_reward_title,
    mystery_box_enabled, mystery_prizes, is_black, sort_order, is_active
  ) VALUES
    (v_tenant, 'Plata', 150, 'Bebida gratis', true,
     '[{"title":"Bebida gratis","probability":70,"emoji":"☕"},{"title":"Postre del chef","probability":25,"emoji":"🍰"},{"title":"Plato fuerte gratis","probability":5,"emoji":"🍽️"}]'::jsonb,
     false, 1, true),
    (v_tenant, 'Oro', 300, 'Postre gratis', true,
     '[{"title":"Postre gratis","probability":65,"emoji":"🍰"},{"title":"Plato fuerte gratis","probability":25,"emoji":"🍽️"},{"title":"Experiencia especial","probability":10,"emoji":"✨"}]'::jsonb,
     false, 2, true),
    (v_tenant, 'Diamante', 450, 'Plato fuerte gratis', true,
     '[{"title":"Plato fuerte gratis","probability":60,"emoji":"🍽️"},{"title":"Experiencia especial","probability":30,"emoji":"✨"},{"title":"Super premio","probability":10,"emoji":"🏆"}]'::jsonb,
     false, 3, true),
    (v_tenant, 'BLACK', 1000, 'Experiencia Chef privada', true,
     '[{"title":"Experiencia especial","probability":70,"emoji":"✨"},{"title":"Super premio","probability":30,"emoji":"🏆"}]'::jsonb,
     true, 4, true);

  INSERT INTO admin_settings (key, value, tenant_id, updated_at)
  SELECT s.key, s.value, v_tenant, now()
  FROM (VALUES
    ('points_system_enabled',       'true'),
    ('points_per_visit_min',        '60'),
    ('points_per_visit_max',        '90'),
    ('welcome_bonus_points_min',    '75'),
    ('welcome_bonus_points_max',    '90'),
    ('shortfall_min',               '5'),
    ('shortfall_max',               '30'),
    ('event_bonus_points',          '25'),
    ('pity_timer_threshold',        '2'),
    ('checkin_mode',                v_checkin_mode),
    ('checkin_first_visit_free',    'true'),
    ('geo_strict_mode',             v_geo_strict),
    ('avg_ticket',                  v_avg_ticket),
    ('reactivation_soft_days',      '15'),
    ('reactivation_aggressive_days','25')
  ) AS s(key, value);

  -- ── Sedes ─────────────────────────────────────────────────────
  -- payload->'locations' = [{name, slug, domain, address, lat, lon, radius_meters}, ...]
  --
  -- `slug` y `domain` son la parte NUEVA. Son OPCIONALES para no romper al
  -- AIOS desplegado, que hoy manda solo {name, address, lat, lon,
  -- radius_meters}: sin ellos la sede nace igual que antes, con slug y domain
  -- NULL. Pero un alta de VARIAS sedes SIN subdominio nace muerta (D21), así
  -- que a partir de la segunda se EXIGEN.
  IF jsonb_typeof(payload->'locations') = 'array' THEN
    FOR v_location IN SELECT * FROM jsonb_array_elements(payload->'locations')
    LOOP
      v_n := v_n + 1;
      v_loc_slug   := NULLIF(trim(COALESCE(v_location->>'slug', '')), '');
      v_loc_domain := NULLIF(lower(trim(COALESCE(v_location->>'domain', ''))), '');

      -- Con 2+ sedes, cada una necesita su identidad propia: sin slug no hay
      -- forma de nombrarla y sin domain no puede registrar clientes.
      IF jsonb_array_length(payload->'locations') > 1
         AND (v_loc_slug IS NULL OR v_loc_domain IS NULL) THEN
        RAISE EXCEPTION 'sede_sin_identidad' USING DETAIL =
          'La sede n° ' || v_n || ' viene sin slug o sin domain. Con 2 o más sedes cada una necesita los dos: el dominio raíz de la marca deja de registrar clientes nuevos (409).';
      END IF;

      IF v_loc_slug IS NOT NULL THEN
        PERFORM aios_validar_sede(v_tenant, v_loc_slug, v_loc_domain,
                                  NULLIF(v_location->>'lat', '')::numeric,
                                  NULLIF(v_location->>'lon', '')::numeric,
                                  NULL);
      END IF;

      INSERT INTO restaurant_locations (
        tenant_id, name, slug, domain, address, lat, lon,
        radius_meters, is_active, is_primary, sort_order
      ) VALUES (
        v_tenant,
        COALESCE(v_location->>'name', 'Sede principal'),
        v_loc_slug,
        v_loc_domain,
        v_location->>'address',
        NULLIF(v_location->>'lat', '')::numeric,
        NULLIF(v_location->>'lon', '')::numeric,
        COALESCE((v_location->>'radius_meters')::int, 150),
        true,
        -- La PRIMERA del array es la principal. Antes ninguna lo era: la 00042
        -- solo adoptó los tenants que ya existían, así que todo tenant creado
        -- por el AIOS después nacía sin sede principal, y is_primary es lo que
        -- decide de quién es el material impreso de la marca.
        (v_n = 1),
        v_n - 1
      );
    END LOOP;
  END IF;

  RETURN v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION aios_provision_tenant(jsonb) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION aios_provision_tenant(jsonb) IS
  'Alta completa y atómica de una marca (00036, cuerpo reemplazado por la 00056). MISMA FIRMA (payload jsonb): no crea sobrecarga. Su bucle de locations escribe ahora slug/domain/is_primary/sort_order — sin domain, una marca de 2+ sedes no puede registrar clientes nuevos (D21).';

-- ───────────────────────────────────────────────
-- 5. Permisos del rol del AIOS
-- ───────────────────────────────────────────────
-- Criterio de la 00035 v2, sin excepciones: GRANT **por columnas**, nunca
-- `GRANT SELECT` a secas. `config` queda FUERA a propósito — es el espacio de
-- override por sede y mañana puede llevar datos que el AIOS no tiene por qué
-- ver; agregarlo después es un GRANT de una línea, quitarlo es una fuga que
-- ya ocurrió.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    RAISE NOTICE '00056: el rol aios_constelarys no existe (falta la 00035). Se crean las funciones igual; los GRANT quedan pendientes.';
    RETURN;
  END IF;

  EXECUTE 'GRANT SELECT (
     id, tenant_id, name, slug, domain, address, lat, lon,
     radius_meters, is_active, is_primary, sort_order, created_at, updated_at
   ) ON restaurant_locations TO aios_constelarys';

  EXECUTE 'GRANT EXECUTE ON FUNCTION aios_add_location(text, jsonb) TO aios_constelarys';
  EXECUTE 'GRANT EXECUTE ON FUNCTION aios_set_location(text, uuid, jsonb) TO aios_constelarys';
  EXECUTE 'GRANT EXECUTE ON FUNCTION aios_provision_tenant(jsonb) TO aios_constelarys';

  -- Doble candado (00035 §1): el GRANT abre la columna, la policy abre la
  -- fila. Sin política para este rol, RLS deja la lectura en cero filas
  -- aunque alguien amplíe un GRANT por error más adelante.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'restaurant_locations'
       AND policyname = 'aios_constelarys_select_locations'
  ) THEN
    EXECUTE 'CREATE POLICY aios_constelarys_select_locations
               ON restaurant_locations FOR SELECT
               TO aios_constelarys
               USING (true)';
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- 6. Verificación: que no se dé por buena a medias
-- ───────────────────────────────────────────────
DO $$
DECLARE
  v_falta text[] := ARRAY[]::text[];
  v_n     int;
BEGIN
  -- EXACTAMENTE UNA `aios_provision_tenant`. Dos = la sobrecarga del 42725, y
  -- la llamada de un argumento del AIOS pasaría a ser ambigua dentro de un
  -- catch que solo traduce el mensaje.
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'aios_provision_tenant';
  IF v_n <> 1 THEN
    v_falta := v_falta || ('aios_provision_tenant() tiene ' || v_n || ' versiones, debe tener 1');
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'aios_add_location';
  IF v_n <> 1 THEN
    v_falta := v_falta || ('aios_add_location() tiene ' || v_n || ' versiones, debe tener 1');
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc WHERE proname = 'aios_set_location';
  IF v_n <> 1 THEN
    v_falta := v_falta || ('aios_set_location() tiene ' || v_n || ' versiones, debe tener 1');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'aios_validar_sede') THEN
    v_falta := v_falta || 'aios_validar_sede()';
  END IF;

  -- Las tres SECURITY DEFINER, con search_path fijo. Sin esto, cualquiera que
  -- pueda crear un objeto en otro schema secuestra la función.
  SELECT count(*) INTO v_n
  FROM pg_proc
  WHERE proname IN ('aios_add_location', 'aios_set_location', 'aios_validar_sede', 'aios_provision_tenant')
    AND (NOT prosecdef OR proconfig IS NULL
         OR NOT ('search_path=public, pg_temp' = ANY(proconfig)));
  IF v_n > 0 THEN
    v_falta := v_falta || (v_n || ' funcion(es) del AIOS sin SECURITY DEFINER o sin search_path fijo');
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'restaurant_locations'
         AND policyname = 'aios_constelarys_select_locations'
    ) THEN
      v_falta := v_falta || 'policy aios_constelarys_select_locations';
    END IF;

    -- Que el GRANT sea POR COLUMNAS y no incluya `config`.
    IF EXISTS (
      SELECT 1 FROM information_schema.column_privileges
       WHERE grantee = 'aios_constelarys'
         AND table_schema = 'public' AND table_name = 'restaurant_locations'
         AND column_name = 'config'
    ) THEN
      v_falta := v_falta || 'el rol recibio restaurant_locations.config, que debe quedar FUERA';
    END IF;

    SELECT count(*) INTO v_n
    FROM information_schema.column_privileges
    WHERE grantee = 'aios_constelarys'
      AND table_schema = 'public' AND table_name = 'restaurant_locations'
      AND privilege_type = 'SELECT';
    IF v_n = 0 THEN
      v_falta := v_falta || 'GRANT SELECT por columnas sobre restaurant_locations';
    END IF;
  END IF;

  IF array_length(v_falta, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00056 incompleta, FALTA: %', array_to_string(v_falta, ', ');
  END IF;

  RAISE NOTICE '00056 OK: aios_add_location(), aios_set_location(), aios_validar_sede() y aios_provision_tenant() (misma firma, bucle de sedes con slug/domain/is_primary). El rol lee restaurant_locations por columnas, sin config. CERO filas tocadas.';
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Verificación manual (correr aparte, DESPUÉS de la migración):
--
--   -- 1. Alta de una marca con DOS sedes, cada una con su subdominio:
--   SELECT aios_provision_tenant('{
--     "slug":"tepuy-prueba","name":"Tepuy","domain":"tepuy-prueba.constelarys.com",
--     "messaging_provider":"twilio",
--     "locations":[
--       {"name":"Poblado","slug":"poblado","domain":"poblado-tepuy-prueba.constelarys.com"},
--       {"name":"Laureles","slug":"laureles","domain":"laureles-tepuy-prueba.constelarys.com"}
--     ]}'::jsonb);
--
--   SELECT name, slug, domain, is_primary, sort_order
--     FROM restaurant_locations
--    WHERE tenant_id = (SELECT id FROM tenants WHERE slug='tepuy-prueba')
--    ORDER BY sort_order;        -- 2 filas, Poblado is_primary=true
--
--   -- 2. Una tercera sede, ya con el tenant creado:
--   SELECT aios_add_location('tepuy-prueba',
--     '{"name":"Envigado","slug":"envigado","domain":"envigado-tepuy-prueba.constelarys.com"}'::jsonb);
--
--   -- 3. Los rechazos con nombre:
--   SELECT aios_add_location('tepuy-prueba', '{"name":"X","slug":"envigado","domain":"otro.constelarys.com"}'::jsonb);
--        -- ERROR: sede_slug_repetido
--   SELECT aios_add_location('tepuy-prueba', '{"name":"X","slug":"x"}'::jsonb);
--        -- ERROR: sede_sin_dominio
--   SELECT aios_add_location('tepuy-prueba', '{"name":"X","slug":"x","domain":"tepuy-prueba.constelarys.com"}'::jsonb);
--        -- ERROR: sede_dominio_es_el_de_la_marca
--   SELECT aios_provision_tenant('{"slug":"z","name":"Z","locations":[{"name":"a"},{"name":"b"}]}'::jsonb);
--        -- ERROR: sede_sin_identidad
--
--   -- 4. El rol sigue sin poder saltarse las funciones (como aios_constelarys):
--   INSERT INTO restaurant_locations (tenant_id, name) VALUES (gen_random_uuid(), 'x');  -- permission denied
--   SELECT config FROM restaurant_locations LIMIT 1;                                     -- permission denied
--   SELECT id, name, slug, domain FROM restaurant_locations LIMIT 1;                     -- ok
--
--   -- 5. Limpieza de la prueba:
--   DELETE FROM restaurant_locations WHERE tenant_id = (SELECT id FROM tenants WHERE slug='tepuy-prueba');
--   DELETE FROM admin_settings       WHERE tenant_id = (SELECT id FROM tenants WHERE slug='tepuy-prueba');
--   DELETE FROM reward_tiers         WHERE tenant_id = (SELECT id FROM tenants WHERE slug='tepuy-prueba');
--   DELETE FROM tenants              WHERE slug = 'tepuy-prueba';
-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00056
-- ═══════════════════════════════════════════════════════════════
