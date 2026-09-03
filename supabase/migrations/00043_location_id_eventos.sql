-- ═══════════════════════════════════════════════════════════════
-- Migration 00043: `location_id` en las tablas de EVENTOS
-- Fecha: 2026-09-03
-- Spec: docs/superpowers/specs/2026-09-02-multisede-design.md §4 (bloque 00043)
-- Requerimiento: docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md §23.ter
--                (decisiones D2, D4, D8, D9, D12 del dueño)
-- Fase: F2 de §10 del spec.
--
-- QUÉ HACE
-- --------
-- Agrega la dimensión "sede" a las 13 tablas que registran HECHOS. Nada más.
-- Todas las columnas nacen VACÍAS y NADIE las lee todavía: después de aplicar
-- esta migración el sistema se comporta EXACTAMENTE igual que antes — mismos
-- envíos, mismos crons, mismas campañas, mismos 4 tenants Twilio. Quien las
-- LLENA es F3 (resolución de sede); quien las LEE, F5/F6/F7.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, A PROPÓSITO
-- ------------------------------------------
-- · NO backfillea NADA. El histórico de los 4 tenants vivos (~1581 `visits`,
--   ~991 `point_transactions`, ~685 `review_events`, ~1176 `customers`) se queda
--   en NULL. NULL significa "sede desconocida" y se MUESTRA, como un cubo propio
--   llamado "Sin sede": nunca se reparte ni se esconde. Repartirlo sería
--   adivinar, y el número adivinado terminaría en un reporte de plata.
-- · NO toca `restaurant_locations` (es la 00041) ni `staff_users`/`staff_devices`
--   (la 00044), ni crea la vista `customer_location_membership` (la 00046).
-- · NO agrega, cambia ni borra una sola política RLS. El alcance por sede es la
--   00045 (F7).
--
-- LAS DOS REGLAS TRANSVERSALES, SIN EXCEPCIONES
-- ---------------------------------------------
-- 1. Toda columna de sede es NULLABLE. La sede se conoce a veces, no siempre.
--
-- 2. Toda columna de sede lleva FK COMPUESTA:
--        (columna, tenant_id) REFERENCES restaurant_locations (id, tenant_id)
--        ON DELETE RESTRICT
--
--    POR QUÉ COMPUESTA. El aislamiento real del producto no lo da el RLS: la app
--    corre con `service_role` en la mayoría de rutas, y el filtro por marca son
--    144 `.eq('tenant_id', …)` escritos a mano en 48 archivos. El que se olvida
--    uno no recibe ningún error. La FK compuesta mueve esa garantía al MOTOR para
--    la dimensión nueva: es imposible grabar un hecho de la marca A contra una
--    sede de la marca B. Una FK simple sobre `id` lo permitiría y Postgres no
--    diría absolutamente nada — que es la peor clase de bug de este producto.
--    Cuesta un índice por columna (bloque 3), todos parciales y hoy vacíos.
--
--    POR QUÉ `MATCH SIMPLE` (el default) Y NO `MATCH FULL`. Con MATCH SIMPLE, si
--    ALGUNA columna de la pareja es NULL la FK se da por satisfecha — que es
--    exactamente lo que hace falta aquí: una visita histórica tiene `tenant_id`
--    NOT NULL y `location_id` NULL, y debe pasar. `MATCH FULL` exige "todas NULL
--    o ninguna NULL" y rechazaría cada fila de historia de los 4 tenants vivos.
--
--    POR QUÉ `ON DELETE RESTRICT` Y NO `SET NULL`. Una sede NUNCA se borra: se
--    desactiva con `is_active = false`. `SET NULL` degradaría historia a "sede
--    desconocida" EN SILENCIO el día que alguien intente borrar una sede, y
--    destruiría justo el dato que D12 pide medir. RESTRICT convierte ese borrado
--    en un error ruidoso, que es lo que debe ser.
--
-- Depende de: 00041 — `UNIQUE (id, tenant_id)` sobre `restaurant_locations`, el
--             soporte de TODAS las FK compuestas de aquí abajo. El bloque 0 lo
--             comprueba y aborta la migración entera si falta, en vez de dejarla
--             aplicada a medias.
--             También de 00025/00028 (`tenant_id NOT NULL` en las 18 tablas de
--             negocio) y de las migraciones que crean cada tabla.
--
-- Aplicar en el SQL Editor de Supabase (este proyecto no usa Supabase CLI).
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 0. Guarda de dependencia: sin la 00041 esto no puede existir
-- ─────────────────────────────────────────────────────────────
-- Comprueba por FORMA, no por nombre: lo que importa es que exista ALGÚN índice
-- único (o el PK) sobre exactamente las dos columnas `(id, tenant_id)`, se llame
-- como se llame. Sin él, cada `ADD CONSTRAINT ... FOREIGN KEY` del bloque 2
-- fallaría con 42830 uno por uno; así falla una sola vez y dice por qué.
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
      '00043 requiere 00041: falta UNIQUE (id, tenant_id) en restaurant_locations.'
      USING ERRCODE = '42830';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 1. Las columnas — todas NULLABLE, todas vacías
