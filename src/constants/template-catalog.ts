/**
 * CATÁLOGO ESTÁNDAR de plantillas de WhatsApp — la estructura de las 13.
 *
 * REQUERIMIENTOS_AGOSTO_2026.md §12, punto 1: "Un solo set base de plantillas,
 * igual para todos los tenants. Hoy cada alta termina con un conjunto
 * ligeramente distinto según quién lo haya armado a mano". Este archivo es esa
 * fuente única: todo tenant Zernio nuevo nace con exactamente estas 13.
 *
 * Los TEXTOS no están aquí — están en `template-texts.ts` (banco de 13).
 * Aquí vive la estructura: qué plantilla es, a qué clave de `admin_settings`
 * apunta, su categoría ante Meta y — lo más importante — el CONTRATO DE
 * VARIABLES.
 *
 * ⚠️ EL CONTRATO DE VARIABLES ES SAGRADO. El emisor (check-in, crons de
 * cumpleaños/reactivación, campañas manuales, calendario) manda un diccionario
 * posicional fijo. Cambiar la aridad o el significado de un `{{n}}` aquí rompe
 * el envío de todos los tenants a la vez.
 * La tabla equivalente en prosa está en docs/PLANTILLAS.md.
 *
 * Portado con fidelidad de `scripts/twilio-create-text-templates.mjs` (11) +
 * `scripts/twilio-create-media-templates.mjs` (2), vía
 * `Level 2.0/aios-constelarys/src/lib/zernio/templates-catalog.ts`.
 *
 * ⚠️ ALCANCE: este catálogo aplica SOLO a tenants `messaging_provider='zernio'`.
 * Los 4 tenants Twilio (Sushi Service, Don Alirio, Frangal, Demo) conservan sus
 * plantillas actuales tal cual — decisión 6 del dueño, textual: "los 4 tenants
 * que están con twilio déjalos así, ni los toques". El guardarraíl está en
 * `template.service.ts` (`assertZernioTenant`), no solo en la UI.
 */

import { TEMPLATE_TEXTS } from './template-texts'
import type { BusinessType } from '@/types/tenant.types'
import {
  TEMPLATE_STYLES,
  type CatalogTemplate,
  type TemplateKey,
  type TemplateStyle,
  type TemplateVariable,
  type TemplateVersionStyle,
} from '@/types/template.types'

export { TEMPLATE_STYLES }
export type { TemplateStyle }

/** El estilo con el que nace toda versión. Es el único desde el 2026-09-10. */
export const DEFAULT_TEMPLATE_STYLE: TemplateStyle = 'calido'

/** Idioma de las plantillas del catálogo. */
export const TEMPLATE_LANGUAGE = 'es'

/** Cuántas plantillas tiene el catálogo — y cuántas aprobaciones de Meta cuesta. */
export const CATALOG_SIZE = 13

/**
 * Token que puede aparecer en un `sample` para decir "aquí va el nombre del
 * negocio". Lo usa `event_image`/`event_video`, donde la marca es la variable
 * `{{2}}` en vez de ir horneada en el texto.
 */
const BRAND_TOKEN = '{negocio}'

/**
 * EL EMOJI DE MARCA — el que va horneado en el texto que Meta aprueba.
 *
 * Los textos `calido` nacieron para Sushi Service y traían 🍣 escrito a mano.
 * Como Meta aprueba el texto LITERAL, ese sushi le llegaba igual a una
 * barbería. Ahora ese lugar lo ocupa un emoji resuelto por tipo de negocio en
 * el momento de construir el cuerpo — antes de someterlo a Meta, exactamente
 * igual que el nombre del negocio.
 *
 * ⚠️ NO es una variable `{{n}}`: el contrato de variables no cambia, y el
 * emisor (check-in, crons, campañas, calendario) sigue mandando exactamente los
 * mismos valores en el mismo orden.
 */
export const TEMPLATE_EMOJI_BY_BUSINESS_TYPE: Record<BusinessType, string> = {
  restaurant: '🍽️',
  barbershop: '💈',
  beauty_salon: '💅',
}

