/**
 * Quién puede ESCRIBIR los ajustes de la marca — `PUT /api/dashboard/settings`.
 *
 * El agujero (auditoría 2026-09-28, OPER-4): el PUT exigía solo una sesión con marca
 * (`requireTenantId()`), así que un **administrador de UNA sede** pisaba cualquier
 * `admin_settings` de la marca entera, un `*_template_sid` vigente incluido. Ahora
 * pasa por `exigirAlcanceDeMarca()`, el mismo guardián que las escrituras de premios.
 *
 * Los alcances se fabrican con `decideLocationScope()` —la única fábrica honesta de un
 * `LocationScope`— y la decisión es la real (`puedeEscribirEnLaMarca()`). Se doblan solo
 * la sesión y la base.
 *
 * Código: `src/app/api/dashboard/settings/route.ts` · `src/lib/alcance-de-marca.ts`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LocationScopeResult } from '@/lib/location-scope'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000000'
const SEDE_1 = 'bbbbbbbb-0000-4000-8000-000000000001'
const SEDE_2 = 'cccccccc-0000-4000-8000-000000000002'

// ═══════════════════════════════════════════════════════════════
// Dobles
// ═══════════════════════════════════════════════════════════════

/** Lo que devuelve `requireLocationScope()` para el usuario de cada prueba. */
let alcanceDelUsuario: LocationScopeResult
let esOperadorDeCada1 = false
/** Escrituras que llegaron a `admin_settings`. */
let escrituras: Array<{ op: string; fila: Record<string, unknown> }> = []

vi.mock('@/lib/location-scope', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, requireLocationScope: async () => alcanceDelUsuario }
})

vi.mock('@/lib/admin', () => ({ isSuperAdmin: async () => esOperadorDeCada1 }))

vi.mock('@/lib/tenant', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, requireTenantId: async () => TENANT }
})

// La versión anterior del PUT leía la sesión de acá: sin este doble, la prueba del
// agujero no podría correr contra el código viejo.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', app_metadata: { tenant_id: TENANT } } } }) },
  }),
}))

function builder(op: string, fila: Record<string, unknown> = {}): unknown {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    maybeSingle: () => b,
    update: (f: Record<string, unknown>) => builder('update', f),
    insert: (f: Record<string, unknown>) => builder('insert', f),
    then: (ok: (v: unknown) => unknown) => {
      if (op !== 'select') escrituras.push({ op, fila })
      return Promise.resolve({ data: null, error: null }).then(ok)
    },
  }
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => builder('select') }),
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

async function guardar(key = 'welcome_template_sid', value = 'HX_pisado') {
  const { PUT } = await import('@/app/api/dashboard/settings/route')
  const req = new Request('https://sushi-service.constelarys.com/api/dashboard/settings', {
    method: 'PUT',
    body: JSON.stringify({ key, value }),
    headers: { 'content-type': 'application/json' },
  })
  return PUT(req as never)
}

beforeEach(() => {
  escrituras = []
  esOperadorDeCada1 = false
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://doble.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'doble')
})

// ═══════════════════════════════════════════════════════════════
// Pruebas
// ═══════════════════════════════════════════════════════════════

describe('PUT /api/dashboard/settings — solo con alcance de marca (OPER-4)', () => {
  it('EL AGUJERO: un administrador de sede recibe 403 y no escribe nada', async () => {
    alcanceDelUsuario = await alcance([{ location_id: SEDE_1, role: 'location' }])
    const res = await guardar()
    expect(res.status).toBe(403)
    expect(escrituras).toEqual([])
  })

  it('un super usuario de la marca guarda (200) en SU marca', async () => {
    alcanceDelUsuario = await alcance([{ location_id: null, role: 'brand' }])
    const res = await guardar()
    expect(res.status).toBe(200)
    expect(escrituras).toHaveLength(1)
    expect(escrituras[0].fila).toMatchObject({ key: 'welcome_template_sid', value: 'HX_pisado', tenant_id: TENANT })
  })

  it('el operador de Cada1 guarda aunque el alcance no se haya podido resolver', async () => {
    alcanceDelUsuario = { ok: false, status: 403, error: 'Sin acceso a esta marca' }
    esOperadorDeCada1 = true
    const res = await guardar()
    expect(res.status).toBe(200)
    expect(escrituras).toHaveLength(1)
  })

  it('sin sesión: 401, no un 403 genérico', async () => {
    alcanceDelUsuario = { ok: false, status: 401, error: 'No autorizado' }
    const res = await guardar()
    expect(res.status).toBe(401)
    expect(escrituras).toEqual([])
  })
})
