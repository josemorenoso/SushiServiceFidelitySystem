-- ═══════════════════════════════════════════════════════════════
-- ALTA — Frangal.mde  (slug: cafe-frangal)  · 2026-08-15
-- Cliente SIN Twilio/WhatsApp. Ver docs/04-deployment.md §6-bis.
-- Generado desde scripts/seed-new-tenant.sql con los datos del cliente.
-- Pegar COMPLETO en el SQL Editor del Supabase compartido y ejecutar.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  p_slug             text    := 'cafe-frangal';
  p_name             text    := 'Frangal.mde';
  p_business_type    text    := 'restaurant';
  p_domain           text    := 'frangalmde.constelarys.com';   -- inerte hasta que el DNS propague

  p_brand_name       text    := 'Frangal.mde';
  p_brand_short      text    := 'Frangal';
  p_brand_tagline    text    := NULL;
  p_staff_role_label text    := 'Mesero';        -- cambiar a 'Barista' si aplica
  p_visit_label      text    := 'visita';
  p_station_label    text    := 'mesa';
  p_whatsapp_link    text    := NULL;            -- no tienen WhatsApp de atención
  p_instagram_url    text    := 'https://www.instagram.com/frangal.mde';
  p_google_maps_url  text    := 'https://search.google.com/local/writereview?placeid=ChIJ6VVru3qDRo4REeMospJCTDg';
  p_delivery_phone   text    := NULL;
  p_card_bg          text    := NULL;
  p_page_bg          text    := NULL;

  p_owner_email      text    := 'frangal@gmail.com';
  p_owner_phone      text    := NULL;
  p_price_msg_cop    numeric := 100;

  p_avg_ticket       text    := '35000';         -- PROVISIONAL — ajustar en Dashboard → Ajustes

  p_loc_name         text    := 'Sede principal';
  p_loc_address      text    := NULL;
  p_loc_lat          numeric := NULL;            -- sin geocerca por ahora
  p_loc_lon          numeric := NULL;
  p_loc_radius       int     := 150;

  v_tenant uuid;
  v_config jsonb;
BEGIN
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
    'has_delivery_webhook',  false
  ));

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
    config        = tenants.config || EXCLUDED.config,
    domain        = COALESCE(EXCLUDED.domain, tenants.domain),
    owner_email   = COALESCE(EXCLUDED.owner_email, tenants.owner_email),
    owner_phone   = COALESCE(EXCLUDED.owner_phone, tenants.owner_phone),
    is_active     = true
  RETURNING id INTO v_tenant;

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

  -- OJO: ninguna clave *_template_sid — sin Twilio propio esos SIDs harían que los
  -- mensajes salieran desde el número de Sushi Service (ver docs/04-deployment.md §6-bis).
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
    ('checkin_mode',               'auto'),
    ('checkin_first_visit_free',   'true'),
    ('geo_strict_mode',            'false'),
    ('avg_ticket',                 p_avg_ticket),
    ('reactivation_soft_days',     '15'),
    ('reactivation_aggressive_days','25')
  ) AS s(key, value)
  WHERE NOT EXISTS (
    SELECT 1 FROM admin_settings a WHERE a.tenant_id = v_tenant AND a.key = s.key
  );

  IF p_loc_lat IS NOT NULL AND p_loc_lon IS NOT NULL THEN
    INSERT INTO restaurant_locations (tenant_id, name, address, lat, lon, radius_meters, is_active)
    SELECT v_tenant, p_loc_name, p_loc_address, p_loc_lat, p_loc_lon, p_loc_radius, true
    WHERE NOT EXISTS (SELECT 1 FROM restaurant_locations WHERE tenant_id = v_tenant);
  END IF;

  RAISE NOTICE 'Frangal.mde listo: id=%', v_tenant;
END $$;

-- ─── Verificación ───
SELECT
  t.id, t.slug, t.name, t.domain, t.is_active, t.is_demo,
  (t.twilio_subaccount_sid IS NULL)                                       AS twilio_sin_configurar,
  (SELECT count(*) FROM reward_tiers   r WHERE r.tenant_id = t.id)        AS tiers,
  (SELECT count(*) FROM admin_settings s WHERE s.tenant_id = t.id)        AS settings,
  (SELECT count(*) FROM admin_settings s WHERE s.tenant_id = t.id
                                         AND s.key LIKE '%template_sid')  AS template_sids_debe_ser_0
FROM tenants t
WHERE t.slug = 'cafe-frangal';


-- ═══════════════════════════════════════════════════════════════
-- PASO 2 — Correr DESPUÉS de crear el usuario en Supabase Auth
--   (Authentication → Users → Add user: frangal@gmail.com / 21457892,
--    marcar "Auto Confirm User")
-- ═══════════════════════════════════════════════════════════════

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                        || jsonb_build_object('tenant_id',
                           (SELECT id FROM tenants WHERE slug = 'cafe-frangal')::text)
WHERE email = 'frangal@gmail.com';

-- Verificar que quedó tageado:
SELECT email, raw_app_meta_data->>'tenant_id' AS tenant_id FROM auth.users WHERE email = 'frangal@gmail.com';
