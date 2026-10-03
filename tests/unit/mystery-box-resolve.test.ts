/**
 * `POST /api/mystery-box/resolve` solo otorga el nivel que `check-in/status` ofrece.
 *
 * EL AGUJERO (auditoría 2026-09-28, AISLA-1, docs/AUDITORIA-ESCALA-1000-2026-09-28.md §1.1)
 * ──────────────────────────────────────────────────────────────────────────────────────
 * La ruta es pública, tomaba `tier_id` del body y lo buscaba con `getTierById()`, que no
 * filtraba por marca. Solo comparaba puntos contra el umbral. Cualquier cliente de una
 * marca se generaba premios SIN LÍMITE —cada llamada un `mystery_box_results`, un
 * `reward_grant` que el mesero ve para entregar y un WhatsApp que paga la marca—, con
 * los niveles de su marca o con los de otra (los ids los expone `check-in/status`).
 *
 * LA REGLA QUE SE FIJA
 * ────────────────────
 * Se otorga solo el nivel que `GET /api/check-in/status` le ofrecería en ese momento:
 * de ESA marca (y de esa sede), alcanzado y sin reclamar. «Sin reclamar» es la regla de
 * la 00059 (`claimed_tier_key` o `claimed_threshold`), la misma función que usa status:
 * `getNivelOfrecido()`. Y con límite de tasa.
 *
 * ⚠️ Sin base y sin red. La base es un doble EN MEMORIA que respeta los `.eq()`: un doble
 * que ignorara los filtros haría pasar la prueba de «otra marca» por la razón
 * equivocada. Las escrituras (`resolveMysteryBox`, `grantReward`) y el WhatsApp son
 * espías: lo que se prueba es que NO se llamen.
 *
 * Código: `src/app/api/mystery-box/resolve/route.ts` · `src/services/reward-tiers.service.ts`
 * Doc: `docs/features/points-mystery-box.md` §7.4.ter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ═══════════════════════════════════════════════════════════════
// La base en memoria
// ═══════════════════════════════════════════════════════════════

type Fila = Record<string, unknown>
let tablas: Record<string, Fila[]> = {}
/** Tablas que contestan con error (para probar el fallo de base). */
let tablasRotas = new Set<string>()

function consulta(tabla: string) {
  const filtros: Array<(f: Fila) => boolean> = []
  let unaSola: 'single' | 'maybe' | null = null

  const resolver = () => {
    if (tablasRotas.has(tabla)) {
      return { data: null, error: { code: '08006', message: `conexión caída leyendo ${tabla}` } }
    }
    const filas = (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)))
    if (unaSola === 'single') {
      return filas.length === 1
        ? { data: filas[0], error: null }
        : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    }
    if (unaSola === 'maybe') return { data: filas[0] ?? null, error: null }
    return { data: filas, error: null }
  }

  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: (col: string, val: unknown) => {
      filtros.push((f) => f[col] === val)
      return builder
    },
    in: (col: string, vals: unknown[]) => {
      filtros.push((f) => vals.includes(f[col]))
      return builder
    },
    single: () => {
      unaSola = 'single'
      return builder
    },
    maybeSingle: () => {
      unaSola = 'maybe'
      return builder
    },
    then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve(resolver()).then(ok, ko),
  }
  return builder
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (tabla: string) => consulta(tabla) }),
}))

// ═══════════════════════════════════════════════════════════════
// Marca, cliente y niveles
// ═══════════════════════════════════════════════════════════════

const MARCA = { id: 'aaaaaaaa-0000-4000-8000-000000000001', slug: 'sushi-service', config: {} }
const OTRA_MARCA = 'bbbbbbbb-0000-4000-8000-000000000002'

function nivel(over: Partial<Fila> & { id: string; tenant_id: string; point_threshold: number }): Fila {
  return {
    tier_name: `Nivel ${over.point_threshold}`,
    safe_reward_title: 'Bebida gratis',
    mystery_box_enabled: true,
    mystery_prizes: [{ title: 'Postre', probability: 100, emoji: '🍰' }],
    is_black: false,
    sort_order: over.point_threshold,
    is_active: true,
    location_id: null,
    tier_key: `key-${over.id}`,
    ...over,
  }
}

