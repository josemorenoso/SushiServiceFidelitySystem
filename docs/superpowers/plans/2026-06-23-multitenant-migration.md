# Multitenant Migration + Generalización — Plan de Implementación

> 📌 **DOCUMENTO AUTORITATIVO:** [`2026-07-05-multitenant-MASTER.md`](./2026-07-05-multitenant-MASTER.md).
> Este archivo es ahora un **apéndice**: detalle task-by-task (código de cada archivo). Las decisiones
> de arquitectura, el runbook del corte y la solución de n8n viven en el MASTER.

> ⛔ **NO CORRER EL SQL DE ESTE PLAN TAL CUAL (Milestone 1 / migraciones 00024–00028).**
> Validado contra el esquema real el 2026-07-04: nombres de políticas RLS errados (dejaban políticas
> viejas vivas → fuga entre tenants), 4 tablas faltantes, `NOT NULL` sin default (rompe writes) y falta el
> tag de `auth.users`. **Usa las migraciones corregidas y ya generadas** + el detalle en
> [`2026-07-04-multitenant-PREFLIGHT.md`](./2026-07-04-multitenant-PREFLIGHT.md). El resto del plan
> (Milestone 2+: tipos, servicios Twilio subaccounts, super-admin, tenant-aware queries) sigue vigente.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar de modelo clone-por-cliente a multitenant real: un Supabase compartido con aislamiento por `tenant_id` vía RLS, Twilio con subcuentas por tenant (billetera prepagada COP en Cada1), y generalización del producto para restaurantes, barberías y salones de belleza.

**Architecture:** Tabla `tenants` central con `business_type`. Todos los datos se aíslan por `tenant_id` en RLS usando `auth.jwt() -> 'app_metadata' -> 'tenant_id'`. Cada tenant tiene su propio subaccount Twilio (billed al master Cada1). El cliente recarga una billetera COP en el panel de super-admin; Cada1 fondea el subaccount Twilio equivalente. El super-admin tiene su propio rol en Supabase Auth.

**Tech Stack:** Next.js 16 App Router, Supabase PostgreSQL + RLS, Twilio SDK v5, TypeScript strict (cero `any`), TailwindCSS 4 + shadcn/ui, Vercel

## Global Constraints

- TypeScript estricto — cero `any` en todo el código nuevo
- Ningún cambio rompe la instalación existente de Sushi Service mientras migra
- Toda nueva tabla incluye `tenant_id uuid NOT NULL REFERENCES tenants(id)`
- Toda política RLS nueva usa `current_tenant_id()` — nunca `auth.role() = 'authenticated'` solo
- Twilio auth tokens de subaccounts se tratan como secretos — nunca en logs ni respuestas de API
- Actualizar `CHANGELOG.md` y `docs/DB_SCHEMA.md` después de cada migración
- Nombres: `tenants` (no `restaurants`), `business` (no `restaurant`) en toda la capa nueva
- Las rutas de check-in públicas cambian a `/[slug]/check-in` para identificar el tenant
- El super-admin vive en `/super-admin/*` protegido por `app_metadata.role = 'super_admin'`

---

## Mapa de Archivos

### Nuevos archivos a crear

| Archivo | Responsabilidad |
|---------|----------------|
| `supabase/migrations/00024_tenants.sql` | Tabla `tenants` + función `current_tenant_id()` |
| `supabase/migrations/00025_add_tenant_id.sql` | Columna `tenant_id` en todas las tablas + actualizar UNIQUE constraints |
| `supabase/migrations/00026_multitenant_rls.sql` | Drop todas las RLS viejas + crear políticas multitenant |
| `supabase/migrations/00027_wallet.sql` | Tabla `tenant_wallet_transactions` |
| `supabase/migrations/00028_seed_sushi_service.sql` | Sushi Service como primer tenant + migrar sus datos |
| `src/types/tenant.types.ts` | Interfaces `Tenant`, `TenantConfig`, `BusinessType` |
| `src/lib/twilio/subaccounts.ts` | Crear/gestionar subaccounts Twilio por tenant |
| `src/lib/tenant.ts` | Resolver tenant por slug (público) o JWT (dashboard) |
| `src/services/wallet.service.ts` | CRUD billetera + consulta usage Twilio |
| `src/app/api/super-admin/tenants/route.ts` | GET todos los tenants + POST crear tenant |
| `src/app/api/super-admin/tenants/[id]/route.ts` | GET/PUT un tenant |
| `src/app/api/super-admin/tenants/[id]/twilio/route.ts` | POST provisionar subaccount Twilio |
| `src/app/api/super-admin/tenants/[id]/wallet/route.ts` | GET uso + POST topup billetera |
| `src/app/(super-admin)/super-admin/layout.tsx` | Layout protegido por rol super_admin |
| `src/app/(super-admin)/super-admin/page.tsx` | Dashboard super-admin: todos los tenants |
| `src/app/(super-admin)/super-admin/tenants/[id]/page.tsx` | Detalle tenant: Twilio, billetera, config |
| `src/middleware.ts` (modificar) | Agregar resolución de tenant para rutas públicas |
| `src/app/(public)/[slug]/check-in/page.tsx` | Check-in multitenant (nuevo path) |
| `src/lib/tenant-config.ts` | Defaults de config por `BusinessType` |
| `src/context/TenantContext.tsx` | React Context con config del tenant activo |
| `src/hooks/useTenantConfig.ts` | Hook para acceder a config del tenant |

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/lib/twilio/client.ts` | Soportar cliente por subaccount (pasar credenciales) |
| `src/services/whatsapp.service.ts` | Aceptar `tenantId` → usar subaccount correcto |
| `src/app/api/webhook/delivery/route.ts` | Resolver tenant por `MessagingServiceSid` |
| `src/app/api/cron/*/route.ts` (todos) | Iterar por tenant activo al ejecutar |
| `src/app/(dashboard)/dashboard/*/page.tsx` | Recibir `tenantConfig` desde contexto |
| `docs/features/multi-tenant-migration-urgente.md` | Reemplazar stub con referencia a este plan |
| `docs/02-architecture.md` | ADR-006: decisión multitenant |
| `docs/DB_SCHEMA.md` | Añadir tabla `tenants` + `tenant_wallet_transactions` + cambios |
| `CHANGELOG.md` | Entrada v3.0.0 para todo este milestone |

---

## MILESTONE 1: DB Foundation

---

### Task 1: Tabla `tenants` + función RLS

**Files:**
- Create: `supabase/migrations/00024_tenants.sql`
- Modify: `docs/DB_SCHEMA.md`

**Interfaces:**
- Produces: Tabla `tenants(id, slug, name, business_type, config, twilio_subaccount_sid, twilio_subaccount_auth_token, twilio_messaging_service_sid, twilio_whatsapp_number, is_active, created_at)` + función `current_tenant_id() RETURNS uuid`

---

- [ ] **Step 1: Crear la migración**

Crear `supabase/migrations/00024_tenants.sql` con exactamente este contenido:

```sql
-- 00024: Tabla tenants (multitenant foundation)
-- Cada fila es un negocio cliente: restaurante, barbería, salón de belleza.

CREATE TABLE tenants (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                        text        UNIQUE NOT NULL,
  name                        text        NOT NULL,
  business_type               text        NOT NULL DEFAULT 'restaurant'
                              CHECK (business_type IN ('restaurant', 'barbershop', 'beauty_salon')),
  config                      jsonb       NOT NULL DEFAULT '{}',
  -- Twilio subaccount (se llena al provisionar via /api/super-admin/tenants/[id]/twilio)
  twilio_subaccount_sid       text        NULL,
  twilio_subaccount_auth_token text       NULL,   -- SENSIBLE: nunca exponer en API pública
  twilio_messaging_service_sid text       NULL,
  twilio_whatsapp_number      text        NULL,
  is_active                   boolean     NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- Función helper: extrae tenant_id del JWT app_metadata.
-- La usan TODAS las políticas RLS de este proyecto.
-- No hace query a la DB — lee del token (sin overhead).
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid,
    NULL
  )
$$;

-- Función helper: detecta si el usuario actual es super_admin.
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin',
    false
  )
$$;

-- RLS en tenants: solo super_admin puede ver/editar.
-- Los usuarios normales no ven la tabla de tenants directamente.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_tenants" ON tenants
  FOR ALL USING (is_super_admin());

-- Service role bypasa RLS automáticamente (no necesita política explícita).

-- Índices
CREATE INDEX idx_tenants_slug    ON tenants(slug);
CREATE INDEX idx_tenants_active  ON tenants(is_active) WHERE is_active = true;
```

- [ ] **Step 2: Ejecutar en Supabase SQL Editor y verificar**

En Supabase Dashboard → SQL Editor:
```sql
-- Verificar que la tabla existe
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'tenants'
ORDER BY ordinal_position;

-- Verificar función
SELECT current_tenant_id();
-- Debe retornar NULL (no hay JWT activo en SQL Editor, esperado)
```

Resultado esperado: 9 columnas listadas + NULL de la función.

- [ ] **Step 3: Actualizar docs/DB_SCHEMA.md**

Agregar sección `tenants` después de `message_logs` en el índice de tablas y después de la última tabla en el detalle. Ver estructura del schema doc existente para seguir el formato.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00024_tenants.sql docs/DB_SCHEMA.md
git commit -m "feat(db): tabla tenants + current_tenant_id() + is_super_admin() para multitenant foundation"
```

---

### Task 2: Agregar `tenant_id` a todas las tablas + actualizar constraints

**Files:**
- Create: `supabase/migrations/00025_add_tenant_id.sql`

**Interfaces:**
- Consumes: `tenants(id)` del Task 1
- Produces: Columna `tenant_id` en todas las tablas con FK a `tenants`. Constraints UNIQUE actualizadas.

**ADVERTENCIA:** Esta migración asume que el DB de producción actual tiene datos de Sushi Service. La migración usa `ON CONFLICT DO NOTHING` — los datos existentes **sin** `tenant_id` quedan con NULL temporalmente. La Task 8 (seed) los asigna al tenant de Sushi Service.

---

- [ ] **Step 1: Crear migración**

Crear `supabase/migrations/00025_add_tenant_id.sql`:

```sql
-- 00025: Agregar tenant_id a todas las tablas existentes.
-- ESTRATEGIA: agregar como NULLABLE primero, seed en 00028, luego NOT NULL.
-- Esto permite migración segura sin downtime en producción.

-- ─── customers ───────────────────────────────────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

-- DROP el UNIQUE viejo en phone (era global, ahora debe ser por tenant)
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_key;

-- El nuevo UNIQUE (phone, tenant_id) se agrega DESPUÉS del seed (migración 00029)
-- porque hasta entonces tenant_id puede ser NULL.

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);

-- ─── visits ──────────────────────────────────────────────────────────────────
ALTER TABLE visits ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_visits_tenant ON visits(tenant_id);

-- ─── rewards ─────────────────────────────────────────────────────────────────
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

-- El UNIQUE parcial de visit_milestone se actualiza después del seed
DROP INDEX IF EXISTS rewards_visit_milestone_unique;
CREATE INDEX IF NOT EXISTS idx_rewards_tenant ON rewards(tenant_id);

-- ─── campaigns ───────────────────────────────────────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);

-- ─── campaign_messages ───────────────────────────────────────────────────────
ALTER TABLE campaign_messages ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_campaign_messages_tenant ON campaign_messages(tenant_id);

-- ─── authorized_numbers ──────────────────────────────────────────────────────
ALTER TABLE authorized_numbers ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

ALTER TABLE authorized_numbers DROP CONSTRAINT IF EXISTS authorized_numbers_phone_key;
CREATE INDEX IF NOT EXISTS idx_authorized_numbers_tenant ON authorized_numbers(tenant_id);

-- ─── admin_settings ──────────────────────────────────────────────────────────
-- PK actual es solo `key`. Nuevo PK será (key, tenant_id).
-- Como no podemos cambiar el PK fácilmente con datos, hacemos:
-- 1. Agregar tenant_id como nullable
-- 2. Después del seed: agregar PK compuesto

ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_admin_settings_tenant ON admin_settings(tenant_id);

-- ─── restaurant_events ───────────────────────────────────────────────────────
ALTER TABLE restaurant_events ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_restaurant_events_tenant ON restaurant_events(tenant_id);

-- ─── restaurant_locations ────────────────────────────────────────────────────
ALTER TABLE restaurant_locations ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_restaurant_locations_tenant ON restaurant_locations(tenant_id);

-- ─── staff_users ─────────────────────────────────────────────────────────────
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

ALTER TABLE staff_users DROP CONSTRAINT IF EXISTS staff_users_phone_key;
CREATE INDEX IF NOT EXISTS idx_staff_users_tenant ON staff_users(tenant_id);

-- ─── staff_devices ───────────────────────────────────────────────────────────
ALTER TABLE staff_devices ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_staff_devices_tenant ON staff_devices(tenant_id);

-- ─── message_logs ────────────────────────────────────────────────────────────
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_message_logs_tenant ON message_logs(tenant_id);

-- ─── reward_redemptions ──────────────────────────────────────────────────────
ALTER TABLE reward_redemptions ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_tenant ON reward_redemptions(tenant_id);

-- ─── imported_contacts ───────────────────────────────────────────────────────
ALTER TABLE imported_contacts ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

ALTER TABLE imported_contacts DROP CONSTRAINT IF EXISTS idx_imported_contacts_phone;
CREATE INDEX IF NOT EXISTS idx_imported_contacts_tenant ON imported_contacts(tenant_id);

-- ─── mystery_box_results (si existe) ─────────────────────────────────────────
ALTER TABLE mystery_box_results ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_mystery_box_tenant ON mystery_box_results(tenant_id);

-- ─── reward_tiers (si existe) ────────────────────────────────────────────────
ALTER TABLE reward_tiers ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_reward_tiers_tenant ON reward_tiers(tenant_id);

-- ─── point_transactions (si existe) ──────────────────────────────────────────
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
  REFERENCES tenants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_point_transactions_tenant ON point_transactions(tenant_id);
```

- [ ] **Step 2: Ejecutar y verificar**

```sql
-- Verificar que todas las tablas tienen tenant_id
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE column_name = 'tenant_id'
  AND table_schema = 'public'
ORDER BY table_name;
```

