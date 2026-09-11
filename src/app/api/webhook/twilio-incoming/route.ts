import { NextRequest, NextResponse } from 'next/server'
import { validateTwilioSignature } from '@/lib/validators/twilio'
import { createClient } from '@supabase/supabase-js'
import { setWhatsappOptOut, clearWhatsappOptOut } from '@/services/customer.service'
import { getTenantByWhatsappNumber } from '@/lib/tenant'
import { resolveBranding, type Branding } from '@/lib/branding'
import { detectClubButton, handleClubOptIn, handleClubOptOut, CLUB_SETTING_KEYS } from '@/services/club-optin.service'
import { getMultipleSettings } from '@/services/settings.service'
import {
  logDeliveryIntakeFailure,
  processDeliveryMessage,
  type DeliveryIntakeResult,
} from '@/services/delivery.service'
import { isAutoReplyEnabled } from '@/services/connection.service'

// Keywords de opt-out/in alineados con el Messaging Service de Twilio
// (ver docs/features/twilio-opt-out.md).
//
// ⚠️ LO QUE EL COMENTARIO DECÍA ANTES Y NO ERA VERDAD: decía que «Twilio
// normalmente los intercepta antes de llegar aquí» y que persistirlos era «por si
// acaso». El Advanced Opt-Out del Messaging Service actúa sobre SMS, no sobre
// WhatsApp. Producción lo confirmó el 2026-09-06: el dueño probó CANCEL, CANCELAR,
// STOP y SALIR por WhatsApp y **las cuatro llegaron a esta ruta**. O sea que esta
// lista NO es una red de respaldo: es el único sitio donde un SALIR de WhatsApp se
// registra y donde se le contesta al cliente. (Auditoría 12-Julio, tarea 8.)
const OPT_OUT_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'CANCELAR', 'END', 'QUIT', 'BAJA', 'SALIR', 'SAL', 'SALI', 'FUERA', 'OPTOUT', 'NO']
const OPT_IN_KEYWORDS = ['START', 'UNSTOP', 'YES', 'SI', 'ALTA', 'ACEPTO']

const KEYWORDS: Record<string, string[]> = {
  pedido: ['pedido', 'domicilio', 'delivery', 'comprar', 'ordenar', 'pedir', 'menu', 'carta'],
  horario: ['horario', 'abierto', 'abren', 'cierran', 'hora', 'horas'],
  ubicacion: ['direccion', 'ubicacion', 'donde', 'queda', 'dirección', 'ubicación', 'cómo llego'],
}

function detectIntent(text: string): keyof typeof KEYWORDS | 'default' {
  const lower = text.toLowerCase()
  for (const [intent, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) return intent as keyof typeof KEYWORDS
  }
  return 'default'
}

function buildMessage(intent: keyof typeof KEYWORDS | 'default', branding: Branding): string {
  const brandName = branding.name
  const link =
    branding.whatsappLink ??
    (branding.deliveryPhone ? `https://wa.me/57${branding.deliveryPhone.replace(/\D/g, '')}` : '')
  const redirect = link ? `\n\n📲 Escríbenos aquí: ${link}` : ''

  switch (intent) {
    case 'pedido':
      return `🍽️ ¡Para pedidos o domicilios te atendemos en la línea principal de ${brandName}!${redirect}`
    case 'horario':
      return `🕐 Para consultar horarios comunícate con nosotros directamente.${redirect}`
    case 'ubicacion':
      return `📍 Para dirección e indicaciones comunícate con nosotros directamente.${redirect}`
    default:
      return `👋 Hola, este número de *${brandName}* es exclusivo para mensajes automáticos 🔔\n\nPara hablar con nosotros:${redirect}\n\n¡Te respondemos rápido!`
  }
}

