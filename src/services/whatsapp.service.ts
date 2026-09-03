/**
 * WhatsApp Service — SOLO PLANTILLAS APROBADAS
 *
 * IMPORTANTE: No existe ventana de 24h en este sistema.
 * El cliente escanea un QR y registra datos, pero NUNCA envía un mensaje
 * WhatsApp al negocio. Por tanto, los mensajes free-text (body) NUNCA
 * serán entregados por Meta/WhatsApp.
 *
 * TODOS los mensajes deben enviarse mediante plantillas aprobadas
 * (Twilio Content API con contentSid, o el `name` de plantilla de Zernio).
 *
 * Mapeo estándar de variables por tipo de plantilla:
 *   welcome:       {{1}}=nombre
 *   welcome_back:  {{1}}=nombre, {{2}}=total_visitas, {{3}}=hint_recompensa
 *   reward:        {{1}}=nombre, {{2}}=total_visitas, {{3}}=nombre_premio
 *   birthday:      {{1}}=nombre
 *   reactivation:  {{1}}=nombre, {{2}}=total_visitas, {{3}}=hint_recompensa
 *   campaign:      {{1}}=nombre, {{2}}=total_visitas, {{3}}=hint_recompensa
 *
 * RUTEO POR PROVEEDOR (migración 00036, docs/features/zernio-messaging.md):
 * `sendTemplateMessage()` es el ÚNICO choke-point de envío — los ~10 call-sites
 * de negocio no cambian, solo esta función decide adentro si habla con Twilio
 * o con Zernio según `tenant.messaging_provider`. Ver invariante de seguridad
 * en `sendViaZernio()`: un tenant Zernio mal configurado NUNCA cae al camino
 * Twilio (esa era la trampa documentada en scripts/seed-new-tenant.sql — enviar
 * desde el número de OTRO cliente y cobrárselo a él).
 */

import { formatPhoneForWhatsApp, validatePhone } from '@/lib/validators/phone'
import { recordMessageLog } from '@/services/message-log.service'
import { isPhoneOptedOut } from '@/services/customer.service'
import { sendZernioTemplateMessage } from '@/lib/zernio/messaging'
import { classifyMessageType } from '@/constants/messaging'
import { reserveSendSlot, releaseSendSlot, describeDenial } from '@/services/line-budget.service'
import { ZernioApiError } from '@/lib/zernio/client'

export interface TwilioMessageResponse {
  sid: string
  status: string
}

/**
 * Contexto opcional para persistir el envío en `message_logs`.
 * Si se omite, el mensaje se envía sin registrar (comportamiento legacy).
 * Auditoría 12-Julio: los callers transaccionales deben pasarlo siempre.
 */
export interface MessageLogContext {
  customerId?: string | null
  /** welcome | checkin | tier_unlocked | points_earned_near | points_earned_far | safe_reward | mystery_box | golden_box | delivery | ... */
  messageType: string
  /**
   * Sede a la que se imputa el mensaje (`message_logs.location_id`, 00043 / multi-sede F3).
   *
   * Se estampa AL ENVIAR y se congela: si la atribución fuera un JOIN vivo contra la última
   * visita, el informe de plata de agosto cambiaría en septiembre porque el cliente cambió de
   * sede — y un informe de plata que se mueve solo no lo cree nadie (§6.1 del spec).
   *
   * Hoy solo la llenan los envíos con **sede del acto** (check-in, registro, domicilio). La
   * cascada de respaldo del §6.1 (`last_visit_location_id` → `origin_location_id`), que es la
   * que le pondría sede a las campañas masivas, es **F6**: toca el desglose de plata.
   *
   * Viaja por spread (`{ ...logContext }`) a los 10 `recordMessageLog()` de este archivo.
   */
  locationId?: string | null
}

/**
 * Credenciales + identidad del tenant para enviar mensajes. Aunque los nombres
 * de campo siguen siendo `twilio_*` (no se renombran — ver tenant.types.ts),
 * esta interfaz ahora también carga lo necesario para el camino Zernio.
 * Se pasa el tenant resuelto (por dominio/slug/JWT). Si el tenant no tiene
 * subaccount propio (camino Twilio), se usa la cuenta master via env (TWILIO_*).
 */