Resultado esperado: lista de 12+ tablas con `tenant_id | YES`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00025_add_tenant_id.sql
git commit -m "feat(db): agregar tenant_id nullable a todas las tablas (pre-seed)"
```

---

### Task 3: Reescribir todas las políticas RLS para multitenant

**Files:**
- Create: `supabase/migrations/00026_multitenant_rls.sql`

**Interfaces:**
- Consumes: `current_tenant_id()` del Task 1, `tenant_id` en tablas del Task 2
- Produces: Políticas RLS que filtran por `tenant_id = current_tenant_id()`

---

- [ ] **Step 1: Crear migración**

Crear `supabase/migrations/00026_multitenant_rls.sql`:

```sql
-- 00026: Reescribir RLS para aislamiento multitenant.
-- Principio: tenant ve SOLO sus datos. Service role bypasa todo.
-- Super admin ve todo (is_super_admin()).

-- ═══════════════════════════════════════════════════════════════════════════════
-- customers
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_select_customers" ON customers;
DROP POLICY IF EXISTS "admin_insert_customers" ON customers;
DROP POLICY IF EXISTS "admin_update_customers" ON customers;

CREATE POLICY "tenant_select_customers" ON customers
  FOR SELECT USING (
    tenant_id = current_tenant_id() OR is_super_admin()
  );

CREATE POLICY "tenant_insert_customers" ON customers
  FOR INSERT WITH CHECK (
    tenant_id = current_tenant_id() OR is_super_admin()
  );

