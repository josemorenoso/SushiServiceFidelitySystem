/**
 * La pantalla del ciclo, lo PURO (fase 2 parte A, 2026-10-14).
 *
 * La regla de la fase 2 es «un solo motor»: la pantalla y el cron tienen que decir los mismos
 * días (spec §7.2). Por eso lo que la pantalla necesita —en qué caja está un cliente, qué día
 * entra a cada toque, cuándo le toca el trimestral— son funciones nuevas de `cycle-engine.ts`
 * y se prueban CONTRA las del cron (`resolveStage()`, `decidirCliente()`), no contra números
 * copiados. Además: la segunda visita con días distintos, el retorno con y sin mensaje solo
 * con ventanas cerradas, el orden de «Para hoy» y la regla de «Hoy no».
 *
 * Contra el código anterior: nada de esto existe (las funciones no están) y el PUT de Ajustes
 * aceptaría escribir el «Hoy no» a mano.
 */

import { describe, it, expect } from 'vitest'
import {
  bogotaDay,
  boxEnteredOn,
  boxOf,
  brandRhythm,
  brandRhythmDetail,
  cycleStages,
  daysWithoutVisit,
  heartbeatDueDays,
  isNewCustomer,
  resolveStage,
  secondVisitRate,
  stageEntryDays,
  CYCLE_RHYTHMS,
  RHYTHM_LABELS,
  RHYTHM_PRESETS,
  SECOND_VISIT_COHORT_DAYS,
  SECOND_VISIT_WINDOW_DAYS,
  type CycleRhythm,
} from '@/lib/cycle-engine'
import {
  decidirCliente,
  diaQuePospone,
  instanteEnBogota,
  isoDeDia,
  pospuestoHoy,
  proximaCorrida,
  esTarjetaConHoyNo,
  CYCLE_CRON_HOUR,
  HOY_NO_CLAVES,
  type ClienteDelCiclo,
  type ContextoDeDecision,
} from '@/lib/cycle-touch'
import { CLAVES_DEL_SISTEMA, CLAVES_ESCRIBIBLES, decidirEscrituraDeAjuste } from '@/lib/settings-keys'
import { medirRetorno, ordenarTarjetas, type TarjetaParaHoy, type ToqueMedible } from '@/services/cycle-overview.service'

const DIA = 24 * 60 * 60 * 1000
const AHORA = new Date('2026-10-14T17:00:00Z') // 12:00 de Bogotá
const HOY = bogotaDay(AHORA)

const CON_DOMICILIO = { tieneDomicilio: true, canalesDelCliente: 'qr' }
const SIN_DOMICILIO = { tieneDomicilio: false, canalesDelCliente: 'qr' }

// ═══════════════════════════════════════════════════════════════
// 1 · Las cajas dicen lo mismo que el cron
// ═══════════════════════════════════════════════════════════════

describe('boxOf / boxEnteredOn — la caja es la etapa del cron, día por día', () => {
  for (const ritmo of CYCLE_RHYTHMS) {
    for (const opciones of [CON_DOMICILIO, SIN_DOMICILIO]) {
      it(`${ritmo} ${opciones.tieneDomicilio ? 'con' : 'sin'} domicilio: 0…130 días`, () => {
        const dias = cycleStages(ritmo, opciones).map((e) => e.day)
        for (let d = 0; d <= 130; d++) {
          expect(boxOf(d, ritmo, opciones)).toBe(resolveStage(d, ritmo, opciones) ?? 'reciente')
          const entra = boxEnteredOn(d, ritmo, opciones)
          if (d === 0) expect(entra).toBe('reciente')
          else if (dias.includes(d)) expect(entra).toBe(resolveStage(d, ritmo, opciones))
          else expect(entra).toBeNull()
        }
      })
    }
  }

  it('sin domicilio no existe «Le mostramos lo otro»: el día 42 de restaurante sigue en «Le regalamos algo»', () => {
    expect(boxOf(42, 'restaurant', SIN_DOMICILIO)).toBe('t2')
    expect(boxEnteredOn(42, 'restaurant', SIN_DOMICILIO)).toBeNull()
    expect(boxOf(42, 'restaurant', CON_DOMICILIO)).toBe('t3')
  })

  it('un cliente que usa los dos canales tampoco tiene «Le mostramos lo otro»', () => {
    expect(boxOf(42, 'restaurant', { tieneDomicilio: true, canalesDelCliente: 'both' })).toBe('t2')
  })
})

