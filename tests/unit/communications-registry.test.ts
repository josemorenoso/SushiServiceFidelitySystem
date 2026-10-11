/**
 * El motor de piezas dice lo mismo que las reglas que ya existen (fase 1A, 2026-10-11).
 *
 * `src/lib/communications/registry.ts` DECLARA las reglas de cada comunicación. Esas reglas
 * hoy viven repartidas en cinco sitios, y este test exige que el registro coincida con
 * todos, en las dos direcciones:
 *
 *   1. `MONTHLY_CAP_SOURCES` (`src/constants/rewards.ts`)          → countsForMonthlyCap
 *   2. `EXENTOS_DEL_CAP` del drenador (`api/cron/queue-drain/route.ts`, se LEE como texto:
 *      es una constante local de la ruta)                              → exemptFromFrequencyCap
 *   3. `MESSAGE_CLASS_MAP` (`src/constants/messaging.ts`) y `message_class_map` (00037,
 *      como texto)                                                     → messageType
 *   4. La lista del trigger de fatiga (`cycle_on_campaign_message_sent()`, 00070, como
 *      texto)                                                          → countsForFatigue
 *   5. El CHECK de `campaigns.source` (00031, como texto)              → campaignSource
 *
 * Si mañana alguien cambia una regla en un solo lado, esto se pone rojo y dice cuál.
 * Al final, la pieza de ejemplo del registro (`brand_anniversary`) pasa la misma paridad
 * sin tocar nada más: es la promesa de que agregar comunicaciones es barato.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  COMMUNICATION_PIECES,
  CAMPAIGN_SOURCES,
  CADENCE_RULES,
  fatigueSources,
  getPiece,
  type CommunicationPiece,
} from '@/lib/communications/registry'
import { MONTHLY_CAP_SOURCES, FREQUENCY_CAP_DAYS, MONTHLY_MARKETING_CAP } from '@/constants/rewards'
import { MESSAGE_CLASS_MAP } from '@/constants/messaging'

const RAIZ = path.resolve(import.meta.dirname, '../..')
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8')

function migracion(numero: string): string {
  const dir = path.join(RAIZ, 'supabase/migrations')
  const archivo = fs.readdirSync(dir).find((f) => f.startsWith(`${numero}_`))
  if (!archivo) throw new Error(`No existe supabase/migrations/${numero}_*.sql`)
  return fs.readFileSync(path.join(dir, archivo), 'utf8')
}

/** `'a', 'b'` → ['a', 'b'] */
const literales = (lista: string) => [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1])

// ── Las cinco fuentes, leídas de donde viven ──────────────────────────────

function exentosDelDrenador(): Set<string> {
  const src = leer('src/app/api/cron/queue-drain/route.ts')
  const m = /EXENTOS_DEL_CAP\s*=\s*new Set\(\[([^\]]*)\]\)/.exec(src)
  expect(m, 'no se encontró EXENTOS_DEL_CAP en queue-drain/route.ts').not.toBeNull()
  return new Set(literales(m![1]))
}

function mapaDeClasesSql(): Map<string, { clase: string; prioridad: number }> {
  const sql = migracion('00037')
  const inicio = sql.indexOf('INSERT INTO message_class_map')
  expect(inicio).toBeGreaterThan(-1)
  const bloque = sql.slice(inicio, sql.indexOf('ON CONFLICT', inicio))
  const mapa = new Map<string, { clase: string; prioridad: number }>()
  for (const m of bloque.matchAll(/\(\s*'([^']+)'\s*,\s*'(transactional|campaign)'\s*,\s*(\d+)\s*,/g)) {
    mapa.set(m[1], { clase: m[2], prioridad: Number(m[3]) })
  }
  return mapa
}

function fuentesQueCansanEnSql(): Set<string> {
  const sql = migracion('00070')
  const cuerpo = sql.slice(sql.indexOf('FUNCTION cycle_on_campaign_message_sent'))
  const m = /v_source NOT IN \(([^)]*)\)/.exec(cuerpo)
  expect(m, 'no se encontró la lista de fuentes del trigger de fatiga en 00070').not.toBeNull()
  return new Set(literales(m![1]))
}

