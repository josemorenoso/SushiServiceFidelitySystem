import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { getBatchProgress, getBases } from '@/services/imported-contacts.service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/imported-contacts/progress?batch_id=…
 *
 * La foto de una base: cuántos hay en total, cuántos esperan sin programar,
 * cuántos salieron (hoy y en total), quién se registró y quién dijo que no,
 * cuándo sale el próximo bloque y si está pausada.
 *
 * Sin `batch_id` devuelve TODAS las bases de la marca —las terminadas también:
 * hasta el 2026-09-12 una base desaparecía de acá en cuanto se vaciaba la
 * cola, y con ella los registrados y los rechazos, que son lo que el dueño
 * mira después de la campaña.
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

    if (!batchId) {
      return NextResponse.json({ batches: await getBases(tenantId) })
    }
    const progress = await getBatchProgress(batchId, tenantId)
    if (!progress) {
      return NextResponse.json({ error: 'Base no encontrada' }, { status: 404 })
    }
    return NextResponse.json(progress)
  } catch (error) {
    console.error('[GoldenBullet] Error progreso:', error)
    return NextResponse.json({ error: 'Error obteniendo el avance' }, { status: 500 })
  }
}
