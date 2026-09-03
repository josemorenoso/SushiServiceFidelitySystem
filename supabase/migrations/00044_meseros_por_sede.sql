-- ═══════════════════════════════════════════════════════════════
-- Migration 00044: Meseros por sede (D11) + las dos funciones que perdían la sede
-- Fecha: 2026-09-03
-- Spec: docs/superpowers/specs/2026-09-02-multisede-design.md §4 (bloque 00044) y §5.3
-- Requerimiento: docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md §23.ter (D11)
-- Feature: docs/features/multi-sede.md
-- Fase: F4 de §10 del spec.
--
-- QUÉ HACE
-- --------
-- 1. `staff_users.location_id` y `staff_devices.location_id` — las DOS VÍAS MÁS
--    FUERTES de la precedencia del §3.1. F3 las dejó cableadas y probadas en
--    `src/lib/location-resolver.ts`, pero recibiendo `null`: la columna no existía.
--    Desde aquí tienen fuente.
--
-- 2. Tapa una bomba VERIFICADA: `staff_devices.device_fingerprint` no tenía
--    UNIQUE (solo el índice normal de 00018:41) y SIETE sitios del código hacen
--    `.single()` sobre él. Dos filas con el mismo fingerprint dentro de un tenant
--    y PostgREST devuelve `PGRST116` → el mesero no puede escanear y el mensaje
--    que ve dice "dispositivo no reconocido".
--
-- 3. Un trigger impide que un dispositivo de una sede quede a nombre de un
--    mesero de otra (spec §4/00044), en las DOS direcciones de escritura.
--
-- 4. Cierra las deudas #10 y #11 de `docs/features/multi-sede.md` §5: las dos
--    funciones SQL que insertan filas de hechos SIN sede porque no la reciben.
--       · `enqueue_send_queue()`      (00038) → `send_queue.location_id`
--       · `log_review_shown_deduped()`(00032) → `review_events.location_id` del
--         evento `'shown'` (el DENOMINADOR del embudo de reseñas).
--    Las dos columnas existen desde la 00043; lo que faltaba era que alguien las
--    escribiera. Exigen `CREATE OR REPLACE`, o sea una migración — por eso F3 no
--    las pudo cerrar y son de F4, que sí lleva migración.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, A PROPÓSITO
-- ------------------------------------------
-- · NO BACKFILLEA. Los meseros que ya existen se quedan con `location_id` NULL,
--   que significa "mesero sin sede asignada" y SE MUESTRA. Adivinar la sede de un
--   mesero sería adivinar la sede de cada visita que registre, y ese número
--   terminaría en el reporte de D12. Un mesero con sede NULL sigue trabajando
--   EXACTAMENTE como hoy: no aporta señal, la precedencia cae al host, y ningún
--   403 nuevo lo toca. La migración no puede sacar del trabajo a nadie.
-- · NO toca `staff_users_phone_tenant_key (phone, tenant_id)` (00028:71-72). Es
--   lo que hace cumplir D11 en el MOTOR: un celular = una fila = una sede.
--   Cambiarlo a `(phone, location_id)` permitiría dos filas del mismo celular —
--   literalmente "el mesero trabaja en las dos", que es lo prohibido.
-- · NO toca `restaurant_locations` (es la 00041), ni crea la vista
--   `customer_location_membership` (la 00046), ni toca una sola política RLS
--   (el alcance por sede es la 00045, F7).
-- · NO borra `idx_staff_devices_fingerprint` (00018:41), que el UNIQUE nuevo deja
--   redundante: borrar un índice que no molesta no es trabajo de esta fase.
--
-- LA REGLA TRANSVERSAL, SIN EXCEPCIONES (la misma de la 00043)
-- -----------------------------------------------------------
-- Toda columna de sede es NULLABLE y lleva FK COMPUESTA:
--       (columna, tenant_id) REFERENCES restaurant_locations (id, tenant_id)
--       ON DELETE RESTRICT
-- Compuesta porque el aislamiento real no lo da el RLS: la app corre con
-- `service_role` en 55 archivos y el filtro por marca son 144 `.eq('tenant_id',…)`
-- a mano en 48 archivos. Una FK simple sobre `id` dejaría asignar un mesero de la
-- marca A a una sede de la marca B y Postgres no diría absolutamente nada.
-- MATCH SIMPLE (el default) para que el mesero histórico —`tenant_id` NOT NULL,
-- `location_id` NULL— pase. ON DELETE RESTRICT porque una sede NUNCA se borra: se
-- desactiva con `is_active = false`.
--
-- Depende de: 00041 (`UNIQUE (id, tenant_id)` en `restaurant_locations`), 00018
--             (las dos tablas), 00028 (`tenant_id NOT NULL` en las 18 tablas),
--             00032 y 00038 (las dos funciones), 00043 (`send_queue.location_id`
--             y `review_events.location_id`). El bloque 0 lo comprueba y aborta
--             entera en vez de quedar aplicada a medias.
--
-- Aplicar en el SQL Editor de Supabase (este proyecto no usa Supabase CLI).
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 0. Guardas de dependencia — fallar UNA vez y decir por qué
-- ─────────────────────────────────────────────────────────────

