/**
 * N-BLACKOUT y N-AUDIENCIA (los dos defectos que dejó anotados la 1B, cerrados en la parte C
 * del ciclo, 2026-10-14) — y la audiencia del evento con «Incluir a los dormidos» (00073).
 *
 *   · N-BLACKOUT: `getActiveBlackouts()` se callaba los errores (devolvía `[]`: ese día ningún
 *     toque del ciclo se posponía por un evento) y cortaba los días en UTC (la ventana empezaba
 *     y terminaba a las 19:00 de Bogotá del día anterior).
 *   · N-AUDIENCIA: `findCustomersForEvent()` no paginaba: con más de 1.000 clientes PostgREST
 *     corta en silencio y la invitación —y el blackout del ciclo, que usa la MISMA audiencia— se
 *     quedaban con los primeros 1.000.
 *   · Con el ciclo encendido, un evento no les llega a los dormidos salvo la casilla.
 *
 * Un doble de supabase-js que hace lo que hace PostgREST: `max-rows` de 1.000 y `.range()`.
 *
 * Contra el código anterior: el error daba `[]`, los dos bordes de Bogotá daban al revés, la
 * audiencia de 1.200 daba 1.000 y `audienciaDelEvento()` no existía.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  eventos: [] as Array<Record<string, unknown>>,
  errorDeEventos: null as null | { message: string; code?: string },
  clientes: [] as Array<{ id: string; cycle_state: string }>,
  cicloEncendido: 'false',
  consultas: [] as Array<{ tabla: string; filtros: Array<[string, string, unknown]> }>,
}))

const MAX_ROWS = 1000

vi.mock('@supabase/supabase-js', () => {
  function consulta(tabla: string) {
    const filtros: Array<[string, string, unknown]> = []
    let rango: [number, number] | null = null
    h.consultas.push({ tabla, filtros })
    const q: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'is', 'in', 'gte', 'lte', 'ilike', 'order', 'neq']) {
      q[op] = (col?: string, val?: unknown) => {
        if (op !== 'select' && op !== 'order') filtros.push([op, String(col), val])
        return q
      }
    }
    q.range = (d: number, hasta: number) => {
      rango = [d, hasta]
      return q
    }
    q.then = (ok: (v: unknown) => unknown, mal?: (e: unknown) => unknown) => {
      let respuesta: { data: unknown; error: unknown }
      if (tabla === 'restaurant_events') respuesta = { data: h.errorDeEventos ? null : h.eventos, error: h.errorDeEventos }
      else if (tabla === 'admin_settings') respuesta = { data: [{ key: 'cycle_enabled', value: h.cicloEncendido }], error: null }
      else {
        const soloActivos = filtros.some(([op, c, v]) => op === 'eq' && c === 'cycle_state' && v === 'activo')
        const filas = h.clientes.filter((c) => !soloActivos || c.cycle_state === 'activo')
        const [d, hasta] = rango ?? [0, filas.length - 1]
        // PostgREST: nunca más de `max-rows` por respuesta, pida lo que pida.
        respuesta = { data: filas.slice(d, hasta + 1).slice(0, MAX_ROWS), error: null }
      }
      return Promise.resolve(respuesta).then(ok, mal)
    }
    return q
  }
  return { createClient: () => ({ from: consulta }) }
})

// `@/lib/tenant` importa el cliente SSR (cookies): fuera del alcance de estas pruebas.
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'

const { getActiveBlackouts } = await import('@/services/campaign.service')
const { findCustomersForEvent, audienciaDelEvento } = await import('@/services/calendar.service')

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000000'
const evento = (fecha: string, blackout = 5) => ({ id: `ev-${fecha}`, tenant_id: TENANT, event_date: fecha, blackout_days: blackout, status: 'scheduled' })

beforeEach(() => {
  h.eventos = []
  h.errorDeEventos = null
  h.clientes = []
  h.cicloEncendido = 'false'
  h.consultas = []
})

describe('N-BLACKOUT: un fallo de base no es «ningún evento»', () => {
  it('LANZA ante un error (antes devolvía [] y el toque del ciclo salía igual)', async () => {
    h.errorDeEventos = { message: 'canceling statement due to statement timeout', code: '57014' }
    await expect(getActiveBlackouts(TENANT, new Date('2026-10-14T20:00:00Z'))).rejects.toThrow(/blackout/)
  })
})

describe('N-BLACKOUT: la ventana se corta en días de Bogotá', () => {
  it('el domingo 11 a las 20:00 de Bogotá todavía NO está reservado para un evento del sábado 17 (5 días)', async () => {
    h.eventos = [evento('2026-10-17')]
    // 20:00 de Bogotá del 11 = 01:00 UTC del 12: en UTC ya «era» el 12 y el código viejo lo reservaba.
    expect(await getActiveBlackouts(TENANT, new Date('2026-10-11T20:00:00-05:00'))).toEqual([])
    expect(await getActiveBlackouts(TENANT, new Date('2026-10-12T00:30:00-05:00'))).toHaveLength(1)
  })

  it('el viernes 16 a las 20:00 de Bogotá SIGUE reservado (en UTC ya era el 17 y el viejo lo soltaba)', async () => {
    h.eventos = [evento('2026-10-17')]
    expect(await getActiveBlackouts(TENANT, new Date('2026-10-16T20:00:00-05:00'))).toHaveLength(1)
    // El día del evento ya no es blackout: es el evento.
    expect(await getActiveBlackouts(TENANT, new Date('2026-10-17T09:00:00-05:00'))).toEqual([])
  })

  it('pide los eventos desde HOY de Bogotá (no desde la fecha UTC)', async () => {
    h.eventos = []
    await getActiveBlackouts(TENANT, new Date('2026-10-16T20:00:00-05:00'))
    const filtros = h.consultas.find((c) => c.tabla === 'restaurant_events')!.filtros
    expect(filtros).toContainEqual(['gte', 'event_date', '2026-10-16'])
  })
})

describe('N-AUDIENCIA: la audiencia de un evento pagina', () => {
  it('con 1.200 clientes devuelve los 1.200 (PostgREST corta cada respuesta en 1.000)', async () => {
    h.clientes = Array.from({ length: 1200 }, (_, i) => ({ id: `c${String(i).padStart(5, '0')}`, cycle_state: 'activo' }))
    const audiencia = await findCustomersForEvent({}, TENANT)
    expect(audiencia).toHaveLength(1200)
    expect(new Set(audiencia.map((c) => c.id)).size).toBe(1200)
  })
})

describe('«Incluir a los dormidos» (00073): la MISMA audiencia para la invitación, el blackout y la pantalla', () => {
  beforeEach(() => {
    h.clientes = [
      { id: 'a', cycle_state: 'activo' },
      { id: 'd', cycle_state: 'dormido' },
      { id: 'x', cycle_state: 'archivado' },
    ]
  })

  it('con el ciclo ENCENDIDO y sin la casilla, solo los que están en el ciclo', async () => {
    h.cicloEncendido = 'true'
    expect((await audienciaDelEvento({ filters: {}, include_dormant: false }, TENANT)).map((c) => c.id)).toEqual(['a'])
  })

  it('con la casilla marcada, también los dormidos y los que ya no reciben nada automático', async () => {
    h.cicloEncendido = 'true'
    expect((await audienciaDelEvento({ filters: {}, include_dormant: true }, TENANT)).map((c) => c.id)).toEqual(['a', 'd', 'x'])
  })

  it('con el ciclo APAGADO la casilla no cambia nada: el evento le llega a todos, como siempre', async () => {
    h.cicloEncendido = 'false'
    expect(await audienciaDelEvento({ filters: {}, include_dormant: false }, TENANT)).toHaveLength(3)
  })
})
