import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { getBatchProgress, getActiveBatches } from '@/services/imported-contacts.service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/imported-contacts/progress?batch_id=…
 *
 * La foto de HOY de un lote que está goteando: cuántos salieron hoy, cuántos
 * faltan, cuándo sale el próximo bloque y si está pausado.
 *
 * Existe porque un goteo de semanas sin tablero es un goteo a ciegas.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const batchId = new URL(request.url).searchParams.get('batch_id')
    const tenantId = await requireTenantId()

    // Sin `batch_id` devuelve TODO lo que sigue goteando. Es la vista que abre
    // el tablero diario, para no tener que saberse un UUID de memoria.
    if (!batchId) {
      return NextResponse.json({ batches: await getActiveBatches(tenantId) })
    }
    const progress = await getBatchProgress(batchId, tenantId)
    if (!progress) {
      return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })
    }
    return NextResponse.json(progress)
  } catch (error) {
    console.error('[GoldenBullet] Error progreso:', error)
    return NextResponse.json({ error: 'Error obteniendo el avance' }, { status: 500 })
  }
}
