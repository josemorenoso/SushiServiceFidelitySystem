/**
 * Fechas especiales de Colombia (ciclo, fase 2 parte A, 2026-10-14) — `src/constants/fechas-especiales.ts`.
 *
 * Lo que se fija: las fechas MÓVILES caen el día que caen en Colombia (Madre: segundo domingo
 * de mayo; Padre: tercer domingo de junio; Amor y Amistad: tercer sábado de septiembre), el
 * filtro por tipo de negocio y por rubro (el Día del Sushi solo para una marca de sushi), y que
 * un rango que cruza el año sale bien. Contra el código anterior el archivo no existe.
 */

import { describe, it, expect } from 'vitest'
import {
  enesimoDelMes,
  fechasEspecialesEntre,
  rubroDeLaMarca,
  FECHAS_ESPECIALES_CO,
  type MarcaParaFechas,
} from '@/constants/fechas-especiales'

const RESTAURANTE: MarcaParaFechas = { businessType: 'restaurant', rubro: null }
const SUSHI: MarcaParaFechas = { businessType: 'restaurant', rubro: 'sushi' }
const BARBERIA: MarcaParaFechas = { businessType: 'barbershop', rubro: null }

const fechaDe = (id: string, desde: string, hasta: string, marca: MarcaParaFechas = RESTAURANTE) =>
  fechasEspecialesEntre(desde, hasta, marca).find((f) => f.id === id)?.fecha

describe('las fechas móviles caen el día de Colombia', () => {
  it.each([
    ['dia_de_la_madre', '2026', '2026-05-10'],
    ['dia_de_la_madre', '2027', '2027-05-09'],
    ['dia_del_padre', '2026', '2026-06-21'],
    ['dia_del_padre', '2027', '2027-06-20'],
    ['amor_y_amistad', '2026', '2026-09-19'],
    ['amor_y_amistad', '2027', '2027-09-18'],
  ])('%s %s → %s', (id, anio, esperado) => {
    expect(fechaDe(id, `${anio}-01-01`, `${anio}-12-31`)).toBe(esperado)
  })

  it('las fijas: San Valentín 14-02, Halloween 31-10, Navidad 24-12 (Nochebuena), fin de año 31-12', () => {
    expect(fechaDe('san_valentin', '2027-01-01', '2027-12-31')).toBe('2027-02-14')
    expect(fechaDe('halloween', '2026-01-01', '2026-12-31')).toBe('2026-10-31')
    expect(fechaDe('navidad', '2026-01-01', '2026-12-31')).toBe('2026-12-24')
    expect(fechaDe('fin_de_ano', '2026-01-01', '2026-12-31')).toBe('2026-12-31')
  })

  it('enesimoDelMes: el segundo domingo de mayo de 2026 es el 10 y el tercer sábado de septiembre, el 19', () => {
    expect(enesimoDelMes(2026, 5, 0, 2)).toBe(10)
    expect(enesimoDelMes(2026, 9, 6, 3)).toBe(19)
    // Si el mes empieza en el día buscado, el primero es el 1.
    expect(enesimoDelMes(2026, 11, 0, 1)).toBe(1) // 1-11-2026 es domingo
  })

  it('Amor y Amistad es en septiembre, no en febrero (San Valentín va aparte)', () => {
    const feb = fechasEspecialesEntre('2026-02-01', '2026-02-28', RESTAURANTE).map((f) => f.id)
    expect(feb).toContain('san_valentin')
    expect(feb).not.toContain('amor_y_amistad')
  })
})

describe('por tipo de negocio y por rubro', () => {
  it('el Día del Sushi (18 de junio) solo le sale a una marca de sushi', () => {
    expect(fechaDe('dia_del_sushi', '2026-06-01', '2026-06-30', SUSHI)).toBe('2026-06-18')
    expect(fechaDe('dia_del_sushi', '2026-06-01', '2026-06-30', RESTAURANTE)).toBeUndefined()
  })

  it('las de restaurante (Velitas, Novenas) no le salen a una barbería; las de todos sí', () => {
    const dic = fechasEspecialesEntre('2026-12-01', '2026-12-31', BARBERIA).map((f) => f.id)
    expect(dic).not.toContain('noche_de_velitas')
    expect(dic).not.toContain('novenas')
    expect(dic).toEqual(expect.arrayContaining(['navidad', 'fin_de_ano']))
  })

  it('rubroDeLaMarca: el emoji de la marca o su nombre dicen «sushi»; sin señal, null', () => {
    expect(rubroDeLaMarca({ slug: 'sushi-service', name: 'Sushi Service' })).toBe('sushi')
    expect(rubroDeLaMarca({ slug: 'club-x', name: 'Club X', config: { template_emoji: '🍣' } })).toBe('sushi')
    expect(rubroDeLaMarca({ slug: 'don-alirio', name: 'Don Alirio', config: { template_emoji: '☕' } })).toBeNull()
    expect(rubroDeLaMarca({})).toBeNull()
  })
})

describe('el rango', () => {
  it('cruza el año: del 20 de diciembre al 20 de febrero salen Navidad, fin de año y San Valentín, en orden', () => {
    const ids = fechasEspecialesEntre('2026-12-20', '2027-02-20', RESTAURANTE).map((f) => `${f.id}:${f.fecha}`)
    expect(ids).toEqual(['navidad:2026-12-24', 'fin_de_ano:2026-12-31', 'san_valentin:2027-02-14'])
  })

  it('incluye los dos extremos y devuelve vacío con un rango al revés o inválido', () => {
    expect(fechasEspecialesEntre('2026-10-31', '2026-10-31', RESTAURANTE).map((f) => f.id)).toEqual(['halloween'])
    expect(fechasEspecialesEntre('2026-11-01', '2026-10-01', RESTAURANTE)).toEqual([])
    expect(fechasEspecialesEntre('no-es-fecha', '2026-10-01', RESTAURANTE)).toEqual([])
  })

  it('los ids son únicos (la tarjeta «Para hoy» los usa de llave)', () => {
    const ids = FECHAS_ESPECIALES_CO.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
