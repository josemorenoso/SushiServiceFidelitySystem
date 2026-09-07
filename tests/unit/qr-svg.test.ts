/**
 * El QR imprimible de cada sede (`src/lib/utils/qr-svg.ts`).
 *
 * Lo que se fija acá no es estética: es lo que separa un cartel que funciona de
 * uno que hay que reimprimir después de haberlo pegado en la pared.
 *
 *   · **La sede sale del HOST, nunca de un parámetro** (D-QR-1). Si algún día
 *     alguien "mejora" esto agregando `?sede=`, el test se cae.
 *   · **Una sede sin subdominio NO tiene QR.** Con 2+ sedes activas el dominio
 *     raíz responde 409 al registrar, así que un QR sobre el dominio raíz sería
 *     un cartel que no registra clientes nuevos. Devolver `null` es lo que
 *     apaga el botón en la pantalla.
 *   · **El SVG conserva su `viewBox`.** Es lo que lo hace escalable a cualquier
 *     tamaño, que era el pedido entero.
 */

import { describe, it, expect } from 'vitest'
import { buildQrSvg, checkInUrlForDomain } from '@/lib/utils/qr-svg'

describe('checkInUrlForDomain — la sede viaja en el host', () => {
  it('arma la URL sobre el subdominio de la sede', () => {
    expect(checkInUrlForDomain('laureles.clubsushx.constelarys.com')).toBe(
      'https://laureles.clubsushx.constelarys.com/check-in'
    )
  })

  it('NUNCA agrega un parámetro de sede', () => {
    const url = checkInUrlForDomain('envigado.marca.com')
    expect(url).not.toContain('?')
    expect(url).not.toContain('sede')
  })

  it('normaliza mayúsculas y espacios: un host es minúsculas', () => {
    expect(checkInUrlForDomain('  Laureles.Marca.COM ')).toBe('https://laureles.marca.com/check-in')
  })

  it.each([null, undefined, '', '   '])(
    'devuelve null para %p — sin subdominio no hay QR que imprimir',
    (domain) => {
      expect(checkInUrlForDomain(domain)).toBeNull()
    }
  )
})

describe('buildQrSvg — el archivo que se manda a imprenta', () => {
  const URL_SEDE = 'https://laureles.clubsushx.constelarys.com/check-in'

  it('conserva el viewBox: es lo que lo hace escalable a cualquier tamaño', async () => {
    const svg = await buildQrSvg(URL_SEDE)
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/)
  })

  it('sale con medidas físicas en milímetros, no en píxeles', async () => {
    const svg = await buildQrSvg(URL_SEDE, 120)
    expect(svg).toContain('width="120mm"')
    expect(svg).toContain('height="120mm"')
    // Un `width` en px junto al de mm dejaría el atributo duplicado y un SVG inválido.
    expect(svg.match(/width="/g)).toHaveLength(1)
    expect(svg.match(/height="/g)).toHaveLength(1)
  })

  it('lleva el xmlns: sin él, el archivo no abre en un editor de vectores', async () => {
    const svg = await buildQrSvg(URL_SEDE)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('sale negro sobre blanco — el máximo contraste para escanear impreso', async () => {
    const svg = await buildQrSvg(URL_SEDE)
    expect(svg).toContain('#000000')
    expect(svg).toContain('#ffffff')
  })

  it('dos sedes distintas dan dos QR distintos', async () => {
    const [uno, otro] = await Promise.all([
      buildQrSvg('https://laureles.marca.com/check-in'),
      buildQrSvg('https://envigado.marca.com/check-in'),
    ])
    expect(uno).not.toBe(otro)
  })
})
