-- ═══════════════════════════════════════════════════════════════
-- Migration 00046: §19 — el aparato es del local, el mesero se elige por operación
-- Fecha: 2026-09-05
-- Spec: docs/superpowers/specs/2026-09-05-staff-scanner-19-design.md
-- Requerimiento: docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md §19
-- Feature: docs/features/staff-qr-scan.md
--
-- ⚠️ SE ESCRIBE Y SE DEJA SIN APLICAR. Aplicarla en producción LO DECIDE EL DUEÑO.
--    Va DESPUÉS de la 00044 (de la que depende: `staff_users.location_id`) y la 00045.
--
-- QUÉ HACE
-- --------
-- 1. `staff_users.phone` deja de ser obligatorio. §19.2 del encargo: un mesero se da de
--    alta con NOMBRE y nada más — sin teléfono, sin celular propio y (decisión del dueño
--    del 2026-09-05) sin PIN. El mesero ya no inicia sesión: el que inicia sesión es el
--    APARATO, una sola vez.
--
-- 2. Repone la llave de identidad que el punto 1 apaga. Y esto es TODO el asunto de esta
--    migración, así que vale la pena decirlo despacio (es la pregunta 19.f del spec):
--
--    `staff_users_phone_tenant_key (phone, tenant_id)` (00028:71-72) es, según CLAUDE.md,
--    "D11 en el motor". La cadena era: identidad = teléfono → un teléfono no se repite
--    dentro de la marca → UNA FILA por persona → una `location_id` por fila → UNA SEDE.
--
--    Al volver `phone` nullable esa cadena se corta por el primer eslabón, y **en Postgres
--    los NULL no colisionan entre sí**: el UNIQUE seguiría existiendo y no diría nada de
--    las filas nuevas. Es exactamente el fallo silencioso que este repositorio existe para
--    evitar, así que la llave NO se quita — se COMPLEMENTA, en esta misma migración:
--
--      · el UNIQUE de teléfono se conserva intacto y sigue dando D11 COMPLETO a todo el
--        parque que tiene teléfono, que hoy es el 100 % de las filas;
--      · un CHECK obliga a que un mesero SIN teléfono tenga sede (bloque 3);
--      · un UNIQUE PARCIAL sobre (marca, sede, nombre) es la llave de los que no tienen
--        teléfono, y de paso es la que la PANTALLA necesita (bloque 4).
--
--    LO QUE AUN ASÍ SE PIERDE, Y EL DUEÑO LO SABE (spec §3): sin teléfono la base ya no
--    tiene forma de saber que "Ana de Laureles" y "Ana del Poblado" son la misma persona.
--    Ningún índice lo recupera: el dato que las unía dejó de existir. Lo que SÍ queda
--    garantizado por el motor es que ningún hecho se atribuye a dos sedes — una fila tiene
--    exactamente una `location_id`.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, A PROPÓSITO
-- ------------------------------------------
-- · NO BACKFILLEA NADA. Los meseros de hoy conservan `location_id` NULL y pasan el CHECK
--   por el teléfono. Asignarles sede es un paso manual del dueño en el panel: `location_id`
--   NULL es "sede desconocida" y SE MUESTRA, nunca se adivina.
--
-- · NO TOCA NI UNA FILA DE `staff_devices`. Los aparatos ya activados conservan su
--   `staff_user_id` y siguen siendo sesiones válidas; lo único que cambia es que el CÓDIGO
--   deja de leer esa columna para atribuir. La inversión de §19 es de código, no de datos.
--
-- · NO TOCA `staff_users.pin`. Sigue siendo nullable, pero cambia de significado: desde §19
--   solo lo llevan los SUPERVISORES, porque activar un aparato es la única acción que
--   todavía pide credencial (19.a, resuelta por el dueño: se usa lo que ya existe).
--
-- · No crea columnas de bloqueo de PIN ni la clave de settings del interruptor: el dueño
--   quitó el PIN del mesero el 2026-09-05, así que 19.e y §19.7 dejaron de existir.
--
-- DEPENDENCIAS: 00028 (`staff_users_phone_tenant_key`), 00044 (`staff_users.location_id`).
--               El bloque 0 lo comprueba y aborta con un mensaje que se entiende.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 0. Pre-vuelo. Aborta antes de tocar nada.
-- ─────────────────────────────────────────────────────────────

