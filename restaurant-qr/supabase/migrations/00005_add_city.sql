-- Migración: Agregar campo city a customers
-- Fecha: 2026-04-08
-- Descripción: Campo ciudad para segmentación geográfica de campañas

ALTER TABLE customers ADD COLUMN city text DEFAULT NULL;

-- Índice para filtrar campañas por ciudad
CREATE INDEX idx_customers_city ON customers (city) WHERE city IS NOT NULL;