/** Cuando el tipo de negocio no está en el mapa. Neutro a propósito. */
export const FALLBACK_TEMPLATE_EMOJI = '✨'

/**
 * El emoji de un tenant: su override explícito si lo tiene, si no el de su
 * tipo de negocio.
 *
 * Nunca devuelve vacío: los textos lo pegan junto a otro emoji (`🎉${emoji}`) o
 * después de una palabra, así que una cadena vacía dejaría un espacio suelto
 * dentro de un texto ya aprobado por Meta — imposible de arreglar sin volver a
 * someterlo. Un tenant que no quiera emoji tiene que editar sus textos, que es
 * justo lo que la pantalla de Plantillas ya permite.
 */
export function resolveTemplateEmoji(
  businessType: string | null | undefined,
  override?: string | null
): string {
  const trimmed = (override ?? '').trim()
  if (trimmed) return trimmed
  if (businessType && businessType in TEMPLATE_EMOJI_BY_BUSINESS_TYPE) {
    return TEMPLATE_EMOJI_BY_BUSINESS_TYPE[businessType as BusinessType]
  }
  return FALLBACK_TEMPLATE_EMOJI
}

const ROADMAP_SAMPLE =
  '🥉 Bronce (150 pts) → Bebida gratis — te faltan 23 pts 🔥 · 🥈 Plata (350 pts) → Postre gratis · 🥇 Oro (600 pts) → Plato fuerte · 🖤 BLACK (1000 pts) → Experiencia Chef'

/**
 * Las 5 variables de las dos plantillas de evento — las mismas para imagen y
 * video, porque el mensaje es el mismo y solo cambia el header.
 *
 * Las MUESTRAS son lo que Meta revisa y lo que el dueño ve en la vista previa,
 * así que copian el formulario del calendario campo por campo: título,
 * descripción / CTA corta y enlace opcional. La de `{{5}}` trae el enlace
 * pegado con " 👉 " porque así lo arma `buildEventCta()` — antes decía
 * "¡Te esperamos con tu familia!", que además de no ser el dato real repetía
 * palabra por palabra el cierre que el cuerpo traía horneado.
 *
 * ⚠️ La aridad NO se amplía. El enlace se compone DENTRO de `{{5}}`: una
 * variable nueva obliga a re-aprobar en las 25 cuentas, 24-72h cada una.
 */
const EVENT_VARIABLES: readonly TemplateVariable[] = [
  { index: 1, label: 'Nombre del cliente', sample: 'María' },
  { index: 2, label: 'Nombre del negocio', sample: BRAND_TOKEN },
  { index: 3, label: 'Título del evento', sample: 'Aniversario 5 años' },
  { index: 4, label: 'Fecha del evento', sample: 'sábado 14 de junio' },
  {
    index: 5,
    label: 'Descripción / CTA corta (con el enlace, si pusiste uno)',
    sample: '¡Promo 2×1 todo el día! Te esperamos. 👉 https://tucarta.com/aniversario',
  },
]

