/**
 * La aritmética de color de la marca y el resolver que la consume (§5/§6).
 *
 * Lo que estas pruebas defienden, en orden de importancia:
 *
 *   1. **Un tenant sin color propio no cambia de aspecto.** Es la promesa de
 *      toda la feature: se agrega la capacidad de poner una paleta, no una
 *      paleta nueva. Si esto se rompe, se rompe para los 25 clientes a la vez.
 *   2. **Un color claro no deja el CTA ilegible ni el QR sin leer.** Son las dos
 *      formas concretas en que "elegí mi color" puede romper el producto para el
 *      cliente final, y las dos se resuelven sin preguntarle nada al dueño.
 *   3. **Un valor basura en `config` no tumba una pantalla pública.** La config
 *      se puede editar por SQL: un `primary: "rojo"` tiene que caer al default,
 *      no dejar la tarjeta con `background: undefined`.
 */

import { describe, it, expect } from 'vitest'
import {
  INK,
  contrastRatio,
  deriveCardGradient,
  deriveGradientEnd,
  derivePageGradient,
  deriveStampCheck,
  hexToRgb,
  isHexColor,
  normalizeHex,
  onColor,
  qrSafe,
  relativeLuminance,
  rgbToHex,
  shade,
} from '@/lib/brand-palette'
import { DEFAULT_BRANDING, resolveBranding } from '@/lib/branding'
import { brandCssVars } from '@/lib/brand-css'
import type { TenantConfig } from '@/types/tenant.types'

describe('normalizeHex', () => {
  it('acepta las tres formas que escribe un humano', () => {
    expect(normalizeHex('#FF4D6D')).toBe('#ff4d6d')
    expect(normalizeHex('ff4d6d')).toBe('#ff4d6d')
    expect(normalizeHex('  #F00  ')).toBe('#ff0000')
  })

  it('devuelve null ante cualquier cosa que no sea un hex', () => {
    // Cada uno de estos llegó alguna vez a un campo de color de algún producto.
    for (const bad of ['rojo', '#12345', 'rgb(1,2,3)', '#GGGGGG', '', '   ', null, undefined]) {
      expect(normalizeHex(bad as string)).toBeNull()
    }
    expect(isHexColor('#0a7c4a')).toBe(true)
    expect(isHexColor('javascript:alert(1)')).toBe(false)
  })
})

describe('shade', () => {
  it('±1 llega a negro y a blanco', () => {
    expect(shade('#ff4d6d', -1)).toBe('#000000')
    expect(shade('#ff4d6d', 1)).toBe('#ffffff')
  })

  it('0 no cambia nada', () => {
    expect(shade('#e63946', 0)).toBe('#e63946')
  })

  it('ida y vuelta por rgb no pierde el color', () => {
    expect(rgbToHex(hexToRgb('#0a7c4a'))).toBe('#0a7c4a')
  })
})

describe('relativeLuminance / contrastRatio', () => {
  it('los extremos de la escala WCAG', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    // 21:1 es el contraste máximo posible.
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#ff4d6d', '#ff4d6d')).toBeCloseTo(1, 5)
  })
})

describe('onColor — el texto del botón', () => {
  it('sobre el rojo de marca sigue siendo blanco', () => {
    // Si esto cambia, TODOS los CTA del producto cambian de color de texto.
    expect(onColor('#ff4d6d')).toBe('#ffffff')
    expect(onColor('#e63946')).toBe('#ffffff')
  })

  it('sobre un amarillo o un menta pasa a tinta', () => {
    // Es el caso que hace falta cubrir: sin esto, un restaurante con color claro
    // se queda con texto blanco sobre amarillo y su botón principal no se lee.
    expect(onColor('#ffd60a')).toBe(INK)
    expect(onColor('#a7f3d0')).toBe(INK)
  })

  it('el texto elegido nunca baja de 3:1, que es el piso de WCAG para un botón', () => {
    for (const color of ['#ffd60a', '#a7f3d0', '#0a7c4a', '#1d3557', '#ff4d6d', '#808080', '#ffffff', '#000000']) {
      expect(contrastRatio(onColor(color), color)).toBeGreaterThanOrEqual(3)
    }
  })

  it('cuando el blanco es viable se queda el blanco, aunque la tinta contraste más', () => {
    // Es la decisión explicada en `onColor()`: sobre el rojo de la casa la tinta
    // da 5.3:1 contra 3.2:1 del blanco, y aun así gana el blanco — porque ese es
    // el CTA que el producto tiene en producción. Cambiarlo por aritmética sería
    // rediseñar el sistema de diseño de rebote.
    expect(contrastRatio(INK, '#ff4d6d')).toBeGreaterThan(contrastRatio('#ffffff', '#ff4d6d'))
    expect(onColor('#ff4d6d')).toBe('#ffffff')
  })
})

