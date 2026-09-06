/**
 * Multi-sede F3 contra un Postgres DE VERDAD.
 *
 * Spec: `docs/superpowers/specs/2026-09-02-multisede-design.md` §3
 * Migración bajo prueba: `00043_location_id_eventos.sql` (aplicada por el globalSetup)
 * Código bajo prueba: `src/lib/location-resolver.ts`
 *
 * QUÉ AÑADE ESTO SOBRE `tests/unit/location-resolver.test.ts`
 * ──────────────────────────────────────────────────────────
 * El test unitario prueba la DECISIÓN. Éste prueba el CONTRATO CON EL SCHEMA: que lo que la
 * decisión produce es exactamente lo que Postgres acepta, y que lo que la decisión promete no
 * producir es exactamente lo que Postgres rechaza.
 *
 * Son cosas distintas y las dos fallan solas. Un resolver perfecto que emita una procedencia
 * que el CHECK no conoce revienta con 23514 **dentro del `catch` best-effort del check-in**:
 * la visita se pierde, el cliente ve su pantalla de éxito y nadie se entera nunca.
 *
 * Las sedes se leen con la MISMA consulta que `getActiveLocations()` de `src/lib/tenant.ts`
 * (mismos filtros, mismo orden), así que si esa consulta y esta prueba se separan, se separan
 * a la vista.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant } from '../setup/db'
import { pickLocationForHost, resolveVisitLocation, LOCATION_SOURCES } from '@/lib/location-resolver'
import type { ActiveLocation } from '@/lib/location-resolver'

/** Espejo exacto de `getActiveLocations()` en `src/lib/tenant.ts`. */
async function leerSedesActivas(tenantId: string): Promise<ActiveLocation[]> {
  const { rows } = await getPool().query<ActiveLocation>(
    `SELECT id, name, slug, domain, is_primary
       FROM restaurant_locations
      WHERE tenant_id = $1 AND is_active = true
      ORDER BY is_primary DESC, sort_order ASC, name ASC`,
    [tenantId]
  )
  return rows
}

async function crearSede(
  tenantId: string,
  opts: { name: string; slug: string; domain?: string | null; isPrimary?: boolean; sortOrder?: number; isActive?: boolean }
): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO restaurant_locations (tenant_id, name, slug, domain, is_primary, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      tenantId,
      opts.name,
      opts.slug,
      opts.domain ?? null,
      opts.isPrimary ?? false,
      opts.sortOrder ?? 0,
      opts.isActive ?? true,
    ]
  )
  return rows[0].id
}

