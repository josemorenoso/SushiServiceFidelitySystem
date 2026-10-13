-- ═══════════════════════════════════════════════════════════════════════════
-- 00071 — Ciclo de recuperación, fase 1B: lo mínimo para que el cron y el drenador
--         se entiendan
-- 2026-10-13
--
-- Ref: docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md §5, §7, §13 (H2, H6)
--      docs/prompts/2026-10-12-ciclo-fase-1b-envios.md §2.1
--      docs/features/ritmo-adaptativo.md §7 · docs/features/send-governance.md
--
-- QUÉ HACE
--   1. `customer_cycle_touches` gana lo que el cron decide y el drenador necesita para
--      enviar: intentos fallidos (tope de 3), el motivo en palabras, el regalo elegido
--      (`reward_id` + `gift_size`), qué plantilla salió (`template_key`) y el estado
--      `cancelled` (volvió, la etapa ya pasó, la marca apagó el ciclo, opt-out).
--   2. `send_queue.cycle_touch_id`: el item de la cola sabe de qué toque es, y
--      `enqueue_send_queue()` lo copia (cuerpo de la 00044 + una línea).
--   3. `reward_grants.skip_reminder`: el regalo PEQUEÑO no lleva recordatorio (H2).
--   4. H6, todo desenlace escribe el toque: el toque SIGUE a su item de la cola. Un
--      trigger sobre `send_queue` lo pasa a `queued` al encolarse y, cuando el item sale
--      de `queued` por cualquier camino —el drenador, `expire_send_queue()` o la
--      cancelación desde el panel—, a `sent`, `failed` (+1 intento) o `cancelled`. Y una
--      reconciliación que el cron corre cada día recoge lo que el trigger no pudo
--      escribir (su `EXCEPTION` solo deja un WARNING).
--
-- LO QUE NO CAMBIA (y por qué aplicarla no enciende nada)
--   `cycle_enabled` sigue en `false` en todas las marcas: nadie escribe las columnas
--   nuevas ni encola items con `cycle_touch_id`, así que los triggers nuevos no se
--   disparan nunca. `enqueue_send_queue()` conserva su firma (CREATE OR REPLACE de
--   verdad, sin sobrecarga) y quien no manda `cycle_touch_id` encola como siempre.
--   `skip_reminder` nace en `false` en todos los premios: el recordatorio sale igual.
--   Igual, la regla de la casa: la migración va ANTES del push que la usa.
--   ⚠️ Al revés SÍ rompe: el código de la 1B le pide `skip_reminder` a PostgREST en el
--   recordatorio de premio; sin la columna es un 42703 y el recordatorio deja de salir
--   en TODAS las marcas (`[RewardGrant] Error buscando candidatos a recordatorio`).
--
-- DECISIONES QUE NO ESTÁN LITERALES EN EL PROMPT
--   · El trigger elige el desenlace GENÉRICO (salió, se rindió, venció, se canceló). El
--     drenador escribe ANTES los desenlaces que solo él conoce —el cap de 7 días y el
--     tope del mes posponen (`deferred` con su fecha), el regalo vivo pospone hasta que
--     ese venza— y después cancela el item: el trigger solo toca toques que siguen
--     `queued`, así que lo escrito por el drenador manda. Lo mismo al enviar: el trigger
--     deja el toque `sent` aunque el drenador muera justo después; el drenador le suma
--     `campaign_message_id` y `grant_id`.
--   · `expired` (el item venció sin encontrar cupo) cuenta como un intento fallido del
--     toque, no como cancelado: el spec (H6) lo pide reintentable.
--   · El toque `queued` cuyo item ya no existe vuelve a `pending` (se retoma al día
--     siguiente), nunca se queda en `queued`.
--   · `reward_id` es FK simple a `campaign_rewards` (como pide el prompt): el cron solo
--     elige premios de la MISMA marca. `ON DELETE SET NULL`: si el dueño borra el premio,
--     el toque conserva qué tamaño de regalo llevó.
--
-- IDEMPOTENTE: corre dos veces sin error (ADD COLUMN IF NOT EXISTS, constraints por
-- nombre, CREATE OR REPLACE, DROP TRIGGER IF EXISTS).
--
-- RIESGO: BAJO. `ADD COLUMN … DEFAULT <constante>` no reescribe las tablas (PG ≥ 11).
-- Rehacer el CHECK de `status` valida las filas de `customer_cycle_touches`, que hoy
-- está vacía (el ciclo nunca encendió).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────
-- 1. customer_cycle_touches: lo que decide el cron y necesita el drenador
-- ───────────────────────────────────────────────
ALTER TABLE customer_cycle_touches
  ADD COLUMN IF NOT EXISTS attempts     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reason       text,
  ADD COLUMN IF NOT EXISTS reward_id    uuid REFERENCES campaign_rewards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gift_size    text,
  ADD COLUMN IF NOT EXISTS template_key text;

