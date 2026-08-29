import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import {
  getEvent,
  armEventForDispatch,
  executeAutoEvent,
} from '@/services/calendar.service'

/**
 * POST /api/dashboard/calendar/events/[id]/dispatch
 *
 * Dispara el envío de un evento bajo demanda desde el dashboard
 * ("Enviar ahora" / reintentar).
 *
 * Reglas:
 *   - Acepta cualquier evento vivo: 'planned', 'scheduled' o 'failed', tanto en
 *     modo 'auto' como 'remind'. `armEventForDispatch` lo normaliza a
 *     auto + scheduled antes de ejecutar.
 *   - Solo 'sent' y 'cancelled' se rechazan.
 *
 * Antes exigía send_mode='auto' y status scheduled|failed, así que los eventos
 * creados con el modo por defecto ("Solo recordarme" → planned) no se podían
 * enviar desde ningún lado: ni por cron ni por este endpoint.
 *
 * Requiere las plantillas Twilio en admin_settings
 * (event_template_image_sid / event_template_video_sid). Si faltan,
 * executeAutoEvent lanza un error explícito que se devuelve al cliente.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const tenantId = await requireTenantId()
    const event = await getEvent(id)
    if (!event || event.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
    }

    if (event.status === 'sent') {
      return NextResponse.json(
        { error: 'Este evento ya se envió. Duplícalo si quieres volver a invitar.' },
        { status: 400 }
      )
    }
    if (event.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Este evento está cancelado. Créalo de nuevo si quieres enviarlo.' },
        { status: 400 }
      )
    }

    // Normaliza a auto + scheduled: es el único estado que executeAutoEvent acepta,
    // y así un evento en modo recordatorio también se puede enviar a mano.
    await armEventForDispatch(id, tenantId)

    const result = await executeAutoEvent(id)

    return NextResponse.json({
      ok: true,
      sent: result.sent,
      failed: result.failed,
      excluded_monthly_cap: result.excluded_monthly_cap,
      campaign_id: result.campaign_id,
    })
  } catch (error) {
    console.error('[Calendar Event Dispatch]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}
