-- ═══════════════════════════════════════════════════════════════
-- Migration 00062: meseros ROTATIVOS — «rota entre sedes» como estado explícito
-- Fecha: 2026-09-11
-- Decisión del dueño: 2026-09-11 (revisa D11 para el caso rotativo; ver abajo)
-- Feature: docs/features/staff-qr-scan.md § «Meseros rotativos»
--          docs/features/multi-sede.md §3.ter (D11)
--
-- ⚠️ SE ESCRIBE Y SE DEJA SIN APLICAR. Aplicarla en producción LO DECIDE EL DUEÑO.
--    Va ANTES de desplegar el código que la usa: `/api/staff/waiters` la lee en su
--    filtro, y sin la columna PostgREST responde 42703 → la ruta contesta 503 y el
--    escáner se queda sin lista en TODAS las sedes de TODAS las marcas.
--
-- EL PROBLEMA
-- -----------
-- D11 (dueño, 2026-09-02): «cada mesero es de cada sede, no se juntan jamás». Se
-- construyó así: `staff_users.location_id` es la sede del mesero, la lista del escáner
-- se filtra por la sede del APARATO (`/api/staff/waiters`) y, desde la 00046, un mesero
-- sin celular tiene que tener sede — así que el panel la pide sí o sí.
--
-- El 2026-09-11 el dueño reporta que LA MAYORÍA de los meseros son rotativos: un mismo
-- mesero atiende en varias sedes según el turno. Con el modelo actual eso no se puede
-- expresar: la sede es una sola, y `location_id` NULL significa «sin asignar» y deja al
-- mesero fuera de todas las listas.
--
-- LA SALIDA (decisión del dueño, 2026-09-11, entre tres): un ESTADO EXPLÍCITO
-- ----------------------------------------------------------------------------
-- `staff_users.works_any_location = true` = «rota entre sedes». Un rotativo:
--
--   · tiene `location_id` NULL, y lo exige un CHECK (bloque 2). No es un capricho: la
--     sede del mesero es la vía 1 de la precedencia del §3.1, LA MÁS FUERTE. Si un
--     rotativo conservara una sede «de casa», cada visita que registre en OTRA sede se
--     atribuiría a la de casa, y el reporte por sede mentiría. Con NULL no aporta señal,
--     la precedencia cae al APARATO (vía 2) y la visita queda donde ocurrió;
--   · aparece en la lista de TODOS los aparatos de la marca, además de los meseros de
--     la sede de cada aparato. La lista sigue siendo corta —sede + rotativos—, que era
--     la razón de producto de D11 (*«buscarse entre 40 a la hora de entregar premio»*);
--   · NO reinterpreta el NULL. `location_id` NULL + `works_any_location` false sigue
--     siendo «sin sede asignada», se sigue mostrando como problema y sigue sin
--     backfillearse. Un rotativo lo es porque alguien lo marcó, nunca por defecto.
--
-- LO QUE D11 CONSERVA: una fila = una persona; un hecho se atribuye a UNA sede (la del
-- aparato). Lo que D11 pierde: la afirmación «cada mesero es de cada sede». Está escrito
-- en `multi-sede.md` §3.ter para que nadie lo lea como una regresión.
--
-- LAS TRES LLAVES DE IDENTIDAD, AHORA CUATRO (19.f)
-- -------------------------------------------------
-- La 00046 dejó tres piezas que valen JUNTAS: el UNIQUE de teléfono, el CHECK «sin
-- teléfono → con sede» y el UNIQUE parcial (marca, sede, nombre). Un rotativo sin
-- teléfono y sin sede quedaría FUERA de las tres —la trampa de los NULL, otra vez—, así
-- que esta migración añade la cuarta:
--
--   · el CHECK pasa a «teléfono O sede O rotativo» (bloque 3);
--   · un UNIQUE parcial (marca, nombre) entre los rotativos (bloque 4);
--   · y un trigger que evita el CRUCE (bloque 5): «Ana» rotativa y «Ana» de Laureles
--     saldrían las dos en la lista de Laureles, indistinguibles. Ningún índice cubre
--     ese caso porque las dos filas viven en índices parciales distintos.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, A PROPÓSITO
-- ------------------------------------------
-- · NO BACKFILLEA NADA. `works_any_location` nace en false para todas las filas. Marcar
--   a alguien como rotativo es una acción del dueño en el panel.
-- · NO toca `staff_users_phone_tenant_key`, ni `staff_users_nombre_sede_key`, ni los
--   triggers de la 00044. Un rotativo con celular sigue cubierto por el UNIQUE de teléfono.
-- · NO toca `staff_devices`. El aparato sigue siendo del LOCAL y sigue necesitando su
--   sede: `/api/staff/waiters` sigue fallando CERRADO (409) sin ella, porque la sede de
--   la visita sale de ahí.
--
-- DEPENDENCIAS: 00044 (`staff_users.location_id`), 00046 (`staff_users_identidad_minima`).
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 0. Pre-vuelo. Aborta antes de tocar nada.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.staff_users'::regclass
       AND conname  = 'staff_users_identidad_minima'
  ) THEN
    RAISE EXCEPTION
      '00062 aborta: falta staff_users_identidad_minima (migración 00046). '
      'Aplica primero la 00044 y la 00046.';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────
