-- Migration: add table_number to visits for QR mesa tracking
-- Also add suspicious_flag for anti-fraud detection

ALTER TABLE visits ADD COLUMN IF NOT EXISTS table_number INTEGER;

COMMENT ON COLUMN visits.table_number IS 'Número de mesa desde donde se escaneó el QR (null = sin mesa / delivery)';

-- Index for analytics: which tables sell most
CREATE INDEX IF NOT EXISTS idx_visits_table_number ON visits (table_number) WHERE table_number IS NOT NULL;
