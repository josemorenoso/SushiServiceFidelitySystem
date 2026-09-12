/**
 * Los dos botones de la plantilla de Golden Bullet.
 *
 * Doc: docs/features/golden-bullet.md §Plantilla con botones
 *
 * QUÉ ES ESTO
 * ───────────
 * La plantilla con la que se despierta una base fría no trae una promo a secas:
 * trae una PREGUNTA con dos botones — «Quiero ser parte» y «No, gracias». Este
 * archivo es lo que pasa cuando alguien toca uno de los dos.
 *
 * POR QUÉ SE HACE ASÍ Y NO CON UNA PROMO PELADA
 * ─────────────────────────────────────────────
 * Un botón de rechazo es lo que Meta quiere ver en una base sin consentimiento:
 * le da a la persona una salida de un toque, que es MUCHO más barata para la
 * reputación de la línea que un «Bloquear». Y el que toca «quiero ser parte»
 * deja un consentimiento explícito y fechado que antes no existía en ningún
 * lado — que es justamente lo que le falta a una base comprada o heredada.
 *
 * O sea: los botones no son un adorno de conversión. Son el mecanismo por el
 * que una base fría deja de ser un riesgo para el número principal del
 * restaurante.
 *
 * EL CONTRATO CON LA PLANTILLA (no se cambia de un lado solo)
 * ──────────────────────────────────────────────────────────
 * Cada marca crea su propia plantilla en su proveedor, así que lo único que
 * amarra el botón con este código es el PAYLOAD del botón. Los dos valores de
 * `CLUB_PAYLOAD_*` son ese contrato y están copiados en el instructivo que se
 * le pasa a quien crea la plantilla.
 *
 * El texto visible es el respaldo, no la vía principal: si alguien crea la
 * plantilla con otro payload (o el proveedor no manda payload), el texto exacto
 * del botón todavía la salva. Por eso hay dos formas de reconocerlo.
 */

import { createClient } from '@supabase/supabase-js'
import type { Tenant } from '@/types/tenant.types'
import { resolveBranding } from '@/lib/branding'
import { getMultipleSettings, getSettingValue } from '@/services/settings.service'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

/** El payload que DEBE llevar cada botón. Espejo del instructivo de la plantilla. */
export const CLUB_PAYLOAD_SI = 'CLUB_SI'
export const CLUB_PAYLOAD_NO = 'CLUB_NO'

/** Respaldo por texto visible, para plantillas creadas sin payload. */
const TEXTO_SI = ['QUIERO SER PARTE', 'SÍ, QUIERO', 'SI, QUIERO']
const TEXTO_NO = ['NO, GRACIAS', 'NO GRACIAS']

export type ClubButton = 'opt_in' | 'opt_out' | null

/**
 * Los textos que el operador eligió para SUS botones (los guarda el panel al
 * crear la plantilla). Van al respaldo por texto: si el proveedor no manda el
 * payload, el título exacto del botón todavía lo reconoce.
 */
export interface ClubButtonLabels {
  si?: string | null
  no?: string | null
}

/**
 * ¿Este mensaje entrante es uno de los dos botones?
 *
 * PURA a propósito: es la única parte que hay que poder probar contra los
 * cuerpos raros que manda un proveedor sin levantar nada.
 */
export function detectClubButton(
  body: string,
  buttonPayload?: string | null,
  labels?: ClubButtonLabels
): ClubButton {
  const payload = (buttonPayload ?? '').trim().toUpperCase()
  if (payload === CLUB_PAYLOAD_SI) return 'opt_in'
  if (payload === CLUB_PAYLOAD_NO) return 'opt_out'

  const texto = (body ?? '').trim().toUpperCase()
  if (!texto) return null
  const si = (labels?.si ?? '').trim().toUpperCase()
  const no = (labels?.no ?? '').trim().toUpperCase()
  if (si && texto === si) return 'opt_in'
  if (no && texto === no) return 'opt_out'
  if (TEXTO_SI.includes(texto)) return 'opt_in'
  if (TEXTO_NO.includes(texto)) return 'opt_out'
  return null
}

// ─── Las respuestas a los botones ───────────────────────────────

/**
 * Las claves de `admin_settings` donde el operador escribe SUS respuestas.
 * Vacías = los textos de defecto de abajo. Se editan en Golden Bullet →
 * Plantilla → «Respuestas a los botones».
 */
