/**
 * PL-2-a — el check-in no manda «Nivel desbloqueado» si Meta todavía no la aprobó (2026-10-12).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * En Twilio el puntero `tier_unlocked_template_sid` se escribe al CREAR la plantilla
 * (`fillEmptyPointer()`), con Meta todavía revisándola (24-72 h). El check-in no preguntaba
 * nada: el cliente que cruzaba de nivel en esos días recibía un envío que Meta rechazaba, y se
 * quedaba sin ningún mensaje en el momento más importante de su tarjeta.
 *
 * Ahora, SOLO cuando el cliente cruza de nivel y la marca es Twilio, el check-in le pregunta a
 * Twilio si la plantilla está aprobada. Si no lo está —o Twilio no contesta—, el mensaje cae al
 * de «puntos sumados» (cerca o lejos del siguiente nivel; o la bienvenida, si es su primera
 * visita), que es el que ya sale en cualquier otro check-in. La pantalla del cliente no cambia:
 * sigue siendo «nivel desbloqueado». Zernio (su puntero solo existe aprobado) y la marca demo
 * (su envío es simulado) no preguntan nada. Un check-in sin cruce de nivel tampoco: no hay una
 * llamada a Twilio por visita.
 *
 * CÓMO SE PRUEBA
 * ──────────────
 * La RUTA `POST /api/check-in` de verdad, con el mesero y el aparato válidos (el Supabase de
 * `staff_users` / `staff_devices` es el doble en memoria compartido) y todo lo demás doblado:
 * clientes, visitas, puntos, niveles, el envío y la pregunta a Twilio. El caso de «Twilio no
 * contesta» usa la función REAL `isTwilioTemplateApproved()` con `fetch` falso.
 *
 * Nada llama a Twilio ni a Meta de verdad.
 *
 * Código: `src/app/api/check-in/route.ts` · Ref: `docs/PENDIENTES.md` PL-2.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import type { Tenant } from '@/types/tenant.types'
import { crearBaseEnMemoria, type BaseEnMemoria } from './_dobles/supabase-en-memoria'

// ═══════════════════════════════════════════════════════════════
// Dobles
// ═══════════════════════════════════════════════════════════════

const TENANT_ID = 'tenant-A'
const NIVEL = 'HX_NIVEL'
const FAR = 'HX_PUNTOS_LEJOS'
const NEAR = 'HX_PUNTOS_CERCA'
const BIENVENIDA = 'HX_BIENVENIDA'
const SUBCUENTA = { sid: 'AC_SUBCUENTA', token: 'token-de-la-subcuenta' }

let base: BaseEnMemoria
vi.mock('@supabase/supabase-js', () => ({ createClient: () => base.cliente }))

// `after()` solo existe dentro de una petición de Next; aquí no hay ninguna.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}))
vi.mock('@/lib/meta-conversions-server', () => ({ sendConversionEvent: async () => {} }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }),
  getClientIp: () => '203.0.113.7',
}))
vi.mock('@/lib/utils/qrcode', () => ({
  verifyCustomerQRToken: async () => ({}),
  generateCustomerQRToken: async () => 'qr',
}))
vi.mock('@/services/google-contacts-sync.service', () => ({ syncGoogleContact: async () => {} }))
vi.mock('@/services/imported-contacts.service', () => ({ markConverted: async () => {} }))
vi.mock('@/services/qr-campaign.service', () => ({ grantFromInvite: async () => ({ ok: false, reason: 'no_aplica' }) }))

let tenantActual: Partial<Tenant> & { id: string; slug: string }
vi.mock('@/lib/tenant', () => ({
  resolveHostContext: async () => ({
    tenant: tenantActual,
    locationId: null,
    locationSource: null,
    requiresLocationChoice: false,
    locationChoices: [],
    location: null,
  }),
}))

/** `admin_settings` de la marca de prueba. */
let ajustes: Record<string, string> = {}
vi.mock('@/services/settings.service', () => ({
  getMultipleSettings: async (keys: string[]) =>
    Object.fromEntries(keys.filter((k) => ajustes[k] !== undefined).map((k) => [k, ajustes[k]])),
}))

/** El cliente que escanea el mesero, y lo que le pasa en esta visita. */
let cliente: { id: string; name: string; phone: string; total_visits: number; total_points: number }
let nivelCruzado: { id: string; tier_name: string; safe_reward_title: string; mystery_box_enabled: boolean; mystery_prizes: unknown[]; is_black: boolean } | null
let siguienteNivel: { tier: { tier_name: string; safe_reward_title: string; point_threshold: number }; pointsRemaining: number } | null

vi.mock('@/services/customer.service', () => ({
  findCustomerByPhone: async () => cliente,
  createCustomer: async () => cliente,
  incrementVisit: async () => ({ ...cliente, total_visits: cliente.total_visits + 1 }),
}))
vi.mock('@/services/visit.service', () => ({ createVisit: async () => ({ id: 'visita-1' }) }))
vi.mock('@/services/points.service', () => ({
  awardVisitPoints: async () => ({ pointsAwarded: 40, newBalance: cliente.total_points + 40 }),
  awardWelcomeBonus: async () => ({ pointsAwarded: 0, newBalance: 0 }),
}))
vi.mock('@/services/reward-tiers.service', () => ({
  evaluateNewTier: async () => nivelCruzado,
  getNextTier: async () => siguienteNivel,
  buildTiersRoadmap: async () => 'ROADMAP',
  updateCustomerTier: async () => {},
  getAllTiers: async () => [],
}))