describe('la pantalla y el cron anuncian el MISMO toque (spec §7.2)', () => {
  const ctxBase: Omit<ContextoDeDecision, 'ahora' | 'ritmoDeLaMarca'> = {
    diaDelEncendido: HOY - 400,
    tieneDomicilio: true,
    heartbeatEnabled: true,
    strongCooldownDays: 180,
    plantillas: {
      sids: {
        reactivation_no_reward: 'HX1',
        reactivation_aggressive: 'HX2',
        campaign_presencial_to_domicilio: 'HX3',
        campaign_domicilio_to_presencial: 'HX4',
        gift_expiring: 'HX5',
      },
      regaloQueVenceAprobada: true,
    },
    premios: { small: null, strong: null },
  }
  const cliente = (dias: number, ritmo: CycleRhythm | null): ClienteDelCiclo => ({
    id: 'c1',
    total_visits: 1,
    source_channels: 'qr',
    cycle_no: 1,
    cycle_started_at: instanteEnBogota(HOY - dias, 12).toISOString(),
    cycle_state: 'activo',
    dormant_since: null,
    strong_offer_last_at: null,
    cycle_rhythm: ritmo,
  })

  for (const ritmo of CYCLE_RHYTHMS) {
    it(`${ritmo}: el día de cada etapa, el cron decide ese toque y la pantalla lo pone en esa caja ese mismo día`, () => {
      for (const { stage, day } of cycleStages(ritmo, CON_DOMICILIO)) {
        const c = cliente(day, ritmo)
        const { decision } = decidirCliente(c, [], { ...ctxBase, ahora: AHORA, ritmoDeLaMarca: 'restaurant' })
        expect(decision).toMatchObject({ tipo: 'toque', toque: { stage } })
        const dias = daysWithoutVisit(c.cycle_started_at!, AHORA)
        expect(dias).toBe(day)
        expect(boxOf(dias, ritmo, CON_DOMICILIO)).toBe(stage)
        expect(boxEnteredOn(dias, ritmo, CON_DOMICILIO)).toBe(stage)
        // Y la proyección dice que entra HOY a esa etapa.
        expect(stageEntryDays(c.cycle_started_at!, ritmo, CON_DOMICILIO).find((e) => e.stage === stage)?.day).toBe(HOY)
      }
    })
  }

  it('el trimestral: los días de heartbeatDueDays() son los días en que el cron decide el toque 1 y el 2', () => {
    const dormido = instanteEnBogota(HOY - 300, 12)
    for (const { seq, day } of heartbeatDueDays(dormido)) {
      expect(day - bogotaDay(dormido)).toBe(90 * seq)
      const ahora = instanteEnBogota(day, 15)
      const c: ClienteDelCiclo = { ...cliente(0, null), cycle_state: 'dormido', dormant_since: dormido.toISOString() }
      const { decision } = decidirCliente(c, [], { ...ctxBase, ahora, ritmoDeLaMarca: 'restaurant' })
      expect(decision).toMatchObject({ tipo: 'toque', toque: { stage: 'heartbeat', seq } })
    }
  })

  it('stageEntryDays: inicio del ciclo + los días del ritmo, en días de Bogotá', () => {
    // 23:30 de Bogotá del 1-10 es 04:30 UTC del 2-10: el día es el 1-10, no el 2.
    const inicio = new Date('2026-10-02T04:30:00Z')
    const dias = stageEntryDays(inicio, 'restaurant', SIN_DOMICILIO).map((e) => `${e.stage}:${isoDeDia(e.day)}`)
    expect(dias).toEqual(['t1:2026-10-15', 't2:2026-10-29', 't4:2026-11-30', 't5:2026-12-20'])
  })
})

