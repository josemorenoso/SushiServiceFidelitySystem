-- Migration: accepts_marketing
-- Campo para registrar si el cliente aceptó recibir comunicaciones de marketing

ALTER TABLE customers ADD COLUMN IF NOT EXISTS accepts_marketing BOOLEAN NOT NULL DEFAULT true;

-- Backfill: todos los clientes existentes se asumen como aceptados
-- (ya estaban en el sistema antes de que existiera el checkbox)
UPDATE customers SET accepts_marketing = true WHERE accepts_marketing IS NULL;

COMMENT ON COLUMN customers.accepts_marketing IS 'Si el cliente aceptó recibir comunicaciones de marketing por WhatsApp';
