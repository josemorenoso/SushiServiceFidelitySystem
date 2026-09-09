/**
 * A qué sede se le pueden mandar los domicilios de un número — `decidirSedeDestino()`.
 *
 * El hueco que esto cierra (preparación del día 1 de las 12 sedes, 2026-09-09):
 * `authorized_numbers.location_id` existía desde la 00043 y el panel **nunca lo escribía**,
 * así que todos los domicilios de todas las sedes caían al mismo cubo de «sede desconocida».
 * Al abrir esa escritura aparecen dos formas de hacer daño que la base NO frena:
 *
 *   1. La FK compuesta `(location_id, tenant_id)` de la 00043 impide la sede de otra MARCA,
 *      pero **no** la sede hermana de la misma marca: un administrador de sede podría
 *      apuntar el número al local de al lado y quedarse con sus domicilios.
 *   2. Dejar un número en NULL siendo administrador de sede lo hace desaparecer de su propio
 *      panel en el mismo acto (§5.1: `role='location'` nunca ve `location_id IS NULL`).
 *
 * Se prueba la decisión PURA, no la ruta, y los alcances se construyen con
 * `decideLocationScope()` —la única fábrica honesta de un `LocationScope`, que es un tipo
 * opaco a propósito— en vez de con un objeto literal y un `as`.
 *
 * Código: `src/lib/authorized-number-sede.ts` · `src/app/api/dashboard/authorized-numbers/[id]/route.ts`
 * Doc: `docs/features/delivery-webhook.md`
 */

import { describe, it, expect } from 'vitest'
import { decideLocationScope, type LocationScope } from '@/lib/location-scope'
import { decidirSedeDestino } from '@/lib/authorized-number-sede'

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000000'
const SEDE_1 = 'bbbbbbbb-0000-4000-8000-000000000001'
const SEDE_2 = 'cccccccc-0000-4000-8000-000000000002'
const SEDE_APAGADA = 'dddddddd-0000-4000-8000-000000000003'

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

const marca = () =>
  alcance({
    permissions: [{ location_id: null, role: 'brand' }],
    activeLocationIds: [SEDE_1, SEDE_2],
  })

const adminDeSede1 = () =>
  alcance({
    permissions: [{ location_id: SEDE_1, role: 'location' }],
    activeLocationIds: [SEDE_1, SEDE_2],
  })

describe('decidirSedeDestino — a qué sede puede apuntar un número de domicilios', () => {
  it('el super usuario de la marca puede apuntarlo a cualquiera de sus sedes', () => {
    expect(decidirSedeDestino(marca(), SEDE_1).ok).toBe(true)
    expect(decidirSedeDestino(marca(), SEDE_2).ok).toBe(true)
  })

  it('el super usuario de la marca puede dejarlo SIN sede: el cubo NULL es suyo y lo ve', () => {
    expect(decidirSedeDestino(marca(), null).ok).toBe(true)
  })

  it('un administrador de sede puede apuntarlo a LA SUYA', () => {
    expect(decidirSedeDestino(adminDeSede1(), SEDE_1).ok).toBe(true)
  })

  it('EL AGUJERO: un administrador de sede NO puede apuntarlo a la sede hermana', () => {
    // La FK compuesta no lo frena —SEDE_2 es de la misma marca—, así que si esta guarda no
    // existe, se lleva los domicilios del local de al lado.
    const r = decidirSedeDestino(adminDeSede1(), SEDE_2)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('un administrador de sede NO puede dejarlo sin sede: perdería el número de vista', () => {
    const scope = adminDeSede1()
    expect(scope.canSeeUnassigned).toBe(false)
    const r = decidirSedeDestino(scope, null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('dejarías de verlo')
  })

  it('nadie puede apuntarlo a una sede DESACTIVADA, ni siquiera la marca', () => {
    // `activeLocationIds` no la trae, así que no está en `allowedLocationIds`. Atribuirle
    // domicilios a un local cerrado es un error de dedo, no una intención.
    const r = decidirSedeDestino(marca(), SEDE_APAGADA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('nadie puede apuntarlo a una sede inventada', () => {
    expect(decidirSedeDestino(marca(), 'eeeeeeee-0000-4000-8000-000000000009').ok).toBe(false)
  })
})
