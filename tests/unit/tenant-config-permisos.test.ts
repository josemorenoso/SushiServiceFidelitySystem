/**
 * Quién puede ESCRIBIR la configuración de la MARCA — SEG-3 (2026-10-13).
 *
 * El agujero: `PUT /api/dashboard/tenant-config` autenticaba con `requireTenantId()`, que solo
 * mira que el JWT traiga una marca. Un **administrador de UNA sede** (`role='location'`) cambiaba
 * logo, paleta, tarjeta, link de reseñas, píxel y QR Studio de TODA la marca. Lo mismo sus dos
 * escritores hermanos: `brand-logo` (sube el logo de la marca y BORRA los anteriores del bucket;
 * su DELETE borra el logo de todas las sedes) y `meta-conversions` (el token de Meta de la marca).
 * Es la deuda que OPER-4 cerró en `settings` y el 09-09 en `reward-tiers`: ahora pasan por
 * `exigirAlcanceDeMarca()`. Los GET se quedan como estaban (leer no cruza marcas).
 *
 * Los alcances se fabrican con `decideLocationScope()` —la única fábrica honesta de un
 * `LocationScope`— y la decisión es la real (`puedeEscribirEnLaMarca()`). Se doblan solo la
 * sesión y la base.
 *
 * Código: `src/app/api/dashboard/tenant-config/route.ts` · `brand-logo/route.ts` ·
 * `meta-conversions/route.ts` · `src/lib/alcance-de-marca.ts`
 * Doc: `docs/features/multi-sede.md` §3.septies
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
let conSesion = true
let laEscrituraFalla = false
/** Todo lo que llegó a escribirse: config, token, bucket. */
let escrituras: Array<{ op: string; detalle: unknown }> = []

vi.mock('@/lib/location-scope', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, requireLocationScope: async () => alcanceDelUsuario }
})

vi.mock('@/lib/admin', () => ({ isSuperAdmin: async () => esOperadorDeCada1 }))

vi.mock('@/lib/tenant', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return { ...original, requireTenantId: async () => TENANT }
})

// Las versiones anteriores leían la sesión de acá: sin este doble, las pruebas del agujero no
// podrían correr contra el código viejo.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: conSesion ? { id: 'u1', app_metadata: { tenant_id: TENANT } } : null },
      }),
    },
  }),
}))

// El logo se re-codifica con sharp; con la puerta cerrada no se llega nunca acá.
vi.mock('sharp', () => ({ default: vi.fn() }))
// `meta-conversions-server.ts` importa `server-only`, que solo existe dentro de Next.
vi.mock('server-only', () => ({}))

function builder(tabla: string): unknown {
  let op = 'select'
  let fila: unknown = null
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    single: () => b,
    maybeSingle: () => b,
    upsert: (f: unknown) => ((op = 'upsert'), (fila = f), b),
    delete: () => ((op = 'delete'), b),
    then: (ok: (v: unknown) => unknown) => {
      if (op !== 'select') escrituras.push({ op: `${tabla}.${op}`, detalle: fila })
      const data = tabla === 'tenants' ? { config: { google_maps_url: 'https://g.page/r/marca' } } : null
      return Promise.resolve({ data, error: null }).then(ok)
    },
  }
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => builder(tabla),
    rpc: async (fn: string, args: unknown) => {
      if (laEscrituraFalla) return { data: null, error: { code: '08006', message: 'conexión caída' } }
      escrituras.push({ op: `rpc.${fn}`, detalle: args })
      return { data: null, error: null }
    },
    storage: {
      from: () => ({
        list: async () => ({ data: [{ name: 'logo-1.png' }], error: null }),
        remove: async (paths: string[]) => {
          escrituras.push({ op: 'storage.remove', detalle: paths })
          return { data: [], error: null }
        },
        upload: async () => {
          escrituras.push({ op: 'storage.upload', detalle: null })
          return { data: {}, error: null }
        },
      }),
    },
  }),
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

const ADMIN_DE_SEDE = () => alcance([{ location_id: SEDE_1, role: 'location' }])
const SUPER_USUARIO = () => alcance([{ location_id: null, role: 'brand' }])