-- ─────────────────────────────────────────────────────────────

-- ── visits ── dónde ocurrió la visita + DE DÓNDE SALIÓ ese dato.
ALTER TABLE visits ADD COLUMN IF NOT EXISTS location_id       uuid    NULL;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS location_source   text    NULL;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS location_conflict boolean NULL;

-- ── point_transactions ── dónde se generó el punto.
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS location_id uuid NULL;

-- ── review_events ── contra qué ficha de Google se midió el embudo (D5).
ALTER TABLE review_events ADD COLUMN IF NOT EXISTS location_id uuid NULL;

-- ── reward_grants / reward_redemptions ── las DOS sedes de un premio (D3 + D12).
ALTER TABLE reward_grants      ADD COLUMN IF NOT EXISTS granted_location_id  uuid NULL;
ALTER TABLE reward_redemptions ADD COLUMN IF NOT EXISTS redeemed_location_id uuid NULL;

-- ── message_logs ── DOS columnas, no una (§4 del spec, conflicto 8 de §11).
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS location_id      uuid NULL;
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS line_location_id uuid NULL;

-- ── tenant_wallet_transactions ── la sede del asiento contable (D4).
ALTER TABLE tenant_wallet_transactions ADD COLUMN IF NOT EXISTS location_id uuid NULL;

-- ── send_queue ── que el goteo no pierda la sede entre encolar y enviar.
ALTER TABLE send_queue ADD COLUMN IF NOT EXISTS location_id uuid NULL;

-- ── consent_events ── evidencia de DÓNDE se dio el consentimiento, no permiso.
ALTER TABLE consent_events ADD COLUMN IF NOT EXISTS location_id uuid NULL;

-- ── campaigns ── qué sede la lanzó.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS location_id uuid NULL;

-- ── authorized_numbers ── el operador de domicilios es de UNA sede (D9).
ALTER TABLE authorized_numbers ADD COLUMN IF NOT EXISTS location_id uuid NULL;

-- ── restaurant_events ── D8, «vital» para el dueño. Ojo con la semántica: aquí
--    NULL NO significa "sede desconocida". Ver bloque 4 y el COMMENT del bloque 5.
ALTER TABLE restaurant_events ADD COLUMN IF NOT EXISTS location_id uuid NULL;
ALTER TABLE restaurant_events
  ADD COLUMN IF NOT EXISTS audience_scope text NOT NULL DEFAULT 'brand';

