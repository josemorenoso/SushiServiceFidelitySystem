-- Migration: 00011_rewards_black_tier
-- Adds is_black boolean to rewards table to mark the top-tier "BLACK" milestone reward.
-- Only one BLACK reward should exist per instance (enforced at application level).

ALTER TABLE rewards
  ADD COLUMN IF NOT EXISTS is_black BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN rewards.is_black IS
  'TRUE = esta recompensa marca el nivel BLACK (máximo tier). Da descuentos de por vida u otro beneficio permanente. Solo debe existir una recompensa black activa.';
