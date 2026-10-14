/**
 * Sedes separadas, parte 1: el panel separado de verdad (2026-10-14) — contra Postgres de verdad.
 *
 * Las rutas REALES (`GET /api/dashboard/analytics` y `POST /api/reward-redeem`) sobre la base
 * embebida con todas las migraciones, a través de `tests/setup/supabase-sobre-pg.ts`. Falsa solo
 * la sesión del panel (quién mira: el JWT con `app_metadata.tenant_id`).
 *
 * Lo que pidió el dueño mirando Tepuy (prompt `docs/prompts/2026-10-14-sedes-separadas.md` §6):
 *   · con una sede elegida, «clientes de esta sede», «nuevos» y «vinieron» son los de ESA sede
 *     (con Envigado y con Laureles el panel decía «40 clientes» las dos veces);
 *   · con «toda la marca», los totales cuadran con las sedes más «sin sede», y un cliente que va
 *     a las dos se cuenta una vez en el total;
 *   · la marca B no aparece nunca; un administrador de sede ve su sede y no la otra;
 *   · el canje en la otra sede guarda `redeemed_location_id` y los puntos suman igual;
 *   · una marca de una sede devuelve lo mismo que antes (nada de sede); un fallo de base es 500.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import { cerrarClienteDePrueba } from '../setup/supabase-sobre-pg'
import type { DashboardAnalytics } from '@/types/analytics.types'

const h = vi.hoisted(() => ({
  usuario: null as null | { id: string; app_metadata: Record<string, unknown> },
  /** La tabla cuya lectura falla (un timeout del pooler), o `null`. */
  falla: null as null | string,
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
    for (const k of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'or', 'order', 'range', 'limit', 'like', 'ilike', 'match', 'single', 'maybeSingle', 'insert', 'update', 'upsert', 'delete']) {
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
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.usuario }, error: null }) } }),
}))

// ═══════════════════════════════════════════════════════════════
// Las marcas, las sedes, los clientes
// ═══════════════════════════════════════════════════════════════

const db = () => getPool()
const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
const DIA = 86_400_000
const haceDias = (n: number) => new Date(Date.now() - n * DIA)

const creadas: TestTenant[] = []
const usuarios: string[] = []
let telefono = 0
const nuevoTelefono = () => `31${String(process.pid % 1000).padStart(3, '0')}${String(++telefono).padStart(5, '0')}`

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
async function cliente(
  t: TestTenant,
  opts: { origen: string | null; visitas?: number; creado?: Date; puntos?: number }
): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO customers (tenant_id, phone, name, total_visits, total_points, origin_location_id, created_at)
     VALUES ($1, $2, 'Cliente', $3, $4, $5, $6) RETURNING id`,
    [t.id, nuevoTelefono(), opts.visitas ?? 1, opts.puntos ?? 0, opts.origen, opts.creado ?? new Date()]
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

/** Quién mira el panel: un usuario con su fila de alcance (marca o sede). */
async function usuarioDelPanel(t: TestTenant, rol: 'brand' | 'location', sedeId: string | null = null): Promise<void> {
  const meta = { tenant_id: t.id }
  const { rows } = await db().query<{ id: string }>(`INSERT INTO auth.users (raw_app_meta_data) VALUES ($1) RETURNING id`, [
    JSON.stringify(meta),
  ])
  const id = rows[0].id
  usuarios.push(id)
  await db().query(
    `INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role) VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [id, t.id, sedeId, rol]
  )
  h.usuario = { id, app_metadata: meta }
}

/** Sin fila de alcance: con 0 o 1 sede es «la marca» (fila 1 del §5.1). */
function duenoSinFila(t: TestTenant): void {
  h.usuario = { id: '00000000-0000-4000-8000-0000000000bb', app_metadata: { tenant_id: t.id } }
}

type ConError<T> = T & { error?: string }

async function analitica(query = ''): Promise<{ status: number; body: ConError<DashboardAnalytics> }> {
  const { GET } = await import('@/app/api/dashboard/analytics/route')
  const res = await GET(new Request(`https://panel.constelarys.com/api/dashboard/analytics${query}`))
  return { status: res.status, body: (await res.json()) as ConError<DashboardAnalytics> }
}

async function limpiar(t: TestTenant): Promise<void> {
  await db().query('DELETE FROM dashboard_user_locations WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM reward_redemptions WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM reward_grants WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM point_transactions WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM staff_devices WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM staff_users WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM customer_cycle_touches WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM visits WHERE tenant_id = $1', [t.id])
  await db().query('UPDATE customers SET origin_location_id = NULL, last_visit_location_id = NULL WHERE tenant_id = $1', [t.id])
  await db().query('DELETE FROM restaurant_locations WHERE tenant_id = $1', [t.id])
  await dropTestTenant(t.id)
}

