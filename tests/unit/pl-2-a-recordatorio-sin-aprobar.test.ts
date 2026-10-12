/**
 * PL-2-a — el recordatorio de premio no usa una plantilla de Twilio que Meta todavía no aprobó
 * (2026-10-12).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * En Twilio el puntero `reward_reminder_template_sid` se escribe al CREAR la plantilla
 * (`fillEmptyPointer()`), con Meta todavía revisándola (24-72 h). El cron `reward-reminder` no
 * preguntaba nada: intentaba todos los días, Meta rechazaba, y cada rechazo es una fila `failed`
 * que cuenta para el tope de MAX_INTENTOS_FALLIDOS_POR_TOQUE (fase 0.bis). Al tercero, ese
 * premio se quedaba SIN recordatorio para siempre, aunque la plantilla se aprobara al día
 * siguiente. Era el costo escondido del botón «Enviar los N juntos a Meta».
 *
 * Ahora, si la marca es Twilio, el cron le pregunta a Twilio si la plantilla está aprobada (como
 * el cron de cumpleaños). Si no lo está —o Twilio no contesta—, ese día no se intenta, NO se
 * graba nada (ni campaña ni fallidos) y queda un log con la marca y el motivo. Zernio no cambia
 * (su puntero solo existe aprobado) y la marca demo tampoco (su envío es simulado).
 *
 * CÓMO SE PRUEBA
 * ──────────────
 * Igual que `ciclo-fase-0-bis.test.ts`: la ruta del cron y `campaign.service` DE VERDAD; falso
 * solo Supabase (un doble en memoria, el mismo de ese archivo), el envío (que rechaza mientras
 * «Meta» no apruebe la plantilla, como Meta) y la pregunta a Twilio. Los casos de «Twilio no
 * contesta» usan la función REAL `isTwilioTemplateApproved()` con `fetch` falso: es la que
 * decide, y lo que importa es que ante la duda conteste `false` y el cron no intente.
 *
 * Nada llama a Twilio ni a Meta de verdad.
 *
 * Código: `src/app/api/cron/reward-reminder/route.ts` · Ref: `docs/PENDIENTES.md` PL-2.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import type { NextRequest } from 'next/server'
import type { Tenant } from '@/types/tenant.types'

// ═══════════════════════════════════════════════════════════════
// El doble de Supabase (el de ciclo-fase-0-bis, recortado a lo que usa el recordatorio)
// ═══════════════════════════════════════════════════════════════

type Fila = Record<string, unknown>

let tablas: Record<string, Fila[]> = {}
let siguienteId = 1

/** `campaigns.source` → la campaña de la fila por `campaign_id`, como el `!inner` de PostgREST. */
function valor(fila: Fila, col: string): unknown {
  if (!col.includes('.')) return fila[col]
  const [relacion, columna] = col.split('.')
  const fk = `${relacion.replace(/s$/, '')}_id`
  const relacionada = (tablas[relacion] ?? []).find((r) => r.id === fila[fk])
  return relacionada?.[columna]
}

const comparar = (v: unknown, x: unknown) => (v == null ? null : String(v) < String(x) ? -1 : String(v) > String(x) ? 1 : 0)

interface Constructor {
  select(...args: unknown[]): Constructor
  insert(p: Fila): Constructor
  update(p: Fila): Constructor
  eq(c: string, x: unknown): Constructor
  in(c: string, xs: unknown[]): Constructor
  gte(c: string, x: unknown): Constructor
  lt(c: string, x: unknown): Constructor
  order(c: string, o?: { ascending?: boolean }): Constructor
  range(desde: number, hasta: number): Constructor
  limit(n: number): Constructor
  single(): Constructor
  maybeSingle(): Constructor
  then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown): Promise<unknown>
}