async function crearCliente(tenantId: string, sufijo: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    // `tenant_id` EXPLÍCITO siempre: la 00030 nunca se aplicó y la columna todavía arrastra
    // un DEFAULT puente. Un INSERT que lo omita se va callado al tenant equivocado.
    `INSERT INTO customers (phone, name, tenant_id) VALUES ($1, $2, $3) RETURNING id`,
    [`30${sufijo}`.slice(0, 10).padEnd(10, '0'), 'Cliente de prueba', tenantId]
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

/** Etiqueta de dominio válida para el CHECK `restaurant_locations_domain_format_check`
 *  (minúsculas, sin guion al principio ni al final) y distinta en cada corrida: el índice
 *  único de `domain` es GLOBAL, no por tenant. */
const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.replace(/[^a-z0-9]/g, '')
const DOMINIO_MARCA = `marca-${SUFIJO}x.constelarys.test`
const DOMINIO_SEDE_2 = `laureles.${DOMINIO_MARCA}`

let tenantA: { id: string; slug: string }
let tenantB: { id: string; slug: string }
let sedeUnicaA: string
let sedeDosA: string
let sedeB: string
let clienteA: string

beforeAll(async () => {
  tenantA = await createTestTenant()
  tenantB = await createTestTenant()

  await getPool().query('UPDATE tenants SET domain = $1 WHERE id = $2', [DOMINIO_MARCA, tenantA.id])

  // La 00042 le deja a la sede principal EL MISMO dominio de la marca. Se reproduce tal cual:
  // es la forma real que tienen hoy los 4 tenants vivos.
  sedeUnicaA = await crearSede(tenantA.id, {
    name: 'Sede principal',
    slug: 'sede-principal',
    domain: DOMINIO_MARCA,
    isPrimary: true,
    sortOrder: 0,
  })

  sedeB = await crearSede(tenantB.id, { name: 'Sede de otra marca', slug: 'sede-principal' })

  clienteA = await crearCliente(tenantA.id, Math.random().toString().slice(2, 10))
})

afterAll(async () => {
  const db = getPool()
  // ORDEN OBLIGATORIO: las columnas de sede son ON DELETE RESTRICT, así que las sedes no se
  // pueden borrar mientras alguna visita las referencie. `visits` cae por el CASCADE de
  // `customers`, que `dropTestTenant` borra — pero las sedes hay que borrarlas antes del
  // tenant, porque su propia FK a `tenants` también es RESTRICT (00025).
  await db.query('DELETE FROM visits WHERE tenant_id = ANY($1)', [[tenantA.id, tenantB.id]])
  await db.query('DELETE FROM restaurant_locations WHERE tenant_id = ANY($1)', [[tenantA.id, tenantB.id]])
  await dropTestTenant(tenantA.id)
  await dropTestTenant(tenantB.id)
  await closePool()
})

// ═══════════════════════════════════════════════════════════════
// §3.2 — sede única implícita, sobre filas reales
// ═══════════════════════════════════════════════════════════════

describe('sede única implícita, leída de la base real (§3.2)', () => {
  it('con UNA sede activa el dominio raíz resuelve host_single', async () => {
    const sedes = await leerSedesActivas(tenantA.id)
    expect(sedes).toHaveLength(1)

    const pick = pickLocationForHost(DOMINIO_MARCA, DOMINIO_MARCA, sedes)
    expect(pick.locationId).toBe(sedeUnicaA)
    expect(pick.source).toBe('host_single')
    expect(pick.requiresChoice).toBe(false)
  })

  it('al abrir la SEGUNDA sede, el mismo dominio raíz deja de atribuir y pide elegir', async () => {
    sedeDosA = await crearSede(tenantA.id, {
      name: 'Laureles',
      slug: 'laureles',
      domain: DOMINIO_SEDE_2,
      sortOrder: 1,
    })

    const sedes = await leerSedesActivas(tenantA.id)
    expect(sedes).toHaveLength(2)
    // La principal primero: es el orden en el que se le presentan a una persona.
    expect(sedes[0].id).toBe(sedeUnicaA)

    const pick = pickLocationForHost(DOMINIO_MARCA, DOMINIO_MARCA, sedes)
    expect(pick.locationId).toBeNull()
    expect(pick.source).toBeNull()
    expect(pick.requiresChoice).toBe(true)
    // La lista que viaja en el cuerpo del 409 del registro.
    expect(pick.choices.map((l) => l.id)).toEqual([sedeUnicaA, sedeDosA])
    expect(pick.choices.map((l) => l.domain)).toEqual([DOMINIO_MARCA, DOMINIO_SEDE_2])
  })

  it('el subdominio de la sede 2 sigue resolviendo sin preguntar (source host)', async () => {
    const sedes = await leerSedesActivas(tenantA.id)
    const pick = pickLocationForHost(DOMINIO_SEDE_2, DOMINIO_MARCA, sedes)

    expect(pick.locationId).toBe(sedeDosA)
    expect(pick.source).toBe('host')
    expect(pick.requiresChoice).toBe(false)
  })

  it('desactivar la sede 2 devuelve la marca a sede única implícita', async () => {
    await getPool().query('UPDATE restaurant_locations SET is_active = false WHERE id = $1', [sedeDosA])

    const sedes = await leerSedesActivas(tenantA.id)
    expect(sedes.map((l) => l.id)).toEqual([sedeUnicaA])

    const pick = pickLocationForHost(DOMINIO_MARCA, DOMINIO_MARCA, sedes)
    expect(pick.source).toBe('host_single')
    expect(pick.requiresChoice).toBe(false)

    await getPool().query('UPDATE restaurant_locations SET is_active = true WHERE id = $1', [sedeDosA])
  })

  it('la sede de OTRA marca nunca entra en la lista, aunque exista', async () => {
    const sedes = await leerSedesActivas(tenantA.id)
    expect(sedes.map((l) => l.id)).not.toContain(sedeB)
  })
})

// ═══════════════════════════════════════════════════════════════
// El contrato con los CHECK de la 00043
// ═══════════════════════════════════════════════════════════════

describe('visits — la sede y su procedencia van JUNTAS o no van', () => {
  it('acepta la visita sin sede (todo el histórico de los 4 tenants vivos)', async () => {
    const code = await codigoDeError(
      `INSERT INTO visits (customer_id, tenant_id, source) VALUES ($1, $2, 'qr')`,
      [clienteA, tenantA.id]
    )
    expect(code).toBeNull()
  })

  it('rechaza media pareja: sede SIN procedencia', async () => {
    const code = await codigoDeError(
      `INSERT INTO visits (customer_id, tenant_id, source, location_id) VALUES ($1, $2, 'qr', $3)`,
      [clienteA, tenantA.id, sedeUnicaA]
    )
    expect(code).toBe('23514')
  })

  it('rechaza media pareja: procedencia SIN sede', async () => {
    const code = await codigoDeError(
      `INSERT INTO visits (customer_id, tenant_id, source, location_source) VALUES ($1, $2, 'qr', 'host')`,
      [clienteA, tenantA.id]
    )
    expect(code).toBe('23514')
  })

  it.each([...LOCATION_SOURCES])('acepta la procedencia %s del resolver', async (source) => {
    const code = await codigoDeError(
      `INSERT INTO visits (customer_id, tenant_id, source, location_id, location_source)
       VALUES ($1, $2, 'qr', $3, $4)`,
      [clienteA, tenantA.id, sedeUnicaA, source]
    )
    expect(code).toBeNull()
  })

  it('rechaza una procedencia inventada', async () => {
    const code = await codigoDeError(
      `INSERT INTO visits (customer_id, tenant_id, source, location_id, location_source)
       VALUES ($1, $2, 'qr', $3, 'geocerca')`,
      [clienteA, tenantA.id, sedeUnicaA]
    )
    expect(code).toBe('23514')
  })
})

describe('visits.location_conflict — el TRI-ESTADO se guarda como tri-estado', () => {
  async function guardarYLeer(conflict: boolean | null): Promise<boolean | null> {
    const { rows } = await getPool().query<{ location_conflict: boolean | null }>(
      `INSERT INTO visits (customer_id, tenant_id, source, location_id, location_source, location_conflict)
       VALUES ($1, $2, 'staff_scan', $3, 'staff_user', $4)
       RETURNING location_conflict`,
      [clienteA, tenantA.id, sedeUnicaA, conflict]
    )
    return rows[0].location_conflict
  }

  it('NULL se guarda como NULL, no como false', async () => {
    // La diferencia importa: `false` afirmaría "verificado, sin conflicto" sobre ~1581
    // visitas que nadie verificó nunca. Es la razón por la que la columna NO nació
    // `NOT NULL DEFAULT false`.
    await expect(guardarYLeer(null)).resolves.toBeNull()
  })

  it('false y true se guardan distintos entre sí y distintos de NULL', async () => {
    await expect(guardarYLeer(false)).resolves.toBe(false)
    await expect(guardarYLeer(true)).resolves.toBe(true)
  })

  it('el resolver produce los tres estados y el INSERT los acepta tal cual', async () => {
    const sinQr = resolveVisitLocation({ hostLocationId: sedeUnicaA, hostSource: 'host_single' })
    const coincide = resolveVisitLocation({
      hostLocationId: sedeUnicaA,
      hostSource: 'host_single',
      qrLocationId: sedeUnicaA,
    })
    const discrepa = resolveVisitLocation({
      hostLocationId: sedeUnicaA,
      hostSource: 'host_single',
      qrLocationId: sedeDosA,
    })

    expect([sinQr.conflict, coincide.conflict, discrepa.conflict]).toEqual([null, false, true])
    // El QR que discrepa NO cambia la sede: solo la marca como conflictiva.
    expect(discrepa.locationId).toBe(sedeUnicaA)

    for (const res of [sinQr, coincide, discrepa]) {
      const code = await codigoDeError(
        `INSERT INTO visits (customer_id, tenant_id, source, location_id, location_source, location_conflict)
         VALUES ($1, $2, 'qr', $3, $4, $5)`,
        [clienteA, tenantA.id, res.locationId, res.source, res.conflict]
      )
      expect(code).toBeNull()
    }
  })
})

describe('la FK COMPUESTA (location_id, tenant_id) — el motor, no el programador', () => {
  it('rechaza con 23503 una visita de la marca A atribuida a la sede de la marca B', async () => {
    // Una FK simple sobre `id` dejaría pasar esto y Postgres no diría absolutamente nada.
    // El aislamiento del producto son 144 `.eq('tenant_id', …)` a mano en 48 archivos: el que
    // se olvida uno no recibe ningún error. Aquí sí.
    const code = await codigoDeError(
      `INSERT INTO visits (customer_id, tenant_id, source, location_id, location_source)
       VALUES ($1, $2, 'qr', $3, 'host')`,
      [clienteA, tenantA.id, sedeB]
    )
    expect(code).toBe('23503')
  })

  it('una sede con historia NO se puede borrar (ON DELETE RESTRICT, nunca SET NULL)', async () => {
    // `SET NULL` degradaría historia a "sede desconocida" EN SILENCIO y destruiría justo el
    // dato que D12 pide medir. Una sede se DESACTIVA, no se borra.
    const code = await codigoDeError('DELETE FROM restaurant_locations WHERE id = $1', [sedeUnicaA])
    expect(code).toBe('23001')
  })
})

// ═══════════════════════════════════════════════════════════════
// D2 — el dominio cruzado, en las DOS direcciones (00041 + 00051)
// ═══════════════════════════════════════════════════════════════
/**
 * Postgres no tiene índices únicos ENTRE tablas, así que "un host resuelve a una sola
 * marca" no lo puede sostener un UNIQUE: son dos triggers que solo valen juntos.
 *
 *   · 00041 → sobre `restaurant_locations`: una sede no toma el `tenants.domain` de otra marca.
 *   · 00051 → sobre `tenants`: una marca no toma el `domain` de la sede de otra marca.
 *
 * Si falta cualquiera de los dos, `resolveHostContext()` (`src/lib/tenant.ts`) tiene DOS
 * dueños para el mismo host: gana su camino 1 (`getTenantByDomain`) y el subdominio de la
 * sede de A pasa a servir la marca B entera. Por eso se prueban en el mismo bloque — el que
 * borre uno tiene que ver fallar esto.
 */
describe('D2 — un host resuelve a UNA sola marca (00041 + 00051)', () => {
  /** El mensaje del error, no solo su código: los dos triggers usan el mismo. */
  async function fallo(sql: string, params: unknown[]): Promise<{ code: string; message: string } | null> {
    try {
      await getPool().query(sql, params)
      return null
    } catch (err) {
      const e = err as { code?: string; message?: string }
      return { code: e.code ?? 'sin_codigo', message: e.message ?? '' }
    }
  }

  const DOMINIO_SEDE_D2 = `envigado.${DOMINIO_MARCA}`
  const DOMINIO_SEDE_DORMIDA = `dormida.${DOMINIO_MARCA}`

  beforeAll(async () => {
    // Una sede de A con dominio PROPIO, distinto del de su marca: es la forma que tiene
    // toda sede bajo la regla del dueño de 2026-09-06 (la ciudad va en el subdominio).
    await crearSede(tenantA.id, {
      name: 'Envigado',
      slug: 'envigado-d2',
      domain: DOMINIO_SEDE_D2,
      sortOrder: 5,
    })
    await crearSede(tenantA.id, {
      name: 'Sede cerrada',
      slug: 'dormida-d2',
      domain: DOMINIO_SEDE_DORMIDA,
      sortOrder: 6,
      isActive: false,
    })
  })

  afterAll(async () => {
    // Que el bloque no le deje dominio puesto a la marca B a los que vengan después.
    await getPool().query('UPDATE tenants SET domain = NULL WHERE id = $1', [tenantB.id])
  })

  it('00041 — una sede de la marca B no puede tomar el dominio de la marca A', async () => {
    const err = await fallo(
      `UPDATE restaurant_locations SET domain = $1 WHERE id = $2`,
      [DOMINIO_MARCA, sedeB]
    )
    expect(err?.message).toContain('dominio_de_otra_marca')
  })

  it('00051 — la marca B no puede tomar el subdominio de una sede de la marca A', async () => {
    // ESTE es el agujero que la 00041 dejó abierto: su trigger vive en la OTRA tabla, así
    // que un UPDATE sobre `tenants` no lo despertaba.
    const err = await fallo('UPDATE tenants SET domain = $1 WHERE id = $2', [
      DOMINIO_SEDE_D2,
      tenantB.id,
    ])
    expect(err?.message).toContain('dominio_de_otra_marca')
  })

  it('00051 — tampoco al dar de alta la marca, no solo al editarla', async () => {
    const err = await fallo(
      `INSERT INTO tenants (slug, name, business_type, domain, is_active)
       VALUES ($1, 'Marca intrusa', 'restaurant', $2, true)`,
      [`intrusa-${SUFIJO}`, DOMINIO_SEDE_D2]
    )
    expect(err?.message).toContain('dominio_de_otra_marca')
  })

  it('00051 — una sede DESACTIVADA sigue reservando su dominio', async () => {
    // Decisión escrita en la 00051: ningún trigger escucha `is_active`, así que si se
    // permitiera tomar el dominio de una sede dormida, el choque nacería en silencio el
    // día que alguien la reactive.
    const err = await fallo('UPDATE tenants SET domain = $1 WHERE id = $2', [
      DOMINIO_SEDE_DORMIDA,
      tenantB.id,
    ])
    expect(err?.message).toContain('dominio_de_otra_marca')
  })

  it('el solape DENTRO de la misma marca sigue permitido (00042: cero reimpresión)', async () => {
    // La sede principal de A repite el dominio de A desde el `beforeAll` del archivo. Que
    // eso siga siendo legal es la razón por la que los QR ya impresos no se tocaron.
    const { rows } = await getPool().query(
      `SELECT count(*)::int AS n FROM restaurant_locations
        WHERE tenant_id = $1 AND domain = $2`,
      [tenantA.id, DOMINIO_MARCA]
    )
    expect(rows[0].n).toBe(1)

    // Y en la otra dirección: la marca A puede reafirmar como suyo el dominio de su propia sede.
    const err = await fallo('UPDATE tenants SET domain = $1 WHERE id = $2', [
      DOMINIO_SEDE_D2,
      tenantA.id,
    ])
    expect(err).toBeNull()
    await getPool().query('UPDATE tenants SET domain = $1 WHERE id = $2', [DOMINIO_MARCA, tenantA.id])
  })

  it('una marca sin dominio no la molesta ningún trigger', async () => {
    const err = await fallo('UPDATE tenants SET domain = NULL WHERE id = $1', [tenantB.id])
    expect(err).toBeNull()
  })
})
