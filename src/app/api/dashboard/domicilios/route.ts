/**
 * GET /api/dashboard/domicilios — la lista de domicilios que SÍ entraron.
 *
 * Solo lectura. §18.d + §24.3-B · `docs/features/delivery-dashboard.md`.
 *
 * El aislamiento por marca y por sede lo resuelve `requireLocationScope()`: es la única
 * fábrica de `LocationScope` y decide SIEMPRE en el servidor, nunca con lo que mande el
 * navegador.
 *
 * **503, no 200 con lista vacía.** Si la lectura falla, esta ruta responde un error: un
 * `{ orders: [] }` con 200 haría que la pantalla pintara «no hubo domicilios» cuando lo
 * que pasó es que la base no contestó.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireLocationScope } from '@/lib/location-scope'
import { getDeliveryOrders } from '@/services/delivery-dashboard.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    const result = await getDeliveryOrders(
      {
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
        page: parseInt(searchParams.get('page') ?? '1', 10),
        limit: parseInt(searchParams.get('limit') ?? '25', 10),
      },
      scopeResult.scope
    )

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 503 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Domicilios] GET listado:', error)
    return NextResponse.json({ error: 'Error obteniendo los domicilios' }, { status: 500 })
  }
}
