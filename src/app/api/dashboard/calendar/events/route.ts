import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { createEvent, listEvents, type CreateEventInput } from '@/services/calendar.service'

/**
 * GET /api/dashboard/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Lista eventos del rango (inclusive en ambos extremos por event_date).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Parámetros `from` y `to` (YYYY-MM-DD) requeridos' },
        { status: 400 }
      )
    }

    // Validar formato fecha
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      return NextResponse.json(
        { error: 'Formato de fecha inválido (esperado YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const tenantId = await requireTenantId()
    const events = await listEvents(from, to, tenantId)
    return NextResponse.json({ events })
  } catch (error) {
    console.error('[Calendar Events GET]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/dashboard/calendar/events
 * Body: CreateEventInput (JSON). Para subir media usar primero
 * `/api/dashboard/calendar/media-upload` y pasar la URL resultante aquí.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = (await request.json()) as Partial<CreateEventInput>

    // Validaciones de entrada mínimas
    if (!body.title || typeof body.title !== 'string') {
      return NextResponse.json({ error: 'title requerido' }, { status: 400 })
    }
    if (!body.event_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.event_date)) {
      return NextResponse.json(
        { error: 'event_date requerido (YYYY-MM-DD)' },
        { status: 400 }
      )
    }
    const validTypes = ['promo', 'festival', 'activacion', 'aniversario', 'otro']
    if (!body.event_type || !validTypes.includes(body.event_type)) {
      return NextResponse.json(
        { error: `event_type debe ser uno de: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }
    if (body.media_type && !['image', 'video'].includes(body.media_type)) {
      return NextResponse.json(
        { error: "media_type debe ser 'image' o 'video'" },
        { status: 400 }
      )
    }
    if (body.send_mode && !['auto', 'remind'].includes(body.send_mode)) {
      return NextResponse.json(
        { error: "send_mode debe ser 'auto' o 'remind'" },
        { status: 400 }
      )
    }
    if (typeof body.blackout_days === 'number' && (body.blackout_days < 0 || body.blackout_days > 30)) {
      return NextResponse.json(
        { error: 'blackout_days debe estar entre 0 y 30' },
        { status: 400 }
      )
    }

    const tenantId = await requireTenantId()
    const event = await createEvent(body as CreateEventInput, tenantId)
    return NextResponse.json({ event }, { status: 201 })
  } catch (error) {
    console.error('[Calendar Events POST]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}