describe('qrSafe — que la cámara pueda leer el QR', () => {
  it('un color claro se oscurece hasta 7:1 contra el blanco', () => {
    for (const color of ['#ffd60a', '#a7f3d0', '#fca5a5', '#ffffff']) {
      expect(contrastRatio('#ffffff', qrSafe(color))).toBeGreaterThanOrEqual(7)
    }
  })

  it('un color que ya cumple no se toca', () => {
    expect(qrSafe('#1d3557')).toBe('#1d3557')
  })
})

describe('los gradientes derivados', () => {
  it('derivar desde el rojo de marca reproduce la familia del gradiente literal', () => {
    // No se pide igualdad exacta: el literal de la tarjeta se eligió a ojo en
    // v2.1.0. Lo que se fija es que la derivación caiga en la misma familia, que
    // es lo que hace que un tenant con color propio se vea "como el producto" y
    // no como otra cosa.
    const card = deriveCardGradient('#ff4d6d', '#e63946')
    expect(card).toContain('#e63946')
    expect(card.startsWith('linear-gradient(160deg,')).toBe(true)

    const page = derivePageGradient('#e63946')
    expect(page.startsWith('linear-gradient(160deg,')).toBe(true)

    // Cada parada del fondo de página es más oscura que la anterior: es lo que
    // hace que la tarjeta flote en vez de fundirse con el fondo.
    const stops = page.match(/#[0-9a-f]{6}/g) ?? []
    expect(stops).toHaveLength(3)
    const lums = stops.map(relativeLuminance)
    expect(lums[0]).toBeLessThan(lums[1])
    expect(lums[1]).toBeLessThan(lums[2])
    // Y todo el fondo es más oscuro que el color de marca.
    expect(lums[2]).toBeLessThan(relativeLuminance('#e63946'))
  })

  it('el segundo tono sugerido es más oscuro que el principal', () => {
    const end = deriveGradientEnd('#0a7c4a')
    expect(relativeLuminance(end)).toBeLessThan(relativeLuminance('#0a7c4a'))
  })

  it('el ✓ del sello es más oscuro que el fondo del que sale', () => {
    // El sello lleno es blanco y el ✓ va encima: necesita ser oscuro o desaparece.
    expect(relativeLuminance(deriveStampCheck('#0a7c4a'))).toBeLessThan(relativeLuminance('#0a7c4a'))
  })
})

describe('resolveBranding — un tenant SIN marca propia', () => {
  const withoutBrand: TenantConfig[] = [
    { brand_name: 'Sushi Service' },
    { brand_name: 'Sushi Service', branding: {} },
    { brand_name: 'Sushi Service', branding: { primary: '', primary_end: '' } },
    // Basura: alguien editó `config` por SQL y escribió cualquier cosa.
    { brand_name: 'Sushi Service', branding: { primary: 'rojo', ink: '#12345' } },
  ]

  it.each(withoutBrand)('se ve exactamente como antes de §5/§6 (%#)', (config) => {
    const b = resolveBranding(config)
    expect(b.primary).toBe(DEFAULT_BRANDING.primary)
    expect(b.primaryEnd).toBe(DEFAULT_BRANDING.primaryEnd)
    expect(b.onPrimary).toBe('#ffffff')
    expect(b.surface).toBe(DEFAULT_BRANDING.surface)
    expect(b.ink).toBe(DEFAULT_BRANDING.ink)
    expect(b.cardBg).toBe(DEFAULT_BRANDING.cardBg)
    expect(b.pageBg).toBe(DEFAULT_BRANDING.pageBg)
    // El ✓ del sello era el literal '#C1121F' antes de la refactorización.
    expect(b.stampCheck.toLowerCase()).toBe('#c1121f')
    expect(b.logoUrl).toBeNull()
  })

  it('y no estampa ni una variable CSS: hereda el :root de globals.css', () => {
    expect(brandCssVars(resolveBranding({ brand_name: 'x' }))).toEqual({})
  })

  it('las claves planas de siempre (`card_bg` / `page_bg`) se siguen respetando', () => {
    // Las siembra `scripts/seed-new-tenant.sql`. Ignorarlas cambiaría el aspecto
    // de cualquier tenant dado de alta antes de esta sesión.
    const b = resolveBranding({
      brand_name: 'x',
      card_bg: 'linear-gradient(160deg, #111 0%, #222 100%)',
      page_bg: 'linear-gradient(160deg, #001 0%, #002 100%)',
    })
    expect(b.cardBg).toBe('linear-gradient(160deg, #111 0%, #222 100%)')
    expect(b.pageBg).toBe('linear-gradient(160deg, #001 0%, #002 100%)')
  })
})

describe('resolveBranding — un tenant CON marca propia', () => {
  const verde: TenantConfig = {
    brand_name: 'La Huerta',
    branding: { primary: '#0A7C4A', logo_url: 'https://cdn.example/logo.png' },
  }

  it('un solo color alcanza: el resto se deriva', () => {
    const b = resolveBranding(verde)
    expect(b.primary).toBe('#0a7c4a')
    expect(b.primaryEnd).toBe(deriveGradientEnd('#0a7c4a'))
    expect(b.cardBg).toContain(b.primaryEnd)
    expect(b.cardBg).not.toBe(DEFAULT_BRANDING.cardBg)
    expect(b.pageBg).not.toBe(DEFAULT_BRANDING.pageBg)
    expect(b.stampCheck).toBe(deriveStampCheck(b.primaryEnd))
    expect(b.logoUrl).toBe('https://cdn.example/logo.png')
  })

  it('el segundo tono explícito le gana al derivado', () => {
    const b = resolveBranding({
      brand_name: 'x',
      branding: { primary: '#0A7C4A', primary_end: '#003B22' },
    })
    expect(b.primaryEnd).toBe('#003b22')
  })

  it('un gradiente literal le gana al derivado, y el derivado a la clave plana', () => {
    const literal = 'linear-gradient(160deg, #000 0%, #fff 100%)'
    expect(
      resolveBranding({
        brand_name: 'x',
        card_bg: 'linear-gradient(160deg, #111 0%, #222 100%)',
        branding: { primary: '#0A7C4A', card_bg: literal },
      }).cardBg
    ).toBe(literal)

    // Sin literal en el espacio nuevo, manda el color elegido — no la clave vieja.
    expect(
      resolveBranding({
        brand_name: 'x',
        card_bg: 'linear-gradient(160deg, #111 0%, #222 100%)',
        branding: { primary: '#0A7C4A' },
      }).cardBg
    ).toContain(deriveGradientEnd('#0a7c4a'))
  })

  it('un color claro cambia el texto del botón y oscurece el QR', () => {
    const b = resolveBranding({ brand_name: 'x', branding: { primary: '#FFD60A' } })
    expect(b.onPrimary).toBe(INK)
    expect(contrastRatio('#ffffff', b.qrForeground)).toBeGreaterThanOrEqual(7)
  })

  it('brandCssVars solo emite lo que cambió', () => {
    const vars = brandCssVars(resolveBranding(verde)) as Record<string, string>
    expect(vars['--brand-primary']).toBe('#0a7c4a')
    expect(vars['--brand-primary-rgb']).toBe('10, 124, 74')
    // No eligió fondo ni tinta: esas dos NO se estampan y ganan las de `:root`.
    expect(vars['--brand-surface']).toBeUndefined()
    expect(vars['--brand-ink']).toBeUndefined()
  })
})
