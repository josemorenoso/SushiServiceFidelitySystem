/**
 * SEDE-OPERADOR (2026-10-14) — el operador de Cada1 ve el panel de una marca con dos sedes.
 *
 * El operador (`app_metadata.role = 'super_admin'`) no tiene fila en `dashboard_user_locations`
 * de las marcas de sus clientes, y `requireLocationScope()` le contestaba 403 en toda marca de
 * 2+ sedes (hoy Tepuy): Métricas, Rendimiento, Redenciones, Domicilios, Autorizados, Mis sedes y el
 * historial de Campañas. En SQL esa mitad sí estaba: las policies de la 00045 son
 * `is_super_admin() OR can_see_location(location_id)`, con el `OR` AFUERA. Ahora la fábrica lleva
 * el mismo `OR` afuera de `decideLocationScope()`, que no se tocó.
 *
 * Las rutas REALES sobre la base embebida con todas las migraciones (`tests/setup/supabase-sobre-pg.ts`),
 * igual que `tests/db/sedes-separadas.test.ts`. Falsa solo la sesión del panel: el JWT con
 * `app_metadata.tenant_id` (y `role` para el operador).
 *
 * Lo que fija (prompt `docs/prompts/2026-10-14-sede-operador.md` §4):
 *   · el operador en una marca de 2 sedes: 200 con «toda la marca» en Métricas, en Redenciones, en
 *     Mis sedes y en el selector («Toda la marca (2 sedes)»); con `?location_id=<sede>`, esa sede;
 *   · con el JWT de la marca A no ve nada de la marca B, pida lo que pida;
 *   · el administrador de sede, el usuario de marca y la marca de una sede, igual que antes;
 *   · falla cerrado: sin marca en el JWT 403, sin sesión 401, la base o la sesión caídas 500.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import { cerrarClienteDePrueba } from '../setup/supabase-sobre-pg'
import type { DashboardAnalytics } from '@/types/analytics.types'
import type { LocationScopeView } from '@/lib/location-scope-shared'
import { opcionesDelSelector, modoDelPanel } from '@/lib/panel-sedes'

const h = vi.hoisted(() => ({
  usuario: null as null | { id: string; app_metadata: Record<string, unknown> },
  /** La tabla cuya lectura falla (un timeout del pooler), o `null`. */
  falla: null as null | string,
  /** Auth no contesta (`getUser()` con `error`). */
  sesionCaida: false,
}))

vi.mock('@supabase/supabase-js', async () => {
  const m = await import('../setup/supabase-sobre-pg')
  const consultaQueFalla = () => {
    const respuesta = {
      data: null,
      error: { code: '57014', message: 'canceling statement due to statement timeout', details: null, hint: null },
      count: null,
      status: 500,
      statusText: 'Internal Server Error',
    }
    const q: Record<string, unknown> = {}
    for (const k of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'or', 'order', 'range', 'limit', 'like', 'ilike', 'match', 'single', 'maybeSingle']) {
      q[k] = () => q
    }
    q.then = (ok: (v: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(respuesta).then(ok, mal)
    return q
  }
  return {
    createClient: () => {
      const c = m.clienteDePrueba()
      return { from: (t: string) => (h.falla === t ? consultaQueFalla() : c.from(t)), rpc: c.rpc }
    },
  }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        h.sesionCaida
          ? { data: { user: null }, error: { message: 'Auth no contesta', status: 504 } }
          : { data: { user: h.usuario }, error: null },
    },
  }),
}))

// ═══════════════════════════════════════════════════════════════
// Las marcas, las sedes, los clientes
// ═══════════════════════════════════════════════════════════════

const db = () => getPool()
const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const DIA = 86_400_000
const haceDias = (n: number) => new Date(Date.now() - n * DIA)

/** El operador no está en `auth.users` de ninguna marca: solo trae su JWT. */
const OPERADOR_ID = '00000000-0000-4000-8000-0000000000ad'

const creadas: TestTenant[] = []
const usuarios: string[] = []
let telefono = 0
const nuevoTelefono = () => `32${String(process.pid % 1000).padStart(3, '0')}${String(++telefono).padStart(5, '0')}`

async function marca(dominio: string): Promise<TestTenant> {
  const t = await createTestTenant()
  creadas.push(t)
  await db().query(`UPDATE tenants SET domain = $2 WHERE id = $1`, [t.id, dominio])
  return t
}

