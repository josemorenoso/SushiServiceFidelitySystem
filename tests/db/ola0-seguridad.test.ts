/**
 * Ola 0 de la auditoría (2026-09-28): nada en `public` abierto a la anon key.
 *
 * Migración: supabase/migrations/00069_ola0_cierra_anon.sql
 * Origen: docs/AUDITORIA-ESCALA-1000-2026-09-28.md §1.2 (AISLA-2) y §6 (OPUS-4).
 *
 * POR QUÉ ESTE ARCHIVO, SI YA EXISTE `permisos.test.ts`
 * ─────────────────────────────────────────────────────
 * `permisos.test.ts` vigila una LISTA de funciones con nombre. La 00057 y la
 * 00067 nacieron después de esa lista, revocaron solo `FROM PUBLIC` (que en
 * Supabase deja el EXECUTE nominal de `anon`, ver `tests/setup/bootstrap.sql`)
 * y nadie lo vio: la lista no las conocía. Esta prueba da vuelta la pregunta:
 * **toda** `SECURITY DEFINER` de `public` está cerrada, salvo una lista
 * explícita de helpers de RLS. Una función nueva que se olvide del REVOKE hace
 * fallar la suite sin que nadie tenga que acordarse de anotarla.
 *
 * Y la 00015: sus cinco políticas `service_role_*` son `USING (true)` SIN
 * `TO service_role`, así que valen para `anon`. **En orden no hacen daño**: la
 * 00026 borra TODAS las políticas de `customers` y `visits` por nombre dinámico
 * (`00026_multitenant_rls.sql:38-43`), así que el arnés —que aplica el
 * directorio en orden— nunca las ve. El agujero aparece si se pegó la 00015
 * DESPUÉS de la 00026, que es lo que pudo pasar el 29 al «aplicar todas las
 * pendientes» (`ESTADO.md` la tenía marcada «NO se aplica»). La prueba
 * reproduce ese orden dentro de una transacción y la deshace al final.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { PoolClient } from 'pg'
import { describe, it, expect, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant } from '../setup/db'

/**
 * Las ÚNICAS `SECURITY DEFINER` de `public` que `anon`/`authenticated` pueden
 * ejecutar. Son helpers de RLS: las políticas se evalúan COMO el rol que
 * consulta, así que quitarles EXECUTE convierte cada SELECT del panel en un
 * «permission denied». Solo leen el JWT de quien llama o cuentan sedes.
 * Agregar una acá es una decisión de seguridad, no un arreglo de test.
 */
const HELPERS_DE_RLS = [
  'is_super_admin()',
  'can_see_location(uuid)',
  'current_dashboard_user_id()',
  'tenant_active_location_count(uuid)',
]

const POLITICAS_00015 = [
  'service_role_select_customers',
  'service_role_insert_customers',
  'service_role_update_customers',
  'service_role_select_visits',
  'service_role_insert_visits',
]

function migracion(numero: string): string {
  const dir = path.resolve(__dirname, '../../supabase/migrations')
  const archivo = fs.readdirSync(dir).find((f) => f.startsWith(`${numero}_`))
  if (!archivo) throw new Error(`No existe supabase/migrations/${numero}_*.sql`)
  return fs.readFileSync(path.join(dir, archivo), 'utf8')
}

const migracion00069 = () => migracion('00069')

interface Abierta {
  funcion: string
  anon: boolean
  autenticado: boolean
}

async function securityDefinerAbiertas(): Promise<Abierta[]> {
  const { rows } = await getPool().query<Abierta>(
    `SELECT p.oid::regprocedure::text                                AS funcion,
            has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') AS autenticado
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef
        AND (has_function_privilege('anon', p.oid, 'EXECUTE')
             OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      ORDER BY 1`
  )
  return rows.filter((r) => !HELPERS_DE_RLS.includes(r.funcion))
}

async function politicas00015(db: Pick<PoolClient, 'query'> = getPool()): Promise<string[]> {
  const { rows } = await db.query<{ policyname: string }>(
    `SELECT policyname FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('customers', 'visits')
        AND policyname = ANY($1)`,
    [POLITICAS_00015]
  )
  return rows.map((r) => r.policyname)
}

