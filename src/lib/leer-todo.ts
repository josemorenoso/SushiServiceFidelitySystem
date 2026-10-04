/**
 * Leer "todas las filas" de PostgREST sin que lo corte en silencio.
 *
 * POR QUÉ EXISTE
 * ──────────────
 * PostgREST corta TODA respuesta en 1.000 filas (`max-rows` de Supabase) y lo hace en
 * silencio: una base de 7.438 contactos leída de un tirón devuelve 1.000 y el tablero
 * cuenta mal sin que ningún error lo diga. Todo lo que lea "todas las filas" de algo que
 * puede pasar de mil (la base del Golden Bullet, las visitas de seis meses, los mensajes de
 * campaña) pasa por acá.
 *
 * Nació en `imported-contacts.service.ts` (2026-09-12) y salió a `src/lib/` el 2026-10-04
 * para que la analítica del panel (`getFullAnalytics()`, ESCALA-4) lo comparta. El cuerpo
 * es el mismo, sin cambios.
 *
 * REGLAS DE USO
 * ─────────────
 *   · La consulta tiene que venir ORDENADA por algo estable y único (una PK, o una columna
 *     que no cambie más una PK de desempate). Sin orden —o con uno que empata— las páginas
 *     se pisan: una fila sale dos veces y otra ninguna, sin error.
 *   · Si una página falla devuelve lo leído hasta ahí MÁS el `error`: quien llama tiene que
 *     mirarlo. Un fallo a la mitad no puede verse como "esa era toda la base".
 *   · Cada página es una ida a la base: para lo que cabe en una (un solo registro, un conteo)
 *     no se usa.
 */

import type { PostgrestError } from '@supabase/supabase-js'

export const PAGINA = 1000

export async function leerTodo<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const todo: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pagina(desde, desde + PAGINA - 1)
    if (error) return { data: todo, error }
    const filas = data ?? []
    todo.push(...filas)
    if (filas.length < PAGINA) break
  }
  return { data: todo, error: null }
}
