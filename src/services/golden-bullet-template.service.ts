/**
 * Crea la plantilla de invitación al club — la de los DOS BOTONES.
 *
 * Doc: docs/features/golden-bullet.md §La plantilla con botones
 *
 * POR QUÉ ESTA PLANTILLA NO VIVE EN `template-catalog.ts`
 * ──────────────────────────────────────────────────────
 * El catálogo estándar es el juego de mensajes que TODA marca necesita para
 * operar (bienvenida, check-in, premios…), cada uno con su puntero en
 * `admin_settings.*_template_sid` y su contrato de variables fijo. Esta no es
 * de esas: es de UNA campaña, se elige a mano en el asistente de entre las
 * MARKETING aprobadas, y **no tiene puntero**. Meterla al catálogo la obligaría
 * a tener uno y le pondría a `promoteVersion()` una plantilla que no gobierna.
 *
 * LO QUE SÍ COMPARTE con el catálogo es la mecánica de cada proveedor. Twilio:
 * crear en la Content API y después someter a Meta en `/ApprovalRequests/whatsapp`.
 * Zernio (desde el 2026-09-12): `POST /v1/whatsapp/templates` crea Y somete en
 * una sola llamada, con los botones como componente `buttons`. Si esa mecánica
 * cambia, cambia en los dos sitios.
 *
 * EL PROVEEDOR DE ESTA PLANTILLA NO ES (necesariamente) EL DE LA MARCA
 * ────────────────────────────────────────────────────────────────────
 * Ver `resolveGoldenBulletProvider()` en club-optin.service.ts: una marca que
 * manda lo normal por Twilio puede lanzar la difusión por su línea de
 * coexistencia en Zernio. Acá se crea en el proveedor que ESA función diga.
 *
 * DOS DIFERENCIAS DE ZERNIO QUE NO SON DETALLE
 * ───────────────────────────────────────────
 * 1. La plantilla se identifica por NOMBRE, no por SID: `contentSid` devuelve
 *    el `name` y es lo que el asistente manda como `template_sid` — igual que
 *    el resto del sistema en el camino Zernio (ver whatsapp.service.ts).
 * 2. Los botones NO llevan payload propio: Meta devuelve el TEXTO del botón al
 *    tocarlo. El detector de `club-optin.service.ts` los reconoce por el título
 *    guardado en `admin_settings` (`guardarEtiquetas()` en la ruta).
 */

import { resolveBranding } from '@/lib/branding'
import { getTenantTwilioCredentials } from '@/lib/twilio/tenant-credentials'
import { createZernioTemplate } from '@/lib/zernio/templates'
import { listZernioTemplates } from '@/lib/zernio/messaging'
import { ZernioApiError } from '@/lib/zernio/client'
import {
  CLUB_PAYLOAD_SI,
  CLUB_PAYLOAD_NO,
  resolveGoldenBulletProvider,
  type MessagingProvider,
} from '@/services/club-optin.service'
import type { Tenant } from '@/types/tenant.types'

const TWILIO_CONTENT_API = 'https://content.twilio.com/v1/Content'
const LANGUAGE = 'es'

/**
 * Los textos visibles POR DEFECTO. Desde el 2026-09-11 el operador puede
 * escribir los suyos en el panel («Sí, quiero mi regalo»); estos son los que
 * salen si no escribe nada. WhatsApp corta los botones a 20 caracteres.
 */
export const BOTON_SI = 'Quiero ser parte'
export const BOTON_NO = 'No, gracias'
export const BOTON_MAX = 20

/** Tope de Meta para el cuerpo de una plantilla. */
export const CUERPO_MAX = 1024

export class GoldenBulletTemplateError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'GoldenBulletTemplateError'
  }
}