function consulta(tabla: string): Constructor {
  const filtros: Array<(f: Fila) => boolean> = []
  let op: 'select' | 'insert' | 'update' = 'select'
  let carga: Fila = {}
  let limite = Infinity
  let desdeFila = 0
  let orden: { col: string; asc: boolean } | null = null
  let modo: 'varias' | 'una' | 'una-o-ninguna' = 'varias'

  function ejecutar(): { data: unknown; error: null } {
    const filas = (tablas[tabla] ??= [])
    if (op === 'insert') {
      const nueva = { id: `id-${siguienteId++}`, ...carga }
      filas.push(nueva)
      return { data: modo === 'varias' ? [nueva] : nueva, error: null }
    }
    const elegidas = filas.filter((f) => filtros.every((p) => p(f)))
    if (op === 'update') {
      for (const f of elegidas) Object.assign(f, carga)
      return { data: null, error: null }
    }
    if (orden) {
      const { col, asc } = orden
      elegidas.sort((a, b) => (comparar(a[col], b[col]) ?? 0) * (asc ? 1 : -1))
    }
    const recortadas = elegidas.slice(desdeFila, desdeFila + limite)
    if (modo === 'varias') return { data: recortadas, error: null }
    return { data: recortadas[0] ?? null, error: null }
  }

  const b: Constructor = {
    select: () => b,
    insert: (p) => ((op = 'insert'), (carga = p), b),
    update: (p) => ((op = 'update'), (carga = p), b),
    eq: (c, x) => (filtros.push((f) => valor(f, c) === x), b),
    in: (c, xs) => (filtros.push((f) => xs.includes(valor(f, c))), b),
    gte: (c, x) => (filtros.push((f) => (comparar(valor(f, c), x) ?? -1) >= 0), b),
    lt: (c, x) => (filtros.push((f) => comparar(valor(f, c), x) === -1), b),
    order: (c, o) => ((orden = { col: c, asc: o?.ascending !== false }), b),
    range: (desde, hasta) => ((desdeFila = desde), (limite = hasta - desde + 1), b),
    limit: (n) => ((limite = n), b),
    single: () => ((modo = 'una'), b),
    maybeSingle: () => ((modo = 'una-o-ninguna'), b),
    then: (ok, ko) => Promise.resolve(ejecutar()).then(ok, ko),
  }
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (tabla: string) => consulta(tabla) }),
}))

// ═══════════════════════════════════════════════════════════════
// Lo que no decide a quién se le escribe
// ═══════════════════════════════════════════════════════════════

const RECORDATORIO = 'HX_RECORDATORIO'
const SUBCUENTA = { sid: 'AC_SUBCUENTA', token: 'token-de-la-subcuenta' }

let tenantActual: Partial<Tenant> & { id: string; slug: string }
/** `admin_settings` de la marca de prueba. */
let ajustes: Record<string, string> = {}

/** Lo que Meta sabe de la plantilla: mientras sea `false` rechaza cualquier envío con ella. */
let aprobadaEnMeta = false
/** Cada intento de envío (aunque Meta lo rechace) y cada envío que SALIÓ. */
const intentos: string[] = []
const enviados: Array<{ telefono: string; plantilla: string }> = []

vi.mock('@/services/whatsapp.service', () => ({
  sendTemplateMessage: vi.fn(
    async (telefono: string, plantilla: string, _v: unknown, tenant: { id: string }, log?: { customerId?: string }) => {
      intentos.push(telefono)
      if (!aprobadaEnMeta) {
        // Lo que hace el choke-point de verdad cuando Meta rechaza: deja la causa en message_logs y devuelve null.
        tablas.message_logs.push({
          id: `log-${siguienteId++}`,
          tenant_id: tenant.id,
          customer_id: log?.customerId ?? null,
          template_sid: plantilla,
          status: 'failed',
          error_code: 'template_not_approved',
          error_message: 'La plantilla todavía no está aprobada por Meta',
          created_at: new Date().toISOString(),
        })
        return null
      }
      enviados.push({ telefono, plantilla })
      return { sid: `SM-${telefono}`, status: 'sent' }
    }
  ),
}))
vi.mock('@/lib/validators/cron', () => ({ validateCronSecret: () => true }))
vi.mock('@/lib/tenant', () => ({
  getTenantBySlug: async () => tenantActual,
  getActiveTenants: async () => [tenantActual],
}))
vi.mock('@/services/settings.service', () => ({
  getMultipleSettings: async (keys: string[]) =>
    Object.fromEntries(keys.filter((k) => ajustes[k] !== undefined).map((k) => [k, ajustes[k]])),
}))

