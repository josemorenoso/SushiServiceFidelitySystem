# Documentación de API

**Base URL:** `/api`
**Autenticación:** Bearer Token (JWT) — Supabase Auth
**Última actualización:** 2026-04-07 15:56

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
| POST | /api/check-in | Registrar visita (QR) | NO (público) |
| POST | /api/webhook/delivery | Recibir datos de domicilio (Twilio) | Número autorizado |
| POST | /api/cron/birthday | Enviar felicitaciones de cumpleaños | CRON_SECRET |
| POST | /api/cron/reactivation | Enviar reactivaciones (21 días inactivos) | CRON_SECRET |
| GET | /api/dashboard/metrics | Métricas generales | Admin JWT |
| GET | /api/dashboard/customers | Lista de clientes | Admin JWT |
| POST | /api/dashboard/campaigns | Crear campaña manual | Admin JWT |
| POST | /api/dashboard/campaigns/:id/send | Ejecutar campaña | Admin JWT |

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

## Códigos de Error Globales

| Código | Descripción |
|--------|-------------|
| 400 | Datos inválidos |
| 401 | Token inválido/expirado |
| 403 | Sin permisos / número no autorizado |
| 404 | No encontrado |
| 429 | Rate limit excedido |
| 500 | Error del servidor |
