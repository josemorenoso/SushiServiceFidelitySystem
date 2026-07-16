-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00033: El débito de la billetera + tarifa por tenant
-- Fecha: 2026-07-13
-- Descripción: 00027 registraba las ENTRADAS (topup/adjustment/refund) pero
--   nada registraba el CONSUMO, así que tenant_wallet_balance_cop() devolvía el
--   total histórico depositado en vez de un saldo. Esta migración agrega el
--   débito: cada mensaje que Twilio acepta resta la tarifa del tenant, vía un
--   TRIGGER sobre message_logs (misma transacción que el log → nunca divergen).
--
--   Modelo (spec 2026-07-13-wallet-billing-design.md):
--     - El ledger se lleva en DINERO (COP). Los "mensajes disponibles" se calculan.
--     - La tarifa es una COLUMNA de tenants (no config jsonb): el tenant no puede
--       ponerse su propio precio. Solo super-admin la escribe.
--     - Se cobra cuando twilio_sid deja de ser NULL (= Twilio aceptó = Twilio cobró).
--     - Idempotencia por constraint (UNIQUE message_log_id), no por lógica.
--     - El histórico NO se cobra retroactivo: el ledger arranca en cero hoy.
--
-- Riesgo: BAJO — agrega columnas/trigger nuevos. No reescribe datos existentes.
--   Requiere 00027 (tabla wallet) y 00020 (message_logs).
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Tarifa y contacto del dueño (tenants) ───────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS price_per_message_cop      numeric     NOT NULL DEFAULT 100
    CHECK (price_per_message_cop > 0),
  ADD COLUMN IF NOT EXISTS low_balance_threshold_msgs int         NOT NULL DEFAULT 100
    CHECK (low_balance_threshold_msgs >= 0),
  ADD COLUMN IF NOT EXISTS low_balance_notified_at    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS owner_phone                text        NULL,
  ADD COLUMN IF NOT EXISTS owner_email                text        NULL;

COMMENT ON COLUMN tenants.price_per_message_cop IS
  'Lo que ESTE tenant paga por mensaje (COP). Dato de facturación: solo super_admin lo escribe. NO vive en config jsonb porque el tenant edita config y podría ponerse su propio precio.';
COMMENT ON COLUMN tenants.low_balance_threshold_msgs IS
  'Umbral del aviso de saldo bajo: se avisa cuando quedan <= N mensajes disponibles.';
COMMENT ON COLUMN tenants.low_balance_notified_at IS
  'Anti-spam del aviso. Se limpia (NULL) en cada recarga para poder volver a avisar.';

-- ─── 2. El ledger: soportar débitos ─────────────────────────────
-- 2.1 Ampliar el CHECK de type para aceptar 'debit'.
ALTER TABLE tenant_wallet_transactions
  DROP CONSTRAINT IF EXISTS tenant_wallet_transactions_type_check;
ALTER TABLE tenant_wallet_transactions
  ADD CONSTRAINT tenant_wallet_transactions_type_check
  CHECK (type IN ('topup', 'adjustment', 'refund', 'debit'));

-- 2.2 Columnas nuevas.
ALTER TABLE tenant_wallet_transactions
  ADD COLUMN IF NOT EXISTS message_log_id uuid    NULL REFERENCES message_logs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_price_cop numeric NULL,   -- snapshot de la tarifa al cobrar
  ADD COLUMN IF NOT EXISTS quantity       int     NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source         text    NULL
    CHECK (source IS NULL OR source IN ('manual', 'wompi', 'system')),
  ADD COLUMN IF NOT EXISTS external_ref   text    NULL;  -- id de Wompi o referencia del Nequi

-- 2.3 Idempotencia por constraint (W-D4).
--   Un mensaje se cobra UNA sola vez, aunque el webhook de status se reintente.
--   (Postgres permite múltiples NULL en un UNIQUE → las recargas conviven sin problema.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_txn_message_log
  ON tenant_wallet_transactions(message_log_id)
  WHERE message_log_id IS NOT NULL;

--   Un pago externo (Wompi/manual) no se acredita dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_txn_source_ref
  ON tenant_wallet_transactions(source, external_ref)
  WHERE external_ref IS NOT NULL;

-- ─── 3. El trigger de débito ────────────────────────────────────
-- Cuelga del embudo único de envíos (message_logs). Cobra cuando twilio_sid
-- pasa a NO ser NULL: ese es el momento en que Twilio aceptó y nos cobró a NOSOTROS.
CREATE OR REPLACE FUNCTION debit_wallet_on_message_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price numeric;
BEGIN
  -- Solo cobramos lo que Twilio aceptó (W-D3).
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
$$;

DROP TRIGGER IF EXISTS trg_debit_wallet ON message_logs;
CREATE TRIGGER trg_debit_wallet
  AFTER INSERT OR UPDATE OF twilio_sid ON message_logs
  FOR EACH ROW
  EXECUTE FUNCTION debit_wallet_on_message_sent();

-- ─── 4. Mensajes disponibles (derivado, W-D1) ───────────────────
-- No se almacena: saldo ÷ tarifa. El dinero es la verdad; los mensajes son una vista.
CREATE OR REPLACE FUNCTION tenant_messages_available(p_tenant_id uuid)
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(
    0,
    FLOOR(tenant_wallet_balance_cop(p_tenant_id) / NULLIF(t.price_per_message_cop, 0))
  )::int
  FROM tenants t
  WHERE t.id = p_tenant_id
$$;

-- ═══════════════════════════════════════════════════════════════
-- Verificación (correr aparte tras la migración):
--   -- 1. El trigger cobra un mensaje aceptado:
--   INSERT INTO message_logs (tenant_id, phone, message_type, status, twilio_sid)
--   VALUES ('<tenant>', '3001234567', 'welcome', 'sent', 'SM_test_1');
--   SELECT * FROM tenant_wallet_transactions WHERE message_log_id IS NOT NULL;  -- 1 fila, -100
--
--   -- 2. Reintento del webhook NO duplica el cobro:
--   UPDATE message_logs SET status='delivered' WHERE twilio_sid='SM_test_1';
--   -- sigue habiendo 1 sola fila de débito.
--
--   -- 3. Saldo y disponibles:
--   SELECT tenant_wallet_balance_cop('<tenant>'), tenant_messages_available('<tenant>');
-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00033
-- ═══════════════════════════════════════════════════════════════
