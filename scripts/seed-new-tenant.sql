-- ═══════════════════════════════════════════════════════════════
-- seed-new-tenant.sql — Alta de un cliente nuevo (modelo multitenant)
-- ═══════════════════════════════════════════════════════════════
-- Crea la fila en `tenants` + la config mínima para que el cliente pueda
-- operar TODO el producto (check-in QR, puntos, tiers, mystery box, calendario,
-- meseros, redenciones, dashboard) **con WhatsApp APAGADO**.
--
-- 🔴 POR QUÉ NO SE SIEMBRA NINGÚN `*_template_sid`:
--    `getTwilioClient()` (src/services/whatsapp.service.ts) cae a las credenciales
--    MASTER (env TWILIO_*, = Sushi Service) cuando el tenant no tiene las suyas.
--    Si este tenant tuviera un `*_template_sid` configurado, sus mensajes saldrían
--    DESDE EL NÚMERO DE SUSHI SERVICE y se le debitarían a su billetera.
--    Sin plantillas configuradas, cada envío se corta antes de llamar a Twilio
--    (`sendCheckinTemplate` → 'no_template_configured') y no pasa nada. Por eso este
--    script NO clona admin_settings de otro tenant: clonaría esos SIDs.
--
-- Idempotente: se puede correr varias veces; no pisa datos ya creados
-- (tiers y settings solo se insertan si el tenant aún no los tiene).
--
-- Ejecutar en el SQL Editor del Supabase compartido.
-- Ver docs/04-deployment.md §6 (onboarding) y §6-bis (cliente sin WhatsApp).
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- ═══════════════ PARÁMETROS — EDITAR SOLO ESTE BLOQUE ═══════════════
  p_slug             text    := 'nuevo-cliente';          -- kebab-case, único. Lo usan n8n y los crons
  p_name             text    := 'Nombre del negocio';     -- razón social / nombre interno
  p_business_type    text    := 'restaurant';             -- restaurant | barbershop | beauty_salon
  p_domain           text    := NULL;                     -- 'clubcliente.constelarys.com' — dejar NULL hasta que el DNS propague

  -- Marca (se resuelve por dominio → src/lib/branding.ts)
  p_brand_name       text    := 'Marca Comercial';
  p_brand_short      text    := 'Marca';
  p_brand_tagline    text    := NULL;
  p_staff_role_label text    := 'Mesero';                 -- Barbero | Barista | Estilista…
  p_visit_label      text    := 'visita';                 -- cita | servicio
  p_station_label    text    := 'mesa';                   -- silla | cabina
  p_whatsapp_link    text    := NULL;                     -- 'https://wa.me/57XXXXXXXXXX' — WhatsApp HUMANO del negocio
  p_instagram_url    text    := NULL;                     -- perfil de Instagram — contacto alterno si no hay WhatsApp
  p_google_maps_url  text    := NULL;                     -- URL de reseñas de Google
  p_delivery_phone   text    := NULL;                     -- opcional
  p_card_bg          text    := NULL;                     -- gradiente CSS tarjeta (opcional)
  p_page_bg          text    := NULL;                     -- gradiente CSS fondo (opcional)

  -- Contacto / facturación
  p_owner_email      text    := NULL;
  p_owner_phone      text    := NULL;
  p_price_msg_cop    numeric := 100;                      -- tarifa por mensaje (solo aplica cuando haya WhatsApp)

  -- Operación
  p_avg_ticket       text    := '35000';                  -- ticket promedio COP (ROI del dashboard)

  -- Sede para geolocalización del check-in (opcional: dejar p_loc_lat NULL para omitir)
  p_loc_name         text    := 'Sede principal';
  p_loc_address      text    := NULL;
  p_loc_lat          numeric := NULL;
  p_loc_lon          numeric := NULL;
  p_loc_radius       int     := 150;
  -- ════════════════════ FIN DE PARÁMETROS ════════════════════

  v_tenant uuid;
  v_config jsonb;
