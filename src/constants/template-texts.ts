/**
 * BANCO DE TEXTOS de las plantillas de WhatsApp — las 13, en UN solo estilo.
 *
 * Hasta el 2026-09-10 había tres estilos (cálido, elegante, urbano). El dueño
 * los quitó, textual: "siempre cálido, nada de eso sirve". Quedó el cálido,
 * que es el tono con el que nació la plataforma y el único que estuvo alguna
 * vez en producción. Cada texto es una aprobación de Meta aparte, así que
 * menos textos es menos riesgo y menos espera.
 *
 * ⚠️ ESTE ARCHIVO ES LA FUENTE. El AIOS (`Level 2.0/aios-constelarys/src/lib/
 * zernio/templates-catalog.ts`) lleva una COPIA de estos 13 textos porque es un
 * repo aparte y es quien crea las plantillas al dar de alta un cliente. Si
 * tocás un texto acá, hay que tocar la copia: el 09 el AIOS creó 12 plantillas
 * con 🍣 horneado porque nadie le había pasado el arreglo del emoji por rubro.
 *
 * REGLAS QUE TODO TEXTO DE ESTE ARCHIVO CUMPLE (Meta las aplica siempre)
 * ---------------------------------------------------------------------
 *  1. No empieza ni termina con una variable.
 *  2. Variables secuenciales desde `{{1}}`, sin huecos y en orden ascendente.
 *  3. Máx. 1024 caracteres.
 *  4. Toda plantilla MARKETING cierra con la línea de opt-out
 *     "_Responde SALIR para no recibir más mensajes._" (docs/PLANTILLAS.md).
 *  5. Sin urgencia falsa, sin promesas irreales, sin mayúsculas excesivas.
 * `tests/unit/template-catalog.test.ts` verifica 1-4 sobre los 13 —
 * `assertCatalogTextsAreValid()` en `template-catalog.ts` aplica las mismas
 * reglas en runtime.
 *
 * ⚠️ CONTRATO CON EL BACKEND: la ARIDAD y el SIGNIFICADO de cada variable son
 * fijos por plantilla (ver `TEMPLATE_CATALOG`). Un texto puede reordenar la
 * prosa, NUNCA agregar, quitar ni resignificar un `{{n}}` — el emisor
 * (check-in, crons, campañas, calendario) manda exactamente esos valores en ese
 * orden.
 *
 * ⚠️ Los 11 de texto son un PORT LITERAL del catálogo ya en producción
 * (`scripts/twilio-create-text-templates.mjs`). §12 respuesta 2: "Tono por
 * defecto: cálido — el actual. Sin cambios en el default". No tocar sin una
 * decisión explícita del dueño. Las dos de evento (`EVENT_INVITE_TEXT`) SÍ se
 * reescribieron, por decisión del dueño del 2026-09-10: ya no son el port de
 * `twilio-create-media-templates.mjs`. Las plantillas Twilio ya aprobadas de
 * los 4 tenants viejos siguen intactas.
 */

import type { TemplateKey } from '@/types/template.types'

/** Cierre de opt-out obligatorio en toda plantilla MARKETING. */
export const OPT_OUT_LINE = '_Responde SALIR para no recibir más mensajes._'

/**
 * Construye el cuerpo de una plantilla interpolando el nombre del negocio y su
 * emoji de marca.
 *
 * `emoji` existe porque los textos `calido` nacieron para Sushi Service y
 * traían 🍣 HORNEADO: un texto aprobado por Meta es literal, así que ese sushi
 * se le enviaba igual a una barbería. Ahora el emoji lo pone
 * `defaultTemplateEmoji(business_type)` (o el override del tenant) en el
 * momento de construir el cuerpo — antes de someterlo a Meta, exactamente
 * igual que el nombre del negocio. **No es una variable `{{n}}`**: el contrato
 * de variables no cambia y el emisor sigue mandando los mismos valores.
 *
 * Los builders que no lo usan pueden declarar solo `brandName`: en TypeScript
 * una función de menos parámetros sigue siendo asignable.
 */
export type TemplateBodyBuilder = (brandName: string, emoji: string) => string

