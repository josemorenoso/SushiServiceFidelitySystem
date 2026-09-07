/**
 * La carrera de `claimScheduledEvent()` — AMARILLO 3 de la auditoría del 2026-09-06.
 *
 * QUÉ BUG REPRODUCE
 * ─────────────────
 * `executeAutoEvent()` reclamaba el evento así:
 *
 *     const { error: claimError } = await supabase
 *       .from('restaurant_events').update({ status: 'sent' })
 *       .eq('id', eventId).eq('status', 'scheduled')
 *     if (claimError) throw ...
 *
 * El UPDATE es atómico, así que de N llamadas concurrentes solo UNA toca la fila. Pero
 * las otras N-1 **tampoco dan error**: para Postgres, actualizar cero filas es un éxito
 * perfecto. Como el código solo miraba `error`, las N seguían adelante y despachaban el
 * mismo evento N veces — cada cliente recibía la invitación repetida.
 *
 * `calendar-dispatch` corre cada 15 minutos y NO tolera el doble disparo, a diferencia de
 * `queue-drain` (que sí, vía `FOR UPDATE SKIP LOCKED`) — docs/features/send-governance.md.
 *
 * POR QUÉ CONTRA POSTGRES DE VERDAD Y NO CONTRA UN MOCK
 * ────────────────────────────────────────────────────
 * Lo que se mide es una garantía del MOTOR: que dos UPDATE con la misma guarda de estado
 * se serialicen y solo uno vea la fila en `scheduled`. Un doble no la tiene — probaría el
 * doble. Por eso el adaptador de abajo habla `pg` directo, con una CONEXIÓN por llamada
 * (que es como supabase-js emite cada RPC), y ejecuta la función REAL del producto.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import { claimScheduledEvent, type EventClaimClient } from '@/services/calendar.service'

/**
 * Implementa el trozo de supabase-js que `claimScheduledEvent()` usa, sobre `pg`.
 *
 * Es deliberadamente tonto: traduce la cadena `.from().update().eq().eq().select()` a un
 * único `UPDATE … RETURNING`, que es exactamente lo que PostgREST emite en producción. No
 * simula nada — la concurrencia la resuelve el Postgres de verdad que hay detrás.
 */
function clienteSobrePg(): EventClaimClient {
  return {
    from(table: string) {
      return {
        update(patch: { status: string }) {
          const filtros: Array<[string, string]> = []
          const builder = {
            eq(columna: string, valor: string) {
              filtros.push([columna, valor])
              return builder as never
            },
            // Sin parámetro a propósito: la interfaz declara `select(columns: string)`, y
            // una función que acepta menos argumentos sigue siendo asignable. El UPDATE
            // devuelve siempre `id`, así que la lista de columnas no cambiaría nada.
            async select() {
              // `filtros` llega como [['id', …], ['status', 'scheduled']].
              const where = filtros.map(([c], i) => `${c} = $${i + 2}`).join(' AND ')
              const valores = filtros.map(([, v]) => v)
              try {
                const { rows } = await getPool().query<{ id: string }>(
                  `UPDATE ${table} SET status = $1 WHERE ${where} RETURNING id`,
                  [patch.status, ...valores]
                )
                return { data: rows, error: null }
              } catch (err) {
                return {
                  data: null,
                  error: { message: err instanceof Error ? err.message : String(err) },
                }
              }
            },
          }
          return builder as never
        },
      }
    },
  }
}

/** Un evento listo para disparo: `send_mode='auto'` + `status='scheduled'`. */
async function crearEventoProgramado(tenantId: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO restaurant_events
       (title, event_date, event_type, send_mode, scheduled_send_at, status, tenant_id)
     VALUES ('Festival de prueba', current_date, 'festival', 'auto', now(), 'scheduled', $1)
     RETURNING id`,
    [tenantId]
  )
  return rows[0].id
}

async function estadoDe(eventId: string): Promise<string> {
  const { rows } = await getPool().query<{ status: string }>(
    'SELECT status FROM restaurant_events WHERE id = $1',
    [eventId]
  )
  return rows[0].status
}

describe('claimScheduledEvent() bajo concurrencia', () => {
  let tenant: TestTenant

  beforeAll(async () => {
    tenant = await createTestTenant()
  })

  afterAll(async () => {
    // `dropTestTenant()` no toca restaurant_events y la tabla lleva `tenant_id` con
    // ON DELETE RESTRICT (00025): sin este DELETE, borrar el tenant falla.
    await getPool().query('DELETE FROM restaurant_events WHERE tenant_id = $1', [tenant.id])
    await dropTestTenant(tenant.id)
    await closePool()
  })

  it('con 8 disparadores simultáneos, exactamente UNO gana el evento', async () => {
    const eventId = await crearEventoProgramado(tenant.id)
    const cliente = clienteSobrePg()

    const resultados = await Promise.all(
      Array.from({ length: 8 }, () => claimScheduledEvent(cliente, eventId))
    )

    // ── La aserción que cierra el bug ──
    // Antes del arreglo esto daba 8: ninguna llamada fallaba, así que las 8 creían haber
    // ganado y las 8 despachaban.
    expect(resultados.filter((gano) => gano === true)).toHaveLength(1)
    expect(resultados.filter((gano) => gano === false)).toHaveLength(7)

    // Y el evento quedó reclamado una sola vez.
    expect(await estadoDe(eventId)).toBe('sent')
  })

  it('ninguna de las perdedoras lanza: el error NO es la señal de haber perdido', async () => {
    const eventId = await crearEventoProgramado(tenant.id)
    const cliente = clienteSobrePg()

    // `allSettled`, no `all`: lo que se mide es justamente que NADIE se rechace. Esta es
    // la razón exacta por la que mirar solo `error` no alcanzaba — perder la carrera es
    // indistinguible de ganarla si no se cuentan las filas afectadas.
    const asentados = await Promise.allSettled(
      Array.from({ length: 8 }, () => claimScheduledEvent(cliente, eventId))
    )

    expect(asentados.every((r) => r.status === 'fulfilled')).toBe(true)
  })

  it('reclamar un evento que ya está en otro estado devuelve false, no error', async () => {
    const eventId = await crearEventoProgramado(tenant.id)
    await getPool().query(`UPDATE restaurant_events SET status = 'cancelled' WHERE id = $1`, [
      eventId,
    ])

    // Es el camino del reintento manual desde el dashboard sobre un evento ya cancelado:
    // tiene que salir sin reclamar y sin romperse.
    await expect(claimScheduledEvent(clienteSobrePg(), eventId)).resolves.toBe(false)
    expect(await estadoDe(eventId)).toBe('cancelled')
  })

  it('un fallo real de la base SÍ lanza (no se confunde con perder la carrera)', async () => {
    // Un id que no es un uuid hace fallar el cast en Postgres (22P02). El contrato es:
    // `false` = perdí la carrera · excepción = la base falló de verdad.
    await expect(
      claimScheduledEvent(clienteSobrePg(), 'esto-no-es-un-uuid')
    ).rejects.toThrow(/No se pudo reclamar evento/)
  })
})
