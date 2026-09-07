/**
 * El enlace opcional del evento de calendario (migración 00050).
 *
 * POR QUÉ ESTAS DOS FUNCIONES TIENEN PRUEBA PROPIA
 * ────────────────────────────────────────────────
 * El link no viaja como texto suelto: se compone dentro de `{{5}}`, que es una
 * VARIABLE de la plantilla `twilio/media` aprobada por Meta. Twilio rechaza con
 * 21656 las variables con saltos de línea, y ese rechazo no afecta a un cliente:
 * tumba la invitación de la audiencia ENTERA del evento. Por eso el saneo se
 * prueba acá, sin red y sin base, y por eso `buildEventCta` es pura.
 *
 * Ver `docs/features/calendar.md` § "Enlace del evento".
 */

import { describe, it, expect } from 'vitest'
import { normalizeEventLink, buildEventCta } from '@/services/calendar.service'

describe('normalizeEventLink', () => {
  it('deja pasar una URL https normal', () => {
    expect(normalizeEventLink('https://tucarta.com/festival')).toBe('https://tucarta.com/festival')
  })

  it('acepta http (hay clientes con sitios viejos)', () => {
    expect(normalizeEventLink('http://tucarta.com')).toBe('http://tucarta.com')
  })

  it('recorta los espacios de los bordes, que es el error de pegar desde el navegador', () => {
    expect(normalizeEventLink('  https://tucarta.com/festival  ')).toBe('https://tucarta.com/festival')
  })

  it('trata "sin link" y "cadena vacía" como lo mismo: null', () => {
    expect(normalizeEventLink(null)).toBeNull()
    expect(normalizeEventLink(undefined)).toBeNull()
    expect(normalizeEventLink('')).toBeNull()
    expect(normalizeEventLink('   ')).toBeNull()
  })

  it('rechaza lo que no es http(s): un dominio pelado no es clicleable en WhatsApp', () => {
    expect(() => normalizeEventLink('tucarta.com')).toThrow(/http/)
    expect(() => normalizeEventLink('www.tucarta.com')).toThrow(/http/)
  })

  it('rechaza espacios INTERNOS: partirían la URL y el cliente recibiría un link muerto', () => {
    expect(() => normalizeEventLink('https://tucarta.com/mi festival')).toThrow(/espacios/)
  })

  it('un salto de línea al final se recorta (pegar desde el navegador arrastra uno)', () => {
    expect(normalizeEventLink('https://tucarta.com\n')).toBe('https://tucarta.com')
  })

  it('rechaza el salto de línea INTERNO: es el 21656 de Twilio, que tumba el envío de toda la audiencia', () => {
    expect(() => normalizeEventLink('https://tucarta.com/a\nb')).toThrow(/espacios|salto/i)
  })

  it('rechaza lo que no cabe en la columna (CHECK de la 00050: 500 caracteres)', () => {
    const largo = `https://tucarta.com/${'a'.repeat(500)}`
    expect(() => normalizeEventLink(largo)).toThrow(/500/)
  })
})

describe('buildEventCta', () => {
  it('sin link, el CTA es la descripción tal cual (comportamiento previo a la 00050)', () => {
    expect(buildEventCta('¡Promo 2x1 todo el día!', null)).toBe('¡Promo 2x1 todo el día!')
  })

  it('sin descripción ni link, cae al texto por defecto', () => {
    expect(buildEventCta(null, null)).toBe('¡Te esperamos!')
    expect(buildEventCta('   ', null)).toBe('¡Te esperamos!')
  })

  it('con link, lo pega al final del texto en la MISMA línea', () => {
    const cta = buildEventCta('¡Promo 2x1!', 'https://tucarta.com/festival')
    expect(cta).toBe('¡Promo 2x1! 👉 https://tucarta.com/festival')
    // La invariante que importa: una sola línea. Un salto acá sería un 21656.
    expect(cta).not.toMatch(/[\n\r]/)
  })

  it('con link y sin descripción, el default sigue haciendo de texto', () => {
    expect(buildEventCta(null, 'https://tucarta.com')).toBe('¡Te esperamos! 👉 https://tucarta.com')
  })
})
