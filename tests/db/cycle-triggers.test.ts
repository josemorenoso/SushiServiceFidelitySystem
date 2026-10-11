/**
 * Ciclo de recuperación, fase 1A — la migración 00070 contra Postgres de verdad.
 *
 * Lo que se fija:
 *   1. La visita reinicia el ciclo (`cycle_no + 1`, desde la visita, 0 toques, activo),
 *      también la PRIMERA de quien se registró sin visita; el alta con visita nace en el
 *      ciclo 1; un UPDATE que no mueve `last_visit_at` hacia adelante no reinicia nada.
 *   2. El ritmo personal en SQL es IDÉNTICO al de `cycle-engine.ts` para los mismos
 *      historiales (Don Alirio incluido, los cortes, las medianas fraccionarias, dos
 *      escaneos el mismo día, la medianoche de Bogotá), y el dato del ritmo de la marca.
 *   3. La atribución: a 14 días sí, a 15 no, también a un `holdout`, solo al último toque
 *      y nunca a uno que falló.
 *   4. La fatiga: el sexto mensaje de manual, calendario o ciclo duerme al cliente; el
 *      recordatorio de premio, el cumpleaños y los fallidos no cuentan.
 *   5. El UNIQUE del toque con 8 inserciones concurrentes: gana una.
 *   6. El backfill (más de 90 días → dormido, sin tocar `cycle_touches`), ejecutado tal
 *      cual está en la migración.
 *   7. RLS: una marca no ve los toques de otra; y las guardas de la tabla.
 *
 * Cómo se simula una visita: igual que `incrementVisit()` + `createVisit()` — primero el
 * UPDATE de `customers` (dispara el trigger), DESPUÉS el INSERT en `visits`.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { PoolClient } from 'pg'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import { medianGap, personalRhythm, brandRhythm } from '@/lib/cycle-engine'

const DIA = 24 * 60 * 60 * 1000
const T = new Date('2026-09-30T21:00:00Z') // «hoy» de las pruebas deterministas
const antes = (dias: number, desde: Date = T) => new Date(desde.getTime() - dias * DIA)

let telefono = 0
const nuevoTelefono = () => `300${String(++telefono).padStart(7, '0')}`

interface ClienteCiclo {
  cycle_no: number
  cycle_started_at: Date | null
  cycle_touches: number
  cycle_state: string
  dormant_since: Date | null
  cycle_rhythm: string | null
  heartbeats_sent: number
}

async function nuevoCliente(
  tenantId: string,
  opts: { ultimaVisita?: Date | null; creado?: Date; visitas?: number } = {}
): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO customers (tenant_id, phone, name, last_visit_at, total_visits, created_at)
     VALUES ($1, $2, 'Cliente ciclo', $3, $4, COALESCE($5::timestamptz, now()))
     RETURNING id`,
    [tenantId, nuevoTelefono(), opts.ultimaVisita ?? null, opts.visitas ?? (opts.ultimaVisita ? 1 : 0), opts.creado ?? null]
  )
  return rows[0].id
}

/**
 * Escribe en `customers` y DESPUÉS en `visits` dentro de una transacción.
 *
 * Por el arnés, no por el producto: `ola0-seguridad.test.ts` pega la 00015 (DDL sobre
 * `customers` y luego sobre `visits`) mientras este archivo corre en otro proceso. Un
 * `INSERT INTO visits` suelto tiene `visits` y pide `customers` para su FK — el orden
 * inverso — y Postgres mata a uno de los dos por deadlock. Tomando `customers` primero,
 * el que llega segundo espera en vez de cruzarse.
 */
async function enOrden(fn: (db: PoolClient) => Promise<void>): Promise<void> {
  const db = await getPool().connect()
  try {
    await db.query('BEGIN')
    await fn(db)
    await db.query('COMMIT')
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    db.release()
  }
}

const insertarVisita = (db: PoolClient, tenantId: string, customerId: string, cuando: Date) =>
  db.query(`INSERT INTO visits (tenant_id, customer_id, source, created_at) VALUES ($1, $2, 'qr', $3)`, [
    tenantId,
    customerId,
    cuando,
  ])

