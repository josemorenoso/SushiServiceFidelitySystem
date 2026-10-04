/**
 * ESCALA-4 — la analítica del panel deja de cortarse en 1.000 filas.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * `getFullAnalytics()` lanzaba siete lecturas en paralelo sin `.range()` y sin mirar `error`.
 * PostgREST corta TODA respuesta en 1.000 filas, en silencio, así que en cualquier marca que
 * pasara de mil filas en una de esas lecturas salían mal el total de clientes, el mapa de calor
 * día × hora, las visitas por día y la tasa de reactivación — sin un solo error que lo dijera.
 * Y un fallo de base se veía como «cero», que es el mismo número que un restaurante nuevo.
 *
 * EL DOBLE IMITA A POSTGREST EN LO ÚNICO QUE IMPORTA AQUÍ
 * ───────────────────────────────────────────────────────
 * `max-rows`: ninguna respuesta pasa de 1.000 filas, pida lo que pida. Una lectura sin
 * `.range()` recibe las primeras 1.000 y nada más, que es exactamente el bug. El doble además
 * REGISTRA cada consulta (tabla, filtros, orden, rango) para poder afirmar lo que no se ve en
 * los números: que todas filtran por marca, que todas paginan y van ordenadas con un
 * desempate único, y qué ids de campaña se leen.
 *
 * ⚠️ Sin base de datos y sin red. El reloj está fijado (solo `Date`) para que las ventanas de
 * 30 días, 6 meses y 7 días sean las mismas hoy y dentro de un año.
 *
 * Ref: `docs/features/dashboard.md` § «La analítica pagina», `src/lib/leer-todo.ts`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { LocationScope } from '@/lib/location-scope'

// ═══════════════════════════════════════════════════════════════
// El doble de Supabase
// ═══════════════════════════════════════════════════════════════

type Fila = Record<string, unknown>

interface Filtro {
  op: 'eq' | 'in' | 'gte' | 'not-null' | 'like'
  col: string
  valor?: unknown
}

interface Consulta {
  tabla: string
  filtros: Filtro[]
  orden: Array<{ col: string; asc: boolean }>
  rango?: { desde: number; hasta: number }
}

/** `max-rows` de Supabase: ninguna respuesta pasa de aquí, pida lo que pida. */
const MAX_FILAS = 1000

let tablas: Record<string, Fila[]> = {}
let consultas: Consulta[] = []
/** Si devuelve true para una consulta, esa lectura contesta con un error de base. */
let fallo: ((c: Consulta) => boolean) | null = null

interface Constructor {
  select(...args: unknown[]): Constructor
  eq(col: string, valor: unknown): Constructor
  in(col: string, valor: unknown[]): Constructor
  gte(col: string, valor: unknown): Constructor
  not(col: string, op: string, valor: unknown): Constructor
  like(col: string, valor: string): Constructor
  order(col: string, opts?: { ascending?: boolean }): Constructor
  range(desde: number, hasta: number): Constructor
  then(resolver: (v: unknown) => unknown, rechazar?: (e: unknown) => unknown): Promise<unknown>
}

function constructorPara(tabla: string): Constructor {
  const c: Consulta = { tabla, filtros: [], orden: [] }
  consultas.push(c)
  const b: Constructor = {
    select: () => b,
    eq: (col, valor) => (c.filtros.push({ op: 'eq', col, valor }), b),
    in: (col, valor) => (c.filtros.push({ op: 'in', col, valor }), b),
    gte: (col, valor) => (c.filtros.push({ op: 'gte', col, valor }), b),
    not: (col) => (c.filtros.push({ op: 'not-null', col }), b),
    like: (col, valor) => (c.filtros.push({ op: 'like', col, valor }), b),
    order: (col, opts) => (c.orden.push({ col, asc: opts?.ascending !== false }), b),
    range: (desde, hasta) => ((c.rango = { desde, hasta }), b),
    then: (resolver, rechazar) => Promise.resolve(ejecutar(c)).then(resolver, rechazar),
  }
  return b
}

function coincide(fila: Fila, f: Filtro): boolean {
  const v = fila[f.col]
  switch (f.op) {
    case 'eq':
      return v === f.valor
    case 'in':
      return (f.valor as unknown[]).includes(v)
    case 'gte':
      return v != null && String(v) >= String(f.valor)
    case 'not-null':
      return v != null
    case 'like':
      return typeof v === 'string' && new RegExp('^' + String(f.valor).replace(/%/g, '.*') + '$').test(v)
  }
}

