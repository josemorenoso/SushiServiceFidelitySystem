import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { validatePhone } from '@/lib/validators/phone'
import { requireTenantId, getTenantById } from '@/lib/tenant'
import { findCustomerByPhone, incrementVisit } from '@/services/customer.service'
import { createVisit } from '@/services/visit.service'
import { awardVisitPoints } from '@/services/points.service'
import { evaluateNewTier, getNextTier, buildTiersRoadmap, updateCustomerTier } from '@/services/reward-tiers.service'
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

    const tenantId = await requireTenantId()
    const tenant = await getTenantById(tenantId)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const customer = await findCustomerByPhone(cleaned, tenantId)
    if (!customer) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    const updated = await incrementVisit(customer.id, customer.total_visits)
    const visit = await createVisit({
      customerId: customer.id,
      source: 'qr',
      tenantId,
      notes: `Override admin: ${reason || 'visita adicional autorizada'}`,
    })

    // Otorgar puntos por la visita manual y evaluar tiers
    const previousPoints = customer.total_points ?? 0
    let pointsResult = { pointsAwarded: 0, newBalance: previousPoints }
    let newTier = null
    let nextTierInfo = null
    let tiersRoadmapText = '🌟 ¡Seguí sumando puntos para desbloquear premios!'

    try {
      pointsResult = await awardVisitPoints(customer.id, visit.id, 'qr', tenantId)
      console.log(`[CheckIn Override] Puntos otorgados: +${pointsResult.pointsAwarded} → balance=${pointsResult.newBalance} (prev=${previousPoints})`)
    } catch (err) {
      console.error('[CheckIn Override] ERROR otorgando puntos (se usa fallback 0):', err)
      pointsResult = { pointsAwarded: 0, newBalance: previousPoints }
    }

    try {
      newTier = await evaluateNewTier(previousPoints, pointsResult.newBalance, tenantId)
      if (newTier) {
        await updateCustomerTier(customer.id, newTier.tier_name)
      }
      nextTierInfo = await getNextTier(pointsResult.newBalance, tenantId)
    } catch (err) {
      console.error('[CheckIn Override] ERROR evaluando tiers (se continúa sin tiers):', err)
    }

    try {
      tiersRoadmapText = await buildTiersRoadmap(pointsResult.newBalance, tenantId)
    } catch (err) {
      console.error('[CheckIn Override] Error generando tiers roadmap:', err)
    }

    // Send WhatsApp best-effort con plantillas nuevas de puntos
    const settings = await getMultipleSettings([
      'points_earned_far_template_sid',
      'points_earned_near_template_sid',
      'tier_unlocked_template_sid',
    ], tenantId)

    try {
      if (newTier && settings.tier_unlocked_template_sid) {
        await sendTemplateMessage(
          cleaned,
          settings.tier_unlocked_template_sid,
          {
            '1': updated.name,
            '2': newTier.tier_name,
            '3': newTier.safe_reward_title,
            '4': tiersRoadmapText,
          },
          tenant,
        )
      } else {
        const isNearTier = nextTierInfo && nextTierInfo.pointsRemaining <= 30
        const targetSid = isNearTier
          ? settings.points_earned_near_template_sid
          : settings.points_earned_far_template_sid
        if (targetSid) {
          await sendTemplateMessage(
            cleaned,
            targetSid,
            {
              '1': updated.name,
              '2': String(pointsResult.pointsAwarded),
              '3': String(pointsResult.newBalance),
              '4': isNearTier ? nextTierInfo!.tier.safe_reward_title : tiersRoadmapText,
            },
            tenant,
          )
        } else {
          console.warn('[CheckIn Override] No hay plantilla de puntos configurada. Mensaje WhatsApp NO enviado.')
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
        total_points: pointsResult.newBalance,
        current_tier: newTier ? newTier.tier_name : customer.current_tier,
      },
      points_awarded: pointsResult.pointsAwarded,
      tier_unlocked: newTier ? { name: newTier.tier_name, safe_reward: newTier.safe_reward_title } : null,
    })
  } catch (error) {
    console.error('[CheckIn Override]', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
