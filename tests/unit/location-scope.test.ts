/**
 * `decideLocationScope()` — el fail-safe del §5.1, en TypeScript puro.
 *
 * Spec: `docs/superpowers/specs/2026-09-02-multisede-design.md` §5.1, §8.4
 * Código: `src/lib/location-scope.ts`
 *
 * Esta es la MISMA tabla de 4 filas que `can_see_location()` implementa en SQL
 * (`supabase/migrations/00045_permisos_por_sede.sql`, probada contra Postgres real
 * en `tests/db/multisede-permisos.test.ts`). Están escritas dos veces a propósito
 * —dos motores distintos, el RLS y el camino `service_role`— así que aquí se
 * prueba la lógica sin pagar una base de datos, y allá se prueba que el esquema
 * sostiene lo mismo.
 */

import { describe, it, expect } from 'vitest'
import {
  decideLocationScope,
  applyLocationFilter,
  locationMatches,
  scopeWriteLocationId,
  toScopeView,
  type LocationScope,
} from '@/lib/location-scope'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000000'
const SEDE_1 = 'bbbbbbbb-0000-4000-8000-000000000001'
const SEDE_2 = 'cccccccc-0000-4000-8000-000000000002'
const SEDE_OTRA_MARCA = 'dddddddd-0000-4000-8000-000000000009'

describe('decideLocationScope — las 4 filas del §5.1', () => {
  it('fila 1 — sin permisos y ≤1 sede activa: ve la marca (incluida "Sin sede")', () => {
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [],
      activeLocationIds: [SEDE_1],
      requested: null,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.scope.role).toBe('brand')
    expect(r.scope.locationIds).toBeNull() // sin filtro: incluye el cubo NULL
    expect(r.scope.includesUnassigned).toBe(true)
  })

  it('fila 1 — también con CERO sedes activas (tenant recién creado)', () => {
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [],
      activeLocationIds: [],
      requested: null,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.scope.role).toBe('brand')
  })

  it('fila 2 — sin permisos y ≥2 sedes activas: 403', () => {
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [],
      activeLocationIds: [SEDE_1, SEDE_2],
      requested: null,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(403)
  })

  it('fila 3 — role=brand: todas las sedes + el cubo "Sin sede", sin filtro', () => {
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [{ role: 'brand', location_id: null }],
      activeLocationIds: [SEDE_1, SEDE_2],
      requested: null,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.scope.role).toBe('brand')
    expect(r.scope.allowedLocationIds).toEqual([SEDE_1, SEDE_2])
    expect(r.scope.canSeeUnassigned).toBe(true)
    expect(r.scope.locationIds).toBeNull()
    expect(r.scope.includesUnassigned).toBe(true)
  })

  it('fila 4 — role=location: SOLO esas sedes, NUNCA "Sin sede"', () => {
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [{ role: 'location', location_id: SEDE_1 }],
      activeLocationIds: [SEDE_1, SEDE_2],
      requested: null,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.scope.role).toBe('location')
    expect(r.scope.allowedLocationIds).toEqual([SEDE_1])
    expect(r.scope.canSeeUnassigned).toBe(false)
    // "todas" para un usuario de sede es SU lista, nunca null (null solo lo usa marca).
    expect(r.scope.locationIds).toEqual([SEDE_1])
    expect(r.scope.includesUnassigned).toBe(false)
  })

  it('role=location con varias filas: la unión de sus sedes, deduplicada', () => {
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [
        { role: 'location', location_id: SEDE_1 },
        { role: 'location', location_id: SEDE_2 },
        { role: 'location', location_id: SEDE_1 }, // duplicado deliberado
      ],
      activeLocationIds: [SEDE_1, SEDE_2],
      requested: null,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.scope.allowedLocationIds).toEqual([SEDE_1, SEDE_2])
  })

  it('role=location cuyo permiso apunta a una sede YA DESACTIVADA: se intersecta con las activas', () => {
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [{ role: 'location', location_id: SEDE_1 }],
      activeLocationIds: [SEDE_2], // SEDE_1 ya no está activa
      requested: null,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(403)
  })
})

describe('decideLocationScope — lo que pide la petición, colapsado a lo permitido', () => {
  it('"todas" para un usuario de marca es "todas las que ESTE usuario puede ver", no "toda la marca sin filtro implícito en NULL"', () => {
    // Si la ausencia significara "toda la marca" en vez de "colapsar al permitido",
    // una ruta que olvidara el scope filtraría de más — el bug exacto que el §8.4
    // dice que hay que evitar.
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [{ role: 'brand', location_id: null }],
      activeLocationIds: [SEDE_1, SEDE_2],
      requested: 'all',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.scope.selection).toBe('all')
  })

  it('"unknown" para marca: selecciona solo el cubo "Sin sede"', () => {
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [{ role: 'brand', location_id: null }],
      activeLocationIds: [SEDE_1, SEDE_2],
      requested: 'unknown',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.scope.selection).toBe('unknown')
    expect(r.scope.locationIds).toEqual([])
    expect(r.scope.includesUnassigned).toBe(true)
  })

  it('"unknown" para un usuario de sede: 403 — el cubo "Sin sede" es de la marca', () => {
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [{ role: 'location', location_id: SEDE_1 }],
      activeLocationIds: [SEDE_1, SEDE_2],
      requested: 'unknown',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(403)
  })

  it('una sede concreta dentro de lo permitido: selection="one"', () => {
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [{ role: 'brand', location_id: null }],
      activeLocationIds: [SEDE_1, SEDE_2],
      requested: SEDE_2,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.scope.selection).toBe('one')
    expect(r.scope.locationIds).toEqual([SEDE_2])
    expect(r.scope.includesUnassigned).toBe(false)
  })

  it('una sede FUERA de lo permitido (de otra marca o sin acceso): 403, sin distinguir el motivo', () => {
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [{ role: 'location', location_id: SEDE_1 }],
      activeLocationIds: [SEDE_1, SEDE_2],
      requested: SEDE_OTRA_MARCA,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(403)
  })

  it('un `requested` que no es un UUID válido: 403, no 500', () => {
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [{ role: 'brand', location_id: null }],
      activeLocationIds: [SEDE_1],
      requested: 'no-soy-un-uuid',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(403)
  })

  it('`requested` vacío se trata como ausente ("all")', () => {
    const r = decideLocationScope({
      tenantId: TENANT,
      permissions: [{ role: 'brand', location_id: null }],
      activeLocationIds: [SEDE_1],
      requested: '',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.scope.selection).toBe('all')
  })
})

