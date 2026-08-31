-- ═══════════════════════════════════════════════════════════════
-- Migration 00037: Gobernanza de envío
-- Fecha: 2026-08-30
-- Spec: docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md
--
-- El repo ya gobierna la DEMANDA (cap de 7 días, cap mensual de 3,
-- blackout pre-evento) pero no gobierna la OFERTA: nada sabe que Meta
-- limita cada línea a N destinatarios ÚNICOS por 24h RODANTES, y que
-- ese límite lo consumen por igual las plantillas de marketing y las
-- de utility. Esta migración construye esa capa.
--
-- Depende de: 00020 (message_logs), 00021 (opt-out), 00023 (imported_contacts),
--             00024 (tenants + current_tenant_id/is_super_admin), 00025 (tenant_id),
--             00033 (wallet debits), 00035 (rol aios_constelarys), 00036 (Zernio)
--
-- Aplicar en el SQL Editor de Supabase (este proyecto no usa Supabase CLI).
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. Estado de la línea, en tenants
-- ─────────────────────────────────────────────────────────────
-- OJO con el orden de estas dos sentencias: es deliberado y NO se puede colapsar
-- en un "ADD COLUMN ... DEFAULT 250".
--
-- ADD COLUMN con DEFAULT rellena TAMBIEN las filas que ya existen. Eso habria
-- capado de golpe en 250 a los tenants que hoy operan sin tope (Sushi Service,
-- Don Alirio, Frangal, Demo) — y Sushi Service mueve del orden de 2.000/dia.
-- Cortarle las campanas a un cliente en produccion por un default nuestro es
-- exactamente lo que esta migracion existe para evitar.
--
-- Por eso: la columna nace SIN default (los tenants existentes quedan en NULL =
-- "limite desconocido, no se aplica tope") y el DEFAULT 250 se agrega DESPUES,
-- de modo que solo aplica a los tenants NUEVOS — donde 250 si es el valor real
-- de una WABA recien creada sin verificar.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS messaging_daily_limit     integer,
  ADD COLUMN IF NOT EXISTS messaging_limit_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS quality_rating            text        NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS line_status               text        NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS line_status_reason        text,
  ADD COLUMN IF NOT EXISTS line_status_changed_at    timestamptz;

