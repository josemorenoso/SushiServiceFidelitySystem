import { NextRequest, NextResponse } from 'next/server'
import { validatePhone } from '@/lib/validators/phone'
import { findCustomerByPhone, createCustomer, incrementVisit } from '@/services/customer.service'
import { createVisit, getRecentVisit } from '@/services/visit.service'
import { checkRewardForVisit } from '@/services/reward.service'
import { sendWelcomeMessage, sendRewardMessage, sendWelcomeBackMessage } from '@/services/whatsapp.service'
import { syncGoogleContact } from '@/services/google-contacts-sync.service'

interface CheckInRequestBody {
  phone: string
  action: 'lookup' | 'register' | 'checkin'
  name?: string
  birthday?: string | null
  city?: string | null
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
      })

      await createVisit({ customerId: customer.id, source: 'qr' })

      // WhatsApp de bienvenida (best-effort)
      sendWelcomeMessage(cleaned, customer.name).catch((err) =>
        console.error('[CheckIn] Error enviando WhatsApp bienvenida:', err)
      )

      // Google Contacts sync (best-effort)
      syncGoogleContact({
        phone: cleaned,
        name: customer.name,
        source: 'qr',
        action: 'created',
      }).catch((err) =>
        console.error('[CheckIn] Error sync Google Contacts:', err)
      )

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
      await createVisit({ customerId: customer.id, source: 'qr' })

      // Evaluar recompensa
      const reward = await checkRewardForVisit(updated.total_visits)

      if (reward) {
        // WhatsApp de recompensa (best-effort)
        sendRewardMessage(
          cleaned,
          updated.name,
          updated.total_visits,
          reward.title,
          reward.message_template
        ).catch((err) =>
          console.error('[CheckIn] Error enviando WhatsApp recompensa:', err)
        )

        return NextResponse.json({
          message: 'welcome_back',
          customer: { name: updated.name, total_visits: updated.total_visits },
          reward: { title: reward.title, message: reward.message_template },
        })
      }

      // WhatsApp de bienvenido de vuelta (best-effort)
      sendWelcomeBackMessage(cleaned, updated.name, updated.total_visits).catch((err) =>
        console.error('[CheckIn] Error enviando WhatsApp welcome back:', err)
      )

      // Google Contacts sync (best-effort)
      syncGoogleContact({
        phone: cleaned,
        name: updated.name,
        source: 'qr',
        action: 'updated',
      }).catch((err) =>
        console.error('[CheckIn] Error sync Google Contacts:', err)
      )

      return NextResponse.json({
        message: 'welcome_back',
        customer: { name: updated.name, total_visits: updated.total_visits },
        reward: null,
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
