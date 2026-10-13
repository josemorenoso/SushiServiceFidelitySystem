/**
 * Ciclo de recuperación, fase 1B — las decisiones puras del envío (2026-10-13).
 *
 * `src/lib/cycle-touch.ts` decide qué se hace HOY con la etapa de cada cliente: qué toque,
 * qué regalo, qué plantilla (el adaptador del spec §4), si se pospone o va al grupo de
 * control, a qué hora sale (H3) y, ya en el drenador, qué fecha límite lleva y si todavía se
 * puede mandar. Acá se prueba esa regla sin base. Lo que necesita Postgres (el cron y el
 * drenador de verdad, el UNIQUE, el trigger de la cola, `?dry=1` sin escrituras, el regalo
 * otorgado solo tras el envío) vive en `tests/db/cycle-envios.test.ts`.
 *
 * Contra el código anterior (`9f6f093`) este archivo no carga: `cycle-touch.ts` no existía,
 * `diaDelRecordatorio()` tampoco y `getMonthBoundaries()` no se exportaba.
 */

import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  bogotaDay,
  expiresOnSunday,
  validateStageConfig,
  diaDelRecordatorio,
  RHYTHM_PRESETS,
  CYCLE_RHYTHMS,
} from '@/lib/cycle-engine'
import {
  nextSendSlot,
  queueExpiry,
  formatGiftDeadline,
  instanteEnBogota,
  variablesAlEnviar,
  variablesDelToque,
  elegirRegalo,
  elegirPlantilla,
  decidirCliente,
  resolverToque,
  guardaDelCicloAlEnviar,
  TOUCH_TEMPLATES,
  TOUCH_STATUSES,
  type ClienteDelCiclo,
  type ToqueExistente,
  type ContextoDeDecision,
  type PlantillasDeLaMarca,
  type PremiosDelCiclo,
  type ContextoDeEnvio,
} from '@/lib/cycle-touch'
import { getMonthBoundaries } from '@/services/campaign.service'

const DIA = 24 * 60 * 60 * 1000
const RAIZ = path.resolve(import.meta.dirname, '../..')

/** Martes 13 de octubre de 2026, 15:00 de Bogotá: la hora del cron de reactivación. */
const AHORA = new Date('2026-10-13T15:00:00-05:00')
const HOY = bogotaDay(AHORA)

const PEQUENO = { id: 'premio-pequeno', title: '½ rollo gratis' }
const FUERTE = { id: 'premio-fuerte', title: 'Rollo gratis' }
const PREMIOS: PremiosDelCiclo = { small: PEQUENO, strong: FUERTE }

const TODAS: PlantillasDeLaMarca = {
  sids: {
    gift_expiring: 'HX_REGALO',
    reactivation_aggressive: 'HX_INSISTENTE',
    reactivation_no_reward: 'HX_SUAVE',
    campaign_presencial_to_domicilio: 'HX_A_CASA',
    campaign_domicilio_to_presencial: 'HX_AL_LOCAL',
  },
  regaloQueVenceAprobada: true,
}

/** Un cliente cuyo ciclo empezó hace `dias` días de Bogotá (al mediodía). */
function cliente(dias: number, extra: Partial<ClienteDelCiclo> = {}): ClienteDelCiclo {
  return {
    id: 'cliente-1',
    total_visits: 1,
    source_channels: 'qr',
    cycle_no: 1,
    cycle_started_at: instanteEnBogota(HOY - dias, 12).toISOString(),
    cycle_state: 'activo',
    dormant_since: null,
    strong_offer_last_at: null,
    cycle_rhythm: null,
    ...extra,
  }
}

function contexto(extra: Partial<ContextoDeDecision> = {}): ContextoDeDecision {
  return {
    ahora: AHORA,
    diaDelEncendido: HOY - 60, // encendida hace dos meses: nada es «atrasado» salvo que se diga
    ritmoDeLaMarca: 'restaurant', // 14 · 28 · 42 · 60 · 80
    tieneDomicilio: true,
    heartbeatEnabled: true,
    strongCooldownDays: 180,
    plantillas: TODAS,
    premios: PREMIOS,
    ...extra,
  }
}