-- 1. La columna
-- ─────────────────────────────────────────────────────────────
ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS works_any_location boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────
-- 2. Un rotativo NO tiene sede
-- ─────────────────────────────────────────────────────────────
-- Ver el encabezado: con sede, la vía 1 de la precedencia le atribuiría a la sede «de
-- casa» las visitas que registre en cualquier otra. Los dos estados son excluyentes.
ALTER TABLE staff_users
  DROP CONSTRAINT IF EXISTS staff_users_rotativo_sin_sede;
ALTER TABLE staff_users
  ADD CONSTRAINT staff_users_rotativo_sin_sede
  CHECK (NOT works_any_location OR location_id IS NULL);

-- ─────────────────────────────────────────────────────────────
-- 3. 19.f — la identidad mínima admite la cuarta llave
-- ─────────────────────────────────────────────────────────────
-- Un CHECK no se altera: se suelta y se vuelve a crear con el MISMO nombre, que es el que
-- `/api/dashboard/staff` busca en el mensaje del 23514 para traducirlo.
ALTER TABLE staff_users
  DROP CONSTRAINT IF EXISTS staff_users_identidad_minima;
ALTER TABLE staff_users
  ADD CONSTRAINT staff_users_identidad_minima
  CHECK (phone IS NOT NULL OR location_id IS NOT NULL OR works_any_location);

-- ─────────────────────────────────────────────────────────────
-- 4. 19.f — la llave de los rotativos: (marca, nombre)
-- ─────────────────────────────────────────────────────────────
-- Espejo exacto de `staff_users_nombre_sede_key` (00046) para el otro conjunto. Parcial
-- por la misma razón: las filas con teléfono y sin sede que NO son rotativas siguen
-- cubiertas por el UNIQUE de teléfono y no tienen por qué entrar aquí.
CREATE UNIQUE INDEX IF NOT EXISTS staff_users_nombre_rotativo_key
  ON staff_users (tenant_id, lower(trim(name)))
  WHERE works_any_location AND location_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 5. El cruce: un rotativo y un mesero de sede no comparten nombre
-- ─────────────────────────────────────────────────────────────
-- La lista de un aparato es «los de su sede + los rotativos». Dos «Ana» ahí son el mismo
-- problema que el bloque 4 de la 00046 cerró dentro de una sede: el mesero no sabe cuál
-- es él y la métrica se reparte al azar. Los dos índices parciales no se ven entre sí,
-- así que lo vigila un trigger, en las dos direcciones:
--
--   · al marcar/crear un rotativo, ninguna sede de la marca puede tener ese nombre;
--   · al crear/mover a alguien a una sede, ningún rotativo de la marca puede tenerlo.
--
-- ERRCODE 23505 a propósito: para el código es un duplicado de nombre, como los otros
-- dos índices, y el mensaje lleva el nombre del trigger para que la ruta lo traduzca.
-- Sin filtro por `is_active`, igual que los índices: desactivar no libera el nombre.
CREATE OR REPLACE FUNCTION staff_user_nombre_sin_cruce()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_nombre text := lower(trim(NEW.name));
  v_choca  boolean;
