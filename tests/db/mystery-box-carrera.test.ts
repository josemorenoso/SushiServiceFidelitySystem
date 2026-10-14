/**
 * SEG-2 — dos `POST /api/mystery-box/resolve` simultáneos ya no otorgan dos veces (2026-10-13).
 *
 * EL AGUJERO (vivo en producción hasta la 00072)
 * ──────────────────────────────────────────────
 * `resolve` lee la oferta (`getNivelOfrecido()`), escribe el reclamo (`mystery_box_results`),
 * otorga (`reward_grants`) y manda WhatsApp. Nada de eso era atómico y `mystery_box_results`
 * no tenía ningún UNIQUE: dos llamadas del mismo cliente leían la oferta antes de que la
 * primera escribiera, y LAS DOS otorgaban — dos premios que el mesero entrega y dos WhatsApp
 * que paga la marca. El límite de tasa (en memoria de cada instancia) solo acotaba cuántas.
 *
 * EL ARREGLO QUE SE PRUEBA
 * ────────────────────────
 * La 00072: un trigger que, con un `pg_advisory_xact_lock` por cliente, rechaza (23505) el
 * reclamo de un nivel que el cliente ya reclamó — la MISMA regla OR de
 * `elegirNivelSinReclamar()` (misma clave de nivel O mismo umbral). Y la ruta traduce ese
 * rechazo a 409 sin otorgar ni mandar WhatsApp.
 *
 * TRES PISOS
 * ──────────
 *   1. La base sola: INSERTs simultáneos y dos transacciones intercaladas a mano.
 *   2. El espejo: caso por caso, la base acepta un reclamo ⇔ `elegirNivelSinReclamar()` lo
 *      ofrecería (igual que `can_see_location()` y su gemelo en TS).
 *   3. La ruta REAL contra Postgres (`supabase-sobre-pg.ts`): seis llamadas que leen la oferta
 *      TODAS antes de que ninguna escriba (una barrera después de `getNivelOfrecido()`: es el
 *      peor caso de la carrera, el que un script consigue). Falsos solo el WhatsApp, el límite
 *      de tasa (para que no sea él quien frene) y la marca del host.
 *
 * Contra el código anterior (sin la 00072 ni el cambio de la ruta) caen todos los que esperan
 * un rechazo: ver la entrada del 2026-10-13 en `CHANGELOG.md`.
 *
 * Código: `supabase/migrations/00072_un_reclamo_por_nivel.sql` ·
 * `src/app/api/mystery-box/resolve/route.ts` · `src/services/mystery-box.service.ts`
 * Doc: `docs/features/points-mystery-box.md` §7.4.ter
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import { cerrarClienteDePrueba } from '../setup/supabase-sobre-pg'
import { elegirNivelSinReclamar, type ReclamoDeNivel } from '@/services/reward-tiers.service'

const h = vi.hoisted(() => ({
  marca: null as null | { id: string; slug: string; config: Record<string, unknown> },
  /** Se espera acá después de leer la oferta; `null` = sin barrera. */
  barrera: null as null | (() => Promise<void>),
  whatsapps: [] as Array<{ telefono: string; plantilla: string; locationId?: string | null }>,
  /** La sede que resuelve el host (N-SEDE-ENVIO). `null` = el dominio de la marca. */
  sedeDelHost: null as null | string,
}))

vi.mock('@supabase/supabase-js', async () => {
  const m = await import('../setup/supabase-sobre-pg')
  return { createClient: () => m.clienteDePrueba() }
})
// `@/lib/tenant` importa el cliente SSR (cookies): fuera del alcance de estas pruebas.
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/tenant', async (original) => ({
  ...(await original<typeof import('@/lib/tenant')>()),
  resolveHostContext: async () => ({ tenant: h.marca, locationId: h.sedeDelHost }),
}))
// Que el límite de tasa NO sea lo que frena: lo que se prueba es la base.
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }),
  getClientIp: () => '203.0.113.7',
}))
vi.mock('@/services/settings.service', async (original) => ({
  ...(await original<typeof import('@/services/settings.service')>()),
  getMultipleSettings: async () => ({
    reward_safe_template_sid: 'HX_safe',
    mystery_box_result_template_sid: 'HX_mystery',
    golden_box_result_template_sid: 'HX_golden',
  }),
}))
vi.mock('@/services/whatsapp.service', () => ({
  sendTemplateMessage: vi.fn(
    async (telefono: string, plantilla: string, _v: unknown, _t: unknown, registro?: { locationId?: string | null }) => {
    h.whatsapps.push({ telefono, plantilla, locationId: registro?.locationId })
    return { sid: `SM${h.whatsapps.length}`, status: 'sent' }
  }),
}))
// La oferta de verdad; la barrera solo la hace esperar a las demás antes de seguir.
vi.mock('@/services/reward-tiers.service', async (original) => {
  const real = await original<typeof import('@/services/reward-tiers.service')>()
  return {
    ...real,
    getNivelOfrecido: async (p: Parameters<typeof real.getNivelOfrecido>[0]) => {
      const r = await real.getNivelOfrecido(p)
      if (h.barrera) await h.barrera()
      return r
    },
  }
})

