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
 * ¿Este mensaje entrante es uno de los dos botones?
 *
 * PURA a propósito: es la única parte que hay que poder probar contra los
 * cuerpos raros que manda un proveedor sin levantar nada.
 */
export function detectClubButton(body: string, buttonPayload?: string | null): ClubButton {
  const payload = (buttonPayload ?? '').trim().toUpperCase()
  if (payload === CLUB_PAYLOAD_SI) return 'opt_in'
  if (payload === CLUB_PAYLOAD_NO) return 'opt_out'

  const texto = (body ?? '').trim().toUpperCase()
  if (!texto) return null
  if (TEXTO_SI.includes(texto)) return 'opt_in'
  if (TEXTO_NO.includes(texto)) return 'opt_out'
  return null
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
): Promise<string> {
  const branding = resolveBranding(tenant.config)
  await registrarConsentimiento(tenant.id, phone, 'opt_in', textoDelBoton)

  const enlace = tenant.domain ? `https://${tenant.domain}` : null

  const bienvenida =
    `🎉 ¡Bienvenido al club de *${branding.name}*, y gracias por decir que sí!\n\n` +
    'Te guardamos tu regalo de bienvenida. '

  return enlace
    ? bienvenida +
        `Abrí este enlace para activarlo y llevarte tu tarjeta:\n${enlace}\n\n` +
        'Si en algún momento no querés más mensajes, respondé *SALIR*.'
    : bienvenida +
        'Escaneá el código QR en el local para activarlo.\n\n' +
        'Si en algún momento no querés más mensajes, respondé *SALIR*.'
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
): Promise<string> {
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

  return (
    `Listo, no te escribimos más. Gracias por avisarnos 🙏\n\n` +
    `Si algún día querés los beneficios de *${branding.name}*, escaneá el código QR en el local.`
  )
}
