import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getEvent,
  updateEvent,
  executeAutoEvent,
} from '@/services/calendar.service'

/**
 * POST /api/dashboard/calendar/events/[id]/dispatch
 *
 * Dispara manualmente el auto-envío de un evento desde el dashboard
 * ("Enviar ahora" / reintentar). Pensado para cuando el cron falla,
 * aún no corre, o un evento quedó en 'failed' y se quiere reintentar.
 *
 * Reglas:
 *   - Solo eventos con send_mode='auto'.
 *   - Acepta status 'scheduled' (envío anticipado) o 'failed' (reintento).
 *     Un evento 'failed' se rearma a 'scheduled' antes de ejecutar para
 *     pasar el guard de idempotencia de executeAutoEvent.
 *   - 'sent', 'cancelled' y 'planned' se rechazan.
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
    const event = await getEvent(id)
    if (!event) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
    }

    if (event.send_mode !== 'auto') {
      return NextResponse.json(
        { error: 'Solo los eventos en modo auto-envío se pueden disparar.' },
        { status: 400 }
      )
    }

    if (event.status !== 'scheduled' && event.status !== 'failed') {
      return NextResponse.json(
        { error: `El evento no se puede enviar en estado '${event.status}'.` },
        { status: 400 }
      )
    }

    // Rearma un evento fallido para que pase el guard de executeAutoEvent.
    if (event.status === 'failed') {
      await updateEvent(id, { status: 'scheduled' })
    }

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
