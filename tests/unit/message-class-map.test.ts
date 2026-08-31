/**
 * El espejo TypeScript ↔ SQL del mapa de clases de mensaje.
 *
 * `src/constants/messaging.ts:11` y `00037_send_governance.sql:66-67` dicen los
 * dos que «hay un test que verifica que las dos copias no diverjan». Hasta
 * ahora ese test no existía: este es.
 *
 * POR QUÉ IMPORTA QUE NO DIVERJAN: SQL usa el mapa dentro de `line_budget()`
 * para calcular el p95 transaccional; TypeScript lo usa en el choke-point de
 * envío para elegir la clase ANTES de llamar a `reserve_send_slot()`. Si un
 * tipo está como `transactional` en un lado y `campaign` en el otro, el envío
 * se contabiliza contra un presupuesto y se decide contra otro.
 *
 * Esta prueba lee la migración como TEXTO, sin base de datos: es la más barata
 * de la suite y es la que se rompe primero si alguien agrega un tipo en un solo
 * lado.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  MESSAGE_CLASS_MAP,
  DEFAULT_MESSAGE_CLASS,
  classifyMessageType,
} from '@/constants/messaging'

const MIGRACION = path.resolve(
  __dirname,
  '../../supabase/migrations/00037_send_governance.sql'
)

interface FilaSql {
  messageType: string
  messageClass: string
  priority: number
}

/**
 * Extrae los INSERT de `message_class_map` de la migración.
 * Formato esperado (00037:78-100):
 *     ('welcome', 'transactional', 0, 'Bienvenida tras registro por QR'),
 */
function leerMapaSql(): FilaSql[] {
  const sql = fs.readFileSync(MIGRACION, 'utf8')

  const inicio = sql.indexOf('INSERT INTO message_class_map')
  expect(inicio, 'no se encontró el INSERT de message_class_map en 00037').toBeGreaterThan(-1)
  const bloque = sql.slice(inicio, sql.indexOf('ON CONFLICT', inicio))

  const filas: FilaSql[] = []
  const re = /\(\s*'([^']+)'\s*,\s*'(transactional|campaign)'\s*,\s*(\d+)\s*,/g
  let m: RegExpExecArray | null
  while ((m = re.exec(bloque)) !== null) {
    filas.push({ messageType: m[1], messageClass: m[2], priority: Number(m[3]) })
  }
  return filas
}

describe('message_class_map: espejo TypeScript ↔ SQL', () => {
  const filasSql = leerMapaSql()

  it('la migración define al menos los 17 tipos conocidos', () => {
    expect(filasSql.length).toBeGreaterThanOrEqual(17)
  })

  it('los dos lados tienen exactamente los mismos message_type', () => {
    const enSql = new Set(filasSql.map((f) => f.messageType))
    const enTs = new Set(Object.keys(MESSAGE_CLASS_MAP))

    const soloSql = [...enSql].filter((k) => !enTs.has(k))
    const soloTs = [...enTs].filter((k) => !enSql.has(k))

    expect(soloSql, `tipos en 00037 que faltan en src/constants/messaging.ts`).toEqual([])
    expect(soloTs, `tipos en src/constants/messaging.ts que faltan en 00037`).toEqual([])
  })

  it('cada tipo tiene la misma clase y la misma prioridad en ambos lados', () => {
    for (const fila of filasSql) {
      const ts = MESSAGE_CLASS_MAP[fila.messageType]
      expect(ts, `${fila.messageType} no está en MESSAGE_CLASS_MAP`).toBeDefined()
      expect(ts.messageClass, `clase de ${fila.messageType}`).toBe(fila.messageClass)
      expect(ts.priority, `prioridad de ${fila.messageType}`).toBe(fila.priority)
    }
  })

  it('la prioridad y la clase son coherentes entre sí', () => {
    // P0 es la única clase transaccional; de P1 en adelante todo es campaña.
    for (const [tipo, { messageClass, priority }] of Object.entries(MESSAGE_CLASS_MAP)) {
      if (messageClass === 'transactional') {
        expect(priority, `${tipo}: lo transaccional es siempre P0`).toBe(0)
      } else {
        expect(priority, `${tipo}: una campaña nunca es P0`).toBeGreaterThan(0)
      }
    }
  })

  it('un tipo desconocido cae en el default CONSERVADOR (campaña P3)', () => {
    // Conservador = queda sujeto al presupuesto de campaña, que es más
    // estrecho, en vez de poder consumir la reserva transaccional.
    expect(classifyMessageType('tipo_que_no_existe')).toEqual(DEFAULT_MESSAGE_CLASS)
    expect(DEFAULT_MESSAGE_CLASS.messageClass).toBe('campaign')
    expect(DEFAULT_MESSAGE_CLASS.priority).toBe(3)
  })

  it('Golden Bullet es la única P4', () => {
    const p4 = Object.entries(MESSAGE_CLASS_MAP)
      .filter(([, v]) => v.priority === 4)
      .map(([k]) => k)
    expect(p4).toEqual(['import'])
  })

  it('classifyMessageType devuelve lo mismo que el mapa para cada tipo conocido', () => {
    for (const [tipo, esperado] of Object.entries(MESSAGE_CLASS_MAP)) {
      expect(classifyMessageType(tipo)).toEqual(esperado)
    }
  })
})
