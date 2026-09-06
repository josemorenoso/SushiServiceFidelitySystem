-- ═══════════════════════════════════════════════════════════════
-- 01 · QUIÉNES SON LOS INVISIBLES — meseros sin sede, por marca
-- Problema B de la sesión "crear mesero por rol" — 2026-09-06
--
-- Se pega en el SQL Editor del Supabase **PRINCIPAL**.
-- NO ESCRIBE NADA. Es solo para mirar. Corrélo las veces que quieras.
--
-- QUÉ PROBLEMA MIRA
-- ─────────────────
-- Desde §19 el escáner es DEL LOCAL: el aparato se activa una vez, se le asigna
-- una sede, y la lista de "¿quién atiende?" sale filtrada por ESA sede. Un
-- mesero con `location_id` NULL no entra en ninguna de esas listas — o sea que
-- existe en el panel y no existe en la operación. Todo el parque actual está así.
--
-- POR QUÉ NO HAY UN UPDATE MASIVO EN ESTA CARPETA
-- ───────────────────────────────────────────────
-- Porque no hay dato del que deducir la sede. `location_id` NULL significa
-- "sede desconocida", no "sede principal": adivinarla le atribuiría a un local
-- las visitas que registre una persona que a lo mejor trabaja en el otro, y esa
-- atribución es justamente el número que el dueño usa para decidir. Se asignan
-- de a una, con `02-ASIGNAR.sql` o con el lápiz de /dashboard/staff.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- A. El resumen: cuánto duele en cada marca
-- ───────────────────────────────────────────────
-- Los tres conteos van como subconsultas escalares a propósito. Con un LEFT JOIN
-- a `restaurant_locations`, cada mesero se multiplicaría por la cantidad de
-- sedes de su marca y los totales saldrían inflados sin que se note.
SELECT *
FROM (
  SELECT
    t.slug AS marca,
    (SELECT count(*) FROM staff_users su
      WHERE su.tenant_id = t.id AND su.is_active AND su.location_id IS NULL) AS sin_sede,
    (SELECT count(*) FROM staff_users su
      WHERE su.tenant_id = t.id AND su.is_active)                            AS total_activos,
    (SELECT count(*) FROM restaurant_locations rl
      WHERE rl.tenant_id = t.id AND rl.is_active)                            AS sedes_activas
  FROM tenants t
  WHERE t.is_active
) r
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN r.sedes_activas = 0 THEN 'BLOQUEADO: la marca no tiene sedes activas — hay que crear una primero'
    WHEN r.sin_sede = 0      THEN 'ok'
    WHEN r.sedes_activas = 1 THEN 'una sola sede: la elección es obvia, pero igual se confirma a mano'
    ELSE 'hay que elegir sede POR PERSONA: nadie puede deducirla'
  END AS que_hacer
) q
ORDER BY r.sin_sede DESC, r.marca;

-- ───────────────────────────────────────────────
-- B. La lista de trabajo: una fila por mesero sin sede,
--    con las sedes entre las que hay que elegir
-- ───────────────────────────────────────────────
-- `sedes_disponibles` viene como texto 'nombre → uuid' para poder copiar el uuid
-- directo al 02 sin volver a consultar nada.
--
-- `pista_dispositivo` es lo ÚNICO parecido a una evidencia que existe: si esa
-- persona activó un aparato en su día y ese aparato tiene sede, es un indicio
-- fuerte. NO es una respuesta: desde §19 los aparatos son del local y
-- `staff_devices.staff_user_id` se escribe NULL, así que solo las filas viejas
-- lo tienen. Sirve para ordenar el trabajo, no para automatizarlo.
SELECT
  t.slug                                   AS marca,
  su.name                                  AS mesero,
  su.role                                  AS rol,
  coalesce(su.phone, '—')                  AS celular,
  su.id                                    AS staff_user_id,
  su.created_at::date                      AS creado,
  (
    SELECT string_agg(rl.name || ' → ' || rl.id, chr(10)
                      ORDER BY rl.is_primary DESC, rl.sort_order, rl.name)
    FROM restaurant_locations rl
    WHERE rl.tenant_id = t.id AND rl.is_active
  )                                        AS sedes_disponibles,
  (
    SELECT string_agg(DISTINCT rl2.name, ', ')
    FROM staff_devices sd
    JOIN restaurant_locations rl2
      ON rl2.id = sd.location_id
     AND rl2.tenant_id = sd.tenant_id
    WHERE sd.staff_user_id = su.id
  )                                        AS pista_dispositivo
FROM staff_users su
JOIN tenants t ON t.id = su.tenant_id
WHERE su.location_id IS NULL
  AND su.is_active
  AND t.is_active
ORDER BY t.slug, su.name;

-- ───────────────────────────────────────────────
-- C. Las marcas que ni siquiera pueden empezar
-- ───────────────────────────────────────────────
-- Si algo sale acá, el 02 no sirve todavía para esa marca: primero hay que
-- crearle una sede (hoy solo lo hace el wizard del AIOS — es la deuda D17).
SELECT t.slug AS marca_sin_sedes_activas
FROM tenants t
WHERE t.is_active
  AND NOT EXISTS (
    SELECT 1 FROM restaurant_locations rl
    WHERE rl.tenant_id = t.id AND rl.is_active
  )
ORDER BY t.slug;
