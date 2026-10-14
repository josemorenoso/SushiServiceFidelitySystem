/**
 * El motor del ciclo de recuperación (fase 1A, 2026-10-11) — `src/lib/cycle-engine.ts`.
 *
 * Lo que se fija:
 *   1. Los cuatro ritmos pasan la validación POR SIMULACIÓN (365 fechas de visita × con y
 *      sin domicilio) y `7·14·21·30·45`, el caso que rompe el tope de 3 al mes, falla (H1).
 *   2. Los cortes del ritmo personal y el ritmo de la marca (30 regresos, la elección del
 *      dueño manda).
 *   3. La etapa por día, `t3` solo con domicilio, el cooldown del fuerte, el salto de `t1`,
 *      el trimestral pequeño y fuerte, «vence el domingo» con mínimo 5 días, y el grupo de
 *      control estable por ciclo y distinto entre ciclos (H4).
 *   4. Los ajustes: defaults, saneamiento y la paridad con la lista cerrada del PUT.
 *
 * La regla SQL del ritmo (00070) se compara con esta en `tests/db/cycle-triggers.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import {
  RHYTHM_PRESETS,
  CYCLE_RHYTHMS,
  CYCLE_SETTING_KEYS,
  CYCLE_DEFAULTS,
  validateStageConfig,
  rhythmFromMedian,
  medianGap,
  personalRhythm,
  effectiveRhythm,
  brandRhythm,
  resolveStage,
  cycleStages,
  bandsFromConfig,
  shouldSkipT1,
  strongOfferAllowed,
  heartbeatPrize,
  expiresOnSunday,
  isHoldout,
  normalizeCycleSettings,
  daysForRhythm,
} from '@/lib/cycle-engine'
import { CLAVES_ESCRIBIBLES, decidirEscrituraDeAjuste } from '@/lib/settings-keys'

const DIA = 24 * 60 * 60 * 1000

describe('los cuatro ritmos, validados simulando (H1)', () => {
  it('los presets son los decididos el 11-10', () => {
    expect(RHYTHM_PRESETS).toEqual({
      cafe: [7, 14, 26, 42, 58],
      casual: [10, 17, 29, 45, 61],
      restaurant: [14, 28, 42, 60, 80],
      occasional: [21, 38, 56, 80, 110],
    })
    expect(daysForRhythm('restaurant')).toEqual([14, 28, 42, 60, 80])
  })

  for (const ritmo of CYCLE_RHYTHMS) {
    it(`${ritmo} cumple en las 730 simulaciones (7 días entre toques, ≤ 3 por mes y por 30 días)`, () => {
      const r = validateStageConfig(RHYTHM_PRESETS[ritmo])
      expect(r.casos).toBe(730)
      expect(r.motivos).toEqual([])
      expect(r.fallas).toBe(0)
      expect(r.ok).toBe(true)
    })
  }

  it('7·14·21·30·45 FALLA: cuatro mensajes en 30 días', () => {
    const r = validateStageConfig([7, 14, 21, 30, 45])
    expect(r.ok).toBe(false)
    expect(r.fallas).toBeGreaterThan(0)
    expect(r.motivos[0]).toMatch(/mensajes/)
  })

  it('7·14·24·34·48 también falla (el otro corto que nombra el spec)', () => {
    expect(validateStageConfig([7, 14, 24, 34, 48]).ok).toBe(false)
  })

  it('dos toques a menos de 7 días fallan', () => {
    const r = validateStageConfig([14, 20, 42, 60, 80])
    expect(r.ok).toBe(false)
    expect(r.motivos[0]).toMatch(/6 días/)
  })

  it('el recordatorio del rescate cuenta: 28·45·52 caben solos en 30 días; con el aviso del 52, no', () => {
    // El aviso cae entre el día 55 y el 61: cuatro mensajes entre el 28 y el 57.
    const r = validateStageConfig([14, 28, 45, 52, 90])
    expect(r.ok).toBe(false)
    expect(r.motivos.join(' ')).toMatch(/4 mensajes/)
  })

  it('basura no pasa: cinco días enteros, positivos y crecientes', () => {
    expect(validateStageConfig([14, 28, 42, 60]).ok).toBe(false)
    expect(validateStageConfig([14, 28, 28, 60, 80]).ok).toBe(false)
    expect(validateStageConfig([0, 28, 42, 60, 80]).ok).toBe(false)
  })
})

describe('el ritmo personal (≥ 3 días distintos con visita)', () => {
  it('los cortes: 8 → cafe, 9 → casual, 18 → casual, 19 → restaurant, 35 → restaurant, 36 → occasional', () => {
    expect(rhythmFromMedian(8)).toBe('cafe')
    expect(rhythmFromMedian(9)).toBe('casual')
    expect(rhythmFromMedian(18)).toBe('casual')
    expect(rhythmFromMedian(19)).toBe('restaurant')
    expect(rhythmFromMedian(35)).toBe('restaurant')
    expect(rhythmFromMedian(36)).toBe('occasional')
  })

  it('las medianas fraccionarias: 8,5 → cafe, 18,5 → casual, 35,5 → occasional', () => {
    expect(rhythmFromMedian(8.5)).toBe('cafe')
    expect(rhythmFromMedian(18.5)).toBe('casual')
    expect(rhythmFromMedian(35.5)).toBe('occasional')
  })

  it('con menos de 3 días distintos no hay ritmo personal', () => {
    expect(medianGap([])).toBeNull()
    expect(medianGap(['2026-10-01T15:00:00Z', '2026-10-09T15:00:00Z'])).toBeNull()
    expect(personalRhythm(['2026-10-01T15:00:00Z', '2026-10-09T15:00:00Z'])).toBeNull()
  })

  it('dos escaneos el mismo día cuentan como uno', () => {
    // Tres escaneos, dos días: no alcanza.
    expect(medianGap(['2026-10-01T14:00:00Z', '2026-10-01T22:00:00Z', '2026-10-05T15:00:00Z'])).toBeNull()
    // Cuatro escaneos, tres días: huecos 4 y 6.
    expect(
      medianGap(['2026-10-01T14:00:00Z', '2026-10-01T22:00:00Z', '2026-10-05T15:00:00Z', '2026-10-11T15:00:00Z'])
    ).toBe(5)
  })

  it('el día es el de Bogotá: 23:30 y 00:30 de la noche siguiente son dos días', () => {
    // 2026-10-01 23:30 Bogotá = 2026-10-02T04:30Z ; 2026-10-02 00:30 Bogotá = 2026-10-02T05:30Z
    expect(medianGap(['2026-10-02T04:30:00Z', '2026-10-02T05:30:00Z', '2026-10-03T05:30:00Z'])).toBe(1)
    // En UTC las dos primeras serían el mismo día y no alcanzaría.
  })

  it('Don Alirio: visitas cada 2 o 3 días → cafe', () => {
    const inicio = Date.UTC(2026, 8, 1, 15)
    const visitas = [0, 2, 5, 7, 10, 12, 15].map((d) => new Date(inicio + d * DIA))
    expect(medianGap(visitas)).toBe(2.5)
    expect(personalRhythm(visitas)).toBe('cafe')
  })

  it('el personal manda sobre el de la marca; sin él, el de la marca', () => {
    expect(effectiveRhythm('cafe', 'restaurant')).toBe('cafe')
    expect(effectiveRhythm(null, 'restaurant')).toBe('restaurant')
    expect(effectiveRhythm(undefined, 'casual')).toBe('casual')
  })
})

describe('el ritmo de la marca', () => {
  it('con 29 regresos no alcanza: restaurant aunque la mediana diga cafe', () => {
    expect(brandRhythm({ mediana: 6, regresos: 29 })).toBe('restaurant')
  })

  it('con 30 regresos la mediana elige (Don Alirio, mediana 6 → cafe)', () => {
    expect(brandRhythm({ mediana: 6, regresos: 30 })).toBe('cafe')
    expect(brandRhythm({ mediana: 27, regresos: 135 })).toBe('restaurant')
  })

  it('lo que eligió el dueño en Ajustes manda sobre el cálculo', () => {
    expect(brandRhythm({ mediana: 6, regresos: 500, elegidoPorElDueno: 'occasional' })).toBe('occasional')
    expect(brandRhythm({ mediana: null, regresos: 0, elegidoPorElDueno: 'casual' })).toBe('casual')
  })

  it('«auto» o un valor que no es un ritmo dejan decidir a los datos', () => {
    expect(brandRhythm({ mediana: 6, regresos: 30, elegidoPorElDueno: 'auto' })).toBe('cafe')
    expect(brandRhythm({ mediana: 6, regresos: 30, elegidoPorElDueno: 'semanal' })).toBe('cafe')
    expect(brandRhythm({ mediana: null, regresos: 40 })).toBe('restaurant')
  })
})

describe('la etapa por día', () => {
  const conDomicilio = { tieneDomicilio: true, canalesDelCliente: 'qr' }
  const sinDomicilio = { tieneDomicilio: false, canalesDelCliente: 'qr' }

  it('restaurante con domicilio: nada antes del 14; t1 14, t2 28, t3 42, t4 60, t5 80', () => {
    expect(resolveStage(0, 'restaurant', conDomicilio)).toBeNull()
    expect(resolveStage(13, 'restaurant', conDomicilio)).toBeNull()
    expect(resolveStage(14, 'restaurant', conDomicilio)).toBe('t1')
    expect(resolveStage(27, 'restaurant', conDomicilio)).toBe('t1')
    expect(resolveStage(28, 'restaurant', conDomicilio)).toBe('t2')
    expect(resolveStage(42, 'restaurant', conDomicilio)).toBe('t3')
    expect(resolveStage(60, 'restaurant', conDomicilio)).toBe('t4')
    expect(resolveStage(80, 'restaurant', conDomicilio)).toBe('t5')
    expect(resolveStage(400, 'restaurant', conDomicilio)).toBe('t5')
  })

  it('cafetería: t1 al 7, t5 al 58', () => {
    expect(resolveStage(6, 'cafe', conDomicilio)).toBeNull()
    expect(resolveStage(7, 'cafe', conDomicilio)).toBe('t1')
    expect(resolveStage(58, 'cafe', conDomicilio)).toBe('t5')
  })

  it('sin domicilio no existe t3: el ciclo tiene cuatro toques', () => {
    expect(cycleStages('restaurant', sinDomicilio).map((e) => e.stage)).toEqual(['t1', 't2', 't4', 't5'])
    expect(resolveStage(42, 'restaurant', sinDomicilio)).toBe('t2')
    expect(resolveStage(59, 'restaurant', sinDomicilio)).toBe('t2')
  })

  it('con domicilio, si el cliente ya usa los dos canales, t3 se salta', () => {
    expect(resolveStage(42, 'restaurant', { tieneDomicilio: true, canalesDelCliente: 'both' })).toBe('t2')
    expect(resolveStage(42, 'restaurant', { tieneDomicilio: true, canalesDelCliente: 'delivery' })).toBe('t3')
  })

  it('las cajas de la pantalla salen de los mismos días', () => {
    expect(bandsFromConfig('restaurant', conDomicilio).map((b) => [b.key, b.minDays, b.maxDays])).toEqual([
      ['reciente', 0, 13],
      ['t1', 14, 27],
      ['t2', 28, 41],
      ['t3', 42, 59],
      ['t4', 60, 79],
      ['t5', 80, Infinity],
    ])
    expect(bandsFromConfig('restaurant', sinDomicilio).map((b) => [b.key, b.minDays, b.maxDays])).toEqual([
      ['reciente', 0, 13],
      ['t1', 14, 27],
      ['t2', 28, 59],
      ['t4', 60, 79],
      ['t5', 80, Infinity],
    ])
    expect(bandsFromConfig('cafe', conDomicilio)[0].label).toBe('Recién vino')
  })
})

describe('escalera de regalos y saltos', () => {
  const ahora = new Date('2026-10-11T21:30:00Z')

  it('cooldown del fuerte: 180 días', () => {
    expect(strongOfferAllowed(null, ahora)).toBe(true)
    expect(strongOfferAllowed(new Date(ahora.getTime() - 179 * DIA), ahora)).toBe(false)
    expect(strongOfferAllowed(new Date(ahora.getTime() - 180 * DIA).toISOString(), ahora)).toBe(true)
    expect(strongOfferAllowed(new Date(ahora.getTime() - 10 * DIA), ahora, 7)).toBe(true)
  })

  it('con 5 visitas o más se salta «Le recordamos»', () => {
    expect(shouldSkipT1(1)).toBe(false)
    expect(shouldSkipT1(4)).toBe(false)
    expect(shouldSkipT1(5)).toBe(true)
    expect(shouldSkipT1(27)).toBe(true)
  })

  it('el trimestral: primero pequeño, después fuerte, después nada', () => {
    expect(heartbeatPrize(1)).toBe('small')
    expect(heartbeatPrize(2)).toBe('strong')
    expect(heartbeatPrize(3)).toBeNull()
  })
})

describe('«vence el domingo», con mínimo 5 días', () => {
  const finDelDomingo = (iso: string) => new Date(`${iso}T23:59:59-05:00`).toISOString()

  it('enviado el martes vence el domingo de esa semana (5 días)', () => {
    expect(expiresOnSunday(new Date('2026-10-13T21:30:00Z')).toISOString()).toBe(finDelDomingo('2026-10-18'))
  })

  it('enviado el miércoles, el domingo siguiente (a 4 días no alcanza)', () => {
    expect(expiresOnSunday(new Date('2026-10-14T21:30:00Z')).toISOString()).toBe(finDelDomingo('2026-10-25'))
  })

  it('enviado el lunes, ese domingo (6 días); enviado el domingo, el siguiente (7)', () => {
    expect(expiresOnSunday('2026-10-12T21:30:00Z').toISOString()).toBe(finDelDomingo('2026-10-18'))
    expect(expiresOnSunday('2026-10-11T21:30:00Z').toISOString()).toBe(finDelDomingo('2026-10-18'))
  })

  it('cuenta el día de Bogotá: el martes a las 10 pm todavía es martes', () => {
    // 2026-10-14T03:00Z = martes 13 a las 22:00 en Bogotá.
    expect(expiresOnSunday('2026-10-14T03:00:00Z').toISOString()).toBe(finDelDomingo('2026-10-18'))
  })

  it('el mínimo se puede cambiar', () => {
    expect(expiresOnSunday('2026-10-14T21:30:00Z', 3).toISOString()).toBe(finDelDomingo('2026-10-18'))
  })
})

describe('el grupo de control (H4)', () => {
  const ids = Array.from({ length: 2000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

  it('es estable: el mismo cliente, etapa y ciclo dan siempre lo mismo', () => {
    for (const id of ids.slice(0, 50)) {
      expect(isHoldout(id, 't4', 3, 10)).toBe(isHoldout(id, 't4', 3, 10))
    }
  })

  it('aparta cerca del 10 %', () => {
    const n = ids.filter((id) => isHoldout(id, 't4', 1, 10)).length
    expect(n).toBeGreaterThan(140)
    expect(n).toBeLessThan(260)
  })

  it('cambia entre ciclos: no es siempre el mismo 10 % el que se queda sin rescate', () => {
    const ciclo1 = new Set(ids.filter((id) => isHoldout(id, 't4', 1, 10)))
    const ciclo2 = new Set(ids.filter((id) => isHoldout(id, 't4', 2, 10)))
    const enLosDos = [...ciclo1].filter((id) => ciclo2.has(id)).length
    expect(ciclo1).not.toEqual(ciclo2)
    // Independientes: ~1 % de 2.000 en los dos. Si fuera el mismo grupo, serían ~200.
    expect(enLosDos).toBeLessThan(60)
  })

  it('cambia entre etapas del mismo ciclo', () => {
    const t2 = ids.filter((id) => isHoldout(id, 't2', 1, 10))
    const t4 = ids.filter((id) => isHoldout(id, 't4', 1, 10))
    expect(t2).not.toEqual(t4)
  })

  it('0 % no aparta a nadie; 100 % aparta a todos', () => {
    expect(ids.some((id) => isHoldout(id, 't1', 1, 0))).toBe(false)
    expect(ids.every((id) => isHoldout(id, 't1', 1, 100))).toBe(true)
  })
})

describe('los ajustes del ciclo', () => {
  it('sin nada guardado: apagado, auto, 6, trimestral encendido, 180, cena y 10 %', () => {
    expect(normalizeCycleSettings({}, { totalClientes: 500 })).toEqual({
      enabled: false,
      rhythm: 'auto',
      smallRewardIds: [],
      strongRewardId: null,
      fatigueTouches: 6,
      heartbeatEnabled: true,
      strongCooldownDays: 180,
      sendSlot: 'dinner',
      holdoutPct: 10,
    })
    expect(CYCLE_DEFAULTS.enabled).toBe(false)
  })

  it('con menos de 200 clientes el grupo de control nace en 0, salvo que el dueño diga otra cosa', () => {
    expect(normalizeCycleSettings({}, { totalClientes: 199 }).holdoutPct).toBe(0)
    expect(normalizeCycleSettings({}, { totalClientes: 200 }).holdoutPct).toBe(10)
    expect(normalizeCycleSettings({ cycle_holdout_pct: '5' }, { totalClientes: 150 }).holdoutPct).toBe(5)
  })

  it('el regalo fuerte cae al premio de la insistente de hoy si no hay uno propio', () => {
    expect(normalizeCycleSettings({ aggressive_reward_id: 'r-agresivo' }, { totalClientes: 1 }).strongRewardId).toBe(
      'r-agresivo'
    )
    expect(
      normalizeCycleSettings({ aggressive_reward_id: 'r-agresivo', cycle_strong_reward_id: 'r-fuerte' }, { totalClientes: 1 })
        .strongRewardId
    ).toBe('r-fuerte')
  })

  it('los regalos pequeños se leen como lista (coma o JSON)', () => {
    expect(normalizeCycleSettings({ cycle_small_reward_ids: 'a, b ,c' }, { totalClientes: 1 }).smallRewardIds).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(normalizeCycleSettings({ cycle_small_reward_ids: '["a","b"]' }, { totalClientes: 1 }).smallRewardIds).toEqual([
      'a',
      'b',
    ])
  })

  it('un valor corrupto cae al default en vez de romper el cron', () => {
    const s = normalizeCycleSettings(
      {
        cycle_enabled: 'si',
        cycle_rhythm: 'semanal',
        cycle_fatigue_touches: '6.5',
        cycle_strong_cooldown_days: '-3',
        cycle_send_slot: 'brunch',
        cycle_holdout_pct: '150',
        cycle_small_reward_ids: '[roto',
      },
      { totalClientes: 500 }
    )
    expect(s).toMatchObject({
      enabled: false,
      rhythm: 'auto',
      fatigueTouches: 6,
      strongCooldownDays: 180,
      sendSlot: 'dinner',
      holdoutPct: 10,
      smallRewardIds: [],
    })
  })

  it('lo que el dueño elija se respeta', () => {
    expect(
      normalizeCycleSettings(
        {
          cycle_enabled: 'true',
          cycle_rhythm: 'cafe',
          cycle_fatigue_touches: '4',
          cycle_heartbeat_enabled: 'false',
          cycle_send_slot: 'lunch',
        },
        { totalClientes: 500 }
      )
    ).toMatchObject({ enabled: true, rhythm: 'cafe', fatigueTouches: 4, heartbeatEnabled: false, sendSlot: 'lunch' })
  })

  it('las claves del ciclo son exactamente las que acepta la lista cerrada del PUT', () => {
    const delCicloEnElPut = [...CLAVES_ESCRIBIBLES].filter((k) => k.startsWith('cycle_')).sort()
    expect(delCicloEnElPut).toEqual([...CYCLE_SETTING_KEYS].sort())
    for (const key of CYCLE_SETTING_KEYS) {
      expect(decidirEscrituraDeAjuste({ key, valor: 'x', proveedor: 'twilio', valorActual: null, esOperador: true })).toEqual({
        ok: true,
        escribir: true,
      })
    }
    // Desde la parte C (2026-10-14): `cycle_enabled` solo del operador de Cada1 (H7); el resto, de la marca.
    for (const key of CYCLE_SETTING_KEYS) {
      const decision = decidirEscrituraDeAjuste({ key, valor: 'x', proveedor: 'twilio', valorActual: null, esOperador: false })
      expect(decision.ok).toBe(key !== 'cycle_enabled')
    }
  })
})
