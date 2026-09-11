# Rendimiento del equipo (escaneos, premios y mesas)
> **Estado:** viva en el código (2026-09-11), **00065 sin aplicar** · **Ruta:** `/dashboard/rendimiento` · **Migración:** `00065_staff_activity_report.sql`

## Qué hace y para quién
Le muestra al dueño, en un solo apartado del panel, cómo va cada mesero y cada mesa: cuántos clientes
escaneó cada uno, cuántos de esos eran **nuevos** (se registraron ahí) y cuántos **frecuentes** (ya venían),
cuántos premios entregó, y qué mesas concentran más escaneos y más premios. Todo por rango de fechas y por sede.

## Cómo funciona
- Un escaneo es una fila de `visits` con `source='staff_scan'`; el mesero es `registered_by_staff_id` y la mesa
  `table_number` (las dos ya se escriben desde `/mesero/confirm`). Un premio entregado es una fila de
  `reward_redemptions` (`redeemed_by_staff_id`, `table_number`) — lo mismo que ya ve Recompensas › Redenciones.
- **Nuevo vs frecuente se decide por la historia del cliente, no por un flag**: la visita es «nueva» cuando es la
  PRIMERA de ese cliente en la marca (no existe ninguna `visits` anterior); si no, es «frecuente».
- Una función SQL, `staff_activity_report()`, hace las tres agregaciones en una ida (por mesero · por mesa ·
  totales). Recibe el alcance de sede con la MISMA semántica que `applyLocationFilter()`; la usa
  `src/services/staff-activity.service.ts` detrás de `GET /api/dashboard/staff-activity`.
- `StaffActivityPanel.tsx` dibuja: tarjetas de totales, tabla por mesero (escaneos · nuevos · frecuentes · premios)
  y tabla por mesa (escaneos · clientes distintos · premios). Rango Hoy / 7 días / 30 días / a medida (hora Bogotá).

## Decisiones y qué NO hacer
- **Ningún NULL se esconde.** Escaneo sin mesero (aparato sin login) → fila «Sin mesero»; sin mesa → «Sin mesa».
  Igual que «sede desconocida»: se muestra, no se rellena ni se reparte.
- **Ningún peso.** «Mesas que más piden» es por escaneos y premios, nunca por consumo: no tenemos el ticket.
- Los premios por mesero NO se mueven de Redenciones: acá se repiten al lado de los escaneos para ver la tasa.
- Un mesero inactivo o borrado sigue apareciendo con su histórico; el nombre viene de `staff_users` por LEFT JOIN.
- La función es `SECURITY INVOKER`, solo `service_role`: el `tenant_id` viene del JWT del panel, no del cliente.

## Cómo se verifica
`tests/db/staff-activity.test.ts` contra Postgres real: nuevo/frecuente por historia, NULL visibles, sede aplicada,
otra marca invisible. En el navegador: `/dashboard/rendimiento` con Sushi Service, comparar la columna «Premios»
con Recompensas › Redenciones del mismo rango. **La 00065 se aplica ANTES de desplegar** (sin ella la ruta responde 503).
