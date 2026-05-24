# Feature: Dashboard Analytics Expansion (v0.17.0)

> **Fecha:** 2026-04-15
> **Estado:** ✅ Implementado
> **Versión:** 0.17.0

---

## Descripción

Expansión del dashboard con 4 nuevas métricas/gráficas y una página de ajustes:

1. **Tasa de Reactivación** — ¿cuántos clientes volvieron tras campaña de reactivación?
2. **ROI Estimado** — Retorno estimado del sistema (reactivados × ticket promedio)
3. **Heatmap Día × Hora** — Mapa de calor de visitas por día y hora
4. **Canal de Adquisición por Mes** — QR vs Domicilio por mes (stacked bar)
5. **Página de Ajustes** — Configuración del ticket promedio para ROI

---

## Componentes creados

| Componente | Archivo | Descripción |
|-----------|---------|-------------|
| `ReactivationRateChart` | `src/components/dashboard/ReactivationRateChart.tsx` | ComposedChart: barras (enviados/volvieron) + línea (tasa %). Badge promedio global |
| `ROICard` | `src/components/dashboard/ROICard.tsx` | Card con ROI en COP, link a ajustes, detalle de reactivados y ticket |
| `VisitHeatmap` | `src/components/dashboard/VisitHeatmap.tsx` | Heatmap CSS 7×15 (8am-10pm), tooltips, leyenda de colores |
| `AcquisitionChannelChart` | `src/components/dashboard/AcquisitionChannelChart.tsx` | BarChart stacked: QR vs Domicilio por mes |

---

## Página de Ajustes

- **Ruta:** `/dashboard/settings`
- **Archivo:** `src/app/(dashboard)/dashboard/settings/page.tsx`
- **Funcionalidad:** Input numérico para ticket promedio (COP), guardar via API
- **Navegación:** Agregado en sidebar y header mobile

---

## API

### GET /api/dashboard/settings
Retorna todas las configuraciones como objeto `{ key: value }`.

### PUT /api/dashboard/settings
Body: `{ "key": "avg_ticket", "value": "35000" }`
Respuesta: `{ "message": "Configuración actualizada", "key": "...", "value": "..." }`

---

## Base de datos

- **Tabla:** `admin_settings` (key-value)
- **Migración:** `supabase/migrations/00007_admin_settings.sql`
- **Seed:** `avg_ticket = 35000`
- Ver `docs/DB_SCHEMA.md` para detalle completo

---

## Lógica de cálculo (dashboard.service.ts)

### Heatmap
- Fuente: `visits.created_at` (últimos 6 meses)
- Cálculo: Agrupa por `dayOfWeek` (0-6) × `hour` (0-23)

### Canal de Adquisición
- Fuente: `customers.source_channels` + `customers.created_at`
- Cálculo: Agrupa nuevos clientes por mes, clasifica por source (qr/delivery/both)

### Tasa de Reactivación
- Fuente: `campaigns` (type='reactivation') + `campaign_messages` + `visits`
- Cálculo: Por cada campaña ejecutada, identifica clientes contactados. Busca si visitaron en los 7 días siguientes.
- Agregación: Por mes (últimos 6 meses), `sent` = unique customers contactados, `returned` = unique customers que volvieron

### ROI Estimado
- Fórmula: `reactivatedThisMonth × avgTicket`
- `avgTicket` viene de `admin_settings.avg_ticket`

---

## Demo mode

`lib/demo-analytics.ts` genera datos demo realistas:
- Heatmap con picos en horarios de almuerzo/cena y fines de semana
- Acquisition con tendencia creciente
- Reactivation con tasas variables (0-60%)
- ROI basado en último mes demo con ticket $35,000 COP
