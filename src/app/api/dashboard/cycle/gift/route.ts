import { NextResponse } from 'next/server'
import { getTenantById, requireTenantId } from '@/lib/tenant'
import { exigirAlcanceDeMarca } from '@/lib/alcance-de-marca'
import { leerEntradaDelRegalo, programarRegalo, vistaPreviaDelRegalo } from '@/services/cycle-gift.service'

/**
 * «Mandar un regalo» (spec §6.5, fase 2 parte C) — el botón principal de la pantalla del ciclo.
 *
 * GET `?cuando=hoy|AAAA-MM-DD` — lo que dibuja el creador: el conteo vivo de cada caja (y por
 * qué no lo recibe el resto), el cupo de la línea («Hoy puedes mandar 180»), la plantilla que va
 * a salir (el adaptador del ciclo), el catálogo de regalos y los cuerpos para la vista previa.
 * Leer es de la marca: `requireTenantId()`, como la portada.
 *
 * POST `{ regalo: { id } | { titulo }, vence: 'domingo'|'3'|'7'|'14', audiencia, cuando }` —
 * programa: crea la campaña (`source = 'manual'`) y encola a la hora de la marca. **No otorga
 * nada**: el regalo se otorga y se fecha AL ENVIAR (el drenador). Escribir es de la marca:
 * `exigirAlcanceDeMarca()` (un administrador de una sede no le manda un regalo a toda la marca).
 *
 * Un fallo de base es 500 con un mensaje para el dueño: nunca «0 clientes».
 */

export const dynamic = 'force-dynamic'

const NO_SE_PUDO_LEER = 'No pudimos preparar el regalo en este momento. Intenta de nuevo en un minuto.'
const NO_SE_PUDO_PROGRAMAR = 'No pudimos programar el regalo. No salió nada: intenta de nuevo en un minuto.'

export async function GET(request: Request) {
  let tenantId: string
  try {
    tenantId = await requireTenantId()
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const tenant = await getTenantById(tenantId)
  if (!tenant) return NextResponse.json({ error: NO_SE_PUDO_LEER }, { status: 500 })

  const cuando = new URL(request.url).searchParams.get('cuando') ?? 'hoy'
  try {
    return NextResponse.json(await vistaPreviaDelRegalo(tenant, { cuando }))
  } catch (error) {
    console.error('[CycleGift][FALLO] reason=vista_previa', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: NO_SE_PUDO_LEER }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const guardia = await exigirAlcanceDeMarca(
    request,
    'Un regalo le llega a clientes de toda la marca: solo un super usuario puede mandarlo.'
  )
  if (!guardia.ok) return guardia.res

  const leida = leerEntradaDelRegalo(await request.json().catch(() => null))
  if (!leida.ok) return NextResponse.json({ error: leida.error }, { status: 400 })

  const tenant = await getTenantById(guardia.tenantId)
  if (!tenant) return NextResponse.json({ error: NO_SE_PUDO_PROGRAMAR }, { status: 500 })

  try {
    const r = await programarRegalo(tenant, leida.entrada)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json(r)
  } catch (error) {
    console.error('[CycleGift][FALLO] reason=programar', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: NO_SE_PUDO_PROGRAMAR }, { status: 500 })
  }
}
