# Documentación de API

**Base URL:** `/api`
**Autenticación:**
- **Dashboard endpoints** — Cookie-based (Supabase SSR, sesión admin via `supabase.auth.getUser()`)
- **Staff endpoints públicos** (`/api/staff/*`) — Bearer Token (Staff JWT) o `X-Device-Token`
- **Webhooks / Cron** — `x-webhook-secret` o `CRON_SECRET`
**Última actualización:** 2026-07-11
> **Nota:** Validación de geolocalización está en **STANDBY** (v1.0.5-3). El backend no valida GPS por defecto. Puede reactivarse descomentando el bloque en `src/app/api/check-in/route.ts`.

---

## Autenticación

### Dashboard (Admin)
Endpoints bajo `/api/dashboard/*` usan **cookie-based auth** via Supabase SSR. El servidor lee la sesión del admin desde las cookies automáticamente. No se envía header `Authorization` manualmente.

```typescript
const supabase = await createClient() // @/lib/supabase/server
const { data: { user } } = await supabase.auth.getUser()
if (!user) return 401
```

### Staff (Mesero)
Endpoints bajo `/api/staff/*` requieren **Bearer Token** (JWT de mesero) o **`X-Device-Token`** (dispositivo de confianza):

```
Authorization: Bearer {staff_jwt}
X-Device-Token: {device_fingerprint}
```

### Webhooks / Cron
Webhooks validan origen por número autorizado o `x-webhook-secret`. Cron jobs validan `CRON_SECRET`.

---

## Índice de Endpoints

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| GET | /api/health | Estado del servidor | NO |
| GET | /api/health/twilio | Test conexión Twilio (saldo) | NO |
| POST | /api/check-in | Registrar visita (QR) + conversión Golden Bullet | NO (público) |
| GET | /api/check-in/status | Estado del cliente + visita reciente + `pending_reward` + `active_grants[]` | NO (público) |
| GET | /api/check-in/review-prompt | ¿Se le muestra el pop-up de reseña? Sella el evento `shown` (dedupe 12h) | NO (público) |
| POST | /api/check-in/review-action | `clicked` (sella + **otorga el premio**) o `postponed` | NO (público, rate-limited) |
| GET | /api/public/customer-card | Datos de tarjeta del cliente (puntos, tiers) por teléfono | NO (público) |
| POST | /api/reward-redeem | Registrar entrega física de un premio (acepta `grant_id`, `tier_id` opcional) | Staff (Bearer/X-Device-Token) |
| POST | /api/webhook/delivery | Recibir datos de domicilio (n8n/Twilio) | x-webhook-secret |
| POST | /api/webhook/twilio-incoming | Auto-responder mensajes entrantes al número | Twilio Signature |
| GET/POST | /api/cron/birthday | Enviar felicitaciones de cumpleaños | CRON_SECRET |
| GET/POST | /api/cron/reactivation | Enviar reactivaciones (días configurables, default 21/25) + otorga premio de campaña con `expires_at` | CRON_SECRET |
| GET/POST | /api/cron/calendar-dispatch | Auto-enviar eventos del calendario vencidos (disparado por n8n) | CRON_SECRET |
| GET/POST | /api/cron/reward-reminder | Barrido de vencidos + recordatorio de premio por vencer (disparado por n8n) | CRON_SECRET |
| GET | /api/dashboard/metrics | Métricas generales | Admin Cookie |
| GET | /api/dashboard/customers | Lista de clientes | Admin Cookie |
| POST | /api/dashboard/campaigns | Crear campaña manual | Admin Cookie |
| POST | /api/dashboard/campaigns/:id/send | Ejecutar campaña | Admin Cookie |
| GET | /api/dashboard/campaigns/estimate | Estimar audiencia con filtros | Admin Cookie |
| POST | /api/dashboard/campaigns/manual | Crear y ejecutar campaña manual (**409 si saldo insuficiente**) | Admin Cookie |
| GET | /api/dashboard/twilio-balance | Saldo Twilio matriz + costo/msg (**saldo solo super-admin**; tenants → `restricted`) | Admin Cookie |
| GET | /api/dashboard/wallet | Saldo COP del tenant actual: balance, mensajes disponibles, consumo del mes, últimos movimientos | Admin Cookie |
| POST | /api/admin/wallet/topup | Registrar recarga manual de un tenant (asignar saldo) | **Super-admin** |
| GET | /api/admin/wallets | Estado de la billetera de todos los tenants (saldo, consumo, última recarga) | **Super-admin** |
| GET | /api/dashboard/redemptions | Listar redenciones con filtros | Admin Cookie |
| GET | /api/dashboard/redemptions/summary | Resumen de redenciones (premio/hora/mesero) | Admin Cookie |
| GET | /api/dashboard/campaign-rewards | Listar catálogo de premios de campaña (`?active=true` opcional) | Admin Cookie |
| POST | /api/dashboard/campaign-rewards | Crear premio de campaña | Admin Cookie |
| PATCH | /api/dashboard/campaign-rewards | Actualizar premio (título, descripción, `is_active`) | Admin Cookie |
| DELETE | /api/dashboard/campaign-rewards?id=X | Baja lógica del premio (`is_active=false`, no borra) | Admin Cookie |
| GET | /api/dashboard/review-metrics | Funnel de reseñas: mostrado → click → premio redimido | Admin Cookie |
| GET | /api/dashboard/tenant-config | Claves editables de `tenants.config` (hoy: `google_maps_url`) | Admin Cookie |
| PUT | /api/dashboard/tenant-config | Escribe `tenants.config` con **whitelist** de claves (merge, no reemplazo) | Admin Cookie |
| POST | /api/dashboard/imported-contacts/validate | Validar CSV de contactos (sin insertar) | Admin Cookie + flag |
| POST | /api/dashboard/imported-contacts/confirm | Confirmar e importar/enviar Golden Bullet | Admin Cookie + flag |
| GET | /api/dashboard/imported-contacts | Listar lotes o contactos de un lote | Admin Cookie |
| GET | /api/dashboard/imported-contacts/stats | Estadísticas por lote | Admin Cookie |
| GET | /api/dashboard/imported-contacts/roi | ROI por lote | Admin Cookie |
| GET | /api/dashboard/twilio-metrics | Métricas de entrega/lectura/opt-outs WhatsApp | Admin Cookie |
| GET | /api/dashboard/analytics | Analytics completos del dashboard | Admin Cookie |
| GET | /api/dashboard/templates | Listar plantillas Twilio Content API | Admin Cookie |
| POST | /api/dashboard/templates | Crear plantilla + submit aprobación WhatsApp | Admin Cookie |
| POST | /api/dashboard/check-in-override | Registrar visita extra (admin override) | Admin Cookie |
| GET | /api/dashboard/settings | Obtener configuración del admin | Admin Cookie |
| PUT | /api/dashboard/settings | Actualizar configuración | Admin Cookie |
| GET | /api/dashboard/customers/:id | Detalle de un cliente | Admin Cookie |
| GET | /api/dashboard/customers/:id/next-reward | Próxima recompensa del cliente | Admin Cookie |
| POST | /api/dashboard/rewards | Crear recompensa (visit_milestone opcional) | Admin Cookie |
| DELETE | /api/dashboard/rewards?id=X | Eliminar recompensa | Admin Cookie |
| PATCH | /api/dashboard/rewards | Actualizar `is_active`, `title` y/o `visit_milestone` | Admin Cookie |
| GET | /api/dashboard/calendar/events | Listar eventos en rango `?from=&to=` | Admin Cookie |
| POST | /api/dashboard/calendar/events | Crear evento del calendario | Admin Cookie |
| GET | /api/dashboard/calendar/events/:id | Detalle de un evento | Admin Cookie |
| PATCH | /api/dashboard/calendar/events/:id | Actualizar evento | Admin Cookie |
| POST | /api/dashboard/calendar/events/:id/dispatch | Disparar/reintentar auto-envío del evento (manual) | Admin Cookie |
| DELETE | /api/dashboard/calendar/events/:id | Cancelar evento (soft-delete) | Admin Cookie |
| POST | /api/dashboard/calendar/media-upload | Subir imagen/video a `event-media` | Admin Cookie |
| DELETE | /api/dashboard/calendar/media-upload?path=X | Borrar asset del bucket | Admin Cookie |
| GET | /api/dashboard/location | Obtener ubicación del restaurante | Admin Cookie |
| PUT | /api/dashboard/location | Actualizar ubicación del restaurante | Admin Cookie |
| GET | /api/dashboard/staff | Listar meseros y dispositivos | Admin Cookie |
| POST | /api/dashboard/staff | Crear mesero (admin) | Admin Cookie |
| PATCH | /api/dashboard/staff | Actualizar mesero (toggle, reset PIN) | Admin Cookie |
| DELETE | /api/dashboard/staff | Eliminar mesero | Admin Cookie |
| POST | /api/staff/login | Login mesero (phone + PIN) | NO |
| GET | /api/staff/me | Validar sesión mesero | Staff JWT / Device |
| GET | /api/staff/stats | Visitas registradas hoy | Staff JWT / Device |
| POST | /api/staff/device/register | Activar dispositivo de confianza | Supervisor PIN |
| POST | /api/staff/device/verify | Verificar device_token | NO |
| GET | /api/staff/pending-rewards | Premios activos de clientes con check-in en las últimas 6h | Staff JWT / Device |

