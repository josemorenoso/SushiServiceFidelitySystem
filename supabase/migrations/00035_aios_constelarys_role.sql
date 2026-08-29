-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00035: Rol restringido para el AIOS Constelarys (CRM interno)
-- Fecha: 2026-08-29 (v2 — endurecida tras code review del mismo día)
-- Descripción: El AIOS Constelarys es un proyecto SEPARADO (repo propio, Supabase
--   propio, ver docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md §11) que necesita
--   conectarse a ESTA base (la del producto) para dos cosas nada más:
--     (a) LEER estado y saldo/consumo de cada tenant (tenants, tenant_wallet_transactions).
--     (b) DAR DE ALTA / ACTIVAR tenants — que en v2 ya NO es INSERT directo:
--         son funciones SECURITY DEFINER definidas en la migración 00036.
--
--   Decisión de diseño (Level 2.0/Upgrading.md, decisión B): rol restringido, NUNCA
--   la service_role. Un bug en el CRM jamás debe poder tocar customers/visits.
--
-- CAMBIOS v2 (hallazgos ALTA de la revisión con subagentes, 2026-08-29):
--   1. El SELECT sobre `tenants` ahora es POR COLUMNAS: el rol ya no puede leer
--      `twilio_subaccount_auth_token`, `twilio_subaccount_sid`,
--      `twilio_messaging_service_sid`, `owner_email` ni `owner_phone`.
--      Antes `GRANT SELECT ON tenants` exponía las credenciales Twilio de TODOS
--      los clientes a un sistema que corre en otra infraestructura.
--   2. Se ELIMINAN los `GRANT INSERT` directos (tenants/reward_tiers/
--      admin_settings/restaurant_locations) y sus políticas `WITH CHECK (true)`:
--      permitían insertar filas apuntando a `tenant_id` de tenants EXISTENTES
--      (p. ej. sembrar un `*_template_sid` ajeno y disparar envíos desde el
--      número master). La escritura pasa a funciones SECURITY DEFINER con
--      validación interna — ver migración 00036 (`aios_provision_tenant`,
--      `aios_activate_whatsapp`, `aios_set_template_settings`).
--
--   Se usa un ROLE de Postgres con GRANT por columna + políticas RLS propias — NO
--   BYPASSRLS. Doble candado: si alguien amplía un GRANT por error, RLS sigue
--   negando el acceso a las tablas sin política para este rol.
--
-- Riesgo: BAJO — crea un rol nuevo sin login y políticas nuevas. No toca datos
--   existentes ni cambia el comportamiento de ningún rol usado hoy (anon,
--   authenticated, service_role).
--
-- ⚠️ Si aplicaste la VERSIÓN ANTERIOR (v1) de este archivo en alguna base,
--    revoca primero lo que v1 otorgaba de más:
--      REVOKE SELECT, INSERT ON tenants, reward_tiers, admin_settings,
--        restaurant_locations, tenant_wallet_transactions FROM aios_constelarys;
--      DROP POLICY IF EXISTS aios_constelarys_insert_tenants ON tenants;
--      DROP POLICY IF EXISTS aios_constelarys_insert_reward_tiers ON reward_tiers;
--      DROP POLICY IF EXISTS aios_constelarys_insert_admin_settings ON admin_settings;
--      DROP POLICY IF EXISTS aios_constelarys_insert_restaurant_locations ON restaurant_locations;
--      DROP POLICY IF EXISTS aios_constelarys_select_tenants ON tenants;
--      DROP POLICY IF EXISTS aios_constelarys_select_wallet_txn ON tenant_wallet_transactions;
--    y vuelve a correr este archivo completo.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. El rol (sin LOGIN todavía — ver instrucciones al final) ─
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    CREATE ROLE aios_constelarys NOLOGIN;
  END IF;
END $$;

GRANT CONNECT ON DATABASE postgres TO aios_constelarys;
GRANT USAGE ON SCHEMA public TO aios_constelarys;

-- ─── 2. Lectura POR COLUMNAS: lo necesario para listar tenants y su saldo ─
-- Nota operativa: con GRANT por columnas, un `SELECT *` del rol falla con
-- "permission denied" — el AIOS debe nombrar columnas explícitas (ya lo hace).
GRANT SELECT (
  id, slug, name, business_type, is_active, is_demo,
  domain, price_per_message_cop, created_at
) ON tenants TO aios_constelarys;

GRANT SELECT (
  id, tenant_id, type, amount_cop, created_at
) ON tenant_wallet_transactions TO aios_constelarys;

CREATE POLICY aios_constelarys_select_tenants
  ON tenants FOR SELECT
  TO aios_constelarys
  USING (true);

CREATE POLICY aios_constelarys_select_wallet_txn
  ON tenant_wallet_transactions FOR SELECT
  TO aios_constelarys
  USING (true);

-- ─── 3. Escritura: NINGUNA en esta migración (a propósito) ──────
-- El alta y la activación de WhatsApp se exponen como funciones
-- SECURITY DEFINER con validación interna en la migración 00036:
--   aios_provision_tenant(payload jsonb)        → alta completa, atómica
--   aios_activate_whatsapp(slug, profile, account, phone)
--   aios_set_template_settings(slug, settings jsonb)  → solo claves permitidas
--                                                        y solo tenants Zernio
-- El rol solo recibe EXECUTE sobre esas funciones — nunca INSERT/UPDATE/DELETE
-- directo sobre las tablas.

-- ─── 4. Todo lo demás queda cerrado por defecto ─────────────────
-- No se otorga NINGÚN privilegio sobre customers, visits, point_transactions,
-- mystery_box_results, message_logs, campaign_messages, reward_grants,
-- reward_redemptions, review_events, staff_users, staff_devices, ni ninguna
-- otra tabla. RLS está habilitado en todas ellas (migraciones 00001-00032) y,
-- al no existir política para `aios_constelarys`, la lectura/escritura queda
-- en cero filas aunque alguien otorgue un GRANT por error más adelante.

-- ═══════════════════════════════════════════════════════════════
-- ACTIVAR EL ROL (hacerlo A MANO fuera de este archivo, nunca commitear
-- un password real):
--
--   ALTER ROLE aios_constelarys WITH LOGIN PASSWORD '<contraseña fuerte propia>';
--
-- Luego, en el AIOS Constelarys, la variable de entorno de conexión (NO en
-- este repo) apunta al connection string directo de Postgres de ESTE proyecto
-- (Supabase → Project Settings → Database → Connection string → modo
-- "Session" o "Transaction", puerto correspondiente), reemplazando el usuario
-- por `aios_constelarys` y la contraseña por la que se puso arriba.
-- Si la contraseña tiene símbolos especiales, van percent-encoded en la URL.
--
-- Verificación (correr conectado como ese rol, no como postgres/service_role):
--   SELECT id, slug, name FROM tenants LIMIT 1;                    -- ok
--   SELECT twilio_subaccount_auth_token FROM tenants LIMIT 1;      -- permission denied
--   SELECT * FROM tenants LIMIT 1;                                 -- permission denied (pide columnas no otorgadas)
--   SELECT * FROM customers LIMIT 1;                               -- permission denied
--   INSERT INTO tenants (slug, name) VALUES ('x','x');             -- permission denied
-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00035 (v2)
-- ═══════════════════════════════════════════════════════════════
