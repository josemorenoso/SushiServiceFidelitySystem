/**
 * El regalo masivo de premios: darle premios propios a una sede NO puede hacer
 * que ningún cliente existente gane un premio nuevo.
 *
 * QUÉ SE PRUEBA Y POR QUÉ ASÍ
 * ───────────────────────────
 * El bug (auditoría adversarial 2026-09-09, ESTADO.md §3 punto 0.GAMMA) vive en
 * la JUNTA de dos piezas: el esquema —los niveles propios de una sede son filas
 * COPIA con ids nuevos— y la regla que decide qué premio se ofrece. Probar solo
 * una de las dos no demuestra nada, así que acá van las dos juntas:
 *
 *   · Postgres de verdad, con la 00059 ya aplicada por el globalSetup: filas,
 *     `tier_key`, el trigger que sella el reclamo y el backfill de la historia.
 *   · La regla REAL, importada del servicio (`elegirFilasDeSede` +
 *     `elegirNivelSinReclamar`), alimentada con las filas que salen de esa base.
 *     No hay reimplementación de la regla en este archivo: si alguien la afloja,
 *     estas pruebas se caen.
 *
 * Lo único que se replica a mano es el INSERT de `POST /api/dashboard/reward-tiers/copiar`
 * (que en producción lo hace supabase-js contra estas mismas columnas) y el de
 * `mystery-box.service.ts`. Los dos van comentados donde ocurren.
 *
 * El ANTES no se prueba contra código viejo —ya no existe— sino contra la regla
 * vieja escrita en una sola línea dentro de la prueba: «reclamado = hay una fila
 * de mystery_box_results con este tier_id». Es literalmente lo que hacía
 * `check-in/status:195-201` hasta hoy, y sirve para demostrar que el escenario
 * REGALA con ella y NO regala con la nueva. Sin ese contraste, una prueba en
 * verde no distingue «lo arreglé» de «el escenario nunca falló».
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'
import {
  elegirFilasDeSede,
  elegirNivelSinReclamar,
  type ReclamoDeNivel,
} from '@/services/reward-tiers.service'

interface FilaDeNivel {
  id: string
  tier_key: string
  tier_name: string
  point_threshold: number
  location_id: string | null
  is_active: boolean
}

const ESCALERA: Array<[string, number]> = [
  ['Bronce', 150],
  ['Plata', 350],
  ['Oro', 600],
]

let tenant: TestTenant
let sede: string
let cliente: string

/** Los niveles DE LA MARCA, tal como los crea el panel: sin sede. */
async function crearNivelesDeMarca(): Promise<void> {
  const db = getPool()
  for (const [nombre, umbral] of ESCALERA) {
    await db.query(
      `INSERT INTO reward_tiers
         (tenant_id, location_id, tier_name, point_threshold, safe_reward_title, sort_order, is_active)
       VALUES ($1, NULL, $2, $3, $4, $3, true)`,
      [tenant.id, nombre, umbral, `Premio ${nombre}`]
    )
  }
}

async function leerNiveles(): Promise<FilaDeNivel[]> {
  const { rows } = await getPool().query<FilaDeNivel>(
    `SELECT id, tier_key, tier_name, point_threshold, location_id, is_active
       FROM reward_tiers
      WHERE tenant_id = $1 AND is_active = true
      ORDER BY sort_order ASC`,
    [tenant.id]
  )
  return rows
}

async function leerReclamos(): Promise<Array<ReclamoDeNivel & { tier_id: string }>> {
  const { rows } = await getPool().query<ReclamoDeNivel & { tier_id: string }>(
    `SELECT tier_id, claimed_tier_key, claimed_threshold
       FROM mystery_box_results
      WHERE customer_id = $1`,
    [cliente]
  )
  return rows
}

/**
 * El reclamo, tal como lo escribe `mystery-box.service.ts`: SIN las dos columnas
 * de la 00059. Que las rellene el trigger es justamente lo que se prueba — el
 * servicio no las conoce y no hace falta que las conozca.
 */