export const TEMPLATE_CATALOG: readonly CatalogTemplate[] = [
  {
    key: 'welcome',
    settingsKey: 'welcome_template_sid',
    baseName: 'bienvenida',
    category: 'UTILITY',
    label: 'Bienvenida',
    description: 'Saluda al cliente nuevo, le da sus puntos iniciales y le muestra el camino de premios.',
    whenSent: 'La primera vez que un cliente se registra, por QR o por domicilio.',
    variables: [
      { index: 1, label: 'Nombre del cliente', sample: 'María' },
      { index: 2, label: 'Puntos de bienvenida', sample: '75' },
      { index: 3, label: 'Camino de niveles', sample: ROADMAP_SAMPLE },
    ],
  },
  {
    key: 'points_earned_far',
    settingsKey: 'points_earned_far_template_sid',
    baseName: 'puntos_sumados_lejos',
    category: 'MARKETING',
    label: 'Puntos sumados — lejos del premio',
    description: 'Agradece la visita y muestra el saldo cuando todavía falta bastante para el siguiente nivel.',
    whenSent: 'Al registrar una visita, si le faltan más de 30 puntos para el próximo nivel.',
    variables: [
      { index: 1, label: 'Nombre del cliente', sample: 'Juan' },
      { index: 2, label: 'Puntos ganados hoy', sample: '52' },
      { index: 3, label: 'Saldo total de puntos', sample: '127' },
      { index: 4, label: 'Camino de niveles', sample: ROADMAP_SAMPLE },
    ],
  },
  {
    key: 'points_earned_near',
    settingsKey: 'points_earned_near_template_sid',
    baseName: 'puntos_sumados_cerca',
    category: 'MARKETING',
    label: 'Puntos sumados — cerca del premio',
    description: 'Igual que la anterior, pero empuja: le falta muy poco para el siguiente nivel.',
    whenSent: 'Al registrar una visita, si le faltan 30 puntos o menos para el próximo nivel.',
    variables: [
      { index: 1, label: 'Nombre del cliente', sample: 'Camila' },
      { index: 2, label: 'Puntos ganados hoy', sample: '47' },
      { index: 3, label: 'Saldo total de puntos', sample: '128' },
      { index: 4, label: 'Premio del próximo nivel', sample: 'Bebida gratis' },
    ],
  },
  {
    key: 'reward_safe',
    settingsKey: 'reward_safe_template_sid',
    baseName: 'tier_desbloqueado_safe',
    category: 'MARKETING',
    label: 'Nivel desbloqueado — premio seguro',
    description: 'Confirma el premio que el cliente eligió al alcanzar un nivel, e indica cómo reclamarlo.',
    whenSent: 'Cuando cruza un nivel y elige el premio seguro en vez de la Mystery Box.',
    variables: [
      { index: 1, label: 'Nombre del cliente', sample: 'Luis' },
      { index: 2, label: 'Nombre del nivel', sample: 'Bronce' },
      { index: 3, label: 'Premio ganado', sample: 'Bebida gratis' },
      { index: 4, label: 'Camino de niveles', sample: ROADMAP_SAMPLE },
    ],
  },
  {
    key: 'mystery_box_result',
    settingsKey: 'mystery_box_result_template_sid',
    baseName: 'mystery_box_resultado',
    category: 'MARKETING',
    label: 'Mystery Box — resultado',
    description: 'Le dice qué le salió al abrir la Mystery Box y cómo reclamarlo.',
    whenSent: 'Cuando cruza un nivel y elige jugar la Mystery Box.',
    variables: [
      { index: 1, label: 'Nombre del cliente', sample: 'Ana' },
      { index: 2, label: 'Nombre del nivel', sample: 'Bronce' },
      { index: 3, label: 'Premio ganado', sample: 'Postre del chef' },
      { index: 4, label: 'Camino de niveles', sample: ROADMAP_SAMPLE },
    ],
  },
  {
    key: 'golden_box_result',
    settingsKey: 'golden_box_result_template_sid',
    baseName: 'golden_box_resultado',
    category: 'MARKETING',
    label: 'Golden Box — resultado',
    description: 'Premio de la caja dorada, la que se activa tras varias rachas de premios bajos.',
    whenSent: 'Cuando el pity timer activa la Golden Box y el cliente la abre.',
    variables: [
      { index: 1, label: 'Nombre del cliente', sample: 'Pedro' },
      { index: 2, label: 'Premio ganado', sample: 'Postre del chef' },
      { index: 3, label: 'Camino de niveles', sample: ROADMAP_SAMPLE },
    ],
  },
  {
    key: 'birthday',
    settingsKey: 'birthday_template_sid',
    baseName: 'cumpleanos',
    category: 'MARKETING',
    label: 'Cumpleaños',
    description: 'Felicita al cliente e invita a celebrarlo en el negocio.',
    whenSent: 'El día del cumpleaños, en el envío automático diario.',
    variables: [
      { index: 1, label: 'Nombre del cliente', sample: 'Sofía' },
      { index: 2, label: 'Saldo total de puntos', sample: '95' },
    ],
  },
  {
    key: 'reactivation_no_reward',
    settingsKey: 'reactivation_no_reward_template_sid',
    baseName: 'reactivacion_suave',
    category: 'MARKETING',
    label: 'Reactivación suave',
    description: 'Primer recordatorio a quien lleva días sin aparecer. Sin presión.',
    whenSent: 'Al cumplirse los días de inactividad configurados (por defecto 21).',
    variables: [
      { index: 1, label: 'Nombre del cliente', sample: 'Carlos' },
      { index: 2, label: 'Saldo total de puntos', sample: '95' },
      { index: 3, label: 'Premio del próximo nivel', sample: 'Bebida gratis o Mystery Box' },
    ],
  },
  {
    key: 'reactivation_aggressive',
    settingsKey: 'reactivation_aggressive_template_sid',
    baseName: 'reactivacion_agresiva',
    category: 'MARKETING',
    label: 'Reactivación insistente',
    description: 'Segundo intento, con más empuje, para quien sigue sin volver.',
    whenSent: 'Al cumplirse el segundo umbral de inactividad (por defecto 25 días).',
    variables: [
      { index: 1, label: 'Nombre del cliente', sample: 'Daniela' },
      { index: 2, label: 'Saldo total de puntos', sample: '128' },
      { index: 3, label: 'Premio del próximo nivel', sample: 'Bebida gratis o Mystery Box' },
    ],
  },
  {
    key: 'campaign_presencial_to_domicilio',
    settingsKey: 'campaign_presencial_to_domicilio_template_sid',
    baseName: 'campana_presencial_domicilio',
    category: 'MARKETING',
    label: 'Campaña — invitar a pedir a domicilio',
    description: 'Le cuenta al cliente de mesa que también puede pedir a casa y que eso también suma puntos.',
    whenSent: 'Solo cuando lanzas esta campaña manual desde el dashboard.',
    variables: [
      { index: 1, label: 'Nombre del cliente', sample: 'Felipe' },
      { index: 2, label: 'Saldo total de puntos', sample: '78' },
      { index: 3, label: 'Premio del próximo nivel', sample: 'Bebida gratis o Mystery Box' },
    ],
  },
  {
    key: 'campaign_domicilio_to_presencial',
    settingsKey: 'campaign_domicilio_to_presencial_template_sid',
    baseName: 'campana_domicilio_presencial',
    category: 'MARKETING',
    label: 'Campaña — invitar a visitar el local',
    description: 'Invita al cliente de domicilios a vivir la experiencia presencial.',
    whenSent: 'Solo cuando lanzas esta campaña manual desde el dashboard.',
    variables: [
      { index: 1, label: 'Nombre del cliente', sample: 'Laura' },
      { index: 2, label: 'Saldo total de puntos', sample: '95' },
      { index: 3, label: 'Premio del próximo nivel', sample: 'Bebida gratis o Mystery Box' },
    ],
  },
  {
    key: 'event_image',
    settingsKey: 'event_template_image_sid',
    baseName: 'evento_imagen',
    category: 'MARKETING',
    label: 'Invitación a evento — con imagen',
    description: 'Invitación a un evento del calendario: título, fecha y tu llamado a la acción, encabezados por el flyer.',
    whenSent: 'Cuando programas un evento con imagen en el Calendario.',
    variables: EVENT_VARIABLES,
    header: { format: 'image' },
  },
  {
    key: 'event_video',
    settingsKey: 'event_template_video_sid',
    baseName: 'evento_video',
    category: 'MARKETING',
    label: 'Invitación a evento — con video',
    description: 'La misma invitación, palabra por palabra, pero encabezada por un video en vez de una imagen.',
    whenSent: 'Cuando programas un evento con video en el Calendario.',
    variables: EVENT_VARIABLES,
    header: { format: 'video' },
  },
] as const