/** Quién contesta «¿está aprobada?»: el doble (lo que diga `aprobadaEnMeta`) o la función REAL. */
let preguntaReal: ((tenant: Tenant, sid: string) => Promise<boolean>) | null = null
const preguntas: Array<{ tenantId: string; sid: string }> = []
vi.mock('@/services/twilio-catalog.service', () => ({
  isTwilioTemplateApproved: async (tenant: Tenant, sid: string) => {
    preguntas.push({ tenantId: tenant.id, sid })
    return preguntaReal ? preguntaReal(tenant, sid) : aprobadaEnMeta
  },
}))

interface CandidatoDePrueba {
  grant_id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  prize_title: string
  expires_at: string
  days_left: number
}
let candidatos: CandidatoDePrueba[] = []
const sellados: string[] = []
vi.mock('@/services/reward-grant.service', () => ({
  expireGrants: async () => 0,
  findGrantsDueForReminder: async () => candidatos,
  markReminderSent: async (ids: string[]) => {
    sellados.push(...ids)
  },
}))

// ═══════════════════════════════════════════════════════════════
// Los datos
// ═══════════════════════════════════════════════════════════════

/** Sábado 10 de octubre de 2026, 16:00 UTC: la hora del cron del recordatorio. */
const AHORA = new Date('2026-10-10T16:00:00.000Z')
const DIA = 24 * 60 * 60 * 1000
const enDias = (d: number) => new Date(AHORA.getTime() + d * DIA).toISOString()
const dia = (d: number) => vi.setSystemTime(new Date(AHORA.getTime() + d * DIA))

/** Vence en 4 días: con 5 de aviso, la ventana se abrió ayer y cubre los cuatro días del test. */
function premio(id: string, telefono: string): CandidatoDePrueba {
  return {
    grant_id: `g-${id}`,
    customer_id: id,
    customer_name: id,
    customer_phone: telefono,
    prize_title: 'Postre',
    expires_at: enDias(4),
    days_left: 4,
  }
}

async function correr() {
  const { GET } = await import('@/app/api/cron/reward-reminder/route')
  const res = await GET({ url: 'http://localhost/api/cron/reward-reminder?tenant=marca-a' } as unknown as NextRequest)
  return { status: res.status, body: await res.json() }
}

const filasDe = (clienteId: string) => tablas.campaign_messages.filter((m) => m.customer_id === clienteId)