export const CLUB_SETTING_KEYS = {
  respuestaSi: 'golden_bullet_reply_si_text',
  respuestaNo: 'golden_bullet_reply_no_text',
  fotoSi: 'golden_bullet_reply_si_image_url',
  botonSi: 'golden_bullet_button_si',
  botonNo: 'golden_bullet_button_no',
  invitacion: 'golden_bullet_invite_slug',
  /**
   * Lo que dice `{{1}}` del mensaje 1 cuando la persona no tiene nombre. Es
   * de la MARCA (se escribe al lado del mensaje, en la pestaña Plantilla) y el
   * paso 4 del asistente arranca con este valor. `{{1}}` es una variable de
   * Meta y no puede ir vacía: por eso existe.
   */
  nombreGenerico: 'golden_bullet_fallback_name',
  /** La foto que va arriba del mensaje 1 (URL pública del bucket). Se hornea en la plantilla al crearla. */
  fotoMensaje1: 'golden_bullet_template_image_url',
  /**
   * Por qué línea sale la DIFUSIÓN. Vacío = por la de la marca
   * (`tenants.messaging_provider`). `'zernio'` = por la línea de coexistencia
   * aunque la marca siga mandando lo normal por Twilio. Ver
   * `resolveGoldenBulletProvider()`.
   */
  proveedor: 'golden_bullet_provider',
} as const

export type MessagingProvider = 'twilio' | 'zernio'

/**
 * Qué proveedor usa el Golden Bullet de una marca — listar/crear la plantilla,
 * la prueba y cada envío de la cola.
 *
 * El caso que lo motiva (dueño, 2026-09-12): Sushi Service manda recibos y
 * campañas por Twilio y eso funciona, pero a una base fría la línea de Twilio
 * le parece un número falso. La difusión tiene que salir por la línea que la
 * gente conoce —la de coexistencia, en Zernio— sin mover lo demás todavía.
 *
 * Reglas, en orden:
 *   1. Si la marca YA manda todo por Zernio, el Golden Bullet también. Sin excepción.
 *   2. Si el ajuste dice `zernio` y la marca tiene la cuenta de Zernio conectada
 *      (`zernio_account_id` + `zernio_phone_number`), por Zernio.
 *   3. Si el ajuste dice `zernio` pero NO hay cuenta: Twilio, y se avisa en el
 *      log. Mandar por Zernio sin cuenta fallaría cerrado en `sendViaZernio()`,
 *      pero fallar cerrado es para el envío, no para elegir en qué pantalla se
 *      crea la plantilla: acá es mejor que el operador vea la de Twilio y un aviso.
 *   4. Si no, el de la marca (Twilio).
 *
 * PURA en `goldenBulletProviderFor()`; `resolveGoldenBulletProvider()` solo lee el ajuste.
 */
export function goldenBulletProviderFor(
  tenant: Pick<Tenant, 'messaging_provider' | 'zernio_account_id' | 'zernio_phone_number'>,
  ajuste: string | null | undefined
): MessagingProvider {
  if (tenant.messaging_provider === 'zernio') return 'zernio'
  const pedido = (ajuste ?? '').trim().toLowerCase()
  if (pedido === 'zernio') {
    if (tenant.zernio_account_id && tenant.zernio_phone_number) return 'zernio'
    console.warn('[Club] golden_bullet_provider=zernio pero la marca no tiene cuenta de Zernio conectada — sale por Twilio')
  }
  return 'twilio'
}

export async function resolveGoldenBulletProvider(tenant: Tenant): Promise<MessagingProvider> {
  if (tenant.messaging_provider === 'zernio') return 'zernio'
  const ajuste = await getSettingValue(CLUB_SETTING_KEYS.proveedor, tenant.id).catch(() => null)
  return goldenBulletProviderFor(tenant, ajuste)
}

export const NOMBRE_GENERICO_DEFECTO = 'cliente'

/** Los comodines que acepta el texto. `{enlace}` solo tiene sentido en el Sí. */
export const CLUB_PLACEHOLDERS = ['{nombre}', '{nombre|texto si no hay nombre}', '{enlace}', '{marca}'] as const

/** `{nombre}` o `{nombre|alternativo}`. El segundo grupo es el alternativo. */
const RE_NOMBRE = /\{nombre(?:\|[^}]*)?\}/g
/** Lo mismo, capturando la coma y los espacios que lo preceden (para poder llevárselos). */
const RE_NOMBRE_CON_COMA = /(,?[ \t]*)\{nombre(?:\|([^}]*))?\}/g

