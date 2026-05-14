import { NextRequest, NextResponse } from 'next/server'
import { validatePhone } from '@/lib/validators/phone'
import { findCustomerByPhone, createCustomer, incrementVisit, updateCustomerCityIfNull } from '@/services/customer.service'
import { createVisit } from '@/services/visit.service'
import { checkRewardForVisit, getNextReward, getRewardTitle, getRemainingForReward, buildRewardsRoadmap } from '@/services/reward.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getMultipleSettings } from '@/services/settings.service'
import { syncGoogleContact } from '@/services/google-contacts-sync.service'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

interface DeliveryRequestBody {
  nombre_cliente: string
  celular: string
  direccion?: string | null
  metodo_pago?: string | null
  monto_total?: number | null
  raw_message?: string | null
  ciudad?: string | null
}

async function sendDeliveryTemplate(
  templateSid: string | undefined,
  templateType: string,
  phone: string,
  variables: Record<string, string>
): Promise<void> {
  if (!templateSid) {
    console.warn(`[Delivery] No hay plantilla configurada para "${templateType}" — mensaje NO enviado.`)
    return
  }
  try {
    await sendTemplateMessage(phone, templateSid, variables)
  } catch (err) {
    console.error(`[Delivery] Error enviando plantilla ${templateType}:`, err)
  }
}

export async function POST(request: NextRequest) {
  try {
    // ─── AUTH (fail-closed): rechaza si secret no configurado ───
    const authHeader = request.headers.get('x-webhook-secret')
    const expectedSecret = process.env.WEBHOOK_DELIVERY_SECRET

    if (!expectedSecret) {
      console.error('[Delivery] WEBHOOK_DELIVERY_SECRET no configurado — rechazando request')
      return NextResponse.json({ error: 'Webhook no configurado' }, { status: 503 })
    }

    if (authHeader !== expectedSecret) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // ─── RATE LIMITING por IP ───
    const ip = getClientIp(request)
    const rl = rateLimit(`webhook-delivery:${ip}`, 60, 60_000) // 60/min por IP
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes', retryAfter: rl.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      )
    }

    const body = (await request.json()) as DeliveryRequestBody
    const { nombre_cliente, celular, direccion, metodo_pago, monto_total, raw_message, ciudad } = body

    if (!celular) {
      return NextResponse.json(
        { ok: false, error: 'Falta celular del cliente' },
        { status: 400 }
      )
    }

    const { valid, cleaned } = validatePhone(celular)
    if (!valid) {
      return NextResponse.json(
        { ok: false, error: 'Celular inválido', celular },
        { status: 400 }
      )
    }

    const customerName = nombre_cliente?.trim() || 'Cliente Domicilio'

    let customer = await findCustomerByPhone(cleaned)
    let isNew = false
    let action: 'created' | 'updated' = 'updated'

    if (!customer) {
      customer = await createCustomer({
        phone: cleaned,
        name: customerName,
        birthday: null,
        city: ciudad ?? null,
        source: 'delivery',
      })
      isNew = true
      action = 'created'
    } else {
      customer = await incrementVisit(customer.id, customer.total_visits, 'delivery')
      if (ciudad && !customer.city) {
        await updateCustomerCityIfNull(customer.id, ciudad)
      }
    }

    await createVisit({
      customerId: customer.id,
      source: 'delivery',
      notes: metodo_pago ? `Pago: ${metodo_pago}` : undefined,
      address: direccion ?? undefined,
      paymentMethod: metodo_pago ?? undefined,
      amount: monto_total ?? undefined,
      rawMessage: raw_message ?? undefined,
    })

    const settings = await getMultipleSettings([
      'welcome_template_sid',
      'welcome_back_template_sid',           // legacy fallback
      'welcome_back_near_template_sid',
      'welcome_back_far_template_sid',
      'reward_template_sid',
    ])
    const reward = await checkRewardForVisit(customer.total_visits)

    const roadmap = await buildRewardsRoadmap(customer.total_visits)

    if (isNew) {
      await sendDeliveryTemplate(settings.welcome_template_sid, 'welcome', cleaned, { '1': customer.name, '2': roadmap })
    } else if (reward) {
      await sendDeliveryTemplate(settings.reward_template_sid, 'reward', cleaned, {
        '1': customer.name,
        '2': String(customer.total_visits),
        '3': reward.title,
        '4': roadmap,
      })
    } else {
      const nextReward = await getNextReward(customer.total_visits)
      const remaining = getRemainingForReward(customer.total_visits, nextReward)
      const rewardTitle = getRewardTitle(nextReward)
      const isNear = remaining === 1
      const targetSid = isNear
        ? (settings.welcome_back_near_template_sid ?? settings.welcome_back_template_sid)
        : (settings.welcome_back_far_template_sid ?? settings.welcome_back_template_sid)
      await sendDeliveryTemplate(targetSid, isNear ? 'welcome_back_near' : 'welcome_back_far', cleaned, {
        '1': customer.name,
        '2': String(customer.total_visits),
        '3': rewardTitle,
        '4': roadmap,
      })
    }

    // Google Contacts sync (awaited — Vercel mata fire-and-forget)
    try {
      await syncGoogleContact({
        phone: cleaned,
        name: customer.name,
        address: direccion ?? null,
        totalVisits: customer.total_visits,
        source: 'delivery',
        action,
      })
    } catch (err) {
      console.error('[Delivery] Error sync Google Contacts:', err)
    }

    return NextResponse.json({
      ok: true,
      is_new: isNew,
      action,
      cliente_id: customer.id,
      customer: {
        name: customer.name,
        phone: customer.phone,
        total_visits: customer.total_visits,
      },
      reward: reward ? { title: reward.title } : null,
    })
  } catch (error) {
    console.error('[Delivery] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Error del servidor' },
      { status: 500 }
    )
  }
}
