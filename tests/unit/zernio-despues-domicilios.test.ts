/**
 * ESCALA-3 — el webhook de Zernio contesta ANTES de llamar a OpenAI.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * `POST /api/webhook/zernio` esperaba (`await processDeliveryMessage(…)`) el parseo con IA y el
 * registro del domicilio antes de contestar. OpenAI tiene 8 s de timeout y un reintento (peor caso
 * ~16 s); Zernio pide un 2xx en menos de 5 s, y **diez fallos seguidos le apagan el webhook a TODAS
 * las marcas Zernio**. Todas las marcas nuevas van por Zernio: un día lento de OpenAI era un día
 * sin domicilios para todas.
 *
 * Ahora la ruta contesta 200 y deja el parseo y el registro para DESPUÉS de la respuesta
 * (`after()` de `next/server`). La firma, el dedup por evento y la consulta a `authorized_numbers`
 * siguen ANTES de contestar: lo que se difiere es solo lo lento.
 *
 * `after()` FUERA DE UN REQUEST DE NEXT LANZA
 * ───────────────────────────────────────────
 * («`after` was called outside a request scope», verificado en Next 16.2.2.) Por eso el doble de
 * `next/server` de este archivo la CAPTURA en vez de ejecutarla: el test la corre a mano, después
 * de que `POST` ya contestó, que es exactamente el orden que impone Next. La ruta no se dobla para
 * el test: el doble está aquí.
 *
 * LO QUE NO PUEDE PASAR
 * ─────────────────────
 * `logDeliveryIntakeFailure()` es el ÚNICO embudo por el que se pierde un domicilio. Un error
 * dentro del trabajo diferido que no pase por él es un pedido perdido sin rastro: Next solo lo
 * deja como una línea genérica en el log. Los tests de abajo fijan que todo fallo inesperado llega
 * al embudo, que se ESPERA (una promesa flotante en una función serverless se puede cortar), y que
 * la ruta no lo escribe una segunda vez cuando `processDeliveryMessage()` ya lo hizo por dentro.
 *
 * ⚠️ Sin base de datos y sin red. La firma HMAC sí es real: se calcula igual que en producción.
 *
 * Ref: `docs/features/delivery-webhook.md` § «Zernio contesta antes de la IA»
 *      `tests/unit/zernio-auto-chat-domicilios.test.ts` (qué mensajes se registran y cuáles no)
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'

// ═══════════════════════════════════════════════════════════════
// Dobles
// ═══════════════════════════════════════════════════════════════

/** Respuesta que devolverá el `await` sobre el builder, por tabla. */
let respuestas: Record<string, { data: unknown; error: unknown }> = {}
/** Tablas consultadas, en orden. */
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

vi.mock('@/lib/tenant', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, getTenantByZernioAccountId: async () => TENANT }
})

const procesarDomicilio = vi.fn<(entrada: Record<string, unknown>) => Promise<unknown>>(async () => ({ ok: true }))
const registrarFallo = vi.fn<(args: Record<string, unknown>) => Promise<void>>(async () => {})

vi.mock('@/services/delivery.service', () => ({
  processDeliveryMessage: (entrada: Record<string, unknown>) => procesarDomicilio(entrada),
  logDeliveryIntakeFailure: (args: Record<string, unknown>) => registrarFallo(args),
}))

/** Lo que la ruta le pidió a `after()`, sin ejecutar: Next lo ejecuta DESPUÉS de la respuesta. */
const pendientes: Array<() => unknown> = []

vi.mock('next/server', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    after: (trabajo: () => unknown) => {
      pendientes.push(trabajo)
    },
  }
})

/** Corre lo diferido, en orden y cada tarea hasta el final, como lo hace Next tras la respuesta. */
async function vaciarDespues() {
  while (pendientes.length > 0) {
    const tarea = pendientes.shift()!
    await tarea()
  }
}

// ═══════════════════════════════════════════════════════════════
// Utilidades
// ═══════════════════════════════════════════════════════════════

const SECRET = 'secreto-de-prueba'
const CONV_AUTO_CHAT = 'conv_auto_chat'
const PEDIDO = 'Gloria Bedoya\n310 3891390\nOctubre 5 de 1982\nEnvigado'
const OPERADOR = '3001234567'
const LINEA_PROPIA = '3009033799'