export const RESPUESTA_SI_DEFECTO =
  '🎉 ¡Bienvenido al club de *{marca}*, y gracias por decir que sí, {nombre}!\n\n' +
  'Te guardamos tu regalo de bienvenida. Abrí este enlace para activarlo y llevarte tu tarjeta:\n{enlace}\n\n' +
  'Si en algún momento no querés más mensajes, respondé *SALIR*.'

export const RESPUESTA_NO_DEFECTO =
  'Listo, no te escribimos más. Gracias por avisarnos 🙏\n\n' +
  'Si algún día querés los beneficios de *{marca}*, escaneá el código QR en el local.'

export interface ClubReplyContext {
  nombre: string | null
  enlace: string | null
  marca: string
}

/** Lo que se le contesta a la persona: el texto y, si hay, una foto. */
export interface ClubReply {
  body: string
  mediaUrl: string | null
}

/**
 * Rellena los comodines de una respuesta.
 *
 * `{nombre}` admite un texto alternativo para cuando la persona no tiene
 * nombre en la base (una de cada cuatro, en la de Sushi Service):
 * `{nombre|¿cómo estás?}`. Con nombre sale el nombre; sin nombre sale el
 * alternativo. Y sin alternativo, el comodín se va CON la coma que lo
 * precedía: «¡Qué alegría tenerte por aquí, {nombre}!» queda «¡Qué alegría
 * tenerte por aquí!» y no «…por aquí, !». Un enlace que falta se va con la
 * línea entera en que estaba, para no dejar un renglón vacío que diga «Abrí
 * este enlace:» y nada.
 *
 * PURA: es lo que se prueba contra los textos que escriba el operador.
 */
