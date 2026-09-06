/**
 * Multi-sede F4 — los meseros por sede (D11) contra un Postgres DE VERDAD.
 *
 * Spec: `docs/superpowers/specs/2026-09-02-multisede-design.md` §4 (bloque 00044) y §5.3
 * Migración bajo prueba: `00044_meseros_por_sede.sql` (la aplica el globalSetup)
 * Código bajo prueba: `src/lib/location-resolver.ts` (la precedencia, ya con fuente)
 * Feature: `docs/features/multi-sede.md`
 *
 * QUÉ PRUEBA ESTO Y QUÉ NO
 * ────────────────────────
 * `tests/unit/location-resolver.test.ts` prueba la DECISIÓN: dadas unas señales, qué sede
 * gana. Éste prueba que el MOTOR sostiene los invariantes sobre los que esa decisión se
 * apoya — que es otra cosa y falla sola:
 *
 *   · un mesero de la marca A NO puede quedar asignado a una sede de la marca B (FK compuesta),
 *   · una sede con meseros NO se puede borrar (ON DELETE RESTRICT),
 *   · un dispositivo NUNCA queda a nombre de un mesero de otra sede ni de otra marca (trigger),
 *   · dos dispositivos del mismo tenant no pueden compartir `device_fingerprint` (el UNIQUE
 *     que tapa la bomba de los siete `.single()`),
 *   · y que las dos funciones SQL que antes perdían la sede ahora la escriben.
 *
 * Si cualquiera de esos invariantes cede, la precedencia del §3.1 sigue "funcionando" y
 * devolviendo un `location_id` — solo que el equivocado, en silencio, y ese número termina
 * en el reporte de efectividad por sede (D12).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant } from '../setup/db'
import { resolveVisitLocation } from '@/lib/location-resolver'

/** Etiqueta de dominio válida para el CHECK de formato y distinta en cada corrida: el índice
 *  único de `restaurant_locations.domain` es GLOBAL, no por tenant. */
const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.replace(/[^a-z0-9]/g, '')

/**
 * Celular único por llamada. `staff_users_phone_tenant_key (phone, tenant_id)` es el
 * invariante de D11 que estas mismas pruebas verifican, así que cualquier colisión accidental
 * entre fixtures se disfrazaría de fallo de la migración. Un contador lo hace imposible.
 */
let telSeq = 0
function tel(): string {
  telSeq += 1
  return `3${String(telSeq).padStart(3, '0')}${SUFIJO}`.slice(0, 20)
}

async function crearSede(
  tenantId: string,
  opts: { name: string; slug: string; isPrimary?: boolean; sortOrder?: number }
): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO restaurant_locations (tenant_id, name, slug, is_primary, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id`,
    [tenantId, opts.name, opts.slug, opts.isPrimary ?? false, opts.sortOrder ?? 0]
  )
  return rows[0].id
}

/**
 * `tenant_id` EXPLÍCITO siempre. En producción la 00030 nunca se aplicó y la columna arrastra
 * un DEFAULT puente que manda a Sushi Service todo INSERT que lo omita; en el arnés la 00030
 * SÍ corre, así que aquí el mismo olvido revienta con 23502. Las dos razones piden lo mismo.
 */
let nombreSeq = 0
async function crearMesero(
  tenantId: string,
  opts: { phone: string; locationId?: string | null; name?: string }
): Promise<string> {
  // El nombre por defecto es ÚNICO por llamada, no la constante que era antes.
  // La 00046 añadió `staff_users_nombre_sede_key (tenant_id, location_id, lower(trim(name)))`
  // para que dos "Ana" de la misma sede no sean indistinguibles en el selector del escáner
  // (§19). Este archivo comparte `tenantA` y `sedeA1` entre TODAS sus pruebas, así que un
  // nombre fijo hacía chocar la segunda inserción y 16 pruebas de la 00044 fallaban por un
  // invariante que no es el que están midiendo. La unicidad de nombre se prueba donde
  // corresponde: `tests/db/escaner-meseros.test.ts`.
  nombreSeq += 1
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO staff_users (tenant_id, name, phone, role, location_id)
     VALUES ($1, $2, $3, 'waiter', $4)
     RETURNING id`,
    [tenantId, opts.name ?? `Mesero de prueba ${nombreSeq}`, opts.phone, opts.locationId ?? null]
  )
  return rows[0].id
}