---

## Formato de Respuestas

### Exitosa
```json
{
  "data": { ... },
  "message": "Operación exitosa"
}
```

### Paginada
```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

### Error
```json
{
  "error": "Tipo de error",
  "message": "Descripción del error",
  "details": { }
}
```

---

## Endpoints

### Health Check

**`GET /api/health`** — Sin autenticación

**Response 200:**
```json
{
  "status": "ok",
  "timestamp": "2026-04-07T10:30:00Z"
}
```

---

### Check-in (QR / Staff Scan)

**`POST /api/check-in`** — Sin autenticación (ruta pública). **Staff scan** requiere auth de mesero.

Endpoint unificado con 3 acciones: `lookup`, `register`, `checkin`.

#### Lookup (buscar cliente)
**Request:**
```json
{ "phone": "3001234567", "action": "lookup", "lat": 6.244203, "lon": -75.581211 }
```
> `lat` y `lon` son opcionales. Solo se requieren si el admin activa **Modo estricto GPS** (`geo_strict_mode`).

**Response 200 (encontrado):**
```json
{
  "found": true,
  "checkin_mode": "staff_verified",
  "checkin_first_visit_free": true,
  "customer": { "id": "uuid", "name": "Juan", "total_visits": 4, "current_tier": "Plata", "total_points": 240 }
}
```
**Response 200 (no encontrado):**
```json
{ "found": false, "checkin_mode": "staff_verified", "checkin_first_visit_free": true }
```

#### Register (cliente nuevo)
**Request:**
```json
{ "phone": "3001234567", "action": "register", "name": "Juan Pérez", "birthday": "1990-05-15", "city": "Bogotá" }
```
**Response 201:**
```json
{ "message": "welcome", "customer": { "name": "Juan Pérez", "total_visits": 1, "total_points": 75 }, "points_awarded": 75, "tiers": [...] }
```

**Response 201 (modo staff_verified + first_visit_free=false, sin auth de mesero) — v1.6.0:**
> El cliente queda registrado con `total_visits = 0` (sin visita), recibe su welcome bonus y debe mostrar el QR dinámico para que el mesero valide su primera visita.
```json
{ "message": "registered_pending_scan", "qr_token": "eyJhbG...", "customer": { "id": "uuid", "name": "Juan Pérez", "total_visits": 0, "total_points": 75 }, "points_awarded": 75, "tiers": [...] }
```
> Si el registro lo hace un mesero autenticado (`registered_by_staff_id` o `device_token` válidos), la visita se cuenta de inmediato y responde `message: "welcome"` con `source='staff_scan'`.
> ⚠️ El response 403 "Validación requerida" en register fue **eliminado en v1.6.0** — reemplazado por el flujo `registered_pending_scan`.

#### Check-in (cliente existente)
**Request (auto QR):**
```json
{ "phone": "3001234567", "action": "checkin" }
```

**Request (staff scan con QR token):**
```json
{
  "phone": "3001234567",
  "action": "checkin",
  "source": "staff_scan",
  "token": "eyJhbG...", // JWT del QR dinámico del cliente
  "table_number": 12,
  "registered_by_staff_id": "uuid" // o device_token
}
```

**Headers staff scan:**
```
Authorization: Bearer {staff_jwt}  // OR
X-Device-Token: {device_fingerprint}
```

**Response 200:**
```json
{
  "message": "welcome_back",
  "customer": { "name": "Juan", "total_visits": 5, "total_points": 310 },
  "points_awarded": 65,
  "tier_unlocked": { "id": "uuid", "name": "Oro", "safe_reward": "Gaseosa gratis", "mystery_box_enabled": true, "is_black": false },
  "next_tier": { "name": "BLACK", "points_remaining": 350, "threshold": 1000 }
}
```

**Response 403 (modo staff_verified sin mesero):**
```json
{ "error": "Validación requerida", "message": "Este restaurante requiere que un mesero valide tu visita." }
```

**Response 403 (QR expirado):**
```json
{ "error": "QR inválido", "message": "El código QR del cliente ha expirado o es inválido." }
```

**Response 403 (ubicación requerida — modo estricto):**
```json
{ "error": "Ubicación requerida", "message": "El restaurante requiere activar la ubicación para hacer check-in" }
```

> **Nota:** Ya no existe cap de 24h entre check-ins. Los clientes pueden acumular visitas ilimitadas por día.

---

### Tarjeta Pública del Cliente

**`GET /api/public/customer-card?phone=XXXX`** — Sin autenticación (ruta pública)

Retorna los datos de fidelización de un cliente por número de celular. Usado por integraciones externas; la página `/tarjeta` usa SSR directo en lugar de este endpoint.

**Rate limit:** 30 req/min por IP

**Query params:**

| Param | Tipo | Requerido | Descripción |
| ----- | ---- | --------- | ----------- |
| `phone` | `string` | Sí | Número de celular (formato colombiano, 10 dígitos) |

**Response 200 (encontrado):**
```json
{
  "found": true,
  "customer": {
    "name": "Juan García",
    "total_points": 340,
    "total_visits": 8
  },
  "tiers": [
    {
      "tier_name": "Bronce",
      "point_threshold": 200,
      "safe_reward_title": "Rollo gratis",
      "mystery_box_enabled": true,
      "is_black": false
    }
  ],
  "next_tier": {
    "name": "Plata",
    "threshold": 500,
    "points_remaining": 160
  }
}
```

**Response 200 (no encontrado):**
```json
{ "found": false }
```

**Response 400:** `{ "error": "Se requiere phone" }` / `{ "error": "Teléfono inválido" }`

**Response 429:** `{ "error": "Too many requests", "Retry-After": "N" }` (rate limit excedido)

**Response 500:** `{ "error": "Error del servidor" }`

---

### Check-in Status (Polling del cliente)

**`GET /api/check-in/status?phone=3001234567`** — Sin autenticación (ruta pública)

Endpoint para que la pantalla del cliente (mostrando el QR) detecte automáticamente cuando el mesero ha registrado la visita.

**Query params:**
| Param | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `phone` | `string` | Sí | Número de celular del cliente (formato colombiano) |

**Response 200 (cliente encontrado, visita reciente):**
```json
{
  "found": true,
  "hasRecentVisit": true,
  "customer": {
    "name": "Juan Pérez",
    "total_visits": 5,
    "total_points": 310
  },
  "points_awarded": 65,
  "tier_unlocked": {
    "id": "uuid-del-tier",
    "name": "Plata",
    "safe_reward": "Bebida gratis",
    "mystery_box_enabled": true,
    "mystery_prizes": [ { "title": "Postre", "probability": 0.3, "emoji": "🍰" } ],
    "is_black": false
  },
  "next_tier": {
    "name": "Oro",
    "points_remaining": 90,
    "threshold": 400
  },
  "pending_reward": null,
  "active_grants": [
    {
      "id": "uuid-del-grant",
      "prize_title": "1/2 sushi gratis",
      "grant_type": "campaign_prize",
      "source": "reactivation",
      "expires_at": "2026-07-18T23:59:59.000Z",
      "granted_at": "2026-07-11T10:00:00.000Z",
      "tier_id": null,
      "mystery_box_result_id": null
    }
  ],
  "tiers": [
    { "tier_name": "Bronce", "point_threshold": 150, "safe_reward_title": "Bebida gratis", "mystery_box_enabled": true, "is_black": false },
    ...
  ]
}
```

> **`tier_unlocked`**: Es `null` salvo que el cliente haya superado el umbral de un tier y aún no lo haya reclamado (sin fila en `mystery_box_results` para ese `tier_id`). Devuelve el tier de mayor umbral pendiente. El cliente lo consume solo cuando `hasRecentVisit` es `true`, mostrando el flujo de elección de premio (safe vs Mystery Box) en su propio dispositivo.
>
> **`active_grants[]`** (migración 00031, v2.3.0): premios ya otorgados (activos, no vencidos) que le pertenecen al cliente — de tier (`grant_type: 'tier_prize'`, no vencen, `expires_at: null`) o de campaña (`grant_type: 'campaign_prize'`, vencen). Alimenta el banner "Disponible: X premio — vence en N días" en la tarjeta del cliente y la alerta del mesero al escanear. Viaja en la misma llamada de polling que ya hace el cliente cada 5s, sin costo de red adicional. Ordenado por `granted_at` ascendente (el más antiguo primero).

**Response 200 (cliente encontrado, sin visita reciente):**
```json
{
  "found": true,
  "hasRecentVisit": false,
  "customer": { "name": "Juan Pérez", "total_visits": 4, "total_points": 245 },
  "points_awarded": 0,
  "next_tier": { "name": "Plata", "points_remaining": 105, "threshold": 350 },
  "tiers": [...]
}
```

**Response 200 (cliente no encontrado):**
```json
{ "found": false }
```

**Response 400:**
```json
{ "error": "Se requiere phone" }
```

**Response 400 (teléfono inválido):**
```json
{ "error": "Teléfono inválido" }
```

> **Nota:** Una "visita reciente" se define como una visita `source = 'staff_scan'` creada en los últimos 30 minutos. El endpoint busca en la tabla `visits` y, si encuentra una, consulta `point_transactions` filtrando por `reference_id` (id de la visita) y `source IN ('visit_staff','visit_qr','visit_delivery')` para obtener los puntos otorgados.  
> **Importante:** `point_transactions` usa las columnas `reference_id` y `source` (NO `visit_id`/`type`). Consultar las columnas incorrectas devuelve `points_awarded = 0` aunque el saldo sea correcto.

---

### Reseñas de Google: ¿se muestra el pop-up?

**`GET /api/check-in/review-prompt?phone=3001234567`** — Sin autenticación (ruta pública)

Lo llama la pantalla de éxito del check-in. **Quién ve el pop-up lo decide el servidor**: el navegador del
cliente es *stateless* y no tiene forma de saber si este teléfono ya dejó una reseña.

**Response 200 (elegible):**
```json
{ "show": true, "reward_title": "1/2 sushi gratis", "google_url": "https://g.page/r/.../review" }
```

**Response 200 (no elegible — ya reseñó, o el tenant no tiene link configurado):**
```json
{ "show": false, "reward_title": null, "google_url": "" }
```

`reward_title: null` con `show: true` significa que el dueño **no eligió recompensa**: el pop-up sale
igual, pero pide el favor en vez de ofrecer algo.

**Efecto secundario:** si `show: true`, registra el evento `shown` en `review_events`, **deduplicado a 12
horas** (recargar la pantalla no cuenta como una segunda impresión: inflaría el denominador del funnel).

> **Por qué es un endpoint propio y no parte del check-in:** en el flujo real
> (`checkin_mode = staff_verified`) el `POST /api/check-in` lo hace el celular **del mesero**, mientras que
> la pantalla del cliente la alimenta el polling de `/api/check-in/status`. Colgarlo de ese polling —que
> corre cada 5 segundos— dispararía una impresión por segundo.

**Nunca devuelve 5xx:** ante cualquier error (p. ej. la migración 00032 sin aplicar) responde
`{ "show": false }`. Un fallo del pop-up jamás debe romper el check-in del cliente.

---

### Reseñas de Google: acción del cliente

**`POST /api/check-in/review-action`** — Sin autenticación (rate-limited: 10/min por teléfono)

**Request:**
```json
{ "phone": "3001234567", "action": "clicked" }
```

`action` ∈ `'clicked' | 'postponed'`.

- **`clicked`** → sella `customers.google_review_clicked_at` (no se le vuelve a mostrar nunca),
  **otorga el premio** (`grantReward` con `source: 'review'`, `grant_type: 'campaign_prize'`) y registra
  el evento con su `grant_id`.
- **`postponed`** → sella `customers.google_review_postponed_at`. Se le vuelve a mostrar en su próximo
  check-in.

**Response 200 (`clicked` con premio):**
```json
{ "ok": true, "prize_title": "1/2 sushi gratis", "expires_at": "2026-08-12T18:30:00.000Z" }
```

**Response 200 (`clicked` sin premio configurado):**
```json
{ "ok": true, "prize_title": null, "expires_at": null }
```

> **El premio se otorga sin verificar que la reseña exista.** No es un agujero: el paso 1 que el cliente
> lee en pantalla es *"muéstrale la reseña al mesero"*, y **el mesero es el verificador**. Google no expone
> ninguna API para confirmarlo. El abuso ya está acotado por partida triple: la columna solo se sella una
> vez, el índice único parcial de la 00031 impide un segundo premio de reseña activo, y el rate limit.

---

### Dashboard: Funnel de reseñas

**`GET /api/dashboard/review-metrics?from=&to=`** — Admin Cookie

```json
{ "shown": 240, "clicked": 38, "postponed": 96, "redeemed": 29, "click_rate": 16, "redemption_rate": 76 }
```

Las dos tasas miden cosas distintas: `click_rate` es el **gancho** (¿convence el premio?),
`redemption_rate` es la **operación** (¿el mesero cierra el ciclo?). Un solo número agregado escondería
cuál de los dos está roto.

---

### Dashboard: Config del tenant (link de Google)

**`GET /api/dashboard/tenant-config`** — Admin Cookie → `{ "google_maps_url": "https://..." }`

**`PUT /api/dashboard/tenant-config`** — Admin Cookie

```json
{ "google_maps_url": "https://g.page/r/.../review" }
```

Escribe sobre `tenants.config` (jsonb) con **lectura → merge → escritura** y una **whitelist de claves
editables** (hoy solo `google_maps_url`). Un `UPDATE` directo de la columna borraría el branding entero del
tenant. Un valor vacío es válido: apaga el pop-up de reseñas.

**Response 400:** si el link no empieza por `http://` o `https://`.

