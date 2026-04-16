import { formatPhoneForWhatsApp } from '@/lib/validators/phone'

export interface TwilioMessageResponse {
  sid: string
  status: string
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER

  if (!accountSid || !authToken || !whatsappNumber) {
    return null
  }

  return { accountSid, authToken, whatsappNumber }
}

async function sendWhatsApp(to: string, body: string): Promise<TwilioMessageResponse | null> {
  const config = getTwilioClient()
  if (!config) {
    console.warn('[WhatsApp] Twilio no configurado — mensaje no enviado')
    return null
  }

  try {
    const twilio = (await import('twilio')).default
    const client = twilio(config.accountSid, config.authToken)

    const message = await client.messages.create({
      from: config.whatsappNumber,
      to: formatPhoneForWhatsApp(to),
      body,
    })

    console.log(`[WhatsApp] Mensaje enviado: ${message.sid}`)
    return { sid: message.sid, status: message.status }
  } catch (error) {
    console.error('[WhatsApp] Error enviando mensaje:', error)
    return null
  }
}

export async function sendTemplateMessage(
  phone: string,
  contentSid: string,
  variables: Record<string, string>
): Promise<TwilioMessageResponse | null> {
  const config = getTwilioClient()
  if (!config) {
    console.warn('[WhatsApp] Twilio no configurado — mensaje no enviado')
    return null
  }

  try {
    const twilio = (await import('twilio')).default
    const client = twilio(config.accountSid, config.authToken)

    const message = await client.messages.create({
      from: config.whatsappNumber,
      to: formatPhoneForWhatsApp(phone),
      contentSid,
      contentVariables: JSON.stringify(variables),
    })

    console.log(`[WhatsApp] Template enviado: ${message.sid} (${contentSid})`)
    return { sid: message.sid, status: message.status }
  } catch (error) {
    console.error('[WhatsApp] Error enviando template:', error)
    return null
  }
}

export async function sendWelcomeMessage(phone: string, name: string): Promise<TwilioMessageResponse | null> {
  const body = `¡Hola ${name}! 👋 Bienvenido/a a nuestro restaurante. Gracias por registrarte en nuestro programa de fidelidad. ¡Cada visita cuenta! 🎉`
  return sendWhatsApp(phone, body)
}

export async function sendRewardMessage(
  phone: string,
  name: string,
  visits: number,
  rewardTitle: string,
  messageTemplate: string
): Promise<TwilioMessageResponse | null> {
  const body = messageTemplate
    .replace('{{name}}', name)
    .replace('{{visits}}', String(visits))

  return sendWhatsApp(phone, body)
}

export async function sendWelcomeBackMessage(
  phone: string,
  name: string,
  visits: number,
  rewardHint?: string
): Promise<TwilioMessageResponse | null> {
  let body = `¡Hola de nuevo ${name}! 😊 Qué gusto verte otra vez. Esta es tu visita #${visits}.`
  if (rewardHint) {
    body += `\n\n🎁 ${rewardHint}`
  } else {
    body += ' ¡Sigue acumulando para ganar premios! 🌟'
  }
  return sendWhatsApp(phone, body)
}

export async function sendBirthdayMessage(
  phone: string,
  name: string,
  template: string
): Promise<TwilioMessageResponse | null> {
  const body = template.replace('{{name}}', name)
  return sendWhatsApp(phone, body)
}

export async function sendReactivationMessage(
  phone: string,
  name: string,
  template: string
): Promise<TwilioMessageResponse | null> {
  const body = template.replace('{{name}}', name)
  return sendWhatsApp(phone, body)
}

export async function sendCampaignMessage(
  phone: string,
  name: string,
  template: string
): Promise<TwilioMessageResponse | null> {
  const body = template.replace('{{name}}', name)
  return sendWhatsApp(phone, body)
}
