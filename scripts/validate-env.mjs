#!/usr/bin/env node
// Valida que el entorno esté listo para deploy.
// Uso: node scripts/validate-env.mjs
// Lee .env.local automáticamente si existe.

import { readFileSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  const path = join(__dirname, '..', '.env.local')
  if (!existsSync(path)) {
    console.warn('⚠️  .env.local no encontrado — usando variables del sistema\n')
    return
  }
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

const REQUIRED = [
  ['NEXT_PUBLIC_SUPABASE_URL',      'URL del proyecto Supabase'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Clave anónima Supabase (pública)'],
  ['SUPABASE_SERVICE_ROLE_KEY',     'Clave service_role Supabase (privada)'],
  ['CRON_SECRET',                   'Secret para proteger rutas /api/cron/*'],
  ['STAFF_JWT_SECRET',              'Secret JWT sesiones de staff (mín 32 chars)'],
  ['STAFF_QR_JWT_SECRET',           'Secret JWT QR dinámico del cliente (mín 32 chars)'],
  ['NEXT_PUBLIC_BRAND_NAME',        'Nombre del negocio'],
]

// Migración Zernio (docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md §1): un proyecto
// puede tener tenants en cualquiera de los dos proveedores (o ambos, mientras dura la
// migración), así que ya no se exige Twilio a secas — se exige AL MENOS UN proveedor
// completo. Las credenciales del proveedor NO usado quedan en OPTIONAL más abajo.
const TWILIO_PROVIDER_VARS = [
  ['TWILIO_ACCOUNT_SID',     'Account SID de Twilio'],
  ['TWILIO_AUTH_TOKEN',      'Auth Token de Twilio'],
  ['TWILIO_WHATSAPP_NUMBER', 'Número WhatsApp — debe empezar con whatsapp:'],
]
const ZERNIO_PROVIDER_VARS = [
  ['ZERNIO_API_KEY',        'API key de Zernio (Bearer)'],
  ['ZERNIO_WEBHOOK_SECRET', 'Secreto para firmar/verificar el webhook de Zernio'],
]

const OPTIONAL = [
  ['NEXT_PUBLIC_BRAND_SHORT',            'Abreviatura del nombre'],
  ['NEXT_PUBLIC_BRAND_TAGLINE',          'Eslogan del programa de fidelidad'],
  ['NEXT_PUBLIC_STAFF_ROLE_LABEL',       'Etiqueta del staff: Mesero | Barbero | etc.'],
  ['RESTAURANT_WHATSAPP_LINK',           'Link wa.me del negocio para atención humana'],
  ['WEBHOOK_DELIVERY_SECRET',            'Secret webhook domicilios (n8n) — solo restaurantes'],
  ['NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL', 'URL reseñas Google Maps'],
  ['N8N_BASE_URL',                       'URL base de tu instancia n8n'],
]

const SENSITIVE = new Set(['SECRET', 'KEY', 'TOKEN', 'SID', 'ROLE'])
const isSensitive = (key) => [...SENSITIVE].some(s => key.toUpperCase().includes(s))

let errors = 0

console.log('\n══════════════════════════════════════════')
console.log('  Validador de Entorno — RestaurantQR')
console.log(`  Cliente: ${process.env.NEXT_PUBLIC_BRAND_NAME ?? '(sin configurar)'}`)
console.log('══════════════════════════════════════════\n')

// ── 1. Variables requeridas ──────────────────────────────────────────────────
console.log('📋 Variables requeridas:\n')
for (const [key, desc] of REQUIRED) {
  if (!process.env[key]) {
    console.log(`  ❌  ${key.padEnd(38)} ← ${desc}`)
    errors++
  } else {
    const preview = isSensitive(key) ? '••••••••' : process.env[key].slice(0, 50)
    console.log(`  ✅  ${key.padEnd(38)} ${preview}`)
  }
}

// ── 2. Proveedor de mensajería (Twilio o Zernio — se exige al menos uno completo) ──
console.log('\n📡 Proveedor de mensajería:\n')

const missingTwilio = TWILIO_PROVIDER_VARS.filter(([key]) => !process.env[key])
const missingZernio = ZERNIO_PROVIDER_VARS.filter(([key]) => !process.env[key])
const twilioComplete = missingTwilio.length === 0
const zernioComplete = missingZernio.length === 0
const twilioAttempted = missingTwilio.length < TWILIO_PROVIDER_VARS.length
const zernioAttempted = missingZernio.length < ZERNIO_PROVIDER_VARS.length

function printProviderVar(key, desc, attempted) {
  if (process.env[key]) {
    const preview = isSensitive(key) ? '••••••••' : process.env[key].slice(0, 50)
    console.log(`  ✅  ${key.padEnd(38)} ${preview}`)
  } else {
    console.log(`  ${attempted ? '❌' : '⚪'}  ${key.padEnd(38)} ← ${desc}`)
  }
}

for (const [key, desc] of TWILIO_PROVIDER_VARS) printProviderVar(key, desc, twilioAttempted)
for (const [key, desc] of ZERNIO_PROVIDER_VARS) printProviderVar(key, desc, zernioAttempted)

if (!twilioComplete && !zernioComplete) {
  errors++
  if (!twilioAttempted && !zernioAttempted) {
    console.log('\n  ❌  Ningún proveedor de mensajería configurado. Configura UNO completo:')
    console.log('      Opción A (Twilio): TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_NUMBER')
    console.log('      Opción B (Zernio): ZERNIO_API_KEY + ZERNIO_WEBHOOK_SECRET')
  } else {
    if (twilioAttempted) {
      console.log(`\n  ❌  Twilio incompleto — falta: ${missingTwilio.map(([key]) => key).join(', ')}`)
    }
    if (zernioAttempted) {
      console.log(`  ❌  Zernio incompleto — falta: ${missingZernio.map(([key]) => key).join(', ')}`)
    }
  }
} else {
  const active = [twilioComplete && 'Twilio', zernioComplete && 'Zernio'].filter(Boolean).join(' + ')
  console.log(`\n  ✅  Proveedor completo: ${active}`)
}

// ── 3. Validaciones de formato ───────────────────────────────────────────────
console.log('\n🔍 Validaciones de formato:\n')

const whatsapp = process.env.TWILIO_WHATSAPP_NUMBER
if (whatsapp && !whatsapp.startsWith('whatsapp:')) {
  console.log('  ❌  TWILIO_WHATSAPP_NUMBER debe empezar con "whatsapp:" — ej: whatsapp:+14155238886')
  errors++
} else if (whatsapp) {
  console.log('  ✅  TWILIO_WHATSAPP_NUMBER tiene formato correcto')
}

const jwtSecret = process.env.STAFF_JWT_SECRET
if (jwtSecret && jwtSecret.length < 32) {
  console.log(`  ❌  STAFF_JWT_SECRET muy corto (${jwtSecret.length} chars, mínimo 32)`)
  errors++
} else if (jwtSecret) {
  console.log(`  ✅  STAFF_JWT_SECRET tiene longitud adecuada (${jwtSecret.length} chars)`)
}

const qrSecret = process.env.STAFF_QR_JWT_SECRET
if (qrSecret && qrSecret.length < 32) {
  console.log(`  ❌  STAFF_QR_JWT_SECRET muy corto (${qrSecret.length} chars, mínimo 32)`)
  errors++
} else if (qrSecret) {
  console.log(`  ✅  STAFF_QR_JWT_SECRET tiene longitud adecuada (${qrSecret.length} chars)`)
}

// ── 4. Variables opcionales ──────────────────────────────────────────────────
console.log('\n💡 Variables opcionales:\n')
let warnings = 0
for (const [key, desc] of OPTIONAL) {
  if (!process.env[key]) {
    console.log(`  ⚪  ${key.padEnd(38)} ${desc}`)
    warnings++
  } else {
    console.log(`  ✅  ${key.padEnd(38)} configurada`)
  }
}

// ── 5. Conexión Supabase ─────────────────────────────────────────────────────
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (supabaseUrl && serviceKey) {
  console.log('\n🗄️  Probando conexión Supabase...\n')
  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })
    const { error } = await supabase.from('customers').select('id').limit(1)
    if (error) throw new Error(error.message)
    console.log('  ✅  Supabase conectado — tabla customers accesible')

    const { error: staffError } = await supabase.from('staff_users').select('id').limit(1)
    if (staffError) {
      console.log('  ⚠️   Tabla staff_users no encontrada — ¿aplicaste todas las migraciones?')
      warnings++
    } else {
      console.log('  ✅  Tabla staff_users accesible')
    }
  } catch (e) {
    console.log(`  ❌  Supabase: ${e.message}`)
    errors++
  }
} else {
  console.log('\n⚪  Saltando test de Supabase (variables no configuradas)\n')
}

// ── 6. Resultado final ───────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════')
if (errors === 0) {
  console.log(`✅  Listo para deploy`)
  if (warnings > 0) console.log(`    (${warnings} variable(s) opcional(es) sin configurar — no bloquea el deploy)`)
} else {
  console.log(`❌  ${errors} error(es) encontrados — corrige antes de hacer deploy`)
}
console.log('══════════════════════════════════════════\n')

process.exit(errors === 0 ? 0 : 1)
