-- ═══════════════════════════════════════════════════════════════
-- Migration 00020: Message Logs (tracking de mensajes transaccionales)
-- Fecha: 2026-06-12
-- Descripción: Tabla message_logs que persiste TODOS los envíos de
--              WhatsApp (transaccionales y de campaña), no solo las
--              campañas. Resuelve los hallazgos CRÍTICOS de la auditoría
--              12-Julio: los mensajes de welcome/check-in/tier/mystery
--              box se enviaban "al aire" sin rastro en la base de datos.
--
--              Estados: pending → sent → (delivered | failed | undelivered)
--              La columna delivered_at queda lista para el webhook de
--              status callback de Twilio (tarea futura, sección 8.1 #3).
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Tabla message_logs ───
CREATE TABLE IF NOT EXISTS message_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
    phone           text NOT NULL,
    message_type    text NOT NULL,
    template_sid    text,
    variables       jsonb,
    status          text NOT NULL DEFAULT 'pending',
    twilio_sid      text,
    error_code      text,
    error_message   text,
    sent_at         timestamptz,
    delivered_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE message_logs IS 'Registro de TODOS los mensajes WhatsApp (transaccionales y campañas). Auditoría 12-Julio.';
COMMENT ON COLUMN message_logs.customer_id IS 'FK a customers; NULL si el envío ocurrió antes de crear el cliente o el cliente fue borrado.';
COMMENT ON COLUMN message_logs.message_type IS 'welcome | checkin | tier_unlocked | points_earned_near | points_earned_far | safe_reward | mystery_box | golden_box | birthday | reactivation | manual | event | delivery';
COMMENT ON COLUMN message_logs.status IS 'pending | sent | delivered | failed | undelivered';
COMMENT ON COLUMN message_logs.error_code IS 'Código de error Twilio (ej: 21610 opt-out, 21656 formato, 21665 count, 63003/63015 sin WhatsApp).';
COMMENT ON COLUMN message_logs.delivered_at IS 'Se llena cuando el webhook de status callback reporta delivered (tarea futura).';

-- ─── 2. Índices ───
CREATE INDEX IF NOT EXISTS idx_message_logs_customer ON message_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_status ON message_logs(status);
CREATE INDEX IF NOT EXISTS idx_message_logs_type ON message_logs(message_type);
CREATE INDEX IF NOT EXISTS idx_message_logs_created ON message_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_logs_twilio_sid ON message_logs(twilio_sid) WHERE twilio_sid IS NOT NULL;

-- ─── 3. RLS ───
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

-- Admin: lectura completa (dashboard de mensajería)
CREATE POLICY "admin_select_message_logs" ON message_logs
    FOR SELECT USING (auth.role() = 'authenticated');

-- Service role: INSERT/UPDATE (backend persiste los envíos y el webhook actualiza estados)
CREATE POLICY "service_insert_message_logs" ON message_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "service_update_message_logs" ON message_logs
    FOR UPDATE USING (true);
