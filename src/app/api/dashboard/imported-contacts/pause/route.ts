import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { pauseBatch, resumeBatch } from '@/services/imported-contacts.service'

export const dynamic = 'force-dynamic'
// Reanudar 15.000 items son ~15 grupos de UPDATE en trozos de 500.
export const maxDuration = 300

interface Body {
  campaign_id: string
  action: 'pause' | 'resume'
  /** Solo para 'resume': con cuántos por día se reanuda. Puede ser distinto del original. */
  block_size?: number
}

/**
 * POST /api/dashboard/imported-contacts/pause
 *
 * El botón de parar (y el de volver a arrancar).
 *
 * Pausar NO cancela ni pierde nada: los items siguen en la cola y el drenador
 * deja de verlos. Lo único que no se puede deshacer es lo que YA salió.
 *
 * Reanudar reprograma DESDE HOY, y acepta un ritmo distinto del original: si el
 * primer bloque resultó muy agresivo se reanuda más despacio sin volver a subir
 * el CSV.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as Body
    if (!body.campaign_id || (body.action !== 'pause' && body.action !== 'resume')) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere campaign_id y action (pause | resume)' },
        { status: 400 }
      )
    }

    const tenantId = await requireTenantId()

    if (body.action === 'pause') {
      const res = await pauseBatch(body.campaign_id, tenantId)
      return NextResponse.json(res)
    }

    const blockSize = Number(body.block_size)
    if (!Number.isFinite(blockSize) || blockSize < 1) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Para reanudar hace falta block_size: cuántos por día.' },
        { status: 400 }
      )
    }

    const res = await resumeBatch(body.campaign_id, tenantId, blockSize)
    return NextResponse.json(res)
  } catch (error) {
    console.error('[GoldenBullet] Error pausa/reanudación:', error)
    return NextResponse.json({ error: 'No se pudo cambiar el estado del envío' }, { status: 500 })
  }
}
