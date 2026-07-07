-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00030: Quitar el DEFAULT puente de tenant_id
-- Fecha: 2026-07-05
-- Descripción: 00028 dejó un DEFAULT = tenant de Sushi Service en las 18 tablas para
--   que la app siguiera escribiendo sin código tenant-aware (puente mono-tenant).
--   Ahora que TODO el código inserta tenant_id explícito (Milestone 2 completo),
--   quitamos ese default: así un INSERT que olvide tenant_id FALLA en vez de
--   contaminar silenciosamente a Sushi Service con datos de otro tenant.
--
-- 🔴 ORDEN: correr esta migración SOLO DESPUÉS de:
--     1) Desplegar el código tenant-aware (Milestone 2).
--     2) Importar los datos de Sushi Fun (todos con tenant_id).
--     3) Verificar en producción que check-in, delivery y campañas escriben con
--        el tenant correcto (smoke test de la ventana).
--   Si se corre antes, cualquier INSERT sin tenant_id de la app vieja fallará.
--
-- Riesgo: MEDIO — cambia el comportamiento de escritura. Reversible: volver a
--   correr el bloque SET DEFAULT de 00028 si algo quedó sin migrar.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';  -- Sushi Service
  tables text[] := ARRAY[
    'customers','visits','rewards','authorized_numbers','campaigns','campaign_messages',
    'admin_settings','restaurant_events','restaurant_locations','reward_tiers',
    'point_transactions','mystery_box_results','mystery_box_global_caps','staff_users',
    'staff_devices','message_logs','reward_redemptions','imported_contacts'
  ];
  t text;
  v_null_count bigint;
BEGIN
  -- Guard: si alguna tabla aún tiene filas sin tenant_id, ABORTAR (algo no se migró).
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id IS NULL', t) INTO v_null_count;
    IF v_null_count > 0 THEN
      RAISE EXCEPTION 'ABORTADO: % filas sin tenant_id en la tabla %. Revisar antes de quitar el DEFAULT.', v_null_count, t;
    END IF;
  END LOOP;

  -- Todas las tablas están limpias → quitar el DEFAULT puente.
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id DROP DEFAULT', t);
    RAISE NOTICE 'DEFAULT quitado de %', t;
  END LOOP;

  RAISE NOTICE 'OK: DEFAULT puente eliminado de las 18 tablas. Los INSERT sin tenant_id ahora fallan (comportamiento deseado).';
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Verificación (correr aparte tras la migración):
--   SELECT table_name, column_default
--   FROM information_schema.columns
--   WHERE column_name = 'tenant_id' AND table_schema = 'public'
--   ORDER BY table_name;
--   -- Esperado: column_default = NULL en las 18 tablas.
-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00030
-- ═══════════════════════════════════════════════════════════════