---

### Staff: Premios pendientes

**`GET /api/staff/pending-rewards`** — Staff (Bearer JWT o `X-Device-Token`)

Alimenta la pantalla **`/mesero/rewards`**. Devuelve los premios (`reward_grants`) activos de clientes con check-in en las **últimas 6 horas** (ventana fija, no configurable — un turno cabe de sobra). Es el arreglo de la condición de carrera de redención: antes el mesero solo podía registrar la entrega en los 3 segundos posteriores al escaneo, cuando el cliente todavía no había elegido su Mystery Box en su celular.

**Headers:**
```
Authorization: Bearer {staff_jwt}
```
```
X-Device-Token: {device_fingerprint}
```

**Response 200:**
```json
{
  "ok": true,
  "count": 2,
  "grants": [
    {
      "id": "uuid-del-grant",
      "customer_id": "uuid-cliente",
      "prize_title": "1/2 sushi gratis",
      "grant_type": "campaign_prize",
      "source": "reactivation",
      "expires_at": "2026-07-18T23:59:59.000Z",
      "granted_at": "2026-07-11T10:00:00.000Z",
      "tier_id": null,
      "mystery_box_result_id": null,
      "customer_name": "Juan Pérez",
      "customer_phone": "3001234567"
    }
  ]
}
```