export interface TenantMessagingContext {
  id: string
  twilio_subaccount_sid: string | null
  twilio_subaccount_auth_token: string | null
  twilio_whatsapp_number: string | null
  /** true = tenant demo (ventas). Si viene true, este envío se simula — nunca llama a Twilio ni Zernio. */
  is_demo?: boolean
  /** 'zernio' rutea a Zernio; cualquier otro valor (incluido undefined) es Twilio — comportamiento legacy. */
  messaging_provider?: 'twilio' | 'zernio'
  /** Account de Zernio (el número/canal). Sin esto, un tenant 'zernio' no puede enviar — nunca cae a Twilio. */
  zernio_account_id?: string | null
  /** E.164 con '+', ej. +573001234567. Sin esto, un tenant 'zernio' no puede enviar — nunca cae a Twilio. */
  zernio_phone_number?: string | null
}

function getTwilioClient(tenant: TenantMessagingContext) {
  const accountSid = tenant.twilio_subaccount_sid ?? process.env.TWILIO_ACCOUNT_SID
  const authToken = tenant.twilio_subaccount_auth_token ?? process.env.TWILIO_AUTH_TOKEN
  const whatsappNumber = tenant.twilio_whatsapp_number ?? process.env.TWILIO_WHATSAPP_NUMBER

  if (!accountSid || !authToken || !whatsappNumber) {
    return null
  }

  return { accountSid, authToken, whatsappNumber }
}

export interface SendTemplateOptions {
  /**
   * Desactiva el reintento progresivo que va soltando variables ante un 21665.
   *
   * Ese reintento suelta SIEMPRE la variable de número más alto primero, y en las
   * plantillas `twilio/media` del calendario la más alta es justamente `{{6}}` = el
   * path del flyer. Soltarla dejaría la URL de media sin resolver y el evento saldría
   * roto para toda la audiencia. En esas plantillas preferimos fallar con el error de
   * Twilio a la vista antes que enviar un mensaje mutilado.
   *
   * Solo aplica al camino Twilio: 21665 es un código de error de Twilio. Zernio no
   * tiene un reintento equivalente (ver `sendViaZernio()`).
   */
  keepAllVariables?: boolean
  /**
   * Solo camino Zernio. URL pública completa de la media del envío (ej. el flyer de
   * un evento de calendario). A diferencia de Twilio, donde la media es fija en la
   * definición de la plantilla y solo el PATH viaja como variable ({{6}}), Zernio
   * acepta la URL completa como `headerMedia.link` en cada envío puntual.
   */
  headerMediaUrl?: string
  /** Solo camino Zernio. Tipo de la media de `headerMediaUrl`. Default 'image'. */
  headerMediaType?: 'image' | 'video'
  /** Solo camino Zernio. Idioma de la plantilla. Default: env ZERNIO_TEMPLATE_LANGUAGE o 'es'. */
  templateLanguage?: string
}

/**
 * Normaliza el teléfono para Zernio: dígitos internacionales SIN '+' y SIN el
 * prefijo `whatsapp:` que usa Twilio. Los call-sites de negocio pasan números
 * locales colombianos de 10 dígitos (el mismo formato que consume
 * `formatPhoneForWhatsApp`) — se les antepone el indicativo 57 igual que hace
 * Twilio. Si el valor ya viene con prefijo/indicativo (defensivo, no debería
 * pasar hoy) se limpia en vez de duplicar el 57.
 */
function normalizePhoneForZernio(phone: string): string {
  const withoutPrefix = phone.replace(/^whatsapp:/i, '')
  const { valid, cleaned } = validatePhone(withoutPrefix)
  if (valid) return `57${cleaned}`
  return withoutPrefix.replace(/[^0-9]/g, '')
}

/**
 * Diccionario {'1': ..., '2': ...} → array plano en orden de aparición, huecos
 * rellenados con ''. Zernio no acepta el diccionario que usa Twilio (ver
 * src/lib/zernio/messaging.ts). Misma sanitización que el camino Twilio: 21656
 * de Twilio rechaza saltos de línea, y aquí se mantiene por consistencia aunque
 * Zernio no tenga ese código de error documentado.
 *
 * F3 (post-review): antes de calcular el máximo se filtran las claves a solo
 * las que sean puramente numéricas (`/^\d+$/`). Antes, una clave no numérica
 * colada en `variables` producía `Math.max(...keys.map(Number))` = `NaN`, y el
 * `for` con `i <= NaN` nunca itera — la función devolvía `[]` en silencio y la
 * plantilla salía enviada sin variables, sin ningún error visible.
 */
