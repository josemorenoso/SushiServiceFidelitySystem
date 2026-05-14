import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getRewards } from '@/services/dashboard.service'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const rewards = await getRewards()
    return NextResponse.json(rewards)
  } catch (error) {
    console.error('[Dashboard] Error recompensas:', error)
    return NextResponse.json({ error: 'Error obteniendo recompensas' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await request.json()
    const { visit_milestone, title, message_template, is_black } = body

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'title es requerido' },
        { status: 400 }
      )
    }

    // visit_milestone es opcional. NULL = recompensa sin milestone (s\u00f3lo para reactivaci\u00f3n/campa\u00f1as).
    let milestone: number | null = null
    if (visit_milestone !== null && visit_milestone !== undefined && visit_milestone !== '') {
      milestone = parseInt(String(visit_milestone))
      if (isNaN(milestone) || milestone < 1) {
        return NextResponse.json(
          { error: 'visit_milestone debe ser un n\u00famero positivo o null' },
          { status: 400 }
        )
      }
    }

    const db = getServiceClient()

    // Check for duplicate milestone s\u00f3lo cuando milestone NO es null
    if (milestone !== null) {
      const { data: existing } = await db
        .from('rewards')
        .select('id')
        .eq('visit_milestone', milestone)
        .single()

      if (existing) {
        return NextResponse.json(
          { error: `Ya existe una recompensa para la visita #${milestone}` },
          { status: 409 }
        )
      }
    }

    // message_template es opcional. La plantilla de Twilio define el cuerpo real;
    // este campo se conserva como referencia / display en el dashboard.
    const template = (typeof message_template === 'string' && message_template.trim()) || title.trim()

    const blackFlag = is_black === true

    // Si se marca como BLACK, verificar que no exista ya una recompensa black activa
    if (blackFlag) {
      const { data: existingBlack } = await db
        .from('rewards')
        .select('id, visit_milestone')
        .eq('is_black', true)
        .eq('is_active', true)
        .limit(1)
        .single()

      if (existingBlack) {
        return NextResponse.json(
          { error: `Ya existe una recompensa BLACK (visita #${existingBlack.visit_milestone ?? '—'}). Desactívala primero.` },
          { status: 409 }
        )
      }
    }

    const { data: reward, error } = await db
      .from('rewards')
      .insert({
        visit_milestone: milestone,
        title: title.trim(),
        message_template: template,
        is_active: true,
        ...(blackFlag ? { is_black: true } : {}),
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(reward, { status: 201 })
  } catch (error) {
    console.error('[Rewards] Error creando:', error)
    return NextResponse.json({ error: 'Error creando recompensa' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const db = getServiceClient()
    const { error } = await db.from('rewards').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Rewards] Error eliminando:', error)
    return NextResponse.json({ error: 'Error eliminando recompensa' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await request.json()
    const { id, is_active, title, visit_milestone } = body
    if (!id) {
      return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}

    if (typeof is_active === 'boolean') updates.is_active = is_active

    if (typeof body.is_black === 'boolean') updates.is_black = body.is_black

    if (typeof title === 'string') {
      const trimmed = title.trim()
      if (trimmed.length === 0) {
        return NextResponse.json({ error: 'title no puede ser vacío' }, { status: 400 })
      }
      updates.title = trimmed
    }

    if (visit_milestone !== undefined) {
      if (visit_milestone === null || visit_milestone === '') {
        updates.visit_milestone = null
      } else {
        const m = parseInt(String(visit_milestone))
        if (isNaN(m) || m < 1) {
          return NextResponse.json({ error: 'visit_milestone debe ser número positivo o null' }, { status: 400 })
        }
        updates.visit_milestone = m
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const db = getServiceClient()
    const { data: reward, error } = await db
      .from('rewards')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(reward)
  } catch (error) {
    console.error('[Rewards] Error actualizando:', error)
    return NextResponse.json({ error: 'Error actualizando recompensa' }, { status: 500 })
  }
}
