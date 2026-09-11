/**
 * El normalizador de celulares del CSV de Golden Bullet.
 *
 * Existe por una trampa concreta: la versión anterior miraba los ÚLTIMOS diez
 * dígitos y con eso un móvil francés, italiano o español pasaba por colombiano.
 * En una base de 15.000 contactos eso no se ve a ojo, se ve en la factura.
 *
 * Ref: docs/features/golden-bullet.md
 */

import { describe, it, expect } from 'vitest'
import { normalizePhone } from '@/services/imported-contacts.service'

describe('normalizePhone — solo móviles colombianos', () => {
  it('acepta las formas en que la gente escribe un celular colombiano', () => {
    expect(normalizePhone('3001234567')).toBe('3001234567')
    expect(normalizePhone('+573001234567')).toBe('3001234567')
    expect(normalizePhone('573001234567')).toBe('3001234567')
    expect(normalizePhone('00573001234567')).toBe('3001234567')
    expect(normalizePhone('+57 300 123 4567')).toBe('3001234567')
    expect(normalizePhone('(300) 123-4567')).toBe('3001234567')
  })

  it('RECHAZA los extranjeros cuyos últimos diez dígitos empiezan por 3', () => {
    // Francia: +33 6 12 34 56 78 → últimos diez «3612345678». Antes pasaba.
    expect(normalizePhone('+33612345678')).toBeNull()
    // Italia: +39 312 345 6789 → últimos diez «3123456789». Antes pasaba.
    expect(normalizePhone('+393123456789')).toBeNull()
    // España: +34 3xx no existe como móvil, pero +34 6/7 tampoco entra.
    expect(normalizePhone('+34612345678')).toBeNull()
    // Venezuela y Ecuador, que son la mayoría de los extranjeros de la agenda.
    expect(normalizePhone('+584122122550')).toBeNull()
    expect(normalizePhone('+593987654321')).toBeNull()
  })

  it('rechaza fijos, cortos y vacíos', () => {
    expect(normalizePhone('6041234567')).toBeNull() // fijo de Medellín
    expect(normalizePhone('147')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('abc')).toBeNull()
  })

  it('un 57 pegado a un número que no es de 12 dígitos no se recorta', () => {
    // «5730012345» son diez dígitos que empiezan por 5: no es un celular.
    expect(normalizePhone('5730012345')).toBeNull()
  })
})