function toZernioTemplateParams(variables: Record<string, string>): string[] {
  const sanitize = (v: string) => v.replace(/\n/g, ' · ').replace(/\r/g, '').trim()
  const allKeys = Object.keys(variables)
  const keys = allKeys.filter((k) => /^\d+$/.test(k))

  const discarded = allKeys.filter((k) => !/^\d+$/.test(k))
  if (discarded.length > 0) {
    console.warn(`[WhatsApp] toZernioTemplateParams: claves no numéricas descartadas: ${discarded.join(', ')}`)
  }

  if (keys.length === 0) {
    if (allKeys.length > 0) {
      console.warn('[WhatsApp] toZernioTemplateParams: variables sin ninguna clave numérica válida — se envía sin parámetros')
    }
    return []
  }

  const max = Math.max(...keys.map(Number))
  const params: string[] = []
  for (let i = 1; i <= max; i++) {
    const raw = variables[String(i)]
    params.push(raw !== undefined ? sanitize(raw) : '')
  }
  return params
}

/**
 * Camino Zernio de `sendTemplateMessage()`. `contentSid` se interpreta como el
 * NAME de la plantilla de Zernio (no hay SID opaco en Zernio, ver
 * docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md §1, pregunta 1).
 *
 * INVARIANTE DE SEGURIDAD: si el tenant no tiene `zernio_account_id` o
 * `zernio_phone_number`, este camino NUNCA cae al fallback de credenciales
 * Twilio master — eso enviaría el mensaje desde el número de OTRO cliente y se
 * lo cobraría a él (la trampa documentada en scripts/seed-new-tenant.sql).
 */
/**
 * Guarda de presupuesto de línea (migración 00037, spec §3.2).
 *
 * Va DESPUÉS del opt-out en ambas ramas: un cliente que pidió SALIR no debe
 * consumir uno de los cupos diarios de la línea.
 *
 * Falla CERRADO. Si no se puede confirmar que hay cupo, no se envía — perder un
 * mensaje es mucho más barato que pasarse del límite de Meta y que le
 * restrinjan al restaurante su línea principal de atención.
 */
async function reserveLineSlot(
  phone: string,
  contentSid: string,
  variables: Record<string, string>,
  tenant: TenantMessagingContext,
  logContext?: MessageLogContext
): Promise<{ ok: true; reservationId: string | null } | { ok: false }> {
  const { messageClass } = classifyMessageType(logContext?.messageType ?? 'manual')
  const result = await reserveSendSlot(tenant.id, phone, messageClass)

  if (result.granted) return { ok: true, reservationId: result.reservationId }

  const reason = result.reason ?? 'budget_check_failed'
  console.warn(`[WhatsApp] Envío denegado por presupuesto de línea: ${reason} (template=${contentSid})`)
  if (logContext) {
    await recordMessageLog({
      ...logContext,
      tenantId: tenant.id,
      phone,
      templateSid: contentSid,
      variables,
      status: 'failed',
      errorCode: reason,
      errorMessage: describeDenial(reason),
      // Sin twilioSid: el trigger de billetera (00033) no cobra un envío que no salió.
    })
  }
  return { ok: false }
}

