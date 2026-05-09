#!/usr/bin/env node
/**
 * twilio-setup.mjs — Configura Twilio para un nuevo cliente
 *
 * Hace DOS cosas:
 *   1. Crea un Messaging Service con keywords de opt-out en español
 *      y lo vincula al número de WhatsApp
 *   2. Configura el webhook anti-idiotas (wa.me redirect) en el número
 *
 * Uso:
 *   TWILIO_ACCOUNT_SID=ACxxx \
 *   TWILIO_AUTH_TOKEN=xxx \
 *   TWILIO_WHATSAPP_NUMBER=+14155238886 \
 *   VERCEL_APP_URL=https://cliente.vercel.app \
 *   RESTAURANT_WA_NUMBER=573001234567 \
 *   node scripts/twilio-setup.mjs
 */

const {
  TWILIO_ACCOUNT_SID: SID,
  TWILIO_AUTH_TOKEN: TOKEN,
  TWILIO_WHATSAPP_NUMBER: WA_NUMBER,
  VERCEL_APP_URL,
  RESTAURANT_WA_NUMBER,
} = process.env

// ── Validación de credenciales ──────────────────────────────────────────────
const missing = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER', 'VERCEL_APP_URL', 'RESTAURANT_WA_NUMBER']
  .filter((k) => !process.env[k])

if (missing.length) {
  console.error('❌ Faltan variables de entorno:\n' + missing.map((k) => `   ${k}`).join('\n'))
  process.exit(1)
}

const WEBHOOK_URL = `${VERCEL_APP_URL}/api/webhook/twilio-incoming`
const WA_LINK = `https://wa.me/${RESTAURANT_WA_NUMBER}`
const AUTH = 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64')

// ── Helpers HTTP ─────────────────────────────────────────────────────────────
async function twilioPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${res.status} ${json.message ?? JSON.stringify(json)}`)
  return json
}

async function twilioGet(url) {
  const res = await fetch(url, { headers: { Authorization: AUTH } })
  const json = await res.json()
  if (!res.ok) throw new Error(`${res.status} ${json.message ?? JSON.stringify(json)}`)
  return json
}

// ── 1. Buscar el IncomingPhoneNumber SID del número de WhatsApp ──────────────
async function findPhoneNumberSid(phoneNumber) {
  const encoded = encodeURIComponent(phoneNumber)
  const data = await twilioGet(
    `https://api.twilio.com/2010-04-01/Accounts/${SID}/IncomingPhoneNumbers.json?PhoneNumber=${encoded}`
  )
  const numbers = data.incoming_phone_numbers ?? []
  if (!numbers.length) throw new Error(`Número ${phoneNumber} no encontrado en este account.`)
  return numbers[0].sid
}

// ── 2. Crear Messaging Service con opt-out keywords en español ────────────────
async function createMessagingService(friendlyName) {
  console.log('  Creando Messaging Service...')
  const service = await twilioPost('https://messaging.twilio.com/v1/Services', {
    FriendlyName: friendlyName,
    InboundRequestUrl: WEBHOOK_URL,
    InboundMethod: 'POST',
    UseInboundWebhookOnNumber: 'false', // usamos el del Service, no el del número
    Usecase: 'marketing',
    SmsFallbackUrl: '',
    StatusCallback: '',
    StickyReceiver: 'true',
    MmsConverter: 'true',
    ScanMessageContent: 'disable',
    FallbackToLongCode: 'false',
  })
  console.log(`  ✓ Messaging Service creado: ${service.sid} (${service.friendly_name})`)
  return service.sid
}

// ── 3. Agregar el número al Messaging Service ─────────────────────────────────
async function addNumberToService(serviceSid, phoneNumberSid) {
  console.log('  Vinculando número al Messaging Service...')
  await twilioPost(`https://messaging.twilio.com/v1/Services/${serviceSid}/PhoneNumbers`, {
    PhoneNumberSid: phoneNumberSid,
  })
  console.log('  ✓ Número vinculado al Messaging Service')
}

