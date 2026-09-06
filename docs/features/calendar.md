# Calendario Operativo de Eventos

> Estado: 🟢 Operativo. Plantilla de imagen **aprobada por Meta** en la cuenta master.
> Migración: `supabase/migrations/00012_calendar_events_and_media.sql`
> Última actualización: 2026-09-02 (los 5 crons quedan declarados en `vercel.json`; el disparo sigue en n8n hasta el despliegue con Pro)

## Fixes v2.8.3 (2026-08-21) — por qué el calendario "no hacía nada"

Tercer reporte seguido de "el calendario no funciona" (v2.8.0, v2.8.1, v2.8.3). Los dos anteriores
arreglaron piezas reales (blackout de zona horaria, plantilla con media fija) pero no la causa que
veía el dueño del negocio. Diagnóstico de esta ronda:

### 1. Callejón sin salida en el camino por defecto (causa principal)

`EventCreateDialog` arranca en **"Solo recordarme"** (`send_mode='remind'`), que nace con
`status='planned'`. Desde ese estado el evento **no se podía enviar desde ningún punto de la app**:

| Camino de envío | Filtro que lo bloqueaba |
|---|---|
| Cron `calendar-dispatch` | `findDueAutoEvents` filtra `send_mode='auto'` + `status='scheduled'` |
| `POST .../dispatch` | rechazaba `send_mode !== 'auto'` y `status='planned'` con 400 |
| `EventDetailDrawer` | `canDispatch` exigía `auto` + `scheduled\|failed` → el botón ni aparecía |
| Editar el evento | el drawer solo editaba título y descripción |

Es decir: el modo por defecto creaba eventos **imposibles de enviar**, y sin ningún mensaje que lo
dijera. El dueño creaba eventos y no pasaba nada nunca.

**Fix:** `armEventForDispatch(id, tenantId)` normaliza cualquier evento vivo a
`auto` + `scheduled_send_at=now()` + `scheduled`, y el endpoint de dispatch lo usa. "Enviar ahora"
funciona sobre `planned`, `scheduled` y `failed`, en modo `auto` o `remind`. Solo `sent` y
`cancelled` se rechazan. El drawer muestra el botón para todo evento vivo y lo deshabilita con el
motivo concreto (falta flyer / falta plantilla) en vez de esconderlo.

### 2. `updateEvent` dejaba dos estados inconsistentes

La realineación de `status` solo cubría "activar auto junto con la fecha en el mismo PATCH":

- `auto → remind` dejaba el evento en `scheduled` → **el cron lo enviaba igual**, pese a estar en
  modo recordatorio.
- Activar `auto` sin fecha en el mismo PATCH lo dejaba en `planned` → no salía nunca.

**Fix:** invariante explícita — `scheduled` si y solo si el evento queda en `auto` **con** fecha;
si no, `planned`. `sent` y `cancelled` no se recalculan.

### 3. Campañas huérfanas en cada intento fallido

Las validaciones de `media_url` / path del bucket corrían **después** de `createCalendarCampaign`,
así que cada dispatch fallido dejaba una fila `campaigns` en estado pendiente que ensuciaba métricas
y cap mensual. **Fix:** validar antes de crear la campaña.

### 4. El reintento de variables podía tirar `{{6}}`

`sendTemplateMessage` reintenta ante un 21665 soltando la variable de número **más alto** primero —
en las plantillas de evento esa es justo `{{6}}` = el path del flyer. Habría enviado la plantilla
media con la URL sin resolver a toda la audiencia. **Fix:** nueva opción
`SendTemplateOptions.keepAllVariables`, que el calendario activa: mejor fallar con el error de
Twilio a la vista que enviar un mensaje mutilado.

### 5. Path de media plano (endurecimiento)

`media-upload` generaba `_temp/<uuid>/<ts>_<archivo>.jpg` — con barras. Ese valor va en `{{6}}`,
sustituido por Twilio **dentro de una URL ya formada**, y el sample con el que Meta aprobó la
plantilla es plano (`5103017800669793459.jpg`). Ahora el path se genera plano
(`<event_id>_<ts>_<archivo>.jpg`) para que el primer envío real no dependa de si Twilio escapa la
barra al sustituir. Las URLs de eventos viejos siguen resolviendo igual.

### Estado verificado contra Twilio (2026-08-21)

| Cuenta | Plantilla de evento | Estado |
|---|---|---|
| Master `ACa5e3…dd7d` (Sushi Service) | `HXf30219c2b31c3ac1c6eb751d2b4ea689` `evento_imagen__sushi_service_barra__v2` | ✅ **approved**, `twilio/media`, `{{6}}` dinámico, sample descargable (HTTP 206) |
| Master | `HX76a64b…` (v1), `combomundial`, `dia_del_sushi` | ⚠️ approved pero **media FIJA** — no usar como `event_template_image_sid` |
| Master | `evento_video_sushi_service_barra` | ❌ rejected por Meta |
| Sub `ACf551…8576` (Don Alirio) | — | ❌ **ninguna plantilla `twilio/media`**: 10 plantillas, todas `twilio/text` |

