-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 00065: Rendimiento del equipo — escaneos y premios por mesero,
--                  clientes nuevos vs frecuentes, mesas que más piden
-- Fecha: 2026-09-11
-- Feature: docs/features/staff-activity.md
-- ═══════════════════════════════════════════════════════════════════════════
--
-- POR QUÉ UNA FUNCIÓN Y NO TRES SELECT DESDE EL SERVIDOR
-- ───────────────────────────────────────────────────────
-- Los datos ya existen desde hace meses y nadie los leía: `visits.registered_by_staff_id`
-- (00018), `visits.table_number` (00009, que hasta trae un índice «which tables sell most»),
-- `reward_redemptions.redeemed_by_staff_id` y `.table_number` (00022). Lo único que el
-- panel no puede calcular con PostgREST es «¿esta visita es la PRIMERA de este cliente?»:
-- exige mirar la historia de cada cliente fuera del rango pedido. Traer todas las visitas
-- de la marca al servidor para decidirlo es lo que esta función evita.
--
-- «NUEVO» vs «FRECUENTE» se decide por la HISTORIA, no por un flag: la visita es nueva
-- cuando no existe ninguna `visits` anterior de ese cliente en la marca. No se mira
-- `customers.total_visits` (es mutable y se recalcula) ni `customers.created_at` (un
-- cliente puede registrarse por el QR público hoy y ser escaneado por un mesero mañana:
-- para el mesero, ese es un cliente que ya venía). Límite conocido: los clientes
-- absorbidos por SQL sin filas en `visits` (Sushi Fun, 1.421) salen «nuevos» en su primer
-- escaneo. Es transitorio y honesto; no se corrige inventando visitas.
--
-- ALCANCE DE SEDE: la MISMA decisión que `applyLocationFilter()` (src/lib/location-scope.ts),
-- rama por rama, para que esta pantalla no muestre una sede que el resto del panel esconde:
--   · p_location_ids IS NULL                          → sin filtro (marca entera, incluido el cubo NULL)
--   · cardinality = 0 AND p_include_unassigned        → solo location_id IS NULL («sede desconocida»)
--   · cardinality > 0                                 → location_id = ANY(p_location_ids)
--   · cardinality = 0 AND NOT p_include_unassigned    → nada (igual que un `.in(col, [])`)
--
-- NINGÚN NULL SE ESCONDE: un escaneo sin mesero (aparato sin login) y un escaneo sin mesa
-- son filas propias del resultado (staff_id NULL / table_number NULL). Se muestran, no se
-- reparten ni se rellenan — el mismo principio que «sede desconocida».
--
-- SECURITY INVOKER a propósito: la llama el service role desde el panel, con el
-- `tenant_id` que sale del JWT (`requireLocationScope()`), nunca del navegador. Sin
-- privilegios para `anon`/`authenticated`: nada del navegador puede pedirle la marca ajena.

