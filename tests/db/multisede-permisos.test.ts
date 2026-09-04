/**
 * Multi-sede F7 — permisos de sede del dashboard (D10) contra un Postgres DE VERDAD.
 *
 * Spec: `docs/superpowers/specs/2026-09-02-multisede-design.md` §5.1, §5.2
 * Migración bajo prueba: `00045_permisos_por_sede.sql` (la aplica el globalSetup)
 * Código bajo prueba en TypeScript: `tests/unit/location-scope.test.ts` (la función
 * PURA `decideLocationScope()` — sin base de datos)
 *
 * QUÉ PRUEBA ESTO
 * ───────────────
 *   1. Las 4 filas de la tabla del fail-safe (§5.1), directamente sobre
 *      `can_see_location()`.
 *   2. Que `role='location'` NUNCA ve las filas con `location_id IS NULL`, ni en el
 *      helper ni en una lectura real de una tabla con RLS.
 *   3. Que el trigger estampa `role='brand'` a los usuarios existentes en el
 *      instante en que nace la SEGUNDA sede activa — y que NO pisa a quien ya
 *      tenía una fila.
 *   4. Que la FK compuesta rechaza con 23503 el permiso de la marca A sobre la
 *      sede de la marca B.
 *   5. Que la policy RESTRICTIVE filtra de verdad una lectura como `authenticated`
 *      (no solo el helper en aislado) — la prueba de que las tres piezas (tabla +
 *      helpers + policy autodescubierta) trabajan juntas.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'

const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.replace(/[^a-z0-9]/g, '')

let telSeq = 0
function tel(): string {
  telSeq += 1
  return `3${String(telSeq).padStart(3, '0')}${SUFIJO}`.slice(0, 20)
}

let slugSeq = 0
function slug(): string {
  slugSeq += 1
  return `sede-${slugSeq}-${SUFIJO}`
}

async function crearSede(
  tenantId: string,
  opts: { name: string; isPrimary?: boolean; isActive?: boolean }
): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO restaurant_locations (tenant_id, name, slug, is_primary, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [tenantId, opts.name, slug(), opts.isPrimary ?? false, opts.isActive ?? true]
  )
  return rows[0].id
}

/** Un `auth.users` de prueba, con `app_metadata.tenant_id` ya estampado — igual que
 *  lo deja el UPDATE a mano de la 00028. No pasa por Supabase Auth de verdad: la
 *  tabla es el STUB de `tests/setup/bootstrap.sql`. */
