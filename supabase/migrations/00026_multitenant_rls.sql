-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00026: Reescritura de RLS para multitenant
-- Fecha: 2026-07-04
-- Principio: el usuario AUTENTICADO (anon key + JWT) ve SOLO su tenant.
--   El SERVICE ROLE bypasa RLS por diseño (lo usan crons/webhooks/servicios),
--   por eso NO se crean policies "USING(true)": serían una fuga hacia usuarios
--   autenticados de otros tenants. El super_admin ve todo (is_super_admin()).
--
-- IMPORTANTE (verificado 2026-07-04): esta app accede a datos casi siempre con
--   SERVICE_ROLE_KEY (getServiceClient), que salta RLS. Por tanto este RLS NO
--   aísla por sí solo el path de service role: el aislamiento real requiere
--   filtrar tenant_id en cada query de la app (Milestone 2 del plan). Este RLS
--   protege el path autenticado directo y deja la base lista y correcta.
--
-- Enfoque robusto: se DROPEAN dinámicamente TODAS las políticas existentes de las
--   18 tablas (no por nombre), evitando el bug del plan de junio (nombres errados
--   con IF EXISTS dejaban políticas viejas vivas → fuga entre tenants).
-- Requiere: 00024 (helpers) y 00025 (tenant_id) aplicadas.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  tables text[] := ARRAY[
    'customers','visits','rewards','authorized_numbers','campaigns','campaign_messages',
    'admin_settings','restaurant_events','restaurant_locations','reward_tiers',
    'point_transactions','mystery_box_results','mystery_box_global_caps','staff_users',
    'staff_devices','message_logs','reward_redemptions','imported_contacts'
  ];
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    -- Asegurar RLS habilitado
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Borrar TODAS las políticas existentes de la tabla (cualquier nombre)
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;

    -- Crear la política multitenant única (solo path autenticado; service role bypasa)
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL '
      'USING (tenant_id = current_tenant_id() OR is_super_admin()) '
      'WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin())',
      'tenant_all_' || t, t
    );
  END LOOP;
END $$;

-- Verificación: cada tabla debe tener exactamente 1 política 'tenant_all_*'
DO $$
DECLARE v_old int; v_new int;
BEGIN
  SELECT count(*) INTO v_old FROM pg_policies
  WHERE schemaname='public' AND (policyname LIKE 'admin_%' OR policyname LIKE 'service_%');
  SELECT count(*) INTO v_new FROM pg_policies
  WHERE schemaname='public' AND policyname LIKE 'tenant_all_%';
  RAISE NOTICE '00026 OK: % políticas tenant_all_* creadas, % políticas admin_/service_ restantes (esperado 0 en las 18 tablas)', v_new, v_old;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00026
-- ═══════════════════════════════════════════════════════════════
