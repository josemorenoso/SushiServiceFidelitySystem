/**
 * Referidos — la lógica pura (`src/lib/referidos.ts`) y la lista cerrada de ajustes (2026-10-15).
 *
 *   · Los ajustes nacen APAGADOS y, sin nada configurado, con los defaults del plan (tope 10 al
 *     mes, 30 días). Lo que no se entiende cae a «sin premio», nunca a un premio inventado.
 *   · Guardar rechaza un premio que no esté en el catálogo ACTIVO de la marca (un id de otra
 *     marca, uno retirado), y encender sin premio para quien invita.
 *   · `PUT /api/dashboard/settings` no escribe las claves `referral_*`: las escribe la ruta de
 *     Referidos, que valida el conjunto (`decidirEscrituraDeAjuste()`).
 *   · El código, el mensaje para compartir y el dominio del enlace con 2+ sedes.
 */

import { describe, it, expect } from 'vitest'
import {
  ajustesAFilas,
  construirEnlace,
  dominioDelEnlace,
  enlaceDeWhatsApp,
  estadoVisible,
  generarCodigo,
  mensajeParaCompartir,
  MENSAJE_DEFAULT,
  normalizarAjustesDeReferidos,
  normalizarCodigo,
  primerNombre,
  programaActivo,
  REFERRAL_SETTING_KEYS,
  textoDelBeneficio,
  validarAjustesDeReferidos,
} from '@/lib/referidos'
import { CLAVES_DE_REFERIDOS, CLAVES_ESCRIBIBLES, decidirEscrituraDeAjuste } from '@/lib/settings-keys'

const PREMIO = 'aaaaaaaa-1111-4000-8000-000000000001'
const DE_OTRA_MARCA = 'bbbbbbbb-2222-4000-8000-000000000002'
const CATALOGO = new Set([PREMIO])

describe('los ajustes de la marca', () => {
  it('sin nada guardado: apagado, sin premios, tope 10 y 30 días', () => {
    const a = normalizarAjustesDeReferidos({})
    expect(a).toEqual({
      enabled: false,
      premioDeQuienInvita: { tipo: 'none', rewardId: null, puntos: null },
      premioDelAmigo: { tipo: 'none', rewardId: null, puntos: null },
      topeAlMes: 10,
      diasDeVencimiento: 30,
      mensaje: MENSAJE_DEFAULT,
    })
    expect(programaActivo(a)).toBe(false)
  })

  it('un premio a medio configurar es «sin premio», no uno inventado', () => {
    const a = normalizarAjustesDeReferidos({
      referral_enabled: 'true',
      referral_referrer_reward_type: 'reward', // sin id
      referral_referred_reward_type: 'points',
      referral_referred_reward_points: '999999', // fuera de rango
      referral_monthly_cap: 'mucho',
    })
    expect(a.premioDeQuienInvita.tipo).toBe('none')
    expect(a.premioDelAmigo.tipo).toBe('none')
    expect(a.topeAlMes).toBe(10)
    // Encendido sin nada que prometerle a quien invita = el programa no corre.
    expect(programaActivo(a)).toBe(false)
  })

  it('ida y vuelta: lo guardado se lee igual', () => {
    const v = validarAjustesDeReferidos(
      {
        enabled: true,
        premioDeQuienInvita: { tipo: 'reward', rewardId: PREMIO },
        premioDelAmigo: { tipo: 'points', puntos: 50 },
        topeAlMes: 5,
        diasDeVencimiento: 15,
        mensaje: 'Ven conmigo: {enlace}',
      },
      CATALOGO
    )
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const filas = ajustesAFilas(v.ajustes)
    expect(Object.keys(filas).sort()).toEqual([...REFERRAL_SETTING_KEYS].sort())
    expect(normalizarAjustesDeReferidos(filas)).toEqual(v.ajustes)
    expect(programaActivo(v.ajustes)).toBe(true)
  })
})

describe('guardar los ajustes: lo que se rechaza', () => {
  const base = { enabled: true, premioDelAmigo: { tipo: 'none' }, topeAlMes: 10, diasDeVencimiento: 30, mensaje: '' }

  it('un premio de OTRA marca (no está en el catálogo activo de esta) no se guarda', () => {
    const v = validarAjustesDeReferidos({ ...base, premioDeQuienInvita: { tipo: 'reward', rewardId: DE_OTRA_MARCA } }, CATALOGO)
    expect(v).toEqual({ ok: false, error: expect.stringMatching(/catálogo activo de tu marca/) })
  })

  it('tampoco para el regalo del amigo', () => {
    const v = validarAjustesDeReferidos(
      { ...base, premioDeQuienInvita: { tipo: 'points', puntos: 100 }, premioDelAmigo: { tipo: 'reward', rewardId: DE_OTRA_MARCA } },
      CATALOGO
    )
    expect(v.ok).toBe(false)
  })

  it('encender sin premio para quien invita no se puede', () => {
    const v = validarAjustesDeReferidos({ ...base, premioDeQuienInvita: { tipo: 'none' } }, CATALOGO)
    expect(v).toEqual({ ok: false, error: expect.stringMatching(/qué gana quien invita/) })
  })

  it('apagado sin premio sí (es como nace)', () => {
    const v = validarAjustesDeReferidos({ ...base, enabled: false, premioDeQuienInvita: { tipo: 'none' } }, CATALOGO)
    expect(v.ok).toBe(true)
  })

  it.each([
    ['puntos en 0', { premioDeQuienInvita: { tipo: 'points', puntos: 0 } }],
    ['tope en 0', { premioDeQuienInvita: { tipo: 'points', puntos: 10 }, topeAlMes: 0 }],
    ['días en 400', { premioDeQuienInvita: { tipo: 'points', puntos: 10 }, diasDeVencimiento: 400 }],
    ['mensaje enorme', { premioDeQuienInvita: { tipo: 'points', puntos: 10 }, mensaje: 'x'.repeat(601) }],
    ['tipo inventado', { premioDeQuienInvita: { tipo: 'cupon' } }],
  ])('%s: 400 con el porqué', (_n, cambio) => {
    expect(validarAjustesDeReferidos({ ...base, ...cambio }, CATALOGO).ok).toBe(false)
  })
})

