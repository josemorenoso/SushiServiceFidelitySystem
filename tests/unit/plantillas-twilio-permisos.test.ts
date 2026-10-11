/**
 * N5-bis — las rutas de plantillas de TWILIO exigen alcance de MARCA (2026-10-11).
 *
 * P1-a cerró N5 solo en las rutas del catálogo Zernio. Quedaban abiertas `POST
 * /api/dashboard/templates` (crear una plantilla), `POST …/[sid]/submit` (mandarla a Meta) y
 * `POST …/standard` (crear una del set estándar y dejarle el puntero): un administrador de
 * UNA sede creaba y sometía plantillas en la cuenta de WhatsApp de la marca entera.
 *
 * Los alcances salen de `decideLocationScope()` —la única fábrica honesta— y la decisión es la
 * real (`puedeEscribirEnLaMarca()`). Lo que no tiene que pasar con un 403 es que se llame a
 * Twilio (un `fetch`) o al servicio que crea.
 *
 * Código: `src/app/api/dashboard/templates/` · `src/lib/alcance-de-marca.ts`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { LocationScopeResult } from '@/lib/location-scope'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000000'
const SEDE_1 = 'bbbbbbbb-0000-4000-8000-000000000001'
const SEDE_2 = 'cccccccc-0000-4000-8000-000000000002'

let alcanceDelUsuario: LocationScopeResult
let esOperadorDeCada1 = false
const llamadas: string[] = []

vi.mock('@/lib/location-scope', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, requireLocationScope: async () => alcanceDelUsuario }
})
vi.mock('@/lib/admin', () => ({ isSuperAdmin: async () => esOperadorDeCada1 }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'x@y.co', app_metadata: { tenant_id: TENANT } } } }) },
  }),
}))
vi.mock('@/lib/tenant', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    requireTenantId: async () => TENANT,
    getTenantIdFromJwt: async () => TENANT,
    getTenantById: async () => ({ id: TENANT, messaging_provider: 'twilio', config: {} }),
  }
})
vi.mock('@/lib/twilio/tenant-credentials', () => ({
  getTenantTwilioCredentials: async () => ({ basicAuth: 'Basic doble' }),
  resolveTwilioAccount: () => null,
}))
vi.mock('@/services/twilio-catalog.service', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    createStandardTemplate: async () => {
      llamadas.push('createStandardTemplate')
      return { key: 'welcome', contentSid: 'HX1', approvalSubmitted: true, approvalError: null, pointerWritten: true }
    },
  }
})

async function alcance(permissions: { location_id: string | null; role: string }[]) {
  const { decideLocationScope } = await import('@/lib/location-scope')
  const r = decideLocationScope({ tenantId: TENANT, permissions, activeLocationIds: [SEDE_1, SEDE_2], requested: null })
  if (!r.ok) throw new Error(`el alcance no se pudo resolver: ${r.error}`)
  return { ok: true as const, scope: r.scope, locations: [] }
}

const BASE = 'https://marca.constelarys.com/api/dashboard/templates'
const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

const RUTAS = {
  crear: async () => {
    const { POST } = await import('@/app/api/dashboard/templates/route')
    return POST(
      new Request(BASE, json({
        name: 'promo_viernes',
        category: 'MARKETING',
        body: '¡Hola {{1}}! Este viernes tenemos dos por uno en todo el menú para ti. Responde SALIR para no recibir más mensajes.',
        variables: { '1': 'María' },
      })) as never
    )
  },
  someter: async () => {
    const { POST } = await import('@/app/api/dashboard/templates/[sid]/submit/route')
    return POST(new Request(`${BASE}/HX123/submit`, json({ category: 'MARKETING' })) as never, {
      params: Promise.resolve({ sid: 'HX123' }),
    })
  },
  'crear del set estándar': async () => {
    const { POST } = await import('@/app/api/dashboard/templates/standard/route')
    return POST(new Request(`${BASE}/standard`, json({ key: 'welcome' })) as never)
  },
} as const

/** Twilio de mentira: crear y someter contestan OK. Cada llamada queda anotada. */
function twilioQueResponde() {
  return vi.fn(async (url: string) => {
    llamadas.push(`fetch ${url}`)
    const body = url.includes('ApprovalRequests')
      ? { whatsapp: { status: 'received' } }
      : { sid: 'HX123', friendly_name: 'promo_viernes', types: {} }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  })
}

beforeEach(() => {
  llamadas.length = 0
  esOperadorDeCada1 = false
  vi.stubGlobal('fetch', twilioQueResponde())
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe.each(Object.keys(RUTAS) as Array<keyof typeof RUTAS>)('N5-bis · %s (Twilio)', (nombre) => {
  it('EL AGUJERO: un administrador de sede recibe 403 y no se toca Twilio', async () => {
    alcanceDelUsuario = await alcance([{ location_id: SEDE_1, role: 'location' }])
    const res = await RUTAS[nombre]()
    expect(res.status).toBe(403)
    expect(llamadas).toEqual([])
  })

  it('un super usuario de la marca pasa', async () => {
    alcanceDelUsuario = await alcance([{ location_id: null, role: 'brand' }])
    const res = await RUTAS[nombre]()
    expect(res.status).toBe(200)
    expect(llamadas.length).toBeGreaterThan(0)
  })

  it('el operador de Cada1 pasa aunque el alcance no se haya resuelto', async () => {
    alcanceDelUsuario = { ok: false, status: 403, error: 'Sin acceso a esta marca' }
    esOperadorDeCada1 = true
    const res = await RUTAS[nombre]()
    expect(res.status).toBe(200)
  })
})