/**
 * Arma el cuerpo del mensaje.
 *
 * `procedencia` NO tiene valor por defecto, y es a propósito: es la frase que
 * le dice a la persona de dónde salió su número, y **tiene que ser verdad**.
 * Poner acá un "porque nos visitaste" por defecto haría que la mitad de las
 * marcas mandaran una mentira sin darse cuenta — justo en el mensaje cuyo
 * propósito es pedir permiso.
 */
export function buildClubInviteBody(brandName: string, procedencia: string): string {
  return (
    `Hola {{1}} 👋\n\n` +
    `Te escribimos de *${brandName}*. ${procedencia.trim()}\n\n` +
    `Estamos abriendo nuestro club de beneficios y queremos empezar contigo: {{2}}\n\n` +
    `¿Querés hacer parte? Es gratis y salís cuando quieras.`
  )
}

/** Qué variables `{{n}}` usa un cuerpo. Espejo de `variablesDe()` en el asistente. */
export function variablesDelCuerpo(body: string): Set<number> {
  const vars = new Set<number>()
  for (const m of (body ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)) vars.add(Number(m[1]))
  return vars
}

/**
 * Lo que tiene que cumplir un cuerpo escrito a mano para que el envío no
 * reviente después de que Meta lo apruebe.
 *
 * `{{1}}` (el nombre) es OBLIGATORIO y `{{2}}` (la promo) es OPCIONAL: el
 * drenador rellena exactamente esas dos, y una tercera dejaría un envío con
 * variables faltantes que el proveedor rechaza entero. Hasta el 2026-09-11
 * `{{2}}` era obligatoria también; un mensaje que dice «tenemos un regalo
 * preparado para ti» sin variable es perfectamente válido, así que dejó de serlo.
 *
 * PURA: es lo que se prueba sin Twilio.
 */
export function validarCuerpoClub(body: string): string | null {
  const texto = body.trim()
  if (!texto) return 'El mensaje está vacío.'
  if (texto.length > CUERPO_MAX) return `El mensaje tiene ${texto.length} caracteres y Meta acepta hasta ${CUERPO_MAX}.`
  const vars = variablesDelCuerpo(texto)
  if (!vars.has(1)) return 'Falta {{1}}: es donde va el nombre de la persona.'
  const extra = [...vars].filter((n) => n !== 1 && n !== 2)
  if (extra.length > 0) {
    return `El mensaje usa {{${extra[0]}}} y el envío solo rellena {{1}} (nombre) y {{2}} (regalo).`
  }
  return null
}

/** Emojis y pictogramas. Espejo de `tieneEmoji()` en el asistente. */
const RE_EMOJI = /\p{Extended_Pictographic}/u

/**
 * Lo mismo para el texto visible de un botón.
 *
 * Sin emojis: Twilio los rechaza al crear («Button Title text cannot contain
 * emojis», HTTP 400, 2026-09-11). Los botones de respuesta rápida de WhatsApp
 * son solo texto; en el cuerpo sí van.
 */
export function validarBoton(titulo: string, cual: 'sí' | 'no'): string | null {
  const t = titulo.trim()
  if (!t) return `El botón del ${cual} está vacío.`
  if ([...t].length > BOTON_MAX) return `El botón del ${cual} tiene ${[...t].length} caracteres y WhatsApp acepta hasta ${BOTON_MAX}.`
  if (RE_EMOJI.test(t)) return `El botón del ${cual} lleva un emoji y WhatsApp no los acepta en los botones (en el mensaje sí).`
  return null
}

/** Nombre para Meta: minúsculas, números y guiones bajos. Lo exige Meta. */
function metaName(brandName: string): string {
  const slug = brandName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return `club_invite_${slug}`.slice(0, 512)
}

export interface CreateClubTemplateResult {
  /** Twilio: el `HX…`. Zernio: el NOMBRE de la plantilla (es lo que se manda). */
  contentSid: string
  friendlyName: string
  body: string
  botonSi: string
  botonNo: string
  imageUrl: string | null
  approvalSubmitted: boolean
  approvalError: string | null
  provider: MessagingProvider
}

