/**
 * Arreglos chicos del 15-10, grupo 2 · Lo que falla callado: un fallo nunca se ve como «0» ni
 * como «guardado» (`docs/prompts/2026-10-15-arreglos-chicos.md`).
 *
 *   · OPER-4-mudo: «Beneficios Black», «Sistema de puntos» y «Check-in» guardaban con un
 *     `catch` vacío: el 403 de un administrador de sede no se veía.
 *   · 0.ETA: la importación por CSV contaba como importados los que la base rechazó.
 *   · N-RADAR: `SegmentRadar` pintaba «NaN clientes» ante un 500 y contaba con una escala de
 *     días que no es la del ciclo. Se RETIRA (decisión de esta sesión): la pestaña Ciclo ya dice
 *     quién está en cada etapa con el motor.
 *
 * Las dos funciones nuevas reciben `fetch` por parámetro: se prueban con respuestas de verdad
 * (`Response`) sin red. Lo de las pantallas se fija leyendo su fuente, como en
 * `cycle-pantalla-b-render.test.ts` («lo que se retira ya no está»).
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { guardarAjuste, guardarAjustes, NO_SE_PUDO_GUARDAR } from '@/lib/guardar-ajustes'
import { importarCliente, resumenVacio, sumarFila, textoDelResumen } from '@/lib/importar-clientes-csv'

const RAIZ = join(__dirname, '..', '..')
const fuente = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')

const json = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })
const html = (status: number) => new Response('<html><body>Internal Server Error</body></html>', { status })

type Llamada = { url: string; body: Record<string, unknown> }
/** Un `fetch` que contesta en orden y anota lo que se le pidió. */
function fetchDe(...respuestas: Array<Response | Error>) {
  const llamadas: Llamada[] = []
  const f = async (url: string, init?: RequestInit) => {
    llamadas.push({ url, body: JSON.parse(String(init?.body ?? '{}')) })
    const r = respuestas.shift()
    if (!r) throw new Error('una llamada de más')
    if (r instanceof Error) throw r
    return r
  }
  return { f, llamadas }
}

const OPER4 = 'Los ajustes son de la marca: solo un super usuario puede cambiarlos.'

// ═══════════════════════════════════════════════════════════════
// OPER-4-mudo
// ═══════════════════════════════════════════════════════════════

