/**
 * Ciclo de recuperación, fase 0 — UNA sola escala de días (2026-10-08).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * En la misma pantalla de Campañas había tres relojes: las burbujas (`RISK_LEVELS`, fijas:
 * 7-10 / 11-15 / 16-21 / 22+), la tira «Ciclo de recuperación» (derivada de los días de la
 * marca: 1-7 / 7-17 / 18-25 / 26+) y el cron (21 y 25). Ahora las bandas salen de una sola
 * función, `deriveCycleBands()`, con los mismos días que el cron, y la leen la tira, el panel
 * (`getFullAnalytics()`), el demo y el estimador de la burbuja.
 *
 * CONTRA EL CÓDIGO VIEJO (comprobado el 2026-10-08, `src/` devuelto a `HEAD` por `git show`):
 * fallan los 9.
 *
 * Ref: `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md` §1 (problema 2).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { LocationScope } from '@/lib/location-scope'
import { deriveCycleBands, deriveRiskLevels, RISK_LEVELS, getRiskLevel } from '@/constants/rankings'
import { deriveRecoveryZone, normalizeReactivationDays, FREQUENCY_CAP_DAYS } from '@/constants/rewards'

const rango = (b: { minDays: number; maxDays: number }) =>
  b.maxDays === Infinity ? `${b.minDays}+` : `${b.minDays}-${b.maxDays}`

describe('deriveCycleBands() — la escala', () => {
  it('con los defaults (21 / 25) da lo que muestra la tira de Campañas: 0-6 · 7-17 · 18-25 · 26+', () => {
    expect(deriveCycleBands().map((b) => [b.name, rango(b)])).toEqual([
      ['Reciente', '0-6'],
      ['Ventana', '7-17'],
      ['Recuperación', '18-25'],
      ['Perdido', '26+'],
    ])
  })

  it('las burbujas (RISK_LEVELS) son esas mismas bandas sin «Reciente»', () => {
    expect(RISK_LEVELS.map((b) => [b.name, rango(b)])).toEqual([
      ['Ventana', '7-17'],
      ['Recuperación', '18-25'],
      ['Perdido', '26+'],
    ])
  })

  it('se mueve con los días de la marca, igual que la zona del cron', () => {
    const zona = deriveRecoveryZone(15, 20) // 12-20
    expect(deriveRiskLevels('15', '20').map((b) => [b.name, rango(b)])).toEqual([
      ['Ventana', `${FREQUENCY_CAP_DAYS}-${zona.startDays - 1}`],
      ['Recuperación', `${zona.startDays}-${zona.endDays}`],
      ['Perdido', `${zona.endDays + 1}+`],
    ])
  })

  it('basura en Ajustes cae a los defaults, como en el cron (`normalizeReactivationDays`)', () => {
    expect(deriveCycleBands('abc', '-3')).toEqual(deriveCycleBands())
    expect(normalizeReactivationDays('abc', '-3')).toEqual({ softDays: 21, aggressiveDays: 25 })
  })

  it('con un suave muy temprano la Ventana queda vacía y no se devuelve', () => {
    expect(deriveCycleBands(10, 14).map((b) => b.name)).toEqual(['Reciente', 'Recuperación', 'Perdido'])
  })

  it('para toda configuración, las bandas cubren 0…∞ sin huecos ni solapes', () => {
    for (let suave = 1; suave <= 60; suave++) {
      for (let insistente = suave + 1; insistente <= suave + 40; insistente++) {
        const bandas = deriveCycleBands(suave, insistente)
        expect(bandas[0].minDays).toBe(0)
        expect(bandas[bandas.length - 1].maxDays).toBe(Infinity)
        for (let i = 1; i < bandas.length; i++) {
          expect(bandas[i].minDays).toBe(bandas[i - 1].maxDays + 1)
        }
      }
    }
  })

  it('getRiskLevel: «Reciente» no es riesgo; el resto cae en su banda', () => {
    expect(getRiskLevel(6)).toBeUndefined()
    expect(getRiskLevel(7)?.name).toBe('Ventana')
    expect(getRiskLevel(18)?.name).toBe('Recuperación')
    expect(getRiskLevel(26)?.name).toBe('Perdido')
  })
})

// ═══════════════════════════════════════════════════════════════
// El panel: getFullAnalytics() agrupa con los días DE LA MARCA
// ═══════════════════════════════════════════════════════════════

type Fila = Record<string, unknown>
let tablas: Record<string, Fila[]> = {}

interface Constructor {
  select(...args: unknown[]): Constructor
  eq(col: string, valor: unknown): Constructor
  in(col: string, valores: unknown[]): Constructor
  gte(col: string, valor: unknown): Constructor
  not(col: string, op: string, valor: unknown): Constructor
  order(...args: unknown[]): Constructor
  range(desde: number, hasta: number): Constructor
  then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown): Promise<unknown>
}

function constructorPara(tabla: string): Constructor {
  const filtros: Array<(f: Fila) => boolean> = []
  let rango_: [number, number] = [0, Infinity]
  const b: Constructor = {
    select: () => b,
    eq: (col, valor) => (filtros.push((f) => f[col] === valor), b),
    in: (col, valores) => (filtros.push((f) => valores.includes(f[col])), b),
    gte: (col, valor) => (filtros.push((f) => f[col] != null && String(f[col]) >= String(valor)), b),
    not: (col) => (filtros.push((f) => f[col] != null), b),
    order: () => b,
    range: (desde, hasta) => ((rango_ = [desde, hasta]), b),
    then: (ok, ko) => {
      const filas = (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)))
      return Promise.resolve({ data: filas.slice(rango_[0], rango_[1] + 1), error: null }).then(ok, ko)
    },
  }
  return b
}

vi.mock('@/lib/supabase/unscoped', () => ({
  getUnscopedServiceClient: () => ({ from: (tabla: string) => constructorPara(tabla) }),
}))

const A = 'tenant-A'
const AHORA = new Date('2026-10-08T20:00:00.000Z')
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 24 * 60 * 60 * 1000 - 60_000).toISOString()

function cliente(i: number, diasSinVenir: number): Fila {
  return {
    id: `c-${i}`,
    tenant_id: A,
    name: `Cliente ${i}`,
    phone: `30000000${i}`,
    total_visits: 2,
    created_at: '2026-01-01T00:00:00.000Z',
    last_visit_at: haceDias(diasSinVenir),
    birthday: null,
  }
}

const alcance = () =>
  ({
    tenantId: A,
    role: 'brand',
    allowedLocationIds: [],
    canSeeUnassigned: true,
    selection: 'all',
    locationIds: null,
    includesUnassigned: true,
    brandActiveLocationCount: 0,
  }) as unknown as LocationScope

async function burbujas() {
  const { getFullAnalytics } = await import('@/services/dashboard.service')
  const a = await getFullAnalytics(alcance())
  return a.brand.atRiskGroups.map((g) => [g.level, g.daysRange, g.count])
}

describe('el panel lee la misma escala', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AHORA)
    // 3 días (reciente), 9, 14 y 25 días sin venir.
    tablas = {
      customers: [cliente(1, 3), cliente(2, 9), cliente(3, 14), cliente(4, 25)],
      visits: [],
      campaigns: [],
      campaign_messages: [],
      admin_settings: [],
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('una marca que no tocó sus días ve las bandas por defecto', async () => {
    expect(await burbujas()).toEqual([
      ['Ventana', '7-17 días', 2],
      ['Recuperación', '18-25 días', 1],
      ['Perdido', '26+ días', 0],
    ])
  })

  it('una marca con suave 15 / insistente 20 ve SUS bandas (las mismas que su tira)', async () => {
    tablas.admin_settings = [
      { tenant_id: A, key: 'reactivation_soft_days', value: '15' },
      { tenant_id: A, key: 'reactivation_aggressive_days', value: '20' },
      { tenant_id: 'tenant-B', key: 'reactivation_soft_days', value: '40' },
    ]
    expect(await burbujas()).toEqual([
      ['Ventana', '7-11 días', 1],
      ['Recuperación', '12-20 días', 1],
      ['Perdido', '21+ días', 1],
    ])
  })
})