DO $$
BEGIN
  -- El estado admite además `cancelled`. El CHECK de la 00070 se declaró en la columna,
  -- así que su nombre es el que Postgres le puso: `<tabla>_<columna>_check`.
  ALTER TABLE customer_cycle_touches DROP CONSTRAINT IF EXISTS customer_cycle_touches_status_check;
  ALTER TABLE customer_cycle_touches ADD CONSTRAINT customer_cycle_touches_status_check
    CHECK (status IN ('pending', 'queued', 'sent', 'failed', 'holdout', 'deferred', 'cancelled'));

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.customer_cycle_touches'::regclass
                    AND conname = 'customer_cycle_touches_attempts_check') THEN
    ALTER TABLE customer_cycle_touches ADD CONSTRAINT customer_cycle_touches_attempts_check
      CHECK (attempts >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.customer_cycle_touches'::regclass
                    AND conname = 'customer_cycle_touches_gift_size_check') THEN
    ALTER TABLE customer_cycle_touches ADD CONSTRAINT customer_cycle_touches_gift_size_check
      CHECK (gift_size IS NULL OR gift_size IN ('small', 'strong'));
  END IF;
  -- Las cinco plantillas del catálogo que puede usar un toque (`src/lib/cycle-touch.ts`,
  -- `TOUCH_TEMPLATES`: un test compara las dos listas).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.customer_cycle_touches'::regclass
                    AND conname = 'customer_cycle_touches_template_key_check') THEN
    ALTER TABLE customer_cycle_touches ADD CONSTRAINT customer_cycle_touches_template_key_check
      CHECK (template_key IS NULL OR template_key IN (
        'gift_expiring', 'reactivation_aggressive', 'reactivation_no_reward',
        'campaign_presencial_to_domicilio', 'campaign_domicilio_to_presencial'));
  END IF;
END $$;
-- Los dos CHECK del grupo de control de la 00070 no se tocan: un `holdout` sigue sin poder
-- quedar `queued`, `sent` ni `failed` (y tampoco `cancelled`: nunca se encola).

COMMENT ON COLUMN customer_cycle_touches.attempts IS
  'Veces que el envío de este toque FALLÓ del todo (la cola se rindió o el item venció). Con 3 (MAX_INTENTOS_FALLIDOS_POR_TOQUE) no se reintenta más (00071).';
COMMENT ON COLUMN customer_cycle_touches.reason IS
  'Por qué se pospuso, se canceló o falló, en palabras. NULL si salió o está en cola (00071).';
COMMENT ON COLUMN customer_cycle_touches.reward_id IS
  'El premio del catálogo (campaign_rewards de la MISMA marca) elegido al decidir el toque. Se otorga al ENVIAR, no al encolar (00071).';
COMMENT ON COLUMN customer_cycle_touches.gift_size IS
  'small | strong | NULL (sin regalo). El pequeño no lleva recordatorio (H2); el fuerte mueve customers.strong_offer_last_at (00071).';
