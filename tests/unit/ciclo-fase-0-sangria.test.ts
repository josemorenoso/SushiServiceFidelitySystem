/**
 * Ciclo de recuperación, fase 0 — parar la sangría (N3 y N4, 2026-10-08).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * N3: `hasRecentCampaignMessage()` contaba CUALQUIER fila de `campaign_messages`, y los crons
 * graban los envíos fallidos con `sent_at`. Un fallo callaba 30 días la reactivación y 360 el
 * cumpleaños, sin que nadie lo supiera. Y un fallo de base devolvía `false`: «no le hemos
 * escrito», o sea, mandárselo otra vez.
 *
 * N4: el «insistente» (PASS 2 del cron) usaba la misma dedup de 30 días que el suave. Contaba
 * el suave —salía al día ~51 en vez del 25— y después se repetía cada ~30 días para siempre.
 * Ahora sale UNA vez mientras el cliente no vuelva (`yaRecibioElInsistente()`).
 *
 * CÓMO SE PRUEBA
 * ──────────────
 * Se corre la ruta del cron DE VERDAD con `campaign.service` DE VERDAD; lo único falso es
 * Supabase (un doble en memoria que resuelve `campaigns!inner(...)` por `campaign_id`, como
 * PostgREST) y los servicios que no deciden a quién se le escribe (plantillas, premios,
 * WhatsApp). Se mira a quién le sale qué plantilla.
 *
 * CONTRA EL CÓDIGO VIEJO (comprobado el 2026-10-08): con `src/` devuelto a `HEAD` por
 * `git show` (sin stash), fallan 9 de 13. Los 4 que pasan igual son guardas de lo que ya
 * funcionaba: lo que salió sí bloquea, un insistente de un ciclo anterior no cuenta, el suave
 * de hace 2 días no se repite, y el envío de hoy no se repite mañana.
 *
 * Ref: `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md` §1,
 *      `docs/features/campaigns.md` § «Flujo de toma de decisiones».
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ═══════════════════════════════════════════════════════════════
// El doble de Supabase
// ═══════════════════════════════════════════════════════════════

type Fila = Record<string, unknown>

let tablas: Record<string, Fila[]> = {}
/** Si devuelve true para una tabla, esa consulta contesta con un error de base. */
let fallo: ((tabla: string) => boolean) | null = null
let siguienteId = 1

/** `campaigns.type` → la campaña de la fila por `campaign_id`, como el `!inner` de PostgREST. */
function valor(fila: Fila, col: string): unknown {
  if (!col.includes('.')) return fila[col]
  const [relacion, columna] = col.split('.')
  const fk = `${relacion.replace(/s$/, '')}_id`
  const relacionada = (tablas[relacion] ?? []).find((r) => r.id === fila[fk])
  return relacionada?.[columna]
}

const comparar = (v: unknown, x: unknown) => (v == null ? null : String(v) < String(x) ? -1 : String(v) > String(x) ? 1 : 0)

/** El `.or()` que usa `findInactiveCustomers`: «col.is.null,col.lt.VALOR». */
function filtroOr(expr: string): (f: Fila) => boolean {
  const partes = expr.split(',').map((p) => {
    const [col, op, ...resto] = p.split('.')
    const x = resto.join('.')
    if (op === 'is' && x === 'null') return (f: Fila) => f[col] == null
    if (op === 'lt') return (f: Fila) => comparar(f[col], x) === -1
    throw new Error(`or no soportado en el doble: ${p}`)
  })
  return (f) => partes.some((p) => p(f))
}

interface Constructor {
  select(...args: unknown[]): Constructor
  insert(p: Fila): Constructor
  update(p: Fila): Constructor
  eq(c: string, x: unknown): Constructor
  in(c: string, xs: unknown[]): Constructor
  gte(c: string, x: unknown): Constructor
  gt(c: string, x: unknown): Constructor
  lt(c: string, x: unknown): Constructor
  not(c: string, o: string, x: unknown): Constructor
  is(c: string, x: unknown): Constructor
  or(expr: string): Constructor
  limit(n: number): Constructor
  single(): Constructor
  maybeSingle(): Constructor
  then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown): Promise<unknown>
}

