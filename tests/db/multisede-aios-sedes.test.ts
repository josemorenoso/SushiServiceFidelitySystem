/**
 * Multi-sede F8 — la superficie de escritura de SEDES que usa el AIOS.
 *
 * Migración bajo prueba: `00056_aios_sedes.sql` (la aplica el globalSetup).
 * Decisión:  `Level 2.0/aios-constelarys/docs/DECISION-MULTISEDE-2026-09-07.md`
 * Feature:   `docs/features/multi-sede.md` §2.bis y §5 (deuda 17)
 *
 * QUÉ PRUEBA Y POR QUÉ ACÁ
 * ────────────────────────
 * Estas tres funciones son la ÚNICA vía por la que un sistema externo escribe
 * en `restaurant_locations`: la 00035 v2 le quitó al rol `aios_constelarys`
 * todo INSERT directo a propósito. O sea que las validaciones NO son
 * cosméticas — son el perímetro. Y viven en plpgsql, así que ningún `tsc` las
 * mira: si se rompen, se rompen en producción.
 *
 * Los dos casos que más importan y que un test de TypeScript no puede dar:
 *
 *   1. **Un alta de 2 sedes SIN subdominio nace muerta.** Por D21, una marca
 *      con 2+ sedes activas deja de atribuir por el dominio raíz y el registro
 *      responde 409. Sin `sede_sin_identidad`, `aios_provision_tenant` crearía
 *      felizmente dos sedes que no pueden registrar un solo cliente nuevo, y
 *      eso solo se descubriría con el negocio ya abierto.
 *
 *   2. **Agregar la sede 2 no puede apagar a la sede 1.** Mientras la marca
 *      tiene una sola sede, esa sede vive del dominio raíz ("sede única
 *      implícita"). El instante en que nace la segunda, ese atajo se apaga.
 *      `sede_previa_sin_subdominio` convierte una caída silenciosa en un error
 *      que dice qué hacer.
 *
 * Cada prueba crea su propio tenant desechable y lo borra al terminar.
 */

import { describe, it, expect, afterAll } from 'vitest'
import { getPool, closePool } from '../setup/db'
import { pickLocationForHost } from '@/lib/location-resolver'
import type { ActiveLocation } from '@/lib/location-resolver'

/** Sufijo único por corrida: `tenants.slug` y los dominios son únicos GLOBAL. */
function sufijo(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

const creados: string[] = []

/**
 * Da de alta una marca por la MISMA puerta que usa el AIOS. No hay INSERT
 * directo a propósito: si el test sembrara a mano, probaría un camino que en
 * producción no existe.
 */
async function provisionar(payload: Record<string, unknown>): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT aios_provision_tenant($1::jsonb) AS id`,
    [JSON.stringify(payload)]
  )
  creados.push(payload.slug as string)
  return rows[0].id
}

async function addLocation(slug: string, payload: Record<string, unknown>): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT aios_add_location($1, $2::jsonb) AS id`,
    [slug, JSON.stringify(payload)]
  )
  return rows[0].id
}

async function setLocation(
  slug: string,
  locationId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await getPool().query(`SELECT aios_set_location($1, $2::uuid, $3::jsonb)`, [
    slug,
    locationId,
    JSON.stringify(payload),
  ])
}

async function sedesDe(slug: string) {
  const { rows } = await getPool().query(
    `SELECT l.name, l.slug, l.domain, l.is_primary, l.sort_order, l.is_active
       FROM restaurant_locations l
       JOIN tenants t ON t.id = l.tenant_id
      WHERE t.slug = $1
      ORDER BY l.sort_order ASC`,
    [slug]
  )
  return rows
}

/** El mensaje de un `RAISE EXCEPTION ... USING DETAIL` de plpgsql. */
async function fallaCon(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('se esperaba una excepción y no hubo ninguna')
}

