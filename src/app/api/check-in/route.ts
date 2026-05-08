import { NextRequest, NextResponse } from 'next/server'
import { validatePhone } from '@/lib/validators/phone'
import { findCustomerByPhone, createCustomer, incrementVisit } from '@/services/customer.service'
import { createVisit, getRecentVisit } from '@/services/visit.service'
import { checkRewardForVisit, getNextReward, getRewardTitle, getRemainingForReward } from '@/services/reward.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getMultipleSettings } from '@/services/settings.service'
import { syncGoogleContact } from '@/services/google-contacts-sync.service'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

// Rate limits por IP
const LOOKUP_MAX = 30         // 30 lookups/min por IP (bajo para evitar enumeración)
const REGISTER_MAX = 5        // 5 registros/hora por IP (anti-spam de cuentas falsas)
const CHECKIN_MAX = 20        // 20 check-ins/min por IP
const MINUTE = 60_000
const HOUR = 3_600_000

interface CheckInRequestBody {
  phone: string
  action: 'lookup' | 'register' | 'checkin'
  name?: string
  birthday?: string | null
  city?: string | null
  accepts_marketing?: boolean
  table_number?: number | null
}

/**
 * Envía plantilla WhatsApp de forma best-effort.
 * Si no hay SID configurado, solo loguea advertencia.
 * Variables estándar: {{1}}=nombre, {{2}}=visitas, {{3}}=hint/premio
 */