function ejecutar(c: Consulta): { data: Fila[] | null; error: { message: string; code?: string } | null } {
  if (fallo?.(c)) return { data: null, error: { message: 'boom-db', code: '57014' } }
  // Lo que contesta Postgres de verdad: `birthday` es `date` y LIKE no existe para `date`. El doble
  // anterior lo trataba como texto, y por eso la analítica se desplegó rota (2026-10-04).
  if (c.filtros.some((f) => f.op === 'like' && f.col === 'birthday')) {
    return { data: null, error: { message: 'operator does not exist: date ~~ unknown', code: '42883' } }
  }

  let filas = (tablas[c.tabla] ?? []).filter((fila) => c.filtros.every((f) => coincide(fila, f)))
  if (c.orden.length > 0) {
    filas = [...filas].sort((a, b) => {
      for (const { col, asc } of c.orden) {
        const x = a[col] as string | number
        const y = b[col] as string | number
        if (x < y) return asc ? -1 : 1
        if (x > y) return asc ? 1 : -1
      }
      return 0
    })
  }
  const desde = c.rango?.desde ?? 0
  const hasta = c.rango?.hasta ?? Number.POSITIVE_INFINITY
  return { data: filas.slice(desde, hasta + 1).slice(0, MAX_FILAS), error: null }
}

vi.mock('@/lib/supabase/unscoped', () => ({
  getUnscopedServiceClient: () => ({ from: (tabla: string) => constructorPara(tabla) }),
}))

// ═══════════════════════════════════════════════════════════════
// Los datos: una marca grande (A) y otra (B) que no debe aparecer en ningún número
// ═══════════════════════════════════════════════════════════════

const A = 'tenant-A'
const B = 'tenant-B'
/** Domingo 4 de octubre de 2026, 10:00 en Bogotá. */
const AHORA = new Date('2026-10-04T15:00:00.000Z')
const BASE_CLIENTES = Date.UTC(2026, 0, 1)

const pad = (n: number, ancho = 4) => String(n).padStart(ancho, '0')
const idCliente = (i: number) => `c-${pad(i)}`

/**
 * Marca A:
 *   · 1.305 clientes (1.300 de enero + 5 de hace dos semanas), 3 cumplen años hoy.
 *   · 3.940 visitas en 6 meses, 3.040 de ellas en los últimos 30 días:
 *       V1 1.700 el vie 18-sep 13:00 Bogotá  (1.300 qr + 400 delivery; 1.500 en loc-1, 200 en loc-2)
 *       V2   900 el mié 12-ago 17:00         (qr, loc-1) — fuera de los 30 días
 *       V3   200 el dom  6-sep 10:00         (qr, SIN sede)
 *       V4 1.100 el vie  2-oct 18:00         (qr, loc-2) — los que VUELVEN tras la campaña de octubre
 *       V5    40 el vie 11-sep 17:00         (qr, loc-2) — los que vuelven tras la de septiembre
 *   · Reactivación: oct (1.300 mensajes, 1.100 vuelven), sep (100 mensajes, 40 vuelven) y una
 *     de enero con 1.500 mensajes que cae FUERA de la ventana de 6 meses; más una campaña
 *     manual con 1.200 mensajes que no es de reactivación.
 * Marca B: lo mismo en chico, pero con ticket y campaña propios. Si algún número de A la incluye,
 * una lectura se quedó sin su `.eq('tenant_id')`.
 */