/**
 * LA INVITACIÓN A UN EVENTO — un solo texto para `event_image` y `event_video`.
 *
 * Las dos claves apuntan a ESTE mismo objeto porque el mensaje es idéntico: lo
 * único que las separa es el formato del header, y Meta lo congela al aprobar
 * (una plantilla aprobada con header de imagen rechaza un MP4 al enviar, y al
 * revés). Por eso son dos registros y no uno, y por eso el texto se escribe una
 * sola vez: dos literales gemelos se despegan al primer retoque.
 *
 * ES UN MARCO, NO UN MENSAJE. Decisión del dueño, textual: "el que decide qué
 * mensaje contiene es el cliente, por eso le pedimos que ingrese un título, una
 * descripción, un link y una imagen". Lo que ponemos nosotros es lo mínimo que
 * Meta acepta, y ni una palabra que el dueño pueda querer distinta:
 *
 *  1. **Meta exige texto fijo proporcional a las variables** — rechaza con
 *     `INVALID_FORMAT` ("too many variable parameters relative to the message
 *     length"). La proporción documentada es 3 palabras por variable + 1: con
 *     5 variables, 16 palabras. La primera versión de este marco tenía 8 y
 *     Meta la rechazó en segundos (2026-09-11, Sushi Fun, `image_campaing`).
 *     Por eso "Te escribimos de … porque tenemos una novedad para ti" y "Aquí
 *     van los detalles": son relleno neutro, a propósito, y una prueba cuenta
 *     las palabras de los 13 textos.
 *  2. Nada de "noche" ni de "familia": el calendario no filtra por hora y el
 *     Tipo incluye promo, activación y aniversario. Meta aprueba el literal.
 *  3. Nada DESPUÉS de `{{5}}` salvo el aviso de SALIR: `{{5}}` es el llamado a
 *     la acción que el dueño escribió, con su enlace, y tiene que ser lo último.
 *  4. Variables en orden ASCENDENTE (`1,2,3,4,5`): Meta numera por aparición.
 *
 */
const EVENT_INVITE_TEXT: TemplateBodyBuilder = (_brand, emoji) =>
  `¡Hola {{1}}! 🎉${emoji}\nTe escribimos de _{{2}}_ porque tenemos una novedad para ti.\n\n*{{3}}*\n📅 Fecha: {{4}}\n\nAquí van los detalles:\n{{5}}\n\n${OPT_OUT_LINE}`

/**
 * El banco. El tipo `Record<TemplateKey, ...>` obliga a TypeScript a fallar si
 * alguien agrega una plantilla al catálogo y se olvida de escribirle el texto.
 */
