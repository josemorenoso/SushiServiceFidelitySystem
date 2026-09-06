-- ═══════════════════════════════════════════════════════════════
-- CONTEO-ORIGEN · Cuánto hay hoy en el Supabase de SUSHI FUN
-- Absorción de Sushi Fun al despliegue principal — 2026-09-06
--
-- ⚠️ ESTE ES EL ÚNICO ARCHIVO QUE SE PEGA EN EL SUPABASE **DE SUSHI FUN**.
--    Todos los demás van en el PRINCIPAL. Solo LEE: no escribe nada.
--
-- PARA QUÉ SIRVE
-- ──────────────
-- Los archivos 02–07 llevan los datos CONGELADOS en la foto del 2026-09-06 01:41
-- (hora del servidor). Sushi Fun sigue VIVO: cada check-in que entre desde
-- entonces suma filas que esos archivos NO traen.
--
-- Correr esto ANTES del corte y comparar con la columna "foto" de abajo:
--   · Si TODO coincide  → los archivos están al día, adelante.
--   · Si algo creció    → hay que REGENERAR los archivos antes de cargar, o esas
--                         filas nuevas se pierden en el traslado. Se regeneran en
--                         un minuto con scripts/gen-sushi-fun-dump.mjs.
--
-- El 08 del destino verifica contra ESTOS mismos números, así que si acá creció
-- algo y no se regenera, el 08 va a fallar — a propósito.
-- ═══════════════════════════════════════════════════════════════

SELECT
  e.tabla,
  e.foto           AS "foto 2026-09-06",
  x.hoy            AS "hoy",
  CASE
    WHEN x.hoy = e.foto THEN 'igual'
    WHEN x.hoy > e.foto THEN 'CRECIO +' || (x.hoy - e.foto) || ' -> REGENERAR'
    ELSE 'BAJO ' || (x.hoy - e.foto) || ' -> revisar, no deberia'
  END              AS estado
FROM (VALUES
  ('reward_tiers',              6),
  ('rewards',                   3),
  ('mystery_box_global_caps',   1),
  ('admin_settings',           24),
  ('authorized_numbers',        2),
  ('staff_users',               1),
  ('staff_devices',             4),
  ('imported_contacts',         0),
  ('customers',               250),
  ('campaigns',                93),
  ('campaign_rewards',          0),
  ('visits',                  268),
  ('point_transactions',      268),
  ('mystery_box_results',       0),
  ('reward_grants',             0),
  ('reward_redemptions',        0),
  ('review_events',            68),
  ('campaign_messages',       237),
  ('message_logs',            193),
  ('restaurant_events',         0)
) AS e(tabla, foto)
JOIN LATERAL (
  SELECT CASE e.tabla
    WHEN 'reward_tiers'            THEN (SELECT count(*) FROM reward_tiers)
    WHEN 'rewards'                 THEN (SELECT count(*) FROM rewards)
    WHEN 'mystery_box_global_caps' THEN (SELECT count(*) FROM mystery_box_global_caps)
    WHEN 'admin_settings'          THEN (SELECT count(*) FROM admin_settings)
    WHEN 'authorized_numbers'      THEN (SELECT count(*) FROM authorized_numbers)
    WHEN 'staff_users'             THEN (SELECT count(*) FROM staff_users)
    WHEN 'staff_devices'           THEN (SELECT count(*) FROM staff_devices)
    WHEN 'imported_contacts'       THEN (SELECT count(*) FROM imported_contacts)
    WHEN 'customers'               THEN (SELECT count(*) FROM customers)
    WHEN 'campaigns'               THEN (SELECT count(*) FROM campaigns)
    WHEN 'campaign_rewards'        THEN (SELECT count(*) FROM campaign_rewards)
    WHEN 'visits'                  THEN (SELECT count(*) FROM visits)
    WHEN 'point_transactions'      THEN (SELECT count(*) FROM point_transactions)
    WHEN 'mystery_box_results'     THEN (SELECT count(*) FROM mystery_box_results)
    WHEN 'reward_grants'           THEN (SELECT count(*) FROM reward_grants)
    WHEN 'reward_redemptions'      THEN (SELECT count(*) FROM reward_redemptions)
    WHEN 'review_events'           THEN (SELECT count(*) FROM review_events)
    WHEN 'campaign_messages'       THEN (SELECT count(*) FROM campaign_messages)
    WHEN 'message_logs'            THEN (SELECT count(*) FROM message_logs)
    WHEN 'restaurant_events'       THEN (SELECT count(*) FROM restaurant_events)
  END AS hoy
) AS x ON true
ORDER BY e.tabla;

-- ───────────────────────────────────────────────────────────────
-- Los cinco números que pide el encargo, en una sola línea
-- ───────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM customers)          AS clientes,
  (SELECT count(*) FROM visits)             AS visitas,
  (SELECT count(*) FROM point_transactions) AS movimientos_de_puntos,
  (SELECT coalesce(sum(total_points), 0) FROM customers) AS puntos_vivos_en_clientes,
  (SELECT count(*) FROM reward_grants)      AS premios_otorgados,
  (SELECT count(*) FROM reward_redemptions) AS premios_redimidos;

-- ───────────────────────────────────────────────────────────────
-- La última fila que entró — dice si el restaurante sigue operando
-- ───────────────────────────────────────────────────────────────
SELECT 'ultimo cliente' AS que, max(created_at) AS cuando FROM customers
UNION ALL SELECT 'ultima visita',  max(created_at) FROM visits
UNION ALL SELECT 'ultimo mensaje', max(created_at) FROM message_logs
ORDER BY cuando DESC NULLS LAST;

-- ───────────────────────────────────────────────────────────────
-- Sanidad: acá solo puede haber UN tenant, y es Sushi Fun
-- ───────────────────────────────────────────────────────────────
SELECT id, slug, name, domain, is_active FROM tenants;
-- Esperado: exactamente 1 fila, id = b2c3d4e5-f6a7-8901-bcde-f23456789012