// ═══════════════════════════════════════════════════════════════
// Marca, niveles y clientes
// ═══════════════════════════════════════════════════════════════

const db = () => getPool()
let marca: TestTenant
let otraMarca: TestTenant
/** Bronce 100 y Plata 200, de la marca (sin sede). */
let bronce: { id: string; tier_key: string }
let plata: { id: string; tier_key: string }
/** Un nivel cualquiera al que apuntan los reclamos fabricados del piso 2. */
let ancla: string

let seq = 0
async function nuevoCliente(puntos = 250): Promise<{ id: string; phone: string }> {
  seq += 1
  const phone = `31${String(process.pid % 1000).padStart(3, '0')}${String(seq).padStart(5, '0')}`
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO customers (tenant_id, phone, name, total_points)
     VALUES ($1, $2, 'Ana', $3) RETURNING id`,
    [marca.id, phone, puntos]
  )
  return { id: rows[0].id, phone }
}

async function nivel(
  tenantId: string,
  nombre: string,
  umbral: number,
  tierKey?: string
): Promise<{ id: string; tier_key: string }> {
  const { rows } = await db().query<{ id: string; tier_key: string }>(
    `INSERT INTO reward_tiers
       (tenant_id, location_id, tier_name, point_threshold, safe_reward_title, sort_order,
        is_active, mystery_box_enabled, mystery_prizes, tier_key)
     VALUES ($1, NULL, $2, $3, $4, $3, true, true,
             '[{"title":"Postre","probability":60,"emoji":"🍰"},{"title":"Rollo","probability":40,"emoji":"🍣"}]'::jsonb,
             COALESCE($5::uuid, gen_random_uuid()))
     RETURNING id, tier_key`,
    [tenantId, nombre, umbral, `Premio ${nombre}`, tierKey ?? null]
  )
  return rows[0]
}

/** El reclamo tal como lo escribe `mystery-box.service.ts`: sin las columnas de la 00059. */
const INSERT_RECLAMO = `INSERT INTO mystery_box_results (tenant_id, customer_id, tier_id, choice, prize_title)
                        VALUES ($1, $2, $3, 'safe', 'Premio elegido')`

async function contar(tabla: 'mystery_box_results' | 'reward_grants', clienteId: string): Promise<number> {
  const { rows } = await db().query<{ n: string }>(
    `SELECT count(*) AS n FROM ${tabla} WHERE customer_id = $1`,
    [clienteId]
  )
  return Number(rows[0].n)
}

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
  marca = await createTestTenant()
  otraMarca = await createTestTenant()
  h.marca = { id: marca.id, slug: marca.slug, config: {} }
  bronce = await nivel(marca.id, 'Bronce', 100)
  plata = await nivel(marca.id, 'Plata', 200)
  ancla = (await nivel(marca.id, 'Ancla', 1)).id
})

afterAll(async () => {
  for (const t of [marca, otraMarca]) {
    await db().query('DELETE FROM reward_grants       WHERE tenant_id = $1', [t.id])
    await db().query('DELETE FROM mystery_box_results WHERE tenant_id = $1', [t.id])
  }
  // Los reclamos «de otra marca» del piso 2 apuntan a clientes de ESTA marca.
  await db().query('DELETE FROM mystery_box_results WHERE tier_id IN (SELECT id FROM reward_tiers WHERE tenant_id = $1)', [marca.id])
  for (const t of [marca, otraMarca]) {
    await db().query('DELETE FROM reward_tiers WHERE tenant_id = $1', [t.id])
    await db().query('DELETE FROM restaurant_locations WHERE tenant_id = $1', [t.id])
    await dropTestTenant(t.id)
  }
  vi.unstubAllEnvs()
  await cerrarClienteDePrueba()
  await closePool()
})

beforeEach(() => {
  h.barrera = null
  h.whatsapps.length = 0
  h.sedeDelHost = null
})

// ═══════════════════════════════════════════════════════════════
// 1. La base sola
// ═══════════════════════════════════════════════════════════════

describe('00072 — la base rechaza el segundo reclamo del mismo nivel', () => {
  it('6 INSERT simultáneos del mismo reclamo: entra UNO y los otros 5 salen con 23505', async () => {
    const cliente = await nuevoCliente()

    const intentos = await Promise.allSettled(
      Array.from({ length: 6 }, () => db().query(INSERT_RECLAMO, [marca.id, cliente.id, plata.id]))
    )

    const entraron = intentos.filter((r) => r.status === 'fulfilled')
    const rechazados = intentos.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(entraron).toHaveLength(1)
    expect(rechazados).toHaveLength(5)
    expect(new Set(rechazados.map((r) => (r.reason as { code?: string }).code))).toEqual(new Set(['23505']))
    // La verdad está en la tabla, no en lo que devolvió cada INSERT.
    expect(await contar('mystery_box_results', cliente.id)).toBe(1)
  })

  /**
   * La carrera, intercalada a mano y sin depender de la suerte: A escribe y NO confirma; B
   * escribe lo mismo. Sin el candado, B no ve la fila de A (no está confirmada), entra, y quedan
   * dos. Con el candado, B ESPERA a A —se ve en `pg_stat_activity`— y, cuando A confirma, la ve
   * y la rechaza.
   */
  it('dos transacciones a la vez: la segunda espera a la primera y, cuando esta confirma, la rechaza', async () => {
    const cliente = await nuevoCliente()
    const a = await db().connect()
    const b = await db().connect()
    try {
      const { rows } = await b.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      const pidB = rows[0].pid

      await a.query('BEGIN')
      await a.query(INSERT_RECLAMO, [marca.id, cliente.id, plata.id])

      let terminoB = false
      const intentoB = b.query(INSERT_RECLAMO, [marca.id, cliente.id, plata.id]).finally(() => {
        terminoB = true
      })
      intentoB.catch(() => {}) // se mira abajo; esto solo evita el «unhandled» mientras espera

      // B tiene que quedarse esperando el candado de A (hasta 3 s para verlo).
      let esperaCandado = false
      for (let i = 0; i < 60 && !esperaCandado && !terminoB; i++) {
        const { rows: act } = await db().query<{ wait_event_type: string | null }>(
          'SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1',
          [pidB]
        )
        esperaCandado = act[0]?.wait_event_type === 'Lock'
        if (!esperaCandado) await new Promise((r) => setTimeout(r, 50))
      }
      expect(esperaCandado, 'B espera el candado de A en vez de entrar').toBe(true)

      await a.query('COMMIT')
      await expect(intentoB).rejects.toMatchObject({ code: '23505' })
      expect(await contar('mystery_box_results', cliente.id)).toBe(1)
    } finally {
      await a.query('ROLLBACK').catch(() => {})
      a.release()
      b.release()
    }
  })

  it('si la primera se deshace (ROLLBACK), la segunda entra: el candado no inventa reclamos', async () => {
    const cliente = await nuevoCliente()
    const a = await db().connect()
    const b = await db().connect()
    try {
      await a.query('BEGIN')
      await a.query(INSERT_RECLAMO, [marca.id, cliente.id, plata.id])
      const intentoB = b.query(INSERT_RECLAMO, [marca.id, cliente.id, plata.id])
      await new Promise((r) => setTimeout(r, 150))
      await a.query('ROLLBACK')
      await expect(intentoB).resolves.toBeDefined()
      expect(await contar('mystery_box_results', cliente.id)).toBe(1)
    } finally {
      a.release()
      b.release()
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. El espejo: la base acepta ⇔ elegirNivelSinReclamar() lo ofrecería
// ═══════════════════════════════════════════════════════════════

/**
 * Cada caso: el nivel L (clave K, umbral T) y los reclamos que el cliente ya tiene,
 * descritos respecto de L. `'K'`/`'T'` = los de L; `'otra'`/`'otro'` = distintos; `null` = sin
 * sellar. `deOtroCliente` = el reclamo es de otra persona; `conOtraMarca` = del mismo cliente
 * pero grabado con el `tenant_id` de otra marca (el DEFAULT puente que la 00030 no quitó).
 */
interface Caso {
  nombre: string
  reclamos: Array<{
    clave: 'K' | 'otra' | null
    umbral: 'T' | 'otro' | null
    deOtroCliente?: boolean
    conOtraMarca?: boolean
  }>
  /** ¿Se le puede otorgar L? */
  otorga: boolean
}

const CASOS: Caso[] = [
  { nombre: 'sin reclamos', reclamos: [], otorga: true },
  { nombre: 'el mismo nivel (misma clave y mismo umbral)', reclamos: [{ clave: 'K', umbral: 'T' }], otorga: false },
  { nombre: 'umbral editado: misma clave, otro umbral', reclamos: [{ clave: 'K', umbral: 'otro' }], otorga: false },
  { nombre: 'nivel creado a mano en la sede: otra clave, mismo umbral', reclamos: [{ clave: 'otra', umbral: 'T' }], otorga: false },
  { nombre: 'otro nivel: otra clave y otro umbral', reclamos: [{ clave: 'otra', umbral: 'otro' }], otorga: true },
  { nombre: 'un reclamo sin sellar (las dos en NULL)', reclamos: [{ clave: null, umbral: null }], otorga: true },
  { nombre: 'un reclamo con solo la clave', reclamos: [{ clave: 'K', umbral: null }], otorga: false },
  { nombre: 'un reclamo con solo el umbral', reclamos: [{ clave: null, umbral: 'T' }], otorga: false },
  {
    nombre: 'duplicados históricos de OTRO nivel no frenan a este',
    reclamos: [{ clave: 'otra', umbral: 'otro' }, { clave: 'otra', umbral: 'otro' }],
    otorga: true,
  },
  {
    nombre: 'duplicados históricos de ESTE nivel',
    reclamos: [{ clave: 'K', umbral: 'T' }, { clave: 'K', umbral: 'T' }],
    otorga: false,
  },
  { nombre: 'el reclamo es de OTRO cliente', reclamos: [{ clave: 'K', umbral: 'T', deOtroCliente: true }], otorga: true },
  {
    nombre: 'el reclamo del mismo cliente quedó grabado con OTRA marca',
    reclamos: [{ clave: 'K', umbral: 'T', conOtraMarca: true }],
    otorga: false,
  },
]

describe('00072 — el espejo de elegirNivelSinReclamar() en la base', () => {
  it.each(CASOS.map((c, i) => [c.nombre, c, i] as const))('%s', async (_nombre, caso, i) => {
    const cliente = await nuevoCliente()
    const otroCliente = await nuevoCliente()
    const umbralL = 1000 + 10 * i
    const L = await nivel(marca.id, `L${i}`, umbralL)
    const otraClave = (await db().query<{ k: string }>('SELECT gen_random_uuid() AS k')).rows[0].k

    // Los reclamos fabricados: se insertan con valores que no chocan con nada y después se
    // les pone el valor del caso con un UPDATE (el trigger es de INSERT). Así se pueden
    // fabricar también los duplicados históricos, que hoy la base ya no deja escribir.
    for (const [j, r] of caso.reclamos.entries()) {
      const { rows } = await db().query<{ id: string }>(
        `INSERT INTO mystery_box_results
           (tenant_id, customer_id, tier_id, choice, prize_title, claimed_tier_key, claimed_threshold)
         VALUES ($1, $2, $3, 'safe', 'Fabricado', gen_random_uuid(), $4) RETURNING id`,
        [
          r.conOtraMarca ? otraMarca.id : marca.id,
          r.deOtroCliente ? otroCliente.id : cliente.id,
          ancla,
          900_000 + 1000 * i + j,
        ]
      )
      await db().query(
        `UPDATE mystery_box_results SET claimed_tier_key = $2, claimed_threshold = $3 WHERE id = $1`,
        [
          rows[0].id,
          r.clave === 'K' ? L.tier_key : r.clave === 'otra' ? otraClave : null,
          r.umbral === 'T' ? umbralL : r.umbral === 'otro' ? umbralL + 5 : null,
        ]
      )
    }

    // Lo que diría el TypeScript sobre los MISMOS reclamos, leídos como los lee
    // `getNivelOfrecido()`: por cliente y sin filtro de marca.
    const { rows: reclamos } = await db().query<ReclamoDeNivel>(
      'SELECT claimed_tier_key, claimed_threshold FROM mystery_box_results WHERE customer_id = $1',
      [cliente.id]
    )
    const ofreceTs = elegirNivelSinReclamar([{ tier_key: L.tier_key, point_threshold: umbralL }], reclamos) !== undefined

    // Lo que dice la base.
    let aceptaLaBase = true
    try {
      await db().query(INSERT_RECLAMO, [marca.id, cliente.id, L.id])
    } catch (e) {
      expect((e as { code?: string }).code).toBe('23505')
      aceptaLaBase = false
    }

    expect(ofreceTs, 'la regla de TypeScript').toBe(caso.otorga)
    expect(aceptaLaBase, 'la base').toBe(ofreceTs)
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. La ruta real
// ═══════════════════════════════════════════════════════════════

/** Deja pasar a todas juntas cuando llegaron `n` (o a los 5 s, para no colgar la prueba). */
function barreraPara(n: number): () => Promise<void> {
  let llegaron = 0
  let abrir!: () => void
  const abierta = new Promise<void>((r) => (abrir = r))
  const tope = new Promise<void>((r) => setTimeout(r, 5000))
  return async () => {
    llegaron += 1
    if (llegaron === n) abrir()
    await Promise.race([abierta, tope])
  }
}

async function resolver(phone: string, tierId: string, choice: 'safe' | 'mystery') {
  const { POST } = await import('@/app/api/mystery-box/resolve/route')
  const req = new Request('https://marca.constelarys.com/api/mystery-box/resolve', {
    method: 'POST',
    body: JSON.stringify({ phone, tier_id: tierId, choice }),
    headers: { 'content-type': 'application/json', host: 'marca.constelarys.com' },
  })
  // La ruta tipa su parámetro como NextRequest, pero solo usa `headers` y `json()`.
  const res = await POST(req as never)
  return { status: res.status, body: (await res.json()) as { message?: string; result?: { result_id: string } } }
}

describe('SEG-2 — la ruta: de seis reclamos simultáneos, otorga UNO', () => {
  it('6 llamadas del mismo cliente que leen la oferta antes de que ninguna escriba (3 «seguro», 3 mystery): un 200 y cinco 409', async () => {
    const cliente = await nuevoCliente(250) // superó Bronce y Plata: se le ofrece Plata
    h.barrera = barreraPara(6)

    const respuestas = await Promise.all(
      Array.from({ length: 6 }, (_, i) => resolver(cliente.phone, plata.id, i % 2 === 0 ? 'safe' : 'mystery'))
    )
    h.barrera = null

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409, 409])
    for (const r of respuestas.filter((x) => x.status === 409)) {
      expect(r.body.message).toBe('Este premio ya fue reclamado o no está disponible.')
    }
    // La verdad en la base: un reclamo, un premio para el mesero, un WhatsApp.
    expect(await contar('mystery_box_results', cliente.id)).toBe(1)
    expect(await contar('reward_grants', cliente.id)).toBe(1)
    expect(h.whatsapps.filter((w) => w.telefono === cliente.phone)).toHaveLength(1)

    // Y el premio que quedó es el del 200.
    const ganador = respuestas.find((r) => r.status === 200)!
    const { rows } = await db().query<{ mystery_box_result_id: string }>(
      'SELECT mystery_box_result_id FROM reward_grants WHERE customer_id = $1',
      [cliente.id]
    )
    expect(rows[0].mystery_box_result_id).toBe(ganador.body.result!.result_id)
  })

  it('el camino legítimo sigue otorgando: Plata, después Bronce, de a uno; repetir cualquiera da 409', async () => {
    const cliente = await nuevoCliente(250)

    expect((await resolver(cliente.phone, plata.id, 'safe')).status).toBe(200)
    expect((await resolver(cliente.phone, bronce.id, 'mystery')).status).toBe(200)
    expect((await resolver(cliente.phone, plata.id, 'safe')).status).toBe(409)
    expect((await resolver(cliente.phone, bronce.id, 'safe')).status).toBe(409)

    expect(await contar('mystery_box_results', cliente.id)).toBe(2)
    expect(await contar('reward_grants', cliente.id)).toBe(2)
    expect(h.whatsapps.filter((w) => w.telefono === cliente.phone)).toHaveLength(2)
  })
})

describe('N-SEDE-ENVIO (2026-10-15): el WhatsApp del premio lleva la sede del host', () => {
  it('desde el enlace de una sede, `message_logs` recibe esa sede; desde el de la marca, NULL', async () => {
    const { rows } = await db().query<{ id: string }>(
      `INSERT INTO restaurant_locations (tenant_id, name, slug, is_primary, sort_order, is_active)
       VALUES ($1, 'Laureles', $2, true, 0, true) RETURNING id`,
      [marca.id, `lau-${marca.id.slice(0, 8)}`]
    )
    const conSede = await nuevoCliente(250)
    h.sedeDelHost = rows[0].id
    expect((await resolver(conSede.phone, plata.id, 'safe')).status).toBe(200)
    expect(h.whatsapps.find((w) => w.telefono === conSede.phone)).toMatchObject({ locationId: rows[0].id })

    const sinSede = await nuevoCliente(250)
    h.sedeDelHost = null
    expect((await resolver(sinSede.phone, plata.id, 'safe')).status).toBe(200)
    expect(h.whatsapps.find((w) => w.telefono === sinSede.phone)).toMatchObject({ locationId: null })
  })
})
