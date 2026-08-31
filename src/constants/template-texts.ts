/**
 * BANCO DE TEXTOS de las plantillas de WhatsApp — 13 plantillas × 3 estilos.
 *
 * Decisión del dueño (REQUERIMIENTOS_AGOSTO_2026.md §12, respuesta 5): "banco
 * fijo, llm luego". Estos textos se escriben UNA vez y quedan fijos. La
 * generación con LLM (prompt P4 de PROMPTS_SESIONES_BARATAS.md) es una fase
 * posterior y NO está implementada.
 *
 * ALCANCE — por qué son 39 textos y no 117
 * ----------------------------------------
 * El estilo NO varía por `business_type`. Lo específico del negocio viaja en
 * variables (`{{1}}` = nombre del cliente, `brandName` interpolado, etc.), no en
 * el texto aprobado. Por eso el banco es 13 × 3 estilos, no 13 × 3 × 3 tipos de
 * negocio. Cada texto es una aprobación de Meta aparte: la diferencia es real en
 * tiempo y en riesgo.
 *
 * REGLAS QUE TODO TEXTO DE ESTE ARCHIVO CUMPLE (Meta las aplica siempre)
 * ---------------------------------------------------------------------
 *  1. No empieza ni termina con una variable.
 *  2. Variables secuenciales desde `{{1}}`, sin huecos.
 *  3. Máx. 1024 caracteres.
 *  4. Toda plantilla MARKETING cierra con la línea de opt-out
 *     "_Responde SALIR para no recibir más mensajes._" (docs/PLANTILLAS.md).
 *  5. Sin urgencia falsa, sin promesas irreales, sin mayúsculas excesivas.
 * Hay un test que verifica 1-4 sobre las 39 combinaciones —
 * `assertCatalogTextsAreValid()` en `template-catalog.ts` aplica las mismas
 * reglas en runtime.
 *
 * ⚠️ CONTRATO CON EL BACKEND: la ARIDAD y el SIGNIFICADO de cada variable son
 * fijos por plantilla (ver `TEMPLATE_CATALOG`). Un estilo puede reordenar la
 * prosa, NUNCA agregar, quitar ni resignificar un `{{n}}` — el emisor
 * (check-in, crons, campañas, calendario) manda exactamente esos valores en ese
 * orden y no sabe qué estilo tiene el tenant.
 *
 * ⚠️ `calido` es un PORT LITERAL del catálogo ya en producción
 * (`scripts/twilio-create-text-templates.mjs` /`twilio-create-media-templates.mjs`,
 * portado a Zernio en `Level 2.0/aios-constelarys/src/lib/zernio/templates-catalog.ts`).
 * §12 respuesta 2: "Tono por defecto: cálido — el actual. Sin cambios en el
 * default". No tocar estos textos sin una decisión explícita del dueño.
 * Nota para el dueño: los textos `calido` traen 🍣 horneado (nacieron para
 * Sushi Service). En un tenant que no sea de comida japonesa ese emoji se ve
 * fuera de lugar. `elegante` y `urbano` nacen neutrales al tipo de negocio.
 */

import type { TemplateKey, TemplateStyle } from '@/types/template.types'

/** Cierre de opt-out obligatorio en toda plantilla MARKETING. */
export const OPT_OUT_LINE = '_Responde SALIR para no recibir más mensajes._'

/** Construye el cuerpo de una plantilla interpolando el nombre del negocio. */
export type TemplateBodyBuilder = (brandName: string) => string

/**
 * El banco. El tipo `Record<TemplateKey, Record<TemplateStyle, ...>>` obliga a
 * TypeScript a fallar si alguien agrega una plantilla al catálogo o un estilo
 * nuevo y se olvida de escribir alguna de las combinaciones.
 */
