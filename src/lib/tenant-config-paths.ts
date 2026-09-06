/**
 * La whitelist de `tenants.config` — qué puede tocar el panel, y cómo se valida.
 *
 * Vive fuera de la ruta para poder probarse sin levantar Next ni Supabase
 * (`tests/unit/tenant-config-paths.test.ts`). Mandamiento II: acá no hay HTTP.
 *
 * ⚠️ `tenants.config` es UN SOLO jsonb con TODO lo del tenant. Un PUT que lo
 * reemplazara entero borraría la marca del cliente de un plumazo. Por eso nunca
 * se escribe el objeto: se escribe una RUTA a la vez, y solo si está en esta
 * lista. Ampliarla es una decisión consciente, no un efecto secundario.
 *
 * POR QUÉ RUTAS Y NO CLAVES. Hasta §5/§6 la lista era `['google_maps_url']` —
 * claves del primer nivel. Lo nuevo vive en espacios con nombre
 * (`branding.primary`, `qr_studio.theme`), así que la unidad de permiso pasa a
 * ser la ruta `espacio.clave`. Ver el comentario largo de `TenantConfig`.
 *
 * LO QUE NO ESTÁ ACÁ, A PROPÓSITO: `integrations.*`. El día que el restaurante
 * conecte su cuenta de Google o de Meta, ese espacio NO se abre agregando una
 * línea a esta lista — lo escribe su propio flujo de OAuth, y los tokens ni
 * siquiera viven en `config`.
 */

import { isHexColor } from './brand-palette'

/** Resultado de validar un valor: o el texto ya normalizado, o el error a devolver. */
export type PathValidation = { ok: true; value: string | number } | { ok: false; error: string }

interface EditablePath {
  /** `clave` o `espacio.clave`. Máximo dos niveles: es todo lo que el panel edita. */
  path: string
  validate: (raw: unknown) => PathValidation
}

// ─── Validadores ─────────────────────────────────────────────────────────────

/** Texto libre acotado. El vacío SIEMPRE es válido: es como el panel "borra". */
function freeText(maxLength: number) {
  return (raw: unknown): PathValidation => {
    if (typeof raw !== 'string') return { ok: false, error: 'debe ser texto' }
    const v = raw.trim()
    if (v.length > maxLength) return { ok: false, error: `no puede pasar de ${maxLength} caracteres` }
    return { ok: true, value: v }
  }
}

function hexColor(raw: unknown): PathValidation {
  if (typeof raw !== 'string') return { ok: false, error: 'debe ser texto' }
  const v = raw.trim()
  // Vacío = "volver al color del sistema de diseño". Es una opción legítima del
  // panel, no un error: el resolver trata '' igual que ausente.
  if (v === '') return { ok: true, value: '' }
  if (!isHexColor(v)) return { ok: false, error: 'debe ser un color hex (#RRGGBB)' }
  return { ok: true, value: v.toLowerCase().startsWith('#') ? v.toLowerCase() : `#${v.toLowerCase()}` }
}

