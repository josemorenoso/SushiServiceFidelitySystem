import { NextResponse } from 'next/server'
import { getTenantById, requireTenantId } from '@/lib/tenant'
import { bogotaDay } from '@/lib/cycle-engine'
import { isoDeDia } from '@/lib/cycle-touch'
import { getCycleProjection, MAX_DIAS_DE_PROYECCION } from '@/services/cycle-overview.service'

/**
 * GET /api/dashboard/cycle/projection?from=YYYY-MM-DD&to=YYYY-MM-DD — el calendario como el
 * mismo dato girado (spec §6.4): por día, cuántos entran a cada toque (aritmética sobre el
 * inicio del ciclo + los días del ritmo de CADA cliente, con el motor; sin tabla nueva), los
 * eventos con su «reservado para el evento» y las fechas especiales.
 *
 * Sin `from`/`to`: desde hoy, 31 días. Como mucho `MAX_DIAS_DE_PROYECCION` días de una vez.
 * Los días pasados traen eventos y fechas, pero no proyección (ya no es proyección).
 */

export const dynamic = 'force-dynamic'

const NO_SE_PUDO = 'No pudimos leer el calendario del ciclo en este momento. Intenta de nuevo en un minuto.'
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const DIA_MS = 24 * 60 * 60 * 1000

function diaValido(texto: string | null): number | null {
  if (!texto || !FECHA.test(texto)) return null
  const ms = Date.parse(`${texto}T00:00:00Z`)
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== texto) return null
  return Math.floor(ms / DIA_MS)
}

export async function GET(request: Request) {
  let tenantId: string
  try {
    tenantId = await requireTenantId()
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const hoy = bogotaDay(new Date())
  const desdeCrudo = params.get('from')
  const hastaCrudo = params.get('to')
  const desde = desdeCrudo === null ? hoy : diaValido(desdeCrudo)
  const hasta = hastaCrudo === null ? (desde ?? hoy) + 30 : diaValido(hastaCrudo)
  if (desde === null || hasta === null) {
    return NextResponse.json({ error: 'Las fechas van como AAAA-MM-DD (from y to).' }, { status: 400 })
  }
  if (hasta < desde) {
    return NextResponse.json({ error: '«to» no puede ser antes de «from».' }, { status: 400 })
  }
  if (hasta - desde + 1 > MAX_DIAS_DE_PROYECCION) {
    return NextResponse.json(
      { error: `Se pueden pedir hasta ${MAX_DIAS_DE_PROYECCION} días de una vez.` },
      { status: 400 }
    )
  }

  const tenant = await getTenantById(tenantId)
  if (!tenant) return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })

  try {
    const proyeccion = await getCycleProjection(tenant, { desde: isoDeDia(desde), hasta: isoDeDia(hasta) })
    return NextResponse.json(proyeccion)
  } catch (error) {
    console.error('[CycleScreen][FALLO] reason=projection', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
}