export const TEMPLATE_TEXTS: Record<TemplateKey, Record<TemplateStyle, TemplateBodyBuilder>> = {
  // ─────────────────────────────────────────────────────────────
  // 1 · Bienvenida — UTILITY (única sin opt-out)
  //     {{1}} nombre · {{2}} puntos iniciales · {{3}} roadmap de tiers
  // ─────────────────────────────────────────────────────────────
  welcome: {
    calido: (brand) =>
      `¡Hola {{1}}! 🎉🍣\n\nBienvenid@ a *${brand}*, nos alegra que seas parte de nuestro club\n\nEn cada visita sumas puntos y recibes premios reales — Hoy recibiste *{{2}} puntos* 🎉\n\nAsí funciona tu camino de recompensas 👇\n\n{{3}}\n\n¡Te esperamos pronto!\n\n_— ${brand}_`,
    elegante: (brand) =>
      `Hola {{1}}, es un gusto recibirte.\n\nTe damos la bienvenida a *${brand}*. Desde hoy formas parte de nuestro club de clientes.\n\nCada visita suma puntos, y cada punto se convierte en un beneficio real. Comienzas con *{{2}} puntos*.\n\nEste es el camino que te espera:\n\n{{3}}\n\nSerá un placer atenderte de nuevo.\n\n_— ${brand}_`,
    urbano: (brand) =>
      `¡Qué más, {{1}}! 🙌\n\nYa estás dentro de *${brand}*. Bienvenid@ al combo.\n\nAquí cada visita te suma puntos y los puntos se vuelven premios de verdad. Arrancas con *{{2}} puntos* 🎉\n\nMira todo lo que puedes desbloquear 👇\n\n{{3}}\n\n¡Nos vemos pronto!\n\n_— ${brand}_`,
  },

  // ─────────────────────────────────────────────────────────────
  // 2 · Puntos sumados (lejos del siguiente tier) — MARKETING
  //     {{1}} nombre · {{2}} pts ganados · {{3}} saldo · {{4}} roadmap
  // ─────────────────────────────────────────────────────────────
  points_earned_far: {
    calido: (brand) =>
      `¡{{1}}, gracias por tu visita! Esperamos que hayas disfrutado tu experiencia 🍣\n\nSumaste *+{{2}} puntos* hoy 🔥\n\nTu saldo: *{{3}} puntos*\n\nSigue visitándonos y descubre lo que te espera 👇\n\n{{4}}\n\nCuando llegues a tu próximo nivel podrás elegir entre tu *premio seguro* o la *Mystery Box* 🎲\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    elegante: (brand) =>
      `Gracias por acompañarnos hoy, {{1}}.\n\nSumaste *{{2}} puntos* en esta visita.\n\nTu saldo actual es de *{{3}} puntos*.\n\nAsí avanza tu recorrido:\n\n{{4}}\n\nAl alcanzar el siguiente nivel podrás elegir entre tu premio asegurado o la Mystery Box.\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    urbano: (brand) =>
      `¡{{1}}, gracias por venir! 🙌\n\nTe llevaste *+{{2}} puntos* en esta visita.\n\nVas en *{{3}} puntos* 💪\n\nEsto es lo que sigue 👇\n\n{{4}}\n\nCuando llegues al siguiente nivel eliges: premio seguro o Mystery Box 🎲\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 3 · Puntos sumados (cerca del siguiente tier) — MARKETING
  //     {{1}} nombre · {{2}} pts ganados · {{3}} saldo · {{4}} premio próximo
  // ─────────────────────────────────────────────────────────────
  points_earned_near: {
    calido: (brand) =>
      `¡{{1}}, gracias por tu visita! Esperamos que hayas disfrutado tu experiencia 🍣\n\n¡Casi lo lograste! Sumaste *+{{2}} puntos* 🔥\n\nTu saldo: *{{3}} puntos*\n\nLa próxima visita reclama tu *{{4}}* o si quieres probar suerte, selecciona la *Mystery Box* con premios todavía mejores 🎲\n\n¡Vuelve pronto que ya casi es tuyo!\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    elegante: (brand) =>
      `Gracias por tu visita, {{1}}.\n\nSumaste *{{2}} puntos* y estás muy cerca de tu próximo nivel.\n\nTu saldo actual es de *{{3}} puntos*.\n\nEn tu siguiente visita podrás reclamar *{{4}}*, o cambiarlo por la Mystery Box si prefieres la sorpresa.\n\nTe esperamos pronto.\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    urbano: (brand) =>
      `¡{{1}}, gracias por venir! 🙌\n\nSumaste *+{{2}} puntos* y ya casi lo tienes.\n\nVas en *{{3}} puntos* 💪\n\nEn tu próxima visita reclamas *{{4}}*, o le juegas a la Mystery Box y te llevas algo mejor 🎲\n\n¡Vuelve pronto que ya casi!\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 4 · Tier desbloqueado, premio seguro — MARKETING
  //     {{1}} nombre · {{2}} tier · {{3}} premio · {{4}} roadmap
  // ─────────────────────────────────────────────────────────────
  reward_safe: {
    calido: (brand) =>
      `¡{{1}}, gracias por volver! Alcanzaste el nivel *{{2}}* 🏆🍣\n\nElegiste ir a la segura y te ganaste: *{{3}}*\n\nMuestra *este mensaje* al mesero para reclamar tu premio 🎁\n\n{{4}}\n\nSigue sumando puntos para tu próximo nivel.\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    elegante: (brand) =>
      `Enhorabuena, {{1}}: alcanzaste el nivel *{{2}}*.\n\nElegiste tu premio asegurado: *{{3}}*.\n\nPresenta este mensaje a nuestro equipo para reclamarlo.\n\n{{4}}\n\nGracias por tu preferencia.\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    urbano: (brand) =>
      `¡{{1}}, lo lograste! Subiste a nivel *{{2}}* 🏆\n\nFuiste a la fija y te ganaste: *{{3}}* 🎁\n\nMuestra este mensaje cuando vengas y reclámalo.\n\n{{4}}\n\nA seguir sumando, que esto no para 💪\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 5 · Mystery Box, resultado — MARKETING
  //     {{1}} nombre · {{2}} tier · {{3}} premio · {{4}} roadmap
  // ─────────────────────────────────────────────────────────────
  mystery_box_result: {
    calido: (brand) =>
      `¡{{1}}, gracias por volver! Abriste la *Mystery Box* de *{{2}}* 🎲🍣\n\nTu premio: *{{3}}*\n\nMuestra *este mensaje* al mesero para reclamar tu premio 🎁\n\n{{4}}\n\n¡Sigue sumando puntos, cada visita te acerca a una nueva recompensa!\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    elegante: (brand) =>
      `Hola {{1}}, abriste la Mystery Box de tu nivel *{{2}}*.\n\nTu premio: *{{3}}*.\n\nPresenta este mensaje a nuestro equipo para reclamarlo.\n\n{{4}}\n\nCada visita te acerca a la siguiente recompensa.\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    urbano: (brand) =>
      `¡{{1}}, le jugaste a la Mystery Box de *{{2}}*! 🎲\n\nTe salió: *{{3}}* 🎁\n\nMuestra este mensaje cuando vengas y reclámalo.\n\n{{4}}\n\nSigue sumando, que cada visita cuenta 💪\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 6 · Golden Box, resultado (pity timer) — MARKETING
  //     {{1}} nombre · {{2}} premio · {{3}} roadmap
  // ─────────────────────────────────────────────────────────────
  golden_box_result: {
    calido: (brand) =>
      `¡{{1}}, gracias por volver! Esperamos hayas disfrutado tu experiencia 🍣\n\nHoy tenías la *Golden Box* activada ✨🎲\n\nTu premio: *{{2}}*\n\nMuestra *este mensaje* al mesero para reclamar tu premio 🎁\n\n{{3}}\n\nLa suerte está de tu lado, sigue sumando puntos y desbloquea nuevas recompensas 🍀\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    elegante: (brand) =>
      `Hoy tenías la Golden Box activa, {{1}}.\n\nTu premio: *{{2}}*.\n\nPresenta este mensaje a nuestro equipo para reclamarlo.\n\n{{3}}\n\nGracias por seguir con nosotros.\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    urbano: (brand) =>
      `¡{{1}}, hoy tenías la Golden Box activada! ✨🎲\n\nTe salió: *{{2}}* 🎁\n\nMuestra este mensaje cuando vengas y reclámalo.\n\n{{3}}\n\nLa suerte anda de tu lado, aprovéchala 🍀\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 7 · Cumpleaños — MARKETING
  //     {{1}} nombre · {{2}} puntos actuales
  // ─────────────────────────────────────────────────────────────
  birthday: {
    calido: (brand) =>
      `¡Feliz cumpleaños {{1}}! 🎂🎉\n\nEn *${brand}* queremos celebrarlo contigo 🎁\n\nVen esta semana, menciona tu cumple y llévate una *sorpresa especial*\n\nTus puntos: *{{2}}* — cada visita te acerca más a una nueva recompensa 🔥\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    elegante: (brand) =>
      `Feliz cumpleaños, {{1}}.\n\nEn *${brand}* queremos celebrarlo contigo. Visítanos esta semana, menciona tu cumpleaños y te tendremos preparada una atención especial.\n\nTu saldo actual: *{{2}} puntos*.\n\nSerá un gusto recibirte.\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    urbano: (brand) =>
      `¡Feliz cumple, {{1}}! 🎂🎉\n\nEn *${brand}* queremos celebrarlo contigo.\n\nPásate por acá esta semana, di que estás de cumpleaños y te tenemos una sorpresa 🎁\n\nVas en *{{2}} puntos* — cada visita te acerca a un premio nuevo 💪\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 8 · Reactivación suave — MARKETING
  //     {{1}} nombre · {{2}} puntos · {{3}} premio próximo
  // ─────────────────────────────────────────────────────────────
  reactivation_no_reward: {
    calido: (brand) =>
      `¡{{1}}, te extrañamos! Hace rato que no te vemos 👋🍣\n\nTienes *{{2}} puntos* acumulados y estás camino a desbloquear *{{3}}* 🔥\n\nCada visita te acerca más — vuelve y alcanza más rápido ese premio especial 💪\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    elegante: (brand) =>
      `Hace un tiempo que no te vemos, {{1}}.\n\nTus *{{2}} puntos* siguen esperándote, y estás en camino a *{{3}}*.\n\nCuando quieras retomarlo, aquí estaremos.\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    urbano: (brand) =>
      `¡{{1}}, hace rato no te vemos! 👀\n\nTienes *{{2}} puntos* guardados y vas camino a *{{3}}* 🔥\n\nNo se te vencen ni se te pierden — cuando quieras retomas donde ibas 💪\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 9 · Reactivación agresiva — MARKETING
  //     {{1}} nombre · {{2}} puntos · {{3}} premio próximo
  // ─────────────────────────────────────────────────────────────
  reactivation_aggressive: {
    calido: (brand) =>
      `Hola *{{1}}* 👀🍣\n\nTus *{{2}} puntos* llevan tiempo sin moverse\n\nEstás cerca de ganarte *{{3}}* — sería una lástima dejarlo ahí\n\nVuelve esta semana y sigue sumando, nosotros mantenemos tu progreso 💪\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    elegante: (brand) =>
      `Tu progreso sigue intacto, {{1}}.\n\nAcumulaste *{{2}} puntos* y te falta poco para *{{3}}*.\n\nConservamos tu avance para cuando decidas volver. Una visita esta semana te acerca al objetivo.\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    urbano: (brand) =>
      `Hola *{{1}}* 👀\n\nTus *{{2}} puntos* llevan tiempo quietos.\n\nEstás a nada de *{{3}}* — sería una lástima dejarlo ahí 🔥\n\nPásate esta semana y sigue sumando, que tu progreso te lo guardamos 💪\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 10 · Campaña Presencial → Domicilio — MARKETING
  //      {{1}} nombre · {{2}} puntos · {{3}} premio próximo
  // ─────────────────────────────────────────────────────────────
  campaign_presencial_to_domicilio: {
    calido: (brand) =>
      `¡Hola {{1}}! 🛵🍣\n\n¿Sabías que también llevamos *${brand}* hasta tu puerta?\n\nPide tus favoritos sin salir de casa y los domicilios *también suman puntos* 🔥\n\nTienes *{{2}} puntos* y vas camino a *{{3}}*\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    elegante: (brand) =>
      `Hola {{1}}, también llevamos *${brand}* hasta tu casa.\n\nNuestro servicio a domicilio suma los mismos puntos que una visita presencial.\n\nTienes *{{2}} puntos* y avanzas hacia *{{3}}*.\n\nCuando quieras, estamos a un mensaje de distancia.\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    urbano: (brand) =>
      `¡{{1}}, también te llevamos *${brand}* hasta la puerta! 🛵\n\nPide desde donde estés — los domicilios también te suman puntos 🔥\n\nVas en *{{2}} puntos* y estás camino a *{{3}}*\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 11 · Campaña Domicilio → Presencial — MARKETING
  //      {{1}} nombre · {{2}} puntos · {{3}} premio próximo
  // ─────────────────────────────────────────────────────────────
  campaign_domicilio_to_presencial: {
    calido: (brand) =>
      `¡{{1}}, la experiencia en *${brand}* es otro nivel! ♥️🍣\n\nNos encanta llevarte la comida a casa, pero en el restaurante es una experiencia completamente diferente ✨\n\nTienes *{{2}} puntos* — ven, suma puntos y desbloquea *{{3}}* 🔥\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    elegante: (brand) =>
      `Nos encanta llevarte lo mejor a casa, {{1}}.\n\nAun así, vivir *${brand}* en el lugar es una experiencia distinta: el ambiente, el detalle y la atención de nuestro equipo.\n\nTienes *{{2}} puntos* y avanzas hacia *{{3}}*.\n\nTe esperamos cuando quieras acompañarnos.\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
    urbano: (brand) =>
      `¡{{1}}, en el local es otro cuento! ✨\n\nNos encanta llevarte el pedido a casa, pero venir es una experiencia completamente distinta.\n\nVas en *{{2}} puntos* — pásate, suma y desbloquea *{{3}}* 🔥\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 12 · Evento con imagen — MARKETING (header de media)
  //      {{1}} nombre · {{2}} marca · {{3}} evento · {{4}} fecha · {{5}} cierre
  //      OJO: aquí la marca es la VARIABLE {{2}}, no va horneada — igual que en
  //      el script de media original y en calendar.service.ts.
  // ─────────────────────────────────────────────────────────────
  event_image: {
    calido: () =>
      `¡Hola {{1}}! 🎉\n\n*{{2}}* tiene el placer de invitarte a vivir una noche especial:\n*{{3}}* 🍽️\n\n📅 {{4}}\n\n{{5}}\n\n¡Te esperamos con tu familia!\n\n${OPT_OUT_LINE}`,
    elegante: () =>
      `Hola {{1}},\n\n*{{2}}* tiene el gusto de invitarte a una ocasión especial:\n*{{3}}*\n\nFecha: {{4}}\n\n{{5}}\n\nSerá un placer contar con tu presencia.\n\n${OPT_OUT_LINE}`,
    urbano: () =>
      `¡Hola {{1}}! 🎉\n\n*{{2}}* te invita a algo que no te puedes perder:\n*{{3}}*\n\n📅 {{4}}\n\n{{5}}\n\n¡Trae a los tuyos!\n\n${OPT_OUT_LINE}`,
  },

  // ─────────────────────────────────────────────────────────────
  // 13 · Evento con video — MARKETING (header de media)
  //      Mismo cuerpo que `event_image`: lo único que cambia es el formato del
  //      header. Se mantienen como dos plantillas separadas porque Meta aprueba
  //      el header junto con el cuerpo, y el calendario elige una u otra según
  //      `event.media_type`.
  // ─────────────────────────────────────────────────────────────
  event_video: {
    calido: () =>
      `¡Hola {{1}}! 🎉\n\n*{{2}}* tiene el placer de invitarte a vivir una noche especial:\n*{{3}}* 🍽️\n\n📅 {{4}}\n\n{{5}}\n\n¡Te esperamos con tu familia!\n\n${OPT_OUT_LINE}`,
    elegante: () =>
      `Hola {{1}},\n\n*{{2}}* tiene el gusto de invitarte a una ocasión especial:\n*{{3}}*\n\nFecha: {{4}}\n\n{{5}}\n\nSerá un placer contar con tu presencia.\n\n${OPT_OUT_LINE}`,
    urbano: () =>
      `¡Hola {{1}}! 🎉\n\n*{{2}}* te invita a algo que no te puedes perder:\n*{{3}}*\n\n📅 {{4}}\n\n{{5}}\n\n¡Trae a los tuyos!\n\n${OPT_OUT_LINE}`,
  },
}
