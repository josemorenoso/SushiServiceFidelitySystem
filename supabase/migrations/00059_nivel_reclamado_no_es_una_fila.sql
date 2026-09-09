-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 00059: «ya reclamé este nivel» deja de ser el id de una fila
-- Fecha: 2026-09-09
-- Feature: docs/features/points-mystery-box.md §7.4.bis
-- Antecedente directo: 00058 §3 (recompensas por sede) y el endpoint
--   POST /api/dashboard/reward-tiers/copiar que nació con ella.
--
-- DE DÓNDE SALE
-- ─────────────
-- Auditoría adversarial del 2026-09-09, confirmada por 3 de 3 verificadores, y
-- anotada en ESTADO.md §3 punto 0.GAMMA:
--
--   `/api/check-in/status` ofrece «el nivel superado de mayor umbral que NO esté
--   en mystery_box_results», y esa exclusión se lleva por `tier_id`. Los niveles
--   propios de una sede son COPIAS con ids NUEVOS. Entonces, en el instante en
--   que alguien aprieta «Darle premios propios a esta sede», los 542 clientes de
--   Sushi Service vuelven a tener TODOS sus niveles «sin reclamar» en esa sede.
--   Es un regalo masivo de premios, y hoy está a un botón de distancia.
--
-- LA IDEA, EN UNA FRASE
-- ─────────────────────
-- Un nivel no ES su fila. La fila es dónde vive el nivel (marca o sede); el
-- NIVEL —«el escalón de los 150 puntos de esta marca»— sobrevive a la copia.
-- Así que la historia deja de apuntar a una fila y pasa a guardar QUÉ nivel se
-- reclamó, con dos claves que se guardan JUNTAS y valen en OR:
--
--   1. `reward_tiers.tier_key` — la identidad del nivel DENTRO DE LA MARCA,
--      estable a través de las copias por sede. Una copia hereda el `tier_key`
--      de su original; un nivel creado de cero estrena el suyo.
--   2. `mystery_box_results.claimed_threshold` — el umbral que el cliente cruzó,
--      congelado el día que lo cruzó.
--
-- POR QUÉ DOS CLAVES Y NO UNA
-- ───────────────────────────
--   · Solo el UMBRAL no alcanza: editar «Bronce» de 150 a 200 puntos volvería a
--     ofrecerle premio a todo el que ya lo había reclamado — un regalo masivo
--     idéntico al que esta migración viene a cerrar, disparado por otro botón.
--     El `tier_key` no se mueve cuando se edita la fila, así que lo tapa.
--   · Solo el TIER_KEY no alcanza: `/api/dashboard/reward-tiers` (POST) deja
--     crear a mano el nivel de una sede sin pasar por «copiar», y esa fila
--     estrena `tier_key`. Con umbrales iguales a los de la marca sería el mismo
--     regalo, un nivel por vez. El umbral lo tapa.
--   Las dos juntas son ESTRICTAMENTE más conservadoras que cualquiera sola, y
--   eso es a propósito: equivocarse hacia «no hay premio» es recuperable (el
--   cliente vuelve a consultar); equivocarse hacia «tomá otro premio» le cuesta
--   plata al restaurante y no se deshace. Es el mismo criterio que ya está
--   escrito en `check-in/status/route.ts` para el fallo de base.
--
-- POR QUÉ SE DENORMALIZA Y NO SE HACE UN JOIN
-- ───────────────────────────────────────────
-- Se podría leer el umbral del nivel con un JOIN a `reward_tiers` en vez de
-- guardarlo. No, por dos motivos, y los dos son de HISTORIA:
--   · `mystery_box_results.tier_id` es `ON DELETE CASCADE` (00013:69). Borrar un
--     nivel borra la prueba de que alguien lo reclamó, y el cliente vuelve a
--     tener premio. El dato copiado sobrevive a su fila.
--   · `point_threshold` es editable. Un JOIN haría que la historia se MOVIERA al
--     editar la escalera: el cliente que reclamó a los 150 pasaría a figurar
--     como que reclamó a los 200. Lo que se reclamó ocurrió una vez y no cambia.
--
-- LA REGLA DE ORO SE MANTIENE: con **0 o 1 sede activa** ninguna de las 5 marcas
-- vivas ve un solo cambio. Cada nivel existente estrena su `tier_key` al crearse
-- la columna, y el backfill sella cada reclamo contra el nivel del que salió: la
-- comparación por clave devuelve fila por fila lo mismo que la comparación por
-- `tier_id` que había. La ÚNICA diferencia observable sin sedes es este caso, que
-- hoy es un regalo silencioso y a partir de acá no lo es: desactivar «Bronce 150»
-- y crear otro nivel activo en el MISMO umbral 150 hoy le ofrece premio otra vez
-- a todo el que ya lo reclamó; después de esta migración, no. Queda dicho en
-- `docs/features/points-mystery-box.md` §7.4.bis.
--
-- IDEMPOTENTE sin guardas: la única escritura de datos rellena columnas en NULL y
-- no mueve nunca un valor ya sellado. El porqué —y qué NO se hace por eso— está
-- en el bloque 3.
--
-- RIESGO: BAJO. Agrega 1 columna NOT NULL con DEFAULT a `reward_tiers` (decenas
--   de filas en las 5 marcas vivas) y 2 columnas NULLABLE a `mystery_box_results`
--   con su backfill; 1 trigger BEFORE INSERT que solo RELLENA lo que venga en
--   NULL; 2 índices. La única escritura de datos rellena NULLs. No borra nada, no
--   toca RLS, no cambia ninguna FK.
-- REVERSIBLE: sí, y sin pérdida — `DROP TRIGGER trg_mystery_box_results_sella_nivel`,
--   `DROP FUNCTION sellar_nivel_reclamado()`, `DROP INDEX` de los dos índices y
--   `DROP COLUMN` de las tres columnas. El código anterior lee `tier_id`, que
--   esta migración no toca.
-- ORDEN: después de la 00058, que es la que crea `reward_tiers.location_id` — sin
--   ella no existe el problema, y el bloque 0 lo comprueba. **Se aplica en
--   Supabase ANTES de desplegar el código que la usa**: `/api/check-in/status`
--   pasa a pedir `claimed_tier_key`, y una columna que falta le llega a PostgREST
--   como 42703, que la ruta devuelve como 403.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 0. Guardas de dependencia
-- ─────────────────────────────────────────────────────────────
-- Fallar acá NOMBRA el archivo que falta. Sin esto, el bloque 1 fallaría con un
-- "column location_id does not exist" que no le dice nada a nadie.
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'reward_tiers' AND column_name = 'location_id'
  ) THEN
    RAISE EXCEPTION
      '00059 requiere la 00058: falta reward_tiers.location_id. Sin recompensas por sede no existe el problema que esta migracion cierra.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'reward_tiers' AND column_name = 'tenant_id'
  ) THEN
    RAISE EXCEPTION '00059 requiere la 00025: falta reward_tiers.tenant_id.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'mystery_box_results'
  ) THEN
    RAISE EXCEPTION '00059 requiere la 00013: falta la tabla mystery_box_results.';
  END IF;
