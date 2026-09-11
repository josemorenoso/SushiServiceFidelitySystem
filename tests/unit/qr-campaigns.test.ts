/**
 * Invitaciones con premio (00063): la disponibilidad y el slug.
 *
 * Las dos son PURAS a propósito. `checkAvailability` es la misma función que
 * usa la landing (para no mostrar un formulario que va a fallar) y el registro
 * (para no regalar de más): si divergieran, la persona vería "quedan 3" y al
 * registrarse no recibiría nada. `slugify` + `SLUG_RE` son el espejo del CHECK
 * de la migración: un slug que pasa acá y revienta en Postgres es un 500 en la
 * cara del dueño.
 *
 * Ref: docs/features/invite-campaigns.md
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { checkAvailability, slugify, SLUG_RE } from '@/services/qr-campaign.service'

const AHORA = new Date('2026-09-11T15:00:00.000Z')

const base = { is_active: true, starts_at: null, ends_at: null, max_grants: null }

describe('checkAvailability — ¿se puede regalar AHORA?', () => {
  it('una invitación activa, sin fechas ni cupo, siempre puede', () => {
    expect(checkAvailability(base, 0, AHORA)).toEqual({ ok: true })
    expect(checkAvailability(base, 10_000, AHORA)).toEqual({ ok: true })
  })

  it('pausada no regala, aunque tenga cupo y esté en fecha', () => {
    expect(checkAvailability({ ...base, is_active: false }, 0, AHORA)).toEqual({ ok: false, reason: 'inactive' })
  })

  it('antes de empezar y después de vencer, no', () => {
    expect(checkAvailability({ ...base, starts_at: '2026-09-12T00:00:00Z' }, 0, AHORA)).toEqual({ ok: false, reason: 'not_started' })
    expect(checkAvailability({ ...base, ends_at: '2026-09-10T23:59:59Z' }, 0, AHORA)).toEqual({ ok: false, reason: 'ended' })
  })

  it('el cupo se agota en el premio número N, no en el N+1', () => {
    // Con cupo 50: el registro 50 (granted=49) todavía entra; el 51 (granted=50) no.
    expect(checkAvailability({ ...base, max_grants: 50 }, 49, AHORA)).toEqual({ ok: true })
    expect(checkAvailability({ ...base, max_grants: 50 }, 50, AHORA)).toEqual({ ok: false, reason: 'sold_out' })
  })

  it('el orden de las razones es el del daño: pausada antes que fecha, fecha antes que cupo', () => {
    // Si el dueño la pausó, eso es lo que quiere ver — no "agotada".
    const todo = { is_active: false, starts_at: '2030-01-01T00:00:00Z', ends_at: null, max_grants: 1 }
    expect(checkAvailability(todo, 5, AHORA)).toEqual({ ok: false, reason: 'inactive' })
  })
})

describe('slugify — del nombre al enlace', () => {
  it('convierte un nombre normal', () => {
    expect(slugify('Promo Apertura 2x1')).toBe('promo-apertura-2x1')
  })

  it('quita tildes y eñes en vez de romperse con ellas', () => {
    expect(slugify('Cumpleaños de María')).toBe('cumpleanos-de-maria')
  })

  it('colapsa basura y no deja guiones en las puntas', () => {
    expect(slugify('  --¡Hola!! mundo__  ')).toBe('hola-mundo')
  })

  it('corta a 40 sin dejar un guion colgando', () => {
    const largo = slugify('a'.repeat(38) + ' bb cc dd')
    expect(largo.length).toBeLessThanOrEqual(40)
    expect(largo.endsWith('-')).toBe(false)
  })

  it('todo lo que produce pasa SLUG_RE (salvo el vacío, que el servicio rechaza aparte)', () => {
    for (const n of ['Promo Apertura', 'Influencer @maria', '2x1 Martes', 'Ñoquis 29']) {
      const s = slugify(n)
      expect(s.length).toBeGreaterThan(0)
      expect(SLUG_RE.test(s)).toBe(true)
    }
  })
})

describe('SLUG_RE es el espejo del CHECK de la 00063', () => {
  it('la migración usa exactamente la misma expresión', () => {
    // Se lee la migración como TEXTO. Si alguien afloja la regex en un lado y
    // no en el otro, el servicio acepta un slug que Postgres rechaza (500) o al
    // revés (un slug válido que el panel no deja crear).
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/00063_invitaciones_con_premio.sql'),
      'utf8'
    )
    expect(sql).toContain(`slug ~ '${SLUG_RE.source}'`)
  })

  it('acepta lo válido y rechaza lo que rompería la URL', () => {
    expect(SLUG_RE.test('promo-apertura')).toBe(true)
    expect(SLUG_RE.test('2x1')).toBe(true)
    expect(SLUG_RE.test('Promo')).toBe(false) // mayúscula
    expect(SLUG_RE.test('promo apertura')).toBe(false) // espacio
    expect(SLUG_RE.test('-promo')).toBe(false)
    expect(SLUG_RE.test('promo--x')).toBe(false)
    expect(SLUG_RE.test('promo/x')).toBe(false)
  })
})