async function sede(t: TestTenant, nombre: string, dominio: string, principal = false, orden = 0): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO restaurant_locations (tenant_id, name, slug, domain, is_primary, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
    [t.id, nombre, `s-${Math.random().toString(36).slice(2, 10)}`, dominio, principal, orden]
  )
  return rows[0].id
}

/** `tenant_id` EXPLÍCITO siempre (el DEFAULT puente de la 00028 mandaría la fila a otra marca). */
async function cliente(t: TestTenant, origen: string | null, visitas = 1): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO customers (tenant_id, phone, name, total_visits, origin_location_id)
     VALUES ($1, $2, 'Cliente', $3, $4) RETURNING id`,
    [t.id, nuevoTelefono(), visitas, origen]
  )
  return rows[0].id
}

async function visita(t: TestTenant, customerId: string, sedeId: string | null, cuando: Date): Promise<void> {
  await db().query(
    `INSERT INTO visits (tenant_id, customer_id, source, created_at, location_id, location_source)
     VALUES ($1, $2, 'qr', $3, $4, $5)`,
    [t.id, customerId, cuando, sedeId, sedeId ? 'host' : null]
  )
}

async function canje(t: TestTenant, customerId: string, sedeId: string | null): Promise<void> {
  await db().query(
    `INSERT INTO reward_redemptions (tenant_id, customer_id, prize_title, source, redeemed_location_id)
     VALUES ($1, $2, 'Postre de la casa', 'campaign_reward', $3)`,
    [t.id, customerId, sedeId]
  )
}

/** El operador de Cada1 con la sesión puesta en la marca `t`. Sin fila de alcance en ninguna. */
function operador(t: TestTenant | null): void {
  h.usuario = {
    id: OPERADOR_ID,
    app_metadata: t ? { tenant_id: t.id, role: 'super_admin' } : { role: 'super_admin' },
  }
}

/** Un usuario del panel con su fila de alcance (marca o sede). */
async function usuarioDelPanel(t: TestTenant, rol: 'brand' | 'location', sedeId: string | null = null): Promise<void> {
  const meta = { tenant_id: t.id }
  const { rows } = await db().query<{ id: string }>(`INSERT INTO auth.users (raw_app_meta_data) VALUES ($1) RETURNING id`, [
    JSON.stringify(meta),
  ])
  const id = rows[0].id
  usuarios.push(id)
  await db().query(
    `INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role) VALUES ($1, $2, $3, $4)`,
    [id, t.id, sedeId, rol]
  )
  h.usuario = { id, app_metadata: meta }
}

/** Sin fila de alcance y sin ser el operador: con 0 o 1 sede es «la marca» (fila 1 del §5.1). */
function sinFila(t: TestTenant): void {
  h.usuario = { id: '00000000-0000-4000-8000-0000000000bb', app_metadata: { tenant_id: t.id } }
}

type ConError<T> = T & { error?: string }

async function analitica(query = ''): Promise<{ status: number; body: ConError<DashboardAnalytics> }> {
  const { GET } = await import('@/app/api/dashboard/analytics/route')
  const res = await GET(new Request(`https://panel.constelarys.com/api/dashboard/analytics${query}`))
  return { status: res.status, body: (await res.json()) as ConError<DashboardAnalytics> }
}

async function selector(query = ''): Promise<{ status: number; body: ConError<LocationScopeView> }> {
  const { GET } = await import('@/app/api/dashboard/location-scope/route')
  const res = await GET(new Request(`https://panel.constelarys.com/api/dashboard/location-scope${query}`))
  return { status: res.status, body: (await res.json()) as ConError<LocationScopeView> }
}

interface Redenciones {
  redemptions: Array<{ customer_id: string; prize_title: string }>
  total: number
}
async function redenciones(query = ''): Promise<{ status: number; body: ConError<Redenciones> }> {
  const { GET } = await import('@/app/api/dashboard/redemptions/route')
  const res = await GET(new Request(`https://panel.constelarys.com/api/dashboard/redemptions${query}`) as never)
  return { status: res.status, body: (await res.json()) as ConError<Redenciones> }
}

interface MisSedes {
  role: string
  multiSede: boolean
  locations: Array<{ id: string; name: string }>
}
async function misSedes(): Promise<{ status: number; body: ConError<MisSedes> }> {
  const { GET } = await import('@/app/api/dashboard/locations/route')
  const res = await GET(new Request('https://panel.constelarys.com/api/dashboard/locations'))
  return { status: res.status, body: (await res.json()) as ConError<MisSedes> }
}