-- El default aplica solo a filas futuras (ver comentario de arriba).
ALTER TABLE tenants ALTER COLUMN messaging_daily_limit SET DEFAULT 250;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_quality_rating_check') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_quality_rating_check
      CHECK (quality_rating IN ('green','yellow','red','unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_line_status_check') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_line_status_check
      CHECK (line_status IN ('active','throttled','frozen'));
  END IF;
END $$;

COMMENT ON COLUMN tenants.messaging_daily_limit IS
  'Destinatarios ÚNICOS permitidos por Meta en 24h RODANTES. NULL = límite desconocido: se contabiliza el consumo pero NO se bloquea ningún envío (es el estado de los tenants Twilio previos a esta migración). Se sincroniza del proveedor; NO se codifica como constante (Meta cambia los escalones). Default para tenants nuevos: 250 (WABA sin verificar).';
COMMENT ON COLUMN tenants.line_status IS
  'active = presupuesto completo | throttled = campañas al 50% | frozen = campañas a 0, transaccional sigue. Volver a active es SIEMPRE manual (ver spec §3.5).';

-- ─────────────────────────────────────────────────────────────
-- 2. Mapa de clases y prioridades (fuente única de verdad)
-- ─────────────────────────────────────────────────────────────
-- Espejo en TS: src/constants/messaging.ts. Hay un test que verifica que no
-- diverjan — si agregas un tipo aquí, agrégalo allá.
CREATE TABLE IF NOT EXISTS message_class_map (
    message_type  text PRIMARY KEY,
    message_class text     NOT NULL CHECK (message_class IN ('transactional','campaign')),
    priority      smallint NOT NULL CHECK (priority BETWEEN 0 AND 4),
    description   text
);

COMMENT ON TABLE message_class_map IS
  'Clasifica cada message_type en clase de presupuesto y prioridad de cola. P0 = transaccional (usa la reserva, nunca se encola). P1 = sensible al tiempo (no se puede posponer). P4 = Golden Bullet (régimen especial, spec §3.4.1).';

INSERT INTO message_class_map (message_type, message_class, priority, description) VALUES
  -- P0 · transaccional: consume la reserva, nunca se encola
  ('welcome',            'transactional', 0, 'Bienvenida tras registro por QR'),
  ('checkin',            'transactional', 0, 'Confirmación de visita'),
  ('tier_unlocked',      'transactional', 0, 'Subió de nivel'),
  ('points_earned_near', 'transactional', 0, 'Puntos ganados, cerca del premio'),
  ('points_earned_far',  'transactional', 0, 'Puntos ganados, lejos del premio'),
  ('safe_reward',        'transactional', 0, 'Premio seguro otorgado'),
  ('mystery_box',        'transactional', 0, 'Mystery box resuelta'),
  ('golden_box',         'transactional', 0, 'Golden box resuelta'),
  ('delivery',           'transactional', 0, 'Confirmación de pedido a domicilio'),
  ('low_balance',        'transactional', 0, 'Aviso de plataforma al tenant'),
  -- P1 · campaña sensible al tiempo: entregarla tarde no sirve de nada
  ('birthday',           'campaign',      1, 'Cumpleaños — mañana no vale'),
  ('reward_reminder',    'campaign',      1, 'Vence la ventana del premio'),
  ('calendar_event',     'campaign',      1, 'Evento del calendario con fecha'),
  ('event',              'campaign',      1, 'Alias legacy de calendar_event (ver 00020)'),
  -- P2/P3 · campaña postponible
  ('reactivation',       'campaign',      2, 'Reactivación suave y agresiva'),
  ('manual',             'campaign',      3, 'Campaña manual del dashboard'),
  -- P4 · Golden Bullet: contactos SIN consentimiento, régimen especial §3.4.1
  ('import',             'campaign',      4, 'Golden Bullet — base fría importada')
ON CONFLICT (message_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. Ventana rodante de 24h (la contabilidad del límite de Meta)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS send_reservations (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone          text NOT NULL,
    message_class  text NOT NULL CHECK (message_class IN ('transactional','campaign')),
    reserved_at    timestamptz NOT NULL DEFAULT now(),
    released_at    timestamptz,
    message_log_id uuid REFERENCES message_logs(id) ON DELETE SET NULL
);

COMMENT ON TABLE send_reservations IS
  'Una fila por intento de envío. released_at no-nulo = el proveedor rechazó y el cupo se devolvió. El conteo es COUNT(DISTINCT phone) porque Meta limita destinatarios ÚNICOS, no mensajes.';

CREATE INDEX IF NOT EXISTS idx_send_reservations_window
    ON send_reservations (tenant_id, reserved_at DESC) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_send_reservations_phone
    ON send_reservations (tenant_id, phone, reserved_at DESC) WHERE released_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. Cola de goteo
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS send_queue (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone               text NOT NULL,
    customer_id         uuid REFERENCES customers(id) ON DELETE CASCADE,
    imported_contact_id uuid REFERENCES imported_contacts(id) ON DELETE CASCADE,
    campaign_id         uuid REFERENCES campaigns(id) ON DELETE CASCADE,
    priority            smallint NOT NULL CHECK (priority BETWEEN 0 AND 4),
    message_type        text NOT NULL,
    template_sid        text NOT NULL,
    variables           jsonb NOT NULL DEFAULT '{}'::jsonb,
    media_url           text,
    media_type          text,
    status              text NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','sent','failed','cancelled','expired')),
    not_before          timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz,
    attempts            smallint NOT NULL DEFAULT 0,
    last_error          text,
    enqueued_at         timestamptz NOT NULL DEFAULT now(),
    sent_at             timestamptz,
    message_log_id      uuid REFERENCES message_logs(id) ON DELETE SET NULL
);

COMMENT ON TABLE send_queue IS
  'Cola de goteo. Las guardas (opt-out, cooldown, cap mensual) se RE-EVALÚAN al drenar, no al encolar: encolar no es un permiso permanente.';
COMMENT ON COLUMN send_queue.expires_at IS
  'Un item vencido pasa a expired y NUNCA se envía. Un cumpleaños entregado mañana no vale nada.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_send_queue_no_dup
    ON send_queue (tenant_id, phone, campaign_id) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_send_queue_drain
    ON send_queue (status, priority, not_before) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_send_queue_campaign
    ON send_queue (tenant_id, campaign_id, status);

-- ─────────────────────────────────────────────────────────────
-- 5. Historial de salud de línea
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS line_health_snapshots (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    captured_at      timestamptz NOT NULL DEFAULT now(),
    quality_rating   text,
    messaging_limit  integer,
    paused_templates jsonb NOT NULL DEFAULT '[]'::jsonb,
    source           text NOT NULL CHECK (source IN ('zernio_api','webhook','manual')),
    raw              jsonb
);

CREATE INDEX IF NOT EXISTS idx_line_health_tenant
    ON line_health_snapshots (tenant_id, captured_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 6. Libro de consentimiento (APPEND-ONLY)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consent_events (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id  uuid REFERENCES customers(id) ON DELETE SET NULL,
    phone        text NOT NULL,
    event        text NOT NULL CHECK (event IN ('opt_in','opt_out')),
    channel      text NOT NULL CHECK (channel IN ('checkin_qr','whatsapp_reply','import','manual','staff')),
    consent_text text,
    evidence     jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE consent_events IS
  'Libro de evidencia de consentimiento. APPEND-ONLY: un libro que se puede editar no es evidencia. consent_text guarda el texto EXACTO que vio el cliente, porque las plantillas cambian.';

CREATE INDEX IF NOT EXISTS idx_consent_events_lookup
    ON consent_events (tenant_id, phone, occurred_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 7. Presupuesto de línea (derivado, nunca almacenado)
-- ─────────────────────────────────────────────────────────────
-- reserva = LEAST( GREATEST(piso, ceil(p95_transaccional * factor)), limite * max_pct )
--
-- El p95 se calcula sobre message_logs (larga vida), NO sobre send_reservations
-- (que se poda a 7 días y no alcanzaría para una ventana de 14).
CREATE OR REPLACE FUNCTION line_budget(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_limit           integer;
  v_status          text;
  v_quality         text;
  v_floor           integer;
  v_safety          numeric;
  v_max_pct         integer;
  v_p95             numeric;
  v_reserve         integer;
  v_campaign_budget integer;
  v_used            integer;
BEGIN
  SELECT t.messaging_daily_limit, t.line_status, t.quality_rating
    INTO v_limit, v_status, v_quality
    FROM tenants t
   WHERE t.id = p_tenant;

  -- line_status es NOT NULL DEFAULT 'active': si viene NULL, el tenant no existe.
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'tenant_no_encontrado: %', p_tenant;
  END IF;

  -- Consumo de la ventana rodante: se calcula SIEMPRE, incluso sin límite
  -- conocido, para poder medir a los tenants antes de imponerles un tope.
  SELECT COUNT(DISTINCT sr.phone)
    INTO v_used
    FROM send_reservations sr
   WHERE sr.tenant_id = p_tenant
     AND sr.released_at IS NULL
     AND sr.reserved_at > now() - interval '24 hours';

  -- Límite desconocido (tenants anteriores a esta migración): se contabiliza
  -- pero no se bloquea nada. Inventar un tope aquí le cortaría las campañas a
  -- un cliente que hoy opera sin problema.
  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'enforced',                false,
      'limit',                   NULL,
      'used_24h',                v_used,
      'reserve',                 NULL,
      'campaign_budget',         NULL,
      'campaign_available',      NULL,
      'transactional_available', NULL,
      'quality_rating',          v_quality,
      'line_status',             v_status
    );
  END IF;

  SELECT
    COALESCE(MAX(value) FILTER (WHERE key = 'transactional_reserve_floor'), '70')::integer,
    COALESCE(MAX(value) FILTER (WHERE key = 'reserve_safety_factor'),      '1.3')::numeric,
    COALESCE(MAX(value) FILTER (WHERE key = 'reserve_max_pct'),            '50')::integer
    INTO v_floor, v_safety, v_max_pct
    FROM admin_settings
   WHERE tenant_id = p_tenant
     AND key IN ('transactional_reserve_floor','reserve_safety_factor','reserve_max_pct');

  -- p95 del consumo transaccional diario de los últimos 14 días.
  SELECT COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY d.cnt), 0)
    INTO v_p95
    FROM (
      SELECT COUNT(DISTINCT ml.phone)::numeric AS cnt
        FROM message_logs ml
        JOIN message_class_map m ON m.message_type = ml.message_type
       WHERE ml.tenant_id = p_tenant
         AND m.message_class = 'transactional'
         AND ml.twilio_sid IS NOT NULL
         AND ml.created_at >= now() - interval '14 days'
       GROUP BY date_trunc('day', ml.created_at)
    ) d;

  v_reserve := LEAST(
                 GREATEST(v_floor, ceil(v_p95 * v_safety)::integer),
                 floor(v_limit * v_max_pct / 100.0)::integer
               );
  v_campaign_budget := GREATEST(v_limit - v_reserve, 0);

  -- Frenos por salud de línea (spec §3.5)
  IF v_status = 'throttled' THEN
    v_campaign_budget := floor(v_campaign_budget * 0.5)::integer;
  ELSIF v_status = 'frozen' THEN
    v_campaign_budget := 0;
  END IF;

  RETURN jsonb_build_object(
    'enforced',                true,
    'limit',                   v_limit,
    'used_24h',                v_used,
    'reserve',                 v_reserve,
    'campaign_budget',         v_campaign_budget,
    'campaign_available',      GREATEST(v_campaign_budget - v_used, 0),
    'transactional_available', GREATEST(v_limit - v_used, 0),
    'quality_rating',          v_quality,
    'line_status',             v_status
  );
END;
$fn$;

COMMENT ON FUNCTION line_budget(uuid) IS
  'Presupuesto derivado de la línea. Ver spec §3.1. Con los defaults (limite 250, piso 70) da 180 de campaña libre.';

-- ─────────────────────────────────────────────────────────────
-- 8. Reserva ATÓMICA de cupo
-- ─────────────────────────────────────────────────────────────
-- Las campañas envían en paralelo (BATCH_SIZE = 10). Un patrón
-- leer-contar-insertar tiene una carrera que permite pasarse del límite de
-- Meta. El advisory lock por tenant serializa la decisión; se libera solo al
-- terminar la transacción (cada RPC de supabase-js es su propia transacción).
CREATE OR REPLACE FUNCTION reserve_send_slot(p_tenant uuid, p_phone text, p_class text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_budget jsonb;
  v_status text;
  v_id     uuid;
BEGIN
  IF p_class NOT IN ('transactional','campaign') THEN
    RAISE EXCEPTION 'clase_invalida: %', p_class;
  END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
    RAISE EXCEPTION 'telefono_vacio';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text));

  SELECT t.line_status INTO v_status FROM tenants t WHERE t.id = p_tenant;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'tenant_no_encontrado: %', p_tenant;
  END IF;

  -- Línea congelada: solo pasa lo transaccional.
  IF v_status = 'frozen' AND p_class <> 'transactional' THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'line_frozen');
  END IF;

  -- Meta cuenta destinatarios ÚNICOS: si este teléfono ya se contó en la
  -- ventana, el envío es gratis y no consume cupo nuevo.
  IF EXISTS (
    SELECT 1 FROM send_reservations sr
     WHERE sr.tenant_id = p_tenant
       AND sr.phone = p_phone
       AND sr.released_at IS NULL
       AND sr.reserved_at > now() - interval '24 hours'
  ) THEN
    INSERT INTO send_reservations (tenant_id, phone, message_class)
    VALUES (p_tenant, p_phone, p_class)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('granted', true, 'free', true, 'reservation_id', v_id);
  END IF;

  v_budget := line_budget(p_tenant);

  -- Límite desconocido: se registra la reserva (para poder medir el consumo
  -- real de ese tenant) pero NUNCA se deniega. Los tenants Twilio previos a
  -- esta migración caen aquí y su comportamiento no cambia en nada.
  IF (v_budget->>'enforced')::boolean IS NOT TRUE THEN
    INSERT INTO send_reservations (tenant_id, phone, message_class)
    VALUES (p_tenant, p_phone, p_class)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('granted', true, 'free', false, 'enforced', false, 'reservation_id', v_id);
  END IF;

  IF p_class = 'transactional' THEN
    IF (v_budget->>'used_24h')::integer >= (v_budget->>'limit')::integer THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'budget_exhausted');
    END IF;
  ELSE
    IF (v_budget->>'used_24h')::integer >= (v_budget->>'campaign_budget')::integer THEN
      RETURN jsonb_build_object('granted', false, 'reason', 'campaign_budget_exhausted');
    END IF;
  END IF;

  INSERT INTO send_reservations (tenant_id, phone, message_class)
  VALUES (p_tenant, p_phone, p_class)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('granted', true, 'free', false, 'reservation_id', v_id);
