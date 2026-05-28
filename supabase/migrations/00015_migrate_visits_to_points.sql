-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00015: Convertir visitas existentes a puntos
-- Fecha: 2026-05-25
-- Descripción: Migra clientes del sistema legacy (visitas) al
--   nuevo sistema de puntos. Asigna puntos proporcionales para
--   que queden cerca de su siguiente recompensa.
-- ═══════════════════════════════════════════════════════════════

-- Lógica de conversión:
--   - 1 visita  → 75-90 pts  (welcome bonus, queda a ~60-75 del umbral)
--   - 2 visitas → 120-135 pts (queda a 15-30 del umbral)
--   - 3 visitas → 150 pts (exacto en Bronce)
--   - 4 visitas → 150 + 60-90 = 210-240
--   - 5 visitas → 150 + 120-150 = 270-300
--   - 6 visitas → 350 pts (exacto en Plata)
--   - 7 visitas → 350 + 60-90 = 410-440
--   - 8 visitas → 350 + 120-150 = 470-500
--   - 9 visitas → 600 pts (exacto en Oro)
--   - Y así sucesivamente...
--
-- Fórmula: puntos = floor(visitas / 3) * umbral_tier_alcanzado
--          + puntos_parciales_para_siguiente
--
-- Donde puntos_parciales:
--   - visita sobrante 1 → 75-90 (aleatorio tipo welcome)
--   - visita sobrante 2 → 120-150 (queda corto del umbral)

DO $$
DECLARE
  rec RECORD;
  v_full_tiers INT;
  v_remaining_visits INT;
  v_points INT;
  v_tier_threshold INT;
  v_tier_name TEXT;
  v_welcome_min INT;
  v_welcome_max INT;
BEGIN
  -- Leer config de puntos (fallback 75-90)
  SELECT
    COALESCE(NULLIF((SELECT value FROM admin_settings WHERE key = 'welcome_bonus_points_min'), ''), '75')::INT,
    COALESCE(NULLIF((SELECT value FROM admin_settings WHERE key = 'welcome_bonus_points_max'), ''), '90')::INT
  INTO v_welcome_min, v_welcome_max;

  RAISE NOTICE 'Migrando clientes con welcome bonus range: %-%', v_welcome_min, v_welcome_max;

  FOR rec IN
    SELECT id, name, total_visits, phone
    FROM customers
    WHERE total_visits > 0
      AND (total_points IS NULL OR total_points = 0)
    ORDER BY total_visits DESC
  LOOP
    -- Calcular cuántos tiers completos tiene
    v_full_tiers := rec.total_visits / 3;
    v_remaining_visits := rec.total_visits % 3;

    -- Obtener el umbral del tier que corresponde
    SELECT point_threshold, tier_name
    INTO v_tier_threshold, v_tier_name
    FROM reward_tiers
    WHERE is_active = true
    ORDER BY sort_order
    OFFSET v_full_tiers - 1
    LIMIT 1;

    IF v_tier_threshold IS NULL THEN
      -- Tiene más visitas que tiers disponibles, usar último tier
      SELECT point_threshold, tier_name
      INTO v_tier_threshold, v_tier_name
      FROM reward_tiers
      WHERE is_active = true
      ORDER BY sort_order DESC
      LIMIT 1;
    END IF;

    -- Puntos base = tiers completos alcanzados
    v_points := COALESCE(v_tier_threshold, 0);

    -- Puntos parciales según visitas sobrantes
    IF v_remaining_visits = 1 THEN
      v_points := v_points + floor(random() * (v_welcome_max - v_welcome_min + 1) + v_welcome_min)::INT;
    ELSIF v_remaining_visits = 2 THEN
      -- Dejar entre 5-30 puntos cortos del siguiente umbral
      DECLARE
        v_next_threshold INT;
        v_shortfall INT;
      BEGIN
        SELECT point_threshold INTO v_next_threshold
        FROM reward_tiers
        WHERE is_active = true AND point_threshold > v_points
        ORDER BY point_threshold
        LIMIT 1;

        IF v_next_threshold IS NOT NULL THEN
          v_shortfall := floor(random() * 26 + 5)::INT; -- 5-30
          v_points := v_next_threshold - v_shortfall;
        ELSE
          v_points := v_points + floor(random() * (v_welcome_max - v_welcome_min + 1) + v_welcome_min)::INT;
        END IF;
      END;
    END IF;

    -- Actualizar customer
    UPDATE customers
    SET total_points = v_points,
        current_tier = v_tier_name
    WHERE id = rec.id;

    -- Registrar transacción de migración
    INSERT INTO point_transactions (customer_id, points, source, balance_after)
    VALUES (rec.id, v_points, 'admin_adjustment', v_points);

    RAISE NOTICE 'Migrated: % (%) — % visits → % points, tier: %',
      rec.name, rec.phone, rec.total_visits, v_points, v_tier_name;
  END LOOP;

  RAISE NOTICE 'Migración completada.';
END $$;