const BRONCE = nivel({ id: 'tier-bronce', tenant_id: MARCA.id, point_threshold: 100 })
const PLATA = nivel({ id: 'tier-plata', tenant_id: MARCA.id, point_threshold: 200 })
/** Un nivel de OTRA marca, con umbral alcanzable: el id lo expone su `check-in/status`. */
const AJENO = nivel({ id: 'tier-ajeno', tenant_id: OTRA_MARCA, point_threshold: 50 })

let telefonoSeq = 0
/** Un celular distinto por prueba: el límite de tasa vive en memoria del módulo. */
function nuevoCliente(puntos = 250) {
  telefonoSeq += 1
  const phone = `30012345${String(telefonoSeq).padStart(2, '0')}`
  return { id: `cust-${telefonoSeq}`, phone, name: 'Ana', total_points: puntos, tenant_id: MARCA.id }
}

let clienteActual: ReturnType<typeof nuevoCliente>

vi.mock('@/lib/tenant', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  return {
    ...original,
    getTenantByHost: async () => MARCA,
    resolveHostContext: async () => ({ tenant: MARCA, locationId: null }),
  }
})

vi.mock('@/services/customer.service', () => ({
  findCustomerByPhone: async (phone: string, tenantId: string) =>
    phone === clienteActual.phone && tenantId === MARCA.id ? clienteActual : null,
}))

vi.mock('@/services/settings.service', () => ({
  getMultipleSettings: async () => ({
    reward_safe_template_sid: 'HX_safe',
    mystery_box_result_template_sid: 'HX_mystery',
    golden_box_result_template_sid: 'HX_golden',
  }),
}))

// ═══════════════════════════════════════════════════════════════
// Espías: lo que NO tiene que pasar
// ═══════════════════════════════════════════════════════════════

const resolverCaja = vi.fn(async (p: { tier: Fila; choice: string }) => ({
  resultId: 'res-1',
  choice: p.choice,
  prizeTitle: String(p.tier.safe_reward_title),
  prizeEmoji: '🎁',
  prizeIndex: -1,
  wasGolden: false,
  allPrizes: [],
  effectivePrizes: [],
}))
const otorgar = vi.fn(async () => ({ ok: true as const, grant: { id: 'grant-1' } }))
const mandarWhatsapp = vi.fn(async () => ({ sid: 'SM1' }))

vi.mock('@/services/mystery-box.service', () => ({
  resolveMysteryBox: (p: { tier: Fila; choice: string }) => resolverCaja(p),
  generateNearMissText: () => null,
}))
vi.mock('@/services/reward-grant.service', () => ({
  grantReward: () => otorgar(),
}))
vi.mock('@/services/whatsapp.service', () => ({
  sendTemplateMessage: () => mandarWhatsapp(),
}))

// ═══════════════════════════════════════════════════════════════
// Utilidades
// ═══════════════════════════════════════════════════════════════

async function resolver(tierId: string, choice: 'safe' | 'mystery' = 'safe') {
  const { POST } = await import('@/app/api/mystery-box/resolve/route')
  const req = new Request('https://sushi-service.constelarys.com/api/mystery-box/resolve', {
    method: 'POST',
    body: JSON.stringify({ phone: clienteActual.phone, tier_id: tierId, choice }),
    headers: { 'content-type': 'application/json', host: 'sushi-service.constelarys.com' },
  })
  // La ruta tipa su parámetro como NextRequest, pero solo usa `headers` y `json()`.
  return POST(req as never)
}

