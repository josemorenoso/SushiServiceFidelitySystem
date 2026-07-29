-- ═══════════════════════════════════════════════════════════════
-- MIGRACIÓN 00034: Flag de tenant demo (ventas)
-- Fecha: 2026-07-29
-- Descripción: Columna `tenants.is_demo`. Un tenant marcado así nunca
--   dispara un envío real de WhatsApp — el guard vive en el único
--   embudo de envío (`sendTemplateMessage()`, src/services/whatsapp.service.ts),
--   así que cubre campañas manuales, cumpleaños, reactivación, calendario,
--   bienvenida QR, mystery box, etc. sin tocar cada ruta una por una.
-- Ver: docs/features/demo-tenant.md
-- Riesgo: BAJO — agrega una columna con DEFAULT, no reescribe datos.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.is_demo IS
  'true = tenant de demostración (equipo de ventas). sendTemplateMessage() nunca llama a Twilio de verdad para estos tenants; el mensaje se registra en message_logs como si se hubiera enviado, con twilio_sid NULL (no dispara el débito de billetera).';

-- ═══════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 00034
-- ═══════════════════════════════════════════════════════════════
