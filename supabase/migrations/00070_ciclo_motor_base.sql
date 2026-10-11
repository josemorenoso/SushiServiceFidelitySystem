-- ═══════════════════════════════════════════════════════════════════════════
-- 00070 — Ciclo de recuperación, fase 1A: la base del motor
-- 2026-10-11
--
-- Ref: docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md §3, §7.1, §13, §14
--      docs/features/ritmo-adaptativo.md
--      docs/prompts/2026-10-11-ciclo-fase-1a-motor-base.md
--
-- QUÉ HACE
--   1. `customers` gana el estado del ciclo: número de ciclo, desde cuándo, cuántos
--      mensajes lleva sin volver, activo/dormido/archivado, y el RITMO PERSONAL.
--   2. `customer_cycle_touches`: el libro de toques (idempotencia por etapa y ciclo,
--      atribución a 14 días y grupo de control). Nadie escribe en ella todavía: la
--      llena el cron de la fase 1B.
--   3. Las funciones del ritmo, ESPEJO de `src/lib/cycle-engine.ts` (los cortes
--      < 9 · < 19 · ≤ 35 y la mediana sobre DÍAS DISTINTOS en hora de Bogotá).
--      `tests/db/cycle-triggers.test.ts` compara SQL y TS con los mismos historiales.
--   4. Tres triggers: el alta fija `cycle_started_at`; la visita reinicia el ciclo,
--      atribuye el regreso y fija el ritmo personal; cada mensaje de marketing que
--      SALE suma para la fatiga y al sexto duerme al cliente.
--   5. El backfill, hacia adelante y sin ráfaga.
--
-- LO QUE NO CAMBIA (y por qué esta migración no rompe nada aunque se despliegue antes)
--   Ningún código en producción lee ni escribe las columnas ni la tabla nuevas en la
--   fase 1A. Los triggers solo escriben columnas del ciclo, y los dos que corren en el
--   camino de un check-in o de un envío llevan `EXCEPTION WHEN OTHERS` → WARNING: el
--   ciclo NUNCA tumba una visita ni el registro de un mensaje (mismo criterio que
--   `debit_wallet_on_message_sent()`, 00033). Igual, la regla de la casa: migración
--   PRIMERO, push después.
--
-- DECISIONES QUE NO ESTÁN LITERALES EN EL SPEC (todas en el CHANGELOG del 2026-10-11)
--   · El trigger de visita es BEFORE UPDATE, no AFTER: escribe el reinicio en la MISMA
--     versión de la fila (una escritura en vez de dos) y el `RETURNING` del UPDATE de
--     `incrementVisit()` ya trae el ciclo nuevo. Un AFTER tendría que volver a hacer
--     UPDATE sobre `customers`.
--   · Su condición acepta `OLD.last_visit_at IS NULL`: con el literal del spec
--     (`NEW > OLD`), la PRIMERA visita de quien se registró sin visita (invitación,
--     `countFirstVisit = false`) daba NULL y el ciclo no arrancaba nunca.
--   · El alta con `countFirst` es un INSERT, y un trigger de UPDATE no lo ve: el
--     BEFORE INSERT de abajo le pone `cycle_started_at` (ciclo 1, sin ritmo: una visita).
--   · La visita se graba en `visits` DESPUÉS del UPDATE de `customers`
--     (`incrementVisit()` → `createVisit()`): el ritmo personal cuenta el día de
--     `NEW.last_visit_at` además de las filas de `visits`.
--   · La atribución elige entre toques `sent` y `holdout`: uno `failed`, `queued`,
--     `pending` o `deferred` no le llegó al cliente y no lo pudo traer.
--   · `cycle_no` es la LLAVE de los toques, no un contador de visitas: el backfill pone 1
--     a todos (Sara con 9 visitas incluida) y quien se registró sin visita abre el ciclo 2
--     en su primera visita. «Nuevo» en las pantallas se mide con `total_visits`.
--   · El índice `(customer_id, cycle_no)` que pide el spec ya lo da el UNIQUE
--     `(customer_id, cycle_no, stage, seq)`, que empieza por esas dos columnas.
--
-- IDEMPOTENTE: corre dos veces sin error y sin re-backfillear (el backfill solo toca
-- filas con `cycle_started_at IS NULL`, y desde esta migración ninguna nace así).
--
-- RIESGO: BAJO. `ADD COLUMN … NOT NULL DEFAULT <constante>` no reescribe la tabla
-- (PG ≥ 11). El backfill es un UPDATE sobre ~2.000 clientes; mueve `updated_at` de
-- todos (lo pisa `handle_updated_at()`): ningún código lo lee.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- 1. customers: el estado del ciclo
-- ───────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS cycle_no             integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cycle_started_at     timestamptz,
  ADD COLUMN IF NOT EXISTS cycle_touches        integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cycle_state          text        NOT NULL DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS dormant_since        timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeats_sent      integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strong_offer_last_at timestamptz,
  ADD COLUMN IF NOT EXISTS cycle_rhythm         text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.customers'::regclass AND conname = 'customers_cycle_state_check') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_cycle_state_check
      CHECK (cycle_state IN ('activo', 'dormido', 'archivado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.customers'::regclass AND conname = 'customers_cycle_rhythm_check') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_cycle_rhythm_check
      CHECK (cycle_rhythm IS NULL OR cycle_rhythm IN ('cafe', 'casual', 'restaurant', 'occasional'));
  END IF;
END $$;

COMMENT ON COLUMN customers.cycle_no IS
  'Ciclo de recuperación vigente (00070). Sube en cada visita. Es la LLAVE de customer_cycle_touches, no un contador de visitas: el backfill puso 1 a todos. Para «nuevo» se usa total_visits.';
COMMENT ON COLUMN customers.cycle_started_at IS
  'Inicio del ciclo vigente = la última visita (o el alta, si nunca vino). Lo escriben los triggers de 00070.';
COMMENT ON COLUMN customers.cycle_touches IS
  'Mensajes de marketing que SALIERON desde la última visita (manual, calendario, ciclo; NO cumpleaños ni recordatorio de premio). Al llegar a cycle_fatigue_touches (6) el cliente pasa a dormido. Vuelve a 0 con la visita.';
COMMENT ON COLUMN customers.cycle_state IS
  'activo | dormido | archivado (spec del ciclo §3.1). La visita lo devuelve a activo.';
COMMENT ON COLUMN customers.cycle_rhythm IS
  'Ritmo PERSONAL (cafe|casual|restaurant|occasional) fijado al abrir el ciclo, con 3+ días distintos con visita. NULL = usa el de la marca (admin_settings.cycle_rhythm). Espejo de rhythmFromMedian() en cycle-engine.ts.';
COMMENT ON COLUMN customers.heartbeats_sent IS
  'Toques trimestrales enviados en este período dormido (máx. 2). Lo escribe la fase 1B.';
COMMENT ON COLUMN customers.strong_offer_last_at IS
  'Último regalo FUERTE (cooldown de 180 días por cliente). Lo escribe la fase 1B.';

-- ───────────────────────────────────────────────
-- 2. customer_cycle_touches: el libro de toques
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_cycle_touches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SIN default, a propósito: la 00030 no corrió y las 18 tablas viejas conservan el
  -- DEFAULT puente que manda un INSERT sin tenant a Sushi Service. Acá un INSERT sin
  -- `tenant_id` FALLA por el NOT NULL en vez de irse callado a otra marca.
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  cycle_no            integer NOT NULL,
  stage               text NOT NULL CHECK (stage IN ('t1', 't2', 't3', 't4', 't5', 'heartbeat')),
  seq                 integer NOT NULL DEFAULT 1 CHECK (seq >= 1),
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'queued', 'sent', 'failed', 'holdout', 'deferred')),
  holdout             boolean NOT NULL DEFAULT false,
  channel             text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  due_at              timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  campaign_message_id uuid REFERENCES campaign_messages(id) ON DELETE SET NULL,
  grant_id            uuid REFERENCES reward_grants(id) ON DELETE SET NULL,
  returned_at         timestamptz,
  location_id         uuid NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- Las cuatro columnas son NOT NULL: el UNIQUE protege de verdad (dos NULL no chocan).
  CONSTRAINT customer_cycle_touches_once UNIQUE (customer_id, cycle_no, stage, seq),
  -- El grupo de control NO se envía: nunca puede quedar en cola, enviado ni fallido.
  CONSTRAINT customer_cycle_touches_holdout_no_sale
    CHECK (NOT holdout OR status IN ('pending', 'holdout', 'deferred')),
  CONSTRAINT customer_cycle_touches_status_holdout_es_holdout
    CHECK (status <> 'holdout' OR holdout)
);

