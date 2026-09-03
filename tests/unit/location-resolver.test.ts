/**
 * La resolución de SEDE — multi-sede F3.
 *
 * Spec: `docs/superpowers/specs/2026-09-02-multisede-design.md` §3.1 y §3.2
 * Código: `src/lib/location-resolver.ts`
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 * ───────────────────────────
 * El check-in es el camino más caliente del producto y hasta F3 no tenía **ni un test**.
 * Y la precedencia de señales es la regla que decide de qué sede es cada visita: si se
 * equivoca, D12 ("efectividad por sede") reporta números falsos y **nadie se entera**, porque
 * una sede mal resuelta se ve exactamente igual que una bien resuelta.
 *
 * Aquí se prueba la lógica PURA (sin base de datos). El contrato con el schema real —los
 * CHECK, la FK compuesta y el tri-estado tal como los guarda Postgres— se prueba contra un
 * Postgres de verdad en `tests/db/multisede-resolucion.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import {
  LOCATION_SOURCES,
  pickLocationForHost,
  resolveVisitLocation,
  resolveDirectLocation,
  type ActiveLocation,
} from '@/lib/location-resolver'

const ENVIGADO = 'aaaaaaaa-0000-4000-8000-000000000001'
const LAURELES = 'bbbbbbbb-0000-4000-8000-000000000002'

function sede(id: string, over: Partial<ActiveLocation> = {}): ActiveLocation {
  return {
    id,
    name: id === ENVIGADO ? 'Envigado' : 'Laureles',
    slug: id === ENVIGADO ? 'envigado' : 'laureles',
    domain: null,
    is_primary: false,
    ...over,
  }
}

// ═══════════════════════════════════════════════════════════════
// §3.2 — la regla del dominio raíz («sede única implícita»)
// ═══════════════════════════════════════════════════════════════

describe('pickLocationForHost — sede única implícita (§3.2)', () => {
  it('con UNA sede activa, el dominio raíz atribuye a esa sede con source host_single', () => {
    // Es el caso de los 4 tenants vivos: atribución perfecta y gratis, sin subdominio
    // nuevo y sin reimprimir un solo QR.
    const pick = pickLocationForHost(
      'clubsushiservice.constelarys.com',
      'clubsushiservice.constelarys.com',
      [sede(ENVIGADO, { is_primary: true, domain: 'clubsushiservice.constelarys.com' })]
    )

    expect(pick.locationId).toBe(ENVIGADO)
    expect(pick.source).toBe('host_single')
    expect(pick.requiresChoice).toBe(false)
    expect(pick.choices).toEqual([])
  })

  it('con DOS sedes activas, el dominio raíz deja de atribuir y pide elegir', () => {
    // «Se auto-corrige: el día que uno abra su segunda sede, el dominio raíz deja de
    // atribuir automáticamente» (§3.2, textual).
    const pick = pickLocationForHost('marca.com', 'marca.com', [
      sede(ENVIGADO, { is_primary: true }),
      sede(LAURELES),
    ])

    expect(pick.locationId).toBeNull()
    expect(pick.source).toBeNull()
    expect(pick.requiresChoice).toBe(true)
    expect(pick.choices.map((l) => l.id)).toEqual([ENVIGADO, LAURELES])
  })

  it('el dominio raíz manda AUNQUE la sede principal repita ese mismo dominio', () => {
    // La 00042 le deja a la sede principal el `domain` de la marca. Si aquí se resolviera
    // por coincidencia exacta de `domain`, la marca con 2 sedes seguiría atribuyéndole TODO
    // a la principal — exactamente el silencio que el §3.2 quiere evitar.
    const pick = pickLocationForHost('marca.com', 'marca.com', [
      sede(ENVIGADO, { is_primary: true, domain: 'marca.com' }),
      sede(LAURELES, { domain: 'laureles.marca.com' }),
    ])

    expect(pick.requiresChoice).toBe(true)
    expect(pick.locationId).toBeNull()
  })

  it('sin ninguna sede activa no hay sede ni pregunta: no hay entre qué elegir', () => {
    const pick = pickLocationForHost('marca.com', 'marca.com', [])
    expect(pick.locationId).toBeNull()
    expect(pick.source).toBeNull()
    expect(pick.requiresChoice).toBe(false)
  })
})

describe('pickLocationForHost — el subdominio de la sede (§3.3)', () => {
  it('el subdominio propio de una sede la resuelve con source host, sin preguntar', () => {
    const pick = pickLocationForHost('laureles.marca.com', 'marca.com', [
      sede(ENVIGADO, { is_primary: true, domain: 'marca.com' }),
      sede(LAURELES, { domain: 'laureles.marca.com' }),
    ])

    expect(pick.locationId).toBe(LAURELES)
    expect(pick.source).toBe('host')
    expect(pick.requiresChoice).toBe(false)
  })

  it('un host que no es ni la marca ni ninguna sede queda en sede desconocida', () => {
    const pick = pickLocationForHost('otra.cosa.com', 'marca.com', [
      sede(LAURELES, { domain: 'laureles.marca.com' }),
    ])

    expect(pick.locationId).toBeNull()
    expect(pick.source).toBeNull()
    expect(pick.requiresChoice).toBe(false)
  })

  it('una sede sin dominio propio nunca se resuelve por host aunque el host sea null', () => {
    // Guarda contra `null === null`: si `domain` fuera NULL y el host también, una
    // comparación ingenua le atribuiría todas las visitas sin host a esa sede.
    expect(pickLocationForHost(null, 'marca.com', [sede(LAURELES)]).locationId).toBeNull()
    expect(
      pickLocationForHost('cualquiera.com', 'marca.com', [sede(LAURELES, { domain: null })])
        .locationId
    ).toBeNull()
  })

  it('sin `tenants.domain` el host solo puede resolver por el dominio de una sede', () => {
    const conSede = pickLocationForHost('laureles.marca.com', null, [
      sede(LAURELES, { domain: 'laureles.marca.com' }),
    ])
    expect(conSede.source).toBe('host')

    // Sin dominio de marca, ningún host es "el dominio raíz": no hay sede única implícita.
    const sinSede = pickLocationForHost('marca.com', null, [sede(ENVIGADO)])
    expect(sinSede.locationId).toBeNull()
    expect(sinSede.requiresChoice).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// §3.1 — la precedencia: mesero → dispositivo → host → NULL
// ═══════════════════════════════════════════════════════════════

describe('resolveVisitLocation — precedencia de señales (§3.1)', () => {
  it('el mesero autenticado le GANA al host', () => {
    // El caso concreto del spec: un cliente parado en Laureles abre su enlace guardado de
    // `envigado.marca.com`. Si ganara el host, la visita se acreditaría a Envigado y el
    // reporte de D12 mentiría sin que nadie lo note.
    const res = resolveVisitLocation({
      staffLocationId: LAURELES,
      hostLocationId: ENVIGADO,
      hostSource: 'host',
    })

    expect(res.locationId).toBe(LAURELES)
    expect(res.source).toBe('staff_user')
  })

  it('el dispositivo de confianza le gana al host, pero pierde contra el mesero', () => {
    expect(
      resolveVisitLocation({ deviceLocationId: LAURELES, hostLocationId: ENVIGADO, hostSource: 'host' })
    ).toMatchObject({ locationId: LAURELES, source: 'staff_device' })

    expect(
      resolveVisitLocation({ staffLocationId: ENVIGADO, deviceLocationId: LAURELES })
    ).toMatchObject({ locationId: ENVIGADO, source: 'staff_user' })
  })

  it('sin mesero ni dispositivo manda el host, conservando SU procedencia', () => {
    expect(
      resolveVisitLocation({ hostLocationId: ENVIGADO, hostSource: 'host_single' })
    ).toMatchObject({ locationId: ENVIGADO, source: 'host_single' })

    expect(
      resolveVisitLocation({ hostLocationId: LAURELES, hostSource: 'host' })
    ).toMatchObject({ locationId: LAURELES, source: 'host' })
  })

  it('sin ninguna señal la sede es NULL y la procedencia también', () => {
    const res = resolveVisitLocation({})
    expect(res.locationId).toBeNull()
    expect(res.source).toBeNull()
    expect(res.conflict).toBeNull()
  })

  it('el QR NUNCA decide la sede, ni siquiera cuando es la única señal', () => {
    // Conflicto 7 de §11: «Actor autenticado → host → NULL. El QR solo detecta conflictos.»
    const res = resolveVisitLocation({ qrLocationId: LAURELES })
    expect(res.locationId).toBeNull()
    expect(res.source).toBeNull()
  })

  it('media pareja host (sede sin procedencia) se descarta entera', () => {
    // El CHECK `visits_location_pareja_check` exige que vayan juntas o no vayan. Que la
    // invariante se cumpla POR CONSTRUCCIÓN es lo que impide un 23514 dentro del `catch`
    // best-effort del check-in, donde la visita se perdería en silencio.
    const res = resolveVisitLocation({ hostLocationId: ENVIGADO, hostSource: null })
    expect(res.locationId).toBeNull()
    expect(res.source).toBeNull()
  })

  it.each([
    ['staffLocationId', { staffLocationId: ENVIGADO }],
    ['deviceLocationId', { deviceLocationId: ENVIGADO }],
    ['host', { hostLocationId: ENVIGADO, hostSource: 'host' as const }],
    ['nada', {}],
  ])('la invariante "sede y procedencia van juntas o no van" se cumple con %s', (_n, señales) => {
    const res = resolveVisitLocation(señales)
    expect(res.locationId === null).toBe(res.source === null)
  })

  it('toda procedencia que produce el resolver está en el CHECK de la 00043', () => {
    for (const señales of [
      { staffLocationId: ENVIGADO },
      { deviceLocationId: ENVIGADO },
      { hostLocationId: ENVIGADO, hostSource: 'host' as const },
      { hostLocationId: ENVIGADO, hostSource: 'host_single' as const },
    ]) {
      const { source } = resolveVisitLocation(señales)
      expect(LOCATION_SOURCES).toContain(source)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// El TRI-ESTADO de `location_conflict`
// ═══════════════════════════════════════════════════════════════

describe('resolveVisitLocation — location_conflict es TRI-ESTADO', () => {
  it('NULL cuando el QR no trae claim `loc`: no se evaluó', () => {
    // Poner `false` aquí afirmaría "verificado, sin conflicto" sobre algo que nadie
    // verificó — el mismo error que la 00043 evitó al no poner NOT NULL DEFAULT false
    // sobre ~1581 visitas históricas.
    const res = resolveVisitLocation({ hostLocationId: ENVIGADO, hostSource: 'host' })
    expect(res.conflict).toBeNull()
  })

  it('NULL cuando hay claim `loc` pero no se resolvió ninguna sede: no hay contra qué comparar', () => {
    expect(resolveVisitLocation({ qrLocationId: LAURELES }).conflict).toBeNull()
  })

  it('false cuando el QR coincide con la sede resuelta', () => {
    const res = resolveVisitLocation({
      hostLocationId: ENVIGADO,
      hostSource: 'host',
      qrLocationId: ENVIGADO,
    })
    expect(res.conflict).toBe(false)
  })

  it('true cuando el QR decía OTRA sede — y aun así la sede resuelta no cambia', () => {
    const res = resolveVisitLocation({
      staffLocationId: LAURELES,
      qrLocationId: ENVIGADO,
    })
    expect(res.conflict).toBe(true)
    // Detecta, no decide: la sede sigue siendo la del mesero.
    expect(res.locationId).toBe(LAURELES)
    expect(res.source).toBe('staff_user')
  })
})

// ═══════════════════════════════════════════════════════════════
// Señales autenticadas que no pasan por el host (D9)
// ═══════════════════════════════════════════════════════════════

describe('resolveDirectLocation — domicilios y correcciones manuales', () => {
  it('arma la pareja completa cuando hay sede', () => {
    expect(resolveDirectLocation(ENVIGADO, 'authorized_number')).toEqual({
      locationId: ENVIGADO,
      source: 'authorized_number',
      conflict: null,
    })
  })

  it.each([null, undefined, ''])('sin sede no inventa procedencia (%s)', (v) => {
    expect(resolveDirectLocation(v, 'authorized_number')).toEqual({
      locationId: null,
      source: null,
      conflict: null,
    })
  })
})