afterAll(async () => {
  const db = getPool()
  for (const slug of creados) {
    // El orden importa: `restaurant_locations` tiene FK compuestas con
    // ON DELETE RESTRICT desde las tablas de hechos, y `tenants` es el padre.
    await db.query(
      `DELETE FROM restaurant_locations WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $1)`,
      [slug]
    )
    await db.query(
      `DELETE FROM admin_settings WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $1)`,
      [slug]
    )
    await db.query(
      `DELETE FROM reward_tiers WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $1)`,
      [slug]
    )
    await db.query(`DELETE FROM tenants WHERE slug = $1`, [slug])
  }
  await closePool()
})

describe('00056 — aios_provision_tenant con varias sedes', () => {
  it('crea UNA marca con DOS sedes, cada una con su subdominio', async () => {
    const s = sufijo()
    const slug = `t1-${s}`

    await provisionar({
      slug,
      name: 'Tepuy',
      domain: `${slug}.constelarys.com`,
      messaging_provider: 'twilio',
      locations: [
        { name: 'Poblado', slug: 'poblado', domain: `poblado-${s}.constelarys.com` },
        { name: 'Laureles', slug: 'laureles', domain: `laureles-${s}.constelarys.com` },
      ],
    })

    // Criterio de aceptación 1: UN tenant, DOS restaurant_locations.
    const { rows: marcas } = await getPool().query(
      `SELECT count(*)::int AS n FROM tenants WHERE slug = $1`,
      [slug]
    )
    expect(marcas[0].n).toBe(1)

    const sedes = await sedesDe(slug)
    expect(sedes).toHaveLength(2)
    expect(sedes.map((s) => s.slug)).toEqual(['poblado', 'laureles'])
    expect(sedes.map((s) => s.domain)).toEqual([
      `poblado-${s}.constelarys.com`,
      `laureles-${s}.constelarys.com`,
    ])
  })

  it('la PRIMERA sede del array nace is_primary — antes ninguna lo era', async () => {
    // La 00042 solo adoptó los tenants que YA existían. Todo tenant creado por
    // el AIOS después nacía sin sede principal, y `is_primary` es lo que decide
    // de quién es el material impreso de la marca.
    const s = sufijo()
    const slug = `t2-${s}`

    await provisionar({
      slug,
      name: 'Tepuy',
      domain: `${slug}.constelarys.com`,
      locations: [
        { name: 'Poblado', slug: 'poblado', domain: `p2-${s}.constelarys.com` },
        { name: 'Laureles', slug: 'laureles', domain: `l2-${s}.constelarys.com` },
      ],
    })

    const sedes = await sedesDe(slug)
    expect(sedes.filter((x) => x.is_primary)).toHaveLength(1)
    expect(sedes.find((x) => x.is_primary)?.slug).toBe('poblado')
  })

  it('RECHAZA un alta de 2 sedes sin subdominio: nacería sin poder registrar clientes', async () => {
    const s = sufijo()
    const mensaje = await fallaCon(() =>
      provisionar({
        slug: `t3-${s}`,
        name: 'Sin identidad',
        locations: [{ name: 'A' }, { name: 'B' }],
      })
    )
    expect(mensaje).toContain('sede_sin_identidad')
  })

  it('una sede SOLA sigue aceptándose sin slug ni domain: el AIOS viejo no se rompe', async () => {
    // Compatibilidad hacia atrás explícita. El AIOS desplegado manda hoy
    // `locations: [{name, address, lat, lon, radius_meters}]` y nada más.
    const s = sufijo()
    const slug = `t4-${s}`

    await provisionar({
      slug,
      name: 'Una sola',
      domain: `${slug}.constelarys.com`,
      locations: [{ name: 'Sede principal', address: 'Calle 1', radius_meters: 150 }],
    })

    const sedes = await sedesDe(slug)
    expect(sedes).toHaveLength(1)
    expect(sedes[0].slug).toBeNull()
    expect(sedes[0].domain).toBeNull()
    expect(sedes[0].is_primary).toBe(true)
  })
})

