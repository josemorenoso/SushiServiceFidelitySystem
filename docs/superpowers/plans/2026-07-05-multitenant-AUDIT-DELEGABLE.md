# Encargo de Auditoría Multitenant (delegable a IA económica)

> **Objetivo:** que CADA query a una tabla con `tenant_id` filtre/inserte por el tenant correcto.
> El 95% del acceso usa `getServiceClient()` (service-role), que **ignora RLS**. Por eso el filtro
> debe ser **explícito en el código**. Sin esto, un restaurante ve/escribe datos de otro.
>
> **Contexto:** Ya se hizo la parte de servicios core. Este doc lista lo que FALTA. Trabajar
> archivo por archivo. Al terminar cada grupo, correr `npx tsc --noEmit` y arreglar errores.

---

## La regla (aplica a las 18 tablas con `tenant_id`)

Tablas con `tenant_id`: `customers, visits, rewards, authorized_numbers, campaigns,
campaign_messages, admin_settings, restaurant_events, restaurant_locations, reward_tiers,
point_transactions, mystery_box_results, mystery_box_global_caps, staff_users, staff_devices,
message_logs, reward_redemptions, imported_contacts`.

Para cada `.from('<tabla>')` en esas tablas:

1. **SELECT / UPDATE / DELETE** filtrando por algo que NO sea el PK `id`
   (ej. por `phone`, por `key`, o sin filtro / listados):
   → **añadir** `.eq('tenant_id', tenantId)`.

2. **INSERT**:
   → **añadir** `tenant_id: tenantId` al objeto insertado.

3. **SELECT/UPDATE por PK `id`** (ej. `.eq('id', customerId)`):
   → es seguro sin tenant (los UUID son únicos globales). **NO tocar**, salvo que quieras
   defensa extra. Priorizar los otros.

**Nunca** tocar consultas a tablas SIN `tenant_id` (ej. `tenants`, `tenant_wallet_transactions`,
`auth.users`).

---

## De dónde sale el `tenantId` según el tipo de archivo

| Área | Cómo obtener el tenant | Import |
|------|------------------------|--------|
| `src/app/api/dashboard/**` (autenticado) | `const tenantId = await requireTenantId()` | `import { requireTenantId } from '@/lib/tenant'` |
| `src/app/api/staff/**`, `reward-redeem`, `mystery-box/resolve` (se sirven en el dominio del negocio) | `const tenant = await getTenantByDomain(request.headers.get('host'))` → usar `tenant.id`. Si `!tenant` → 404. | `import { getTenantByDomain } from '@/lib/tenant'` |
| `src/app/api/check-in/**`, `src/app/api/public/**`, `src/app/(public)/**` | igual: `getTenantByDomain(host)`. En páginas (server components) el host sale de `const h = await headers(); h.get('host')` (`import { headers } from 'next/headers'`). | idem |
| `src/app/api/webhook/delivery/route.ts` | `const tenant = await getTenantBySlug(body.tenant_slug)` (n8n manda `tenant_slug` en el body). Si `!tenant` → 404. | `import { getTenantBySlug } from '@/lib/tenant'` |
| `src/app/api/webhook/twilio-incoming/route.ts` | `const tenant = await getTenantByWhatsappNumber(to)` (el campo `To` del body de Twilio, formato `whatsapp:+57...`). Si `!tenant` → responder TwiML vacío 200. | `import { getTenantByWhatsappNumber } from '@/lib/tenant'` |
| `src/app/api/cron/birthday`, `src/app/api/cron/reactivation` | `const slug = new URL(request.url).searchParams.get('tenant')` → `getTenantBySlug(slug)`. Si `!tenant` → 400. | `import { getTenantBySlug } from '@/lib/tenant'` |
| `src/app/api/cron/calendar-dispatch` (si existe) | por evento: `getTenantById(event.tenant_id)`. | `import { getTenantById } from '@/lib/tenant'` |
| Servicios (`dashboard.service`, `reward.service`, `redemption.service`, `imported-contacts.service`, `calendar.service`, `delivery.service`) | **NO resuelven tenant**. Reciben `tenantId: string` como parámetro y lo aplican. El route que los llama se lo pasa. | — |

`requireTenantId()` lanza si el JWT no trae `tenant_id` (admin sin re-login). En dashboard está bien
que lance (devuelve 500) — el admin debe re-loguearse tras la migración.