// La marca A (Tepuy, dos sedes) y la marca B (una sede, sus propios clientes).
let A: TestTenant
let B: TestTenant
let ENV: string
let LAU: string
let SEDE_B: string
const dominioA = `tepuy-${SUFIJO}.test`
const dominioEnv = `env-${SUFIJO}.test`
const dominioLau = `lau-${SUFIJO}.test`
const c: Record<string, string> = {}

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')

  A = await marca(dominioA)
  ENV = await sede(A, 'Tepuy Envigado', dominioEnv, true, 0)
  LAU = await sede(A, 'Tepuy Laureles', dominioLau, false, 1)

  // Envigado trajo 3 (uno de hace dos meses); Laureles 2; uno sin sede (antes de tener dos).
  c.e1 = await cliente(A, { origen: ENV, visitas: 2 })
  c.e2 = await cliente(A, { origen: ENV, visitas: 2 }) // va a las DOS sedes
  c.e3 = await cliente(A, { origen: ENV, visitas: 1, creado: haceDias(70) })
  c.l1 = await cliente(A, { origen: LAU, visitas: 1 })
  c.l2 = await cliente(A, { origen: LAU, visitas: 4 }) // frecuente
  c.s1 = await cliente(A, { origen: null, visitas: 1 })

  await visita(A, c.e1, ENV, haceDias(0))
  await visita(A, c.e1, ENV, haceDias(3))
  await visita(A, c.e2, ENV, haceDias(5))
  await visita(A, c.e2, LAU, haceDias(2))
  await visita(A, c.e3, ENV, haceDias(60)) // fuera de los 30 días
  await visita(A, c.l1, LAU, haceDias(0))
  await visita(A, c.l2, LAU, haceDias(10))
  await visita(A, c.s1, null, haceDias(1)) // sin sede

  B = await marca(`otra-${SUFIJO}.test`)
  SEDE_B = await sede(B, 'Sede de la marca B', `otra-sede-${SUFIJO}.test`, true)
  const b1 = await cliente(B, { origen: SEDE_B, visitas: 9 })
  const b2 = await cliente(B, { origen: SEDE_B, visitas: 9 })
  await visita(B, b1, SEDE_B, haceDias(0))
  await visita(B, b2, SEDE_B, haceDias(1))
})

beforeEach(() => {
  h.usuario = null
  h.falla = null
})

afterAll(async () => {
  for (const t of creadas) await limpiar(t)
  for (const u of usuarios) await db().query('DELETE FROM auth.users WHERE id = $1', [u])
  vi.unstubAllEnvs()
  await cerrarClienteDePrueba()
  await closePool()
})

const deSede = (body: DashboardAnalytics, id: string) => body.sedes!.sedes.find((s) => s.locationId === id)!

// ═══════════════════════════════════════════════════════════════
// 1. Con UNA sede elegida, cada número es de esa sede
// ═══════════════════════════════════════════════════════════════

