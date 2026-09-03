-- ═══════════════════════════════════════════════════════════════
-- ¿QUÉ MIGRACIONES ESTÁN APLICADAS EN ESTA BASE?
-- Pegar TODO en el SQL Editor de Supabase (proyecto Sushi Service) y correr.
-- Es 100% SOLO-LECTURA: no crea, no borra, no toca una sola fila.
--
-- Cómo funciona: cada migración deja un "rastro" en el catálogo de Postgres
-- (una tabla, una columna, un constraint, una policy, una función). Se busca
-- ese rastro. NO depende de supabase_migrations.schema_migrations, que está
-- vacío si las migraciones se pegaron a mano en el SQL Editor.
-- ═══════════════════════════════════════════════════════════════

WITH probe AS (
  SELECT * FROM (VALUES
    ('00001','initial_schema',         'tabla customers',                      (to_regclass('public.customers')                  IS NOT NULL)),
    ('00002','authorized_numbers',     'tabla authorized_numbers',             (to_regclass('public.authorized_numbers')         IS NOT NULL)),
    ('00003','delivery_fields',        'visits.address',                       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='visits'    AND column_name='address')),
    ('00004','campaigns',              'tabla campaigns',                      (to_regclass('public.campaigns')                  IS NOT NULL)),
    ('00005','add_city',               'customers.city',                       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='city')),
    ('00006','source_channels',        'customers.source_channels',            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='source_channels')),
    ('00007','admin_settings',         'tabla admin_settings',                 (to_regclass('public.admin_settings')             IS NOT NULL)),
    ('00008','accepts_marketing',      'customers.accepts_marketing',          EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='accepts_marketing')),
    ('00009','table_number',           'visits.table_number',                  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='visits'    AND column_name='table_number')),
    ('00010','rewards_opt_milestone',  'rewards.visit_milestone NULLABLE',     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rewards'   AND column_name='visit_milestone' AND is_nullable='YES')),
    ('00011','rewards_black_tier',     'rewards.is_black',                     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rewards'   AND column_name='is_black')),
    ('00012','calendar_events',        'tabla restaurant_events',              (to_regclass('public.restaurant_events')          IS NOT NULL)),
    ('00013','points_mystery_box',     'tabla point_transactions',             (to_regclass('public.point_transactions')         IS NOT NULL)),
    ('00014','geolocation',            'tabla restaurant_locations',           (to_regclass('public.restaurant_locations')       IS NOT NULL)),
    ('00015','service_role_policies',  'policy service_role_select_customers', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='service_role_select_customers')),
    ('00018','staff_qr_scan',          'tabla staff_users',                    (to_regclass('public.staff_users')                IS NOT NULL)),
    ('00020','message_logs',           'tabla message_logs',                   (to_regclass('public.message_logs')               IS NOT NULL)),
    ('00021','whatsapp_opt_out',       'customers.whatsapp_opt_out_at',        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='whatsapp_opt_out_at')),
    ('00022','reward_redemptions',     'tabla reward_redemptions',             (to_regclass('public.reward_redemptions')         IS NOT NULL)),
    ('00023','imported_contacts',      'tabla imported_contacts',              (to_regclass('public.imported_contacts')          IS NOT NULL)),
    ('00024','tenants',                'tabla tenants + current_tenant_id()',  (to_regclass('public.tenants') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_proc WHERE proname='current_tenant_id'))),
    ('00025','add_tenant_id',          'customers.tenant_id',                  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='tenant_id')),
    ('00026','multitenant_rls',        'policy tenant_all_customers',          EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='tenant_all_customers')),
    ('00027','wallet',                 'tabla tenant_wallet_transactions',     (to_regclass('public.tenant_wallet_transactions') IS NOT NULL)),
    ('00028','seed_sushi_service',     'constraint customers_phone_tenant_key',EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customers_phone_tenant_key')),
    ('00029','tenant_domain',          'tenants.domain',                       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants'   AND column_name='domain')),
    ('00030','drop_tenant_defaults',   'customers.tenant_id SIN default',      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='tenant_id' AND column_default IS NULL)),
    ('00031','reward_grants',          'tabla reward_grants',                  (to_regclass('public.reward_grants')              IS NOT NULL)),
    ('00032','review_tracking',        'tabla review_events',                  (to_regclass('public.review_events')              IS NOT NULL)),
    ('00033','wallet_debits',          'tenant_wallet_transactions.message_log_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenant_wallet_transactions' AND column_name='message_log_id')),
    ('00034','demo_tenant_flag',       'tenants.is_demo',                      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants'   AND column_name='is_demo')),
    ('00035','aios_constelarys_role',  'ROLE aios_constelarys',                EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aios_constelarys')),
    ('00036','zernio_provider',        'tabla webhook_events_seen',            (to_regclass('public.webhook_events_seen')        IS NOT NULL)),
    ('00037','send_governance',        'tabla send_queue',                     (to_regclass('public.send_queue')                 IS NOT NULL)),
    ('00038','send_queue_drain',       'funcion enqueue_send_queue()',         EXISTS (SELECT 1 FROM pg_proc WHERE proname='enqueue_send_queue')),
    ('00039','template_catalog',       'tabla template_versions',              (to_regclass('public.template_versions')          IS NOT NULL)),
    ('00040','is_super_admin_secdef',  'is_super_admin() SECURITY DEFINER',    EXISTS (SELECT 1 FROM pg_proc WHERE proname='is_super_admin' AND prosecdef)),
    ('00041','locations_first_class',  'restaurant_locations.slug',            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='restaurant_locations' AND column_name='slug')),
    ('00043','location_id_eventos',    'visits.location_id',                   EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='visits'    AND column_name='location_id'))
  ) AS t(num, nombre, rastro, aplicada)
)
SELECT num, nombre, rastro,
       CASE WHEN aplicada THEN 'SI' ELSE '>>> NO <<<' END AS estado
FROM probe
ORDER BY num;