-- ── customers ── D2 (sede de origen) + caché de "sede de casa".
--    La fila de cliente SIGUE SIENDO una por (teléfono, marca): estas dos columnas
--    NO parten al cliente, solo lo describen. `customers_phone_tenant_key` no se toca.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS origin_location_id     uuid NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_visit_location_id uuid NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. Las FK COMPUESTAS — la regla transversal, aplicada por el motor
-- ─────────────────────────────────────────────────────────────
-- Postgres no tiene `ADD CONSTRAINT IF NOT EXISTS`, así que la idempotencia va a
-- mano. Se recorre la lista una sola vez para que sea imposible que una tabla
-- reciba la columna y se quede sin su FK por un copy-paste.
DO $$
DECLARE
  r          record;
  v_nombre   text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('visits',                     'location_id'),
      ('point_transactions',         'location_id'),
      ('review_events',              'location_id'),
      ('reward_grants',              'granted_location_id'),
      ('reward_redemptions',         'redeemed_location_id'),
      ('message_logs',               'location_id'),
      ('message_logs',               'line_location_id'),
      ('tenant_wallet_transactions', 'location_id'),
      ('send_queue',                 'location_id'),
      ('consent_events',             'location_id'),
      ('campaigns',                  'location_id'),
      ('authorized_numbers',         'location_id'),
      ('restaurant_events',          'location_id'),
      ('customers',                  'origin_location_id'),
      ('customers',                  'last_visit_location_id')
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

    -- ─── 3. El índice que la FK compuesta necesita ───
    -- Postgres indexa el lado REFERENCIADO, nunca el que referencia. Sin esto,
    -- cada intento de borrar una sede haría un seq scan de las 15 tablas para
    -- comprobar el RESTRICT — y el filtro por sede del dashboard (D12) tampoco
    -- tendría por dónde entrar.
    -- Parcial (`WHERE col IS NOT NULL`) a propósito: hoy el 100% de las filas son
    -- NULL, así que los 15 índices juntos ocupan prácticamente cero. El planner
    -- lo usa igual para `col = $1`, porque esa igualdad implica `IS NOT NULL`.
    -- El cubo "Sin sede" (`col IS NULL`) no lo usa, y no lo necesita: para eso ya
    -- está `idx_<tabla>_tenant` de la 00025.
    -- NUNCA `CONCURRENTLY`: el harness de tests manda el archivo entero en un
    -- solo `client.query()`, el protocolo simple lo envuelve en una transacción
    -- implícita y `CREATE INDEX CONCURRENTLY` muere ahí con 25001.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, %I) WHERE %I IS NOT NULL',
      'idx_' || r.tabla || '_' || r.col, r.tabla, r.col, r.col
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Los CHECK — procedencia del dato y audiencia del evento
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- ── visits.location_source: las 7 vías del §3.1 del spec ──
  -- Sin la procedencia, una sede mal resuelta es INDISTINGUIBLE de una bien
  -- resuelta, y D12 se apoyaría en un número que nadie puede auditar. Con ella el
  -- panel puede decir "el 12% de tus visitas entraron por el dominio raíz".
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.visits'::regclass
       AND conname  = 'visits_location_source_check'
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT visits_location_source_check
      CHECK (
        location_source IS NULL
        OR location_source IN (
          'staff_user',        -- mesero autenticado (vía 1, la más fuerte)
          'staff_device',      -- dispositivo registrado (vía 2)
          'host',              -- subdominio de la sede (vía 3)
          'host_single',       -- dominio raíz + el tenant tiene UNA sede activa
          'qr_token',          -- claim `loc` del JWT del QR
          'authorized_number', -- número del operador de domicilios (vía 4, D9)
          'manual'             -- corrección explícita de un admin
        )
      );
  END IF;

  -- ── visits: la sede y su procedencia van JUNTAS o no van ──
  -- Una `location_id` sin `location_source` es un dato sin auditoría; un
  -- `location_source` sin `location_id` es una procedencia de nada.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.visits'::regclass
       AND conname  = 'visits_location_pareja_check'
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT visits_location_pareja_check
      CHECK ((location_id IS NULL) = (location_source IS NULL));
  END IF;

  -- ── restaurant_events.audience_scope: 'brand' | 'location' ──
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.restaurant_events'::regclass
       AND conname  = 'restaurant_events_audience_scope_check'
  ) THEN
    ALTER TABLE restaurant_events ADD CONSTRAINT restaurant_events_audience_scope_check
      CHECK (audience_scope IN ('brand', 'location'));
  END IF;

  -- ── restaurant_events: el alcance amarrado a la sede ──
  -- 'location' EXIGE sede; 'brand' EXIGE que no la haya. Sin este CHECK, un
  -- evento podría quedar marcado "de la sede X" y a la vez dispararse a toda la
  -- marca, o al revés — y el que lo lea no tendría forma de saber cuál manda.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.restaurant_events'::regclass
       AND conname  = 'restaurant_events_audience_pareja_check'
  ) THEN
    ALTER TABLE restaurant_events ADD CONSTRAINT restaurant_events_audience_pareja_check
      CHECK ((audience_scope = 'location') = (location_id IS NOT NULL));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. COMMENTs — la semántica, donde no se puede perder
-- ─────────────────────────────────────────────────────────────

COMMENT ON COLUMN visits.location_id IS
  'Sede donde ocurrio la visita. NULL = SEDE DESCONOCIDA (historico anterior a multi-sede, o ninguna de las 4 vias del spec §3.1 pudo resolverla). NULL se MUESTRA como el cubo "Sin sede": no se reparte ni se esconde.';
