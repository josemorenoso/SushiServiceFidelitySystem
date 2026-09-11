import { NextRequest, NextResponse } from 'next/server'
import { requireLocationScope } from '@/lib/location-scope'
import {
  getStaffActivityReport,
  StaffActivityMigrationMissing,
} from '@/services/staff-activity.service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/staff-activity?from=ISO&to=ISO[&location_id=…]
 *
 * Rendimiento del equipo: escaneos y premios por mesero, clientes nuevos vs
 * frecuentes y mesas que más piden. El alcance de sede lo resuelve
 * `requireLocationScope()` como en el resto del panel; el `tenant_id` sale del
 * JWT y nunca del navegador. Ref: docs/features/staff-activity.md
 */
export async function GET(request: NextRequest) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return NextResponse.json({ error: 'from y to son obligatorios (ISO 8601)' }, { status: 400 })
  }
  if (Date.parse(from) > Date.parse(to)) {
    return NextResponse.json({ error: 'from no puede ser posterior a to' }, { status: 400 })
  }

  try {
    const report = await getStaffActivityReport({ from, to }, scopeResult.scope)
    return NextResponse.json(report)
  } catch (error) {
    if (error instanceof StaffActivityMigrationMissing) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    console.error('[Dashboard] Error rendimiento del equipo:', error)
    return NextResponse.json({ error: 'Error obteniendo el rendimiento del equipo' }, { status: 500 })
  }
}
