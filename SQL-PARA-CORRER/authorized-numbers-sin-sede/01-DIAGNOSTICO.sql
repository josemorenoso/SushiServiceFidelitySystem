-- ═══════════════════════════════════════════════════════════════
-- 01 · NÚMEROS DE DOMICILIOS SIN SEDE — DIAGNÓSTICO
-- Preparación del día 1 de las 12 sedes — 2026-09-09
--
-- Se pega en el SQL Editor del Supabase **PRINCIPAL**. NO ESCRIBE NADA.
--
-- QUÉ PASA
-- ────────
-- `authorized_numbers.location_id` existe desde la 00043 y hasta el 2026-09-09 el panel
-- NUNCA lo escribía: se insertaba `{phone, name, is_active, tenant_id}` y nada más. Por eso
-- todo el parque vivo está en NULL.
--
-- Esa columna es la señal AUTENTICADA de la que sale la sede de un pedido de domicilio
-- (`resolveDeliveryLocation()` en `src/services/delivery.service.ts`): el celular que manda
-- el cuadro se contrasta contra esta tabla y de ahí sale el `location_id` de la orden. Con
-- NULL el pedido entra igual —nunca se pierde un domicilio por esto— pero queda en «sede
-- desconocida» y no hay forma de saber a qué local iba.
--
-- Desde el 2026-09-09 el panel ya la escribe (al crear y desde la columna «Sede» del
-- listado). Este archivo es para lo que YA existía.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- A. El resumen por marca: cuántos hay y cuántos no atribuyen nada
-- ───────────────────────────────────────────────
SELECT
  t.slug                                                        AS marca,
  count(*)                                                      AS numeros_activos,
  count(*) FILTER (WHERE an.location_id IS NULL)                AS sin_sede,
  (SELECT count(*) FROM restaurant_locations rl
    WHERE rl.tenant_id = t.id AND rl.is_active)                 AS sedes_activas,
  CASE
    WHEN (SELECT count(*) FROM restaurant_locations rl
           WHERE rl.tenant_id = t.id AND rl.is_active) < 2
      THEN 'una sola sede: NULL y «la sede» son el mismo local, no urge'
    WHEN count(*) FILTER (WHERE an.location_id IS NULL) > 0
      THEN '⚠️ con 2+ sedes, esos domicilios caen todos al mismo cubo'
    ELSE 'ok'
  END                                                           AS lectura
FROM authorized_numbers an
JOIN tenants t ON t.id = an.tenant_id
WHERE an.is_active
  AND t.is_active
GROUP BY t.id, t.slug
ORDER BY sin_sede DESC, marca;

-- ───────────────────────────────────────────────
-- B. La lista de trabajo: un renglón por número, con las sedes entre las que elegir
--
--    De aquí salen los dos uuid de cada línea del `02`.
-- ───────────────────────────────────────────────
SELECT
  t.slug                AS marca,
  an.name               AS operador,
  an.phone              AS celular,
  an.id                 AS authorized_number_id,   -- ← primera columna del 02
  (
    SELECT string_agg(rl.name || ' → ' || rl.id::text, E'\n' ORDER BY rl.is_primary DESC, rl.name)
      FROM restaurant_locations rl
     WHERE rl.tenant_id = an.tenant_id
       AND rl.is_active
  )                     AS sedes_disponibles       -- ← segunda columna del 02
FROM authorized_numbers an
JOIN tenants t ON t.id = an.tenant_id
WHERE an.location_id IS NULL
  AND an.is_active
  AND t.is_active
  -- Solo las marcas donde la sede cambia algo. Con una sola sede el dato no aporta.
  AND (SELECT count(*) FROM restaurant_locations rl
        WHERE rl.tenant_id = an.tenant_id AND rl.is_active) >= 2
ORDER BY t.slug, an.name;

-- ───────────────────────────────────────────────
-- C. Marcas con 2+ sedes y NINGÚN número autorizado
--
--    No es un error de datos, es un hueco de operación: esa marca no puede registrar
--    domicilios por WhatsApp desde ningún celular.
-- ───────────────────────────────────────────────
SELECT
  t.slug AS marca,
  (SELECT count(*) FROM restaurant_locations rl
    WHERE rl.tenant_id = t.id AND rl.is_active) AS sedes_activas,
  'sin números autorizados: no entra ningún domicilio por WhatsApp' AS lectura
FROM tenants t
WHERE t.is_active
  AND (SELECT count(*) FROM restaurant_locations rl
        WHERE rl.tenant_id = t.id AND rl.is_active) >= 2
  AND NOT EXISTS (
    SELECT 1 FROM authorized_numbers an
     WHERE an.tenant_id = t.id AND an.is_active
  )
ORDER BY t.slug;

-- ───────────────────────────────────────────────
-- D. Lo que hoy queda sin atribuir, para saber cuánto duele
--
--    Domicilios de los últimos 30 días que entraron sin sede. Si esto es alto y la marca
--    tiene varias sedes, cada número de ese panel está repartido a ojo.
--
--    ⚠️ El filtro es `v.source = 'delivery'`, NO `v.location_source = 'authorized_number'`.
--    La pareja `location_id` + `location_source` va COMPLETA o no va (lo impone el CHECK
--    `visits_location_pareja_check`, ver `visit.service.ts`): en un domicilio sin sede
--    `location_source` también queda NULL, así que filtrar por él escondería EXACTAMENTE
--    las filas que se quieren contar y esta consulta siempre diría cero.
-- ───────────────────────────────────────────────
SELECT
  t.slug                                              AS marca,
  count(*)                                            AS domicilios_30d,
  count(*) FILTER (WHERE v.location_id IS NULL)       AS sin_sede,
  round(100.0 * count(*) FILTER (WHERE v.location_id IS NULL) / NULLIF(count(*), 0), 1) AS pct_sin_sede
FROM visits v
JOIN tenants t ON t.id = v.tenant_id
WHERE v.created_at >= now() - interval '30 days'
  AND v.source = 'delivery'
  AND t.is_active
GROUP BY t.slug
ORDER BY sin_sede DESC;