/** `incrementVisit()` y después `createVisit()`, en ese orden. */
async function visita(tenantId: string, customerId: string, cuando: Date): Promise<void> {
  await enOrden(async (db) => {
    await db.query(`UPDATE customers SET total_visits = total_visits + 1, last_visit_at = $2 WHERE id = $1`, [
      customerId,
      cuando,
    ])
    await insertarVisita(db, tenantId, customerId, cuando)
  })
}

/** La fila de `visits` de una visita cuyo `last_visit_at` ya está escrito (el alta). */
async function soloLaFilaDeVisita(tenantId: string, customerId: string, cuando: Date): Promise<void> {
  await enOrden(async (db) => {
    await db.query('SELECT 1 FROM customers WHERE id = $1 FOR KEY SHARE', [customerId])
    await insertarVisita(db, tenantId, customerId, cuando)
  })
}

/** Una consulta que lee `visits` antes que `customers`, con `customers` tomada primero. */
async function consultarEnOrden<R extends object>(
  sql: string,
  params: unknown[] = [],
  modo: 'ACCESS SHARE' | 'ROW EXCLUSIVE' = 'ACCESS SHARE'
): Promise<R[]> {
  let filas: R[] = []
  await enOrden(async (db) => {
    await db.query(`LOCK TABLE customers IN ${modo} MODE`)
    filas = (await db.query(sql, params)).rows as R[]
  })
  return filas
}

/** Un cliente que se registra con su primera visita y después vuelve en cada instante. */
async function clienteConHistorial(tenantId: string, instantes: Date[]): Promise<string> {
  const id = await nuevoCliente(tenantId, { ultimaVisita: instantes[0] })
  await soloLaFilaDeVisita(tenantId, id, instantes[0])
  for (const cuando of instantes.slice(1)) await visita(tenantId, id, cuando)
  return id
}

async function ciclo(customerId: string): Promise<ClienteCiclo> {
  const { rows } = await getPool().query<ClienteCiclo>(
    `SELECT cycle_no, cycle_started_at, cycle_touches, cycle_state, dormant_since, cycle_rhythm, heartbeats_sent
       FROM customers WHERE id = $1`,
    [customerId]
  )
  return rows[0]
}

async function toque(
  tenantId: string,
  customerId: string,
  t: { cycleNo?: number; stage: string; seq?: number; status: string; holdout?: boolean; dueAt: Date }
): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO customer_cycle_touches (tenant_id, customer_id, cycle_no, stage, seq, status, holdout, due_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [tenantId, customerId, t.cycleNo ?? 1, t.stage, t.seq ?? 1, t.status, t.holdout ?? false, t.dueAt]
  )
  return rows[0].id
}

async function volvio(toqueId: string): Promise<boolean> {
  const { rows } = await getPool().query<{ returned_at: Date | null }>(
    'SELECT returned_at FROM customer_cycle_touches WHERE id = $1',
    [toqueId]
  )
  return rows[0].returned_at !== null
}