function scope(over: Partial<LocationScope>): LocationScope {
  const base = decideLocationScope({
    tenantId: TENANT,
    permissions: [{ role: 'brand', location_id: null }],
    activeLocationIds: [SEDE_1, SEDE_2],
    requested: null,
  })
  if (!base.ok) throw new Error('fixture inválida')
  return { ...base.scope, ...over }
}

interface FakeQuery {
  calls: Array<{ method: string; args: unknown[] }>
  eq(column: string, value: string): FakeQuery
  in(column: string, values: string[]): FakeQuery
  is(column: string, value: null): FakeQuery
}

function fakeQuery(): FakeQuery {
  const calls: FakeQuery['calls'] = []
  const q: FakeQuery = {
    calls,
    eq(column, value) {
      calls.push({ method: 'eq', args: [column, value] })
      return q
    },
    in(column, values) {
      calls.push({ method: 'in', args: [column, values] })
      return q
    },
    is(column, value) {
      calls.push({ method: 'is', args: [column, value] })
      return q
    },
  }
  return q
}

describe('applyLocationFilter', () => {
  it('marca + "todas": SIN filtro (dejaría fuera el cubo "Sin sede")', () => {
    const q = fakeQuery()
    applyLocationFilter(q, scope({ locationIds: null, includesUnassigned: true }), 'location_id')
    expect(q.calls).toEqual([])
  })

  it('marca + "Sin sede": .is(col, null)', () => {
    const q = fakeQuery()
    applyLocationFilter(q, scope({ locationIds: [], includesUnassigned: true }), 'location_id')
    expect(q.calls).toEqual([{ method: 'is', args: ['location_id', null] }])
  })

  it('una sede concreta: .eq(col, id)', () => {
    const q = fakeQuery()
    applyLocationFilter(q, scope({ locationIds: [SEDE_1], includesUnassigned: false }), 'location_id')
    expect(q.calls).toEqual([{ method: 'eq', args: ['location_id', SEDE_1] }])
  })

  it('usuario de sede + "todas": .in(col, susSedes) — NUNCA trae los NULL', () => {
    const q = fakeQuery()
    applyLocationFilter(
      q,
      scope({ role: 'location', locationIds: [SEDE_1, SEDE_2], includesUnassigned: false }),
      'location_id'
    )
    expect(q.calls).toEqual([{ method: 'in', args: ['location_id', [SEDE_1, SEDE_2]] }])
  })
})

describe('locationMatches — la misma decisión, en memoria', () => {
  it('marca + "todas": coincide con cualquier sede y con NULL', () => {
    const s = scope({ locationIds: null, includesUnassigned: true })
    expect(locationMatches(s, SEDE_1)).toBe(true)
    expect(locationMatches(s, null)).toBe(true)
  })

  it('usuario de sede: NULL nunca coincide', () => {
    const s = scope({ role: 'location', locationIds: [SEDE_1], includesUnassigned: false })
    expect(locationMatches(s, SEDE_1)).toBe(true)
    expect(locationMatches(s, SEDE_2)).toBe(false)
    expect(locationMatches(s, null)).toBe(false)
  })
})

describe('scopeWriteLocationId', () => {
  it('solo devuelve algo con selection="one" — "todas" no puede atribuir una escritura', () => {
    expect(scopeWriteLocationId(scope({ selection: 'one', locationIds: [SEDE_1] }))).toBe(SEDE_1)
    expect(scopeWriteLocationId(scope({ selection: 'all', locationIds: null }))).toBeNull()
    expect(scopeWriteLocationId(scope({ selection: 'unknown', locationIds: [] }))).toBeNull()
  })
})

describe('toScopeView — lo que el selector necesita para dibujarse', () => {
  it('"Todas las sedes" solo se ofrece a un usuario de marca', () => {
    const brand = scope({ role: 'brand' })
    const location = scope({ role: 'location', canSeeUnassigned: false })
    expect(toScopeView(brand, []).canSeeAll).toBe(true)
    expect(toScopeView(location, []).canSeeAll).toBe(false)
  })

  it('selectedLocationId solo se rellena con selection="one"', () => {
    const s = scope({ selection: 'one', locationIds: [SEDE_1] })
    expect(toScopeView(s, []).selectedLocationId).toBe(SEDE_1)
    const all = scope({ selection: 'all', locationIds: null })
    expect(toScopeView(all, []).selectedLocationId).toBeNull()
  })
})