function toque(stage: ToqueExistente['stage'], status: ToqueExistente['status'], extra: Partial<ToqueExistente> = {}): ToqueExistente {
  return {
    id: `toque-${stage}`,
    cycle_no: 1,
    stage,
    seq: 1,
    status,
    attempts: 0,
    due_at: AHORA.toISOString(),
    sent_at: null,
    ...extra,
  }
}

// ═══════════════════════════════════════════════════════════════
// La hora de la marca (H3)
// ═══════════════════════════════════════════════════════════════

describe('la hora de la marca (H3)', () => {
  it('a las 15:00 la cena (16:30) sale HOY y el almuerzo (10:30), que ya pasó, MAÑANA', () => {
    expect(nextSendSlot(AHORA, 'dinner').toISOString()).toBe(new Date('2026-10-13T16:30:00-05:00').toISOString())
    expect(nextSendSlot(AHORA, 'lunch').toISOString()).toBe(new Date('2026-10-14T10:30:00-05:00').toISOString())
  })

  it('a las 09:00 el almuerzo sale hoy; a las 17:00 la cena sale mañana', () => {
    expect(nextSendSlot(new Date('2026-10-13T09:00:00-05:00'), 'lunch').toISOString()).toBe(
      new Date('2026-10-13T10:30:00-05:00').toISOString()
    )
    expect(nextSendSlot(new Date('2026-10-13T17:00:00-05:00'), 'dinner').toISOString()).toBe(
      new Date('2026-10-14T16:30:00-05:00').toISOString()
    )
  })

  it('a las 20:00 de Bogotá (ya es mañana en UTC) la cena sale mañana en Bogotá, no pasado mañana', () => {
    expect(nextSendSlot(new Date('2026-10-13T20:00:00-05:00'), 'dinner').toISOString()).toBe(
      new Date('2026-10-14T16:30:00-05:00').toISOString()
    )
  })

  it('el item vence al cierre del día siguiente al envío (23:59:59 de Bogotá)', () => {
    expect(queueExpiry(new Date('2026-10-13T16:30:00-05:00')).toISOString()).toBe(
      new Date('2026-10-14T23:59:59-05:00').toISOString()
    )
  })
})

// ═══════════════════════════════════════════════════════════════
// La fecha límite se calcula al ENVIAR
// ═══════════════════════════════════════════════════════════════