function sembrar(): Record<string, Fila[]> {
  const customers: Fila[] = []
  for (let i = 1; i <= 1300; i++) {
    customers.push({
      id: idCliente(i),
      tenant_id: A,
      name: `Cliente ${i}`,
      phone: `3${pad(i, 9)}`,
      total_visits: i % 12,
      created_at: new Date(BASE_CLIENTES + i * 60_000).toISOString(),
      last_visit_at: null,
      source_channels: 'qr',
      birthday: i <= 3 ? '1990-10-04' : null,
    })
  }
  for (let i = 1; i <= 5; i++) {
    customers.push({
      id: `n-${pad(i)}`,
      tenant_id: A,
      name: `Nuevo ${i}`,
      phone: `3${pad(5000 + i, 9)}`,
      total_visits: 1,
      created_at: '2026-09-20T15:00:00.000Z',
      last_visit_at: null,
      source_channels: 'qr',
      birthday: null,
    })
  }
  for (let i = 1; i <= 400; i++) {
    customers.push({
      id: `b-${pad(i)}`,
      tenant_id: B,
      name: `Cliente B ${i}`,
      phone: `3${pad(9000 + i, 9)}`,
      total_visits: 9,
      created_at: '2026-01-02T00:00:00.000Z',
      last_visit_at: null,
      source_channels: 'qr',
      birthday: '1985-10-04',
    })
  }

  const visits: Fila[] = []
  let nVisita = 0
  const visita = (cliente: string, creado: string, source: string, sede: string | null, tenant = A) =>
    visits.push({
      id: `v-${pad(++nVisita, 6)}`,
      tenant_id: tenant,
      customer_id: cliente,
      source,
      created_at: creado,
      location_id: sede,
    })
  for (let i = 0; i < 1700; i++) {
    visita(idCliente((i % 1300) + 1), '2026-09-18T18:00:00.000Z', i < 1300 ? 'qr' : 'delivery', i < 1500 ? 'loc-1' : 'loc-2')
  }
  for (let i = 0; i < 900; i++) visita(idCliente((i % 1300) + 1), '2026-08-12T22:00:00.000Z', 'qr', 'loc-1')
  for (let i = 0; i < 200; i++) visita(idCliente((i % 1300) + 1), '2026-09-06T15:00:00.000Z', 'qr', null)
  for (let i = 1; i <= 1100; i++) visita(idCliente(i), '2026-10-02T23:00:00.000Z', 'qr', 'loc-2')
  for (let i = 1; i <= 40; i++) visita(idCliente(i), '2026-09-11T22:00:00.000Z', 'qr', 'loc-2')
  for (let i = 1; i <= 500; i++) visita(`b-${pad(i % 400 + 1)}`, '2026-09-18T18:00:00.000Z', 'qr', 'loc-b', B)

  const campaigns: Fila[] = [
    { id: 'camp-r1', tenant_id: A, type: 'reactivation', executed_at: '2026-10-01T20:00:00.000Z' },
    { id: 'camp-r0', tenant_id: A, type: 'reactivation', executed_at: '2026-09-10T20:00:00.000Z' },
    { id: 'camp-r-vieja', tenant_id: A, type: 'reactivation', executed_at: '2026-01-15T20:00:00.000Z' },
    { id: 'camp-manual', tenant_id: A, type: 'manual', executed_at: '2026-09-20T20:00:00.000Z' },
    { id: 'camp-sin-ejecutar', tenant_id: A, type: 'reactivation', executed_at: null },
    { id: 'camp-b', tenant_id: B, type: 'reactivation', executed_at: '2026-10-01T20:00:00.000Z' },
  ]

  const campaign_messages: Fila[] = []
  let nMensaje = 0
  const mensaje = (campana: string, cliente: string, tenant = A) =>
    campaign_messages.push({
      id: `m-${pad(++nMensaje, 6)}`,
      tenant_id: tenant,
      campaign_id: campana,
      customer_id: cliente,
      status: 'sent',
      sent_at: '2026-10-01T20:01:00.000Z',
    })
  for (let i = 1; i <= 1300; i++) mensaje('camp-r1', idCliente(i))
  for (let i = 1; i <= 100; i++) mensaje('camp-r0', idCliente(i))
  for (let i = 1; i <= 1500; i++) mensaje('camp-r-vieja', idCliente((i % 1300) + 1))
  for (let i = 1; i <= 1200; i++) mensaje('camp-manual', idCliente(i))
  for (let i = 1; i <= 1200; i++) mensaje('camp-b', `b-${pad((i % 400) + 1)}`, B)

  const admin_settings: Fila[] = [
    { tenant_id: A, key: 'avg_ticket', value: '40000' },
    { tenant_id: A, key: 'otra_clave', value: 'x' },
    { tenant_id: B, key: 'avg_ticket', value: '99999' },
  ]

  return { customers, visits, campaigns, campaign_messages, admin_settings }
}

