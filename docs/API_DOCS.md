# Documentación de API

**Base URL:** `/api`
**Autenticación:**
- **Dashboard endpoints** — Cookie-based (Supabase SSR, sesión admin via `supabase.auth.getUser()`)
- **Staff endpoints públicos** (`/api/staff/*`) — Bearer Token (Staff JWT) o `X-Device-Token`
- **Webhooks / Cron** — `x-webhook-secret` o `CRON_SECRET`
**Última actualización:** 2026-09-03
> **Nota (geolocalización):** el backend **no valida GPS** y ya no hay nada que descomentar: el
> bloque de geocerca que dormía comentado en `src/app/api/check-in/route.ts` **se borró** en
> multi-sede F3 (spec §3.5). Como control de acceso lo reemplazó, con ventaja, la exigencia de
> `source === 'staff_scan'`; y su query no filtraba `tenant_id` y usaba `.single()`, así que
> descomentarlo con 2 sedes activas rompía el check-in con `PGRST116` para **todos** los
> clientes de **todos** los tenants. Los campos `lat`/`lon` del body se siguen aceptando y se
> ignoran.
> **Nota (multi-sede):** desde F3 el `Host` de la petición resuelve **marca + sede**
> (`resolveHostContext()`). Ver `docs/features/multi-sede.md`.
> **Nota (multi-sede F7, D10):** varias rutas de `/api/dashboard/*` aceptan además
> `?location_id=` (ausente / `all` / uuid / `unknown`) — el alcance de sede de la
> petición, resuelto **siempre en el servidor** con `requireLocationScope()`, nunca
> confiando en lo que mande el cliente. Ausente equivale a `all`, que significa
> *"todas las sedes que este usuario puede ver"* — no "toda la marca sin filtrar": un
> `role='location'` con el parámetro ausente sigue viendo solo sus sedes. `unknown`
> selecciona el cubo *"Sin sede"* (`location_id IS NULL`, el histórico) y solo lo
> puede pedir un usuario `role='brand'`. Las rutas marcadas **(sede)** abajo lo
> aceptan; el resto son configuración de marca o dependen de F5/F6 y lo ignoran.
> `GET /api/dashboard/location-scope` es lo que alimenta el selector del panel.
> Ver `docs/features/multi-sede.md` §3.quater.

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
| POST | /api/webhook/zernio | Webhook Zernio: mensajes entrantes (tenants `messaging_provider='zernio'`) + status de entrega (`message_logs`) + **aprobación de plantillas** (`whatsapp.template.status_updated` → cambio de puntero, ver `docs/features/whatsapp-templates.md`) | X-Zernio-Signature (HMAC-SHA256, obligatoria) |
| GET/POST | /api/cron/birthday | Enviar felicitaciones de cumpleaños (`0 13 * * *`) | CRON_SECRET |
| GET/POST | /api/cron/reactivation | Enviar reactivaciones (días configurables, default 21/25) + otorga premio de campaña con `expires_at` (`0 15 * * *`) | CRON_SECRET |
| GET/POST | /api/cron/calendar-dispatch | Auto-enviar eventos del calendario vencidos (`*/15 * * * *`) | CRON_SECRET |
| GET/POST | /api/cron/reward-reminder | Barrido de vencidos + recordatorio de premio por vencer (`0 16 * * *`) | CRON_SECRET |
| GET/POST | /api/cron/queue-drain | Drena la cola de goteo respetando presupuesto y prioridad (`*/15 * * * *`) | CRON_SECRET |