describe('«vence el domingo», calculado al enviar', () => {
  it('se escribe «domingo 18 de octubre», en hora de Bogotá aunque en UTC ya sea lunes', () => {
    expect(formatGiftDeadline(new Date('2026-10-18T23:59:59-05:00'))).toBe('domingo 18 de octubre')
    expect(formatGiftDeadline(new Date('2026-10-19T03:00:00Z'))).toBe('domingo 18 de octubre')
  })

  it('el MISMO item encolado sale con otra fecha si se envía otro día: la fecha es del envío, no del encolado', () => {
    const encolado = { '1': 'Juanita', '2': '½ rollo gratis', '4': 'camino' }
    const martes = variablesAlEnviar('gift_expiring', 'small', encolado, new Date('2026-10-13T16:30:00-05:00'))
    const miercoles = variablesAlEnviar('gift_expiring', 'small', encolado, new Date('2026-10-14T16:30:00-05:00'))
    // Martes: el domingo de esa semana está a 5 días. Miércoles: a 4, así que el siguiente.
    expect(martes.variables['3']).toBe('domingo 18 de octubre')
    expect(miercoles.variables['3']).toBe('domingo 25 de octubre')
    expect(martes.vence!.toISOString()).toBe(expiresOnSunday(new Date('2026-10-13T16:30:00-05:00')).toISOString())
    // Lo encolado no se toca.
    expect(encolado).toEqual({ '1': 'Juanita', '2': '½ rollo gratis', '4': 'camino' })
  })

  it('la fecha va en {{3}} con «Regalo que vence» y en {{5}} con la insistente; sin regalo no va ninguna', () => {
    const regalo = variablesAlEnviar('gift_expiring', 'strong', { '1': 'A', '2': 'R', '4': 'c' }, AHORA)
    const insistente = variablesAlEnviar('reactivation_aggressive', 'strong', { '1': 'A', '2': '90', '3': 'X', '4': 'R' }, AHORA)
    const sinRegalo = variablesAlEnviar('reactivation_aggressive', null, { '1': 'A', '2': '90', '3': 'X' }, AHORA)
    expect(Object.keys(regalo.variables).sort()).toEqual(['1', '2', '3', '4'])
    expect(insistente.variables['5']).toBe('domingo 18 de octubre')
    expect(insistente.variables['3']).toBe('X')
    expect(sinRegalo).toEqual({ variables: { '1': 'A', '2': '90', '3': 'X' }, vence: null })
  })

  it('al encolar NO va la fecha: ni {{3}} en «Regalo que vence» ni {{5}} en la insistente', () => {
    const datos = { nombre: 'Juanita', puntos: 90, premioProximo: 'Postre', caminoDeNiveles: 'camino' }
    const regalo = { size: 'small' as const, premio: PEQUENO }
    expect(variablesDelToque('gift_expiring', datos, regalo)).toEqual({ '1': 'Juanita', '2': '½ rollo gratis', '4': 'camino' })
    expect(variablesDelToque('reactivation_aggressive', datos, regalo)).toEqual({
      '1': 'Juanita',
      '2': '90',
      '3': 'Postre',
      '4': '½ rollo gratis',
    })
    expect(variablesDelToque('reactivation_aggressive', datos, null)).toEqual({ '1': 'Juanita', '2': '90', '3': 'Postre' })
    expect(variablesDelToque('reactivation_no_reward', { ...datos, premioProximo: null }, null)).toEqual({
      '1': 'Juanita',
      '2': '90',
      '3': 'más beneficios',
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// La escalera de regalos y el adaptador
// ═══════════════════════════════════════════════════════════════

describe('la escalera de regalos', () => {
  it('t2 lleva el pequeño y t4 el fuerte', () => {
    expect(elegirRegalo('t2', 1, null, PREMIOS, AHORA, 180)).toEqual({ size: 'small', premio: PEQUENO })
    expect(elegirRegalo('t4', 1, null, PREMIOS, AHORA, 180)).toEqual({ size: 'strong', premio: FUERTE })
  })

  it('cooldown: con un fuerte hace 100 días, el rescate lleva el PEQUEÑO', () => {
    const hace100 = new Date(AHORA.getTime() - 100 * DIA).toISOString()
    expect(elegirRegalo('t4', 1, hace100, PREMIOS, AHORA, 180)).toEqual({ size: 'small', premio: PEQUENO })
    const hace200 = new Date(AHORA.getTime() - 200 * DIA).toISOString()
    expect(elegirRegalo('t4', 1, hace200, PREMIOS, AHORA, 180)).toEqual({ size: 'strong', premio: FUERTE })
  })

  it('sin fuerte configurado el rescate lleva el pequeño; sin ninguno, nada (el toque sale igual)', () => {
    expect(elegirRegalo('t4', 1, null, { small: PEQUENO, strong: null }, AHORA, 180)?.size).toBe('small')
    expect(elegirRegalo('t2', 1, null, { small: null, strong: null }, AHORA, 180)).toBeNull()
    expect(elegirRegalo('t4', 1, null, { small: null, strong: null }, AHORA, 180)).toBeNull()
  })

  it('el trimestral: el 1 pequeño, el 2 fuerte (con el mismo freno); t1, t3 y t5 sin regalo', () => {
    expect(elegirRegalo('heartbeat', 1, null, PREMIOS, AHORA, 180)?.size).toBe('small')
    expect(elegirRegalo('heartbeat', 2, null, PREMIOS, AHORA, 180)?.size).toBe('strong')
    for (const s of ['t1', 't3', 't5'] as const) expect(elegirRegalo(s, 1, null, PREMIOS, AHORA, 180)).toBeNull()
  })
})

describe('el adaptador (spec §4)', () => {
  it('con regalo y «Regalo que vence» aprobada → gift_expiring; sin aprobar → la insistente', () => {
    expect(elegirPlantilla('t2', true, 'qr', TODAS)).toEqual({ key: 'gift_expiring', sid: 'HX_REGALO' })
    expect(elegirPlantilla('t4', true, 'qr', { ...TODAS, regaloQueVenceAprobada: false })).toEqual({
      key: 'reactivation_aggressive',
      sid: 'HX_INSISTENTE',
    })
  })

  it('sin regalo, aunque esté aprobada, sale la insistente (sin {{4}}/{{5}})', () => {
    expect(elegirPlantilla('t2', false, 'qr', TODAS)?.key).toBe('reactivation_aggressive')
  })

  it('t1 → la suave sin oferta · t3 → la cruzada según el canal · t5 → la insistente', () => {
    expect(elegirPlantilla('t1', false, 'qr', TODAS)?.key).toBe('reactivation_no_reward')
    expect(elegirPlantilla('t3', false, 'qr', TODAS)?.key).toBe('campaign_presencial_to_domicilio')
    expect(elegirPlantilla('t3', false, 'delivery', TODAS)?.key).toBe('campaign_domicilio_to_presencial')
    expect(elegirPlantilla('t5', false, 'qr', TODAS)?.key).toBe('reactivation_aggressive')
  })

  it('sin la plantilla configurada → null (el toque no se crea)', () => {
    const sinInsistente: PlantillasDeLaMarca = { sids: { reactivation_no_reward: 'HX_SUAVE' }, regaloQueVenceAprobada: false }
    expect(elegirPlantilla('t5', false, 'qr', sinInsistente)).toBeNull()
    expect(elegirPlantilla('t2', true, 'qr', sinInsistente)).toBeNull()
  })

  it('las cinco plantillas y los siete estados son los mismos que los CHECK de la 00071', () => {
    const sql = fs.readFileSync(path.join(RAIZ, 'supabase/migrations/00071_ciclo_envios.sql'), 'utf8')
    const lista = (nombre: string) => {
      const m = new RegExp(`${nombre}\\s+CHECK \\([^(]*\\(([^)]*)\\)`).exec(sql)
      return [...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1]).sort()
    }
    expect(lista('customer_cycle_touches_template_key_check')).toEqual(Object.keys(TOUCH_TEMPLATES).sort())
    expect(lista('customer_cycle_touches_status_check')).toEqual([...TOUCH_STATUSES].sort())
  })

  it('el camino nuevo no lee NUNCA las legacy de reactivación', () => {
    for (const archivo of ['src/lib/cycle-touch.ts', 'src/services/cycle.service.ts']) {
      const codigo = fs
        .readFileSync(path.join(RAIZ, archivo), 'utf8')
        .split('\n')
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join('\n')
      expect(codigo, archivo).not.toMatch(/reactivation_with_reward_template_sid|['"`]reactivation_template_sid/)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// Qué le toca HOY a un cliente
// ═══════════════════════════════════════════════════════════════

describe('qué le toca hoy a un cliente activo', () => {
  it('el día de su etapa sale su toque, con regalo y plantilla', () => {
    const { decision } = decidirCliente(cliente(28), [], contexto())
    expect(decision).toMatchObject({
      tipo: 'toque',
      toque: { stage: 't2', seq: 1, existenteId: null, plantilla: { key: 'gift_expiring' }, regalo: { size: 'small' } },
    })
  })

  it('regla (1) del encendido: encendida HOY, quien está en el día 30 no recibe el t2 del día 28 (espera el t3)', () => {
    const ctx = contexto({ diaDelEncendido: HOY })
    expect(decidirCliente(cliente(30), [], ctx).decision).toEqual({ tipo: 'nada', motivo: 'atrasado' })
    expect(decidirCliente(cliente(28), [], ctx).decision).toMatchObject({ tipo: 'toque', toque: { stage: 't2' } })
  })

  it('regla (1) después del encendido: un ciclo que empezó antes de encender igual recibe las etapas que caen después', () => {
    // Encendida hace 20 días; el ciclo empezó hace 28 (8 días antes de encender): t2 cae hoy.
    expect(decidirCliente(cliente(28), [], contexto({ diaDelEncendido: HOY - 20 })).decision).toMatchObject({
      tipo: 'toque',
      toque: { stage: 't2' },
    })
  })

  it('regla (2): quien ya pasó la despedida al encender se duerme sin mensaje', () => {
    expect(decidirCliente(cliente(85), [], contexto({ diaDelEncendido: HOY })).decision).toEqual({
      tipo: 'dormir',
      motivo: 'encendido',
    })
    // El día exacto de la despedida, no: sale la despedida.
    expect(decidirCliente(cliente(80), [], contexto({ diaDelEncendido: HOY })).decision).toMatchObject({
      tipo: 'toque',
      toque: { stage: 't5' },
    })
  })

  it('con 5 visitas o más se salta «Le recordamos»', () => {
    expect(decidirCliente(cliente(14, { total_visits: 5 }), [], contexto()).decision).toEqual({ tipo: 'nada', motivo: 't1_fiel' })
    expect(decidirCliente(cliente(14, { total_visits: 4 }), [], contexto()).decision).toMatchObject({ tipo: 'toque' })
  })

  it('sin domicilio no existe t3: el día 42 sigue en t2 (ya enviado)', () => {
    const toques = [toque('t2', 'sent')]
    expect(decidirCliente(cliente(42), toques, contexto({ tieneDomicilio: false })).decision).toEqual({
      tipo: 'nada',
      motivo: 'hecho',
    })
  })

  it('un toque en cola no se repite; uno pospuesto espera su fecha y después se retoma', () => {
    expect(decidirCliente(cliente(28), [toque('t2', 'queued')], contexto()).decision).toEqual({ tipo: 'nada', motivo: 'en_curso' })
    const manana = new Date(AHORA.getTime() + DIA).toISOString()
    expect(decidirCliente(cliente(28), [toque('t2', 'deferred', { due_at: manana })], contexto()).decision).toEqual({
      tipo: 'nada',
      motivo: 'esperando',
    })
    const ayer = new Date(AHORA.getTime() - DIA).toISOString()
    expect(decidirCliente(cliente(30), [toque('t2', 'deferred', { due_at: ayer })], contexto()).decision).toMatchObject({
      tipo: 'toque',
      toque: { stage: 't2', existenteId: 'toque-t2' },
    })
  })

  it('un fallido se reintenta con menos de 3 intentos y a los 3 se rinde', () => {
    expect(decidirCliente(cliente(29), [toque('t2', 'failed', { attempts: 2 })], contexto()).decision).toMatchObject({
      tipo: 'toque',
      toque: { existenteId: 'toque-t2' },
    })
    expect(decidirCliente(cliente(29), [toque('t2', 'failed', { attempts: 3 })], contexto()).decision).toEqual({
      tipo: 'nada',
      motivo: 'hecho',
    })
  })

  it('si pasó a la etapa siguiente, el toque viejo que seguía abierto se cancela y sale el nuevo', () => {
    const ayer = new Date(AHORA.getTime() - DIA).toISOString()
    const { cancelar, decision } = decidirCliente(
      cliente(42),
      [toque('t2', 'deferred', { due_at: ayer }), toque('t1', 'sent')],
      contexto()
    )
    expect(cancelar).toEqual(['toque-t2'])
    expect(decision).toMatchObject({ tipo: 'toque', toque: { stage: 't3' } })
  })

  it('una despedida que no va a salir (grupo de control, cancelada) duerme al cliente sin mensaje', () => {
    expect(decidirCliente(cliente(81), [toque('t5', 'holdout')], contexto()).decision).toEqual({ tipo: 'dormir', motivo: 'despedida' })
    expect(decidirCliente(cliente(81), [toque('t5', 'cancelled')], contexto()).decision).toEqual({ tipo: 'dormir', motivo: 'despedida' })
  })

  it('sin la plantilla de la etapa, no hay toque (y se cuenta)', () => {
    const ctx = contexto({ plantillas: { sids: { reactivation_aggressive: 'HX_INSISTENTE' }, regaloQueVenceAprobada: false } })
    expect(decidirCliente(cliente(14), [], ctx).decision).toEqual({ tipo: 'sin_plantilla', stage: 't1' })
  })
})

describe('el dormido: un toque cada tres meses, máximo dos, y después archivado', () => {
  const dormido = (dias: number) =>
    cliente(200, { cycle_state: 'dormido', dormant_since: instanteEnBogota(HOY - dias, 12).toISOString() })

  it('a los 90 días el trimestral 1 con el pequeño; a los 180 el 2 con el fuerte', () => {
    expect(decidirCliente(dormido(89), [], contexto()).decision).toEqual({ tipo: 'nada', motivo: 'antes_del_primer_toque' })
    expect(decidirCliente(dormido(90), [], contexto()).decision).toMatchObject({
      tipo: 'toque',
      toque: { stage: 'heartbeat', seq: 1, regalo: { size: 'small' } },
    })
    const primero = toque('heartbeat', 'sent', { seq: 1, id: 'hb-1' })
    expect(decidirCliente(dormido(180), [primero], contexto()).decision).toMatchObject({
      tipo: 'toque',
      toque: { stage: 'heartbeat', seq: 2, regalo: { size: 'strong' } },
    })
  })

  it('con dos trimestrales y 90 días desde el segundo, archivado (sin mensaje)', () => {
    const segundo = toque('heartbeat', 'sent', {
      seq: 2,
      id: 'hb-2',
      sent_at: new Date(AHORA.getTime() - 90 * DIA).toISOString(),
    })
    expect(decidirCliente(dormido(270), [toque('heartbeat', 'sent', { seq: 1, id: 'hb-1' }), segundo], contexto()).decision).toEqual({
      tipo: 'archivar',
    })
  })

  it('con el trimestral apagado en la marca, nada', () => {
    expect(decidirCliente(dormido(95), [], contexto({ heartbeatEnabled: false })).decision).toEqual({
      tipo: 'nada',
      motivo: 'trimestral_apagado',
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// Blackout, grupo de control y topes
// ═══════════════════════════════════════════════════════════════

describe('después de decidir: evento, control y topes', () => {
  const base: ContextoDeEnvio = {
    ahora: AHORA,
    slot: 'dinner',
    holdoutPct: 0,
    blackoutHasta: null,
    pasaSieteDias: true,
    ultimaCampana: null,
    alTopeDelMes: false,
    inicioDelMesSiguiente: new Date('2026-11-01T00:00:00-05:00'),
  }
  const t = { stage: 't2' as const, seq: 1, cycleNo: 1 }

  it('el evento de su audiencia pospone el toque al día siguiente del evento', () => {
    const hasta = new Date('2026-10-17T00:00:00-05:00')
    expect(resolverToque(t, 'c1', { ...base, blackoutHasta: hasta })).toMatchObject({ status: 'deferred', motivo: 'evento', dueAt: hasta })
  })

  it('el grupo de control no se encola pero queda con su hora (H5)', () => {
    expect(resolverToque(t, 'c1', { ...base, holdoutPct: 100 })).toEqual({ status: 'holdout', dueAt: nextSendSlot(AHORA, 'dinner') })
  })

  it('el cap de 7 días pospone a last_campaign_at + 7; el tope del mes, al día 1 del siguiente', () => {
    const hace2 = new Date(AHORA.getTime() - 2 * DIA).toISOString()
    expect(resolverToque(t, 'c1', { ...base, pasaSieteDias: false, ultimaCampana: hace2 })).toMatchObject({
      status: 'deferred',
      motivo: 'siete_dias',
      dueAt: new Date(new Date(hace2).getTime() + 7 * DIA),
    })
    expect(resolverToque(t, 'c1', { ...base, alTopeDelMes: true })).toMatchObject({
      status: 'deferred',
      motivo: 'tope_mes',
      dueAt: base.inicioDelMesSiguiente,
    })
  })

  it('el resto se encola a la próxima hora de la marca y vence al cierre del día siguiente', () => {
    const slot = nextSendSlot(AHORA, 'dinner')
    expect(resolverToque(t, 'c1', base)).toEqual({ status: 'encolar', notBefore: slot, expiresAt: queueExpiry(slot) })
  })
})

// ═══════════════════════════════════════════════════════════════
// Las guardas del drenador
// ═══════════════════════════════════════════════════════════════

describe('las guardas del ciclo al enviar', () => {
  const toqueEnCola = { cycle_no: 3, stage: 't2' as const, gift_size: 'small' as const }
  const activo = { cycle_no: 3, cycle_state: 'activo' }

  it('la marca apagó el ciclo, el cliente volvió, o ya no está en el estado del toque → cancelar', () => {
    expect(guardaDelCicloAlEnviar({ cicloEncendido: false, toque: toqueEnCola, cliente: activo, ahora: AHORA }).tipo).toBe('cancelar')
    expect(guardaDelCicloAlEnviar({ cicloEncendido: true, toque: toqueEnCola, cliente: { ...activo, cycle_no: 4 }, ahora: AHORA }).tipo).toBe('cancelar')
    expect(
      guardaDelCicloAlEnviar({ cicloEncendido: true, toque: toqueEnCola, cliente: { ...activo, cycle_state: 'dormido' }, ahora: AHORA }).tipo
    ).toBe('cancelar')
    expect(
      guardaDelCicloAlEnviar({ cicloEncendido: true, toque: { ...toqueEnCola, stage: 'heartbeat' }, cliente: activo, ahora: AHORA }).tipo
    ).toBe('cancelar')
  })

  it('con un regalo vivo, el toque con regalo se pospone al día siguiente de que ese venza; sin regalo, sale', () => {
    const vence = '2026-10-18T23:59:59-05:00'
    expect(
      guardaDelCicloAlEnviar({ cicloEncendido: true, toque: toqueEnCola, cliente: activo, regaloVivoVence: vence, ahora: AHORA })
    ).toEqual({ tipo: 'posponer', dueAt: new Date('2026-10-19T00:00:00-05:00'), motivo: expect.any(String) })
    expect(
      guardaDelCicloAlEnviar({ cicloEncendido: true, toque: { ...toqueEnCola, gift_size: null }, cliente: activo, regaloVivoVence: vence, ahora: AHORA })
    ).toEqual({ tipo: 'enviar' })
    expect(guardaDelCicloAlEnviar({ cicloEncendido: true, toque: toqueEnCola, cliente: activo, ahora: AHORA })).toEqual({ tipo: 'enviar' })
  })
})

// ═══════════════════════════════════════════════════════════════
// El día real del recordatorio y el mes de Bogotá
// ═══════════════════════════════════════════════════════════════

describe('el recordatorio del rescate sale el SÁBADO, no el viernes', () => {
  it('con vencimiento el domingo a las 23:59:59 y el cron a las 11:00, la primera corrida que lo toma es la del sábado', () => {
    const domingo = bogotaDay(new Date('2026-10-18T12:00:00-05:00'))
    expect(diaDelRecordatorio(domingo)).toBe(domingo - 1)
    // La suposición vieja de la simulación («2 días antes») era el viernes.
    expect(diaDelRecordatorio(domingo)).not.toBe(domingo - 2)
  })

  it('con el día real, los cuatro ritmos siguen cumpliendo 7 días y 3 al mes', () => {
    for (const ritmo of CYCLE_RHYTHMS) {
      const v = validateStageConfig(RHYTHM_PRESETS[ritmo])
      expect(v, `${ritmo}: ${v.motivos.join(' · ')}`).toMatchObject({ ok: true, fallas: 0, casos: 730 })
    }
  })
})

describe('N-MES: el mes del tope se corta en hora de Bogotá', () => {
  it('el 31 de octubre a las 20:00 de Bogotá (1 de noviembre en UTC) sigue siendo octubre', () => {
    expect(getMonthBoundaries(new Date('2026-10-31T20:00:00-05:00'))).toEqual({
      startISO: '2026-10-01T05:00:00.000Z',
      nextMonthISO: '2026-11-01T05:00:00.000Z',
    })
  })

  it('el 1 de diciembre a las 02:00 de Bogotá es diciembre; y el año rueda', () => {
    expect(getMonthBoundaries(new Date('2026-12-01T02:00:00-05:00')).startISO).toBe('2026-12-01T05:00:00.000Z')
    expect(getMonthBoundaries(new Date('2026-12-31T23:30:00-05:00')).nextMonthISO).toBe('2027-01-01T05:00:00.000Z')
  })
})
