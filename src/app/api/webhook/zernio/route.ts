/**
 * Webhook entrante de Zernio (mensajería WhatsApp).
 *
 * Contraparte de src/app/api/webhook/twilio-incoming/route.ts para tenants
 * `messaging_provider='zernio'`. Diferencias clave con Twilio (ver
 * src/lib/zernio/webhooks.ts y docs/features/zernio-messaging.md):
 *   - La firma es HMAC-SHA256 en el header `X-Zernio-Signature` (alias legado
 *     `X-Late-Signature`), y Zernio la trata como OPCIONAL. Este endpoint la
 *     EXIGE siempre — sin ZERNIO_WEBHOOK_SECRET configurado, todo se rechaza.
 *   - El payload es un sobre JSON anidado, nada parecido al Body/From/To plano
 *     de Twilio — hay que traducirlo antes de reenviar a n8n.
 *   - No hay TwiML: Zernio solo exige un 2xx en menos de 5s, sin body ni
 *     formato particular. No hay forma de "responder" al cliente en la misma
 *     petición — una respuesta real requeriría una llamada de salida aparte,
 *     que hoy no existe en src/lib/zernio/messaging.ts (solo hay envío de
 *     PLANTILLAS aprobadas, nunca texto libre — ver la cabecera de
 *     whatsapp.service.ts). Por eso el detector de intención (pedido/horario/
 *     ubicación) solo se usa para LOGGING aquí, no para enviar un auto-reply:
 *     queda documentado como pendiente en docs/features/zernio-messaging.md.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyZernioSignature } from '@/lib/zernio/webhooks'
import type {
  ZernioWebhookPayload,
  ZernioWebhookPayloadMessage,
  ZernioWebhookPayloadDeliveryStatus,
  ZernioWebhookPayloadTemplateStatus,
} from '@/lib/zernio/webhooks'
import type { ZernioTemplateStatus } from '@/lib/zernio/templates'
import { getTenantByZernioAccountId } from '@/lib/tenant'
import { setWhatsappOptOut, clearWhatsappOptOut } from '@/services/customer.service'
import { applyProviderTemplateStatus } from '@/services/template.service'

// Mismos keywords que twilio-incoming/route.ts (duplicados a propósito: son
// ~2 líneas estables y extraerlos a un módulo compartido es más cambio del
// que amerita esta migración — ver docs/features/zernio-messaging.md).
const OPT_OUT_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'CANCELAR', 'END', 'QUIT', 'BAJA', 'SALIR', 'SAL', 'SALI', 'FUERA', 'OPTOUT', 'NO']
const OPT_IN_KEYWORDS = ['START', 'UNSTOP', 'YES', 'SI', 'ALTA', 'ACEPTO']

const INTENT_KEYWORDS: Record<string, string[]> = {
  pedido: ['pedido', 'domicilio', 'delivery', 'comprar', 'ordenar', 'pedir', 'menu', 'carta'],
  horario: ['horario', 'abierto', 'abren', 'cierran', 'hora', 'horas'],
  ubicacion: ['direccion', 'ubicacion', 'donde', 'queda', 'dirección', 'ubicación', 'cómo llego'],
}

function detectIntent(text: string): keyof typeof INTENT_KEYWORDS | 'default' {
  const lower = text.toLowerCase()
  for (const [intent, words] of Object.entries(INTENT_KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) return intent as keyof typeof INTENT_KEYWORDS
  }
  return 'default'
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

/** El schema exacto de `account` en `message.received` no está confirmado en la
 * doc pública (webhooks.ts lo trata como opaco) — para los eventos de
 * plantilla/número SÍ está confirmado como `{ accountId, profileId, ... }`
 * (ver Level 2.0/aios-constelarys/docs/zernio-api-contract.md §5). Se asume
 * la misma convención aquí; `id` queda como fallback defensivo. */
function extractAccountId(account: Record<string, unknown>): string | null {
  const raw = (account as { accountId?: unknown }).accountId ?? (account as { id?: unknown }).id
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

/** Normaliza a 10 dígitos colombianos, igual criterio que normalizePhone() en twilio-incoming. */
function normalizeZernioPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/[^0-9]/g, '').replace(/^57/, '').slice(-10)
}

