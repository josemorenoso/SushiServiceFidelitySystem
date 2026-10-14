-- =====================================================================
-- Tepuy: ¿de qué sede es cada dato?  —  SOLO LECTURA (no cambia nada)
--
-- Dónde: Supabase del PRODUCTO (el proyecto que tiene la tabla `tenants`;
--        el del AIOS es otro). SQL Editor → New query → pegar TODO este
--        archivo → Run.
-- Qué traerle al comandante: la tabla entera que sale (captura o copiar).
--
-- Para qué: saber si a los clientes, las visitas, los meseros y los premios
-- de Tepuy el sistema les sabe la sede. Si un dato no la sabe, la pantalla
-- nueva lo va a mostrar como «sin sede» (no se adivina ni se reparte).
--
-- Escrita por el comandante el 2026-10-14 para
-- `docs/prompts/2026-10-14-sedes-separadas.md`.
-- =====================================================================
WITH marca AS (
  SELECT id FROM tenants WHERE slug = 'clubtepuy'
),
sedes AS (
  SELECT l.id, l.name, l.domain, l.is_active
  FROM restaurant_locations l JOIN marca m ON l.tenant_id = m.id
),
visitas AS (
  SELECT v.customer_id, v.location_id, v.location_source, v.location_conflict
  FROM visits v JOIN marca m ON v.tenant_id = m.id
)
-- 0. Si sale 0, el slug no es 'clubtepuy': avisarle al comandante.
SELECT 0 AS n, 'Marca encontrada (tiene que ser 1)' AS que, '—' AS sede,
       (SELECT count(*) FROM marca) AS cuantos
UNION ALL
-- 1. Las sedes: nombre · dominio, y 1 = activa
SELECT 1, 'Sede (1 = activa)', s.name || ' · ' || coalesce(s.domain, 'SIN DOMINIO'), s.is_active::int
FROM sedes s
UNION ALL
-- 2. Dónde se registró cada cliente (customers.origin_location_id)
SELECT 2, 'Clientes registrados en', coalesce(s.name, 'SIN SEDE'), count(*)
FROM customers c JOIN marca m ON c.tenant_id = m.id
LEFT JOIN sedes s ON s.id = c.origin_location_id
GROUP BY coalesce(s.name, 'SIN SEDE')
UNION ALL
-- 3. Las visitas, por sede y por cómo se supo la sede
SELECT 3, 'Visitas en', coalesce(s.name, 'SIN SEDE') || ' · por ' || coalesce(v.location_source, '—'), count(*)
FROM visitas v LEFT JOIN sedes s ON s.id = v.location_id
GROUP BY coalesce(s.name, 'SIN SEDE') || ' · por ' || coalesce(v.location_source, '—')
UNION ALL
-- 4. Visitas donde el QR del cliente decía OTRA sede (ganó el mesero)
SELECT 4, 'Visitas con el QR de otra sede', coalesce(s.name, 'SIN SEDE'), count(*)
FROM visitas v LEFT JOIN sedes s ON s.id = v.location_id
WHERE v.location_conflict = true
GROUP BY coalesce(s.name, 'SIN SEDE')
UNION ALL
-- 5. Cuántos clientes distintos fueron a cada sede
SELECT 5, 'Clientes que fueron a', coalesce(s.name, 'SIN SEDE'), count(DISTINCT v.customer_id)
FROM visitas v LEFT JOIN sedes s ON s.id = v.location_id
GROUP BY coalesce(s.name, 'SIN SEDE')
UNION ALL
-- 6. Clientes que ya usan las dos sedes
SELECT 6, 'Clientes que fueron a las DOS sedes', '—', count(*)
FROM (
  SELECT customer_id FROM visitas
  WHERE location_id IS NOT NULL
  GROUP BY customer_id
  HAVING count(DISTINCT location_id) >= 2
) x
UNION ALL
-- 7. Meseros activos: su sede, «rota entre sedes» o sin sede asignada
SELECT 7, 'Meseros activos',
       CASE WHEN su.works_any_location THEN 'ROTA ENTRE SEDES' ELSE coalesce(s.name, 'SIN SEDE ASIGNADA') END,
       count(*)
FROM staff_users su JOIN marca m ON su.tenant_id = m.id
LEFT JOIN sedes s ON s.id = su.location_id
WHERE su.is_active
GROUP BY CASE WHEN su.works_any_location THEN 'ROTA ENTRE SEDES' ELSE coalesce(s.name, 'SIN SEDE ASIGNADA') END
UNION ALL
-- 8. Aparatos (celulares) de mesero activados, por sede
SELECT 8, 'Aparatos de mesero', coalesce(s.name, 'SIN SEDE'), count(*)
FROM staff_devices d JOIN marca m ON d.tenant_id = m.id
LEFT JOIN sedes s ON s.id = d.location_id
GROUP BY coalesce(s.name, 'SIN SEDE')
UNION ALL
-- 9. Premios entregados, por sede (hoy se espera TODO en «SIN SEDE»: nadie la escribe todavía)
SELECT 9, 'Premios entregados en', coalesce(s.name, 'SIN SEDE'), count(*)
FROM reward_redemptions r JOIN marca m ON r.tenant_id = m.id
LEFT JOIN sedes s ON s.id = r.redeemed_location_id
GROUP BY coalesce(s.name, 'SIN SEDE')
ORDER BY 1, 3;
