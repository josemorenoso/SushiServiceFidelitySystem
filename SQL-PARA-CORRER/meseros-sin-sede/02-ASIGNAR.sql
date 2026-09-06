-- ═══════════════════════════════════════════════════════════════
-- 02 · ASIGNARLE SEDE A LOS MESEROS QUE NO LA TIENEN
-- Problema B de la sesión "crear mesero por rol" — 2026-09-06
--
-- Se pega en el SQL Editor del Supabase **PRINCIPAL**. ESCRIBE.
--
-- ⚠️ HAY QUE LLENARLO A MANO. Tal como está en el repo, FALLA a propósito:
--    el bloque de VALUES trae uuids de ejemplo y la primera guarda los rechaza.
--
-- CÓMO SE USA
-- ───────────
--   1. Corré `01-DIAGNOSTICO.sql` (consulta B). Te da, por cada mesero sin
--      sede, su `staff_user_id` y la lista `nombre → uuid` de sus sedes.
--   2. Pegá acá abajo una línea por persona: (staff_user_id, location_id).
--      La decisión es del dueño, persona por persona: no hay ningún dato en la
--      base del que se pueda deducir en qué local trabaja alguien.
--   3. Corré el archivo entero. Si algo no cuadra, aborta y NO deja nada a medias
--      (todo va dentro de una transacción).
--
-- LO QUE ESTE ARCHIVO NO HACE, Y ES A PROPÓSITO
-- ─────────────────────────────────────────────
-- No tiene ningún `UPDATE ... WHERE location_id IS NULL` masivo, ni un
-- "asignale a todos la sede principal". `location_id` NULL es "sede
-- desconocida", no "la principal": rellenarlo por nosotros le atribuiría a un
-- local visitas de alguien que quizás atiende en el otro, y esa atribución es el
-- número con el que el dueño decide. Un hueco visible es barato; un dato
-- inventado que parece bueno, no.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE asignaciones (
  staff_user_id uuid NOT NULL,
  location_id   uuid NOT NULL
) ON COMMIT DROP;

-- ───────────────────────────────────────────────
-- ✏️ ACÁ VA EL TRABAJO — una línea por mesero
-- ───────────────────────────────────────────────
INSERT INTO asignaciones (staff_user_id, location_id) VALUES
  -- ('<staff_user_id de la consulta B>', '<location_id de sedes_disponibles>'),  -- Nombre del mesero
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000')  -- ← BORRAR esta línea
;

-- ───────────────────────────────────────────────
-- Guardas. Cualquiera que salte deshace TODO.
-- ───────────────────────────────────────────────
DO $$
DECLARE
  v_msg text;
