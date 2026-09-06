/**
 * §19 — la llave de identidad del mesero (19.f) contra un Postgres DE VERDAD.
 *
 * Spec: `docs/superpowers/specs/2026-09-05-staff-scanner-19-design.md` §3
 * Migración bajo prueba: `00046_escaner_meseros.sql` (la aplica el globalSetup)
 * Feature: `docs/features/staff-qr-scan.md`
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 * ───────────────────────────
 * §19 vuelve `staff_users.phone` opcional, y ese teléfono era la identidad del mesero: el
 * UNIQUE `(phone, tenant_id)` de la 00028 es, según CLAUDE.md, "D11 en el motor". La trampa
 * que este archivo vigila es que **en Postgres los NULL no colisionan entre sí**: volver
 * nullable una columna con UNIQUE apaga la garantía SIN ERROR, sin log y sin que ninguna
 * prueba de la aplicación se entere.
 *
 * La 00046 responde con tres piezas que solo valen JUNTAS, y por eso se prueban juntas:
 *
 *   1. el UNIQUE de teléfono SIGUE AHÍ y sigue cubriendo a quien tiene teléfono,
 *   2. un CHECK obliga a que el que NO tiene teléfono tenga sede,
 *   3. un UNIQUE PARCIAL sobre (marca, sede, nombre) es su llave.
 *
 * Si cualquiera de las tres cede, se pueden crear meseros indistinguibles y la métrica de
 * eficiencia por mesero —que es el PROPÓSITO de §19— se reparte entre filas al azar.
 *
 * LO QUE ESTE ARCHIVO NO PRUEBA, A PROPÓSITO: que dos "Ana" de sedes DISTINTAS sean la misma
 * persona. No se puede: sin teléfono, el dato que las unía dejó de existir. Está aceptado por
 * el dueño y escrito en el spec §3; aquí se fija el comportamiento para que nadie lo lea como
 * un fallo.
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
  opts: { name: string; phone?: string | null; locationId?: string | null }
): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO staff_users (tenant_id, name, phone, role, location_id)
     VALUES ($1, $2, $3, 'waiter', $4)
     RETURNING id`,
    [tenantId, opts.name, opts.phone ?? null, opts.locationId ?? null]
  )
  return rows[0].id
}

/** Código de error de Postgres de un fallo, o `null` si la sentencia pasó. */
async function codigoDeError(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn()
    return null
  } catch (err) {
    return (err as { code?: string }).code ?? 'sin-codigo'
  }
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
// §19.2 — el alta solo con nombre
// ═══════════════════════════════════════════════════════════════

