/**
 * 00065 — `staff_activity_report()`: rendimiento del equipo contra un Postgres DE VERDAD.
 *
 * Migración bajo prueba: `00065_staff_activity_report.sql` (la aplica el globalSetup)
 * Feature: `docs/features/staff-activity.md`
 *
 * QUÉ SE VIGILA
 * ─────────────
 *   1. «Nuevo» vs «frecuente» se decide por la HISTORIA del cliente: una visita `qr` de
 *      hace un mes convierte el escaneo de hoy en «frecuente»; el segundo escaneo del mismo
 *      cliente en el rango también es «frecuente». Ningún flag, ningún `total_visits`.
 *   2. Ningún NULL se esconde: escaneo sin mesero → fila `staff_id NULL`; sin mesa → fila
 *      `table_number NULL`; y los dos se cuentan en los totales.
 *   3. Un mesero con premios entregados y cero escaneos aparece igual (UNION, no JOIN).
 *   4. El alcance de sede calca `applyLocationFilter()` rama por rama, incluido el cubo
 *      NULL solo y el «nada» de `[]` sin NULL.
 *   5. Otra marca es invisible aunque tenga escaneos en el mismo rango.
 *   6. `anon` y `authenticated` NO pueden ejecutarla; `service_role` sí.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'

const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.replace(/[^a-z0-9]/g, '')

let telSeq = 0
function tel(): string {
  telSeq += 1
  return `3${String(telSeq).padStart(3, '0')}${SUFIJO}`.replace(/\D/g, '').slice(0, 10).padEnd(10, '0')
}

interface Reporte {
  totals: {
    scans: number
    new_customers: number
    returning_customers: number
    distinct_customers: number
    redemptions: number
    scans_without_staff: number
    scans_without_table: number
  }
  by_staff: Array<{
    staff_id: string | null
    staff_name: string | null
    staff_is_active: boolean | null
    scans: number
    new_customers: number
    returning_customers: number
    distinct_customers: number
    redemptions: number
    last_scan_at: string | null
  }>
  by_table: Array<{
    table_number: number | null
    scans: number
    new_customers: number
    distinct_customers: number
    redemptions: number
  }>
}

/** El rango bajo prueba: «los últimos 7 días». Lo de hace 30 queda fuera a propósito. */
const DESDE = new Date(Date.now() - 7 * 86_400_000).toISOString()
const HASTA = new Date(Date.now() + 60_000).toISOString()
const HACE_30_DIAS = new Date(Date.now() - 30 * 86_400_000).toISOString()
const HACE_2_DIAS = new Date(Date.now() - 2 * 86_400_000).toISOString()
const HACE_1_DIA = new Date(Date.now() - 1 * 86_400_000).toISOString()

async function reporte(
  tenantId: string,
  sedes: string[] | null = null,
  incluirSinSede = true
): Promise<Reporte> {
  const { rows } = await getPool().query<{ r: Reporte }>(
    `SELECT staff_activity_report($1, $2, $3, $4, $5) AS r`,
    [tenantId, DESDE, HASTA, sedes, incluirSinSede]
  )
  return rows[0].r
}

async function crearSede(tenantId: string, name: string, slug: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO restaurant_locations (tenant_id, name, slug, is_primary, sort_order, is_active)
     VALUES ($1, $2, $3, false, 0, true) RETURNING id`,
    [tenantId, name, slug]
  )
  return rows[0].id
}

/** `tenant_id` EXPLÍCITO siempre: la 00030 nunca se aplicó y el DEFAULT puente manda a Sushi Service. */
async function crearMesero(tenantId: string, name: string, locationId: string | null, activo = true): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO staff_users (tenant_id, name, phone, role, location_id, is_active)
     VALUES ($1, $2, $3, 'waiter', $4, $5) RETURNING id`,
    [tenantId, name, tel(), locationId, activo]
  )
  return rows[0].id
}

async function crearCliente(tenantId: string, name: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO customers (tenant_id, phone, name) VALUES ($1, $2, $3) RETURNING id`,
    [tenantId, tel(), name]
  )
  return rows[0].id
}

async function visita(opts: {
  tenantId: string
  customerId: string
  source: 'qr' | 'staff_scan' | 'delivery'
  staffId?: string | null
  mesa?: number | null
  sede?: string | null
  cuando: string
}): Promise<void> {
  await getPool().query(
    `INSERT INTO visits (tenant_id, customer_id, source, registered_by_staff_id, table_number,
                         location_id, location_source, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      opts.tenantId,
      opts.customerId,
      opts.source,
      opts.staffId ?? null,
      opts.mesa ?? null,
      opts.sede ?? null,
      opts.sede ? 'host' : null,
      opts.cuando,
    ]
  )
}