export interface ClubTemplateInput {
  /** El cuerpo ENTERO, escrito por el operador. Tiene que pasar `validarCuerpoClub()`. */
  body: string
  /** Textos visibles de los botones. Vacíos = los de defecto. */
  botonSi?: string
  botonNo?: string
  /** Ejemplo de `{{2}}` para Meta. Solo importa si el cuerpo la usa. */
  promoEjemplo?: string
  /**
   * URL pública (https) de la foto que va ARRIBA del texto. Con foto la
   * plantilla se crea como `whatsapp/card` (cabecera de imagen + cuerpo +
   * botones); sin foto, como `twilio/quick-reply`. La URL queda horneada en
   * la plantilla: es la imagen que Meta revisa y la que sale en cada envío.
   */
  imageUrl?: string | null
}

/** Lo que Twilio recibe en `types`. Espejo de `construirTiposPlantilla()`. */
export type TiposPlantillaClub =
  | { 'twilio/quick-reply': { body: string; actions: { type: 'QUICK_REPLY'; title: string; id: string }[] } }
  | { 'whatsapp/card': { body: string; media: string[]; actions: { type: 'QUICK_REPLY'; title: string; id: string }[] } }

/**
 * Arma el `types` de la plantilla según haya foto o no.
 *
 * `whatsapp/card` es el tipo nativo de WhatsApp con cabecera de media, cuerpo
 * de hasta 1.024 y botones de respuesta rápida; `twilio/card` NO sirve para
 * esto porque su `title` es lo que WhatsApp muestra como cuerpo y su
 * `subtitle` cae al pie (60 caracteres). Los `id` de los botones son el
 * contrato con `club-optin.service.ts` en los dos casos.
 *
 * PURA: es lo que se prueba sin Twilio.
 */
export function construirTiposPlantilla(
  body: string,
  botonSi: string,
  botonNo: string,
  imageUrl?: string | null
): TiposPlantillaClub {
  const actions = [
    { type: 'QUICK_REPLY' as const, title: botonSi, id: CLUB_PAYLOAD_SI },
    { type: 'QUICK_REPLY' as const, title: botonNo, id: CLUB_PAYLOAD_NO },
  ]
  const foto = imageUrl?.trim()
  return foto
    ? { 'whatsapp/card': { body, media: [foto], actions } }
    : { 'twilio/quick-reply': { body, actions } }
}

/** Una foto de plantilla tiene que ser una URL https pública: Meta la descarga para revisarla. */
export function validarFotoPlantilla(url: string | null | undefined): string | null {
  const u = (url ?? '').trim()
  if (!u) return null
  if (!/^https:\/\/\S+$/i.test(u)) return 'La foto tiene que ser una URL pública que empiece por https://.'
  return null
}

/**
 * El nombre que se le da a la plantilla en la WABA. Meta no deja crear dos con
 * el mismo nombre e idioma, y no hay borrado por el contrato verificado: si
 * `base` ya existe (aprobada, rechazada o pendiente, da igual), la nueva sale
 * como `base_v2`, `base_v3`… — el mismo esquema que usa el catálogo estándar.
 *
 * PURA: recibe los nombres que ya hay.
 */
export function nombreLibreEnWaba(base: string, existentes: Iterable<string>): string {
  const usados = new Set([...existentes].map((n) => n.trim().toLowerCase()))
  if (!usados.has(base)) return base
  for (let v = 2; v < 100; v++) {
    const candidato = `${base}_v${v}`
    if (!usados.has(candidato)) return candidato
  }
  return `${base}_${Date.now()}`
}

/** Los textos de ejemplo que Meta revisa junto al cuerpo. Espejo del `variables` de Twilio. */
export function ejemploDelCuerpo(body: string, promoEjemplo?: string | null): string[] {
  const usaPromo = variablesDelCuerpo(body).has(2)
  return usaPromo ? ['Juan', (promoEjemplo ?? '').trim() || 'un postre gratis en tu próxima visita'] : ['Juan']
}