END
$guardas$;


-- ═════════════════════════════════════════════════════════════
-- 1. `reward_tiers.tier_key` — la identidad del nivel en la marca
-- ═════════════════════════════════════════════════════════════
--
-- El DEFAULT es deliberado y es la mitad del diseño: `/api/dashboard/reward-tiers`
-- (POST) no conoce esta columna y no hace falta que la conozca. Un nivel creado
-- desde la pantalla estrena su propio `tier_key` — que es exactamente lo que
-- significa «este es un nivel nuevo». El ÚNICO sitio que copia un `tier_key`
-- ajeno es `POST /api/dashboard/reward-tiers/copiar`, porque es el único sitio
-- donde un nivel de la marca se REPLICA en una sede en vez de nacer.
--
-- Esta columna NO se backfillea: el DEFAULT ya le da identidad propia a cada fila
-- existente en el momento de crearla, que es exactamente lo que hace falta. El
-- bloque 3 explica por qué normalizarla después sería activamente peligroso.
ALTER TABLE reward_tiers
  ADD COLUMN IF NOT EXISTS tier_key uuid NOT NULL DEFAULT gen_random_uuid();

COMMENT ON COLUMN reward_tiers.tier_key IS
  'Identidad del NIVEL dentro de la marca, estable a traves de las copias por sede: una copia hereda el tier_key de su original, un nivel nuevo estrena el suyo. Es lo que hace que "ya reclame este nivel" no dependa del id de la fila. 00059 §1.';

-- Un `tier_key` no puede repetirse dentro de la misma sede de la misma marca:
-- sería el mismo nivel dos veces en la misma escalera. **Centinela obligatorio**:
-- los NULL no colisionan entre sí, así que sin el COALESCE dos niveles DE LA
-- MARCA (los dos con `location_id` NULL) con el mismo `tier_key` convivirían y la
-- garantía quedaría apagada en silencio. Mismo uuid cero que la 00058 §4.
CREATE UNIQUE INDEX IF NOT EXISTS reward_tiers_tier_key_tenant_sede_unique
  ON reward_tiers (
    tenant_id,
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    tier_key
  );

COMMENT ON INDEX reward_tiers_tier_key_tenant_sede_unique IS
  'Un nivel (tier_key) aparece una sola vez por sede. El COALESCE al uuid cero hace que los NULL (= de la marca) SI colisionen entre si. NO es parcial por is_active a proposito: un nivel desactivado sigue ocupando su identidad, y reactivarlo no debe poder duplicarla. 00059 §1.';


