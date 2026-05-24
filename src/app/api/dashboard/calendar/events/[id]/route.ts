import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getEvent,
  updateEvent,
  cancelEvent,
  type UpdateEventInput,
} from '@/services/calendar.service'

/**
 * GET /api/dashboard/calendar/events/[id]
 * Devuelve un evento por id.
 */
export async function GET(
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
    return NextResponse.json({ event })
  } catch (error) {
    console.error('[Calendar Event GET]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/dashboard/calendar/events/[id]
 * Actualiza campos del evento. Body: UpdateEventInput.
 *
 * NOTA: La acción de "ejecutar envío inmediato" no está disponible en esta versión
 * porque depende del path de envío (plantillas Twilio aprobadas).
 * Se cableará en una iteración separada.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = (await request.json()) as Partial<UpdateEventInput>

    // Validaciones de campos provistos
    if (body.event_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.event_date)) {
      return NextResponse.json(
        { error: 'event_date debe tener formato YYYY-MM-DD' },
        { status: 400 }
      )
    }
    if (body.event_type) {
      const validTypes = ['promo', 'festival', 'activacion', 'aniversario', 'otro']
      if (!validTypes.includes(body.event_type)) {
        return NextResponse.json(
          { error: `event_type debe ser uno de: ${validTypes.join(', ')}` },
          { status: 400 }
        )
      }
    }
    if (body.media_type !== undefined && body.media_type !== null
        && !['image', 'video'].includes(body.media_type)) {
      return NextResponse.json(
        { error: "media_type debe ser 'image', 'video' o null" },
        { status: 400 }
      )
    }
    if (body.send_mode && !['auto', 'remind'].includes(body.send_mode)) {
      return NextResponse.json(
        { error: "send_mode debe ser 'auto' o 'remind'" },
        { status: 400 }
      )
    }
    if (body.status && !['planned', 'scheduled', 'sent', 'cancelled', 'failed'].includes(body.status)) {
      return NextResponse.json(
        { error: 'status inválido' },
        { status: 400 }
      )
    }
    if (typeof body.blackout_days === 'number' && (body.blackout_days < 0 || body.blackout_days > 30)) {
      return NextResponse.json(
        { error: 'blackout_days debe estar entre 0 y 30' },
        { status: 400 }
      )
    }

    const event = await updateEvent(id, body)
    return NextResponse.json({ event })
  } catch (error) {
    console.error('[Calendar Event PATCH]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/dashboard/calendar/events/[id]
 * Cancela el evento (soft-delete: status='cancelled').
 * No borramos físicamente para mantener trazabilidad histórica.
 */
export async function DELETE(
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
    const event = await cancelEvent(id)
    return NextResponse.json({ event })
  } catch (error) {
    console.error('[Calendar Event DELETE]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}
