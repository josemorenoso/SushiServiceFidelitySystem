/**
 * Tipos del catálogo estándar de plantillas de WhatsApp.
 * Ver docs/features/whatsapp-templates.md y REQUERIMIENTOS_AGOSTO_2026.md §12.
 *
 * Vive aparte de los dos archivos de constantes (`template-catalog.ts` y
 * `template-texts.ts`) porque ambos necesitan los mismos tipos y el catálogo
 * importa los textos: tenerlos aquí evita el ciclo de imports.
 */

/** Los 3 estilos del banco de textos. `calido` es el default histórico. */
export const TEMPLATE_STYLES = ['calido', 'elegante', 'urbano'] as const
export type TemplateStyle = (typeof TEMPLATE_STYLES)[number]

/**
 * Estilo efectivo de una versión guardada. `personalizado` no es elegible en la
 * UI: es lo que queda cuando el dueño editó el texto a mano y ya no coincide con
 * ningún estilo del banco.
 */
export type TemplateVersionStyle = TemplateStyle | 'personalizado'

/** Las 13 plantillas del catálogo estándar. */
export type TemplateKey =
  | 'welcome'
  | 'points_earned_far'
  | 'points_earned_near'
  | 'reward_safe'
  | 'mystery_box_result'
  | 'golden_box_result'
  | 'birthday'
  | 'reactivation_no_reward'
  | 'reactivation_aggressive'
  | 'campaign_presencial_to_domicilio'
  | 'campaign_domicilio_to_presencial'
  | 'event_image'
  | 'event_video'

export type TemplateCategory = 'AUTHENTICATION' | 'MARKETING' | 'UTILITY'

export type TemplateVersionStatus = 'pending' | 'approved' | 'rejected' | 'retired' | 'failed'

/** Una variable `{{n}}` de la plantilla, para el previsualizador de la UI. */
export interface TemplateVariable {
  /** Posición: 1 para `{{1}}`. */
  index: number
  /** Qué manda el backend en ese hueco (ej. "Nombre del cliente"). */
  label: string
  /** Valor de muestra — se usa en la preview Y como `example` para Meta. */
  sample: string
}

/** Definición de una plantilla del catálogo (estructura, no texto). */
export interface CatalogTemplate {
  key: TemplateKey
  /** Clave de `admin_settings` que guarda el puntero vigente. */
  settingsKey: string
  /** `name` base en el proveedor. Debe matchear `^[a-z][a-z0-9_]*$` (regla de Meta). */
  baseName: string
  category: TemplateCategory
  /** Nombre humano para la pantalla del dueño. */
  label: string
  /** Una línea: qué comunica esta plantilla. */
  description: string
  /** Una línea: cuándo la dispara el sistema. */
  whenSent: string
  variables: readonly TemplateVariable[]
  /** Solo las 2 plantillas de evento del calendario. */
  header?: { format: 'image' | 'video' }
}

/** Fila de `template_versions` (migración 00039). */
export interface TemplateVersion {
  id: string
  tenant_id: string
  template_key: TemplateKey
  settings_key: string
  provider: 'twilio' | 'zernio'
  provider_ref: string
  provider_template_id: string | null
  language: string
  category: TemplateCategory
  style: TemplateVersionStyle
  body: string
  status: TemplateVersionStatus
  rejection_reason: string | null
  is_current: boolean
  edited_by: string | null
  edited_by_email: string | null
  disclaimer_accepted_at: string | null
  created_at: string
  submitted_at: string | null
  resolved_at: string | null
  retired_at: string | null
}

/**
 * Lo que la pantalla de Plantillas necesita saber de UN slot del catálogo:
 * la definición, qué se está enviando hoy y qué hay en revisión.
 */
export interface TemplateCatalogEntry {
  definition: CatalogTemplate
  /** Texto que se está enviando AHORA. `null` = el tenant todavía no tiene esta plantilla. */
  current: TemplateVersion | null
  /** Edición en revisión de Meta. Mientras exista, la UI muestra "en revisión" y no deja editar. */
  pending: TemplateVersion | null
  /** Último rechazo sin resolver — para avisarle al dueño (paso 4 del flujo). */
  lastRejected: TemplateVersion | null
  /** Texto del banco para el estilo actual del tenant: el punto de partida del editor. */
  suggestedBody: string
  /**
   * Nombre de una plantilla que `admin_settings` ya apunta pero que no creamos
   * nosotros (alta por el AIOS o carga manual en SQL). Está activa y enviando,
   * pero no tenemos su texto: la pantalla lo dice en vez de inventarlo.
   * `null` cuando hay `current` o cuando el slot está vacío.
   */
  adoptedRef: string | null
}

/** Respuesta de `GET /api/dashboard/templates/catalog`. */
export interface TemplateCatalogResponse {
  provider: 'twilio' | 'zernio'
  /** Estilo default del tenant (`admin_settings.template_style`). */
  style: TemplateStyle
  brandName: string
  entries: TemplateCatalogEntry[]
}
