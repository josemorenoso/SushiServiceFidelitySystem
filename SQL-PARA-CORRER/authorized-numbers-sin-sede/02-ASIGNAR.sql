-- ═══════════════════════════════════════════════════════════════
-- 02 · ASIGNARLE SEDE A LOS NÚMEROS DE DOMICILIOS QUE NO LA TIENEN
-- Preparación del día 1 de las 12 sedes — 2026-09-09
--
-- Se pega en el SQL Editor del Supabase **PRINCIPAL**. ESCRIBE.
--
-- ⚠️ HAY QUE LLENARLO A MANO. Tal como está en el repo, FALLA a propósito:
--    el bloque de VALUES trae uuids de ejemplo y la primera guarda los rechaza.
--
-- CÓMO SE USA
-- ───────────
--   1. Corré `01-DIAGNOSTICO.sql` (consulta B). Te da, por cada número sin sede, su
--      `authorized_number_id` y la lista `nombre → uuid` de las sedes de su marca.
--   2. Pegá acá abajo una línea por número: (authorized_number_id, location_id).
--   3. Corré el archivo entero. Si algo no cuadra, aborta y NO deja nada a medias
--      (todo va dentro de una transacción).
--
-- ES IDEMPOTENTE: el `UPDATE` lleva `WHERE location_id IS NULL`, así que correrlo dos
-- veces con las mismas líneas no cambia nada la segunda vez. (La guarda 3 lo habría
-- parado antes; el WHERE está para que igual sea inofensivo.)
--
-- DESDE EL 2026-09-09 ESTO SE PUEDE HACER SIN SQL
-- ───────────────────────────────────────────────
-- El panel ya escribe la sede: `/dashboard/authorized-numbers` tiene una columna «Sede»
-- con un desplegable por fila, y el formulario de alta la pide. Para unos pocos números,
-- esa es la vía. Este archivo es para muchos, o para varias marcas de una sentada.
--
-- LO QUE ESTE ARCHIVO NO HACE, Y ES A PROPÓSITO
-- ─────────────────────────────────────────────
-- No tiene ningún `UPDATE … WHERE location_id IS NULL` masivo, ni un «asignale a todos la
-- sede principal». `location_id` NULL es «sede desconocida», no «la principal»: repartir
-- por inferencia le atribuiría domicilios a un local que no los hizo, y esa atribución es
-- el número con el que el dueño decide. Un hueco visible es barato; un dato inventado que
-- parece bueno, no.
--
-- Y OJO CON EL NÚMERO REALMENTE COMPARTIDO
-- ────────────────────────────────────────
-- `authorized_numbers_phone_tenant_key UNIQUE (phone, tenant_id)` (00028) significa que un
-- celular existe UNA sola vez por marca. Si las doce sedes comparten de verdad el mismo
-- celular de operador, no hay ninguna sede correcta que ponerle: se queda en NULL y sus
-- domicilios se muestran como «sede desconocida», que es la verdad. Atribuir todo ese
-- tráfico a un local sería inventarse el dato. La salida buena es un celular por sede.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE asignaciones_an (
  authorized_number_id uuid NOT NULL,
  location_id          uuid NOT NULL
) ON COMMIT DROP;

