-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00036: Proveedor de mensajería por tenant (Twilio | Zernio)
-- Fecha: 2026-08-29
-- Descripción: Primer swap real del ruteo de mensajería (ver
--   docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md §1 y §11). Dos cosas:
--
--   (a) Columnas en `tenants` para identificar con qué proveedor envía cada
--       tenant y, si es Zernio, con qué cuenta/número — análogas a las
--       `twilio_*` existentes, pero SIN el concepto de "subcuenta" (Zernio no
--       lo tiene: la unidad de aislamiento es `Profile`, y el número/canal
--       individual es `Account`, ver Level 2.0/aios-constelarys/docs/zernio-api-contract.md §6).
--
--   (b) Las TRES únicas funciones de escritura que puede usar el AIOS
--       Constelarys (rol `aios_constelarys`, creado en 00035 v2 — APLICAR
--       ESA MIGRACIÓN ANTES QUE ESTA). El rol NUNCA tiene INSERT/UPDATE
--       directo sobre las tablas: solo EXECUTE sobre estas funciones
--       SECURITY DEFINER, cada una con su propia validación interna. Esto es
--       lo que 00035 v2 dejó pendiente ("escritura: NINGUNA en esta
--       migración... se expone como funciones SECURITY DEFINER en la
--       migración 00036").
--
--       - aios_provision_tenant(payload jsonb) → alta completa (port fiel de
--         scripts/seed-new-tenant.sql). NO hace upsert: si el slug ya existe,
--         lanza excepción — un CRM externo no debe poder pisar un tenant que
--         ya está operando.
--       - aios_activate_whatsapp(slug, profile, account, phone) → prende
--         Zernio para un tenant existente.
--       - aios_set_template_settings(slug, settings jsonb) → carga
--         `*_template_sid` en admin_settings, PERO SOLO para tenants ya en
--         `messaging_provider='zernio'`. Bloquea a propósito el vector de
--         ataque documentado en el propio seed-new-tenant.sql: sembrar un
--         `*_template_sid` en un tenant que todavía cae al fallback de
--         credenciales master (hoy Twilio/Sushi Service) — eso enviaría el
--         mensaje desde el número de OTRO cliente y se lo cobraría a él.
--
-- Orden de aplicación: 00035 (v2, rol + GRANT de columnas) ANTES que esta.
-- Esta migración asume que el rol `aios_constelarys` ya existe.
--
-- Riesgo: MEDIO — agrega columnas con DEFAULT (no rompe tenants existentes,
--   que quedan en 'twilio' explícito) y funciones nuevas. No modifica ninguna
--   tabla de negocio (customers/visits/etc.) ni cambia el comportamiento del
--   camino Twilio existente: `messaging_provider` default 'twilio' hace que
--   whatsapp.service.ts (aparte, en el mismo commit) tome exactamente la
--   misma rama de código que usaba antes para los 4 tenants actuales.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Columnas de proveedor en `tenants` ───────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS messaging_provider text NOT NULL DEFAULT 'twilio'
    CHECK (messaging_provider IN ('twilio', 'zernio')),
  ADD COLUMN IF NOT EXISTS zernio_profile_id  text NULL,
  ADD COLUMN IF NOT EXISTS zernio_account_id  text NULL,
  ADD COLUMN IF NOT EXISTS zernio_phone_number text NULL;

COMMENT ON COLUMN tenants.messaging_provider IS
  'Qué proveedor usa este tenant para WhatsApp. Default ''twilio'' a propósito: los 4 tenants actuales (Sushi Service, Don Alirio, Frangal, Demo) no cambian de comportamiento con esta migración.';
COMMENT ON COLUMN tenants.zernio_profile_id IS
  'Profile de Zernio (unidad de aislamiento tipo "1 cliente = 1 profile", ver zernio-api-contract.md §1). Informativo/trazabilidad — el envío usa zernio_account_id, no este campo.';
COMMENT ON COLUMN tenants.zernio_account_id IS
  'Account de Zernio (el número/canal WhatsApp individual dentro del profile). Es el "accountId" que exige sendZernioTemplateMessage() y por el que se enrutan los webhooks entrantes.';
COMMENT ON COLUMN tenants.zernio_phone_number IS
  'Número en E.164 CON el signo +, ej. +573001234567. SIN el prefijo whatsapp: que usa Twilio — Zernio no lo usa.';

-- Routing de webhooks entrantes: resolver tenant por zernio_account_id.
-- Parcial (solo tenants zernio con cuenta activada) — la inmensa mayoría de
-- tenants hoy son Twilio y esta columna queda NULL, no vale la pena indexarlos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_zernio_account_id
  ON tenants (zernio_account_id)
  WHERE zernio_account_id IS NOT NULL;

-- ─── 2. GRANT por columnas para el AIOS (se suma al de 00035 v2) ─
-- El AIOS necesita ver con qué proveedor opera cada tenant y, si es Zernio,
-- su account/phone — para decidir si mostrar "activar WhatsApp" o el estado
-- ya activado. Sigue sin poder leer NADA de Twilio (mismo criterio de 00035).
GRANT SELECT (
  messaging_provider, zernio_profile_id, zernio_account_id, zernio_phone_number
) ON tenants TO aios_constelarys;

-- ─── 3. Las tres funciones SECURITY DEFINER ──────────────────────
-- Owner: postgres (o el rol dueño del schema en Supabase, que ya es el
-- default al correr esto desde el SQL Editor con el rol de servicio).
-- search_path fijo — obligatorio en SECURITY DEFINER para que nadie pueda
-- colar un objeto con el mismo nombre en otro schema y secuestrar la función.

-- 3.a — Alta completa de un tenant nuevo. Port fiel de scripts/seed-new-tenant.sql,
-- adaptado a payload jsonb en vez de variables DECLARE, y SIN el ON CONFLICT
-- DO UPDATE del script original: un CRM externo no debe poder "actualizar"
-- (léase: pisar) un tenant que ya existe y ya está operando. Si el slug ya
-- existe, se rechaza con una excepción clara.
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

  -- Mismas claves de branding que seed-new-tenant.sql §1 (jsonb_strip_nulls:
  -- lo que no venga en el payload cae al default del sistema en resolveBranding()).
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

  -- twilio_* quedan NULL a propósito (igual que el seed original) y CERO
  -- *_template_sid se siembran aquí — eso solo lo hace aios_set_template_settings,
  -- y solo si el tenant ya es 'zernio'.
  -- price_per_message_cop: si el payload lo trae se usa (la CHECK > 0 de la
  -- columna rechaza valores inválidos); si no, cae al default del seed (100).
  INSERT INTO tenants (
    slug, name, business_type, config, domain, is_active, is_demo,
    messaging_provider, owner_email, owner_phone, price_per_message_cop
  ) VALUES (
    v_slug, trim(v_name), v_business_type, v_config, v_domain, true, false,
    v_provider, payload->>'owner_email', payload->>'owner_phone',
    COALESCE(NULLIF(trim(payload->>'price_per_message_cop'), '')::numeric, 100)
  )
  RETURNING id INTO v_tenant;

  -- Tiers default EXACTOS del seed (mismos umbrales y mystery_prizes).
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

  -- admin_settings default — mismas claves/valores que seed-new-tenant.sql §4.
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

  -- Sedes: payload->'locations' = [{name, address, lat, lon, radius_meters}, ...].
  -- lat/lon opcionales (igual que el seed: sin ambos, no se crea la sede).
  IF jsonb_typeof(payload->'locations') = 'array' THEN
    FOR v_location IN SELECT * FROM jsonb_array_elements(payload->'locations')
    LOOP
      INSERT INTO restaurant_locations (tenant_id, name, address, lat, lon, radius_meters, is_active)
      VALUES (
        v_tenant,
        COALESCE(v_location->>'name', 'Sede principal'),
        v_location->>'address',
        NULLIF(v_location->>'lat', '')::numeric,
        NULLIF(v_location->>'lon', '')::numeric,
        COALESCE((v_location->>'radius_meters')::int, 150),
        true
      );
    END LOOP;
  END IF;

  RETURN v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION aios_provision_tenant(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aios_provision_tenant(jsonb) TO aios_constelarys;

-- 3.b — Activa Zernio para un tenant existente (número ya comprado/aprovisionado
-- en Zernio por fuera de esta función — esta función solo GUARDA la referencia).
CREATE OR REPLACE FUNCTION aios_activate_whatsapp(
  p_slug text,
  p_profile_id text,
  p_account_id text,
  p_phone text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'tenant_no_existe' USING DETAIL = p_slug;
  END IF;
  IF p_phone !~ '^\+[0-9]{7,15}$' THEN
    RAISE EXCEPTION 'phone_invalido' USING DETAIL = 'formato esperado E.164 con +, recibido: ' || COALESCE(p_phone, '(null)');
  END IF;
  IF p_account_id IS NULL OR length(trim(p_account_id)) = 0 THEN
    RAISE EXCEPTION 'account_id_requerido';
  END IF;

  UPDATE tenants
  SET messaging_provider  = 'zernio',
      zernio_profile_id   = p_profile_id,
      zernio_account_id   = p_account_id,
      zernio_phone_number = p_phone
  WHERE slug = p_slug;
END;
$$;

REVOKE ALL ON FUNCTION aios_activate_whatsapp(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aios_activate_whatsapp(text, text, text, text) TO aios_constelarys;

-- 3.c — Carga `*_template_sid` / idioma de plantilla. SOLO tenants ya en
-- 'zernio' — bloquea sembrar SIDs en un tenant que todavía cae al fallback de
-- credenciales master (ver cabecera y scripts/seed-new-tenant.sql).
CREATE OR REPLACE FUNCTION aios_set_template_settings(
  p_slug text,
  p_settings jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant   uuid;
  v_provider text;
  v_key      text;
  v_value    jsonb;
  v_count    int := 0;
BEGIN
  SELECT id, messaging_provider INTO v_tenant, v_provider
  FROM tenants WHERE slug = p_slug;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_no_existe' USING DETAIL = p_slug;
  END IF;
  IF v_provider <> 'zernio' THEN
    RAISE EXCEPTION 'solo_tenants_zernio' USING DETAIL =
      'El tenant ' || p_slug || ' está en messaging_provider=''' || v_provider ||
      '''. Sembrar *_template_sid en un tenant Twilio dispara envíos desde el número master (ver seed-new-tenant.sql).';
  END IF;
  IF jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION 'settings_invalido' USING DETAIL = 'p_settings debe ser un objeto jsonb';
  END IF;

  -- F6 (post-review): el regex '^[a-z0-9_]+_template_sid$' exige que la clave
  -- TERMINE en '_template_sid' — pero las dos claves reales del calendario
  -- (event_template_image_sid, event_template_video_sid) terminan en
  -- '_image_sid'/'_video_sid' y el regex las rechazaba. Se acepta una clave si
  -- matchea el regex O si está en la lista explícita de excepciones conocidas
  -- (las dos del calendario + 'zernio_template_language', que tampoco matchea
  -- el regex por no terminar en '_template_sid').
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_settings)
  LOOP
    IF v_key !~ '^[a-z0-9_]+_template_sid$'
       AND v_key NOT IN ('event_template_image_sid', 'event_template_video_sid', 'zernio_template_language') THEN
      RAISE EXCEPTION 'clave_no_permitida' USING DETAIL = v_key;
    END IF;

    INSERT INTO admin_settings (key, value, tenant_id, updated_at)
    VALUES (v_key, v_value #>> '{}', v_tenant, now())
    ON CONFLICT (key, tenant_id) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION aios_set_template_settings(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aios_set_template_settings(text, jsonb) TO aios_constelarys;

-- ─── 4. Dedup de webhooks entrantes (post-review, hallazgo F5) ───
-- Zernio reintenta la entrega de un webhook hasta 7 veces con backoff
-- exponencial si no recibe 2xx a tiempo (ver src/lib/zernio/webhooks.ts) —
-- sin esta tabla, un reintento del mismo evento dispararía otra vez un
-- opt-out o un forward a n8n en src/app/api/webhook/zernio/route.ts.
-- El route handler hace `INSERT ... (provider, event_id)` y trata el 23505
-- (unique_violation) de la PK como "evento ya procesado, ignorar". Si esta
-- tabla no existe todavía en un entorno (migración sin aplicar), el handler
-- es fail-open: loguea y sigue sin dedup, nunca rompe el webhook.
-- Sin políticas RLS con permiso: solo el service_role (que ignora RLS) la
-- toca. Se puede purgar periódicamente por `received_at` antigua (p.ej. filas
-- de más de 30 días) sin afectar la lógica de dedup de eventos recientes.
CREATE TABLE IF NOT EXISTS webhook_events_seen (
  provider    text NOT NULL,
  event_id    text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

ALTER TABLE webhook_events_seen ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- Verificación (correr aparte tras la migración):
--
--   -- 1. Alta atómica:
--   SELECT aios_provision_tenant('{
--     "slug": "prueba-zernio", "name": "Prueba Zernio",
--     "brand_name": "Prueba", "avg_ticket": "40000"
--   }'::jsonb);
--   SELECT slug, messaging_provider FROM tenants WHERE slug = 'prueba-zernio';  -- 'zernio'
--   SELECT count(*) FROM reward_tiers WHERE tenant_id = (SELECT id FROM tenants WHERE slug='prueba-zernio');  -- 4
--
--   -- 2. Alta duplicada falla (no upsert):
--   SELECT aios_provision_tenant('{"slug":"prueba-zernio","name":"x"}'::jsonb);  -- ERROR: tenant_ya_existe
--
--   -- 3. Activar WhatsApp:
--   SELECT aios_activate_whatsapp('prueba-zernio', 'profile_abc', 'account_xyz', '+573001234567');
--   SELECT messaging_provider, zernio_account_id FROM tenants WHERE slug='prueba-zernio';  -- zernio, account_xyz
--
--   -- 4. Plantillas: falla en tenant Twilio, funciona en tenant Zernio:
--   SELECT aios_set_template_settings('sushi-service', '{"welcome_template_sid":"HX123"}'::jsonb);  -- ERROR: solo_tenants_zernio
--   SELECT aios_set_template_settings('prueba-zernio', '{"welcome_template_sid":"order_confirmation","zernio_template_language":"es"}'::jsonb);  -- 2
--   SELECT aios_set_template_settings('prueba-zernio', '{"foo":"bar"}'::jsonb);  -- ERROR: clave_no_permitida
--
--   -- 5. Rol no puede saltarse las funciones (correr conectado como aios_constelarys):
--   INSERT INTO tenants (slug, name) VALUES ('x','x');  -- permission denied
--   UPDATE tenants SET messaging_provider='zernio' WHERE slug='x';  -- permission denied
-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00036
-- ═══════════════════════════════════════════════════════════════