async function crearUsuarioDashboard(tenantId: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO auth.users (raw_app_meta_data) VALUES ($1) RETURNING id`,
    [JSON.stringify({ tenant_id: tenantId })]
  )
  return rows[0].id
}

async function darPermiso(
  tenantId: string,
  userId: string,
  role: 'brand' | 'location',
  locationId: string | null
): Promise<void> {
  await getPool().query(
    `INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role)
     VALUES ($1, $2, $3, $4)`,
    [userId, tenantId, locationId, role]
  )
}

/** `can_see_location()` corriendo con el JWT de un usuario concreto. SECURITY
 *  DEFINER hace que el rol de la conexión sea irrelevante para el helper en sí,
 *  pero se corre como `authenticated` de todas formas: es el rol bajo el que
 *  PostgREST evalúa el RLS en producción, y algunas de estas pruebas comparten
 *  conexión con lecturas reales de tabla. */
async function puedeVer(userId: string, tenantId: string, locationId: string | null): Promise<boolean> {
  const cliente = await getPool().connect()
  try {
    await cliente.query('BEGIN')
    await cliente.query('SET LOCAL ROLE authenticated')
    // `SET` no admite parámetros ($1) para el valor; `set_config(..., true)` sí, y
    // el tercer argumento `true` es "is_local" — el equivalente parametrizable de
    // `SET LOCAL`.
    await cliente.query('SELECT set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: userId, app_metadata: { tenant_id: tenantId } }),
    ])
    const { rows } = await cliente.query<{ can_see_location: boolean }>(
      'SELECT can_see_location($1) AS can_see_location',
      [locationId]
    )
    return rows[0].can_see_location
  } finally {
    await cliente.query('ROLLBACK').catch(() => {})
    cliente.release()
  }
}

/** Código de error de Postgres de un fallo, o `null` si la sentencia pasó. */
async function codigoDeError(sql: string, params: unknown[]): Promise<string | null> {
  try {
    await getPool().query(sql, params)
    return null
  } catch (err) {
    return (err as { code?: string }).code ?? 'sin_codigo'
  }
}

let tenantSolo: TestTenant // ≤1 sede activa, para las filas 1 y 3 del fail-safe
let sedeSolo: string
let tenantMulti: TestTenant // ≥2 sedes activas, para la fila 2 y los roles explícitos
let sedeM1: string
let sedeM2: string
let tenantB: TestTenant // marca distinta, para el 23503 de la FK compuesta

async function limpiarTenant(t: TestTenant, userIds: string[]): Promise<void> {
  const db = getPool()
  // ORDEN OBLIGATORIO: RESTRICT en cascada. dashboard_user_locations tiene
  // ON DELETE CASCADE sobre tenant_id, así que en teoría se iría sola con el
  // tenant — se borra a mano de todas formas para no depender de eso en la
  // prueba que la ejercita explícitamente.
  await db.query('DELETE FROM dashboard_user_locations WHERE tenant_id = $1', [t.id])
  await db.query('DELETE FROM restaurant_locations WHERE tenant_id = $1', [t.id])
  await dropTestTenant(t.id)
  for (const uid of userIds) {
    await db.query('DELETE FROM auth.users WHERE id = $1', [uid])
  }
}

describe('multi-sede F7 — permisos de sede (00045)', () => {
  beforeAll(async () => {
    tenantSolo = await createTestTenant()
    sedeSolo = await crearSede(tenantSolo.id, { name: 'Única', isPrimary: true })

    tenantMulti = await createTestTenant()
    sedeM1 = await crearSede(tenantMulti.id, { name: 'Envigado', isPrimary: true })
    sedeM2 = await crearSede(tenantMulti.id, { name: 'Laureles' })

    tenantB = await createTestTenant()
  })

  afterAll(async () => {
    await closePool()
  })

  // ═══════════════════════════════════════════════════════════════
  // Las 4 filas de la tabla del §5.1, sobre can_see_location()
  // ═══════════════════════════════════════════════════════════════
  describe('el fail-safe — las 4 filas del §5.1', () => {
    it('fila 1 — sin fila y ≤1 sede activa: ve la marca (su única sede) y también "Sin sede"', async () => {
      const user = await crearUsuarioDashboard(tenantSolo.id)
      try {
        expect(await puedeVer(user, tenantSolo.id, sedeSolo)).toBe(true)
        expect(await puedeVer(user, tenantSolo.id, null)).toBe(true)
      } finally {
        await getPool().query('DELETE FROM auth.users WHERE id = $1', [user])
      }
    })

    it('fila 2 — sin fila y ≥2 sedes activas: 403 (ni la sede ni "Sin sede")', async () => {
      const user = await crearUsuarioDashboard(tenantMulti.id)
      try {
        expect(await puedeVer(user, tenantMulti.id, sedeM1)).toBe(false)
        expect(await puedeVer(user, tenantMulti.id, sedeM2)).toBe(false)
        expect(await puedeVer(user, tenantMulti.id, null)).toBe(false)
      } finally {
        await getPool().query('DELETE FROM auth.users WHERE id = $1', [user])
      }
    })

    it('fila 3 — role=brand: todas las sedes de la marca + el cubo "Sin sede"', async () => {
      const user = await crearUsuarioDashboard(tenantMulti.id)
      try {
        await darPermiso(tenantMulti.id, user, 'brand', null)
        expect(await puedeVer(user, tenantMulti.id, sedeM1)).toBe(true)
        expect(await puedeVer(user, tenantMulti.id, sedeM2)).toBe(true)
        expect(await puedeVer(user, tenantMulti.id, null)).toBe(true)
      } finally {
        await getPool().query('DELETE FROM dashboard_user_locations WHERE user_id = $1', [user])
        await getPool().query('DELETE FROM auth.users WHERE id = $1', [user])
      }
    })

    it('fila 4 — role=location: SOLO esas sedes, NUNCA location_id IS NULL', async () => {
      const user = await crearUsuarioDashboard(tenantMulti.id)
      try {
        await darPermiso(tenantMulti.id, user, 'location', sedeM1)
        expect(await puedeVer(user, tenantMulti.id, sedeM1)).toBe(true)
        expect(await puedeVer(user, tenantMulti.id, sedeM2)).toBe(false) // otra sede de SU marca
        expect(await puedeVer(user, tenantMulti.id, null)).toBe(false) // ⚠️ la aserción central
      } finally {
        await getPool().query('DELETE FROM dashboard_user_locations WHERE user_id = $1', [user])
        await getPool().query('DELETE FROM auth.users WHERE id = $1', [user])
      }
    })

    it('un usuario con VARIAS filas role=location ve la unión, nunca NULL', async () => {
      const user = await crearUsuarioDashboard(tenantMulti.id)
      try {
        await darPermiso(tenantMulti.id, user, 'location', sedeM1)
        await darPermiso(tenantMulti.id, user, 'location', sedeM2)
        expect(await puedeVer(user, tenantMulti.id, sedeM1)).toBe(true)
        expect(await puedeVer(user, tenantMulti.id, sedeM2)).toBe(true)
        expect(await puedeVer(user, tenantMulti.id, null)).toBe(false)
      } finally {
        await getPool().query('DELETE FROM dashboard_user_locations WHERE user_id = $1', [user])
        await getPool().query('DELETE FROM auth.users WHERE id = $1', [user])
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // El trigger — el 403 es la RED, no el camino normal
  // ═══════════════════════════════════════════════════════════════
  describe('el trigger de estampado (trg_restaurant_locations_estampa_marca)', () => {
    it('estampa role=brand a los usuarios existentes al nacer la 2ª sede activa', async () => {
      const t = await createTestTenant()
      const sede1 = await crearSede(t.id, { name: 'Primera', isPrimary: true })
      const userSinFila = await crearUsuarioDashboard(t.id)
      const userConFila = await crearUsuarioDashboard(t.id)

      try {
        // Antes de la 2ª sede: ambos ven la marca por el fail-safe (fila 1), sin
        // ninguna fila en dashboard_user_locations.
        const { rows: antes } = await getPool().query(
          'SELECT count(*)::int AS n FROM dashboard_user_locations WHERE tenant_id = $1',
          [t.id]
        )
        expect(antes[0].n).toBe(0)

        // A uno de los dos ya le asignaron sede a mano ANTES de que naciera la 2ª.
        await darPermiso(t.id, userConFila, 'location', sede1)

        // Nace la 2ª sede activa.
        const sede2 = await crearSede(t.id, { name: 'Segunda' })
        void sede2

        const { rows: despues } = await getPool().query<{ user_id: string; role: string; location_id: string | null }>(
          'SELECT user_id, role, location_id FROM dashboard_user_locations WHERE tenant_id = $1 ORDER BY user_id',
          [t.id]
        )

        // El que no tenía fila: estampado brand/NULL.
        const filaSinFila = despues.find((r) => r.user_id === userSinFila)
        expect(filaSinFila?.role).toBe('brand')
        expect(filaSinFila?.location_id).toBeNull()

        // El que YA tenía una fila explícita: NO se toca.
        const filaConFila = despues.find((r) => r.user_id === userConFila)
        expect(filaConFila?.role).toBe('location')
        expect(filaConFila?.location_id).toBe(sede1)

        expect(despues).toHaveLength(2)
      } finally {
        await limpiarTenant(t, [userSinFila, userConFila])
      }
    })

    it('es idempotente: activar una 3ª sede no duplica la fila brand ya estampada', async () => {
      const t = await createTestTenant()
      await crearSede(t.id, { name: 'Primera', isPrimary: true })
      const user = await crearUsuarioDashboard(t.id)

      try {
        await crearSede(t.id, { name: 'Segunda' }) // dispara el estampado
        await crearSede(t.id, { name: 'Tercera' }) // vuelve a disparar

        const { rows } = await getPool().query<{ n: string }>(
          'SELECT count(*)::int AS n FROM dashboard_user_locations WHERE tenant_id = $1 AND user_id = $2',
          [t.id, user]
        )
        expect(Number(rows[0].n)).toBe(1)
      } finally {
        await limpiarTenant(t, [user])
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // La FK compuesta — el candado entre marcas
  // ═══════════════════════════════════════════════════════════════
  describe('la FK compuesta (location_id, tenant_id)', () => {
    it('rechaza con 23503 el permiso de la marca A sobre la sede de la marca B', async () => {
      const user = await crearUsuarioDashboard(tenantMulti.id)
      try {
        const codigo = await codigoDeError(
          `INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role)
           VALUES ($1, $2, $3, 'location')`,
          [user, tenantMulti.id, sedeSolo] // sedeSolo es de tenantSolo, no de tenantMulti
        )
        expect(codigo).toBe('23503')
      } finally {
        await getPool().query('DELETE FROM auth.users WHERE id = $1', [user])
      }
    })

    it('acepta la sede de la propia marca', async () => {
      const user = await crearUsuarioDashboard(tenantMulti.id)
      try {
        const codigo = await codigoDeError(
          `INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role)
           VALUES ($1, $2, $3, 'location')`,
          [user, tenantMulti.id, sedeM1]
        )
        expect(codigo).toBeNull()
      } finally {
        await getPool().query('DELETE FROM dashboard_user_locations WHERE user_id = $1', [user])
        await getPool().query('DELETE FROM auth.users WHERE id = $1', [user])
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // El CHECK del par role ↔ location_id
  // ═══════════════════════════════════════════════════════════════
  describe('dashboard_user_locations_pareja_check', () => {
    it('rechaza role=brand con location_id NOT NULL', async () => {
      const user = await crearUsuarioDashboard(tenantMulti.id)
      try {
        const codigo = await codigoDeError(
          `INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role)
           VALUES ($1, $2, $3, 'brand')`,
          [user, tenantMulti.id, sedeM1]
        )
        expect(codigo).toBe('23514')
      } finally {
        await getPool().query('DELETE FROM auth.users WHERE id = $1', [user])
      }
    })

    it('rechaza role=location con location_id NULL', async () => {
      const user = await crearUsuarioDashboard(tenantMulti.id)
      try {
        const codigo = await codigoDeError(
          `INSERT INTO dashboard_user_locations (user_id, tenant_id, location_id, role)
           VALUES ($1, $2, NULL, 'location')`,
          [user, tenantMulti.id]
        )
        expect(codigo).toBe('23514')
      } finally {
        await getPool().query('DELETE FROM auth.users WHERE id = $1', [user])
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // La policy RESTRICTIVE, sobre una lectura real — no solo el helper aislado
  // ═══════════════════════════════════════════════════════════════
  describe('sede_visible_visits — el helper y la tabla trabajando juntos', () => {
    it('role=location ve solo su sede; role=brand ve todo incluido "Sin sede"', async () => {
      const db = getPool()
      const {
        rows: [cliente],
      } = await db.query<{ id: string }>(
        `INSERT INTO customers (phone, name, tenant_id) VALUES ($1, $2, $3) RETURNING id`,
        [tel(), 'Cliente F7', tenantMulti.id]
      )

      const {
        rows: [v1],
      } = await db.query<{ id: string }>(
        `INSERT INTO visits (customer_id, tenant_id, source, location_id, location_source)
         VALUES ($1, $2, 'qr', $3, 'host') RETURNING id`,
        [cliente.id, tenantMulti.id, sedeM1]
      )
      const {
        rows: [v2],
      } = await db.query<{ id: string }>(
        `INSERT INTO visits (customer_id, tenant_id, source, location_id, location_source)
         VALUES ($1, $2, 'qr', $3, 'host') RETURNING id`,
        [cliente.id, tenantMulti.id, sedeM2]
      )
      const {
        rows: [v3],
      } = await db.query<{ id: string }>(
        `INSERT INTO visits (customer_id, tenant_id, source, location_id, location_source)
         VALUES ($1, $2, 'delivery', NULL, NULL) RETURNING id`,
        [cliente.id, tenantMulti.id]
      )

      const userSede = await crearUsuarioDashboard(tenantMulti.id)
      const userMarca = await crearUsuarioDashboard(tenantMulti.id)

      try {
        await darPermiso(tenantMulti.id, userSede, 'location', sedeM1)
        await darPermiso(tenantMulti.id, userMarca, 'brand', null)

        const leerComo = async (userId: string): Promise<string[]> => {
          const cliente2 = await db.connect()
          try {
            await cliente2.query('BEGIN')
            await cliente2.query('SET LOCAL ROLE authenticated')
            await cliente2.query('SELECT set_config($1, $2, true)', [
              'request.jwt.claims',
              JSON.stringify({ sub: userId, app_metadata: { tenant_id: tenantMulti.id } }),
            ])
            const { rows } = await cliente2.query<{ id: string }>(
              'SELECT id FROM visits WHERE customer_id = $1 ORDER BY id',
              [cliente.id]
            )
            return rows.map((r) => r.id)
          } finally {
            await cliente2.query('ROLLBACK').catch(() => {})
            cliente2.release()
          }
        }

        const vistosPorSede = await leerComo(userSede)
        expect(vistosPorSede).toContain(v1.id)
        expect(vistosPorSede).not.toContain(v2.id)
        expect(vistosPorSede).not.toContain(v3.id) // ⚠️ NUNCA "Sin sede"

        const vistosPorMarca = await leerComo(userMarca)
        expect(vistosPorMarca).toContain(v1.id)
        expect(vistosPorMarca).toContain(v2.id)
        expect(vistosPorMarca).toContain(v3.id)
      } finally {
        await db.query('DELETE FROM dashboard_user_locations WHERE tenant_id = $1', [tenantMulti.id])
        await db.query('DELETE FROM auth.users WHERE id = ANY($1)', [[userSede, userMarca]])
        await db.query('DELETE FROM visits WHERE customer_id = $1', [cliente.id])
        await db.query('DELETE FROM customers WHERE id = $1', [cliente.id])
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Limpieza final de los tenants compartidos por todo el archivo
  // ═══════════════════════════════════════════════════════════════
  it('limpieza', async () => {
    await limpiarTenant(tenantSolo, [])
    await limpiarTenant(tenantMulti, [])
    await dropTestTenant(tenantB.id)
    expect(true).toBe(true)
  })
})
