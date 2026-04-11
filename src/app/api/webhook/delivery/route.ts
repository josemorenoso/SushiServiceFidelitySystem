import { NextRequest, NextResponse } from 'next/server'
import { validatePhone } from '@/lib/validators/phone'
import { findCustomerByPhone, createCustomer, incrementVisit } from '@/services/customer.service'
import { createVisit } from '@/services/visit.service'
import { checkRewardForVisit } from '@/services/reward.service'
import { sendWelcomeMessage, sendRewardMessage, sendWelcomeBackMessage } from '@/services/whatsapp.service'

interface DeliveryRequestBody {
  nombre_cliente: string
  celular: string
  direccion?: string | null
  metodo_pago?: string | null
  monto_total?: number | null
  raw_message?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('x-webhook-secret')
    const expectedSecret = process.env.WEBHOOK_DELIVERY_SECRET

    if (expectedSecret && authHeader !== expectedSecret) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = (await request.json()) as DeliveryRequestBody
    const { nombre_cliente, celular, direccion, metodo_pago, monto_total, raw_message } = body

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
        city: null,
        source: 'delivery',
      })
      isNew = true
      action = 'created'
    } else {
      customer = await incrementVisit(customer.id, customer.total_visits, 'delivery')
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

    const reward = await checkRewardForVisit(customer.total_visits)

    if (isNew) {
      sendWelcomeMessage(cleaned, customer.name).catch((err) =>
        console.error('[Delivery] Error WhatsApp bienvenida:', err)
      )
    } else if (reward) {
      sendRewardMessage(
        cleaned,
        customer.name,
        customer.total_visits,
        reward.title,
        reward.message_template
      ).catch((err) =>
        console.error('[Delivery] Error WhatsApp recompensa:', err)
      )
    } else {
      sendWelcomeBackMessage(cleaned, customer.name, customer.total_visits).catch((err) =>
        console.error('[Delivery] Error WhatsApp welcome back:', err)
      )
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