function nadaSeEscribio() {
  expect(resolverCaja, 'no se escribe mystery_box_results').not.toHaveBeenCalled()
  expect(otorgar, 'no se escribe reward_grants').not.toHaveBeenCalled()
  expect(mandarWhatsapp, 'no sale WhatsApp').not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  // `getServiceClient()` las exige antes de llamar al doble; sin ellas todo da 500 y la
  // prueba de «otra marca» pasaría por la razón equivocada.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://doble.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'doble')
  tablasRotas = new Set()
  clienteActual = nuevoCliente()
  tablas = {
    reward_tiers: [BRONCE, PLATA, AJENO],
    mystery_box_results: [],
  }
})

// ═══════════════════════════════════════════════════════════════
// Pruebas
// ═══════════════════════════════════════════════════════════════

describe('POST /api/mystery-box/resolve — solo el nivel que status ofrece (AISLA-1)', () => {
  it('el camino legítimo sigue otorgando: el nivel más alto alcanzado y sin reclamar', async () => {
    const res = await resolver(PLATA.id as string)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(resolverCaja).toHaveBeenCalledTimes(1)
    expect(resolverCaja.mock.calls[0][0].tier.id).toBe(PLATA.id)
    expect(otorgar).toHaveBeenCalledTimes(1)
    expect(mandarWhatsapp).toHaveBeenCalledTimes(1)
  })

  it('EL AGUJERO: un nivel de OTRA marca se rechaza sin escribir nada', async () => {
    const res = await resolver(AJENO.id as string)
    expect(res.status).toBeGreaterThanOrEqual(400)
    nadaSeEscribio()
  })

  it('EL AGUJERO: un nivel YA reclamado (por tier_key) se rechaza sin escribir nada', async () => {
    tablas.mystery_box_results = [
      { customer_id: clienteActual.id, claimed_tier_key: PLATA.tier_key, claimed_threshold: 999 },
      { customer_id: clienteActual.id, claimed_tier_key: BRONCE.tier_key, claimed_threshold: 100 },
    ]
    const res = await resolver(PLATA.id as string)
    expect(res.status).toBe(409)
    nadaSeEscribio()
  })

  it('un nivel ya reclamado por UMBRAL (una copia de sede con otro tier_key) también se rechaza', async () => {
    tablas.mystery_box_results = [
      { customer_id: clienteActual.id, claimed_tier_key: 'otra-clave', claimed_threshold: 200 },
    ]
    // Status ofrecería Bronce (el más alto sin reclamar); pedir Plata no vale.
    const res = await resolver(PLATA.id as string)
    expect(res.status).toBe(409)
    nadaSeEscribio()
  })

  it('un nivel de la marca que status no ofrece (no es el más alto sin reclamar) se rechaza', async () => {
    // Alcanzó Plata y Bronce, ninguno reclamado: status ofrece PLATA, no Bronce.
    const res = await resolver(BRONCE.id as string)
    expect(res.status).toBe(409)
    nadaSeEscribio()
  })

  it('un nivel no alcanzado se rechaza', async () => {
    clienteActual = nuevoCliente(150)
    const res = await resolver(PLATA.id as string)
    expect(res.status).toBeGreaterThanOrEqual(400)
    nadaSeEscribio()
  })

  it('si la lista de reclamos no se puede leer, no se otorga (falla cerrado)', async () => {
    tablasRotas.add('mystery_box_results')
    const res = await resolver(PLATA.id as string)
    expect(res.status).toBe(503)
    nadaSeEscribio()
  })

  it('tiene límite de tasa por celular', async () => {
    // Reclamado de entrada: cada intento contesta 409 sin escribir, así la prueba
    // mide el freno y no el anti-duplicado.
    tablas.mystery_box_results = [
      { customer_id: clienteActual.id, claimed_tier_key: PLATA.tier_key, claimed_threshold: 200 },
      { customer_id: clienteActual.id, claimed_tier_key: BRONCE.tier_key, claimed_threshold: 100 },
    ]
    const estados: number[] = []
    for (let i = 0; i < 12; i++) estados.push((await resolver(PLATA.id as string)).status)
    expect(estados).toContain(429)
    nadaSeEscribio()
  })
})