-- 0.a — La 00044. Sin `staff_users.location_id` no hay ni CHECK ni índice que valgan:
-- el CHECK del bloque 3 se caería con 42703 y el 4 también.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'staff_users'
       AND column_name  = 'location_id'
  ) THEN
    RAISE EXCEPTION
      '00046 aborta: falta staff_users.location_id (migración 00044). '
      'Aplica primero la 00044 y la 00045.';
  END IF;
END
$$;

-- 0.b — El UNIQUE de teléfono tiene que SEGUIR AHÍ cuando esto termine. Si alguien lo
-- quitó en el camino, esta migración dejaría a la marca sin ninguna garantía de identidad
-- para los meseros que sí tienen teléfono, y lo haría sin avisar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.staff_users'::regclass
       AND conname  = 'staff_users_phone_tenant_key'
  ) THEN
    RAISE EXCEPTION
      '00046 aborta: no está staff_users_phone_tenant_key. Esta migración vuelve el '
      'teléfono opcional y da por hecho que ese UNIQUE sigue cubriendo a quien sí lo tiene.';
  END IF;
END
$$;

-- 0.c — El índice del bloque 4 no puede nacer sobre datos que ya lo violan. Hoy es
-- imposible (todas las filas tienen location_id NULL y quedan fuera del índice parcial),
-- pero esta migración se puede reejecutar sobre una base ya poblada y entonces sí importa:
-- un `CREATE UNIQUE INDEX` que falla a mitad deja el mensaje críptico de Postgres en vez
-- de decir CUÁLES son los nombres repetidos.
DO $$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(format('%s (sede %s) ×%s', nombre, location_id, n), ', ')
    INTO v_dups
    FROM (
      SELECT lower(trim(name)) AS nombre, location_id, count(*) AS n
        FROM staff_users
       WHERE location_id IS NOT NULL
       GROUP BY tenant_id, location_id, lower(trim(name))
      HAVING count(*) > 1
    ) d;

  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION
      '00046 aborta: hay meseros con el mismo nombre en la misma sede: %. '
      'Renómbralos (p. ej. "Ana L." y "Ana P.") antes de aplicar: la pantalla del mesero '
      'no puede distinguirlos al elegir.', v_dups;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────
-- 1. §19.2 — el teléfono deja de ser obligatorio
-- ─────────────────────────────────────────────────────────────
ALTER TABLE staff_users ALTER COLUMN phone DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. `staff_users_phone_tenant_key` NO SE TOCA
-- ─────────────────────────────────────────────────────────────
-- No hay sentencia aquí, y esa ausencia es deliberada. Quien venga a "limpiar" esta
-- migración y vea un bloque vacío: el UNIQUE (phone, tenant_id) de la 00028 es lo que
-- sostiene D11 para todos los meseros que tienen teléfono. Quitarlo apaga la garantía en
-- silencio, porque el índice parcial del bloque 4 solo cubre a los que tienen sede.

-- ─────────────────────────────────────────────────────────────
-- 3. 19.f — sin teléfono, la sede es OBLIGATORIA
-- ─────────────────────────────────────────────────────────────
-- Sin este CHECK se podrían crear diez "Ana" con `location_id` NULL y el índice parcial
-- del bloque 4 no diría absolutamente nada: es la MISMA trampa de los NULL, un piso más
-- abajo. Y además un mesero sin sede no aparece en ninguna lista del escáner —o sea que
-- no sirve para nada— porque la lista se filtra por la sede del aparato.
--
-- El parque de hoy lo pasa entero por el otro lado del OR: todas las filas tienen teléfono.
ALTER TABLE staff_users
  ADD CONSTRAINT staff_users_identidad_minima
  CHECK (phone IS NOT NULL OR location_id IS NOT NULL);

