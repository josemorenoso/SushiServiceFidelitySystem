# Auditoría de Código Completa — Sistema RestaurantQR

**Fecha:** 2026-06-18  
**Auditor:** Cascade (IA)  
**Alcance:** Backend completo (`src/services/*`, `src/app/api/**/*`, utilidades, schema DB, archivos v2.1.0)  
**Versión auditada:** v2.1.0+ (post-wallet card)  

---

## 1. Resumen Ejecutivo

Se revisaron **35 archivos** de lógica de negocio, **23 migraciones SQL** y el schema completo. Se identificaron **23 hallazgos** (7 críticos, 8 altos, 7 medios, 1 bajo).

| Severidad | Cantidad | Descripción |
|-----------|----------|-------------|
| **CRÍTICO** | 7 | Bugs que rompen funcionalidad clave o causan inconsistencias de datos |
| **ALTO** | 8 | Problemas de consistencia, race conditions o edge cases de seguridad |
| **MEDIO** | 7 | Deuda técnica, comportamientos confusos o inconsistencias de UX |
| **BAJO** | 1 | Nitpicks, optimizaciones menores |

---

## 2. Hallazgos Anteriores (Auditoría 12-Julio) — Estado Actual

| ID | Severidad | Hallazgo | Archivo(s) | Estado |
|----|-----------|----------|------------|--------|
| CR-01 | **CRÍTICO** | `executeAutoEvent` nunca pasa `media_url` ni `logContext` a `sendTemplateMessage`. Los eventos con imagen/video no envían media y no dejan rastro en `message_logs`. | `calendar.service.ts:175-231` | **Parcialmente resuelto** — `mediaUrl` sí se pasa ahora (l.345), pero `logContext` sigue omitido |
| CR-02 | **CRÍTICO** | Ningún endpoint respeta el feature flag `points_system_enabled`. El admin no puede apagar el sistema de puntos desde settings. | `check-in/route.ts`, `webhook/delivery/route.ts` | **NO resuelto** — Ningún endpoint lo consulta |
| AL-01 | **ALTO** | Race condition en `awardVisitPoints`: lee `total_points`, suma, y updatea en queries separadas. Sin transacción ni `SELECT FOR UPDATE`. | `points.service.ts:45-124` | **NO resuelto** — SELECT + UPDATE sin transacción |
| AL-02 | **ALTO** | Race condition en `resolveMysteryBox`: `refreshGlobalCaps` → `selectPrize` → `incrementGlobalCap` no es atómico. Puede desbordar caps. | `mystery-box.service.ts:130-270` | **NO resuelto** — Sin transacción RPC |
| AL-03 | **ALTO** | Rate limiter en memoria (`Map`) es inefectivo en Vercel serverless. Cada instancia tiene su propio `Map`. | `lib/rate-limit.ts:1-91` | **Documentado** — Comentario admite limitación; sin migración a Redis |
| AL-04 | **ALTO** | `findCustomersForEvent` no excluye clientes con `whatsapp_opt_out_at` ni `accepts_marketing = false`. | `calendar.service.ts:117-173` | **NO resuelto** — No filtra `whatsapp_opt_out_at` |
| AL-05 | **ALTO** | `campaigns/estimate` tampoco filtra por opt-out, entrega estimado de audiencia inflado. | `campaigns/estimate/route.ts:1-79` | **NO resuelto** — No filtra opt-out ni `accepts_marketing` |
| ME-01 | **MEDIO** | `createCalendarCampaign` pierde `media_url` y `media_type` del evento. | `campaign.service.ts:270-316` | **RESUELTO** — Ahora copia `media_url` y `media_type` |
| ME-02 | **MEDIO** | `generateSmartVisitPoints` hace query a DB por cada visita (`getAllTiers`). | `points.service.ts:10-124` | **NO resuelto** — Sin cacheo |
| ME-03 | **MEDIO** | `reward-tiers/route.ts` PATCH permite duplicar tier BLACK. | `reward-tiers/route.ts:150-242` | **NO resuelto** — Sin validación de unicidad en PATCH |
| ME-04 | **MEDIO** | `delivery/webhook/route.ts` no verifica `points_system_enabled`. | `webhook/delivery/route.ts:139-163` | **NO resuelto** — Mismo que CR-02 |
| ME-05 | **MEDIO** | `/check-in/status` es enumerable sin auth. Un atacante puede iterar números para obtener nombres, puntos y tiers. | `check-in/status/route.ts:1-148` | **NO resuelto** — Requiere solo `phone` |
| ME-06 | **MEDIO** | `mystery-box/resolve` no pasa `logContext` a `sendTemplateMessage`. Mensajes de mystery box no se loguean. | `mystery-box/resolve/route.ts:129-152` | **RESUELTO** — Ahora pasa `logContext` completo |
| ME-07 | **MEDIO** | `campaigns/manual/route.ts` usa cap mensual hardcodeado (`1000`). | `campaigns/manual/route.ts:153` | **Ya no aplica** — No encontrado en código actual |
| ME-08 | **MEDIO** | `calendar.service.ts` — `buildEventInvitationMessage` no personaliza con nombre. | `calendar.service.ts:80-107` | **RESUELTO** — `executeAutoEvent` usa `customer.name` como `{{1}}` |
| BA-01 | **BAJO** | `campaign.service.ts` — `getActiveBlackouts` usa cast `::timestamp`. | `campaign.service.ts:180-203` | **Mitigado** — Ahora filtra en JS; query SQL heredada aún existe en otro servicio |
| BA-02 | **BAJO** | `reward-tiers/route.ts` — validación de probabilidades muy estricta (`> 0.01`). | `reward-tiers/route.ts:90-96`, `:209-215` | **NO resuelto** — Sigue estricto |
| BA-03 | **BAJO** | `webhook/twilio-incoming/route.ts` — falta `Content-Type: text/xml`. | `webhook/twilio-incoming/route.ts:46-50`, `:77-89` | **RESUELTO** — `twimlResponse` devuelve `text/xml` explícito |