export const TEMPLATE_CATALOG_BY_KEY = Object.fromEntries(
  TEMPLATE_CATALOG.map((t) => [t.key, t])
) as Record<TemplateKey, CatalogTemplate>

export const TEMPLATE_CATALOG_BY_SETTINGS_KEY = Object.fromEntries(
  TEMPLATE_CATALOG.map((t) => [t.settingsKey, t])
) as Record<string, CatalogTemplate>

export function isTemplateKey(value: string): value is TemplateKey {
  return value in TEMPLATE_CATALOG_BY_KEY
}

/**
 * Texto del banco para una plantilla, con el nombre del negocio y su emoji ya
 * puestos. Es el ÚNICO lugar que convierte el banco en un cuerpo real.
 */
export function buildTemplateBody(
  key: TemplateKey,
  brandName: string,
  emoji: string = FALLBACK_TEMPLATE_EMOJI
): string {
  return TEMPLATE_TEXTS[key](brandName, emoji)
}

/**
 * Valores de ejemplo en orden posicional — lo que Meta pide como `example` al
 * someter la plantilla, y lo que la UI usa para la vista previa.
 */
export function buildTemplateExample(key: TemplateKey, brandName: string): string[] {
  return TEMPLATE_CATALOG_BY_KEY[key].variables.map((v) =>
    v.sample.split(BRAND_TOKEN).join(brandName)
  )
}

