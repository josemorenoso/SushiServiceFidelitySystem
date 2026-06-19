# Calendario Operativo de Eventos

> Estado: 🟢 Auto-envío activo (cron registrado + dispatch manual). Pendiente solo aprobación Meta de plantillas media.
> Migración: `supabase/migrations/00012_calendar_events_and_media.sql`
> Última actualización: 2026-06-17

---

## Propósito

Permitir al admin del restaurante planificar el mes (festivales, promos, activaciones, aniversarios) y materializar esos eventos como invitaciones por WhatsApp **con imagen o video**, sin saturar el canal ni quemar el quality rating del número Twilio compartido.

Resuelve dos problemas operativos:

1. **Saturación accidental:** una campaña manual lanzada hoy consume el cap de 7 días de N clientes; el viernes hay un festival real y ya no hay con quién comunicarlo.
2. **Plantillas solo-texto:** hasta hoy el sistema no soporta media. No se puede mandar el flyer del festival ni un video corto.

---

## Decisiones de diseño

| Decisión | Elección |
|---|---|
| Disparo del evento | Híbrido por evento (toggle `send_mode`): `auto` (cron envía) o `remind` (solo aviso al admin) |
| Media soportada | Imagen + Video (JPG/PNG ≤ 5MB · MP4 ≤ 16MB) |
| Cap mensual de marketing | 3 mensajes/cliente/mes. Aplica a `source IN ('manual','calendar','reactivation')`. Cumpleaños NO cuenta (dedup 365d lo protege). Utility (recompensa, bienvenida, cerca/lejos premio) NO cuenta. |
| Vista pública del calendario | NO — solo admin (decisión: evita superficie pública adicional) |
| Pre-event blackout | 5 días por defecto (campo configurable por evento `blackout_days`) |

---

## Modelo de datos

### `restaurant_events` (nueva)

Calendario operativo. Cada fila = un evento planeado o ejecutado. Ver `docs/DB_SCHEMA.md#restaurant_events` para el detalle de columnas, índices y RLS.

Campos clave a entender:

- **`send_mode`** — `'auto'` dispara el cron `calendar-dispatch`; `'remind'` solo muestra el evento como recordatorio visual.
- **`scheduled_send_at`** — cuándo se envía el WhatsApp (solo si `send_mode='auto'`). Debe ser ≤ `event_date`.
- **`filters` (jsonb)** — mismo shape que `campaigns.filters`: `{ city, minVisits, maxVisits, minAge, maxAge, source }`.
- **`media_url` + `media_type`** — URL pública del bucket `event-media` y tipo (`image`/`video`).
- **`content_sid`** — Twilio Content SID a usar. Se resuelve desde `admin_settings.event_template_image_sid` o `event_template_video_sid` según `media_type`.
- **`campaign_id`** — FK a `campaigns(id)` que se llena cuando el evento se ejecuta (trazabilidad).
- **`status`** — máquina de estados: `planned` → `scheduled` → `sent` | `cancelled` | `failed`.
- **`blackout_days`** — ventana antes del evento que bloquea campañas manuales conflictivas (default 5, rango 0-30).

### Extensiones de `campaigns`

| Columna nueva | Propósito |
|---|---|
| `source` | Distingue origen real: `'manual' \| 'calendar' \| 'reactivation' \| 'birthday'`. Default `'manual'` preserva backward-compat. Usado por `filterByMonthlyCap`. |
| `media_url` | URL del media adjunto al envío (heredado de `restaurant_events.media_url` para campañas de calendar). |
| `media_type` | `'image'` o `'video'`. NULL para campañas de solo texto. |

Backfill automático en la migración: campañas existentes con `type='birthday'` o `type='reactivation'` reciben el `source` correspondiente; el resto queda en `'manual'`.

### Bucket `event-media` (Supabase Storage)

Público (lectura anónima requerida por Twilio/Meta para descargar el asset al enviar). Escritura solo `authenticated`. Ver `docs/DB_SCHEMA.md#event-media` para políticas.

---

## Lógica del cap mensual (importante para entender el sistema)

`filterByMonthlyCap(customerIds, cap=3)` cuenta `campaign_messages` del cliente en el mes en curso donde la campaña asociada tiene `source IN ('manual','calendar','reactivation')` y excluye los que ya alcanzaron el cap.

