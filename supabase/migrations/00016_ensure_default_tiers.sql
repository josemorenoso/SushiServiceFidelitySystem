-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00016: Asegurar tiers default activos
-- Fecha: 2026-05-30
-- Descripción: Inserta/actualiza los 4 tiers default del sistema
--   de puntos (Bronce, Plata, Oro, BLACK) garantizando que existan
--   y estén activos con sus premios y umbrales correctos.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO reward_tiers (tier_name, point_threshold, safe_reward_title, mystery_box_enabled, mystery_prizes, is_black, sort_order, is_active) VALUES
  (
    'Bronce', 150, 'Bebida gratis', true,
    '[{"title":"Bebida gratis","probability":70,"emoji":"☕"},{"title":"Postre del chef","probability":25,"emoji":"🍰"},{"title":"Plato fuerte gratis","probability":5,"emoji":"🍽️"}]'::jsonb,
    false, 1, true
  ),
  (
    'Plata', 350, 'Postre gratis', true,
    '[{"title":"Postre gratis","probability":65,"emoji":"🍰"},{"title":"Plato fuerte gratis","probability":25,"emoji":"🍽️"},{"title":"Experiencia especial","probability":10,"emoji":"✨"}]'::jsonb,
    false, 2, true
  ),
  (
    'Oro', 600, 'Plato fuerte gratis', true,
    '[{"title":"Plato fuerte gratis","probability":60,"emoji":"🍽️"},{"title":"Experiencia especial","probability":30,"emoji":"✨"},{"title":"Super premio","probability":10,"emoji":"🏆"}]'::jsonb,
    false, 3, true
  ),
  (
    'BLACK', 1000, 'Experiencia Chef privada', true,
    '[{"title":"Experiencia especial","probability":70,"emoji":"✨"},{"title":"Super premio","probability":30,"emoji":"🏆"}]'::jsonb,
    true, 4, true
  )
ON CONFLICT (point_threshold) WHERE is_active = true
DO UPDATE SET
  tier_name = EXCLUDED.tier_name,
  safe_reward_title = EXCLUDED.safe_reward_title,
  mystery_box_enabled = EXCLUDED.mystery_box_enabled,
  mystery_prizes = EXCLUDED.mystery_prizes,
  is_black = EXCLUDED.is_black,
  sort_order = EXCLUDED.sort_order,
  is_active = true;