async function entrega(opts: {
  tenantId: string
  customerId: string
  staffId: string | null
  mesa: number | null
  sede: string | null
  cuando: string
}): Promise<void> {
  // `staff_override` es el único origen exento de ancla (grant/mystery box): es el
  // registro manual del mesero, y acá solo importa QUIÉN y DÓNDE entregó.
  await getPool().query(
    `INSERT INTO reward_redemptions (tenant_id, customer_id, prize_title, source, redeemed_by_staff_id,
                                     table_number, redeemed_location_id, redeemed_at)
     VALUES ($1, $2, 'Postre de prueba', 'staff_override', $3, $4, $5, $6)`,
    [opts.tenantId, opts.customerId, opts.staffId, opts.mesa, opts.sede, opts.cuando]
  )
}

let marcaA: TestTenant
let marcaB: TestTenant
let sedeA1: string
let sedeA2: string
let meseroM1: string // sede A1, escanea 2 y entrega 2
let meseroM2: string // sede A2, escanea 2 (al mismo cliente) y no entrega nada
let meseroM3: string // sin escaneos, entrega 1 sin sede; inactivo
let meseroB: string

beforeAll(async () => {
  marcaA = await createTestTenant()
  marcaB = await createTestTenant()
  sedeA1 = await crearSede(marcaA.id, 'Sede A1', `a1-${SUFIJO}`)
  sedeA2 = await crearSede(marcaA.id, 'Sede A2', `a2-${SUFIJO}`)
  meseroM1 = await crearMesero(marcaA.id, 'Mesero Uno', sedeA1)
  meseroM2 = await crearMesero(marcaA.id, 'Mesero Dos', sedeA2)
  meseroM3 = await crearMesero(marcaA.id, 'Mesero Tres', null, false)
  meseroB = await crearMesero(marcaB.id, 'Mesero de B', null)

  // C1: NUEVO — su primera visita es el escaneo de M1 en la mesa 5 (sede A1).
  const c1 = await crearCliente(marcaA.id, 'C1 nuevo')
  await visita({ tenantId: marcaA.id, customerId: c1, source: 'staff_scan', staffId: meseroM1, mesa: 5, sede: sedeA1, cuando: HACE_2_DIAS })

  // C2: FRECUENTE — se registró por el QR público hace 30 días (fuera del rango);
  // M1 lo escanea en la mesa 7. Para el mesero es un cliente que ya venía.
  const c2 = await crearCliente(marcaA.id, 'C2 frecuente')
  await visita({ tenantId: marcaA.id, customerId: c2, source: 'qr', cuando: HACE_30_DIAS })
  await visita({ tenantId: marcaA.id, customerId: c2, source: 'staff_scan', staffId: meseroM1, mesa: 7, sede: sedeA1, cuando: HACE_1_DIA })

  // C3: dos escaneos de M2 en el rango: el primero (mesa 5) es NUEVO, el segundo (sin mesa) FRECUENTE.
  const c3 = await crearCliente(marcaA.id, 'C3 dos veces')
  await visita({ tenantId: marcaA.id, customerId: c3, source: 'staff_scan', staffId: meseroM2, mesa: 5, sede: sedeA2, cuando: HACE_2_DIAS })
  await visita({ tenantId: marcaA.id, customerId: c3, source: 'staff_scan', staffId: meseroM2, mesa: null, sede: sedeA2, cuando: HACE_1_DIA })

  // C4: NUEVO, escaneado por un APARATO sin mesero, sin mesa y sin sede. Se muestra.
  const c4 = await crearCliente(marcaA.id, 'C4 sin mesero')
  await visita({ tenantId: marcaA.id, customerId: c4, source: 'staff_scan', staffId: null, mesa: null, sede: null, cuando: HACE_1_DIA })

  // Un escaneo de M1 hace 30 días: fuera del rango, no cuenta. Y un domicilio en el rango:
  // no es un escaneo, no cuenta.
  const c5 = await crearCliente(marcaA.id, 'C5 viejo')
  await visita({ tenantId: marcaA.id, customerId: c5, source: 'staff_scan', staffId: meseroM1, mesa: 3, sede: sedeA1, cuando: HACE_30_DIAS })
  await visita({ tenantId: marcaA.id, customerId: c5, source: 'delivery', cuando: HACE_1_DIA })

  // Premios: M1 entrega dos en la mesa 5 (sede A1); M3 —sin escaneos e inactivo— entrega
  // uno sin sede ni mesa. Uno de hace 30 días queda fuera.
  await entrega({ tenantId: marcaA.id, customerId: c1, staffId: meseroM1, mesa: 5, sede: sedeA1, cuando: HACE_2_DIAS })
  await entrega({ tenantId: marcaA.id, customerId: c2, staffId: meseroM1, mesa: 5, sede: sedeA1, cuando: HACE_1_DIA })
  await entrega({ tenantId: marcaA.id, customerId: c3, staffId: meseroM3, mesa: null, sede: null, cuando: HACE_1_DIA })
  await entrega({ tenantId: marcaA.id, customerId: c5, staffId: meseroM1, mesa: 3, sede: sedeA1, cuando: HACE_30_DIAS })

  // Marca B: un escaneo y una entrega en el rango. Para A no existen.
  const cb = await crearCliente(marcaB.id, 'Cliente de B')
  await visita({ tenantId: marcaB.id, customerId: cb, source: 'staff_scan', staffId: meseroB, mesa: 5, cuando: HACE_1_DIA })
  await entrega({ tenantId: marcaB.id, customerId: cb, staffId: meseroB, mesa: 5, sede: null, cuando: HACE_1_DIA })
})

