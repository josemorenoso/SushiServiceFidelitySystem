# Pre-vuelo Multitenant — Correcciones al plan del 23-Junio

> **Estado:** el plan `2026-06-23-multitenant-migration.md` fue validado contra el esquema REAL
> (migraciones 00001–00023) el 2026-07-04. **NO es seguro correrlo tal cual.** Este documento
> lista las discrepancias verificadas y el enfoque corregido. Léelo ANTES de correr nada esta noche.

---

## 🔴 Por qué el plan original es peligroso tal cual

### 1. Nombres de políticas RLS equivocados → fuga de datos entre tenants

El plan (migración `00026`) hace `DROP POLICY IF EXISTS "<nombre>"`. Como usa `IF EXISTS`, si el nombre
no coincide **el DROP no falla: simplemente no borra nada** y la política vieja **queda viva**. Casi todas
las políticas viejas usan `auth.role() = 'authenticated'` o `USING (true)` — es decir, **cualquier admin
autenticado de cualquier tenant puede leer/escribir la tabla**. Si quedan vivas, cada restaurante vería
los datos de los demás.

Comparación nombre-en-plan vs. nombre-real:

| Tabla | El plan borra… | Nombre REAL (verificado) | ¿El plan acierta? |
|-------|----------------|--------------------------|-------------------|
| customers | `admin_select/insert/update_customers` | iguales **+** `service_role_select/insert/update_customers` (00015) | ❌ faltan los `service_role_*` |
| visits | `admin_select/insert_visits` | iguales **+** `service_role_select/insert_visits` (00015) | ❌ faltan los `service_role_*` |
| rewards | `admin_all/select/insert/update/delete_rewards` | solo `admin_select/insert/update_rewards` | ⚠️ borra de más (inocuo) |
| authorized_numbers | `admin_all_authorized_numbers` | `service_select_authorized`, `admin_insert_authorized`, `admin_update_authorized` | ❌ nombre inexistente → reales quedan vivas |
| campaigns | `admin_all/select/insert/update/delete_campaigns` | `admin_all_campaigns` + `service_select/insert/update_campaigns` | ❌ faltan los `service_*` |
| staff_users | `admin_select/insert/update/delete_staff_users` | `admin_all_staff_users`, `service_select_staff_users` | ❌ nombres inexistentes → reales quedan vivas |
| staff_devices | `admin_select/insert/update/delete_staff_devices` | `admin_all_staff_devices`, `service_select_staff_devices` | ❌ nombres inexistentes → reales quedan vivas |
| reward_redemptions | `admin_select/service_insert/admin_update_reward_redemptions` | `admin_select_redemptions`, `service_insert_redemptions`, `admin_update_redemptions`, `service_select_redemptions` | ❌ sufijo equivocado (`_redemptions`, no `_reward_redemptions`) |
| imported_contacts | `admin_all_imported_contacts` | + `service_select/insert/update_imported` | ❌ faltan los `service_*_imported` |

### 2. Tablas ausentes por completo en el plan

El plan NO cubre estas tablas (ni tenant_id ni RLS). Todas existen (migración 00013) y contienen datos por-negocio:

| Tabla | Políticas reales | Índice único |
|-------|------------------|--------------|
| `reward_tiers` | `admin_all_reward_tiers`, `service_select_reward_tiers` | `reward_tiers_threshold_unique` (parcial WHERE is_active) |
| `point_transactions` | `admin_select_point_transactions`, `service_insert_/service_select_point_transactions` | — |
| `mystery_box_results` | `admin_select_mystery_box_results`, `service_all_mystery_box_results` | — |
| `mystery_box_global_caps` | `admin_all_global_caps`, `service_all_global_caps` | `idx_global_caps_tier_prize` |

> `mystery_box_global_caps` es especialmente importante: son los cupos de premios (ej. "máx 5 platos fuertes/mes").
> Si no se aísla por tenant, un restaurante consumiría el cupo de premios de otro.

### 3. Bugs de constraint/índice

- `imported_contacts`: el plan hace `ALTER TABLE ... DROP CONSTRAINT idx_imported_contacts_phone`, pero
  `idx_imported_contacts_phone` es un **ÍNDICE**, no un constraint → debe ser `DROP INDEX IF EXISTS`.
- `rewards_visit_milestone_unique`, `reward_tiers_threshold_unique`, `idx_global_caps_tier_prize` son
  índices únicos que deben pasar a incluir `tenant_id` (o quedar cubiertos por el FK a una tabla ya aislada).

### 4. 🔴 `NOT NULL` sin `DEFAULT` rompe TODOS los writes (crítico)

El plan (00028) hacía `ALTER COLUMN tenant_id SET NOT NULL` sin default. El código actual **no pasa
`tenant_id` en ningún INSERT** (`createCustomer`, `createVisit`, `awardPoints`, etc.). En el instante que
corres eso, **todo check-in, visita y transacción de puntos falla** con "null value in column tenant_id".
**Corrección aplicada:** `tenant_id` con `DEFAULT = tenant de Sushi` → la app sigue escribiendo sin cambios
de código. Es un **puente mono-tenant**; se quita el default antes del tenant #2 (ver 00028).

### 5. 🔴 El RLS NO aísla el path de service_role (realidad de arquitectura)

Verificado: el 95% del acceso a datos usa `getServiceClient()` (**SERVICE_ROLE_KEY**), que **bypasa RLS**.
La anon key no lee tablas de datos (solo auth: `DashboardHeader.tsx`, `login`). Conclusión: **el RLS por sí
solo NO aísla tenants en esta app**. El aislamiento real exige filtrar `tenant_id` en cada query de la app
(Milestone 2). El RLS de 00026 protege el path autenticado directo y deja la base correcta, pero **no habilita
onboarding de tenant #2 hasta completar Milestone 2**.

