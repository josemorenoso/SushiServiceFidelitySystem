# Feature: Campañas — Control de Tráfico Centralizado

**Última actualización:** 2026-05-09

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

## Constantes

Definidas en `src/constants/rewards.ts`:

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `REACTIVATION_DAYS` | 21 | Días de inactividad para disparar reactivación |
| `FREQUENCY_CAP_DAYS` | 7 | Mínimo de días entre mensajes por cliente |
| `RECOVERY_ZONE_START_DAYS` | 18 | Inicio zona de recuperación (días sin visita) |
| `RECOVERY_ZONE_END_DAYS` | 25 | Fin zona de recuperación (días sin visita) |

---

## Archivos Involucrados

| Archivo | Responsabilidad |
|---------|----------------|
| `src/constants/rewards.ts` | Constantes de timing |
| `src/services/campaign.service.ts` | `findInactiveCustomers()`, `updateCustomerLastCampaignAt()` |
| `src/app/api/cron/reactivation/route.ts` | Cron 21 días |
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
