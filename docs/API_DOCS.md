# Documentación de API

**Base URL:** `/api`
**Autenticación:** Bearer Token (JWT) — Supabase Auth
**Última actualización:** 2026-05-28
> **Nota:** Validación de geolocalización está en **STANDBY** (v1.0.5-3). El backend no valida GPS por defecto. Puede reactivarse descomentando el bloque en `src/app/api/check-in/route.ts`.

---

## Autenticación

Endpoints protegidos (dashboard) requieren:
```
Authorization: Bearer {access_token}
```

Webhooks validan origen por número autorizado o `CRON_SECRET`.

---

## Índice de Endpoints

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| GET | /api/health | Estado del servidor | NO |
| GET | /api/health/twilio | Test conexión Twilio (saldo) | NO |
| POST | /api/check-in | Registrar visita (QR) | NO (público) |
| POST | /api/webhook/delivery | Recibir datos de domicilio (n8n/Twilio) | x-webhook-secret |
| POST | /api/webhook/twilio-incoming | Auto-responder mensajes entrantes al número | Twilio Signature |
| GET/POST | /api/cron/birthday | Enviar felicitaciones de cumpleaños | CRON_SECRET |
| GET/POST | /api/cron/reactivation | Enviar reactivaciones (21 días inactivos) | CRON_SECRET |
| GET | /api/dashboard/metrics | Métricas generales | Admin JWT |
| GET | /api/dashboard/customers | Lista de clientes | Admin JWT |
| POST | /api/dashboard/campaigns | Crear campaña manual | Admin JWT |
| POST | /api/dashboard/campaigns/:id/send | Ejecutar campaña | Admin JWT |
| GET | /api/dashboard/campaigns/estimate | Estimar audiencia con filtros | Admin JWT |
| POST | /api/dashboard/campaigns/manual | Crear y ejecutar campaña manual | Admin JWT |
| GET | /api/dashboard/twilio-balance | Saldo Twilio + costo por mensaje | Admin JWT |
| GET | /api/dashboard/analytics | Analytics completos del dashboard | Admin JWT |
| GET | /api/dashboard/templates | Listar plantillas Twilio Content API | Admin JWT |
| POST | /api/dashboard/templates | Crear plantilla + submit aprobación WhatsApp | Admin JWT |
| POST | /api/dashboard/check-in-override | Registrar visita extra (admin override) | Admin JWT |
| GET | /api/dashboard/settings | Obtener configuración del admin | Admin JWT |
| PUT | /api/dashboard/settings | Actualizar configuración | Admin JWT |
| GET | /api/dashboard/customers/:id | Detalle de un cliente | Admin JWT |
| GET | /api/dashboard/customers/:id/next-reward | Próxima recompensa del cliente | Admin JWT |
| POST | /api/dashboard/rewards | Crear recompensa (visit_milestone opcional) | Admin JWT |
| DELETE | /api/dashboard/rewards?id=X | Eliminar recompensa | Admin JWT |
| PATCH | /api/dashboard/rewards | Actualizar `is_active`, `title` y/o `visit_milestone` | Admin JWT |
| GET | /api/dashboard/calendar/events | Listar eventos en rango `?from=&to=` | Admin JWT |
| POST | /api/dashboard/calendar/events | Crear evento del calendario | Admin JWT |
| GET | /api/dashboard/calendar/events/:id | Detalle de un evento | Admin JWT |
| PATCH | /api/dashboard/calendar/events/:id | Actualizar evento | Admin JWT |
| DELETE | /api/dashboard/calendar/events/:id | Cancelar evento (soft-delete) | Admin JWT |
| POST | /api/dashboard/calendar/media-upload | Subir imagen/video a `event-media` | Admin JWT |
| DELETE | /api/dashboard/calendar/media-upload?path=X | Borrar asset del bucket | Admin JWT |
| GET | /api/dashboard/location | Obtener ubicación del restaurante | Admin JWT |
| PUT | /api/dashboard/location | Actualizar ubicación del restaurante | Admin JWT |
| GET | /api/dashboard/staff | Listar meseros y dispositivos | Admin JWT |
| POST | /api/dashboard/staff | Crear mesero (admin) | Admin JWT |
| PATCH | /api/dashboard/staff | Actualizar mesero (toggle, reset PIN) | Admin JWT |
| DELETE | /api/dashboard/staff | Eliminar mesero | Admin JWT |
| POST | /api/staff/login | Login mesero (phone + PIN) | NO |
| GET | /api/staff/me | Validar sesión mesero | Staff JWT / Device |
| GET | /api/staff/stats | Visitas registradas hoy | Staff JWT / Device |
| POST | /api/staff/device/register | Activar dispositivo de confianza | Supervisor PIN |
| POST | /api/staff/device/verify | Verificar device_token | NO |

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

**Response 403 (modo staff_verified + first_visit_free=false):**
> Ocurre cuando `checkin_mode = 'staff_verified'` y `checkin_first_visit_free = false`. Requiere mesero.

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

**Response 429 (check-in duplicado < 1h):**
```json
{ "error": "Check-in reciente", "message": "Ya registraste una visita...", "customer": { "name": "Juan", "total_visits": 5 } }
```

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
  "raw_message": "Pedido de Juan..."
}
```

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

---

### Cron: Cumpleaños

**`POST /api/cron/birthday`** — Protegido por `CRON_SECRET`

**Headers:** `Authorization: Bearer {CRON_SECRET}`

**Response 200:**
```json
{
  "ok": true,
  "campaign_id": "uuid",
  "sent": 3,
  "failed": 0,
  "total_birthday_customers": 3
}
```

---

### Cron: Reactivación

**`POST /api/cron/reactivation`** — Protegido por `CRON_SECRET`

**Headers:** `Authorization: Bearer {CRON_SECRET}`

**Settings que consume (en orden de prioridad):**
1. `reactivation_with_reward_template_sid` + `reactivation_reward_id` → modo "vuelve y gana X" (`{{1}}=nombre, {{3}}=título premio fijo`)
2. `reactivation_no_reward_template_sid` → modo "te echamos de menos" (sólo `{{1}}=nombre`)
3. `reactivation_template_sid` (legacy) → fallback con `{{1}}, {{2}}, {{3}}=título próximo premio del cliente`

Si ninguno está configurado, retorna `{ ok: false, error: "..." }` sin enviar.

**Response 200:**
```json
{
  "ok": true,
  "campaign_id": "uuid",
  "sent": 12,
  "failed": 1,
  "total_inactive_customers": 13
}
```

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

## Calendar — Eventos del calendario operativo

> Capa de datos del calendario. Los eventos se crean y persisten con o sin media (imagen/video).
> **El path de envío (disparo del WhatsApp) no está implementado en esta iteración** — está pausado hasta que las plantillas Twilio tipo `twilio/media` estén aprobadas por Meta. Hoy los eventos solo se almacenan y se listan; cuando se cablee el envío, los eventos con `send_mode='auto'` y `status='scheduled'` se dispararán vía cron.

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