/**
 * F5 (post-review): dedup de webhooks por evento. Zernio reintenta hasta 7 veces
 * con backoff exponencial si no recibe 2xx a tiempo (ver src/lib/zernio/webhooks.ts),
 * así que el mismo evento puede llegarnos más de una vez — sin esto, un reintento
 * dispararía otra vez el opt-out o el forward a n8n de `handleMessageReceived()`.
 * Se persiste con PK (provider, event_id) — el segundo INSERT choca con 23505.
 * Fail-open: si la tabla `webhook_events_seen` no existe todavía (migración
 * 00036 sin aplicar en ese entorno, error 42P01), se loguea y se sigue SIN dedup
 * — jamás se rompe el webhook por esto.
 */
async function isDuplicateZernioEvent(eventId: string): Promise<boolean> {
  const db = getServiceClient()
  const { error } = await db.from('webhook_events_seen').insert({ provider: 'zernio', event_id: eventId })
  if (!error) return false
  if (error.code === '23505') return true // unique_violation → ya procesamos este evento
  if (error.code === '42P01') {
    console.warn('[webhook/zernio] webhook_events_seen no existe todavía (migración 00036 pendiente) — sin dedup')
    return false
  }
  console.error('[webhook/zernio] Error insertando en webhook_events_seen:', error.message)
  return false
}

async function handleMessageReceived(payload: ZernioWebhookPayloadMessage): Promise<NextResponse> {
  const accountId = extractAccountId(payload.account)
  const tenant = accountId ? await getTenantByZernioAccountId(accountId) : null
  if (!tenant) {
    console.warn(`[webhook/zernio] message.received sin tenant resuelto (accountId=${accountId ?? 'n/a'})`)
    // Zernio necesita un 2xx o reintenta la entrega — jamás 5xx, igual que twilio-incoming.
    return new NextResponse(null, { status: 200 })
  }

  const message = payload.message

  // F4 (post-review): desde abril-2026 Meta puede mandar el BSUID (business-scoped
  // user id, un identificador OPACO) en vez de un `phoneNumber` real — ver
  // ZernioInboxMessageSender en src/lib/zernio/webhooks.ts. Antes se usaba
  // `message.sender.id` como fallback y eso derivaba "10 dígitos" de un BSUID,
  // generando opt-outs sobre números falsos y rompiendo el match contra
  // `authorized_numbers`. Sin `phoneNumber` real no hay nada seguro que hacer con
  // este mensaje: se corta aquí, sin ningún efecto de negocio.
  if (!message.sender.phoneNumber) {
    console.warn('[zernio] message.received sin phoneNumber (BSUID) — sin opt-out ni forward', { messageId: message.id })
    return new NextResponse(null, { status: 200 })
  }

  const rawPhone = message.sender.phoneNumber
  const phone = normalizeZernioPhone(rawPhone)
  const text = (message.text ?? '').trim()
  const upper = text.toUpperCase()

  // F5 (post-review): dedup por evento ANTES de cualquier efecto de negocio
  // (opt-out, forward a n8n) — ver isDuplicateZernioEvent().
  const eventId = payload.id || message.id
  if (await isDuplicateZernioEvent(eventId)) {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
  }

  // Opt-out / opt-in: réplica exacta del criterio de twilio-incoming — persistimos
  // el estado en NUESTRA base para dejar de intentar enviarle (auditoría 12-Julio, tarea 8).
  if (OPT_OUT_KEYWORDS.includes(upper)) {
    if (phone.length === 10) {
      await setWhatsappOptOut(phone, tenant.id)
      console.log(`[webhook/zernio] opt-out persistido para ${phone} (keyword="${upper}", tenant=${tenant.slug})`)
    }
    return new NextResponse(null, { status: 200 })
  }
  if (OPT_IN_KEYWORDS.includes(upper)) {
    if (phone.length === 10) {
      await clearWhatsappOptOut(phone, tenant.id)
      console.log(`[webhook/zernio] opt-in: opt-out limpiado para ${phone} (keyword="${upper}", tenant=${tenant.slug})`)
    }
    return new NextResponse(null, { status: 200 })
  }

  // Reenvío a n8n (mesero autorizado → flujo de domicilios), MISMO formato plano
  // que manda twilio-incoming hoy: Body/From/To/tenant_slug. Se mantiene el mismo
  // gate de "solo remitentes autorizados" que Twilio — reenviar CUALQUIER mensaje
  // entrante desnaturalizaría el workflow de n8n (diseñado para pedidos de mesero,
  // no para texto libre de clientes finales).
  if (phone.length === 10) {
    try {
      const db = getServiceClient()
      const { data: authorized } = await db
        .from('authorized_numbers')
        .select('id')
        .eq('phone', phone)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .maybeSingle()

      if (authorized) {
        const n8nUrl = process.env.N8N_DOMICILIOS_WEBHOOK_URL
        if (!n8nUrl) {
          console.error('[webhook/zernio] N8N_DOMICILIOS_WEBHOOK_URL no configurado')
          return new NextResponse(null, { status: 200 })
        }

        console.log(`[webhook/zernio] mesero autorizado ${phone} → forwarding a n8n (tenant=${tenant.slug})`)

        const forwardBody = new URLSearchParams({
          Body: text,
          From: rawPhone ?? '',
          To: tenant.zernio_phone_number ?? '',
          tenant_slug: tenant.slug,
        })

        await fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: forwardBody.toString(),
        })
        // A diferencia de twilio-incoming, no hay TwiML que relayar de vuelta al
        // cliente — Zernio no soporta una respuesta síncrona con contenido. n8n
        // procesa el pedido igual; cualquier confirmación al mesero requeriría
        // una llamada de salida aparte (pendiente, ver docs/features/zernio-messaging.md).
        return new NextResponse(null, { status: 200 })
      }
    } catch (err) {
      console.error('[webhook/zernio] Error forwarding a n8n:', err)
      return new NextResponse(null, { status: 200 })
    }
  }

  // No es mesero autorizado ni opt-out/in: se detecta la intención solo para
  // telemetría/logging. NO se envía auto-reply — Zernio aquí no tiene un canal
  // de texto libre disponible (solo plantillas aprobadas, ver whatsapp.service.ts).
  const intent = detectIntent(text)
  console.log(`[webhook/zernio] message.received tenant=${tenant.slug} from=${rawPhone} intent=${intent} (sin auto-reply: pendiente)`)

  return new NextResponse(null, { status: 200 })
}