COMMENT ON COLUMN customer_cycle_touches.template_key IS
  'Qué plantilla del catálogo salió (o habría salido, en el grupo de control): el adaptador del spec §4 (00071).';
COMMENT ON COLUMN customer_cycle_touches.status IS
  'pending (decidido, sin encolar) · queued · sent · failed (intentos < 3: se reintenta) · holdout · deferred (due_at = cuándo se reevalúa) · cancelled (volvió, la etapa ya pasó, la marca apagó el ciclo, opt-out). Lo mueve el trigger de send_queue (00071).';

-- ───────────────────────────────────────────────
-- 2. send_queue.cycle_touch_id + enqueue_send_queue() que lo copia
-- ───────────────────────────────────────────────
ALTER TABLE send_queue
  ADD COLUMN IF NOT EXISTS cycle_touch_id uuid NULL
    REFERENCES customer_cycle_touches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_send_queue_cycle_touch
  ON send_queue (cycle_touch_id) WHERE cycle_touch_id IS NOT NULL;

COMMENT ON COLUMN send_queue.cycle_touch_id IS
  'El toque del ciclo de recuperación que este item envía (00071). NULL = cualquier otro envío. El drenador otorga el regalo y escribe el resultado del toque; el trigger on_send_queue_*_cycle lo mantiene al día.';

-- La FIRMA NO CAMBIA (`enqueue_send_queue(p_items jsonb)`): es un CREATE OR REPLACE de
-- verdad, sin sobrecarga (una sobrecarga deja la llamada vieja ambigua, 42725). El cuerpo
-- es el de la 00044 TAL CUAL más `cycle_touch_id`: sin esta línea el toque se perdería
-- entre encolar y drenar, como pasó con la sede antes de la 00044. El `ON CONFLICT DO
-- NOTHING` SIN destino se conserva: es lo único que respeta el índice único PARCIAL sobre
-- EXPRESIÓN de la 00038.
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
    location_id, cycle_touch_id
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
    NULLIF(i->>'location_id', '')::uuid,
    -- Ciclo de recuperación (00071). Ausente = no es un toque del ciclo.
    NULLIF(i->>'cycle_touch_id', '')::uuid
  FROM jsonb_array_elements(p_items) AS i
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION enqueue_send_queue(jsonb) IS
  'Encola un lote de forma idempotente. ON CONFLICT DO NOTHING sin destino es lo unico que respeta el indice unico parcial sobre expresion del bloque 3 de la 00038; volver a encolar la misma campana no duplica a nadie. Copia location_id (00044) y cycle_touch_id (00071), claves opcionales de cada item.';

-- ───────────────────────────────────────────────
-- 3. reward_grants.skip_reminder (H2)
-- ───────────────────────────────────────────────
-- NO se sella `reminder_sent_at` para lograrlo: diría que salió un recordatorio que nunca
-- salió, y las métricas de recordatorios mentirían.
ALTER TABLE reward_grants
  ADD COLUMN IF NOT EXISTS skip_reminder boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN reward_grants.skip_reminder IS
  'true = este premio vence sin recordatorio (el regalo PEQUEÑO del ciclo, H2). findGrantsDueForReminder() no lo devuelve. false en todo lo demás (00071).';

