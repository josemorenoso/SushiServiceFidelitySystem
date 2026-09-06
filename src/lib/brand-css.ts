/**
 * Puente entre la marca resuelta y el CSS de las pantallas públicas (§5).
 *
 * EL PROBLEMA
 * ───────────
 * La "piel" de la pantalla del teléfono no está en ningún componente: vive en
 * cuatro clases globales de `globals.css` (`.premium-bg`, `.premium-card`,
 * `.btn-premium`, `.input-premium`) con los hex del sistema de diseño horneados.
 * Son las mismas para los 25 tenants. Un componente no puede pisarlas: la clase
 * lleva `!important` justamente para ganarle a Tailwind.
 *
 * LA SOLUCIÓN
 * ───────────
 * Las clases pasan a leer variables CSS (`--brand-*`), definidas en `:root` con
 * EXACTAMENTE los valores de hoy. El root layout estampa en `<html>` solo las
 * variables que este tenant cambió. Resultado:
 *
 *   · tenant sin marca propia  → `:root` gana → pixel por pixel lo de siempre
 *   · tenant con marca propia  → su valor gana en TODA pantalla que use las
 *     clases premium, sin tocar un solo componente
 *
 * Es también lo que hace que el sistema de diseño siga siendo el sistema: lo
 * que se agrega no es una paleta nueva, es la capacidad de sustituir la nuestra.
 */

import type { CSSProperties } from 'react'
import type { Branding } from './branding'
import { DEFAULT_BRANDING } from './branding'
import { hexToRgb } from './brand-palette'

/** `#RRGGBB` → `"r, g, b"`, que es lo que necesita un `rgba(var(--x), 0.28)`. */
function rgbChannels(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  return `${r}, ${g}, ${b}`
}

/**
 * Variables CSS de la marca, listas para `<html style={...}>`.
 *
 * Solo emite lo que este tenant cambió respecto del sistema de diseño. Un tenant
 * sin marca propia recibe `{}` y hereda `:root` entero — así el HTML de las 25
 * marcas no engorda con valores que ya están en la hoja de estilos.
 */
export function brandCssVars(branding: Branding): CSSProperties {
  const vars: Record<string, string> = {}

  if (branding.primary !== DEFAULT_BRANDING.primary) {
    vars['--brand-primary'] = branding.primary
    vars['--brand-primary-rgb'] = rgbChannels(branding.primary)
  }
  if (branding.primaryEnd !== DEFAULT_BRANDING.primaryEnd) {
    vars['--brand-primary-end'] = branding.primaryEnd
    vars['--brand-primary-end-rgb'] = rgbChannels(branding.primaryEnd)
  }
  if (branding.onPrimary !== DEFAULT_BRANDING.onPrimary) {
    vars['--brand-on-primary'] = branding.onPrimary
  }
  if (branding.surface !== DEFAULT_BRANDING.surface) {
    vars['--brand-surface'] = branding.surface
  }
  if (branding.ink !== DEFAULT_BRANDING.ink) {
    vars['--brand-ink'] = branding.ink
  }

  return vars as CSSProperties
}