**Response 404:** `{ "error": "Restaurante no reconocido", "message": "..." }` — dominio sin tenant.
**Response 401:** `{ "error": "No autorizado", "message": "Mesero o dispositivo no válido." }`

---

### Reward Redeem (Registrar entrega física)

**`POST /api/reward-redeem`** — Staff (Bearer JWT o `X-Device-Token`)

Registra la entrega física de un premio. Desde la migración 00031 (v2.3.0), el camino principal es anclar la entrega a un `grant_id` (premio otorgado, de tier o de campaña); `mystery_box_result_id` se mantiene por compatibilidad. `tier_id` es **opcional** — un premio de campaña no tiene tier.

**Request:**
```json
{
  "customer_id": "uuid-cliente",
  "grant_id": "uuid-del-grant",
  "mystery_box_result_id": null,
  "tier_id": null,
  "prize_title": "1/2 sushi gratis",
  "source": "campaign_reward",
  "table_number": 12,
  "notes": null,
  "pos_reference": null
}
```

**Validaciones:**
- `customer_id` y `prize_title` son obligatorios.
- Se requiere `grant_id` **o** `mystery_box_result_id` (al menos uno) — es lo que ancla la entrega a algo que los índices únicos de la base de datos puedan proteger contra doble entrega.
- El cliente debe pertenecer al tenant resuelto por dominio (defensa anti-IDOR).

**Response 201:**
```json
{ "ok": true, "redemption": { "id": "uuid", "grant_id": "uuid-del-grant", "tier_id": null, "prize_title": "1/2 sushi gratis", "...": "..." } }
```

**Response 400:** `{ "error": "Datos inválidos", "message": "Se requiere customer_id y prize_title" }` o `{ "message": "Se requiere grant_id o mystery_box_result_id" }`
**Response 404:** `{ "error": "No encontrado", "message": "Cliente no encontrado" }`
**Response 409:** `{ "error": "No se pudo registrar", "message": "...", "code": "already_redeemed" }` — el premio ya fue entregado (por carrera entre dos meseros, o porque el grant ya estaba `redeemed`/`expired`). La garantía anti doble-entrega vive en el índice único parcial de la base de datos, no en la UI.
**Response 401:** `{ "error": "No autorizado", "message": "Mesero o dispositivo no válido." }`