async function sendViaZernio(
  phone: string,
  contentSid: string,
  variables: Record<string, string>,
  tenant: TenantMessagingContext,
  logContext?: MessageLogContext,
  options?: SendTemplateOptions
): Promise<TwilioMessageResponse | null> {
  if (!tenant.zernio_account_id || !tenant.zernio_phone_number) {
    console.warn(`[WhatsApp] Tenant ${tenant.id} es 'zernio' pero no tiene zernio_account_id/zernio_phone_number — NO se hace fallback a Twilio`)
    if (logContext) {
      await recordMessageLog({
        ...logContext,
        tenantId: tenant.id,
        phone,
        templateSid: contentSid,
        variables,
        status: 'failed',
        errorCode: 'zernio_not_configured',
        errorMessage: 'Tenant messaging_provider=zernio sin zernio_account_id/zernio_phone_number',
        // Sin twilioSid (queda NULL): el trigger de billetera (00033) no cobra un envío que no salió.
      })
    }
    return null
  }

  // Opt-out persistente (auditoría 12-Julio, tarea 8) — mismo criterio que el
  // camino Twilio: no malgastamos el envío con un cliente que pidió SALIR/STOP.
  if (await isPhoneOptedOut(phone, tenant.id)) {
    console.warn(`[WhatsApp] Envío omitido: el cliente está en opt-out (template=${contentSid})`)
    if (logContext) {
      await recordMessageLog({
        ...logContext,
        tenantId: tenant.id,
        phone,
        templateSid: contentSid,
        variables,
        status: 'failed',
        errorCode: 'opted_out_local',
        errorMessage: 'Cliente con opt-out activo (whatsapp_opt_out_at)',
      })
    }
    return null
  }

  // Presupuesto de línea (00037) — después del opt-out, antes de gastar el cupo.
  const zernioSlot = await reserveLineSlot(phone, contentSid, variables, tenant, logContext)
  if (!zernioSlot.ok) return null

  const templateLanguage = options?.templateLanguage ?? process.env.ZERNIO_TEMPLATE_LANGUAGE ?? 'es'
  const templateParams = toZernioTemplateParams(variables)
  const toPhone = normalizePhoneForZernio(phone)
  const headerMedia = options?.headerMediaUrl
    ? { type: options.headerMediaType ?? ('image' as const), link: options.headerMediaUrl }
    : undefined

  try {
    const result = await sendZernioTemplateMessage({
      accountId: tenant.zernio_account_id,
      toPhone,
      templateName: contentSid,
      templateLanguage,
      templateParams,
      headerMedia,
    })

    console.log(`[WhatsApp] Zernio: template enviado ${result.data.messageId} (template=${contentSid})`)

    if (logContext) {
      await recordMessageLog({
        ...logContext,
        tenantId: tenant.id,
        phone,
        templateSid: contentSid,
        variables,
        status: 'sent',
        // NO renombrar: el trigger debit_wallet_on_message_sent (00033) dispara
        // sobre message_logs.twilio_sid cuando deja de ser NULL. Aquí guarda el
        // messageId de Zernio, no un SID de Twilio — el nombre de columna es
        // legacy pero el contrato ("id no-nulo del proveedor") es el mismo.
        twilioSid: result.data.messageId,
      })
    }
    return { sid: result.data.messageId, status: 'sent' }
  } catch (error: unknown) {
    const zernioErr = error instanceof ZernioApiError ? error : null
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`[WhatsApp] FALLO envío Zernio template=${contentSid} status=${zernioErr?.status ?? 'n/a'} msg="${errMsg}"`)
    // El envío no salió: se devuelve el cupo a la ventana de 24h.
    await releaseSendSlot(zernioSlot.reservationId)
    if (logContext) {
      await recordMessageLog({
        ...logContext,
        tenantId: tenant.id,
        phone,
        templateSid: contentSid,
        variables,
        status: 'failed',
        errorCode: zernioErr ? String(zernioErr.status) : null,
        errorMessage: errMsg,
      })
    }
    return null
  }
}

/**
 * NO recibe `mediaUrl` a propósito: en la API de Mensajes de Twilio `ContentSid` y
 * `MediaUrl` son mutuamente excluyentes. Al enviar una plantilla, la media sale
 * ÚNICAMENTE de la definición de la plantilla. Para media dinámica, la plantilla
 * debe declarar la variable en el path (ver `src/lib/twilio/media.ts`) y la URL real
 * viaja en `contentVariables`. (Zernio es distinto: ver `options.headerMediaUrl`.)
 */