BEGIN
  -- ─── 1. Config de marca (los NULL se descartan → caen al default del sistema) ───
  v_config := jsonb_strip_nulls(jsonb_build_object(
    'brand_name',            p_brand_name,
    'brand_short',           p_brand_short,
    'brand_tagline',         p_brand_tagline,
    'staff_role_label',      p_staff_role_label,
    'visit_label',           p_visit_label,
    'station_label',         p_station_label,
    'whatsapp_link',         p_whatsapp_link,
    'instagram_url',         p_instagram_url,
    'google_maps_url',       p_google_maps_url,
    'delivery_phone',        p_delivery_phone,
    'card_bg',               p_card_bg,
    'page_bg',               p_page_bg,
    'has_delivery_webhook',  false   -- sin WhatsApp no hay flujo de domicilios por n8n
  ));

  -- ─── 2. Tenant (twilio_* quedan NULL a propósito → ver cabecera) ───
  INSERT INTO tenants (
    slug, name, business_type, config, domain, is_active, is_demo,
    price_per_message_cop, owner_email, owner_phone
  )
  VALUES (
    p_slug, p_name, p_business_type, v_config, p_domain, true, false,
    p_price_msg_cop, p_owner_email, p_owner_phone
  )
  ON CONFLICT (slug) DO UPDATE SET
    name          = EXCLUDED.name,
    business_type = EXCLUDED.business_type,
    config        = tenants.config || EXCLUDED.config,  -- merge: no borra lo ya editado en el dashboard
    domain        = COALESCE(EXCLUDED.domain, tenants.domain),
    owner_email   = COALESCE(EXCLUDED.owner_email, tenants.owner_email),
    owner_phone   = COALESCE(EXCLUDED.owner_phone, tenants.owner_phone),
    is_active     = true
  RETURNING id INTO v_tenant;

  -- ─── 3. Tiers de recompensa (sin esto NO hay tier_unlocked ni Mystery Box) ───
  -- Defaults genéricos del sistema (migración 00016). El cliente los edita en
  -- Dashboard → Recompensas. NO se clonan los de otro tenant (premios distintos).
  IF NOT EXISTS (SELECT 1 FROM reward_tiers WHERE tenant_id = v_tenant) THEN
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
  END IF;

  -- ─── 4. admin_settings — SOLO claves sin Twilio (ver cabecera) ───
  -- Valores = defaults del código (src/constants/rewards.ts), explícitos para que
  -- el Calibrador de Puntos del dashboard los muestre ya poblados.
  INSERT INTO admin_settings (key, value, tenant_id, updated_at)
  SELECT s.key, s.value, v_tenant, now()
  FROM (VALUES
    ('points_system_enabled',      'true'),
    ('points_per_visit_min',       '60'),
    ('points_per_visit_max',       '90'),
    ('welcome_bonus_points_min',   '75'),
    ('welcome_bonus_points_max',   '90'),
    ('shortfall_min',              '5'),
    ('shortfall_max',              '30'),
    ('event_bonus_points',         '25'),
    ('pity_timer_threshold',       '2'),
    ('checkin_mode',               'auto'),          -- 'staff_verified' si el mesero debe validar
    ('checkin_first_visit_free',   'true'),
    ('geo_strict_mode',            'false'),         -- 'true' solo si se cargó la sede (paso 5)
    ('avg_ticket',                 p_avg_ticket),
    ('reactivation_soft_days',     '15'),
    ('reactivation_aggressive_days','25')
  ) AS s(key, value)
  WHERE NOT EXISTS (
    SELECT 1 FROM admin_settings a WHERE a.tenant_id = v_tenant AND a.key = s.key
  );

  -- ─── 5. Sede (geolocalización del check-in) — opcional ───
  IF p_loc_lat IS NOT NULL AND p_loc_lon IS NOT NULL THEN
    INSERT INTO restaurant_locations (tenant_id, name, address, lat, lon, radius_meters, is_active)
    SELECT v_tenant, p_loc_name, p_loc_address, p_loc_lat, p_loc_lon, p_loc_radius, true
    WHERE NOT EXISTS (SELECT 1 FROM restaurant_locations WHERE tenant_id = v_tenant);
  END IF;

  RAISE NOTICE 'Tenant listo: id=% slug=% (WhatsApp APAGADO: sin credenciales Twilio y sin *_template_sid)', v_tenant, p_slug;
END $$;

-- ─── Verificación (última fila creada) ───
SELECT
  t.id, t.slug, t.name, t.domain, t.is_active, t.is_demo,
  (t.twilio_subaccount_sid IS NULL)                                              AS twilio_sin_configurar,
  (SELECT count(*) FROM reward_tiers    r WHERE r.tenant_id = t.id)              AS tiers,
  (SELECT count(*) FROM admin_settings  s WHERE s.tenant_id = t.id)              AS settings,
  (SELECT count(*) FROM admin_settings  s WHERE s.tenant_id = t.id
                                          AND s.key LIKE '%template_sid')        AS template_sids_debe_ser_0
FROM tenants t
ORDER BY t.created_at DESC
LIMIT 1;

-- ═══════════════════════════════════════════════════════════════
-- PASOS MANUALES (fuera de este script)
-- ═══════════════════════════════════════════════════════════════
--
-- A) Admin del cliente — Supabase → Authentication → Users → Add user
--    (email + password), y luego tagear su tenant en el JWT:
--
--    UPDATE auth.users
--    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
--                            || jsonb_build_object('tenant_id',
--                               (SELECT id FROM tenants WHERE slug = 'nuevo-cliente')::text)
--    WHERE email = 'admin@cliente.com';
--
--    ⚠️ Debe hacer LOGIN (no basta refrescar) para que el JWT traiga el tenant_id.
--
-- B) Dominio — vercel.com → proyecto `sushi-service-fidelity-system` → Settings →
--    Domains → Add `clubcliente.constelarys.com` → crear el CNAME que indique Vercel.
--    Cuando propague:
--       UPDATE tenants SET domain = 'clubcliente.constelarys.com' WHERE slug = 'nuevo-cliente';
--    (NO se crea proyecto nuevo ni se tocan env vars — todas son compartidas.)
--
-- C) Meseros (app /mesero) — opcional, no requiere WhatsApp:
--    INSERT INTO staff_users (tenant_id, name, phone, pin, role, is_active)
--    SELECT id, 'Nombre', '573001234567', '1234', 'staff', true
--    FROM tenants WHERE slug = 'nuevo-cliente';
--
-- D) CUANDO LLEGUE TWILIO (encender WhatsApp) — en este orden:
--    1. UPDATE tenants SET twilio_subaccount_sid=…, twilio_subaccount_auth_token=…,
--         twilio_messaging_service_sid=…, twilio_whatsapp_number='whatsapp:+57…'
--       WHERE slug = 'nuevo-cliente';
--    2. Recargar billetera (Dashboard admin → Wallets) — si el saldo es 0 las
--       campañas masivas se bloquean.
--    3. Recién ahí, cargar los `*_template_sid` en Dashboard → Ajustes.
--       Cargarlos ANTES = enviar desde el número de Sushi Service (ver cabecera).
-- ═══════════════════════════════════════════════════════════════