/** El CHECK vigente de `campaigns.source`: el de la ÚLTIMA migración que lo define. */
function fuentesDelCheck(): Set<string> {
  const dir = path.join(RAIZ, 'supabase/migrations')
  let ultimo: string[] | null = null
  for (const archivo of fs.readdirSync(dir).sort()) {
    const sql = fs.readFileSync(path.join(dir, archivo), 'utf8')
    for (const m of sql.matchAll(/campaigns_source_check\s+CHECK\s*\(\s*source IN \(([^)]*)\)/g)) {
      ultimo = literales(m[1])
    }
  }
  expect(ultimo, 'no se encontró campaigns_source_check').not.toBeNull()
  return new Set(ultimo!)
}

const FUENTES = {
  mensual: new Set<string>(MONTHLY_CAP_SOURCES),
  exentos: exentosDelDrenador(),
  clasesSql: mapaDeClasesSql(),
  fatiga: fuentesQueCansanEnSql(),
  check: fuentesDelCheck(),
}

/** Todo lo que una pieza dice distinto de las reglas que ya existen. Vacío = paridad. */
function diferencias(p: CommunicationPiece): string[] {
  const d: string[] = []
  if (p.countsForMonthlyCap !== FUENTES.mensual.has(p.campaignSource)) {
    d.push(`${p.key}: countsForMonthlyCap=${p.countsForMonthlyCap} pero MONTHLY_CAP_SOURCES ${FUENTES.mensual.has(p.campaignSource) ? 'tiene' : 'no tiene'} '${p.campaignSource}'`)
  }
  if (p.exemptFromFrequencyCap !== FUENTES.exentos.has(p.messageType)) {
    d.push(`${p.key}: exemptFromFrequencyCap=${p.exemptFromFrequencyCap} pero el drenador ${FUENTES.exentos.has(p.messageType) ? 'exime' : 'no exime'} '${p.messageType}'`)
  }
  if (p.countsForFatigue !== FUENTES.fatiga.has(p.campaignSource)) {
    d.push(`${p.key}: countsForFatigue=${p.countsForFatigue} pero el trigger de 00070 ${FUENTES.fatiga.has(p.campaignSource) ? 'cuenta' : 'no cuenta'} '${p.campaignSource}'`)
  }
  if (!FUENTES.check.has(p.campaignSource)) {
    d.push(`${p.key}: '${p.campaignSource}' no está en el CHECK de campaigns.source`)
  }
  const ts = MESSAGE_CLASS_MAP[p.messageType]
  const sql = FUENTES.clasesSql.get(p.messageType)
  if (!ts) d.push(`${p.key}: '${p.messageType}' no está en MESSAGE_CLASS_MAP`)
  if (!sql) d.push(`${p.key}: '${p.messageType}' no está en message_class_map (00037)`)
  if (ts && ts.messageClass !== 'campaign') d.push(`${p.key}: '${p.messageType}' no es de clase campaign`)
  if (ts && sql && (ts.messageClass !== sql.clase || ts.priority !== sql.prioridad)) {
    d.push(`${p.key}: '${p.messageType}' tiene otra clase o prioridad en TS y en SQL`)
  }
  return d
}