Esto se suma a las protecciones existentes (no las reemplaza):
- Cap de 7 días (`FREQUENCY_CAP_DAYS`) sigue activo
- Recovery Zone (18-25 días) sigue activa para reservar clientes al cron de reactivación

### ¿Por qué birthday queda fuera?

El cumpleaños es un evento de relación, no de marketing táctico. Su dedup nativo de 365 días impide spam. Excluirlo del cap evita que un cliente que ya recibió 3 campañas el mes pierda su felicitación — eso sería worst-of-both-worlds (saturación previa + experiencia rota en su día especial).

---

## Pipeline de envío con media (Twilio Content API)

1. Admin sube imagen/video al endpoint `/api/dashboard/calendar/media-upload` → Supabase Storage → URL pública.
2. URL pública se persiste en `restaurant_events.media_url`.
3. Al ejecutar el evento, `calendar.service.executeScheduledEvent`:
   - Resuelve `content_sid` desde `admin_settings` según `media_type`
   - Crea una `campaigns` row con `source='calendar'` + `media_url` + `media_type`
   - Llama a `whatsapp.service.sendTemplateMessage(phone, contentSid, vars, { mediaUrl })`
4. Twilio envía la plantilla `twilio/media` con la URL pública. Meta descarga y entrega.

**Bloqueante operativo:** las 2 plantillas (`event_template_image`, `event_template_video`) deben estar aprobadas por Meta antes de poder usarse en producción (24-72h de espera tras submit).

---

## Pre-event blackout

Cuando el admin lanza una campaña manual y existe un evento con `event_date - blackout_days <= today < event_date`, el endpoint `/api/dashboard/campaigns/estimate` y `manual` excluyen automáticamente a los clientes objetivo del evento futuro. El admin recibe warning con desglose:

```
⚠️ Estás en blackout pre-evento de "Festival del Sushi" (26-mayo).
   437 clientes excluidos para reservar cupo del festival.
   Elegibles hoy: 234.
```

El admin puede hacer override con `force: true` si entiende el trade-off.

---

## Archivos relacionados (referencia rápida)

| Capa | Path |
|---|---|
| Migración | `supabase/migrations/00012_calendar_events_and_media.sql` |
| Schema doc | `docs/DB_SCHEMA.md` (secciones `restaurant_events`, `campaigns`, `event-media`) |
| Service (a crear) | `src/services/calendar.service.ts` |
| Service extendido (a modificar) | `src/services/campaign.service.ts` — añade `filterByMonthlyCap`, `filterByBlackout`, `getActiveBlackouts` |
| Twilio service (a modificar) | `src/services/whatsapp.service.ts` — soporte `mediaUrl` |
| Endpoints | `src/app/api/dashboard/calendar/{events,events/[id],events/[id]/dispatch,media-upload}/route.ts` |
| Cron | `src/app/api/cron/calendar-dispatch/route.ts` — disparado por n8n self-hosted (Schedule cada 15 min → HTTP POST con Bearer `CRON_SECRET`). No está en `vercel.json`. |
| UI (a crear) | `src/app/(dashboard)/dashboard/calendar/page.tsx` + `src/components/dashboard/Calendar/*` |
| Constantes (a modificar) | `src/constants/rewards.ts` — añadir `MONTHLY_MARKETING_CAP=3`, `DEFAULT_PRE_EVENT_BLACKOUT_DAYS=5` |
| Setup Twilio (a modificar) | `scripts/twilio-setup.mjs` — crear las 2 plantillas `twilio/media` |

---

## Estado actual de implementación

### ✅ Listo en esta iteración (sin tocar plantillas)
- [x] Migración SQL aplicada (00012) — tabla `restaurant_events`, columnas en `campaigns`, bucket `event-media`
- [x] `docs/DB_SCHEMA.md` actualizado
- [x] Feature doc creada (este archivo)
- [x] Constantes `MONTHLY_MARKETING_CAP`, `MONTHLY_CAP_SOURCES`, `DEFAULT_PRE_EVENT_BLACKOUT_DAYS` en [src/constants/rewards.ts](../../src/constants/rewards.ts)
- [x] Tipos `RestaurantEvent`, `CampaignSource`, etc. en [src/types/database.types.ts](../../src/types/database.types.ts)
- [x] Extensiones a [src/services/campaign.service.ts](../../src/services/campaign.service.ts): `getCustomersAtMonthlyCap`, `filterByMonthlyCap`, `getActiveBlackouts`
- [x] [src/services/calendar.service.ts](../../src/services/calendar.service.ts) — CRUD + `findCustomersForEvent` + `findDueAutoEvents`
- [x] Endpoints REST:
  - [src/app/api/dashboard/calendar/events/route.ts](../../src/app/api/dashboard/calendar/events/route.ts) — GET/POST
  - [src/app/api/dashboard/calendar/events/[id]/route.ts](../../src/app/api/dashboard/calendar/events/%5Bid%5D/route.ts) — GET/PATCH/DELETE
  - [src/app/api/dashboard/calendar/media-upload/route.ts](../../src/app/api/dashboard/calendar/media-upload/route.ts) — POST/DELETE

