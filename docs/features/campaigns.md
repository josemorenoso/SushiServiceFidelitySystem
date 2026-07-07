# Feature: Campañas — Control de Tráfico Centralizado

**Última actualización:** 2026-07-05 (v1.4.1 — disparo unificado en n8n para birthday/reactivation)

---

## Nota de infraestructura (v1.4.1 — 2026-07-05)

`/api/cron/birthday` y `/api/cron/reactivation` (lógica de negocio sin cambios, ver más abajo)
eran invocados EN PARALELO por dos disparadores: el cron nativo de Vercel (`vercel.json`) y un
workflow n8n del mismo nombre. El código ya los des-duplicaba vía `hasRecentCampaignMessage()`
(el cliente final nunca recibió mensajes repetidos), pero se decidió dejar **n8n como único
disparador** para simplificar operación y eliminar el riesgo latente de carrera. `vercel.json`
quedó con `"crons": []`. Detalle completo → `docs/04-deployment.md` §2 y §5.

---

## Objetivo

Coordinar el envío de mensajes entre campañas automáticas (cumpleaños, reactivación) y manuales (masivas) para evitar que un cliente reciba múltiples mensajes en periodos cortos, preservando la experiencia y la efectividad del flujo de fidelización.

---

## Arquitectura: Tres Reglas de Validación

### Regla 1 — Master Cap Global (7 días)

**Campo:** `customers.last_campaign_at` (timestamptz)

**Principio:** Ningún cliente puede recibir un mensaje (manual ni automático) si fue contactado hace menos de `FREQUENCY_CAP_DAYS` días.

**Implementación:**
- `findInactiveCustomers()` filtra por `last_campaign_at IS NULL OR last_campaign_at < now - 7d`
- `manual/route.ts` filtra en JS post-query con el mismo criterio
- `estimate/route.ts` aplica el mismo filtro en la query SQL (count exacto)
- **Todo envío exitoso** actualiza `customers.last_campaign_at` via `updateCustomerLastCampaignAt()`

---

### Regla 2 — Jerarquía de Mensajes / Zona de Recuperación

**Principio:** Los clientes que llevan entre `RECOVERY_ZONE_START_DAYS` (18) y `RECOVERY_ZONE_END_DAYS` (25) días sin visitar están en el radar del cron de reactivación (que dispara al día 21). Las campañas manuales los excluyen automáticamente para no interrumpir ese flujo personalizado de mayor conversión.

**Zona de Recuperación:** `last_visit_at < now - 18d AND last_visit_at >= now - 25d`

**Implementación:**
- `manual/route.ts` excluye clientes en la zona de recuperación y reporta `totalSkippedRecoveryZone`
- `estimate/route.ts` aplica el mismo filtro para que el estimado sea exacto
- Los crons automáticos NO aplican esta restricción (ellos son la razón de la zona)

---

### Regla 3 — Reset por Interacción (ya existente)

**Principio:** Si un cliente hace check-in o pide domicilio, `last_visit_at` se actualiza y lo excluye automáticamente del cron de reactivación.

**Implementación:** Ya funciona. `findInactiveCustomers()` filtra `last_visit_at < now - 21d`, por lo que cualquier visita reciente los saca del pool automáticamente.

---

## Flujo de Toma de Decisiones (por tipo de campaña)

### Cron Reactivación (`/api/cron/reactivation`)
```
findInactiveCustomers()
  → last_visit_at < 21 días atrás           ✅ filtro existente
  → accepts_marketing = true                 ✅ filtro existente
  → last_campaign_at IS NULL                 ✅ NUEVO
    OR last_campaign_at < 7 días atrás       ✅ NUEVO
  
Por cada cliente:
  → hasRecentCampaignMessage(type=reactivation, 30d)  [dedup de tipo]
  → sendTemplateMessage()
  → recordCampaignMessage()

Al final del loop:
  → updateCustomerLastCampaignAt(sentCustomerIds)     ✅ NUEVO
```

### Cron Cumpleaños (`/api/cron/birthday`)
```
findBirthdayCustomers()
  → cumpleaños hoy                           ✅ filtro existente
  → accepts_marketing = true                 ✅ filtro existente
  (NO aplica frequency cap — cumpleaños tiene prioridad absoluta)

Por cada cliente:
  → hasRecentCampaignMessage(type=birthday, 365d)     [dedup anual]
  → sendTemplateMessage()
  → recordCampaignMessage()

Al final del loop:
  → updateCustomerLastCampaignAt(sentCustomerIds)     ✅ NUEVO
```