function consulta(tabla: string): Constructor {
  const filtros: Array<(f: Fila) => boolean> = []
  let op: 'select' | 'insert' | 'update' = 'select'
  let carga: Fila = {}
  let limite = Infinity
  let modo: 'varias' | 'una' | 'una-o-ninguna' = 'varias'

  function ejecutar(): { data: unknown; error: { message: string; code?: string } | null } {
    if (fallo?.(tabla)) return { data: null, error: { message: 'boom-db', code: '57014' } }
    const filas = (tablas[tabla] ??= [])
    if (op === 'insert') {
      const nueva = { id: `id-${siguienteId++}`, ...carga }
      filas.push(nueva)
      return { data: modo === 'varias' ? [nueva] : nueva, error: null }
    }
    const elegidas = filas.filter((f) => filtros.every((p) => p(f)))
    if (op === 'update') {
      for (const f of elegidas) Object.assign(f, carga)
      return { data: null, error: null }
    }
    const recortadas = elegidas.slice(0, limite)
    if (modo === 'varias') return { data: recortadas, error: null }
    return { data: recortadas[0] ?? null, error: null }
  }

  const b: Constructor = {
    select: () => b,
    insert: (p) => ((op = 'insert'), (carga = p), b),
    update: (p) => ((op = 'update'), (carga = p), b),
    eq: (c, x) => (filtros.push((f) => valor(f, c) === x), b),
    in: (c, xs) => (filtros.push((f) => xs.includes(valor(f, c))), b),
    gte: (c, x) => (filtros.push((f) => (comparar(valor(f, c), x) ?? -1) >= 0), b),
    gt: (c, x) => (filtros.push((f) => comparar(valor(f, c), x) === 1), b),
    lt: (c, x) => (filtros.push((f) => comparar(valor(f, c), x) === -1), b),
    not: (c, o, x) => {
      if (o !== 'is' || x !== null) throw new Error('not no soportado en el doble')
      filtros.push((f) => valor(f, c) != null)
      return b
    },
    is: (c, x) => (filtros.push((f) => (x === null ? valor(f, c) == null : valor(f, c) === x)), b),
    or: (expr) => (filtros.push(filtroOr(expr)), b),
    limit: (n) => ((limite = n), b),
    single: () => ((modo = 'una'), b),
    maybeSingle: () => ((modo = 'una-o-ninguna'), b),
    then: (ok, ko) => Promise.resolve(ejecutar()).then(ok, ko),
  }
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (tabla: string) => consulta(tabla) }),
}))

// ═══════════════════════════════════════════════════════════════
// Lo que no decide a quién se le escribe
// ═══════════════════════════════════════════════════════════════

const SUAVE = 'HX_SUAVE'
const INSISTENTE = 'HX_INSISTENTE'
const TENANT = { id: 'tenant-A', slug: 'marca-a' }

const enviados: Array<{ telefono: string; plantilla: string }> = []
/** Teléfonos a los que el proveedor «falla» (devuelve null). */
let fallanEnElProveedor = new Set<string>()

vi.mock('@/services/whatsapp.service', () => ({
  sendTemplateMessage: vi.fn(async (telefono: string, plantilla: string) => {
    if (fallanEnElProveedor.has(telefono)) return null
    enviados.push({ telefono, plantilla })
    return { sid: `SM-${telefono}` }
  }),
}))
vi.mock('@/lib/validators/cron', () => ({ validateCronSecret: () => true }))
vi.mock('@/lib/tenant', () => ({
  getTenantBySlug: async () => TENANT,
  getActiveTenants: async () => [TENANT],
}))
vi.mock('@/services/settings.service', () => ({
  getMultipleSettings: async () => ({
    reactivation_no_reward_template_sid: SUAVE,
    reactivation_aggressive_template_sid: INSISTENTE,
  }),
  getReactivationDaysConfig: async () => ({ softDays: 21, aggressiveDays: 25 }),
}))
vi.mock('@/services/reward.service', () => ({
  getRewardById: async () => null,
  getNextReward: async () => null,
  getRewardTitle: () => '',
  buildRewardsRoadmap: async () => '',
}))
vi.mock('@/services/reward-tiers.service', () => ({
  getNextTier: async () => null,
  buildTiersRoadmap: async () => '',
}))
vi.mock('@/services/campaign-reward.service', () => ({ getCampaignRewardById: async () => null }))
vi.mock('@/services/reward-grant.service', () => ({ grantReward: vi.fn(async () => ({ ok: true })) }))

