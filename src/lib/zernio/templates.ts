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
 * Solo modelamos los que usa el catálogo estándar: header de media, body con
 * variables posicionales. Sin footer y sin botones — ninguna de las 13 los usa.
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

export type ZernioTemplateComponent = ZernioTemplateHeaderComponent | ZernioTemplateBodyComponent

export interface CreateZernioTemplateInput {
  accountId: string
  /** Debe matchear `^[a-z][a-z0-9_]*$` — lo exige Meta, no nosotros. */
  name: string
  category: ZernioTemplateCategory
  language: string
  bodyText: string
  /** Valores de ejemplo en orden posicional ({{1}}, {{2}}, ...). */
  bodyExample: string[]
  /** Solo las 2 plantillas de evento del calendario. */
  header?: { format: 'image' | 'video'; sampleUrl: string }
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
