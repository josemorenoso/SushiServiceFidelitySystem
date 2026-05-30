-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00017: Limpiar tiers legacy duplicados
-- Fecha: 2026-05-30
-- Descripción: Desactiva tiers duplicados creados por la
--   migración 00016 al usar ON CONFLICT (point_threshold).
--   Los umbrales viejos (350, 600) no conflictaron con los
--   nuevos (150, 300, 450), generando duplicados.
--   Esta migración desactiva los tiers legacy dejando solo:
--   Plata 150, Oro 300, Diamante 450, BLACK 1000.
-- ═══════════════════════════════════════════════════════════════

-- Desactivar tiers legacy con umbrales obsoletos del sistema anterior
UPDATE reward_tiers
SET is_active = false
WHERE is_active = true
  AND point_threshold IN (350, 600);

-- Asegurar que los 4 tiers correctos estén activos y ordenados
UPDATE reward_tiers
SET is_active = true,
    sort_order = CASE point_threshold
      WHEN 150 THEN 1
      WHEN 300 THEN 2
      WHEN 450 THEN 3
      WHEN 1000 THEN 4
    END
WHERE point_threshold IN (150, 300, 450, 1000);