// ═══════════════════════════════════════════════════════════════
// Los datos
// ═══════════════════════════════════════════════════════════════

/** Jueves 8 de octubre de 2026, 20:00 UTC: la hora del cron (`vercel.json`). */
const AHORA = new Date('2026-10-08T20:00:00.000Z')
const DIA = 24 * 60 * 60 * 1000
const haceDias = (d: number) => new Date(AHORA.getTime() - d * DIA).toISOString()

function cliente(id: string, telefono: string, diasSinVenir: number, ultimaCampana: number | null): Fila {
  return {
    id,
    tenant_id: TENANT.id,
    name: id,
    phone: telefono,
    total_points: 0,
    total_visits: 3,
    last_visit_at: haceDias(diasSinVenir),
    accepts_marketing: true,
    whatsapp_opt_out_at: null,
    last_campaign_at: ultimaCampana === null ? null : haceDias(ultimaCampana),
  }
}

/** Una campaña por (tipo, source, día), como `getOrCreateTodayCampaign()`. */
function campana(tipo: string, source: string, dias: number): string {
  const id = `camp-${source}-${dias}`
  if (!tablas.campaigns.some((c) => c.id === id)) {
    tablas.campaigns.push({ id, tenant_id: TENANT.id, name: `${source}_${haceDias(dias).slice(0, 10)}`, type: tipo, source })
  }
  return id
}

function mensaje(clienteId: string, tipo: string, source: string, dias: number, status: 'sent' | 'failed' | 'delivered') {
  tablas.campaign_messages.push({
    id: `msg-${siguienteId++}`,
    campaign_id: campana(tipo, source, dias),
    customer_id: clienteId,
    tenant_id: TENANT.id,
    status,
    // Así los graban los crons de reactivación y cumpleaños: con `sent_at` aunque falle.
    sent_at: haceDias(dias),
  })
}

async function correrCron() {
  const { GET } = await import('@/app/api/cron/reactivation/route')
  const res = await GET({ url: 'http://localhost/api/cron/reactivation?tenant=marca-a' } as unknown as NextRequest)
  return { status: res.status, body: await res.json() }
}

const plantillaDe = (telefono: string) => enviados.filter((e) => e.telefono === telefono).map((e) => e.plantilla)

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  tablas = { customers: [], campaigns: [], campaign_messages: [] }
  fallo = null
  enviados.length = 0
  fallanEnElProveedor = new Set()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════
// N3 — un envío fallido no calla a nadie
// ═══════════════════════════════════════════════════════════════

describe('N3 · hasRecentCampaignMessage() solo cuenta lo que SALIÓ', () => {
  it('un cumpleaños FALLIDO ayer no bloquea el de hoy (antes: 360 días mudo)', async () => {
    const { hasRecentCampaignMessage } = await import('@/services/campaign.service')
    tablas.customers.push(cliente('ana', '3000000001', 3, null))
    mensaje('ana', 'birthday', 'birthday', 1, 'failed')
    expect(await hasRecentCampaignMessage('ana', 'birthday', 360)).toBe(false)
  })

  it('uno que salió (sent o delivered) sí bloquea', async () => {
    const { hasRecentCampaignMessage } = await import('@/services/campaign.service')
    mensaje('ana', 'birthday', 'birthday', 100, 'sent')
    mensaje('beto', 'birthday', 'birthday', 100, 'delivered')
    expect(await hasRecentCampaignMessage('ana', 'birthday', 360)).toBe(true)
    expect(await hasRecentCampaignMessage('beto', 'birthday', 360)).toBe(true)
  })

  it('un fallo de base LANZA en vez de decir «no le hemos escrito»', async () => {
    const { hasRecentCampaignMessage } = await import('@/services/campaign.service')
    fallo = (t) => t === 'campaign_messages'
    await expect(hasRecentCampaignMessage('ana', 'birthday', 360)).rejects.toThrow(/boom-db/)
  })

  it('en el cron: un suave FALLIDO ayer se reintenta hoy (antes: 30 días mudo)', async () => {
    // Día 22: zona del suave. El fallo no tocó `last_campaign_at` (solo lo toca un envío).
    tablas.customers.push(cliente('eva', '3000000005', 22, null))
    mensaje('eva', 'reactivation', 'reactivation', 1, 'failed')

    const { status } = await correrCron()

    expect(status).toBe(200)
    expect(plantillaDe('3000000005')).toEqual([SUAVE])
  })
})

