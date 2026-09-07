/**
 * GET /api/dashboard/domicilios/resumen — el canal, los contadores y la alarma de silencio.
 *
 * Solo lectura. §18.d (a qué número se manda el cuadro) + §24.3-B (la alarma).
 *
 * **La alarma solo se PINTA.** No manda mensajes ni correos: eso es §24-A y vive en el
 * AIOS. Esta ruta devuelve el veredicto ya calculado y nada más.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireLocationScope } from '@/lib/location-scope'
import { getTenantById } from '@/lib/tenant'
import { buildDeliveryChannel, getDeliverySummary } from '@/services/delivery-dashboard.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const [tenant, summary] = await Promise.all([
      getTenantById(scopeResult.scope.tenantId),
      getDeliverySummary(scopeResult.scope),
    ])

    if (!summary.ok) {
      return NextResponse.json({ error: summary.error }, { status: 503 })
    }

    // `getTenantById()` devuelve `null` tanto si la marca no existe como si la consulta
    // falló (traga el `error`, y cambiar su firma toca 16 archivos que no son de este
    // bloque). Acá eso significa una sola cosa útil: no se puede afirmar a qué número se
    // manda el cuadro. Se devuelve `channel: null` y la pantalla lo dice — nunca un
    // número inventado ni un hueco mudo.
    return NextResponse.json({
      channel: tenant ? buildDeliveryChannel(tenant) : null,
      summary: summary.data,
    })
  } catch (error) {
    console.error('[Domicilios] GET resumen:', error)
    return NextResponse.json({ error: 'Error obteniendo el resumen de domicilios' }, { status: 500 })
  }
}