### ✅ Implementado (pendiente aprobación Meta)
Estos componentes están implementados pero dependen de que Meta apruebe las plantillas `twilio/media`:
- [x] Plantillas Twilio `event_template_image` y `event_template_video` vía `scripts/twilio-create-media-templates.mjs`
- [x] Soporte `mediaUrl` en `sendTemplateMessage` ([src/services/whatsapp.service.ts](../../src/services/whatsapp.service.ts))
- [x] `executeAutoEvent` en `calendar.service.ts` (el path de envío)
- [x] Cron `/api/cron/calendar-dispatch` disparado por **n8n self-hosted** (Schedule cada 15 min → HTTP POST con `Authorization: Bearer CRON_SECRET`). NO está en `vercel.json` a propósito: `*/15` + ser el 3er cron exigiría plan Vercel Pro. birthday/reactivation siguen en Vercel cron (2 crons diarios → caben en Hobby).
- [x] Dispatch manual `POST /api/dashboard/calendar/events/[id]/dispatch` + botón "Enviar ahora"/"Reintentar" en `EventDetailDrawer`
- [x] Alerta en `EventDetailDrawer` cuando falta `event_template_image_sid` / `event_template_video_sid`
- [ ] Modificaciones a crons existentes:
  - `reactivation/route.ts`: aplicar `filterByMonthlyCap` + marcar `source='reactivation'`
  - `birthday/route.ts`: marcar `source='birthday'` (NO aplicar cap)

### ⏳ Pendiente (frontend)
- [ ] Vista mensual del calendario en dashboard
- [ ] Dialog de crear/editar evento con media uploader
- [ ] `MonthlyCapMeter` y warning de blackout en `ManualCampaigns.tsx`

### 🧪 Verificación end-to-end
- [ ] Crear evento sin media (POST a `/api/dashboard/calendar/events`)
- [ ] Subir imagen → recibir URL pública → asociar al evento (PATCH)
- [ ] Listar mes (GET con `?from=&to=`)
- [ ] Cancelar evento (DELETE) → verificar status='cancelled'
- [ ] Validar que el blackout previene campañas manuales (cuando se cablee en `manual/route.ts`)

---

## Estado del pipeline de envío

El pipeline de envío está implementado. Las plantillas `twilio/media` se crean vía `scripts/twilio-create-media-templates.mjs` y el envío dinámico funciona pasando `mediaUrl` al SDK de Twilio junto con `contentSid`.

**Bloqueante actual:** Meta debe aprobar las plantillas `twilio/media` antes de que los mensajes con media sean entregables (24-72h tras envío a aprobación).

**Lo que está listo:**
- Planificar eventos con metadata y media en el calendario
- Listar/editar/cancelar desde el dashboard
- Calcular cap mensual y blackouts sobre la audiencia
- Pipeline de envío automático vía `calendar-dispatch`, disparado por n8n self-hosted (Schedule cada 15 min → HTTP POST con Bearer `CRON_SECRET`)
- Envío/reintento manual desde el dashboard (`POST .../events/[id]/dispatch`, botón "Enviar ahora")
- Alerta visual si falta la plantilla Twilio requerida según `media_type`
- Reemplazo dinámico de media URL al enviar (Twilio usa `mediaUrl` para sobreescribir la URL de ejemplo de la plantilla aprobada)

### Disparo manual / reintento

`POST /api/dashboard/calendar/events/[id]/dispatch` (auth admin) ejecuta `executeAutoEvent` bajo demanda. Solo eventos `send_mode='auto'` en estado `scheduled` (envío anticipado) o `failed` (reintento — se rearma a `scheduled` antes de ejecutar para pasar el guard de idempotencia). Es la red de seguridad si el cron falla o aún no corre.