/** Cada envío, con la plantilla y las variables con que salió. */
const enviados: Array<{ plantilla: string; variables: Record<string, string> }> = []
vi.mock('@/services/whatsapp.service', () => ({
  sendTemplateMessage: async (_tel: string, plantilla: string, variables: Record<string, string>) => {
    enviados.push({ plantilla, variables })
    return { sid: `SM-${enviados.length}`, status: 'sent' }
  },
}))

/** Lo que Twilio contesta sobre «¿está aprobada?»: el doble, o la función REAL con `fetch` falso. */
let aprobada = false
let preguntaReal: ((tenant: Tenant, sid: string) => Promise<boolean>) | null = null
const preguntas: Array<{ tenantId: string; sid: string }> = []
vi.mock('@/services/twilio-catalog.service', () => ({
  isTwilioTemplateApproved: async (tenant: Tenant, sid: string) => {
    preguntas.push({ tenantId: tenant.id, sid })
    return preguntaReal ? preguntaReal(tenant, sid) : aprobada
  },
}))

// ═══════════════════════════════════════════════════════════════
// La visita
// ═══════════════════════════════════════════════════════════════

const ORO = {
  id: 'nivel-oro',
  tier_name: 'Oro',
  safe_reward_title: 'Postre gratis',
  mystery_box_enabled: false,
  mystery_prizes: [],
  is_black: false,
}

/** El mesero escanea al cliente: la única forma de registrar una visita (`source: 'staff_scan'`). */
async function escanear() {
  const { POST } = await import('@/app/api/check-in/route')
  const { NextRequest } = await import('next/server')
  const res = await POST(
    new NextRequest('https://marca.constelarys.com/api/check-in', {
      method: 'POST',
      headers: { host: 'marca.constelarys.com', 'content-type': 'application/json' },
      body: JSON.stringify({
        phone: '3001234567',
        action: 'checkin',
        source: 'staff_scan',
        registered_by_staff_id: 'mesero-1',
        device_token: 'aparato-1',
      }),
    })
  )
  // Un 500 es el `catch` de la ruta: casi siempre es un doble que falta aquí, no lo que se prueba.
  // Se muestra la causa en vez de dejar un «expected 500 to be 200» mudo.
  if (res.status === 500) {
    const causa = errores.mock.calls.map((c) => c.map((x) => (x instanceof Error ? (x.stack ?? x.message) : String(x))).join(' ')).join('\n')
    throw new Error(`POST /api/check-in respondió 500:\n${causa}`)
  }
  return { status: res.status, body: await res.json() }
}

const plantillasEnviadas = () => enviados.map((e) => e.plantilla)

let avisos: MockInstance<typeof console.warn>
let errores: MockInstance<typeof console.error>
const textoDe = (llamadas: unknown[][]) => llamadas.map((c) => String(c[0]))

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
  base = crearBaseEnMemoria({
    staff_users: [{ id: 'mesero-1', tenant_id: TENANT_ID, is_active: true, location_id: null }],
    staff_devices: [
      { id: 'fila-aparato', device_fingerprint: 'aparato-1', is_trusted: true, expires_at: null, tenant_id: TENANT_ID, location_id: null },
    ],
  })
  enviados.length = 0
  preguntas.length = 0
  aprobada = false
  preguntaReal = null
  cliente = { id: 'cliente-1', name: 'Ana', phone: '3001234567', total_visits: 5, total_points: 160 }
  nivelCruzado = ORO
  siguienteNivel = null
  tenantActual = {
    id: TENANT_ID,
    slug: 'marca-a',
    domain: 'marca.constelarys.com',
    config: { brand_name: 'Marca A' } as Tenant['config'],
    messaging_provider: 'twilio',
    is_demo: false,
    twilio_subaccount_sid: SUBCUENTA.sid,
    twilio_subaccount_auth_token: SUBCUENTA.token,
  }
  ajustes = {
    tier_unlocked_template_sid: NIVEL,
    points_earned_far_template_sid: FAR,
    points_earned_near_template_sid: NEAR,
    welcome_template_sid: BIENVENIDA,
  }
  errores = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════
// Twilio: cruza de nivel con la plantilla en revisión
// ═══════════════════════════════════════════════════════════════

