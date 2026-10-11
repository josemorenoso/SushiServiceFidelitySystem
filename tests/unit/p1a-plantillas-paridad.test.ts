/**
 * OPER-6 — paridad entre el catálogo de plantillas y los punteros que el código consume
 * (2026-10-11).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * Un puntero `admin_settings.*_template_sid` que el código lee pero el catálogo
 * (`src/constants/template-catalog.ts`) no define es un mensaje que ninguna pantalla Zernio
 * puede crear: en esas marcas, ese momento del cliente es silencio. Así nació el agujero de
 * `tier_unlocked_template_sid` (subir de nivel = silencio total en Zernio;
 * `docs/PENDIENTES-PLANTILLAS.md` §1.2). Este test hace que el próximo no entre callado.
 *
 * QUÉ FIJA
 * ────────
 *   · Toda clave de puntero que aparece en `src/` está en el catálogo, o en EXCEPCIONES.
 *   · Cada excepción sigue existiendo en el código (si alguien la retira, sale de acá) y
 *     ninguna está ya en el catálogo (si entra, sale de acá).
 *   · Cada puntero del catálogo lo consume alguien fuera del catálogo (un puntero que nadie
 *     lee es una plantilla que se aprueba y no sale nunca).
 *
 * 2026-10-11 (plantillas: un solo libro): `tier_unlocked_template_sid` y
 * `reward_reminder_template_sid` ENTRARON al catálogo (decisión B3 del dueño) y salieron de
 * las excepciones. Quedan las dos legacy de reactivación, que no entran: las retira la fase
 * 1B del ciclo. Y entró `gift_expiring_template_sid` («Regalo que vence»), que todavía no
 * manda nadie: es la otra lista de abajo.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { TEMPLATE_CATALOG } from '@/constants/template-catalog'

/**
 * Punteros que el código consume y el catálogo no cubre, cada uno con su porqué. Un tercero
 * fuera del catálogo hace fallar este test: o entra al catálogo, o se anota acá.
 */
const EXCEPCIONES_CONOCIDAS: Record<string, string> = {
  // El cron de reactivación todavía la lee (6b, con premio). No entra al catálogo: la fase 1B
  // del ciclo reemplaza la reactivación por el ciclo y la retira (prompt del 11-10, punto 2).
  reactivation_with_reward_template_sid: 'legacy: reactivación con premio — la retira la fase 1B del ciclo',
  // La clave anterior a la 00031; el cron la usa de último respaldo. Mismo destino.
  reactivation_template_sid: 'legacy: reactivación de antes de la 00031 — la retira la fase 1B del ciclo',
}

/**
 * Punteros DEL CATÁLOGO que todavía no manda nadie, cada uno con quién lo va a mandar. Entran
 * antes que su emisor para que cada marca haga UN solo viaje a Meta (decisión B6). Cuando el
 * emisor llegue, la prueba de abajo obliga a sacarlo de acá.
 */
const SIN_EMISOR_TODAVIA: Record<string, string> = {
  gift_expiring_template_sid: '«Regalo que vence» — la empieza a mandar la fase 1B del ciclo de recuperación',
}

const RAIZ = path.resolve(import.meta.dirname, '../..')
const CATALOGO = path.join(RAIZ, 'src/constants/template-catalog.ts')

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return archivos(p)
    return /\.tsx?$/.test(e.name) ? [p] : []
  })
}

/** Un literal de puntero: `'…_template_sid'` o los de evento, `'event_template_…_sid'`. */
const PUNTERO = /['"`]([a-z0-9_]+_template_sid|event_template_[a-z0-9_]+_sid)['"`]/g

/** Los punteros que nombra el CÓDIGO: una mención en un comentario no consume nada. */
function punterosEn(src: string): string[] {
  const codigo = src
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join('\n')
  return [...codigo.matchAll(PUNTERO)].map((m) => m[1])
}

/** Puntero → archivos de `src/` (fuera del catálogo) que lo nombran. */
function punterosDelCodigo(): Map<string, string[]> {
  const usos = new Map<string, string[]>()
  for (const f of archivos(path.join(RAIZ, 'src'))) {
    if (path.resolve(f) === path.resolve(CATALOGO)) continue
    for (const k of punterosEn(fs.readFileSync(f, 'utf8'))) {
      usos.set(k, [...(usos.get(k) ?? []), path.relative(RAIZ, f)])
    }
  }
  return usos
}

const DEL_CATALOGO = new Set(TEMPLATE_CATALOG.map((t) => t.settingsKey))
const USOS = punterosDelCodigo()

describe('OPER-6 · catálogo ↔ punteros que consume el código', () => {
  it('el detector reconoce un puntero nuevo (control: si esto falla, el test de abajo no prueba nada)', () => {
    expect(punterosEn(`settings.nuevo_mensaje_template_sid ?? getSetting('nuevo_mensaje_template_sid')`)).toEqual([
      'nuevo_mensaje_template_sid',
    ])
    expect(punterosEn(`'event_template_image_sid'`)).toEqual(['event_template_image_sid'])
    expect(punterosEn(` * la legacy \`viejo_template_sid\` ya no se escribe`)).toEqual([])
  })

  it('todo puntero que nombra el código está en el catálogo o es una excepción conocida', () => {
    const huerfanos = [...USOS.keys()].filter((k) => !DEL_CATALOGO.has(k) && !(k in EXCEPCIONES_CONOCIDAS))
    expect(
      huerfanos.map((k) => `${k} (en ${USOS.get(k)!.join(', ')})`),
      'Un puntero nuevo fuera del catálogo: agregarlo a TEMPLATE_CATALOG, o a EXCEPCIONES_CONOCIDAS con su porqué'
    ).toEqual([])
  })

  it('cada excepción sigue viva en el código y todavía no entró al catálogo', () => {
    for (const k of Object.keys(EXCEPCIONES_CONOCIDAS)) {
      expect(USOS.has(k), `${k} ya no aparece en src/: sacarla de EXCEPCIONES_CONOCIDAS`).toBe(true)
      expect(DEL_CATALOGO.has(k), `${k} ya está en el catálogo: sacarla de EXCEPCIONES_CONOCIDAS`).toBe(false)
    }
  })

  it('cada puntero del catálogo lo consume alguien fuera del catálogo (salvo los que esperan emisor)', () => {
    const muertos = [...DEL_CATALOGO].filter((k) => !USOS.has(k) && !(k in SIN_EMISOR_TODAVIA))
    expect(muertos).toEqual([])
  })

  it('«Nivel desbloqueado» y «Recordatorio de premio» ya están en el catálogo (B3)', () => {
    // Hasta el 2026-10-11 el código las leía y el catálogo no las definía: en una marca
    // Zernio, subir de nivel era silencio total y el recordatorio de premio no salía.
    expect(DEL_CATALOGO.has('tier_unlocked_template_sid')).toBe(true)
    expect(DEL_CATALOGO.has('reward_reminder_template_sid')).toBe(true)
  })

  it('lo que espera emisor está en el catálogo y de verdad nadie lo manda todavía', () => {
    for (const k of Object.keys(SIN_EMISOR_TODAVIA)) {
      expect(DEL_CATALOGO.has(k), `${k} no está en el catálogo`).toBe(true)
      expect(USOS.has(k), `${k} ya tiene emisor (${USOS.get(k)?.join(', ')}): sacarlo de SIN_EMISOR_TODAVIA`).toBe(false)
    }
  })
})
