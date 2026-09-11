/**
 * 00062 — meseros ROTATIVOS («rota entre sedes») contra un Postgres DE VERDAD.
 *
 * Migración bajo prueba: `00062_meseros_rotativos.sql` (la aplica el globalSetup)
 * Feature: `docs/features/staff-qr-scan.md` § «Meseros rotativos»
 * Decisión: `docs/features/multi-sede.md` §3.ter (la revisión de D11, dueño 2026-09-11)
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 * ───────────────────────────
 * La 00046 dejó tres llaves de identidad que solo valen JUNTAS (teléfono · «sin teléfono →
 * con sede» · nombre único por sede). Un rotativo sin teléfono y sin sede quedaría fuera
 * de las tres —la trampa de los NULL, otra vez— y la 00062 añade la cuarta. Lo que se
 * vigila acá es que las cuatro sigan cerrando el círculo:
 *
 *   1. un rotativo existe sin teléfono y sin sede (la bandera ES su llave),
 *   2. un rotativo NO puede tener sede (con una, la vía 1 de la precedencia mentiría),
 *   3. el NULL a secas sigue siendo «sin sede asignada»: nada se reinterpretó,
 *   4. dos rotativos no comparten nombre, y un rotativo no comparte nombre con un mesero
 *      de sede en las DOS direcciones (las dos filas viven en índices parciales distintos,
 *      así que lo cubre el trigger, no un índice),
 *   5. la lista de un aparato es «su sede + rotativos» y nada más —ni la otra sede, ni el
 *      NULL sin bandera, ni los rotativos de OTRA marca.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant } from '../setup/db'

/** Sufijo distinto por corrida: el índice único de `restaurant_locations.domain` es GLOBAL. */
const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.replace(
  /[^a-z0-9]/g,
  ''
)

let telSeq = 0
function tel(): string {
  telSeq += 1
  return `3${String(telSeq).padStart(3, '0')}${SUFIJO}`.slice(0, 20)
}

async function crearSede(tenantId: string, name: string, slug: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO restaurant_locations (tenant_id, name, slug, is_primary, sort_order, is_active)
     VALUES ($1, $2, $3, false, 0, true)
     RETURNING id`,
    [tenantId, name, slug]
  )
  return rows[0].id
}

/**
 * `tenant_id` EXPLÍCITO siempre: en producción la 00030 nunca se aplicó y la columna arrastra
 * un DEFAULT puente que manda a Sushi Service todo INSERT que lo omita.
 */
async function insertarMesero(
  tenantId: string,
  opts: { name: string; phone?: string | null; locationId?: string | null; rota?: boolean }
): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO staff_users (tenant_id, name, phone, role, location_id, works_any_location)
     VALUES ($1, $2, $3, 'waiter', $4, $5)
     RETURNING id`,
    [tenantId, opts.name, opts.phone ?? null, opts.locationId ?? null, opts.rota ?? false]
  )
  return rows[0].id
}

/** Código de error de Postgres y su mensaje, o `null` si la sentencia pasó. */
async function fallo(fn: () => Promise<unknown>): Promise<{ code: string; message: string } | null> {
  try {
    await fn()
    return null
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return { code: e.code ?? 'sin-codigo', message: e.message ?? '' }
  }
}

/**
 * EL MISMO predicado que `/api/staff/waiters` arma con PostgREST:
 * `.eq('tenant_id').eq('is_active', true).or('location_id.eq.X,works_any_location.eq.true')`.
 * Si la ruta cambia su filtro, este espejo tiene que cambiar con ella — a la vista.
 */
async function listaDelAparato(tenantId: string, locationId: string): Promise<string[]> {
  const { rows } = await getPool().query<{ name: string }>(
    `SELECT name FROM staff_users
      WHERE tenant_id = $1 AND is_active
        AND (location_id = $2 OR works_any_location)
      ORDER BY name`,
    [tenantId, locationId]
  )
  return rows.map((r) => r.name)
}

let tenantA: { id: string; slug: string }
let tenantB: { id: string; slug: string }
let sedeA1: string
let sedeA2: string
let sedeB: string

beforeAll(async () => {
  tenantA = await createTestTenant()
  tenantB = await createTestTenant()
  sedeA1 = await crearSede(tenantA.id, 'Laureles', `laureles-${SUFIJO}`.slice(0, 40))
  sedeA2 = await crearSede(tenantA.id, 'El Poblado', `poblado-${SUFIJO}`.slice(0, 40))
  sedeB = await crearSede(tenantB.id, 'Otra marca', `otra-${SUFIJO}`.slice(0, 40))
})

