/**
 * P1-a, N7 y N8 — un fallo de base no puede verse como «no hay nada que hacer» (2026-10-11).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * N7 · `getCustomersAtMonthlyCap()` metía todos los uuid en UN `.in()` sin paginar y, ante
 *      un error, devolvía un Set vacío: «nadie llegó al tope», y el tope de 3 al mes NO se
 *      aplicaba, sin log. `findInactiveCustomers()` no paginaba: PostgREST corta en 1.000
 *      en silencio y una marca grande dejaba fuera de la reactivación al resto.
 * N8 · `getActiveTenants()` devolvía `[]` ante un error —los tres crons respondían
 *      `ok: true, tenants_processed: 0`— y `getTenantByDomain()` devolvía `null` sin dejar
 *      rastro. El drenador no leía el `error` de las escrituras posteriores al envío.
 *
 * CÓMO SE PRUEBA
 * ──────────────
 * El código DE VERDAD; falso solo Supabase (un doble que graba cada llamada y contesta lo
 * que el test le dice) y, para el drenador, los servicios que no deciden lo que se mira acá.
 *
 * CONTRA EL CÓDIGO DE `2746d49`: ver la entrada del 2026-10-11 en `CHANGELOG.md`.
 *
 * Ref: `docs/PENDIENTES.md` §5 · `docs/features/campaigns.md` · `send-governance.md`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ═══════════════════════════════════════════════════════════════
// El doble de Supabase: graba la cadena y contesta con `responder()`
// ═══════════════════════════════════════════════════════════════

interface Llamada {
  tabla: string
  op: 'select' | 'insert' | 'update'
  carga: unknown
  in: Array<[string, unknown[]]>
  eq: Array<[string, unknown]>
  range: [number, number] | null
  order: string | null
  single: boolean
}

type Respuesta = { data: unknown; error: { message: string; code?: string } | null }

let llamadas: Llamada[] = []
let responder: (l: Llamada) => Respuesta = () => ({ data: [], error: null })

function builder(tabla: string): unknown {
  const l: Llamada = { tabla, op: 'select', carga: null, in: [], eq: [], range: null, order: null, single: false }
  const b: Record<string, unknown> = {}
  const encadenar = () => b
  Object.assign(b, {
    select: encadenar,
    insert: (c: unknown) => ((l.op = 'insert'), (l.carga = c), b),
    update: (c: unknown) => ((l.op = 'update'), (l.carga = c), b),
    eq: (c: string, x: unknown) => (l.eq.push([c, x]), b),
    in: (c: string, xs: unknown[]) => (l.in.push([c, xs]), b),
    gte: encadenar,
    gt: encadenar,
    lt: encadenar,
    not: encadenar,
    is: encadenar,
    or: encadenar,
    order: (c: string) => ((l.order = c), b),
    range: (d: number, h: number) => ((l.range = [d, h]), b),
    single: () => ((l.single = true), b),
    maybeSingle: () => ((l.single = true), b),
    then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
      llamadas.push(l)
      return Promise.resolve(responder(l)).then(ok, ko)
    },
  })
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (tabla: string) => builder(tabla) }),
}))

// `@/lib/tenant` importa el cliente SSR (cookies): fuera del alcance de estas pruebas.
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const FALLO = { message: 'canceling statement due to statement timeout', code: '57014' }

let consola: { mock: { calls: unknown[][] } }
const logs = () => consola.mock.calls.map((c) => c.map(String).join(' ')).join('\n')

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-de-prueba')
  vi.stubEnv('CRON_SECRET', 'secreto')
  llamadas = []
  responder = () => ({ data: [], error: null })
  consola = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════
// N7 · el tope mensual
// ═══════════════════════════════════════════════════════════════

describe('N7 · getCustomersAtMonthlyCap', () => {
  it('ante un error de base LANZA y deja log: nunca «nadie llegó al tope»', async () => {
    const { getCustomersAtMonthlyCap } = await import('@/services/campaign.service')
    responder = () => ({ data: null, error: FALLO })

    await expect(getCustomersAtMonthlyCap([uuid(1), uuid(2)])).rejects.toThrow(/tope mensual/)
    expect(logs()).toMatch(/\[MonthlyCap\]\[FALLO\] reason=monthly_cap_error code=57014/)
  })

  it('con miles de clientes reparte los uuid en lotes chicos (la URL no revienta)', async () => {
    const { getCustomersAtMonthlyCap, LOTE_DEL_TOPE_MENSUAL } = await import('@/services/campaign.service')
    const ids = Array.from({ length: 2_000 }, (_, i) => uuid(i))

    await getCustomersAtMonthlyCap(ids)

    const lotes = llamadas.filter((l) => l.tabla === 'campaign_messages').map((l) => l.in.find(([c]) => c === 'customer_id')![1])
    expect(lotes.length).toBe(Math.ceil(2_000 / LOTE_DEL_TOPE_MENSUAL))
    expect(Math.max(...lotes.map((x) => x.length))).toBeLessThanOrEqual(LOTE_DEL_TOPE_MENSUAL)
    expect(new Set(lotes.flat()).size).toBe(2_000)
  })

  it('cuenta los mensajes de TODAS las páginas: el cliente de la fila 1.001 también llega al tope', async () => {
    const { getCustomersAtMonthlyCap } = await import('@/services/campaign.service')
    // 1.000 filas de relleno de otros clientes y, en la página 2, los 3 de este.
    responder = (l) => {
      if (l.tabla !== 'campaign_messages') return { data: [], error: null }
      if (!l.range || l.range[0] === 0) {
        return { data: Array.from({ length: 1_000 }, (_, i) => ({ id: `m${i}`, customer_id: uuid(10_000 + i) })), error: null }
      }
      return { data: [1, 2, 3].map((n) => ({ id: `z${n}`, customer_id: uuid(1) })), error: null }
    }

    const tope = await getCustomersAtMonthlyCap([uuid(1)])
    expect(tope.has(uuid(1))).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// N7 · las búsquedas de los crons
// ═══════════════════════════════════════════════════════════════

describe('N7 · findInactiveCustomers', () => {
  it('pagina de a 1.000 hasta el final: no corta en la primera página', async () => {
    const { findInactiveCustomers } = await import('@/services/campaign.service')
    responder = (l) => {
      const desde = l.range?.[0] ?? 0
      const total = 2_345
      const n = Math.max(0, Math.min(1_000, total - desde))
      return { data: Array.from({ length: n }, (_, i) => ({ id: uuid(desde + i) })), error: null }
    }

    const inactivos = await findInactiveCustomers(uuid(999))
    expect(inactivos).toHaveLength(2_345)
    expect(llamadas.every((l) => l.order === 'id')).toBe(true)
  })

  it('un error de base lanza y queda en el log', async () => {
    const { findInactiveCustomers } = await import('@/services/campaign.service')
    responder = () => ({ data: null, error: FALLO })
    await expect(findInactiveCustomers(uuid(999))).rejects.toThrow(/inactivos/)
    expect(logs()).toMatch(/\[Campaigns\]\[FALLO\] reason=inactive_customers_error/)
  })
})

describe('N7 · findBirthdayCustomers', () => {
  it('un error de base deja log además de lanzar', async () => {
    const { findBirthdayCustomers } = await import('@/services/campaign.service')
    responder = () => ({ data: null, error: FALLO })
    await expect(findBirthdayCustomers(uuid(999))).rejects.toThrow(/cumpleañeros/)
    expect(logs()).toMatch(/\[Campaigns\]\[FALLO\] reason=birthday_customers_error/)
  })
})

// ═══════════════════════════════════════════════════════════════
// N8 · tenant.ts
// ═══════════════════════════════════════════════════════════════

describe('N8 · getActiveTenants', () => {
  it('un error de base LANZA: el cron no responde «0 marcas, todo bien»', async () => {
    const { getActiveTenants } = await import('@/lib/tenant')
    responder = () => ({ data: null, error: FALLO })
    await expect(getActiveTenants()).rejects.toThrow(/marcas activas/)
    expect(logs()).toMatch(/\[Tenant\]\[FALLO\] reason=getActiveTenants_error code=57014/)
  })

  it('sin error devuelve las marcas, como siempre', async () => {
    const { getActiveTenants } = await import('@/lib/tenant')
    responder = () => ({ data: [{ id: uuid(1), slug: 'a' }], error: null })
    await expect(getActiveTenants()).resolves.toHaveLength(1)
  })
})

describe('N8 · getTenantByDomain (conserva firma y no lanza: es superficie pública)', () => {
  it('un error de base devuelve null PERO deja log', async () => {
    const { getTenantByDomain } = await import('@/lib/tenant')
    responder = () => ({ data: null, error: FALLO })
    await expect(getTenantByDomain('sushi.constelarys.com')).resolves.toBeNull()
    expect(logs()).toMatch(/\[Tenant\]\[FALLO\] reason=getTenantByDomain_error code=57014 .*domain=sushi\.constelarys\.com/)
  })

  it('«no existe» no ensucia el log', async () => {
    const { getTenantByDomain } = await import('@/lib/tenant')
    responder = () => ({ data: null, error: null })
    await expect(getTenantByDomain('nadie.constelarys.com')).resolves.toBeNull()
    expect(logs()).toBe('')
  })
})

// ═══════════════════════════════════════════════════════════════
// N7 + N8 · el drenador de la cola
// ═══════════════════════════════════════════════════════════════

const TENANT = { id: uuid(500), slug: 'marca', messaging_provider: 'twilio' }
const item = (n: number) => ({
  id: `q${n}`,
  tenant_id: TENANT.id,
  phone: `+57300000000${n}`,
  customer_id: uuid(n),
  imported_contact_id: null,
  campaign_id: uuid(900),
  message_type: 'manual',
  template_sid: 'HX1',
  variables: {},
  attempts: 1,
  media_url: null,
  media_type: null,
})

const enviar = vi.fn()
const marcarFallido = vi.fn()
let topeMensual: () => Promise<{ eligible: unknown[]; excluded: unknown[] }>

vi.mock('@/lib/validators/cron', () => ({ validateCronSecret: () => true }))
vi.mock('@/services/imported-contacts.service', () => ({ markImportedContactsResult: async () => {} }))
vi.mock('@/services/whatsapp.service', () => ({ sendTemplateMessage: (...a: unknown[]) => enviar(...a) }))
vi.mock('@/services/club-optin.service', () => ({ resolveGoldenBulletProvider: async () => 'twilio' }))
vi.mock('@/services/line-budget.service', () => ({
  getLineBudget: async () => ({ lineStatus: 'ok', enforced: true, campaignAvailable: 10 }),
}))
vi.mock('@/services/customer.service', () => ({ isPhoneOptedOut: async () => false }))
vi.mock('@/services/settings.service', () => ({ getRecoveryZoneConfig: async () => ({ minDays: 1, maxDays: 2 }) }))
vi.mock('@/services/send-queue.service', () => ({
  expireQueue: async () => 0,
  getPendingTenants: async () => [{ tenant_id: TENANT.id }],
  claimQueueBatch: vi.fn(),
  markQueueItemSent: async () => {},
  markQueueItemFailed: (...a: unknown[]) => marcarFallido(...a),
  cancelQueueItem: async () => {},
  getCampaignQueuedCount: async () => 1,
  getFinishedCampaigns: async () => [],
  pruneSendGovernance: async () => {},
}))
vi.mock('@/services/campaign.service', async (original) => {
  const real = (await original()) as Record<string, unknown>
  return { ...real, filterByMonthlyCap: () => topeMensual() }
})
vi.mock('@/lib/tenant', async (original) => {
  const real = (await original()) as Record<string, unknown>
  return { ...real, getTenantById: async () => TENANT }
})

async function drenar() {
  const { claimQueueBatch } = await import('@/services/send-queue.service')
  const reclamar = claimQueueBatch as unknown as ReturnType<typeof vi.fn>
  reclamar.mockReset()
  reclamar.mockResolvedValueOnce([item(1), item(2)]).mockResolvedValue([])
  const { GET } = await import('@/app/api/cron/queue-drain/route')
  const req = new Request('https://x/api/cron/queue-drain', { headers: { authorization: 'Bearer secreto' } })
  return GET(req as never)
}

describe('N7 + N8 · queue-drain', () => {
  beforeEach(() => {
    enviar.mockReset()
    marcarFallido.mockReset()
    marcarFallido.mockResolvedValue('retry')
    topeMensual = async () => ({ eligible: [], excluded: [] })
    responder = (l) =>
      l.tabla === 'customers' && l.op === 'select'
        ? {
            data: [1, 2].map((n) => ({ id: uuid(n), last_campaign_at: null, last_visit_at: null, whatsapp_opt_out_at: null })),
            error: null,
          }
        : { data: [], error: null }
  })

  it('si el tope mensual no se puede verificar, la tanda NO sale y vuelve a la cola; la corrida sigue (200)', async () => {
    topeMensual = async () => {
      throw new Error('No se pudo verificar el tope mensual de marketing: timeout')
    }

    const res = await drenar()

    expect(res.status).toBe(200)
    expect(enviar).not.toHaveBeenCalled()
    expect(marcarFallido).toHaveBeenCalledTimes(2)
    expect(String(marcarFallido.mock.calls[0][1])).toMatch(/tope mensual/)
  })

  it('un fallo al grabar campaign_messages después del envío queda en el log', async () => {
    enviar.mockResolvedValue({ sid: 'SM1' })
    const base = responder
    responder = (l) => (l.tabla === 'campaign_messages' && l.op === 'insert' ? { data: null, error: FALLO } : base(l))

    const res = await drenar()

    expect(res.status).toBe(200)
    expect(enviar).toHaveBeenCalledTimes(2)
    expect(logs()).toMatch(/\[QueueDrain\]\[FALLO\] reason=campaign_messages_insert_error code=57014/)
  })

  it('un fallo al marcar last_campaign_at después del envío queda en el log', async () => {
    enviar.mockResolvedValue({ sid: 'SM1' })
    const base = responder
    responder = (l) => (l.tabla === 'customers' && l.op === 'update' ? { data: null, error: FALLO } : base(l))

    await drenar()

    expect(logs()).toMatch(/\[QueueDrain\]\[FALLO\] reason=last_campaign_at_error code=57014/)
  })
})