describe('00056 — aios_add_location', () => {
  it('agrega la sede 3 a una marca que ya existe', async () => {
    const s = sufijo()
    const slug = `t5-${s}`

    await provisionar({
      slug,
      name: 'Tepuy',
      domain: `${slug}.constelarys.com`,
      locations: [
        { name: 'Poblado', slug: 'poblado', domain: `p5-${s}.constelarys.com` },
        { name: 'Laureles', slug: 'laureles', domain: `l5-${s}.constelarys.com` },
      ],
    })

    const id = await addLocation(slug, {
      name: 'Envigado',
      slug: 'envigado',
      domain: `e5-${s}.constelarys.com`,
    })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)

    const sedes = await sedesDe(slug)
    expect(sedes).toHaveLength(3)
    // Nunca principal: la principal ya la fijó el alta.
    expect(sedes.find((x) => x.slug === 'envigado')?.is_primary).toBe(false)
    // Y se ordena al final sola, sin que el AIOS tenga que calcularlo.
    expect(sedes[2].slug).toBe('envigado')
  })

  it('rechaza un tenant que no existe', async () => {
    const mensaje = await fallaCon(() =>
      addLocation('marca-que-no-existe-jamas', { name: 'X', slug: 'x', domain: 'x.example.com' })
    )
    expect(mensaje).toContain('tenant_no_existe')
  })

  it('rechaza el slug repetido DENTRO de la marca', async () => {
    const s = sufijo()
    const slug = `t6-${s}`
    await provisionar({
      slug,
      name: 'Tepuy',
      domain: `${slug}.constelarys.com`,
      locations: [
        { name: 'Poblado', slug: 'poblado', domain: `p6-${s}.constelarys.com` },
        { name: 'Laureles', slug: 'laureles', domain: `l6-${s}.constelarys.com` },
      ],
    })

    const mensaje = await fallaCon(() =>
      addLocation(slug, { name: 'Otro', slug: 'poblado', domain: `otro6-${s}.constelarys.com` })
    )
    expect(mensaje).toContain('sede_slug_repetido')
  })

  it('el mismo slug de sede SÍ se permite en otra marca', async () => {
    // `idx_restaurant_locations_tenant_slug` es único por (tenant_id, slug), no
    // global: dos marcas pueden tener cada una su sede "laureles".
    const s = sufijo()
    const a = `t7a-${s}`
    const b = `t7b-${s}`
    for (const [marca, pref] of [[a, 'a7'], [b, 'b7']] as const) {
      await provisionar({
        slug: marca,
        name: marca,
        domain: `${marca}.constelarys.com`,
        locations: [
          { name: 'Poblado', slug: 'poblado', domain: `${pref}p-${s}.constelarys.com` },
          { name: 'Laureles', slug: 'laureles', domain: `${pref}l-${s}.constelarys.com` },
        ],
      })
    }
    expect((await sedesDe(a)).map((x) => x.slug)).toEqual(['poblado', 'laureles'])
    expect((await sedesDe(b)).map((x) => x.slug)).toEqual(['poblado', 'laureles'])
  })

  it('exige subdominio: una sede sin él no puede registrar clientes (D21)', async () => {
    const s = sufijo()
    const slug = `t8-${s}`
    await provisionar({
      slug,
      name: 'Tepuy',
      domain: `${slug}.constelarys.com`,
      locations: [
        { name: 'Poblado', slug: 'poblado', domain: `p8-${s}.constelarys.com` },
        { name: 'Laureles', slug: 'laureles', domain: `l8-${s}.constelarys.com` },
      ],
    })

    const mensaje = await fallaCon(() => addLocation(slug, { name: 'X', slug: 'equis' }))
    expect(mensaje).toContain('sede_sin_dominio')
  })

  it('rechaza tomar el dominio RAÍZ de su propia marca', async () => {
    // El raíz tiene que seguir significando "la marca": con 2+ sedes su trabajo
    // es dar 409 y dejar elegir, no resolver a una sede cualquiera.
    const s = sufijo()
    const slug = `t9-${s}`
    await provisionar({
      slug,
      name: 'Tepuy',
      domain: `${slug}.constelarys.com`,
      locations: [
        { name: 'Poblado', slug: 'poblado', domain: `p9-${s}.constelarys.com` },
        { name: 'Laureles', slug: 'laureles', domain: `l9-${s}.constelarys.com` },
      ],
    })

    const mensaje = await fallaCon(() =>
      addLocation(slug, { name: 'X', slug: 'equis', domain: `${slug}.constelarys.com` })
    )
    expect(mensaje).toContain('sede_dominio_es_el_de_la_marca')
  })

  it('rechaza un dominio que ya usa la sede de OTRA marca', async () => {
    const s = sufijo()
    const a = `t10a-${s}`
    const b = `t10b-${s}`
    await provisionar({
      slug: a,
      name: 'A',
      domain: `${a}.constelarys.com`,
      locations: [
        { name: 'P', slug: 'poblado', domain: `pa10-${s}.constelarys.com` },
        { name: 'L', slug: 'laureles', domain: `la10-${s}.constelarys.com` },
      ],
    })
    await provisionar({
      slug: b,
      name: 'B',
      domain: `${b}.constelarys.com`,
      locations: [
        { name: 'P', slug: 'poblado', domain: `pb10-${s}.constelarys.com` },
        { name: 'L', slug: 'laureles', domain: `lb10-${s}.constelarys.com` },
      ],
    })

    const mensaje = await fallaCon(() =>
      addLocation(b, { name: 'X', slug: 'equis', domain: `pa10-${s}.constelarys.com` })
    )
    expect(mensaje).toContain('sede_dominio_ocupado')
  })

  it('rechaza coordenadas a medias', async () => {
    const s = sufijo()
    const slug = `t11-${s}`
    await provisionar({
      slug,
      name: 'Tepuy',
      domain: `${slug}.constelarys.com`,
      locations: [
        { name: 'P', slug: 'poblado', domain: `p11-${s}.constelarys.com` },
        { name: 'L', slug: 'laureles', domain: `l11-${s}.constelarys.com` },
      ],
    })

    const mensaje = await fallaCon(() =>
      addLocation(slug, {
        name: 'X',
        slug: 'equis',
        domain: `e11-${s}.constelarys.com`,
        lat: '6.24',
      })
    )
    expect(mensaje).toContain('sede_coordenadas_a_medias')
  })
})