BEGIN
  -- 0. El archivo sin llenar.
  IF EXISTS (
    SELECT 1 FROM asignaciones
    WHERE staff_user_id = '00000000-0000-0000-0000-000000000000'::uuid
       OR location_id   = '00000000-0000-0000-0000-000000000000'::uuid
  ) THEN
    RAISE EXCEPTION 'Todavía está el uuid de ejemplo. Llená el bloque de VALUES con los datos de 01-DIAGNOSTICO.sql.';
  END IF;

  -- 1. Nadie repetido: dos sedes para la misma persona en la misma corrida es
  --    un error de copiar y pegar, y el UPDATE aplicaría una de las dos al azar.
  SELECT string_agg(staff_user_id::text, ', ')
    INTO v_msg
    FROM (SELECT staff_user_id FROM asignaciones GROUP BY staff_user_id HAVING count(*) > 1) d;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'Estos meseros aparecen más de una vez: %', v_msg;
  END IF;

  -- 2. El mesero existe.
  SELECT string_agg(a.staff_user_id::text, ', ')
    INTO v_msg
    FROM asignaciones a
    LEFT JOIN staff_users su ON su.id = a.staff_user_id
   WHERE su.id IS NULL;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'Estos staff_user_id no existen: %', v_msg;
  END IF;

  -- 3. El mesero NO tenía sede. Este archivo es para llenar huecos, no para
  --    mudar gente: mover a alguien que ya tiene sede se hace desde el panel,
  --    donde se ve a dónde estaba y qué dispositivos arrastra.
  SELECT string_agg(su.name || ' (ya está en una sede)', ', ')
    INTO v_msg
    FROM asignaciones a
    JOIN staff_users su ON su.id = a.staff_user_id
   WHERE su.location_id IS NOT NULL;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION '%. Sacálos de la lista o movélos desde /dashboard/staff.', v_msg;
  END IF;

  -- 4. LA SEDE ES DE SU MISMA MARCA Y ESTÁ ACTIVA. La FK compuesta
  --    `(location_id, tenant_id)` de la 00044 ya impide lo primero, pero un
  --    23503 crudo no dice de quién era la sede; y una sede DESACTIVADA la FK
  --    sí la aceptaría, dejando al mesero igual de invisible que ahora.
  SELECT string_agg(su.name || ' → sede ' || a.location_id::text, E'\n')
    INTO v_msg
    FROM asignaciones a
    JOIN staff_users su ON su.id = a.staff_user_id
   WHERE NOT EXISTS (
     SELECT 1 FROM restaurant_locations rl
      WHERE rl.id        = a.location_id
        AND rl.tenant_id = su.tenant_id
        AND rl.is_active
   );
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'Sede inexistente, inactiva o DE OTRA MARCA: %', v_msg;
  END IF;

  -- 5. `staff_users_nombre_sede_key` (00046): dos "Ana" en la misma sede son
  --    indistinguibles en el selector del escáner, y la métrica de eficiencia
  --    —que es para lo que existe la pantalla— se repartiría al azar entre las
  --    dos. El motor lo rechazaría con un 23505; esto lo dice en castellano.
  SELECT string_agg(x.detalle, E'\n')
    INTO v_msg
    FROM (
      SELECT su.name || ' chocaría con otro "' || su.name || '" en esa sede' AS detalle
        FROM asignaciones a
        JOIN staff_users su ON su.id = a.staff_user_id
       WHERE EXISTS (
         SELECT 1 FROM staff_users otro
          WHERE otro.tenant_id   = su.tenant_id
            AND otro.location_id = a.location_id
            AND otro.id         <> su.id
            AND lower(trim(otro.name)) = lower(trim(su.name))
       )
      UNION ALL
      SELECT 'dos meseros llamados "' || su.name || '" van a la misma sede en esta corrida'
        FROM asignaciones a
        JOIN staff_users su ON su.id = a.staff_user_id
       GROUP BY a.location_id, lower(trim(su.name)), su.name
      HAVING count(*) > 1
    ) x;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'Nombres repetidos en una sede. Diferencialos antes ("Ana L.", "Ana P."): %', v_msg;
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- El UPDATE. `WHERE location_id IS NULL` otra vez: la guarda 3 ya lo comprobó,
-- pero el WHERE es lo que lo hace idempotente si alguien corre el archivo dos veces.
-- ───────────────────────────────────────────────
-- ⚠️ Si acá salta un 23514 hablando de dispositivos, es el trigger
--    `trg_staff_users_sede_coherente` (00044): esa persona activó en su día un
--    aparato que hoy está en OTRA sede. Un aparato es un objeto físico que está
--    donde está — hay que reasignar o revocar ese dispositivo primero, no mover
--    el mesero por encima.
UPDATE staff_users su
   SET location_id = a.location_id,
       updated_at  = now()
  FROM asignaciones a
 WHERE su.id = a.staff_user_id
   AND su.location_id IS NULL;

-- ───────────────────────────────────────────────
-- Verificación: mirá esto ANTES de aceptar el COMMIT
-- ───────────────────────────────────────────────
SELECT
  t.slug                AS marca,
  su.name               AS mesero,
  rl.name               AS sede_asignada,
  'ya aparece en el escáner de esta sede' AS efecto
FROM asignaciones a
JOIN staff_users su ON su.id = a.staff_user_id
JOIN tenants t      ON t.id = su.tenant_id
JOIN restaurant_locations rl
  ON rl.id = su.location_id
 AND rl.tenant_id = su.tenant_id
ORDER BY t.slug, su.name;

-- Lo que TODAVÍA queda invisible, para saber cuánto falta.
SELECT t.slug AS marca, count(*) AS siguen_sin_sede
FROM staff_users su
JOIN tenants t ON t.id = su.tenant_id
WHERE su.location_id IS NULL
  AND su.is_active
  AND t.is_active
GROUP BY t.slug
ORDER BY siguen_sin_sede DESC;

COMMIT;