describe('OPER-4-mudo: guardar un ajuste dice por qué no se guardó', () => {
  it('un 403 de OPER-4 lanza con el motivo del servidor, en español', async () => {
    const { f } = fetchDe(json(403, { error: OPER4 }))
    await expect(guardarAjuste('black_benefits', '[]', f)).rejects.toThrow(OPER4)
  })

  it('un 500 en HTML no sale como «Unexpected token <»: sale un texto que se entiende', async () => {
    const { f } = fetchDe(html(500))
    await expect(guardarAjuste('checkin_mode', 'auto', f)).rejects.toThrow(NO_SE_PUDO_GUARDAR)
  })

  it('sin red, igual', async () => {
    const { f } = fetchDe(new TypeError('Failed to fetch'))
    await expect(guardarAjuste('checkin_mode', 'auto', f)).rejects.toThrow(NO_SE_PUDO_GUARDAR)
  })

  it('una sección: todo bien → null (y manda cada clave con su valor)', async () => {
    const { f, llamadas } = fetchDe(json(200, { ok: true }), json(200, { ok: true }))
    expect(await guardarAjustes([['checkin_mode', 'auto'], ['checkin_first_visit_free', 'true']], f)).toBeNull()
    expect(llamadas.map((l) => l.body)).toEqual([
      { key: 'checkin_mode', value: 'auto' },
      { key: 'checkin_first_visit_free', value: 'true' },
    ])
  })

  it('el administrador de sede (403 en todas): el motivo, nunca «Guardado»', async () => {
    const { f } = fetchDe(...Array.from({ length: 8 }, () => json(403, { error: OPER4 })))
    const pares = Array.from({ length: 8 }, (_, i) => [`k${i}`, 'v'] as const)
    expect(await guardarAjustes(pares, f)).toBe(OPER4)
  })

  it('si una de ocho falla, lo dice y cuenta cuántas no se guardaron', async () => {
    const respuestas = Array.from({ length: 8 }, (_, i) => (i === 5 ? json(500, { error: 'Error guardando configuración' }) : json(200, {})))
    const { f } = fetchDe(...respuestas)
    const pares = Array.from({ length: 8 }, (_, i) => [`k${i}`, 'v'] as const)
    const error = await guardarAjustes(pares, f)
    expect(error).toMatch(/^Error guardando configuración/)
    expect(error).toMatch(/no se guardaron 1 de 8/)
  })

  it('Configuración ya no tiene un `catch` vacío, y las tres secciones guardan por `guardarAjustes()`', () => {
    const page = fuente('src/app/(dashboard)/dashboard/settings/page.tsx')
    expect(page).not.toMatch(/catch\s*\{\s*\/\*\s*silent\s*\*\/\s*\}/)
    for (const handler of ['handleSaveBenefits', 'handleSavePoints', 'handleSaveCheckin']) {
      const cuerpo = page.slice(page.indexOf(`const ${handler}`), page.indexOf(`const ${handler}`) + 1200)
      expect(cuerpo, handler).toMatch(/guardarAjustes\(/)
      expect(cuerpo, handler).toMatch(/Error\(error\)/)
    }
    expect(page).toMatch(/<ErrorDeGuardado mensaje=\{benefitsError\}/)
    expect(page).toMatch(/<ErrorDeGuardado mensaje=\{pointsError\}/)
    expect(page).toMatch(/<ErrorDeGuardado mensaje=\{checkinError\}/)
  })

  it('si LEER la configuración falla, la pantalla lo dice (no muestra los valores de fábrica como si fueran los tuyos)', () => {
    const page = fuente('src/app/(dashboard)/dashboard/settings/page.tsx')
    expect(page).toMatch(/if \(!r\.ok\) throw/)
    expect(page).toMatch(/No pudimos leer tu configuración/)
  })
})

// ═══════════════════════════════════════════════════════════════
// 0.ETA
// ═══════════════════════════════════════════════════════════════

describe('0.ETA: la importación por CSV solo cuenta lo que la base aceptó', () => {
  it('no existía y se registró → importado', async () => {
    const { f, llamadas } = fetchDe(json(200, { found: false }), json(200, { success: true }))
    expect(await importarCliente('3001234567', 'Ana', f)).toEqual({ tipo: 'importado' })
    expect(llamadas.map((l) => l.body.action)).toEqual(['lookup', 'register'])
  })

  it('con 2+ sedes el registro contesta 409: NO es importado, y se dice por qué', async () => {
    const motivo = 'Esta marca tiene varias sedes: elige en cuál estás.'
    const { f } = fetchDe(json(200, { found: false }), json(409, { error: 'Elige tu sede', message: motivo }))
    expect(await importarCliente('3001234567', 'Ana', f)).toEqual({ tipo: 'fallo', motivo })
  })

  it('un 500 del registro tampoco', async () => {
    const { f } = fetchDe(json(200, { found: false }), html(500))
    expect(await importarCliente('3001234567', 'Ana', f)).toEqual({ tipo: 'fallo', motivo: 'error 500' })
  })

  it('si la consulta previa falla, no se lee como «no existe» (y no se intenta registrar)', async () => {
    const { f, llamadas } = fetchDe(json(503, { error: 'Problema técnico' }))
    expect(await importarCliente('3001234567', 'Ana', f)).toEqual({ tipo: 'fallo', motivo: 'Problema técnico' })
    expect(llamadas).toHaveLength(1)
  })

  it('ya existía → «ya existía», no «importado»', async () => {
    const { f } = fetchDe(json(200, { found: true }))
    expect(await importarCliente('3001234567', 'Ana', f)).toEqual({ tipo: 'ya-existia' })
  })

  it('el resumen: con un fallo es un error que lo cuenta aparte, nunca un «Importados: N» verde', () => {
    let r = resumenVacio()
    r = sumarFila(r, { tipo: 'importado' })
    r = sumarFila(r, { tipo: 'ya-existia' })
    r = sumarFila(r, { tipo: 'fallo', motivo: 'Elige tu sede' })
    r = sumarFila(r, { tipo: 'fallo', motivo: 'otro' })
    r = { ...r, invalidos: 2 }
    expect(textoDelResumen(r)).toEqual({
      tipo: 'error',
      texto: 'Importados: 1 · ya existían: 1 · inválidos: 2 · NO se importaron: 2 (Elige tu sede).',
    })
    expect(textoDelResumen({ ...resumenVacio(), importados: 3 })).toEqual({
      tipo: 'exito',
      texto: 'Importados: 3 · ya existían: 0 · inválidos: 0',
    })
  })

  it('Clientes importa por `importarCliente()` (ya no suma «importados» tras un `fetch` sin mirar)', () => {
    const page = fuente('src/app/(dashboard)/dashboard/customers/page.tsx')
    expect(page).toMatch(/importarCliente\(phone, name\)/)
    expect(page).not.toMatch(/imported\+\+/)
  })
})

// ═══════════════════════════════════════════════════════════════
// N-RADAR
// ═══════════════════════════════════════════════════════════════

describe('N-RADAR: el radar de segmentos se retira (la pestaña Ciclo lo cubre con el motor)', () => {
  it('ni el componente ni su endpoint existen', () => {
    expect(existsSync(join(RAIZ, 'src/components/dashboard/SegmentRadar.tsx'))).toBe(false)
    expect(existsSync(join(RAIZ, 'src/app/api/dashboard/campaigns/segments/route.ts'))).toBe(false)
  })

  it('«Mensaje libre» ya no lo dibuja ni lo importa; el cupo y el asistente siguen', () => {
    const page = fuente('src/app/(dashboard)/dashboard/campaigns/page.tsx')
    expect(page).not.toMatch(/import \{ SegmentRadar \}/)
    expect(page).not.toMatch(/<SegmentRadar/)
    expect(page).toMatch(/<CupoEnvioCard \/>/)
    expect(page).toMatch(/<ManualCampaigns \/>/)
  })
})
