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
 *   {{6}} = PATH del archivo dentro del bucket `event-media` — dinámico al enviar
 *
 * ── Cómo funciona la media dinámica (importante) ─────────────────────────────
 * Twilio solo admite variables en la URL de media DESPUÉS del dominio:
 *   "Variables are only supported after the domain"
 *   https://www.twilio.com/docs/content/twilio-media
 *
 * Por eso la plantilla se aprueba con el dominio del bucket público como parte
 * FIJA y `{{6}}` como el path del archivo:
 *
 *   media: ["https://<proj>.supabase.co/storage/v1/object/public/event-media/{{6}}"]
 *   → al enviar: contentVariables { "6": "<event_id>/1720000000_flyer.jpg" }
 *
 * Meta aprueba la ESTRUCTURA (header de imagen + texto), no la imagen concreta:
 * una vez aprobada, cada evento manda su propia imagen sin re-aprobar nada.
 *
 * OJO: `ContentSid` y `MediaUrl` son mutuamente excluyentes en la API de Mensajes.
 * La media sale ÚNICAMENTE de la plantilla; no se puede sobreescribir al enviar.
 *
 * ── Requisito previo ────────────────────────────────────────────────────────
 * El sample de {{6}} debe ser un archivo REAL y público en el bucket: Meta lo
 * descarga para revisar la plantilla. Sube uno desde el dashboard (o Supabase
 * Storage) y pásalo en SAMPLE_IMAGE_PATH / SAMPLE_VIDEO_PATH.
 * El script verifica que sea accesible ANTES de crear nada.
 *
 * Uso:
 *   TWILIO_ACCOUNT_SID=ACxxx \
 *   TWILIO_AUTH_TOKEN=xxx \
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
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
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_BRAND_NAME: BRAND_NAME = 'El Restaurante',
  SAMPLE_IMAGE_PATH = '_samples/sample.jpg',
  SAMPLE_VIDEO_PATH = '_samples/sample.mp4',
  // Meta exige nombres de plantilla ÚNICOS. Si ya existe una plantilla con el
  // nombre base (p.ej. la vieja de media fija), pasa TEMPLATE_SUFFIX=_v2 para
  // crear la nueva en paralelo sin borrar la anterior:
  //   evento_imagen_<brand>_v2
  TEMPLATE_SUFFIX = '',
  // SKIP_VIDEO=1 → crea solo la plantilla de imagen (útil si aún no hay un MP4
  // de muestra en el bucket; el sample de video es obligatorio para Meta).
  SKIP_VIDEO = '',
} = process.env

const missing = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'NEXT_PUBLIC_SUPABASE_URL'].filter(
  (k) => !process.env[k]
)
if (missing.length) {
  console.error('❌ Faltan variables de entorno:\n' + missing.map((k) => `   ${k}`).join('\n'))
  process.exit(1)
}

const CONTENT_API = 'https://content.twilio.com/v1/Content'
const AUTH = 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64')

const EVENT_MEDIA_BUCKET = 'event-media'
// Parte FIJA de la URL de media. Debe coincidir con src/lib/twilio/media.ts.
const MEDIA_BASE_URL = `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/${EVENT_MEDIA_BUCKET}`

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

/**
 * Meta descarga el sample para revisar la plantilla. Si no es accesible
 * públicamente, la aprobación se rechaza — así que fallamos antes de crear nada.
 */
async function assertSampleReachable(url) {
  let res
  try {
    res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
  } catch (err) {
    throw new Error(`no se pudo descargar (${err.message})`)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargarlo`)
}

// ── Definición de plantillas ──────────────────────────────────────────────────
// Meta requiere suficiente texto entre variables (ratio ~1 var / 50 chars).
// Con 5 variables de texto este body de ~170 chars cumple la regla.
const TEMPLATE_BODY = `¡Hola {{1}}! 🎉\n\n*{{2}}* tiene el placer de invitarte a vivir una noche especial:\n*{{3}}* 🍽️\n\n📅 {{4}}\n\n{{5}}\n\n¡Te esperamos con tu familia!\n\n_Responde SALIR para no recibir más mensajes._`

const slug = BRAND_NAME.toLowerCase().replace(/[^a-z0-9]/g, '_')
const suffix = TEMPLATE_SUFFIX.toLowerCase().replace(/[^a-z0-9_]/g, '')

const templates = [
  {
    friendly_name: `evento_imagen_${slug}${suffix}`,
    meta_name: `evento_imagen_${slug}${suffix}`,
    settings_key: 'event_template_image_sid',
    sample_path: SAMPLE_IMAGE_PATH,
    description: 'Festival / promo con imagen (JPG/PNG)',
  },
  ...(SKIP_VIDEO
    ? []
    : [{
        friendly_name: `evento_video_${slug}${suffix}`,
        meta_name: `evento_video_${slug}${suffix}`,
        settings_key: 'event_template_video_sid',
        sample_path: SAMPLE_VIDEO_PATH,
        description: 'Festival / promo con video (MP4)',
      }]),
]

function buildTemplateBody(friendlyName, samplePath) {
  return {
    friendly_name: friendlyName,
    language: 'es',
    variables: {
      '1': 'María',
      '2': BRAND_NAME,
      '3': 'Festival Gastronómico',
      '4': 'sábado 14 de junio',
      '5': '¡Te esperamos con tu familia! 🍽️',
      // Sample del PATH (no de la URL completa): Twilio lo concatena al dominio fijo.
      '6': samplePath,
    },
    types: {
      'twilio/media': {
        body: TEMPLATE_BODY,
        // Dominio FIJO + {{6}} como path → media dinámica sin re-aprobar por evento.
        media: [`${MEDIA_BASE_URL}/{{6}}`],
      },
    },
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 twilio-create-media-templates\n')
  console.log(`  Brand:      ${BRAND_NAME}`)
  console.log(`  Account:    ${SID}`)
  console.log(`  Media base: ${MEDIA_BASE_URL}/{{6}}\n`)

  // 1) Verificar los samples ANTES de crear plantillas (Meta los descarga).
  console.log('⏳ Verificando que los samples sean públicamente accesibles...')
  for (const tpl of templates) {
    const url = `${MEDIA_BASE_URL}/${tpl.sample_path}`
    try {
      await assertSampleReachable(url)
      console.log(`  ✓ ${tpl.sample_path}`)
    } catch (err) {
      console.error(`\n❌ Sample inaccesible para ${tpl.friendly_name}: ${err.message}`)
      console.error(`   URL: ${url}`)
      console.error('\n   Meta descarga este archivo para aprobar la plantilla.')
      console.error(`   Sube un archivo de ejemplo al bucket '${EVENT_MEDIA_BUCKET}' en esa ruta`)
      console.error('   (o pasa SAMPLE_IMAGE_PATH / SAMPLE_VIDEO_PATH con la ruta correcta) y reintenta.\n')
      process.exit(1)
    }
  }
  console.log()

  // 2) Crear + enviar a aprobación.
  const results = {}

  for (const tpl of templates) {
    console.log(`⏳ Creando plantilla: ${tpl.friendly_name} (${tpl.description})...`)

    let created
    try {
      created = await contentPost(buildTemplateBody(tpl.friendly_name, tpl.sample_path))
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

    results[tpl.settings_key] = created.sid
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