async function campana(tenantId: string, source: string, type: string = source): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO campaigns (name, type, source, message_template, status, tenant_id)
     VALUES ('Prueba del ciclo', $1, $2, 'HX_test', 'completed', $3) RETURNING id`,
    [type, source, tenantId]
  )
  return rows[0].id
}

async function mensaje(tenantId: string, campaignId: string, customerId: string, status = 'sent'): Promise<void> {
  await getPool().query(
    `INSERT INTO campaign_messages (campaign_id, customer_id, status, sent_at, tenant_id)
     VALUES ($1, $2, $3, now(), $4)`,
    [campaignId, customerId, status, tenantId]
  )
}

async function limpiar(t: TestTenant): Promise<void> {
  const db = getPool()
  await db.query('DELETE FROM customer_cycle_touches WHERE tenant_id = $1', [t.id])
  await db.query('DELETE FROM restaurant_locations WHERE tenant_id = $1', [t.id])
  await dropTestTenant(t.id)
}

let tenant: TestTenant

beforeAll(async () => {
  tenant = await createTestTenant()
})

afterAll(async () => {
  await limpiar(tenant)
  await closePool()
})

// ═══════════════════════════════════════════════════════════════
// 1. Reinicio
// ═══════════════════════════════════════════════════════════════

describe('la visita reinicia el ciclo', () => {
  it('cycle_no + 1, desde la visita, 0 toques, activo, sin dormant_since', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(100) })
    await getPool().query(
      `UPDATE customers SET cycle_touches = 4, cycle_state = 'dormido', dormant_since = $2, heartbeats_sent = 1
        WHERE id = $1`,
      [id, antes(10)]
    )
    expect((await ciclo(id)).cycle_no).toBe(1) // ese UPDATE no movió last_visit_at

    await visita(tenant.id, id, T)
    const c = await ciclo(id)
    expect(c.cycle_no).toBe(2)
    expect(c.cycle_started_at?.toISOString()).toBe(T.toISOString())
    expect(c.cycle_touches).toBe(0)
    expect(c.cycle_state).toBe('activo')
    expect(c.dormant_since).toBeNull()
    expect(c.heartbeats_sent).toBe(0)
  })

  it('el alta con visita (countFirst) nace en el ciclo 1, desde esa visita y sin ritmo', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(3) })
    const c = await ciclo(id)
    expect(c.cycle_no).toBe(1)
    expect(c.cycle_started_at?.toISOString()).toBe(antes(3).toISOString())
    expect(c.cycle_state).toBe('activo')
    expect(c.cycle_rhythm).toBeNull()
  })

  it('quien se registró sin visita (invitación) empieza en el alta y su PRIMERA visita abre ciclo', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: null, creado: antes(20) })
    expect((await ciclo(id)).cycle_started_at?.toISOString()).toBe(antes(20).toISOString())

    await visita(tenant.id, id, antes(2))
    const c = await ciclo(id)
    expect(c.cycle_no).toBe(2)
    expect(c.cycle_started_at?.toISOString()).toBe(antes(2).toISOString())
  })

  it('un last_visit_at igual o anterior no reinicia nada', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(5) })
    await getPool().query('UPDATE customers SET last_visit_at = $2 WHERE id = $1', [id, antes(5)])
    await getPool().query('UPDATE customers SET last_visit_at = $2 WHERE id = $1', [id, antes(9)])
    expect((await ciclo(id)).cycle_no).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. El ritmo personal: SQL igual a TS
// ═══════════════════════════════════════════════════════════════

/** Instantes a las 10 a. m. de Bogotá, separados por los huecos dados. */
function conHuecos(inicio: string, huecos: number[]): Date[] {
  const primero = new Date(`${inicio}T15:00:00Z`)
  const out = [primero]
  for (const h of huecos) out.push(new Date(out[out.length - 1].getTime() + h * DIA))
  return out
}

const HISTORIALES: Array<{ nombre: string; instantes: Date[]; esperado: string | null }> = [
  { nombre: 'Don Alirio: cada 2 o 3 días', instantes: conHuecos('2026-08-03', [2, 3, 2, 3, 2, 2]), esperado: 'cafe' },
  { nombre: 'casual: 10, 14, 12', instantes: conHuecos('2026-05-04', [10, 14, 12]), esperado: 'casual' },
  { nombre: 'restaurante: 25, 30, 28', instantes: conHuecos('2026-03-02', [25, 30, 28]), esperado: 'restaurant' },
  { nombre: 'ocasiones: 40, 50', instantes: conHuecos('2026-01-05', [40, 50]), esperado: 'occasional' },
  { nombre: 'corte 8', instantes: conHuecos('2026-07-01', [8, 8]), esperado: 'cafe' },
  { nombre: 'corte 9', instantes: conHuecos('2026-07-01', [9, 9]), esperado: 'casual' },
  { nombre: 'corte 19', instantes: conHuecos('2026-06-01', [19, 19]), esperado: 'restaurant' },
  { nombre: 'corte 35', instantes: conHuecos('2026-04-01', [35, 35]), esperado: 'restaurant' },
  { nombre: 'corte 36', instantes: conHuecos('2026-04-01', [36, 36]), esperado: 'occasional' },
  { nombre: 'mediana 18,5', instantes: conHuecos('2026-06-01', [18, 19]), esperado: 'casual' },
  { nombre: 'mediana 35,5', instantes: conHuecos('2026-03-01', [35, 36]), esperado: 'occasional' },
  {
    nombre: 'dos escaneos el mismo día cuentan como uno (3 escaneos, 2 días)',
    instantes: [new Date('2026-09-01T14:00:00Z'), new Date('2026-09-01T22:00:00Z'), new Date('2026-09-06T15:00:00Z')],
    esperado: null,
  },
  {
    nombre: 'dos escaneos el mismo día + otros dos días',
    instantes: [
      new Date('2026-09-01T14:00:00Z'),
      new Date('2026-09-01T22:00:00Z'),
      new Date('2026-09-05T15:00:00Z'),
      new Date('2026-09-11T15:00:00Z'),
    ],
    esperado: 'cafe',
  },
  {
    nombre: 'medianoche de Bogotá: 23:30 y 00:30 son dos días',
    instantes: [new Date('2026-10-02T04:30:00Z'), new Date('2026-10-02T05:30:00Z'), new Date('2026-10-03T05:30:00Z')],
    esperado: 'cafe',
  },
  { nombre: 'solo dos días', instantes: conHuecos('2026-08-01', [12]), esperado: null },
]

describe('el ritmo personal en SQL es el mismo que en cycle-engine.ts', () => {
  for (const h of HISTORIALES) {
    it(h.nombre, async () => {
      expect(personalRhythm(h.instantes), 'el TS no dice lo que espera la prueba').toBe(h.esperado)

      const id = await clienteConHistorial(tenant.id, h.instantes)
      expect((await ciclo(id)).cycle_rhythm).toBe(personalRhythm(h.instantes))

      const { rows } = await getPool().query<{ m: number | null }>('SELECT cycle_customer_median_gap($1) AS m', [id])
      expect(rows[0].m).toBe(medianGap(h.instantes))
    })
  }

  it('el ritmo se fija al abrir el ciclo contando la visita que todavía no está en visits', async () => {
    // Dos días en `visits` + el tercero solo en `last_visit_at`: ya alcanza.
    const [a, b, c] = conHuecos('2026-08-10', [3, 3])
    const id = await nuevoCliente(tenant.id, { ultimaVisita: a })
    await soloLaFilaDeVisita(tenant.id, id, a)
    await visita(tenant.id, id, b)
    expect((await ciclo(id)).cycle_rhythm).toBeNull()
    await getPool().query('UPDATE customers SET last_visit_at = $2 WHERE id = $1', [id, c]) // sin la fila de visits
    expect((await ciclo(id)).cycle_rhythm).toBe('cafe')
  })
})

describe('el dato del ritmo de la marca', () => {
  it('mediana de TODOS los huecos de la marca y cuántos regresos hay', async () => {
    const marca = await createTestTenant()
    try {
      await clienteConHistorial(marca.id, conHuecos('2026-08-03', [2, 3, 2])) // huecos 2, 3, 2
      await clienteConHistorial(marca.id, conHuecos('2026-07-01', [20])) // hueco 20
      await clienteConHistorial(marca.id, conHuecos('2026-07-01', [])) // sin regreso
      const rows = await consultarEnOrden<{ median_gap_days: number; returns_count: number }>(
        'SELECT * FROM cycle_brand_rhythm_stats($1)',
        [marca.id]
      )
      expect(rows[0]).toEqual({ median_gap_days: 2.5, returns_count: 4 })
      // Con 4 regresos no alcanza para decidir: restaurante.
      expect(brandRhythm({ mediana: rows[0].median_gap_days, regresos: rows[0].returns_count })).toBe('restaurant')
    } finally {
      await limpiar(marca)
    }
  })

  it('una marca sin visitas devuelve mediana NULL y 0 regresos', async () => {
    const marca = await createTestTenant()
    try {
      const rows = await consultarEnOrden('SELECT * FROM cycle_brand_rhythm_stats($1)', [marca.id])
      expect(rows[0]).toEqual({ median_gap_days: null, returns_count: 0 })
    } finally {
      await limpiar(marca)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. Atribución a 14 días
// ═══════════════════════════════════════════════════════════════

describe('la atribución del regreso', () => {
  it('un toque que le tocaba hace 14 días se lleva el regreso', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(40) })
    const t = await toque(tenant.id, id, { stage: 't2', status: 'sent', dueAt: antes(14) })
    await visita(tenant.id, id, T)
    expect(await volvio(t)).toBe(true)
  })

  it('uno de hace 15 días, no', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(40) })
    const t = await toque(tenant.id, id, { stage: 't2', status: 'sent', dueAt: antes(15) })
    await visita(tenant.id, id, T)
    expect(await volvio(t)).toBe(false)
  })

  it('el grupo de control también se atribuye (a 14 sí, a 15 no)', async () => {
    const a = await nuevoCliente(tenant.id, { ultimaVisita: antes(40) })
    const tA = await toque(tenant.id, a, { stage: 't4', status: 'holdout', holdout: true, dueAt: antes(14) })
    const b = await nuevoCliente(tenant.id, { ultimaVisita: antes(40) })
    const tB = await toque(tenant.id, b, { stage: 't4', status: 'holdout', holdout: true, dueAt: antes(15) })
    await visita(tenant.id, a, T)
    await visita(tenant.id, b, T)
    expect(await volvio(tA)).toBe(true)
    expect(await volvio(tB)).toBe(false)
  })

  it('solo el ÚLTIMO toque del ciclo que se cierra', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(40) })
    const t1 = await toque(tenant.id, id, { stage: 't1', status: 'sent', dueAt: antes(12) })
    const t2 = await toque(tenant.id, id, { stage: 't2', status: 'sent', dueAt: antes(5) })
    await visita(tenant.id, id, T)
    expect(await volvio(t1)).toBe(false)
    expect(await volvio(t2)).toBe(true)
  })

  it('un toque que falló no trae a nadie: el regreso va al último que salió', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(40) })
    const salio = await toque(tenant.id, id, { stage: 't1', status: 'sent', dueAt: antes(8) })
    const fallo = await toque(tenant.id, id, { stage: 't2', status: 'failed', dueAt: antes(3) })
    await visita(tenant.id, id, T)
    expect(await volvio(salio)).toBe(true)
    expect(await volvio(fallo)).toBe(false)
  })

  it('los toques de OTRO ciclo no se atribuyen', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(40) })
    await getPool().query('UPDATE customers SET cycle_no = 3 WHERE id = $1', [id])
    const viejo = await toque(tenant.id, id, { cycleNo: 2, stage: 't2', status: 'sent', dueAt: antes(5) })
    await visita(tenant.id, id, T)
    expect(await volvio(viejo)).toBe(false)
    expect((await ciclo(id)).cycle_no).toBe(4)
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. Fatiga
// ═══════════════════════════════════════════════════════════════

describe('la fatiga: al sexto mensaje sin volver, dormido', () => {
  it('manual, calendario y ciclo cuentan; recordatorio de premio, cumpleaños y fallidos no', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(30) })
    const manual = await campana(tenant.id, 'manual')
    const calendario = await campana(tenant.id, 'calendar', 'manual')
    const cicloCamp = await campana(tenant.id, 'reactivation')
    // El recordatorio es `type = 'reactivation'` con `source = 'reward_reminder'`.
    const recordatorio = await campana(tenant.id, 'reward_reminder', 'reactivation')
    const cumple = await campana(tenant.id, 'birthday')

    await mensaje(tenant.id, manual, id)
    await mensaje(tenant.id, calendario, id)
    await mensaje(tenant.id, cicloCamp, id)
    await mensaje(tenant.id, cicloCamp, id, 'delivered')
    await mensaje(tenant.id, recordatorio, id)
    await mensaje(tenant.id, recordatorio, id)
    await mensaje(tenant.id, cumple, id)
    await mensaje(tenant.id, manual, id, 'failed')
    await mensaje(tenant.id, manual, id, 'pending')
    let c = await ciclo(id)
    expect(c.cycle_touches).toBe(4)
    expect(c.cycle_state).toBe('activo')

    await mensaje(tenant.id, calendario, id)
    c = await ciclo(id)
    expect(c.cycle_touches).toBe(5)
    expect(c.cycle_state).toBe('activo')
    expect(c.dormant_since).toBeNull()

    await mensaje(tenant.id, manual, id) // el sexto
    c = await ciclo(id)
    expect(c.cycle_touches).toBe(6)
    expect(c.cycle_state).toBe('dormido')
    expect(c.dormant_since).not.toBeNull()

    // Un séptimo no cambia la fecha en que se durmió.
    await mensaje(tenant.id, cicloCamp, id)
    const despues = await ciclo(id)
    expect(despues.cycle_touches).toBe(7)
    expect(despues.dormant_since?.toISOString()).toBe(c.dormant_since?.toISOString())

    // Y la visita lo despierta con el contador en cero.
    await visita(tenant.id, id, T)
    c = await ciclo(id)
    expect(c.cycle_state).toBe('activo')
    expect(c.cycle_touches).toBe(0)
    expect(c.dormant_since).toBeNull()
  })

  it('un INSERT de varias filas (como la campaña manual) cuenta cada una', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(30) })
    const manual = await campana(tenant.id, 'manual')
    await getPool().query(
      `INSERT INTO campaign_messages (campaign_id, customer_id, status, sent_at, tenant_id)
       VALUES ($1, $2, 'sent', now(), $3), ($1, $2, 'sent', now(), $3), ($1, $2, 'failed', now(), $3)`,
      [manual, id, tenant.id]
    )
    expect((await ciclo(id)).cycle_touches).toBe(2)
  })

  it('el tope sale de admin_settings.cycle_fatigue_touches de la marca; basura → 6', async () => {
    const corta = await createTestTenant()
    const rota = await createTestTenant()
    try {
      await getPool().query(`INSERT INTO admin_settings (key, value, tenant_id) VALUES ('cycle_fatigue_touches', '3', $1)`, [
        corta.id,
      ])
      await getPool().query(`INSERT INTO admin_settings (key, value, tenant_id) VALUES ('cycle_fatigue_touches', '3.5', $1)`, [
        rota.id,
      ])
      const enCorta = await nuevoCliente(corta.id, { ultimaVisita: antes(30) })
      const enRota = await nuevoCliente(rota.id, { ultimaVisita: antes(30) })
      const mCorta = await campana(corta.id, 'manual')
      const mRota = await campana(rota.id, 'manual')
      for (let i = 0; i < 3; i++) {
        await mensaje(corta.id, mCorta, enCorta)
        await mensaje(rota.id, mRota, enRota)
      }
      expect((await ciclo(enCorta)).cycle_state).toBe('dormido')
      expect((await ciclo(enRota)).cycle_state).toBe('activo')
    } finally {
      await limpiar(corta)
      await limpiar(rota)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. El UNIQUE del toque, bajo concurrencia
// ═══════════════════════════════════════════════════════════════

describe('un toque por etapa por ciclo', () => {
  it('8 inserciones concurrentes del mismo toque: gana una', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(30) })
    // Cada `query` del pool sale por su propia conexión: concurrencia de verdad.
    const intentos = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        getPool().query(
          `INSERT INTO customer_cycle_touches (tenant_id, customer_id, cycle_no, stage, seq, status, due_at)
           VALUES ($1, $2, 1, 't2', 1, 'pending', now())`,
          [tenant.id, id]
        )
      )
    )
    const ganaron = intentos.filter((r) => r.status === 'fulfilled')
    const perdieron = intentos.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    expect(ganaron).toHaveLength(1)
    expect(perdieron).toHaveLength(7)
    for (const r of perdieron) expect((r.reason as { code?: string }).code).toBe('23505')

    const { rows } = await getPool().query('SELECT count(*)::int AS n FROM customer_cycle_touches WHERE customer_id = $1', [
      id,
    ])
    expect(rows[0].n).toBe(1)
  })

  it('el mismo toque en otro ciclo, u otra repetición del trimestral, sí entra', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(30) })
    await toque(tenant.id, id, { cycleNo: 1, stage: 't2', status: 'pending', dueAt: T })
    await toque(tenant.id, id, { cycleNo: 2, stage: 't2', status: 'pending', dueAt: T })
    await toque(tenant.id, id, { cycleNo: 2, stage: 'heartbeat', seq: 1, status: 'pending', dueAt: T })
    await toque(tenant.id, id, { cycleNo: 2, stage: 'heartbeat', seq: 2, status: 'pending', dueAt: T })
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. El backfill, tal cual está en la migración
// ═══════════════════════════════════════════════════════════════

function bloqueDeBackfill(): string {
  const dir = path.resolve(import.meta.dirname, '../../supabase/migrations')
  const archivo = fs.readdirSync(dir).find((f) => f.startsWith('00070_'))
  if (!archivo) throw new Error('No existe supabase/migrations/00070_*.sql')
  const sql = fs.readFileSync(path.join(dir, archivo), 'utf8')
  const inicio = sql.indexOf('-- >>> BACKFILL')
  const fin = sql.indexOf('-- <<< BACKFILL')
  expect(inicio, 'faltan las marcas del backfill en 00070').toBeGreaterThan(-1)
  return sql.slice(sql.indexOf('\n', inicio) + 1, fin)
}

describe('el backfill: hacia adelante, sin ráfaga', () => {
  it('> 90 días → dormido desde hoy; ≤ 90 → activo; ritmo con 3+ días; no toca cycle_touches', async () => {
    const marca = await createTestTenant()
    try {
      const hace100 = await nuevoCliente(marca.id, { ultimaVisita: antes(100, new Date()) })
      const hace10 = await nuevoCliente(marca.id, { ultimaVisita: antes(10, new Date()) })
      const nuncaVino = await nuevoCliente(marca.id, { ultimaVisita: null, creado: antes(120, new Date()) })
      const recienRegistrado = await nuevoCliente(marca.id, { ultimaVisita: null, creado: antes(5, new Date()) })
      const frecuente = await clienteConHistorial(marca.id, conHuecos('2026-09-01', [5, 6, 7]))

      // El estado de ANTES de la migración: sin columnas del ciclo llenas. `cycle_touches`
      // en 4 para ver que el backfill no lo toca (el historial no cuenta para la fatiga).
      await getPool().query(
        `UPDATE customers
            SET cycle_started_at = NULL, cycle_state = 'activo', dormant_since = NULL,
                cycle_rhythm = NULL, cycle_no = 7, cycle_touches = 4
          WHERE tenant_id = $1`,
        [marca.id]
      )

      const sql = bloqueDeBackfill()
      await consultarEnOrden(sql, [], 'ROW EXCLUSIVE')
      await consultarEnOrden(sql, [], 'ROW EXCLUSIVE') // idempotente: la segunda no encuentra a nadie

      const a = await ciclo(hace100)
      expect(a).toMatchObject({ cycle_no: 1, cycle_state: 'dormido', cycle_touches: 4 })
      expect(a.dormant_since).not.toBeNull()
      expect(Math.abs(a.dormant_since!.getTime() - Date.now())).toBeLessThan(60_000)

      const b = await ciclo(hace10)
      expect(b).toMatchObject({ cycle_no: 1, cycle_state: 'activo', cycle_touches: 4, dormant_since: null })

      expect((await ciclo(nuncaVino)).cycle_state).toBe('dormido')
      expect((await ciclo(recienRegistrado)).cycle_state).toBe('activo')

      const f = await ciclo(frecuente)
      expect(f.cycle_rhythm).toBe('cafe')
      expect(f.cycle_rhythm).toBe(personalRhythm(conHuecos('2026-09-01', [5, 6, 7])))

      const { rows } = await getPool().query<{ id: string; cycle_started_at: Date; desde: Date }>(
        `SELECT id, cycle_started_at, COALESCE(last_visit_at, created_at) AS desde FROM customers WHERE tenant_id = $1`,
        [marca.id]
      )
      for (const r of rows) expect(r.cycle_started_at.toISOString(), r.id).toBe(r.desde.toISOString())
    } finally {
      await limpiar(marca)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// 7. RLS y guardas de la tabla
// ═══════════════════════════════════════════════════════════════

describe('una marca no ve los toques de otra (RLS)', () => {
  it('con el JWT de la marca A se ven los de A y ni uno de B; no se puede escribir en B', async () => {
    const otra = await createTestTenant()
    const cliente = await getPool().connect()
    try {
      const enA = await nuevoCliente(tenant.id, { ultimaVisita: antes(20) })
      const enB = await nuevoCliente(otra.id, { ultimaVisita: antes(20) })
      await toque(tenant.id, enA, { stage: 't1', status: 'pending', dueAt: T })
      await toque(otra.id, enB, { stage: 't1', status: 'pending', dueAt: T })

      await cliente.query('BEGIN')
      await cliente.query('SET LOCAL ROLE authenticated')
      await cliente.query('SELECT set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: '11111111-1111-4111-8111-111111111111', app_metadata: { tenant_id: tenant.id } }),
      ])
      const { rows } = await cliente.query<{ customer_id: string }>(
        'SELECT customer_id FROM customer_cycle_touches WHERE customer_id = ANY($1)',
        [[enA, enB]]
      )
      expect(rows.map((r) => r.customer_id)).toEqual([enA])

      await cliente.query('SAVEPOINT intento')
      await expect(
        cliente.query(
          `INSERT INTO customer_cycle_touches (tenant_id, customer_id, cycle_no, stage, status, due_at)
           VALUES ($1, $2, 1, 't2', 'pending', now())`,
          [otra.id, enB]
        )
      ).rejects.toThrow(/row-level security/i)
      await cliente.query('ROLLBACK TO SAVEPOINT intento')

      // La anon key no trae marca en el JWT.
      await cliente.query('RESET ROLE')
      await cliente.query("SELECT set_config('request.jwt.claims', '{}', true)")
      await cliente.query('SET LOCAL ROLE anon')
      const { rows: deAnon } = await cliente.query('SELECT count(*)::int AS n FROM customer_cycle_touches')
      expect(deAnon[0].n).toBe(0)
    } finally {
      await cliente.query('ROLLBACK').catch(() => {})
      cliente.release()
      await limpiar(otra)
    }
  })

  it('sin tenant_id el INSERT falla (no hay DEFAULT puente que lo mande a otra marca)', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(20) })
    await expect(
      getPool().query(
        `INSERT INTO customer_cycle_touches (customer_id, cycle_no, stage, status, due_at)
         VALUES ($1, 1, 't3', 'pending', now())`,
        [id]
      )
    ).rejects.toMatchObject({ code: '23502' })
  })

  it('la sede de otra marca no entra (FK compuesta)', async () => {
    const otra = await createTestTenant()
    try {
      const { rows } = await getPool().query<{ id: string }>(
        `INSERT INTO restaurant_locations (tenant_id, name, slug, is_primary, sort_order, is_active)
         VALUES ($1, 'Sede ajena', $2, false, 0, true) RETURNING id`,
        [otra.id, `ajena-${Date.now().toString(36)}`]
      )
      const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(20) })
      await expect(
        getPool().query(
          `INSERT INTO customer_cycle_touches (tenant_id, customer_id, cycle_no, stage, status, due_at, location_id)
           VALUES ($1, $2, 1, 't4', 'pending', now(), $3)`,
          [tenant.id, id, rows[0].id]
        )
      ).rejects.toMatchObject({ code: '23503' })
    } finally {
      await limpiar(otra)
    }
  })

  it('el grupo de control no se puede marcar como enviado', async () => {
    const id = await nuevoCliente(tenant.id, { ultimaVisita: antes(20) })
    await expect(
      toque(tenant.id, id, { stage: 't4', status: 'sent', holdout: true, dueAt: T })
    ).rejects.toMatchObject({ code: '23514' })
    await expect(toque(tenant.id, id, { stage: 't5', status: 'holdout', holdout: false, dueAt: T })).rejects.toMatchObject({
      code: '23514',
    })
  })
})