-- ═════════════════════════════════════════════════════════════
-- 2. `mystery_box_results` — la historia deja de apuntar a una fila
-- ═════════════════════════════════════════════════════════════
--
-- NULLABLE las dos, y no por comodidad: `mystery-box.service.ts` inserta acá y
-- NO conoce estas columnas. Ponerlas NOT NULL rompería todo reclamo de premio en
-- el instante en que se aplique la migración — que es ANTES de desplegar el
-- código. Las rellena el trigger del bloque 3, que es quien sabe leerlas.
ALTER TABLE mystery_box_results
  ADD COLUMN IF NOT EXISTS claimed_tier_key  uuid    NULL,
  ADD COLUMN IF NOT EXISTS claimed_threshold integer NULL;

COMMENT ON COLUMN mystery_box_results.claimed_tier_key IS
  'Que NIVEL se reclamo (reward_tiers.tier_key), copiado el dia del reclamo. Sobrevive al ON DELETE CASCADE de tier_id y a que alguien edite la escalera. 00059 §2.';
COMMENT ON COLUMN mystery_box_results.claimed_threshold IS
  'Que UMBRAL cruzo el cliente, congelado el dia que lo cruzo. Segunda clave del "ya reclame": tapa el caso de una sede que crea sus niveles a mano en vez de copiarlos. 00059 §2.';

-- Índice de apoyo para la consulta de `/api/check-in/status`, que pide los
-- reclamos de UN cliente. El de 00013:78 es `(customer_id, created_at DESC)` y
-- serviría, pero este trae las dos claves dentro del propio índice: la consulta
-- no toca la tabla. Es la consulta que corre cada 5 segundos en el celular del
-- cliente mientras espera al mesero.
CREATE INDEX IF NOT EXISTS idx_mystery_box_results_claims
  ON mystery_box_results (customer_id) INCLUDE (claimed_tier_key, claimed_threshold);


-- ═════════════════════════════════════════════════════════════
-- 3. El backfill de la historia — UNO SOLO, y a propósito
-- ═════════════════════════════════════════════════════════════
--
-- Va acá abajo y no dentro del bloque 1 porque CONSULTA las columnas que crea el
-- bloque 2. El arnés manda el archivo entero en un solo `client.query()` y cada
-- sentencia se parsea al ejecutarse, así que una referencia adelantada revienta
-- con "column claimed_tier_key does not exist" — pasó al escribir esto.
--
-- LO QUE NO SE HACE, Y ES LA DECISIÓN IMPORTANTE DEL BLOQUE
-- ────────────────────────────────────────────────────────
-- La primera versión traía un segundo UPDATE que normalizaba `tier_key = id` en
-- toda fila existente. Quedaba bonito de explicar («comparar por clave es
-- comparar por id») y NO SE PUEDE HACER: en una segunda corrida —y estas
-- migraciones se re-corren, el arnés de tests las corre siempre— ese UPDATE le
-- resetea la clave a una copia por sede, que a propósito tiene `tier_key <> id`.
-- La copia deja de compartir identidad con el nivel de la marca y **vuelve el
-- regalo masivo de premios**, esta vez disparado por reaplicar la migración.
-- Ninguna guarda lo tapa del todo: proteger «las claves ya reclamadas» deja
-- fuera justo la copia de un nivel que nadie reclamó todavía.
--
-- Y no hace falta para nada: el DEFAULT del bloque 1 ya le dio a cada fila una
-- identidad única en el momento de crear la columna, y este UPDATE sella los
-- reclamos contra ESA identidad. El invariante que importa no es «tier_key = id»
-- sino «el reclamo apunta a la clave del nivel del que salió», y lo da esto solo.
-- De ahí, además, que el archivo sea idempotente sin una sola guarda: la única
-- escritura que queda solo RELLENA NULLs y nunca mueve un valor ya sellado.
--
-- ⚠️ Este JOIN es la ÚNICA vez que estos dos valores se leen de `reward_tiers`.
-- De acá en adelante son historia y no se recalculan nunca.
--
-- No hace falta contemplar reclamos cuyo nivel ya no exista: `tier_id` es NOT
-- NULL con FK ON DELETE CASCADE (00013:69), así que si el nivel se fue, la fila
-- del reclamo se fue con él. El bloque 5 lo comprueba igual.
UPDATE mystery_box_results m
   SET claimed_tier_key  = t.tier_key,
       claimed_threshold = t.point_threshold
  FROM reward_tiers t
 WHERE t.id = m.tier_id
   AND (m.claimed_tier_key IS NULL OR m.claimed_threshold IS NULL);


