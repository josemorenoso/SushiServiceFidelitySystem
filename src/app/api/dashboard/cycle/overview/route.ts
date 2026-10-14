import { NextResponse } from 'next/server'
import { getTenantById, requireTenantId } from '@/lib/tenant'
import { isSuperAdmin } from '@/lib/admin'
import { requireLocationScope, puedeEscribirEnLaMarca } from '@/lib/location-scope'
import { getCycleOverview } from '@/services/cycle-overview.service'

/**
 * GET /api/dashboard/cycle/overview — la portada del ciclo de recuperación (spec §6, §7.4).
 *
 * El ritmo de la marca y sus días, las cajas por etapa (nuevos / ya volvieron, «hoy entran»,
 * retorno a 14 días con y sin mensaje), los Dormidos, los números de arriba (ninguno es
 * «enviados»), la segunda visita, el primer uso y las tarjetas «Para hoy». Con `?mini=1`, solo
 * las cajas y el estado (el mini-ciclo del panel principal): sin preguntarle nada al proveedor.
 *
 * Lee la MARCA con `requireTenantId()`: el ciclo es de la marca (toques con sede NULL, D12),
 * como hoy las burbujas, el estimador y los segmentos. `permisos` le dice a la pantalla qué
 * botones mostrar: `aprobar` («Hoy no», alcance de marca, `puedeEscribirEnLaMarca()`) e
 * `interruptor` (encender el ciclo: solo el operador de Cada1, decisión H7).
 *
 * Un fallo de base es 500 con un mensaje para el dueño: nunca «0 clientes».
 */

export const dynamic = 'force-dynamic'

const NO_SE_PUDO = 'No pudimos leer tu ciclo de recuperación en este momento. Intenta de nuevo en un minuto.'

export async function GET(request: Request) {
  let tenantId: string
  try {
    tenantId = await requireTenantId()
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const tenant = await getTenantById(tenantId)
  if (!tenant) return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })

  const mini = new URL(request.url).searchParams.get('mini') === '1'
  try {
    const [overview, permisos] = await Promise.all([
      getCycleOverview(tenant, { mini }),
      mini ? Promise.resolve(null) : permisosDelCiclo(request),
    ])
    return NextResponse.json({ ...overview, permisos })
  } catch (error) {
    console.error('[CycleScreen][FALLO] reason=overview', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
}

/**
 * Qué puede hacer quien mira. El alcance de escritura se resuelve sin `?location_id=` (como
 * `exigirAlcanceDeMarca()`). Un fallo de base al resolverlo LANZA: no se contesta «no podés»
 * por un timeout.
 */
async function permisosDelCiclo(request: Request): Promise<{ aprobar: boolean; interruptor: boolean }> {
  const url = new URL(request.url)
  url.searchParams.delete('location_id')
  const [alcance, esOperador] = await Promise.all([requireLocationScope(new Request(url.toString())), isSuperAdmin()])
  if (!alcance.ok && alcance.status === 500) throw new Error(alcance.error)
  return {
    aprobar: puedeEscribirEnLaMarca({ scope: alcance.ok ? alcance.scope : null, esSuperAdmin: esOperador }),
    interruptor: esOperador,
  }
}