### Campaña Manual (`/api/dashboard/campaigns/manual`)
```
Fetch clientes con filtros (ciudad, visitas, edad, canal)
  → accepts_marketing = true

Post-filtro en JS:
  1. Frequency Cap: excluir si last_campaign_at < 7 días atrás
  2. Recovery Zone: excluir si last_visit_at entre 18 y 25 días atrás

sendTemplateMessage() en batches de 10
  → bulk update last_campaign_at para enviados
  → bulk insert campaign_messages

Response incluye:
  - totalSent
  - totalFailed
  - totalSkippedFrequencyCap
  - totalSkippedRecoveryZone   ✅ NUEVO
```

---

## Constantes y Settings Configurables

Definidas en `src/constants/rewards.ts` (fallbacks):

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `REACTIVATION_DAYS` | 21 | Fallback: días para reactivación suave |
| `REACTIVATION_AGGRESSIVE_DAYS` | 25 | Fallback: días para reactivación agresiva |
| `FREQUENCY_CAP_DAYS` | 7 | Mínimo de días entre mensajes por cliente |
| `RECOVERY_ZONE_START_DAYS` | 18 | Inicio zona de recuperación (días sin visita) |
| `RECOVERY_ZONE_END_DAYS` | 25 | Fin zona de recuperación (días sin visita) |

### Días de Reactivación Configurables (v1.4.0 — Req 6A)

Los días de reactivación ya NO están fijos: se leen de `admin_settings` vía
`getReactivationDaysConfig()` en `src/services/settings.service.ts`:

| Setting key | Default (fallback) | Editable en |
|-------------|--------------------|-------------|
| `reactivation_soft_days` | 21 | Dashboard > Ajustes > Reactivación de Clientes |
| `reactivation_aggressive_days` | 25 | Dashboard > Ajustes > Reactivación de Clientes |

Reglas de validación:
- Ambos deben ser enteros positivos; si no, se usa el fallback.
- La agresiva debe ser > suave; si no, el backend la fuerza a `suave + 4` y la UI bloquea el guardado.
- `findInactiveCustomers(reactivationDays)` ahora acepta el valor como parámetro (default `REACTIVATION_DAYS`).

### Rediseño UI del Módulo de Campañas (v1.4.0 — Req 5)

`src/app/(dashboard)/dashboard/campaigns/page.tsx`:
- **KPIs del mes**: campañas ejecutadas, mensajes enviados, última ejecución.
- **Badge de estado real** por campaña automática: `Activa` (verde, plantilla configurada) o `Sin plantilla` (rojo) según `admin_settings`.
- **Preview real del mensaje**: muestra el body de la plantilla Twilio configurada (fetch a `/api/dashboard/templates`), también en el dialog de confirmación antes de ejecutar.
- **Días dinámicos**: la descripción de Reactivación muestra los días configurados (no hardcoded).
- **Botón "Ejecutar Ahora" deshabilitado** si no hay plantilla configurada.
- **Historial traducido**: estados en español (Finalizada/En curso/Borrador/Fallida).
- Separación explícita Automáticas / Manuales / Historial vía tabs (ya existía, se mantiene).
- Link directo a Ajustes para configurar plantillas y días.

---

## Archivos Involucrados

| Archivo | Responsabilidad |
|---------|----------------|
| `src/constants/rewards.ts` | Constantes de timing |
| `src/services/campaign.service.ts` | `findInactiveCustomers()`, `updateCustomerLastCampaignAt()` |
| `src/services/settings.service.ts` | `getReactivationDaysConfig()` — días configurables |
| `src/app/api/cron/reactivation/route.ts` | Cron reactivación (días configurables) |
| `src/app/(dashboard)/dashboard/settings/page.tsx` | UI de configuración de días |
| `src/app/(dashboard)/dashboard/campaigns/page.tsx` | UI rediseñada del módulo |
| `src/app/api/cron/birthday/route.ts` | Cron cumpleaños |
| `src/app/api/dashboard/campaigns/manual/route.ts` | Campañas manuales |
| `src/app/api/dashboard/campaigns/estimate/route.ts` | Estimado de audiencia |

---

## Tabla de Decisión de Envío

| Situación del cliente | Cron Reactivación | Cron Cumpleaños | Campaña Manual |
|-----------------------|:-----------------:|:---------------:|:--------------:|
| Visitó hace < 18 días | ❌ no inactivo | según cumpleaños | ✅ elegible |
| Visitó hace 18-25 días (Recovery Zone) | ✅ elegible* | según cumpleaños | ❌ excluido |
| Visitó hace > 25 días | ✅ elegible* | según cumpleaños | ✅ elegible |
| Recibió mensaje hace < 7 días | ❌ excluido | ❌ excluido** | ❌ excluido |
| `accepts_marketing = false` | ❌ excluido | ❌ excluido | ❌ excluido |

*Sujeto al frequency cap de 7 días
**El cron de cumpleaños usa dedup por `campaign_messages` (365 días), no por `last_campaign_at`