describe('ola 0 — ninguna SECURITY DEFINER de public abierta a anon/authenticated (AISLA-2)', () => {
  afterAll(closePool)

  it('fuera de los helpers de RLS, ninguna es ejecutable por anon ni por authenticated', async () => {
    expect(await securityDefinerAbiertas()).toEqual([])
  })

  it('los helpers de RLS siguen ejecutables por authenticated (sin ellos el panel entero da 42501)', async () => {
    const { rows } = await getPool().query<{ funcion: string; autenticado: boolean }>(
      `SELECT p.oid::regprocedure::text AS funcion,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS autenticado
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.oid::regprocedure::text = ANY($1)`,
      [HELPERS_DE_RLS]
    )
    expect(rows.map((r) => r.funcion).sort()).toEqual([...HELPERS_DE_RLS].sort())
    for (const r of rows) expect(r.autenticado, r.funcion).toBe(true)
  })

  it('el AIOS conserva sus dos funciones (aios_constelarys sigue pudiendo)', async () => {
    const { rows } = await getPool().query<{ attach: boolean; sedes: boolean }>(
      `SELECT has_function_privilege('aios_constelarys',
                'aios_attach_zernio_account(text, text, text, text)', 'EXECUTE') AS attach,
              has_function_privilege('aios_constelarys',
                'aios_list_locations(text)', 'EXECUTE')                          AS sedes`
    )
    expect(rows[0]).toEqual({ attach: true, sedes: true })
  })

  it('con la anon key no se reescriben los zernio_* de una marca ajena', async () => {
    // El ataque concreto de AISLA-2: POST /rest/v1/rpc/aios_attach_zernio_account
    // con la clave pública, sabiendo solo el slug (que es el subdominio).
    const t = await createTestTenant({ messagingProvider: 'twilio' })
    const cliente = await getPool().connect()
    try {
      await cliente.query('BEGIN')
      await cliente.query('SET LOCAL ROLE anon')
      await expect(
        cliente.query('SELECT aios_attach_zernio_account($1, $2, $3, $4)', [
          t.slug,
          'prof_atacante',
          'acc_atacante',
          '+573001234567',
        ])
      ).rejects.toThrow(/permission denied/i)
      await cliente.query('ROLLBACK')

      const { rows } = await cliente.query<{ zernio_account_id: string | null }>(
        'SELECT zernio_account_id FROM tenants WHERE id = $1',
        [t.id]
      )
      expect(rows[0].zernio_account_id).toBeNull()
    } finally {
      await cliente.query('ROLLBACK').catch(() => {})
      cliente.release()
      await dropTestTenant(t.id)
    }
  })
})

describe('ola 0 — las políticas de la 00015 no existen (OPUS-4)', () => {
  afterAll(closePool)

  it('en orden, ninguna de las cinco service_role_* sigue en customers ni en visits', async () => {
    expect(await politicas00015()).toEqual([])
  })

  it('pegada fuera de orden, la 00015 abre los clientes a anon; la 00069 los cierra', async () => {
    const cliente = await getPool().connect()
    // Todo dentro de UNA transacción que se deshace: la 00015 abre `customers`
    // a `anon` y otras pruebas comparten esta base.
    const clientesQueVeAnon = async (tenantId: string) => {
      await cliente.query('SET LOCAL ROLE anon')
      const { rows } = await cliente.query<{ n: string }>(
        'SELECT count(*) AS n FROM customers WHERE tenant_id = $1',
        [tenantId]
      )
      await cliente.query('RESET ROLE')
      return Number(rows[0].n)
    }
    try {
      await cliente.query('BEGIN')
      const {
        rows: [t],
      } = await cliente.query<{ id: string }>(
        `INSERT INTO tenants (slug, name) VALUES ($1, 'Tenant ola 0') RETURNING id`,
        [`test-ola0-${Date.now().toString(36)}`]
      )
      await cliente.query(
        `INSERT INTO customers (tenant_id, phone, name) VALUES ($1, '3009990001', 'Cliente ola 0')`,
        [t.id]
      )

      await cliente.query(migracion('00015'))
      expect(await politicas00015(cliente)).toHaveLength(5)
      expect(await clientesQueVeAnon(t.id), 'la 00015 fuera de orden abre la marca a anon').toBe(1)

      await cliente.query(migracion00069())
      expect(await politicas00015(cliente)).toEqual([])
      expect(await clientesQueVeAnon(t.id), 'con la 00069, anon no ve ningún cliente').toBe(0)
    } finally {
      await cliente.query('ROLLBACK').catch(() => {})
      cliente.release()
    }
  })
})

describe('ola 0 — la 00069 es idempotente', () => {
  afterAll(closePool)

  it('corre otra vez, y también después del SQL a mano del dueño, sin error y sin abrir nada', async () => {
    const cliente = await getPool().connect()
    try {
      // Lo que el prompt de la ola 0 le pidió al dueño en el SQL Editor (a) y (b).
      // Si ya lo corrió, la migración no tiene que tropezar con lo hecho.
      await cliente.query(`
        REVOKE ALL ON FUNCTION public.aios_attach_zernio_account(text, text, text, text) FROM PUBLIC, anon, authenticated;
        REVOKE ALL ON FUNCTION public.aios_list_locations(text) FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.aios_attach_zernio_account(text, text, text, text) TO aios_constelarys;
        GRANT EXECUTE ON FUNCTION public.aios_list_locations(text) TO aios_constelarys;
        DROP POLICY IF EXISTS "service_role_select_customers" ON customers;
        DROP POLICY IF EXISTS "service_role_insert_visits" ON visits;
      `)
      const sql = migracion00069()
      await cliente.query(sql)
      await cliente.query(sql)
    } finally {
      cliente.release()
    }

    expect(await securityDefinerAbiertas()).toEqual([])
    expect(await politicas00015()).toEqual([])
  })
})
