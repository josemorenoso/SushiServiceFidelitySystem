# Documentación de API

**Base URL:** `/api`
**Autenticación:** Bearer Token (JWT) — Supabase Auth
**Última actualización:** 2026-04-10 22:50

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

### Check-in (QR)

**`POST /api/check-in`** — Sin autenticación (ruta pública)

Endpoint unificado con 3 acciones: `lookup`, `register`, `checkin`.

#### Lookup (buscar cliente)
**Request:**
```json
{ "phone": "3001234567", "action": "lookup" }
```
**Response 200 (encontrado):**
```json
{ "found": true, "customer": { "name": "Juan", "total_visits": 4 } }
```
**Response 200 (no encontrado):**
```json
{ "found": false }
```

#### Register (cliente nuevo)
**Request:**
```json
{ "phone": "3001234567", "action": "register", "name": "Juan Pérez", "birthday": "1990-05-15", "city": "Bogotá" }
```
**Response 201:**
```json
{ "message": "welcome", "customer": { "name": "Juan Pérez", "total_visits": 1 } }
```

#### Check-in (cliente existente)
**Request:**
```json
{ "phone": "3001234567", "action": "checkin" }
```
**Response 200:**
```json
{ "message": "welcome_back", "customer": { "name": "Juan", "total_visits": 5 }, "reward": { "title": "Postre gratis", "message": "..." } }
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
  "messageTemplate": "¡Hola {{name}}! Ven a visitarnos..."
}
```

**Response 200:**
```json
{ "success": true, "campaignId": "uuid", "totalSent": 45 }
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

## Códigos de Error Globales

| Código | Descripción |
|--------|-------------|
| 400 | Datos inválidos |
| 401 | Token inválido/expirado |
| 403 | Sin permisos / número no autorizado |
| 404 | No encontrado |
| 429 | Rate limit excedido |
| 500 | Error del servidor |