**Acción pendiente del admin:** pegar `HXf30219c2b31c3ac1c6eb751d2b4ea689` en
Dashboard → Ajustes → `event_template_image_sid` del tenant Sushi Service, y crear la plantilla
equivalente en la subcuenta de cada tenant nuevo (ver `docs/PLANTILLAS.md` §12).

## Estado real verificado v2.8.1 (2026-08-10)

Diagnóstico E2E contra Twilio y Vercel (no solo código):

- ❌ La plantilla de imagen aprobada (`HX76a64b...`) tenía **media fija** (sample de gstatic, sin
  `{{6}}`): habría enviado siempre la imagen de muestra. La de video estaba **rechazada** por Meta.
- ✅ Fix: plantilla dinámica nueva **`HXf30219c2b31c3ac1c6eb751d2b4ea689`**
  (`evento_imagen__sushi_service_barra__v2`) creada y en revisión de Meta.
  **Acción pendiente del admin: al aprobarse, pegarla en Ajustes → `event_template_image_sid`.**
  Video: subir un MP4 de muestra al bucket y correr el script sin `SKIP_VIDEO`.
- ✅ n8n dispara `/api/cron/calendar-dispatch` cada 15 min con HTTP 200 (verificado en logs de Vercel).
- ✅ Guard nuevo `assertEventTemplateUsable` en `executeAutoEvent`: verifica contra la Content API que
  la plantilla resuelta sea `twilio/media`, con `{{6}}` dinámico y aprobada — si no, el evento queda
  `failed` con mensaje explícito en vez de enviar la imagen equivocada a toda la audiencia.
- `scripts/twilio-create-media-templates.mjs` acepta `SKIP_VIDEO=1` (crear solo imagen) y
  `TEMPLATE_SUFFIX` (nombres únicos exigidos por Meta).

## Fixes v2.8.0 (2026-08-10)

- **Zona horaria en `createEvent`**: la validación `scheduled_send_at ≤ event_date` comparaba contra
  fin de día **UTC** (`T23:59:59Z`), rechazando envíos programados el mismo día del evento después de
  las 6:59pm hora Colombia. Ahora compara contra fin de día América/Bogotá (`T23:59:59-05:00`).
- **Eventos `auto` sin media bloqueados en la UI**: `executeAutoEvent` siempre falló para eventos sin
  imagen/video (las plantillas son `twilio/media`), pero la UI dejaba crearlos y el error aparecía
  recién en el dispatch. `EventCreateDialog` ahora exige el flyer en modo auto (con explicación) y
  `EventDetailDrawer` muestra alerta destructiva en eventos existentes sin media.
- **Límite de imagen del uploader**: el cliente rechazaba >5 MB aunque el servidor acepta hasta 30 MB
  y comprime a JPEG ≤5MB (sharp, límite WhatsApp). Alineado a 30 MB.
- **Audiencia estimada en vivo** en `EventCreateDialog` (reusa `/api/dashboard/campaigns/estimate`
  con city/minVisits/maxVisits, debounce 500ms).
- Copys actualizados: banner del calendario y descripción del dialog ya no hablan de "cuando Meta
  apruebe las plantillas" como bloqueante genérico; explican los requisitos reales (flyer + SID de
  plantilla de eventos en Ajustes).

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
- Recovery Zone (18-25 días con los días por defecto; se deriva de los del tenant) sigue activa para reservar clientes al cron de reactivación

### ¿Por qué birthday queda fuera?

El cumpleaños es un evento de relación, no de marketing táctico. Su dedup nativo de 365 días impide spam. Excluirlo del cap evita que un cliente que ya recibió 3 campañas el mes pierda su felicitación — eso sería worst-of-both-worlds (saturación previa + experiencia rota en su día especial).

---

## Pipeline de envío con media (Twilio Content API)

1. Admin sube imagen/video al endpoint `/api/dashboard/calendar/media-upload` → Supabase Storage (bucket `event-media`) → URL pública.
2. URL pública se persiste en `restaurant_events.media_url`.
3. Al ejecutar el evento, `calendar.service.executeAutoEvent`:
   - Resuelve `content_sid` desde `admin_settings` según `media_type`
   - Crea una `campaigns` row con `source='calendar'` + `media_url` + `media_type`
   - Deriva el **path dentro del bucket** desde `media_url` (`eventMediaPathFromPublicUrl`)
   - Llama a `sendTemplateMessage(phone, contentSid, vars, tenant, logCtx)` con ese path en `{{6}}`
4. Twilio compone la URL final (`<bucket público>/{{6}}`), la descarga Meta y entrega.

### Cómo funciona la media dinámica (leer antes de tocar esto)

Dos reglas de Twilio gobiernan el diseño:

