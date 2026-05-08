-- ─── Migration 00010: rewards.visit_milestone nullable ───
-- Permite crear recompensas sin milestone asociado (uso en reactivación, campañas manuales).
-- Los milestones siguen siendo únicos cuando NOT NULL (índice parcial).

ALTER TABLE rewards ALTER COLUMN visit_milestone DROP NOT NULL;

-- Índice único parcial: sólo aplica cuando visit_milestone tiene valor.
-- Esto permite múltiples rewards con visit_milestone = NULL pero impide duplicados con el mismo milestone.
DROP INDEX IF EXISTS rewards_visit_milestone_unique;
CREATE UNIQUE INDEX rewards_visit_milestone_unique
  ON rewards (visit_milestone)
  WHERE visit_milestone IS NOT NULL;
