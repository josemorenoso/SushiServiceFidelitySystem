#!/usr/bin/env node
/**
 * twilio-create-media-templates.mjs — Crea las plantillas WhatsApp de media
 *
 * Crea dos plantillas tipo `twilio/media` en Twilio Content API:
 *   1. evento_imagen  — para festivales/promos con imagen (JPG/PNG)
 *   2. evento_video   — para festivales/promos con video (MP4)
 *
 * Variables de cada plantilla:
 *   {{1}} = nombre del cliente
 *   {{2}} = nombre del restaurante (NEXT_PUBLIC_BRAND_NAME)
 *   {{3}} = título del evento
 *   {{4}} = fecha del evento (legible)
 *   {{5}} = descripción / CTA
 *   {{6}} = URL del archivo media (imagen o video) — dinámico al enviar
 *
 * La plantilla se aprueba una vez y el URL de media se pasa en cada envío
 * vía contentVariables → {{6}}. Meta aprueba la *estructura*, no la imagen.
 *
 * Uso:
 *   TWILIO_ACCOUNT_SID=ACxxx \
 *   TWILIO_AUTH_TOKEN=xxx \
 *   NEXT_PUBLIC_BRAND_NAME="La Fogata" \
 *   node scripts/twilio-create-media-templates.mjs
 *
 * Al finalizar imprime los SIDs. Agrégalos en Supabase admin_settings:
 *   key = event_template_image_sid  → valor = HXaaa...
 *   key = event_template_video_sid  → valor = HXbbb...
 */

const {
  TWILIO_ACCOUNT_SID: SID,
  TWILIO_AUTH_TOKEN: TOKEN,
  NEXT_PUBLIC_BRAND_NAME: BRAND_NAME = 'El Restaurante',
} = process.env

const missing = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'].filter((k) => !process.env[k])
if (missing.length) {
  console.error('❌ Faltan variables de entorno:\n' + missing.map((k) => `   ${k}`).join('\n'))
  process.exit(1)
}

const CONTENT_API = 'https://content.twilio.com/v1/Content'
const AUTH = 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64')

// ── Helpers ───────────────────────────────────────────────────────────────────
async function contentPost(body) {
  const res = await fetch(CONTENT_API, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${res.status} ${json.message ?? JSON.stringify(json)}`)
  return json
}

async function submitApproval(sid, name) {
  const res = await fetch(`${CONTENT_API}/${sid}/ApprovalRequests/whatsapp`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category: 'MARKETING' }),
  })
  const json = await res.json()
  if (!res.ok) {
    const msg = json.message || json.error_message || JSON.stringify(json)
    throw new Error(`ApprovalRequest failed: ${res.status} ${msg}`)
  }
  return json
}

// ── Definición de plantillas ──────────────────────────────────────────────────
// Meta requiere suficiente texto entre variables (ratio ~1 var / 50 chars).
// Con 5 variables este body de ~170 chars cumple la regla.
const TEMPLATE_BODY = `¡Hola {{1}}! 🎉\n\n*{{2}}* tiene el placer de invitarte a vivir una noche especial:\n*{{3}}* 🍽️\n\n📅 {{4}}\n\n{{5}}\n\n¡Te esperamos con tu familia!\n\n_Responde SALIR para no recibir más mensajes._`

const templates = [
  {
    friendly_name: `evento_imagen_${BRAND_NAME.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    meta_name: `evento_imagen_${BRAND_NAME.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    type: 'twilio/media',
    // meta_mime_types determines what Meta approves: image/jpeg + image/png
    mime_hint: 'image',
    description: 'Festival / promo con imagen (JPG/PNG)',
  },
  {
    friendly_name: `evento_video_${BRAND_NAME.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    meta_name: `evento_video_${BRAND_NAME.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    type: 'twilio/media',
    mime_hint: 'video',
    description: 'Festival / promo con video (MP4)',
  },
]

function buildTemplateBody(mimeHint) {
  // URLs de Google Storage / gstatic — accesibles por bots de Meta sin bloqueos.
  // Wikipedia y W3Schools bloquean user-agents de crawlers → rechazo en aprobación.
  const sampleMediaUrl = mimeHint === 'image'
    ? 'https://www.gstatic.com/webp/gallery3/1.png'
    : 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'

  return {
    friendly_name: undefined, // set per-template
    language: 'es',
    variables: {
      '1': 'María',
      '2': BRAND_NAME,
      '3': 'Festival Gastronómico',
      '4': 'sábado 14 de junio',
      '5': '¡Te esperamos con tu familia! 🍽️',
      '6': sampleMediaUrl,
    },
    types: {
      'twilio/media': {
        body: TEMPLATE_BODY,
        media: [sampleMediaUrl], // URL real de ejemplo (Twilio NO acepta {{N}} aquí)
      },
    },
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 twilio-create-media-templates\n')
  console.log(`  Brand: ${BRAND_NAME}`)
  console.log(`  Account: ${SID}\n`)

  const results = {}

  for (const tpl of templates) {
    console.log(`⏳ Creando plantilla: ${tpl.friendly_name} (${tpl.description})...`)

    const bodyPayload = buildTemplateBody(tpl.mime_hint)
    bodyPayload.friendly_name = tpl.friendly_name

    let created
    try {
      created = await contentPost(bodyPayload)
      console.log(`  ✓ Creada: SID = ${created.sid}`)
    } catch (err) {
      console.error(`  ❌ Error creando ${tpl.friendly_name}: ${err.message}`)
      continue
    }

    console.log(`  ⏳ Enviando a Meta para aprobación...`)
    try {
      const approval = await submitApproval(created.sid, tpl.meta_name)
      const status = approval?.whatsapp?.status || approval?.status || 'submitted'
      console.log(`  ✓ Aprobación enviada — status inicial: ${status}`)
    } catch (err) {
      console.warn(`  ⚠️  Plantilla creada pero aprobación falló: ${err.message}`)
      console.warn(`     Puedes reenviarla manualmente desde Dashboard → Plantillas → "Enviar a Meta"`)
    }

    const settingsKey = tpl.mime_hint === 'image'
      ? 'event_template_image_sid'
      : 'event_template_video_sid'
    results[settingsKey] = created.sid
    console.log()
  }

  console.log('══════════════════════════════════════════════════════')
  console.log('✅ Proceso completado. Agrega estos valores en Supabase:')
  console.log('   Dashboard → Ajustes → admin_settings\n')
  for (const [key, sid] of Object.entries(results)) {
    console.log(`   ${key} = ${sid}`)
  }
  console.log()
  console.log('⚠️  Meta tarda 24-72h en aprobar. Mientras tanto las plantillas')
  console.log('   aparecerán con status "pending" en Dashboard → Plantillas.')
  console.log('══════════════════════════════════════════════════════\n')
}

main().catch((err) => {
  console.error('\n❌ Error fatal:', err.message)
  process.exit(1)
})