-- 0.a — La 00041. Se comprueba por FORMA, no por nombre: lo que importa es que
-- exista ALGÚN índice único (o el PK) sobre exactamente `(id, tenant_id)`, se
-- llame como se llame. Sin él, cada `ADD CONSTRAINT ... FOREIGN KEY` del bloque 2
-- fallaría con 42830 por separado.
-- ⚠️ `a.attname` es de tipo `name`, NO `text`: comparar `array_agg(a.attname)`
-- contra `ARRAY['id','tenant_id']` (que es `text[]`) revienta con 42883 y la
-- guarda abortaría SIEMPRE, con el error equivocado. De ahí el `::text`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'public.restaurant_locations'::regclass
       AND c.contype IN ('u', 'p')
       AND array_length(c.conkey, 1) = 2
     GROUP BY c.oid
    HAVING array_agg(a.attname::text ORDER BY a.attname) = ARRAY['id', 'tenant_id']
  ) THEN
    RAISE EXCEPTION
      '00044 requiere 00041: falta UNIQUE (id, tenant_id) en restaurant_locations.'
      USING ERRCODE = '42830';
  END IF;
END $$;

-- 0.b — La 00043. Sin `send_queue.location_id` y `review_events.location_id` los
-- bloques 5 y 6 crearían funciones que insertan en columnas inexistentes: la
-- migración pasaría (el cuerpo de una función plpgsql no se valida al crearla) y
-- el fallo aparecería en producción, en el primer encolado de campaña.
DO $$
DECLARE
  v_falta text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'location_id'
  ) THEN
    v_falta := v_falta || 'send_queue.location_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'review_events' AND column_name = 'location_id'
  ) THEN
    v_falta := v_falta || 'review_events.location_id';
  END IF;

  IF array_length(v_falta, 1) > 0 THEN
    RAISE EXCEPTION '00044 requiere 00043: falta %', array_to_string(v_falta, ', ')
      USING ERRCODE = '42703';
  END IF;
END $$;

-- 0.c — El UNIQUE del bloque 3 no se puede añadir sobre datos que ya lo violan.
-- Se comprueba ANTES de tocar nada y se aborta nombrando los duplicados, en vez
-- de fallar a media migración con un 23505 que no dice cuáles son.
-- NO se deduplica automáticamente: borrar una fila de `staff_devices` saca del
-- trabajo al dispositivo de alguien, y eso lo decide el dueño, no la migración.
DO $$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(format('tenant=%s fingerprint=%s (%s filas)', tenant_id, device_fingerprint, n), '; ')
    INTO v_dups
    FROM (
      SELECT tenant_id, device_fingerprint, count(*) AS n
        FROM staff_devices
       GROUP BY tenant_id, device_fingerprint
      HAVING count(*) > 1
    ) d;

  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION
      '00044 ABORTADA: hay device_fingerprint repetidos dentro de un mismo tenant → %. '
      'Resolverlos a mano (decidir qué dispositivo se queda) y volver a correr.', v_dups
      USING ERRCODE = '23505';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 1. Las columnas — NULLABLE las dos, y nacen vacías
