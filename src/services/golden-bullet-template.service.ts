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
 * LO QUE SÍ COMPARTE con el catálogo es la mecánica de Twilio: crear en la
 * Content API y después someter a Meta en `/ApprovalRequests/whatsapp`. Si esa
 * mecánica cambia, cambia en los dos sitios.
 */

import { resolveBranding } from '@/lib/branding'
import { getTenantTwilioCredentials } from '@/lib/twilio/tenant-credentials'
import { CLUB_PAYLOAD_SI, CLUB_PAYLOAD_NO } from '@/services/club-optin.service'
import type { Tenant } from '@/types/tenant.types'

const TWILIO_CONTENT_API = 'https://content.twilio.com/v1/Content'
const LANGUAGE = 'es'

/** Los textos visibles. WhatsApp corta los botones a 20 caracteres. */
export const BOTON_SI = 'Quiero ser parte'
export const BOTON_NO = 'No, gracias'

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
  contentSid: string
  friendlyName: string
  body: string
  approvalSubmitted: boolean
  approvalError: string | null
}

/**
 * Crea la plantilla en la cuenta Twilio del tenant y la somete a Meta.
 *
 * Las credenciales NO se piden ni se pasan por parámetro: salen de la fila del
 * tenant (o del entorno como respaldo), igual que en todo el resto del panel.
 * Nadie tiene que copiar un token a ninguna parte.
 */
export async function createClubInviteTemplate(
  tenant: Tenant,
  procedencia: string,
  promoEjemplo: string
): Promise<CreateClubTemplateResult> {
  if (tenant.messaging_provider === 'zernio') {
    throw new GoldenBulletTemplateError(
      'Este negocio está en Zernio: su plantilla se crea desde la pantalla de Plantillas, no desde acá.',
      409
    )
  }
  if (!procedencia.trim()) {
    throw new GoldenBulletTemplateError(
      'Falta la línea que explica de dónde salió el número de estas personas, y tiene que ser verdad: ' +
        'es lo que separa una invitación de un mensaje no solicitado.',
      400
    )
  }

  const creds = await getTenantTwilioCredentials(tenant.id)
  if (!creds) {
    throw new GoldenBulletTemplateError('Este negocio no tiene credenciales de Twilio configuradas.', 400)
  }

  const brandName = resolveBranding(tenant.config).name
  const body = buildClubInviteBody(brandName, procedencia)
  const friendlyName = metaName(brandName)

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
      variables: { '1': 'Juan', '2': promoEjemplo.trim() || 'un postre gratis en tu próxima visita' },
      types: {
        'twilio/quick-reply': {
          body,
          // Los `id` son el CONTRATO con `club-optin.service.ts`: es lo que
          // llega en `ButtonPayload` cuando alguien toca el botón. Si cambian
          // acá y no allá, el botón deja de hacer nada.
          actions: [
            { type: 'QUICK_REPLY', title: BOTON_SI, id: CLUB_PAYLOAD_SI },
            { type: 'QUICK_REPLY', title: BOTON_NO, id: CLUB_PAYLOAD_NO },
          ],
        },
      },
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

  return { contentSid: created.sid, friendlyName, body, approvalSubmitted, approvalError }
}
