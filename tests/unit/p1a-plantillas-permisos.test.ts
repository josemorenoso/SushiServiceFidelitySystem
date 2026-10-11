/**
 * N5 — editar, mandar a Meta o activar una plantilla exige alcance de MARCA (2026-10-11).
 *
 * El agujero: `PUT /api/dashboard/templates/catalog/[key]`, `POST …/submit` y `POST …/adopt`
 * autenticaban con «tiene sesión y su JWT trae una marca». Un **administrador de UNA sede**
 * cambiaba el mensaje que reciben los clientes de TODAS las sedes (las plantillas y sus
 * punteros son de la marca: no hay plantilla por sede). Ahora pasan por
 * `exigirAlcanceDeMarca()`, el mismo guardián que premios y ajustes.
 *
 * Los alcances salen de `decideLocationScope()` —la única fábrica honesta— y la decisión es
 * la real (`puedeEscribirEnLaMarca()`). Se doblan la sesión, el tenant y el servicio de
 * plantillas (que es lo que NO tiene que llegar a llamarse).
 *
 * Código: `src/app/api/dashboard/templates/catalog/[key]/` · `src/lib/alcance-de-marca.ts`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LocationScopeResult } from '@/lib/location-scope'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000000'
const SEDE_1 = 'bbbbbbbb-0000-4000-8000-000000000001'
const SEDE_2 = 'cccccccc-0000-4000-8000-000000000002'

let alcanceDelUsuario: LocationScopeResult
let esOperadorDeCada1 = false
const llamadasAlServicio: string[] = []

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
    getTenantById: async () => ({ id: TENANT, messaging_provider: 'zernio', zernio_account_id: 'acc' }),
  }
})
vi.mock('@/services/template.service', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  const ok = (nombre: string) => async () => {
    llamadasAlServicio.push(nombre)
    return { message: 'ok', version: null }
  }
  return {
    ...original,
    saveTemplateEdit: ok('editar'),
    submitSuggestedTemplate: ok('someter'),
    adoptApprovedTemplate: ok('adoptar'),
  }
})

async function alcance(permissions: { location_id: string | null; role: string }[]) {
  const { decideLocationScope } = await import('@/lib/location-scope')
  const r = decideLocationScope({ tenantId: TENANT, permissions, activeLocationIds: [SEDE_1, SEDE_2], requested: null })
  if (!r.ok) throw new Error(`el alcance no se pudo resolver: ${r.error}`)
  return { ok: true as const, scope: r.scope, locations: [] }
}

const KEY = 'welcome'
const params = { params: Promise.resolve({ key: KEY }) }
const url = (sufijo: string) => `https://marca.constelarys.com/api/dashboard/templates/catalog/${KEY}${sufijo}`

const RUTAS = {
  editar: async () => {
    const { PUT } = await import('@/app/api/dashboard/templates/catalog/[key]/route')
    const req = new Request(url(''), {
      method: 'PUT',
      body: JSON.stringify({ body: 'Hola {{1}}', acceptedDisclaimer: true }),
      headers: { 'content-type': 'application/json' },
    })
    return PUT(req as never, params)
  },
  someter: async () => {
    const { POST } = await import('@/app/api/dashboard/templates/catalog/[key]/submit/route')
    return POST(new Request(url('/submit'), { method: 'POST' }), params)
  },
  adoptar: async () => {
    const { POST } = await import('@/app/api/dashboard/templates/catalog/[key]/adopt/route')
    return POST(new Request(url('/adopt'), { method: 'POST' }), params)
  },
} as const

beforeEach(() => {
  llamadasAlServicio.length = 0
  esOperadorDeCada1 = false
})

describe.each(Object.keys(RUTAS) as Array<keyof typeof RUTAS>)('N5 · %s una plantilla del catálogo', (nombre) => {
  it('EL AGUJERO: un administrador de sede recibe 403 y el servicio no se llama', async () => {
    alcanceDelUsuario = await alcance([{ location_id: SEDE_1, role: 'location' }])
    const res = await RUTAS[nombre]()
    expect(res.status).toBe(403)
    expect(llamadasAlServicio).toEqual([])
  })

  it('un super usuario de la marca pasa (200)', async () => {
    alcanceDelUsuario = await alcance([{ location_id: null, role: 'brand' }])
    const res = await RUTAS[nombre]()
    expect(res.status).toBe(200)
    expect(llamadasAlServicio).toEqual([nombre])
  })

  it('el operador de Cada1 pasa aunque el alcance no se haya resuelto', async () => {
    alcanceDelUsuario = { ok: false, status: 403, error: 'Sin acceso a esta marca' }
    esOperadorDeCada1 = true
    const res = await RUTAS[nombre]()
    expect(res.status).toBe(200)
  })
})