async function handleDeliveryStatus(payload: ZernioWebhookPayloadDeliveryStatus): Promise<NextResponse> {
  const db = getServiceClient()
  const messageId = payload.message.id

  const update: Record<string, unknown> = {}
  if (payload.event === 'message.delivered') {
    update.status = 'delivered'
    update.delivered_at = payload.statusAt ?? new Date().toISOString()
  } else if (payload.event === 'message.read') {
    // 'read' extiende la convención documentada de message_logs.status
    // (pending|sent|delivered|failed|undelivered) — es información nueva que
    // Twilio nunca llegó a alimentar (no tiene webhook de status conectado).
    update.status = 'read'
  } else {
    update.status = 'failed'
    if (payload.error) {
      update.error_code = payload.error.code
      update.error_message = payload.error.message
    }
  }

  // F1 (post-review): Zernio no garantiza entrega FIFO de sus webhooks (reintentos
  // con backoff exponencial) — el UPDATE respeta la jerarquía sent < delivered < read
  // y nunca degrada un estado más avanzado que ya esté guardado:
  //   - message.read: el estado más alto, se aplica sin condición extra.
  //   - message.delivered: no debe pisar un 'read' que ya llegó fuera de orden.
  //   - message.failed: no debe pisar una entrega o lectura ya confirmadas (un
  //     failed tardío no puede deshacer un delivered/read real).
  let mutation = db
    .from('message_logs')
    .update(update)
    .eq('twilio_sid', messageId) // NO renombrar: mismo criterio que sendViaZernio() — ver whatsapp.service.ts.
  if (payload.event === 'message.delivered') {
    mutation = mutation.neq('status', 'read')
  } else if (payload.event === 'message.failed') {
    mutation = mutation.not('status', 'in', '(delivered,read)')
  }

  const { data, error } = await mutation.select('id')

  if (error) {
    console.error(`[webhook/zernio] Error actualizando message_logs para messageId=${messageId}:`, error.message)
  } else if (!data || data.length === 0) {
    console.warn(`[webhook/zernio] ${payload.event}: ningún message_logs con twilio_sid=${messageId} (¿mensaje no registrado o ya limpiado?)`)
  }

  return new NextResponse(null, { status: 200 })
}

