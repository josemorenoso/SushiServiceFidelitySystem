-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00025: tenant_id (nullable) en las 18 tablas + drop de uniques globales
-- Fecha: 2026-07-04
-- Estrategia segura sin downtime:
--   00025 → agrega tenant_id NULLABLE + índices (esta migración)
--   00028 → backfill Sushi + DEFAULT + NOT NULL + uniques compuestos
-- Requiere: 00024 (tabla tenants) ya aplicada.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Agregar tenant_id (nullable) + índice por tenant a las 18 tablas ───
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','visits','rewards','authorized_numbers','campaigns','campaign_messages',
    'admin_settings','restaurant_events','restaurant_locations','reward_tiers',
    'point_transactions','mystery_box_results','mystery_box_global_caps','staff_users',
    'staff_devices','message_logs','reward_redemptions','imported_contacts'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES tenants(id) ON DELETE RESTRICT',
      t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I(tenant_id)',
      'idx_' || t || '_tenant', t
    );
  END LOOP;
END $$;

-- ─── 2. Drop de constraints/índices únicos GLOBALES ───
-- Se recrean como compuestos (con tenant_id) en 00028, después del backfill.
ALTER TABLE customers          DROP CONSTRAINT IF EXISTS customers_phone_key;
ALTER TABLE authorized_numbers DROP CONSTRAINT IF EXISTS authorized_numbers_phone_key;
ALTER TABLE staff_users        DROP CONSTRAINT IF EXISTS staff_users_phone_key;

-- OJO: estos son ÍNDICES, no constraints → DROP INDEX (el plan de junio usaba
-- DROP CONSTRAINT y habría fallado).
DROP INDEX IF EXISTS idx_imported_contacts_phone;
DROP INDEX IF EXISTS rewards_visit_milestone_unique;
DROP INDEX IF EXISTS reward_tiers_threshold_unique;

-- Verificación
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema='public' AND column_name='tenant_id';
  RAISE NOTICE '00025 OK: % tablas con tenant_id (esperado >= 18)', v_count;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00025
-- ═══════════════════════════════════════════════════════════════
