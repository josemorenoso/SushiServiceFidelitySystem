import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId, getTenantById } from '@/lib/tenant'
import { programarSiguienteTanda } from '@/services/imported-contacts.service'
import { getSettingValue } from '@/services/settings.service'

export const dynamic = 'force-dynamic'
// Marca N filas en trozos de 500 y encola: con 10.000 son 20 viajes a la base.
export const maxDuration = 300

/**
 * POST /api/dashboard/imported-contacts/continue
 *
 * Programa la SIGUIENTE tanda de una base que ya está guardada, sin resubir el
 * CSV. Los que esperan están en `imported_contacts` como `valid`; de acá salen
 * los primeros `max_contacts` en el orden en que se guardaron.
 *
 * Body: `{ batch_id, max_contacts, block_size, template_sid?, promo_text?, fallback_name? }`.
 * Lo que no venga se hereda de la tanda anterior de la misma base.
 *
 * Pasa por las mismas puertas que `confirm` (calidad de línea y saldo) y
 * responde con los mismos 409, más dos propios: `nothing_pending` (no queda
 * nadie por programar) y `template_required` (la campaña anterior es de
 * antes del 2026-09-12 y no guardó el SID de la plantilla: hay que elegirla).
 */
interface ContinueBody {
  batch_id: string
  max_contacts: number
  block_size: number
  template_sid?: string
  promo_text?: string
  fallback_name?: string
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const tenantId = await requireTenantId()
  const enabled = await getSettingValue('golden_bullet_enabled', tenantId)
  if (enabled !== 'true') {
    return NextResponse.json(
      { error: 'Función desactivada', message: 'Golden Bullet está apagado en esta marca. Encendelo con el botón de la pantalla Golden Bullet.' },
      { status: 403 }
    )
  }

  try {
    const tenant = await getTenantById(tenantId)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const body = (await request.json()) as ContinueBody
    const maxContacts = Number(body.max_contacts)
    const blockSize = Number(body.block_size)
    if (!body.batch_id || !Number.isFinite(maxContacts) || maxContacts < 1) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere batch_id y max_contacts: cuántos de los que esperan entran en esta tanda.' },
        { status: 400 }
      )
    }
    if (!Number.isFinite(blockSize) || blockSize < 1) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere block_size: cuántos mensajes por día. Lo elige el operador, no el sistema.' },
        { status: 400 }
      )
    }

    const result = await programarSiguienteTanda({
      tenant,
      batchId: body.batch_id,
      maxContacts: Math.floor(maxContacts),
      blockSize,
      templateSid: body.template_sid,
      promoText: body.promo_text,
      fallbackName: body.fallback_name,
      acceptedByEmail: user.email ?? undefined,
    })

    if ('reason' in result) {
      return NextResponse.json(
        result.reason === 'nothing_pending'
          ? { error: 'No queda nadie por programar en esta base', reason: result.reason }
          : {
              error: 'Hay que elegir la plantilla',
              reason: result.reason,
              message: 'La tanda anterior es de antes del 2026-09-12 y no guardó qué plantilla usó. Elegila para esta tanda.',
            },
        { status: 409 }
      )
    }

    if (result.blocked_by_quality) {
      return NextResponse.json(
        { error: 'La línea no está en condiciones de mandar una base fría', reason: 'line_quality', ...result.blocked_by_quality },
        { status: 409 }
      )
    }
    if (result.insufficient_balance) {
      return NextResponse.json(
        { error: 'Saldo insuficiente para esta tanda', reason: 'insufficient_balance', ...result.insufficient_balance },
        { status: 409 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[GoldenBullet] Error programando la siguiente tanda:', error)
    return NextResponse.json({ error: 'Error encolando la tanda' }, { status: 500 })
  }
}