---

### Webhook Delivery (Domicilios)

**`POST /api/webhook/delivery`** — Protegido por `x-webhook-secret` (llamado desde n8n)

Recibe datos pre-parseados por n8n y registra cliente + visita en la DB.

**Headers:**
- `x-webhook-secret` — Secret compartido con n8n (`WEBHOOK_DELIVERY_SECRET`)
- `Content-Type: application/json`

**Request (enviado por n8n):**
```json
{
  "nombre_cliente": "Juan Pérez",
  "celular": "3009876543",
  "direccion": "Calle 100 #15-20",
  "metodo_pago": "efectivo",
  "monto_total": 45000,
  "raw_message": "Pedido de Juan...",
  "tenant_slug": "sushi-service"
}
```

> **Multitenant (v2.4.0):** `tenant_slug` es **obligatorio** — identifica a qué cliente
> pertenece el pedido (`getTenantBySlug()`). `twilio-incoming/route.ts` lo inyecta
> automáticamente al reenviar el mensaje del mesero a n8n; el workflow n8n solo tiene que
> reenviarlo tal cual al armar este body (ver `docs/04-deployment.md` §5, W1).

**Response 200:**
```json
{
  "ok": true,
  "is_new": false,
  "action": "updated",
  "cliente_id": "uuid",
  "customer": { "name": "Juan Pérez", "phone": "3009876543", "total_visits": 5 },
  "reward": null
}
```

**Response 400:** `{ "ok": false, "error": "Falta celular del cliente" }`
**Response 403:** `{ "error": "No autorizado" }`
**Response 404:** `{ "error": "Tenant no encontrado" }` — falta `tenant_slug` o no coincide con ningún tenant activo

---

### Cron: Cumpleaños

**`POST /api/cron/birthday`** — Protegido por `CRON_SECRET`

**Headers:** `Authorization: Bearer {CRON_SECRET}`

**Query param `?tenant=slug` (opcional, v2.4.0):**
- **Con `?tenant=`** → procesa solo ese tenant, response = resultado plano (shape de abajo).
- **Sin `?tenant=`** → procesa **todos los tenants activos** (`getActiveTenants()`) en un solo
  disparo, uno no tumba a los demás si falla (`Promise.allSettled`). Este es el modo
  recomendado para el Schedule Trigger de n8n — un cliente nuevo entra solo, sin tocar n8n.

**Response 200 (con `?tenant=`):**
```json
{
  "tenant_slug": "sushi-service",
  "ok": true,
  "campaign_id": "uuid",
  "sent": 3,
  "failed": 0,
  "total_birthday_customers": 3
}
```

**Response 200 (sin `?tenant=`, todos los tenants):**
```json
{
  "ok": true,
  "tenants_processed": 2,
  "sent": 5,
  "failed": 0,
  "results": [
    { "tenant_slug": "sushi-service", "ok": true, "sent": 3, "failed": 0, "campaign_id": "uuid", "total_birthday_customers": 3 },
    { "tenant_slug": "don-alirio", "ok": true, "sent": 2, "failed": 0, "campaign_id": "uuid", "total_birthday_customers": 2 }
  ]
}
```

---

### Cron: Reactivación

**`POST /api/cron/reactivation`** — Protegido por `CRON_SECRET`

**Headers:** `Authorization: Bearer {CRON_SECRET}`

**Query param `?tenant=slug`:** mismo comportamiento opcional que el cron de cumpleaños (arriba) —
con `?tenant=` procesa uno solo, sin él procesa todos los tenants activos y agrega
`tenants_processed` + `results[]` a la response.

**Settings que consume (en orden de prioridad):**
1. `reactivation_with_reward_template_sid` + `reactivation_reward_id` → modo "vuelve y gana X" (`{{1}}=nombre, {{3}}=título premio fijo`)
2. `reactivation_no_reward_template_sid` → modo "te echamos de menos" (sólo `{{1}}=nombre`)
3. `reactivation_template_sid` (legacy) → fallback con `{{1}}, {{2}}, {{3}}=título próximo premio del cliente`

**Días configurables (v1.4.0):** lee `reactivation_soft_days` (default 21) y `reactivation_aggressive_days` (default 25) de `admin_settings` vía `getReactivationDaysConfig()`. Si la agresiva ≤ suave, se fuerza a `suave + 4`.

Si ninguno está configurado, retorna `{ ok: false, error: "..." }` sin enviar.

**Premio de campaña (R1, migración 00031, v2.3.0):** si hay un premio activo configurado en `aggressive_reward_id` (catálogo `campaign_rewards`; con fallback legacy a `reactivation_aggressive_reward_id`), cada envío exitoso a un cliente del grupo agresivo **otorga un `reward_grant`** con `expires_at = ahora + aggressive_reward_window_days` (default 7, ventana INDEPENDIENTE de los días de reactivación). El premio y la fecha límite viajan en la plantilla como `{{4}}` y `{{5}}` (`sendTemplateMessage` reintenta sin esas variables ante el error 21665 de Twilio, así que una plantilla de 4 variables sigue funcionando). Si el cliente ya tenía un premio de reactivación activo, la base de datos rechaza el duplicado (`duplicate_active`) y no cuenta como error.

**Response 200:**
```json
{
  "ok": true,
  "campaign_id": "uuid",
  "sent": 12,
  "failed": 1,
  "aggressive_sent": 3,
  "rewards_granted": 3,
  "total_inactive_customers": 13,
  "reactivation_soft_days": 21,
  "reactivation_aggressive_days": 25,
  "aggressive_reward_window_days": 7
}
```

> **`rewards_granted`**: cuántos `reward_grants` de campaña se otorgaron en esta corrida (subconjunto de `aggressive_sent` — solo se otorga tras un envío de WhatsApp exitoso, para no ensuciar la tasa de redención con premios que el cliente nunca supo que tenía).

---

### Cron: Recordatorio de Premio

**`POST /api/cron/reward-reminder`** — Protegido por `CRON_SECRET`

**Headers:** `Authorization: Bearer {CRON_SECRET}`

**Query param `?tenant=slug`:** mismo comportamiento opcional que los demás crons — con `?tenant=` procesa uno solo, sin él procesa todos los tenants activos (`getActiveTenants()`, `Promise.allSettled`) y agrega `tenants_processed` + `results[]` a la response.

> **Quién lo dispara:** al igual que `calendar-dispatch`, NO está en `vercel.json`. Lo dispara **n8n**.