/**
 * El alcance se fabrica con un literal y un `as`: la marca de opacidad de `LocationScope` es
 * un símbolo que solo existe para el compilador (la ruta que se olvida del filtro no compila),
 * y `getFullAnalytics()` solo lee `tenantId`, `locationIds` e `includesUnassigned`.
 */
function alcance(over: Partial<{ locationIds: string[] | null; includesUnassigned: boolean }> = {}): LocationScope {
  return {
    tenantId: A,
    role: 'brand',
    allowedLocationIds: ['loc-1', 'loc-2'],
    canSeeUnassigned: true,
    selection: 'all',
    locationIds: null,
    includesUnassigned: true,
    brandActiveLocationCount: 2,
    ...over,
  } as unknown as LocationScope
}

const todaLaMarca = () => alcance()
const soloLoc1 = () => alcance({ locationIds: ['loc-1'], includesUnassigned: false })

async function analitica(scope: LocationScope) {
  const { getFullAnalytics } = await import('@/services/dashboard.service')
  return getFullAnalytics(scope)
}

const celda = (a: Awaited<ReturnType<typeof analitica>>, dia: number, hora: number) =>
  a.location.heatmap.find((c) => c.day === dia && c.hour === hora)?.count
const totalDelMapa = (a: Awaited<ReturnType<typeof analitica>>) => a.location.heatmap.reduce((s, c) => s + c.count, 0)

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  tablas = sembrar()
  consultas = []
  fallo = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════
// Lo que salía mal: los números con más de 1.000 filas
// ═══════════════════════════════════════════════════════════════

describe('getFullAnalytics() con más de 1.000 filas por lectura', () => {
  it('cuenta TODOS los clientes, no los primeros 1.000', async () => {
    const a = await analitica(todaLaMarca())

    expect(a.brand.summary.totalCustomers).toBe(1305)
    expect(a.brand.customerTiers.reduce((s, t) => s + t.count, 0)).toBe(1305)
    // Los 5 de hace dos semanas son los de MENOR visita: justo los que el corte de 1.000 por
    // `total_visits` descendente dejaba fuera.
    const nuevos = a.brand.newCustomersPerDay
    expect(nuevos.find((d) => d.date === '2026-09-20')?.count).toBe(5)
    expect(nuevos[nuevos.length - 1].cumulative).toBe(1305)
    expect(a.brand.summary.birthdaysToday).toBe(3)
    expect(a.brand.summary.frequentCustomers).toBe(974)
  })

  it('el top de clientes sigue ordenado por visitas y trae 15', async () => {
    const a = await analitica(todaLaMarca())

    expect(a.brand.topCustomers).toHaveLength(15)
    expect(a.brand.topCustomers.every((c) => c.total_visits === 11)).toBe(true)
    expect(new Set(a.brand.topCustomers.map((c) => c.id)).size).toBe(15)
    expect(a.brand.topCustomers.map((c) => c.position)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1))
  })

  it('el mapa de calor suma las 3.940 visitas de los 6 meses, no las primeras 1.000', async () => {
    const a = await analitica(todaLaMarca())

    expect(totalDelMapa(a)).toBe(3940)
    expect(celda(a, 5, 13)).toBe(1700) // vie 13:00 Bogotá
    expect(celda(a, 3, 17)).toBe(900) // mié 17:00 — fuera de los 30 días: solo la lectura de 6 meses
    expect(celda(a, 0, 10)).toBe(200) // dom 10:00 — la sede desconocida SE MUESTRA
    expect(celda(a, 5, 18)).toBe(1100)
    expect(celda(a, 5, 17)).toBe(40)
  })

  it('las visitas por día de los últimos 30 días salen completas', async () => {
    const a = await analitica(todaLaMarca())

    const dia = a.location.visitsPerDay.find((d) => d.date === '2026-09-18')
    expect(dia).toMatchObject({ qr: 1300, delivery: 400, total: 1700 })
    expect(a.location.visitsPerDay.find((d) => d.date === '2026-10-02')?.total).toBe(1100)
    expect(a.location.visitsPerDay.reduce((s, d) => s + d.total, 0)).toBe(3040)
  })

  it('la tasa de reactivación cuenta los 1.300 mensajes y las 1.100 que volvieron', async () => {
    const a = await analitica(todaLaMarca())

    const meses = a.brand.reactivationRate
    expect(meses).toHaveLength(6)
    // Orden ascendente por mes: [4] = septiembre, [5] = octubre (el mes en curso).
    expect(meses[5]).toMatchObject({ sent: 1300, returned: 1100, rate: 85 })
    expect(meses[4]).toMatchObject({ sent: 100, returned: 40, rate: 40 })
    // La campaña de enero (1.500 mensajes) queda FUERA de la ventana: no suma en ningún mes.
    expect(meses.slice(0, 4).every((m) => m.sent === 0 && m.returned === 0)).toBe(true)
  })

  it('el ROI usa los reactivados de este mes y el ticket de LA MARCA, no el de otra', async () => {
    const a = await analitica(todaLaMarca())

    expect(a.brand.roiEstimate).toEqual({ reactivatedThisMonth: 1100, avgTicket: 40000, estimatedROI: 44_000_000 })
  })
})

