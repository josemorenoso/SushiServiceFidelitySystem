-- ═══════════════════════════════════════════════════════════════════════════
-- 00060 — Golden Bullet por bloques (D-7) + salud de línea real (Bloque 3)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ref: docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md §20 / D-7
--      docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.4.1, §3.5
--      docs/features/golden-bullet.md
--
-- QUÉ HACE, EN UNA LÍNEA: abre tres estados nuevos y una fuente nueva. No mueve
-- una sola fila de historia — es puro CHECK. RIESGO BAJO.
--
-- POR QUÉ HACE FALTA:
--
--   1. Golden Bullet deja de enviar dentro del request HTTP y pasa a ENCOLARSE
--      en `send_queue`. Entre que un contacto se inserta y que el drenador lo
--      manda pasan DÍAS (25.000 contactos a 180/día son ~139 días). Ese estado
--      intermedio no existía: hoy un contacto salta de 'valid' a 'sent' dentro
--      del mismo bucle. Sin 'queued', el panel no puede distinguir "todavía no
--      le toca" de "nunca se intentó".
--
--   2. La plantilla nueva lleva un botón de rechazo ("no me interesa"). Quien
--      lo toca NO es cliente, así que su "no" no cabe en
--      `customers.whatsapp_opt_out_at` — que es el único sitio donde el sistema
--      mira hoy (`isPhoneOptedOut()` consulta SOLO `customers`). 'opted_out' es
--      dónde vive el "no" de alguien que nunca fue cliente.
--
--      ⚠️ NO se reusa el 'blocked' que ya existe: 'blocked' significa "no se le
--      escribió porque ya estaba en la tabla" (la regla anti-reenvío), que es
--      una decisión NUESTRA. 'opted_out' es una decisión SUYA. Mezclarlas
--      perdería la única evidencia de que una persona pidió salir, que es
--      justo lo que hay que poder demostrar.
--
--   3. El sondeo de salud de línea (Bloque 3) lee TAMBIÉN de Twilio, donde
--      viven 4 de las 5 marcas. `line_health_snapshots.source` solo admitía
--      'zernio_api' — un snapshot de Twilio habría reventado contra el CHECK,
--      dentro de un cron, en silencio.

-- ─────────────────────────────────────────────────────────────
-- 1. imported_contacts: 'queued' y 'opted_out'
-- ─────────────────────────────────────────────────────────────
ALTER TABLE imported_contacts DROP CONSTRAINT IF EXISTS imported_contacts_status_check;

ALTER TABLE imported_contacts ADD CONSTRAINT imported_contacts_status_check
  CHECK (status IN (
    'pending',    -- parseado, sin validar
    'valid',      -- válido, todavía sin plan de envío
    'invalid',    -- el CSV lo rechazó
    'queued',     -- NUEVO: en send_queue, esperando su bloque
    'sent',       -- el proveedor lo aceptó
    'delivered',  -- confirmado entregado
    'bounced',    -- el proveedor lo rechazó
    'converted',  -- volvió y se registró: ya es customer
    'blocked',    -- NO se le escribió (regla anti-reenvío). Decisión NUESTRA.
    'opted_out'   -- NUEVO: pidió salir. Decisión SUYA. Nunca se le vuelve a escribir.
  ));

COMMENT ON COLUMN imported_contacts.status IS
  'queued = encolado en send_queue esperando su bloque diario (pueden ser semanas). blocked = no se le escribió por la regla anti-reenvío, decisión nuestra. opted_out = tocó el botón de rechazo, decisión suya: es evidencia y no se mezcla con blocked.';

-- Búsqueda por teléfono para la guarda de opt-out de quien nunca fue cliente.
-- `isPhoneOptedOut()` cae aquí solo cuando NO hay fila en customers, así que
-- este índice se golpea poco — pero se golpea en el camino de CADA envío.
CREATE INDEX IF NOT EXISTS idx_imported_contacts_optout
    ON imported_contacts (tenant_id, phone)
    WHERE status = 'opted_out';

-- ─────────────────────────────────────────────────────────────
-- 2. line_health_snapshots: la fuente puede ser Twilio
-- ─────────────────────────────────────────────────────────────
ALTER TABLE line_health_snapshots DROP CONSTRAINT IF EXISTS line_health_snapshots_source_check;

ALTER TABLE line_health_snapshots ADD CONSTRAINT line_health_snapshots_source_check
  CHECK (source IN ('zernio_api', 'twilio_api', 'webhook', 'manual'));

COMMENT ON COLUMN line_health_snapshots.raw IS
  'Respuesta CRUDA del proveedor. Se guarda a propósito: de Zernio nunca se ha visto una respuesta real con un número conectado (los nombres de campo salen del OpenAPI, no de la realidad), así que el primer sondeo de verdad se audita aquí y no adivinando.';