describe('00056 — el paso single → multi', () => {
  it('agregar la sede 2 se RECHAZA mientras la sede 1 viva del dominio raíz', async () => {
    // Es la caída que la guarda existe para evitar: la sede 1 se atribuye hoy
    // por "sede única implícita", y ese atajo se apaga en el instante en que
    // nace la segunda. Sin este rechazo, el alta de la sede 2 dejaría a la 1
    // sin poder registrar un solo cliente nuevo, en silencio.
    const s = sufijo()
    const slug = `t12-${s}`

    // Una marca "vieja", como la dejó la 00042: su única sede repite el
    // dominio de la marca.
    await provisionar({
      slug,
      name: 'Marca vieja',
      domain: `${slug}.constelarys.com`,
      locations: [{ name: 'Sede principal' }],
    })
    await getPool().query(
      `UPDATE restaurant_locations
          SET slug = 'sede-principal', domain = $2
        WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $1)`,
      [slug, `${slug}.constelarys.com`]
    )

    const mensaje = await fallaCon(() =>
      addLocation(slug, { name: 'Laureles', slug: 'laureles', domain: `l12-${s}.constelarys.com` })
    )
    expect(mensaje).toContain('sede_previa_sin_subdominio')
  })

  it('y se DESTRABA dándole su subdominio propio a la sede 1', async () => {
    const s = sufijo()
    const slug = `t13-${s}`

    await provisionar({
      slug,
      name: 'Marca vieja',
      domain: `${slug}.constelarys.com`,
      locations: [{ name: 'Sede principal' }],
    })
    const { rows } = await getPool().query<{ id: string }>(
      `UPDATE restaurant_locations
          SET slug = 'sede-principal', domain = $2
        WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $1)
        RETURNING id`,
      [slug, `${slug}.constelarys.com`]
    )
    const sede1 = rows[0].id

    // El dominio se puede FIJAR porque todavía era el de la marca.
    await setLocation(slug, sede1, { slug: 'poblado', domain: `p13-${s}.constelarys.com` })

    // Y ahora sí entra la segunda.
    await addLocation(slug, { name: 'Laureles', slug: 'laureles', domain: `l13-${s}.constelarys.com` })

    const sedes = await sedesDe(slug)
    expect(sedes).toHaveLength(2)
    expect(sedes.map((x) => x.domain).sort()).toEqual(
      [`l13-${s}.constelarys.com`, `p13-${s}.constelarys.com`].sort()
    )
  })

  it('lo mismo cuando la sede 1 no tiene NINGÚN dominio — el caso de un alta reciente', async () => {
    // Es el camino de producción de verdad: una marca dada de alta HOY por el
    // AIOS en modo «una sola sede» nace con la sede sin slug y sin domain (la
    // 00042 solo adoptó las que ya existían). La guarda tiene que verlo igual.
    const s = sufijo()
    const slug = `t12b-${s}`

    await provisionar({
      slug,
      name: 'Alta reciente',
      domain: `${slug}.constelarys.com`,
      locations: [{ name: 'Sede principal' }],
    })

    const mensaje = await fallaCon(() =>
      addLocation(slug, { name: 'Laureles', slug: 'laureles', domain: `l12b-${s}.constelarys.com` })
    )
    expect(mensaje).toContain('sede_previa_sin_subdominio')

    // Y se destraba igual: se le da slug + domain propios a la sede 1.
    const { rows } = await getPool().query<{ id: string }>(
      `SELECT l.id FROM restaurant_locations l
         JOIN tenants t ON t.id = l.tenant_id WHERE t.slug = $1`,
      [slug]
    )
    await setLocation(slug, rows[0].id, { slug: 'poblado', domain: `p12b-${s}.constelarys.com` })
    await addLocation(slug, { name: 'Laureles', slug: 'laureles', domain: `l12b-${s}.constelarys.com` })

    expect(await sedesDe(slug)).toHaveLength(2)
  })

  it('pero una sede que YA estrenó subdominio queda congelada', async () => {
    // Ahí sí está impreso en QR y guardado en enlaces de clientes: moverlo es
    // el error irreversible que esta fase no puede permitir.
    const s = sufijo()
    const slug = `t14-${s}`
    await provisionar({
      slug,
      name: 'Tepuy',
      domain: `${slug}.constelarys.com`,
      locations: [
        { name: 'P', slug: 'poblado', domain: `p14-${s}.constelarys.com` },
        { name: 'L', slug: 'laureles', domain: `l14-${s}.constelarys.com` },
      ],
    })
    const { rows } = await getPool().query<{ id: string }>(
      `SELECT l.id FROM restaurant_locations l
         JOIN tenants t ON t.id = l.tenant_id
        WHERE t.slug = $1 AND l.slug = 'poblado'`,
      [slug]
    )

    const mensaje = await fallaCon(() =>
      setLocation(slug, rows[0].id, { domain: `otro14-${s}.constelarys.com` })
    )
    expect(mensaje).toContain('sede_dominio_congelado')
  })
})

