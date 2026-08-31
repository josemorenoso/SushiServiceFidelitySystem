/**
 * Permisos de las funciones SECURITY DEFINER de 00037.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * La versión original de `00037_send_governance.sql` revocaba PUBLIC solo en
 * las dos funciones del AIOS y se olvidaba de las cuatro del núcleo. Como
 * Postgres concede EXECUTE a PUBLIC por defecto y las cuatro son SECURITY
 * DEFINER, quedaban invocables por `anon` — el rol de la
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY`, que viaja en el bundle del navegador— vía
 * RPC de PostgREST, y ejecutándose con los privilegios del dueño.
 *
 * Lo grave no era la lectura: era que `prune_send_governance()` BORRA
 * `send_reservations`, y borrar reservas REINICIA la ventana rodante de 24 h.
 * O sea: el freno que toda esta migración construye se podía desactivar desde
 * fuera con una clave pública.
 *
 * Se arregló en el bloque 13 de 00037. Esta prueba es el candado.
 */

import { describe, it, expect, afterAll } from 'vitest'
import { getPool, closePool } from '../setup/db'

/** El núcleo de gobernanza de envío: ningún rol de la aplicación debe poder
 *  ejecutarlas. Solo el service role, que se salta los permisos por definición. */
const PRIVADAS_DEL_NUCLEO = [
  'line_budget',
  'reserve_send_slot',
  'release_send_slot',
  'prune_send_governance',
  // De 00038 (cola de goteo). claim_send_queue y enqueue_send_queue son las más
  // sensibles: la primera LEE la cola entera de cualquier tenant (teléfonos,
  // plantilla, variables) y la arrienda; la segunda INYECTA envíos que el
  // drenador manda de verdad.
  'expire_send_queue',
  'send_queue_pending_tenants',
  'claim_send_queue',
  'send_queue_depth',
  'enqueue_send_queue',
]

/**
 * Las del AIOS. Las tres primeras vienen de `00036`, que **ya está aplicada en
 * producción**, y tenían el mismo agujero: `aios_provision_tenant()` CREA
 * TENANTS y era invocable con la clave pública del navegador. El bloque 10 de
 * `00038` las cierra desde la migración nueva, porque una ya aplicada no se
 * vuelve a correr.
 */
const PRIVADAS_DEL_AIOS = [
  'aios_provision_tenant',
  'aios_activate_whatsapp',
  'aios_set_template_settings',
  'aios_line_health',
  'aios_set_line_status',
]

describe('permisos de las funciones de 00037', () => {
  afterAll(async () => {
    await closePool()
  })

  it.each([...PRIVADAS_DEL_NUCLEO, ...PRIVADAS_DEL_AIOS])(
    '%s no es ejecutable por anon ni por authenticated',
    async (nombre) => {
      const { rows } = await getPool().query<{
        anon: boolean
        autenticado: boolean
        security_definer: boolean
      }>(
        `SELECT has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') AS autenticado,
                p.prosecdef                                               AS security_definer
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = $1`,
        [nombre]
      )

      expect(rows.length, `${nombre} no existe`).toBeGreaterThan(0)
      for (const fila of rows) {
        expect(fila.security_definer, `${nombre} debería ser SECURITY DEFINER`).toBe(true)
        expect(fila.anon, `anon NO debe poder ejecutar ${nombre}`).toBe(false)
        expect(fila.autenticado, `authenticated NO debe poder ejecutar ${nombre}`).toBe(false)
      }
    }
  )

  it('anon no puede vaciar send_reservations con prune_send_governance()', async () => {
    // La prueba de fondo, no solo la del catálogo de permisos: se siembra una
    // reserva vieja (podable) y se comprueba que sigue ahí después del intento.
    const db = getPool()
    const cliente = await db.connect()
    try {
      const {
        rows: [t],
      } = await cliente.query<{ id: string }>(
        `INSERT INTO tenants (slug, name) VALUES ($1, 'Tenant de permisos') RETURNING id`,
        [`test-permisos-${Date.now().toString(36)}`]
      )

      await cliente.query(
        `INSERT INTO send_reservations (tenant_id, phone, message_class, reserved_at)
         VALUES ($1, '+573001112233', 'campaign', now() - interval '30 days')`,
        [t.id]
      )

      await cliente.query('SET ROLE anon')
      await expect(cliente.query('SELECT prune_send_governance()')).rejects.toThrow(/permission denied/i)
      await cliente.query('RESET ROLE')

      const { rows } = await cliente.query<{ n: string }>(
        'SELECT COUNT(*) AS n FROM send_reservations WHERE tenant_id = $1',
        [t.id]
      )
      expect(Number(rows[0].n), 'la reserva vieja debe seguir en pie').toBe(1)

      await cliente.query('DELETE FROM send_reservations WHERE tenant_id = $1', [t.id])
      await cliente.query('DELETE FROM tenants WHERE id = $1', [t.id])
    } finally {
      // La conexión pudo quedar con SET ROLE si algo falló a mitad; devolverla
      // al pool sucia contaminaría otras pruebas.
      try {
        await cliente.query('RESET ROLE')
      } catch {
        /* la conexión ya está rota; el release la descarta */
      }
      cliente.release()
    }
  })

  it('consent_events es append-only: authenticated no puede UPDATE ni DELETE', async () => {
    // Spec §3.7: «un libro de evidencia que se puede editar no es evidencia».
    const { rows } = await getPool().query<{ update: boolean; delete: boolean }>(
      `SELECT has_table_privilege('authenticated', 'consent_events', 'UPDATE') AS update,
              has_table_privilege('authenticated', 'consent_events', 'DELETE') AS delete`
    )
    expect(rows[0].update).toBe(false)
    expect(rows[0].delete).toBe(false)
  })
})
