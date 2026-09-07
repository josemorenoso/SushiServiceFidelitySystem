/**
 * El QR imprimible, en vector.
 *
 * POR QUÉ EXISTE ESTE MÓDULO Y NO SE AMPLIÓ `qr-poster.ts`
 * ────────────────────────────────────────────────────────
 * `qr-poster.ts` dibuja un PÓSTER sobre un `<canvas>`: tema, patrón de emojis,
 * titular, logo. Eso quedó EN PAUSA (D-QR-3, `docs/DECISIONES-QR-Y-SEDE-2026-09-06.md`):
 * *"la gente no va a imprimir con los diseños, es muy básico"*. El póster no se
 * borra —ni el módulo ni la config `qr_studio.*` de los tenants que ya la tienen—
 * pero deja de ser lo que esta pantalla ofrece.
 *
 * Lo que reemplaza es esto: **un QR y nada más, en SVG**. Un vector no tiene
 * resolución, así que el mismo archivo sirve para un sticker de 5 cm y para una
 * pancarta de 3 m. Ese era el pedido literal del dueño: *"imprimir un QR SVG
 * para distintos diseños de cualquier tamaño"*.
 *
 * TRES DECISIONES QUE PARECEN ESTÉTICAS Y NO LO SON
 * ────────────────────────────────────────────────
 *   1. **Negro sobre blanco.** Es el contraste máximo y lo que mejor imprime
 *      cualquier imprenta. El color de la marca vive en el DISEÑO que rodea al
 *      QR, no en el QR: un acento claro sobre fondo claro es un código que no
 *      escanea, y eso no se descubre hasta que el cartel ya está pegado.
 *   2. **Corrección de errores `H`** (recupera ~30% del código). No es paranoia:
 *      es lo que deja meter un logo en el centro sin romperlo. El rediseño
 *      visual está fuera de alcance, pero el archivo ya sale preparado para que
 *      el diseñador lo haga en su herramienta.
 *   3. **Margen de 4 módulos.** Es la *quiet zone* que exige la norma del QR.
 *      Recortarla es la causa número uno de un QR impreso que no escanea.
 *
 * Sin dependencias nuevas: `qrcode` ya estaba en el proyecto.
 */

import QRCode from 'qrcode'

/**
 * Una sede, tal como la dibuja el QR Studio.
 *
 * Vive acá y no en el `route.ts` que la sirve porque la consumen los DOS lados
 * (la ruta la produce, la pantalla la pinta) y un `route.ts` de Next no es sitio
 * para exportar nada que no sea un handler.
 *
 * `domain` es el campo por el que existe todo esto: es el subdominio de la sede,
 * y sin subdominio no hay QR (ver `checkInUrlForDomain`).
 */
export interface QrLocation {
  id: string
  name: string
  slug: string | null
  domain: string | null
  is_primary: boolean
}

/** Corrección de errores alta: ~30% recuperable, sitio para un logo al centro. */
const ERROR_CORRECTION = 'H' as const

/** Quiet zone en módulos. La norma pide 4; menos es un QR que no escanea impreso. */
const MARGIN_MODULES = 4

/**
 * Lado del SVG en milímetros. NO limita nada —un vector escala sin pérdida—
 * pero hace que el archivo se abra a un tamaño físico razonable en Illustrator,
 * Canva o Word en vez de a 3 px. 100 mm = 10 cm, un QR de mesa.
 */
const DEFAULT_SIDE_MM = 100

/** Lado del PNG de respaldo, en píxeles. A 300 DPI son 16,9 cm de lado. */
export const PNG_SIDE_PX = 2000

/**
 * El QR de una URL, como SVG listo para descargar.
 *
 * El `<svg>` sale con `width`/`height` en MILÍMETROS **y** con su `viewBox`
 * intacto: las dos cosas juntas. Solo el `viewBox` deja el archivo a merced de
 * cómo lo interprete cada programa; solo `width`/`height` lo vuelve rígido.
 */
export async function buildQrSvg(url: string, sideMm: number = DEFAULT_SIDE_MM): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: ERROR_CORRECTION,
    margin: MARGIN_MODULES,
    color: { dark: '#000000', light: '#ffffff' },
  })
  return withPhysicalSize(svg, sideMm)
}

/**
 * Le pone medidas físicas al `<svg>` que devuelve la librería.
 *
 * Se hace con una sustitución sobre la etiqueta de apertura y no con un parser
 * de XML a propósito: la entrada no es HTML arbitrario, es la salida de UNA
 * librería con un formato fijo. Si algún día cambia y la etiqueta no encaja, se
 * devuelve el SVG tal cual — un archivo que abre a un tamaño raro sigue siendo
 * un archivo válido y escaneable; lanzar acá dejaría al dueño sin su QR.
 */
function withPhysicalSize(svg: string, sideMm: number): string {
  const openTag = svg.match(/<svg\b[^>]*>/)
  if (!openTag) return svg

  let tag = openTag[0]
  // Fuera las medidas que traiga (la librería las pone en px cuando se le pasa
  // `width`), para no terminar con el atributo dos veces.
  tag = tag.replace(/\s(width|height)="[^"]*"/g, '')
  tag = tag.replace(
    /^<svg\b/,
    `<svg width="${sideMm}mm" height="${sideMm}mm"`
  )
  if (!/\bxmlns=/.test(tag)) {
    tag = tag.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  return svg.replace(openTag[0], tag)
}

/**
 * El mismo QR en PNG, para la imprenta que no acepta vectores.
 *
 * Existe por decisión explícita del dueño (D-QR-3): *"no todo el mundo sabe qué
 * hacer con un SVG"*. Es el MISMO código —mismo margen, misma corrección de
 * errores—, no el póster viejo: sin tema, sin textos y sin logo.
 */
export function buildQrPngDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: ERROR_CORRECTION,
    margin: MARGIN_MODULES,
    width: PNG_SIDE_PX,
    color: { dark: '#000000', light: '#ffffff' },
  })
}

/**
 * La URL de check-in de una sede a partir de su subdominio.
 *
 * ⚠️ **La sede sale del HOST, nunca de un parámetro.** No existe ni va a existir
 * `?sede=` (D-QR-1). Por eso lo único que hace falta acá es el `domain` de la
 * sede: `laureles.marca.com` → `https://laureles.marca.com/check-in`.
 *
 * Una sede sin `domain` devuelve `null`, y la pantalla NO ofrece su QR. Con 2+
 * sedes activas el dominio raíz responde 409 al registrar
 * (`pickLocationForHost()`, `src/lib/location-resolver.ts`): un QR impreso sobre
 * el dominio raíz sería un cartel que no registra clientes nuevos, y eso no se
 * descubre hasta que ya está en la pared.
 */
export function checkInUrlForDomain(domain: string | null | undefined): string | null {
  const host = domain?.trim().toLowerCase()
  if (!host) return null
  return `https://${host}/check-in`
}
