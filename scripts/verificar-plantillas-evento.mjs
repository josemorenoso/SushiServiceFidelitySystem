#!/usr/bin/env node
/**
 * verificar-plantillas-evento.mjs — Diagnóstico SOLO LECTURA de las plantillas
 * de evento (calendario) en una cuenta Twilio.
 *
 * NO ENVÍA NADA. Solo hace GET contra la Content API. Se puede correr contra
 * producción sin riesgo.
 *
 * Responde la pregunta que bloquea el calendario: "¿el envío con imagen de este
 * tenant va a funcionar de verdad?". Para que funcione, la plantilla que se
 * pegue en `admin_settings.event_template_image_sid` tiene que cumplir LAS TRES:
 *
 *   1. ser de tipo `twilio/media`             (si no, no lleva flyer);
 *   2. tener la media con variable `{{6}}`    (si es fija, TODOS los clientes
 *      reciben la imagen de muestra en vez del flyer del evento);
 *   3. estar `approved` por Meta              (si no, falla cliente por cliente).
 *
 * Son los mismos tres chequeos que `assertEventTemplateUsable()` hace en caliente
 * (src/services/calendar.service.ts) — este script los adelanta al escritorio.
 *
 * Además compara el dominio horneado en la plantilla contra el bucket que este
 * despliegue usa hoy: la plantilla aprobada tiene el dominio FIJO, así que una
 * plantilla creada contra otro proyecto de Supabase entrega 404 a Meta.
 *
 * Uso:
 *   node --env-file=.env.twilio scripts/verificar-plantillas-evento.mjs
 *   node --env-file=.env.sushifun scripts/verificar-plantillas-evento.mjs
 *
 * Variables: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN (obligatorias)
 *            NEXT_PUBLIC_SUPABASE_URL (opcional: compara el dominio del bucket)
 */

const SID = process.env.TWILIO_ACCOUNT_SID
const TOKEN = process.env.TWILIO_AUTH_TOKEN
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

if (!SID || !TOKEN) {
  console.error('Faltan TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN.')
  console.error('Usá: node --env-file=.env.twilio scripts/verificar-plantillas-evento.mjs')
  process.exit(1)
}

const AUTH = 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64')
const BUCKET_BASE = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/event-media`
  : null

async function get(url) {
  const res = await fetch(url, { headers: { Authorization: AUTH } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${res.status} ${json.message ?? ''}`)
  return json
}

async function main() {
  console.log(`\nCuenta Twilio: ${SID}`)
  console.log('(solo lectura — este script no envía ningún mensaje)\n')

  let page = await get('https://content.twilio.com/v1/Content?PageSize=100')
  const contents = [...(page.contents ?? [])]
  while (page.meta?.next_page_url) {
    page = await get(page.meta.next_page_url)
    contents.push(...(page.contents ?? []))
  }

  console.log(`Plantillas en la cuenta: ${contents.length}\n`)

  const media = contents.filter((c) => c.types && 'twilio/media' in c.types)
  if (media.length === 0) {
    console.log('RESULTADO: ninguna plantilla `twilio/media` en esta cuenta.')
    console.log('           El calendario NO puede enviar eventos con imagen desde acá.')
    console.log('           Creala con: node scripts/twilio-create-media-templates.mjs\n')
    console.log('Plantillas que sí existen (todas de texto):')
    for (const c of contents) console.log(`  ${c.sid}  ${c.friendly_name}  [${Object.keys(c.types ?? {}).join(', ')}]`)
    return
  }

  const usables = []
  for (const c of media) {
    const urls = c.types['twilio/media'].media ?? []
    const dinamica = urls.some((u) => u.includes('{{'))

    let estado = 'desconocido'
    let motivo = ''
    try {
      const appr = await get(`https://content.twilio.com/v1/Content/${c.sid}/ApprovalRequests`)
      estado = appr?.whatsapp?.status?.toLowerCase() ?? 'sin solicitud'
      motivo = appr?.whatsapp?.rejection_reason ?? ''
    } catch (err) {
      estado = `no se pudo leer (${err.message})`
    }

    const dominioOk = BUCKET_BASE ? urls.some((u) => u.startsWith(BUCKET_BASE)) : null
    const sirve = dinamica && estado === 'approved' && dominioOk !== false

    console.log(`${sirve ? '[SIRVE]  ' : '[NO]     '}${c.sid}  ${c.friendly_name}`)
    console.log(`         media: ${urls[0] ?? '(ninguna)'}`)
    console.log(`         dinamica={{...}}: ${dinamica ? 'si' : 'NO (media FIJA: todos recibirian la muestra)'}`)
    console.log(`         Meta: ${estado}${motivo ? ` — ${motivo}` : ''}`)
    if (dominioOk === false) {
      console.log(`         dominio: NO coincide con este bucket (${BUCKET_BASE}) -> Meta recibiria 404`)
    } else if (dominioOk === true) {
      console.log('         dominio: coincide con el bucket de este despliegue')
    }
    console.log('')
    if (sirve) usables.push(c)
  }

  console.log('─'.repeat(70))
  if (usables.length === 0) {
    console.log('RESULTADO: ninguna plantilla de esta cuenta sirve como event_template_image_sid.')
  } else {
    console.log('RESULTADO: pegá uno de estos SID en Dashboard -> Ajustes -> event_template_image_sid:')
    for (const c of usables) console.log(`  ${c.sid}   ${c.friendly_name}`)
  }
  console.log('')
}

main().catch((err) => {
  console.error(`\nError: ${err.message}\n`)
  process.exit(1)
})