CREATE POLICY "tenant_update_customers" ON customers
  FOR UPDATE USING (
    tenant_id = current_tenant_id() OR is_super_admin()
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- visits
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_select_visits"     ON visits;
DROP POLICY IF EXISTS "admin_insert_visits"     ON visits;

CREATE POLICY "tenant_select_visits" ON visits
  FOR SELECT USING (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY "tenant_insert_visits" ON visits
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- rewards
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_all_rewards" ON rewards;
DROP POLICY IF EXISTS "admin_select_rewards" ON rewards;
DROP POLICY IF EXISTS "admin_insert_rewards" ON rewards;
DROP POLICY IF EXISTS "admin_update_rewards" ON rewards;
DROP POLICY IF EXISTS "admin_delete_rewards" ON rewards;

CREATE POLICY "tenant_all_rewards" ON rewards
  FOR ALL USING (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- campaigns
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_all_campaigns" ON campaigns;
DROP POLICY IF EXISTS "admin_select_campaigns" ON campaigns;
DROP POLICY IF EXISTS "admin_insert_campaigns" ON campaigns;
DROP POLICY IF EXISTS "admin_update_campaigns" ON campaigns;
DROP POLICY IF EXISTS "admin_delete_campaigns" ON campaigns;

CREATE POLICY "tenant_all_campaigns" ON campaigns
  FOR ALL USING (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- campaign_messages
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_select_campaign_messages" ON campaign_messages;
DROP POLICY IF EXISTS "service_insert_campaign_messages" ON campaign_messages;
DROP POLICY IF EXISTS "service_update_campaign_messages" ON campaign_messages;

CREATE POLICY "tenant_select_campaign_messages" ON campaign_messages
  FOR SELECT USING (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY "service_insert_campaign_messages" ON campaign_messages
  FOR INSERT WITH CHECK (true);   -- service role maneja inserts

CREATE POLICY "service_update_campaign_messages" ON campaign_messages
  FOR UPDATE USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- authorized_numbers
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_all_authorized_numbers" ON authorized_numbers;

CREATE POLICY "tenant_all_authorized_numbers" ON authorized_numbers
  FOR ALL USING (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- admin_settings
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_select_settings" ON admin_settings;
DROP POLICY IF EXISTS "admin_update_settings" ON admin_settings;
DROP POLICY IF EXISTS "admin_insert_settings" ON admin_settings;

CREATE POLICY "tenant_select_settings" ON admin_settings
  FOR SELECT USING (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY "tenant_insert_settings" ON admin_settings
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY "tenant_update_settings" ON admin_settings
  FOR UPDATE USING (tenant_id = current_tenant_id() OR is_super_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- restaurant_events
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_all_restaurant_events"    ON restaurant_events;
DROP POLICY IF EXISTS "service_select_restaurant_events" ON restaurant_events;
DROP POLICY IF EXISTS "service_insert_restaurant_events" ON restaurant_events;
DROP POLICY IF EXISTS "service_update_restaurant_events" ON restaurant_events;

CREATE POLICY "tenant_all_restaurant_events" ON restaurant_events
  FOR ALL USING (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY "service_rw_restaurant_events" ON restaurant_events
  FOR ALL USING (true) WITH CHECK (true);  -- crons usan service role

-- ═══════════════════════════════════════════════════════════════════════════════
-- restaurant_locations
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_all_restaurant_locations"   ON restaurant_locations;
DROP POLICY IF EXISTS "service_select_restaurant_locations" ON restaurant_locations;

CREATE POLICY "tenant_all_restaurant_locations" ON restaurant_locations
  FOR ALL USING (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY "service_select_restaurant_locations" ON restaurant_locations
  FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- staff_users
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_select_staff_users" ON staff_users;
DROP POLICY IF EXISTS "admin_insert_staff_users" ON staff_users;
DROP POLICY IF EXISTS "admin_update_staff_users" ON staff_users;
DROP POLICY IF EXISTS "admin_delete_staff_users" ON staff_users;

CREATE POLICY "tenant_all_staff_users" ON staff_users
  FOR ALL USING (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- staff_devices
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_select_staff_devices" ON staff_devices;
DROP POLICY IF EXISTS "admin_insert_staff_devices" ON staff_devices;
DROP POLICY IF EXISTS "admin_update_staff_devices" ON staff_devices;
DROP POLICY IF EXISTS "admin_delete_staff_devices" ON staff_devices;

CREATE POLICY "tenant_all_staff_devices" ON staff_devices
  FOR ALL USING (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- message_logs
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_select_message_logs" ON message_logs;
DROP POLICY IF EXISTS "service_insert_message_logs" ON message_logs;
DROP POLICY IF EXISTS "service_update_message_logs" ON message_logs;

CREATE POLICY "tenant_select_message_logs" ON message_logs
  FOR SELECT USING (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY "service_insert_message_logs" ON message_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_update_message_logs" ON message_logs
  FOR UPDATE USING (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- reward_redemptions
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_select_reward_redemptions" ON reward_redemptions;
DROP POLICY IF EXISTS "service_insert_reward_redemptions" ON reward_redemptions;
DROP POLICY IF EXISTS "admin_update_reward_redemptions" ON reward_redemptions;

CREATE POLICY "tenant_select_reward_redemptions" ON reward_redemptions
  FOR SELECT USING (tenant_id = current_tenant_id() OR is_super_admin());

CREATE POLICY "service_insert_reward_redemptions" ON reward_redemptions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "tenant_update_reward_redemptions" ON reward_redemptions
  FOR UPDATE USING (tenant_id = current_tenant_id() OR is_super_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- imported_contacts
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "admin_all_imported_contacts" ON imported_contacts;

CREATE POLICY "tenant_all_imported_contacts" ON imported_contacts
  FOR ALL USING (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());
```

- [ ] **Step 2: Ejecutar y verificar**

```sql
-- Verificar que las políticas nuevas existen
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE 'tenant_%'
ORDER BY tablename, policyname;
```

Resultado esperado: 20+ políticas con prefijo `tenant_`.

```sql
-- Verificar que las políticas viejas fueron eliminadas
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE 'admin_%'
ORDER BY tablename;
```

Resultado esperado: 0 filas (todas las viejas eliminadas).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00026_multitenant_rls.sql
git commit -m "feat(db): reescribir RLS multitenant — aislamiento por tenant_id + super_admin bypass"
```

---

### Task 4: Tabla billetera + constraints post-seed

**Files:**
- Create: `supabase/migrations/00027_wallet.sql`

**Interfaces:**
- Consumes: `tenants(id)` del Task 1
- Produces: Tabla `tenant_wallet_transactions` para tracking de la billetera COP

---

- [ ] **Step 1: Crear migración**

Crear `supabase/migrations/00027_wallet.sql`:

```sql
-- 00027: Billetera prepagada COP por tenant.
-- Modelo B: Cliente recarga COP en Cada1. Cada1 fondea el subaccount Twilio.
-- Esta tabla registra TODOS los movimientos (recargas, ajustes).
-- El balance del subaccount Twilio se consulta en tiempo real vía API.

CREATE TABLE tenant_wallet_transactions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  type          text        NOT NULL CHECK (type IN ('topup', 'adjustment', 'refund')),
  amount_cop    numeric     NOT NULL,           -- Monto en COP (positivo = recarga, negativo = ajuste)
  amount_usd    numeric     NULL,               -- USD equivalente fondeado en Twilio (si aplica)
  usd_cop_rate  numeric     NULL,               -- TRM usada en la conversión
  notes         text        NULL,               -- Referencia del pago, Nequi ID, etc.
  created_by    text        NOT NULL,           -- UUID del super_admin que registró esto
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Solo super_admin puede ver y crear transacciones de billetera
CREATE POLICY "super_admin_all_wallet_txns" ON tenant_wallet_transactions
  FOR ALL USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Service role puede leer (para cálculos internos)
CREATE POLICY "service_select_wallet_txns" ON tenant_wallet_transactions
  FOR SELECT USING (true);

CREATE INDEX idx_wallet_txns_tenant ON tenant_wallet_transactions(tenant_id, created_at DESC);

-- Función helper: calcular balance COP actual de un tenant
CREATE OR REPLACE FUNCTION tenant_wallet_balance_cop(p_tenant_id uuid)
RETURNS numeric
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(amount_cop), 0)
  FROM tenant_wallet_transactions
  WHERE tenant_id = p_tenant_id
$$;
```

- [ ] **Step 2: Ejecutar y verificar**

```sql
-- Verificar tabla y función
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'tenant_wallet_transactions';

-- Probar función (con un UUID inventado retorna 0)
SELECT tenant_wallet_balance_cop('00000000-0000-0000-0000-000000000000');
-- Esperado: 0
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00027_wallet.sql
git commit -m "feat(db): tabla tenant_wallet_transactions + función balance COP"
```

---

### Task 5: Seed Sushi Service como primer tenant + constraints NOT NULL post-seed

**Files:**
- Create: `supabase/migrations/00028_seed_sushi_service.sql`

**Interfaces:**
- Consumes: `tenants` del Task 1, todas las tablas con `tenant_id` nullable del Task 2
- Produces: Datos existentes asignados al tenant de Sushi Service. Constraints NOT NULL activados. Unique constraints compuestos añadidos.

---

- [ ] **Step 1: Crear migración**

Crear `supabase/migrations/00028_seed_sushi_service.sql`:

```sql
-- 00028: Seed Sushi Service como primer tenant.
-- Asigna tenant_id a TODOS los datos existentes y activa NOT NULL.
-- EJECUTAR SOLO UNA VEZ en el DB que tenía datos de Sushi Service.
-- Para instalaciones nuevas (vacías) también funciona — solo inserta el tenant.

-- 1. Insertar el tenant de Sushi Service
INSERT INTO tenants (id, slug, name, business_type, config, is_active)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- UUID fijo para reproducibilidad
  'sushi-service',
  'Sushi Service',
  'restaurant',
  '{
    "brand_name": "Sushi Service",
    "brand_tagline": "El mejor sushi de la ciudad",
    "staff_role_label": "Mesero",
    "visit_label": "visita",
    "station_label": "mesa",
    "has_delivery_webhook": true
  }'::jsonb,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- Guardar el tenant_id para usarlo abajo
DO $$
DECLARE
  v_tenant_id uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
BEGIN

  -- 2. Asignar tenant_id a todos los datos existentes (los que aún son NULL)
  UPDATE customers          SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE visits             SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE rewards            SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE campaigns          SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE campaign_messages  SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE authorized_numbers SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE admin_settings     SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE restaurant_events  SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE restaurant_locations SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE staff_users        SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE staff_devices      SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE message_logs       SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE reward_redemptions SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE imported_contacts  SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;

  -- Para tablas opcionales que pueden existir:
  UPDATE mystery_box_results  SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE reward_tiers         SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE point_transactions   SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE tenant_wallet_transactions SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;

END $$;

-- 3. Activar NOT NULL en todas las tablas (ahora que todos los datos tienen tenant_id)
ALTER TABLE customers           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE visits              ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE rewards             ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE campaigns           ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE campaign_messages   ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE authorized_numbers  ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE admin_settings      ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE restaurant_events   ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE restaurant_locations ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE staff_users         ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE staff_devices       ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE message_logs        ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE reward_redemptions  ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE imported_contacts   ALTER COLUMN tenant_id SET NOT NULL;

-- 4. Agregar UNIQUE compuestos (ahora que tenant_id no es NULL)
ALTER TABLE customers
  ADD CONSTRAINT customers_phone_tenant_key UNIQUE (phone, tenant_id);

ALTER TABLE authorized_numbers
  ADD CONSTRAINT authorized_numbers_phone_tenant_key UNIQUE (phone, tenant_id);

ALTER TABLE staff_users
  ADD CONSTRAINT staff_users_phone_tenant_key UNIQUE (phone, tenant_id);

ALTER TABLE imported_contacts
  ADD CONSTRAINT imported_contacts_phone_tenant_key UNIQUE (phone, tenant_id);

-- admin_settings: nuevo PK compuesto
ALTER TABLE admin_settings DROP CONSTRAINT IF EXISTS admin_settings_pkey;
ALTER TABLE admin_settings ADD PRIMARY KEY (key, tenant_id);

-- rewards: UNIQUE parcial por tenant
CREATE UNIQUE INDEX rewards_visit_milestone_tenant_unique
  ON rewards(visit_milestone, tenant_id)
  WHERE visit_milestone IS NOT NULL;

-- 5. Verificación final
DO $$
DECLARE
  v_tenant_id uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  v_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_count FROM customers WHERE tenant_id IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'ERROR: % filas en customers sin tenant_id', v_count;
  END IF;
  RAISE NOTICE 'OK: Seed completado. Sushi Service tenant_id = %', v_tenant_id;
END $$;
```

- [ ] **Step 2: Ejecutar y verificar**

```sql
-- Verificar que el tenant existe
SELECT id, slug, name, business_type FROM tenants;

-- Verificar que los clientes tienen tenant_id
SELECT COUNT(*), tenant_id FROM customers GROUP BY tenant_id;

-- Verificar unique constraint compuesto
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE constraint_name LIKE '%tenant%' AND constraint_type = 'UNIQUE';
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00028_seed_sushi_service.sql
git commit -m "feat(db): seed Sushi Service como tenant 1 + activar NOT NULL + unique compuestos"
```

---

## MILESTONE 2: Twilio Subaccounts + Billetera

---

### Task 6: Tipos TypeScript + servicio Twilio subaccounts

**Files:**
- Create: `src/types/tenant.types.ts`
- Create: `src/lib/twilio/subaccounts.ts`
- Modify: `src/lib/twilio/client.ts`

**Interfaces:**
- Produces:
  - `BusinessType` = `'restaurant' | 'barbershop' | 'beauty_salon'`
  - `Tenant` interface completa
  - `TenantConfig` interface
  - `createTwilioSubaccount(tenantSlug, tenantName)` → `{ sid, authToken, friendlyName }`
  - `getTenantTwilioClient(tenant)` → `Twilio client instance`
  - `getSubaccountUsage(subSid, startDate, endDate)` → `{ messages, priceUsd }`

---

- [ ] **Step 1: Crear tipos**

Crear `src/types/tenant.types.ts`:

```typescript
export type BusinessType = 'restaurant' | 'barbershop' | 'beauty_salon';

export interface TenantConfig {
  brand_name: string;
  brand_tagline?: string;
  brand_short?: string;
  staff_role_label: string;     // 'Mesero' | 'Barbero' | 'Esteticista'
  visit_label: string;          // 'visita' | 'cita' | 'servicio'
  station_label: string;        // 'mesa' | 'silla' | 'cabina'
  has_delivery_webhook: boolean;
  google_maps_url?: string;
  whatsapp_link?: string;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  business_type: BusinessType;
  config: TenantConfig;
  twilio_subaccount_sid: string | null;
  // NOTA: twilio_subaccount_auth_token NUNCA viene en respuestas de API pública
  twilio_messaging_service_sid: string | null;
  twilio_whatsapp_number: string | null;
  is_active: boolean;
  created_at: string;
}

// TenantPublic: versión sin credenciales, para usar en frontend
export type TenantPublic = Omit<Tenant, 'twilio_subaccount_sid'>;

export interface TenantWalletTransaction {
  id: string;
  tenant_id: string;
  type: 'topup' | 'adjustment' | 'refund';
  amount_cop: number;
  amount_usd: number | null;
  usd_cop_rate: number | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface TenantUsageSummary {
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  // Twilio (desde API)
  twilio_messages_this_month: number;
  twilio_spend_usd_this_month: number;
  twilio_subaccount_balance_usd: number | null;
  // Billetera COP (desde DB)
  wallet_balance_cop: number;
  // Calculado
  estimated_messages_remaining: number | null; // wallet_balance_cop / (avg_cost_per_msg_usd * trm)
}
```

- [ ] **Step 2: Crear servicio de subaccounts Twilio**

Crear `src/lib/twilio/subaccounts.ts`:

```typescript
import twilio from 'twilio';
import type { Tenant } from '@/types/tenant.types';

// Cliente maestro de Cada1 — usa las credenciales globales
function getMasterClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN no configurados');
  return twilio(sid, token);
}

// Crear un nuevo subaccount Twilio para un tenant nuevo
export async function createTwilioSubaccount(tenantSlug: string, tenantName: string) {
  const master = getMasterClient();
  const account = await master.api.v2010.accounts.create({
    friendlyName: `Cada1 — ${tenantName} (${tenantSlug})`,
  });
  return {
    sid: account.sid,
    authToken: account.authToken,
    friendlyName: account.friendlyName,
    status: account.status,
  };
}

// Obtener cliente Twilio del subaccount de un tenant específico
export function getTenantTwilioClient(tenant: Pick<Tenant, 'slug' | 'twilio_subaccount_sid'> & {
  twilio_subaccount_auth_token: string | null;
}) {
  if (!tenant.twilio_subaccount_sid || !tenant.twilio_subaccount_auth_token) {
    throw new Error(`Tenant "${tenant.slug}" no tiene subaccount Twilio configurado`);
  }
  return twilio(tenant.twilio_subaccount_sid, tenant.twilio_subaccount_auth_token);
}

// Obtener balance del subaccount (en USD)
export async function getSubaccountBalance(subaccountSid: string): Promise<number | null> {
  try {
    const master = getMasterClient();
    const balance = await master.api.v2010.accounts(subaccountSid).balance.fetch();
    return parseFloat(balance.balance);
  } catch {
    return null; // No fallar si Twilio no responde
  }
}

// Obtener uso del mes actual del subaccount
export async function getSubaccountMonthlyUsage(subaccountSid: string): Promise<{
  messages: number;
  priceUsd: number;
}> {
  const master = getMasterClient();
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    const records = await master.api.v2010
      .accounts(subaccountSid)
      .usage.records.list({
        category: 'sms-outbound' as const,
        startDate,
        endDate: now,
      });

    const messages = records.reduce((sum, r) => sum + parseInt(r.count ?? '0', 10), 0);
    const priceUsd = records.reduce((sum, r) => sum + Math.abs(parseFloat(r.price ?? '0')), 0);
    return { messages, priceUsd };
  } catch {
    return { messages: 0, priceUsd: 0 };
  }
}

// Obtener balance de la cuenta maestra Cada1
export async function getMasterAccountBalance(): Promise<number | null> {
  try {
    const master = getMasterClient();
    const balance = await master.api.v2010
      .accounts(process.env.TWILIO_ACCOUNT_SID!)
      .balance.fetch();
    return parseFloat(balance.balance);
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

Resultado esperado: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/types/tenant.types.ts src/lib/twilio/subaccounts.ts
git commit -m "feat(twilio): tipos Tenant/TenantConfig + servicio subaccounts (crear, balance, usage)"
```

---

### Task 7: Actualizar envío de WhatsApp para usar subaccount del tenant

**Files:**
- Modify: `src/services/whatsapp.service.ts`
- Create: `src/lib/tenant.ts`

**Interfaces:**
- Consumes: `getTenantTwilioClient()` del Task 6
- Produces: `sendTemplateMessage()` acepta `tenantId` y usa el subaccount correcto

---

- [ ] **Step 1: Crear helper de resolución de tenant**

Crear `src/lib/tenant.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import type { Tenant } from '@/types/tenant.types';

// Resolver tenant por slug (para rutas públicas: check-in, webhooks)
export async function getTenantBySlug(slug: string): Promise<Tenant & {
  twilio_subaccount_auth_token: string | null;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return data as Tenant & { twilio_subaccount_auth_token: string | null };
}

// Resolver tenant por MessagingServiceSid (para webhook de Twilio)
export async function getTenantByMessagingService(msid: string): Promise<Tenant & {
  twilio_subaccount_auth_token: string | null;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('twilio_messaging_service_sid', msid)
    .eq('is_active', true)
    .single();

  if (error || !data) return null;
  return data as Tenant & { twilio_subaccount_auth_token: string | null };
}

// Resolver tenant del usuario autenticado (para dashboard)
// Requiere que el JWT tenga app_metadata.tenant_id
export async function getTenantFromJwt(): Promise<Tenant | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return null;

  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, name, business_type, config, twilio_messaging_service_sid, twilio_whatsapp_number, twilio_subaccount_sid, is_active, created_at')
    .eq('id', tenantId)
    .single();

  if (error || !data) return null;
  // No incluir auth_token en la respuesta del dashboard
  return data as Tenant;
}
```

- [ ] **Step 2: Actualizar whatsapp.service.ts para multi-tenant**

Localizar `src/services/whatsapp.service.ts` y modificar la función `sendTemplateMessage` para aceptar el cliente Twilio como parámetro (en vez de siempre usar el global):

```typescript
// ANTES (extracto actual — NO borrar la función, solo modificarla):
// const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// DESPUÉS: agregar esta firma alternativa
// La función existente sigue igual para compatibilidad con código que aún no migró.
// Agregar al final del archivo:

import { getTenantTwilioClient } from '@/lib/twilio/subaccounts';
import type { Tenant } from '@/types/tenant.types';

// Versión multitenant: usa el subaccount del tenant si está configurado,
// fallback al cliente global si no (compatibilidad backward).
export function getTwilioClientForTenant(
  tenant: Pick<Tenant, 'slug' | 'twilio_subaccount_sid'> & {
    twilio_subaccount_auth_token: string | null;
  }
) {
  if (tenant.twilio_subaccount_sid && tenant.twilio_subaccount_auth_token) {
    return getTenantTwilioClient(tenant);
  }
  // Fallback: cliente global (para tenants sin subaccount aún)
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Twilio no configurado');
  return require('twilio')(sid, token);
}
```

**NOTA:** El cambio completo de todos los callers de `sendTemplateMessage` a multitenant se hace incremetalmente conforme se migra cada API route. El fallback al cliente global garantiza que nada se rompe mientras se migra.

- [ ] **Step 3: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/tenant.ts src/services/whatsapp.service.ts
git commit -m "feat(tenant): resolver tenant por slug/MSID/JWT + cliente Twilio por tenant con fallback global"
```

---

### Task 8: Webhook delivery multitenant (ruting por MessagingServiceSid)

**Files:**
- Modify: `src/app/api/webhook/delivery/route.ts`

**Interfaces:**
- Consumes: `getTenantByMessagingService()` del Task 7
- Produces: El webhook resuelve el tenant antes de procesar, filtra clientes por `tenant_id`

---

- [ ] **Step 1: Modificar el webhook**

En `src/app/api/webhook/delivery/route.ts`, al inicio del handler POST, agregar la resolución de tenant:

```typescript
// Agregar al inicio del handler POST, después de parsear el body:
const messagingServiceSid = body.get('MessagingServiceSid') as string | null;
const toNumber = body.get('To') as string | null;

// Intentar resolver tenant por MessagingServiceSid primero
let tenant = messagingServiceSid
  ? await getTenantByMessagingService(messagingServiceSid)
  : null;

// Fallback: resolver por número To (twilio_whatsapp_number)
if (!tenant && toNumber) {
  const supabase = createServerClient(); // service role
  const { data } = await supabase
    .from('tenants')
    .select('*')
    .eq('twilio_whatsapp_number', toNumber)
    .eq('is_active', true)
    .single();
  tenant = data;
}

if (!tenant) {
  console.error('[webhook/delivery] No se pudo resolver tenant para MSID:', messagingServiceSid, 'To:', toNumber);
  return new Response('Tenant not found', { status: 404 });
}

// A partir de aquí, todas las queries a Supabase DEBEN incluir .eq('tenant_id', tenant.id)
// El cliente Twilio para respuestas usa getTwilioClientForTenant(tenant)
```

- [ ] **Step 2: Actualizar todas las queries del webhook para filtrar por tenant_id**

En el mismo archivo, agregar `.eq('tenant_id', tenant.id)` a cada query de Supabase que lea de `customers`, `authorized_numbers`, etc.

- [ ] **Step 3: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Test manual con curl**

```bash
# Simular un webhook de Twilio con un MessagingServiceSid conocido
curl -X POST http://localhost:3000/api/webhook/delivery \
  -d "MessagingServiceSid=MGxxxxxxxxxxxx" \
  -d "From=whatsapp:+573001234567" \
  -d "To=whatsapp:+14155238886" \
  -d "Body=Pedido de prueba"
```

Resultado esperado: 200 OK o 404 si el MSID no está en la DB.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhook/delivery/route.ts
git commit -m "feat(webhook): resolver tenant por MessagingServiceSid para multitenant"
```

---

### Task 9: API Routes super-admin (tenants + billetera + Twilio)

**Files:**
- Create: `src/app/api/super-admin/tenants/route.ts`
- Create: `src/app/api/super-admin/tenants/[id]/route.ts`
- Create: `src/app/api/super-admin/tenants/[id]/twilio/route.ts`
- Create: `src/app/api/super-admin/tenants/[id]/wallet/route.ts`
- Create: `src/services/wallet.service.ts`

**Interfaces:**
- Consumes: `createTwilioSubaccount()`, `getSubaccountMonthlyUsage()`, `getMasterAccountBalance()` del Task 6
- Produces:
  - `GET /api/super-admin/tenants` → `TenantUsageSummary[]`
  - `POST /api/super-admin/tenants` → `Tenant`
  - `GET /api/super-admin/tenants/[id]` → `TenantUsageSummary`
  - `PUT /api/super-admin/tenants/[id]` → `Tenant`
  - `POST /api/super-admin/tenants/[id]/twilio` → `{ sid, status }`
  - `GET /api/super-admin/tenants/[id]/wallet` → `{ balance_cop, transactions[], twilio_spend_usd }`
  - `POST /api/super-admin/tenants/[id]/wallet` → `TenantWalletTransaction`

---

- [ ] **Step 1: Crear middleware de protección super-admin**

Crear `src/lib/super-admin-guard.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function requireSuperAdmin(): Promise<
  { userId: string } | NextResponse
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  if (user.app_metadata?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }
  return { userId: user.id };
}
```

- [ ] **Step 2: Crear servicio de billetera**

Crear `src/services/wallet.service.ts`:

```typescript
import { createServerClient } from '@/lib/supabase/server-admin'; // service role client
import { getSubaccountMonthlyUsage, getSubaccountBalance } from '@/lib/twilio/subaccounts';
import type { Tenant, TenantUsageSummary, TenantWalletTransaction } from '@/types/tenant.types';

const USD_COP_DEFAULT = 4200; // TRM fallback si no se configura

export async function getTenantUsageSummary(tenant: Tenant): Promise<TenantUsageSummary> {
  const supabase = createServerClient();

  // Balance billetera COP desde DB
  const { data: balanceData } = await supabase.rpc('tenant_wallet_balance_cop', {
    p_tenant_id: tenant.id,
  });
  const walletBalanceCop = (balanceData as number) ?? 0;

  // Uso Twilio este mes
  const usage = tenant.twilio_subaccount_sid
    ? await getSubaccountMonthlyUsage(tenant.twilio_subaccount_sid)
    : { messages: 0, priceUsd: 0 };

  // Balance subaccount
  const twilioBalance = tenant.twilio_subaccount_sid
    ? await getSubaccountBalance(tenant.twilio_subaccount_sid)
    : null;

  // Mensajes restantes estimados (billetera COP / costo por mensaje en COP)
  const avgCostPerMsgUsd = 0.015; // ~$0.015 USD por WhatsApp en Colombia
  const avgCostPerMsgCop = avgCostPerMsgUsd * USD_COP_DEFAULT;
  const estimatedRemaining = avgCostPerMsgCop > 0
    ? Math.floor(walletBalanceCop / avgCostPerMsgCop)
    : null;

  return {
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    tenant_name: tenant.name,
    twilio_messages_this_month: usage.messages,
    twilio_spend_usd_this_month: usage.priceUsd,
    twilio_subaccount_balance_usd: twilioBalance,
    wallet_balance_cop: walletBalanceCop,
    estimated_messages_remaining: estimatedRemaining,
  };
}

export async function recordWalletTopup(
  tenantId: string,
  amountCop: number,
  amountUsd: number | null,
  usdCopRate: number | null,
  notes: string | null,
  createdBy: string
): Promise<TenantWalletTransaction> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('tenant_wallet_transactions')
    .insert({
      tenant_id: tenantId,
      type: 'topup',
      amount_cop: amountCop,
      amount_usd: amountUsd,
      usd_cop_rate: usdCopRate,
      notes,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw new Error(`Error registrando topup: ${error.message}`);
  return data as TenantWalletTransaction;
}
```

- [ ] **Step 3: Crear API routes**

Crear `src/app/api/super-admin/tenants/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin-guard';
import { createServerClient } from '@/lib/supabase/server-admin';
import { getTenantUsageSummary } from '@/services/wallet.service';
import type { Tenant } from '@/types/tenant.types';

// GET /api/super-admin/tenants
// Retorna todos los tenants con su resumen de uso y billetera
export async function GET() {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const supabase = createServerClient();
  const { data: tenants, error } = await supabase
    .from('tenants')
    .select('id, slug, name, business_type, config, twilio_subaccount_sid, twilio_messaging_service_sid, twilio_whatsapp_number, is_active, created_at')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Obtener usage en paralelo para todos los tenants
  const summaries = await Promise.all(
    (tenants as Tenant[]).map(t => getTenantUsageSummary(t))
  );

  return NextResponse.json(summaries);
}

// POST /api/super-admin/tenants
// Crea un nuevo tenant (sin subaccount Twilio aún — se provisiona por separado)
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as {
    slug: string;
    name: string;
    business_type: 'restaurant' | 'barbershop' | 'beauty_salon';
    config: Record<string, unknown>;
  };

  if (!body.slug || !body.name || !body.business_type) {
    return NextResponse.json({ error: 'slug, name y business_type son requeridos' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('tenants')
    .insert({
      slug: body.slug,
      name: body.name,
      business_type: body.business_type,
      config: body.config ?? {},
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
```

Crear `src/app/api/super-admin/tenants/[id]/twilio/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin-guard';
import { createServerClient } from '@/lib/supabase/server-admin';
import { createTwilioSubaccount } from '@/lib/twilio/subaccounts';

// POST /api/super-admin/tenants/[id]/twilio
// Provisiona un subaccount Twilio para el tenant y lo guarda en la DB
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const supabase = createServerClient();

  // Obtener el tenant
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, slug, name, twilio_subaccount_sid')
    .eq('id', id)
    .single();

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
  }

  if (tenant.twilio_subaccount_sid) {
    return NextResponse.json(
      { error: 'Este tenant ya tiene un subaccount Twilio', sid: tenant.twilio_subaccount_sid },
      { status: 409 }
    );
  }

  // Crear subaccount en Twilio
  const subaccount = await createTwilioSubaccount(tenant.slug, tenant.name);

  // Guardar en DB (auth token incluido — solo accesible por service role)
  const { error: updateError } = await supabase
    .from('tenants')
    .update({
      twilio_subaccount_sid: subaccount.sid,
      twilio_subaccount_auth_token: subaccount.authToken,
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // NO retornar el authToken en la respuesta
  return NextResponse.json({
    sid: subaccount.sid,
    friendlyName: subaccount.friendlyName,
    status: subaccount.status,
  }, { status: 201 });
}
```

Crear `src/app/api/super-admin/tenants/[id]/wallet/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/super-admin-guard';
import { createServerClient } from '@/lib/supabase/server-admin';
import { recordWalletTopup, getTenantUsageSummary } from '@/services/wallet.service';
import type { Tenant } from '@/types/tenant.types';

// GET /api/super-admin/tenants/[id]/wallet
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const supabase = createServerClient();

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, slug, name, business_type, config, twilio_subaccount_sid, twilio_messaging_service_sid, twilio_whatsapp_number, is_active, created_at')
    .eq('id', id)
    .single();

  if (error || !tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });

  const { data: transactions } = await supabase
    .from('tenant_wallet_transactions')
    .select('*')
    .eq('tenant_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  const summary = await getTenantUsageSummary(tenant as Tenant);

  return NextResponse.json({
    summary,
    transactions: transactions ?? [],
  });
}

// POST /api/super-admin/tenants/[id]/wallet
// Registrar una recarga de billetera COP
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;
  const { userId } = guard as { userId: string };

  const { id } = await params;
  const body = await req.json() as {
    amount_cop: number;
    amount_usd?: number;
    usd_cop_rate?: number;
    notes?: string;
  };

  if (!body.amount_cop || body.amount_cop <= 0) {
    return NextResponse.json({ error: 'amount_cop debe ser positivo' }, { status: 400 });
  }

  const transaction = await recordWalletTopup(
    id,
    body.amount_cop,
    body.amount_usd ?? null,
    body.usd_cop_rate ?? null,
    body.notes ?? null,
    userId
  );

  return NextResponse.json(transaction, { status: 201 });
}
```

- [ ] **Step 4: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Test manual GET tenants**

```bash
# Primero necesitas un token de super_admin. Obtenerlo desde Supabase Auth.
curl -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
  http://localhost:3000/api/super-admin/tenants
```

Resultado esperado: array con el tenant de Sushi Service + su resumen de uso.

- [ ] **Step 6: Commit**

```bash
git add src/lib/super-admin-guard.ts src/services/wallet.service.ts \
  src/app/api/super-admin/
git commit -m "feat(api): super-admin API — CRUD tenants, provisión Twilio subaccount, billetera COP"
```

---

## MILESTONE 3: Generalización + Super-Admin UI

---

### Task 10: TenantConfig defaults + TenantContext React

**Files:**
- Create: `src/lib/tenant-config.ts`
- Create: `src/context/TenantContext.tsx`
- Create: `src/hooks/useTenantConfig.ts`

**Interfaces:**
- Produces:
  - `getDefaultTenantConfig(type)` → `TenantConfig`
  - `TenantContext` con `config: TenantConfig`, `tenant: TenantPublic`
  - `useTenantConfig()` hook

---

- [ ] **Step 1: Crear defaults de config por business type**

Crear `src/lib/tenant-config.ts`:

```typescript
import type { BusinessType, TenantConfig } from '@/types/tenant.types';

const DEFAULTS: Record<BusinessType, Omit<TenantConfig, 'brand_name'>> = {
  restaurant: {
    staff_role_label: 'Mesero',
    visit_label: 'visita',
    station_label: 'mesa',
    has_delivery_webhook: true,
  },
  barbershop: {
    staff_role_label: 'Barbero',
    visit_label: 'cita',
    station_label: 'silla',
    has_delivery_webhook: false,
  },
  beauty_salon: {
    staff_role_label: 'Esteticista',
    visit_label: 'servicio',
    station_label: 'cabina',
    has_delivery_webhook: false,
  },
};

// Combina los defaults del business_type con el config guardado en DB.
// El config de DB siempre gana si tiene el campo.
export function resolveTenantConfig(
  businessType: BusinessType,
  storedConfig: Partial<TenantConfig>
): TenantConfig {
  const defaults = DEFAULTS[businessType];
  return {
    brand_name: storedConfig.brand_name ?? '',
    brand_tagline: storedConfig.brand_tagline,
    brand_short: storedConfig.brand_short,
    staff_role_label: storedConfig.staff_role_label ?? defaults.staff_role_label,
    visit_label: storedConfig.visit_label ?? defaults.visit_label,
    station_label: storedConfig.station_label ?? defaults.station_label,
    has_delivery_webhook: storedConfig.has_delivery_webhook ?? defaults.has_delivery_webhook,
    google_maps_url: storedConfig.google_maps_url,
    whatsapp_link: storedConfig.whatsapp_link,
  };
}
```

- [ ] **Step 2: Crear TenantContext**

Crear `src/context/TenantContext.tsx`:

```typescript
'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { TenantConfig, TenantPublic } from '@/types/tenant.types';

interface TenantContextValue {
  tenant: TenantPublic;
  config: TenantConfig;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({
  children,
  tenant,
  config,
}: {
  children: ReactNode;
  tenant: TenantPublic;
  config: TenantConfig;
}) {
  return (
    <TenantContext.Provider value={{ tenant, config }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant debe usarse dentro de TenantProvider');
  return ctx;
}
```

- [ ] **Step 3: Crear hook de conveniencia**

Crear `src/hooks/useTenantConfig.ts`:

```typescript
import { useTenant } from '@/context/TenantContext';

// Shortcut para acceder solo al config sin el objeto tenant completo
export function useTenantConfig() {
  return useTenant().config;
}
```

- [ ] **Step 4: Agregar TenantProvider al layout del dashboard**

En `src/app/(dashboard)/layout.tsx`, importar y envolver con `TenantProvider`. Obtener el tenant desde el servidor (RSC) usando `getTenantFromJwt()` y pasar como prop:

```typescript
// src/app/(dashboard)/layout.tsx — fragmento a agregar:
import { TenantProvider } from '@/context/TenantContext';
import { getTenantFromJwt } from '@/lib/tenant';
import { resolveTenantConfig } from '@/lib/tenant-config';

// En el componente async:
const tenant = await getTenantFromJwt();
const config = tenant
  ? resolveTenantConfig(tenant.business_type, tenant.config)
  : resolveTenantConfig('restaurant', {}); // fallback

// Envolver children:
<TenantProvider tenant={tenant!} config={config}>
  {children}
</TenantProvider>
```

- [ ] **Step 5: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/tenant-config.ts src/context/TenantContext.tsx src/hooks/useTenantConfig.ts
git commit -m "feat(tenant): TenantContext + resolveTenantConfig + useTenantConfig hook"
```

---

### Task 11: Generalizar labels en la UI (mesero→config, mesa→config, restaurante→negocio)

**Files:**
- Modify: Todos los archivos UI que tengan hardcoded "Mesero", "Mesa", "restaurante", "mesero"

**Interfaces:**
- Consumes: `useTenantConfig()` del Task 10
- Produces: UI que lee labels del config del tenant en vez de strings hardcodeados

---

- [ ] **Step 1: Buscar todos los strings hardcodeados**

```bash
# Buscar "Mesero" hardcodeado en componentes
grep -rn "Mesero\|mesero\|\"mesa\"\|\"Mesa\"\|restaurante\|Restaurante" \
  src/components src/app --include="*.tsx" --include="*.ts" \
  | grep -v "node_modules" | grep -v ".next"
```

Documentar la lista de archivos que aparecen. Cada uno necesita cambiar de string literal a `config.staff_role_label`, `config.station_label`, o el equivalente.

- [ ] **Step 2: Patrón de migración por componente**

Para cada componente que aparezca en la búsqueda, aplicar este patrón:

```typescript
// ANTES:
<p>Escanea el QR con tu mesero</p>

// DESPUÉS:
import { useTenantConfig } from '@/hooks/useTenantConfig';
const config = useTenantConfig();
<p>Escanea el QR con tu {config.staff_role_label.toLowerCase()}</p>
```

Para Server Components (sin `use client`), recibir `config` como prop desde el layout o usar `getTenantFromJwt()`.

- [ ] **Step 3: Variables de entorno que se vuelven obsoletas**

Las siguientes variables siguen funcionando para backward compatibility pero ya no son necesarias para tenants configurados en DB:

- `NEXT_PUBLIC_BRAND_NAME` → reemplazado por `config.brand_name`
- `NEXT_PUBLIC_BRAND_SHORT` → reemplazado por `config.brand_short`
- `NEXT_PUBLIC_BRAND_TAGLINE` → reemplazado por `config.brand_tagline`
- `NEXT_PUBLIC_STAFF_ROLE_LABEL` → reemplazado por `config.staff_role_label`
- `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL` → reemplazado por `config.google_maps_url`
- `RESTAURANT_WHATSAPP_LINK` → reemplazado por `config.whatsapp_link`

Mantenerlas en `.env.example` como `# DEPRECATED — usar tenant config` para no romper instalaciones existentes.

- [ ] **Step 4: Ocultar features por business_type**

En el sidebar del dashboard, ocultar la sección "Domicilios" si `config.has_delivery_webhook === false`:

```typescript
// src/components/layout/Sidebar.tsx — fragmento
import { useTenantConfig } from '@/hooks/useTenantConfig';

const config = useTenantConfig();

// En el renderizado del nav:
{config.has_delivery_webhook && (
  <NavItem href="/dashboard/delivery" label="Domicilios" icon={<TruckIcon />} />
)}
```

- [ ] **Step 5: Verificar compilación y test visual**

```bash
npx tsc --noEmit
npm run dev
```

Abrir el dashboard y verificar que los labels se leen correctamente del config del tenant.

- [ ] **Step 6: Commit**

```bash
git add src/components/ src/app/(dashboard)/
git commit -m "feat(ui): generalizar labels desde TenantConfig — mesero/mesa/restaurante → dinámicos"
```

---

### Task 12: Rutas públicas multitenant + URL de check-in con slug

**Files:**
- Create: `src/app/(public)/[slug]/check-in/page.tsx`
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: `getTenantBySlug()` del Task 7
- Produces: `/sushi-service/check-in` funciona. El middleware redirige `/check-in` → `/[slug]/check-in` para instalaciones legacy.

---

- [ ] **Step 1: Crear nueva ruta de check-in multitenant**

Crear `src/app/(public)/[slug]/check-in/page.tsx`:

```typescript
import { notFound } from 'next/navigation';
import { getTenantBySlug } from '@/lib/tenant';
import { resolveTenantConfig } from '@/lib/tenant-config';
import { TenantProvider } from '@/context/TenantContext';
// Importar el componente de check-in existente (sin cambiar su internals aún)
import CheckInPageContent from '@/components/features/check-in/CheckInPageContent';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CheckInPage({ params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);

  if (!tenant) notFound();

  const config = resolveTenantConfig(tenant.business_type, tenant.config);

  return (
    <TenantProvider tenant={tenant} config={config}>
      <CheckInPageContent tenantId={tenant.id} />
    </TenantProvider>
  );
}
```

**NOTA:** `CheckInPageContent` es el componente extraído del actual `src/app/(public)/check-in/page.tsx`. En este step, mover la lógica existente a ese componente y que el page actual (`/check-in`) también lo use para no romper QRs impresos existentes.

- [ ] **Step 2: Actualizar generación de URL del QR**

En `src/lib/utils/qrcode.ts` (o donde se genere la URL del QR), cambiar la URL base:

```typescript
// ANTES:
const checkInUrl = `${baseUrl}/check-in`;

// DESPUÉS:
const checkInUrl = `${baseUrl}/${tenantSlug}/check-in`;
```

El dashboard de QR debe pasar el slug del tenant al generar el QR.

- [ ] **Step 3: Verificar que la ruta vieja sigue funcionando**

La ruta `src/app/(public)/check-in/page.tsx` debe seguir existiendo y funcionar para QRs impresos que no han sido reemplazados. Puede leer el tenant desde una variable de entorno `NEXT_PUBLIC_TENANT_SLUG` como fallback:

```typescript
// src/app/(public)/check-in/page.tsx — versión legacy
import { redirect } from 'next/navigation';

export default function LegacyCheckIn() {
  const slug = process.env.NEXT_PUBLIC_TENANT_SLUG;
  if (slug) redirect(`/${slug}/check-in`);
  return <div>Check-in no disponible</div>;
}
```

- [ ] **Step 4: Compilar y probar**

```bash
npx tsc --noEmit
npm run dev
```

Visitar `http://localhost:3000/sushi-service/check-in` — debe cargar el check-in de Sushi Service.
Visitar `http://localhost:3000/check-in` — debe redirigir a `/sushi-service/check-in` si `NEXT_PUBLIC_TENANT_SLUG=sushi-service`.

- [ ] **Step 5: Commit**

```bash
git add src/app/(public)/[slug]/ src/app/(public)/check-in/
git commit -m "feat(public): ruta /[slug]/check-in para multitenant + redirect legacy /check-in"
```

---

### Task 13: Super-Admin Dashboard UI

**Files:**
- Create: `src/app/(super-admin)/super-admin/layout.tsx`
- Create: `src/app/(super-admin)/super-admin/page.tsx`
- Create: `src/app/(super-admin)/super-admin/tenants/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/super-admin/tenants` del Task 9
- Produces: Dashboard visual con tabla de tenants, gasto Twilio, balance billetera, botón de topup

---

- [ ] **Step 1: Crear layout super-admin**

Crear `src/app/(super-admin)/super-admin/layout.tsx`:

```typescript
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== 'super_admin') {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Cada1 — Super Admin</h1>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Crear página principal super-admin**

Crear `src/app/(super-admin)/super-admin/page.tsx`:

```typescript
import Link from 'next/link';
import type { TenantUsageSummary } from '@/types/tenant.types';

async function getTenantsSummaries(): Promise<TenantUsageSummary[]> {
  // En Server Component, llamar directamente al service (no via fetch)
  const { createServerClient } = await import('@/lib/supabase/server-admin');
  const { getTenantUsageSummary } = await import('@/services/wallet.service');
  const supabase = createServerClient();

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, slug, name, business_type, config, twilio_subaccount_sid, twilio_messaging_service_sid, twilio_whatsapp_number, is_active, created_at')
    .order('created_at');

  if (!tenants) return [];
  return Promise.all(tenants.map(t => getTenantUsageSummary(t as never)));
}

export default async function SuperAdminPage() {
  const summaries = await getTenantsSummaries();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Tenants ({summaries.length})</h2>
        <Link
          href="/super-admin/tenants/new"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
        >
          + Nuevo tenant
        </Link>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-400 text-left">
            <th className="pb-2 pr-4">Negocio</th>
            <th className="pb-2 pr-4">Tipo</th>
            <th className="pb-2 pr-4">Msgs este mes</th>
            <th className="pb-2 pr-4">Gasto USD</th>
            <th className="pb-2 pr-4">Balance Twilio</th>
            <th className="pb-2 pr-4">Billetera COP</th>
            <th className="pb-2">Msgs restantes est.</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map(s => (
            <tr key={s.tenant_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
              <td className="py-3 pr-4">
                <Link href={`/super-admin/tenants/${s.tenant_id}`} className="font-medium hover:underline">
                  {s.tenant_name}
                </Link>
                <span className="ml-2 text-zinc-500 text-xs">{s.tenant_slug}</span>
              </td>
              <td className="py-3 pr-4 text-zinc-400">{s.tenant_slug}</td>
              <td className="py-3 pr-4">{s.twilio_messages_this_month.toLocaleString()}</td>
              <td className="py-3 pr-4">${s.twilio_spend_usd_this_month.toFixed(2)}</td>
              <td className="py-3 pr-4">
                {s.twilio_subaccount_balance_usd !== null
                  ? `$${s.twilio_subaccount_balance_usd.toFixed(2)}`
                  : <span className="text-zinc-600">—</span>}
              </td>
              <td className="py-3 pr-4">
                {s.wallet_balance_cop.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
              </td>
              <td className="py-3">
                {s.estimated_messages_remaining !== null
                  ? `~${s.estimated_messages_remaining.toLocaleString()} msgs`
                  : <span className="text-zinc-600">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Verificar y testear visualmente**

```bash
npm run dev
```

Ir a `http://localhost:3000/super-admin` con un usuario super_admin. Debe mostrar la tabla de tenants con los datos de uso.

- [ ] **Step 4: Actualizar CHANGELOG.md**

Agregar entrada `v3.0.0`:

```markdown
## v3.0.0 — Multitenant Migration + Generalización (2026-06-23)

### Breaking Changes
- Rutas de check-in cambian de `/check-in` a `/[slug]/check-in`
- Variables de entorno `NEXT_PUBLIC_BRAND_*` y `NEXT_PUBLIC_STAFF_ROLE_LABEL` marcadas como deprecated

### Added
- Tabla `tenants` con soporte para `restaurant`, `barbershop`, `beauty_salon`
- `tenant_id` en todas las tablas con aislamiento por RLS
- Twilio subaccounts por tenant (aislamiento de número y billing)
- Billetera prepagada COP con tracking de transacciones
- Super-admin dashboard en `/super-admin`
- `TenantContext` con labels dinámicos según tipo de negocio
- Función `current_tenant_id()` en Supabase para RLS automático
```

- [ ] **Step 5: Commit final del milestone**

```bash
git add src/app/(super-admin)/ CHANGELOG.md docs/
git commit -m "feat(ui): super-admin dashboard — tabla tenants, uso Twilio, billetera COP (v3.0.0)"
```

---

## Checklist Final antes de Deploy

- [ ] `npx tsc --noEmit` sin errores
- [ ] Todas las migraciones 00024-00028 ejecutadas en el Supabase de producción
- [ ] El usuario admin de Sushi Service tiene `app_metadata.tenant_id = 'a1b2c3d4-...'` en Supabase Auth
- [ ] El super-admin (tú) tiene `app_metadata.role = 'super_admin'` en Supabase Auth
- [ ] Las variables de entorno deprecadas siguen en `.env.local` (backward compat)
- [ ] `NEXT_PUBLIC_TENANT_SLUG=sushi-service` en Vercel para la instancia legacy
- [ ] Webhook de Twilio actualizado a la nueva URL (si cambió)
- [ ] Test end-to-end: check-in en `/sushi-service/check-in` funciona y registra en Supabase
- [ ] Test super-admin: `/super-admin` muestra Sushi Service con uso correcto
- [ ] Actualizar `docs/features/multi-tenant-migration-urgente.md` con referencia a este plan

---

## Notas de Migración para Clientes Futuros

Al onboardear un cliente nuevo (barbería, salón, etc.):

1. Ir a `/super-admin` → "Nuevo tenant" → llenar slug, nombre, business_type
2. Click "Provisionar Twilio" → crea subaccount automáticamente
3. Configurar Messaging Service en Twilio Console para ese subaccount
4. Actualizar `tenants.twilio_messaging_service_sid` y `twilio_whatsapp_number`
5. Crear usuario admin en Supabase Auth → setear `app_metadata.tenant_id` = UUID del tenant
6. Cliente entra a `https://cada1.app/[slug]/check-in` — listo

El proceso que antes tomaba 3-4 horas con setup manual de Supabase + Vercel + GitHub ahora toma ~20 minutos.

---

## MILESTONE 4: Capa de Aplicación — Propagación de tenant_id

> **Prerrequisito**: Milestones 1-3 completos.
> **Contexto**: `getServiceClient()` se llama 146 veces en 39 archivos — NINGUNA filtra por `tenant_id`. Este milestone conecta la DB multitenant con el código de aplicación.

---

### Task 14: Tipos — añadir tenant_id a database.types.ts

**Files:**
- Modify: `src/types/database.types.ts`

**Interfaces:**
- Produces: Todas las interfaces de tabla con `tenant_id: string`. TypeScript detecta automáticamente qué servicios faltan el campo.

---

- [ ] **Step 1: Añadir tenant_id a cada interface**

En `src/types/database.types.ts`, insertar `tenant_id: string` como segundo campo (después de `id`) en cada interface de tabla:

```typescript
export interface Customer {
  id: string
  tenant_id: string  // ← NUEVO
  phone: string
  name: string
  // ...resto sin cambio
}

export interface Visit {
  id: string
  tenant_id: string  // ← NUEVO
  customer_id: string
  // ...resto sin cambio
}

export interface Reward {
  id: string
  tenant_id: string  // ← NUEVO
  visit_milestone: number | null
  // ...resto sin cambio
}

export interface Campaign {
  id: string
  tenant_id: string  // ← NUEVO
  name: string
  // ...resto sin cambio
}

export interface CampaignMessage {
  id: string
  tenant_id: string  // ← NUEVO
  campaign_id: string
  // ...resto sin cambio
}

export interface AuthorizedNumber {
  id: string
  tenant_id: string  // ← NUEVO
  phone: string
  // ...resto sin cambio
}

export interface StaffUser {
  id: string
  tenant_id: string  // ← NUEVO
  name: string
  // ...resto sin cambio
}

export interface StaffDevice {
  id: string
  tenant_id: string  // ← NUEVO
  staff_user_id: string | null
  // ...resto sin cambio
}

export interface RestaurantEvent {
  id: string
  tenant_id: string  // ← NUEVO
  title: string
  // ...resto sin cambio
}

export interface PointTransaction {
  id: string
  tenant_id: string  // ← NUEVO
  customer_id: string
  // ...resto sin cambio
}

export interface RewardTier {
  id: string
  tenant_id: string  // ← NUEVO
  tier_name: string
  // ...resto sin cambio
}

export interface MysteryBoxResult {
  id: string
  tenant_id: string  // ← NUEVO
  customer_id: string
  // ...resto sin cambio
}

export interface RewardRedemption {
  id: string
  tenant_id: string  // ← NUEVO
  customer_id: string
  // ...resto sin cambio
}

export interface ImportedContact {
  id: string
  tenant_id: string  // ← NUEVO
  phone: string
  // ...resto sin cambio
}

export interface MessageLog {
  id: string
  tenant_id: string  // ← NUEVO
  customer_id: string | null
  // ...resto sin cambio
}
```

- [ ] **Step 2: Actualizar los Insert types en Database**

En la sección `Database.public.Tables`, para cada tabla en `Insert`, añadir `tenant_id: string` como campo requerido (sin `?`):

```typescript
customers: {
  Row: Customer
  Insert: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'total_visits' | ...> & {
    tenant_id: string  // ← requerido en inserts
    id?: string
    // ...
  }
}
```

- [ ] **Step 3: Verificar que TypeScript detecta los servicios rotos**

```bash
npx tsc --noEmit
```

Resultado esperado: errores TypeScript en servicios que hacen `insert({...})` sin `tenant_id`. Esto es correcto — estos errores se corrigen en Task 15.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.types.ts
git commit -m "feat(types): añadir tenant_id a todas las interfaces de tabla en database.types.ts"
```

---

### Task 15: Servicios — añadir parámetro tenantId (14 archivos)

**Files:**
- Modify: `src/services/customer.service.ts`
- Modify: `src/services/campaign.service.ts`
- Modify: `src/services/settings.service.ts`
- Modify: `src/services/visit.service.ts`
- Modify: `src/services/reward.service.ts`
- Modify: `src/services/reward-tiers.service.ts`
- Modify: `src/services/points.service.ts`
- Modify: `src/services/mystery-box.service.ts`
- Modify: `src/services/redemption.service.ts`
- Modify: `src/services/message-log.service.ts`
- Modify: `src/services/imported-contacts.service.ts`
- Modify: `src/services/delivery.service.ts`
- Modify: `src/services/calendar.service.ts`
- Modify: `src/services/dashboard.service.ts`

**Interfaces:**
- Consumes: `tenant_id` en tipos del Task 14
- Produces: Cada función de servicio acepta y usa `tenantId: string`. Los callers del Task 16-20 ven error TypeScript si lo omiten.

---

**Patrón universal** (aplicar a todas las funciones de todos los servicios):

| Operación Supabase | Cambio requerido |
|-------------------|------------------|
| `.select()` / `.from('tabla')` | Añadir `.eq('tenant_id', tenantId)` como primer filtro |
| `.insert({ campo: valor })` | Añadir `tenant_id: tenantId` en el objeto |
| `.update().eq('id', id)` | Sin cambio obligatorio (UUID único), pero añadir `.eq('tenant_id', tenantId)` para defensa |
| Firma de función | Añadir `tenantId: string` como último parámetro obligatorio |

---

#### 15.1 customer.service.ts — 6 funciones que necesitan tenantId

- [ ] **Step 1: Actualizar findCustomerByPhone**

```typescript
// ANTES:
export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', phone)
    .single()

// DESPUÉS:
export async function findCustomerByPhone(phone: string, tenantId: string): Promise<Customer | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', phone)
    .eq('tenant_id', tenantId)
    .single()
```

- [ ] **Step 2: Actualizar createCustomer**

```typescript
// ANTES: params sin tenantId
export async function createCustomer(params: {
  phone: string; name: string; birthday: string | null; city: string | null;
  source?: 'qr' | 'delivery'; accepts_marketing?: boolean; countFirstVisit?: boolean
}): Promise<Customer> {
  // ...
  .insert({ phone: params.phone, name: params.name, ... })

// DESPUÉS: tenantId requerido
export async function createCustomer(params: {
  phone: string; name: string; birthday: string | null; city: string | null;
  source?: 'qr' | 'delivery'; accepts_marketing?: boolean; countFirstVisit?: boolean;
  tenantId: string  // ← NUEVO
}): Promise<Customer> {
  const countFirst = params.countFirstVisit ?? true
  // ...
  .insert({
    phone: params.phone,
    name: params.name,
    birthday: params.birthday,
    city: params.city,
    total_visits: countFirst ? 1 : 0,
    last_visit_at: countFirst ? new Date().toISOString() : null,
    source_channels: params.source ?? 'qr',
    accepts_marketing: params.accepts_marketing ?? true,
    tenant_id: params.tenantId,  // ← NUEVO
  })
```

- [ ] **Step 3: Actualizar setWhatsappOptOut, clearWhatsappOptOut, isPhoneOptedOut**

```typescript
// Añadir tenantId a las tres funciones y filtrar por él:
export async function setWhatsappOptOut(phone: string, tenantId: string): Promise<void> {
  // ...normalización igual...
  await supabase.from('customers')
    .update({ whatsapp_opt_out_at: new Date().toISOString(), accepts_marketing: false })
    .eq('phone', normalized)
    .eq('tenant_id', tenantId)  // ← NUEVO

export async function clearWhatsappOptOut(phone: string, tenantId: string): Promise<void> {
  // ...
  .eq('phone', normalized)
  .eq('tenant_id', tenantId)  // ← NUEVO

export async function isPhoneOptedOut(phone: string, tenantId: string): Promise<boolean> {
  // ...
  .eq('phone', normalized)
  .eq('tenant_id', tenantId)  // ← NUEVO
```

- [ ] **Step 4: Commit customer.service.ts**

```bash
git add src/services/customer.service.ts
git commit -m "feat(services): customer.service.ts — tenantId en findByPhone, create, optOut"
```

---

#### 15.2 settings.service.ts — CRÍTICO (admin_settings PK cambia a (key, tenant_id))

- [ ] **Step 1: Actualizar getSettingValue y getMultipleSettings**

```typescript
// ANTES:
export async function getSettingValue(key: string): Promise<string | null> {
  const supabase = getServiceClient()
  const { data } = await supabase.from('admin_settings').select('value').eq('key', key).single()
  return data?.value ?? null
}

// DESPUÉS — sin tenantId la query devuelve múltiples filas (una por tenant):
export async function getSettingValue(key: string, tenantId: string): Promise<string | null> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('admin_settings')
    .select('value')
    .eq('key', key)
    .eq('tenant_id', tenantId)
    .single()
  return data?.value ?? null
}

// ANTES:
export async function getMultipleSettings(keys: string[]): Promise<Record<string, string>> {
  const supabase = getServiceClient()
  const { data } = await supabase.from('admin_settings').select('key, value').in('key', keys)

// DESPUÉS:
export async function getMultipleSettings(keys: string[], tenantId: string): Promise<Record<string, string>> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('admin_settings')
    .select('key, value')
    .in('key', keys)
    .eq('tenant_id', tenantId)

// getReactivationDaysConfig también necesita tenantId:
export async function getReactivationDaysConfig(tenantId: string): Promise<ReactivationDaysConfig> {
  const settings = await getMultipleSettings([
    'reactivation_soft_days',
    'reactivation_aggressive_days',
  ], tenantId)
  // ...resto igual
```

- [ ] **Step 2: Commit settings.service.ts**

```bash
git add src/services/settings.service.ts
git commit -m "feat(services): settings.service.ts — tenantId en getSettingValue y getMultipleSettings (PK compuesto)"
```

---

#### 15.3 campaign.service.ts — campañas, mensajes, búsqueda de clientes

- [ ] **Step 1: Actualizar las funciones de búsqueda de clientes**

```typescript
// findBirthdayCustomers:
export async function findBirthdayCustomers(tenantId: string): Promise<Customer[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .not('birthday', 'is', null)
    .eq('accepts_marketing', true)
    .eq('tenant_id', tenantId)  // ← NUEVO
  // ...filter JS por mes/día igual

// findInactiveCustomers — tenantId como primer parámetro:
export async function findInactiveCustomers(
  tenantId: string,
  reactivationDays: number = REACTIVATION_DAYS
): Promise<Customer[]> {
  const supabase = getServiceClient()
  // ...fechas igual...
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .lt('last_visit_at', cutoffDate)
    .not('last_visit_at', 'is', null)
    .eq('accepts_marketing', true)
    .eq('tenant_id', tenantId)  // ← NUEVO
    .or(`last_campaign_at.is.null,last_campaign_at.lt.${campaignCapDate}`)

// updateCustomerLastCampaignAt:
export async function updateCustomerLastCampaignAt(
  customerIds: string[],
  tenantId: string
): Promise<void> {
  if (customerIds.length === 0) return
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('customers')
    .update({ last_campaign_at: new Date().toISOString() })
    .in('id', customerIds)
    .eq('tenant_id', tenantId)  // ← NUEVO
```

- [ ] **Step 2: Actualizar funciones de campañas y mensajes**

```typescript
// getOrCreateTodayCampaign — añadir tenantId al SELECT y al INSERT:
export async function getOrCreateTodayCampaign(
  type: string,
  message: string,
  tenantId: string
): Promise<Campaign> {
  const supabase = getServiceClient()
  // Buscar campaña de hoy filtrada por tenant:
  const { data: existing } = await supabase
    .from('campaigns')
    .select('*')
    .eq('type', type)
    .eq('tenant_id', tenantId)  // ← NUEVO
    .gte('created_at', startOfDayISO)
    .maybeSingle()
  if (existing) return existing
  // Crear nueva:
  const { data } = await supabase
    .from('campaigns')
    .insert({ ..., tenant_id: tenantId })  // ← NUEVO
    .select().single()
  return data

// recordCampaignMessage — tenantId en params y en INSERT:
export async function recordCampaignMessage(params: {
  campaignId: string; customerId: string; status: string;
  twilioSid?: string | null; errorMessage?: string | null;
  tenantId: string  // ← NUEVO
}): Promise<void> {
  const supabase = getServiceClient()
  await supabase.from('campaign_messages').insert({
    campaign_id: params.campaignId,
    customer_id: params.customerId,
    status: params.status,
    twilio_sid: params.twilioSid ?? null,
    error_message: params.errorMessage ?? null,
    tenant_id: params.tenantId,  // ← NUEVO
  })

// hasRecentCampaignMessage — filtrar campaign_messages por tenant:
export async function hasRecentCampaignMessage(
  customerId: string,
  type: string,
  days: number,
  tenantId: string  // ← NUEVO
): Promise<boolean> {
  // ...
  .from('campaign_messages')
  .eq('customer_id', customerId)
  .eq('tenant_id', tenantId)  // ← NUEVO
  // ...

// finalizeCampaign — añadir tenantId como defensa:
export async function finalizeCampaign(
  campaignId: string,
  sent: number,
  tenantId: string
): Promise<void> {
  // ...
  .eq('id', campaignId)
  .eq('tenant_id', tenantId)  // ← defensa en profundidad
```

- [ ] **Step 3: Commit campaign.service.ts**

```bash
git add src/services/campaign.service.ts
git commit -m "feat(services): campaign.service.ts — tenantId en findBirthday/findInactive/campaigns/messages"
```

---

#### 15.4 Servicios restantes (11 archivos) — aplicar el mismo patrón

- [ ] **Step 1: Editar cada archivo según la tabla**

Aplicar el patrón universal a cada servicio listado. Para cada función que consulta Supabase:

| Archivo | Tablas que consulta | Función principal a ejemplo |
|---------|--------------------|-----------------------------|
| `visit.service.ts` | `visits` | `createVisit({..., tenantId})`, `getVisits(tenantId)` |
| `reward.service.ts` | `rewards` | `getRewards(tenantId)`, `createReward({..., tenantId})` |
| `reward-tiers.service.ts` | `reward_tiers` | `getRewardTiers(tenantId)`, `buildTiersRoadmap(points, tenantId)` |
| `points.service.ts` | `point_transactions`, `customers` | `awardPoints({..., tenantId})`, `getPointBalance(customerId, tenantId)` |
| `mystery-box.service.ts` | `mystery_box_results`, `mystery_box_global_caps` | `recordMysteryBox({..., tenantId})`, `checkGlobalCap(tierId, tenantId)` |
| `redemption.service.ts` | `reward_redemptions` | `recordRedemption({..., tenantId})`, `getRedemptions(tenantId)` |
| `message-log.service.ts` | `message_logs` | `logMessage({..., tenantId})`, `getMessageLogs(tenantId)` |
| `imported-contacts.service.ts` | `imported_contacts` | `importContacts([...], tenantId)`, `getImportedContacts(tenantId)` |
| `delivery.service.ts` | `authorized_numbers`, `customers`, `visits` | `isAuthorizedNumber(phone, tenantId)`, `processDelivery({..., tenantId})` |
| `calendar.service.ts` | `restaurant_events` | `getEvents(tenantId)`, `createEvent({..., tenantId})`, `getEventsDue(tenantId)` |
| `dashboard.service.ts` | múltiples | `getCustomers({..., tenantId})`, `getDashboardMetrics(tenantId)` |

Para `dashboard.service.ts` (el más crítico para Task 19), mostrar `getCustomers`:

```typescript
// ANTES:
export async function getCustomers(params: {
  page: number; limit: number; search?: string; source?: string; tier?: string; status?: string
}): Promise<{ customers: Customer[]; total: number }> {
  const supabase = getServiceClient()
  let query = supabase.from('customers').select('*', { count: 'exact' })

// DESPUÉS:
export async function getCustomers(params: {
  page: number; limit: number; search?: string; source?: string; tier?: string; status?: string;
  tenantId: string  // ← NUEVO, requerido
}): Promise<{ customers: Customer[]; total: number }> {
  const supabase = getServiceClient()
  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('tenant_id', params.tenantId)  // ← NUEVO, siempre primer filtro
  // ...el resto de filtros igual (search, source, tier, status)
```

- [ ] **Step 2: Commit por grupo de archivos**

```bash
git add src/services/visit.service.ts
git commit -m "feat(services): visit.service.ts — tenantId"

git add src/services/reward.service.ts src/services/reward-tiers.service.ts
git commit -m "feat(services): reward + reward-tiers — tenantId"

git add src/services/points.service.ts src/services/mystery-box.service.ts
git commit -m "feat(services): points + mystery-box — tenantId"

git add src/services/redemption.service.ts src/services/message-log.service.ts
git commit -m "feat(services): redemption + message-log — tenantId"

git add src/services/imported-contacts.service.ts src/services/delivery.service.ts
git commit -m "feat(services): imported-contacts + delivery — tenantId"

git add src/services/calendar.service.ts src/services/dashboard.service.ts
git commit -m "feat(services): calendar + dashboard — tenantId"
```

---

### Task 16: check-in API route — propagar tenantId

**Files:**
- Modify: `src/app/api/check-in/route.ts`

**Interfaces:**
- Consumes: Todos los servicios del Task 15 (ahora con `tenantId` requerido)
- Produces: El check-in recibe `tenantId` del body y lo pasa a todos los servicios

---

- [ ] **Step 1: Leer tenantId del body y validarlo**

Al inicio del handler POST, después de parsear el body:

```typescript
// Añadir junto al destructuring existente:
const { phone, name, birthday, city, mesa, tenantId } = body

// Añadir validación temprana:
if (!tenantId || typeof tenantId !== 'string') {
  return NextResponse.json({ error: 'tenantId es requerido' }, { status: 400 })
}
```

- [ ] **Step 2: Añadir tenantId a cada llamada de servicio en el archivo**

Buscar cada llamada y agregar el parámetro:

```typescript
// customer.service calls:
findCustomerByPhone(phone)               → findCustomerByPhone(phone, tenantId)
createCustomer({ phone, name, ... })     → createCustomer({ phone, name, ..., tenantId })
setWhatsappOptOut(phone)                 → setWhatsappOptOut(phone, tenantId)
isPhoneOptedOut(phone)                   → isPhoneOptedOut(phone, tenantId)

// settings.service calls:
getSettingValue('key')                   → getSettingValue('key', tenantId)
getMultipleSettings(['k1', 'k2'])        → getMultipleSettings(['k1', 'k2'], tenantId)

// campaign.service calls:
recordCampaignMessage({ ... })           → recordCampaignMessage({ ..., tenantId })

// visit.service calls:
createVisit({ ... })                     → createVisit({ ..., tenantId })

// points.service calls:
awardPoints({ ... })                     → awardPoints({ ..., tenantId })

// message-log.service calls:
logMessage({ ... })                      → logMessage({ ..., tenantId })
```

- [ ] **Step 3: Actualizar el cliente de check-in para enviar tenantId**

En `src/app/(public)/[slug]/check-in/page.tsx` (Task 12), el componente `CheckInPageContent` ya recibe `tenantId` como prop. En el submit del formulario, incluirlo en el body:

```typescript
// En el POST al check-in API:
const response = await fetch('/api/check-in', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone, name, birthday, city, mesa, tenantId }),  // ← tenantId
})
```

- [ ] **Step 4: Compilar y verificar**

```bash
npx tsc --noEmit
```

Resultado esperado: 0 errores en check-in/route.ts.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/check-in/ src/app/(public)/
git commit -m "feat(api): check-in route — tenantId en body + propagado a todos los servicios"
```

---

### Task 17: Crons — iteración por tenant (3 archivos)

**Files:**
- Create: `src/lib/tenant-iterator.ts`
- Modify: `src/app/api/cron/birthday/route.ts`
- Modify: `src/app/api/cron/reactivation/route.ts`
- Modify: `src/app/api/cron/calendar-dispatch/route.ts`

**Interfaces:**
- Consumes: Servicios del Task 15 (con tenantId), `getTwilioClientForTenant()` del Task 7
- Produces: Cada cron itera sobre tenants activos y usa los settings + Twilio de cada uno

---

- [ ] **Step 1: Crear helper getActiveTenants**

Crear `src/lib/tenant-iterator.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Tenant } from '@/types/tenant.types'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export type TenantWithCredentials = Tenant & {
  twilio_subaccount_auth_token: string | null
}

export async function getActiveTenants(): Promise<TenantWithCredentials[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('is_active', true)
    .order('created_at')
  if (error) throw new Error(`Error obteniendo tenants activos: ${error.message}`)
  return (data ?? []) as TenantWithCredentials[]
}
```

- [ ] **Step 2: Refactorizar birthday cron**

En `src/app/api/cron/birthday/route.ts`, envolver la lógica actual en un loop por tenant:

```typescript
import { getActiveTenants } from '@/lib/tenant-iterator'
import { getTwilioClientForTenant } from '@/services/whatsapp.service'

async function handleCron() {
  const tenants = await getActiveTenants()
  const results: Record<string, { sent: number; failed: number; error?: string }> = {}

  for (const tenant of tenants) {
    try {
      const templateSid = await getSettingValue('birthday_template_sid', tenant.id)
      if (!templateSid) {
        results[tenant.slug] = { sent: 0, failed: 0 }
        continue
      }

      const customers = await findBirthdayCustomers(tenant.id)
      if (customers.length === 0) {
        results[tenant.slug] = { sent: 0, failed: 0 }
        continue
      }

      const campaign = await getOrCreateTodayCampaign(
        'birthday',
        `template:${templateSid}`,
        tenant.id
      )
      let sent = 0
      let failed = 0
      const sentCustomerIds: string[] = []

      // Cliente Twilio del subaccount del tenant (fallback al global si no configurado)
      const tenantTwilio = {
        twilioClient: getTwilioClientForTenant(tenant),
        whatsappNumber: tenant.twilio_whatsapp_number ?? process.env.TWILIO_WHATSAPP_NUMBER ?? '',
      }

      for (const customer of customers) {
        const alreadySent = await hasRecentCampaignMessage(
          customer.id, 'birthday', 365, tenant.id
        )
        if (alreadySent) continue

        try {
          const tiersRoadmap = await buildTiersRoadmap(customer.total_points ?? 0, tenant.id)
          const result = await sendTemplateMessage(
            customer.phone,
            templateSid,
            { '1': customer.name, '2': tiersRoadmap },
            tenantTwilio
          )
          await recordCampaignMessage({
            campaignId: campaign.id, customerId: customer.id,
            status: result ? 'sent' : 'failed',
            twilioSid: result?.sid ?? null,
            errorMessage: result ? null : 'Error de envío',
            tenantId: tenant.id,
          })
          if (result) { sent++; sentCustomerIds.push(customer.id) }
          else failed++
        } catch (err) {
          failed++
          await recordCampaignMessage({
            campaignId: campaign.id, customerId: customer.id,
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Error',
            tenantId: tenant.id,
          })
        }
      }

      await updateCustomerLastCampaignAt(sentCustomerIds, tenant.id)
      await finalizeCampaign(campaign.id, sent, tenant.id)
      results[tenant.slug] = { sent, failed }
    } catch (tenantErr) {
      console.error(`[Cron Birthday] Error en tenant ${tenant.slug}:`, tenantErr)
      results[tenant.slug] = { sent: 0, failed: 0, error: String(tenantErr) }
    }
  }

  return NextResponse.json({ ok: true, total_tenants: tenants.length, results })
}
```

- [ ] **Step 3: Aplicar el mismo loop a reactivation y calendar-dispatch**

Para `reactivation/route.ts`:

```typescript
// El mismo patrón: for (const tenant of tenants) { ... }
// Cambios clave:
const { softDays, aggressiveDays } = await getReactivationDaysConfig(tenant.id)
const customers = await findInactiveCustomers(tenant.id, softDays)
// resto igual pero con tenant.id en todos los service calls
```

Para `calendar-dispatch/route.ts`:

```typescript
// El mismo patrón: for (const tenant of tenants) { ... }
// Cambios clave:
const eventsDue = await getEventsDue(tenant.id)
// procesar cada evento con el cliente Twilio del tenant
```

- [ ] **Step 4: Actualizar sendTemplateMessage para aceptar cliente Twilio override**

En `src/services/whatsapp.service.ts`, el parámetro `tenantTwilio` ya existe del Task 7. Verificar que `sendTemplateMessage` acepta el override:

```typescript
export async function sendTemplateMessage(
  phone: string,
  templateSid: string,
  variables: Record<string, string>,
  twilioOverride?: {
    twilioClient: ReturnType<typeof Twilio>
    whatsappNumber: string
  }
): Promise<{ sid: string } | null> {
  const client = twilioOverride?.twilioClient ?? getTwilioClient()
  const from = twilioOverride?.whatsappNumber ?? TWILIO_WHATSAPP_NUMBER
  // ...resto igual
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenant-iterator.ts src/app/api/cron/
git commit -m "feat(cron): loop por tenant — birthday + reactivation + calendar-dispatch multitenant"
```

---

### Task 18: Webhook twilio-incoming — resolución de tenant dinámico

**Files:**
- Modify: `src/app/api/webhook/twilio-incoming/route.ts`

**Interfaces:**
- Consumes: `getTenantByMessagingService()` del Task 7
- Produces: `BRAND_NAME` y `RESTAURANT_LINK` vienen del tenant en DB, no de env vars hardcodeados

---

- [ ] **Step 1: Eliminar las constantes hardcodeadas del archivo**

```typescript
// ELIMINAR estas dos líneas (líneas 13-18 actuales):
const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'el restaurante'
const RESTAURANT_LINK =
  process.env.RESTAURANT_WHATSAPP_LINK ??
  (process.env.DELIVERY_PHONE_NUMBER
    ? `https://wa.me/57${process.env.DELIVERY_PHONE_NUMBER.replace(/\D/g, '')}`
    : '')
```

- [ ] **Step 2: Resolver el tenant al inicio del handler POST**

```typescript
// Añadir imports:
import { getTenantByMessagingService } from '@/lib/tenant'
import { createClient } from '@supabase/supabase-js'

// Al inicio del handler, ANTES de detectar intent:
export async function POST(request: NextRequest) {
  const body = await request.formData()
  const messagingServiceSid = body.get('MessagingServiceSid') as string | null
  const toNumber = body.get('To') as string | null
  const fromNumber = body.get('From') as string | null
  const bodyText = (body.get('Body') as string | null) ?? ''

  // Resolver tenant por MessagingServiceSid
  let tenant = messagingServiceSid
    ? await getTenantByMessagingService(messagingServiceSid)
    : null

  // Fallback: resolver por número To
  if (!tenant && toNumber) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await supabase
      .from('tenants')
      .select('*')
      .eq('twilio_whatsapp_number', toNumber.replace('whatsapp:', ''))
      .eq('is_active', true)
      .maybeSingle()
    tenant = data
  }

  // Branding dinámico del tenant, con fallback a env vars
  const brandName = tenant?.config?.brand_name
    ?? process.env.NEXT_PUBLIC_BRAND_NAME
    ?? 'el restaurante'
  const restaurantLink = tenant?.config?.whatsapp_link
    ?? process.env.RESTAURANT_WHATSAPP_LINK
    ?? ''
  const tenantId = tenant?.id ?? null
```

- [ ] **Step 3: Actualizar buildMessage para recibir brandName y restaurantLink**

```typescript
// Cambiar firma para que no use constantes del módulo:
function buildMessage(
  intent: keyof typeof KEYWORDS | 'default',
  brandName: string,
  restaurantLink: string
): string {
  const redirect = restaurantLink ? `\n\n📲 Escríbenos aquí: ${restaurantLink}` : ''
  switch (intent) {
    case 'pedido':
      return `🍽️ ¡Para pedidos o domicilios te atendemos en la línea principal de ${brandName}!${redirect}`
    case 'horario':
      return `🕐 Para consultar horarios comunícate con nosotros directamente.${redirect}`
    case 'ubicacion':
      return `📍 Para dirección e indicaciones comunícate con nosotros directamente.${redirect}`
    default:
      return `👋 Hola, este número de *${brandName}* es exclusivo para mensajes automáticos 🔔\n\nPara hablar con nosotros:${redirect}\n\n¡Te respondemos rápido!`
  }
}

// En el handler, llamar con los parámetros del tenant:
const message = buildMessage(intent, brandName, restaurantLink)
```

- [ ] **Step 4: Actualizar llamadas a setWhatsappOptOut y clearWhatsappOptOut**

```typescript
// Solo persistir opt-out si tenemos tenant identificado:
if (tenantId) {
  if (isOptOutKeyword) await setWhatsappOptOut(fromNumber, tenantId)
  if (isOptInKeyword) await clearWhatsappOptOut(fromNumber, tenantId)
} else {
  console.warn('[webhook/incoming] Sin tenant resuelto — opt-out no persiste en DB')
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhook/twilio-incoming/route.ts
git commit -m "feat(webhook): twilio-incoming — resolver tenant por MSID + branding dinámico desde DB"
```

---

### Task 19: Dashboard API routes — helper + propagación (20 archivos)

**Files:**
- Create: `src/lib/auth/require-tenant-auth.ts`
- Modify: todos los archivos en `src/app/api/dashboard/**`

**Interfaces:**
- Consumes: JWT de Supabase Auth con `app_metadata.tenant_id` (seteable desde Supabase Dashboard)
- Produces: Cada dashboard route filtra datos por el tenant del usuario autenticado

---

- [ ] **Step 1: Crear helper requireTenantAuth**

Crear `src/lib/auth/require-tenant-auth.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export type TenantAuthOk = { tenantId: string; userId: string }
export type TenantAuthResult = TenantAuthOk | { error: NextResponse }

export async function requireTenantAuth(): Promise<TenantAuthResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined
  if (!tenantId) {
    return {
      error: NextResponse.json(
        { error: 'Usuario sin tenant asignado. Contactar al administrador de Cada1.' },
        { status: 403 }
      )
    }
  }

  return { tenantId, userId: user.id }
}
```

- [ ] **Step 2: Aplicar patrón a cada route del dashboard**

Para cada archivo en `src/app/api/dashboard/**`, reemplazar el bloque de autenticación:

```typescript
// ANTES (patrón actual en todos los routes):
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
const result = await getCustomers({ page, limit, search })

// DESPUÉS:
import { requireTenantAuth } from '@/lib/auth/require-tenant-auth'

const auth = await requireTenantAuth()
if ('error' in auth) return auth.error
const { tenantId } = auth
const result = await getCustomers({ page, limit, search, tenantId })
```

Lista completa de archivos (ejecutar `Get-ChildItem src/app/api/dashboard -Recurse -Filter "route.ts"` para verificar):

```
src/app/api/dashboard/customers/route.ts             → getCustomers({ ..., tenantId })
src/app/api/dashboard/customers/[id]/route.ts        → getCustomer(id, tenantId)
src/app/api/dashboard/customers/[id]/visits/route.ts → getCustomerVisits(id, tenantId)
src/app/api/dashboard/customers/[id]/points/route.ts → getCustomerPoints(id, tenantId)
src/app/api/dashboard/campaigns/route.ts             → getCampaigns({ ..., tenantId })
src/app/api/dashboard/campaigns/[id]/route.ts        → getCampaign(id, tenantId)
src/app/api/dashboard/campaigns/[id]/send/route.ts   → sendCampaign(id, tenantId)
src/app/api/dashboard/calendar/events/route.ts       → getEvents({ ..., tenantId })
src/app/api/dashboard/calendar/events/[id]/route.ts  → getEvent(id, tenantId)
src/app/api/dashboard/calendar/dispatch/route.ts     → dispatchEvent(id, tenantId)
src/app/api/dashboard/rewards/route.ts               → getRewards(tenantId)
src/app/api/dashboard/reward-tiers/route.ts          → getRewardTiers(tenantId)
src/app/api/dashboard/analytics/route.ts             → getAnalytics(tenantId)
src/app/api/dashboard/settings/route.ts              → getSettings(tenantId), updateSetting(tenantId)
src/app/api/dashboard/redemptions/route.ts           → getRedemptions({ ..., tenantId })
src/app/api/dashboard/message-logs/route.ts          → getMessageLogs({ ..., tenantId })
src/app/api/dashboard/imported-contacts/route.ts     → getImportedContacts({ ..., tenantId })
src/app/api/dashboard/delivery/route.ts              → filtrar por tenantId
src/app/api/dashboard/staff/route.ts                 → getStaffUsers(tenantId)
src/app/api/dashboard/staff/[id]/route.ts            → getStaffUser(id, tenantId)
```

- [ ] **Step 3: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/ src/app/api/dashboard/
git commit -m "feat(api): dashboard routes — requireTenantAuth + tenantId en todos los servicios (~20 archivos)"
```

---

### Task 20: Staff API routes — tenant_id en JWT de staff

**Files:**
- Modify: `src/app/api/staff/login/route.ts`
- Modify: `src/app/api/staff/me/route.ts`
- Modify: `src/app/api/staff/stats/route.ts`
- Modify: `src/app/api/staff/device/register/route.ts`
- Modify: `src/app/api/staff/device/verify/route.ts`
- Modify: `src/app/(public)/mesero/page.tsx`
- Create: `src/lib/auth/verify-staff-token.ts`

**Interfaces:**
- Produces: Staff JWT incluye `tenantId`. Todas las queries de staff filtran por tenant.

---

- [ ] **Step 1: Crear helper para verificar y leer el staff JWT**

Crear `src/lib/auth/verify-staff-token.ts`:

```typescript
import { jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'

export interface StaffTokenPayload {
  sub: string         // staff_user id
  phone: string
  name: string
  role: 'waiter' | 'supervisor' | 'admin'
  tenantId: string    // ← nuevo campo
}

function getStaffSecret() {
  const s = process.env.STAFF_JWT_SECRET
  if (!s) throw new Error('STAFF_JWT_SECRET no configurado')
  return new TextEncoder().encode(s)
}

export async function verifyStaffToken(
  request: NextRequest
): Promise<StaffTokenPayload | null> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  try {
    const { payload } = await jwtVerify(auth.slice(7), getStaffSecret())
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.tenantId !== 'string'
    ) return null
    return payload as unknown as StaffTokenPayload
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Actualizar staff login para aceptar tenantId y embeber en JWT**

En `src/app/api/staff/login/route.ts`:

```typescript
// ANTES:
const { phone, pin } = body
if (!phone || !pin) { ... }
const { data: staff } = await supabase
  .from('staff_users')
  .select(...)
  .eq('phone', phone)
  .single()

// DESPUÉS:
const { phone, pin, tenantId } = body
if (!phone || !pin || !tenantId) {
  return NextResponse.json(
    { error: 'Datos inválidos', message: 'Se requiere phone, pin y tenantId' },
    { status: 400 }
  )
}
const { data: staff } = await supabase
  .from('staff_users')
  .select('id, name, phone, pin, role, is_active')
  .eq('phone', phone)
  .eq('tenant_id', tenantId)  // ← NUEVO — buscar solo en este tenant
  .single()

// JWT incluye tenantId:
const token = await new SignJWT({
  sub: staff.id,
  phone: staff.phone,
  name: staff.name,
  role: staff.role,
  tenantId,  // ← NUEVO
})
```

- [ ] **Step 3: Actualizar me, stats, device routes para usar verifyStaffToken**

En cada route de staff:

```typescript
// ANTES (ejemplo me/route.ts):
// ...verificación manual del JWT sin tenantId

// DESPUÉS:
import { verifyStaffToken } from '@/lib/auth/verify-staff-token'
import { createClient } from '@supabase/supabase-js'

const staffPayload = await verifyStaffToken(request)
if (!staffPayload) {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const { data: staff } = await supabase
  .from('staff_users')
  .select('*')
  .eq('id', staffPayload.sub)
  .eq('tenant_id', staffPayload.tenantId)  // ← verificar que el staff es de este tenant
  .single()
```

- [ ] **Step 4: Actualizar la página de login de mesero para enviar tenantId**

En `src/app/(public)/mesero/page.tsx`, incluir `tenantId` en el POST:

```typescript
// Añadir al inicio del componente:
// Bridge solution: leer tenantId del env var mientras no haya slug en URL
const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? ''

// En el submit del formulario:
const response = await fetch('/api/staff/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone, pin, tenantId: TENANT_ID }),
})
```

Agregar a `.env.local`:
```
NEXT_PUBLIC_TENANT_ID=a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/verify-staff-token.ts src/app/api/staff/ src/app/(public)/mesero/
git commit -m "feat(staff): tenantId en JWT de staff + filtros por tenant en todas las staff routes"
```

---

### Task 21: twilio/client.ts — lazy initialization

**Files:**
- Modify: `src/lib/twilio/client.ts`

**Interfaces:**
- Produces: El cliente Twilio se instancia en el primer uso, no al importar el módulo. Elimina el crash de startup si las env vars no están configuradas (por ejemplo, en entornos de test o deploy sin Twilio).

---

- [ ] **Step 1: Reemplazar el singleton eager con un getter lazy**

```typescript
// REEMPLAZAR todo el contenido de src/lib/twilio/client.ts:

import Twilio from 'twilio'

let _client: ReturnType<typeof Twilio> | null = null

// Getter lazy: instancia el cliente solo la primera vez que se llama
export function getTwilioClient(): ReturnType<typeof Twilio> {
  if (!_client) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    if (!accountSid || !authToken) {
      throw new Error(
        'TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN deben estar configurados. ' +
        'Para tenants con subaccount, usar getTenantTwilioClient() del lib/twilio/subaccounts.ts'
      )
    }
    _client = Twilio(accountSid, authToken)
  }
  return _client
}

export const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER ?? ''
```

- [ ] **Step 2: Actualizar todos los callers de twilioClient**

```bash
# Buscar callers del singleton antiguo:
grep -rn "twilioClient\b" src/ --include="*.ts" --include="*.tsx"
```

Para cada resultado, reemplazar `twilioClient.X` por `getTwilioClient().X`:

```typescript
// ANTES: (en whatsapp.service.ts u otros)
import { twilioClient, TWILIO_WHATSAPP_NUMBER } from '@/lib/twilio/client'
twilioClient.messages.create(...)

// DESPUÉS:
import { getTwilioClient, TWILIO_WHATSAPP_NUMBER } from '@/lib/twilio/client'
getTwilioClient().messages.create(...)
```

- [ ] **Step 3: Verificar compilación**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/twilio/client.ts src/services/whatsapp.service.ts
git commit -m "feat(twilio): lazy initialization — eliminar crash de startup por env vars faltantes"
```

---

### Task 22: Migrar 16 componentes de branding.ts a useTenantConfig

**Files (los 16 identificados por grep):**

```
src/app/(public)/tarjeta/page.tsx
src/components/features/wallet/WalletCard.tsx
src/components/features/check-in/CustomerCard.tsx
src/components/layout/DashboardSidebar.tsx
src/components/features/check-in/MysteryBoxResult.tsx
src/components/features/check-in/GoogleReviewCard.tsx
src/components/features/check-in/CheckInSuccess.tsx
src/app/(public)/check-in/page.tsx
src/app/(dashboard)/dashboard/qr/page.tsx
src/components/layout/DashboardHeader.tsx
src/app/(public)/privacidad/page.tsx
src/app/(public)/mesero/dashboard/page.tsx
src/app/(public)/mesero/page.tsx
src/components/features/check-in/GoogleReviewPopup.tsx
src/app/demo/page.tsx
src/app/(auth)/login/page.tsx
```

**Interfaces:**
- Consumes: `useTenantConfig()` hook del Task 10
- Produces: Ningún componente de producción importa de `@/lib/branding` — todos leen del TenantContext

---

**Patrón por tipo de componente:**

**Client Components (con `'use client'` y dentro de un TenantProvider)**:

```typescript
// ELIMINAR:
import { BRAND_NAME, BRAND_SHORT, STAFF_LABEL } from '@/lib/branding'

// AÑADIR:
import { useTenantConfig } from '@/hooks/useTenantConfig'

// DENTRO del componente (antes del return):
const config = useTenantConfig()

// REEMPLAZAR en JSX:
// BRAND_NAME → config.brand_name
// BRAND_SHORT → config.brand_short ?? config.brand_name
// STAFF_LABEL → config.staff_role_label
// BRAND_TAGLINE → config.brand_tagline ?? ''
// BRAND_DESCRIPTION → 'Registra tus visitas, acumula premios y disfruta de beneficios exclusivos.'
```

**Server Components o páginas fuera del TenantProvider del dashboard:**

```typescript
// Para páginas públicas sin slug (mesero, login, privacidad, demo),
// mantener el import de branding.ts como fallback temporal mientras
// se migran esas rutas a /[slug]/mesero en una fase posterior:
import { BRAND_NAME } from '@/lib/branding'  // fallback hasta migrar URL a /[slug]/mesero
```

- [ ] **Step 1: Migrar componentes de check-in (6 archivos dentro de TenantProvider)**

Estos ya están dentro del TenantProvider (Task 12). Aplicar patrón Client Component:

- `src/components/features/check-in/CustomerCard.tsx`
- `src/components/features/check-in/CheckInSuccess.tsx`
- `src/components/features/check-in/MysteryBoxResult.tsx`
- `src/components/features/check-in/GoogleReviewCard.tsx`
- `src/components/features/check-in/GoogleReviewPopup.tsx`
- `src/components/features/wallet/WalletCard.tsx`

- [ ] **Step 2: Migrar componentes de layout del dashboard (2 archivos)**

`DashboardSidebar.tsx` y `DashboardHeader.tsx` están dentro del TenantProvider del layout del dashboard (Task 10). Aplicar patrón Client Component:

```typescript
// DashboardSidebar.tsx — reemplazar BRAND_NAME y BRAND_SHORT:
const config = useTenantConfig()
// <span>{BRAND_SHORT}</span> → <span>{config.brand_short ?? config.brand_name}</span>
```

- [ ] **Step 3: Migrar QR page (dentro del dashboard)**

`src/app/(dashboard)/dashboard/qr/page.tsx` ya tiene `use client` y está dentro del TenantProvider. Aplicar patrón y además actualizar la URL del check-in (ver Task 24):

```typescript
// ELIMINAR:
import { BRAND_NAME, BRAND_SHORT } from '@/lib/branding'
// AÑADIR:
import { useTenant } from '@/context/TenantContext'
const { tenant, config } = useTenant()
```

- [ ] **Step 4: Migrar tarjeta page (pública con TenantProvider propio)**

`src/app/(public)/tarjeta/page.tsx` es una página pública. Si la ruta existe bajo `/[slug]/tarjeta`, tiene acceso al tenant. Si no, leer branding de env vars como fallback.

- [ ] **Step 5: Mantener branding.ts para auth/login, demo, privacidad, mesero (fallback temporal)**

Estos cuatro archivos están en rutas que aún no tienen slug. Dejar el import de `branding.ts` por ahora — se migrarán cuando esas rutas se muevan a `/[slug]/mesero` etc. en una fase posterior.

- [ ] **Step 6: Verificar que no quedan imports de producción a branding.ts**

```bash
# Verificar cuántos imports quedan:
grep -rn "from '@/lib/branding'" src/ --include="*.tsx" --include="*.ts"
```

Resultado esperado: solo los 4 archivos de fallback temporal (login, demo, privacidad, mesero).

- [ ] **Step 7: Commit**

```bash
git add src/components/ src/app/
git commit -m "feat(ui): migrar 12 componentes de branding.ts a useTenantConfig — 4 archivos como fallback temporal"
```

---

### Task 23: middleware.ts — proteger /super-admin

**Files:**
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: JWT de Supabase Auth con `app_metadata.role === 'super_admin'`
- Produces: Cualquier ruta bajo `/super-admin` sin JWT de super_admin → redirect a `/login`

---

- [ ] **Step 1: Actualizar middleware con protección de super-admin**

```typescript
// REEMPLAZAR todo el contenido de src/middleware.ts:

import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Proteger rutas de super-admin — verificar role en JWT
  if (pathname.startsWith('/super-admin')) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll() {
            // Solo lectura en middleware — la sesión se actualiza con updateSession
          },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.app_metadata?.role !== 'super_admin') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // Para todas las demás rutas: actualizar sesión normalmente
  return updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verificar protección**

```bash
npm run dev
# Sin sesión: visitar http://localhost:3000/super-admin → redirige a /login
# Con usuario sin super_admin role: → redirige a /login
# Con usuario con app_metadata.role = 'super_admin': → carga /super-admin
```

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(auth): middleware — proteger /super-admin, verificar app_metadata.role"
```

---

### Task 24: QR Dashboard — URL con slug del tenant

**Files:**
- Modify: `src/app/(dashboard)/dashboard/qr/page.tsx`

**Interfaces:**
- Consumes: `useTenant()` hook del Task 10 para obtener `tenant.slug`
- Produces: La URL generada para el QR es `/${tenant.slug}/check-in?mesa=N`

---

- [ ] **Step 1: Reemplazar imports de branding y actualizar la URL**

En `src/app/(dashboard)/dashboard/qr/page.tsx`:

```typescript
// ELIMINAR:
import { BRAND_NAME, BRAND_SHORT } from '@/lib/branding'

// AÑADIR (el componente ya es 'use client'):
import { useTenant } from '@/context/TenantContext'

// DENTRO del componente QrPage(), después de los useState:
const { tenant, config } = useTenant()

// ACTUALIZAR la función que genera la URL (actualmente usa /check-in):
const getCheckInUrl = useCallback(() => {
  if (!baseUrl) return ''
  // En multitenant la ruta incluye el slug del tenant:
  const checkInPath = `/${tenant.slug}/check-in`
  return selectedTable
    ? `${baseUrl}${checkInPath}?mesa=${selectedTable}`
    : `${baseUrl}${checkInPath}`
}, [baseUrl, selectedTable, tenant.slug])

// REEMPLAZAR usos de BRAND_NAME y BRAND_SHORT en JSX:
// {BRAND_NAME} → {config.brand_name}
// {BRAND_SHORT} → {config.brand_short ?? config.brand_name}
```

- [ ] **Step 2: Verificar que los QR generados apuntan a la URL correcta**

```bash
npm run dev
```

Ir a Dashboard → QR → seleccionar mesa 3. El QR debe codificar `http://localhost:3000/sushi-service/check-in?mesa=3`.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/dashboard/qr/page.tsx
git commit -m "feat(qr): URL del QR con slug del tenant — /{slug}/check-in en vez de /check-in"
```

---

## Checklist Final — Milestone 4 (Capa de Aplicación)

- [ ] `npx tsc --noEmit` sin errores
- [ ] `grep -rn "from '@/lib/branding'" src/` → ≤ 4 archivos (solo fallbacks temporales)
- [ ] `grep -rn "findCustomerByPhone(" src/app/` → todos los callers pasan `tenantId`
- [ ] `grep -rn "getSettingValue(" src/app/` → todos los callers pasan `tenantId`
- [ ] Check-in `http://localhost:3000/sushi-service/check-in` funciona end-to-end
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/birthday` → `{ ok: true, results: { "sushi-service": { sent: N } } }`
- [ ] Dashboard `/dashboard/customers` solo muestra clientes de Sushi Service (verificar que no aparecen clientes de otros tenants si se añaden)
- [ ] Staff login `POST /api/staff/login` con `{ phone, pin, tenantId }` devuelve JWT con `tenantId` en payload
- [ ] Super-admin `/super-admin` carga con usuario `app_metadata.role = 'super_admin'`, redirige sin él
- [ ] QR generado en dashboard apunta a `/sushi-service/check-in?mesa=N`
- [ ] Añadir al `.env.local` final: `NEXT_PUBLIC_TENANT_ID=a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- [ ] Actualizar `docs/features/multi-tenant-migration-urgente.md` → añadir referencia a Milestone 4
