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

function buildRewardTemplate(milestone: number, title: string): string {
  return `\u00a1Felicidades {{name}}! \ud83c\udf89 Has completado tu visita #${milestone}. Como agradecimiento, te has ganado: ${title}. \u00a1Reclama tu premio en tu pr\u00f3xima visita!`
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await request.json()
    const { visit_milestone, title, message_template } = body

    if (!visit_milestone || !title) {
      return NextResponse.json(
        { error: 'visit_milestone y title son requeridos' },
        { status: 400 }
      )
    }

    const milestone = parseInt(String(visit_milestone))
    if (isNaN(milestone) || milestone < 1) {
      return NextResponse.json(
        { error: 'visit_milestone debe ser un n\u00famero positivo' },
        { status: 400 }
      )
    }

    const db = getServiceClient()

    // Check for duplicate milestone
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

    const template = message_template || buildRewardTemplate(milestone, title.trim())

    const { data: reward, error } = await db
      .from('rewards')
      .insert({
        visit_milestone: milestone,
        title: title.trim(),
        message_template: template,
        is_active: true,
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
    const { id, is_active } = body
    if (!id || typeof is_active !== 'boolean') {
      return NextResponse.json({ error: 'id e is_active requeridos' }, { status: 400 })
    }

    const db = getServiceClient()
    const { data: reward, error } = await db
      .from('rewards')
      .update({ is_active })
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