END;
$fn$;

COMMENT ON FUNCTION reserve_send_slot(uuid, text, text) IS
  'Reserva atómica de cupo. El advisory lock por tenant es lo que impide pasarse del límite bajo envío concurrente — no quitarlo.';

CREATE OR REPLACE FUNCTION release_send_slot(p_reservation uuid, p_message_log uuid DEFAULT NULL)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  UPDATE send_reservations
     SET released_at = now(),
         message_log_id = COALESCE(p_message_log, message_log_id)
   WHERE id = p_reservation
     AND released_at IS NULL;
$fn$;

COMMENT ON FUNCTION release_send_slot(uuid, uuid) IS
  'Devuelve el cupo cuando el proveedor rechazó el envío. Conservador a propósito: preferimos desperdiciar un cupo a pasarnos del límite.';

-- ─────────────────────────────────────────────────────────────
-- 9. D-2 · La billetera deja de cobrar a los tenants Zernio
-- ─────────────────────────────────────────────────────────────
-- Con Zernio, Meta le factura los mensajes DIRECTO al restaurante (método de
-- pago en su propia WABA). Cobrarle además la tarifa de la billetera sería
-- cobrarle dos veces. El modelo pasa a suscripción mensual.
--
-- La billetera de los tenants Twilio queda EXACTAMENTE igual — solo se agrega
-- una guarda nueva. Y el freno de gasto que la billetera cumplía lo reemplaza
-- el presupuesto de línea (§7 de esta migración), que frena contra el límite
-- real de Meta en vez de contra el saldo.
CREATE OR REPLACE FUNCTION debit_wallet_on_message_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_price    numeric;
  v_provider text;