describe('staff_users.phone nullable (00046 / §19.2)', () => {
  it('acepta un mesero SIN teléfono si tiene sede: es el alta nueva', async () => {
    const id = await insertarMesero(tenantA.id, { name: 'Ana M.', locationId: sedeA1 })
    const { rows } = await getPool().query('SELECT phone, location_id FROM staff_users WHERE id = $1', [id])
    expect(rows[0].phone).toBeNull()
    expect(rows[0].location_id).toBe(sedeA1)
  })

  it('sigue aceptando el mesero CON teléfono y sin sede: es todo el parque instalado', async () => {
    const id = await insertarMesero(tenantA.id, { name: 'Histórico', phone: tel() })
    const { rows } = await getPool().query('SELECT location_id FROM staff_users WHERE id = $1', [id])
    expect(rows[0].location_id).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 19.f, pieza 1 — el UNIQUE de teléfono NO se quitó
// ═══════════════════════════════════════════════════════════════

describe('staff_users_phone_tenant_key sobrevive a la 00046 (D11)', () => {
  it('el mismo celular sigue sin poder tener dos filas en la marca, ni una por sede', async () => {
    const phone = tel()
    await insertarMesero(tenantA.id, { name: 'Con celular A', phone, locationId: sedeA1 })

    // Esto es D11 entero: "el mesero trabaja en las dos sedes" es exactamente lo que prohíbe.
    const code = await codigoDeError(() =>
      insertarMesero(tenantA.id, { name: 'Con celular B', phone, locationId: sedeA2 })
    )
    expect(code).toBe('23505')
  })

  it('DOS meseros sin teléfono NO chocan entre sí — por eso hacen falta el CHECK y el índice', async () => {
    // Esta prueba fija la TRAMPA, no el arreglo: documenta por qué el UNIQUE de teléfono deja
    // de bastar en cuanto la columna admite NULL. Si algún día esto empezara a fallar con
    // 23505, querría decir que alguien cambió la semántica de los NULL y hay que revisar todo.
    await insertarMesero(tenantA.id, { name: 'Sin tel uno', locationId: sedeA1 })
    const code = await codigoDeError(() =>
      insertarMesero(tenantA.id, { name: 'Sin tel dos', locationId: sedeA1 })
    )
    expect(code).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 19.f, pieza 2 — sin teléfono, la sede es obligatoria
// ═══════════════════════════════════════════════════════════════

describe('staff_users_identidad_minima (00046)', () => {
  it('rechaza el mesero sin teléfono Y sin sede: no tendría NINGUNA llave', async () => {
    const code = await codigoDeError(() => insertarMesero(tenantA.id, { name: 'Fantasma' }))
    expect(code).toBe('23514')
  })

  it('rechaza QUITARLE la sede a un mesero que no tiene teléfono', async () => {
    // La puerta de atrás: el INSERT pasa y el UPDATE lo deja igual de huérfano. Hacer cumplir
    // la mitad de un invariante es el fallo silencioso que este diseño existe para evitar.
    const id = await insertarMesero(tenantA.id, { name: 'Se queda sin sede', locationId: sedeA1 })
    const code = await codigoDeError(() =>
      getPool().query('UPDATE staff_users SET location_id = NULL WHERE id = $1', [id])
    )
    expect(code).toBe('23514')
  })

  it('permite quitarle la sede al que SÍ tiene teléfono: lo cubre el UNIQUE de la 00028', async () => {
    const id = await insertarMesero(tenantA.id, { name: 'Con respaldo', phone: tel(), locationId: sedeA1 })
    const code = await codigoDeError(() =>
      getPool().query('UPDATE staff_users SET location_id = NULL WHERE id = $1', [id])
    )
    expect(code).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 19.f, pieza 3 — la llave que la PANTALLA necesita
// ═══════════════════════════════════════════════════════════════

describe('staff_users_nombre_sede_key (00046)', () => {
  it('rechaza dos "Ana" en la MISMA sede: en el selector serían indistinguibles', async () => {
    await insertarMesero(tenantA.id, { name: 'Ana', locationId: sedeA1 })
    const code = await codigoDeError(() =>
      insertarMesero(tenantA.id, { name: 'Ana', locationId: sedeA1 })
    )
    expect(code).toBe('23505')
  })

  it('normaliza mayúsculas y espacios: " ANA " es la misma Ana para el ojo y para el motor', async () => {
    await insertarMesero(tenantA.id, { name: 'Camilo', locationId: sedeA2 })
    const code = await codigoDeError(() =>
      insertarMesero(tenantA.id, { name: '  CAMILO ', locationId: sedeA2 })
    )
    expect(code).toBe('23505')
  })

  it('ACEPTA dos "Ana" en sedes DISTINTAS: son dos personas distintas y las dos existen', async () => {
    // Prohibirlo sería más "seguro" y estaría MAL: en una cadena real hay una Ana por sede, y
    // una llave que lo impida obliga a inventar nombres falsos. El precio está en el spec §3:
    // si fueran la misma persona, la base ya no puede saberlo.
    await insertarMesero(tenantA.id, { name: 'Daniela', locationId: sedeA1 })
    const code = await codigoDeError(() =>
      insertarMesero(tenantA.id, { name: 'Daniela', locationId: sedeA2 })
    )
    expect(code).toBeNull()
  })

  it('ACEPTA el mismo nombre en OTRA MARCA: el aislamiento por tenant manda', async () => {
    await insertarMesero(tenantA.id, { name: 'Sebastián', locationId: sedeA1 })
    const code = await codigoDeError(() =>
      insertarMesero(tenantB.id, { name: 'Sebastián', locationId: sedeB })
    )
    expect(code).toBeNull()
  })

  it('es PARCIAL: N meseros con teléfono y sin sede pueden repetir nombre', async () => {
    // El índice solo cubre `location_id IS NOT NULL`. Si dejara de ser parcial, las filas del
    // parque instalado —todas con sede NULL— entrarían y empezarían a chocar entre ellas.
    await insertarMesero(tenantA.id, { name: 'Repetido', phone: tel() })
    const code = await codigoDeError(() =>
      insertarMesero(tenantA.id, { name: 'Repetido', phone: tel() })
    )
    expect(code).toBeNull()
  })

  it('también vigila el UPDATE: mover a "Ana" a una sede que ya tiene una se rechaza', async () => {
    await insertarMesero(tenantA.id, { name: 'Laura', locationId: sedeA1 })
    const otra = await insertarMesero(tenantA.id, { name: 'Laura', locationId: sedeA2 })
    const code = await codigoDeError(() =>
      getPool().query('UPDATE staff_users SET location_id = $1 WHERE id = $2', [sedeA1, otra])
    )
    expect(code).toBe('23505')
  })
})

// ═══════════════════════════════════════════════════════════════
// El aparato del local: sin dueño, con sede propia
// ═══════════════════════════════════════════════════════════════

describe('staff_devices sin dueño (§19)', () => {
  it('acepta un aparato con sede y SIN mesero: es el modelo nuevo', async () => {
    const { rows } = await getPool().query<{ id: string; location_id: string }>(
      `INSERT INTO staff_devices (tenant_id, device_fingerprint, staff_user_id, location_id)
       VALUES ($1, $2, NULL, $3)
       RETURNING id, location_id`,
      [tenantA.id, `df_local_${SUFIJO}`, sedeA1]
    )
    expect(rows[0].location_id).toBe(sedeA1)
  })

  it('la sede del aparato es LIBRE cuando no tiene dueño: el trigger de la 00044 no estorba', async () => {
    // `staff_device_sede_coherente()` devuelve NEW de inmediato con `staff_user_id` NULL. Sin
    // eso, §19 sería imposible: el aparato no podría tener sede porque no tiene dueño del que
    // heredarla, y sin sede no hay lista de meseros.
    const id = (
      await getPool().query<{ id: string }>(
        `INSERT INTO staff_devices (tenant_id, device_fingerprint, staff_user_id, location_id)
         VALUES ($1, $2, NULL, $3) RETURNING id`,
        [tenantA.id, `df_movible_${SUFIJO}`, sedeA1]
      )
    ).rows[0].id

    const code = await codigoDeError(() =>
      getPool().query('UPDATE staff_devices SET location_id = $1 WHERE id = $2', [sedeA2, id])
    )
    expect(code).toBeNull()
  })

  it('sigue sin poder quedar a nombre de un mesero de OTRA sede (00044 intacta)', async () => {
    const meseroA1 = await insertarMesero(tenantA.id, { name: 'Jhon', locationId: sedeA1 })
    const code = await codigoDeError(() =>
      getPool().query(
        `INSERT INTO staff_devices (tenant_id, device_fingerprint, staff_user_id, location_id)
         VALUES ($1, $2, $3, $4)`,
        [tenantA.id, `df_incoherente_${SUFIJO}`, meseroA1, sedeA2]
      )
    )
    expect(code).toBe('23514')
  })
})