/**
 * Crea la plantilla en el proveedor del Golden Bullet y la somete a Meta.
 *
 * Las credenciales NO se piden ni se pasan por parámetro: en Twilio salen de la
 * fila del tenant (o del entorno como respaldo); en Zernio, de `ZERNIO_API_KEY`
 * y del `zernio_account_id` del tenant. Nadie tiene que copiar un token a
 * ninguna parte.
 */
export async function createClubInviteTemplate(
  tenant: Tenant,
  input: ClubTemplateInput
): Promise<CreateClubTemplateResult> {
  // El cuerpo lo escribe el operador. Lo que ANTES era un campo aparte —la
  // línea de «de dónde salió su número», que tiene que ser verdad— ahora es
  // parte del texto que escribe; el panel se lo recuerda, pero no se puede
  // verificar desde acá. Lo que sí se verifica es lo que rompería el envío.
  const body = input.body.trim()
  const errorCuerpo = validarCuerpoClub(body)
  if (errorCuerpo) throw new GoldenBulletTemplateError(errorCuerpo, 400)

  const botonSi = (input.botonSi ?? '').trim() || BOTON_SI
  const botonNo = (input.botonNo ?? '').trim() || BOTON_NO
  const errorBoton = validarBoton(botonSi, 'sí') ?? validarBoton(botonNo, 'no')
  if (errorBoton) throw new GoldenBulletTemplateError(errorBoton, 400)

  const imageUrl = input.imageUrl?.trim() || null
  const errorFoto = validarFotoPlantilla(imageUrl)
  if (errorFoto) throw new GoldenBulletTemplateError(errorFoto, 400)

  const brandName = resolveBranding(tenant.config).name

  if ((await resolveGoldenBulletProvider(tenant)) === 'zernio') {
    return crearEnZernio(tenant, brandName, { body, botonSi, botonNo, imageUrl, promoEjemplo: input.promoEjemplo })
  }

  const creds = await getTenantTwilioCredentials(tenant.id)
  if (!creds) {
    throw new GoldenBulletTemplateError('Este negocio no tiene credenciales de Twilio configuradas.', 400)
  }

  // Con foto el nombre cambia: Meta no deja reenviar el mismo nombre con otro tipo.
  const friendlyName = imageUrl ? `${metaName(brandName)}_foto` : metaName(brandName)
  const usaPromo = variablesDelCuerpo(body).has(2)

  const headers = {
    Authorization: creds.basicAuth,
    'Content-Type': 'application/json',
  }

  const createRes = await fetch(TWILIO_CONTENT_API, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      friendly_name: friendlyName,
      language: LANGUAGE,
      // Los ejemplos son lo que Meta revisa junto al texto. `{{1}}` es el
      // nombre y `{{2}}` la promo: el mismo contrato que arma `confirmImport()`.
      // `{{2}}` solo se declara si el cuerpo la usa: declarar una variable que
      // no aparece es motivo de rechazo.
      variables: usaPromo
        ? { '1': 'Juan', '2': (input.promoEjemplo ?? '').trim() || 'un postre gratis en tu próxima visita' }
        : { '1': 'Juan' },
      // Los `id` de los botones son el CONTRATO con `club-optin.service.ts`:
      // es lo que llega en `ButtonPayload` cuando alguien toca el botón. Si
      // cambian acá y no allá, el botón deja de hacer nada. El TÍTULO sí lo
      // elige el operador; el detector lo recibe desde `admin_settings`.
      types: construirTiposPlantilla(body, botonSi, botonNo, imageUrl),
    }),
  })

  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => '')
    console.error('[GoldenBulletTemplate] create', createRes.status, detail)
    throw new GoldenBulletTemplateError(
      `Twilio rechazó la creación de la plantilla (HTTP ${createRes.status}). ${detail.slice(0, 300)}`,
      502
    )
  }

  const created = (await createRes.json()) as { sid: string }

  // Someter a Meta. Si esto falla la plantilla YA existe en Twilio, así que no
  // se aborta: se informa y se puede reenviar desde la pantalla de Plantillas.
  let approvalSubmitted = false
  let approvalError: string | null = null
  try {
    const approvalRes = await fetch(`${TWILIO_CONTENT_API}/${created.sid}/ApprovalRequests/whatsapp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: friendlyName, category: 'MARKETING' }),
    })
    if (approvalRes.ok) approvalSubmitted = true
    else approvalError = await approvalRes.text().catch(() => `HTTP ${approvalRes.status}`)
  } catch (error) {
    approvalError = error instanceof Error ? error.message : 'Error desconocido'
  }

  return {
    contentSid: created.sid,
    friendlyName,
    body,
    botonSi,
    botonNo,
    imageUrl,
    approvalSubmitted,
    approvalError,
    provider: 'twilio',
  }
}

/**
 * La rama Zernio. Una sola llamada crea la plantilla en la WABA del tenant y
 * la deja `PENDING` ante Meta; el veredicto llega por el webhook
 * `whatsapp.template.status_updated` o se lee en el listado.
 *
 * El nombre es el identificador de envío, así que se elige libre en la WABA
 * (`nombreLibreEnWaba`) ANTES de crear: un 400 de Meta por nombre repetido no
 * dice cuál es el libre.
 */
async function crearEnZernio(
  tenant: Tenant,
  brandName: string,
  args: { body: string; botonSi: string; botonNo: string; imageUrl: string | null; promoEjemplo?: string }
): Promise<CreateClubTemplateResult> {
  if (!tenant.zernio_account_id) {
    throw new GoldenBulletTemplateError(
      'Este negocio todavía no tiene la cuenta de WhatsApp de Zernio conectada (Conexiones).',
      400
    )
  }

  const base = args.imageUrl ? `${metaName(brandName)}_foto` : metaName(brandName)
  let existentes: string[] = []
  try {
    const listado = await listZernioTemplates(tenant.zernio_account_id)
    existentes = (listado.templates ?? []).map((t) => t.name)
  } catch (error) {
    // Sin listado no se puede elegir nombre a ciegas: un `_v2` sobre un `_v2`
    // que ya existe termina en un 400 igual de opaco. Mejor decirlo.
    const detail = error instanceof Error ? error.message : String(error)
    throw new GoldenBulletTemplateError(`No se pudo leer la WABA en Zernio para elegir el nombre: ${detail}`, 502)
  }
  const friendlyName = nombreLibreEnWaba(base, existentes)

  try {
    const created = await createZernioTemplate({
      accountId: tenant.zernio_account_id,
      name: friendlyName,
      category: 'MARKETING',
      language: LANGUAGE,
      bodyText: args.body,
      bodyExample: ejemploDelCuerpo(args.body, args.promoEjemplo),
      header: args.imageUrl ? { format: 'image', sampleUrl: args.imageUrl } : undefined,
      quickReplies: [args.botonSi, args.botonNo],
    })

    return {
      contentSid: created.template?.name ?? friendlyName,
      friendlyName,
      body: args.body,
      botonSi: args.botonSi,
      botonNo: args.botonNo,
      imageUrl: args.imageUrl,
      // Zernio crea y somete en el mismo POST: si respondió, ya está en revisión.
      approvalSubmitted: true,
      approvalError: null,
      provider: 'zernio',
    }
  } catch (error) {
    const zernioErr = error instanceof ZernioApiError ? error : null
    const detail = error instanceof Error ? error.message : String(error)
    console.error('[GoldenBulletTemplate] zernio create', zernioErr?.status ?? 'n/a', detail)
    throw new GoldenBulletTemplateError(
      `Zernio rechazó la creación de la plantilla${zernioErr?.status ? ` (HTTP ${zernioErr.status})` : ''}. ${detail.slice(0, 300)}`,
      502
    )
  }
}
