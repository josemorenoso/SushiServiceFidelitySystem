# Feature: Tracking de Redención Física de Premios

> **Versión:** v2.0.0 — 2026-06-12
> **Estado:** ✅ Implementado
> **Migración:** `00022_reward_redemptions.sql`

## Objetivo
Registrar cuándo un cliente reclama **físicamente** su premio en el local (el mesero
entrega la bebida/plato). Antes el sistema sabía qué premio ganó el cliente
(`mystery_box_results`) pero NO si llegó a entregarse. Esto permite:

1. Cuadrar con el POS cuántos premios de fidelización se entregaron.
2. Analizar turnos (redenciones por hora).
3. Saber qué mesero atendió cada entrega.
4. Prevenir redenciones duplicadas del mismo premio.

## Modelo de datos

### Tabla `reward_redemptions`
Una fila por entrega física. Campos clave: `customer_id`, `mystery_box_result_id`
(opcional, link al premio elegido), `tier_id`, `prize_title` (snapshot), `source`
(`mystery_box` | `safe_choice` | `staff_override` | `campaign_reward`), `redeemed_at`,
`redeemed_by_staff_id`, `table_number`, `notes`, `pos_reference`.

- **Anti-duplicado:** índice único parcial sobre `mystery_box_result_id` (cuando no es NULL).
- **Trigger** `mark_mystery_box_redeemed`: al insertar, marca `mystery_box_results.redeemed = true`.

### Columnas nuevas en `mystery_box_results`
- `redeemed boolean DEFAULT false`
- `redeemed_at timestamptz NULL`

## Flujo

```
Cliente desbloquea tier → elige premio (safe/mystery) → mystery_box_results (redeemed=false)
  → /api/check-in/status devuelve pending_reward
Mesero escanea QR del cliente → /mesero/confirm registra visita
  → RewardAlert detecta pending_reward → "Registrar Entrega"
  → POST /api/reward-redeem → reward_redemptions + trigger marca redeemed=true
Admin → /dashboard/redemptions → cuadra con POS (filtros, heatmap, export CSV)
```

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/reward-redeem` | Staff (Bearer/X-Device-Token) | Registrar entrega física |
| GET | `/api/dashboard/redemptions` | Admin Cookie | Listado con filtros (`from`,`to`,`staff_id`,`tier_id`,`prize_title`,`page`,`limit`) |
| GET | `/api/dashboard/redemptions/summary` | Admin Cookie | Resumen agrupado por premio/hora/mesero (`from`,`to`) |

`POST /api/reward-redeem` body: `{ customer_id, mystery_box_result_id?, tier_id, prize_title, source?, table_number?, notes?, pos_reference? }`.
Códigos: `409 already_redeemed`, `400 invalid_result`, `404` cliente no encontrado.

## Archivos
- `supabase/migrations/00022_reward_redemptions.sql`
- `src/services/redemption.service.ts`
- `src/app/api/reward-redeem/route.ts`
- `src/app/api/dashboard/redemptions/route.ts`, `.../summary/route.ts`
- `src/app/(dashboard)/dashboard/redemptions/page.tsx`
- `src/components/dashboard/RedemptionsTable.tsx`, `RedemptionSummaryCards.tsx`
- `src/components/features/staff/RewardAlert.tsx`
- Wiring: `src/app/api/check-in/status/route.ts` (`pending_reward`, `customer.id`), `src/app/api/mystery-box/resolve/route.ts` + `src/services/mystery-box.service.ts` (`result_id`)

> **Nota (v2.5.0):** la página de redenciones también monta `ReviewFunnelCard` (embudo de reseñas de
> Google: mostrado → click → premio redimido). Esa métrica pertenece a **[review-flow.md](review-flow.md)**,
> no a este doc. La v2.5.1 endureció `recordRedemption` con filtro `tenant_id` en la rama de mystery box
> (ver [reward-grants.md](reward-grants.md) → *Correcciones de auditoría*).
