/**
 * `leerTodo()` — el helper que lee «todas las filas» sin que PostgREST las corte en 1.000.
 *
 * Salió de `imported-contacts.service.ts` a `src/lib/` (2026-10-04) para compartirlo con la
 * analítica del panel. Sus bordes no tenían prueba propia: los cubría, de rebote, nada. Ahora que
 * lo usan dos módulos, se fijan aquí: el múltiplo exacto de 1.000 (donde un `<` mal escrito pierde
 * o duplica una página), el vacío, y el error a mitad de camino, que NO puede verse como «esa era
 * toda la base».
 */

import { describe, it, expect } from 'vitest'
import type { PostgrestError } from '@supabase/supabase-js'
import { leerTodo, PAGINA } from '@/lib/leer-todo'

/** Una «tabla» de `n` filas servida como PostgREST: nunca más de `PAGINA` por respuesta. */
function tabla(n: number, falla?: (desde: number) => PostgrestError | null) {
  const pedidos: Array<[number, number]> = []
  const pagina = async (desde: number, hasta: number) => {
    pedidos.push([desde, hasta])
    const error = falla?.(desde) ?? null
    if (error) return { data: null, error }
    const filas = Array.from({ length: n }, (_, i) => ({ id: i })).slice(desde, hasta + 1).slice(0, PAGINA)
    return { data: filas, error: null }
  }
  return { pagina, pedidos }
}

describe('leerTodo()', () => {
  it('une las páginas hasta llegar a una corta, sin repetir ni saltarse filas', async () => {
    const { pagina, pedidos } = tabla(2300)

    const { data, error } = await leerTodo(pagina)

    expect(error).toBeNull()
    expect(data).toHaveLength(2300)
    expect(data.map((f) => f.id)).toEqual(Array.from({ length: 2300 }, (_, i) => i))
    expect(pedidos).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('con un múltiplo exacto de 1.000 pide UNA página más y termina en la vacía', async () => {
    const { pagina, pedidos } = tabla(2000)

    const { data } = await leerTodo(pagina)

    expect(data).toHaveLength(2000)
    expect(pedidos).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('lo que cabe en una página hace UNA sola ida', async () => {
    for (const n of [0, 1, 999]) {
      const { pagina, pedidos } = tabla(n)
      const { data, error } = await leerTodo(pagina)
      expect(data).toHaveLength(n)
      expect(error).toBeNull()
      expect(pedidos, `con ${n} filas`).toEqual([[0, 999]])
    }
  })

  it('si una página falla devuelve lo leído hasta ahí MÁS el error, y no sigue', async () => {
    const boom = { message: 'statement timeout', code: '57014' } as unknown as PostgrestError
    const { pagina, pedidos } = tabla(3500, (desde) => (desde === 1000 ? boom : null))

    const { data, error } = await leerTodo(pagina)

    expect(error).toBe(boom)
    // Lo leído NO es toda la base: quien llama tiene que mirar el error.
    expect(data).toHaveLength(1000)
    expect(pedidos).toEqual([[0, 999], [1000, 1999]])
  })

  it('un `data: null` sin error cuenta como página vacía, no como fallo', async () => {
    const { data, error } = await leerTodo(async () => ({ data: null, error: null }))

    expect(data).toEqual([])
    expect(error).toBeNull()
  })
})
