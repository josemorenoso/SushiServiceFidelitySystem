/**
 * El pedido de domicilio escrito en el AUTO-CHAT de la propia línea.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * Un restaurante chico tiene UN número, no dos. En Planeta Wings el mesero abre
 * «Envía mensajes a este mismo número» y escribe ahí el pedido. Meta no entrega como
 * entrante lo que un número se manda a sí mismo, así que el intake —que cuelga entero
 * de `message.received`— nunca se enteraba: cuatro pedidos verificados en el log de
 * Zernio del 2026-09-23, todos salientes, todos perdidos.
 *
 * LO QUE SE PRUEBA AQUÍ ES, SOBRE TODO, LO QUE **NO** TIENE QUE PASAR
 * ──────────────────────────────────────────────────────────────────
 * `message.sent` no dispara solo con el auto-chat: dispara con CADA plantilla y CADA
 * campaña —193 en un solo día en una sola marca—. Y el payload no dice a quién va: en
 * un saliente el `sender` es la marca tanto en el auto-chat como en una campaña, y el
 * destinatario solo podría estar en `payload.conversation`, que el contrato §5 no
 * documenta. Un filtro flojo aquí no es un bug menor: mete cada envío de campaña al
 * parser de domicilios y fabrica clientes y visitas que nadie hizo.
 *
 * Por eso el discriminador es `tenant_connections.self_conversation_id` (00068), y por
 * eso el primer test de este archivo es el de la campaña que NO debe entrar. Si alguien
 * afloja el filtro —comparando por `sender`, o cayendo a un "si no sé, proceso"— se
 * pone rojo.
 *
 * ⚠️ Sin base de datos y sin red: Supabase, el tenant y el servicio de domicilios están
 * sustituidos por dobles. La firma HMAC sí es real: se calcula igual que en producción.
 *
 * Ref: `docs/features/delivery-webhook.md` § "El auto-chat de la propia línea"
 *      `supabase/migrations/00068_auto_chat_domicilios.sql`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'

// ═══════════════════════════════════════════════════════════════
// Dobles
// ═══════════════════════════════════════════════════════════════

/** Respuesta que devolverá el `await` sobre el builder, por tabla. */
let respuestas: Record<string, { data: unknown; error: unknown }> = {}
/** Tablas consultadas, en orden — para comprobar que ni se tocan cuando no toca. */
let tablasVistas: string[] = []

function builderPara(tabla: string): unknown {
  tablasVistas.push(tabla)
  const builder: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolver: (v: unknown) => unknown, rechazar: (e: unknown) => unknown) =>
            Promise.resolve(respuestas[tabla] ?? { data: null, error: null }).then(resolver, rechazar)
        }
        return () => builder
      },
    }
  )
  return builder
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (tabla: string) => builderPara(tabla) }),
}))

const TENANT = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'planeta-wings',
  config: {},
  zernio_account_id: 'acc_pw',
}

let tenantResuelto: unknown = TENANT

vi.mock('@/lib/tenant', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, getTenantByZernioAccountId: async () => tenantResuelto }
})

const procesarDomicilio = vi.fn(async (_entrada: Record<string, unknown>) => ({ ok: true as const }))
const registrarFallo = vi.fn(async () => {})

vi.mock('@/services/delivery.service', () => ({
  processDeliveryMessage: (entrada: Record<string, unknown>) => procesarDomicilio(entrada),
  logDeliveryIntakeFailure: (...args: unknown[]) => registrarFallo(...(args as [])),
}))

// ═══════════════════════════════════════════════════════════════
// Utilidades
// ═══════════════════════════════════════════════════════════════

const SECRET = 'secreto-de-prueba'
const CONV_AUTO_CHAT = 'conv_auto_chat'
const PEDIDO = 'Gloria Bedoya\n310 3891390\nOctubre 5 de 1982\nEnvigado'

function sobreMessageSent(over: { conversationId?: string; text?: string | null } = {}) {
  return {
    id: 'evt_1',
    event: 'message.sent',
    message: {
      id: 'msg_1',
      conversationId: over.conversationId ?? CONV_AUTO_CHAT,
      platform: 'whatsapp',
      platformMessageId: 'wamid.1',
      direction: 'outgoing',
      text: over.text === undefined ? PEDIDO : over.text,
      sender: { id: '573009033799', name: 'Planeta Wings Envigado' },
      sentAt: '2026-09-23T20:42:49.000Z',
    },
    conversation: {},
    account: { accountId: 'acc_pw' },
    timestamp: '2026-09-23T20:42:49.000Z',
  }
}

