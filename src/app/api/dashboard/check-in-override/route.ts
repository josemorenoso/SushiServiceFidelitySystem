import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { validatePhone } from '@/lib/validators/phone'
import { findCustomerByPhone, incrementVisit } from '@/services/customer.service'
import { createVisit } from '@/services/visit.service'
import { checkRewardForVisit, getNextReward, getRewardTitle, getRemainingForReward, buildRewardsRoadmap } from '@/services/reward.service'
import { getMultipleSettings } from '@/services/settings.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

interface OverrideBody {
  phone: string
  reason?: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = (await request.json()) as OverrideBody
    const { phone, reason } = body

    if (!phone) {
      return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 })
    }

    const { valid, cleaned } = validatePhone(phone)
    if (!valid) {
      return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 })
    }

    const customer = await findCustomerByPhone(cleaned)
    if (!customer) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const updated = await incrementVisit(customer.id, customer.total_visits)
    await createVisit({
      customerId: customer.id,
      source: 'qr',
      notes: `Override admin: ${reason || 'visita adicional autorizada'}`,
    })

    const [reward, settings, roadmap] = await Promise.all([
      checkRewardForVisit(updated.total_visits),
      getMultipleSettings(['reward_template_sid', 'welcome_back_far_template_sid', 'welcome_back_near_template_sid', 'welcome_back_template_sid']),
      buildRewardsRoadmap(updated.total_visits),
    ])

    // Send WhatsApp best-effort (same logic as QR check-in)
    try {
      if (reward && settings.reward_template_sid) {
        await sendTemplateMessage(
          cleaned,
          settings.reward_template_sid,
          { '1': updated.name, '2': String(updated.total_visits), '3': reward.title, '4': roadmap },
        )
      } else if (!reward) {
        const nextReward = await getNextReward(updated.total_visits)
        const remaining = getRemainingForReward(updated.total_visits, nextReward)
        const rewardTitle = getRewardTitle(nextReward)
        const isNear = remaining === 1
        const sid = isNear
          ? (settings.welcome_back_near_template_sid ?? settings.welcome_back_template_sid)
          : (settings.welcome_back_far_template_sid ?? settings.welcome_back_template_sid)
        if (sid) {
          await sendTemplateMessage(
            cleaned,
            sid,
            { '1': updated.name, '2': String(updated.total_visits), '3': rewardTitle, '4': roadmap },
          )
        }
      }
    } catch (waErr) {
      console.error('[CheckIn Override] WhatsApp send error:', waErr)
    }

    return NextResponse.json({
      ok: true,
      customer: {
        name: updated.name,
        phone: updated.phone,
        total_visits: updated.total_visits,
      },
      reward: reward ? { title: reward.title } : null,
    })
  } catch (error) {
    console.error('[CheckIn Override]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