async function limpiar(t: TestTenant): Promise<void> {
  await db().query('DELETE FROM dashboard_user_locations WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM reward_redemptions WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM customer_cycle_touches WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM visits WHERE tenant_id = $1', [t.id])
  await db().query('UPDATE customers SET origin_location_id = NULL, last_visit_location_id = NULL WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM restaurant_locations WHERE tenant_id = $1', [t.id])
  await dropTestTenant(t.id)
}

// La marca A (Tepuy, dos sedes), la marca B (una sede, sus propios clientes) y U (una sede).
let A: TestTenant
let B: TestTenant
let U: TestTenant
let ENV: string
let LAU: string
let SEDE_B: string
const c: Record<string, string> = {}

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')

  A = await marca(`tepuy-op-${SUFIJO}.test`)
  ENV = await sede(A, 'Tepuy Envigado', `env-op-${SUFIJO}.test`, true, 0)
  LAU = await sede(A, 'Tepuy Laureles', `lau-op-${SUFIJO}.test`, false, 1)
  c.e1 = await cliente(A, ENV, 2)
  c.e2 = await cliente(A, ENV)
  c.l1 = await cliente(A, LAU)
  c.s1 = await cliente(A, null) // antes de tener dos sedes
  await visita(A, c.e1, ENV, haceDias(0))
  await visita(A, c.e1, ENV, haceDias(4))
  await visita(A, c.e2, ENV, haceDias(2))
  await visita(A, c.l1, LAU, haceDias(1))
  await visita(A, c.s1, null, haceDias(3))
  await canje(A, c.e1, ENV)
  await canje(A, c.l1, LAU)
  await canje(A, c.s1, null) // entregado antes de que se guardara la sede

  B = await marca(`otra-op-${SUFIJO}.test`)
  SEDE_B = await sede(B, 'Sede de la marca B', `otra-op-sede-${SUFIJO}.test`, true)
  for (let i = 0; i < 5; i++) {
    const b = await cliente(B, SEDE_B, 9)
    await visita(B, b, SEDE_B, haceDias(i))
    await canje(B, b, SEDE_B)
  }

  U = await marca(`unica-op-${SUFIJO}.test`)
  const sU = await sede(U, 'Única', `unica-op-sede-${SUFIJO}.test`, true)
  const u1 = await cliente(U, sU, 3)
  await cliente(U, null) // histórico sin sede: sigue contando en la marca
  await visita(U, u1, sU, haceDias(0))
  await visita(U, u1, null, haceDias(2))
})

beforeEach(() => {
  h.usuario = null
  h.falla = null
  h.sesionCaida = false
})

afterAll(async () => {
  for (const t of creadas) await limpiar(t)
  for (const u of usuarios) await db().query('DELETE FROM auth.users WHERE id = $1', [u])
  vi.unstubAllEnvs()
  await cerrarClienteDePrueba()
  await closePool()
})

const etiquetas = (view: LocationScopeView) => opcionesDelSelector(view).map((o) => o.label)

// ═══════════════════════════════════════════════════════════════
// 1. El operador en una marca de dos sedes: la marca entera
// ═══════════════════════════════════════════════════════════════