-- ─────────────────────────────────────────────────────────────
ALTER TABLE staff_users   ADD COLUMN IF NOT EXISTS location_id uuid NULL;
ALTER TABLE staff_devices ADD COLUMN IF NOT EXISTS location_id uuid NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. FK COMPUESTA + su índice — en bucle, como la 00043
-- ─────────────────────────────────────────────────────────────
-- En bucle y no a mano por lo mismo que en la 00043: que sea imposible que una
-- tabla reciba la columna y se quede sin su FK por un copy-paste.
DO $$
DECLARE
  r        record;
  v_nombre text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('staff_users',   'location_id'),
      ('staff_devices', 'location_id')
    ) AS t(tabla, col)
  LOOP
    v_nombre := r.tabla || '_' || r.col || '_tenant_fkey';

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = format('public.%I', r.tabla)::regclass
         AND conname  = v_nombre
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I '
        'FOREIGN KEY (%I, tenant_id) '
        'REFERENCES public.restaurant_locations (id, tenant_id) '
        'ON DELETE RESTRICT',
        r.tabla, v_nombre, r.col
      );
    END IF;

    -- Postgres indexa el lado REFERENCIADO, nunca el que referencia. Sin esto,
    -- desactivar o intentar borrar una sede haría un seq scan de las dos tablas
    -- para comprobar el RESTRICT, y "los meseros de esta sede" no tendría por
    -- dónde entrar.
    -- Parcial a propósito: hoy el 100% de las filas son NULL, así que ocupa
    -- prácticamente cero. El planner lo usa igual para `col = $1`, porque esa
    -- igualdad implica `IS NOT NULL`.
    -- NUNCA `CONCURRENTLY`: el arnés de tests manda el archivo entero en un solo
    -- `client.query()`, el protocolo simple lo envuelve en transacción implícita
    -- y `CREATE INDEX CONCURRENTLY` muere ahí con 25001.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, %I) WHERE %I IS NOT NULL',
      'idx_' || r.tabla || '_' || r.col, r.tabla, r.col, r.col
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. La bomba del fingerprint sin UNIQUE
-- ─────────────────────────────────────────────────────────────
-- `staff_devices.device_fingerprint` solo tenía índice NORMAL (00018:41) y SIETE
-- sitios hacen `.single()` sobre él, todos filtrando además por `tenant_id`:
--   · src/lib/staff-auth.ts                        (resolveStaffAuth, escenario B)
--   · src/app/api/check-in/route.ts                (rama `register`)
--   · src/app/api/check-in/route.ts                (rama `checkin`)
--   · src/app/api/staff/device/register/route.ts   (la sonda de "ya existe")
--   · src/app/api/staff/device/verify/route.ts
--   · src/app/api/staff/me/route.ts
--   · src/app/api/staff/stats/route.ts
-- `.single()` exige EXACTAMENTE una fila: con dos, PostgREST responde PGRST116 y
-- el mesero ve "dispositivo no reconocido" sin que nadie sepa por qué.
--
-- Compuesto con `tenant_id`, no global, por la misma razón por la que 00028
-- recreó así los uniques que 00025 tuvo que soltar: el fingerprint lo genera el
-- navegador del dispositivo y dos marcas distintas podrían coincidir sin que eso
-- sea un error de nadie. `tenant_id` es NOT NULL en esta tabla (00028:50), así
-- que el UNIQUE no tiene el agujero de los NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.staff_devices'::regclass
       AND conname  = 'staff_devices_fingerprint_tenant_key'
  ) THEN
    ALTER TABLE staff_devices
      ADD CONSTRAINT staff_devices_fingerprint_tenant_key
      UNIQUE (device_fingerprint, tenant_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. El trigger: un dispositivo de una sede NUNCA a nombre de un
--    mesero de otra (spec §4, bloque 00044)
-- ─────────────────────────────────────────────────────────────
-- POR QUÉ NO BASTA LA FK COMPUESTA. Las dos FK del bloque 2 garantizan que cada
-- fila apunta a una sede DE SU PROPIA MARCA. No dicen nada sobre la relación
-- entre las dos filas: un `staff_devices` de la sede Laureles a nombre de un
-- `staff_users` de la sede Envigado pasa las dos FK sin protestar, y entonces la
-- vía 2 de la precedencia (`staff_device`) y la atribución del mesero
-- (`visits.registered_by_staff_id`) contarían la misma visita en dos sedes.
--
-- POR QUÉ EN LAS DOS DIRECCIONES. El spec pide "un trigger" y describe el sentido
-- dispositivo→mesero. Pero el invariante es simétrico y esta misma fase abre el
-- segundo camino de escritura: `PATCH /api/dashboard/staff` pasa a aceptar
-- `location_id`, así que reasignar de sede a un mesero rompería el invariante por
-- la puerta de atrás. Hacer cumplir la mitad de un invariante es exactamente el
-- fallo silencioso que este diseño existe para evitar, así que va el par.
--
-- SOLO CUANDO LAS DOS SEDES SON CONOCIDAS. Si alguna de las dos es NULL no hay
-- contradicción que detectar: NULL es "sede desconocida", no "otra sede". Así el
-- parque instalado —todos los meseros y dispositivos de hoy, todos con NULL—
-- sigue funcionando sin tocar una fila.
CREATE OR REPLACE FUNCTION staff_device_sede_coherente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_sede_mesero uuid;
  v_encontrado  boolean;
BEGIN
  IF NEW.staff_user_id IS NULL THEN
    -- Dispositivo de caja sin dueño: válido (00018 lo permite) y no atribuible.
    RETURN NEW;
  END IF;

  -- El filtro por `tenant_id` NO es decorativo: `staff_devices_staff_user_id_fkey`
  -- (00018) es una FK SIMPLE sobre `staff_users(id)`, así que hoy nada impide
  -- atribuir un dispositivo de la marca A a un mesero de la marca B. Buscando el
  -- mesero dentro de la marca del dispositivo, ese caso llega aquí como
  -- "no encontrado" y se rechaza — que es la lectura a nivel de MARCA de la misma
  -- frase del spec: un dispositivo nunca a nombre de un mesero de otra.
  SELECT location_id, true
    INTO v_sede_mesero, v_encontrado
    FROM staff_users
   WHERE id = NEW.staff_user_id
     AND tenant_id = NEW.tenant_id;

  IF NOT COALESCE(v_encontrado, false) THEN
    RAISE EXCEPTION
      'staff_devices: el mesero % no pertenece a la marca % de este dispositivo.',
      NEW.staff_user_id, NEW.tenant_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.location_id IS NOT NULL
     AND v_sede_mesero IS NOT NULL
     AND NEW.location_id <> v_sede_mesero THEN
    RAISE EXCEPTION
      'staff_devices: el dispositivo es de la sede % pero su mesero % es de la sede %. '
      'Un mesero es de UNA sede (D11): reasigna el dispositivo o al mesero, no las dos cosas a la vez.',
      NEW.location_id, NEW.staff_user_id, v_sede_mesero
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_staff_devices_sede_coherente ON staff_devices;
CREATE TRIGGER trg_staff_devices_sede_coherente
  BEFORE INSERT OR UPDATE OF staff_user_id, location_id, tenant_id ON staff_devices
  FOR EACH ROW
  EXECUTE FUNCTION staff_device_sede_coherente();

-- La otra dirección: mover de sede a un mesero que tiene dispositivos en la sede
-- vieja. Se rechaza en vez de arrastrarlos: un dispositivo es un aparato FÍSICO
-- que está donde está, y moverlo solo porque su dueño cambió de sede reasignaría
-- en silencio las visitas de una tablet que no se movió del mostrador.
CREATE OR REPLACE FUNCTION staff_user_sede_coherente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_conflictivos integer;
BEGIN
  IF NEW.location_id IS NULL OR NEW.location_id IS NOT DISTINCT FROM OLD.location_id THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
    INTO v_conflictivos
    FROM staff_devices
   WHERE staff_user_id = NEW.id
     AND tenant_id     = NEW.tenant_id
     AND location_id IS NOT NULL
     AND location_id <> NEW.location_id;

  IF v_conflictivos > 0 THEN
    RAISE EXCEPTION
      'staff_users: el mesero % tiene % dispositivo(s) en otra sede. '
      'Reasigna o desvincula esos dispositivos antes de moverlo a la sede %.',
      NEW.id, v_conflictivos, NEW.location_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_staff_users_sede_coherente ON staff_users;
CREATE TRIGGER trg_staff_users_sede_coherente
  BEFORE UPDATE OF location_id ON staff_users
  FOR EACH ROW
  EXECUTE FUNCTION staff_user_sede_coherente();

-- ─────────────────────────────────────────────────────────────
-- 5. Deuda #10 — `enqueue_send_queue()` deja de perder la sede
-- ─────────────────────────────────────────────────────────────
-- La FIRMA NO CAMBIA: sigue siendo `enqueue_send_queue(p_items jsonb)`, así que
-- esto es un `CREATE OR REPLACE` de verdad — conserva el `REVOKE ALL ... FROM
-- PUBLIC, anon, authenticated` de 00038:334 y no hay ventana en la que la función
-- no exista. La sede entra como una clave más de cada objeto del array, igual que
-- `customer_id` o `campaign_id`: quien no la mande sigue encolando sin sede, que
-- es el comportamiento de hoy y el de toda campaña masiva hasta F6.
--
-- ⚠️ Lo único que cambia respecto de 00038 son las dos líneas de `location_id`.
-- El `ON CONFLICT DO NOTHING` SIN destino se conserva TAL CUAL: es lo único que
-- respeta el índice único PARCIAL sobre EXPRESIÓN del bloque 3 de la 00038, y
-- cambiarlo por un `ON CONFLICT (…)` desactivaría el anti-duplicado en silencio.
CREATE OR REPLACE FUNCTION enqueue_send_queue(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count integer;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO send_queue (
    tenant_id, phone, customer_id, imported_contact_id, campaign_id,
    priority, message_type, template_sid, variables,
    media_url, media_type, not_before, expires_at,
    location_id
  )
  SELECT
    (i->>'tenant_id')::uuid,
    i->>'phone',
    NULLIF(i->>'customer_id', '')::uuid,
    NULLIF(i->>'imported_contact_id', '')::uuid,
    NULLIF(i->>'campaign_id', '')::uuid,
    (i->>'priority')::smallint,
    i->>'message_type',
    i->>'template_sid',
    COALESCE(i->'variables', '{}'::jsonb),
    NULLIF(i->>'media_url', ''),
    NULLIF(i->>'media_type', ''),
    COALESCE(NULLIF(i->>'not_before', '')::timestamptz, now()),
    NULLIF(i->>'expires_at', '')::timestamptz,
    -- Multi-sede F4 (deuda #10). Ausente o vacía = sede desconocida, igual que
    -- hasta ahora. La FK compuesta de la 00043 rechaza con 23503 la sede que no
    -- sea de este mismo `tenant_id`.
    NULLIF(i->>'location_id', '')::uuid
  FROM jsonb_array_elements(p_items) AS i
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION enqueue_send_queue(jsonb) IS
  'Encola un lote de forma idempotente. ON CONFLICT DO NOTHING sin destino es lo unico que respeta el indice unico parcial sobre expresion del bloque 3 de la 00038; volver a encolar la misma campana no duplica a nadie. Desde la 00044 copia tambien location_id (clave opcional de cada item): ausente = sede desconocida.';

-- ─────────────────────────────────────────────────────────────
-- 6. Deuda #11 — el evento `'shown'` deja de nacer sin sede
-- ─────────────────────────────────────────────────────────────
-- ⚠️ AQUÍ SÍ HAY QUE HACER `DROP` PRIMERO, y no es opcional. La identidad de una
-- función en Postgres es (nombre, tipos de sus argumentos): añadir un cuarto
-- parámetro NO reemplaza la de 3 — crea una SOBRECARGA. Y con la nueva llevando
-- DEFAULT, la llamada de tres argumentos que hace hoy `review.service.ts:180`
-- pasaría a encajar en las dos y Postgres la rechazaría por ambigua (42725).
-- O sea: un `CREATE OR REPLACE` aquí rompería el registro de impresiones en
-- producción, dentro de un `catch` que solo escribe en consola.
--
-- El DROP no pierde permisos: 00032 no le puso ningún GRANT/REVOKE explícito, así
-- que vive con el EXECUTE que Postgres concede a PUBLIC por defecto, y la función
-- nueva nace con el mismo.
DROP FUNCTION IF EXISTS log_review_shown_deduped(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION log_review_shown_deduped(
  p_tenant_id   uuid,
  p_customer_id uuid,
  p_within_hours integer,
  -- Multi-sede F4 (deuda #11). VA AL FINAL Y CON DEFAULT a propósito: así el
  -- código desplegado que todavía llama con tres argumentos sigue funcionando y
  -- el orden de despliegue (migración primero o código primero) deja de importar.
  p_location_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO review_events (tenant_id, customer_id, action, location_id)
  SELECT p_tenant_id, p_customer_id, 'shown', p_location_id
  WHERE NOT EXISTS (
    SELECT 1 FROM review_events
     WHERE tenant_id   = p_tenant_id
       AND customer_id = p_customer_id
       AND action      = 'shown'
       AND created_at >= now() - make_interval(hours => p_within_hours)
  );
$$;

COMMENT ON FUNCTION log_review_shown_deduped(uuid, uuid, integer, uuid) IS
  'Registra la impresion del recuerdo de resena en UNA sola sentencia (INSERT ... WHERE NOT EXISTS): recargar la pantalla de exito no infla el denominador del embudo. Desde la 00044 guarda tambien la sede (D5). ⚠️ EL DEDUPE SIGUE SIENDO POR (tenant, cliente), NO POR SEDE, a proposito: meterle la sede cambiaria hacia arriba un numero que el panel ya reporta hoy. Consecuencia para F6: si un mismo cliente ve el recuerdo en dos sedes dentro de la ventana, cuenta UNA vez y se le atribuye a la PRIMERA. Hay que decirlo en pantalla cuando F6 dibuje el embudo por sede.';

-- ─────────────────────────────────────────────────────────────
-- 7. Documentación de las columnas
-- ─────────────────────────────────────────────────────────────
COMMENT ON COLUMN staff_users.location_id IS
  'Sede a la que pertenece el mesero (D11: "cada mesero es de cada sede, no se juntan jamas"). NULL = mesero sin sede asignada, y SE MUESTRA: no se adivina ni se reparte. Es la via 1 —la MAS FUERTE— de la precedencia del §3.1, por encima del host: el mesero esta fisicamente donde ocurre la visita y su credencial la emite el sistema, mientras que el host puede ser un enlace guardado de otra sede. Un mesero con NULL no aporta senal y la precedencia cae al host, que es el comportamiento anterior a esta migracion. Vive en la FILA y NUNCA en el JWT del mesero (§5.3): el JWT dura 8h, asi que reasignar de sede tardaria hasta 8 horas en verse y no habria como revocarlo.';

COMMENT ON COLUMN staff_devices.location_id IS
  'Sede del dispositivo de confianza (via 2 de la precedencia del §3.1, por debajo del mesero autenticado y por encima del host). NULL = sede desconocida. La hereda del mesero dueno al registrarse (/api/staff/device/register). El trigger trg_staff_devices_sede_coherente impide que quede en una sede distinta a la de su mesero.';

COMMENT ON CONSTRAINT staff_devices_fingerprint_tenant_key ON staff_devices IS
  'Tapa una bomba verificada: hasta la 00044 device_fingerprint solo tenia indice NORMAL (00018:41) y SIETE sitios del codigo hacen .single() sobre el. Dos filas iguales dentro de un tenant = PGRST116 = el mesero no puede escanear y el mensaje dice "dispositivo no reconocido". Compuesto con tenant_id, no global, por el mismo criterio con el que 00028 recreo los uniques de 00025.';

COMMENT ON FUNCTION staff_device_sede_coherente() IS
  'Impide que un dispositivo quede a nombre de un mesero de otra SEDE o de otra MARCA (spec §4, bloque 00044). Lo de la marca no lo cubre ninguna FK: staff_devices.staff_user_id es una FK SIMPLE a staff_users(id) desde 00018. Solo actua cuando las dos sedes son CONOCIDAS: NULL es "sede desconocida", no "otra sede", asi que el parque instalado no se toca.';

COMMENT ON FUNCTION staff_user_sede_coherente() IS
  'La direccion simetrica del anterior: mover de sede a un mesero que tiene dispositivos en la sede vieja se RECHAZA en vez de arrastrarlos. Un dispositivo es un aparato fisico que esta donde esta; moverlo porque su dueno cambio de sede reasignaria en silencio las visitas de una tablet que no se movio del mostrador.';

-- ─────────────────────────────────────────────────────────────
-- 8. Verificación — que la migración diga si se aplicó entera
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  r        record;
  v_falta  text[] := ARRAY[]::text[];
  v_nombre text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('staff_users',   'location_id'),
      ('staff_devices', 'location_id')
    ) AS t(tabla, col)
  LOOP
    -- ¿existe la columna, y es NULLABLE?
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = r.tabla
         AND column_name = r.col AND is_nullable = 'YES'
    ) THEN
      v_falta := v_falta || (r.tabla || '.' || r.col || ' (columna nullable)');
    END IF;

    -- ¿existe la FK, es COMPUESTA de 2 columnas, apunta a restaurant_locations
    -- y es ON DELETE RESTRICT? Las tres cosas son la regla transversal.
    v_nombre := r.tabla || '_' || r.col || '_tenant_fkey';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid  = format('public.%I', r.tabla)::regclass
         AND conname   = v_nombre
         AND contype   = 'f'
         AND confrelid = 'public.restaurant_locations'::regclass
         AND array_length(conkey, 1) = 2
         AND confdeltype = 'r'
    ) THEN
      v_falta := v_falta || (v_nombre || ' (FK compuesta ON DELETE RESTRICT)');
    END IF;

    -- ¿existe su índice?
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = r.tabla
         AND indexname = 'idx_' || r.tabla || '_' || r.col
    ) THEN
      v_falta := v_falta || ('idx_' || r.tabla || '_' || r.col || ' (indice)');
    END IF;
  END LOOP;

  -- El UNIQUE que tapa la bomba del fingerprint.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.staff_devices'::regclass
       AND conname  = 'staff_devices_fingerprint_tenant_key'
       AND contype  = 'u'
  ) THEN
    v_falta := v_falta || 'staff_devices_fingerprint_tenant_key (UNIQUE)';
  END IF;

  -- Los dos triggers del invariante de D11.
  FOREACH v_nombre IN ARRAY ARRAY[
    'trg_staff_devices_sede_coherente',
    'trg_staff_users_sede_coherente'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = v_nombre AND NOT tgisinternal
    ) THEN
      v_falta := v_falta || (v_nombre || ' (trigger)');
    END IF;
  END LOOP;

  -- Las dos funciones, con la ARIDAD que corresponde. La de reseñas tiene que
  -- tener 4 argumentos y existir UNA sola vez: si quedaran las dos sobrecargas,
  -- la llamada de 3 argumentos del servicio moriría con 42725 en producción.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'log_review_shown_deduped') <> 1 THEN
    v_falta := v_falta || 'log_review_shown_deduped (debe existir exactamente 1 sobrecarga)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'log_review_shown_deduped'
       AND p.pronargs = 4
  ) THEN
    v_falta := v_falta || 'log_review_shown_deduped(uuid,uuid,integer,uuid)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'enqueue_send_queue' AND p.pronargs = 1
  ) THEN
    v_falta := v_falta || 'enqueue_send_queue(jsonb)';
  END IF;

  IF array_length(v_falta, 1) > 0 THEN
    RAISE EXCEPTION '00044 INCOMPLETA. Falta: %', array_to_string(v_falta, ', ');
  END IF;

  RAISE NOTICE '00044 OK: staff_users.location_id y staff_devices.location_id con FK compuesta e indice, UNIQUE de fingerprint, 2 triggers de coherencia D11, y las 2 funciones SQL escribiendo sede.';
END $$;

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00044
-- ═══════════════════════════════════════════════════════════════