function sobreMessageReceived() {
  return {
    id: 'evt_rx_1',
    event: 'message.received',
    message: {
      id: 'msg_rx_1',
      conversationId: 'conv_operador',
      platform: 'whatsapp',
      platformMessageId: 'wamid.rx1',
      direction: 'incoming',
      text: PEDIDO,
      sender: { id: '573001234567', name: 'Operador', phoneNumber: '+573001234567' },
      sentAt: '2026-10-04T15:00:00.000Z',
    },
    conversation: {},
    account: { accountId: 'acc_pw' },
    timestamp: '2026-10-04T15:00:00.000Z',
  }
}

function sobreMessageSent() {
  return {
    id: 'evt_tx_1',
    event: 'message.sent',
    message: {
      id: 'msg_tx_1',
      conversationId: CONV_AUTO_CHAT,
      platform: 'whatsapp',
      platformMessageId: 'wamid.tx1',
      direction: 'outgoing',
      text: PEDIDO,
      sender: { id: '573009033799', name: 'Planeta Wings Envigado' },
      sentAt: '2026-10-04T15:00:00.000Z',
    },
    conversation: {},
    account: { accountId: 'acc_pw' },
    timestamp: '2026-10-04T15:00:00.000Z',
  }
}

async function postear(sobre: unknown, firmaValida = true) {
  const { POST } = await import('@/app/api/webhook/zernio/route')
  const body = JSON.stringify(sobre)
  const firma = firmaValida
    ? crypto.createHmac('sha256', SECRET).update(body, 'utf-8').digest('hex')
    : 'firma-que-no-es'
  const req = new Request('https://example.com/api/webhook/zernio', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-zernio-signature': firma },
  })
  // La ruta tipa su parámetro como NextRequest, pero solo usa `headers` y `text()`.
  return POST(req as never)
}

/**
 * `POST`, pero que FALLA (en vez de colgar el test) si no contesta en un segundo y medio. Antes
 * del arreglo la ruta esperaba a `processDeliveryMessage()`: con una promesa que no termina nunca
 * no contestaba jamás.
 *
 * El módulo de la ruta se precarga en `beforeAll`: el plazo mide el `POST` y NADA más. Compilar la
 * ruta y sus imports la primera vez tarda más que el plazo, y sin la precarga el primer test
 * marcaba «colgado» en falso — y su `POST`, que terminaba después, metía su `after()` en el test
 * siguiente.
 */
async function postearConPlazo(sobre: unknown): Promise<Response | 'colgado'> {
  return Promise.race([
    postear(sobre),
    new Promise<'colgado'>((resolver) => setTimeout(() => resolver('colgado'), 1500)),
  ])
}

/** El operador está autorizado en Domicilios → Autorizados y la sede sale de su fila. */
function operadorAutorizado() {
  respuestas = {
    authorized_numbers: { data: { id: 'auth_1', location_id: 'sede-envigado' }, error: null },
    webhook_events_seen: { data: null, error: null },
  }
}

/** La marca ya sabe cuál es su auto-chat y tiene su número propio en Autorizados. */
function autoChatConfigurado() {
  respuestas = {
    tenant_connections: {
      data: { phone_e164: '+573009033799', self_conversation_id: CONV_AUTO_CHAT },
      error: null,
    },
    authorized_numbers: { data: { id: 'auth_1', location_id: 'sede-envigado' }, error: null },
    webhook_events_seen: { data: null, error: null },
  }
}

beforeAll(async () => {
  // Ver `postearConPlazo()`: la carga del módulo no puede contar contra el plazo del POST.
  await import('@/app/api/webhook/zernio/route')
})

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
  process.env.ZERNIO_WEBHOOK_SECRET = SECRET
  respuestas = {}
  tablasVistas = []
  pendientes.length = 0
  procesarDomicilio.mockReset()
  procesarDomicilio.mockResolvedValue({ ok: true })
  registrarFallo.mockReset()
  registrarFallo.mockResolvedValue(undefined)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════
// El pedido de un operador autorizado (message.received)
// ═══════════════════════════════════════════════════════════════

