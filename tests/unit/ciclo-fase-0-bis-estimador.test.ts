/**
 * N3-ter (ciclo fase 0.bis, 2026-10-10): `GET /api/dashboard/campaigns/estimate` contestaba
 * `{ count: 0 }` ante un error de base, y la burbuja o el preset decían «nadie a quién
 * escribirle». Un fallo no es un cero: ahora es un 500 y deja `[CampaignEstimate][FALLO]`.
 *
 * Contra el código de `4043421` este test falla (respondía 200 con count 0).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

/** Un constructor de PostgREST que, al resolverse, devuelve el `resultado` de la prueba. */
let resultado: { count: number | null; error: { message: string; code?: string } | null } = { count: 0, error: null }

function constructor(): Record<string, unknown> {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'ilike', 'gte', 'lte', 'gt', 'lt', 'or']) b[m] = () => b
  b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, ko)
  return b
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => constructor() }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) } }),
}))
vi.mock('@/lib/tenant', () => ({ requireTenantId: async () => 'tenant-A' }))
vi.mock('@/services/settings.service', () => ({ getRecoveryZoneConfig: async () => ({ startDays: 18, endDays: 25 }) }))

async function estimar() {
  const { GET } = await import('@/app/api/dashboard/campaigns/estimate/route')
  const res = await GET({ url: 'http://localhost/api/dashboard/campaigns/estimate?minDays=26' } as unknown as NextRequest)
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('N3-ter · el estimador de campañas no disfraza un fallo de base de «0 clientes»', () => {
  it('un error de base responde 500 y deja el log de fallo', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    resultado = { count: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } }

    const { status, body } = await estimar()

    expect(status).toBe(500)
    expect(body.count).toBeUndefined()
    expect(log.mock.calls.some((c) => String(c[0]).includes('[CampaignEstimate][FALLO]'))).toBe(true)
  })

  it('sin error, el conteo sigue igual', async () => {
    resultado = { count: 42, error: null }

    const { status, body } = await estimar()

    expect(status).toBe(200)
    expect(body).toEqual({ count: 42 })
  })
})