Hace dos cosas, en este orden, por cada tenant:

1. **Barrido de vencidos** — marca `expired` los `reward_grants` activos cuya `expires_at` ya pasó. Corre **siempre**, aunque el recordatorio esté apagado, para que las métricas de "vencidos sin reclamar" del dashboard sean honestas sin necesitar un cron aparte.
2. **Recordatorio** — si `reward_reminder_enabled='true'` y hay `reward_reminder_template_sid` configurado, envía **un solo** WhatsApp a los premios que vencen dentro de `reward_reminder_days_before` días (default 2) cuyo dueño no ha vuelto desde que se le otorgó el premio. Sella `reminder_sent_at` para no reenviar en la próxima corrida.

**Caps (decisión D5):**

- **Exento** del cap de frecuencia de 7 días (`FREQUENCY_CAP_DAYS`) — sin esta excepción el recordatorio nunca saldría con ventanas de premio de 5-7 días, que son justo las que generan urgencia.
- **Sujeto** al cap mensual de 3 mensajes de marketing (`source='reward_reminder'` está en `MONTHLY_CAP_SOURCES`).

**Response 200 (con `?tenant=`):**
```json
{
  "tenant_slug": "sushi-service",
  "ok": true,
  "expired": 2,
  "candidates": 5,
  "sent": 4,
  "failed": 0,
  "skipped_monthly_cap": 1,
  "reminder_enabled": true
}
```

**Response 200 (sin `?tenant=`, todos los tenants):**
```json
{
  "ok": true,
  "tenants_processed": 2,
  "expired": 3,
  "sent": 6,
  "failed": 0,
  "skipped_monthly_cap": 1,
  "results": [ { "tenant_slug": "sushi-service", "ok": true, "expired": 2, "candidates": 5, "sent": 4, "failed": 0, "skipped_monthly_cap": 1, "reminder_enabled": true } ]
}
```

**Response 401:** `{ "error": "No autorizado" }` (CRON_SECRET ausente o no coincide)

---

### Cron: Calendar Dispatch

**`POST /api/cron/calendar-dispatch`** — Protegido por `CRON_SECRET`

**Headers:** `Authorization: Bearer {CRON_SECRET}`

Busca eventos con `send_mode='auto'`, `status='scheduled'` y `scheduled_send_at <= now()` y ejecuta su auto-envío (`executeAutoEvent`).

> **Quién lo dispara:** NO está en `vercel.json`. Lo dispara **n8n self-hosted** (Schedule Trigger cada 15 min → HTTP POST con el header `Authorization: Bearer CRON_SECRET`). Decisión tomada para no exigir plan Vercel Pro (`*/15` + ser el 3er cron superaría el límite de Hobby). `birthday` y `reactivation` siguen como crons de Vercel (2 diarios, caben en Hobby).

**Response 200:**
```json
{
  "ok": true,
  "processed": 1,
  "total_sent": 42,
  "total_failed": 1,
  "results": [
    {
      "event_id": "uuid",
      "title": "Festival del Sushi",
      "ok": true,
      "sent": 42,
      "failed": 1,
      "excluded_monthly_cap": 7,
      "campaign_id": "uuid"
    }
  ]
}
```

**Response 401:** `{ "error": "No autorizado" }` (CRON_SECRET ausente o no coincide)

---

### Dashboard: Twilio Metrics

**`GET /api/dashboard/twilio-metrics?days={7|30|90}`** — Admin Cookie (Supabase session)

Consulta la Twilio Messages API en tiempo real (hasta 5.000 mensajes) y agrega métricas de entrega. Detecta opt-outs por keyword inbound (SALIR/STOP/...) y por error 21610/63016 en outbound.

**Query Params:** `days` — rango en días (1-90, default 30).

**Response 200:**
```json
{
  "days": 30,
  "since": "2026-05-11",
  "totals": {
    "total": 240,
    "delivered": 228,
    "read": 150,
    "failed": 8,
    "undelivered": 2,
    "pending": 2,
    "deliveryRate": 95,
    "readRate": 66
  },
  "optOuts": [
    { "phone": "573001234567", "name": "Juan Pérez", "date": "...", "reason": "keyword", "detail": "Respondió \"SALIR\"" }
  ],
  "optOutCount": 1,
  "timeline": [{ "date": "2026-05-11", "enviados": 12, "entregados": 11, "leidos": 7, "fallidos": 1 }],
  "truncated": false
}
```

**Errores:** `401` sin sesión, `503` Twilio no configurado, `500` error de Twilio API.

---

### Campaigns: Estimate

**`GET /api/dashboard/campaigns/estimate`** — Admin JWT

Cuenta clientes que coinciden con los filtros.

**Query Params (todos opcionales):**
- `city` — Filtro por ciudad (ilike)
- `minVisits` / `maxVisits` — Rango de visitas
- `minAge` / `maxAge` — Rango de edad (calculado desde birthday)
- `source` — `qr_only` | `delivery_only`

**Response 200:**
```json
{ "count": 45 }
```

---

### Campaigns: Manual

**`POST /api/dashboard/campaigns/manual`** — Admin JWT

Crea y ejecuta campaña manual con filtros.

**Request:**
```json
{
  "name": "Invitar al Restaurante",
  "filters": {
    "city": "Bogotá",
    "minVisits": "1",
    "maxVisits": "",
    "minAge": "",
    "maxAge": "",
    "source": "delivery_only"
  },
  "templateSid": "HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "messageTemplate": "preview text",
  "rewardId": "auto"
}
```

**Campos:**
- `templateSid` (requerido): SID de plantilla aprobada en Twilio.
- `rewardId` (opcional, default `'auto'`):
  - `'auto'` → `{{3}}` = título de la próxima recompensa de cada cliente.
  - uuid → `{{3}}` = título de un reward fijo (igual para todos).
  - `'none'` → no se envía `{{3}}` (úsalo si la plantilla sólo tiene `{{1}}` y/o `{{2}}`).

**Response 200:**
```json
{ "success": true, "campaignId": "uuid", "totalSent": 45, "totalFailed": 0, "totalSkippedFrequencyCap": 3 }
```

---

### Twilio Balance

**`GET /api/dashboard/twilio-balance`** — Admin JWT

**Response 200:**
```json
{
  "balance": 25.50,
  "currency": "USD",
  "costPerMessage": 0.0058,
  "costPerMessageCOP": 24,
  "maxMessages": 4396,
  "balanceCOP": 107100
}
```

---

### Health Twilio

**`GET /api/health/twilio`** — Sin auth (solo para diagnóstico)

**Response 200:**
```json
{
  "connected": true,
  "balance": 20.00,
  "currency": "USD",
  "accountSid": "ACa5e3..."
}
```

