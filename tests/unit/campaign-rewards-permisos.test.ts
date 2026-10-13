/**
 * Quién puede CAMBIAR el catálogo de premios para regalar — `/api/dashboard/campaign-rewards`.
 *
 * El agujero (S-1, 2026-10-13): sus tres escrituras (crear, editar, retirar) autenticaban con
 * `requireTenantId()`, que solo comprueba que el JWT traiga una marca. Un **administrador de UNA
 * sede** (`role='location'`) cambiaba el catálogo de TODA la marca. Es el mismo agujero que se
 * cerró en `reward-tiers` el 2026-09-09 (`reward-tiers-permisos.test.ts`). Ahora las escrituras
 * pasan por `exigirAlcanceDeMarca()` y el GET se queda abierto a cualquier sesión de la marca.
 *
 * Los alcances se fabrican con `decideLocationScope()` —la única fábrica honesta de un
 * `LocationScope`— y la decisión es la real (`puedeEscribirEnLaMarca()`). Se doblan la sesión, el
 * operador de Cada1 y el servicio del catálogo.
 *
 * Y lo segundo: un fallo de base al LEER el catálogo es un 500, no `[]`. Antes la pantalla no podía
 * distinguir «la marca no tiene premios» de «la base falló», y un selector de premio quedaba vacío
 * como si no hubiera ninguno elegido.
 *
 * Código: `src/app/api/dashboard/campaign-rewards/route.ts` · `src/services/campaign-reward.service.ts`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LocationScopeResult } from '@/lib/location-scope'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000000'
const SEDE_1 = 'bbbbbbbb-0000-4000-8000-000000000001'
const SEDE_2 = 'cccccccc-0000-4000-8000-000000000002'

// ═══════════════════════════════════════════════════════════════
// Dobles
// ═══════════════════════════════════════════════════════════════

let alcanceDelUsuario: LocationScopeResult
let esOperadorDeCada1 = false
let haySesion = true

const servicio = {
  listar: vi.fn(),
  crear: vi.fn(),
  actualizar: vi.fn(),
  desactivar: vi.fn(),
}

vi.mock('@/lib/location-scope', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, requireLocationScope: async () => alcanceDelUsuario }
})

vi.mock('@/lib/admin', () => ({ isSuperAdmin: async () => esOperadorDeCada1 }))

vi.mock('@/lib/tenant', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, requireTenantId: async () => TENANT }
})

// La versión anterior de la ruta leía la sesión de acá: sin este doble, la prueba del agujero no
// podría correr contra el código viejo.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: haySesion ? { id: 'u1', app_metadata: { tenant_id: TENANT } } : null },
      }),
    },
  }),
}))

vi.mock('@/services/campaign-reward.service', () => ({
  getCampaignRewards: (...a: unknown[]) => servicio.listar(...a),
  createCampaignReward: (...a: unknown[]) => servicio.crear(...a),
  updateCampaignReward: (...a: unknown[]) => servicio.actualizar(...a),
  deactivateCampaignReward: (...a: unknown[]) => servicio.desactivar(...a),
}))

// Para la prueba del SERVICIO real (más abajo): la base contesta un error.
let respuestaDeBase: { data: unknown; error: { message: string; code?: string } | null } = { data: [], error: null }
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const b: Record<string, unknown> = {
      from: () => b,
      select: () => b,
      eq: () => b,
      order: () => b,
      then: (ok: (v: unknown) => unknown) => Promise.resolve(respuestaDeBase).then(ok),
    }
    return b
  },
}))

// ═══════════════════════════════════════════════════════════════
// Utilidades
// ═══════════════════════════════════════════════════════════════

async function alcance(permissions: { location_id: string | null; role: string }[]) {
  const { decideLocationScope } = await import('@/lib/location-scope')
  const r = decideLocationScope({
    tenantId: TENANT,
    permissions,
    activeLocationIds: [SEDE_1, SEDE_2],
    requested: null,
  })
  if (!r.ok) throw new Error(`el alcance no se pudo resolver: ${r.error}`)
  return { ok: true as const, scope: r.scope, locations: [] }
}

const URL_RUTA = 'https://sushi-service.constelarys.com/api/dashboard/campaign-rewards'

function pedir(metodo: 'POST' | 'PATCH' | 'DELETE' | 'GET', cuerpo?: unknown, query = '') {
  return new Request(`${URL_RUTA}${query}`, {
    method: metodo,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    headers: { 'content-type': 'application/json' },
  }) as never
}

async function ruta() {
  return import('@/app/api/dashboard/campaign-rewards/route')
}

const PREMIO = { id: 'r1', tenant_id: TENANT, title: '1/2 sushi gratis', description: null, is_active: true }

beforeEach(() => {
  vi.clearAllMocks()
  esOperadorDeCada1 = false
  haySesion = true
  respuestaDeBase = { data: [], error: null }
  servicio.listar.mockResolvedValue([PREMIO])
  servicio.crear.mockResolvedValue(PREMIO)
  servicio.actualizar.mockResolvedValue(PREMIO)
  servicio.desactivar.mockResolvedValue(undefined)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://doble.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'doble')
})

// ═══════════════════════════════════════════════════════════════
// Las tres escrituras
// ═══════════════════════════════════════════════════════════════

const ESCRITURAS = [
  { verbo: 'POST' as const, cuerpo: { title: '2x1 en rolls' }, query: '', servicio: 'crear' as const },
  { verbo: 'PATCH' as const, cuerpo: { id: 'r1', is_active: false }, query: '', servicio: 'actualizar' as const },
  { verbo: 'DELETE' as const, cuerpo: undefined, query: '?id=r1', servicio: 'desactivar' as const },
]

describe.each(ESCRITURAS)('$verbo /api/dashboard/campaign-rewards — solo con alcance de marca', (e) => {
  it('EL AGUJERO: un administrador de sede recibe 403 y no toca el catálogo', async () => {
    alcanceDelUsuario = await alcance([{ location_id: SEDE_1, role: 'location' }])
    const res = await (await ruta())[e.verbo](pedir(e.verbo, e.cuerpo, e.query))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/super usuario/)
    expect(servicio[e.servicio]).not.toHaveBeenCalled()
  })

  it('un super usuario de la marca escribe en SU marca', async () => {
    alcanceDelUsuario = await alcance([{ location_id: null, role: 'brand' }])
    const res = await (await ruta())[e.verbo](pedir(e.verbo, e.cuerpo, e.query))
    expect(res.status).toBeLessThan(300)
    expect(servicio[e.servicio]).toHaveBeenCalledTimes(1)
    // El tenant que llega al servicio es el de la sesión, nunca uno que mande el cliente.
    expect(servicio[e.servicio].mock.calls[0]).toContain(TENANT)
  })

  it('el operador de Cada1 escribe aunque el alcance no se haya podido resolver', async () => {
    alcanceDelUsuario = { ok: false, status: 403, error: 'Sin acceso a esta marca' }
    esOperadorDeCada1 = true
    const res = await (await ruta())[e.verbo](pedir(e.verbo, e.cuerpo, e.query))
    expect(res.status).toBeLessThan(300)
    expect(servicio[e.servicio]).toHaveBeenCalledTimes(1)
  })

  it('sin sesión: 401, no un 403 genérico', async () => {
    haySesion = false
    alcanceDelUsuario = { ok: false, status: 401, error: 'No autorizado' }
    const res = await (await ruta())[e.verbo](pedir(e.verbo, e.cuerpo, e.query))
    expect(res.status).toBe(401)
    expect(servicio[e.servicio]).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════
// La lectura
// ═══════════════════════════════════════════════════════════════

describe('GET /api/dashboard/campaign-rewards', () => {
  it('lo ve cualquier sesión de la marca, también un administrador de sede (leer no cruza marcas)', async () => {
    alcanceDelUsuario = await alcance([{ location_id: SEDE_1, role: 'location' }])
    const res = await (await ruta()).GET(pedir('GET'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([PREMIO])
    expect(servicio.listar).toHaveBeenCalledWith(TENANT, false)
  })

  it('si el servicio falla, la ruta contesta 500 (no una lista vacía)', async () => {
    servicio.listar.mockRejectedValue(new Error('base caída'))
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await (await ruta()).GET(pedir('GET'))
    expect(res.status).toBe(500)
    consola.mockRestore()
  })
})

describe('getCampaignRewards() — un fallo de base NO se confunde con «no hay premios»', () => {
  async function servicioReal() {
    return vi.importActual<typeof import('@/services/campaign-reward.service')>('@/services/campaign-reward.service')
  }

  it('lanza si la base devuelve un error (antes devolvía [])', async () => {
    respuestaDeBase = { data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } }
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect((await servicioReal()).getCampaignRewards(TENANT)).rejects.toThrow(/catálogo/)
    // Y queda registrado con contexto, que es lo que se busca en los logs.
    expect(consola.mock.calls.flat().join(' ')).toMatch(/\[CampaignReward\]\[FALLO\] reason=list_catalog_error code=57014/)
    consola.mockRestore()
  })

  it('un catálogo realmente vacío sigue siendo [] (eso sí es «no hay premios»)', async () => {
    respuestaDeBase = { data: [], error: null }
    await expect((await servicioReal()).getCampaignRewards(TENANT)).resolves.toEqual([])
  })
})
