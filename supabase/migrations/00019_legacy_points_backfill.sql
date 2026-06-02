-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00019: Backfill de puntos para clientes legados
-- Fecha: 2026-06-01
-- Descripción: Asigna puntos retroactivos a clientes con visitas
--   previas al sistema de puntos (total_points = 0 pero visits > 0).
--
--   Regla de negocio:
--     • 1 visita  → 75 pts  (estado "post visita 1", necesitan 2 visitas más)
--     • 2 visitas → 125 pts (estado "post visita 2", necesitan 1 visita más)
--
--   Matemáticas del algoritmo generateSmartVisitPoints:
--     75 pts  → remaining=75  > 30 → CASO 2 (limitar en v2, cruzar en v3)
--     125 pts → remaining=25  ≤ 30 → CASO 3 (cruzar 150 en próxima visita)
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Actualizar puntos — 1 visita ────────────────────────────
UPDATE customers
SET
  total_points            = 75,
  last_points_awarded_at  = COALESCE(last_visit_at, created_at)
WHERE
  total_visits  = 1
  AND total_points = 0;

-- ─── 2. Actualizar puntos — 2 visitas ───────────────────────────
UPDATE customers
SET
  total_points            = 125,
  last_points_awarded_at  = COALESCE(last_visit_at, created_at)
WHERE
  total_visits  = 2
  AND total_points = 0;

-- ─── 3. Registrar transacciones — 1 visita ──────────────────────
INSERT INTO point_transactions (customer_id, points, source, balance_after, created_at)
SELECT
  id,
  75,
  'admin_adjustment',
  75,
  COALESCE(last_visit_at, created_at)
FROM customers
WHERE
  total_visits  = 1
  AND total_points = 75
  AND last_points_awarded_at IS NOT NULL
  -- Evitar doble inserción si se corre dos veces
  AND id NOT IN (
    SELECT customer_id FROM point_transactions WHERE source = 'admin_adjustment'
  );

-- ─── 4. Registrar transacciones — 2 visitas ─────────────────────
INSERT INTO point_transactions (customer_id, points, source, balance_after, created_at)
SELECT
  id,
  125,
  'admin_adjustment',
  125,
  COALESCE(last_visit_at, created_at)
FROM customers
WHERE
  total_visits  = 2
  AND total_points = 125
  AND last_points_awarded_at IS NOT NULL
  AND id NOT IN (
    SELECT customer_id FROM point_transactions WHERE source = 'admin_adjustment'
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Verificación (ejecutar manualmente para confirmar):
--
-- SELECT total_visits, COUNT(*) as clientes, AVG(total_points)::int as pts_promedio
-- FROM customers
-- WHERE total_visits IN (1, 2)
-- GROUP BY total_visits ORDER BY total_visits;
--
-- SELECT source, COUNT(*) FROM point_transactions
-- WHERE source = 'admin_adjustment' GROUP BY source;
-- ═══════════════════════════════════════════════════════════════