describe('00056 — lo que el AIOS crea es lo que el producto resuelve', () => {
  /**
   * Espejo EXACTO de `getActiveLocations()` en `src/lib/tenant.ts` — mismos
   * filtros, mismo orden. Si las dos se separan, se separan a la vista.
   */
  async function leerSedesActivas(tenantSlug: string): Promise<ActiveLocation[]> {
    const { rows } = await getPool().query<ActiveLocation>(
      `SELECT l.id, l.name, l.slug, l.domain, l.is_primary
         FROM restaurant_locations l
         JOIN tenants t ON t.id = l.tenant_id
        WHERE t.slug = $1 AND l.is_active = true
        ORDER BY l.is_primary DESC, l.sort_order ASC, l.name ASC`,
      [tenantSlug]
    )
    return rows
  }

  /**
   * El criterio de aceptación 2, de punta a punta: lo que el AIOS escribe por
   * `aios_provision_tenant` / `aios_add_location` es exactamente lo que
   * `resolveHostContext()` sabe leer.
   *
   * Los dos lados estaban probados por separado —el resolver en
   * `multisede-resolucion.test.ts`, las funciones acá arriba— y esa es
   * justamente la costura donde un alta puede quedar «creada pero muerta» sin
   * que ninguno de los dos tests se entere.
   */
  it('cada subdominio resuelve a SU sede, y el raíz pasa a pedir que elijan', async () => {
    const s = sufijo()
    const slug = `t17-${s}`
    const brandDomain = `${slug}.constelarys.com`
    const poblado = `p17-${s}.constelarys.com`
    const laureles = `l17-${s}.constelarys.com`

    await provisionar({
      slug,
      name: 'Tepuy',
      domain: brandDomain,
      locations: [
        { name: 'Poblado', slug: 'poblado', domain: poblado },
        { name: 'Laureles', slug: 'laureles', domain: laureles },
      ],
    })

    const sedes = await leerSedesActivas(slug)
    expect(sedes).toHaveLength(2)

    const idPoblado = sedes.find((l) => l.slug === 'poblado')!.id
    const idLaureles = sedes.find((l) => l.slug === 'laureles')!.id

    // Cada subdominio, a SU sede — y con procedencia `host`, no `host_single`.
    expect(pickLocationForHost(poblado, brandDomain, sedes)).toMatchObject({
      locationId: idPoblado,
      source: 'host',
      requiresChoice: false,
    })
    expect(pickLocationForHost(laureles, brandDomain, sedes)).toMatchObject({
      locationId: idLaureles,
      source: 'host',
      requiresChoice: false,
    })

    // Y el dominio RAÍZ deja de atribuir: con 2 sedes tiene que preguntar.
    // Es lo que hace que una sede sin subdominio propio quede sin registro, y
    // por eso `sede_sin_identidad` y `sede_previa_sin_subdominio` existen.
    const raiz = pickLocationForHost(brandDomain, brandDomain, sedes)
    expect(raiz.locationId).toBeNull()
    expect(raiz.requiresChoice).toBe(true)
    expect(raiz.choices).toHaveLength(2)
  })

  it('la sede agregada DESPUÉS resuelve igual que las del alta', async () => {
    const s = sufijo()
    const slug = `t18-${s}`
    const envigado = `e18-${s}.constelarys.com`

    await provisionar({
      slug,
      name: 'Tepuy',
      domain: `${slug}.constelarys.com`,
      locations: [
        { name: 'Poblado', slug: 'poblado', domain: `p18-${s}.constelarys.com` },
        { name: 'Laureles', slug: 'laureles', domain: `l18-${s}.constelarys.com` },
      ],
    })
    const nueva = await addLocation(slug, {
      name: 'Envigado',
      slug: 'envigado',
      domain: envigado,
    })

    const sedes = await leerSedesActivas(slug)
    expect(pickLocationForHost(envigado, `${slug}.constelarys.com`, sedes)).toMatchObject({
      locationId: nueva,
      source: 'host',
    })
  })

  it('una sede DESACTIVADA deja de resolver, pero no se borra', async () => {
    // Una sede nunca se borra: se desactiva. Y desactivada tiene que salir de
    // la resolución, o seguiría atribuyéndose visitas a un local cerrado.
    const s = sufijo()
    const slug = `t19-${s}`
    const laureles = `l19-${s}.constelarys.com`

    await provisionar({
      slug,
      name: 'Tepuy',
      domain: `${slug}.constelarys.com`,
      locations: [
        { name: 'Poblado', slug: 'poblado', domain: `p19-${s}.constelarys.com` },
        { name: 'Laureles', slug: 'laureles', domain: laureles },
      ],
    })
    const { rows } = await getPool().query<{ id: string }>(
      `SELECT l.id FROM restaurant_locations l
         JOIN tenants t ON t.id = l.tenant_id
        WHERE t.slug = $1 AND l.slug = 'laureles'`,
      [slug]
    )

    await setLocation(slug, rows[0].id, { is_active: 'false' })

    const sedes = await leerSedesActivas(slug)
    expect(sedes).toHaveLength(1)
    expect(pickLocationForHost(laureles, `${slug}.constelarys.com`, sedes).locationId).toBeNull()

    // Sigue existiendo: su historia no se pierde.
    const { rows: sigue } = await getPool().query(
      `SELECT is_active FROM restaurant_locations WHERE id = $1`,
      [rows[0].id]
    )
    expect(sigue[0].is_active).toBe(false)
  })
})