async function crearDispositivo(
  tenantId: string,
  opts: { fingerprint: string; staffUserId?: string | null; locationId?: string | null }
): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO staff_devices (tenant_id, device_fingerprint, staff_user_id, location_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [tenantId, opts.fingerprint, opts.staffUserId ?? null, opts.locationId ?? null]
  )
  return rows[0].id
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

let tenantA: { id: string; slug: string }
let tenantB: { id: string; slug: string }
let sedeA1: string
let sedeA2: string
let sedeB: string
let clienteA: string

beforeAll(async () => {
  tenantA = await createTestTenant()
  tenantB = await createTestTenant()

  sedeA1 = await crearSede(tenantA.id, { name: 'Envigado', slug: 'envigado', isPrimary: true })
  sedeA2 = await crearSede(tenantA.id, { name: 'Laureles', slug: 'laureles', sortOrder: 1 })
  sedeB = await crearSede(tenantB.id, { name: 'Sede de otra marca', slug: 'sede-principal' })

  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO customers (phone, name, tenant_id) VALUES ($1, $2, $3) RETURNING id`,
    [`31${SUFIJO}`.replace(/\D/g, '').slice(0, 10).padEnd(10, '0'), 'Cliente F4', tenantA.id]
  )
  clienteA = rows[0].id
})

afterAll(async () => {
  const db = getPool()
  // ORDEN OBLIGATORIO: todas las columnas de sede son ON DELETE RESTRICT, así que nada que
  // referencie una sede puede sobrevivir al borrado de la sede.
  const marcas = [[tenantA.id, tenantB.id]]
  await db.query('DELETE FROM review_events WHERE tenant_id = ANY($1)', marcas)
  await db.query('DELETE FROM send_queue WHERE tenant_id = ANY($1)', marcas)
  await db.query('DELETE FROM visits WHERE tenant_id = ANY($1)', marcas)
  await db.query('DELETE FROM staff_devices WHERE tenant_id = ANY($1)', marcas)
  await db.query('DELETE FROM staff_users WHERE tenant_id = ANY($1)', marcas)
  await db.query('DELETE FROM restaurant_locations WHERE tenant_id = ANY($1)', marcas)
  await dropTestTenant(tenantA.id)
  await dropTestTenant(tenantB.id)
  await closePool()
})

// ═══════════════════════════════════════════════════════════════
// La regla transversal: FK COMPUESTA sobre las dos tablas nuevas
// ═══════════════════════════════════════════════════════════════

describe('staff_users.location_id — la FK compuesta (00044)', () => {
  it('acepta el mesero SIN sede: es todo el parque instalado de hoy', async () => {
    const id = await crearMesero(tenantA.id, { phone: tel() })
    const { rows } = await getPool().query('SELECT location_id FROM staff_users WHERE id = $1', [id])
    expect(rows[0].location_id).toBeNull()
  })

  it('acepta el mesero con una sede DE SU PROPIA MARCA', async () => {
    const id = await crearMesero(tenantA.id, { phone: tel(), locationId: sedeA1 })
    const { rows } = await getPool().query('SELECT location_id FROM staff_users WHERE id = $1', [id])
    expect(rows[0].location_id).toBe(sedeA1)
  })

  it('RECHAZA con 23503 el mesero de la marca A contra la sede de la marca B', async () => {
    // Éste es el caso que una FK SIMPLE sobre `id` dejaría pasar sin decir nada, y que
    // convertiría cada visita de ese mesero en un hecho de la marca equivocada.
    const code = await codigoDeError(
      `INSERT INTO staff_users (tenant_id, name, phone, role, location_id)
       VALUES ($1, 'Infiltrado', $2, 'waiter', $3)`,
      [tenantA.id, tel(), sedeB]
    )
    expect(code).toBe('23503')
  })

  it('RECHAZA con 23503 mover a un mesero existente a la sede de otra marca', async () => {
    const id = await crearMesero(tenantA.id, { phone: tel(), locationId: sedeA1 })
    const code = await codigoDeError('UPDATE staff_users SET location_id = $1 WHERE id = $2', [sedeB, id])
    expect(code).toBe('23503')
  })
})

describe('staff_devices.location_id — la FK compuesta (00044)', () => {
  it('acepta el dispositivo sin sede y sin dueño (el de caja)', async () => {
    const id = await crearDispositivo(tenantA.id, { fingerprint: `fp-libre-${SUFIJO}` })
    const { rows } = await getPool().query('SELECT location_id, staff_user_id FROM staff_devices WHERE id = $1', [id])
    expect(rows[0].location_id).toBeNull()
    expect(rows[0].staff_user_id).toBeNull()
  })

  it('RECHAZA con 23503 el dispositivo de la marca A contra la sede de la marca B', async () => {
    const code = await codigoDeError(
      `INSERT INTO staff_devices (tenant_id, device_fingerprint, location_id) VALUES ($1, $2, $3)`,
      [tenantA.id, `fp-cruzado-${SUFIJO}`, sedeB]
    )
    expect(code).toBe('23503')
  })
})

// ═══════════════════════════════════════════════════════════════
// ON DELETE RESTRICT: una sede NUNCA se borra, se desactiva
// ═══════════════════════════════════════════════════════════════

describe('una sede con gente dentro no se borra (ON DELETE RESTRICT)', () => {
  it('RECHAZA con 23001 borrar una sede que tiene meseros', async () => {
    const sede = await crearSede(tenantA.id, { name: 'Belén', slug: `belen-${SUFIJO}`.slice(0, 63) })
    await crearMesero(tenantA.id, { phone: tel(), locationId: sede })

    const code = await codigoDeError('DELETE FROM restaurant_locations WHERE id = $1', [sede])
    expect(code).toBe('23001')

    // Lo que SÍ se puede es desactivarla: es la operación que el producto usa de verdad, y
    // no toca una sola fila de historia.
    await getPool().query('UPDATE restaurant_locations SET is_active = false WHERE id = $1', [sede])
    const { rows } = await getPool().query('SELECT is_active FROM restaurant_locations WHERE id = $1', [sede])
    expect(rows[0].is_active).toBe(false)
  })

  it('RECHAZA con 23001 borrar una sede que tiene dispositivos', async () => {
    const sede = await crearSede(tenantA.id, { name: 'Poblado', slug: `poblado-${SUFIJO}`.slice(0, 63) })
    await crearDispositivo(tenantA.id, { fingerprint: `fp-poblado-${SUFIJO}`, locationId: sede })

    const code = await codigoDeError('DELETE FROM restaurant_locations WHERE id = $1', [sede])
    expect(code).toBe('23001')
  })
})

// ═══════════════════════════════════════════════════════════════
// El trigger de D11: el aparato y su dueño, en la misma sede
// ═══════════════════════════════════════════════════════════════

describe('trigger de coherencia — un dispositivo nunca a nombre de un mesero de otra sede', () => {
  it('acepta dispositivo y mesero en la MISMA sede', async () => {
    const mesero = await crearMesero(tenantA.id, { phone: tel(), locationId: sedeA1 })
    const id = await crearDispositivo(tenantA.id, {
      fingerprint: `fp-ok-${SUFIJO}`,
      staffUserId: mesero,
      locationId: sedeA1,
    })
    expect(id).toBeTruthy()
  })

  it('RECHAZA con 23514 el dispositivo de Laureles a nombre de un mesero de Envigado', async () => {
    const mesero = await crearMesero(tenantA.id, { phone: tel(), locationId: sedeA1 })
    const code = await codigoDeError(
      `INSERT INTO staff_devices (tenant_id, device_fingerprint, staff_user_id, location_id)
       VALUES ($1, $2, $3, $4)`,
      [tenantA.id, `fp-mala-${SUFIJO}`, mesero, sedeA2]
    )
    // Las dos FK compuestas pasan (las dos sedes son de la marca A): sin el trigger esto
    // entraría, y la vía 2 de la precedencia atribuiría a Laureles las visitas de un mesero
    // que es de Envigado.
    expect(code).toBe('23514')
  })

  it('deja pasar cuando alguna de las dos sedes es DESCONOCIDA (NULL no es "otra sede")', async () => {
    const meseroSinSede = await crearMesero(tenantA.id, { phone: tel() })
    const conSede = await crearDispositivo(tenantA.id, {
      fingerprint: `fp-null1-${SUFIJO}`,
      staffUserId: meseroSinSede,
      locationId: sedeA2,
    })
    expect(conSede).toBeTruthy()

    const meseroConSede = await crearMesero(tenantA.id, { phone: tel(), locationId: sedeA1 })
    const sinSede = await crearDispositivo(tenantA.id, {
      fingerprint: `fp-null2-${SUFIJO}`,
      staffUserId: meseroConSede,
    })
    expect(sinSede).toBeTruthy()
  })

  it('RECHAZA con 23514 el dispositivo a nombre de un mesero de OTRA MARCA', async () => {
    // `staff_devices_staff_user_id_fkey` es una FK SIMPLE sobre `staff_users(id)` desde la
    // 00018: sin el trigger, esto pasa sin que Postgres diga nada.
    const meseroB = await crearMesero(tenantB.id, { phone: tel() })
    const code = await codigoDeError(
      `INSERT INTO staff_devices (tenant_id, device_fingerprint, staff_user_id) VALUES ($1, $2, $3)`,
      [tenantA.id, `fp-otramarca-${SUFIJO}`, meseroB]
    )
    expect(code).toBe('23514')
  })

  it('RECHAZA con 23514 mover de sede a un mesero que tiene dispositivos en la sede vieja', async () => {
    const mesero = await crearMesero(tenantA.id, { phone: tel(), locationId: sedeA1 })
    await crearDispositivo(tenantA.id, {
      fingerprint: `fp-anclado-${SUFIJO}`,
      staffUserId: mesero,
      locationId: sedeA1,
    })

    const code = await codigoDeError('UPDATE staff_users SET location_id = $1 WHERE id = $2', [sedeA2, mesero])
    expect(code).toBe('23514')
  })

  it('deja QUITARLE la sede a un mesero aunque tenga dispositivos (NULL nunca contradice)', async () => {
    const mesero = await crearMesero(tenantA.id, { phone: tel(), locationId: sedeA1 })
    await crearDispositivo(tenantA.id, {
      fingerprint: `fp-quitar-${SUFIJO}`,
      staffUserId: mesero,
      locationId: sedeA1,
    })

    const code = await codigoDeError('UPDATE staff_users SET location_id = NULL WHERE id = $1', [mesero])
    expect(code).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// La bomba del fingerprint sin UNIQUE
// ═══════════════════════════════════════════════════════════════

describe('staff_devices_fingerprint_tenant_key — la bomba de los siete .single()', () => {
  it('RECHAZA con 23505 el segundo dispositivo con el mismo fingerprint en la misma marca', async () => {
    const fp = `fp-repe-${SUFIJO}`
    await crearDispositivo(tenantA.id, { fingerprint: fp })

    const code = await codigoDeError(
      `INSERT INTO staff_devices (tenant_id, device_fingerprint) VALUES ($1, $2)`,
      [tenantA.id, fp]
    )
    // Sin este UNIQUE, la segunda fila entraba y los siete `.single()` del código pasaban a
    // devolver PGRST116 para siempre: el mesero veía "dispositivo no reconocido".
    expect(code).toBe('23505')
  })

  it('permite el MISMO fingerprint en marcas distintas: no es un error de nadie', async () => {
    const fp = `fp-compartido-${SUFIJO}`
    await crearDispositivo(tenantA.id, { fingerprint: fp })
    const code = await codigoDeError(
      `INSERT INTO staff_devices (tenant_id, device_fingerprint) VALUES ($1, $2)`,
      [tenantB.id, fp]
    )
    expect(code).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// D11 en el motor: un celular = una fila = una sede
// ═══════════════════════════════════════════════════════════════

describe('staff_users_phone_tenant_key sigue intacto (D11)', () => {
  it('el mismo celular NO puede tener dos filas en la marca, ni una por sede', async () => {
    const phone = tel()
    await crearMesero(tenantA.id, { phone, locationId: sedeA1 })

    // "El mesero trabaja en las dos sedes" es exactamente lo que D11 prohíbe. Si alguien
    // relajara el UNIQUE a (phone, location_id), esto pasaría y D11 dejaría de existir.
    const code = await codigoDeError(
      `INSERT INTO staff_users (tenant_id, name, phone, role, location_id)
       VALUES ($1, 'El mismo', $2, 'waiter', $3)`,
      [tenantA.id, phone, sedeA2]
    )
    expect(code).toBe('23505')
  })
})

// ═══════════════════════════════════════════════════════════════
// La precedencia del §3.1, ya con fuente real en la base
// ═══════════════════════════════════════════════════════════════

describe('la precedencia deja de recibir null (lo que F3 dejó inerte)', () => {
  it('la sede del mesero GANA sobre la del host, leyendo la fila de verdad', async () => {
    const mesero = await crearMesero(tenantA.id, { phone: tel(), locationId: sedeA1 })

    // Exactamente lo que hace `/api/check-in`: pide `location_id` en el SELECT del mesero.
    const { rows } = await getPool().query<{ location_id: string | null }>(
      'SELECT location_id FROM staff_users WHERE id = $1 AND tenant_id = $2',
      [mesero, tenantA.id]
    )

    const resolucion = resolveVisitLocation({
      staffLocationId: rows[0].location_id,
      deviceLocationId: null,
      // El cliente llegó con el enlace guardado de la OTRA sede.
      hostLocationId: sedeA2,
      hostSource: 'host',
      qrLocationId: sedeA2,
    })

    expect(resolucion.locationId).toBe(sedeA1)
    expect(resolucion.source).toBe('staff_user')
    // El QR decía otra sede: se REGISTRA la discrepancia, no se bloquea nada.
    expect(resolucion.conflict).toBe(true)
  })

  it('la sede del dispositivo gana al host y pierde contra el mesero', async () => {
    const mesero = await crearMesero(tenantA.id, { phone: tel(), locationId: sedeA1 })
    const dispositivo = await crearDispositivo(tenantA.id, {
      fingerprint: `fp-prec-${SUFIJO}`,
      staffUserId: mesero,
      locationId: sedeA1,
    })

    const { rows } = await getPool().query<{ location_id: string | null }>(
      'SELECT location_id FROM staff_devices WHERE id = $1 AND tenant_id = $2',
      [dispositivo, tenantA.id]
    )

    const soloDispositivo = resolveVisitLocation({
      staffLocationId: null,
      deviceLocationId: rows[0].location_id,
      hostLocationId: sedeA2,
      hostSource: 'host',
    })
    expect(soloDispositivo.locationId).toBe(sedeA1)
    expect(soloDispositivo.source).toBe('staff_device')
  })

  it('un mesero SIN sede no aporta señal y todo cae al host, como antes de F4', async () => {
    const mesero = await crearMesero(tenantA.id, { phone: tel() })
    const { rows } = await getPool().query<{ location_id: string | null }>(
      'SELECT location_id FROM staff_users WHERE id = $1 AND tenant_id = $2',
      [mesero, tenantA.id]
    )

    const resolucion = resolveVisitLocation({
      staffLocationId: rows[0].location_id,
      deviceLocationId: null,
      hostLocationId: sedeA2,
      hostSource: 'host_single',
    })

    expect(resolucion.locationId).toBe(sedeA2)
    expect(resolucion.source).toBe('host_single')
  })

  it('lo que la precedencia produce con un mesero es lo que los CHECK de la 00043 aceptan', async () => {
    const mesero = await crearMesero(tenantA.id, { phone: tel(), locationId: sedeA1 })
    const resolucion = resolveVisitLocation({
      staffLocationId: mesero ? sedeA1 : null,
      deviceLocationId: null,
      hostLocationId: sedeA2,
      hostSource: 'host',
      qrLocationId: sedeA1,
    })

    const code = await codigoDeError(
      `INSERT INTO visits (tenant_id, customer_id, source, registered_by_staff_id,
                           location_id, location_source, location_conflict)
       VALUES ($1, $2, 'staff_scan', $3, $4, $5, $6)`,
      [tenantA.id, clienteA, mesero, resolucion.locationId, resolucion.source, resolucion.conflict]
    )
    expect(code).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// Las dos funciones SQL que perdían la sede (deudas #10 y #11)
// ═══════════════════════════════════════════════════════════════

describe('enqueue_send_queue() ya no pierde la sede (deuda #10)', () => {
  it('guarda location_id cuando el item la trae', async () => {
    const { rows } = await getPool().query<{ enqueue_send_queue: number }>(
      `SELECT enqueue_send_queue($1::jsonb)`,
      [
        JSON.stringify([
          {
            tenant_id: tenantA.id,
            phone: '3001112233',
            priority: 2,
            message_type: 'birthday',
            template_sid: 'HX-test-f4-consede',
            location_id: sedeA1,
          },
        ]),
      ]
    )
    expect(rows[0].enqueue_send_queue).toBe(1)

    const { rows: fila } = await getPool().query<{ location_id: string | null }>(
      `SELECT location_id FROM send_queue WHERE tenant_id = $1 AND template_sid = $2`,
      [tenantA.id, 'HX-test-f4-consede']
    )
    expect(fila).toHaveLength(1)
    expect(fila[0].location_id).toBe(sedeA1)
  })

  it('sin location_id sigue encolando con sede desconocida (toda campaña masiva de hoy)', async () => {
    await getPool().query(`SELECT enqueue_send_queue($1::jsonb)`, [
      JSON.stringify([
        {
          tenant_id: tenantA.id,
          phone: '3004445566',
          priority: 2,
          message_type: 'reactivation',
          template_sid: 'HX-test-f4-sinsede',
        },
      ]),
    ])

    const { rows } = await getPool().query<{ location_id: string | null }>(
      `SELECT location_id FROM send_queue WHERE tenant_id = $1 AND template_sid = $2`,
      [tenantA.id, 'HX-test-f4-sinsede']
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].location_id).toBeNull()
  })

  it('RECHAZA con 23503 encolar contra la sede de otra marca', async () => {
    const code = await codigoDeError(`SELECT enqueue_send_queue($1::jsonb)`, [
      JSON.stringify([
        {
          tenant_id: tenantA.id,
          phone: '3007778899',
          priority: 2,
          message_type: 'birthday',
          template_sid: 'HX-test-f4-cruzado',
          location_id: sedeB,
        },
      ]),
    ])
    expect(code).toBe('23503')
  })
})

describe("log_review_shown_deduped() ya no deja el denominador sin sede (deuda #11)", () => {
  it('existe UNA sola sobrecarga, de 4 argumentos', async () => {
    // Dos sobrecargas harían ambigua la llamada de 3 argumentos y matarían el registro de
    // impresiones con 42725 — dentro de un `catch` que solo escribe en consola.
    const { rows } = await getPool().query<{ n: string; pronargs: number }>(
      `SELECT count(*)::text AS n, max(pronargs) AS pronargs
         FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'public' AND p.proname = 'log_review_shown_deduped'`
    )
    expect(rows[0].n).toBe('1')
    expect(rows[0].pronargs).toBe(4)
  })

  it('escribe la sede en el evento shown', async () => {
    await getPool().query(`SELECT log_review_shown_deduped($1, $2, $3, $4)`, [
      tenantA.id,
      clienteA,
      12,
      sedeA1,
    ])

    const { rows } = await getPool().query<{ location_id: string | null }>(
      `SELECT location_id FROM review_events
        WHERE tenant_id = $1 AND customer_id = $2 AND action = 'shown'`,
      [tenantA.id, clienteA]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].location_id).toBe(sedeA1)
  })

  it('el dedupe SIGUE siendo por (tenant, cliente) y NO por sede', async () => {
    // Decisión explícita, no un olvido: deduplicar por sede subiría un número que el panel ya
    // reporta hoy. La consecuencia —el mismo cliente en dos sedes cuenta una vez, atribuido a
    // la primera— está escrita en el COMMENT de la función y hay que decirla en pantalla
    // cuando F6 dibuje el embudo por sede.
    await getPool().query(`SELECT log_review_shown_deduped($1, $2, $3, $4)`, [
      tenantA.id,
      clienteA,
      12,
      sedeA2,
    ])

    const { rows } = await getPool().query<{ n: string }>(
      `SELECT count(*)::text AS n FROM review_events
        WHERE tenant_id = $1 AND customer_id = $2 AND action = 'shown'`,
      [tenantA.id, clienteA]
    )
    expect(rows[0].n).toBe('1')
  })

  it('sigue aceptando la llamada de TRES argumentos (código desplegado sin actualizar)', async () => {
    // El cuarto parámetro va al final y con DEFAULT justamente para esto: el orden de
    // despliegue entre la migración y el código deja de importar.
    const { rows: cliente } = await getPool().query<{ id: string }>(
      `INSERT INTO customers (phone, name, tenant_id) VALUES ($1, $2, $3) RETURNING id`,
      [`32${SUFIJO}`.replace(/\D/g, '').slice(0, 10).padEnd(10, '0'), 'Cliente 3 args', tenantA.id]
    )

    const code = await codigoDeError(`SELECT log_review_shown_deduped($1, $2, $3)`, [
      tenantA.id,
      cliente[0].id,
      12,
    ])
    expect(code).toBeNull()

    const { rows } = await getPool().query<{ location_id: string | null }>(
      `SELECT location_id FROM review_events WHERE customer_id = $1 AND action = 'shown'`,
      [cliente[0].id]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].location_id).toBeNull()
  })
})