export async function sendTemplateMessage(
  phone: string,
  contentSid: string,
  variables: Record<string, string>,
  tenant: TenantMessagingContext,
  logContext?: MessageLogContext,
  options?: SendTemplateOptions
): Promise<TwilioMessageResponse | null> {
  // Tenant demo (ventas): nunca se llama a Twilio ni Zernio de verdad. Se simula el
  // éxito y se deja rastro en message_logs con twilio_sid NULL (para que la UI se
  // sienta real — contador de campaña, "enviado" — sin que el trigger de billetera
  // lo cobre ni un WhatsApp real le llegue a un cliente clonado). Único punto de
  // control: cubre campañas manuales, cron birthday/reactivation/calendar-dispatch,
  // bienvenida QR, mystery box, etc. sin tocar cada ruta. Ver docs/features/demo-tenant.md.
  if (tenant.is_demo) {
    const simulatedSid = `demo_${crypto.randomUUID()}`
    console.log(`[WhatsApp] Tenant demo — envío simulado (contentSid=${contentSid})`)
    if (logContext) {
      await recordMessageLog({
        ...logContext,
        tenantId: tenant.id,
        phone,
        templateSid: contentSid,
        variables,
        status: 'sent',
        twilioSid: null,
      })
    }
    return { sid: simulatedSid, status: 'delivered' }
  }

  const provider = tenant.messaging_provider === 'zernio' ? 'zernio' : 'twilio'

  if (provider === 'zernio') {
    return sendViaZernio(phone, contentSid, variables, tenant, logContext, options)
  }

  const config = getTwilioClient(tenant)
  if (!config) {
    console.warn('[WhatsApp] Twilio no configurado — mensaje no enviado')
    if (logContext) {
      await recordMessageLog({
        ...logContext,
        tenantId: tenant.id,
        phone,
        templateSid: contentSid,
        variables,
        status: 'failed',
        errorCode: 'twilio_not_configured',
        errorMessage: 'Credenciales Twilio del tenant/master ausentes',
      })
    }
    return null
  }

  // Opt-out persistente (auditoría 12-Julio, tarea 8): si el cliente respondió
  // SALIR/STOP/BAJA, no malgastamos el envío ni generamos un error 21610.
  if (await isPhoneOptedOut(phone, tenant.id)) {
    console.warn(`[WhatsApp] Envío omitido: el cliente está en opt-out (contentSid=${contentSid})`)
    if (logContext) {
      await recordMessageLog({
        ...logContext,
        tenantId: tenant.id,
        phone,
        templateSid: contentSid,
        variables,
        status: 'failed',
        errorCode: 'opted_out_local',
        errorMessage: 'Cliente con opt-out activo (whatsapp_opt_out_at)',
      })
    }
    return null
  }

  // Presupuesto de línea (00037) — después del opt-out, antes de gastar el cupo.
  const twilioSlot = await reserveLineSlot(phone, contentSid, variables, tenant, logContext)
  if (!twilioSlot.ok) return null

  const twilio = (await import('twilio')).default
  const client = twilio(config.accountSid, config.authToken)

  // Twilio 21656: rejects contentVariables values that contain newline characters.
  // Sanitize all values: replace \n with ' · ' to keep roadmap readable in one line.
  const sanitize = (v: string) => v.replace(/\n/g, ' · ').replace(/\r/g, '').trim()
  const sanitized: Record<string, string> = {}
  Object.keys(variables).forEach((k) => { sanitized[k] = sanitize(variables[k]) })

  // Sort keys numerically: ['1','2','3','4'] etc.
  const sortedKeys = Object.keys(sanitized).sort((a, b) => Number(a) - Number(b))

  // Progressive retry: if Twilio returns 21665 (contentVariables count mismatch vs template definition),
  // reduce variable count by 1 and retry until we find the right count.
  for (let maxVars = sortedKeys.length; maxVars >= 1; maxVars--) {
    const subset: Record<string, string> = {}
    sortedKeys.slice(0, maxVars).forEach((k) => { subset[k] = sanitized[k] })

    try {
      const message = await client.messages.create({
        from: config.whatsappNumber,
        to: formatPhoneForWhatsApp(phone),
        contentSid,
        contentVariables: JSON.stringify(subset),
      })
      if (maxVars < sortedKeys.length) {
        console.warn(`[WhatsApp] Enviado con ${maxVars}/${sortedKeys.length} vars (mismatch corregido): ${message.sid}`)
      } else {
        console.log(`[WhatsApp] Template enviado: ${message.sid} (contentSid=${contentSid})`)
      }
      if (logContext) {
        await recordMessageLog({
          ...logContext,
          tenantId: tenant.id,
          phone,
          templateSid: contentSid,
          variables: subset,
          status: 'sent',
          twilioSid: message.sid,
        })
      }
      return { sid: message.sid, status: message.status }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      // Only retry on 21665 (variable COUNT mismatch) — NOT on 21656 (invalid format)
      const isCountMismatch = errMsg.includes('21665')
      if (isCountMismatch && maxVars > 1 && !options?.keepAllVariables) {
        console.warn(`[WhatsApp] Variable count mismatch (${maxVars} vars), reintentando con ${maxVars - 1}…`)
        continue
      }
      // Exponer el código de error de Twilio para diagnóstico (p.ej. 63016 opt-out,
      // 21655 contentSid inválido, 63007 número fuera de WhatsApp). Antes el fallo se
      // perdía y el cliente quedaba sin mensaje sin rastro de la causa.
      const twilioErr = error as { code?: number | string; status?: number; moreInfo?: string }
      console.error(
        `[WhatsApp] FALLO envío template contentSid=${contentSid} code=${twilioErr?.code ?? 'n/a'} status=${twilioErr?.status ?? 'n/a'} msg="${errMsg}"${twilioErr?.moreInfo ? ` info=${twilioErr.moreInfo}` : ''}`
      )
      if (logContext) {
        await recordMessageLog({
          ...logContext,
          tenantId: tenant.id,
          phone,
          templateSid: contentSid,
          variables: subset,
          status: 'failed',
          errorCode: twilioErr?.code != null ? String(twilioErr.code) : null,
          errorMessage: errMsg,
        })
      }
      // El envío no salió: se devuelve el cupo a la ventana de 24h.
      await releaseSendSlot(twilioSlot.reservationId)
      return null
    }
  }
  // Se agotaron los reintentos de 21665 sin enviar: el cupo también se devuelve.
  await releaseSendSlot(twilioSlot.reservationId)
  return null
}