async function postear(sobre: unknown) {
  const { POST } = await import('@/app/api/webhook/zernio/route')
  const body = JSON.stringify(sobre)
  const firma = crypto.createHmac('sha256', SECRET).update(body, 'utf-8').digest('hex')
  const req = new Request('https://example.com/api/webhook/zernio', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-zernio-signature': firma },
  })
  // La ruta tipa su parámetro como NextRequest, pero solo usa `headers` y `text()`.
  return POST(req as never)
}

/** La marca ya sabe cuál es su auto-chat y tiene su número propio en Autorizados. */
function marcaConfigurada() {
  respuestas = {
    tenant_connections: {
      data: { phone_e164: '+573009033799', self_conversation_id: CONV_AUTO_CHAT },
      error: null,
    },
    authorized_numbers: { data: { id: 'auth_1', location_id: 'sede-envigado' }, error: null },
    webhook_events_seen: { data: null, error: null },
  }
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
  process.env.ZERNIO_WEBHOOK_SECRET = SECRET
  respuestas = {}
  tablasVistas = []
  tenantResuelto = TENANT
  procesarDomicilio.mockClear()
  registrarFallo.mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════
// Lo que NO tiene que pasar
// ═══════════════════════════════════════════════════════════════

describe('message.sent que NO es el auto-chat', () => {
  it('una campaña a un cliente jamás entra al parser de domicilios', async () => {
    marcaConfigurada()

    const res = await postear(sobreMessageSent({ conversationId: 'conv_de_un_cliente' }))

    expect(res.status).toBe(200)
    expect(procesarDomicilio).not.toHaveBeenCalled()
    // Y ni siquiera llega a mirar Autorizados: el filtro corta antes.
    expect(tablasVistas).not.toContain('authorized_numbers')
  })

  it('sin auto-chat conocido (columna NULL) no hay efecto, solo la observación que lo descubre', async () => {
    respuestas = {
      tenant_connections: { data: { phone_e164: '+573009033799', self_conversation_id: null }, error: null },
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await postear(sobreMessageSent())

    expect(res.status).toBe(200)
    expect(procesarDomicilio).not.toHaveBeenCalled()
    // El log es el que deja ver el conversationId del auto-chat para poder configurarlo...
    const linea = log.mock.calls.map((c) => String(c[0])).join('\n')
    expect(linea).toContain(CONV_AUTO_CHAT)
    // ...pero nunca el contenido: una conversación con un cliente es privada.
    expect(linea).not.toContain('Gloria')
  })

  it('un fallo leyendo tenant_connections no se disfraza de «esta marca no tiene auto-chat»', async () => {
    respuestas = {
      tenant_connections: { data: null, error: { code: '57014', message: 'statement timeout' } },
    }

    const res = await postear(sobreMessageSent())

    expect(res.status).toBe(200)
    expect(procesarDomicilio).not.toHaveBeenCalled()
    expect(tablasVistas).not.toContain('authorized_numbers')
  })

  it('el auto-chat sin el número propio en Autorizados no registra nada (el opt-in es del dueño)', async () => {
    marcaConfigurada()
    respuestas.authorized_numbers = { data: null, error: null }

    const res = await postear(sobreMessageSent())

    expect(res.status).toBe(200)
    expect(procesarDomicilio).not.toHaveBeenCalled()
  })

  it('una foto en el auto-chat no dispara el parser', async () => {
    marcaConfigurada()

    const res = await postear(sobreMessageSent({ text: '' }))

    expect(res.status).toBe(200)
    expect(procesarDomicilio).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════
// Lo que sí
// ═══════════════════════════════════════════════════════════════

describe('message.sent en el auto-chat', () => {
  it('registra el pedido con el mismo motor de siempre y la sede del número autorizado', async () => {
    marcaConfigurada()

    const res = await postear(sobreMessageSent())

    expect(res.status).toBe(200)
    expect(procesarDomicilio).toHaveBeenCalledTimes(1)
    expect(procesarDomicilio.mock.calls[0][0]).toMatchObject({
      rawMessage: PEDIDO,
      // 10 dígitos, igual criterio que el camino entrante: el +57 no viaja.
      operatorPhone: '3009033799',
      operatorLocationId: 'sede-envigado',
    })
  })

  it('un reintento de Zernio no cobra dos veces la visita', async () => {
    marcaConfigurada()
    // 23505 = unique_violation: el evento ya estaba en webhook_events_seen.
    respuestas.webhook_events_seen = { data: null, error: { code: '23505', message: 'duplicate key' } }

    const res = await postear(sobreMessageSent())

    expect(res.status).toBe(200)
    expect(procesarDomicilio).not.toHaveBeenCalled()
  })

  it('una marca sin línea resuelta no registra a ciegas', async () => {
    tenantResuelto = null

    const res = await postear(sobreMessageSent())

    expect(res.status).toBe(200)
    expect(procesarDomicilio).not.toHaveBeenCalled()
    expect(tablasVistas).toHaveLength(0)
  })
})
