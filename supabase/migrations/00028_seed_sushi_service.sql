-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00028: Seed Sushi Service (tenant #1) + finalizar constraints
-- Fecha: 2026-07-04
-- Asigna tenant_id a TODOS los datos existentes, pone DEFAULT = Sushi (puente
-- mono-tenant para que la app actual siga escribiendo sin pasar tenant_id),
-- activa NOT NULL, crea uniques compuestos y tagea los usuarios admin.
--
-- ⚠️ EL DEFAULT ES UN PUENTE MONO-TENANT. Antes de dar de alta un tenant #2:
--    1) hacer el Milestone 2 (queries de la app filtran/insertan tenant_id),
--    2) quitar el DEFAULT de cada tabla (ALTER COLUMN tenant_id DROP DEFAULT).
--   Si no, los INSERT del tenant #2 caerían por defecto en Sushi.
--
-- Requiere: 00024, 00025, 00026, 00027 aplicadas. Idempotente por slug.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Tenant Sushi Service (UUID fijo para reproducibilidad) ───
INSERT INTO tenants (id, slug, name, business_type, config, is_active)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'sushi-service',
  'Sushi Service',
  'restaurant',
  '{
    "brand_name": "Sushi Service",
    "staff_role_label": "Mesero",
    "visit_label": "visita",
    "station_label": "mesa",
    "has_delivery_webhook": true
  }'::jsonb,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. Backfill + DEFAULT (puente) + NOT NULL en las 18 tablas + tag de admins ───
DO $$
DECLARE
  v_tenant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  tables text[] := ARRAY[
    'customers','visits','rewards','authorized_numbers','campaigns','campaign_messages',
    'admin_settings','restaurant_events','restaurant_locations','reward_tiers',
    'point_transactions','mystery_box_results','mystery_box_global_caps','staff_users',
    'staff_devices','message_logs','reward_redemptions','imported_contacts'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL', t, v_tenant);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET DEFAULT %L', t, v_tenant);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', t);
  END LOOP;

  -- Tagear a los usuarios admin existentes con el tenant de Sushi.
  -- Sin esto, el path AUTENTICADO (current_tenant_id() = NULL) no vería datos.
  -- (Los cambios de app_metadata se reflejan en el JWT tras re-login / refresh.)
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                          || jsonb_build_object('tenant_id', v_tenant::text)
  WHERE COALESCE(raw_app_meta_data ->> 'tenant_id', '') = '';
END $$;

-- ─── 3. admin_settings: PK compuesto (key, tenant_id) ───
ALTER TABLE admin_settings DROP CONSTRAINT IF EXISTS admin_settings_pkey;
ALTER TABLE admin_settings ADD PRIMARY KEY (key, tenant_id);

-- ─── 4. Uniques compuestos (con tenant_id) ───
ALTER TABLE customers
  ADD CONSTRAINT customers_phone_tenant_key UNIQUE (phone, tenant_id);
ALTER TABLE authorized_numbers
  ADD CONSTRAINT authorized_numbers_phone_tenant_key UNIQUE (phone, tenant_id);
ALTER TABLE staff_users
  ADD CONSTRAINT staff_users_phone_tenant_key UNIQUE (phone, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_imported_contacts_phone_tenant
  ON imported_contacts (phone, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS rewards_visit_milestone_tenant_unique
  ON rewards (visit_milestone, tenant_id) WHERE visit_milestone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reward_tiers_threshold_tenant_unique
  ON reward_tiers (point_threshold, tenant_id) WHERE is_active = true;

-- ─── 5. Verificación final ───
DO $$
DECLARE v_null_customers bigint; v_tenants bigint;
BEGIN
  SELECT count(*) INTO v_null_customers FROM customers WHERE tenant_id IS NULL;
  IF v_null_customers > 0 THEN
    RAISE EXCEPTION '00028 FALLO: % clientes sin tenant_id', v_null_customers;
  END IF;
  SELECT count(*) INTO v_tenants FROM tenants;
  RAISE NOTICE '00028 OK: seed completo. Tenants=%, Sushi=a1b2c3d4-e5f6-7890-abcd-ef1234567890', v_tenants;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00028
-- ═══════════════════════════════════════════════════════════════
