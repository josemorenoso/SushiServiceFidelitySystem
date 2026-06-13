-- ═══════════════════════════════════════════════════════════════
-- Migration 00021: Opt-out persistente de WhatsApp
-- Fecha: 2026-06-12
-- Descripción: Columna customers.whatsapp_opt_out_at. Resuelve el
--              hallazgo CRÍTICO de la auditoría 12-Julio: el webhook
--              entrante detectaba keywords de opt-out (SALIR/STOP/BAJA)
--              pero NO marcaba al cliente en la base de datos, así que
--              el sistema seguía intentando enviarle y generando errores
--              21610/63016. Ahora el opt-out se persiste, se verifica
--              antes de cada envío y se limpia con un opt-in (ALTA/START).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_opt_out_at timestamptz;

COMMENT ON COLUMN customers.whatsapp_opt_out_at IS 'Timestamp del último opt-out de WhatsApp (cliente respondió SALIR/STOP/BAJA o Twilio rechazó por 21610/63016). NULL = puede recibir mensajes. Se limpia con un opt-in (ALTA/START).';

-- Índice parcial: solo indexamos a los que están en opt-out (minoría),
-- para filtros rápidos en envíos masivos y en el dashboard.
CREATE INDEX IF NOT EXISTS idx_customers_whatsapp_opt_out
    ON customers(whatsapp_opt_out_at)
    WHERE whatsapp_opt_out_at IS NOT NULL;
