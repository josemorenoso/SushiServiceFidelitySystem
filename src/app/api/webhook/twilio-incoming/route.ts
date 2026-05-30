import { NextRequest, NextResponse } from 'next/server'
import { validateTwilioSignature } from '@/lib/validators/twilio'
import { createClient } from '@supabase/supabase-js'

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'el restaurante'
const RESTAURANT_LINK =
  process.env.RESTAURANT_WHATSAPP_LINK ??
  (process.env.DELIVERY_PHONE_NUMBER
    ? `https://wa.me/57${process.env.DELIVERY_PHONE_NUMBER.replace(/\D/g, '')}`
    : '')

const KEYWORDS: Record<string, string[]> = {
  pedido: ['pedido', 'domicilio', 'delivery', 'comprar', 'ordenar', 'pedir', 'menu', 'carta'],
  horario: ['horario', 'abierto', 'abren', 'cierran', 'hora', 'horas'],
  ubicacion: ['direccion', 'ubicacion', 'donde', 'queda', 'dirección', 'ubicación', 'cómo llego'],
}

function detectIntent(text: string): keyof typeof KEYWORDS | 'default' {
  const lower = text.toLowerCase()
  for (const [intent, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) return intent as keyof typeof KEYWORDS
  }
  return 'default'
}

function buildMessage(intent: keyof typeof KEYWORDS | 'default'): string {
  const redirect = RESTAURANT_LINK ? `\n\n📲 Escríbenos aquí: ${RESTAURANT_LINK}` : ''

  switch (intent) {
    case 'pedido':
      return `🍽️ ¡Para pedidos o domicilios te atendemos en la línea principal de ${BRAND_NAME}!${redirect}`
    case 'horario':
      return `🕐 Para consultar horarios comunícate con nosotros directamente.${redirect}`
    case 'ubicacion':
      return `📍 Para dirección e indicaciones comunícate con nosotros directamente.${redirect}`
    default:
      return `👋 Hola, este número de *${BRAND_NAME}* es exclusivo para mensajes automáticos 🔔\n\nPara hablar con nosotros:${redirect}\n\n¡Te respondemos rápido!`
  }
}

function twimlResponse(message: string): NextResponse {
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Message>${escaped}</Message>\n</Response>`
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

function normalizePhone(from: string): string {
  return from
    .replace(/^whatsapp:\+?/i, '')
    .replace(/[^0-9]/g, '')
    .replace(/^57/, '')
    .slice(-10)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const url = req.url
  const signature = req.headers.get('x-twilio-signature') ?? ''

  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody))

  if (!validateTwilioSignature(url, params, signature)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = (params['Body'] ?? '').trim()
  const upper = body.toUpperCase()

  // Twilio intercepts STOP/START before hitting this webhook in most cases,
  // but handle defensively just in case.
  if (['STOP', 'UNSTOP', 'START', 'BAJA', 'ALTA', 'SALIR', 'NO'].includes(upper)) {
    return new NextResponse(null, { status: 200 })
  }

  const from = params['From'] ?? ''
  const phone = normalizePhone(from)

  // Si el remitente es un mesero autorizado, redirigir a n8n para procesar el pedido
  if (phone.length === 10) {
    try {
      const db = getServiceClient()
      const { data: authorized } = await db
        .from('authorized_numbers')
        .select('id')
        .eq('phone', phone)
        .eq('is_active', true)
        .maybeSingle()

      if (authorized) {
        const n8nUrl = process.env.N8N_DOMICILIOS_WEBHOOK_URL
        if (!n8nUrl) {
          console.error('[twilio-incoming] N8N_DOMICILIOS_WEBHOOK_URL no configurado')
          return twimlResponse('❌ Error de configuración en el sistema. Avisa al administrador.')
        }

        console.log(`[twilio-incoming] mesero autorizado ${phone} → forwarding a n8n`)

        const n8nRes = await fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: rawBody,
        })

        const n8nText = await n8nRes.text()
        return new NextResponse(n8nText, {
          status: 200,
          headers: { 'Content-Type': 'text/xml' },
        })
      }
    } catch (err) {
      console.error('[twilio-incoming] Error forwarding a n8n:', err)
      return twimlResponse('❌ Error procesando el pedido. Intenta de nuevo en un momento.')
    }
  }

  const intent = detectIntent(body)
  const message = buildMessage(intent)

  console.log(`[twilio-incoming] from=${from} body="${body}" intent=${intent}`)

  return twimlResponse(message)
}