describe('el registro de piezas', () => {
  it('registra las seis comunicaciones que existen hoy, una vez cada una', () => {
    const claves = COMMUNICATION_PIECES.map((p) => p.key)
    expect(claves.sort()).toEqual(
      ['birthday', 'calendar_event', 'cycle_touch', 'golden_bullet', 'manual', 'reward_reminder'].sort()
    )
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('el toque del ciclo graba source reactivation; Golden Bullet graba manual', () => {
    expect(getPiece('cycle_touch')).toMatchObject({ messageType: 'reactivation', campaignSource: 'reactivation' })
    expect(getPiece('golden_bullet')).toMatchObject({ messageType: 'import', campaignSource: 'manual' })
  })

  it('las reglas de cadencia salen de constants/rewards.ts', () => {
    expect(CADENCE_RULES).toEqual({ frequencyCapDays: FREQUENCY_CAP_DAYS, monthlyCap: MONTHLY_MARKETING_CAP })
    expect(CADENCE_RULES).toEqual({ frequencyCapDays: 7, monthlyCap: 3 })
  })

  it('hoy todo sale por WhatsApp, y solo el evento pausa el toque del ciclo', () => {
    for (const p of COMMUNICATION_PIECES) expect(p.channels).toEqual(['whatsapp'])
    expect(COMMUNICATION_PIECES.filter((p) => p.pausesCycleTouch).map((p) => p.key)).toEqual(['calendar_event'])
  })

  it('CAMPAIGN_SOURCES es el CHECK de campaigns.source', () => {
    expect([...CAMPAIGN_SOURCES].sort()).toEqual([...FUENTES.check].sort())
  })
})

describe('paridad: cada pieza dice lo mismo que las constantes y que la base', () => {
  for (const p of COMMUNICATION_PIECES) {
    it(`${p.key}`, () => {
      expect(diferencias(p)).toEqual([])
    })
  }

  it('el recordatorio de premio y el cumpleaños NO cansan; manual, evento y ciclo sí', () => {
    expect(getPiece('reward_reminder')?.countsForFatigue).toBe(false)
    expect(getPiece('birthday')?.countsForFatigue).toBe(false)
    expect(getPiece('manual')?.countsForFatigue).toBe(true)
    expect(getPiece('calendar_event')?.countsForFatigue).toBe(true)
    expect(getPiece('cycle_touch')?.countsForFatigue).toBe(true)
  })
})

describe('paridad al revés: ninguna regla de las constantes queda sin pieza', () => {
  it('cada source de MONTHLY_CAP_SOURCES es de alguna pieza que cuenta para el tope', () => {
    const cubiertos = new Set(COMMUNICATION_PIECES.filter((p) => p.countsForMonthlyCap).map((p) => p.campaignSource))
    expect([...FUENTES.mensual].filter((s) => !cubiertos.has(s as never))).toEqual([])
  })

  it('cada exento del drenador es el messageType de alguna pieza exenta', () => {
    const cubiertos = new Set(COMMUNICATION_PIECES.filter((p) => p.exemptFromFrequencyCap).map((p) => p.messageType))
    expect([...FUENTES.exentos].filter((t) => !cubiertos.has(t))).toEqual([])
  })

  it('la lista del trigger de fatiga es exactamente fatigueSources() del registro', () => {
    expect([...FUENTES.fatiga].sort()).toEqual(fatigueSources().sort())
    expect(fatigueSources().sort()).toEqual(['calendar', 'manual', 'reactivation'])
  })
})

describe('agregar una comunicación es barato: «cumpleaños del restaurante»', () => {
  it('la pieza de ejemplo del registro pasa la paridad sin tocar constantes, base ni drenador', () => {
    // La misma que está escrita en el comentario de registry.ts.
    const brandAnniversary: CommunicationPiece = {
      key: 'brand_anniversary',
      messageType: 'calendar_event',
      campaignSource: 'calendar',
      countsForFatigue: true,
      countsForMonthlyCap: true,
      exemptFromFrequencyCap: true,
      channels: ['whatsapp'],
      pausesCycleTouch: true,
    }
    expect(diferencias(brandAnniversary)).toEqual([])
    expect(leer('src/lib/communications/registry.ts')).toContain("key: 'brand_anniversary'")
  })

  it('una pieza que se declara distinta de la base se pone roja y dice qué falta', () => {
    const rifaQueNoCansa: CommunicationPiece = {
      key: 'raffle',
      messageType: 'calendar_event',
      campaignSource: 'calendar',
      countsForFatigue: false, // la base SÍ cuenta 'calendar': hace falta un source propio
      countsForMonthlyCap: true,
      exemptFromFrequencyCap: true,
      channels: ['whatsapp'],
      pausesCycleTouch: false,
    }
    expect(diferencias(rifaQueNoCansa)).toEqual([
      "raffle: countsForFatigue=false pero el trigger de 00070 cuenta 'calendar'",
    ])
  })
})