async function reclamar(tierId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO mystery_box_results (tenant_id, customer_id, tier_id, choice, prize_title)
     VALUES ($1, $2, $3, 'safe', 'Premio elegido')`,
    [tenant.id, cliente, tierId]
  )
}

/**
 * El INSERT de `POST /api/dashboard/reward-tiers/copiar`, columna por columna.
 * `heredaClave: false` reproduce el endpoint TAL COMO ERA antes de la 00059
 * (cada copia estrenaba identidad) y es lo que hace visible el regalo.
 */
async function copiarNivelesALaSede(heredaClave: boolean): Promise<void> {
  const db = getPool()
  const { rows } = await db.query<FilaDeNivel>(
    `SELECT id, tier_key, tier_name, point_threshold, location_id, is_active
       FROM reward_tiers
      WHERE tenant_id = $1 AND location_id IS NULL
      ORDER BY sort_order ASC`,
    [tenant.id]
  )

  for (const f of rows) {
    await db.query(
      `INSERT INTO reward_tiers
         (tenant_id, location_id, tier_name, point_threshold, safe_reward_title,
          sort_order, is_active, tier_key)
       VALUES ($1, $2, $3, $4, $5, $4, true, COALESCE($6::uuid, gen_random_uuid()))`,
      [tenant.id, sede, f.tier_name, f.point_threshold, `Premio ${f.tier_name}`,
       heredaClave ? f.tier_key : null]
    )
  }
}

/** La regla VIEJA, en una línea: reclamado = hay una fila con este `tier_id`. */
function ofrecidoPorLaReglaVieja(
  superados: FilaDeNivel[],
  reclamos: Array<{ tier_id: string }>
): FilaDeNivel | undefined {
  const ids = new Set(reclamos.map((r) => r.tier_id))
  return [...superados].reverse().find((t) => !ids.has(t.id))
}

beforeAll(async () => {
  tenant = await createTestTenant()
  const db = getPool()

  const { rows: sedes } = await db.query<{ id: string }>(
    `INSERT INTO restaurant_locations (tenant_id, name, slug, is_primary, is_active)
     VALUES ($1, 'Laureles', 'laureles', true, true) RETURNING id`,
    [tenant.id]
  )
  sede = sedes[0].id

  // 700 puntos: superó los tres escalones de la marca.
  const { rows: clientes } = await db.query<{ id: string }>(
    `INSERT INTO customers (tenant_id, phone, name, total_points)
     VALUES ($1, '+573001112233', 'Cliente viejo', 700) RETURNING id`,
    [tenant.id]
  )
  cliente = clientes[0].id

  await crearNivelesDeMarca()
})

afterAll(async () => {
  const db = getPool()
  await db.query('DELETE FROM mystery_box_results  WHERE tenant_id = $1', [tenant.id])
  await db.query('DELETE FROM reward_tiers         WHERE tenant_id = $1', [tenant.id])
  await db.query('DELETE FROM restaurant_locations WHERE tenant_id = $1', [tenant.id])
  await dropTestTenant(tenant.id)
})

describe('00059 — la 00059 en la base', () => {
  it('un nivel creado desde la pantalla estrena identidad propia', async () => {
    const niveles = await leerNiveles()
    expect(niveles).toHaveLength(3)
    // El DEFAULT de la columna es media migración: `/api/dashboard/reward-tiers`
    // (POST) no conoce `tier_key` y no hace falta que la conozca — un nivel que
    // nace en la pantalla es un nivel NUEVO y estrena su clave.
    for (const n of niveles) expect(n.tier_key).toBeTruthy()
    expect(new Set(niveles.map((n) => n.tier_key)).size).toBe(3)
  })

  it('el trigger sella el reclamo aunque quien inserta no conozca las columnas', async () => {
    const bronce = (await leerNiveles()).find((n) => n.tier_name === 'Bronce')!
    await reclamar(bronce.id)

    const reclamos = await leerReclamos()
    expect(reclamos).toHaveLength(1)
    expect(reclamos[0].claimed_tier_key).toBe(bronce.tier_key)
    expect(reclamos[0].claimed_threshold).toBe(150)
  })

  it('el endpoint de copiar hereda el tier_key', () => {
    // Vigilancia sobre el CÓDIGO y no sobre su comportamiento, a propósito: esta
    // prueba replica el INSERT de `copiar` a mano (ver `copiarNivelesALaSede`),
    // así que si alguien borra esa línea del endpoint, ninguna prueba de
    // comportamiento se entera y el regalo masivo vuelve entero. Es una línea
    // que se puede perder en un `map` sin que nada se ponga rojo — salvo esto.
    const fuente = readFileSync(
      join(__dirname, '../../src/app/api/dashboard/reward-tiers/copiar/route.ts'),
      'utf8'
    )
    expect(fuente).toMatch(/tier_key:\s*f\.tier_key/)
  })

  it('un tier_key no se puede repetir dentro de la misma sede', async () => {
    const bronce = (await leerNiveles()).find((n) => n.tier_name === 'Bronce')!
    // El centinela del uuid cero: los dos son de la MARCA (location_id NULL) y
    // sin él los NULL no colisionarían entre sí y esto pasaría sin quejarse.
    await expect(
      getPool().query(
        `INSERT INTO reward_tiers
           (tenant_id, location_id, tier_name, point_threshold, safe_reward_title, sort_order, tier_key)
         VALUES ($1, NULL, 'Bronce bis', 999, 'Otro', 999, $2)`,
        [tenant.id, bronce.tier_key]
      )
    ).rejects.toThrow(/reward_tiers_tier_key_tenant_sede_unique/)
  })
})

describe('00059 — el regalo masivo, antes y después', () => {
  it('ANTES: con copias de identidad nueva, la regla vieja regala un premio ya entregado', async () => {
    // El cliente ya reclamó Bronce y Plata en la marca.
    const marca = (await leerNiveles()).filter((n) => n.location_id === null)
    await reclamar(marca.find((n) => n.tier_name === 'Plata')!.id)

    // Alguien aprieta «Darle premios propios a esta sede» — como era antes de la
    // 00059: cada copia estrena identidad.
    await copiarNivelesALaSede(false)

    const deLaSede = elegirFilasDeSede(await leerNiveles(), sede)
    const superados = deLaSede.filter((n) => 700 >= n.point_threshold)
    expect(superados).toHaveLength(3)

    const reclamos = await leerReclamos()
    expect(reclamos).toHaveLength(2)

    // La regla vieja mira `tier_id`. Las copias tienen ids nuevos, así que NINGUNA
    // figura como reclamada: le ofrece el Oro de la sede a un cliente que ya
    // reclamó Bronce y Plata. Multiplicado por 542 clientes, es el regalo masivo.
    const viejo = ofrecidoPorLaReglaVieja(superados, reclamos)
    expect(viejo).toBeDefined()
    expect(viejo!.tier_name).toBe('Oro')
    expect(viejo!.location_id).toBe(sede)

    // Y la regla NUEVA sobre las mismas filas ya no regala: aunque las copias
    // estrenen `tier_key`, el UMBRAL sellado en el reclamo las alcanza igual. Es
    // la segunda clave, y este es el caso exacto para el que existe.
    const bronceYPlata = superados.filter((n) => n.point_threshold <= 350)
    expect(elegirNivelSinReclamar(bronceYPlata, reclamos)).toBeUndefined()
  })

  it('DESPUÉS: copiarle los niveles a una sede no le gana un premio nuevo a nadie', async () => {
    // Se rehace la sede tal como la deja el endpoint de hoy: heredando `tier_key`.
    await getPool().query('DELETE FROM reward_tiers WHERE tenant_id = $1 AND location_id = $2', [
      tenant.id,
      sede,
    ])
    await copiarNivelesALaSede(true)

    const niveles = await leerNiveles()
    const reclamos = await leerReclamos()

    const enLaMarca = elegirFilasDeSede(niveles, null).filter((n) => 700 >= n.point_threshold)
    const enLaSede = elegirFilasDeSede(niveles, sede).filter((n) => 700 >= n.point_threshold)
    expect(enLaSede).toHaveLength(3)
    expect(enLaSede.every((n) => n.location_id === sede)).toBe(true)

    // EL CRITERIO DE ACEPTACIÓN, en dos líneas: lo que se le ofrece al cliente en
    // la sede recién estrenada es EXACTAMENTE lo que se le ofrecía en la marca.
    const enMarca = elegirNivelSinReclamar(enLaMarca, reclamos)
    const enSede = elegirNivelSinReclamar(enLaSede, reclamos)
    expect(enSede?.tier_name).toBe(enMarca?.tier_name)
    expect(enSede?.tier_name).toBe('Oro') // el único que de verdad le falta

    // Y cuando reclame el Oro en la sede, no le queda ninguno pendiente en NINGÚN
    // lado: el reclamo hecho en la sede vale también para la marca.
    await reclamar(enLaSede.find((n) => n.tier_name === 'Oro')!.id)
    const trasReclamar = await leerReclamos()
    expect(elegirNivelSinReclamar(enLaSede, trasReclamar)).toBeUndefined()
    expect(elegirNivelSinReclamar(enLaMarca, trasReclamar)).toBeUndefined()
  })

  it('una sede con SU PROPIA escalera sí puede ofrecer un nivel que la marca no tenía', async () => {
    // Que no se pase de conservador: «recompensas por sede» tiene que seguir
    // significando algo. Un escalón que la marca nunca tuvo (900) es un nivel
    // nuevo de verdad — clave nueva y umbral nuevo — y se ofrece.
    const db = getPool()
    await db.query(
      `INSERT INTO reward_tiers
         (tenant_id, location_id, tier_name, point_threshold, safe_reward_title, sort_order, is_active)
       VALUES ($1, $2, 'Platino', 400, 'Premio Platino', 400, true)`,
      [tenant.id, sede]
    )

    const enLaSede = elegirFilasDeSede(await leerNiveles(), sede).filter(
      (n) => 700 >= n.point_threshold
    )
    const ofrecido = elegirNivelSinReclamar(enLaSede, await leerReclamos())
    expect(ofrecido?.tier_name).toBe('Platino')
  })

  it('editar el umbral de un nivel no le vuelve a ofrecer premio a quien ya lo reclamó', async () => {
    // El otro regalo masivo, el que el UMBRAL solo no taparía: la marca sube
    // «Bronce» de 150 a 200. Es la misma fila, así que su `tier_key` no se mueve
    // y el reclamo del cliente lo sigue alcanzando.
    const db = getPool()
    await db.query('DELETE FROM reward_tiers WHERE tenant_id = $1 AND location_id = $2', [
      tenant.id,
      sede,
    ])
    await db.query(
      `UPDATE reward_tiers SET point_threshold = 200, sort_order = 200
        WHERE tenant_id = $1 AND location_id IS NULL AND tier_name = 'Bronce'`,
      [tenant.id]
    )

    const enLaMarca = elegirFilasDeSede(await leerNiveles(), null).filter(
      (n) => 700 >= n.point_threshold
    )
    const reclamos = await leerReclamos()

    // El reclamo viejo sigue diciendo 150; el nivel ahora dice 200. Los une la clave.
    expect(reclamos.some((r) => r.claimed_threshold === 150)).toBe(true)
    const soloBronce = enLaMarca.filter((n) => n.tier_name === 'Bronce')
    expect(elegirNivelSinReclamar(soloBronce, reclamos)).toBeUndefined()
  })
})

describe('00059 — los dos backfills, corriendo el archivo de verdad', () => {
  /**
   * Se vuelve a aplicar la migración ENTERA, leída del disco. Cubre dos cosas
   * que ninguna otra prueba puede cubrir, porque el globalSetup ya la corrió
   * sobre una base vacía:
   *
   *   · Que los backfills SELLEN de verdad. Se fabrica el estado de antes de la
   *     migración —un reclamo con las dos columnas en NULL— y se comprueba que
   *     el archivo lo rellena.
   *   · Que sea RE-EJECUTABLE sin destruir el arreglo. Es un riesgo concreto y
   *     ya cazado: la primera versión del bloque 3 normalizaba `tier_key = id`,
   *     y una copia por sede tiene —a propósito— `tier_key <> id`. Reaplicar la
   *     migración se la reseteaba, la copia dejaba de compartir identidad con el
   *     nivel de la marca y volvía el regalo masivo de premios. Esta prueba es
   *     la que lo destapó; queda como guardia para que no lo reintroduzca nadie.
   */
  it('sella los reclamos viejos y NO le resetea la identidad a una copia ya reclamada', async () => {
    const db = getPool()
    const marca = (await leerNiveles()).filter((n) => n.location_id === null)
    const bronce = marca.find((n) => n.tier_name === 'Bronce')!

    // Una sede con premios propios copiados: hereda `tier_key`, o sea `<> id`.
    await db.query(
      `INSERT INTO reward_tiers
         (tenant_id, location_id, tier_name, point_threshold, safe_reward_title,
          sort_order, is_active, tier_key)
       VALUES ($1, $2, 'Bronce', $3, 'Premio Bronce', 1, true, $4)`,
      [tenant.id, sede, bronce.point_threshold, bronce.tier_key]
    )

    // Y el estado de ANTES de la 00059 para un reclamo: sin sellar.
    await db.query(
      `UPDATE mystery_box_results
          SET claimed_tier_key = NULL, claimed_threshold = NULL
        WHERE customer_id = $1`,
      [cliente]
    )
    expect((await leerReclamos()).every((r) => r.claimed_tier_key === null)).toBe(true)

    const sql = readFileSync(
      join(__dirname, '../../supabase/migrations/00059_nivel_reclamado_no_es_una_fila.sql'),
      'utf8'
    )
    await db.query(sql)

    // 3.2 selló toda la historia — y el bloque 5 habría reventado si no.
    const reclamos = await leerReclamos()
    expect(reclamos.length).toBeGreaterThan(0)
    expect(reclamos.every((r) => r.claimed_tier_key !== null)).toBe(true)
    expect(reclamos.every((r) => typeof r.claimed_threshold === 'number')).toBe(true)

    // 3.1 NO tocó la copia de la sede: su clave sigue siendo la del original.
    const { rows: copias } = await db.query<FilaDeNivel>(
      `SELECT id, tier_key, tier_name, point_threshold, location_id, is_active
         FROM reward_tiers WHERE tenant_id = $1 AND location_id = $2`,
      [tenant.id, sede]
    )
    expect(copias).toHaveLength(1)
    expect(copias[0].tier_key).toBe(bronce.tier_key)
    expect(copias[0].tier_key).not.toBe(copias[0].id)
  })
})