afterAll(async () => {
  const db = getPool()
  const marcas = [[marcaA.id, marcaB.id]]
  // ORDEN OBLIGATORIO: las columnas de sede son ON DELETE RESTRICT.
  await db.query('DELETE FROM reward_redemptions WHERE tenant_id = ANY($1)', marcas)
  await db.query('DELETE FROM visits WHERE tenant_id = ANY($1)', marcas)
  await db.query('DELETE FROM staff_users WHERE tenant_id = ANY($1)', marcas)
  await db.query('DELETE FROM restaurant_locations WHERE tenant_id = ANY($1)', marcas)
  await dropTestTenant(marcaA.id)
  await dropTestTenant(marcaB.id)
  await closePool()
})

function fila<T extends { staff_id?: string | null; table_number?: number | null }>(
  lista: T[],
  pred: (x: T) => boolean
): T {
  const f = lista.find(pred)
  if (!f) throw new Error(`fila no encontrada en ${JSON.stringify(lista)}`)
  return f
}

describe('staff_activity_report() — totales de la marca', () => {
  it('cuenta solo los escaneos del rango y decide nuevo/frecuente por la historia', async () => {
    const r = await reporte(marcaA.id)
    // C1, C2, C3×2, C4 = 5. El de C5 hace 30 días y el domicilio quedan fuera.
    expect(r.totals.scans).toBe(5)
    // Nuevos: C1, el primer C3, C4. Frecuentes: C2 (venía por QR) y el segundo C3.
    expect(r.totals.new_customers).toBe(3)
    expect(r.totals.returning_customers).toBe(2)
    expect(r.totals.distinct_customers).toBe(4)
    // Premios: M1×2 + M3×1. El de hace 30 días, fuera.
    expect(r.totals.redemptions).toBe(3)
    expect(r.totals.scans_without_staff).toBe(1)
    expect(r.totals.scans_without_table).toBe(2)
  })

  it('no ve nada de otra marca, y la otra marca ve lo suyo', async () => {
    const a = await reporte(marcaA.id)
    expect(a.by_staff.some((s) => s.staff_id === meseroB)).toBe(false)
    const b = await reporte(marcaB.id)
    expect(b.totals.scans).toBe(1)
    expect(b.totals.redemptions).toBe(1)
    expect(b.by_staff).toHaveLength(1)
    expect(b.by_staff[0].staff_id).toBe(meseroB)
  })
})

describe('staff_activity_report() — por mesero', () => {
  it('cada mesero con sus escaneos, nuevos, frecuentes y premios; nombre y estado por LEFT JOIN', async () => {
    const r = await reporte(marcaA.id)
    const m1 = fila(r.by_staff, (s) => s.staff_id === meseroM1)
    expect(m1).toMatchObject({
      staff_name: 'Mesero Uno',
      staff_is_active: true,
      scans: 2,
      new_customers: 1,
      returning_customers: 1,
      distinct_customers: 2,
      redemptions: 2,
    })
    expect(m1.last_scan_at).not.toBeNull()

    const m2 = fila(r.by_staff, (s) => s.staff_id === meseroM2)
    expect(m2).toMatchObject({ scans: 2, new_customers: 1, returning_customers: 1, distinct_customers: 1, redemptions: 0 })
  })

  it('un mesero con premios y cero escaneos aparece igual (y su estado inactivo también)', async () => {
    const r = await reporte(marcaA.id)
    const m3 = fila(r.by_staff, (s) => s.staff_id === meseroM3)
    expect(m3).toMatchObject({ staff_name: 'Mesero Tres', staff_is_active: false, scans: 0, redemptions: 1 })
    expect(m3.last_scan_at).toBeNull()
  })

  it('el escaneo sin mesero es una fila propia, no se reparte ni se esconde', async () => {
    const r = await reporte(marcaA.id)
    const sinMesero = fila(r.by_staff, (s) => s.staff_id === null)
    expect(sinMesero).toMatchObject({ staff_name: null, scans: 1, new_customers: 1, redemptions: 0 })
  })

  it('viene ordenado por escaneos de mayor a menor', async () => {
    const r = await reporte(marcaA.id)
    const escaneos = r.by_staff.map((s) => s.scans)
    expect(escaneos).toEqual([...escaneos].sort((a, b) => b - a))
  })
})