/**
 * Vista previa: reemplaza cada `{{n}}` por su valor de muestra. Es lo que ve el
 * dueño mientras edita, para que juzgue el mensaje y no la plantilla.
 */
export function renderTemplatePreview(key: TemplateKey, body: string, brandName: string): string {
  const samples = buildTemplateExample(key, brandName)
  return body.replace(/\{\{(\d+)\}\}/g, (match, digits: string) => {
    const value = samples[Number(digits) - 1]
    return value ?? match
  })
}

/**
 * ¿El texto editado sigue siendo idéntico al del banco? Si sí, la versión es
 * `calido`; si no, pasa a `personalizado` y la pantalla deja de decirle al
 * dueño que está usando el texto estándar cuando ya no lo está usando.
 */
export function detectTemplateStyle(
  key: TemplateKey,
  body: string,
  brandName: string,
  emoji: string = FALLBACK_TEMPLATE_EMOJI
): TemplateVersionStyle {
  const normalized = body.trim()
  if (buildTemplateBody(key, brandName, emoji).trim() === normalized) return DEFAULT_TEMPLATE_STYLE
  return 'personalizado'
}

/** Límite duro de WhatsApp para el cuerpo de una plantilla. */
export const TEMPLATE_BODY_MAX_LENGTH = 1024

/**
 * Reglas que Meta aplica SIEMPRE. Validarlas antes de someter evita quemar un
 * ciclo de aprobación de 24-72h y evita golpes a la reputación del número por
 * rechazos acumulados. Mismo criterio (y mismos mensajes) que ya usa la ruta
 * Twilio en `src/app/api/dashboard/templates/route.ts`.
 *
 * Devuelve la lista de problemas: vacía = el texto es sometible.
 */