BEGIN
  -- Solo cobramos lo que el proveedor aceptó (W-D3).
  IF NEW.twilio_sid IS NULL THEN
    RETURN NEW;
  END IF;

  -- En UPDATE: si ya tenía twilio_sid, el cobro ya ocurrió en su momento.
  IF TG_OP = 'UPDATE' AND OLD.twilio_sid IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Los mensajes de la plataforma no se le cobran al tenant (W-D10).
  IF NEW.message_type = 'low_balance' THEN
    RETURN NEW;
  END IF;

  -- Un log sin tenant_id no se puede atribuir; no se cobra.
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ═══ ÚNICO CAMBIO DE 00037 (D-2) ═══
  -- Con Zernio, Meta le factura los mensajes DIRECTO al restaurante (método de
  -- pago en su propia WABA). Cobrarle además la tarifa de la billetera sería
  -- cobrarle dos veces. Los tenants Twilio siguen exactamente igual.
  -- El freno de gasto que cumplía la billetera lo reemplaza el presupuesto de
  -- línea (§7 de esta migración), que frena contra el límite real de Meta.
  SELECT messaging_provider INTO v_provider FROM tenants WHERE id = NEW.tenant_id;
  IF v_provider = 'zernio' THEN
    RETURN NEW;
  END IF;
  -- ═══ FIN DEL CAMBIO ═══

  SELECT price_per_message_cop INTO v_price
  FROM tenants
  WHERE id = NEW.tenant_id;

  IF v_price IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO tenant_wallet_transactions
    (tenant_id, type, amount_cop, unit_price_cop, quantity,
     message_log_id, source, created_by, notes)
  VALUES
    (NEW.tenant_id, 'debit', -v_price, v_price, 1,
     NEW.id, 'system', 'system', NEW.message_type)
  ON CONFLICT (message_log_id) WHERE message_log_id IS NOT NULL DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- El ledger NUNCA puede tumbar el registro de un mensaje YA enviado.
  -- Se pierde un cobro (visible en el WARNING), jamás la auditoría del envío.
  RAISE WARNING '[wallet] débito fallido para message_log %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────