1. **Las variables en la URL de media solo se admiten después del dominio** ([docs](https://www.twilio.com/docs/content/twilio-media)). Por eso la plantilla se aprueba con el dominio del bucket como parte **fija** y `{{6}}` como el **path** del archivo:

   ```
   media: ["https://<proj>.supabase.co/storage/v1/object/public/event-media/{{6}}"]
   → al enviar: contentVariables { "6": "<event_id>/1720000000_flyer.jpg" }
   ```

2. **`ContentSid` y `MediaUrl` son mutuamente excluyentes.** Al enviar una plantilla, la media sale **únicamente** de la definición de la plantilla. Pasar `mediaUrl` junto a `contentSid` **no sobreescribe nada** — por eso `sendTemplateMessage` ya no acepta ese parámetro.

Meta aprueba la **estructura** (header de imagen + texto), no la imagen concreta: una vez aprobada, cada evento manda su propia imagen **sin re-aprobar nada**.

**Consecuencia operativa:** todo media de evento debe vivir en el bucket `event-media` (el dominio de la plantilla es fijo). Si `media_url` apunta a otro dominio, `executeAutoEvent` falla con un error explícito en vez de enviar la imagen equivocada. Un evento `auto` sin media también falla: la plantilla es `twilio/media` y exige el archivo.

**Bloqueante operativo:** las 2 plantillas (`event_template_image`, `event_template_video`) deben estar aprobadas por Meta antes de poder usarse en producción (24-72h de espera tras submit). El sample de `{{6}}` debe ser un archivo **real y público** del bucket: Meta lo descarga para revisar la plantilla.

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
| Cron | `src/app/api/cron/calendar-dispatch/route.ts` — declarado en `vercel.json` (`*/15 * * * *`) desde 2026-09-02, pero hoy lo sigue disparando el workflow de n8n "Cron Calendario" (Schedule cada 15 min → HTTP POST con Bearer `CRON_SECRET`). El disparo por Vercel empieza cuando se despliegue a producción con plan Pro activo; en ese mismo movimiento se apaga el Schedule Trigger de n8n (los dos activos a la vez = doble disparo). |
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
- [x] Cron `/api/cron/calendar-dispatch`, disparado hoy por **n8n self-hosted** (workflow "Cron Calendario": Schedule cada 15 min → HTTP POST con `Authorization: Bearer CRON_SECRET`).
  - *Histórico (hasta 2026-09-01):* estaba fuera de `vercel.json` porque una cadencia `*/15` exige plan Vercel Pro — el límite de Hobby es la **frecuencia** (1 vez al día), no la cantidad de crons (100 por proyecto en todos los planes). Y birthday/reactivation tampoco "seguían en Vercel cron": se habían movido a n8n el 2026-07-05 y `vercel.json` quedó en `{"crons": []}`.
  - **2026-09-02:** `vercel.json` vuelve a declarar los 5 crons y `calendar-dispatch` entra con `*/15 * * * *` — calco 1:1 de la expresión que ya tenía su Schedule Trigger en n8n, cero cambio de cadencia y cero cambio de código de negocio (el endpoint ya exportaba GET, y Vercel Cron invoca GET mandando solo `Authorization: Bearer $CRON_SECRET`, justo lo que valida `validateCronSecret()`). El commit es **local y sin push**: con plan Hobby una expresión `*/15` hace fallar el build, así que el disparo efectivo empieza cuando se despliegue a producción con Pro activo. En ese mismo movimiento se apagan los 5 Schedule Trigger de n8n — un cron en `vercel.json` y su trigger de n8n activos a la vez = **doble disparo**. Se apagan los triggers, no el VPS: n8n sigue sirviendo domicilios.
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

El pipeline de envío está implementado. Las plantillas `twilio/media` se crean vía `scripts/twilio-create-media-templates.mjs` con la media dinámica cableada como `<dominio fijo del bucket>/{{6}}`, y el envío pasa el path del archivo en `contentVariables.{{6}}`.

**Bloqueante actual:** Meta debe aprobar las plantillas `twilio/media` antes de que los mensajes con media sean entregables (24-72h tras envío a aprobación).

**Lo que está listo:**
- Planificar eventos con metadata y media en el calendario
- Listar/editar/cancelar desde el dashboard
- Calcular cap mensual y blackouts sobre la audiencia
- Pipeline de envío automático vía `calendar-dispatch`, hoy disparado por n8n self-hosted ("Cron Calendario": Schedule cada 15 min → HTTP POST con Bearer `CRON_SECRET`) y ya declarado en `vercel.json` (`*/15 * * * *`); el disparo por Vercel empieza al desplegar a producción con Pro activo, y ahí se apaga el trigger de n8n
- Envío/reintento manual desde el dashboard (`POST .../events/[id]/dispatch`, botón "Enviar ahora")
- Alerta visual si falta la plantilla Twilio requerida según `media_type`
- Reemplazo dinámico de media URL al enviar (Twilio usa `mediaUrl` para sobreescribir la URL de ejemplo de la plantilla aprobada)

### Disparo manual / reintento

`POST /api/dashboard/calendar/events/[id]/dispatch` (auth admin) ejecuta `executeAutoEvent` bajo demanda. Solo eventos `send_mode='auto'` en estado `scheduled` (envío anticipado) o `failed` (reintento — se rearma a `scheduled` antes de ejecutar para pasar el guard de idempotencia). Es la red de seguridad si el cron falla o aún no corre.
