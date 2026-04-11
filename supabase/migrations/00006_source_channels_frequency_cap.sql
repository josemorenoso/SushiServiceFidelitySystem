-- Migration: Add source_channels and last_campaign_at to customers
-- Date: 2026-04-11
-- Description: Track customer origin (qr/delivery/both) and frequency capping for campaigns

-- Add source_channels column
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS source_channels text NOT NULL DEFAULT 'qr'
  CHECK (source_channels IN ('qr', 'delivery', 'both'));

-- Add last_campaign_at for frequency capping
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS last_campaign_at timestamptz DEFAULT NULL;

-- Add error_message to campaign_messages for error tracking
ALTER TABLE campaign_messages
  ADD COLUMN IF NOT EXISTS error_message text DEFAULT NULL;

-- Index for campaign queries filtering by source
CREATE INDEX IF NOT EXISTS idx_customers_source_channels ON customers (source_channels);

-- Index for frequency capping lookups
CREATE INDEX IF NOT EXISTS idx_customers_last_campaign_at ON customers (last_campaign_at)
  WHERE last_campaign_at IS NOT NULL;

-- Backfill existing customers based on their visit history
UPDATE customers c
SET source_channels = CASE
  WHEN EXISTS (
    SELECT 1 FROM visits v WHERE v.customer_id = c.id AND v.source = 'qr'
  ) AND EXISTS (
    SELECT 1 FROM visits v WHERE v.customer_id = c.id AND v.source = 'delivery'
  ) THEN 'both'
  WHEN EXISTS (
    SELECT 1 FROM visits v WHERE v.customer_id = c.id AND v.source = 'delivery'
  ) THEN 'delivery'
  ELSE 'qr'
END;
