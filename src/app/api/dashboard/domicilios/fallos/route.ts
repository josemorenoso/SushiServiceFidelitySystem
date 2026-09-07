/**
 * GET /api/dashboard/domicilios/fallos — los domicilios que NO entraron (§24-B).
 *
 * Solo lectura sobre `delivery_intake_failures` (migración **00053**, rama
 * `feat/salud-aios`). Esta ruta **degrada sola** si la tabla todavía no existe:
 * responde `{ available: false, failures: [] }` con 200, y la pantalla escribe «falta
 * la 00053» en vez de pintar «cero fallos».
 *
 * La diferencia no es cosmética: sin esa tabla, *«llegaron tres pedidos y se perdieron»*
 * y *«hoy no pidió nadie»* son el mismo dato (cero filas en `visits`). Pintar un 0 acá
 * sería el fallo silencioso que este apartado vino a matar.
 *
 * ⚠️ Sin botón de reintentar: reprocesar re-cobra OpenAI y es otro alcance. Queda como
 * deuda escrita en `docs/features/delivery-dashboard.md`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireLocationScope } from '@/lib/location-scope'
import { getDeliveryFailures } from '@/services/delivery-dashboard.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') ?? '20', 10)
    const result = await getDeliveryFailures(scopeResult.scope, Number.isFinite(limit) ? limit : 20)

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 503 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Domicilios] GET fallos:', error)
    return NextResponse.json({ error: 'Error obteniendo los domicilios perdidos' }, { status: 500 })
  }
}
