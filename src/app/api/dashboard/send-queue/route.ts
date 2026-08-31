import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantIdFromJwt } from '@/lib/tenant'
import { listQueue, getQueueDepth, QUEUE_STATUSES, type QueueStatus } from '@/services/send-queue.service'

/**
 * GET /api/dashboard/send-queue — qué queda por gotear de este tenant.
 *
 * Con la cola de goteo (Bloque 2), una campaña de 380 destinatarios y
 * presupuesto 180 ya no pierde a los 200 restantes: se guardan aquí y salen en
 * los días siguientes. Esta ruta es lo que deja verlos.
 *
 * Query params:
 *   campaign_id — filtra por campaña
 *   status      — queued | sent | failed | cancelled | expired
 *   page, limit — paginación (limit tope 200, default 25)
 *
 * Ref: docs/features/send-governance.md
 *      docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.4 y §5
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Un super-admin sin tenant en el JWT no tiene cola propia que mostrar: se
  // degrada limpio, igual que /api/dashboard/line-budget.
  const tenantId = await getTenantIdFromJwt()
  if (!tenantId) {
    return NextResponse.json({ available: false })
  }

  try {
    const qs = new URL(request.url).searchParams

    const status = qs.get('status')
    if (status && !QUEUE_STATUSES.includes(status as QueueStatus)) {
      return NextResponse.json(
        { error: `Estado inválido. Valores permitidos: ${QUEUE_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    // parseInt de un valor no numérico da NaN, y un NaN llega hasta el .range()
    // de Postgres y revienta con un 500 opaco. El servicio ya normaliza los
    // valores fuera de rango, pero NaN no es "fuera de rango": no compara.
    const page = Number.parseInt(qs.get('page') ?? '1', 10)
    const limit = Number.parseInt(qs.get('limit') ?? '25', 10)

    const [resultado, profundidad] = await Promise.all([
      listQueue(tenantId, {
        campaignId: qs.get('campaign_id'),
        status: (status as QueueStatus | null) ?? null,
        page: Number.isFinite(page) ? page : 1,
        limit: Number.isFinite(limit) ? limit : 25,
      }),
      getQueueDepth(tenantId),
    ])

    return NextResponse.json({ available: true, ...resultado, depth: profundidad })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[send-queue] No se pudo leer la cola:', message)
    return NextResponse.json({ error: 'No se pudo leer la cola de envío' }, { status: 500 })
  }
}