afterAll(async () => {
  const db = getPool()
  // ORDEN OBLIGATORIO: las columnas de sede son ON DELETE RESTRICT.
  const marcas = [[tenantA.id, tenantB.id]]
  await db.query('DELETE FROM staff_devices WHERE tenant_id = ANY($1)', marcas)
  await db.query('DELETE FROM staff_users WHERE tenant_id = ANY($1)', marcas)
  await db.query('DELETE FROM restaurant_locations WHERE tenant_id = ANY($1)', marcas)
  await dropTestTenant(tenantA.id)
  await dropTestTenant(tenantB.id)
  await closePool()
})

// ═══════════════════════════════════════════════════════════════
// La cuarta llave: el rotativo existe sin teléfono y sin sede
// ═══════════════════════════════════════════════════════════════

describe('works_any_location como llave de identidad (00062)', () => {
  it('acepta un rotativo SIN teléfono y SIN sede: la bandera es su llave', async () => {
    const id = await insertarMesero(tenantA.id, { name: 'Rota Uno', rota: true })
    const { rows } = await getPool().query(
      'SELECT phone, location_id, works_any_location FROM staff_users WHERE id = $1',
      [id]
    )
    expect(rows[0].phone).toBeNull()
    expect(rows[0].location_id).toBeNull()
    expect(rows[0].works_any_location).toBe(true)
  })

  it('el NULL a secas sigue rechazado sin teléfono: nada se reinterpretó (00046 intacta)', async () => {
    const f = await fallo(() => insertarMesero(tenantA.id, { name: 'Sin nada' }))
    expect(f?.code).toBe('23514')
    expect(f?.message).toContain('staff_users_identidad_minima')
  })

  it('nace en false: el parque instalado no se vuelve rotativo por defecto', async () => {
    const { rows } = await getPool().query<{ id: string }>(
      `INSERT INTO staff_users (tenant_id, name, phone, role)
       VALUES ($1, 'Histórico', $2, 'waiter') RETURNING id`,
      [tenantA.id, tel()]
    )
    const { rows: r } = await getPool().query(
      'SELECT works_any_location FROM staff_users WHERE id = $1',
      [rows[0].id]
    )
    expect(r[0].works_any_location).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// Un rotativo NO tiene sede
// ═══════════════════════════════════════════════════════════════

describe('staff_users_rotativo_sin_sede (00062)', () => {
  it('rechaza crear un rotativo CON sede: la vía 1 de la precedencia le atribuiría todo a esa sede', async () => {
    const f = await fallo(() =>
      insertarMesero(tenantA.id, { name: 'Rota con casa', locationId: sedeA1, rota: true })
    )
    expect(f?.code).toBe('23514')
    expect(f?.message).toContain('staff_users_rotativo_sin_sede')
  })

  it('rechaza DARLE sede a un rotativo sin quitarle la bandera', async () => {
    const id = await insertarMesero(tenantA.id, { name: 'Rota Dos', rota: true })
    const f = await fallo(() =>
      getPool().query('UPDATE staff_users SET location_id = $2 WHERE id = $1', [id, sedeA1])
    )
    expect(f?.code).toBe('23514')
    expect(f?.message).toContain('staff_users_rotativo_sin_sede')
  })

  it('acepta pasar de rotativo a sede fija en UN solo UPDATE: es lo que manda el panel', async () => {
    const id = await insertarMesero(tenantA.id, { name: 'Rota Tres', rota: true })
    await getPool().query(
      'UPDATE staff_users SET location_id = $2, works_any_location = false WHERE id = $1',
      [id, sedeA2]
    )
    const { rows } = await getPool().query(
      'SELECT location_id, works_any_location FROM staff_users WHERE id = $1',
      [id]
    )
    expect(rows[0].location_id).toBe(sedeA2)
    expect(rows[0].works_any_location).toBe(false)
  })

  it('acepta marcar como rotativo a un mesero de sede quitándole la sede en el mismo UPDATE', async () => {
    const id = await insertarMesero(tenantA.id, { name: 'Fijo que rota', locationId: sedeA1 })
    await getPool().query(
      'UPDATE staff_users SET location_id = NULL, works_any_location = true WHERE id = $1',
      [id]
    )
    const { rows } = await getPool().query(
      'SELECT location_id, works_any_location FROM staff_users WHERE id = $1',
      [id]
    )
    expect(rows[0].location_id).toBeNull()
    expect(rows[0].works_any_location).toBe(true)
  })

  it('rechaza quitarle la rotación a un rotativo sin teléfono sin darle sede: se quedaría sin llave', async () => {
    const id = await insertarMesero(tenantA.id, { name: 'Rota Cuatro', rota: true })
    const f = await fallo(() =>
      getPool().query('UPDATE staff_users SET works_any_location = false WHERE id = $1', [id])
    )
    expect(f?.code).toBe('23514')
    expect(f?.message).toContain('staff_users_identidad_minima')
  })
})

// ═══════════════════════════════════════════════════════════════
// Los nombres: entre rotativos, y el cruce con las sedes
// ═══════════════════════════════════════════════════════════════

describe('staff_users_nombre_rotativo_key + trg_staff_users_nombre_sin_cruce (00062)', () => {
  it('rechaza dos rotativos con el mismo nombre en la marca: salen juntos en TODAS las listas', async () => {
    await insertarMesero(tenantA.id, { name: 'Ana R.', rota: true })
    const f = await fallo(() => insertarMesero(tenantA.id, { name: ' ana r. ', rota: true }))
    expect(f?.code).toBe('23505')
    expect(f?.message).toContain('staff_users_nombre_rotativo_key')
  })

  it('rechaza un rotativo con el nombre de un mesero de sede: en esa sede serían dos iguales', async () => {
    await insertarMesero(tenantA.id, { name: 'Carlos', locationId: sedeA1 })
    const f = await fallo(() => insertarMesero(tenantA.id, { name: 'CARLOS ', rota: true }))
    expect(f?.code).toBe('23505')
    expect(f?.message).toContain('staff_users_nombre_rotativo_cruce')
  })

  it('y la dirección contraria: un mesero de sede con el nombre de un rotativo', async () => {
    await insertarMesero(tenantA.id, { name: 'Diana', rota: true })
    const f = await fallo(() => insertarMesero(tenantA.id, { name: 'diana', locationId: sedeA2 }))
    expect(f?.code).toBe('23505')
    expect(f?.message).toContain('staff_users_nombre_rotativo_cruce')
  })

  it('también vigila el UPDATE: marcar rotativo a alguien cuyo nombre ya existe en una sede', async () => {
    await insertarMesero(tenantA.id, { name: 'Elena', locationId: sedeA1 })
    const id = await insertarMesero(tenantA.id, { name: 'Elena', locationId: sedeA2 })
    const f = await fallo(() =>
      getPool().query(
        'UPDATE staff_users SET location_id = NULL, works_any_location = true WHERE id = $1',
        [id]
      )
    )
    expect(f?.code).toBe('23505')
    expect(f?.message).toContain('staff_users_nombre_rotativo_cruce')
  })

  it('ACEPTA el mismo nombre en OTRA MARCA, rotativo o de sede: el aislamiento por tenant manda', async () => {
    await insertarMesero(tenantA.id, { name: 'Fabio', rota: true })
    await expect(insertarMesero(tenantB.id, { name: 'Fabio', rota: true })).resolves.toBeTruthy()
    await expect(insertarMesero(tenantB.id, { name: 'Fabio', locationId: sedeB })).rejects.toBeTruthy()
    // ↑ el rechazo es el cruce DENTRO de la marca B (ya tiene su Fabio rotativo), no con A.
    await expect(
      insertarMesero(tenantB.id, { name: 'Gloria', locationId: sedeB })
    ).resolves.toBeTruthy()
  })

  it('el NULL sin bandera sigue fuera de las llaves de nombre: N históricos con teléfono repiten nombre', async () => {
    await insertarMesero(tenantA.id, { name: 'Repetido', phone: tel() })
    await expect(insertarMesero(tenantA.id, { name: 'Repetido', phone: tel() })).resolves.toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════
// La lista del aparato: su sede + rotativos, y nada más
// ═══════════════════════════════════════════════════════════════

describe('la lista de un aparato es «su sede + rotativos» (espejo de /api/staff/waiters)', () => {
  it('trae los de la sede y los rotativos; deja fuera la otra sede, el NULL sin bandera y la otra marca', async () => {
    await insertarMesero(tenantA.id, { name: 'L-Fija', locationId: sedeA1 })
    await insertarMesero(tenantA.id, { name: 'P-Fija', locationId: sedeA2 })
    await insertarMesero(tenantA.id, { name: 'Z-Rota', rota: true })
    await insertarMesero(tenantA.id, { name: 'Sin sede con tel', phone: tel() })
    await insertarMesero(tenantB.id, { name: 'B-Rota', rota: true })

    const laureles = await listaDelAparato(tenantA.id, sedeA1)
    expect(laureles).toContain('L-Fija')
    expect(laureles).toContain('Z-Rota')
    expect(laureles).not.toContain('P-Fija')
    expect(laureles).not.toContain('Sin sede con tel')
    expect(laureles).not.toContain('B-Rota')

    const poblado = await listaDelAparato(tenantA.id, sedeA2)
    expect(poblado).toContain('P-Fija')
    expect(poblado).toContain('Z-Rota')
    expect(poblado).not.toContain('L-Fija')
  })

  it('un rotativo inactivo desaparece de todas las listas, como cualquier otro', async () => {
    const id = await insertarMesero(tenantA.id, { name: 'Y-Rota inactiva', rota: true })
    await getPool().query('UPDATE staff_users SET is_active = false WHERE id = $1', [id])
    expect(await listaDelAparato(tenantA.id, sedeA1)).not.toContain('Y-Rota inactiva')
  })
})