-- ───────────────────────────────────────────────
-- 4. H6: el toque sigue a su item de la cola
-- ───────────────────────────────────────────────
-- Una sola regla para el trigger y para la reconciliación del cron. Solo toca el toque de
-- la MISMA marca que el item, y solo desde el estado que corresponde: lo que ya escribió el
-- drenador (un `deferred` con su fecha) no lo pisa. Devuelve cuántas filas movió (0 o 1).
CREATE OR REPLACE FUNCTION cycle_touch_follow_queue_item(
  p_touch_id   uuid,
  p_tenant_id  uuid,
  p_status     text,
  p_last_error text,
  p_sent_at    timestamptz,
  p_not_before timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer := 0;
BEGIN
  IF p_status = 'queued' THEN
    -- Se encoló: el toque queda en cola y `due_at` pasa a ser la hora real del envío (H5).
    UPDATE customer_cycle_touches
       SET status = 'queued', due_at = COALESCE(p_not_before, due_at), reason = NULL
     WHERE id = p_touch_id AND tenant_id = p_tenant_id
       AND status IN ('pending', 'deferred', 'failed');
  ELSIF p_status = 'sent' THEN
    UPDATE customer_cycle_touches
       SET status = 'sent', sent_at = COALESCE(p_sent_at, now()), reason = NULL
     WHERE id = p_touch_id AND tenant_id = p_tenant_id AND status = 'queued';
  ELSIF p_status IN ('failed', 'expired') THEN
    -- Se rindió tras sus 3 intentos de la cola, o venció sin cupo: un intento fallido del
    -- toque. Con menos de 3, el cron lo reintenta al día siguiente.
    UPDATE customer_cycle_touches
       SET status   = 'failed',
           attempts = attempts + 1,
           reason   = left(CASE WHEN p_status = 'expired'
                                THEN 'Venció en la cola antes de encontrar cupo'
                                ELSE 'La cola se rindió: ' || COALESCE(p_last_error, 'sin causa registrada')
                           END, 500)
     WHERE id = p_touch_id AND tenant_id = p_tenant_id AND status = 'queued';
  ELSIF p_status = 'cancelled' THEN
    -- Opt-out, el cliente volvió, la marca apagó el ciclo, o lo canceló el panel.
    UPDATE customer_cycle_touches
       SET status = 'cancelled', reason = left(COALESCE(p_last_error, 'Cancelado en la cola'), 500)
     WHERE id = p_touch_id AND tenant_id = p_tenant_id AND status = 'queued';
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION cycle_on_send_queue_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM cycle_touch_follow_queue_item(
      NEW.cycle_touch_id, NEW.tenant_id, NEW.status, NEW.last_error, NEW.sent_at, NEW.not_before);
  EXCEPTION WHEN OTHERS THEN
    -- El ciclo no tumba la cola: el envío, la cancelación o el vencimiento siguen. El toque
    -- lo recoge la reconciliación del cron al día siguiente (cycle_reconcile_touches).
    RAISE WARNING '[ciclo] send_queue → toque %: no se pudo reflejar el estado % (% %). Lo recoge la reconciliación.',
      NEW.cycle_touch_id, NEW.status, SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

-- Dos triggers y no uno: en un trigger de INSERT el WHEN no puede nombrar OLD.
DROP TRIGGER IF EXISTS on_send_queue_insert_cycle ON send_queue;
CREATE TRIGGER on_send_queue_insert_cycle
  AFTER INSERT ON send_queue
  FOR EACH ROW
  WHEN (NEW.cycle_touch_id IS NOT NULL AND NEW.status = 'queued')
  EXECUTE FUNCTION cycle_on_send_queue_change();

DROP TRIGGER IF EXISTS on_send_queue_status_cycle ON send_queue;
CREATE TRIGGER on_send_queue_status_cycle
  AFTER UPDATE OF status ON send_queue
  FOR EACH ROW
  WHEN (NEW.cycle_touch_id IS NOT NULL AND OLD.status = 'queued' AND NEW.status <> 'queued')
  EXECUTE FUNCTION cycle_on_send_queue_change();

-- La red de abajo del trigger: los toques de la marca que siguen `queued` cuando su ÚLTIMO
-- item ya salió de la cola (o ya no existe). La corre el cron del ciclo cada día antes de
-- decidir. Con el trigger sano no encuentra nada.
CREATE OR REPLACE FUNCTION cycle_reconcile_touches(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r       record;
  v_total integer := 0;
BEGIN
  FOR r IN
    SELECT t.id, q.status AS q_status, q.last_error, q.sent_at, q.not_before
      FROM customer_cycle_touches t
      LEFT JOIN LATERAL (
        SELECT s.status, s.last_error, s.sent_at, s.not_before
          FROM send_queue s
         WHERE s.cycle_touch_id = t.id AND s.tenant_id = t.tenant_id
         ORDER BY s.enqueued_at DESC
         LIMIT 1
      ) q ON true
     WHERE t.tenant_id = p_tenant_id
       AND t.status = 'queued'
       AND (q.status IS NULL OR q.status <> 'queued')
  LOOP
    IF r.q_status IS NULL THEN
      UPDATE customer_cycle_touches
         SET status = 'pending', reason = 'Su envío ya no estaba en la cola: se retoma'
       WHERE id = r.id AND status = 'queued';
      v_total := v_total + 1;
    ELSE
      v_total := v_total + cycle_touch_follow_queue_item(
        r.id, p_tenant_id, r.q_status, r.last_error, r.sent_at, r.not_before);
    END IF;
  END LOOP;
  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION cycle_reconcile_touches(uuid) IS
  'Toques queued de la marca cuyo último item de send_queue ya no está queued (o no existe): les aplica el mismo desenlace que el trigger. Lo corre el cron del ciclo antes de decidir (00071, H6).';

-- ───────────────────────────────────────────────
-- 5. Permisos: nada del ciclo abierto a la anon key (regla de la 00069)
-- ───────────────────────────────────────────────
REVOKE ALL ON FUNCTION enqueue_send_queue(jsonb)                                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cycle_touch_follow_queue_item(uuid, uuid, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cycle_on_send_queue_change()                                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cycle_reconcile_touches(uuid)                                     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cycle_reconcile_touches(uuid) TO service_role;

-- ───────────────────────────────────────────────
-- 6. Verificación: si falta algo, FALLA (y se deshace todo)
-- ───────────────────────────────────────────────
DO $$
DECLARE
  v_falta text := '';
  v_col   text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['attempts', 'reason', 'reward_id', 'gift_size', 'template_key'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'customer_cycle_touches'
                      AND column_name = v_col) THEN
      v_falta := v_falta || ' customer_cycle_touches.' || v_col;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.customer_cycle_touches'::regclass
                    AND conname = 'customer_cycle_touches_status_check'
                    AND pg_get_constraintdef(oid) LIKE '%cancelled%') THEN
    v_falta := v_falta || ' check-status-cancelled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'send_queue'
                    AND column_name = 'cycle_touch_id') THEN
    v_falta := v_falta || ' send_queue.cycle_touch_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'reward_grants'
                    AND column_name = 'skip_reminder') THEN
    v_falta := v_falta || ' reward_grants.skip_reminder';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'enqueue_send_queue'
                    AND p.pronargs = 1 AND p.prosrc LIKE '%cycle_touch_id%') THEN
    v_falta := v_falta || ' enqueue_send_queue-sin-cycle_touch_id';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'enqueue_send_queue') <> 1 THEN
    v_falta := v_falta || ' enqueue_send_queue-sobrecargada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_send_queue_insert_cycle'
                    AND tgrelid = 'public.send_queue'::regclass) THEN
    v_falta := v_falta || ' trigger-on_send_queue_insert_cycle';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_send_queue_status_cycle'
                    AND tgrelid = 'public.send_queue'::regclass) THEN
    v_falta := v_falta || ' trigger-on_send_queue_status_cycle';
  END IF;
  IF to_regprocedure('public.cycle_reconcile_touches(uuid)') IS NULL THEN
    v_falta := v_falta || ' funcion-cycle_reconcile_touches';
  END IF;

  IF v_falta <> '' THEN
    RAISE EXCEPTION '00071 incompleta:%', v_falta;
  END IF;

  RAISE NOTICE 'OK 00071: ciclo, fase 1B (columnas del toque, send_queue.cycle_touch_id, skip_reminder, el toque sigue a la cola). El ciclo sigue apagado en todas las marcas.';
END $$;
