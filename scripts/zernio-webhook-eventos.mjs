#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// zernio-webhook-eventos.mjs — Qué eventos tiene suscritos el webhook de Zernio,
// y agregar el que falte SIN tocar los demás.
// ═══════════════════════════════════════════════════════════════
// Node puro, SIN imports de src/ (igual que zernio-sandbox-test.mjs: es una
// herramienta de diagnóstico standalone).
//
// POR QUÉ EXISTE
// ─────────────
// La suscripción de eventos del webhook NO vive en este repo: se configura en el
// Team de Zernio y no hay forma de verla desde el código. Eso convirtió un
// despliegue entero en algo no verificable: los domicilios escritos en el
// auto-chat de la propia línea entran por `message.sent` (ver la 00068 y
// `docs/features/delivery-webhook.md`), y si ese evento no está suscrito no llega
// nada — sin error, sin log, sin nada que mirar.
//
// Con esto, «suscribir message.sent» deja de ser un trámite a mano y pasa a ser
// un comando que además deja ver lo que había antes.
//
// Rutas: `GET /v1/webhooks/settings` y `PUT /v1/webhooks/settings` ({_id, ...campos}),
// las dos del contrato §5 (`Level 2.0/aios-constelarys/docs/zernio-api-contract.md`).
// Acá no se inventa ninguna.
//
// Uso:
//   node scripts/zernio-webhook-eventos.mjs                      # solo mira y reporta
//   node scripts/zernio-webhook-eventos.mjs --aplicar            # agrega message.sent
//   node scripts/zernio-webhook-eventos.mjs --evento X --aplicar # agrega otro evento
//   node scripts/zernio-webhook-eventos.mjs --id <_id> --aplicar # elige el webhook a mano
//
// Por defecto NO escribe nada: hay que pedirlo con --aplicar. Es aditivo —
// los eventos que ya estaban se conservan todos.
//
// Lee ZERNIO_API_KEY de .env.local, de .env, o del entorno. Nunca la imprime.
// ═══════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = 'https://zernio.com/api/v1'

// ─── Entorno ────────────────────────────────────────────────────

function cargarEnv(nombre) {
  const path = join(__dirname, '..', nombre)
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}

cargarEnv('.env.local')
cargarEnv('.env')

const API_KEY = process.env.ZERNIO_API_KEY
if (!API_KEY) {
  console.error('✗ Falta ZERNIO_API_KEY.')
  console.error('')
  console.error('  Ponela en .env (está en .gitignore) como:')
  console.error('      ZERNIO_API_KEY=...')
  console.error('')
  console.error('  Ojo: en Vercel esa variable es `sensitive`, así que NO se puede leer')
  console.error('  desde ahí — ni por el dashboard ni por la API. Sale del panel de Zernio.')
  process.exit(1)
}

// ─── Flags ──────────────────────────────────────────────────────

const argv = process.argv.slice(2)
function flag(nombre) {
  const i = argv.indexOf(`--${nombre}`)
  return i === -1 ? null : (argv[i + 1] ?? null)
}
const APLICAR = argv.includes('--aplicar')
const EVENTO = flag('evento') ?? 'message.sent'
const ID_ELEGIDO = flag('id')

// ─── HTTP ───────────────────────────────────────────────────────

async function zernio(metodo, ruta, body) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const texto = await res.text()
  let json = null
  try {
    json = texto ? JSON.parse(texto) : null
  } catch {
    /* respuesta no-JSON: se reporta cruda más abajo */
  }
  if (!res.ok) {
    // La key nunca viaja al log, pero el cuerpo del error sí puede traer pistas.
    throw new Error(`${metodo} ${ruta} → HTTP ${res.status}: ${texto.slice(0, 400)}`)
  }
  return json
}

/**
 * El listado viene envuelto de alguna de estas formas según el endpoint
 * (`{success, data}` es lo habitual en Zernio). Se toleran las tres en vez de
 * asumir una: equivocarse acá se vería como "no hay webhooks configurados", que
 * es justo la conclusión falsa que este script viene a evitar.
 */