export function validateTemplateBody(
  body: string,
  options: { category: string; expectedVariables: number }
): string[] {
  const issues: string[] = []
  const trimmed = body.trim()

  if (!trimmed) {
    return ['El mensaje no puede quedar vacío.']
  }
  if (/^\{\{\d+\}\}/.test(trimmed)) {
    issues.push(
      'El mensaje no puede EMPEZAR con un dato variable — escribe algo antes (ej: "¡Hola {{1}}!").'
    )
  }
  if (/\{\{\d+\}\}$/.test(trimmed)) {
    issues.push(
      'El mensaje no puede TERMINAR con un dato variable — escribe algo después (ej: "...te espera {{3}}. ¡Ven pronto!").'
    )
  }
  if (trimmed.length > TEMPLATE_BODY_MAX_LENGTH) {
    issues.push(
      `Supera el límite de ${TEMPLATE_BODY_MAX_LENGTH} caracteres de WhatsApp (va en ${trimmed.length}).`
    )
  }

  // Las variables tienen que estar TODAS y ser las mismas: el sistema manda
  // exactamente esos valores, en ese orden. Si falta una, el dato se pierde; si
  // sobra una, Meta rechaza por variable sin ejemplo.
  const found = new Set(
    [...trimmed.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))
  )
  const missing: number[] = []
  for (let i = 1; i <= options.expectedVariables; i++) {
    if (!found.has(i)) missing.push(i)
  }
  if (missing.length > 0) {
    issues.push(
      `Faltan datos que el sistema necesita enviar: ${missing.map((n) => `{{${n}}}`).join(', ')}. Vuelve a insertarlos donde quieras que aparezcan.`
    )
  }
  const extra = [...found].filter((n) => n < 1 || n > options.expectedVariables)
  if (extra.length > 0) {
    issues.push(
      `Estos datos no existen para esta plantilla: ${extra.map((n) => `{{${n}}}`).join(', ')}. Quítalos o Meta la rechazará.`
    )
  }

  if (options.category === 'MARKETING' && !trimmed.includes('SALIR')) {
    issues.push(
      'Las plantillas de marketing deben ofrecer una salida. Conserva la línea "Responde SALIR para no recibir más mensajes."'
    )
  }

  return issues
}

// ─────────────────────────────────────────────────────────────
// Nombre de la plantilla en Meta
// ─────────────────────────────────────────────────────────────

/** Regla de Meta para `name`: minúsculas, dígitos y guion bajo. Empieza por letra. */
export const TEMPLATE_NAME_REGEX = /^[a-z][a-z0-9_]*$/
/** Límite de Meta para `name`. */
export const TEMPLATE_NAME_MAX_LENGTH = 512

/**
 * Convierte lo que el dueño tipea en un nombre que Meta acepta: minúsculas,
 * sin tildes, espacios y guiones a `_`, todo lo demás fuera. Se aplica en el
 * campo mientras escribe, para que nunca vea un error por una mayúscula.
 */
export function normalizeTemplateName(raw: string): string {
  return raw
    .normalize('NFD')
    // El rango son los diacríticos combinantes (U+0300–U+036F): quita la tilde
    // que NFD separó de la vocal.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
}

/**
 * Por qué un nombre NO sirve para Meta, en palabras del dueño. Vacía = sirve.
 * Lo que NO chequea es si ya está usado: eso lo sabe solo el servidor
 * (`template_versions` + punteros) y, en última instancia, la WABA.
 */
export function validateTemplateName(name: string): string[] {
  const trimmed = name.trim()
  if (!trimmed) return ['El nombre no puede quedar vacío.']
  const issues: string[] = []
  if (!TEMPLATE_NAME_REGEX.test(trimmed)) {
    issues.push(
      'WhatsApp solo acepta letras minúsculas, números y guion bajo, y el nombre tiene que empezar por una letra (ej: bienvenida_2).'
    )
  }
  if (trimmed.length > TEMPLATE_NAME_MAX_LENGTH) {
    issues.push(`Supera el límite de ${TEMPLATE_NAME_MAX_LENGTH} caracteres de WhatsApp.`)
  }
  return issues
}

/**
 * Auto-chequeo del banco: verifica los 13 textos contra las mismas reglas que
 * aplicamos a una edición del dueño. Existe para que un texto nuevo mal escrito
 * falle en un test (tests/template-catalog.test.ts) y no en una respuesta de
 * Meta 48 horas después.
 */
export function assertCatalogTextsAreValid(
  brandName = 'Mi Negocio',
  emoji = FALLBACK_TEMPLATE_EMOJI
): string[] {
  const problems: string[] = []
  for (const definition of TEMPLATE_CATALOG) {
    const body = buildTemplateBody(definition.key, brandName, emoji)
    const issues = validateTemplateBody(body, {
      category: definition.category,
      expectedVariables: definition.variables.length,
    })
    for (const issue of issues) {
      problems.push(`${definition.key}: ${issue}`)
    }
  }
  return problems
}
