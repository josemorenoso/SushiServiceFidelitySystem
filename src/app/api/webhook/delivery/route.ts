import { NextRequest, NextResponse } from 'next/server'
import { validatePhone } from '@/lib/validators/phone'
import { findCustomerByPhone, createCustomer, incrementVisit, updateCustomerCityIfNull, updateCustomerBirthdayIfNull } from '@/services/customer.service'
import { createVisit } from '@/services/visit.service'
import { awardVisitPoints, awardWelcomeBonus } from '@/services/points.service'
import { evaluateNewTier, getNextTier, buildTiersRoadmap, updateCustomerTier } from '@/services/reward-tiers.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getMultipleSettings } from '@/services/settings.service'
import { syncGoogleContact } from '@/services/google-contacts-sync.service'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { getTenantBySlug } from '@/lib/tenant'
import type { Tenant } from '@/types/tenant.types'

interface DeliveryRequestBody {
  nombre_cliente: string
  celular: string
  direccion?: string | null
  metodo_pago?: string | null
  monto_total?: number | null
  raw_message?: string | null
  ciudad?: string | null
  birthday?: string | null
  tenant_slug: string
}

function parseBirthday(raw: string | null | undefined): string | null {
  if (!raw) return null
  const parts = raw.trim().split('/')
  if (parts.length !== 3) return null
  const [day, month, year] = parts.map(p => parseInt(p, 10))
  if (!day || !month || !year) return null
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  if (year < 1900 || year > new Date().getFullYear()) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function sendDeliveryTemplate(
  templateSid: string | undefined,
  templateType: string,
  phone: string,
  variables: Record<string, string>,
  customerId: string | null,
  tenant: Tenant
): Promise<void> {
  if (!templateSid) {
    console.warn(`[Delivery] No hay plantilla configurada para "${templateType}" — mensaje NO enviado.`)
    return
  }
  try {
    // logContext para que el envío quede trazado en message_logs (auditoría 18-Junio, CR-03).
    await sendTemplateMessage(phone, templateSid, variables, tenant, undefined, {
      customerId,
      messageType: templateType,
    })
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
    const { nombre_cliente, celular, direccion, metodo_pago, monto_total, raw_message, ciudad, birthday } = body

    const tenant = await getTenantBySlug(body.tenant_slug)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

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

    let customer = await findCustomerByPhone(cleaned, tenant.id)
    let isNew = false
    let action: 'created' | 'updated' = 'updated'

    const parsedBirthday = parseBirthday(birthday)

    if (!customer) {
      customer = await createCustomer({
        phone: cleaned,
        name: customerName,
        birthday: parsedBirthday,
        city: ciudad ?? null,
        tenantId: tenant.id,
        source: 'delivery',
      })
      isNew = true
      action = 'created'
    } else {
      customer = await incrementVisit(customer.id, customer.total_visits, 'delivery')
      if (ciudad && !customer.city) {
        await updateCustomerCityIfNull(customer.id, ciudad)
      }
      if (parsedBirthday && !customer.birthday) {
        await updateCustomerBirthdayIfNull(customer.id, parsedBirthday)
      }
    }

    const visit = await createVisit({
      customerId: customer.id,
      source: 'delivery',
      tenantId: tenant.id,
      notes: metodo_pago ? `Pago: ${metodo_pago}` : undefined,
      address: direccion ?? undefined,
      paymentMethod: metodo_pago ?? undefined,
      amount: monto_total ?? undefined,
      rawMessage: raw_message ?? undefined,
    })

    const settings = await getMultipleSettings([
      'welcome_template_sid',
      'points_earned_far_template_sid',
      'points_earned_near_template_sid',
      'tier_unlocked_template_sid',
    ], tenant.id)

    // Puntos de bienvenida para nuevos clientes
    let welcomePoints = { pointsAwarded: 0, newBalance: 0 }
    if (isNew) {
      try {
        welcomePoints = await awardWelcomeBonus(customer.id, tenant.id)
      } catch (err) {
        console.error('[Delivery] Error otorgando puntos de bienvenida:', err)
      }
    }

    // Para clientes existentes: otorgar puntos por visita y evaluar tiers
    let pointsResult = { pointsAwarded: welcomePoints.pointsAwarded, newBalance: welcomePoints.newBalance }
    let newTier = null
    let nextTierInfo = null
    let tiersRoadmapText = '🌟 ¡Seguí sumando puntos para desbloquear premios!'

    if (!isNew) {
      const previousPoints = customer.total_points ?? 0
      try {
        pointsResult = await awardVisitPoints(customer.id, visit.id, 'delivery', tenant.id)
        console.log(`[Delivery] Puntos otorgados: +${pointsResult.pointsAwarded} → balance=${pointsResult.newBalance} (prev=${previousPoints})`)
      } catch (err) {
        console.error('[Delivery] ERROR otorgando puntos (se usa fallback 0):', err)
        pointsResult = { pointsAwarded: 0, newBalance: previousPoints }
      }

      try {
        newTier = await evaluateNewTier(previousPoints, pointsResult.newBalance, tenant.id)
        if (newTier) {
          await updateCustomerTier(customer.id, newTier.tier_name)
        }
        nextTierInfo = await getNextTier(pointsResult.newBalance, tenant.id)
      } catch (err) {
        console.error('[Delivery] ERROR evaluando tiers (se continúa sin tiers):', err)
      }
    }

    try {
      tiersRoadmapText = await buildTiersRoadmap(pointsResult.newBalance, tenant.id)
    } catch (err) {
      console.error('[Delivery] Error generando tiers roadmap:', err)
    }

    if (isNew) {
      await sendDeliveryTemplate(settings.welcome_template_sid, 'welcome', cleaned, {
        '1': customer.name,
        '2': String(pointsResult.newBalance),
        '3': tiersRoadmapText,
      }, customer.id, tenant)
    } else if (newTier) {
      await sendDeliveryTemplate(settings.tier_unlocked_template_sid, 'tier_unlocked', cleaned, {
        '1': customer.name,
        '2': newTier.tier_name,
        '3': newTier.safe_reward_title,
        '4': tiersRoadmapText,
      }, customer.id, tenant)
    } else {
      const isNearTier = nextTierInfo && nextTierInfo.pointsRemaining <= 30
      const targetSid = isNearTier
        ? settings.points_earned_near_template_sid
        : settings.points_earned_far_template_sid
      if (targetSid) {
        await sendDeliveryTemplate(targetSid, isNearTier ? 'points_earned_near' : 'points_earned_far', cleaned, {
          '1': customer.name,
          '2': String(pointsResult.pointsAwarded),
          '3': String(pointsResult.newBalance),
          '4': isNearTier ? nextTierInfo!.tier.safe_reward_title : tiersRoadmapText,
        }, customer.id, tenant)
      } else {
        console.warn('[Delivery] No hay plantilla de puntos configurada (points_earned_near/far_template_sid). Mensaje WhatsApp NO enviado.')
      }
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
        total_points: pointsResult.newBalance,
      },
      points_awarded: pointsResult.pointsAwarded,
      tier_unlocked: newTier ? { name: newTier.tier_name, safe_reward: newTier.safe_reward_title } : null,
    })
  } catch (error) {
    console.error('[Delivery] Error:', error)
    return NextResponse.json(
      { ok: false, error: 'Error del servidor' },
      { status: 500 }
    )
  }
}