---

## YA HECHO — NO tocar (referencia)

Estos servicios ya quedaron tenant-aware. Sirven de EJEMPLO del patrón:
`settings.service`, `customer.service`, `visit.service`, `points.service`, `reward-tiers.service`,
`campaign.service`, `whatsapp.service`, `message-log.service`, `mystery-box.service`, y `src/lib/tenant.ts`.

Sus funciones ahora **exigen** `tenantId`. Por eso muchos archivos de abajo tienen errores de
compilación: hay que pasarles el `tenantId` que resolviste arriba.

---

## Checklist de archivos a arreglar

Marcar con `[x]` al terminar. Correr `npx tsc --noEmit` tras cada grupo.

### Grupo A — Servicios que faltan (agregar param `tenantId` y aplicarlo)

- [ ] `src/services/calendar.service.ts` (9 queries)
  - `createEvent(input, tenantId)` → INSERT lleva `tenant_id`.
  - `listEvents(fromDate, toDate, tenantId)` → SELECT `.eq('tenant_id', tenantId)`.
  - `updateEvent(id, patch, tenantId)` y `cancelEvent(id, tenantId)` → UPDATE `.eq('tenant_id', tenantId)`.
  - `findCustomersForEvent(filters, tenantId)` → SELECT `.eq('tenant_id', tenantId)`.
  - `getEvent(id)` → por PK, dejar igual.
  - `findDueAutoEvents()` → es un barrido global del cron; dejar SIN filtro (devuelve eventos de todos los tenants).
  - `executeAutoEvent(eventId)` → tras `getEvent`, resolver `const tenant = await getTenantById(event.tenant_id)`; usar `tenant.id` para `getMultipleSettings`, `createCalendarCampaign`, `recordCampaignMessage`; pasar el objeto `tenant` a `sendTemplateMessage(phone, sid, vars, tenant, mediaUrl, {...})`. Reemplazar `process.env.NEXT_PUBLIC_BRAND_NAME` por `tenant.config?.brand_name ?? 'El Restaurante'`.
- [ ] `src/services/imported-contacts.service.ts` (11 queries)
  - Las funciones que leen/escriben `imported_contacts` reciben `tenantId` y lo aplican (SELECT/INSERT/UPDATE).
  - `getSettingValue('twilio_cost_per_message_usd', tenantId)` (línea ~34) y `getSettingValue('avg_ticket', tenantId)` (~433).
  - La función que envía (línea ~284) llama `sendTemplateMessage(c.phone, sid, vars, tenant, undefined, {...})` → necesita el objeto `tenant`; el route que la invoca (dashboard) debe resolver `getTenantById`/pasar el tenant y esta función recibirlo.
- [ ] `src/services/reward.service.ts` (4 queries) → cada SELECT/INSERT/UPDATE de `rewards` filtra/inserta `tenant_id`. Agregar `tenantId` param.
- [ ] `src/services/redemption.service.ts` (6 queries) → `reward_redemptions` (+ posibles `rewards`): filtrar/insertar `tenant_id`. Agregar `tenantId` param.
- [ ] `src/services/dashboard.service.ts` (15 queries) → **CRÍTICO, es el que alimenta el dashboard**. TODAS las lecturas de `customers/visits/campaigns/...` deben `.eq('tenant_id', tenantId)`. Agregar `tenantId` a cada función exportada.
- [ ] `src/services/delivery.service.ts` (1 query) → revisar la tabla; si es de las 18, scoping por `tenantId`.

### Grupo B — Rutas dashboard (resolver `requireTenantId()` y pasar/scoping)

- [ ] `src/app/api/dashboard/authorized-numbers/route.ts` (3) y `.../[id]/route.ts` (2)
- [ ] `src/app/api/dashboard/campaigns/route.ts` (1), `estimate` (1), `segments` (1), `manual` (5), `efficiency` (4)
- [ ] `src/app/api/dashboard/settings/route.ts` (4)
- [ ] `src/app/api/dashboard/reward-tiers/route.ts` (11)
- [ ] `src/app/api/dashboard/rewards/route.ts` (5)
- [ ] `src/app/api/dashboard/staff/route.ts` (5) y `.../staff/device/route.ts` (3)
- [ ] `src/app/api/dashboard/location/route.ts` (4)
- [ ] `src/app/api/dashboard/imported-contacts/route.ts` (1), `confirm`, `validate`
- [ ] `src/app/api/dashboard/customers/[id]/route.ts` (2) y `.../next-reward/route.ts` (2)
- [ ] `src/app/api/dashboard/twilio-metrics/route.ts` (1)
- [ ] Cualquier otra bajo `src/app/api/dashboard/**` que quede con error de tsc.