describe('PL-2-a · Twilio: cruza de nivel y «Nivel desbloqueado» sigue en revisión', () => {
  it('cae al mensaje de puntos sumados (no manda la de nivel, que Meta rechazaría) y deja el log', async () => {
    const { status, body } = await escanear()

    expect(status).toBe(200)
    expect(plantillasEnviadas()).toEqual([FAR])
    // Con las variables del mensaje de puntos, no las del de nivel.
    expect(enviados[0].variables).toEqual({ '1': 'Ana', '2': '40', '3': '200', '4': 'ROADMAP' })
    expect(body.whatsapp).toEqual({ sent: true, templateType: 'points_earned_far' })
    // La pantalla del cliente sigue siendo la del nivel desbloqueado.
    expect(body.message).toBe('tier_unlocked')
    expect(body.tier_unlocked.name).toBe('Oro')

    const log = textoDe(avisos.mock.calls).find((m) => m.includes('«Nivel desbloqueado»'))
    expect(log).toBeDefined()
    expect(log).toContain('marca-a')
    expect(log).toContain(NIVEL)
  })

  it('le pregunta a Twilio UNA vez, por la plantilla del puntero de nivel', async () => {
    await escanear()

    expect(preguntas).toEqual([{ tenantId: TENANT_ID, sid: NIVEL }])
  })

  it('cerca del siguiente nivel cae al mensaje de «te falta poco» (misma regla que cualquier check-in)', async () => {
    siguienteNivel = { tier: { tier_name: 'Platino', safe_reward_title: 'Cena para dos', point_threshold: 220 }, pointsRemaining: 20 }

    const { body } = await escanear()

    expect(plantillasEnviadas()).toEqual([NEAR])
    expect(enviados[0].variables['4']).toBe('Cena para dos')
    expect(body.whatsapp.templateType).toBe('points_earned_near')
  })

  it('si además es su primera visita cae a la bienvenida, no a «sumaste puntos»', async () => {
    cliente = { ...cliente, total_visits: 0, total_points: 0 }

    const { body } = await escanear()

    expect(plantillasEnviadas()).toEqual([BIENVENIDA])
    expect(body.whatsapp.templateType).toBe('welcome')
  })
})

// ═══════════════════════════════════════════════════════════════
// Lo que NO cambia
// ═══════════════════════════════════════════════════════════════

describe('PL-2-a · lo que no cambia', () => {
  it('aprobada: sale «Nivel desbloqueado», con sus variables', async () => {
    aprobada = true

    const { body } = await escanear()

    expect(plantillasEnviadas()).toEqual([NIVEL])
    expect(enviados[0].variables).toEqual({ '1': 'Ana', '2': 'Oro', '3': 'Postre gratis', '4': 'ROADMAP' })
    expect(body.whatsapp).toEqual({ sent: true, templateType: 'tier_unlocked' })
    expect(preguntas).toHaveLength(1)
  })

  it('un check-in SIN cruce de nivel no le pregunta nada a Twilio (no hay una llamada por visita)', async () => {
    nivelCruzado = null

    const { body } = await escanear()

    expect(preguntas).toEqual([])
    expect(plantillasEnviadas()).toEqual([FAR])
    expect(body.message).toBe('points_earned')
  })

  it('Zernio: el puntero solo existe aprobado, no se le pregunta nada a Twilio y sale «Nivel desbloqueado»', async () => {
    tenantActual = { ...tenantActual, messaging_provider: 'zernio' }

    await escanear()

    expect(preguntas).toEqual([])
    expect(plantillasEnviadas()).toEqual([NIVEL])
  })

  it('marca demo: su envío es simulado y nunca llega a Meta, no se le pregunta nada a Twilio', async () => {
    tenantActual = { ...tenantActual, is_demo: true }

    await escanear()

    expect(preguntas).toEqual([])
    expect(plantillasEnviadas()).toEqual([NIVEL])
  })

  it('sin puntero de nivel configurado no se pregunta nada: sigue contestando «no_template_configured»', async () => {
    delete ajustes.tier_unlocked_template_sid

    const { body } = await escanear()

    expect(preguntas).toEqual([])
    expect(enviados).toEqual([])
    expect(body.whatsapp).toEqual({ sent: false, templateType: 'tier_unlocked', reason: 'no_template_configured' })
  })
})

// ═══════════════════════════════════════════════════════════════
// Twilio no contesta (la función REAL, con fetch falso)
// ═══════════════════════════════════════════════════════════════

describe('PL-2-a · si Twilio no contesta, el check-in no se cae y cae a puntos sumados', () => {
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

  it('la red falla → mensaje de puntos, y se preguntó una sola vez con la cuenta de la marca', async () => {
    const pedidos = await conTwilioReal(async () => {
      throw new Error('ECONNRESET')
    })

    const { status, body } = await escanear()

    expect(status).toBe(200)
    expect(plantillasEnviadas()).toEqual([FAR])
    expect(body.whatsapp.templateType).toBe('points_earned_far')
    expect(pedidos).toEqual([
      {
        url: `https://content.twilio.com/v1/Content/${NIVEL}/ApprovalRequests`,
        authorization: 'Basic ' + Buffer.from(`${SUBCUENTA.sid}:${SUBCUENTA.token}`).toString('base64'),
      },
    ])
  })

  it('Twilio dice «approved» → sale «Nivel desbloqueado»', async () => {
    await conTwilioReal(async () => new Response(JSON.stringify({ whatsapp: { status: 'approved' } }), { status: 200 }))

    await escanear()

    expect(plantillasEnviadas()).toEqual([NIVEL])
  })
})