describe('nuevo contra ya volvió: se cuenta con las visitas, no con el ciclo', () => {
  it('una visita (o ninguna) es nuevo; dos o más, ya volvió', () => {
    expect(isNewCustomer(0)).toBe(true)
    expect(isNewCustomer(1)).toBe(true)
    expect(isNewCustomer(2)).toBe(false)
    expect(isNewCustomer(null)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2 · El ritmo de la marca, con su origen
// ═══════════════════════════════════════════════════════════════

describe('brandRhythmDetail — el ritmo y de dónde salió', () => {
  it('lo elegido por el dueño manda; con 30 regresos la mediana; si no, restaurante', () => {
    expect(brandRhythmDetail({ mediana: 6, regresos: 100, elegidoPorElDueno: 'occasional' })).toEqual({ ritmo: 'occasional', origen: 'dueno' })
    expect(brandRhythmDetail({ mediana: 6, regresos: 30 })).toEqual({ ritmo: 'cafe', origen: 'calculado' })
    expect(brandRhythmDetail({ mediana: 6, regresos: 29 })).toEqual({ ritmo: 'restaurant', origen: 'por_defecto' })
    expect(brandRhythmDetail({ mediana: null, regresos: 0 })).toEqual({ ritmo: 'restaurant', origen: 'por_defecto' })
  })

  it('brandRhythm() sigue diciendo lo mismo (es la misma regla)', () => {
    for (const mediana of [null, 3, 9, 18.5, 27, 36]) {
      for (const regresos of [0, 29, 30, 500]) {
        for (const elegido of [null, 'auto', 'cafe', 'basura']) {
          const input = { mediana, regresos, elegidoPorElDueno: elegido }
          expect(brandRhythm(input)).toBe(brandRhythmDetail(input).ritmo)
        }
      }
    }
  })

  it('las palabras del prototipo aprobado, una por ritmo', () => {
    expect(RHYTHM_LABELS).toEqual({
      cafe: 'Cada semana',
      casual: 'Cada quince días',
      restaurant: 'Cada mes',
      occasional: 'De vez en cuando',
    })
    expect(Object.keys(RHYTHM_LABELS).sort()).toEqual(Object.keys(RHYTHM_PRESETS).sort())
  })
})

// ═══════════════════════════════════════════════════════════════
// 3 · La segunda visita (A12): días con visita, no `cycle_no`
// ═══════════════════════════════════════════════════════════════

describe('secondVisitRate — % de nuevos que vuelven otro día dentro de 60', () => {
  const hasta = HOY - SECOND_VISIT_WINDOW_DAYS
  const desde = hasta - SECOND_VISIT_COHORT_DAYS + 1

  it('la cohorte son los 90 días que terminan hace 60 (todas sus ventanas ya cerraron)', () => {
    expect(secondVisitRate([], HOY)).toEqual({ desde, hasta, clientes: 0, volvieron: 0 })
  })

  it('cuenta días distintos: dos escaneos el mismo día NO son una segunda visita', () => {
    const r = secondVisitRate(
      [
        [hasta - 10, hasta - 10], // dos escaneos el mismo día
        [hasta - 10, hasta - 10 + 60], // volvió el día 60: cuenta
        [hasta - 10, hasta - 10 + 61], // el 61: no
        [desde - 1, hasta], // su primera visita es anterior a la cohorte: fuera
        [hasta + 1, hasta + 2], // primera visita después de la cohorte: fuera (su ventana no cerró)
        [desde], // primer día de la cohorte, nunca volvió
        [hasta, hasta + 3], // último día de la cohorte, volvió
      ],
      HOY
    )
    expect(r).toMatchObject({ clientes: 5, volvieron: 2 })
  })
})

// ═══════════════════════════════════════════════════════════════
// 4 · El retorno a 14 días, con mensaje y sin mensaje
// ═══════════════════════════════════════════════════════════════

describe('medirRetorno — solo ventanas cerradas, los dos grupos con la misma vara', () => {
  const hace = (dias: number) => new Date(AHORA.getTime() - dias * DIA).toISOString()
  const toque = (stage: ToqueMedible['stage'], status: ToqueMedible['status'], dueHace: number, volvioHace: number | null): ToqueMedible => ({
    stage,
    status,
    due_at: hace(dueHace),
    returned_at: volvioHace === null ? null : hace(volvioHace),
  })

  const toques: ToqueMedible[] = [
    toque('t2', 'sent', 20, 15), // ventana cerrada, volvió
    toque('t2', 'sent', 20, null), // ventana cerrada, no volvió
    toque('t2', 'holdout', 25, 20), // control, volvió
    toque('t2', 'holdout', 25, null),
    toque('t2', 'holdout', 25, null),
    toque('t2', 'sent', 5, 1), // ventana ABIERTA: no entra a la tasa, sí a «volvieron»
    toque('t4', 'sent', 50, 45), // fuera del período (su ventana cerró hace más de 30 días)
    toque('heartbeat', 'sent', 30, null),
  ]
  const r = medirRetorno(toques, AHORA)

  it('por etapa: con mensaje 1 de 2 (50 %), sin mensaje 1 de 3 (33,3 %)', () => {
    expect(r.porEtapa.get('t2')).toEqual({
      con_mensaje: { toques: 2, volvieron: 1, pct: 50 },
      sin_mensaje: { toques: 3, volvieron: 1, pct: 33.3 },
    })
  })

  it('una etapa sin grupo de control no inventa un 0 %: dice null', () => {
    expect(r.porEtapa.get('heartbeat')).toEqual({
      con_mensaje: { toques: 1, volvieron: 0, pct: 0 },
      sin_mensaje: { toques: 0, volvieron: 0, pct: null },
    })
    expect(r.porEtapa.has('t4')).toBe(false)
  })

  it('«volvieron por un mensaje»: regresos de los últimos 30 días de toques que SALIERON', () => {
    // el de hace 15 y el de ayer; el del control no; el de hace 45 no.
    expect(r.volvieronPorMensaje).toBe(2)
    expect(r.total.con_mensaje).toEqual({ toques: 3, volvieron: 1, pct: 33.3 })
  })
})

// ═══════════════════════════════════════════════════════════════
// 5 · «Para hoy»: el orden y el máximo
// ═══════════════════════════════════════════════════════════════

describe('ordenarTarjetas — lo que mueven por día que queda, máximo tres', () => {
  const t = (id: string, clientes: number, dias: number): TarjetaParaHoy => ({
    id,
    tipo: 'trimestral',
    texto: id,
    clientes,
    dias,
    acciones: ['ok'],
  })

  it('un evento sin foto que sale mañana le gana a una fecha especial dentro de un mes con más gente', () => {
    const orden = ordenarTarjetas([t('fecha', 341, 27), t('evento', 300, 1), t('trimestral', 31, 1), t('rescate', 23, 3)])
    expect(orden.map((x) => x.id)).toEqual(['evento', 'trimestral', 'fecha'])
  })

  it('máximo tres; una tarjeta que no mueve a nadie no sale', () => {
    const orden = ordenarTarjetas([t('a', 5, 0), t('b', 4, 0), t('c', 3, 0), t('d', 2, 0), t('cero', 0, 0)])
    expect(orden.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
})

// ═══════════════════════════════════════════════════════════════
// 6 · «Hoy no» (A6)
// ═══════════════════════════════════════════════════════════════

describe('«Hoy no» pospone la PRÓXIMA corrida del cron, un día', () => {
  const a = (horaBogota: string) => new Date(`2026-10-14T${horaBogota}:00-05:00`)

  it('la próxima corrida es hoy a las 15:00 hasta las 14:59; desde las 15:00, mañana', () => {
    expect(CYCLE_CRON_HOUR).toBe(15)
    expect(proximaCorrida(a('09:00'))).toEqual({ dia: HOY, instante: instanteEnBogota(HOY, 15) })
    expect(proximaCorrida(a('14:59')).dia).toBe(HOY)
    expect(proximaCorrida(a('15:00')).dia).toBe(HOY + 1)
    expect(proximaCorrida(a('23:59')).dia).toBe(HOY + 1)
  })

  it('apretado de mañana pospone la corrida de hoy; de tarde, la de mañana', () => {
    expect(diaQuePospone(a('09:00'))).toBe('2026-10-14')
    expect(diaQuePospone(a('16:00'))).toBe('2026-10-15')
  })

  it('el cron lo respeta solo el día anotado (un día, no para siempre)', () => {
    expect(pospuestoHoy('2026-10-14', a('15:00'))).toBe(true)
    expect(pospuestoHoy(' 2026-10-14 ', a('15:00'))).toBe(true)
    expect(pospuestoHoy('2026-10-13', a('15:00'))).toBe(false)
    expect(pospuestoHoy('2026-10-15', a('15:00'))).toBe(false)
    expect(pospuestoHoy(null, a('15:00'))).toBe(false)
    expect(pospuestoHoy('', a('15:00'))).toBe(false)
  })

  it('hoy hay una tarjeta con «Hoy no»: el trimestral', () => {
    expect(Object.keys(HOY_NO_CLAVES)).toEqual(['trimestral'])
    expect(esTarjetaConHoyNo('trimestral')).toBe(true)
    expect(esTarjetaConHoyNo('rescate')).toBe(false)
    expect(esTarjetaConHoyNo('toString')).toBe(false)
  })

  it('su clave la escribe el sistema: el PUT de Ajustes la rechaza con 400', () => {
    for (const clave of Object.values(HOY_NO_CLAVES)) {
      expect(CLAVES_DEL_SISTEMA.has(clave)).toBe(true)
      expect(CLAVES_ESCRIBIBLES.has(clave)).toBe(false)
      expect(decidirEscrituraDeAjuste({ key: clave, valor: '2026-10-14', proveedor: 'twilio', valorActual: null, esOperador: true })).toMatchObject({
        ok: false,
        status: 400,
      })
    }
  })
})