let avisos: MockInstance<typeof console.warn>
const textoDe = (llamadas: unknown[][]) => llamadas.map((c) => String(c[0]))

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  tablas = { campaigns: [], campaign_messages: [], message_logs: [] }
  siguienteId = 1
  intentos.length = 0
  enviados.length = 0
  sellados.length = 0
  preguntas.length = 0
  candidatos = []
  aprobadaEnMeta = false
  preguntaReal = null
  tenantActual = {
    id: 'tenant-A',
    slug: 'marca-a',
    messaging_provider: 'twilio',
    is_demo: false,
    twilio_subaccount_sid: SUBCUENTA.sid,
    twilio_subaccount_auth_token: SUBCUENTA.token,
  }
  ajustes = {
    reward_reminder_enabled: 'true',
    reward_reminder_days_before: '5',
    reward_reminder_template_sid: RECORDATORIO,
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════
// Twilio con la plantilla en revisión
// ═══════════════════════════════════════════════════════════════

describe('PL-2-a · Twilio: la plantilla en revisión no se intenta y no gasta intentos', () => {
  it('hoy no se intenta, no se graba nada (ni campaña ni fallidos) y queda un log con la marca y el motivo', async () => {
    candidatos = [premio('ana', '3000000001')]

    const { status, body } = await correr()

    expect(status).toBe(200)
    expect(intentos).toEqual([])
    expect(tablas.campaign_messages).toEqual([])
    expect(tablas.campaigns).toEqual([])
    expect(sellados).toEqual([])
    expect(body).toMatchObject({ ok: true, sent: 0, failed: 0, candidates: 1, skipped_template_pending: 1, reminder_enabled: true })

    const log = textoDe(avisos.mock.calls).find((m) => m.includes('[Cron RewardReminder]'))
    expect(log).toBeDefined()
    expect(log).toContain('marca-a')
    expect(log).toContain(RECORDATORIO)
    expect(log).toContain('no figura aprobada por Meta')
    expect(log).toContain('no cuenta como fallido')
  })

  it('tres días en revisión no gastan ni un intento: el día que Meta aprueba, el aviso SALE (antes: el premio quedaba sin recordatorio para siempre)', async () => {
    candidatos = [premio('ana', '3000000001')]

    // Días 0, 1 y 2: la plantilla sigue en revisión.
    for (const d of [0, 1, 2]) {
      dia(d)
      await correr()
    }
    expect(filasDe('ana')).toEqual([])
    expect(enviados).toEqual([])

    // Día 3: Meta aprobó.
    aprobadaEnMeta = true
    dia(3)
    const { body } = await correr()

    expect(enviados).toEqual([{ telefono: '3000000001', plantilla: RECORDATORIO }])
    expect(sellados).toEqual(['g-ana'])
    expect(body.sent).toBe(1)
    expect(body.skipped_retry_cap ?? 0).toBe(0)
    expect(filasDe('ana').map((m) => m.status)).toEqual(['sent'])
  })

  it('le pregunta a Twilio UNA vez por corrida, no una por premio, y con la plantilla del puntero', async () => {
    aprobadaEnMeta = true
    candidatos = [premio('ana', '3000000001'), premio('beto', '3000000002')]

    const { body } = await correr()

    expect(preguntas).toEqual([{ tenantId: 'tenant-A', sid: RECORDATORIO }])
    expect(body.sent).toBe(2)
    expect(body.skipped_template_pending).toBeUndefined()
  })

  it('aprobada: sale como siempre (se graba la campaña y el enviado)', async () => {
    aprobadaEnMeta = true
    candidatos = [premio('ana', '3000000001')]

    const { body } = await correr()

    expect(enviados).toEqual([{ telefono: '3000000001', plantilla: RECORDATORIO }])
    expect(tablas.campaigns).toHaveLength(1)
    expect(filasDe('ana').map((m) => m.status)).toEqual(['sent'])
    expect(body).toMatchObject({ ok: true, sent: 1, failed: 0 })
  })
})

// ═══════════════════════════════════════════════════════════════
// Cuándo NO se le pregunta nada a Twilio
// ═══════════════════════════════════════════════════════════════

describe('PL-2-a · solo se pregunta cuando hay algo que mandar y la marca es Twilio de verdad', () => {
  it('sin premios por avisar no se le pregunta nada a Twilio', async () => {
    candidatos = []

    const { body } = await correr()

    expect(preguntas).toEqual([])
    expect(body).toMatchObject({ ok: true, candidates: 0 })
  })

  it('con el recordatorio apagado o sin plantilla tampoco', async () => {
    candidatos = [premio('ana', '3000000001')]

    ajustes.reward_reminder_enabled = 'false'
    await correr()
    ajustes.reward_reminder_enabled = 'true'
    delete ajustes.reward_reminder_template_sid
    await correr()

    expect(preguntas).toEqual([])
    expect(intentos).toEqual([])
  })

  it('Zernio: el puntero solo existe aprobado, no se le pregunta nada a Twilio y sale como siempre', async () => {
    tenantActual = { ...tenantActual, messaging_provider: 'zernio' }
    aprobadaEnMeta = true
    candidatos = [premio('ana', '3000000001')]

    const { body } = await correr()

    expect(preguntas).toEqual([])
    expect(enviados).toEqual([{ telefono: '3000000001', plantilla: RECORDATORIO }])
    expect(body.skipped_template_pending).toBeUndefined()
  })

  it('marca demo: su envío es simulado y nunca llega a Meta, no se le pregunta nada a Twilio', async () => {
    tenantActual = { ...tenantActual, is_demo: true }
    aprobadaEnMeta = true
    candidatos = [premio('ana', '3000000001')]

    const { body } = await correr()

    expect(preguntas).toEqual([])
    expect(enviados).toEqual([{ telefono: '3000000001', plantilla: RECORDATORIO }])
    expect(body.sent).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// Twilio no contesta (la función REAL, con fetch falso)
// ═══════════════════════════════════════════════════════════════

describe('PL-2-a · si Twilio no contesta, no se envía ni se cuenta como fallido', () => {
  const URL_APROBACION = `https://content.twilio.com/v1/Content/${RECORDATORIO}/ApprovalRequests`
  const respuesta = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })

  /** Pone la función REAL de pregunta y un `fetch` que contesta lo que diga `twilio()`. */
  async function conTwilioReal(twilio: () => Promise<Response>) {
    const real = await vi.importActual<typeof import('@/services/twilio-catalog.service')>('@/services/twilio-catalog.service')
    preguntaReal = real.isTwilioTemplateApproved
    const pedidos: Array<{ url: string; authorization: string | null }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        pedidos.push({ url: String(url), authorization: new Headers(init?.headers).get('authorization') })
        return twilio()
      })
    )
    return pedidos
  }

  const casos: Array<[string, () => Promise<Response>]> = [
    ['la red falla', async () => { throw new Error('ECONNRESET') }],
    ['Twilio contesta 500', async () => respuesta({ message: 'boom' }, 500)],
    ['Twilio contesta 401 (credenciales vencidas)', async () => respuesta({ message: 'Authenticate' }, 401)],
    ['sigue en revisión', async () => respuesta({ whatsapp: { status: 'pending' } })],
    ['Meta la rechazó', async () => respuesta({ whatsapp: { status: 'rejected' } })],
    ['la respuesta viene vacía', async () => respuesta({})],
  ]

  it.each(casos)('%s → hoy no se intenta, no se graba nada y queda el log', async (_caso, twilio) => {
    const pedidos = await conTwilioReal(twilio)
    aprobadaEnMeta = true // aunque Meta la hubiera aprobado, sin confirmarlo no se intenta
    candidatos = [premio('ana', '3000000001')]

    const { status, body } = await correr()

    expect(status).toBe(200)
    expect(intentos).toEqual([])
    expect(tablas.campaign_messages).toEqual([])
    expect(tablas.campaigns).toEqual([])
    expect(sellados).toEqual([])
    expect(body).toMatchObject({ ok: true, sent: 0, failed: 0, skipped_template_pending: 1 })
    expect(textoDe(avisos.mock.calls).some((m) => m.includes('[Cron RewardReminder] (marca-a)'))).toBe(true)
    // Preguntó a Twilio con la cuenta de la marca, por la plantilla del puntero.
    expect(pedidos).toEqual([
      { url: URL_APROBACION, authorization: 'Basic ' + Buffer.from(`${SUBCUENTA.sid}:${SUBCUENTA.token}`).toString('base64') },
    ])
  })

  it('Twilio dice «approved» → sale (la pregunta real también deja pasar)', async () => {
    await conTwilioReal(async () => respuesta({ whatsapp: { status: 'approved' } }))
    aprobadaEnMeta = true
    candidatos = [premio('ana', '3000000001')]

    const { body } = await correr()

    expect(enviados).toEqual([{ telefono: '3000000001', plantilla: RECORDATORIO }])
    expect(body).toMatchObject({ sent: 1, failed: 0 })
  })

  it('una marca Twilio SIN cuenta propia ni ser la maestra tampoco puede confirmarla: no se intenta', async () => {
    const pedidos = await conTwilioReal(async () => respuesta({ whatsapp: { status: 'approved' } }))
    tenantActual = { ...tenantActual, twilio_subaccount_sid: null, twilio_subaccount_auth_token: null }
    aprobadaEnMeta = true
    candidatos = [premio('ana', '3000000001')]

    const { body } = await correr()

    expect(pedidos).toEqual([]) // sin cuenta no hay a quién preguntarle
    expect(intentos).toEqual([])
    expect(body.skipped_template_pending).toBe(1)
  })
})
