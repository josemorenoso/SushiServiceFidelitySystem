/**
 * Creación y consulta de plantillas de WhatsApp en Zernio.
 *
 * Complementa `listZernioTemplates()` de `./messaging.ts` (solo lectura de la
 * lista). Aquí vive el lado de ESCRITURA: crear una plantilla y someterla a
 * Meta, y consultar el veredicto de una en concreto.
 *
 * FUENTE: `Level 2.0/aios-constelarys/docs/zernio-api-contract.md` §4, marcado
 * **VERIFICADO** contra el spec OpenAPI público. Esa doc cierra con una regla
 * que este archivo respeta al pie de la letra:
 *   "No inventar rutas: si algo no aparece arriba como VERIFICADO, no existe
 *    en el spec público leído."
 *
 * ⚠️ NO HAY DELETE DE PLANTILLAS. El contrato verificado expone crear, listar y
 * consultar — no borrar. El §12 pide que la plantilla vieja "se borre" recién
 * cuando Meta aprueba la nueva; lo que este código hace es dejar de apuntarla
 * (que es lo que resuelve el problema real) y marcarla `retired` en
 * `template_versions`. La plantilla queda huérfana en la WABA: no cuesta, no se
 * envía y no estorba. Ver docs/features/whatsapp-templates.md § "Lo que falta".
 */

import { zernioFetch } from './client'

export type ZernioTemplateStatus =
  | 'APPROVED'
  | 'PENDING'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'
  | 'IN_APPEAL'
  | 'PENDING_DELETION'

export type ZernioTemplateCategory = 'AUTHENTICATION' | 'MARKETING' | 'UTILITY'

/**
 * Componentes de la plantilla, tal cual los espera Meta a través de Zernio.
 * Modelamos los que usa el catálogo estándar —header de media, body con
 * variables posicionales— y, desde el 2026-09-12, los botones de respuesta
 * rápida que usa la plantilla del Golden Bullet (`golden-bullet-template.service.ts`).
 * Sin footer: nadie lo usa.
 */
export interface ZernioTemplateHeaderComponent {
  type: 'header'
  format: 'image' | 'video'
  /** URL pública de la muestra que Meta revisa junto con el texto. */
  example: { header_handle: string[] }
}

export interface ZernioTemplateBodyComponent {
  type: 'body'
  text: string
  /** Un solo juego de valores de ejemplo, en orden posicional. */
  example: { body_text: string[][] }
}

/**
 * Botones de respuesta rápida. Meta solo acepta el TEXTO al crearlos: el
 * payload que vuelve al tocarlos es ese mismo texto (Zernio no deja fijar un
 * payload propio para `quick_reply` al enviar — su `templateButtonParams` cubre
 * `url`, `copy_code` y `flow`, verificado en el spec el 2026-09-12). Por eso el
 * detector de `club-optin.service.ts` reconoce el botón por su título.
 */
export interface ZernioTemplateButtonsComponent {
  type: 'buttons'
  buttons: { type: 'quick_reply'; text: string }[]
}

export type ZernioTemplateComponent =
  | ZernioTemplateHeaderComponent
  | ZernioTemplateBodyComponent
  | ZernioTemplateButtonsComponent

export interface CreateZernioTemplateInput {
  accountId: string
  /** Debe matchear `^[a-z][a-z0-9_]*$` — lo exige Meta, no nosotros. */
  name: string
  category: ZernioTemplateCategory
  language: string
  bodyText: string
  /** Valores de ejemplo en orden posicional ({{1}}, {{2}}, ...). */
  bodyExample: string[]
  /** Las 2 plantillas de evento del calendario y el Golden Bullet con foto. */
  header?: { format: 'image' | 'video'; sampleUrl: string }
  /** Textos de los botones de respuesta rápida (hasta 3, ≤20 caracteres, sin emojis). Solo el Golden Bullet. */
  quickReplies?: string[]
}

/**
 * Arma el array `components` que Zernio reenvía a Meta. Separado de la llamada
 * HTTP para poder probarlo sin red: el orden (header → body → buttons) y la
 * forma de cada pieza son lo que Meta revisa, y equivocarlos cuesta un ciclo
 * de aprobación de 24-48 h.
 */
export function buildZernioTemplateComponents(
  input: Pick<CreateZernioTemplateInput, 'bodyText' | 'bodyExample' | 'header' | 'quickReplies'>
): ZernioTemplateComponent[] {
  const components: ZernioTemplateComponent[] = []

  if (input.header) {
    components.push({
      type: 'header',
      format: input.header.format,
      example: { header_handle: [input.header.sampleUrl] },
    })
  }

  components.push({
    type: 'body',
    text: input.bodyText,
    // `body_text` es un array DE arrays: Meta acepta varios juegos de ejemplo y
    // nosotros mandamos uno solo. Mandar el array plano hace fallar la revisión.
    example: { body_text: [input.bodyExample] },
  })

  const quickReplies = (input.quickReplies ?? []).map((t) => t.trim()).filter(Boolean)
  if (quickReplies.length > 0) {
    components.push({
      type: 'buttons',
      buttons: quickReplies.map((text) => ({ type: 'quick_reply' as const, text })),
    })
  }

  return components
}

export interface ZernioTemplateMutationResult {
  success: boolean
  template: {
    id: string
    name: string
    status: ZernioTemplateStatus
    category: ZernioTemplateCategory
    language: string
  }
}

/**
 * Crea la plantilla y la somete a revisión de Meta en una sola llamada.
 *
 * Devuelve `status: 'PENDING'` para plantillas propias (revisión de 24-72h). El
 * contrato también documenta las "library templates" pre-aprobadas, que vuelven
 * `APPROVED` al instante — el catálogo estándar NO las usa: sus textos son
 * propios y ninguna plantilla de librería de Meta dice lo que decimos nosotros.
 */
export async function createZernioTemplate(
  input: CreateZernioTemplateInput
): Promise<ZernioTemplateMutationResult> {
  const components = buildZernioTemplateComponents(input)

  return zernioFetch<ZernioTemplateMutationResult>('/whatsapp/templates', {
    method: 'POST',
    body: JSON.stringify({
      accountId: input.accountId,
      name: input.name,
      category: input.category,
      language: input.language,
      components,
    }),
  })
}

export interface ZernioTemplateDetail {
  success: boolean
  template: {
    id: string
    name: string
    language: string
    status: ZernioTemplateStatus
    category: ZernioTemplateCategory
    rejected_reason?: string | null
    quality_score?: unknown
  }
}

/**
 * Estado de UNA plantilla. Es el camino de respaldo del detector de aprobación:
 * el camino normal es el webhook `whatsapp.template.status_updated`, que no
 * exige preguntar. Ver `applyProviderTemplateStatus()` en template.service.ts.
 */
export async function getZernioTemplateStatus(
  accountId: string,
  templateName: string,
  language: string
): Promise<ZernioTemplateDetail> {
  const query = new URLSearchParams({ accountId, language })
  return zernioFetch<ZernioTemplateDetail>(
    `/whatsapp/templates/${encodeURIComponent(templateName)}?${query.toString()}`
  )
}