describe('con una sede elegida: «clientes de esta sede», «nuevos» y «vinieron» son de ESA sede', () => {
  it('Envigado: 3 clientes (los que se registraron ahí), 2 nuevos hoy, 2 vinieron; la marca sigue aparte', async () => {
    await usuarioDelPanel(A, 'brand')
    const { status, body } = await analitica(`?location_id=${ENV}`)
    expect(status).toBe(200)
    expect(body.origin).not.toBeNull()
    expect(body.origin!.summary.totalCustomers).toBe(3)
    expect(body.origin!.summary.newCustomersToday).toBe(2)
    expect(body.origin!.summary.newCustomersWeek).toBe(2)
    expect(body.location.summary.visitorsLast30d).toBe(2) // e1 y e2
    expect(body.location.summary.visitsToday).toBe(1)
    // Lo de la marca no cambia con la sede: viaja aparte (y la pantalla lo pone bajo «De toda la marca»).
    expect(body.brand.summary.totalCustomers).toBe(6)
    // «Tus sedes» solo con toda la marca.
    expect(body.sedes).toBeNull()
  })

  it('Laureles: 2 clientes, 1 frecuente, 3 vinieron (el que va a las dos cuenta también aquí): NO los 40 de la marca', async () => {
    await usuarioDelPanel(A, 'brand')
    const { status, body } = await analitica(`?location_id=${LAU}`)
    expect(status).toBe(200)
    expect(body.origin!.summary.totalCustomers).toBe(2)
    expect(body.origin!.summary.frequentCustomers).toBe(1)
    expect(body.origin!.customerTiers.reduce((n, t) => n + t.count, 0)).toBe(2)
    expect(body.location.summary.visitorsLast30d).toBe(3) // e2, l1, l2
    // Con Envigado y con Laureles el número de clientes ya no es el mismo (la queja del dueño).
    const env = await analitica(`?location_id=${ENV}`)
    expect(env.body.origin!.summary.totalCustomers).not.toBe(body.origin!.summary.totalCustomers)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. Con «toda la marca», los totales cuadran con las sedes más «sin sede»
// ═══════════════════════════════════════════════════════════════

describe('con «toda la marca»: «Tus sedes» cuadra con el total', () => {
  it('clientes: Envigado 3 + Laureles 2 + sin sede 1 = 6; vinieron: el que va a las dos cuenta una vez en el total', async () => {
    await usuarioDelPanel(A, 'brand')
    const { status, body } = await analitica()
    expect(status).toBe(200)
    expect(body.origin).toBeNull() // la marca entera: no se manda dos veces
    const s = body.sedes!
    expect(s.sedes.map((x) => x.nombre)).toEqual(['Tepuy Envigado', 'Tepuy Laureles'])

    const env = deSede(body, ENV)
    const lau = deSede(body, LAU)
    expect(env).toMatchObject({ clientesQueTrajo: 3, clientesQueTrajoEsteMes: 2, clientesQueVinieron: 2, visitas: 3 })
    expect(lau).toMatchObject({ clientesQueTrajo: 2, clientesQueTrajoEsteMes: 2, clientesQueVinieron: 3, visitas: 3 })
    expect(s.sinSede).toMatchObject({ locationId: null, clientesQueTrajo: 1, visitas: 1, clientesQueVinieron: 1 })

    // Partición: las sedes más «sin sede» suman la marca.
    const trajeron = s.sedes.reduce((n, x) => n + x.clientesQueTrajo, 0) + (s.sinSede?.clientesQueTrajo ?? 0)
    expect(trajeron).toBe(body.brand.summary.totalCustomers)
    expect(body.brand.summary.totalCustomers).toBe(6)

    // «Vinieron» NO es partición: e2 está en las dos tarjetas, y una sola vez en el total.
    expect(s.clientesEnVariasSedes).toBe(1)
    const vinieronSumados = s.sedes.reduce((n, x) => n + x.clientesQueVinieron, 0) + (s.sinSede?.clientesQueVinieron ?? 0)
    expect(body.location.summary.visitorsLast30d).toBe(5)
    expect(vinieronSumados - s.clientesEnVariasSedes).toBe(body.location.summary.visitorsLast30d)

    // El gráfico: una serie por sede y la de «sin sede» (tiene una visita), 30 días.
    expect(s.visitasPorDia).toHaveLength(30)
    expect(Object.keys(s.visitasPorDia[29].porSede).sort()).toEqual([ENV, LAU, 'sin_sede'].sort())
    const total = (id: string) => s.visitasPorDia.reduce((n, d) => n + (d.porSede[id] ?? 0), 0)
    expect(total(ENV)).toBe(3)
    expect(total(LAU)).toBe(3)
    expect(total('sin_sede')).toBe(1)
  })

  it('la marca B no aparece nunca: ni sus clientes, ni sus visitas, ni su sede', async () => {
    await usuarioDelPanel(A, 'brand')
    const { body } = await analitica()
    expect(body.brand.summary.totalCustomers).toBe(6)
    expect(body.sedes!.sedes.some((x) => x.locationId === SEDE_B || x.nombre.includes('marca B'))).toBe(false)
    expect(JSON.stringify(body)).not.toContain(SEDE_B)
    // Y pedir la sede de B desde A es 403, no una lista vacía.
    const cruzada = await analitica(`?location_id=${SEDE_B}`)
    expect(cruzada.status).toBe(403)
  })

  it('sin nada sin sede, la fila «Sin sede» no viene (Tepuy hoy: 23 + 17 y nada sin sede)', async () => {
    const t = await marca(`limpia-${SUFIJO}.test`)
    const s1 = await sede(t, 'Norte', `norte-${SUFIJO}.test`, true, 0)
    const s2 = await sede(t, 'Sur', `sur-${SUFIJO}.test`, false, 1)
    const x = await cliente(t, { origen: s1 })
    await cliente(t, { origen: s2 })
    await visita(t, x, s1, haceDias(1))
    await usuarioDelPanel(t, 'brand')
    const { body } = await analitica()
    expect(body.sedes!.sinSede).toBeNull()
    expect(Object.keys(body.sedes!.visitasPorDia[0].porSede).sort()).toEqual([s1, s2].sort())
    expect(body.sedes!.clientesEnVariasSedes).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. Un administrador de sede ve su sede y no la otra
// ═══════════════════════════════════════════════════════════════

describe('un administrador de sede (role=location) ve SU sede', () => {
  it('el de Laureles: sus 2 clientes y sus 3 visitantes, sin «Tus sedes»; Envigado le da 403', async () => {
    await usuarioDelPanel(A, 'location', LAU)
    const { status, body } = await analitica()
    expect(status).toBe(200)
    expect(body.origin!.summary.totalCustomers).toBe(2)
    expect(body.location.summary.visitorsLast30d).toBe(3)
    expect(body.sedes).toBeNull()
    expect(JSON.stringify(body.origin)).not.toContain(ENV)

    const otra = await analitica(`?location_id=${ENV}`)
    expect(otra.status).toBe(403)
    // «Sin sede» es de la marca: tampoco.
    const sinSede = await analitica('?location_id=unknown')
    expect(sinSede.status).toBe(403)
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. Una marca de una sede: lo mismo que antes; un fallo de base es 500
// ═══════════════════════════════════════════════════════════════

describe('marca de una sede y fallos', () => {
  it('una marca de 1 sede no recibe nada de sede: sin recorte, sin «Tus sedes», los mismos totales', async () => {
    const t = await marca(`unica-${SUFIJO}.test`)
    const s = await sede(t, 'Única', `unica-sede-${SUFIJO}.test`, true)
    const x = await cliente(t, { origen: s, visitas: 3 })
    await cliente(t, { origen: null, visitas: 1 }) // histórico sin sede: sigue contando en la marca
    await visita(t, x, s, haceDias(0))
    await visita(t, x, null, haceDias(2))
    duenoSinFila(t)
    const { status, body } = await analitica()
    expect(status).toBe(200)
    expect(body.origin).toBeNull()
    expect(body.sedes).toBeNull()
    expect(body.brand.summary).toEqual({
      totalCustomers: 2,
      newCustomersToday: 2,
      newCustomersWeek: 2,
      frequentCustomers: 1,
      birthdaysToday: 0,
    })
    expect(body.location.summary).toEqual({ visitsToday: 1, deliveriesToday: 0, qrToday: 1, visitorsLast30d: 1 })
    // Las visitas por día incluyen la que no tiene sede, como siempre (la marca la ve).
    expect(body.location.visitsPerDay.reduce((n, d) => n + d.total, 0)).toBe(2)
  })

  it('un fallo de base es 500, nunca «0 clientes» (también con «Tus sedes»)', async () => {
    await usuarioDelPanel(A, 'brand')
    h.falla = 'customers'
    const sinClientes = await analitica()
    expect(sinClientes.status).toBe(500)
    expect(sinClientes.body.brand).toBeUndefined()

    h.falla = 'reward_redemptions'
    const sinPremios = await analitica()
    expect(sinPremios.status).toBe(500)

    h.falla = 'restaurant_locations'
    const sinSedes = await analitica()
    expect(sinSedes.status).toBe(500)
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. El canje en la otra sede: guarda dónde se entregó, y los puntos suman igual
// ═══════════════════════════════════════════════════════════════

describe('premios entregados por sede: `recordRedemption()` guarda `redeemed_location_id`', () => {
  let meseroLau: string
  let rotativo: string
  const aparatoLau = `fp-lau-${SUFIJO}`
  const aparatoSinSede = `fp-sin-${SUFIJO}`

  beforeAll(async () => {
    const mesero = await db().query<{ id: string }>(
      `INSERT INTO staff_users (tenant_id, name, role, location_id, works_any_location) VALUES ($1, 'Mesera de Laureles', 'waiter', $2, false) RETURNING id`,
      [A.id, LAU]
    )
    meseroLau = mesero.rows[0].id
    const rota = await db().query<{ id: string }>(
      `INSERT INTO staff_users (tenant_id, name, role, location_id, works_any_location) VALUES ($1, 'Rotativo', 'waiter', NULL, true) RETURNING id`,
      [A.id]
    )
    rotativo = rota.rows[0].id
    await db().query(
      `INSERT INTO staff_devices (tenant_id, device_fingerprint, device_name, is_trusted, location_id) VALUES
       ($1, $2, 'Tablet de Laureles', true, $3), ($1, $4, 'Celular sin sede', true, NULL)`,
      [A.id, aparatoLau, LAU, aparatoSinSede]
    )
  })

  async function premio(customerId: string): Promise<string> {
    const { rows } = await db().query<{ id: string }>(
      `INSERT INTO reward_grants (tenant_id, customer_id, grant_type, source, prize_title, status)
       VALUES ($1, $2, 'campaign_prize', 'manual', 'Postre de la casa', 'active') RETURNING id`,
      [A.id, customerId]
    )
    return rows[0].id
  }

  async function canjear(opts: { host: string; aparato: string; mesero: string; customerId: string; grantId: string }) {
    const { POST } = await import('@/app/api/reward-redeem/route')
    const req = new Request('https://x/api/reward-redeem', {
      method: 'POST',
      headers: { host: opts.host, 'x-device-token': opts.aparato, 'content-type': 'application/json' },
      body: JSON.stringify({
        customer_id: opts.customerId,
        grant_id: opts.grantId,
        prize_title: 'Postre de la casa',
        source: 'campaign_reward',
        redeemed_by_staff_id: opts.mesero,
      }),
    })
    const res = await POST(req as never)
    return { status: res.status, body: (await res.json()) as { redemption?: { id: string }; message?: string } }
  }

  const sedeDelCanje = async (grantId: string) =>
    (await db().query<{ redeemed_location_id: string | null }>(`SELECT redeemed_location_id FROM reward_redemptions WHERE grant_id = $1`, [grantId]))
      .rows[0]?.redeemed_location_id

  it('un cliente registrado en Envigado suma puntos y canjea en Laureles: el canje dice Laureles', async () => {
    // Los puntos son de la marca: suman igual en las dos sedes; la transacción solo ATRIBUYE.
    const { awardPoints } = await import('@/services/points.service')
    const antes = (await db().query<{ total_points: number }>(`SELECT total_points FROM customers WHERE id = $1`, [c.e1])).rows[0].total_points
    const enLaureles = await awardPoints({ customerId: c.e1, points: 10, source: 'visit_staff', tenantId: A.id, locationId: LAU })
    const enEnvigado = await awardPoints({ customerId: c.e1, points: 5, source: 'visit_staff', tenantId: A.id, locationId: ENV })
    expect(enLaureles.newBalance).toBe(antes + 10)
    expect(enEnvigado.newBalance).toBe(antes + 15)
    const tx = await db().query<{ location_id: string }>(
      `SELECT location_id FROM point_transactions WHERE customer_id = $1 ORDER BY created_at, points DESC`,
      [c.e1]
    )
    expect(tx.rows.map((r) => r.location_id)).toEqual([LAU, ENV])

    // El canje: la mesera de Laureles, con la tablet de Laureles, en el enlace de Laureles.
    const grant = await premio(c.e1)
    const r = await canjear({ host: dominioLau, aparato: aparatoLau, mesero: meseroLau, customerId: c.e1, grantId: grant })
    expect(r.status).toBe(201)
    expect(await sedeDelCanje(grant)).toBe(LAU)
    const estado = await db().query<{ status: string }>(`SELECT status FROM reward_grants WHERE id = $1`, [grant])
    expect(estado.rows[0].status).toBe('redeemed')
  })

  it('un rotativo en el enlace general de la marca: la sede sale del APARATO (Laureles)', async () => {
    const grant = await premio(c.e2)
    const r = await canjear({ host: dominioA, aparato: aparatoLau, mesero: rotativo, customerId: c.e2, grantId: grant })
    expect(r.status).toBe(201)
    expect(await sedeDelCanje(grant)).toBe(LAU)
  })

  it('el mesero de una sede gana sobre el host de la otra (misma precedencia que el check-in)', async () => {
    const grant = await premio(c.e3)
    const r = await canjear({ host: dominioEnv, aparato: aparatoSinSede, mesero: meseroLau, customerId: c.e3, grantId: grant })
    expect(r.status).toBe(201)
    expect(await sedeDelCanje(grant)).toBe(LAU)
  })

  it('sin ninguna señal (rotativo, aparato sin sede, enlace general con dos sedes): NULL, nunca adivinada', async () => {
    const grant = await premio(c.s1)
    const r = await canjear({ host: dominioA, aparato: aparatoSinSede, mesero: rotativo, customerId: c.s1, grantId: grant })
    expect(r.status).toBe(201)
    expect(await sedeDelCanje(grant)).toBeNull()
  })

  it('«Tus sedes» cuenta los premios entregados donde se entregaron (y el sin sede, aparte)', async () => {
    await usuarioDelPanel(A, 'brand')
    const { body } = await analitica()
    expect(deSede(body, LAU).premiosEntregados).toBe(3)
    expect(deSede(body, ENV).premiosEntregados).toBe(0)
    expect(body.sedes!.sinSede!.premiosEntregados).toBe(1)
  })
})