COMMENT ON TABLE customer_cycle_touches IS
  'Un toque del ciclo de recuperación por cliente, ciclo, etapa y repetición (00070). Idempotencia del cron (UNIQUE), atribución del regreso a 14 días (returned_at, también en holdout) y grupo de control. Toda fila lleva tenant_id EXPLÍCITO.';
COMMENT ON COLUMN customer_cycle_touches.due_at IS
  'Cuándo le tocaba el toque, se haya enviado o no (H5): la atribución mira esto, no sent_at, para que el grupo de control sea medible.';
COMMENT ON COLUMN customer_cycle_touches.holdout IS
  'Grupo de control: NO se envía, SÍ se atribuye. Sorteo estable por cliente + etapa + ciclo (isHoldout() en cycle-engine.ts, H4).';
COMMENT ON COLUMN customer_cycle_touches.channel IS
  'Por dónde salió (decisión 21). Hoy solo whatsapp.';
COMMENT ON COLUMN customer_cycle_touches.location_id IS
  'Sede del toque. NULL = sede desconocida o toque de marca; se muestra, no se backfillea. FK compuesta RESTRICT.';

-- La sede, como en la 00043 / 00058 / 00063: FK COMPUESTA, nunca simple.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.customer_cycle_touches'::regclass
       AND conname = 'customer_cycle_touches_location_id_tenant_fkey'
  ) THEN
    ALTER TABLE customer_cycle_touches
      ADD CONSTRAINT customer_cycle_touches_location_id_tenant_fkey
      FOREIGN KEY (location_id, tenant_id)
      REFERENCES restaurant_locations (id, tenant_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- El índice por (customer_id, cycle_no) ya existe: es el prefijo del UNIQUE de arriba.
-- Nunca CONCURRENTLY: el arnés manda el archivo en una sola transacción.
CREATE INDEX IF NOT EXISTS idx_customer_cycle_touches_tenant_due
  ON customer_cycle_touches (tenant_id, due_at);
CREATE INDEX IF NOT EXISTS idx_customer_cycle_touches_location
  ON customer_cycle_touches (tenant_id, location_id) WHERE location_id IS NOT NULL;

-- RLS: el patrón de la 00026 (marca) + el RESTRICTIVE de sede de la 00045, que se
-- autodescubrió sobre las tablas con `tenant_id` y `location_id` que existían entonces.
ALTER TABLE customer_cycle_touches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_all_customer_cycle_touches" ON customer_cycle_touches;
CREATE POLICY "tenant_all_customer_cycle_touches" ON customer_cycle_touches FOR ALL
  USING      (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "sede_visible_customer_cycle_touches" ON customer_cycle_touches;
CREATE POLICY "sede_visible_customer_cycle_touches" ON customer_cycle_touches
  AS RESTRICTIVE FOR ALL TO authenticated
  USING      (is_super_admin() OR can_see_location(location_id))
  WITH CHECK (is_super_admin() OR can_see_location(location_id));

-- ───────────────────────────────────────────────
-- 3. El ritmo — ESPEJO de src/lib/cycle-engine.ts
-- ───────────────────────────────────────────────
-- Los cortes (spec §3.2.bis, decisión A4): < 9 → cafe · 9–18 → casual · 19–35 →
-- restaurant · > 35 → occasional. Con una mediana fraccionaria (número par de huecos)
-- 18,5 es casual y 35,5 es occasional, igual que en `rhythmFromMedian()`.
CREATE OR REPLACE FUNCTION cycle_rhythm_from_median(p_median double precision)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN p_median IS NULL THEN NULL
           WHEN p_median < 9     THEN 'cafe'
           WHEN p_median < 19    THEN 'casual'
           WHEN p_median <= 35   THEN 'restaurant'
           ELSE 'occasional'
         END
$$;

-- Mediana de días entre los DÍAS DISTINTOS con visita del cliente (hora de Bogotá).
-- `p_extra` es la visita que todavía no está en `visits`: `incrementVisit()` escribe
-- `last_visit_at` antes de que `createVisit()` inserte la fila. NULL con menos de 3 días.
CREATE OR REPLACE FUNCTION cycle_customer_median_gap(p_customer_id uuid, p_extra timestamptz DEFAULT NULL)
RETURNS double precision
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH dias AS (
    SELECT (v.created_at AT TIME ZONE 'America/Bogota')::date AS dia
      FROM visits v
     WHERE v.customer_id = p_customer_id
    UNION
    SELECT (p_extra AT TIME ZONE 'America/Bogota')::date
     WHERE p_extra IS NOT NULL
  ),
  huecos AS (
    SELECT dia - lag(dia) OVER (ORDER BY dia) AS hueco FROM dias
  )
  SELECT CASE WHEN count(hueco) >= 2
              THEN percentile_cont(0.5) WITHIN GROUP (ORDER BY hueco)
         END
    FROM huecos
$$;

-- El dato del ritmo de la MARCA: la mediana de días entre visitas de todos sus
-- clientes (días distintos, hora de Bogotá) y cuántos regresos hay (= huecos). El TS
-- decide con eso (`brandRhythm()`: 30 regresos o más, la mediana elige; si no,
-- `restaurant`). SECURITY INVOKER, como `staff_activity_report()` (00065): la llama
-- el service role.
CREATE OR REPLACE FUNCTION cycle_brand_rhythm_stats(p_tenant_id uuid)
RETURNS TABLE (median_gap_days double precision, returns_count integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH dias AS (
    SELECT DISTINCT v.customer_id, (v.created_at AT TIME ZONE 'America/Bogota')::date AS dia
      FROM visits v
      JOIN customers c ON c.id = v.customer_id
     WHERE c.tenant_id = p_tenant_id
  ),
  huecos AS (
    SELECT dia - lag(dia) OVER (PARTITION BY customer_id ORDER BY dia) AS hueco FROM dias
  )
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY hueco), count(hueco)::integer
    FROM huecos
$$;

-- ───────────────────────────────────────────────
-- 4. Los triggers
-- ───────────────────────────────────────────────

-- 4.a El alta. `createCustomer()` con `countFirst` escribe `last_visit_at` en el
--     INSERT: ningún trigger de UPDATE lo ve. Ciclo 1 desde esa visita (o desde el
--     alta, si se registró sin visita); con una sola visita no hay ritmo personal.
CREATE OR REPLACE FUNCTION cycle_on_customer_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.cycle_started_at IS NULL THEN
    NEW.cycle_started_at := COALESCE(NEW.last_visit_at, NEW.created_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_customer_insert_cycle ON customers;
CREATE TRIGGER on_customer_insert_cycle
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION cycle_on_customer_insert();

-- 4.b La visita: reinicio + atribución + ritmo personal.
--     Lo disparan TODOS los escritores de `last_visit_at` (check-in por QR, escaneo del
--     mesero, override del panel y domicilio pasan por `incrementVisit()`), y cualquiera
--     futuro, sin tocar TypeScript.
CREATE OR REPLACE FUNCTION cycle_on_customer_visit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ritmo text := OLD.cycle_rhythm;
  v_toque uuid;
BEGIN
  BEGIN
    -- Atribución: el ÚLTIMO toque del ciclo que se cierra que le tocaba en los 14 días
    -- anteriores a esta visita. También el grupo de control: así se compara «con mensaje»
    -- contra «sin mensaje» (spec §3.4, H5).
    SELECT t.id INTO v_toque
      FROM customer_cycle_touches t
     WHERE t.customer_id = NEW.id
       AND t.cycle_no = OLD.cycle_no
       AND t.status IN ('sent', 'holdout')
       AND t.returned_at IS NULL
       AND t.due_at <= NEW.last_visit_at
       AND t.due_at >= NEW.last_visit_at - interval '14 days'
     ORDER BY t.due_at DESC, t.created_at DESC
     LIMIT 1;

    IF v_toque IS NOT NULL THEN
      UPDATE customer_cycle_touches SET returned_at = now() WHERE id = v_toque;
    END IF;

    -- Ritmo personal: con 3 o más días distintos con visita, la mediana elige; con menos, NULL.
    v_ritmo := cycle_rhythm_from_median(cycle_customer_median_gap(NEW.id, NEW.last_visit_at));
  EXCEPTION WHEN OTHERS THEN
    -- El ciclo no tumba una visita. Se reinicia igual; queda el ritmo anterior y sin atribución.
    RAISE WARNING '[ciclo] on_customer_visit: cliente % sin atribución ni ritmo nuevo (% %). La visita se registra igual.',
      NEW.id, SQLSTATE, SQLERRM;
    v_ritmo := OLD.cycle_rhythm;
  END;

  NEW.cycle_no         := OLD.cycle_no + 1;
  NEW.cycle_started_at := NEW.last_visit_at;
  NEW.cycle_touches    := 0;
  NEW.cycle_state      := 'activo';
  NEW.dormant_since    := NULL;
  NEW.heartbeats_sent  := 0;
  NEW.cycle_rhythm     := v_ritmo;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_customer_visit ON customers;
CREATE TRIGGER on_customer_visit
  BEFORE UPDATE OF last_visit_at ON customers
  FOR EACH ROW
  WHEN (NEW.last_visit_at IS NOT NULL
        AND (OLD.last_visit_at IS NULL OR NEW.last_visit_at > OLD.last_visit_at))
  EXECUTE FUNCTION cycle_on_customer_visit();

-- 4.c La fatiga: cada mensaje de marketing que SALE suma uno; al llegar al tope de la
--     marca (`cycle_fatigue_touches`, 6 por defecto) el cliente se duerme.
--     Se filtra por `campaigns.source`, NO por `campaigns.type`: el recordatorio de
--     premio es `type = 'reactivation'` con `source = 'reward_reminder'` y no cuenta;
--     el cumpleaños (`source = 'birthday'`) tampoco (decisión 2). Golden Bullet graba
--     `source = 'manual'` (el CHECK no tiene 'imported') y cuenta como manual.
--     Emisor-independiente, como el trigger de la billetera (00033). Todos los
--     escritores de `campaign_messages` insertan con el estado final; el paso a
--     `delivered` es un UPDATE y no vuelve a contar.
CREATE OR REPLACE FUNCTION cycle_on_campaign_message_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source text;
  v_crudo  text;
  v_tope   integer := 6;
BEGIN
  BEGIN
    SELECT c.source INTO v_source FROM campaigns c WHERE c.id = NEW.campaign_id;

    -- LAS PIEZAS QUE CANSAN. Espejo de `countsForFatigue` en
    -- src/lib/communications/registry.ts: `communications-registry.test.ts` lee esta línea.
    IF v_source IS NULL OR v_source NOT IN ('manual', 'calendar', 'reactivation') THEN
      RETURN NULL;
    END IF;

    SELECT s.value INTO v_crudo
      FROM customers cu
      JOIN admin_settings s ON s.tenant_id = cu.tenant_id AND s.key = 'cycle_fatigue_touches'
     WHERE cu.id = NEW.customer_id;
    -- Mismo saneamiento que `normalizeCycleSettings()`: entero positivo o el default.
    IF v_crudo ~ '^\s*[0-9]{1,4}\s*$' AND btrim(v_crudo)::integer > 0 THEN
      v_tope := btrim(v_crudo)::integer;
    END IF;

    UPDATE customers
       SET cycle_touches = cycle_touches + 1,
           cycle_state   = CASE WHEN cycle_state = 'activo' AND cycle_touches + 1 >= v_tope
                                THEN 'dormido' ELSE cycle_state END,
           dormant_since = CASE WHEN cycle_state = 'activo' AND cycle_touches + 1 >= v_tope
                                THEN now() ELSE dormant_since END
     WHERE id = NEW.customer_id;
  EXCEPTION WHEN OTHERS THEN
    -- El ciclo no tumba el registro de un mensaje que YA salió (sin esa fila, el tope
    -- mensual y las dedups no lo ven).
    RAISE WARNING '[ciclo] on_campaign_message_sent: cliente % sin contar para la fatiga (% %).',
      NEW.customer_id, SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_campaign_message_sent ON campaign_messages;
CREATE TRIGGER on_campaign_message_sent
  AFTER INSERT ON campaign_messages
  FOR EACH ROW
  WHEN (NEW.status IN ('sent', 'delivered'))
  EXECUTE FUNCTION cycle_on_campaign_message_sent();

-- ───────────────────────────────────────────────
-- 5. Permisos: nada del ciclo abierto a la anon key (regla de la 00069)
-- ───────────────────────────────────────────────
-- Un trigger no necesita EXECUTE del que lo dispara (Postgres no lo mira al
-- ejecutarlo), así que a los tres se les quita sin consecuencia.
REVOKE ALL ON FUNCTION cycle_rhythm_from_median(double precision)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cycle_customer_median_gap(uuid, timestamptz)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cycle_brand_rhythm_stats(uuid)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cycle_on_customer_insert()                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cycle_on_customer_visit()                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cycle_on_campaign_message_sent()                FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cycle_rhythm_from_median(double precision)   TO service_role;
GRANT EXECUTE ON FUNCTION cycle_customer_median_gap(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION cycle_brand_rhythm_stats(uuid)               TO service_role;

-- ───────────────────────────────────────────────
-- 6. Backfill: hacia adelante, sin ráfaga (spec §3.8, decisión 5)
-- ───────────────────────────────────────────────
-- Cada cliente entra al ciclo en el día en que ya está. Quien lleva más de 90 días sin
-- venir (o registrado sin venir) nace dormido con `dormant_since = now()`: su primer toque
-- trimestral, a los 90 días. Ritmo personal para quien ya tenga 3+ días con visita.
-- `cycle_touches` NO se toca: el historial no cuenta para la fatiga.
-- Solo filas con `cycle_started_at IS NULL`: re-correrlo no hace nada.
-- >>> BACKFILL (cycle-triggers.test.ts ejecuta este bloque tal cual)
WITH dias AS (
  SELECT DISTINCT v.customer_id, (v.created_at AT TIME ZONE 'America/Bogota')::date AS dia
    FROM visits v
),
huecos AS (
  SELECT customer_id, dia - lag(dia) OVER (PARTITION BY customer_id ORDER BY dia) AS hueco
    FROM dias
),
personal AS (
  SELECT customer_id, percentile_cont(0.5) WITHIN GROUP (ORDER BY hueco) AS mediana
    FROM huecos
   WHERE hueco IS NOT NULL
   GROUP BY customer_id
  HAVING count(*) >= 2
),
pendientes AS (
  SELECT c.id,
         COALESCE(c.last_visit_at, c.created_at)                                AS desde,
         COALESCE(c.last_visit_at, c.created_at) < now() - interval '90 days'  AS dormido,
         cycle_rhythm_from_median(p.mediana)                                    AS ritmo
    FROM customers c
    LEFT JOIN personal p ON p.customer_id = c.id
   WHERE c.cycle_started_at IS NULL
)
UPDATE customers c
   SET cycle_no         = 1,
       cycle_started_at = p.desde,
       cycle_state      = CASE WHEN p.dormido THEN 'dormido' ELSE 'activo' END,
       dormant_since    = CASE WHEN p.dormido THEN now() END,
       cycle_rhythm     = p.ritmo
  FROM pendientes p
 WHERE c.id = p.id;
-- <<< BACKFILL

-- ───────────────────────────────────────────────
-- 7. Verificación: si falta algo, FALLA (y se deshace todo)
-- ───────────────────────────────────────────────
DO $$
DECLARE
  v_falta text := '';
  v_sin_ciclo integer;
BEGIN
  IF to_regclass('public.customer_cycle_touches') IS NULL THEN
    v_falta := v_falta || ' tabla-customer_cycle_touches';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_customer_visit'
                    AND tgrelid = 'public.customers'::regclass) THEN
    v_falta := v_falta || ' trigger-on_customer_visit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_customer_insert_cycle'
                    AND tgrelid = 'public.customers'::regclass) THEN
    v_falta := v_falta || ' trigger-on_customer_insert_cycle';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_campaign_message_sent'
                    AND tgrelid = 'public.campaign_messages'::regclass) THEN
    v_falta := v_falta || ' trigger-on_campaign_message_sent';
  END IF;
  IF to_regprocedure('public.cycle_brand_rhythm_stats(uuid)') IS NULL THEN
    v_falta := v_falta || ' funcion-cycle_brand_rhythm_stats';
  END IF;

  SELECT count(*) INTO v_sin_ciclo FROM customers WHERE cycle_started_at IS NULL;
  IF v_sin_ciclo > 0 THEN
    v_falta := v_falta || format(' backfill(%s clientes sin cycle_started_at)', v_sin_ciclo);
  END IF;

  IF v_falta <> '' THEN
    RAISE EXCEPTION '00070 incompleta:%', v_falta;
  END IF;

  RAISE NOTICE 'OK 00070: ciclo de recuperación (columnas, customer_cycle_touches, ritmo, 3 triggers, backfill). Nada se envía todavía.';
END $$;