-- 10. RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE send_reservations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE send_queue             ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_health_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_class_map      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_all_send_reservations" ON send_reservations;
CREATE POLICY "tenant_all_send_reservations" ON send_reservations FOR ALL
  USING      (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "tenant_all_send_queue" ON send_queue;
CREATE POLICY "tenant_all_send_queue" ON send_queue FOR ALL
  USING      (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS "tenant_all_line_health" ON line_health_snapshots;
CREATE POLICY "tenant_all_line_health" ON line_health_snapshots FOR ALL
  USING      (tenant_id = current_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- consent_events: APPEND-ONLY. Se puede leer e insertar; NUNCA actualizar ni borrar.
DROP POLICY IF EXISTS "tenant_read_consent_events"   ON consent_events;
DROP POLICY IF EXISTS "tenant_insert_consent_events" ON consent_events;
CREATE POLICY "tenant_read_consent_events" ON consent_events FOR SELECT
  USING (tenant_id = current_tenant_id() OR is_super_admin());
CREATE POLICY "tenant_insert_consent_events" ON consent_events FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id() OR is_super_admin());

-- El mapa de clases es catálogo global de solo lectura.
DROP POLICY IF EXISTS "read_message_class_map" ON message_class_map;
CREATE POLICY "read_message_class_map" ON message_class_map FOR SELECT USING (true);

-- Blindaje extra de append-only: ningún rol de aplicación puede mutar el libro.
REVOKE UPDATE, DELETE ON consent_events FROM authenticated, anon;

-- ─────────────────────────────────────────────────────────────
-- 11. Superficie para el AIOS Constelarys (patrón de 00035/00036)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION aios_line_health(p_slug text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.slug), '[]'::jsonb)
  FROM (
    SELECT t.slug,
           t.messaging_provider,
           t.zernio_phone_number,
           t.quality_rating,
           t.line_status,
           t.line_status_reason,
           t.messaging_daily_limit,
           (line_budget(t.id)->>'used_24h')::integer           AS used_24h,
           (line_budget(t.id)->>'campaign_available')::integer AS campaign_available,
           (SELECT COUNT(*) FROM send_queue q
             WHERE q.tenant_id = t.id AND q.status = 'queued')  AS queue_depth,
           (SELECT max(captured_at) FROM line_health_snapshots s
             WHERE s.tenant_id = t.id)                          AS last_snapshot_at
      FROM tenants t
     WHERE p_slug IS NULL OR t.slug = p_slug
  ) x;
$fn$;

CREATE OR REPLACE FUNCTION aios_set_line_status(p_slug text, p_status text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF p_status NOT IN ('active','throttled','frozen') THEN
    RAISE EXCEPTION 'estado_invalido: %', p_status;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'motivo_requerido';
  END IF;

  UPDATE tenants
     SET line_status = p_status,
         line_status_reason = p_reason,
         line_status_changed_at = now()
   WHERE slug = p_slug
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'tenant_no_encontrado: %', p_slug;
  END IF;

  RETURN jsonb_build_object('slug', p_slug, 'line_status', p_status, 'reason', p_reason);
END;
$fn$;

REVOKE ALL ON FUNCTION aios_line_health(text)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION aios_set_line_status(text, text, text) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    GRANT EXECUTE ON FUNCTION aios_line_health(text)                 TO aios_constelarys;
    GRANT EXECUTE ON FUNCTION aios_set_line_status(text, text, text) TO aios_constelarys;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 12. Poda (la llama el cron del drenador)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prune_send_governance()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_res integer;
  v_snap integer;
BEGIN
  DELETE FROM send_reservations WHERE reserved_at < now() - interval '7 days';
  GET DIAGNOSTICS v_res = ROW_COUNT;
  DELETE FROM line_health_snapshots WHERE captured_at < now() - interval '90 days';
  GET DIAGNOSTICS v_snap = ROW_COUNT;
  RETURN jsonb_build_object('reservations_deleted', v_res, 'snapshots_deleted', v_snap);
END;
$fn$;

-- ─────────────────────────────────────────────────────────────
-- 13. Blindaje de permisos de las funciones del núcleo
-- ─────────────────────────────────────────────────────────────
-- Postgres concede EXECUTE a PUBLIC por defecto en toda función nueva. Como
-- estas cinco son SECURITY DEFINER, corren con los privilegios del dueño y por
-- tanto ESCRIBEN aunque quien las llame no tenga permiso sobre las tablas.
--
-- Sin este bloque, cualquiera con la NEXT_PUBLIC_SUPABASE_ANON_KEY —que viaja
-- en el bundle del navegador— puede llamarlas por RPC de PostgREST:
--
--   · prune_send_governance()  BORRA send_reservations. Y borrar reservas
--     REINICIA el contador de la ventana de 24h, que es exactamente el freno
--     que esta migración existe para construir. Verificado: `SET ROLE anon` la
--     ejecuta y devuelve {reservations_deleted: 1, snapshots_deleted: 1}.
--   · reserve_send_slot()      consume cupo del día de un tenant a voluntad.
--   · release_send_slot()      libera reservas ajenas.
--   · line_budget()            filtra el consumo y los límites de cualquier tenant.
--
-- Ninguna de las cuatro se llama nunca desde el navegador: el único consumidor
-- es el service role (src/services/line-budget.service.ts), que salta estos
-- permisos por definición. Revocarlas a PUBLIC no rompe nada.
--
-- Mismo criterio que ya aplican 00036:219,255,319 y las dos funciones del AIOS
-- doce líneas más arriba.
-- OJO: `FROM PUBLIC` SOLO NO BASTA EN SUPABASE.
-- Todo proyecto Supabase trae `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT
-- ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role`, así que
-- cada función creada aquí nace ADEMÁS con un GRANT EXECUTE *nominal* a anon y
-- authenticated. Revocar PUBLIC borra un ACE y deja los otros dos intactos.
-- Hay que nombrarlos. (La misma lógica por la que 00037 más arriba escribe
-- `REVOKE UPDATE, DELETE ON consent_events FROM authenticated, anon`.)
REVOKE ALL ON FUNCTION line_budget(uuid)                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reserve_send_slot(uuid, text, text)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION release_send_slot(uuid, uuid)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION prune_send_governance()                FROM PUBLIC, anon, authenticated;

-- El AIOS lee el tablero de emergencia con aios_line_health(), que internamente
-- llama line_budget(). Al ser SECURITY DEFINER, la llamada anidada corre con
-- los privilegios del dueño y NO necesita este grant — pero dejarlo explícito
-- evita que un cambio futuro de aios_line_health a INVOKER lo rompa en silencio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aios_constelarys') THEN
    GRANT EXECUTE ON FUNCTION line_budget(uuid) TO aios_constelarys;
  END IF;
END $$;