export const TEMPLATE_TEXTS: Record<TemplateKey, TemplateBodyBuilder> = {
  // ─────────────────────────────────────────────────────────────
  // 1 · Bienvenida — UTILITY (única sin opt-out)
  //     {{1}} nombre · {{2}} puntos iniciales · {{3}} roadmap de tiers
  // ─────────────────────────────────────────────────────────────
  welcome: (brand, emoji) =>
    `¡Hola {{1}}! 🎉${emoji}\n\nBienvenid@ a *${brand}*, nos alegra que seas parte de nuestro club\n\nEn cada visita sumas puntos y recibes premios reales — Hoy recibiste *{{2}} puntos* 🎉\n\nAsí funciona tu camino de recompensas 👇\n\n{{3}}\n\n¡Te esperamos pronto!\n\n_— ${brand}_`,

  // ─────────────────────────────────────────────────────────────
  // 2 · Puntos sumados (lejos del siguiente tier) — MARKETING
  //     {{1}} nombre · {{2}} pts ganados · {{3}} saldo · {{4}} roadmap
  // ─────────────────────────────────────────────────────────────
  points_earned_far: (brand, emoji) =>
    `¡{{1}}, gracias por tu visita! Esperamos que hayas disfrutado tu experiencia ${emoji}\n\nSumaste *+{{2}} puntos* hoy 🔥\n\nTu saldo: *{{3}} puntos*\n\nSigue visitándonos y descubre lo que te espera 👇\n\n{{4}}\n\nCuando llegues a tu próximo nivel podrás elegir entre tu *premio seguro* o la *Mystery Box* 🎲\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,

  // ─────────────────────────────────────────────────────────────
  // 3 · Puntos sumados (cerca del siguiente tier) — MARKETING
  //     {{1}} nombre · {{2}} pts ganados · {{3}} saldo · {{4}} premio próximo
  // ─────────────────────────────────────────────────────────────
  points_earned_near: (brand, emoji) =>
    `¡{{1}}, gracias por tu visita! Esperamos que hayas disfrutado tu experiencia ${emoji}\n\n¡Casi lo lograste! Sumaste *+{{2}} puntos* 🔥\n\nTu saldo: *{{3}} puntos*\n\nLa próxima visita reclama tu *{{4}}* o si quieres probar suerte, selecciona la *Mystery Box* con premios todavía mejores 🎲\n\n¡Vuelve pronto que ya casi es tuyo!\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,

  // ─────────────────────────────────────────────────────────────
  // 4 · Tier desbloqueado, premio seguro — MARKETING
  //     {{1}} nombre · {{2}} tier · {{3}} premio · {{4}} roadmap
  // ─────────────────────────────────────────────────────────────
  reward_safe: (brand, emoji) =>
    `¡{{1}}, gracias por volver! Alcanzaste el nivel *{{2}}* 🏆${emoji}\n\nElegiste ir a la segura y te ganaste: *{{3}}*\n\nMuestra *este mensaje* al mesero para reclamar tu premio 🎁\n\n{{4}}\n\nSigue sumando puntos para tu próximo nivel.\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,

  // ─────────────────────────────────────────────────────────────
  // 5 · Mystery Box, resultado — MARKETING
  //     {{1}} nombre · {{2}} tier · {{3}} premio · {{4}} roadmap
  // ─────────────────────────────────────────────────────────────
  mystery_box_result: (brand, emoji) =>
    `¡{{1}}, gracias por volver! Abriste la *Mystery Box* de *{{2}}* 🎲${emoji}\n\nTu premio: *{{3}}*\n\nMuestra *este mensaje* al mesero para reclamar tu premio 🎁\n\n{{4}}\n\n¡Sigue sumando puntos, cada visita te acerca a una nueva recompensa!\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,

  // ─────────────────────────────────────────────────────────────
  // 6 · Golden Box, resultado (pity timer) — MARKETING
  //     {{1}} nombre · {{2}} premio · {{3}} roadmap
  // ─────────────────────────────────────────────────────────────
  golden_box_result: (brand, emoji) =>
    `¡{{1}}, gracias por volver! Esperamos hayas disfrutado tu experiencia ${emoji}\n\nHoy tenías la *Golden Box* activada ✨🎲\n\nTu premio: *{{2}}*\n\nMuestra *este mensaje* al mesero para reclamar tu premio 🎁\n\n{{3}}\n\nLa suerte está de tu lado, sigue sumando puntos y desbloquea nuevas recompensas 🍀\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,

  // ─────────────────────────────────────────────────────────────
  // 7 · Cumpleaños — MARKETING
  //     {{1}} nombre · {{2}} puntos actuales
  // ─────────────────────────────────────────────────────────────
  birthday: (brand) =>
    `¡Feliz cumpleaños {{1}}! 🎂🎉\n\nEn *${brand}* queremos celebrarlo contigo 🎁\n\nVen esta semana, menciona tu cumple y llévate una *sorpresa especial*\n\nTus puntos: *{{2}}* — cada visita te acerca más a una nueva recompensa 🔥\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,

  // ─────────────────────────────────────────────────────────────
  // 8 · Reactivación suave — MARKETING
  //     {{1}} nombre · {{2}} puntos · {{3}} premio próximo
  // ─────────────────────────────────────────────────────────────
  reactivation_no_reward: (brand, emoji) =>
    `¡{{1}}, te extrañamos! Hace rato que no te vemos 👋${emoji}\n\nTienes *{{2}} puntos* acumulados y estás camino a desbloquear *{{3}}* 🔥\n\nCada visita te acerca más — vuelve y alcanza más rápido ese premio especial 💪\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,

  // ─────────────────────────────────────────────────────────────
  // 9 · Reactivación agresiva — MARKETING
  //     {{1}} nombre · {{2}} puntos · {{3}} premio próximo
  // ─────────────────────────────────────────────────────────────
  reactivation_aggressive: (brand, emoji) =>
    `Hola *{{1}}* 👀${emoji}\n\nTus *{{2}} puntos* llevan tiempo sin moverse\n\nEstás cerca de ganarte *{{3}}* — sería una lástima dejarlo ahí\n\nVuelve esta semana y sigue sumando, nosotros mantenemos tu progreso 💪\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,

  // ─────────────────────────────────────────────────────────────
  // 10 · Campaña Presencial → Domicilio — MARKETING
  //      {{1}} nombre · {{2}} puntos · {{3}} premio próximo
  // ─────────────────────────────────────────────────────────────
  campaign_presencial_to_domicilio: (brand, emoji) =>
    `¡Hola {{1}}! 🛵${emoji}\n\n¿Sabías que también llevamos *${brand}* hasta tu puerta?\n\nPide tus favoritos sin salir de casa y los domicilios *también suman puntos* 🔥\n\nTienes *{{2}} puntos* y vas camino a *{{3}}*\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,

  // ─────────────────────────────────────────────────────────────
  // 11 · Campaña Domicilio → Presencial — MARKETING
  //      {{1}} nombre · {{2}} puntos · {{3}} premio próximo
  // ─────────────────────────────────────────────────────────────
  campaign_domicilio_to_presencial: (brand, emoji) =>
    `¡{{1}}, la experiencia en *${brand}* es otro nivel! ♥️${emoji}\n\nNos encanta llevarte el pedido a casa, pero en el restaurante es una experiencia completamente diferente ✨\n\nTienes *{{2}} puntos* — ven, suma puntos y desbloquea *{{3}}* 🔥\n\n_— ${brand}_\n\n${OPT_OUT_LINE}`,

  // ─────────────────────────────────────────────────────────────
  // 12 y 13 · Invitación a un evento del calendario — MARKETING
  //      {{1}} nombre · {{2}} marca · {{3}} título · {{4}} fecha · {{5}} CTA
  //      UN SOLO texto para las dos: lo único que las separa es el formato del
  //      header (imagen o video), que Meta congela al aprobar. Ver el porqué de
  //      la duplicación de claves sobre `EVENT_INVITE_TEXT`.
  // ─────────────────────────────────────────────────────────────
  event_image: EVENT_INVITE_TEXT,
  event_video: EVENT_INVITE_TEXT,
}
