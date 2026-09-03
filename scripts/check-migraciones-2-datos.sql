
-- ═══════════════════════════════════════════════════════════════
-- LAS 4 DE DATOS (no dejan rastro en el catálogo: se miran por conteo)
-- ═══════════════════════════════════════════════════════════════
SELECT '00016/00017 tiers' AS chequeo,
       count(*) FILTER (WHERE point_threshold IN (150,300,450,1000) AND is_active) AS tiers_nuevos_activos,
       count(*) FILTER (WHERE point_threshold IN (350,600)          AND is_active) AS legacy_todavia_activos
FROM reward_tiers;

SELECT '00019 backfill puntos' AS chequeo,
       count(*) AS transacciones_admin_adjustment
FROM point_transactions WHERE source = 'admin_adjustment';

SELECT '00028 seed multitenant' AS chequeo,
       (SELECT count(*) FROM tenants)                              AS tenants,
       (SELECT count(*) FROM customers WHERE tenant_id IS NULL)    AS customers_sin_tenant;

SELECT '00042 sede principal' AS chequeo,
       count(*) FILTER (WHERE is_primary) AS sedes_principales,
       count(*)                           AS sedes_totales
FROM restaurant_locations;
