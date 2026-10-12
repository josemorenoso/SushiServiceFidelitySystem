/**
 * Ciclo de recuperación, fase 0.bis — cerrar los riesgos que dejó la fase 0 (2026-10-10).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * La fase 0 (`4043421`) hizo que un envío fallido dejara de contar como enviado. Bien, pero
 * abrió tres agujeros que este archivo vigila:
 *
 * R1 · Sin techo, un número que falla siempre (o una línea muerta: la de Twilio de Sushi
 *      Service muere hacia el 12-10) recibía un intento TODOS LOS DÍAS. Ahora, como mucho
 *      MAX_INTENTOS_FALLIDOS_POR_TOQUE por toque: suave, insistente, cumpleaños y
 *      recordatorio de premio. Los fallidos viejos cuentan.
 * R2 · Si la corrida abortaba a mitad (un fallo de base), a los que YA habían recibido
 *      mensaje no se les marcaba `last_campaign_at` (ni se sellaba el recordatorio), y un
 *      envío que salió pero no se pudo grabar quedaba grabado como FALLIDO.
 * R5 · Los tres crons grababan «Twilio no configurado o error de envío» para cualquier
 *      fallo, también en las marcas de Zernio. Ahora, la causa real de `message_logs`.
 * R4 · El filtro de Clientes sigue los días de la marca (uno de los tres relojes fijos).
 *
 * CÓMO SE PRUEBA
 * ──────────────
 * Igual que `ciclo-fase-0-sangria.test.ts`: las rutas de los crons y `campaign.service` DE
 * VERDAD; falso solo Supabase (un doble en memoria que resuelve `campaigns!inner(...)` por
 * `campaign_id`) y lo que no decide a quién se le escribe (WhatsApp, plantillas, premios).
 *
 * CONTRA EL CÓDIGO DE `4043421`: ver la entrada del 2026-10-10 en `CHANGELOG.md` (cuántos
 * fallan con `src/` devuelto a ese commit, sin stash).
 *
 * Ref: `docs/features/campaigns.md` § «Tope de reintentos», `docs/PENDIENTES.md` §5.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ═══════════════════════════════════════════════════════════════
// El doble de Supabase
// ═══════════════════════════════════════════════════════════════

type Fila = Record<string, unknown>
type Op = 'select' | 'insert' | 'update'

let tablas: Record<string, Fila[]> = {}
/** Si devuelve true, esa operación contesta con un error de base. */
let fallo: ((tabla: string, op: Op, carga: Fila) => boolean) | null = null
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

/** El `.or()` de `findInactiveCustomers` y de `getCustomers`: «col.is.null,col.lt.VALOR». */
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
  order(c: string, o?: { ascending?: boolean }): Constructor
  range(desde: number, hasta: number): Constructor
  limit(n: number): Constructor
  single(): Constructor
  maybeSingle(): Constructor
  then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown): Promise<unknown>
}