COMMENT ON COLUMN visits.location_source IS
  'De donde salio location_id: staff_user | staff_device | host | host_single | qr_token | authorized_number | manual. Va junto con location_id (CHECK visits_location_pareja_check). Sin esto, una sede mal resuelta es indistinguible de una bien resuelta y D12 no se puede auditar.';
COMMENT ON COLUMN visits.location_conflict IS
  'TRI-ESTADO a proposito. NULL = no se evaluo (todo el historico, y cualquier check-in sin claim `loc` en el JWT del QR). false = se evaluo y el QR coincidia con la sede resuelta. true = el QR decia OTRA sede (cliente que abrio su enlace guardado de otra sede). NO se usa como control de acceso: el QR solo DETECTA el conflicto, nunca gana (§3.1 y conflicto 7 de §11).';

COMMENT ON COLUMN point_transactions.location_id IS
  'Sede donde se genero el punto. NULL = sede desconocida. Los puntos siguen siendo de la MARCA: esta columna atribuye, no separa saldos.';

COMMENT ON COLUMN review_events.location_id IS
  'Sede cuya ficha de Google se mostro (D5). NULL = sede desconocida.';

COMMENT ON COLUMN reward_grants.granted_location_id IS
  'Sede donde se GANO el premio (D12). NULL = sede desconocida. Cruzada con reward_redemptions.redeemed_location_id da la matriz origen -> destino que convierte D3 ("el premio ganado en una sede se reclama en otra") de politica invisible en numero.';

COMMENT ON COLUMN reward_redemptions.redeemed_location_id IS
  'Sede donde se ENTREGO fisicamente el premio (D3 + D12). NULL = sede desconocida. Es la que responde "cuantos premios entrega cada sede"; la efectividad se mide con granted_location_id.';

COMMENT ON COLUMN message_logs.location_id IS
  'Sede a la que se IMPUTA el mensaje (D4: billetera de la marca, con desglose por sede obligatorio). NULL = sede desconocida. NO es lo mismo que line_location_id.';
COMMENT ON COLUMN message_logs.line_location_id IS
  'Sede duena de la LINEA de WhatsApp por la que salio el mensaje (D6, sin decidir). Existe separada de location_id porque line_budget() calcula el p95 transaccional sobre 14 dias de esta tabla y, con lineas por sede, ese p95 tiene que ser POR LINEA: si no, el volumen de la sede A infla la reserva de la sede B y le come el presupuesto en silencio. send_reservations no sirve para esto (se poda a 7 dias). NULL = linea unica de la marca, o desconocida.';

COMMENT ON COLUMN tenant_wallet_transactions.location_id IS
  'Sede a la que se imputa el movimiento. SE DENORMALIZA, NO SE DERIVA: tenant_wallet_transactions_message_log_id_fkey es ON DELETE SET NULL (verificado en produccion), asi que derivar la sede por JOIN contra message_logs la perderia ENTERA e irrecuperablemente el dia que se pode esa tabla. Un asiento contable no puede colgar de una FK que se anula — mismo criterio por el que la 00033 ya guarda unit_price_cop como snapshot. NULL = sede desconocida.';

COMMENT ON COLUMN send_queue.location_id IS
  'Sede del envio encolado, para que el goteo no la pierda entre encolar y drenar. NULL = sede desconocida. Se copia a message_logs.location_id al enviar (F6).';

COMMENT ON COLUMN consent_events.location_id IS
  'Sede donde se registro el consentimiento. Es EVIDENCIA, NO PERMISO: el opt-out y el opt-in siguen siendo de la MARCA (§6.4) — un cliente que dice "no me escriban" no lo dice por sede. Esta columna solo permite reconstruir donde ocurrio el hecho. NULL = sede desconocida.';

COMMENT ON COLUMN campaigns.location_id IS
  'Sede que lanzo la campana. NULL = sede desconocida o campana de marca. El reloj de inactividad de los crons de rescate SIGUE SIENDO DE LA MARCA (§8.2): lo que se parte por sede es la atribucion, no el reloj.';

COMMENT ON COLUMN authorized_numbers.location_id IS
  'Sede del operador de domicilios (D9). Es la senal AUTENTICADA de la que sale la sede de un pedido: el celular que manda el cuadro ya se contrasta contra esta tabla, y la firma de Twilio ya se valida. NULL = sede desconocida.';

