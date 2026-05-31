#!/usr/bin/env node
/**
 * twilio-create-text-templates.mjs — Crea las 11 plantillas WhatsApp de texto de golpe
 *
 * Reemplaza [Restaurante] por el brand name y crea todas las plantillas tipo twilio/text
 * en Twilio Content API, luego envía cada una a aprobación de Meta.
 *
 * Uso:
 *   TWILIO_ACCOUNT_SID=ACxxx \
 *   TWILIO_AUTH_TOKEN=xxx \
 *   NEXT_PUBLIC_BRAND_NAME="SushiXMed" \
 *   node scripts/twilio-create-text-templates.mjs
 *
 * Al finalizar imprime los SIDs. Agrégalos en Supabase admin_settings (Dashboard → Ajustes).
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

async function submitApproval(sid, name, category) {
  const res = await fetch(`${CONTENT_API}/${sid}/ApprovalRequests/whatsapp`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category }),
  })
  const json = await res.json()
  if (!res.ok) {
    const msg = json.message || json.error_message || JSON.stringify(json)
    throw new Error(`ApprovalRequest failed: ${res.status} ${msg}`)
  }
  return json
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

function bodyWithBrand(body) {
  return body.replace(/\[Restaurante\]/g, BRAND_NAME)
}

// ── Definición de las 11 plantillas de texto ──────────────────────────────────
const templates = [
  {
    key: 'welcome_template_sid',
    friendly_name: `bienvenida_${slug(BRAND_NAME)}`,
    meta_name: `bienvenida_${slug(BRAND_NAME)}`,
    category: 'UTILITY',
    description: 'Bienvenida con puntos iniciales y roadmap de tiers',
    body: `¡Hola {{1}}! 🎉🍣\n\nBienvenid@ a *${BRAND_NAME}*, nos alegra que seas parte de nuestro club\n\nEn cada visita sumas puntos y recibes premios reales — Hoy recibiste *{{2}} puntos* 🎉\n\nAsí funciona tu camino de recompensas 👇\n\n{{3}}\n\n¡Te esperamos pronto!\n\n_— ${BRAND_NAME}_`,
    variables: {
      '1': 'María',
      '2': '75',
      '3': '🥉 Bronce (150 pts) → Bebida gratis o Mistery Box ❓ — te faltan 75 pts 🔥 · 🥈 Plata (350 pts) → Postre gratis · 🥇 Oro (600 pts) → Plato fuerte · 🖤 BLACK (1000 pts) → Experiencia Chef',
    },
  },
  {
    key: 'points_earned_far_template_sid',
    friendly_name: `puntos_sumados_lejos_${slug(BRAND_NAME)}`,
    meta_name: `puntos_sumados_lejos_${slug(BRAND_NAME)}`,
    category: 'MARKETING',
    description: 'Puntos sumados cuando está lejos del siguiente tier (>30 pts)',
    body: `¡{{1}}, gracias por tu visita! Esperamos que hayas disfrutado tu experiencia 🍣\n\nSumaste *+{{2}} puntos* hoy 🔥\n\nTu saldo: *{{3}} puntos*\n\nSigue visitándonos y descubre lo que te espera 👇\n\n{{4}}\n\nCuando llegues a tu próximo nivel podrás elegir entre tu *premio seguro* o la *Mystery Box* 🎲\n\n_— ${BRAND_NAME}_\n\n_Responde SALIR para no recibir más mensajes._`,
    variables: {
      '1': 'Juan',
      '2': '52',
      '3': '127',
      '4': '🥉 Bronce (150 pts) → Bebida gratis — te faltan 23 pts 🔥 · 🥈 Plata (350 pts) → Postre gratis',
    },
  },
  {
    key: 'points_earned_near_template_sid',
    friendly_name: `puntos_sumados_cerca_${slug(BRAND_NAME)}`,
    meta_name: `puntos_sumados_cerca_${slug(BRAND_NAME)}`,
    category: 'MARKETING',
    description: 'Puntos sumados cuando está cerca del siguiente tier (≤30 pts)',
    body: `¡{{1}}, gracias por tu visita! Esperamos que hayas disfrutado tu experiencia 🍣\n\n¡Casi lo lograste! Sumaste *+{{2}} puntos* 🔥\n\nTu saldo: *{{3}} puntos*\n\nLa próxima visita reclama tu *{{4}}* o si quieres probar suerte, selecciona la *Mystery Box* con premios todavía mejores 🎲\n\n¡Vuelve pronto que ya casi es tuyo!\n\n_— ${BRAND_NAME}_\n\n_Responde SALIR para no recibir más mensajes._`,
    variables: {
      '1': 'Camila',
      '2': '47',
      '3': '128',
      '4': 'Bebida gratis',
    },
  },
  {
    key: 'reward_safe_template_sid',
    friendly_name: `tier_desbloqueado_safe_${slug(BRAND_NAME)}`,
    meta_name: `tier_desbloqueado_safe_${slug(BRAND_NAME)}`,
    category: 'MARKETING',
    description: 'Tier desbloqueado — cliente eligió premio seguro',
    body: `¡{{1}}, gracias por volver! Alcanzaste el nivel *{{2}}* 🏆🍣\n\nElegiste ir a la segura y te ganaste: *{{3}}*\n\nMuestra *este mensaje* al mesero para reclamar tu premio 🎁\n\n{{4}}\n\nSigue sumando puntos para tu próximo nivel.\n\n_— ${BRAND_NAME}_\n\n_Responde SALIR para no recibir más mensajes._`,
    variables: {
      '1': 'Luis',
      '2': 'Bronce',
      '3': 'Bebida gratis',
      '4': '🥉 Bronce (150 pts) → Bebida gratis ✅ · 🥈 Plata (350 pts) → Postre gratis — te faltan 185 pts 🔥',
    },
  },
  {
    key: 'mystery_box_result_template_sid',
    friendly_name: `mystery_box_resultado_${slug(BRAND_NAME)}`,
    meta_name: `mystery_box_resultado_${slug(BRAND_NAME)}`,
    category: 'MARKETING',
    description: 'Resultado de abrir Mystery Box',
    body: `¡{{1}}, gracias por volver! Abriste la *Mystery Box* de *{{2}}* 🎲🍣\n\nTu premio: *{{3}}*\n\nMuestra *este mensaje* al mesero para reclamar tu premio 🎁\n\n{{4}}\n\n¡Sigue sumando puntos, cada visita te acerca a una nueva recompensa!\n\n_— ${BRAND_NAME}_\n\n_Responde SALIR para no recibir más mensajes._`,
    variables: {
      '1': 'Ana',
      '2': 'Bronce',
      '3': 'Postre del chef',
      '4': '🥉 Bronce (150 pts) → Bebida gratis ✅ · 🥈 Plata (350 pts) → Postre gratis — te faltan 180 pts 🔥',
    },
  },
  {
    key: 'golden_box_result_template_sid',
    friendly_name: `golden_box_resultado_${slug(BRAND_NAME)}`,
    meta_name: `golden_box_resultado_${slug(BRAND_NAME)}`,
    category: 'MARKETING',
    description: 'Golden Box resultado (pity timer)',
    body: `¡{{1}}, gracias por volver! Esperamos hayas disfrutado tu experiencia 🍣\n\nHoy tenías la *Golden Box* activada ✨🎲\n\nTu premio: *{{2}}*\n\nMuestra *este mensaje* al mesero para reclamar tu premio 🎁\n\n{{3}}\n\nLa suerte está de tu lado, sigue sumando puntos y desbloquea nuevas recompensas 🍀\n\n_— ${BRAND_NAME}_\n\n_Responde SALIR para no recibir más mensajes._`,
    variables: {
      '1': 'Pedro',
      '2': 'Postre del chef',
      '3': '🥉 Bronce (150 pts) → Bebida gratis ✅ · 🥈 Plata (350 pts) → Postre gratis — te faltan 175 pts 🔥',
    },
  },
  {
    key: 'birthday_template_sid',
    friendly_name: `cumpleanos_${slug(BRAND_NAME)}`,
    meta_name: `cumpleanos_${slug(BRAND_NAME)}`,
    category: 'MARKETING',
    description: 'Cumpleaños — cron diario',
    body: `¡Feliz cumpleaños {{1}}! 🎂🎉\n\nEn *${BRAND_NAME}* queremos celebrarlo contigo 🎁\n\nVen esta semana, menciona tu cumple y llévate una *sorpresa especial*\n\nTus puntos: *{{2}}* — cada visita te acerca más a una nueva recompensa 🔥\n\n_— ${BRAND_NAME}_\n\n_Responde SALIR para no recibir más mensajes._`,
    variables: {
      '1': 'Sofía',
      '2': '95',
    },
  },
  {
    key: 'reactivation_no_reward_template_sid',
    friendly_name: `reactivacion_suave_${slug(BRAND_NAME)}`,
    meta_name: `reactivacion_suave_${slug(BRAND_NAME)}`,
    category: 'MARKETING',
    description: 'Reactivación suave — 21 días sin visitar',
    body: `¡{{1}}, te extrañamos! Hace rato que no te vemos 👋🍣\n\nTienes *{{2}} puntos* acumulados y estás camino a desbloquear *{{3}}* 🔥\n\nCada visita te acerca más — vuelve y alcanza más rápido ese premio especial 💪\n\n_— ${BRAND_NAME}_\n\n_Responde SALIR para no recibir más mensajes._`,
    variables: {
      '1': 'Carlos',
      '2': '95',
      '3': 'Bebida gratis o Mystery Box',
    },
  },
  {
    key: 'reactivation_aggressive_template_sid',
    friendly_name: `reactivacion_agresiva_${slug(BRAND_NAME)}`,
    meta_name: `reactivacion_agresiva_${slug(BRAND_NAME)}`,
    category: 'MARKETING',
    description: 'Reactivación agresiva — 25+ días sin visitar',
    body: `Hola *{{1}}* 👀🍣\n\nTus *{{2}} puntos* llevan tiempo sin moverse\n\nEstás cerca de ganarte *{{3}}* — sería una lástima dejarlo ahí\n\nVuelve esta semana y sigue sumando, nosotros mantenemos tu progreso 💪\n\n_— ${BRAND_NAME}_\n\n_Responde SALIR para no recibir más mensajes._`,
    variables: {
      '1': 'Daniela',
      '2': '128',
      '3': 'Bebida gratis o Mystery Box',
    },
  },
  {
    key: 'campaign_presencial_to_domicilio_template_sid',
    friendly_name: `campana_presencial_domicilio_${slug(BRAND_NAME)}`,
    meta_name: `campana_presencial_domicilio_${slug(BRAND_NAME)}`,
    category: 'MARKETING',
    description: 'Campaña manual: Presencial → Domicilio',
    body: `¡Hola {{1}}! 🛵🍣\n\n¿Sabías que también llevamos *${BRAND_NAME}* hasta tu puerta?\n\nPide tus favoritos sin salir de casa y los domicilios *también suman puntos* 🔥\n\nTienes *{{2}} puntos* y vas camino a *{{3}}*\n\n_— ${BRAND_NAME}_\n\n_Responde SALIR para no recibir más mensajes._`,
    variables: {
      '1': 'Felipe',
      '2': '78',
      '3': 'Bebida gratis o Mystery Box',
    },
  },
  {
    key: 'campaign_domicilio_to_presencial_template_sid',
    friendly_name: `campana_domicilio_presencial_${slug(BRAND_NAME)}`,
    meta_name: `campana_domicilio_presencial_${slug(BRAND_NAME)}`,
    category: 'MARKETING',
    description: 'Campaña manual: Domicilio → Presencial',
    body: `¡{{1}}, la experiencia en *${BRAND_NAME}* es otro nivel! ♥️🍣\n\nNos encanta llevarte la comida a casa, pero en el restaurante es una experiencia completamente diferente ✨\n\nTienes *{{2}} puntos* — ven, suma puntos y desbloquea *{{3}}* 🔥\n\n_— ${BRAND_NAME}_\n\n_Responde SALIR para no recibir más mensajes._`,
    variables: {
      '1': 'Laura',
      '2': '95',
      '3': 'Bebida gratis o Mystery Box',
    },
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 twilio-create-text-templates\n')
  console.log(`  Brand: ${BRAND_NAME}`)
  console.log(`  Account: ${SID}\n`)

  const results = {}

  for (const tpl of templates) {
    console.log(`⏳ [${tpl.category}] ${tpl.friendly_name}`)
    console.log(`    ${tpl.description}`)

    const payload = {
      friendly_name: tpl.friendly_name,
      language: 'es',
      variables: tpl.variables,
      types: {
        'twilio/text': {
          body: tpl.body,
        },
      },
    }

    let created
    try {
      created = await contentPost(payload)
      console.log(`  ✓ Creada: SID = ${created.sid}`)
    } catch (err) {
      console.error(`  ❌ Error creando: ${err.message}`)
      continue
    }

    console.log(`  ⏳ Enviando a Meta para aprobación (${tpl.category})...`)
    try {
      const approval = await submitApproval(created.sid, tpl.meta_name, tpl.category)
      const status = approval?.whatsapp?.status || approval?.status || 'submitted'
      console.log(`  ✓ Aprobación enviada — status inicial: ${status}`)
    } catch (err) {
      console.warn(`  ⚠️  Plantilla creada pero aprobación falló: ${err.message}`)
      console.warn(`     Puedes reenviarla manualmente desde Dashboard → Plantillas → "Enviar a Meta"`)
    }

    results[tpl.key] = created.sid
    console.log()
  }

  console.log('══════════════════════════════════════════════════════')
  console.log('✅ Proceso completado. Agrega estos valores en Supabase:')
  console.log('   Tabla: admin_settings  |  Key → Value\n')
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