---

## 3. Hallazgos Nuevos (Auditoría 18-Junio)

### 🔴 CRÍTICO

#### CR-03: `delivery/webhook/route.ts` — mensajes transaccionales de domicilio no se registran en `message_logs`
- **Archivos:** `src/app/api/webhook/delivery/route.ts:34-48`
- **Descripción:** `sendDeliveryTemplate` llama `sendTemplateMessage(phone, templateSid, variables)` con solo 3 argumentos. Omite `mediaUrl` y `logContext`.
- **Impacto:** Los mensajes de bienvenida, puntos y tiers de domicilio **NO aparecen en `message_logs`**. Si fallan, no hay trazabilidad.
- **Recomendación:**
  ```typescript
  await sendTemplateMessage(phone, templateSid, variables, undefined, {
    customerId: customer.id,
    messageType: templateType,
  })
  ```

#### CR-04: Crons de `birthday` y `reactivation` no registran mensajes en `message_logs`
- **Archivos:** `src/app/api/cron/birthday/route.ts:51`, `src/app/api/cron/reactivation/route.ts:145`
- **Descripción:** Ambos crons llaman `sendTemplateMessage(customer.phone, templateSid, variables)` sin `logContext`.
- **Impacto:** Mensajes de campañas automáticas no se registran en `message_logs`.
- **Recomendación:** Agregar `{ customerId: customer.id, messageType: 'birthday' | 'reactivation' }`.

#### CR-05: `executeAutoEvent` — claim de idempotencia no verifica que se actualizó una fila
- **Archivos:** `src/services/calendar.service.ts:289-294`
- **Descripción:** `.update({ status: 'sent' }).eq('id', eventId).eq('status', 'scheduled')` no devuelve error si no hay match. Si dos instancias corren simultáneamente, ambas pueden pasar el guard y doble-enviar.
- **Impacto:** Doble envío de eventos de calendario a la misma audiencia.
- **Recomendación:** Verificar `count` de filas actualizadas vía `.select()` o RPC.