describe('PUT /api/dashboard/settings no escribe las claves de referidos', () => {
  it('las diez son de la lista cerrada de referidos y NO de la genérica', () => {
    expect(REFERRAL_SETTING_KEYS).toHaveLength(10)
    for (const k of REFERRAL_SETTING_KEYS) {
      expect(CLAVES_DE_REFERIDOS.has(k)).toBe(true)
      expect(CLAVES_ESCRIBIBLES.has(k)).toBe(false)
    }
  })

  it.each([...REFERRAL_SETTING_KEYS])('«%s» → 400 que manda a Recompensas › Referidos', (key) => {
    const d = decidirEscrituraDeAjuste({ key, valor: DE_OTRA_MARCA, proveedor: 'twilio', valorActual: null, esOperador: true })
    expect(d).toEqual({ ok: false, status: 400, error: expect.stringMatching(/Recompensas › Referidos/) })
  })
})

describe('el código', () => {
  it('seis caracteres del alfabeto sin O/0/I/1/L', () => {
    const c = generarCodigo((n) => Array.from({ length: n }, (_, i) => i * 7))
    expect(c).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/)
  })

  it('lo que llega por la URL se normaliza; lo que no puede ser un código es null', () => {
    expect(normalizarCodigo(' ab3k9q ')).toBe('AB3K9Q')
    expect(normalizarCodigo('OI0123')).toBeNull()
    expect(normalizarCodigo('abc')).toBeNull()
    expect(normalizarCodigo('<script>')).toBeNull()
    expect(normalizarCodigo(42)).toBeNull()
  })
})

describe('lo que se muestra y se comparte', () => {
  it('el beneficio: título del catálogo, puntos, o nada', () => {
    expect(textoDelBeneficio({ tipo: 'reward', rewardId: PREMIO, puntos: null }, '2x1 en rollos')).toBe('2x1 en rollos')
    expect(textoDelBeneficio({ tipo: 'points', rewardId: null, puntos: 1500 }, null)).toBe('1.500 puntos')
    expect(textoDelBeneficio({ tipo: 'none', rewardId: null, puntos: null }, 'x')).toBeNull()
  })

  it('el amigo solo ve el primer nombre de quien lo invitó', () => {
    expect(primerNombre('María José Gómez')).toBe('María')
    expect(primerNombre('  ')).toBe('Un amigo')
  })

  it('el mensaje reemplaza las cuatro variables; sin {enlace}, el enlace va al final', () => {
    const datos = { nombre: 'Ana', beneficio: 'un postre', marca: 'Tepuy', enlace: 'https://t.co/r/AB3K9Q' }
    expect(mensajeParaCompartir('{nombre} te regala {beneficio} en {marca}: {enlace}', datos)).toBe(
      'Ana te regala un postre en Tepuy: https://t.co/r/AB3K9Q'
    )
    expect(mensajeParaCompartir('Ven a {marca}', datos)).toBe('Ven a Tepuy https://t.co/r/AB3K9Q')
    expect(enlaceDeWhatsApp('hola y chao')).toBe('https://wa.me/?text=hola%20y%20chao')
  })
})

describe('el dominio del enlace (§1.6: una marca de dos sedes)', () => {
  const sedes = [
    { id: 'env', domain: 'clubtepuyenvigado.constelarys.com' },
    { id: 'lau', domain: 'clubtepuylaureles.constelarys.com' },
  ]

  it('desde la raíz de una marca de 2 sedes: el dominio de la sede donde vino por última vez', () => {
    expect(
      dominioDelEnlace({ host: 'clubtepuy.constelarys.com', requiereElegirSede: true, sedes, sedeDeUltimaVisita: 'lau' })
    ).toBe('clubtepuylaureles.constelarys.com')
  })

  it('sin última visita conocida: la raíz (la landing pregunta la sede y conserva el enlace)', () => {
    expect(
      dominioDelEnlace({ host: 'clubtepuy.constelarys.com', requiereElegirSede: true, sedes, sedeDeUltimaVisita: null })
    ).toBe('clubtepuy.constelarys.com')
  })

  it('una marca de una sede, o un subdominio de sede: el host de siempre', () => {
    expect(dominioDelEnlace({ host: 'sushi.constelarys.com', requiereElegirSede: false, sedes: [], sedeDeUltimaVisita: 'x' })).toBe(
      'sushi.constelarys.com'
    )
    expect(construirEnlace('sushi.constelarys.com', 'AB3K9Q')).toBe('https://sushi.constelarys.com/r/AB3K9Q')
  })
})

describe('el estado que se muestra', () => {
  const ahora = new Date('2026-10-15T12:00:00Z')
  it('un pendiente pasado de fecha se muestra vencido aunque nadie lo haya marcado', () => {
    expect(estadoVisible({ status: 'pending', expires_at: '2026-10-15T11:00:00Z' }, ahora)).toBe('expired')
    expect(estadoVisible({ status: 'pending', expires_at: '2026-10-16T11:00:00Z' }, ahora)).toBe('pending')
    expect(estadoVisible({ status: 'completed', expires_at: '2026-10-01T00:00:00Z' }, ahora)).toBe('completed')
  })
})