describe('message.received de un operador autorizado', () => {
  it('contesta 200 aunque processDeliveryMessage no termine NUNCA', async () => {
    operadorAutorizado()
    procesarDomicilio.mockImplementation(() => new Promise(() => {})) // OpenAI colgado

    const res = await postearConPlazo(sobreMessageReceived())

    expect(res, 'la ruta sigue esperando al parseo: Zernio la daría por caída a los 5 s').not.toBe('colgado')
    expect((res as Response).status).toBe(200)
  })

  it('contesta ANTES de procesar: el parseo corre solo cuando after() ejecuta lo diferido', async () => {
    operadorAutorizado()

    const res = await postear(sobreMessageReceived())

    expect(res.status).toBe(200)
    // Ya contestó, y todavía no se llamó a la IA ni se registró nada: eso queda para después.
    expect(procesarDomicilio).not.toHaveBeenCalled()
    expect(pendientes).toHaveLength(1)

    await vaciarDespues()

    expect(procesarDomicilio).toHaveBeenCalledTimes(1)
    expect(procesarDomicilio.mock.calls[0][0]).toMatchObject({
      tenant: TENANT,
      rawMessage: PEDIDO,
      // 10 dígitos, igual criterio de siempre: el +57 no viaja.
      operatorPhone: OPERADOR,
      // La sede sale de la MISMA fila que autorizó al operador (D9).
      operatorLocationId: 'sede-envigado',
    })
  })

  it('el cuerpo no inventa un resultado que todavía no existe', async () => {
    operadorAutorizado()

    const res = await postear(sobreMessageReceived())

    // Antes decía `delivery: true|false`, el resultado del parseo. Contestando antes de parsear no
    // hay resultado que reportar: decir `true` sería mentir, y `false`, culpar a un pedido sano.
    expect(await res.json()).toEqual({ received: true, deferred: true })
  })

  it('un fallo INESPERADO del trabajo diferido llega al embudo, con el pedido y quién lo mandó', async () => {
    operadorAutorizado()
    procesarDomicilio.mockRejectedValue(new Error('boom: algo que processDeliveryMessage no preveía'))

    await postear(sobreMessageReceived())
    await expect(vaciarDespues()).resolves.toBeUndefined() // el error NO escapa del after()

    expect(registrarFallo).toHaveBeenCalledTimes(1)
    expect(registrarFallo.mock.calls[0][0]).toMatchObject({
      tenant: TENANT,
      operatorPhone: OPERADOR,
      reason: 'intake_inesperado',
      rawMessage: PEDIDO,
      detail: expect.stringContaining('boom'),
    })
  })

  it('el embudo se ESPERA: lo diferido no termina antes de que el INSERT del fallo termine', async () => {
    operadorAutorizado()
    procesarDomicilio.mockRejectedValue(new Error('boom'))
    let escrito = false
    registrarFallo.mockImplementation(async () => {
      // Un INSERT de verdad cede el turno. Si la ruta no lo espera, `escrito` sigue en false.
      await new Promise((resolver) => setTimeout(resolver, 20))
      escrito = true
    })

    await postear(sobreMessageReceived())
    await pendientes.shift()!()

    expect(escrito, 'una promesa flotante en serverless se corta cuando la respuesta ya salió').toBe(true)
  })

  it('si processDeliveryMessage devuelve ok:false (ya pasó por el embudo adentro), la ruta NO lo escribe otra vez', async () => {
    operadorAutorizado()
    procesarDomicilio.mockResolvedValue({ ok: false, reason: 'ia_error', detail: 'timeout' })

    await postear(sobreMessageReceived())
    await vaciarDespues()

    expect(procesarDomicilio).toHaveBeenCalledTimes(1)
    // Un segundo escritor de `delivery_intake_failures` es un embudo que dejó de ser uno.
    expect(registrarFallo).not.toHaveBeenCalled()
  })

  it('un remitente que NO está autorizado no programa nada', async () => {
    operadorAutorizado()
    respuestas.authorized_numbers = { data: null, error: null }

    const res = await postear(sobreMessageReceived())
    await vaciarDespues()

    expect(res.status).toBe(200)
    expect(pendientes).toHaveLength(0)
    expect(procesarDomicilio).not.toHaveBeenCalled()
  })

  it('si la consulta a authorized_numbers falla, el fallo pasa por el embudo ANTES de contestar y no se programa nada', async () => {
    operadorAutorizado()
    respuestas.authorized_numbers = { data: null, error: { code: '57014', message: 'statement timeout' } }

    const res = await postear(sobreMessageReceived())

    // Ya está escrito cuando POST contesta: esto no se difiere (es una lectura rápida).
    expect(registrarFallo).toHaveBeenCalledTimes(1)
    expect(registrarFallo.mock.calls[0][0]).toMatchObject({ reason: 'remitente_no_verificable', operatorPhone: OPERADOR })
    expect(res.status).toBe(200)
    expect(pendientes).toHaveLength(0)
    expect(procesarDomicilio).not.toHaveBeenCalled()
  })

  it('un reintento de Zernio (evento ya visto) no programa nada: el dedup sigue ANTES de contestar', async () => {
    operadorAutorizado()
    respuestas.webhook_events_seen = { data: null, error: { code: '23505', message: 'duplicate key' } }

    const res = await postear(sobreMessageReceived())
    await vaciarDespues()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, duplicate: true })
    expect(pendientes).toHaveLength(0)
    expect(procesarDomicilio).not.toHaveBeenCalled()
  })

  it('una firma inválida se rechaza antes de tocar nada', async () => {
    operadorAutorizado()

    const res = await postear(sobreMessageReceived(), false)

    expect(res.status).toBe(401)
    expect(tablasVistas).toHaveLength(0)
    expect(pendientes).toHaveLength(0)
  })

  it('declara maxDuration: lo diferido vive lo que dure la ruta, y la IA sola puede tardar ~16 s', async () => {
    const ruta = (await import('@/app/api/webhook/zernio/route')) as { maxDuration?: number }

    // `after()` corre "durante la duración máxima de la ruta" (docs de Next). Sin declararla, el
    // trabajo diferido hereda el default del plan, que no se ve desde el código y puede ser menor
    // que el peor caso del parseo (8 s × 2 intentos, más el registro): un pedido cortado a la mitad
    // no deja ni una fila en el embudo.
    expect(ruta.maxDuration).toBeGreaterThanOrEqual(60)
  })
})

