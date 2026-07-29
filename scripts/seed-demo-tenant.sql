-- ═══════════════════════════════════════════════════════════════
-- seed-demo-tenant.sql — Clona/resetea el tenant demo de ventas
-- ═══════════════════════════════════════════════════════════════
-- Fuente: Sushi Service (cliente más antiguo, id fijo desde 00028).
-- Destino: tenant 'demo-ventas' (is_demo=true) — nunca envía WhatsApp real,
--   ver el guard en src/services/whatsapp.service.ts sendTemplateMessage().
--
-- Idempotente: se puede correr las veces que haga falta para RESETEAR el
-- demo (borra los datos clonados del tenant demo y los vuelve a copiar
-- desde Sushi Service). Nunca toca los datos de Sushi Service (solo SELECT).
--
-- Requiere: 00034_demo_tenant_flag.sql ya aplicada.
-- Ejecutar en el SQL Editor de Supabase (mismo patrón que el onboarding
-- de clientes, ver docs/04-deployment.md §6).
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_source_tenant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; -- Sushi Service
  v_demo_tenant uuid;
BEGIN
  -- ─── 1. Crear (o recuperar) el tenant demo ───
  INSERT INTO tenants (slug, name, business_type, config, is_active, is_demo, price_per_message_cop)
  SELECT
    'demo-ventas',
    'Demo Ventas',
    business_type,
    config || '{"brand_name": "Demo Ventas", "brand_short": "Demo"}'::jsonb,
    true,
    true,
    100
  FROM tenants WHERE id = v_source_tenant
  ON CONFLICT (slug) DO UPDATE SET is_demo = true, is_active = true;

  SELECT id INTO v_demo_tenant FROM tenants WHERE slug = 'demo-ventas';

  -- ─── 2. Limpiar datos previos del tenant demo (reset) ───
  -- Orden: hijos antes que padres. tenant_id tiene ON DELETE RESTRICT (00025),
  -- así que nunca se borra la fila de tenants, solo su data clonada.
  --
  -- Primero lo que el USO del demo genera solo (vendedores probando mystery box,
  -- creando una campaña de prueba, etc.) — reward_redemptions.tier_id es RESTRICT
  -- (no cascade), así que debe borrarse ANTES que reward_tiers o la 2da línea
  -- de este bloque falla con foreign key violation en un reset.
  DELETE FROM reward_redemptions WHERE tenant_id = v_demo_tenant;
  DELETE FROM campaign_messages  WHERE tenant_id = v_demo_tenant;
  DELETE FROM campaigns          WHERE tenant_id = v_demo_tenant;
  DELETE FROM message_logs       WHERE tenant_id = v_demo_tenant;
  DELETE FROM staff_devices      WHERE tenant_id = v_demo_tenant;

  -- Data clonada (base del demo). point_transactions, mystery_box_results,
  -- reward_grants y review_events caen en cascada al borrar customers/reward_tiers.
  DELETE FROM visits             WHERE tenant_id = v_demo_tenant;
  DELETE FROM customers          WHERE tenant_id = v_demo_tenant;
  DELETE FROM reward_tiers       WHERE tenant_id = v_demo_tenant;
  DELETE FROM campaign_rewards   WHERE tenant_id = v_demo_tenant;
  DELETE FROM restaurant_events  WHERE tenant_id = v_demo_tenant;
  DELETE FROM admin_settings     WHERE tenant_id = v_demo_tenant;
  DELETE FROM staff_users        WHERE tenant_id = v_demo_tenant;
  DELETE FROM authorized_numbers WHERE tenant_id = v_demo_tenant;

  -- ─── 3. Clonar customers (mapa old_id -> new_id) ───
  CREATE TEMP TABLE _customer_map (old_id uuid, new_id uuid) ON COMMIT DROP;
  INSERT INTO _customer_map (old_id, new_id)
  SELECT id, gen_random_uuid() FROM customers WHERE tenant_id = v_source_tenant;

  INSERT INTO customers (
    id, tenant_id, phone, name, birthday, city, total_visits, last_visit_at,
    source_channels, accepts_marketing, checkin_lat, checkin_lon, checkin_distance_meters,
    total_points, current_tier, mystery_box_low_streak, created_at, updated_at
  )
  SELECT
    m.new_id, v_demo_tenant, c.phone, c.name, c.birthday, c.city, c.total_visits, c.last_visit_at,
    c.source_channels, c.accepts_marketing, c.checkin_lat, c.checkin_lon, c.checkin_distance_meters,
    c.total_points, c.current_tier, c.mystery_box_low_streak, c.created_at, c.updated_at
  FROM customers c JOIN _customer_map m ON m.old_id = c.id
  WHERE c.tenant_id = v_source_tenant;

  -- ─── 4. Clonar visits (remapea customer_id) ───
  INSERT INTO visits (
    id, tenant_id, customer_id, source, notes, address, payment_method, amount,
    raw_message, table_number, created_at
  )
  SELECT
    gen_random_uuid(), v_demo_tenant, m.new_id, v.source, v.notes, v.address, v.payment_method,
    v.amount, v.raw_message, v.table_number, v.created_at
  FROM visits v JOIN _customer_map m ON m.old_id = v.customer_id
  WHERE v.tenant_id = v_source_tenant;

  -- ─── 5. Clonar reward_tiers (config de puntos + mystery box) ───
  INSERT INTO reward_tiers (
    id, tenant_id, tier_name, point_threshold, safe_reward_title,
    mystery_box_enabled, mystery_prizes, is_black, sort_order, is_active, created_at
  )
  SELECT
    gen_random_uuid(), v_demo_tenant, tier_name, point_threshold, safe_reward_title,
    mystery_box_enabled, mystery_prizes, is_black, sort_order, is_active, created_at
  FROM reward_tiers WHERE tenant_id = v_source_tenant;

  -- ─── 6. Clonar campaign_rewards (catálogo de premios de campaña) ───
  INSERT INTO campaign_rewards (id, tenant_id, title, description, is_active, created_at)
  SELECT gen_random_uuid(), v_demo_tenant, title, description, is_active, created_at
  FROM campaign_rewards WHERE tenant_id = v_source_tenant;

  -- ─── 7. Clonar restaurant_events (calendario) — sin campaign_id (no se clonan campañas) ───
  INSERT INTO restaurant_events (
    id, tenant_id, title, description, event_date, event_time, event_type, send_mode,
    scheduled_send_at, filters, media_url, media_type, content_sid, status, blackout_days,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), v_demo_tenant, title, description, event_date, event_time, event_type, send_mode,
    scheduled_send_at, filters, media_url, media_type, content_sid, 'planned', blackout_days,
    created_at, updated_at
  FROM restaurant_events WHERE tenant_id = v_source_tenant;

  -- ─── 8. Clonar admin_settings (CRÍTICO: sin esto no hay tiers/plantillas configuradas) ───
  INSERT INTO admin_settings (key, value, tenant_id, updated_at)
  SELECT key, value, v_demo_tenant, now()
  FROM admin_settings WHERE tenant_id = v_source_tenant;

  -- ─── 9. Clonar staff_users (para demo del flujo de mesero) ───
  INSERT INTO staff_users (id, tenant_id, name, phone, pin, role, is_active, created_at, updated_at)
  SELECT gen_random_uuid(), v_demo_tenant, name, phone, pin, role, is_active, created_at, updated_at
  FROM staff_users WHERE tenant_id = v_source_tenant;

  -- ─── 10. Clonar authorized_numbers (para demo del flujo de domicilios) ───
  INSERT INTO authorized_numbers (id, tenant_id, phone, name, is_active, created_at)
  SELECT gen_random_uuid(), v_demo_tenant, phone, name, is_active, created_at
  FROM authorized_numbers WHERE tenant_id = v_source_tenant;

  -- ─── 11. Billetera con saldo grande — nunca debe bloquear una campaña de demo ───
  -- No se debita nunca de verdad (sendTemplateMessage() nunca pone twilio_sid para
  -- un tenant demo), así que esto es "de una sola vez": no hace falta recargar.
  INSERT INTO tenant_wallet_transactions (tenant_id, type, amount_cop, source, created_by, notes)
  SELECT v_demo_tenant, 'topup', 50000000, 'manual', 'system', 'Saldo demo — no se cobra nunca (ver whatsapp.service.ts)'
  WHERE NOT EXISTS (
    SELECT 1 FROM tenant_wallet_transactions WHERE tenant_id = v_demo_tenant AND type = 'topup'
  );

  RAISE NOTICE 'Tenant demo listo: id=%, clientes clonados=%', v_demo_tenant,
    (SELECT count(*) FROM customers WHERE tenant_id = v_demo_tenant);
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Paso manual (una sola vez, fuera de este script — igual que el onboarding
-- normal, ver docs/04-deployment.md §6 Paso 5):
--
-- 1. Supabase → Authentication → Users → Add user
--    Email/password compartidos para todo el equipo de ventas.
--
-- 2. Tagear el tenant_id en su JWT:
--    UPDATE auth.users
--    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
--                            || jsonb_build_object('tenant_id',
--                               (SELECT id FROM tenants WHERE slug = 'demo-ventas')::text)
--    WHERE email = 'demo@constelarys.com';  -- ajustar email
--
-- 3. Cada vendedor inicia sesión con esas credenciales — Supabase Auth permite
--    sesiones concurrentes sin problema, cada quien tiene su propia cookie/JWT.
-- ═══════════════════════════════════════════════════════════════