async function sendCheckinTemplate(
  templateSid: string | undefined,
  templateType: string,
  phone: string,
  variables: Record<string, string>
): Promise<void> {
  if (!templateSid) {
    console.warn(`[CheckIn] No hay plantilla configurada para "${templateType}" — mensaje NO enviado. Configúrala en Dashboard > Ajustes.`)
    return
  }
  try {
    await sendTemplateMessage(phone, templateSid, variables)
  } catch (err) {
    console.error(`[CheckIn] Error enviando plantilla ${templateType}:`, err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CheckInRequestBody
    const { phone, action } = body

    if (!phone || !action) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere phone y action' },
        { status: 400 }
      )
    }

    const { valid, cleaned } = validatePhone(phone)
    if (!valid) {
      return NextResponse.json(
        { error: 'Teléfono inválido', message: 'Ingresa un número colombiano válido (10 dígitos, empieza con 3)' },
        { status: 400 }
      )
    }

    // ─── RATE LIMITING por IP ───
    const ip = getClientIp(request)
    const rateLimitConfig = {
      lookup: { max: LOOKUP_MAX, window: MINUTE },
      register: { max: REGISTER_MAX, window: HOUR },
      checkin: { max: CHECKIN_MAX, window: MINUTE },
    }[action]

    if (rateLimitConfig) {
      const rl = rateLimit(`checkin:${action}:${ip}`, rateLimitConfig.max, rateLimitConfig.window)
      if (!rl.allowed) {
        return NextResponse.json(
          {
            error: 'Demasiadas solicitudes',
            message: `Espera ${rl.retryAfterSeconds} segundos antes de intentar nuevamente.`,
          },
          {
            status: 429,
            headers: { 'Retry-After': String(rl.retryAfterSeconds) },
          }
        )
      }
    }

    // ─── LOOKUP: buscar si el cliente existe ───
    if (action === 'lookup') {
      const customer = await findCustomerByPhone(cleaned)
      if (customer) {
        return NextResponse.json({
          found: true,
          customer: { name: customer.name, total_visits: customer.total_visits },
        })
      }
      return NextResponse.json({ found: false })
    }

    // ─── REGISTER: crear cliente nuevo + primera visita ───
    if (action === 'register') {
      const { name, birthday, city } = body

      if (!name || name.trim().length < 2) {
        return NextResponse.json(
          { error: 'Nombre inválido', message: 'El nombre debe tener al menos 2 caracteres' },
          { status: 400 }
        )
      }

      const existing = await findCustomerByPhone(cleaned)
      if (existing) {
        return NextResponse.json(
          { error: 'Ya registrado', message: 'Este número ya está registrado' },
          { status: 409 }
        )
      }

      const customer = await createCustomer({
        phone: cleaned,
        name: name.trim(),
        birthday: birthday ?? null,
        city: city?.trim() || null,
        accepts_marketing: body.accepts_marketing ?? true,
      })

      // Visita (best-effort — no debe bloquear el registro)
      try {
        await createVisit({ customerId: customer.id, source: 'qr', tableNumber: body.table_number ?? null })
      } catch (visitErr) {
        console.error('[CheckIn] Error creando visita (registro continuará):', visitErr)
      }

      // WhatsApp de bienvenida — DEBE usar await para que Vercel no mate el proceso
      const settings = await getMultipleSettings(['welcome_template_sid'])
      await sendCheckinTemplate(
        settings.welcome_template_sid,
        'welcome',
        cleaned,
        { '1': customer.name }
      )

      // Google Contacts sync (best-effort pero awaited para Vercel)
      try {
        await syncGoogleContact({
          phone: cleaned,
          name: customer.name,
          birthday: customer.birthday ?? null,
          city: customer.city ?? null,
          totalVisits: customer.total_visits,
          source: 'qr',
          action: 'created',
        })
      } catch (err) {
        console.error('[CheckIn] Error sync Google Contacts:', err)
      }

      return NextResponse.json(
        {
          message: 'welcome',
          customer: { name: customer.name, total_visits: customer.total_visits },
        },
        { status: 201 }
      )
    }

    // ─── CHECKIN: cliente existente + registrar visita ───
    if (action === 'checkin') {
      const customer = await findCustomerByPhone(cleaned)
      if (!customer) {
        return NextResponse.json(
          { error: 'No encontrado', message: 'Cliente no encontrado' },
          { status: 404 }
        )
      }

      // Verificar check-in duplicado (máximo 1 por día = 1440 minutos)
      const recentVisit = await getRecentVisit(customer.id, 1440)
      if (recentVisit) {
        return NextResponse.json(
          {
            error: 'Check-in reciente',
            message: `Ya registraste tu visita hoy, ${customer.name}. ¡Solo puedes registrar una visita por día!`,
            customer: { name: customer.name, total_visits: customer.total_visits },
          },
          { status: 429 }
        )
      }

      const updated = await incrementVisit(customer.id, customer.total_visits, 'qr')
      await createVisit({ customerId: customer.id, source: 'qr', tableNumber: body.table_number ?? null })

      // Fetch settings para plantillas
      const settings = await getMultipleSettings([
        'welcome_back_template_sid',           // legacy fallback
        'welcome_back_near_template_sid',      // remaining === 1
        'welcome_back_far_template_sid',       // remaining >= 2
        'reward_template_sid',
      ])

      // Evaluar recompensa
      const reward = await checkRewardForVisit(updated.total_visits)

      // Google Contacts sync (best-effort pero awaited para Vercel)
      try {
        await syncGoogleContact({
          phone: cleaned,
          name: updated.name,
          totalVisits: updated.total_visits,
          source: 'qr',
          action: 'updated',
        })
      } catch (err) {
        console.error('[CheckIn] Error sync Google Contacts:', err)
      }

      if (reward) {
        // Envía plantilla de recompensa. Si no está configurada, fallback a welcome_back
        const rewardTemplateConfigured = !!settings.reward_template_sid
        if (rewardTemplateConfigured) {
          await sendCheckinTemplate(
            settings.reward_template_sid,
            'reward',
            cleaned,
            { '1': updated.name, '2': String(updated.total_visits), '3': reward.title }
          )
        } else {
          // Fallback: si no hay reward_template_sid, usa cualquier welcome_back disponible
          // pasando reward.title en {{3}}. La plantilla decidirá cómo mostrarlo.
          const fallbackSid = settings.welcome_back_far_template_sid
            ?? settings.welcome_back_near_template_sid
            ?? settings.welcome_back_template_sid
          await sendCheckinTemplate(
            fallbackSid,
            'welcome_back (fallback por falta de template reward)',
            cleaned,
            { '1': updated.name, '2': String(updated.total_visits), '3': reward.title }
          )
        }

        return NextResponse.json({
          message: 'welcome_back',
          customer: { name: updated.name, total_visits: updated.total_visits },
          reward: { title: reward.title, message: reward.message_template },
        })
      }

      // Fetch next reward y decidir near (faltan 1) vs far (faltan ≥2)
      const nextReward = await getNextReward(updated.total_visits)
      const remaining = getRemainingForReward(updated.total_visits, nextReward)
      const rewardTitle = getRewardTitle(nextReward)

      // Selección de plantilla: near/far si están configuradas, fallback al legacy welcome_back
      const isNear = remaining === 1
      const targetSid = isNear
        ? (settings.welcome_back_near_template_sid ?? settings.welcome_back_template_sid)
        : (settings.welcome_back_far_template_sid ?? settings.welcome_back_template_sid)

      await sendCheckinTemplate(
        targetSid,
        isNear ? 'welcome_back_near' : 'welcome_back_far',
        cleaned,
        { '1': updated.name, '2': String(updated.total_visits), '3': rewardTitle }
      )

      return NextResponse.json({
        message: 'welcome_back',
        customer: { name: updated.name, total_visits: updated.total_visits },
        reward: null,
        nextReward: nextReward ? { ...nextReward, remaining } : null,
      })
    }

    return NextResponse.json(
      { error: 'Acción inválida', message: 'action debe ser: lookup, register o checkin' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[CheckIn] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error procesando tu solicitud' },
      { status: 500 }
    )
  }
}
