#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// zernio-sandbox-test.mjs — Prueba manual de envío de plantilla vía Zernio
// ═══════════════════════════════════════════════════════════════
// Node puro, SIN imports de src/ (a propósito: es una herramienta de
// diagnóstico standalone, no debe arrastrar el resto de la app). Habla
// directo con la misma ruta que usa src/lib/zernio/messaging.ts
// (POST /v1/inbox/conversations) para poder probar el envío real de una
// plantilla sin tener que levantar el servidor Next.js.
//
// ⚠️⚠️⚠️ ADVERTENCIA — LEE ANTES DE CORRER ESTO ⚠️⚠️⚠️
// El número de sandbox de Zernio (+12029087457) es COMPARTIDO entre TODOS
// los desarrolladores que están probando Zernio ahora mismo — no es exclusivo
// de esta cuenta (confirmado en docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md
// §1, "número de sandbox... compartido entre TODOS los desarrolladores"). Se
// vieron plantillas de otros negocios (deploy, recibo de pago, cita) listando
// ese número. ENVÍA SOLO A UN TELÉFONO PROPIO (--to). Nunca a un cliente real,
// nunca a un número que no controles tú mismo.
//
// Uso:
//   node scripts/zernio-sandbox-test.mjs --account <accountId> --to <telefono> [opciones]
//
// Flags:
//   --account   <id>       accountId de Zernio (obligatorio) — ver GET /v1/accounts
//   --to        <telefono> Destino, dígitos internacionales sin '+' (obligatorio, ej: 573001234567)
//   --template  <name>     Nombre de la plantilla (default: sandbox_start)
//   --params    "a,b,c"    Variables separadas por coma, en orden de aparición (opcional)
//   --lang      <code>     Idioma de la plantilla (default: env ZERNIO_TEMPLATE_LANGUAGE o 'en_US')
//
// Lee ZERNIO_API_KEY de .env.local si existe, o del entorno del sistema.
// ═══════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  const path = join(__dirname, '..', '.env.local')
  if (!existsSync(path)) return
  const lines = readFileSync(path, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvLocal()

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]
    if (!raw.startsWith('--')) continue
    const eq = raw.indexOf('=')
    if (eq !== -1) {
      args[raw.slice(2, eq)] = raw.slice(eq + 1)
    } else {
      const key = raw.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next
        i++
      } else {
        args[key] = true
      }
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))

console.log('\n══════════════════════════════════════════════════════════════')
console.log('  ⚠️  Zernio Sandbox Test — número COMPARTIDO entre devs')
console.log('  ⚠️  NUNCA envíes a un número que no sea tuyo propio')
console.log('══════════════════════════════════════════════════════════════\n')

if (!args.account || !args.to) {
  console.error('❌  Faltan flags obligatorios.\n')
  console.error('Uso: node scripts/zernio-sandbox-test.mjs --account <accountId> --to <telefono> [--template sandbox_start] [--params "a,b"] [--lang en_US]\n')
  process.exit(1)
}

const apiKey = process.env.ZERNIO_API_KEY
if (!apiKey) {
  console.error('❌  ZERNIO_API_KEY no configurada (.env.local o variable de entorno).')
  process.exit(1)
}

const accountId = String(args.account)
const toPhone = String(args.to).replace(/[^0-9]/g, '')
const templateName = args.template ? String(args.template) : 'sandbox_start'
const templateLanguage = args.lang ? String(args.lang) : (process.env.ZERNIO_TEMPLATE_LANGUAGE ?? 'en_US')
const templateParams = args.params
  ? String(args.params).split(',').map((s) => s.trim())
  : undefined

if (!/^[0-9]{7,15}$/.test(toPhone)) {
  console.error(`❌  --to inválido: "${args.to}" → limpiado a "${toPhone}". Debe ser solo dígitos internacionales, sin '+' (ej: 573001234567).`)
  process.exit(1)
}

// Mismo request que sendZernioTemplateMessage() en src/lib/zernio/messaging.ts —
// deliberadamente NO se importa ese módulo (este script es standalone).
const body = {
  accountId,
  participantId: toPhone,
  templateName,
  templateLanguage,
}
if (templateParams) body.templateParams = templateParams

const url = 'https://zernio.com/api/v1/inbox/conversations'

console.log('📤 Request:')
console.log(`   POST ${url}`)
console.log(`   Authorization: Bearer ${'•'.repeat(8)}`)
console.log(`   Body: ${JSON.stringify(body, null, 2)}\n`)

let res
try {
  res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
} catch (err) {
  console.error(`❌  No se pudo alcanzar Zernio: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}

const raw = await res.text()
let parsed = raw
try {
  parsed = JSON.parse(raw)
} catch {
  // respuesta no-JSON — se imprime cruda
}

console.log(`📥 Response: HTTP ${res.status}`)
console.log(typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2))
console.log('')

process.exit(res.ok ? 0 : 1)
