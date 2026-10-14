/**
 * N6 (arreglos chicos, 2026-10-15) — los botones sí/no del Golden Bullet por Zernio contestan
 * ENSEGUIDA.
 *
 * `POST /api/webhook/zernio` esperaba el acuse (`sendZernioConversationMessage()`, una llamada de
 * salida a Zernio con 10 s de timeout) antes de devolver el 200. Zernio pide el 2xx en menos de
 * 5 s y diez fallos seguidos le apagan el webhook a TODAS las marcas: el mismo riesgo que ESCALA-3
 * cerró para los domicilios. Ahora el consentimiento (escrituras en NUESTRA base) se hace antes de
 * contestar y el acuse va con `after()`.
 *
 * Mismo andamiaje que `zernio-despues-domicilios.test.ts`: `after()` fuera de un request de Next
 * lanza, así que el doble de `next/server` la CAPTURA y el test la corre a mano, después de que
 * `POST` contestó. La firma HMAC es real. Sin base y sin red.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      for (const k of ['select', 'eq', 'insert', 'maybeSingle', 'single', 'is', 'in', 'order', 'limit']) b[k] = () => b
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok)
      return b
    },
  }),
}))

const TENANT = { id: '22222222-2222-2222-2222-222222222222', slug: 'sushi-service', config: {}, zernio_account_id: 'acc_ss' }
vi.mock('@/lib/tenant', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getTenantByZernioAccountId: async () => TENANT,
}))
vi.mock('@/services/settings.service', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getMultipleSettings: async () => ({}),
}))

const orden: string[] = []
vi.mock('@/services/club-optin.service', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  handleClubOptIn: async () => {
    orden.push('consentimiento')
    return { body: '¡Bienvenida! Tu enlace: https://x', mediaUrl: null }
  },
  handleClubOptOut: async () => {
    orden.push('consentimiento')
    return { body: 'Listo, no te escribimos más.', mediaUrl: null }
  },
}))

/** El acuse: una promesa que el test resuelve cuando quiere (Zernio lento = no la resuelve). */
let soltarAcuse: (() => void) | null = null
const acuse = vi.fn(async (_args: Record<string, unknown>) => {
  orden.push('acuse')
  await new Promise<void>((r) => {
    soltarAcuse = r
  })
  return { data: { messageId: 'msg_ack' } }
})
vi.mock('@/lib/zernio/messaging', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  sendZernioConversationMessage: (args: Record<string, unknown>) => acuse(args),
}))

const pendientes: Array<() => unknown> = []
vi.mock('next/server', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  after: (trabajo: () => unknown) => {
    pendientes.push(trabajo)
  },
}))

const SECRET = 'secreto-de-prueba'

function sobreBoton(payload: 'CLUB_SI' | 'CLUB_NO', id: string) {
  return {
    id,
    event: 'message.received',
    message: {
      id: `msg_${id}`,
      conversationId: 'conv_cliente',
      platform: 'whatsapp',
      direction: 'incoming',
      text: payload === 'CLUB_SI' ? 'Quiero ser parte' : 'No, gracias',
      sender: { id: '573001112233', phoneNumber: '+573001112233' },
      sentAt: '2026-10-15T15:00:00.000Z',
    },
    metadata: { buttonPayload: payload },
    conversation: {},
    account: { accountId: 'acc_ss' },
    timestamp: '2026-10-15T15:00:00.000Z',
  }
}

async function postearConPlazo(sobre: unknown): Promise<Response | 'colgado'> {
  const { POST } = await import('@/app/api/webhook/zernio/route')
  const body = JSON.stringify(sobre)
  const firma = crypto.createHmac('sha256', SECRET).update(body, 'utf-8').digest('hex')
  const req = new Request('https://example.com/api/webhook/zernio', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-zernio-signature': firma },
  })
  return Promise.race([
    POST(req as never),
    new Promise<'colgado'>((r) => setTimeout(() => r('colgado'), 1500)),
  ])
}

beforeAll(async () => {
  await import('@/app/api/webhook/zernio/route')
})

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
  process.env.ZERNIO_WEBHOOK_SECRET = SECRET
  orden.length = 0
  pendientes.length = 0
  soltarAcuse = null
  acuse.mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  soltarAcuse?.()
  vi.restoreAllMocks()
})

describe('N6: el botón sí/no contesta 200 enseguida y el acuse sale después', () => {
  it('con Zernio lento (el acuse no termina), la ruta igual contesta 200 — y sin haber llamado al acuse todavía', async () => {
    const res = await postearConPlazo(sobreBoton('CLUB_SI', 'evt_si_1'))
    expect(res).not.toBe('colgado')
    expect((res as Response).status).toBe(200)
    expect(await (res as Response).json()).toEqual({ received: true, club_button: 'opt_in', reply: 'after_response' })
    // El consentimiento ya quedó escrito ANTES de contestar; el acuse, todavía no se intentó.
    expect(orden).toEqual(['consentimiento'])
    expect(acuse).not.toHaveBeenCalled()
    expect(pendientes).toHaveLength(1)
  })

  it('lo diferido manda el acuse en la conversación del cliente, con la clave de idempotencia del evento', async () => {
    const res = await postearConPlazo(sobreBoton('CLUB_NO', 'evt_no_1'))
    expect((res as Response).status).toBe(200)
    const trabajo = pendientes.shift()!
    const corriendo = trabajo() as Promise<unknown>
    await vi.waitFor(() => expect(acuse).toHaveBeenCalledTimes(1))
    soltarAcuse!()
    await corriendo
    expect(orden).toEqual(['consentimiento', 'acuse'])
    expect(acuse).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acc_ss', conversationId: 'conv_cliente', idempotencyKey: 'club-reply-evt_no_1' })
    )
  })
})