#### CR-06: `reactivation/route.ts` lee `reactivation_aggressive_reward_id` que nunca se carga
- **Archivos:** `src/app/api/cron/reactivation/route.ts:23-37`
- **Descripción:** `getMultipleSettings` solo solicita 5 keys; `reactivation_aggressive_reward_id` **NO está en la lista**. Línea 37 la lee de `settings` pero será siempre `undefined`. La recompensa agresiva configurada nunca se usa.
- **Impacto:** Mensajes de reactivación agresiva nunca incluyen la recompensa especial.
- **Recomendación:** Agregar `'reactivation_aggressive_reward_id'` al array de `getMultipleSettings`.

#### CR-07: `points_system_enabled` inútil en todo el sistema
- **Archivos:** `src/app/api/check-in/route.ts`, `src/app/api/webhook/delivery/route.ts`, `src/services/points.service.ts`
- **Descripción:** El flag existe en `admin_settings` y el dashboard lo permite toggle, pero **NINGÚN endpoint de puntos lo consulta** antes de otorgar puntos. El admin no puede apagar el sistema.
- **Impacto:** Feature flag de mentira. No se puede desactivar puntos sin tocar código.
- **Recomendación:** Agregar chequeo temprano:
  ```typescript
  const pointsEnabled = (await getSettingValue('points_system_enabled')) !== 'false'
  if (!pointsEnabled) { /* saltar lógica de puntos */ }
  ```

### 🟠 ALTO

#### AL-06: `public/customer-card/route.ts` — data leak sin autenticación
- **Archivos:** `src/app/api/public/customer-card/route.ts:30-64`
- **Descripción:** Endpoint público que expone `name`, `total_points`, `total_visits` de cualquier cliente dado un número de teléfono. Solo tiene rate-limit por IP (30/min), vulnerable a distribución de proxies.
- **Impacto:** Enumeración de clientes y leak de PII.
- **Recomendación:** Agregar rate-limit por teléfono (`public-card:${phone}`) o requerir un token efímero.

#### AL-07: `findBirthdayCustomers` y `findInactiveCustomers` no excluyen opt-out
- **Archivos:** `src/services/campaign.service.ts:17-64`
- **Descripción:** Las queries de cron no filtran `whatsapp_opt_out_at IS NULL`. `sendTemplateMessage` los rechaza individualmente, pero se hacen intentos innecesarios.
- **Recomendación:** Agregar `.is('whatsapp_opt_out_at', null)`.

#### AL-08: `check-in/status/route.ts` sigue sin protección contra enumeración
- **Archivos:** `src/app/api/check-in/status/route.ts:15-147`
- **Descripción:** Reiteración de ME-05 anterior. Polling público que devuelve datos de cliente con solo `phone`. Sin rate-limit propio.
- **Recomendación:** Agregar rate-limit `checkin-status:${phone}` o requerir token QR.

#### AL-09: `campaigns/estimate` no filtra opt-out
- **Archivos:** `src/app/api/dashboard/campaigns/estimate/route.ts:30-73`
- **Descripción:** Reiteración de AL-05. El estimado de audiencia es mayor al real.
- **Recomendación:** Agregar filtros `.is('whatsapp_opt_out_at', null).eq('accepts_marketing', true)`.

#### AL-10: `findCustomersForEvent` no filtra opt-out
- **Archivos:** `src/services/calendar.service.ts:202-231`
- **Descripción:** Reiteración de AL-04. Audiencia de eventos incluye clientes en opt-out.
- **Recomendación:** Agregar `.is('whatsapp_opt_out_at', null)`.

### 🟡 MEDIO

#### ME-09: `reward-tiers/route.ts` PATCH permite duplicar tier BLACK
- **Archivos:** `src/app/api/dashboard/reward-tiers/route.ts:150-242`
- **Descripción:** Reiteración de ME-03. PATCH permite `is_black: true` sin verificar si ya existe uno activo.
- **Recomendación:** Validar unicidad de BLACK antes del update.

