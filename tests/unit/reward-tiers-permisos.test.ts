/**
 * Quién puede CAMBIAR los premios — `puedeEscribirEnLaMarca()`.
 *
 * El agujero que esto cierra (auditoría adversarial 2026-09-09, ESTADO §3
 * punto 0.BETA): `/api/dashboard/reward-tiers` autenticaba sus cuatro verbos con
 * `requireTenantId()`, que solo comprueba que el JWT traiga una marca. Un
 * **administrador de UNA sede** pasaba esa puerta igual que el dueño y podía
 * editar y borrar los premios de la marca **y los de sus sedes hermanas**.
 *
 * Se prueba la decisión PURA, no la ruta: es donde vive la lógica, y los
 * alcances se construyen con `decideLocationScope()` —la única forma honesta de
 * fabricar un `LocationScope`, que es un tipo opaco a propósito— en vez de con
 * un objeto literal y un `as`.
 *
 * Código: `src/lib/location-scope.ts` · `src/app/api/dashboard/reward-tiers/route.ts`
 * Doc: `docs/features/multi-sede.md` §3.septies
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { decideLocationScope, puedeEscribirEnLaMarca, type LocationScope } from '@/lib/location-scope'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000000'
const SEDE_1 = 'bbbbbbbb-0000-4000-8000-000000000001'
const SEDE_2 = 'cccccccc-0000-4000-8000-000000000002'

/** Un alcance de verdad, salido de la única fábrica pura que hay. */
function alcance(params: {
  permissions: { location_id: string | null; role: string }[]
  activeLocationIds: string[]
}): LocationScope {
  const r = decideLocationScope({
    tenantId: TENANT,
    permissions: params.permissions,
    activeLocationIds: params.activeLocationIds,
    requested: null,
  })
  if (!r.ok) throw new Error(`el alcance no se pudo resolver: ${r.error}`)
  return r.scope
}

describe('puedeEscribirEnLaMarca — la puerta de las escrituras de premios', () => {
  it('un super usuario de la marca puede', () => {
    const scope = alcance({
      permissions: [{ location_id: null, role: 'brand' }],
      activeLocationIds: [SEDE_1, SEDE_2],
    })
    expect(puedeEscribirEnLaMarca({ scope, esSuperAdmin: false })).toBe(true)
  })

  it('EL AGUJERO: un administrador de sede NO puede', () => {
    const scope = alcance({
      permissions: [{ location_id: SEDE_1, role: 'location' }],
      activeLocationIds: [SEDE_1, SEDE_2],
    })
    expect(scope.role).toBe('location')
    expect(puedeEscribirEnLaMarca({ scope, esSuperAdmin: false })).toBe(false)
  })

  it('un administrador de sede tampoco puede en una marca de UNA sola sede', () => {
    // La sede única no lo asciende: el rol es explícito y manda.
    const scope = alcance({
      permissions: [{ location_id: SEDE_1, role: 'location' }],
      activeLocationIds: [SEDE_1],
    })
    expect(puedeEscribirEnLaMarca({ scope, esSuperAdmin: false })).toBe(false)
  })

  it('el operador de Cada1 puede aunque el alcance no se haya podido resolver', () => {
    // Es el caso real: no tiene fila en `dashboard_user_locations` de las marcas
    // de sus clientes, así que con 2+ sedes `requireLocationScope()` le contesta
    // 403 y `scope` llega `null`. En SQL ese `OR` ya existe (`is_super_admin()`
    // en las policies de la 00045); esto es su mitad en TypeScript.
    expect(puedeEscribirEnLaMarca({ scope: null, esSuperAdmin: true })).toBe(true)
  })

  it('el operador de Cada1 puede aun mirando desde el alcance de una sede', () => {
    const scope = alcance({
      permissions: [{ location_id: SEDE_1, role: 'location' }],
      activeLocationIds: [SEDE_1, SEDE_2],
    })
    expect(puedeEscribirEnLaMarca({ scope, esSuperAdmin: true })).toBe(true)
  })

  it('FAIL-CLOSED: sin alcance y sin super-admin, no se escribe', () => {
    // `scope === null` es lo que llega cuando no hay sesión, cuando el JWT no
    // trae marca, cuando el usuario no tiene alcance en una marca de 2+ sedes
    // — y cuando la BASE FALLÓ. Ninguno de esos autoriza nada.
    expect(puedeEscribirEnLaMarca({ scope: null, esSuperAdmin: false })).toBe(false)
  })

  it('las 5 marcas vivas (una sede, sin filas de alcance) siguen escribiendo', () => {
    // El guardrail que no se negocia: con 0 o 1 sede activa NADA cambia.
    const unaSede = alcance({ permissions: [], activeLocationIds: [SEDE_1] })
    const ceroSedes = alcance({ permissions: [], activeLocationIds: [] })
    expect(puedeEscribirEnLaMarca({ scope: unaSede, esSuperAdmin: false })).toBe(true)
    expect(puedeEscribirEnLaMarca({ scope: ceroSedes, esSuperAdmin: false })).toBe(true)
  })
})

describe('la ruta de premios usa esa puerta en los tres verbos que escriben', () => {
  // Una red de red: la lógica ya está probada arriba, pero nada impide que
  // alguien vuelva a poner `requireTenantId()` en un verbo. Es una lectura de
  // texto a propósito — importar el módulo de ruta arrastraría `next/headers`.
  const fuente = () =>
    fs.readFileSync(
      path.resolve(__dirname, '../../src/app/api/dashboard/reward-tiers/route.ts'),
      'utf8'
    )

  it('POST, PATCH y DELETE llaman a `exigirAlcanceDeMarca()`', () => {
    const llamadas = fuente().match(/await exigirAlcanceDeMarca\(request\)/g) ?? []
    expect(llamadas).toHaveLength(3)
  })

  it('el GET sigue siendo el único que autentica con `requireTenantId()`', () => {
    // Si esto falla porque el GET pasó a exigir alcance: acordate de que el
    // panel manda `?location_id=brand`, que `decideLocationScope()` rechaza, y
    // de que `dashboard/settings` hace `r.ok ? r.json() : []`.
    const cuerpo = fuente().split('export async function GET')[1] ?? ''
    expect(cuerpo.split('export async function')[0]).toContain('await requireTenantId()')
  })
})