/**
 * Qué se le contesta al operador tras procesar su cuadro de pedido.
 *
 * Los dos textos del camino feliz y del error de parseo son los de los nodos «Responder
 * OK Domicilio» y «Responder Error IA» de `n8n/domicilios_whatsapp_v4.json`: el mesero no
 * nota la migración. Lo que sí cambia es que **un fallo de configuración ya no se
 * disfraza de pedido mal escrito** — si falta `OPENAI_API_KEY` o la IA está caída, el
 * operador lee que avise al administrador en vez de reenviar el mensaje veinte veces.
 * §24: un domicilio no se pierde en silencio.
 */
function buildDeliveryReply(outcome: DeliveryIntakeResult): string {
  if (outcome.ok) {
    const { order, registration } = outcome
    const premio = registration.tierUnlocked ? ` 🎁 ${registration.tierUnlocked.name}` : ''
    const estado = registration.isNew ? 'Nuevo cliente' : 'Cliente actualizado'
    return `✅ ${estado}: ${order.nombre_cliente} (${order.celular}). Visita #${registration.totalVisits}${premio}`
  }

  switch (outcome.reason) {
    case 'ia_no_configurada':
      return '❌ El lector de pedidos no está configurado (falta la clave de OpenAI). Avisa al administrador — el pedido NO quedó registrado.'
    case 'ia_error':
    case 'ia_sin_respuesta':
      return '❌ El lector de pedidos no respondió. Reenvía el mensaje en un momento — el pedido NO quedó registrado.'
    case 'registro_fallido':
      return '❌ Leí el pedido pero no lo pude guardar. Avisa al administrador — el pedido NO quedó registrado.'
    case 'mensaje_vacio':
      return '❌ El mensaje llegó vacío. Reenvía el cuadro del pedido con el número de celular del cliente.'
    default:
      // 'json_invalido' | 'celular_invalido' | 'celular_invalido_registro' — el texto
      // literal del nodo «Responder Error IA».
      return '❌ No pude extraer los datos del pedido. Asegúrate de incluir al menos el número de celular del cliente (10 dígitos). Intenta de nuevo.'
  }
}

/**
 * Confirmación de salida — POR QUÉ ESTE TEXTO SÍ SE PUEDE ENVIAR.
 *
 * La regla de la casa es que solo salen PLANTILLAS APROBADAS. Esa regla vale para los
 * envíos que INICIAMOS nosotros: una campaña, un cumpleaños, una reactivación. Esto no
 * es eso: es la RESPUESTA a un mensaje que el cliente acaba de escribir, y sale por el
 * mismo TwiML con el que esta ruta ya le contesta al mesero (`buildDeliveryReply()`) y
 * al comensal que pregunta el horario (`buildMessage()`) — texto libre dentro de la
 * ventana de atención de 24 h, que la abrió él al mandar SALIR. Es exactamente el
 * mecanismo que ya está en producción en este archivo, no uno nuevo.
 *
 * ⚠️ Esto NO se puede replicar en Zernio. Allí no hay TwiML —el webhook solo devuelve un
 * 2xx— y `src/lib/zernio/messaging.ts` únicamente sabe mandar plantillas
 * (`sendZernioTemplateMessage`). Confirmarle la salida a un cliente de un tenant Zernio
 * exigiría una plantilla aprobada nueva, con su ciclo de aprobación de Meta. Queda
 * documentado en `docs/features/twilio-opt-out.md`; NO se inventa aquí.
 *
 * El texto es el mismo compromiso que el panel le muestra al dueño en `OptOutPanel.tsx`:
 * salir es dejar de recibir mensajes, no perder los puntos.
 */
function buildOptOutReply(brandName: string): string {
  return (
    `✅ Listo. No vas a recibir más mensajes de *${brandName}*.\n\n` +
    'Tus puntos y tu historial quedan intactos: salir es dejar de recibir mensajes, no ' +
    'perder tu progreso.\n\nSi cambias de opinión, responde *ALTA* y vuelves a recibirlos.'
  )
}

/**
 * Confirmación de regreso. Se parte en dos porque las dos situaciones son distintas de
 * verdad: a quien tiene ficha se le reactiva algo, y a quien no la tiene no hay nada que
 * reactivarle. Decirle «ya vuelves a recibir» al segundo sería la misma mentira que este
 * cambio vino a sacar del log.
 */