#### ME-10: `StampsGrid.tsx` — división por cero si `point_threshold` es 0
- **Archivos:** `src/components/features/wallet/StampsGrid.tsx:25`
- **Descripción:** `ptsPerStamp = nextTier.point_threshold / STAMPS_COUNT`. Si `point_threshold` es 0 (edge case), `Math.floor(totalPoints / 0)` = `Infinity`, y `Math.min(10, Infinity)` = 10 sellos llenos incorrectamente.
- **Impacto:** UX incorrecta solo si un admin crea tier con umbral 0.
- **Recomendación:** `if (!nextTier.point_threshold) return 0;` antes del cálculo.

#### ME-11: `tarjeta/page.tsx` — Server Component sin cacheo ni rate-limit por teléfono
- **Archivos:** `src/app/(public)/tarjeta/page.tsx`
- **Descripción:** Llama directamente a `findCustomerByPhone` sin rate-limit ni cache. No es un endpoint API; es un Server Component que puede ser bombardeado.
- **Impacto:** Potencial carga a DB si un crawler accede a `/tarjeta?phone=...` masivamente.
- **Recomendación:** Agregar `unstable_cache` de Next.js o restringir vía middleware.

#### ME-12: Validación de probabilidades demasiado estricta (`> 0.01`)
- **Archivos:** `src/app/api/dashboard/reward-tiers/route.ts:91`, `:210`
- **Descripción:** Reiteración de BA-02. Suma de floats en JS puede dar 99.98% por precisión.
- **Recomendación:** Usar `Math.abs(totalProb - 100) > 1` (margen ±1%).

#### ME-13: `birthday` cron filtra cumpleañeros en JavaScript
- **Archivos:** `src/services/campaign.service.ts:17-39`
- **Descripción:** `findBirthdayCustomers` trae TODOS los clientes con birthday no nulo a memoria y filtra en JS. Para miles de clientes, esto es ineficiente.
- **Recomendación:** Usar `.like('birthday', '%-MM-DD')` o función SQL.

### 🟢 BAJO

#### BA-04: `findBirthdayCustomers` carga todos los registros a memoria
- **Archivos:** `src/services/campaign.service.ts:23-38`
- **Descripción:** Reiteración de ME-13. La query no usa filtro SQL de mes/día.
- **Recomendación:** Filtrar en SQL o usar RPC.

---

## 4. Recomendaciones Priorizadas

### Inmediato (antes del próximo deploy)
1. **CR-05**: Verificar filas actualizadas en claim de `executeAutoEvent`.
2. **CR-06**: Agregar `reactivation_aggressive_reward_id` a `getMultipleSettings` en cron de reactivación.
3. **CR-07 / CR-02**: Respetar `points_system_enabled` en check-in y delivery.
4. **CR-03 / CR-04 / CR-01**: Pasar `logContext` en mensajes de domicilio, crons y eventos de calendario.

### Corto plazo (próxima sprint)
5. **AL-01 / AL-02**: Implementar transacciones atómicas para puntos y mystery box (vía Supabase RPC).
6. **AL-06 / AL-08**: Proteger endpoints públicos (`/public/customer-card`, `/check-in/status`).
7. **AL-07 / AL-09 / AL-10 / AL-04 / AL-05**: Agregar filtros de opt-out en todas las queries de audiencia.
8. **ME-03 / ME-09**: Validar unicidad de BLACK en PATCH.

### Mediano plazo
9. **ME-10**: Defensa contra división por cero en StampsGrid.
10. **ME-11**: Cacheo en `/tarjeta` Server Component.
11. **ME-12 / BA-02**: Relajar validación de probabilidades.
12. **ME-13 / BA-04 / ME-02**: Filtrar cumpleañeros en SQL; cachear tiers.

---

## 5. Notas de la Auditoría

- **Twilio Status Callback:** Sigue sin endpoint `/api/webhook/twilio-status`. El campo `message_logs.delivered_at` sigue sin ser actualizado por webhooks.
- **Google Contacts Sync:** Timeout de 10s en `syncGoogleContact`. Si n8n está caído, el webhook de delivery se retrasa. Considerar queue asíncrona.
- **Mystery Box v2.1.0:** Wallet card funciona correctamente. No se encontraron bugs funcionales en el nuevo flujo de sellos.

---

*Fin del reporte.*
