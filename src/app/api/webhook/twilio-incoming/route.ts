import { NextRequest, NextResponse } from 'next/server'
import { validateTwilioSignature } from '@/lib/validators/twilio'

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'el restaurante'
const DELIVERY_PHONE = process.env.DELIVERY_PHONE_NUMBER ?? ''

function twimlResponse(message: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${message}</Message>
</Response>`
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const url = req.url
  const signature = req.headers.get('x-twilio-signature') ?? ''

  const body = await req.text()
  const params = Object.fromEntries(new URLSearchParams(body))

  if (!validateTwilioSignature(url, params, signature)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const incomingBody = (params['Body'] ?? '').trim().toUpperCase()

  // Twilio handles STOP/UNSTOP automatically — this handles everything else
  if (incomingBody === 'STOP' || incomingBody === 'UNSTOP') {
    return new NextResponse(null, { status: 200 })
  }

  const deliveryLink = DELIVERY_PHONE
    ? `wa.me/57${DELIVERY_PHONE.replace(/\D/g, '')}`
    : ''

  const message = deliveryLink
    ? `Hola! Este número de ${BRAND_NAME} es solo para notificaciones automáticas 🔔. Para pedidos de domicilio escríbenos al: ${deliveryLink}`
    : `Hola! Este número de ${BRAND_NAME} es solo para notificaciones automáticas 🔔. Para pedidos o consultas comunícate directamente con el restaurante.`

  return twimlResponse(message)
}