// ═══════════════════════════════════════════════════════════════
// Lo que NO se tocó: las reglas de sede
// ═══════════════════════════════════════════════════════════════

describe('las reglas de sede quedan iguales', () => {
  it('el mapa de calor y las visitas por día son DE LA SEDE: solo loc-1, y sin el cubo NULL', async () => {
    const a = await analitica(soloLoc1())

    expect(totalDelMapa(a)).toBe(2400) // 1.500 de V1 + 900 de V2
    expect(celda(a, 5, 13)).toBe(1500)
    expect(celda(a, 0, 10)).toBe(0) // el cubo NULL no es de un administrador de sede
    expect(celda(a, 5, 18)).toBe(0) // las que volvieron fueron a loc-2
    expect(a.location.visitsPerDay.find((d) => d.date === '2026-09-18')).toMatchObject({ qr: 1300, delivery: 200 })
  })

  it('el reloj de reactivación es de la MARCA: no se recorta por sede', async () => {
    const a = await analitica(soloLoc1())

    // Las 1.100 visitas que cuentan como «volvió» son todas de loc-2, y aun así cuentan: quien
    // vuelve a otra sede de la misma marca volvió.
    expect(a.brand.reactivationRate[5]).toMatchObject({ sent: 1300, returned: 1100, rate: 85 })
    expect(a.brand.roiEstimate.reactivatedThisMonth).toBe(1100)
    // Y los números de marca tampoco cambian.
    expect(a.brand.summary.totalCustomers).toBe(1305)
  })
})

// ═══════════════════════════════════════════════════════════════
// Lo que se afirma sobre las consultas, no sobre los números
// ═══════════════════════════════════════════════════════════════