> **Quién dispara los 5 crons (2026-09-02).** Desde este commit están **declarados en
> `vercel.json`** con las cadencias de la tabla — calco 1:1 de las que ya tenían los Schedule
> Trigger de n8n. **Declarado no es disparando:** el commit es local y sin push, así que hoy
> el disparador vivo sigue siendo **n8n**. Vercel empieza a dispararlos cuando se despliegue a
> producción con plan Pro activo (Hobby solo admite crons diarios y una expresión `*/15` hace
> fallar el build), y en ese mismo movimiento se apagan los 5 Schedule Trigger de n8n —
> los dos a la vez = doble disparo. Detalle en `docs/04-deployment.md` §2 y §5.
>
> Vercel Cron invoca **GET** y manda solo `Authorization: Bearer $CRON_SECRET`, que es
> exactamente lo que valida `validateCronSecret()`: por eso la migración no cambió una sola
> línea de código de negocio.
| GET | /api/dashboard/metrics | Métricas generales | Admin Cookie |
| GET | /api/dashboard/send-queue | Cola de goteo del tenant, filtrable por `campaign_id`/`status`, paginada | Admin Cookie |
| DELETE | /api/dashboard/send-queue/:id | Cancela un item de la cola (`status='cancelled'`, no lo borra) **(sede — `send_queue.location_id` está viva desde F4)** | Admin Cookie |
| GET | /api/dashboard/customers | Lista de clientes | Admin Cookie |
| POST | /api/dashboard/campaigns | Crear campaña manual | Admin Cookie |
| POST | /api/dashboard/campaigns/:id/send | Ejecutar campaña | Admin Cookie |
| GET | /api/dashboard/campaigns/estimate | Estimar audiencia con filtros | Admin Cookie |
| POST | /api/dashboard/campaigns/manual | Crear y ejecutar campaña manual (**409 si saldo insuficiente**) | Admin Cookie |
| POST | /api/dashboard/campaigns/run-auto | Ejecutar cron birthday/reactivation del tenant actual (puente con CRON_SECRET) | Admin Cookie |
| GET | /api/dashboard/twilio-balance | Saldo Twilio matriz + costo/msg (**saldo solo super-admin**; tenants → `restricted`) | Admin Cookie |
| GET | /api/dashboard/wallet | Saldo COP del tenant actual: balance, mensajes disponibles, consumo del mes, últimos movimientos | Admin Cookie |
| GET | /api/dashboard/line-budget | Cupo de envío de la línea hoy: límite de Meta, consumo de las últimas 24h, reserva transaccional, cupo de campaña disponible, calidad y estado de la línea | Admin Cookie |
| POST | /api/admin/wallet/topup | Registrar recarga manual de un tenant (asignar saldo) | **Super-admin** |
| GET | /api/admin/wallets | Estado de la billetera de todos los tenants (saldo, consumo, última recarga) | **Super-admin** |
| GET | /api/dashboard/redemptions | Listar redenciones con filtros **(sede — no-op hoy, deuda #13)** | Admin Cookie |
| GET | /api/dashboard/redemptions/summary | Resumen de redenciones (premio/hora/mesero) **(sede — no-op hoy, deuda #13)** | Admin Cookie |
| GET | /api/dashboard/campaign-rewards | Listar catálogo de premios de campaña (`?active=true` opcional) | Admin Cookie |
| POST | /api/dashboard/campaign-rewards | Crear premio de campaña | Admin Cookie |
| PATCH | /api/dashboard/campaign-rewards | Actualizar premio (título, descripción, `is_active`) | Admin Cookie |
| DELETE | /api/dashboard/campaign-rewards?id=X | Baja lógica del premio (`is_active=false`, no borra) | Admin Cookie |
| GET | /api/dashboard/review-metrics | Funnel de reseñas: mostrado → click → premio redimido **(sede — `shown` sí filtra, grants no-op por deuda #13)** | Admin Cookie |
| GET | /api/dashboard/tenant-config | Claves editables de `tenants.config` (hoy: `google_maps_url`) | Admin Cookie |
| PUT | /api/dashboard/tenant-config | Escribe `tenants.config` con **whitelist** de claves (merge, no reemplazo) | Admin Cookie |
| POST | /api/dashboard/imported-contacts/validate | Validar CSV de contactos (sin insertar) | Admin Cookie + flag |
| POST | /api/dashboard/imported-contacts/confirm | Confirmar e importar/enviar Golden Bullet | Admin Cookie + flag |
| GET | /api/dashboard/imported-contacts | Listar lotes o contactos de un lote | Admin Cookie |
| GET | /api/dashboard/imported-contacts/stats | Estadísticas por lote | Admin Cookie |
| GET | /api/dashboard/imported-contacts/roi | ROI por lote | Admin Cookie |
| GET | /api/dashboard/twilio-metrics | Métricas de entrega/lectura/opt-outs WhatsApp | Admin Cookie |
| GET | /api/dashboard/analytics | Analytics completos del dashboard — retorno partido en `{ brand, location }` **(sede)** | Admin Cookie |
| GET | /api/dashboard/metrics | Métricas resumidas — retorno partido en `{ brand, location }` **(sede)**. ⚠️ Ningún componente del panel la consume hoy | Admin Cookie |
| GET | /api/dashboard/location-scope | Rol, selección y sedes visibles del usuario — alimenta el selector del panel (F7) | Admin Cookie |
| GET | /api/dashboard/authorized-numbers | Listar números autorizados de domicilio **(sede — no-op hoy, D9/deuda pendiente)** | Admin Cookie |
| POST | /api/dashboard/authorized-numbers | Autorizar un número de domicilio | Admin Cookie |
| PATCH | /api/dashboard/authorized-numbers/:id | Activar/desactivar un número autorizado **(sede)** | Admin Cookie |
| DELETE | /api/dashboard/authorized-numbers/:id | Eliminar un número autorizado **(sede)** | Admin Cookie |
| GET | /api/dashboard/campaigns | Listar campañas del tenant (últimas 50) **(sede — no-op hoy, deuda #12)** | Admin Cookie |
| GET | /api/dashboard/campaigns/efficiency | Eficiencia y revenue atribuido por campaña **(sede en el lado `campaigns`, no-op hoy, deuda #12)** | Admin Cookie |
| GET | /api/dashboard/templates | Listar plantillas Twilio Content API | Admin Cookie |
| POST | /api/dashboard/templates | Crear plantilla + submit aprobación WhatsApp | Admin Cookie |
| GET | /api/dashboard/templates/catalog | Estado del catálogo estándar (13 plantillas) — **solo Zernio** | Admin Cookie |
| PUT | /api/dashboard/templates/catalog/:key | Editar una plantilla del catálogo | Admin Cookie |
| PUT | /api/dashboard/templates/style | Cambiar estilo (± re-aplicar a las 13) | Admin Cookie |
| GET | /api/dashboard/templates/standard | Qué le falta del set estándar — **solo Twilio** | Admin Cookie |
| POST | /api/dashboard/templates/standard | Crear UNA plantilla estándar que falte (aditivo) | Admin Cookie |
| GET | /api/dashboard/opt-outs | Clientes que pidieron salir — agnóstico de proveedor | Admin Cookie |
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
| POST | /api/dashboard/calendar/events/:id/dispatch | Enviar/reintentar el evento bajo demanda (cualquier evento vivo) | Admin Cookie |
| DELETE | /api/dashboard/calendar/events/:id | Cancelar evento (soft-delete) | Admin Cookie |
| POST | /api/dashboard/calendar/media-upload | Subir imagen/video a `event-media` | Admin Cookie |
| DELETE | /api/dashboard/calendar/media-upload?path=X | Borrar asset del bucket | Admin Cookie |
| GET | /api/dashboard/location | Ubicación de la **sede principal** (F4: ya no revienta con 2 sedes) | Admin Cookie |
| PUT | /api/dashboard/location | Actualizar la **sede principal** (F4: ya no inserta una tercera fila) | Admin Cookie |
| GET | /api/dashboard/staff | Listar meseros y dispositivos | Admin Cookie |
| POST | /api/dashboard/staff | Crear mesero (admin) — acepta `location_id` (D11) | Admin Cookie |
| PATCH | /api/dashboard/staff | Actualizar mesero (toggle, reset PIN, **sede**) | Admin Cookie |
| DELETE | /api/dashboard/staff | Eliminar mesero | Admin Cookie |
| POST | /api/staff/login | Login mesero (phone + PIN) — **403 si es el enlace de otra sede** (D11) | NO |
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

**Response 409 (`Ya registrado`):**
```json
{ "error": "Ya registrado", "message": "Este número ya está registrado" }
```

**Response 409 (`Sede requerida`) — multi-sede F3, spec §3.2:**
> ⚠️ **Hay DOS 409 distintos en `register`.** Se distinguen por el campo `error`, y solo el de
> sede trae `locations[]`.

Se devuelve cuando el `Host` de la petición es el **dominio raíz de la marca** y la marca tiene
**2 o más sedes activas**: no hay forma honesta de saber en cuál está la persona, y adivinar
metería su registro —y todas sus visitas futuras— en el reporte de la sede equivocada.

```json
{
  "error": "Sede requerida",
  "message": "Este negocio tiene varias sedes. Abre el enlace de la sede donde estás para registrarte.",
  "locations": [
    { "id": "uuid", "name": "Sede principal", "slug": "sede-principal", "domain": "marca.com" },
    { "id": "uuid", "name": "Laureles", "slug": "laureles", "domain": "laureles.marca.com" }
  ]
}
```

**Cómo se resuelve:** el cliente abre el `domain` de su sede y repite el registro. Ese host
resuelve por la vía `host` y no vuelve a preguntar. **El endpoint no acepta hoy un
`location_id` en el body**: el spec define el 409 y la lista, pero no qué
`visits.location_source` le correspondería a una sede elegida a mano por el cliente (las 7 vías
del CHECK no incluyen ese caso), así que no se inventa. Ver la deuda #9 de
`docs/features/multi-sede.md`.

> **Interruptor de compatibilidad (§8.3):** con **0 o 1** sedes activas este 409 **nunca** se
> dispara. Los 4 tenants vivos tienen exactamente una sede, así que para ellos el registro se
> comporta hoy igual que antes de F3.

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

> **El `403 "Ubicación requerida"` ya no existe.** Salía del bloque de geocerca comentado, que
> se borró en multi-sede F3 (spec §3.5). `lat`/`lon` se aceptan y se ignoran.

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

### Dashboard: Alcance de sede del panel (F7, D10)

**`GET /api/dashboard/location-scope`** — Admin Cookie. Lo que `LocationSelector` necesita para
dibujarse; también acepta `?location_id=` (mismo contrato que el resto), útil para que "recargar
con la sede X ya puesta" muestre el selector consistente.

```json
{
  "role": "brand",
  "selection": "all",
  "selectedLocationId": null,
  "canSeeAll": true,
  "canSeeUnassigned": true,
  "locations": [
    { "id": "uuid", "name": "Envigado", "slug": "envigado", "is_primary": true }
  ]
}
```

`canSeeAll` solo es `true` para `role='brand'` — es lo que decide si el selector dibuja la opción
*"Todas las sedes"*. `locations` ya viene recortada al alcance del usuario: un `role='location'`
nunca ve, ni aquí, las sedes que no le asignaron.

**403** — el mismo caso que cualquier otra ruta con `requireLocationScope()`: sin fila en
`dashboard_user_locations` y ≥2 sedes activas, o un `?location_id=` fuera de lo permitido.

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

**`POST /api/webhook/delivery`** — Protegido por `x-webhook-secret`

Recibe un pedido **ya parseado** y registra cliente + visita + puntos en la DB.

> 🔄 **2026-09-03 — Fase 2 de §25: este endpoint ya NO es el camino principal.**
> `POST /api/webhook/twilio-incoming` y `POST /api/webhook/zernio` ahora parsean el mensaje del
> operador con OpenAI y llaman **directamente** a `registerDeliveryOrder()`
> (`src/services/delivery.service.ts`), sin dar la vuelta por HTTP ni por n8n.
>
> **El contrato de abajo no cambió ni un campo**, a propósito: `n8n/domicilios_whatsapp_v4.json`
> sigue desplegado en el VPS y lo llamaría si alguien disparara su webhook. En la práctica deja
> de recibir tráfico solo, porque ese webhook lo disparaba nuestra línea de reenvío.
> Ver `docs/features/delivery-webhook.md`.

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
  "tenant_slug": "sushi-service",
  "remitente": "3001112233"
}
```

> **Sede del pedido (multi-sede F3, D9 / spec §3.4):** `remitente` es el **celular del
> operador** que reenvió el cuadro del pedido. Se contrasta contra `authorized_numbers`
> (`phone` + `tenant_id` + `is_active`) y de ahí sale `authorized_numbers.location_id`, que se
> estampa en `visits.location_id` con `location_source = 'authorized_number'`. Es una señal
> **autenticada**: la firma de Twilio ya se valida en `twilio-incoming/route.ts:82-84` y el
> número no lo elige el cliente.
> **Es OPCIONAL.** El workflow `n8n/domicilios_whatsapp_v4.json` ya lo calculaba y lo
> **descartaba**; F3 lo reenvía. Mientras el dueño no despliegue a mano el workflow nuevo en
> n8n, los pedidos entran exactamente igual, con sede desconocida (`location_id = NULL`).

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
  disparo, uno no tumba a los demás si falla (`Promise.allSettled`). Este es el modo que usan
  tanto el Schedule Trigger de n8n como la entrada de `vercel.json` (ninguno lleva `?tenant=`):
  un cliente nuevo entra solo, sin tocar el disparador.

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

> **Quién lo dispara:** declarado en `vercel.json` con `0 16 * * *` (= 11:00 de Colombia) desde
> 2026-09-02, pero **hoy lo sigue disparando n8n** — el workflow «Cron Recordatorio de Premios».
> El disparo por Vercel empieza al desplegar a producción con plan Pro, y ahí se apaga el
> Schedule Trigger de n8n. Ver `docs/04-deployment.md` §2.

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

> **Quién lo dispara:** declarado en `vercel.json` con `*/15 * * * *` desde 2026-09-02, pero
> **hoy lo sigue disparando n8n self-hosted** — el workflow «Cron Calendario» (Schedule Trigger
> cada 15 min → HTTP POST con `Authorization: Bearer CRON_SECRET`). El disparo por Vercel
> empieza al desplegar a producción con plan Pro, y ahí se apaga el Schedule Trigger de n8n.
>
> *Corrección de dos afirmaciones que había aquí:* (1) el límite de Hobby **no** es la cantidad
> de crons —son 100 por proyecto en todos los planes— sino la **frecuencia**: 1 vez al día, así
> que lo que exige Pro es la cadencia `*/15`, no "ser el 3er cron". (2) `birthday` y
> `reactivation` **no** seguían siendo crons de Vercel: se habían movido a n8n el 2026-07-05,
> cuando `vercel.json` quedó en `{"crons": []}`. Vuelven a `vercel.json` con este cambio.

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
- `source` — `qr_only` | `delivery_only` (mismo `source_channels` que aplica el envío manual)
- `minDays` / `maxDays` — Días sin venir (v2.8.0). `minDays=N`: última visita hace N días o más;
  `maxDays=M`: última visita hace M días o menos (día M completo incluido). Ambos excluyen clientes
  sin `last_visit_at`.

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
    "minDays": "",
    "maxDays": "",
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

**Notas (v2.8.0):**

- `filters.minDays` / `filters.maxDays` — días sin venir, mismo criterio que el estimador.
- La query excluye clientes con `whatsapp_opt_out_at` (antes se contaban como fallidos al enviar).
- Las burbujas de riesgo del dashboard (`AtRiskBubbles`) usan este mismo endpoint con el rango de
  días del nivel como filtro.

---

### Campaigns: Run Auto (v2.8.0)

**`POST /api/dashboard/campaigns/run-auto`** — Admin JWT

Puente autenticado para el botón "Ejecutar Ahora" del dashboard: valida la sesión del admin y llama al
cron correspondiente (`/api/cron/birthday` o `/api/cron/reactivation`) del tenant actual con el
`CRON_SECRET` desde el servidor. El navegador nunca ve el secret.

**Request:**
```json
{ "type": "birthday" }
```

**Response 200:** passthrough del resultado del cron (`ok`, `sent`, `failed`,
`total_birthday_customers` / `total_inactive_customers`, `error?`).

**Errores:** `400` type inválido, `401` sin sesión, `404` tenant no encontrado, `500` CRON_SECRET ausente.

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

> v2.8.1: usa `ContentAndApprovals` de Twilio (1 llamada, antes 1+N). Cada plantilla incluye ahora
> `rejection_reason` (motivo de rechazo de Meta, o `null`) y `has_media` (true = `twilio/media`,
> plantillas de eventos — los selectores de campañas las excluyen). El `POST` valida reglas duras de
> Meta antes de crear: variable al inicio/fin del cuerpo y máximo 1024 caracteres → 400 con mensaje.

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

### Templates — catálogo estándar (Zernio)

> **Solo tenants `messaging_provider='zernio'`.** Los 4 tenants Twilio siguen usando los dos endpoints
> de arriba, sin cambios (decisión del dueño: "déjalos así, ni los toques"). El guardarraíl vive en
> `assertZernioTenant()` dentro de `template.service.ts`, no en la UI.
>
> Doc de feature: `docs/features/whatsapp-templates.md`.

#### `GET /api/dashboard/templates/catalog` — Admin JWT

Estado de las 13 plantillas del catálogo: qué se está enviando, qué está en revisión de Meta, y qué
texto propone el estilo del negocio.

**Response 200:**
```json
{
  "provider": "zernio",
  "style": "calido",
  "brandName": "Sabor Urbano",
  "entries": [
    {
      "definition": {
        "key": "welcome",
        "settingsKey": "welcome_template_sid",
        "baseName": "bienvenida",
        "category": "UTILITY",
        "label": "Bienvenida",
        "whenSent": "La primera vez que un cliente se registra, por QR o por domicilio.",
        "variables": [{ "index": 1, "label": "Nombre del cliente", "sample": "María" }]
      },
      "current":  { "provider_ref": "bienvenida", "body": "...", "status": "approved", "is_current": true },
      "pending":  null,
      "lastRejected": null,
      "suggestedBody": "¡Hola {{1}}! 🎉…",
      "adoptedRef": null
    }
  ]
}
```

`adoptedRef` no-nulo con `current: null` = el mensaje **está activo** pero se cargó fuera del panel
(alta por el AIOS o SQL directo) y no tenemos su texto. La pantalla lo dice tal cual.

**Response 409:** `{ "provider": "twilio" }` — el negocio no es Zernio. El frontend cae al gestor Twilio.

#### `PUT /api/dashboard/templates/catalog/:key` — Admin JWT

Guarda la edición de una plantilla. `:key` es el `definition.key` (ej. `welcome`, `birthday`).

> **No es una edición in-place.** Crea una plantilla nueva en Zernio y la somete a Meta.
> **`admin_settings.<settings_key>` NO se toca**: la plantilla vieja sigue vigente y los envíos siguen
> saliendo con ella hasta que Meta apruebe la nueva. Ver `docs/features/whatsapp-templates.md`.

**Body:**
```json
{
  "body": "¡Hola {{1}}! Bienvenid@ a nuestro club. Empiezas con {{2}} puntos.\n\n{{3}}\n\n¡Te esperamos!",
  "acceptedDisclaimer": true
}
```

`acceptedDisclaimer` es **obligatorio** (`true`). Sin él → 400. Queda registrado quién aceptó y cuándo
(`template_versions.edited_by` / `disclaimer_accepted_at`): la decisión del dueño ("si se las llegan a
bloquear va a ser su culpa") no se sostiene sin ese registro.

**Response 200:**
```json
{
  "success": true,
  "message": "Guardado. WhatsApp está revisando el cambio (suele tardar entre 1 y 3 días). Mientras tanto tus clientes siguen recibiendo el mensaje anterior, sin interrupciones.",
  "version": { "id": "…", "provider_ref": "bienvenida_v2", "status": "pending" }
}
```

**Errores:**

| Código | Cuándo |
|---|---|
| 400 | Texto inválido para Meta (empieza/termina con variable, >1024 chars, falta o sobra un `{{n}}`, falta el opt-out en MARKETING) o falta `acceptedDisclaimer` |
| 404 | `:key` no existe en el catálogo |
| 409 | Ya hay una edición de esa plantilla en revisión, el negocio no es Zernio, o no tiene WhatsApp conectado |
| 502 | Zernio rechazó la creación. **La plantilla actual sigue funcionando**; el intento queda registrado con `status='failed'` |

#### `GET /api/dashboard/templates/standard` — Admin JWT

Espejo Twilio de `/catalog`: aquel devuelve 409 a un tenant Twilio, este devuelve **409** a uno
Zernio. Dice en qué punto está cada una de las 13 plantillas del catálogo estándar para este negocio.

```json
{
  "provider": "twilio",
  "brandName": "Don Alirio",
  "emoji": "🍽️",
  "style": "calido",
  "missingCount": 2,
  "warning": null,
  "templates": [
    {
      "key": "campaign_presencial_to_domicilio",
      "label": "Campaña — invitar a pedir a domicilio",
      "description": "…",
      "whenSent": "Solo cuando lanzas esta campaña manual desde el dashboard.",
      "settingsKey": "campaign_presencial_to_domicilio_template_sid",
      "category": "MARKETING",
      "state": "missing",
      "pointer": null,
      "approvalStatus": null,
      "body": "¡Hola {{1}}! 🛵🍽️

…",
      "needsMedia": false
    }
  ]
}
```

`state`: `missing` (no hay puntero) · `orphan` (hay puntero pero Twilio no conoce ese ContentSid) ·
`pending` (esperando a Meta) · `approved`. `warning` se llena si no se pudo leer la lista de Twilio;
en ese caso los punteros existentes se reportan como `approved` y el aviso lo explica.

#### `POST /api/dashboard/templates/standard` — Admin JWT

```json
{ "key": "campaign_presencial_to_domicilio" }
```

Crea esa plantilla en la cuenta Twilio del tenant con el texto del catálogo (estilo + marca + emoji
del negocio), la somete a Meta y **rellena el puntero solo si estaba vacío**.

```json
{
  "success": true,
  "key": "campaign_presencial_to_domicilio",
  "contentSid": "HX…",
  "approvalSubmitted": true,
  "approvalError": null,
  "pointerWritten": true
}
```

| Código | Cuándo |
|---|---|
| 400 | `key` no es del catálogo, o lleva media (las 2 de evento no se crean desde acá) |
| 409 | El tenant es Zernio, **o** esa plantilla ya tiene puntero (esto solo llena huecos) |
| 502 | Twilio rechazó la creación |

Si la creación sale bien pero el envío a Meta falla, **no se aborta**: la plantilla ya existe en
Twilio, así que se informa (`approvalSubmitted: false` + `approvalError`) y el dueño la reenvía con
el botón «Enviar a Meta» que ya tiene la lista.

> Doc de feature: `docs/features/whatsapp-templates.md` § "Completar huecos del set estándar".

#### `GET /api/dashboard/opt-outs` — Admin JWT

Query: `days` (default 90, máx 365) — la ventana de la lista de recientes, **no** del total.

```json
{
  "total": 14,
  "base": 620,
  "rate": 2.3,
  "days": 90,
  "recentCount": 3,
  "recent": [
    {
      "id": "uuid",
      "name": "María",
      "phone": "300···4567",
      "optedOutAt": "2026-08-28T14:02:11.000Z",
      "totalVisits": 7,
      "totalPoints": 320
    }
  ]
}
```

Lee `customers.whatsapp_opt_out_at`, que es **la misma columna que consulta `isPhoneOptedOut()` antes
de cada envío** en las dos ramas de proveedor. Por eso cuenta igual con Twilio y con Zernio, a
diferencia de `/api/dashboard/twilio-metrics`, que deduce los opt-outs paginando la API de Mensajes
de Twilio y devuelve vacío para un tenant Zernio. El teléfono va enmascarado.

#### `PUT /api/dashboard/templates/style` — Admin JWT

**Body:**
```json
{ "style": "elegante", "reapplyAll": false, "acceptedDisclaimer": false }
```

| `reapplyAll` | Qué hace |
|---|---|
| `false` | **Solo cambia el default.** Ninguna plantilla se toca, nada va a Meta. Es el punto de partida de la próxima que se cree o edite |
| `true` | Además reescribe las 13 con el banco del estilo nuevo. **Son 13 aprobaciones nuevas de Meta.** Exige `acceptedDisclaimer: true` |

Tolerante a fallos parciales a propósito: si una plantilla falla, las ya sometidas siguen su curso.
Abortar a la mitad dejaría el catálogo peor que al empezar y no hay forma de deshacer lo ya enviado.

**Response 200 (`reapplyAll: true`):**
```json
{
  "success": true,
  "style": "elegante",
  "reapplied": true,
  "submitted": ["welcome", "birthday"],
  "skipped": [{ "key": "reward_safe", "reason": "ya tenía un cambio en revisión" }],
  "failed": [],
  "message": "Se enviaron 2 mensajes a revisión de WhatsApp. Mientras los revisan, tus clientes siguen recibiendo los actuales."
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
> **El auto-envío está activo:** los eventos con `send_mode='auto'` y `status='scheduled'` se disparan vía `/api/cron/calendar-dispatch` (hoy programado en n8n self-hosted; ya declarado en `vercel.json` con `*/15 * * * *`) o manualmente con `POST .../events/:id/dispatch`. El envío real con media sigue dependiendo de que Meta apruebe las plantillas `twilio/media`.

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

Si el PATCH toca `send_mode` o `scheduled_send_at` (y no manda `status` explícito), el `status` se
realinea solo a la invariante: `'scheduled'` si el evento queda en `send_mode='auto'` **con** fecha,
`'planned'` en cualquier otro caso. Los eventos `sent` / `cancelled` no se tocan.

**Response 200:** `{ "event": { ... } }`

---

### Disparar / reintentar auto-envío (manual)

**`POST /api/dashboard/calendar/events/:id/dispatch`** — Admin JWT

Ejecuta `executeAutoEvent` bajo demanda. Es el camino normal para enviar un evento del calendario
(el cron es solo para los que se programaron con fecha).

**Reglas (v2.8.3):**
- Acepta **cualquier evento vivo**: `planned`, `scheduled` o `failed`, en modo `auto` **o** `remind`.
  El endpoint llama a `armEventForDispatch`, que lo normaliza a `send_mode='auto'` +
  `scheduled_send_at=now()` + `status='scheduled'` antes de ejecutar.
- Solo `sent` y `cancelled` → 400.
- Requiere `event_template_image_sid` / `event_template_video_sid` en `admin_settings` según `media_type`; si falta, devuelve el error de `executeAutoEvent`.
- Requiere que el evento tenga `media_url` en el bucket `event-media` (las plantillas son `twilio/media`).

> Antes de v2.8.3 exigía `send_mode='auto'` y `status` ∈ {`scheduled`,`failed`}. Como el dialog crea
> los eventos en modo "Solo recordarme" (`remind` → `planned`) por defecto, el camino por defecto no
> se podía enviar desde ningún lado: ni cron, ni este endpoint, ni el drawer.

**Response 200:**
```json
{ "ok": true, "sent": 42, "failed": 1, "excluded_monthly_cap": 7, "campaign_id": "uuid" }
```

**Response 400:** `{ "error": "Este evento ya se envió. Duplícalo si quieres volver a invitar." }`

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

Desde **multi-sede F4** el host se resuelve con `resolveHostContext()`, no con
`getTenantByDomain()`: así el mesero de la sede 2 puede entrar por el subdominio de **su** sede
(`laureles.marca.com`), que antes daba **404 «Restaurante no reconocido»**.

**Request:**
```json
{ "phone": "3001234567", "pin": "1234" }
```

**Response 200:**
```json
{
  "staff": { "id": "uuid", "name": "Carlos", "phone": "3001234567", "role": "waiter", "location_id": null },
  "token": "eyJhbG..."
}
```

`location_id` es la sede del mesero (**D11**, `staff_users.location_id` de la 00044). `null` =
**mesero sin sede asignada**, que es el estado de todo el parque actual. Se devuelve **solo para
mostrarla**: la autorización siempre relee la fila. ⚠️ **La sede NO viaja dentro del JWT** (§5.3
del spec): el token dura 8 horas, así que reasignar de sede a un mesero tardaría hasta 8 horas en
verse y no habría forma de revocarlo.

**Response 401:** `{ "error": "No autorizado", "message": "Mesero no encontrado o inactivo" }` ·
`{ "message": "PIN incorrecto" }`

**Response 403 — `Sede incorrecta` (nuevo en F4, §5.3):**
```json
{
  "error": "Sede incorrecta",
  "message": "Estás en el enlace de otra sede. Abre el enlace de tu sede para iniciar sesión."
}
```

Se dispara **solo** cuando el host resuelve una sede **y** el mesero tiene una **y** son
distintas. Si cualquiera de las dos es `null`, pasa — por eso ningún mesero de los tenants
actuales (todos con `location_id` NULL) se queda fuera al aplicar la 00044.

Se comprueba **después** del PIN a propósito: contestar *"estás en otra sede"* antes de validar la
clave le diría a cualquiera qué celulares existen y en qué sede están.

⚠️ Este 403 es del **login**, no del check-in. `POST /api/check-in` con un mesero de otra sede
**no bloquea**: ahí gana el mesero (es la vía 1 de la precedencia) y la discrepancia se registra
en `visits.location_conflict`. En el login el actor es el mesero y el enlace equivocado es su
error; en el check-in el actor es el cliente, que puede llegar con un enlace guardado de otra sede.

**Response 404:** `{ "error": "Restaurante no reconocido" }` — ni la marca ni ninguna sede
reclaman ese host.

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
  "device_name": "Celular del Local",
  "assign_staff_phone": "3009876543"
}
```

- `assign_staff_phone` (opcional, v2.8.1): celular de un mesero activo del tenant al que se
  atribuye el dispositivo. El supervisor sigue autorizando con su PIN; las visitas registradas
  desde el dispositivo quedan a nombre del mesero asignado. Sin este campo, el dispositivo queda
  a nombre del supervisor. Si el celular no corresponde a un mesero activo → 404.

**Response 200:** `{ "success": true, "message": "Dispositivo activado a nombre de <mesero>", "assigned_to": "<mesero>" }`
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
{ "name": "Ana López", "phone": "3009876543", "pin": "5678", "role": "waiter", "location_id": null }
```

`location_id` (**opcional**, multi-sede F4 / D11) es la sede a la que pertenece el mesero.
Omitirlo o mandarlo `null` lo deja **sin sede asignada**, que es el estado de todo el parque
actual y funciona exactamente como siempre: no aporta señal a la resolución de sede, la
precedencia cae al host, y el 403 de sede del login nunca lo toca.

**Response 201:** `{ "id": "uuid", "name": "Ana López", "phone": "3009876543", "role": "waiter", "is_active": true, "created_at": "...", "location_id": null }`

**Response 400 — `Sede inválida`:** la sede no existe, no está activa, o **es de otra marca**.
La FK compuesta `(location_id, tenant_id)` de la 00044 ya lo impediría en el motor (23503), pero
saldría como un 500 sin explicación; esto lo convierte en un 400 que dice qué pasó.

**Response 409 — `Duplicado`:** ya hay un mesero con ese celular en la marca
(`staff_users_phone_tenant_key`). ⚠️ Ese UNIQUE es lo que hace cumplir **D11 en el motor**: un
celular = una fila = una sede. No hay forma de crear "el mismo mesero en las dos sedes".

**`PATCH /api/dashboard/staff`** — Admin JWT

**Request:**
```json
{ "id": "uuid", "is_active": false, "pin": "9999", "name": "Ana López 2", "role": "supervisor", "location_id": "uuid-sede" }
```

Todos los campos son opcionales; solo se escriben los presentes. Para **quitarle** la sede a un
mesero hay que mandar `location_id: null` **explícito** — omitir el campo no la toca.

**Response 400 — `Sede inválida`:** igual que en el POST.

**Response 409 — `Conflicto de sede` (nuevo en F4):** el mesero tiene **dispositivos de confianza
en la sede vieja**. Lo rechaza el trigger `trg_staff_users_sede_coherente` (00044) y el `message`
trae el texto del motor, que dice cuántos son. Un dispositivo es un aparato **físico** que está
donde está: arrastrarlo detrás de su dueño reasignaría en silencio las visitas de una tablet que
nadie movió del mostrador. Hay que reasignar o desvincular esos dispositivos primero.

**`GET /api/dashboard/staff`** devuelve `location_id` en cada mesero y en cada dispositivo.
`null` se muestra como **«Sin sede»**: nunca se reparte ni se esconde.

> ⚠️ **La pantalla todavía no tiene selector de sede.** F4 entregó el mecanismo (API + base), no
> el control: un selector de sedes en el panel es **F7** (`LocationScope`, migración 00045), que
> es donde se decide de una vez cómo se eligen sedes en toda la interfaz. Mientras tanto la
> asignación se hace por API. Ver la deuda #16 de `docs/features/multi-sede.md`.

**`DELETE /api/dashboard/staff?id=uuid`** — Admin JWT

**Response 200:** `{ "success": true }`

⚠️ Borrar un mesero **borra sus dispositivos de confianza**:
`staff_devices_staff_user_id_fkey` es `ON DELETE CASCADE` (00018:31).

---

### GET / PUT /api/dashboard/location

La **sede principal** de la marca. Es la pantalla de la geocerca, no un administrador de sedes.

**Auth:** cookie de admin (`supabase.auth.getUser()`). El tenant sale del JWT
(`requireTenantId()`), **no del host**.

**`GET`** → objeto plano `{ id, name, address, lat, lon, radius_meters, is_active }`, o `null` si
la marca no tiene ninguna sede activa. **401** si la sesión no trae `tenant_id` (antes salía como
un 500 sin cuerpo).

**`PUT`** → `{ lat, lon, radius_meters?, address? }`. Actualiza la sede principal; solo crea una
fila si la marca **no tiene ninguna** sede activa. **400** si faltan o son inválidas las
coordenadas.

> **Multi-sede F4 — deuda #14, cerrada.** Los dos handlers hacían `.single()` filtrando solo por
> `tenant_id`, así que con 2 sedes activas el GET devolvía **500** y el PUT —que **descartaba el
> error** de su sonda— caía al `else` e **insertaba una TERCERA fila** en silencio. Esa sede
> fantasma entra en `getActiveLocations()` y rompe la «sede única implícita» de toda la marca.
> Ahora la fila se elige de forma determinista con **el mismo orden que `getActiveLocations()`**
> (`is_primary` DESC → `sort_order` ASC → `name` ASC) y **se comprueba el error**: ante un fallo
> de lectura el PUT **no inserta nada**.
>
> ⚠️ **El contrato NO cambió** (sigue siendo un objeto plano): devolver la lista rompería
> `dashboard/settings/page.tsx` en silencio. Editar una sede **distinta de la principal** exige un
> selector, y el selector es **F7**.

---

### GET /api/dashboard/line-budget

Cuántos mensajes puede emitir **hoy** la línea del tenant. Para tenants Zernio esta tarjeta reemplaza a
la de billetera: desde la migración `00037` (decisión D-2) esos tenants ya no se cobran por mensaje
— Meta les factura directo — así que el freno dejó de ser el saldo y pasó a ser el cupo.

**Auth:** cookie de admin. Un super-admin sin `tenant_id` en el JWT recibe `{ "available": false }`
(degrada limpio, igual que `/api/dashboard/wallet`).

**Respuesta 200:**

```json
{
  "available": true,
  "enforced": true,
  "limit": 250,
  "used24h": 42,
  "reserve": 70,
  "campaignBudget": 180,
  "campaignAvailable": 138,
  "transactionalAvailable": 208,
  "qualityRating": "green",
  "lineStatus": "active"
}
```

| Campo | Significado |
|---|---|
| `limit` | Destinatarios **únicos** que Meta permite en 24h **rodantes**. No es un contador por día calendario. |
| `used24h` | `COUNT(DISTINCT phone)` en la ventana. Tres mensajes al mismo teléfono cuentan **uno**. |
| `reserve` | Cupos apartados para lo transaccional. Existe porque en Meta una bienvenida pesa igual que una promo. |
| `campaignBudget` | Techo total que las campañas pueden alcanzar (`limit - reserve`, x0.5 si `throttled`, 0 si `frozen`). |
| `lineStatus` | `active` \| `throttled` \| `frozen`. Volver a `active` es **siempre** manual. |
| `enforced` | `false` = no se conoce el límite de esa línea: se **mide** el consumo pero no se bloquea nada. Es el estado de los tenants anteriores a la migración 00037. Con `false`, todos los campos de cupo llegan en `null` salvo `used24h`. |

**Respuesta cuando el límite no se conoce:**

```json
{
  "available": true,
  "enforced": false,
  "limit": null,
  "used24h": 1240,
  "reserve": null,
  "campaignBudget": null,
  "campaignAvailable": null,
  "transactionalAvailable": null,
  "qualityRating": "unknown",
  "lineStatus": "active"
}
```

**Errores:** `401` sin sesión · `500` si no se pudo calcular el presupuesto.

Ver `docs/features/send-governance.md`.

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