function json(url: string, method: string, body?: unknown): Request {
  return new Request(`https://sushi-service.constelarys.com${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

async function guardarConfig(body: Record<string, unknown> = { 'branding.primary': '#0a7c4a' }) {
  const { PUT } = await import('@/app/api/dashboard/tenant-config/route')
  return PUT(json('/api/dashboard/tenant-config', 'PUT', body) as never)
}

beforeEach(() => {
  escrituras = []
  esOperadorDeCada1 = false
  conSesion = true
  laEscrituraFalla = false
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://doble.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'doble')
})

// ═══════════════════════════════════════════════════════════════
// PUT /api/dashboard/tenant-config
// ═══════════════════════════════════════════════════════════════

describe('PUT /api/dashboard/tenant-config — solo con alcance de marca (SEG-3)', () => {
  it('EL AGUJERO: un administrador de sede recibe 403, en español, y no escribe nada', async () => {
    alcanceDelUsuario = await ADMIN_DE_SEDE()
    const res = await guardarConfig({ 'branding.primary': '#000000', google_maps_url: 'https://g.page/r/otra' })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/solo un super usuario/)
    expect(escrituras).toEqual([])
  })

  it('un super usuario de la marca guarda (200) en SU marca, por merge_tenant_config_deep', async () => {
    alcanceDelUsuario = await SUPER_USUARIO()
    const res = await guardarConfig({ 'branding.primary': '#0a7c4a' })
    expect(res.status).toBe(200)
    expect(escrituras).toEqual([
      {
        op: 'rpc.merge_tenant_config_deep',
        detalle: { p_tenant_id: TENANT, p_patch: { branding: { primary: '#0a7c4a' } } },
      },
    ])
  })

  it('el operador de Cada1 guarda aunque el alcance no se haya podido resolver', async () => {
    alcanceDelUsuario = { ok: false, status: 403, error: 'Sin acceso a esta marca' }
    esOperadorDeCada1 = true
    const res = await guardarConfig()
    expect(res.status).toBe(200)
    expect(escrituras).toHaveLength(1)
  })

  it('un fallo de base al resolver el alcance es 500, no 403, y no escribe', async () => {
    alcanceDelUsuario = { ok: false, status: 500, error: 'No se pudieron leer los permisos' }
    const res = await guardarConfig()
    expect(res.status).toBe(500)
    expect(escrituras).toEqual([])
  })

  it('un fallo de base al escribir sigue siendo 500', async () => {
    alcanceDelUsuario = await SUPER_USUARIO()
    laEscrituraFalla = true
    const res = await guardarConfig()
    expect(res.status).toBe(500)
  })

  it('sin sesión: 401, no un 403 genérico', async () => {
    alcanceDelUsuario = { ok: false, status: 401, error: 'No autorizado' }
    conSesion = false
    const res = await guardarConfig()
    expect(res.status).toBe(401)
    expect(escrituras).toEqual([])
  })

  it('la whitelist sigue mandando para el super usuario: una ruta de afuera se ignora y un valor malo es 400', async () => {
    alcanceDelUsuario = await SUPER_USUARIO()
    const malo = await guardarConfig({ 'branding.primary': 'rojo' })
    expect(malo.status).toBe(400)
    expect(escrituras).toEqual([])
  })
})

describe('GET /api/dashboard/tenant-config — se queda abierto a la marca', () => {
  it('un administrador de sede LEE la config (leer no cruza marcas)', async () => {
    alcanceDelUsuario = await ADMIN_DE_SEDE()
    const { GET } = await import('@/app/api/dashboard/tenant-config/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(((await res.json()) as Record<string, unknown>).google_maps_url).toBe('https://g.page/r/marca')
  })
})

// ═══════════════════════════════════════════════════════════════
// Los dos escritores hermanos
// ═══════════════════════════════════════════════════════════════

describe('/api/dashboard/brand-logo — el logo de la marca', () => {
  it('EL AGUJERO: un administrador de sede no sube logo (403) ni toca el bucket', async () => {
    alcanceDelUsuario = await ADMIN_DE_SEDE()
    const { POST } = await import('@/app/api/dashboard/brand-logo/route')
    const form = new FormData()
    form.append('file', new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' }))
    const req = new Request('https://sushi-service.constelarys.com/api/dashboard/brand-logo', {
      method: 'POST',
      body: form,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(403)
    expect(escrituras).toEqual([])
  })

  it('EL AGUJERO: un administrador de sede no borra el logo de toda la marca (403)', async () => {
    alcanceDelUsuario = await ADMIN_DE_SEDE()
    const { DELETE } = await import('@/app/api/dashboard/brand-logo/route')
    const res = await DELETE(json('/api/dashboard/brand-logo', 'DELETE') as never)
    expect(res.status).toBe(403)
    expect(escrituras).toEqual([])
  })

  it('un super usuario borra el logo de SU marca (200)', async () => {
    alcanceDelUsuario = await SUPER_USUARIO()
    const { DELETE } = await import('@/app/api/dashboard/brand-logo/route')
    const res = await DELETE(json('/api/dashboard/brand-logo', 'DELETE') as never)
    expect(res.status).toBe(200)
    expect(escrituras).toEqual([{ op: 'storage.remove', detalle: [`${TENANT}/logo-1.png`] }])
  })
})

describe('PUT /api/dashboard/meta-conversions — el token de Meta de la marca', () => {
  const TOKEN = 'EAAGm0PX4ZCpsBAKZCtokendeprueba123'

  it('EL AGUJERO: un administrador de sede no cambia el token (403) ni escribe', async () => {
    alcanceDelUsuario = await ADMIN_DE_SEDE()
    const { PUT } = await import('@/app/api/dashboard/meta-conversions/route')
    const res = await PUT(json('/api/dashboard/meta-conversions', 'PUT', { token: TOKEN }) as never)
    expect(res.status).toBe(403)
    expect(escrituras).toEqual([])
  })

  it('un super usuario guarda el token de SU marca (200), con tenant_id explícito', async () => {
    alcanceDelUsuario = await SUPER_USUARIO()
    const { PUT } = await import('@/app/api/dashboard/meta-conversions/route')
    const res = await PUT(json('/api/dashboard/meta-conversions', 'PUT', { token: TOKEN }) as never)
    expect(res.status).toBe(200)
    expect(escrituras).toHaveLength(1)
    expect(escrituras[0]).toMatchObject({
      op: 'tenant_integration_secrets.upsert',
      detalle: { tenant_id: TENANT, secret: TOKEN, updated_by: 'u1' },
    })
  })
})
