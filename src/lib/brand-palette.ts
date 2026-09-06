/**
 * Aritmética de color de la marca — §5/§6.
 *
 * Mandamiento II: acá NO hay ni un componente ni una decisión de negocio. Solo
 * funciones PURAS que convierten "el color que eligió el restaurante" en los
 * valores concretos que necesitan la pantalla del teléfono, la tarjeta y el QR.
 *
 * POR QUÉ ESTO EXISTE Y NO SON DOS INPUTS MÁS
 * ────────────────────────────────────────────
 * El dueño de un restaurante elige UN color. No sabe (ni tiene por qué) que la
 * tarjeta necesita un gradiente de 4 paradas, que el ✓ del sello va más oscuro
 * que el fondo, que el texto sobre el botón a veces tiene que ser negro, y que
 * un QR con poco contraste no lo lee ninguna cámara. Todo eso se deriva de su
 * color, acá, una sola vez.
 *
 * EL DEFAULT NO SE TOCA. `deriveCardGradient()` sobre el rojo de marca
 * (#FF4D6D → #E63946) devuelve casi exactamente el gradiente literal que la
 * tarjeta tiene hoy — hay una prueba que lo fija (`tests/unit/brand-palette.test.ts`).
 * Aun así, un tenant SIN color propio recibe el literal de siempre, no el
 * derivado: nadie que no haya pedido un cambio ve un cambio.
 *
 * Ref: docs/features/identidad-visual.md · docs/features/design-system.md
 */

/** Texto más oscuro del sistema de diseño. Nunca negro puro (regla 2). */
export const INK = '#1a1c1d'

export interface Rgb {
  r: number
  g: number
  b: number
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * Normaliza a `#rrggbb` en minúscula. Devuelve `null` si no es un hex válido —
 * un `null` acá es lo que hace que la config del tenant caiga al default en vez
 * de pintar `background: undefined` y dejar la tarjeta transparente.
 */
export function normalizeHex(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const m = HEX_RE.exec(value.trim())
  if (!m) return null
  const body = m[1].toLowerCase()
  if (body.length === 3) {
    return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`
  }
  return `#${body}`
}

export function isHexColor(value: string | null | undefined): boolean {
  return normalizeHex(value) !== null
}

export function hexToRgb(hex: string): Rgb {
  const norm = normalizeHex(hex)
  if (!norm) throw new Error(`Color hex inválido: ${hex}`)
  return {
    r: parseInt(norm.slice(1, 3), 16),
    g: parseInt(norm.slice(3, 5), 16),
    b: parseInt(norm.slice(5, 7), 16),
  }
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const hex = (n: number) => clampByte(n).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

/**
 * Mezcla lineal hacia negro (`amount < 0`) o hacia blanco (`amount > 0`).
 * `amount` va en [-1, 1]; ±1 es negro/blanco puro.
 */
export function shade(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const t = Math.max(-1, Math.min(1, amount))
  const mix = (c: number) => (t < 0 ? c * (1 + t) : c + (255 - c) * t)
  return rgbToHex({ r: mix(r), g: mix(g), b: mix(b) })
}

/** Luminancia relativa WCAG 2.1. 0 = negro, 1 = blanco. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Razón de contraste WCAG entre dos colores. Va de 1 a 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Piso de contraste por debajo del cual el blanco deja de ser una opción.
 *
 * 3:1 es el mínimo que WCAG 2.1 pide para componentes de interfaz y texto
 * grande (1.4.11 / 1.4.3). No es el 4.5:1 del texto normal a propósito — ver
 * `onColor()`.
 */
const WHITE_FLOOR = 3

/**
 * Color de texto legible ENCIMA de `hex`: blanco o la tinta del sistema.
 *
 * Sin esto, un restaurante que elige amarillo o menta se queda con el
 * `color: #ffffff !important` de `.btn-premium` y su CTA principal deja de
 * leerse (blanco sobre #FFD60A da 1.4:1 — no se lee, punto).
 *
 * ⚠️ NO devuelve simplemente "el que más contraste da", y la razón es concreta:
 * sobre el rojo de la casa (#FF4D6D) el blanco da 3.2:1 y la tinta 5.3:1, así
 * que el máximo contraste diría "negro". Pero el CTA blanco sobre gradiente rojo
 * ES el sistema de diseño (regla 5, "gradientes en CTAs"), está en producción y
 * ningún dueño pidió cambiarlo. Un tenant que eligiera exactamente ese mismo
 * rojo vería un botón DISTINTO del de un tenant que no eligió nada — una
 * incoherencia que no la ve nadie más que nosotros y que confunde a todos.
 *
 * Así que la regla es: se respeta el blanco del sistema mientras siga siendo
 * legible, y se cambia a tinta solo cuando deja de serlo. El panel avisa aparte
 * cuando el par elegido queda por debajo de 4.5:1 (`/dashboard/marca`), que es
 * donde esa conversación corresponde: con el dueño, antes de guardar.
 */
export function onColor(hex: string): string {
  if (contrastRatio('#ffffff', hex) >= WHITE_FLOOR) return '#ffffff'
  return contrastRatio(INK, hex) > contrastRatio('#ffffff', hex) ? INK : '#ffffff'
}

/**
 * Versión del color suficientemente oscura para dibujar un QR sobre blanco.
 *
 * El estándar pide ~40 % de diferencia de reflectancia entre módulo y fondo;
 * apuntamos a 7:1 contra blanco, que es AAA de texto y deja margen para
 * impresión barata y cámaras malas. Si el color ya cumple, se devuelve tal cual.
 */
export function qrSafe(hex: string): string {
  let out = normalizeHex(hex) ?? INK
  for (let i = 0; i < 20 && contrastRatio('#ffffff', out) < 7; i++) {
    out = shade(out, -0.1)
  }
  return out
}

/**
 * Gradiente de la TARJETA a partir del par (principal, secundario).
 *
 * Las cuatro paradas replican la forma del gradiente literal que la tarjeta
 * tiene desde v2.1.0: muy oscuro → oscuro → el color → un realce claro.
 */
export function deriveCardGradient(primary: string, primaryEnd: string): string {
  const deep = shade(primaryEnd, -0.55)
  const mid = shade(primaryEnd, -0.2)
  const glow = shade(primary, 0.12)
  return `linear-gradient(160deg, ${deep} 0%, ${mid} 35%, ${normalizeHex(primaryEnd)} 75%, ${glow} 100%)`
}

/**
 * Gradiente del FONDO de página detrás de la tarjeta: la misma familia, mucho
 * más apagada, para que la tarjeta flote en vez de fundirse con el fondo.
 */
export function derivePageGradient(primaryEnd: string): string {
  return [
    'linear-gradient(160deg, ',
    `${shade(primaryEnd, -0.8)} 0%, `,
    `${shade(primaryEnd, -0.62)} 50%, `,
    `${shade(primaryEnd, -0.4)} 100%)`,
  ].join('')
}

/**
 * Segundo tono sugerido cuando el restaurante solo eligió UNO.
 *
 * El par por defecto (#FF4D6D → #E63946) es el color un 12 % más oscuro y algo
 * menos rosado; esta es esa misma relación, aplicada a cualquier color.
 */
export function deriveGradientEnd(primary: string): string {
  return shade(primary, -0.12)
}

/** Color del ✓ dentro de un sello lleno: el secundario, bien oscurecido. */
export function deriveStampCheck(primaryEnd: string): string {
  return shade(primaryEnd, -0.25)
}