-- ⚠️ LA EXCEPCION DE TODO EL MODELO. Leer antes de tocar restaurant_events.
COMMENT ON COLUMN restaurant_events.location_id IS
  '⚠️ ATENCION: esta es la UNICA tabla del schema donde NULL **NO** significa "sede desconocida". Aqui NULL solo es valido con audience_scope = ''brand'', y entonces significa "evento de TODA LA MARCA". Por eso el alcance va en una columna EXPLICITA y no se infiere del NULL: dos lecturas opuestas del mismo NULL en el mismo sistema es una clase entera de bug (conflicto 5 de §11 del spec). Ver audience_scope.';
COMMENT ON COLUMN restaurant_events.audience_scope IS
  'A quien va dirigido el evento (D8, marcado VITAL por el dueno): ''brand'' = toda la marca (exige location_id NULL) | ''location'' = una sede (exige location_id NOT NULL). Lo amarra el CHECK restaurant_events_audience_pareja_check. DEFAULT ''brand'' para que los eventos que ya existen NO cambien de comportamiento. La audiencia de ''location'' se arma con el criterio `pertenece` de customer_location_membership (00046, F5), no con el filtro `city`: `city` es la ciudad DEL CLIENTE, asi que dos sedes de la misma ciudad quedan identicas.';

COMMENT ON COLUMN customers.origin_location_id IS
  'Sede donde se REGISTRO el cliente (D2). Corregible solo por el admin de marca. NULL = sede desconocida (todo el historico). No parte al cliente: customers_phone_tenant_key UNIQUE (phone, tenant_id) NO se toca, y por eso los puntos siguen unificados entre sedes sin escribir una linea de codigo.';
COMMENT ON COLUMN customers.last_visit_location_id IS
  'CACHE de la sede de la ultima visita ("sede de casa"). Derivable de visits, se guarda por velocidad. NULL = sede desconocida. La verdad canonica de "los clientes de una sede" es la vista customer_location_membership (00046, F5), no esta columna.';

-- ─────────────────────────────────────────────────────────────
-- 6. Verificación — que la migración diga si se aplicó entera
-- ─────────────────────────────────────────────────────────────
-- Se comprueba UNA POR UNA la lista canónica del bloque 2, no con `LIKE` sobre
-- nombres: un patrón podría contar de más si otra migración del set (00041,
-- 00044…) bautiza un índice parecido, y entonces esta verificación mentiría en
-- la dirección peligrosa — diciendo "completa" cuando falta algo.
DO $$
DECLARE
  r        record;
  v_falta  text[] := ARRAY[]::text[];
  v_nombre text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('visits',                     'location_id'),
      ('point_transactions',         'location_id'),
      ('review_events',              'location_id'),
      ('reward_grants',              'granted_location_id'),
      ('reward_redemptions',         'redeemed_location_id'),
      ('message_logs',               'location_id'),
      ('message_logs',               'line_location_id'),
      ('tenant_wallet_transactions', 'location_id'),
      ('send_queue',                 'location_id'),
      ('consent_events',             'location_id'),
      ('campaigns',                  'location_id'),
      ('authorized_numbers',         'location_id'),
      ('restaurant_events',          'location_id'),
      ('customers',                  'origin_location_id'),
      ('customers',                  'last_visit_location_id')
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

  -- Las tres columnas que no son de sede pero completan la semántica.
  FOR r IN
    SELECT * FROM (VALUES
      ('visits',            'location_source'),
      ('visits',            'location_conflict'),
      ('restaurant_events', 'audience_scope')
    ) AS t(tabla, col)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = r.tabla AND column_name = r.col
    ) THEN
      v_falta := v_falta || (r.tabla || '.' || r.col || ' (columna)');
    END IF;
  END LOOP;

  -- Los 4 CHECK.
  FOREACH v_nombre IN ARRAY ARRAY[
    'visits_location_source_check',
    'visits_location_pareja_check',
    'restaurant_events_audience_scope_check',
    'restaurant_events_audience_pareja_check'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE contype = 'c' AND conname = v_nombre
    ) THEN
      v_falta := v_falta || (v_nombre || ' (CHECK)');
    END IF;
  END LOOP;

  IF array_length(v_falta, 1) IS NOT NULL THEN
    RAISE EXCEPTION '00043 incompleta, falta: %', array_to_string(v_falta, ', ');
  END IF;

  RAISE NOTICE '00043 OK: 18 columnas de sede, 15 FK compuestas (id, tenant_id) ON DELETE RESTRICT, 15 indices parciales y 4 CHECK. Todas las columnas nacen VACIAS: cero cambio de comportamiento.';
END $$;