-- ───────────────────────────────────────────────
-- ✏️ ACÁ VA EL TRABAJO — una línea por número
-- ───────────────────────────────────────────────
INSERT INTO asignaciones_an (authorized_number_id, location_id) VALUES
  -- ('<authorized_number_id de la consulta B>', '<location_id de sedes_disponibles>'),  -- Nombre del operador
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
    SELECT 1 FROM asignaciones_an
    WHERE authorized_number_id = '00000000-0000-0000-0000-000000000000'::uuid
       OR location_id          = '00000000-0000-0000-0000-000000000000'::uuid
  ) THEN
    RAISE EXCEPTION 'Todavía está el uuid de ejemplo. Llená el bloque de VALUES con los datos de 01-DIAGNOSTICO.sql.';
  END IF;

  -- 1. Nadie repetido: dos sedes para el mismo número en la misma corrida es un error de
  --    copiar y pegar, y el UPDATE aplicaría una de las dos al azar.
  SELECT string_agg(authorized_number_id::text, ', ')
    INTO v_msg
    FROM (SELECT authorized_number_id FROM asignaciones_an GROUP BY authorized_number_id HAVING count(*) > 1) d;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'Estos números aparecen más de una vez: %', v_msg;
  END IF;

  -- 2. El número existe.
  SELECT string_agg(a.authorized_number_id::text, ', ')
    INTO v_msg
    FROM asignaciones_an a
    LEFT JOIN authorized_numbers an ON an.id = a.authorized_number_id
   WHERE an.id IS NULL;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'Estos authorized_number_id no existen: %', v_msg;
  END IF;

  -- 3. El número NO tenía sede. Este archivo llena huecos, no muda gente: cambiarle la
  --    sede a uno que ya la tiene se hace desde el panel, donde se ve de dónde sale.
  SELECT string_agg(an.name || ' (' || an.phone || ', ya está en una sede)', ', ')
    INTO v_msg
    FROM asignaciones_an a
    JOIN authorized_numbers an ON an.id = a.authorized_number_id
   WHERE an.location_id IS NOT NULL;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION '%. Sacálos de la lista o cambiálos desde /dashboard/authorized-numbers.', v_msg;
  END IF;

  -- 4. LA SEDE ES DE SU MISMA MARCA Y ESTÁ ACTIVA. La FK compuesta
  --    `(location_id, tenant_id)` de la 00043 ya impide lo primero, pero un 23503 crudo no
  --    dice de quién era la sede; y una sede DESACTIVADA la FK sí la aceptaría, dejando los
  --    domicilios atribuidos a un local cerrado.
  SELECT string_agg(an.name || ' → sede ' || a.location_id::text, E'\n')
    INTO v_msg
    FROM asignaciones_an a
    JOIN authorized_numbers an ON an.id = a.authorized_number_id
   WHERE NOT EXISTS (
     SELECT 1 FROM restaurant_locations rl
      WHERE rl.id        = a.location_id
        AND rl.tenant_id = an.tenant_id
        AND rl.is_active
   );
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'Sede inexistente, inactiva o DE OTRA MARCA: %', v_msg;
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- El UPDATE. `WHERE location_id IS NULL` otra vez: la guarda 3 ya lo comprobó, pero el
-- WHERE es lo que lo hace idempotente si alguien corre el archivo dos veces.
--
-- Solo toca `location_id`. NO cambia `is_active`, ni el nombre, ni el teléfono: mover la
-- atribución de un operador no es motivo para tocarle nada más.
-- ───────────────────────────────────────────────
UPDATE authorized_numbers an
   SET location_id = a.location_id
  FROM asignaciones_an a
 WHERE an.id = a.authorized_number_id
   AND an.location_id IS NULL;

-- ───────────────────────────────────────────────
-- Verificación: mirá esto ANTES de aceptar el COMMIT
-- ───────────────────────────────────────────────
SELECT
  t.slug   AS marca,
  an.name  AS operador,
  an.phone AS celular,
  rl.name  AS sede_asignada,
  'sus próximos domicilios se atribuyen a esta sede' AS efecto
FROM asignaciones_an a
JOIN authorized_numbers an ON an.id = a.authorized_number_id
JOIN tenants t             ON t.id = an.tenant_id
JOIN restaurant_locations rl
  ON rl.id = an.location_id
 AND rl.tenant_id = an.tenant_id
ORDER BY t.slug, an.name;

-- Lo que TODAVÍA queda sin atribuir, para saber cuánto falta.
SELECT t.slug AS marca, count(*) AS siguen_sin_sede
FROM authorized_numbers an
JOIN tenants t ON t.id = an.tenant_id
WHERE an.location_id IS NULL
  AND an.is_active
  AND t.is_active
GROUP BY t.slug
ORDER BY siguen_sin_sede DESC;

-- ⚠️ Los domicilios YA REGISTRADOS no se tocan. `visits.location_id` es un hecho histórico:
--    lo que entró sin sede entró sin sede, y se sigue mostrando como «sede desconocida».
--    Backfillearlo sería inventar dónde ocurrió algo que ya pasó (D8).
COMMIT;
