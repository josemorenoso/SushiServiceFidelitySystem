/**
 * `merge_tenant_config_deep()` y `jsonb_deep_merge()` — migración 00047.
 *
 * POR QUÉ ESTA PRUEBA EXISTE
 * ──────────────────────────
 * El operador `||` de jsonb mezcla SOLO el primer nivel. Con `tenants.config`
 * plana eso alcanzaba; con espacios con nombre, guardar `{branding:{primary}}`
 * con el merge superficial borra el logo y el resto del espacio sin error y sin
 * aviso. El restaurante se entera cuando abre su tarjeta.
 *
 * La prueba de la puerta abierta (§ "la marca no pisa a las integraciones") es
 * la que fija la decisión de diseño del 2026-09-05: el día que el restaurante
 * conecte su cuenta de Google o de Meta, esos datos van a convivir en el mismo
 * jsonb que la marca, y guardar un color no puede borrarlos.
 */

import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant } from '../setup/db'

async function readConfig(tenantId: string): Promise<Record<string, unknown>> {
  const { rows } = await getPool().query('SELECT config FROM tenants WHERE id = $1', [tenantId])
  return rows[0].config as Record<string, unknown>
}

async function setConfig(tenantId: string, config: unknown): Promise<void> {
  await getPool().query('UPDATE tenants SET config = $2::jsonb WHERE id = $1', [
    tenantId,
    JSON.stringify(config),
  ])
}

async function mergeDeep(tenantId: string, patch: unknown): Promise<Record<string, unknown>> {
  const { rows } = await getPool().query(
    'SELECT merge_tenant_config_deep($1, $2::jsonb) AS config',
    [tenantId, JSON.stringify(patch)]
  )
  return rows[0].config as Record<string, unknown>
}

// `jsonb_deep_merge()` es pura: no toca `tenants`, así que este bloque no crea
// ni borra ningún tenant.
describe('jsonb_deep_merge()', () => {
  it('objeto contra objeto se mezcla; cualquier otra cosa la gana el patch', async () => {
    const db = getPool()
    const cases: Array<[unknown, unknown, unknown]> = [
      [{ a: 1 }, { b: 2 }, { a: 1, b: 2 }],
      [{ a: { x: 1, y: 2 } }, { a: { y: 3 } }, { a: { x: 1, y: 3 } }],
      // Un escalar reemplaza al objeto y viceversa: gana el de la derecha.
      [{ a: { x: 1 } }, { a: 'plano' }, { a: 'plano' }],
      [{ a: 'plano' }, { a: { x: 1 } }, { a: { x: 1 } }],
      // Los arrays NO se concatenan: se reemplazan. Es lo que se quiere para una
      // lista de opciones (si no, "quitar un elemento" sería imposible).
      [{ a: [1, 2] }, { a: [3] }, { a: [3] }],
      // Tres niveles, que es más de lo que el panel escribe hoy.
      [{ a: { b: { c: 1, d: 2 } } }, { a: { b: { d: 9 } } }, { a: { b: { c: 1, d: 9 } } }],
      [{}, {}, {}],
    ]

    for (const [a, b, expected] of cases) {
      const { rows } = await db.query('SELECT jsonb_deep_merge($1::jsonb, $2::jsonb) AS r', [
        JSON.stringify(a),
        JSON.stringify(b),
      ])
      expect(rows[0].r).toEqual(expected)
    }
  })

  it('un null explícito en el patch se guarda como null (así "borra" el panel)', async () => {
    const { rows } = await getPool().query(
      `SELECT jsonb_deep_merge('{"a":{"x":"algo"}}'::jsonb, '{"a":{"x":null}}'::jsonb) AS r`
    )
    expect(rows[0].r).toEqual({ a: { x: null } })
  })

  it('tolera NULL de SQL en cualquiera de los dos lados', async () => {
    const db = getPool()
    const { rows: r1 } = await db.query(`SELECT jsonb_deep_merge(NULL, '{"a":1}'::jsonb) AS r`)
    expect(r1[0].r).toEqual({ a: 1 })
    const { rows: r2 } = await db.query(`SELECT jsonb_deep_merge('{"a":1}'::jsonb, NULL) AS r`)
    expect(r2[0].r).toEqual({ a: 1 })
  })
})