### 6. 🔴 Falta tagear `auth.users` (dashboard quedaría vacío)

Tras 00026, el path autenticado filtra por `current_tenant_id()`, que lee `app_metadata.tenant_id` del JWT.
Los usuarios admin existentes **no lo tienen** → verían cero datos. **Corrección aplicada** en 00028:
`UPDATE auth.users SET raw_app_meta_data = ... tenant_id`. Requiere re-login para refrescar el JWT.

---

## ✅ Inventario verificado (esto es lo correcto)

### Tablas que reciben `tenant_id` (18)
customers, visits, rewards, authorized_numbers, campaigns, campaign_messages, admin_settings,
restaurant_events, restaurant_locations, reward_tiers, point_transactions, mystery_box_results,
mystery_box_global_caps, staff_users, staff_devices, message_logs, reward_redemptions, imported_contacts.

### Constraints/índices únicos a convertir en compuestos (con tenant_id)
| Objeto actual | Tipo | Nuevo |
|---------------|------|-------|
| `customers_phone_key` | constraint | `UNIQUE (phone, tenant_id)` |
| `authorized_numbers_phone_key` | constraint | `UNIQUE (phone, tenant_id)` |
| `staff_users_phone_key` | constraint | `UNIQUE (phone, tenant_id)` |
| `idx_imported_contacts_phone` | **índice** | `UNIQUE INDEX (phone, tenant_id)` |
| `rewards_visit_milestone_unique` | índice parcial | `(visit_milestone, tenant_id) WHERE visit_milestone IS NOT NULL` |
| `reward_tiers_threshold_unique` | índice parcial | `(point_threshold, tenant_id) WHERE is_active` |
| `admin_settings` PK `(key)` | primary key | `(key, tenant_id)` |
| `idx_global_caps_tier_prize` `(tier_id, prize_title)` | índice | ya queda aislado vía FK a `reward_tiers` (per-tenant); se puede dejar igual |
| `idx_reward_redemptions_unique_mystery_box` | índice parcial | ya aislado vía FK a `mystery_box_results` (per-tenant); dejar igual |

---

## ✅ Decisiones de diseño (tomadas)

1. **Estrategia service_role → eliminar políticas permisivas.** Verificado que la app usa
   `getServiceClient()` (SERVICE_ROLE_KEY, que bypasa RLS) para todo el acceso a datos, y que la anon key no
   lee tablas de datos. → 00026 **borra dinámicamente TODAS las políticas** de las 18 tablas y crea una única
   `tenant_all_*` para el path autenticado. El service role sigue funcionando por bypass.
2. **`mystery_box_global_caps` → recibe `tenant_id`.** Incluida en las 18 tablas de 00025/00026/00028.
3. **Ejecución en orden, de a uno,** verificando cada NOTICE. Ver queries abajo.
4. **Puente mono-tenant con DEFAULT** (hallazgo #4) para no romper writes sin tocar código.
5. **Tag de `auth.users`** (hallazgo #6) incluido en 00028.

---

## Orden de ejecución (corregido) — TODAS las migraciones GENERADAS ✅

Correr en el SQL Editor de Supabase **en este orden, una por una**, revisando el `NOTICE` de cada una:

1. `00024_tenants.sql` — tenants + `current_tenant_id()` + `is_super_admin()`. ✅ (riesgo cero)
2. `00025_add_tenant_id.sql` — tenant_id nullable en 18 tablas + drop de uniques globales. ✅
3. `00026_multitenant_rls.sql` — drop dinámico de TODAS las políticas + `tenant_all_*` por tenant. ✅
4. `00027_wallet.sql` — billetera COP. ✅ (riesgo cero)
5. `00028_seed_sushi_service.sql` — seed Sushi + backfill + DEFAULT + NOT NULL + uniques compuestos + tag auth.users. ✅

> Nota: no pude ejecutarlas (el conector Supabase requiere auth interactiva). Están verificadas
> estáticamente: las 3 listas de tablas coinciden (18) y el SQL cuadra con el esquema real 00001–00023.

### Queries de verificación (correr después de cada paso)

```sql
-- Tras 00024: helpers existen (deben devolver NULL/false sin JWT)
SELECT current_tenant_id(), is_super_admin();

-- Tras 00025: 18 tablas con tenant_id
SELECT count(*) FROM information_schema.columns WHERE column_name='tenant_id' AND table_schema='public';

-- Tras 00026: 18 políticas tenant_all_* y CERO admin_/service_ en esas tablas
SELECT policyname, tablename FROM pg_policies
WHERE schemaname='public' AND policyname LIKE 'tenant_all_%' ORDER BY tablename;

-- Tras 00028: Sushi existe, cero clientes sin tenant, admins tageados
SELECT id, slug, name FROM tenants;
SELECT count(*) AS clientes_sin_tenant FROM customers WHERE tenant_id IS NULL;   -- debe ser 0
SELECT email, raw_app_meta_data->>'tenant_id' AS tenant FROM auth.users;         -- todos con tenant
```

### ⚠️ Después de migrar (antes del tenant #2)

Esta migración deja la **base** lista y la app **sigue funcionando en mono-tenant** (todo es Sushi vía DEFAULT).
El aislamiento real (dar de alta un tenant #2 sin mezclar datos) requiere el **Milestone 2**: que cada query
de la app filtre/inserte `tenant_id`, y quitar los `DEFAULT` de las 18 tablas. No dar de alta tenant #2 antes.

### Post-migración: re-login

Los admins deben **cerrar y volver a iniciar sesión** para que el JWT recoja `app_metadata.tenant_id`.
