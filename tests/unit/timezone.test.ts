/**
 * `src/lib/timezone.ts` — el único sitio donde se convierte entre la hora que escribe un
 * admin y el instante absoluto que guarda la base.
 *
 * QUÉ PROTEGE
 * ───────────
 * El bug del AMARILLO 1 (auditoría 2026-09-06): `EventCreateDialog` hacía
 * `new Date(scheduledSendAt).toISOString()` sobre el valor de un `<input type="datetime-local">`,
 * que **no lleva huso**. `new Date()` lo interpreta entonces en la zona del NAVEGADOR. Desde
 * Bogotá coincidía por casualidad; desde cualquier otra zona el instante guardado se corría y el
 * cron disparaba a una hora que nadie decidió.
 *
 * Por eso lo que estas pruebas fijan no es "el formato": es que el resultado **no dependa de la
 * zona de la máquina que corre el código**. Un test que solo pasara en un portátil configurado en
 * Bogotá reproduciría el bug en vez de atraparlo.
 */

import { describe, it, expect } from 'vitest'
import {
  APP_TIMEZONE,
  APP_UTC_OFFSET,
  appLocalInputToISO,
  appEndOfDay,
  formatInAppTz,
} from '@/lib/timezone'

describe('APP_TIMEZONE / APP_UTC_OFFSET', () => {
  it('son coherentes entre sí', () => {
    expect(APP_TIMEZONE).toBe('America/Bogota')
    // Colombia no tiene DST: el offset es constante todo el año. Si esto cambiara, `appEndOfDay`
    // y `appLocalInputToISO` —que pegan el offset a un literal— dejarían de servir.
    expect(APP_UTC_OFFSET).toBe('-05:00')
  })

  it('el offset coincide con la zona en enero Y en julio (o sea: no hay horario de verano)', () => {
    for (const mes of ['01', '07']) {
      const enBogota = new Date(`2026-${mes}-15T12:00:00${APP_UTC_OFFSET}`)
        .toLocaleString('sv-SE', { timeZone: APP_TIMEZONE })
      expect(enBogota).toBe(`2026-${mes}-15 12:00:00`)
    }
  })
})

describe('appLocalInputToISO()', () => {
  it('ancla la hora a Bogotá, no a la zona del navegador', () => {
    // 2:30 pm en Bogotá (UTC-5) son las 19:30 UTC. Este es EXACTAMENTE el caso que se rompía.
    expect(appLocalInputToISO('2026-09-10T14:30')).toBe('2026-09-10T19:30:00.000Z')
  })

  it('acepta el formato con segundos que algunos navegadores mandan', () => {
    expect(appLocalInputToISO('2026-09-10T14:30:45')).toBe('2026-09-10T19:30:45.000Z')
  })

  it('cruza bien la medianoche hacia el día siguiente en UTC', () => {
    // 8:00 pm en Bogotá ya es el día SIGUIENTE a la 1:00 UTC.
    expect(appLocalInputToISO('2026-09-10T20:00')).toBe('2026-09-11T01:00:00.000Z')
  })

  it('el resultado NO depende de la zona horaria del proceso', () => {
    const original = process.env.TZ
    const resultados: Array<string | null> = []
    try {
      for (const tz of ['UTC', 'Europe/Madrid', 'Asia/Tokyo', 'America/Bogota']) {
        process.env.TZ = tz
        resultados.push(appLocalInputToISO('2026-09-10T14:30'))
      }
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
    // Todas iguales: es el corazón del arreglo. Con `new Date('2026-09-10T14:30')` estas cuatro
    // habrían dado cuatro instantes distintos.
    expect(new Set(resultados).size).toBe(1)
    expect(resultados[0]).toBe('2026-09-10T19:30:00.000Z')
  })

  it('devuelve null si el valor no tiene forma de datetime-local', () => {
    for (const malo of ['', '   ', '2026-09-10', 'mañana a las 3', '10/09/2026 14:30', '2026-09-10 14:30']) {
      expect(appLocalInputToISO(malo)).toBeNull()
    }
  })

  it('devuelve null para una fecha con forma válida pero inexistente', () => {
    // El 31 de febrero pasa el regex pero no es una fecha: tiene que salir null, no un instante
    // inventado por el rollover de `Date`.
    expect(appLocalInputToISO('2026-02-31T10:00')).toBeNull()
  })

  it('tolera espacios alrededor', () => {
    expect(appLocalInputToISO('  2026-09-10T14:30  ')).toBe('2026-09-10T19:30:00.000Z')
  })
})

describe('appEndOfDay()', () => {
  it('cierra el día a las 23:59:59 de Bogotá, no de UTC', () => {
    // El bug que reemplaza: con `T23:59:59Z` el día se cerraba a las 6:59 pm locales, así que un
    // envío programado el mismo día del evento a las 8 pm se rechazaba.
    expect(appEndOfDay('2026-09-10').toISOString()).toBe('2026-09-11T04:59:59.000Z')
  })

  it('un envío a las 8 pm del día del evento cae DENTRO del día', () => {
    const envio = new Date(appLocalInputToISO('2026-09-10T20:00')!)
    expect(envio.getTime()).toBeLessThanOrEqual(appEndOfDay('2026-09-10').getTime())
  })

  it('un envío del día siguiente cae FUERA', () => {
    const envio = new Date(appLocalInputToISO('2026-09-11T08:00')!)
    expect(envio.getTime()).toBeGreaterThan(appEndOfDay('2026-09-10').getTime())
  })
})

describe('formatInAppTz()', () => {
  it('muestra la hora de Bogotá aunque el instante venga en UTC', () => {
    // 19:30 UTC son las 2:30 pm en Bogotá.
    const texto = formatInAppTz('2026-09-10T19:30:00.000Z', { hour: '2-digit', minute: '2-digit' })
    expect(texto).toMatch(/02:30/)
  })

  it('no adelanta el día calendario de noche en Colombia', () => {
    // 03:00 UTC del día 11 son las 10:00 pm del día 10 en Bogotá. Sin `timeZone`, un servidor en
    // UTC diría "11" — que es el bug que APP_TIMEZONE existe para evitar.
    const texto = formatInAppTz('2026-09-11T03:00:00.000Z', { day: '2-digit', month: '2-digit' })
    expect(texto).toContain('10')
    expect(texto).not.toContain('11')
  })

  it('devuelve — si la fecha es inválida, en vez de "Invalid Date"', () => {
    expect(formatInAppTz('no soy una fecha', { hour: '2-digit' })).toBe('—')
  })
})