/**
 * `whatsapp.template.status_updated` — el veredicto de Meta sobre una plantilla.
 *
 * ES EL DISPARADOR DEL CAMBIO DE PUNTERO del §12: mientras Meta revisaba, los
 * envíos seguían saliendo con la plantilla vieja; cuando llega este evento con
 * `status: APPROVED`, el puntero pasa a la nueva y la vieja se marca retirada.
 * Si llega `REJECTED`, la vieja se queda como está y el rechazo queda visible en
 * la pantalla de Plantillas.
 *
 * Toda la decisión vive en `applyProviderTemplateStatus()` — aquí no se escribe
 * ni una fila. Ese servicio es la puerta única para que el Bloque 3 de la
 * gobernanza de envío pueda reusarlo sin duplicar la lógica de promoción.
 *
 * Siempre 200: un 4xx/5xx acumulado hace que Zernio desactive el webhook entero
 * tras 10 fallos consecutivos, y perder los eventos de mensajes por un problema
 * con una plantilla sería mucho peor que perder este evento.
 */
async function handleTemplateStatusUpdated(
  payload: ZernioWebhookPayloadTemplateStatus
): Promise<NextResponse> {
  if (await isDuplicateZernioEvent(payload.id)) {
    return new NextResponse(null, { status: 200 })
  }

  const accountId = extractAccountId(payload.account)
  if (!accountId) {
    console.warn('[webhook/zernio] template.status_updated sin accountId')
    return new NextResponse(null, { status: 200 })
  }

  const tenant = await getTenantByZernioAccountId(accountId)
  if (!tenant) {
    console.warn(`[webhook/zernio] template.status_updated de un account desconocido: ${accountId}`)
    return new NextResponse(null, { status: 200 })
  }

  try {
    const outcome = await applyProviderTemplateStatus({
      provider: 'zernio',
      tenantId: tenant.id,
      providerRef: payload.template.name,
      language: payload.template.language,
      status: payload.template.status as ZernioTemplateStatus,
      // El contrato manda 'NONE' cuando no hay motivo, no null.
      reason:
        payload.template.reason && payload.template.reason !== 'NONE'
          ? payload.template.reason
          : null,
    })
    console.log(
      `[webhook/zernio] template ${payload.template.name} → ${payload.template.status} (${tenant.slug}):`,
      outcome.handled ? outcome.action : outcome.reason
    )
  } catch (err) {
    console.error('[webhook/zernio] Error procesando template.status_updated:', err)
  }

  return new NextResponse(null, { status: 200 })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // F7 (post-review): los payloads documentados de Zernio son de pocos KB — se
  // corta ANTES de leer el body si el header dice que excede el límite, para no
  // materializar en memoria un body arbitrariamente grande.
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > 65536) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('x-zernio-signature') ?? req.headers.get('x-late-signature')

  if (!verifyZernioSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let payload: ZernioWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    console.error('[webhook/zernio] Body no es JSON válido')
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (payload.event === 'webhook.test') {
    console.log('[webhook/zernio] webhook.test recibido:', payload.message)
    return new NextResponse(null, { status: 200 })
  }

  if (payload.event === 'message.received') {
    return handleMessageReceived(payload)
  }

  if (payload.event === 'message.delivered' || payload.event === 'message.read' || payload.event === 'message.failed') {
    return handleDeliveryStatus(payload)
  }

  if (payload.event === 'whatsapp.template.status_updated') {
    return handleTemplateStatusUpdated(payload)
  }

  // Zernio puede agregar eventos nuevos sin avisar (16 plataformas, no solo
  // WhatsApp) — cualquier evento no manejado se reconoce con 2xx y se loguea,
  // nunca se rechaza (evitaría que Zernio desactive el webhook tras 10 fallos).
  console.log(`[webhook/zernio] Evento no manejado: ${payload.event}`)
  return new NextResponse(null, { status: 200 })
}