// ═══════════════════════════════════════════════════════════════
// El pedido escrito en el auto-chat de la propia línea (message.sent)
// ═══════════════════════════════════════════════════════════════

describe('message.sent en el auto-chat', () => {
  it('contesta 200 aunque processDeliveryMessage no termine NUNCA', async () => {
    autoChatConfigurado()
    procesarDomicilio.mockImplementation(() => new Promise(() => {}))

    const res = await postearConPlazo(sobreMessageSent())

    expect(res, 'la ruta sigue esperando al parseo').not.toBe('colgado')
    expect((res as Response).status).toBe(200)
  })

  it('el trabajo diferido registra el pedido con la sede del número propio, DESPUÉS de contestar', async () => {
    autoChatConfigurado()

    const res = await postear(sobreMessageSent())

    expect(res.status).toBe(200)
    expect(procesarDomicilio).not.toHaveBeenCalled()
    expect(pendientes).toHaveLength(1)

    await vaciarDespues()

    expect(procesarDomicilio).toHaveBeenCalledTimes(1)
    expect(procesarDomicilio.mock.calls[0][0]).toMatchObject({
      tenant: TENANT,
      rawMessage: PEDIDO,
      operatorPhone: LINEA_PROPIA,
      operatorLocationId: 'sede-envigado',
    })
  })

  it('un fallo INESPERADO llega al embudo con el número propio como operador', async () => {
    autoChatConfigurado()
    procesarDomicilio.mockRejectedValue(new Error('boom'))

    await postear(sobreMessageSent())
    await expect(vaciarDespues()).resolves.toBeUndefined()

    expect(registrarFallo).toHaveBeenCalledTimes(1)
    expect(registrarFallo.mock.calls[0][0]).toMatchObject({
      tenant: TENANT,
      operatorPhone: LINEA_PROPIA,
      reason: 'intake_inesperado',
      rawMessage: PEDIDO,
    })
  })

  it('lo que NO es el auto-chat sigue sin programar nada (una campaña no entra al parser)', async () => {
    autoChatConfigurado()
    const sobre = sobreMessageSent()
    sobre.message.conversationId = 'conv_de_un_cliente'

    const res = await postear(sobre)
    await vaciarDespues()

    expect(res.status).toBe(200)
    expect(pendientes).toHaveLength(0)
    expect(procesarDomicilio).not.toHaveBeenCalled()
  })
})