function buildOptInReply(brandName: string, matched: number): string {
  if (matched === 0) {
    return (
      `👋 No encontramos tu número en la base de *${brandName}*, así que no hay nada ` +
      'que reactivar.\n\nSi quieres registrarte, escanea el código QR en el local.'
    )
  }
  return (
    `🔔 Listo. Vuelves a recibir los mensajes de *${brandName}*.\n\n` +
    'Para salir de nuevo, responde *SALIR* en cualquier momento.'
  )
}

/**
 * Lo que se contesta cuando la base falló al escribir el opt-out. No se le puede decir
 * «listo»: el cliente seguiría recibiendo campañas, que es justo lo que su SALIR pedía
 * parar. Mismo criterio que la rama `remitente_no_verificable` de los domicilios.
 */
const OPT_OUT_ERROR_REPLY =
  '❌ Tuvimos un problema técnico y no pude registrar tu salida. Por favor inténtalo de ' +
  'nuevo en unos minutos.'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * `mediaUrl` adjunta una foto al mensaje (`<Media>` dentro de `<Message>`).
 * Solo la usa la respuesta al botón «sí» de Golden Bullet, que puede llevar la
 * imagen del regalo; el resto de las respuestas de esta ruta son texto.
 */
function twimlResponse(message: string, mediaUrl?: string | null): NextResponse {
  const cuerpo = mediaUrl
    ? `<Message>\n    <Body>${escapeXml(message)}</Body>\n    <Media>${escapeXml(mediaUrl)}</Media>\n  </Message>`
    : `<Message>${escapeXml(message)}</Message>`
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${cuerpo}\n</Response>`
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

/**
 * 200 con TwiML VACIO: Twilio queda conforme y al remitente no le llega nada.
 *
 * Es la forma correcta de callarse. Un 204 o un cuerpo vacio hacen que Twilio marque el
 * webhook como fallido, y a los suficientes fallos deja de entregarnos los entrantes — o
 * sea que tambien perderiamos los `SALIR` y los pedidos de domicilio.
 */
function silentResponse(): NextResponse {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

function normalizePhone(from: string): string {
  return from
    .replace(/^whatsapp:\+?/i, '')
    .replace(/[^0-9]/g, '')
    .replace(/^57/, '')
    .slice(-10)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const url = req.url
  const signature = req.headers.get('x-twilio-signature') ?? ''

  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody))

  // El tenant se resuelve ANTES de validar la firma: Twilio firma con el token de la
  // cuenta DUEÑA DEL NÚMERO, que puede ser una subcuenta propia (Sushi Fun y cualquier
  // tenant con `twilio_subaccount_auth_token`), no siempre el master del entorno. Hace
  // falta saber de qué tenant es el número para elegir contra qué secreto validar.
  //
  // Esto no debilita nada: `getTenantByWhatsappNumber()` es solo la llave para el
  // secreto, no una decisión de confianza — ya filtra `is_active = true`, y si la firma
  // no cuadra contra el token de ESE tenant se rechaza igual: sin token o con firma
  // que no cuadra → 403, siempre.
  const to = params['To'] ?? ''
  const tenant = await getTenantByWhatsappNumber(to)
  if (!tenant) {
    // 200, NO 403: es la única salida que no es fail-closed, y es deliberada.
    // Un número que no es de ninguna marca activa no dispara ninguna acción, así que
    // el 403 no protegería nada — y sí haría que Twilio REINTENTE la entrega y llene
    // su consola de errores. Rechazar la acción y avisarle un error a Twilio son dos
    // cosas distintas. La decisión es vieja y estaba documentada; se conserva.
    return new NextResponse(null, { status: 200 })
  }

  const authToken = tenant.twilio_subaccount_auth_token ?? process.env.TWILIO_AUTH_TOKEN
  if (!validateTwilioSignature(url, params, signature, authToken)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = (params['Body'] ?? '').trim()
  const upper = body.toUpperCase()

  const from = params['From'] ?? ''
  const phone = normalizePhone(from)

  // ── Los botones de Golden Bullet ──
  //
  // VA ANTES DEL BLOQUE DE PALABRAS CLAVE, Y NO ES CASUALIDAD.
  //
  // Cuando alguien toca un botón de respuesta rápida, WhatsApp manda el TEXTO
  // del botón como si la persona lo hubiera escrito. Con el botón «No, gracias»
  // eso no choca con nada —`OPT_OUT_KEYWORDS` compara el cuerpo ENTERO, y
  // "NO, GRACIAS" no es "NO"—, pero tampoco lo atendería nadie: caería al
  // catch-all de intenciones y le contestaríamos el menú a alguien que acaba de
  // pedir que no le escribamos más. Este bloque lo atiende primero.
  //
  // Twilio manda `ButtonPayload` en las respuestas rápidas de plantilla; se usa
  // ese cuando viene y el texto visible como respaldo (ver el servicio). Los
  // títulos que el operador eligió para sus botones viven en `admin_settings`
  // y solo hacen falta para ese respaldo, así que se leen únicamente cuando
  // no vino payload.
  const etiquetas = params['ButtonPayload']
    ? undefined
    : await getMultipleSettings([CLUB_SETTING_KEYS.botonSi, CLUB_SETTING_KEYS.botonNo], tenant.id)
        .then((a) => ({ si: a[CLUB_SETTING_KEYS.botonSi], no: a[CLUB_SETTING_KEYS.botonNo] }))
        .catch(() => undefined)
  const boton = detectClubButton(body, params['ButtonPayload'], etiquetas)
  if (boton && phone.length === 10) {
    const respuesta =
      boton === 'opt_in'
        ? await handleClubOptIn(phone, tenant, body)
        : await handleClubOptOut(phone, tenant, body)
    return twimlResponse(respuesta.body, respuesta.mediaUrl)
  }

  // Opt-out / opt-in. Por WhatsApp esto NO lo intercepta Twilio (ver el comentario de
  // OPT_OUT_KEYWORDS): la keyword llega hasta aquí y este bloque es lo único que la
  // registra y lo único que le contesta al cliente (auditoría 12-Julio, tarea 8).
  //
  // DOS COSAS QUE ANTES NO PASABAN Y AHORA SÍ (2026-09-06):
  //
  //   1. **Se le contesta al cliente.** Antes esta rama devolvía un 200 VACÍO: quien
  //      escribía SALIR no recibía nada y no tenía forma de saber si había servido.
  //      Nunca respondió — no es una regresión, es un hueco desde el principio. Ahora
  //      sale una confirmación por TwiML, el mismo canal que esta ruta ya usa para el
  //      mesero y para el comensal. Ver `buildOptOutReply()` para por qué eso NO viola
  //      la regla de "solo plantillas aprobadas" y por qué no se replica en Zernio.
  //
  //   2. **El log dice la verdad.** Antes se escribía `opt-out persistido` aunque el
  //      UPDATE no hubiera tocado NINGUNA fila —un teléfono sin ficha en este tenant da
  //      cero filas y `error = null`, que para Postgres es un éxito—. El dueño leía ese
  //      log, iba al panel y no encontraba nada, porque de verdad no había nada.
  //      `matched` separa los tres desenlaces. Ver `OptOutWriteResult`.
  if (OPT_OUT_KEYWORDS.includes(upper)) {
    const brandName = resolveBranding(tenant.config).name

    if (phone.length !== 10) {
      // Un remitente que no normaliza a 10 dígitos tampoco puede casar con
      // `customers.phone` (formato 3XXXXXXXXX), así que no hay nada que marcar. Se le
      // confirma igual porque el efecto para él es el mismo: no recibe nada.
      console.warn(
        `[twilio-incoming] opt-out sin teléfono utilizable (from="${from}", keyword="${upper}", tenant=${tenant.slug}) — 0 filas`
      )
      return twimlResponse(buildOptOutReply(brandName))
    }

    const result = await setWhatsappOptOut(phone, tenant.id)
    if (!result.ok) {
      console.error(
        `[twilio-incoming] opt-out NO persistido para ${phone} (keyword="${upper}", tenant=${tenant.slug}): ${result.error}`
      )
      return twimlResponse(OPT_OUT_ERROR_REPLY)
    }
    if (result.matched === 0) {
      // Ni error ni éxito: no hay a quién marcarle nada. Casi siempre significa que el
      // número escribió a la línea de una marca donde no tiene ficha (la suya vive en
      // otro tenant) o que el cliente de prueba se borró después. Este es el log que
      // explica un panel vacío.
      console.warn(
        `[twilio-incoming] opt-out SIN FICHA: ${phone} no está en customers de ${tenant.slug} (keyword="${upper}") — 0 filas actualizadas, no aparecerá en el panel`
      )
    } else {
      console.log(
        `[twilio-incoming] opt-out persistido para ${phone} (keyword="${upper}", tenant=${tenant.slug}, filas=${result.matched})`
      )
    }
    return twimlResponse(buildOptOutReply(brandName))
  }

  if (OPT_IN_KEYWORDS.includes(upper)) {
    const brandName = resolveBranding(tenant.config).name

    if (phone.length !== 10) {
      console.warn(
        `[twilio-incoming] opt-in sin teléfono utilizable (from="${from}", keyword="${upper}", tenant=${tenant.slug}) — 0 filas`
      )
      return twimlResponse(buildOptInReply(brandName, 0))
    }

    const result = await clearWhatsappOptOut(phone, tenant.id)
    if (!result.ok) {
      console.error(
        `[twilio-incoming] opt-in NO persistido para ${phone} (keyword="${upper}", tenant=${tenant.slug}): ${result.error}`
      )
      return twimlResponse(OPT_OUT_ERROR_REPLY)
    }
    if (result.matched === 0) {
      console.warn(
        `[twilio-incoming] opt-in SIN FICHA: ${phone} no está en customers de ${tenant.slug} (keyword="${upper}") — 0 filas actualizadas`
      )
    } else {
      console.log(
        `[twilio-incoming] opt-in: opt-out limpiado para ${phone} (keyword="${upper}", tenant=${tenant.slug}, filas=${result.matched})`
      )
    }
    return twimlResponse(buildOptInReply(brandName, result.matched))
  }

  // Si el remitente es un mesero autorizado, procesar el pedido de domicilio.
  //
  // ⚠️ FASE 2 DE §25 (2026-09-03): esto YA NO se reenvía a n8n. Antes se hacía un POST a
  // `N8N_DOMICILIOS_WEBHOOK_URL` y se relayaba su TwiML de vuelta; ahora el parseo con IA
  // y el registro corren aquí mismo (`processDeliveryMessage()`). El workflow
  // `domicilios_whatsapp_v4` sigue desplegado pero deja de recibir tráfico: su webhook lo
  // disparaba esta línea y nadie más.
  if (phone.length === 10) {
    try {
      const db = getServiceClient()
      // `location_id` en el MISMO select que decide si el número está autorizado: la sede
      // del pedido sale gratis, sin una segunda consulta (D9, multi-sede F3).
      //
      // ⚠️ `error` SE LEE, no se descarta. supabase-js NO lanza: un fallo vuelve como
      // `{ data: null, error }` (`shouldThrowOnError` es false salvo `.throwOnError()`).
      // Si solo se mirara `data`, un timeout del pooler daría `authorized = null`,
      // indistinguible de «no es un operador», y el pedido se ir�a por el camino del
      // cliente normal — auto-respuesta amable y CERO `[Delivery][FALLO]`. Justo el fallo
      // silencioso que esta fase vino a cerrar.
      const { data: authorized, error: authError } = await db
        .from('authorized_numbers')
        .select('id, location_id')
        .eq('phone', phone)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .maybeSingle()

      if (authError) {
        await logDeliveryIntakeFailure({
          tenant,
          operatorPhone: phone,
          reason: 'remitente_no_verificable',
          detail: authError.message,
          rawMessage: body,
        })
        // No se sabe si era un operador o un comensal, así que el texto sirve para los dos
        // y no miente a ninguno. Callar aquí es perder el pedido.
        return twimlResponse(
          '❌ Estamos con un problema técnico y no pude procesar tu mensaje. Si era un pedido, reenvíalo en unos minutos — NO quedó registrado.'
        )
      }

      if (authorized) {
        console.log(`[twilio-incoming] mesero autorizado ${phone} → procesando domicilio (tenant=${tenant.slug})`)

        const outcome = await processDeliveryMessage({
          tenant,
          rawMessage: body,
          operatorPhone: phone,
          operatorLocationId: (authorized.location_id as string | null) ?? null,
        })

        return twimlResponse(buildDeliveryReply(outcome))
      }
    } catch (err) {
      // Camino estrecho: ni `processDeliveryMessage()` lanza (devuelve un resultado
      // discriminado) ni la consulta de arriba lanza (su `error` ya se lee). Lo único que
      // llega aquí es `getServiceClient()` reventándose por falta de variables de entorno.
      console.error(`[Delivery][FALLO] reason=cliente_supabase tenant=${tenant.slug} operador=${phone} detalle="${err instanceof Error ? err.message : String(err)}"`)
      return twimlResponse('❌ Error procesando el pedido. Intenta de nuevo en un momento.')
    }
  }

  // §18.e — el interruptor de la auto-respuesta, que el dueño maneja desde Conexiones.
  //
  // A quien no es operador autorizado, este webhook le contesta «este número de MARCA es
  // exclusivo para mensajes automáticos». Eso era cierto cuando el número era una línea de
  // sistema. **Bajo coexistencia es la línea por la que el restaurante atiende**, y el
  // sistema le está diciendo a un cliente real que ahí no lo atienden y que se vaya a otro
  // lado — una sola vez cada 4 horas, o sea justo en el PRIMER contacto.
  //
  // Va ANTES del cooldown a propósito: apagado, no se toca `auto_reply_cooldown`, así que
  // un tenant silenciado no le consume la ventana de 4 horas a nadie (esa tabla no tiene
  // `tenant_id` — defecto conocido, `2026-09-03-default-puente-tenant.md:158`).
  //
  // Ante un fallo de base se contesta IGUAL. Es deliberado: el default es «prendida», y un
  // timeout del pooler no puede convertirse en un silencio nuevo para todos los clientes de
  // un restaurante. El fallo se registra; el comportamiento no cambia.
  try {
    if (!(await isAutoReplyEnabled(tenant.id))) {
      console.log(`[twilio-incoming] auto-respuesta apagada (tenant=${tenant.slug}) — silencio`)
      return silentResponse()
    }
  } catch (err) {
    console.error(
      `[twilio-incoming][FALLO] reason=auto_reply_flag_error tenant=${tenant.slug} detalle="${err instanceof Error ? err.message : String(err)}"`
    )
  }

  // Cooldown de 4 horas: evita spam de auto-replies al mismo número
  if (phone.length >= 8) {
    try {
      const db = getServiceClient()
      const cooldownHours = 4
      const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString()

      const { data: cooldown } = await db
        .from('auto_reply_cooldown')
        .select('last_sent_at')
        .eq('phone', phone)
        .maybeSingle()

      if (cooldown && cooldown.last_sent_at > cutoff) {
        // Ya le enviamos hace menos de 4 horas — silencio
        return new NextResponse(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { status: 200, headers: { 'Content-Type': 'text/xml' } }
        )
      }

      // Actualizar timestamp (upsert)
      await db
        .from('auto_reply_cooldown')
        .upsert({ phone, last_sent_at: new Date().toISOString() }, { onConflict: 'phone' })
    } catch (err) {
      console.error('[twilio-incoming] Error checking cooldown:', err)
      // Si falla el check, igual responde (mejor responder que silencio)
    }
  }

  const intent = detectIntent(body)
  const branding = resolveBranding(tenant.config)
  const message = buildMessage(intent, branding)

  console.log(`[twilio-incoming] from=${from} body="${body}" intent=${intent}`)

  return twimlResponse(message)
}