**Response 200 (sin configurar):**
```json
{
  "connected": false,
  "error": "TWILIO_ACCOUNT_SID o TWILIO_AUTH_TOKEN no están configurados",
  "hasSid": false,
  "hasToken": false
}
```

---

### Templates (Twilio Content API)

**`GET /api/dashboard/templates`** — Admin JWT

**Response 200:**
```json
{
  "templates": [
    {
      "sid": "HXxxxxxxxxxx",
      "friendly_name": "bienvenida_es",
      "language": "es",
      "date_created": "2026-04-10T...",
      "date_updated": "2026-04-10T...",
      "body": "¡Hola {{1}}! Bienvenido a Sushi Service...",
      "approval_status": "approved",
      "category": "UTILITY"
    }
  ]
}
```

**`POST /api/dashboard/templates`** — Admin JWT

**Body:**
```json
{
  "name": "reactivacion_es",
  "language": "es",
  "category": "MARKETING",
  "body": "¡Hola {{1}}! Te extrañamos...",
  "variables": { "1": "nombre_cliente" }
}
```

**Response 200:**
```json
{
  "ok": true,
  "template": { "sid": "HXxxxxxxxxxx", "...": "..." },
  "approval": { "sid": "HXxxxxxxxxxx", "status": "received" }
}
```

---

### Settings (Admin)

**`GET /api/dashboard/settings`** — Admin JWT

Retorna todas las configuraciones como objeto clave-valor.

**Response 200:**
```json
{
  "avg_ticket": "35000"
}
```

---

**`PUT /api/dashboard/settings`** — Admin JWT

Actualiza una configuración por clave.

**Request:**
```json
{
  "key": "avg_ticket",
  "value": "42000"
}
```

**Response 200:**
```json
{
  "message": "Configuración actualizada",
  "key": "avg_ticket",
  "value": "42000"
}
```

**Response 400:** `{ "error": "key y value son requeridos" }`

---

### Dashboard: Catálogo de premios de campaña

> CRUD del catálogo editable (`campaign_rewards`, migración 00031, v2.3.0). Dashboard > Premios de campaña. Los premios de este catálogo son los que las campañas otorgan como `reward_grants` (hoy: reactivación agresiva).

**`GET /api/dashboard/campaign-rewards`** — Admin Cookie

**Query params:** `?active=true` (opcional) — solo devuelve los premios con `is_active=true`.

**Response 200:**
```json
[
  { "id": "uuid", "tenant_id": "uuid", "title": "1/2 sushi gratis", "description": null, "is_active": true, "created_at": "..." }
]
```

**`POST /api/dashboard/campaign-rewards`** — Admin Cookie

**Request:** `{ "title": "1/2 sushi gratis", "description": "Aplica solo en salón" }`

**Response 201:** `{ "id": "uuid", "tenant_id": "uuid", "title": "1/2 sushi gratis", "description": "Aplica solo en salón", "is_active": true, "created_at": "..." }`
**Response 400:** `{ "error": "El título es requerido" }`

**`PATCH /api/dashboard/campaign-rewards`** — Admin Cookie

**Request:** `{ "id": "uuid", "title": "1/2 sushi gratis (VIP)", "description": null, "is_active": true }` — `id` obligatorio, el resto es un subconjunto opcional (título, descripción, `is_active`).

**Response 200:** `{ "id": "uuid", "...": "..." }`
**Response 400:** `{ "error": "id es requerido" }` o `{ "error": "Nada que actualizar" }`

**`DELETE /api/dashboard/campaign-rewards?id=uuid`** — Admin Cookie

**Baja lógica, no borrado:** marca `is_active=false`, no elimina la fila. Los `reward_grants` ya otorgados guardan `prize_title` como snapshot, así que retirar un premio del catálogo no rompe lo que ya está en curso — los clientes que ya lo tienen lo siguen viendo y el mesero lo sigue pudiendo entregar.

**Response 200:** `{ "ok": true }`
**Response 400:** `{ "error": "id es requerido" }`

---

## Calendar — Eventos del calendario operativo

> Capa de datos + auto-envío del calendario. Los eventos se crean y persisten con o sin media (imagen/video).
> **El auto-envío está activo:** los eventos con `send_mode='auto'` y `status='scheduled'` se disparan vía `POST /api/cron/calendar-dispatch` (programado en n8n self-hosted) o manualmente con `POST .../events/:id/dispatch`. El envío real con media sigue dependiendo de que Meta apruebe las plantillas `twilio/media`.

### Listar eventos del rango

**`GET /api/dashboard/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD`** — Admin JWT

Devuelve los eventos cuyo `event_date` cae en el rango (inclusive en ambos extremos), ordenados ascendentemente.

