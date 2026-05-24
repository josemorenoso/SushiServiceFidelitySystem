# Feature: Campañas y Automatizaciones (Cron Jobs)

> **Estado:** Completo (cron birthday + reactivation)
> **Archivos clave:** `src/app/api/cron/birthday/route.ts`, `src/app/api/cron/reactivation/route.ts`, `src/services/campaign.service.ts`
> **Dependencias:** @supabase/supabase-js, twilio (WhatsApp)

---

## Descripción
Sistema de campañas automáticas y manuales para enviar mensajes de WhatsApp a clientes segmentados. Incluye dos cron jobs automáticos (cumpleaños y reactivación) y la infraestructura para campañas manuales desde el dashboard.

## Objetivo
Mantener engagement con los clientes mediante:
1. **Felicitación de cumpleaños** — Mensaje automático el día del cumpleaños
2. **Reactivación** — Mensaje a clientes inactivos por 21+ días
3. **Campañas manuales** — El admin podrá crear campañas segmentadas (FASE 5)

## Modelo de Datos
- **campaigns** — Registro de cada campaña (tipo, estado, template, filtros)
- **campaign_messages** — Registro individual de cada mensaje enviado por campaña
- **customers** — Consulta cumpleañeros y clientes inactivos

## Flujo de Uso

### Cron: Cumpleaños
1. Cron externo (Vercel Cron / n8n) llama `POST /api/cron/birthday` diariamente
2. Valida `CRON_SECRET` en el header Authorization
3. Busca clientes con `birthday` = hoy (día y mes)
4. Para cada cumpleañero:
   - Crea campaña tipo `birthday` (si no existe una de hoy)
   - Envía mensaje de WhatsApp personalizado
   - Registra en `campaign_messages`
5. Actualiza totales de la campaña

### Cron: Reactivación
1. Cron externo llama `POST /api/cron/reactivation` diariamente
2. Valida `CRON_SECRET`
3. Busca clientes con `last_visit_at` < hace 21 días
4. Excluye clientes que ya recibieron reactivación en los últimos 30 días
5. Para cada inactivo:
   - Crea campaña tipo `reactivation` (si no existe una de hoy)
   - Envía mensaje de WhatsApp
   - Registra en `campaign_messages`
6. Actualiza totales

### Campañas Manuales (FASE 5 — Dashboard)
1. Admin crea campaña con filtros y template
2. Admin ejecuta campaña
3. Sistema envía mensajes a clientes filtrados
4. Registra cada envío en `campaign_messages`

## Componentes / Archivos
| Archivo | Responsabilidad |
|---------|----------------|
| `src/app/api/cron/birthday/route.ts` | Cron: envía felicitaciones de cumpleaños |
| `src/app/api/cron/reactivation/route.ts` | Cron: envía reactivación a inactivos |
| `src/services/campaign.service.ts` | Lógica: crear campañas, registrar mensajes, buscar clientes |
| `src/lib/validators/cron.ts` | Validación de CRON_SECRET |
| `src/services/whatsapp.service.ts` | Reutiliza: envío de mensajes |

## API / Endpoints
| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| POST | `/api/cron/birthday` | Cron cumpleaños | CRON_SECRET |
| POST | `/api/cron/reactivation` | Cron reactivación | CRON_SECRET |

### Autenticación Cron
```
Authorization: Bearer {CRON_SECRET}
```

### POST /api/cron/birthday
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

### POST /api/cron/reactivation
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

## Restricciones
- Solo se ejecutan con `CRON_SECRET` válido
- Un cliente no recibe más de 1 reactivación en 30 días
- Cumpleaños solo se envía 1 vez al año por cliente
- WhatsApp es best-effort: si falla, se registra como `failed` pero el cron continúa
- Las campañas automáticas se crean con fecha del día para evitar duplicados

## Pendiente
- [x] Crear migración SQL para campaigns + campaign_messages
- [x] Crear servicio campaign.service.ts
- [x] Implementar cron birthday
- [x] Implementar cron reactivation
- [x] Crear validador de CRON_SECRET
- [ ] Ejecutar migración 00004 en Supabase
- [ ] Configurar CRON_SECRET en .env.local
- [ ] Configurar cron trigger (Vercel Cron o n8n Schedule)
