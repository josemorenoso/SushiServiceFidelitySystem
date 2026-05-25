-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00013: Sistema de Puntos + Mystery Box
-- Fecha: 2026-05-25
-- Descripción: Migra de milestones por visita a sistema de puntos
--   acumulativos con Mystery Box, Pity Timer y Global Caps.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Nuevas columnas en customers ────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS total_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_tier text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mystery_box_low_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_points_awarded_at timestamptz DEFAULT NULL;

-- ─── 2. Tabla reward_tiers ──────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name text NOT NULL,
  point_threshold integer NOT NULL,
  safe_reward_title text NOT NULL,
  mystery_box_enabled boolean NOT NULL DEFAULT true,
  mystery_prizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_black boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: un solo umbral por valor de puntos
CREATE UNIQUE INDEX IF NOT EXISTS reward_tiers_threshold_unique
  ON reward_tiers (point_threshold) WHERE is_active = true;

-- RLS
ALTER TABLE reward_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_reward_tiers" ON reward_tiers
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "service_select_reward_tiers" ON reward_tiers
  FOR SELECT USING (true);

-- ─── 3. Tabla point_transactions ────────────────────────────
CREATE TABLE IF NOT EXISTS point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  points integer NOT NULL,
  source text NOT NULL,
  reference_id uuid DEFAULT NULL,
  balance_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_customer
  ON point_transactions (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_point_transactions_source
  ON point_transactions (source);

-- RLS
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_select_point_transactions" ON point_transactions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "service_insert_point_transactions" ON point_transactions
  FOR INSERT WITH CHECK (true);
CREATE POLICY "service_select_point_transactions" ON point_transactions
  FOR SELECT USING (true);

-- ─── 4. Tabla mystery_box_results ───────────────────────────
CREATE TABLE IF NOT EXISTS mystery_box_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES reward_tiers(id) ON DELETE CASCADE,
  choice text NOT NULL CHECK (choice IN ('safe', 'mystery')),
  prize_title text NOT NULL,
  prize_tier_index integer NOT NULL DEFAULT 0,
  was_golden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mystery_box_results_customer
  ON mystery_box_results (customer_id, created_at DESC);

-- RLS
ALTER TABLE mystery_box_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_select_mystery_box_results" ON mystery_box_results
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "service_all_mystery_box_results" ON mystery_box_results
  FOR ALL USING (true);

-- ─── 5. Tabla mystery_box_global_caps ───────────────────────
CREATE TABLE IF NOT EXISTS mystery_box_global_caps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL REFERENCES reward_tiers(id) ON DELETE CASCADE,
  prize_title text NOT NULL,
  max_per_period integer NOT NULL,
  period text NOT NULL CHECK (period IN ('week', 'month', 'total')),
  current_count integer NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_caps_tier_prize
  ON mystery_box_global_caps (tier_id, prize_title);

-- RLS
ALTER TABLE mystery_box_global_caps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_global_caps" ON mystery_box_global_caps
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "service_all_global_caps" ON mystery_box_global_caps
  FOR ALL USING (true);

-- ─── 6. Columna legacy-compat en rewards ────────────────────
ALTER TABLE rewards
  ADD COLUMN IF NOT EXISTS point_threshold integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tier_id uuid DEFAULT NULL REFERENCES reward_tiers(id) ON DELETE SET NULL;

-- ─── 7. Seed admin_settings para puntos ─────────────────────
INSERT INTO admin_settings (key, value) VALUES
  ('points_per_visit_min', '60'),
  ('points_per_visit_max', '90'),
  ('welcome_bonus_points', '0'),
  ('event_bonus_points', '25'),
  ('pity_timer_threshold', '2'),
  ('points_system_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- ─── 8. Seed reward_tiers default ───────────────────────────
INSERT INTO reward_tiers (tier_name, point_threshold, safe_reward_title, mystery_box_enabled, mystery_prizes, is_black, sort_order) VALUES
  (
    'Bronce', 150, 'Bebida gratis', true,
    '[{"title":"Bebida gratis","probability":70,"emoji":"☕"},{"title":"Postre del chef","probability":25,"emoji":"🍰"},{"title":"Plato fuerte gratis","probability":5,"emoji":"🍽️"}]'::jsonb,
    false, 1
  ),
  (
    'Plata', 350, 'Postre gratis', true,
    '[{"title":"Postre gratis","probability":65,"emoji":"🍰"},{"title":"Plato fuerte gratis","probability":25,"emoji":"🍽️"},{"title":"Experiencia especial","probability":10,"emoji":"✨"}]'::jsonb,
    false, 2
  ),
  (
    'Oro', 600, 'Plato fuerte gratis', true,
    '[{"title":"Plato fuerte gratis","probability":60,"emoji":"🍽️"},{"title":"Experiencia especial","probability":30,"emoji":"✨"},{"title":"Super premio","probability":10,"emoji":"🏆"}]'::jsonb,
    false, 3
  ),
  (
    'BLACK', 1000, 'Experiencia Chef privada', true,
    '[{"title":"Experiencia especial","probability":70,"emoji":"✨"},{"title":"Super premio","probability":30,"emoji":"🏆"}]'::jsonb,
    true, 4
  )
ON CONFLICT DO NOTHING;

-- ─── 9. Seed global caps para premios altos ─────────────────
-- Se insertan después de los tiers; usa subquery para obtener tier_id
INSERT INTO mystery_box_global_caps (tier_id, prize_title, max_per_period, period)
SELECT id, 'Plato fuerte gratis', 5, 'month'
FROM reward_tiers WHERE tier_name = 'Bronce' AND is_active = true
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00013
-- ═══════════════════════════════════════════════════════════════