export function renderClubReply(plantilla: string, ctx: ClubReplyContext): string {
  let texto = plantilla
  if (ctx.nombre) {
    texto = texto.replace(RE_NOMBRE, ctx.nombre)
  } else {
    texto = texto.replace(RE_NOMBRE_CON_COMA, (_m, coma: string, alt?: string) =>
      alt?.trim() ? `${coma}${alt.trim()}` : ''
    )
  }

  if (ctx.enlace) texto = texto.replaceAll('{enlace}', ctx.enlace)
  else texto = texto.replace(/^[^\n]*\{enlace\}[^\n]*\n?/gm, '').replaceAll('{enlace}', '')

  texto = texto.replaceAll('{marca}', ctx.marca)
  return texto.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * El nombre con el que se le habla. Primero la base importada (es de donde
 * salió), después la ficha de cliente si ya la tiene. Best-effort: sin nombre
 * el texto se acomoda solo (ver `renderClubReply`).
 */
async function nombreDe(phone: string, tenantId: string): Promise<string | null> {
  try {
    const db = getServiceClient()
    const { data: importado } = await db
      .from('imported_contacts')
      .select('name')
      .eq('phone', phone)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (importado?.name?.trim()) return importado.name.trim()
    const { data: cliente } = await db
      .from('customers')
      .select('name')
      .eq('phone', phone)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    return cliente?.name?.trim() || null
  } catch {
    return null
  }
}

/** Deja constancia en el libro de consentimiento. Best-effort: nunca rompe la respuesta. */
async function registrarConsentimiento(
  tenantId: string,
  phone: string,
  event: 'opt_in' | 'opt_out',
  consentText: string
): Promise<void> {
  try {
    const db = getServiceClient()
    const { error } = await db.from('consent_events').insert({
      tenant_id: tenantId,
      phone,
      event,
      // 'whatsapp_reply' y no 'import': lo que se está registrando es que la
      // PERSONA contestó, no que nosotros la importamos.
      channel: 'whatsapp_reply',
      consent_text: consentText,
      evidence: { source: 'golden_bullet_button' },
    })
    if (error) {
      console.error(`[Club] No se pudo registrar ${event} de ${phone}: ${error.message}`)
    }
  } catch (err) {
    console.error('[Club] Excepción registrando consentimiento:', err)
  }
}

/**
 * Tocó «Quiero ser parte».
 *
 * Lo que NO hace: crear el cliente. Registrarse pide nombre y cumpleaños, y
 * esos datos no vienen en un toque de botón — inventarlos sería ensuciar la
 * base para siempre. Lo que se hace es dejar el consentimiento escrito y
 * mandarle el enlace de su tarjeta, donde termina de registrarse en treinta
 * segundos. `imported_contacts` pasa a 'converted' recién cuando eso ocurre, en
 * `/api/check-in` — la trazabilidad del ROI no cambia.
 */
export async function handleClubOptIn(
  phone: string,
  tenant: Tenant,
  textoDelBoton: string
): Promise<ClubReply> {
  const branding = resolveBranding(tenant.config)
  await registrarConsentimiento(tenant.id, phone, 'opt_in', textoDelBoton)

  const ajustes = await getMultipleSettings(
    [CLUB_SETTING_KEYS.invitacion, CLUB_SETTING_KEYS.respuestaSi, CLUB_SETTING_KEYS.fotoSi],
    tenant.id
  )

  // El enlace que recibe es el de una INVITACIÓN CON PREMIO (00063), si el dueño
  // eligió una en Recompensas → Invitaciones → «Usar en Golden Bullet». Así el
  // "regalo de bienvenida" no es una promesa en un texto: es un reward_grant que
  // le aparece en la tarjeta al registrarse y que el mesero entrega al escanearlo.
  // Sin invitación elegida, el enlace general de la tarjeta, como antes.
  const slugInvitacion = ajustes[CLUB_SETTING_KEYS.invitacion]?.trim() || null
  const enlace = tenant.domain
    ? slugInvitacion
      ? `https://${tenant.domain}/c/${encodeURIComponent(slugInvitacion)}`
      : `https://${tenant.domain}`
    : null

  // El texto es del operador (panel) o el de defecto. La foto, si la subió.
  const plantilla = ajustes[CLUB_SETTING_KEYS.respuestaSi]?.trim() || RESPUESTA_SI_DEFECTO
  const foto = ajustes[CLUB_SETTING_KEYS.fotoSi]?.trim() || null

  return {
    body: renderClubReply(plantilla, { nombre: await nombreDe(phone, tenant.id), enlace, marca: branding.name }),
    mediaUrl: foto,
  }
}

/**
 * Tocó «No, gracias».
 *
 * Los dos caminos existen porque son dos personas distintas: quien ya era
 * cliente tiene una ficha donde marcar el opt-out; quien vino de una base
 * importada NO está en `customers`, y su "no" no tenía dónde vivir hasta la
 * 00060. `isPhoneOptedOut()` mira los dos sitios desde el 2026-09-10.
 */
export async function handleClubOptOut(
  phone: string,
  tenant: Tenant,
  textoDelBoton: string
): Promise<ClubReply> {
  const branding = resolveBranding(tenant.config)
  const db = getServiceClient()
  const ahora = new Date().toISOString()

  await registrarConsentimiento(tenant.id, phone, 'opt_out', textoDelBoton)

  // 1. ¿Es cliente? Entonces el opt-out va donde siempre.
  const { data: cliente, error: errCliente } = await db
    .from('customers')
    .update({ whatsapp_opt_out_at: ahora })
    .eq('phone', phone)
    .eq('tenant_id', tenant.id)
    .select('id')

  if (errCliente) {
    console.error(`[Club] No se pudo marcar opt-out en customers de ${phone}: ${errCliente.message}`)
  }

  // 2. Y en la base importada, siempre — aunque además sea cliente. Un contacto
  //    marcado 'opted_out' no vuelve a entrar en ninguna importación futura, y
  //    esa es una garantía distinta de la de `customers`.
  const { error: errImportado } = await db
    .from('imported_contacts')
    .update({ status: 'opted_out' })
    .eq('phone', phone)
    .eq('tenant_id', tenant.id)

  if (errImportado) {
    console.error(`[Club] No se pudo marcar opted_out en imported_contacts de ${phone}: ${errImportado.message}`)
  }

  const tocadas = cliente?.length ?? 0
  console.warn(`[Club] opt-out por botón de ${phone} en ${tenant.slug} — ${tocadas} ficha(s) de cliente`)

  const ajustes = await getMultipleSettings([CLUB_SETTING_KEYS.respuestaNo], tenant.id)
  const plantilla = ajustes[CLUB_SETTING_KEYS.respuestaNo]?.trim() || RESPUESTA_NO_DEFECTO
  return {
    body: renderClubReply(plantilla, { nombre: null, enlace: null, marca: branding.name }),
    mediaUrl: null,
  }
}