// ── 4. Configurar webhook directo en el número (respaldo si MS falla) ─────────
async function setWebhookOnNumber(phoneNumberSid) {
  console.log('  Configurando webhook en el número directamente...')
  await twilioPost(
    `https://api.twilio.com/2010-04-01/Accounts/${SID}/IncomingPhoneNumbers/${phoneNumberSid}.json`,
    {
      SmsUrl: WEBHOOK_URL,
      SmsMethod: 'POST',
      SmsFallbackUrl: '',
      SmsFallbackMethod: 'POST',
    }
  )
  console.log(`  ✓ Webhook configurado: ${WEBHOOK_URL}`)
}

// ── 5. RESUMEN de lo que falta hacer MANUAL en Console (opt-out keywords) ─────
function printManualSteps() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  PASO MANUAL — Opt-Out Keywords en español (2 min)            ║
╠════════════════════════════════════════════════════════════════╣
║  Twilio Console → Messaging → Settings → Opt-Out Management  ║
║                                                                ║
║  Opt-out keywords (agregar):                                   ║
║    BAJA, CANCELAR, FUERA, NO GRACIAS, BASTA                   ║
║                                                                ║
║  Opt-in keywords (agregar):                                    ║
║    ALTA, SI, ACEPTO, QUIERO                                    ║
║                                                                ║
║  Help keywords (agregar):                                      ║
║    AYUDA, INFO                                                 ║
║                                                                ║
║  ⚠️  La API de Twilio NO expone este endpoint públicamente.    ║
║     Solo se puede configurar vía Console.                      ║
╚════════════════════════════════════════════════════════════════╝
`)
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 twilio-setup — Configurando Twilio para cliente\n')
  console.log(`  Número WA:    ${WA_NUMBER}`)
  console.log(`  Webhook URL:  ${WEBHOOK_URL}`)
  console.log(`  wa.me link:   ${WA_LINK}`)
  console.log()

  try {
    // 1. Encontrar SID del número
    console.log('⏳ [1/3] Buscando número en Twilio...')
    const phoneNumberSid = await findPhoneNumberSid(WA_NUMBER)
    console.log(`  ✓ PhoneNumber SID: ${phoneNumberSid}\n`)

    // 2. Crear Messaging Service
    console.log('⏳ [2/3] Creando Messaging Service con webhook...')
    const serviceSid = await createMessagingService(`RestaurantQR-${Date.now()}`)

    // 3. Vincular número al Messaging Service
    await addNumberToService(serviceSid, phoneNumberSid)

    // 4. También setear webhook directo en el número (doble seguro)
    await setWebhookOnNumber(phoneNumberSid)
    console.log()

    console.log('⏳ [3/3] Verificando...')
    const verify = await twilioGet(
      `https://api.twilio.com/2010-04-01/Accounts/${SID}/IncomingPhoneNumbers/${phoneNumberSid}.json`
    )
    console.log(`  ✓ sms_url actual: ${verify.sms_url}`)
    console.log()

    console.log('✅ Configuración automática completada.\n')
    console.log(`  El webhook anti-idiotas está activo en:`)
    console.log(`  ${WEBHOOK_URL}\n`)
    console.log(`  Cuando un cliente responda al número Twilio,`)
    console.log(`  recibirá un mensaje con el link: ${WA_LINK}\n`)

    printManualSteps()

    console.log('📋 Guarda este Messaging Service SID en tus notas:')
    console.log(`   ${serviceSid}\n`)

  } catch (err) {
    console.error('\n❌ Error:', err.message)

    if (err.message.includes('no encontrado')) {
      console.error('\n💡 Tip: El número debe estar registrado como WhatsApp Sender en Twilio.')
      console.error('   Twilio Console → Messaging → Senders → WhatsApp Senders')
    }

    if (err.message.includes('20404') || err.message.includes('not found')) {
      console.error('\n💡 Tip: Verifica que TWILIO_ACCOUNT_SID sea correcto y tenga acceso.')
    }

    process.exit(1)
  }
}

main()