-- ═════════════════════════════════════════════════════════════
-- 4. El trigger que sella el nivel reclamado
-- ═════════════════════════════════════════════════════════════
--
-- POR QUÉ UN TRIGGER Y NO UN INSERT MÁS COMPLETO EN LA APLICACIÓN
-- ───────────────────────────────────────────────────────────────
-- Hay DOS inserts en `mystery_box_results` (`mystery-box.service.ts`, uno por
-- cada `choice`) y podría haber un tercero mañana. Sellar en la base significa
-- que la historia queda completa venga de donde venga el reclamo — incluido un
-- INSERT a mano en el SQL Editor, que es como se arreglan las cosas acá.
--
-- ADITIVO, NUNCA CORRECTIVO: solo escribe donde el valor llega NULL. Si algún
-- día el llamador manda su propio `claimed_tier_key`, el trigger no lo pisa. Es
-- la misma forma que `fillEmptyPointer()` en plantillas, y por el mismo motivo:
-- un trigger que CORRIGE es un segundo escritor discutiendo con el primero.
--
-- `SECURITY INVOKER` (el default): no necesita privilegios que quien inserta no
-- tenga; solo lee `reward_tiers`, la tabla a la que la fila ya apunta por FK.
CREATE OR REPLACE FUNCTION sellar_nivel_reclamado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $sellar$
BEGIN
  IF NEW.claimed_tier_key IS NULL OR NEW.claimed_threshold IS NULL THEN
    SELECT COALESCE(NEW.claimed_tier_key,  t.tier_key),
           COALESCE(NEW.claimed_threshold, t.point_threshold)
      INTO NEW.claimed_tier_key, NEW.claimed_threshold
      FROM reward_tiers t
     WHERE t.id = NEW.tier_id;
  END IF;
  RETURN NEW;
END;
$sellar$;

COMMENT ON FUNCTION sellar_nivel_reclamado() IS
  'Copia tier_key y point_threshold del nivel al reclamo, en el momento del reclamo. Aditivo: solo rellena lo que llega NULL, nunca corrige. 00059 §4.';

-- `DROP` antes de `CREATE`: `CREATE OR REPLACE TRIGGER` es de PG14+ y Supabase
-- corre 15/17, pero el `DROP` explícito además deja la migración re-ejecutable
-- sin depender de la versión.
DROP TRIGGER IF EXISTS trg_mystery_box_results_sella_nivel ON mystery_box_results;
CREATE TRIGGER trg_mystery_box_results_sella_nivel
  BEFORE INSERT ON mystery_box_results
  FOR EACH ROW EXECUTE FUNCTION sellar_nivel_reclamado();


-- ═════════════════════════════════════════════════════════════
-- 5. Verificación — que la migración no haya quedado a medias
-- ═════════════════════════════════════════════════════════════
-- Barato y explícito: si algo de arriba no quedó, el error nombra QUÉ falta, en
-- vez de aparecer semanas después como un 42703 disfrazado de 403.
DO $verif$
DECLARE
  v_faltan   text[] := '{}';
  v_sin_sello bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'reward_tiers' AND column_name = 'tier_key'
  ) THEN v_faltan := v_faltan || 'reward_tiers.tier_key'; END IF;

  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'mystery_box_results'
         AND column_name IN ('claimed_tier_key', 'claimed_threshold')) <> 2
  THEN v_faltan := v_faltan || 'las 2 columnas claimed_* de mystery_box_results'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'reward_tiers_tier_key_tenant_sede_unique'
  ) THEN v_faltan := v_faltan || 'reward_tiers_tier_key_tenant_sede_unique'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'idx_mystery_box_results_claims'
  ) THEN v_faltan := v_faltan || 'idx_mystery_box_results_claims'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'sellar_nivel_reclamado'
  ) THEN v_faltan := v_faltan || 'sellar_nivel_reclamado()'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_mystery_box_results_sella_nivel'
       AND tgrelid = 'public.mystery_box_results'::regclass
  ) THEN v_faltan := v_faltan || 'trg_mystery_box_results_sella_nivel'; END IF;

  IF array_length(v_faltan, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00059 quedo a medias. Falta: %', array_to_string(v_faltan, ', ');
  END IF;

  -- El backfill tiene que haber alcanzado a TODA la historia. Un reclamo sin
  -- sellar lo lee la ruta como "no reclamado" y le ofrece premio a ese cliente
  -- otra vez: exactamente el bug que este archivo cierra.
  SELECT count(*) INTO v_sin_sello
    FROM mystery_box_results
   WHERE claimed_tier_key IS NULL OR claimed_threshold IS NULL;

  IF v_sin_sello > 0 THEN
    RAISE EXCEPTION
      '00059: quedaron % reclamos sin sellar en mystery_box_results. Cada uno es un premio que se volveria a ofrecer. Revisar antes de desplegar.',
      v_sin_sello;
  END IF;
END
$verif$;