CREATE OR REPLACE FUNCTION staff_activity_report(
  p_tenant_id          uuid,
  p_from               timestamptz,
  p_to                 timestamptz,
  p_location_ids       uuid[]  DEFAULT NULL,
  p_include_unassigned boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
WITH escaneos AS (
  SELECT
    v.id,
    v.customer_id,
    v.registered_by_staff_id AS staff_id,
    v.table_number,
    v.created_at,
    NOT EXISTS (
      SELECT 1
        FROM visits p
       WHERE p.tenant_id   = v.tenant_id
         AND p.customer_id = v.customer_id
         AND (p.created_at < v.created_at
              OR (p.created_at = v.created_at AND p.id < v.id))
    ) AS es_nueva
  FROM visits v
  WHERE v.tenant_id = p_tenant_id
    AND v.source = 'staff_scan'
    AND v.created_at >= p_from
    AND v.created_at <= p_to
    AND (
         p_location_ids IS NULL
      OR (cardinality(p_location_ids) = 0 AND p_include_unassigned AND v.location_id IS NULL)
      OR (cardinality(p_location_ids) > 0 AND v.location_id = ANY (p_location_ids))
    )
),
entregas AS (
  SELECT
    r.id,
    r.customer_id,
    r.redeemed_by_staff_id AS staff_id,
    r.table_number
  FROM reward_redemptions r
  WHERE r.tenant_id = p_tenant_id
    AND r.redeemed_at >= p_from
    AND r.redeemed_at <= p_to
    AND (
         p_location_ids IS NULL
      OR (cardinality(p_location_ids) = 0 AND p_include_unassigned AND r.redeemed_location_id IS NULL)
      OR (cardinality(p_location_ids) > 0 AND r.redeemed_location_id = ANY (p_location_ids))
    )
),
-- UNION ALL + GROUP BY en vez de FULL JOIN: un mesero puede tener premios sin escaneos
-- (o al revés) y la llave puede ser NULL, que un FULL JOIN por igualdad no empareja.
filas_mesero AS (
  SELECT staff_id, customer_id, 1 AS escaneo, es_nueva::int AS nueva, 0 AS entrega, created_at AS escaneado_en
    FROM escaneos
  UNION ALL
  SELECT staff_id, customer_id, 0, 0, 1, NULL::timestamptz
    FROM entregas
),
por_mesero AS (
  SELECT
    f.staff_id,
    su.name      AS staff_name,
    su.is_active AS staff_is_active,
    sum(f.escaneo)                 AS scans,
    sum(f.nueva)                   AS new_customers,
    sum(f.escaneo) - sum(f.nueva)  AS returning_customers,
    count(DISTINCT f.customer_id) FILTER (WHERE f.escaneo = 1) AS distinct_customers,
    sum(f.entrega)                 AS redemptions,
    max(f.escaneado_en)            AS last_scan_at
  FROM filas_mesero f
  LEFT JOIN staff_users su
         ON su.id = f.staff_id
        AND su.tenant_id = p_tenant_id
  GROUP BY f.staff_id, su.name, su.is_active
),
filas_mesa AS (
  SELECT table_number, customer_id, 1 AS escaneo, es_nueva::int AS nueva, 0 AS entrega FROM escaneos
  UNION ALL
  SELECT table_number, customer_id, 0, 0, 1 FROM entregas
),
por_mesa AS (
  SELECT
    table_number,
    sum(escaneo)                                            AS scans,
    sum(nueva)                                              AS new_customers,
    count(DISTINCT customer_id) FILTER (WHERE escaneo = 1)  AS distinct_customers,
    sum(entrega)                                            AS redemptions
  FROM filas_mesa
  GROUP BY table_number
),
totales AS (
  SELECT
    (SELECT count(*)                       FROM escaneos)                      AS scans,
    (SELECT count(*) FILTER (WHERE es_nueva) FROM escaneos)                    AS new_customers,
    (SELECT count(*) FILTER (WHERE NOT es_nueva) FROM escaneos)                AS returning_customers,
    (SELECT count(DISTINCT customer_id)    FROM escaneos)                      AS distinct_customers,
    (SELECT count(*)                       FROM entregas)                      AS redemptions,
    (SELECT count(*) FILTER (WHERE staff_id IS NULL)     FROM escaneos)        AS scans_without_staff,
    (SELECT count(*) FILTER (WHERE table_number IS NULL) FROM escaneos)        AS scans_without_table
)
SELECT jsonb_build_object(
  'totals', (SELECT to_jsonb(t) FROM totales t),
  'by_staff', COALESCE((
    SELECT jsonb_agg(to_jsonb(m) ORDER BY m.scans DESC, m.redemptions DESC, m.staff_name NULLS LAST)
      FROM por_mesero m
  ), '[]'::jsonb),
  'by_table', COALESCE((
    SELECT jsonb_agg(to_jsonb(m) ORDER BY m.scans DESC, m.redemptions DESC, m.table_number NULLS LAST)
      FROM por_mesa m
  ), '[]'::jsonb)
);
$fn$;

COMMENT ON FUNCTION staff_activity_report(uuid, timestamptz, timestamptz, uuid[], boolean) IS
  'Rendimiento del equipo para /dashboard/rendimiento: escaneos (visits.source=staff_scan) y premios entregados (reward_redemptions) por mesero y por mesa, con nuevo/frecuente decidido por la historia del cliente. El alcance de sede calca applyLocationFilter(). NULL de mesero o mesa se devuelve como fila propia, nunca se esconde. docs/features/staff-activity.md';

-- Nace ejecutable por PUBLIC (así nace toda función): se lo quitamos. Solo el service role
-- la llama, y siempre con el tenant que le dio el JWT del panel.
REVOKE ALL ON FUNCTION staff_activity_report(uuid, timestamptz, timestamptz, uuid[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION staff_activity_report(uuid, timestamptz, timestamptz, uuid[], boolean) TO service_role;

-- El NOT EXISTS de «primera visita» busca por (customer_id, created_at). El índice de la
-- 00001 es solo por customer_id; con clientes de 30+ visitas la diferencia se nota.
CREATE INDEX IF NOT EXISTS idx_visits_customer_created
  ON visits (tenant_id, customer_id, created_at);