describe('merge_tenant_config_deep()', () => {
  const creados: string[] = []
  async function tenant() {
    const t = await createTestTenant()
    creados.push(t.id)
    return t
  }

  afterEach(async () => {
    while (creados.length) await dropTestTenant(creados.pop()!)
  })

  it('guardar un color NO borra el logo — el fallo que el merge plano provocaba', async () => {
    const t = await tenant()
    await setConfig(t.id, {
      brand_name: 'La Huerta',
      branding: { primary: '#ff4d6d', logo_url: 'https://cdn.example/logo.png' },
    })

    const config = await mergeDeep(t.id, { branding: { primary: '#0a7c4a' } })

    expect(config.branding).toEqual({
      primary: '#0a7c4a',
      logo_url: 'https://cdn.example/logo.png',
    })
    // Y las claves planas de siempre siguen enteras.
    expect(config.brand_name).toBe('La Huerta')
  })

  it('la prueba de contraste: el merge PLANO sí lo habría borrado', async () => {
    // Deja constancia de por qué hizo falta una función nueva y no bastaba con
    // reusar `merge_tenant_config()` (00032).
    const t = await tenant()
    await setConfig(t.id, {
      branding: { primary: '#ff4d6d', logo_url: 'https://cdn.example/logo.png' },
    })

    const { rows } = await getPool().query(
      'SELECT merge_tenant_config($1, $2::jsonb) AS config',
      [t.id, JSON.stringify({ branding: { primary: '#0a7c4a' } })]
    )
    expect(rows[0].config.branding).toEqual({ primary: '#0a7c4a' })
    expect(rows[0].config.branding.logo_url).toBeUndefined()
  })

  it('la marca no pisa a las integraciones (la puerta que se dejó abierta)', async () => {
    // `integrations` es el espacio reservado para las cuentas de Google y de
    // Meta que el restaurante va a conectar. No está construido, pero el motor
    // ya tiene que garantizar que guardar un color no lo toca.
    const t = await tenant()
    await setConfig(t.id, {
      brand_name: 'La Huerta',
      integrations: { google: { account_id: 'acc_123', connected_at: '2026-09-05' } },
    })

    const config = await mergeDeep(t.id, {
      branding: { primary: '#0a7c4a' },
      qr_studio: { theme: 'sushi', tables: 14 },
    })

    expect(config.integrations).toEqual({
      google: { account_id: 'acc_123', connected_at: '2026-09-05' },
    })
    expect(config.branding).toEqual({ primary: '#0a7c4a' })
    expect(config.qr_studio).toEqual({ theme: 'sushi', tables: 14 })
  })

  it('un espacio que no existía se crea, sin tocar el resto', async () => {
    const t = await tenant()
    await setConfig(t.id, { brand_name: 'La Huerta', delivery_default_city: 'Envigado' })

    const config = await mergeDeep(t.id, { qr_studio: { headline: '¡GANA PREMIOS!' } })

    expect(config.qr_studio).toEqual({ headline: '¡GANA PREMIOS!' })
    expect(config.delivery_default_city).toBe('Envigado')
  })

  it('escribir la marca de un tenant no toca la del otro', async () => {
    // El principio que no se negocia: un dato de la marca A jamás se ve ni se
    // atribuye a la marca B.
    const a = await tenant()
    const b = await tenant()
    await setConfig(a.id, { branding: { primary: '#ff4d6d' } })
    await setConfig(b.id, { branding: { primary: '#1d3557' } })

    await mergeDeep(a.id, { branding: { primary: '#0a7c4a' } })

    expect((await readConfig(a.id)).branding).toEqual({ primary: '#0a7c4a' })
    expect((await readConfig(b.id)).branding).toEqual({ primary: '#1d3557' })
  })

  it('sobre una config vacía el patch queda tal cual', async () => {
    const t = await tenant()
    await setConfig(t.id, {})
    const config = await mergeDeep(t.id, { branding: { primary: '#0a7c4a' } })
    expect(config).toEqual({ branding: { primary: '#0a7c4a' } })
  })

  it('`tenants.config` es NOT NULL — por eso el COALESCE de la función es solo un cinturón', async () => {
    // El primer intento de esta prueba forzaba `config = NULL` y la base lo
    // rechazó. Queda escrito para que nadie vuelva a razonar sobre un caso que
    // el esquema ya hace imposible: el `COALESCE(config, '{}')` de
    // `merge_tenant_config_deep()` no defiende de nada que pueda pasar hoy.
    const { rows } = await getPool().query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'tenants' AND column_name = 'config'`
    )
    expect(rows[0].is_nullable).toBe('NO')
  })
})

describe('bucket brand-assets', () => {
  afterAll(async () => {
    await closePool()
  })

  it('existe y es de lectura pública', async () => {
    const { rows } = await getPool().query(
      `SELECT public FROM storage.buckets WHERE id = 'brand-assets'`
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].public).toBe(true)
  })
})