-- ─────────────────────────────────────────────────────────────
-- 4. 19.f — la llave que la PANTALLA necesita
-- ─────────────────────────────────────────────────────────────
-- Dos "Ana" en la misma sede son indistinguibles en el selector: el mesero no puede saber
-- cuál es él, y la métrica de eficiencia —que es el PROPÓSITO de la pantalla— se reparte
-- al azar entre las dos.
--
-- PARCIAL A PROPÓSITO (`WHERE location_id IS NOT NULL`). No es una optimización: sin la
-- cláusula, las filas con sede NULL entrarían al índice y volverían a no colisionar entre
-- sí, con lo cual el índice mentiría sobre su propio alcance. Declararlo parcial deja
-- escrito que a esas filas las cubre el UNIQUE de teléfono (bloque 2) y el CHECK (bloque 3).
--
-- `lower(trim(name))` porque "Ana", "ana " y " ANA" son la misma persona para quien mira
-- la lista, y el motor tiene que verlas igual que el ojo.
CREATE UNIQUE INDEX IF NOT EXISTS staff_users_nombre_sede_key
  ON staff_users (tenant_id, location_id, lower(trim(name)))
  WHERE location_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 5. Comentarios: que la próxima sesión no tenga que deducir nada
-- ─────────────────────────────────────────────────────────────
COMMENT ON COLUMN staff_users.phone IS
  'Contacto. NULLABLE desde la 00046 (§19.2): un mesero se da de alta solo con nombre. '
  'Cuando está presente, staff_users_phone_tenant_key le da D11 completo. Cuando falta, '
  'la sede es obligatoria (staff_users_identidad_minima) y la llave es '
  'staff_users_nombre_sede_key. Ya NO es una identidad de login: el mesero no inicia sesión.';

COMMENT ON COLUMN staff_users.pin IS
  'PIN bcrypt. Desde la 00046 (§19) solo lo llevan los SUPERVISORES: es la credencial que '
  'activa un aparato. Los meseros no tienen PIN — el dueño lo quitó el 2026-09-05.';

COMMENT ON CONSTRAINT staff_users_identidad_minima ON staff_users IS
  '19.f: un mesero sin teléfono DEBE tener sede. Sin esto, N filas con location_id NULL '
  'quedarían fuera del UNIQUE de teléfono Y del índice parcial de nombre+sede a la vez.';

COMMENT ON COLUMN staff_devices.staff_user_id IS
  'Dueño del aparato. Desde §19 se escribe NULL: el aparato es DEL LOCAL y la atribución '
  'viaja en el cuerpo de cada operación. Las filas viejas conservan su dueño (la 00046 no '
  'las toca) pero el código ya no lee esta columna para atribuir. Solo la usa el trigger '
  'staff_device_sede_coherente() de la 00044, que con NULL devuelve NEW de inmediato.';

COMMENT ON COLUMN staff_devices.location_id IS
  'Sede del aparato. Desde §19 deja de heredarse del dueño (que ya no existe) y se ELIGE '
  'al activarlo. Es lo único que hace posible la lista de meseros filtrada por sede. '
  'NULL = aparato sin sede: la app pide asignarla antes de dejar escanear.';

-- ─────────────────────────────────────────────────────────────
-- 6. Verificación. Si algo de lo de arriba no quedó, esto lo grita.
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_falta text[] := ARRAY[]::text[];
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'staff_users' AND column_name = 'phone')
     <> 'YES' THEN
    v_falta := v_falta || 'staff_users.phone sigue NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.staff_users'::regclass
       AND conname  = 'staff_users_phone_tenant_key'
  ) THEN
    v_falta := v_falta || 'desapareció staff_users_phone_tenant_key';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.staff_users'::regclass
       AND conname  = 'staff_users_identidad_minima'
  ) THEN
    v_falta := v_falta || 'falta el CHECK staff_users_identidad_minima';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'staff_users_nombre_sede_key'
  ) THEN
    v_falta := v_falta || 'falta el índice staff_users_nombre_sede_key';
  END IF;

  IF array_length(v_falta, 1) > 0 THEN
    RAISE EXCEPTION '00046 incompleta: %', array_to_string(v_falta, ' · ');
  END IF;

  RAISE NOTICE '00046 OK: phone nullable, el UNIQUE de teléfono intacto, + CHECK de identidad mínima y UNIQUE parcial (marca, sede, nombre).';
END
$$;
