-- ═══════════════════════════════════════════════════════════════
-- 00068 — El auto-chat de la propia línea como entrada de domicilios.
--
-- POR QUÉ: un restaurante chico tiene UN número, no dos. En Planeta Wings el
-- mesero escribe el pedido en «Envía mensajes a este mismo número» (el chat de
-- la línea consigo misma) y ahí WhatsApp NO genera ningún entrante: Meta no
-- entrega como `message.received` lo que un número se manda a sí mismo. El
-- intake de domicilios cuelga entero de ese evento, así que esos pedidos se
-- perdían sin dejar rastro (4 intentos verificados en el log de Zernio del
-- 2026-09-23, todos como `message.sent`).
--
-- QUÉ HACE: el webhook pasa a escuchar también `message.sent`. Para no meter
-- CADA envío de campaña al parser de domicilios (193 en un solo día) hace falta
-- distinguir el auto-chat de cualquier otra conversación, y el payload de
-- `message.sent` no dice a quién va: `ZernioInboxMessage` trae `conversationId`,
-- `direction` y `sender`, y en un saliente el `sender` es la marca — igual que
-- en una campaña. El destinatario solo podría estar en `payload.conversation`,
-- que el contrato (§5) no documenta y que el código trata como opaco.
--
-- Por eso el discriminador es el `conversationId`, que SÍ está tipado y es
-- estable: una columna por línea con el id del auto-chat. NULL = «todavía no se
-- sabe cuál es», y entonces el webhook solo observa y lo loguea para
-- descubrirlo. Ningún envío puede colarse: una campaña tiene otro
-- `conversationId` y nunca coincide.
--
-- NO ES un camino nuevo de negocio: al reconocerlo se llama al mismo
-- `processDeliveryMessage()` de siempre. El registro, la plantilla que le llega
-- al CLIENTE y el renglón de `message_logs` son idénticos a los de hoy.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE tenant_connections
  ADD COLUMN IF NOT EXISTS self_conversation_id text NULL;

COMMENT ON COLUMN tenant_connections.self_conversation_id IS
  'Id de la conversación de la línea CONSIGO MISMA en Zernio (el chat «Envía mensajes a este mismo número»). Es el único discriminador confiable de `message.sent`: el payload no trae destinatario y `sender` es la marca tanto en el auto-chat como en una campaña. NULL = sin descubrir → el webhook solo observa. Con valor, un `message.sent` de esa conversación se procesa como pedido de domicilio, y SOLO si el número propio está además en `authorized_numbers` (el opt-in del dueño, por marca).';

-- ─── Semilla: Planeta Wings Envigado ────────────────────────────
-- Sale del log de actividad de Zernio exportado el 2026-09-24: la conversación
-- 6aa499337c38ee9a45bc9d10 de la cuenta 6aa49149726ebfe037dce2a9 contiene
-- EXACTAMENTE los cuatro mensajes con formato de pedido, todos salientes y sin
-- un solo entrante en toda la ventana — que es justo lo que no puede ser una
-- conversación con un cliente real. Coincide con la captura del auto-chat.
--
-- Guardada y sin pisar nada: solo si la fila sigue sin id. Si resultara ser la
-- conversación equivocada, el efecto se limita a esa única conversación de esa
-- única marca y se corrige poniendo la columna en NULL.
UPDATE tenant_connections
   SET self_conversation_id = '6aa499337c38ee9a45bc9d10',
       updated_at           = now()
 WHERE zernio_account_id    = '6aa49149726ebfe037dce2a9'
   AND self_conversation_id IS NULL;