function consulta(tabla: string): Constructor {
  const filtros: Array<(f: Fila) => boolean> = []
  let op: Op = 'select'
  let carga: Fila = {}
  let limite = Infinity
  let desdeFila = 0
  let orden: { col: string; asc: boolean } | null = null
  let modo: 'varias' | 'una' | 'una-o-ninguna' = 'varias'

  function ejecutar(): { data: unknown; error: { message: string; code?: string } | null } {
    if (fallo?.(tabla, op, carga)) return { data: null, error: { message: 'boom-db', code: '57014' } }
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
    if (orden) {
      const { col, asc } = orden
      elegidas.sort((a, b) => (comparar(a[col], b[col]) ?? 0) * (asc ? 1 : -1))
    }
    const recortadas = elegidas.slice(desdeFila, desdeFila + limite)
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
    order: (c, o) => ((orden = { col: c, asc: o?.ascending !== false }), b),
    range: (desde, hasta) => ((desdeFila = desde), (limite = hasta - desde + 1), b),
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
const CUMPLE = 'HX_CUMPLE'
const RECORDATORIO = 'HX_RECORDATORIO'

interface TenantDePrueba {
  id: string
  slug: string
  messaging_provider?: 'twilio' | 'zernio'
}
let tenantActual: TenantDePrueba = { id: 'tenant-A', slug: 'marca-a' }

/** `admin_settings` de la marca de prueba. */
let ajustes: Record<string, string> = {}

const enviados: Array<{ telefono: string; plantilla: string }> = []
/** Teléfonos a los que el proveedor «falla» (devuelve null) y la causa que deja en message_logs. */
let fallanEnElProveedor = new Map<string, { code: string; message: string } | null>()

vi.mock('@/services/whatsapp.service', () => ({
  sendTemplateMessage: vi.fn(
    async (telefono: string, plantilla: string, _v: unknown, tenant: { id: string }, log?: { customerId?: string }) => {
      if (fallanEnElProveedor.has(telefono)) {
        // Lo que hace el choke-point de verdad: deja la causa en message_logs y devuelve null.
        const causa = fallanEnElProveedor.get(telefono)
        if (causa) {
          tablas.message_logs.push({
            id: `log-${siguienteId++}`,
            tenant_id: tenant.id,
            customer_id: log?.customerId ?? null,
            template_sid: plantilla,
            status: 'failed',
            error_code: causa.code,
            error_message: causa.message,
            created_at: new Date().toISOString(),
          })
        }
        return null
      }
      enviados.push({ telefono, plantilla })
      return { sid: `SM-${telefono}`, status: 'sent' }
    }
  ),
}))
vi.mock('@/lib/validators/cron', () => ({ validateCronSecret: () => true }))
vi.mock('@/lib/tenant', () => ({
  getTenantBySlug: async () => tenantActual,
  getActiveTenants: async () => [tenantActual],
}))
vi.mock('@/services/settings.service', () => ({
  getMultipleSettings: async (keys: string[]) =>
    Object.fromEntries(keys.filter((k) => ajustes[k] !== undefined).map((k) => [k, ajustes[k]])),
  getSettingValue: async (key: string) => ajustes[key] ?? null,
  getReactivationDaysConfig: async () => ({ softDays: 21, aggressiveDays: 25 }),
}))
// «Aprobada»: el recordatorio pregunta por la aprobación (PL-2-a) y este archivo es del tope de
// reintentos, no de eso (vive en `pl-2-a-recordatorio-sin-aprobar.test.ts`). El cumpleaños no la
// consulta aquí: `birthday_upcoming_template_sid` nunca se pone en `ajustes`.
vi.mock('@/services/twilio-catalog.service', () => ({ isTwilioTemplateApproved: async () => true }))
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

interface CandidatoDePrueba {
  grant_id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  prize_title: string
  expires_at: string
  days_left: number
}
let candidatos: CandidatoDePrueba[] = []
const sellados: string[] = []
vi.mock('@/services/reward-grant.service', () => ({
  grantReward: vi.fn(async () => ({ ok: true })),
  expireGrants: async () => 0,
  findGrantsDueForReminder: async () => candidatos,
  markReminderSent: async (ids: string[]) => {
    sellados.push(...ids)
  },
}))

// ═══════════════════════════════════════════════════════════════
// Los datos
// ═══════════════════════════════════════════════════════════════

/** Sábado 10 de octubre de 2026, 20:00 UTC: la hora del cron de reactivación. */
const AHORA = new Date('2026-10-10T20:00:00.000Z')
const DIA = 24 * 60 * 60 * 1000
const haceDias = (d: number) => new Date(AHORA.getTime() - d * DIA).toISOString()
const enDias = (d: number) => new Date(AHORA.getTime() + d * DIA).toISOString()

function cliente(id: string, telefono: string, diasSinVenir: number, extra: Fila = {}): Fila {
  const fila: Fila = {
    id,
    tenant_id: tenantActual.id,
    name: id,
    phone: telefono,
    total_points: 0,
    total_visits: 3,
    last_visit_at: haceDias(diasSinVenir),
    accepts_marketing: true,
    whatsapp_opt_out_at: null,
    last_campaign_at: null,
    birthday: null,
    created_at: haceDias(400),
    ...extra,
  }
  tablas.customers.push(fila)
  return fila
}

/** Una campaña por (tipo, source, día), como `getOrCreateTodayCampaign()`. */
function campana(tipo: string, source: string, dias: number): string {
  const id = `camp-${source}-${dias}`
  if (!tablas.campaigns.some((c) => c.id === id)) {
    tablas.campaigns.push({ id, tenant_id: tenantActual.id, name: `${source}_${haceDias(dias).slice(0, 10)}`, type: tipo, source })
  }
  return id
}

function mensaje(clienteId: string, tipo: string, source: string, dias: number, status: 'sent' | 'failed' | 'delivered') {
  tablas.campaign_messages.push({
    id: `msg-${siguienteId++}`,
    campaign_id: campana(tipo, source, dias),
    customer_id: clienteId,
    tenant_id: tenantActual.id,
    status,
    // Así los graban los crons: con `sent_at` aunque falle.
    sent_at: haceDias(dias),
  })
}

async function correr(cron: 'reactivation' | 'birthday' | 'reward-reminder') {
  const { GET } =
    cron === 'reactivation'
      ? await import('@/app/api/cron/reactivation/route')
      : cron === 'birthday'
        ? await import('@/app/api/cron/birthday/route')
        : await import('@/app/api/cron/reward-reminder/route')
  const res = await GET({ url: `http://localhost/api/cron/${cron}?tenant=marca-a` } as unknown as NextRequest)
  return { status: res.status, body: await res.json() }
}

const plantillasDe = (telefono: string) => enviados.filter((e) => e.telefono === telefono).map((e) => e.plantilla)
const filasDe = (clienteId: string) => tablas.campaign_messages.filter((m) => m.customer_id === clienteId)
const hoyMMDD = () => {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  tablas = { customers: [], campaigns: [], campaign_messages: [], message_logs: [], admin_settings: [] }
  fallo = null
  enviados.length = 0
  sellados.length = 0
  candidatos = []
  fallanEnElProveedor = new Map()
  tenantActual = { id: 'tenant-A', slug: 'marca-a' }
  ajustes = {
    reactivation_no_reward_template_sid: SUAVE,
    reactivation_aggressive_template_sid: INSISTENTE,
    birthday_template_sid: CUMPLE,
    reward_reminder_enabled: 'true',
    reward_reminder_days_before: '5',
    reward_reminder_template_sid: RECORDATORIO,
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════
// R1 — tope de reintentos
// ═══════════════════════════════════════════════════════════════

describe('R1 · tope de reintentos: tres fallidos por toque y no se intenta más', () => {
  it('suave: con 3 fallidos en este ciclo no se intenta; con 2, sí (antes: un intento cada día)', async () => {
    // Día 24: zona del suave (21–25). Los fallidos caen después de last_visit + 21 = hace 3 días.
    cliente('eva', '3000000001', 24)
    mensaje('eva', 'reactivation', 'reactivation', 2, 'failed')
    mensaje('eva', 'reactivation', 'reactivation', 1, 'failed')
    mensaje('eva', 'reactivation', 'reactivation', 0.5, 'failed')
    cliente('flor', '3000000002', 24)
    mensaje('flor', 'reactivation', 'reactivation', 2, 'failed')
    mensaje('flor', 'reactivation', 'reactivation', 1, 'failed')

    const { body } = await correr('reactivation')

    expect(plantillasDe('3000000001')).toEqual([])
    expect(plantillasDe('3000000002')).toEqual([SUAVE])
    expect(body.skipped_retry_cap).toBe(1)
  })

  it('insistente: con 3 fallidos desde el umbral no se intenta más hasta que vuelva', async () => {
    // Visitó hace 40: suave al día 21 (hace 19), insistente desde el día 25 (hace 15).
    cliente('dani', '3000000003', 40, { last_campaign_at: haceDias(10) })
    mensaje('dani', 'reactivation', 'reactivation', 19, 'sent')
    mensaje('dani', 'reactivation', 'reactivation', 10, 'failed')
    mensaje('dani', 'reactivation', 'reactivation', 9, 'failed')
    mensaje('dani', 'reactivation', 'reactivation', 8, 'failed')

    await correr('reactivation')

    expect(plantillasDe('3000000003')).toEqual([])
  })

  it('los fallidos VIEJOS cuentan: uno de septiembre deja dos intentos más, no tres', async () => {
    // Visitó hace 60 (10-08 de agosto); el umbral del insistente es hace 35 (5 de septiembre).
    cliente('gus', '3000000004', 60)
    mensaje('gus', 'reactivation', 'reactivation', 20, 'failed') // 20 de septiembre
    cliente('hugo', '3000000005', 60)
    mensaje('hugo', 'reactivation', 'reactivation', 20, 'failed')
    mensaje('hugo', 'reactivation', 'reactivation', 12, 'failed')
    mensaje('hugo', 'reactivation', 'reactivation', 11, 'failed')

    await correr('reactivation')

    expect(plantillasDe('3000000004')).toEqual([INSISTENTE])
    expect(plantillasDe('3000000005')).toEqual([])
  })

  it('los fallidos de un ciclo ANTERIOR (antes de la última visita) no cuentan', async () => {
    cliente('ines', '3000000006', 40, { last_campaign_at: haceDias(19) })
    mensaje('ines', 'reactivation', 'reactivation', 19, 'sent')
    mensaje('ines', 'reactivation', 'reactivation', 200, 'failed')
    mensaje('ines', 'reactivation', 'reactivation', 199, 'failed')
    mensaje('ines', 'reactivation', 'reactivation', 198, 'failed')

    await correr('reactivation')

    expect(plantillasDe('3000000006')).toEqual([INSISTENTE])
  })

  it('cumpleaños: con 3 fallidos de este cumpleaños no se intenta otra vez', async () => {
    cliente('juan', '3000000007', 3, { birthday: `1990-${hoyMMDD()}` })
    mensaje('juan', 'birthday', 'birthday', 0.3, 'failed')
    mensaje('juan', 'birthday', 'birthday', 0.2, 'failed')
    mensaje('juan', 'birthday', 'birthday', 0.1, 'failed')
    cliente('karen', '3000000008', 3, { birthday: `1991-${hoyMMDD()}` })
    // Fallidos del cumpleaños del año pasado: no son de ESTE cumpleaños.
    mensaje('karen', 'birthday', 'birthday', 365, 'failed')
    mensaje('karen', 'birthday', 'birthday', 366, 'failed')
    mensaje('karen', 'birthday', 'birthday', 367, 'failed')

    const { body } = await correr('birthday')

    expect(plantillasDe('3000000007')).toEqual([])
    expect(plantillasDe('3000000008')).toEqual([CUMPLE])
    expect(body.skipped_retry_cap).toBe(1)
  })

  it('recordatorio de premio: con 3 fallidos dentro de la ventana del aviso no se intenta', async () => {
    // Vence en 1 día; con 5 días de aviso la ventana empezó hace 4.
    candidatos = [
      { grant_id: 'g-luis', customer_id: 'luis', customer_name: 'Luis', customer_phone: '3000000009', prize_title: 'Postre', expires_at: enDias(1), days_left: 1 },
      { grant_id: 'g-mar', customer_id: 'mar', customer_name: 'Mar', customer_phone: '3000000010', prize_title: 'Postre', expires_at: enDias(1), days_left: 1 },
    ]
    mensaje('luis', 'reactivation', 'reward_reminder', 3, 'failed')
    mensaje('luis', 'reactivation', 'reward_reminder', 2, 'failed')
    mensaje('luis', 'reactivation', 'reward_reminder', 1, 'failed')
    // Tres fallidos de un recordatorio de OTRO premio, de antes de esta ventana: no cuentan.
    mensaje('mar', 'reactivation', 'reward_reminder', 30, 'failed')
    mensaje('mar', 'reactivation', 'reward_reminder', 29, 'failed')
    mensaje('mar', 'reactivation', 'reward_reminder', 28, 'failed')

    const { body } = await correr('reward-reminder')

    expect(plantillasDe('3000000009')).toEqual([])
    expect(plantillasDe('3000000010')).toEqual([RECORDATORIO])
    expect(body.skipped_retry_cap).toBe(1)
  })

  it('un fallo de base al contar los fallidos LANZA (no intenta a ciegas)', async () => {
    const { agotoLosIntentosDelSuave, agotoLosIntentosDelCumpleanos } = await import('@/services/campaign.service')
    fallo = (t) => t === 'campaign_messages'
    await expect(agotoLosIntentosDelSuave('ana', haceDias(24), 21)).rejects.toThrow(/boom-db/)
    await expect(agotoLosIntentosDelCumpleanos('ana')).rejects.toThrow(/boom-db/)
  })
})

// ═══════════════════════════════════════════════════════════════
// R2 — lo que salió queda marcado aunque la corrida aborte
// ═══════════════════════════════════════════════════════════════

/** Falla toda lectura de campaign_messages en cuanto la corrida grabó su primer mensaje. */
const falloDespuesDelPrimerEnvio = (t: string, op: Op) =>
  t === 'campaign_messages' && op === 'select' && tablas.campaign_messages.length > 0

describe('R2 · si la corrida aborta, a los que ya recibieron se les marca igual', () => {
  it('reactivación: el primero recibió, la base falla con el segundo → al primero se le marca last_campaign_at', async () => {
    const ana = cliente('ana', '3000000001', 22)
    cliente('beto', '3000000002', 23)
    fallo = falloDespuesDelPrimerEnvio

    const { status } = await correr('reactivation')

    expect(status).toBe(500)
    expect(plantillasDe('3000000001')).toEqual([SUAVE])
    expect(ana.last_campaign_at).toBe(AHORA.toISOString())
  })

  it('cumpleaños: igual', async () => {
    const ana = cliente('ana', '3000000001', 3, { birthday: `1990-${hoyMMDD()}` })
    cliente('beto', '3000000002', 3, { birthday: `1991-${hoyMMDD()}` })
    fallo = falloDespuesDelPrimerEnvio

    const { status } = await correr('birthday')

    expect(status).toBe(500)
    expect(plantillasDe('3000000001')).toEqual([CUMPLE])
    expect(ana.last_campaign_at).toBe(AHORA.toISOString())
  })

  it('un envío que SALIÓ y no se pudo grabar no queda como «fallido» (mañana se repetiría) y sí se marca', async () => {
    const ana = cliente('ana', '3000000001', 22)
    fallo = (t, op, carga) => t === 'campaign_messages' && op === 'insert' && carga.status === 'sent'

    const { status } = await correr('reactivation')

    expect(status).toBe(500)
    expect(filasDe('ana').filter((m) => m.status === 'failed')).toEqual([])
    expect(ana.last_campaign_at).toBe(AHORA.toISOString())
  })

  it('recordatorio: un aviso que salió y no se pudo grabar se SELLA igual (antes: mañana otra vez)', async () => {
    candidatos = [
      { grant_id: 'g-ana', customer_id: 'ana', customer_name: 'Ana', customer_phone: '3000000001', prize_title: 'Postre', expires_at: enDias(1), days_left: 1 },
      { grant_id: 'g-beto', customer_id: 'beto', customer_name: 'Beto', customer_phone: '3000000002', prize_title: 'Postre', expires_at: enDias(1), days_left: 1 },
    ]
    fallo = (t, op, carga) => t === 'campaign_messages' && op === 'insert' && carga.customer_id === 'beto' && carga.status === 'sent'

    const { status } = await correr('reward-reminder')

    expect(status).toBe(500)
    expect([...sellados].sort()).toEqual(['g-ana', 'g-beto'])
    expect(filasDe('beto').filter((m) => m.status === 'failed')).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// R5 — la causa real del fallo
// ═══════════════════════════════════════════════════════════════

describe('R5 · campaign_messages.error_message dice la causa real, no «Twilio no configurado»', () => {
  it('Twilio: proveedor, código y mensaje del proveedor', async () => {
    cliente('ana', '3000000001', 22)
    fallanEnElProveedor.set('3000000001', { code: '63016', message: 'Failed to send freeform message outside the window' })

    await correr('reactivation')

    const [fila] = filasDe('ana')
    expect(fila.status).toBe('failed')
    expect(fila.error_message).toBe('twilio · 63016 · Failed to send freeform message outside the window')
  })

  it('Zernio: dice zernio, aunque el texto viejo dijera Twilio (Planeta Wings, 5 y 6 de octubre)', async () => {
    tenantActual = { id: 'tenant-A', slug: 'marca-a', messaging_provider: 'zernio' }
    cliente('ana', '3000000001', 40, { last_campaign_at: haceDias(19) })
    mensaje('ana', 'reactivation', 'reactivation', 19, 'sent')
    fallanEnElProveedor.set('3000000001', { code: '400', message: 'Template not approved' })

    await correr('reactivation')

    const fallida = filasDe('ana').find((m) => m.status === 'failed')
    expect(fallida?.error_message).toBe('zernio · 400 · Template not approved')
  })

  it('sin causa en message_logs, al menos el proveedor real', async () => {
    tenantActual = { id: 'tenant-A', slug: 'marca-a', messaging_provider: 'zernio' }
    cliente('ana', '3000000001', 3, { birthday: `1990-${hoyMMDD()}` })
    fallanEnElProveedor.set('3000000001', null)

    await correr('birthday')

    const [fila] = filasDe('ana')
    expect(fila.error_message).toMatch(/^zernio · /)
  })

  it('cumpleaños y recordatorio también graban la causa', async () => {
    cliente('ana', '3000000001', 3, { birthday: `1990-${hoyMMDD()}` })
    fallanEnElProveedor.set('3000000001', { code: 'opted_out_local', message: 'Cliente con opt-out activo' })
    await correr('birthday')
    expect(filasDe('ana')[0].error_message).toBe('twilio · opted_out_local · Cliente con opt-out activo')

    candidatos = [
      { grant_id: 'g-beto', customer_id: 'beto', customer_name: 'Beto', customer_phone: '3000000002', prize_title: 'Postre', expires_at: enDias(1), days_left: 1 },
    ]
    fallanEnElProveedor.set('3000000002', { code: 'line_budget_exhausted', message: 'Cupo diario de la línea agotado' })
    await correr('reward-reminder')
    expect(filasDe('beto')[0].error_message).toBe('twilio · line_budget_exhausted · Cupo diario de la línea agotado')
  })
})

// ═══════════════════════════════════════════════════════════════
// R4 — el filtro de Clientes sigue los días de la marca
// ═══════════════════════════════════════════════════════════════

describe('R4 · el filtro Activos / Recuperación / Perdidos de Clientes sale de la escala de la marca', () => {
  it('con suave 30 / insistente 40, un cliente a 35 días está en Recuperación, no Perdido (antes: 18/25 fijos)', async () => {
    const { getCustomers } = await import('@/services/dashboard.service')
    ajustes.reactivation_soft_days = '30'
    ajustes.reactivation_aggressive_days = '40'
    cliente('nico', '3000000011', 35)

    const perdidos = await getCustomers({ status: 'lost' }, tenantActual.id)
    const recuperacion = await getCustomers({ status: 'inactive' }, tenantActual.id)

    expect(perdidos.customers.map((c) => c.id)).toEqual([])
    expect(recuperacion.customers.map((c) => c.id)).toEqual(['nico'])
  })
})