### Grupo C — Rutas públicas (resolver por dominio) + webhooks + crons

- [ ] `src/app/api/check-in/route.ts` (8) → `getTenantByDomain(host)`; pasar `tenant.id` a services y `tenant` a `sendTemplateMessage`.
- [ ] `src/app/api/check-in/status/route.ts` (3) → igual.
- [ ] `src/app/(public)/tarjeta/page.tsx` → `headers()` para el host → `getTenantByDomain`.
- [ ] `src/app/api/public/customer-card/route.ts`, `public/points-range/route.ts`, `public/reward-tiers/route.ts` → por dominio.
- [ ] `src/app/api/mystery-box/resolve/route.ts` → por dominio; pasar `tenant.id`/`tenant`.
- [ ] `src/app/api/reward-redeem/route.ts` (4) → por dominio.
- [ ] `src/app/api/webhook/delivery/route.ts` (1 + services) → `getTenantBySlug(body.tenant_slug)`; pasar `tenant.id` a services y `tenant` a `sendTemplateMessage`.
- [ ] `src/app/api/webhook/twilio-incoming/route.ts` (1) → `getTenantByWhatsappNumber(to)`; `setWhatsappOptOut(phone, tenant.id)` / `clearWhatsappOptOut(phone, tenant.id)`.
- [ ] `src/app/api/cron/birthday/route.ts` → `?tenant=slug`; pasar tenant a `findBirthdayCustomers`, `getOrCreateTodayCampaign`, `buildTiersRoadmap`, `recordCampaignMessage`, `sendTemplateMessage`.
- [ ] `src/app/api/cron/reactivation/route.ts` → igual (`findInactiveCustomers(tenantId, days)`, `getReactivationDaysConfig(tenantId)`, etc.).

### Grupo D — Rutas staff (resolver por dominio)

- [ ] `src/app/api/staff/login/route.ts` (2), `me` (3), `stats` (4), `device/register` (4), `device/verify` (2)
  - Resolver `getTenantByDomain(host)`. `staff_users`/`staff_devices` se filtran/insertan por `tenant.id`.
  - **OJO login:** `staff_users.phone` ya NO es único global; el login por teléfono/PIN DEBE filtrar por `tenant_id`, si no un mesero podría matchear el de otro restaurante.

---

## Casos especiales / trampas

- **`admin_settings`**: su PK ahora es `(key, tenant_id)`. Todo `.eq('key', x).single()` DEBE llevar
  también `.eq('tenant_id', tenantId)`, o `.single()` puede traer 2 filas y romper.
- **INSERTs con service-role**: aunque exista un DEFAULT puente (que etiqueta como Sushi Service),
  hay que poner `tenant_id` EXPLÍCITO igual — si no, los datos de un tenant nuevo caen en Sushi.
- **`sendTemplateMessage`** ahora es `(phone, contentSid, variables, tenant, mediaUrl?, logContext?)`
  donde `tenant` es el objeto con credenciales Twilio. Pasar el `tenant` resuelto, NO `undefined`.
- **Barridos de sistema** (crons que iteran todos los tenants) son la única excepción a "siempre filtrar":
  ahí se itera y se resuelve el tenant por fila.

---

## Verificación final (para el que audita)

1. `npx tsc --noEmit` → **0 errores**.
2. Grep de control — no debe quedar ningún SELECT/listado sin filtro en las 18 tablas:
   revisar manualmente cada resultado de:
   `\.from\('(customers|visits|campaigns|reward_tiers|reward_redemptions|message_logs|imported_contacts|restaurant_events|staff_users|staff_devices|point_transactions|mystery_box_results)'\)`
   y confirmar que cada uno tiene `.eq('tenant_id', ...)` o es por PK `id`.
3. Dejar una lista de dudas (queries donde no fue obvio el origen del tenant) para revisión de Opus.