describe('staff_activity_report() — por mesa', () => {
  it('la mesa 5 concentra dos escaneos (dos clientes) y dos premios; la 7 uno; sin mesa dos', async () => {
    const r = await reporte(marcaA.id)
    expect(fila(r.by_table, (t) => t.table_number === 5)).toMatchObject({
      scans: 2,
      distinct_customers: 2,
      new_customers: 2,
      redemptions: 2,
    })
    expect(fila(r.by_table, (t) => t.table_number === 7)).toMatchObject({ scans: 1, redemptions: 0 })
    // C3 (segundo escaneo) y C4; más el premio de M3 sin mesa.
    expect(fila(r.by_table, (t) => t.table_number === null)).toMatchObject({ scans: 2, redemptions: 1 })
    // La mesa 3 solo tiene actividad hace 30 días: no aparece.
    expect(r.by_table.some((t) => t.table_number === 3)).toBe(false)
  })
})

describe('staff_activity_report() — alcance de sede (calca applyLocationFilter)', () => {
  it('NULL = marca entera, incluido el cubo sin sede', async () => {
    const r = await reporte(marcaA.id, null, true)
    expect(r.totals.scans).toBe(5)
    expect(r.totals.redemptions).toBe(3)
  })

  it('una sede = solo lo suyo; el cubo NULL no entra aunque se pida', async () => {
    const r = await reporte(marcaA.id, [sedeA1], false)
    expect(r.totals.scans).toBe(2) // C1 y C2, los de M1
    expect(r.totals.redemptions).toBe(2) // los de M1 en A1; el de M3 (sin sede) no
    expect(r.by_staff.map((s) => s.staff_id)).toEqual([meseroM1])
    expect(r.by_staff.some((s) => s.staff_id === null)).toBe(false)
    // Mesa 5 desde la sede A1: un escaneo (C1) y dos premios.
    expect(fila(r.by_table, (t) => t.table_number === 5)).toMatchObject({ scans: 1, redemptions: 2 })
  })

  it('dos sedes = la suma de las dos, sin el cubo NULL', async () => {
    const r = await reporte(marcaA.id, [sedeA1, sedeA2], false)
    expect(r.totals.scans).toBe(4)
    expect(r.totals.scans_without_staff).toBe(0)
    expect(r.totals.redemptions).toBe(2)
  })

  it('[] + sin sede = solo el cubo NULL («sede desconocida»)', async () => {
    const r = await reporte(marcaA.id, [], true)
    expect(r.totals.scans).toBe(1) // C4
    expect(r.totals.redemptions).toBe(1) // el de M3
    expect(r.by_staff.map((s) => s.staff_id).sort()).toEqual([meseroM3, null].sort())
  })

  it('[] sin el cubo NULL = nada, como un .in(col, [])', async () => {
    const r = await reporte(marcaA.id, [], false)
    expect(r.totals.scans).toBe(0)
    expect(r.totals.redemptions).toBe(0)
    expect(r.by_staff).toEqual([])
    expect(r.by_table).toEqual([])
  })
})

describe('staff_activity_report() — quién puede llamarla', () => {
  it('service_role sí; anon y authenticated no', async () => {
    const firma = 'staff_activity_report(uuid, timestamptz, timestamptz, uuid[], boolean)'
    const { rows } = await getPool().query<{ rol: string; puede: boolean }>(
      `SELECT rol, has_function_privilege(rol, $1, 'EXECUTE') AS puede
         FROM unnest(ARRAY['service_role', 'anon', 'authenticated']) AS rol`,
      [firma]
    )
    const porRol = Object.fromEntries(rows.map((r) => [r.rol, r.puede]))
    expect(porRol).toEqual({ service_role: true, anon: false, authenticated: false })
  })
})