describe('cómo lee la base', () => {
  it('toda lectura va con el tenant_id de la marca, y nada de otra marca entra', async () => {
    await analitica(todaLaMarca())

    expect(consultas.length).toBeGreaterThan(0)
    for (const c of consultas) {
      expect(
        c.filtros.some((f) => f.op === 'eq' && f.col === 'tenant_id' && f.valor === A),
        `la lectura de ${c.tabla} no filtra por tenant_id`
      ).toBe(true)
    }
  })

  it('de campaign_messages lee SOLO los mensajes de las campañas de reactivación de los últimos 6 meses', async () => {
    await analitica(todaLaMarca())

    const lecturas = consultas.filter((c) => c.tabla === 'campaign_messages')
    expect(lecturas.length).toBeGreaterThan(0)

    const ids = new Set<string>()
    for (const c of lecturas) {
      const enLista = c.filtros.find((f) => f.op === 'in' && f.col === 'campaign_id')
      expect(enLista, 'una lectura de campaign_messages sin `.in(campaign_id, …)` trae TODOS los de la marca').toBeDefined()
      for (const id of enLista!.valor as string[]) ids.add(id)
    }
    // Las dos de la ventana. Ni la manual, ni la de enero (fuera de los 6 meses), ni la que nunca
    // se ejecutó, ni la de otra marca.
    expect([...ids].sort()).toEqual(['camp-r0', 'camp-r1'])
  })

  it('ninguna lectura queda sin paginar, y todas van ordenadas con una PK de desempate', async () => {
    await analitica(todaLaMarca())

    const paginadas = consultas.filter((c) => c.tabla !== 'admin_settings')
    expect(paginadas.length).toBeGreaterThan(0)
    for (const c of paginadas) {
      expect(c.rango, `${c.tabla} se lee sin .range(): PostgREST la corta en 1.000`).toBeDefined()
      expect(c.rango!.desde % MAX_FILAS).toBe(0)
      expect(c.rango!.hasta).toBe(c.rango!.desde + MAX_FILAS - 1)
      // Sin un orden total las páginas se pisan: una fila sale dos veces y otra ninguna.
      expect(c.orden.length, `${c.tabla} se pagina sin ORDER BY`).toBeGreaterThan(0)
      expect(c.orden[c.orden.length - 1].col, `el último orden de ${c.tabla} tiene que ser la PK`).toBe('id')
    }
  })

  it('una marca chica hace UNA sola ida por lectura: no pide una página de más', async () => {
    tablas = {
      customers: [
        { id: 'c-1', tenant_id: A, name: 'Ana', phone: '3000000001', total_visits: 4, created_at: '2026-01-01T00:00:00.000Z', last_visit_at: null, source_channels: 'qr', birthday: null },
        { id: 'c-2', tenant_id: A, name: 'Beto', phone: '3000000002', total_visits: 0, created_at: '2026-01-02T00:00:00.000Z', last_visit_at: null, source_channels: 'qr', birthday: null },
      ],
      visits: [{ id: 'v-1', tenant_id: A, customer_id: 'c-1', source: 'qr', created_at: '2026-09-18T18:00:00.000Z', location_id: null }],
      campaigns: [],
      campaign_messages: [],
      admin_settings: [],
    }

    const a = await analitica(todaLaMarca())

    expect(a.brand.summary.totalCustomers).toBe(2)
    expect(totalDelMapa(a)).toBe(1)
    expect(a.brand.roiEstimate.avgTicket).toBe(35000) // sin ajuste guardado, el de siempre
    // clientes, visitas ×2, campañas y ajustes (los cumpleaños salen de los clientes, no de otra
    // lectura). Sin campañas de reactivación no se pregunta por mensajes: una lectura menos, no una
    // que vuelve vacía.
    expect(consultas.map((c) => c.tabla).sort()).toEqual(
      ['admin_settings', 'campaigns', 'customers', 'visits', 'visits']
    )
  })
})

// ═══════════════════════════════════════════════════════════════
// Un fallo de base es un error, no «cero»
// ═══════════════════════════════════════════════════════════════

describe('un fallo de base en cualquiera de las 6 lecturas da un error visible, no ceros', () => {
  const gte = (c: Consulta) => String(c.filtros.find((f) => f.op === 'gte')?.valor ?? '')

  const LECTURAS: Array<{ nombre: string; razon: string; falla: (c: Consulta) => boolean }> = [
    { nombre: 'los clientes', razon: 'analitica_clientes', falla: (c) => c.tabla === 'customers' },
    { nombre: 'las visitas de 30 días', razon: 'analitica_visitas_30d', falla: (c) => c.tabla === 'visits' && gte(c) === '2026-09-04' },
    { nombre: 'las visitas de 6 meses', razon: 'analitica_visitas_6m', falla: (c) => c.tabla === 'visits' && gte(c) === '2026-04-04' },
    { nombre: 'las campañas de reactivación', razon: 'analitica_campanas', falla: (c) => c.tabla === 'campaigns' },
    { nombre: 'los mensajes de campaña', razon: 'analitica_mensajes', falla: (c) => c.tabla === 'campaign_messages' },
    { nombre: 'el ticket promedio', razon: 'analitica_ajustes', falla: (c) => c.tabla === 'admin_settings' },
  ]

  it.each(LECTURAS)('si falla la lectura de $nombre, lanza y deja la línea [Analytics][FALLO]', async ({ razon, falla }) => {
    fallo = falla
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(analitica(todaLaMarca())).rejects.toThrow('boom-db')

    const lineas = log.mock.calls.map((c) => String(c[0]))
    expect(lineas.some((l) => l.includes('[Analytics][FALLO]') && l.includes(`reason=${razon}`) && l.includes(`tenant=${A}`))).toBe(true)
  })

  it('un fallo en la SEGUNDA página de una lectura también lanza: lo leído hasta ahí no es «toda la base»', async () => {
    fallo = (c) => c.tabla === 'visits' && gte(c) === '2026-04-04' && (c.rango?.desde ?? 0) >= MAX_FILAS

    await expect(analitica(todaLaMarca())).rejects.toThrow('boom-db')
  })
})
