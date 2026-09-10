/**
 * Layout de las páginas públicas — las que ve un cliente o un mesero sin sesión
 * del panel: check-in, tarjeta, la política de privacidad y las del mesero.
 *
 * Existe por UNA sola razón: el píxel de Meta. Todo lo demás (fuentes, colores
 * de la marca, `BrandingProvider`) sigue viniendo del layout raíz, que es de
 * TODA la app. El píxel no puede vivir ahí porque el panel del restaurante no
 * se mide: ahí no hay clientes, hay empleados trabajando.
 *
 * Sin `NEXT_PUBLIC_META_PIXEL_ID` y sin píxel propio de la marca, `<MetaPixel>`
 * devuelve `null` y este layout es un envoltorio vacío.
 *
 * Ref: docs/features/meta-pixel.md
 */

import { MetaPixel, MetaPixelNote } from '@/components/features/analytics'
import { getMetaPixelForHost } from '@/lib/meta-pixel-server'

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { pixelIds, context } = await getMetaPixelForHost()

  return (
    <>
      <MetaPixel pixelIds={pixelIds} context={context} />
      {children}
      <MetaPixelNote active={pixelIds.length > 0} />
    </>
  )
}