describe('00056 — aios_set_location', () => {
  it('edita nombre y estado sin borrar lo que el payload no trae', async () => {
    // Un UPDATE que pisara con NULL lo ausente borraría la dirección cada vez
    // que alguien renombra la sede.
    const s = sufijo()
    const slug = `t15-${s}`
    await provisionar({
      slug,
      name: 'Tepuy',
      domain: `${slug}.constelarys.com`,
      locations: [
        { name: 'P', slug: 'poblado', domain: `p15-${s}.constelarys.com`, address: 'Calle 10 #43-20' },
        { name: 'L', slug: 'laureles', domain: `l15-${s}.constelarys.com` },
      ],
    })
    const { rows } = await getPool().query<{ id: string }>(
      `SELECT l.id FROM restaurant_locations l
         JOIN tenants t ON t.id = l.tenant_id
        WHERE t.slug = $1 AND l.slug = 'poblado'`,
      [slug]
    )

    await setLocation(slug, rows[0].id, { name: 'Poblado (remodelado)', is_active: 'false' })

    const { rows: despues } = await getPool().query(
      `SELECT name, address, is_active, domain FROM restaurant_locations WHERE id = $1`,
      [rows[0].id]
    )
    expect(despues[0].name).toBe('Poblado (remodelado)')
    expect(despues[0].is_active).toBe(false)
    expect(despues[0].address).toBe('Calle 10 #43-20')
    expect(despues[0].domain).toBe(`p15-${s}.constelarys.com`)
  })

  it('no toca una sede de OTRA marca aunque llegue su uuid', async () => {
    const s = sufijo()
    const a = `t16a-${s}`
    const b = `t16b-${s}`
    await provisionar({
      slug: a,
      name: 'A',
      domain: `${a}.constelarys.com`,
      locations: [
        { name: 'P', slug: 'poblado', domain: `pa16-${s}.constelarys.com` },
        { name: 'L', slug: 'laureles', domain: `la16-${s}.constelarys.com` },
      ],
    })
    await provisionar({
      slug: b,
      name: 'B',
      domain: `${b}.constelarys.com`,
      locations: [
        { name: 'P', slug: 'poblado', domain: `pb16-${s}.constelarys.com` },
        { name: 'L', slug: 'laureles', domain: `lb16-${s}.constelarys.com` },
      ],
    })

    const { rows } = await getPool().query<{ id: string }>(
      `SELECT l.id FROM restaurant_locations l
         JOIN tenants t ON t.id = l.tenant_id
        WHERE t.slug = $1 AND l.slug = 'poblado'`,
      [a]
    )

    const mensaje = await fallaCon(() =>
      setLocation(b, rows[0].id, { name: 'Secuestrada' })
    )
    expect(mensaje).toContain('sede_no_existe')

    const { rows: intacta } = await getPool().query(
      `SELECT name FROM restaurant_locations WHERE id = $1`,
      [rows[0].id]
    )
    expect(intacta[0].name).toBe('P')
  })
})