function httpUrl(raw: unknown): PathValidation {
  if (typeof raw !== 'string') return { ok: false, error: 'debe ser texto' }
  const v = raw.trim()
  if (v === '') return { ok: true, value: '' }
  if (!/^https?:\/\//i.test(v)) return { ok: false, error: 'debe empezar por http:// o https://' }
  return { ok: true, value: v }
}

/**
 * Gradiente CSS literal. Se acepta muy poco a propósito: esto termina en un
 * `style={{ background: … }}`, así que se restringe a `linear-gradient(...)` y
 * se prohíbe todo lo que pueda salir de ahí (`url(`, `;`, `expression`).
 */
function cssGradient(raw: unknown): PathValidation {
  if (typeof raw !== 'string') return { ok: false, error: 'debe ser texto' }
  const v = raw.trim()
  if (v === '') return { ok: true, value: '' }
  if (v.length > 300) return { ok: false, error: 'no puede pasar de 300 caracteres' }
  if (!/^(linear|radial)-gradient\([^;{}]*\)$/i.test(v)) {
    return { ok: false, error: 'debe ser un linear-gradient(...) o radial-gradient(...)' }
  }
  if (/url\s*\(|expression|javascript:|@import/i.test(v)) {
    return { ok: false, error: 'contiene una construcción no permitida' }
  }
  return { ok: true, value: v }
}

/** Uno de una lista cerrada. Para los ids de tema y tamaño del QR Studio. */
function oneOf(allowed: readonly string[]) {
  return (raw: unknown): PathValidation => {
    if (typeof raw !== 'string') return { ok: false, error: 'debe ser texto' }
    const v = raw.trim()
    if (!allowed.includes(v)) return { ok: false, error: `debe ser uno de: ${allowed.join(', ')}` }
    return { ok: true, value: v }
  }
}

function integerBetween(min: number, max: number) {
  return (raw: unknown): PathValidation => {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: 'debe ser un número entero' }
    if (n < min || n > max) return { ok: false, error: `debe estar entre ${min} y ${max}` }
    return { ok: true, value: n }
  }
}

// ─── La lista ────────────────────────────────────────────────────────────────

/**
 * Ids válidos de tema y tamaño del póster QR.
 *
 * ⚠️ Espejo de `QR_THEMES` y `QR_SIZES` en `src/lib/utils/qr-poster.ts`: se
 * cambian los dos lados o ninguno. No se importan de ahí porque ese módulo
 * dibuja sobre un `<canvas>` del navegador y esto corre en el server.
 * Hay un test que compara ambas listas (`tests/unit/tenant-config-paths.test.ts`).
 */
export const QR_THEME_IDS = [
  'restaurante', 'barberia', 'cafe', 'bar', 'pizzeria', 'sushi', 'postres', 'elegante',
] as const
export const QR_SIZE_IDS = ['mesa', 'cuadrado', 'a5', 'a4', 'a3'] as const

const EDITABLE_PATHS: readonly EditablePath[] = [
  // Reseñas de Google — la única clave editable antes de §5/§6. Sigue plana.
  { path: 'google_maps_url', validate: httpUrl },

  // §6 — identidad visual de la marca.
  { path: 'branding.logo_url', validate: httpUrl },
  { path: 'branding.primary', validate: hexColor },
  { path: 'branding.primary_end', validate: hexColor },
  { path: 'branding.surface', validate: hexColor },
  { path: 'branding.ink', validate: hexColor },
  { path: 'branding.card_bg', validate: cssGradient },
  { path: 'branding.page_bg', validate: cssGradient },

  // §3 — config del QR Studio, antes solo en localStorage.
  { path: 'qr_studio.theme', validate: oneOf(QR_THEME_IDS) },
  { path: 'qr_studio.size', validate: oneOf(QR_SIZE_IDS) },
  { path: 'qr_studio.accent', validate: hexColor },
  { path: 'qr_studio.headline', validate: freeText(40) },
  { path: 'qr_studio.subline', validate: freeText(70) },
  { path: 'qr_studio.tables', validate: integerBetween(1, 200) },
]

/** Todas las rutas editables, en orden. Lo usa el GET para armar la respuesta. */
export const EDITABLE_PATH_NAMES: readonly string[] = EDITABLE_PATHS.map((p) => p.path)

const BY_PATH = new Map(EDITABLE_PATHS.map((p) => [p.path, p]))

export function isEditablePath(path: string): boolean {
  return BY_PATH.has(path)
}

export type ConfigPatch = Record<string, unknown>

export type BuildPatchResult =
  | { ok: true; patch: ConfigPatch; paths: string[] }
  | { ok: false; error: string }

/**
 * Convierte un cuerpo plano de rutas (`{"branding.primary": "#0a7c4a"}`) en el
 * patch ANIDADO que espera `merge_tenant_config_deep()`
 * (`{"branding": {"primary": "#0a7c4a"}}`).
 *
 * Las rutas que no están en la whitelist se IGNORAN en silencio — mismo criterio
 * que tenía la lista de claves: el panel manda lo que sabe mandar, y una clave
 * de más no es motivo para rechazar el resto. Un valor MAL FORMADO sí corta.
 */
export function buildConfigPatch(body: Record<string, unknown>): BuildPatchResult {
  const patch: ConfigPatch = {}
  const paths: string[] = []

  for (const [path, raw] of Object.entries(body)) {
    const spec = BY_PATH.get(path)
    if (!spec) continue

    const result = spec.validate(raw)
    if (!result.ok) {
      return { ok: false, error: `${path}: ${result.error}` }
    }

    const [head, tail] = path.split('.')
    if (tail === undefined) {
      patch[head] = result.value
    } else {
      const space = (patch[head] as ConfigPatch | undefined) ?? {}
      space[tail] = result.value
      patch[head] = space
    }
    paths.push(path)
  }

  if (paths.length === 0) {
    return { ok: false, error: 'No hay nada editable en la petición' }
  }
  return { ok: true, patch, paths }
}

/**
 * Proyecta la config guardada a la forma plana por rutas que consume el panel.
 * Solo devuelve lo editable: el resto de `config` no es asunto de este endpoint.
 */
export function projectEditablePaths(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const { path } of EDITABLE_PATHS) {
    const [head, tail] = path.split('.')
    if (tail === undefined) {
      out[path] = config[head]
    } else {
      const space = config[head]
      out[path] = space && typeof space === 'object' ? (space as Record<string, unknown>)[tail] : undefined
    }
  }
  return out
}