// ═══════════════════════════════════════════════════════════════
// N4 — el insistente, una sola vez mientras no vuelva
// ═══════════════════════════════════════════════════════════════

describe('N4 · el insistente sale UNA vez por ciclo, y el suave no lo bloquea', () => {
  it('sale aunque el suave haya salido hace menos de 30 días (antes: al día ~51)', async () => {
    // Visitó hace 30 días; el suave salió al día 21 (hace 9). Ya pasó el cap de 7.
    tablas.customers.push(cliente('ana', '3000000001', 30, 9))
    mensaje('ana', 'reactivation', 'reactivation', 9, 'sent')

    await correrCron()

    expect(plantillaDe('3000000001')).toEqual([INSISTENTE])
  })

  it('NO se repite: quien ya lo recibió desde su última visita no recibe otro (antes: cada ~30 días)', async () => {
    // Visitó hace 70 días: suave al día 21 (hace 49), insistente al día 26 (hace 44).
    tablas.customers.push(cliente('beto', '3000000002', 70, 44))
    mensaje('beto', 'reactivation', 'reactivation', 49, 'sent')
    mensaje('beto', 'reactivation', 'reactivation', 44, 'sent')

    await correrCron()

    expect(plantillaDe('3000000002')).toEqual([])
  })

  it('tampoco un año después: el tope es «mientras no vuelva», no una ventana', async () => {
    tablas.customers.push(cliente('beto', '3000000002', 400, 374))
    mensaje('beto', 'reactivation', 'reactivation', 374, 'delivered')

    await correrCron()

    expect(plantillaDe('3000000002')).toEqual([])
  })

  it('un insistente de un ciclo ANTERIOR (antes de la última visita) no cuenta', async () => {
    tablas.customers.push(cliente('caro', '3000000003', 60, 39))
    mensaje('caro', 'reactivation', 'reactivation', 200, 'sent') // insistente del ciclo viejo
    mensaje('caro', 'reactivation', 'reactivation', 39, 'sent') // suave de este ciclo

    await correrCron()

    expect(plantillaDe('3000000003')).toEqual([INSISTENTE])
  })

  it('un insistente FALLIDO no cuenta: se reintenta', async () => {
    tablas.customers.push(cliente('dani', '3000000004', 40, 19))
    mensaje('dani', 'reactivation', 'reactivation', 19, 'sent') // suave
    mensaje('dani', 'reactivation', 'reactivation', 10, 'failed') // insistente que falló

    await correrCron()

    expect(plantillaDe('3000000004')).toEqual([INSISTENTE])
  })

  it('el recordatorio de premio (type reactivation, source reward_reminder) no cuenta como insistente', async () => {
    tablas.customers.push(cliente('fede', '3000000006', 40, 19))
    mensaje('fede', 'reactivation', 'reactivation', 19, 'sent') // suave
    mensaje('fede', 'reactivation', 'reward_reminder', 3, 'sent') // recordatorio de otro premio

    await correrCron()

    expect(plantillaDe('3000000006')).toEqual([INSISTENTE])
  })

  it('el suave sigue como estaba: quien lo recibió hace 2 días no recibe nada', async () => {
    tablas.customers.push(cliente('gabi', '3000000007', 23, 2))
    mensaje('gabi', 'reactivation', 'reactivation', 2, 'sent')

    await correrCron()

    expect(plantillaDe('3000000007')).toEqual([])
  })

  it('el envío de hoy queda registrado: la corrida de mañana ya no lo repite', async () => {
    tablas.customers.push(cliente('ana', '3000000001', 30, 9))
    mensaje('ana', 'reactivation', 'reactivation', 9, 'sent')

    await correrCron()
    vi.setSystemTime(new Date(AHORA.getTime() + 8 * DIA)) // pasado el cap de 7
    enviados.length = 0
    await correrCron()

    expect(plantillaDe('3000000001')).toEqual([])
  })

  it('un fallo de base al buscar el insistente previo no manda nada y la marca sale con error', async () => {
    const { yaRecibioElInsistente } = await import('@/services/campaign.service')
    fallo = (t) => t === 'campaign_messages'
    await expect(yaRecibioElInsistente('ana', haceDias(30), 25)).rejects.toThrow(/boom-db/)
  })
})