BEGIN
  IF NEW.works_any_location AND NEW.location_id IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM staff_users
       WHERE tenant_id = NEW.tenant_id
         AND id <> NEW.id
         AND location_id IS NOT NULL
         AND lower(trim(name)) = v_nombre
    ) INTO v_choca;
    IF v_choca THEN
      RAISE EXCEPTION
        'staff_users_nombre_rotativo_cruce: ya hay un mesero llamado "%" en una sede de '
        'esta marca; un rotativo sale en la lista de todas las sedes y serían dos iguales.',
        trim(NEW.name)
        USING ERRCODE = '23505';
    END IF;
  ELSIF NEW.location_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM staff_users
       WHERE tenant_id = NEW.tenant_id
         AND id <> NEW.id
         AND works_any_location
         AND location_id IS NULL
         AND lower(trim(name)) = v_nombre
    ) INTO v_choca;
    IF v_choca THEN
      RAISE EXCEPTION
        'staff_users_nombre_rotativo_cruce: ya hay un mesero rotativo llamado "%" en esta '
        'marca, y sale en la lista de esta sede también; serían dos iguales.',
        trim(NEW.name)
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_staff_users_nombre_sin_cruce ON staff_users;
CREATE TRIGGER trg_staff_users_nombre_sin_cruce
  BEFORE INSERT OR UPDATE OF name, location_id, works_any_location ON staff_users
  FOR EACH ROW
  EXECUTE FUNCTION staff_user_nombre_sin_cruce();

-- ─────────────────────────────────────────────────────────────
-- 6. Comentarios: que la próxima sesión no tenga que deducir nada
-- ─────────────────────────────────────────────────────────────
COMMENT ON COLUMN staff_users.works_any_location IS
  '00062: «rota entre sedes». true = el mesero sale en la lista de TODOS los aparatos de '
  'la marca y su location_id es NULL (CHECK staff_users_rotativo_sin_sede), así que no '
  'aporta señal a la precedencia del §3.1 y la visita se atribuye a la sede del APARATO. '
  'false + location_id NULL sigue siendo «sin sede asignada»: no se reinterpreta ni se '
  'backfillea. Es la revisión de D11 para el caso rotativo (dueño, 2026-09-11).';

COMMENT ON CONSTRAINT staff_users_identidad_minima ON staff_users IS
  '19.f + 00062: un mesero sin teléfono DEBE tener sede O ser rotativo. Sin esto, N filas '
  'con location_id NULL quedarían fuera del UNIQUE de teléfono, del índice parcial de '
  'nombre+sede y del de nombre+rotativo a la vez.';

COMMENT ON CONSTRAINT staff_users_rotativo_sin_sede ON staff_users IS
  '00062: un rotativo no tiene sede. Con una, la vía 1 de la precedencia le atribuiría a '
  'esa sede las visitas que registre en cualquier otra.';

COMMENT ON FUNCTION staff_user_nombre_sin_cruce() IS
  '00062: un rotativo y un mesero de sede no comparten nombre dentro de la marca, en las '
  'dos direcciones. La lista de un aparato es «su sede + rotativos», y dos nombres iguales '
  'ahí reparten la métrica al azar. Los dos índices parciales no se ven entre sí.';

-- ─────────────────────────────────────────────────────────────
-- 7. Verificación. Si algo de lo de arriba no quedó, esto lo grita.
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_falta text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'staff_users'
       AND column_name = 'works_any_location'
  ) THEN
    v_falta := v_falta || 'falta staff_users.works_any_location';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.staff_users'::regclass
       AND conname  = 'staff_users_rotativo_sin_sede'
  ) THEN
    v_falta := v_falta || 'falta el CHECK staff_users_rotativo_sin_sede';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.staff_users'::regclass
       AND conname  = 'staff_users_identidad_minima'
       AND pg_get_constraintdef(oid) ILIKE '%works_any_location%'
  ) THEN
    v_falta := v_falta || 'staff_users_identidad_minima no admite al rotativo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.staff_users'::regclass
       AND conname  = 'staff_users_phone_tenant_key'
  ) THEN
    v_falta := v_falta || 'desapareció staff_users_phone_tenant_key';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'staff_users_nombre_rotativo_key'
  ) THEN
    v_falta := v_falta || 'falta el índice staff_users_nombre_rotativo_key';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.staff_users'::regclass
       AND tgname  = 'trg_staff_users_nombre_sin_cruce'
  ) THEN
    v_falta := v_falta || 'falta el trigger trg_staff_users_nombre_sin_cruce';
  END IF;

  IF array_length(v_falta, 1) > 0 THEN
    RAISE EXCEPTION '00062 incompleta: %', array_to_string(v_falta, ' · ');
  END IF;

  RAISE NOTICE '00062 OK: works_any_location + CHECK rotativo-sin-sede, identidad mínima con cuarta llave, UNIQUE parcial (marca, nombre) entre rotativos y trigger anti-cruce.';
END
$$;
