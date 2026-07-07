-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00029: Dominio por tenant (resolución por host)
-- Fecha: 2026-07-05
-- Descripción: Permite resolver el tenant a partir del dominio (host header) en vez
--   de un /slug/ en la URL. Preserva los QR impresos de cada restaurante, que apuntan
--   a su propio subdominio (clubsushiservice.constelarys.com / clubsushifun.constelarys.com).
-- Riesgo: NULO — columna nueva nullable + índice único parcial. (Requiere 00024/00028.)
-- Orden: correr DESPUÉS de 00028 (el tenant Sushi Service ya debe existir).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS domain text;

-- Único por dominio, pero permite múltiples tenants sin dominio asignado (NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_domain
  ON tenants(domain) WHERE domain IS NOT NULL;

-- Asignar el dominio de Sushi Service (tenant sembrado en 00028).
UPDATE tenants
   SET domain = 'clubsushiservice.constelarys.com'
 WHERE slug = 'sushi-service'
   AND domain IS NULL;

-- Verificación
DO $$
DECLARE
  v_domain text;
BEGIN
  SELECT domain INTO v_domain FROM tenants WHERE slug = 'sushi-service';
  IF v_domain IS NULL THEN
    RAISE NOTICE 'ADVERTENCIA: Sushi Service no tiene dominio asignado (¿corriste 00028 antes?)';
  ELSE
    RAISE NOTICE 'OK: Sushi Service domain = %', v_domain;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00029
-- Nota: el dominio de Sushi Fun (clubsushifun.constelarys.com) se asigna al insertar
--   su fila de tenant en el runbook del corte (Fase B, paso 4).
-- ═══════════════════════════════════════════════════════════════