function sacarLista(json) {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.data)) return json.data
  if (Array.isArray(json?.data?.webhooks)) return json.data.webhooks
  if (Array.isArray(json?.webhooks)) return json.webhooks
  if (json?.data && typeof json.data === 'object') return [json.data]
  return []
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('→ Leyendo la suscripción de webhooks del Team...\n')
  const webhooks = sacarLista(await zernio('GET', '/webhooks/settings'))

  if (webhooks.length === 0) {
    console.log('✗ No hay ningún webhook configurado en este Team.')
    console.log('  Nada de lo que depende de eventos entrantes puede estar funcionando.')
    process.exitCode = 2
    return
  }

  console.log(`Hay ${webhooks.length} webhook(s):\n`)
  for (const w of webhooks) {
    const eventos = Array.isArray(w.events) ? w.events : []
    console.log(`  _id      ${w._id ?? w.id ?? '(sin id)'}`)
    console.log(`  nombre   ${w.name ?? '(sin nombre)'}`)
    console.log(`  url      ${w.url ?? '(sin url)'}`)
    console.log(`  activo   ${w.isActive === false ? 'NO' : 'sí'}`)
    console.log(`  eventos  ${eventos.length ? eventos.join(', ') : '(ninguno)'}`)
    console.log(`  ${EVENTO}  →  ${eventos.includes(EVENTO) ? '✓ ya suscrito' : '✗ FALTA'}`)
    console.log('')
  }

  // Cuál tocar: el que apunta a nuestra ruta, o el que digan con --id.
  const candidatos = ID_ELEGIDO
    ? webhooks.filter((w) => (w._id ?? w.id) === ID_ELEGIDO)
    : webhooks.filter((w) => typeof w.url === 'string' && w.url.includes('/api/webhook/zernio'))

  if (candidatos.length === 0) {
    console.log('✗ Ninguno apunta a /api/webhook/zernio.')
    console.log('  Si el webhook del producto es uno de los de arriba con otra URL,')
    console.log('  volvé a correr con --id <_id> para elegirlo a mano.')
    process.exitCode = 2
    return
  }

  if (candidatos.length > 1) {
    console.log('✗ Hay más de uno apuntando a nuestra ruta. Elegí con --id <_id>:')
    for (const w of candidatos) console.log(`    ${w._id ?? w.id}  ${w.url}`)
    process.exitCode = 2
    return
  }

  const w = candidatos[0]
  const id = w._id ?? w.id
  const eventos = Array.isArray(w.events) ? w.events : []

  if (eventos.includes(EVENTO)) {
    console.log(`✓ Nada que hacer: "${EVENTO}" ya está suscrito en ${id}.`)
    return
  }

  const nuevos = [...eventos, EVENTO]

  if (!APLICAR) {
    console.log('── Simulacro (no se escribió nada) ─────────────────────')
    console.log(`  webhook ${id} (${w.url})`)
    console.log(`  eventos: ${eventos.length} → ${nuevos.length}  (+${EVENTO})`)
    console.log('')
    console.log('  Para aplicarlo de verdad:')
    console.log(`      node scripts/zernio-webhook-eventos.mjs --aplicar`)
    return
  }

  console.log(`→ Agregando "${EVENTO}" al webhook ${id} (aditivo: los ${eventos.length} de antes se conservan)...`)
  await zernio('PUT', '/webhooks/settings', { _id: id, events: nuevos })

  // No se confía en el 200: se vuelve a leer y se comprueba.
  const despues = sacarLista(await zernio('GET', '/webhooks/settings'))
  const verificado = despues.find((x) => (x._id ?? x.id) === id)
  const eventosFinales = Array.isArray(verificado?.events) ? verificado.events : []

  if (!eventosFinales.includes(EVENTO)) {
    console.error(`✗ El PUT devolvió 200 pero "${EVENTO}" sigue sin aparecer al releer.`)
    console.error(`  Eventos ahora: ${eventosFinales.join(', ') || '(ninguno)'}`)
    process.exitCode = 3
    return
  }

  const perdidos = eventos.filter((e) => !eventosFinales.includes(e))
  if (perdidos.length > 0) {
    console.error(`✗ Se perdieron eventos que antes estaban: ${perdidos.join(', ')}`)
    console.error('  Hay que reponerlos a mano en el panel de Zernio.')
    process.exitCode = 3
    return
  }

  console.log(`✓ Listo. "${EVENTO}" suscrito y verificado releyendo.`)
  console.log(`  Eventos ahora (${eventosFinales.length}): ${eventosFinales.join(', ')}`)
}

// `process.exitCode` y no `process.exit()`: en Windows, cortar el proceso con un
// fetch todavía abierto dispara un assert de libuv que tapa el mensaje de error.
main().catch((err) => {
  console.error(`✗ ${err.message}`)
  if (/HTTP 401/.test(err.message)) {
    console.error('')
    console.error('  401 = la ZERNIO_API_KEY no sirve (vencida, rotada, o de otro Team).')
    console.error('  Se saca una nueva del panel de Zernio y se pone en .env (gitignoreado).')
  }
  process.exitCode = 1
})