**Response 200:**
```json
{
  "events": [
    {
      "id": "uuid",
      "title": "Festival del Sushi",
      "description": "Promo 2x1 todo el día",
      "event_date": "2026-05-26",
      "event_time": "19:00:00",
      "event_type": "festival",
      "send_mode": "remind",
      "scheduled_send_at": null,
      "filters": { "city": "Envigado" },
      "media_url": "https://...supabase.co/storage/v1/object/public/event-media/...",
      "media_type": "image",
      "content_sid": null,
      "campaign_id": null,
      "status": "planned",
      "blackout_days": 5,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

**Response 400:** `{ "error": "Parámetros `from` y `to` (YYYY-MM-DD) requeridos" }`

---

### Crear evento

**`POST /api/dashboard/calendar/events`** — Admin JWT

**Request body:**
```json
{
  "title": "Festival del Sushi",
  "description": "Promo 2x1 todo el día — ¡te esperamos!",
  "event_date": "2026-05-26",
  "event_time": "19:00:00",
  "event_type": "festival",
  "send_mode": "remind",
  "scheduled_send_at": null,
  "filters": { "city": "Envigado", "minVisits": 2 },
  "media_url": "https://...supabase.co/storage/v1/object/public/event-media/...",
  "media_type": "image",
  "blackout_days": 5
}
```

**Campos obligatorios:** `title`, `event_date`, `event_type`.

**Reglas:**
- `event_type` ∈ `'promo' | 'festival' | 'activacion' | 'aniversario' | 'otro'`
- `send_mode` ∈ `'auto' | 'remind'` (default `'remind'`)
- Si `send_mode='auto'`, `scheduled_send_at` es obligatorio y debe ser ≤ `event_date`
- `media_type` ∈ `'image' | 'video' | null`. Obligatorio si `media_url` está presente.
- `blackout_days` ∈ `[0, 30]`, default 5
- Si `send_mode='auto'` + `scheduled_send_at`, el evento se crea con `status='scheduled'`; si no, con `status='planned'`

**Response 201:** `{ "event": { ... } }`

---

### Detalle de un evento

**`GET /api/dashboard/calendar/events/:id`** — Admin JWT

**Response 200:** `{ "event": { ... } }`
**Response 404:** `{ "error": "Evento no encontrado" }`

---

### Actualizar evento

**`PATCH /api/dashboard/calendar/events/:id`** — Admin JWT

**Request body:** cualquier subconjunto de los campos de creación + `status` (`'planned' | 'scheduled' | 'sent' | 'cancelled' | 'failed'`).

Si se actualiza `scheduled_send_at` (o `send_mode='auto'` + `scheduled_send_at`), el `status` se alinea a `'scheduled'` automáticamente.

**Response 200:** `{ "event": { ... } }`

---

### Disparar / reintentar auto-envío (manual)

**`POST /api/dashboard/calendar/events/:id/dispatch`** — Admin JWT

Ejecuta `executeAutoEvent` bajo demanda. Red de seguridad si el cron de n8n falla o aún no corre.

**Reglas:**
- Solo eventos con `send_mode='auto'`.
- Acepta `status='scheduled'` (envío anticipado) o `status='failed'` (reintento — se rearma a `scheduled` antes de ejecutar para pasar el guard de idempotencia).
- `sent`, `cancelled` y `planned` → 400.
- Requiere `event_template_image_sid` / `event_template_video_sid` en `admin_settings` según `media_type`; si falta, devuelve el error de `executeAutoEvent`.

**Response 200:**
```json
{ "ok": true, "sent": 42, "failed": 1, "excluded_monthly_cap": 7, "campaign_id": "uuid" }
```

**Response 400:** `{ "error": "El evento no se puede enviar en estado 'sent'." }`

---

### Cancelar evento (soft-delete)

**`DELETE /api/dashboard/calendar/events/:id`** — Admin JWT

Marca el evento con `status='cancelled'`. No borra físicamente para mantener trazabilidad.

**Response 200:** `{ "event": { ..., "status": "cancelled" } }`

---

### Subir media (imagen/video) al bucket `event-media`

**`POST /api/dashboard/calendar/media-upload`** — Admin JWT

**Content-Type:** `multipart/form-data`

**Form fields:**
- `file` (obligatorio) — el archivo
- `event_id` (opcional) — si el evento ya existe, el path queda como `{event_id}/...`. Si no, va a `_temp/{uuid}/...`

**Restricciones:**
- Imagen: `image/jpeg` o `image/png`, máximo 5 MB
- Video: `video/mp4`, máximo 16 MB
- Cualquier otro MIME → 415

**Response 201:**
```json
{
  "url": "https://...supabase.co/storage/v1/object/public/event-media/_temp/.../1685..._flyer.jpg",
  "media_type": "image",
  "path": "_temp/abc-uuid/1685..._flyer.jpg",
  "bytes": 234567
}
```

El admin luego debe usar `url` y `media_type` al llamar a `POST/PATCH /api/dashboard/calendar/events`.

**Response 413:** archivo excede el límite por tipo.
**Response 415:** MIME no soportado.

---

### Borrar asset del bucket

**`DELETE /api/dashboard/calendar/media-upload?path=...`** — Admin JWT

Útil para limpiar uploads descartados antes de asociarlos a un evento.

**Response 200:** `{ "ok": true }`

---

### Staff: Login

**`POST /api/staff/login`** — Sin autenticación

**Request:**
```json
{ "phone": "3001234567", "pin": "1234" }
```

**Response 200:**
```json
{
  "staff": { "id": "uuid", "name": "Carlos", "phone": "3001234567", "role": "waiter", "is_active": true },
  "token": "eyJhbG..."
}
```

**Response 401:** `{ "error": "Credenciales inválidas" }`

---

### Staff: Validar sesión

**`GET /api/staff/me`** — Staff JWT o Device Token

**Headers:**
```
Authorization: Bearer {staff_jwt}
```
```
X-Device-Token: {device_fingerprint}
```

**Response 200:**
```json
{
  "id": "uuid",
  "name": "Carlos",
  "phone": "3001234567",
  "role": "waiter",
  "is_active": true,
  "type": "staff"
}
```

---

### Staff: Stats

**`GET /api/staff/stats`** — Staff JWT o Device Token

**Response 200:**
```json
{ "visits_today": 14 }
```

---

### Staff: Activar dispositivo de confianza

**`POST /api/staff/device/register`** — Supervisor PIN requerido

**Request:**
```json
{
  "phone": "3001234567",
  "pin": "1234",
  "device_fingerprint": "df_a1b2c3d4",
  "device_name": "Celular del Local"
}
```

**Response 200:** `{ "success": true }`
**Response 403:** `{ "error": "No autorizado", "message": "Solo supervisores o admins pueden registrar dispositivos." }`

---

### Staff: Verificar device token

**`POST /api/staff/device/verify`** — Sin autenticación

**Request:**
```json
{ "device_fingerprint": "df_a1b2c3d4" }
```

**Response 200:** `{ "valid": true }`

---

### Dashboard: Staff CRUD

**`GET /api/dashboard/staff`** — Admin JWT

**Response 200:**
```json
{
  "staff": [
    { "id": "uuid", "name": "Carlos", "phone": "3001234567", "role": "waiter", "is_active": true, "last_login_at": "2026-05-30T...", "created_at": "..." }
  ],
  "devices": [
    { "id": "uuid", "staff_user_id": "uuid", "device_name": "Celular del Local", "is_trusted": true, "trusted_at": "2026-05-30T...", "expires_at": null, "last_used_at": "..." }
  ]
}
```

**`POST /api/dashboard/staff`** — Admin JWT

**Request:**
```json
{ "name": "Ana López", "phone": "3009876543", "pin": "5678", "role": "waiter" }
```

**Response 201:** `{ "id": "uuid", "name": "Ana López", "phone": "3009876543", "role": "waiter", "is_active": true, "created_at": "..." }`

**`PATCH /api/dashboard/staff`** — Admin JWT

**Request:**
```json
{ "id": "uuid", "is_active": false, "pin": "9999", "name": "Ana López 2", "role": "supervisor" }
```

**`DELETE /api/dashboard/staff?id=uuid`** — Admin JWT

**Response 200:** `{ "success": true }`

---

## Códigos de Error Globales

| Código | Descripción |
|--------|-------------|
| 400 | Datos inválidos |
| 401 | Token inválido/expirado |
| 403 | Sin permisos / número no autorizado |
| 404 | No encontrado |
| 429 | Rate limit excedido |
| 500 | Error del servidor |