describe('el operador de Cada1 en una marca de 2 sedes ve «toda la marca» (antes: 403)', () => {
  it('Métricas: 200, con «Tus sedes» y los totales de la marca entera (el cubo sin sede incluido)', async () => {
    operador(A)
    const { status, body } = await analitica()
    expect(status).toBe(200)
    expect(body.brand.summary.totalCustomers).toBe(4)
    expect(body.location.summary.visitorsLast30d).toBe(4) // e1, e2, l1 y el sin sede
    expect(body.origin).toBeNull()
    expect(body.sedes!.sedes.map((s) => s.nombre)).toEqual(['Tepuy Envigado', 'Tepuy Laureles'])
    expect(body.sedes!.sinSede).toMatchObject({ clientesQueTrajo: 1, visitas: 1 })
  })

  it('el selector le dibuja «Toda la marca (2 sedes)» y las dos sedes; el panel, en modo «toda la marca»', async () => {
    operador(A)
    const { status, body } = await selector()
    expect(status).toBe(200)
    expect(body).toMatchObject({ role: 'brand', selection: 'all', canSeeAll: true, canSeeUnassigned: true, multiSede: true, brandLocationCount: 2 })
    expect(etiquetas(body)).toEqual(['Toda la marca (2 sedes)', 'Tepuy Envigado', 'Tepuy Laureles'])
    expect(modoDelPanel(body)).toEqual({ modo: 'toda-la-marca', sedes: 2 })
  })

  it('Redenciones: 200 con las tres entregas de la marca, también la que no tiene sede', async () => {
    operador(A)
    const { status, body } = await redenciones()
    expect(status).toBe(200)
    expect(body.total).toBe(3)
    expect(body.redemptions.map((r) => r.customer_id).sort()).toEqual([c.e1, c.l1, c.s1].sort())
  })

  it('Mis sedes: 200 con las dos sedes de la marca', async () => {
    operador(A)
    const { status, body } = await misSedes()
    expect(status).toBe(200)
    expect(body.role).toBe('brand')
    expect(body.multiSede).toBe(true)
    expect(body.locations.map((l) => l.id).sort()).toEqual([ENV, LAU].sort())
  })

  it('ve lo mismo que un usuario de marca de esa marca (la fila 3 del §5.1, ni más ni menos)', async () => {
    operador(A)
    const delOperador = await analitica()
    const vistaOperador = await selector()
    await usuarioDelPanel(A, 'brand')
    const delDueno = await analitica()
    const vistaDueno = await selector()
    expect(delOperador.body.brand.summary).toEqual(delDueno.body.brand.summary)
    expect(delOperador.body.location.summary).toEqual(delDueno.body.location.summary)
    expect(delOperador.body.sedes!.sedes).toEqual(delDueno.body.sedes!.sedes)
    expect(vistaOperador.body).toEqual(vistaDueno.body)
  })

  it('aunque tuviera una fila de sede en esa marca: el `OR` va AFUERA, como en la 00045', async () => {
    const meta = { tenant_id: A.id, role: 'super_admin' }
    const { rows } = await db().query<{ id: string }>(`INSERT INTO auth.users (raw_app_meta_data) VALUES ($1) RETURNING id`, [
      JSON.stringify(meta),
    ])
    usuarios.push(rows[0].id)
    await db().query(
      `INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role) VALUES ($1, $2, $3, 'location')`,
      [rows[0].id, A.id, LAU]
    )
    h.usuario = { id: rows[0].id, app_metadata: meta }
    const { status, body } = await selector()
    expect(status).toBe(200)
    expect(body.role).toBe('brand')
    expect(body.locations.map((l) => l.id).sort()).toEqual([ENV, LAU].sort())
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. Si elige una sede, ve esa sede (como un usuario de marca)
// ═══════════════════════════════════════════════════════════════

describe('el operador con `?location_id=<sede>` ve ESA sede', () => {
  it('Laureles: su cliente, su visitante y su entrega; lo de la marca sigue aparte', async () => {
    operador(A)
    const { status, body } = await analitica(`?location_id=${LAU}`)
    expect(status).toBe(200)
    expect(body.origin!.summary.totalCustomers).toBe(1)
    expect(body.location.summary.visitorsLast30d).toBe(1)
    expect(body.brand.summary.totalCustomers).toBe(4)
    expect(body.sedes).toBeNull()

    const r = await redenciones(`?location_id=${LAU}`)
    expect(r.status).toBe(200)
    expect(r.body.redemptions.map((x) => x.customer_id)).toEqual([c.l1])

    const v = await selector(`?location_id=${LAU}`)
    expect(v.body).toMatchObject({ selection: 'one', selectedLocationId: LAU })
    expect(modoDelPanel(v.body)).toMatchObject({ modo: 'sede', nombre: 'Tepuy Laureles' })
  })

  it('«sin sede» (`?location_id=unknown`) también, porque es de la marca', async () => {
    operador(A)
    const r = await redenciones('?location_id=unknown')
    expect(r.status).toBe(200)
    expect(r.body.redemptions.map((x) => x.customer_id)).toEqual([c.s1])
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. La marca de SU sesión y ninguna otra
// ═══════════════════════════════════════════════════════════════

describe('con el JWT de la marca A, el operador no ve nada de la marca B', () => {
  it('pedir la sede de B desde la sesión de A es 403 en las tres rutas, nunca los datos de B', async () => {
    operador(A)
    expect((await analitica(`?location_id=${SEDE_B}`)).status).toBe(403)
    expect((await redenciones(`?location_id=${SEDE_B}`)).status).toBe(403)
    expect((await selector(`?location_id=${SEDE_B}`)).status).toBe(403)
  })

  it('con «toda la marca» nada de B aparece: ni su sede, ni sus 5 clientes, ni sus entregas', async () => {
    operador(A)
    const { body } = await analitica()
    expect(JSON.stringify(body)).not.toContain(SEDE_B)
    expect(body.brand.summary.totalCustomers).toBe(4)
    const r = await redenciones()
    expect(r.body.total).toBe(3)
    const v = await selector()
    expect(v.body.locations.some((l) => l.id === SEDE_B)).toBe(false)
  })

  it('con el JWT de B ve B, y nada de A', async () => {
    operador(B)
    const { status, body } = await analitica()
    expect(status).toBe(200)
    expect(body.brand.summary.totalCustomers).toBe(5)
    expect(JSON.stringify(body)).not.toContain(ENV)
    expect(JSON.stringify(body)).not.toContain(LAU)
    expect((await analitica(`?location_id=${LAU}`)).status).toBe(403)
    const r = await redenciones()
    expect(r.body.total).toBe(5)
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. Lo demás, exactamente igual que antes
// ═══════════════════════════════════════════════════════════════

describe('los demás usuarios, igual que hoy', () => {
  it('un administrador de sede (Laureles) sigue con solo la suya: Envigado y «sin sede» le dan 403', async () => {
    await usuarioDelPanel(A, 'location', LAU)
    const { status, body } = await analitica()
    expect(status).toBe(200)
    expect(body.origin!.summary.totalCustomers).toBe(1)
    expect(body.sedes).toBeNull()
    expect((await analitica(`?location_id=${ENV}`)).status).toBe(403)
    expect((await redenciones('?location_id=unknown')).status).toBe(403)
    const r = await redenciones()
    expect(r.body.redemptions.map((x) => x.customer_id)).toEqual([c.l1])
    const v = await selector()
    expect(v.body).toMatchObject({ role: 'location', canSeeAll: false, canSeeUnassigned: false })
    expect(etiquetas(v.body)).toEqual([]) // una sola sede: no hay selector
  })

  it('un usuario de marca, igual: «Tus sedes» y el selector de la marca', async () => {
    await usuarioDelPanel(A, 'brand')
    const { status, body } = await analitica()
    expect(status).toBe(200)
    expect(body.sedes).not.toBeNull()
    const v = await selector()
    expect(etiquetas(v.body)).toEqual(['Toda la marca (2 sedes)', 'Tepuy Envigado', 'Tepuy Laureles'])
  })

  it('quien no es el operador y no tiene fila en una marca de 2 sedes sigue en 403 (el fail-safe del §5.1)', async () => {
    sinFila(A)
    expect((await analitica()).status).toBe(403)
    expect((await selector()).status).toBe(403)
    expect((await redenciones()).status).toBe(403)
  })

  it('una marca de 1 sede, sin cambios: el operador ve lo mismo que el dueño sin fila, y sin selector', async () => {
    sinFila(U)
    const delDueno = await analitica()
    const vistaDueno = await selector()
    operador(U)
    const delOperador = await analitica()
    const vistaOperador = await selector()
    expect(delOperador.status).toBe(200)
    expect(delOperador.body.origin).toBeNull()
    expect(delOperador.body.sedes).toBeNull()
    expect(delOperador.body.brand.summary).toEqual(delDueno.body.brand.summary)
    expect(delOperador.body.location.summary).toEqual(delDueno.body.location.summary)
    expect(delOperador.body.brand.summary.totalCustomers).toBe(2)
    expect(vistaOperador.body).toEqual(vistaDueno.body)
    expect(vistaOperador.body.multiSede).toBe(false)
    expect(etiquetas(vistaOperador.body)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. Falla cerrado, igual que antes
// ═══════════════════════════════════════════════════════════════

describe('el operador también falla cerrado', () => {
  it('sin marca en el JWT: 403 «Tu sesión no trae la marca», como hoy', async () => {
    operador(null)
    const { status, body } = await analitica()
    expect(status).toBe(403)
    expect(body.error).toMatch(/no trae la marca/)
  })

  it('si la lectura de las sedes falla: 500, nunca la marca entera', async () => {
    operador(A)
    h.falla = 'restaurant_locations'
    expect((await selector()).status).toBe(500)
    expect((await analitica()).status).toBe(500)
  })

  it('si la sesión no se puede leer: 500; sin sesión: 401', async () => {
    h.sesionCaida = true
    expect((await selector()).status).toBe(500)
    h.sesionCaida = false
    h.usuario = null
    expect((await selector()).status).toBe(401)
  })
})
