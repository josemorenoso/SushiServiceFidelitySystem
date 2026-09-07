import { describe, it, expect, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant } from '../setup/db'

/**
 * Conexiones C1 contra Postgres de verdad: **el interruptor de una marca no toca el de
 * otra**.
 *
 * POR QUÉ ESTO MERECE UNA PRUEBA CON BASE
 * ───────────────────────────────────────
 * El interruptor de §18.e decide si el sistema le contesta a los clientes reales de un
 * restaurante. Vive en `admin_settings`, cuya PK es **`(key, tenant_id)`** desde la 00028
 * — pero esa PK compuesta es exactamente el tipo de invariante que un mock no prueba: si
 * mañana alguien la volviera a dejar en `(key)`, apagar la auto-respuesta de una marca la
 * apagaría para las 25 y ningún test de unidad se enteraría.
 *
 * Y hay una razón más concreta: **la 00030 nunca se aplicó**, así que 18 tablas conservan
 * el DEFAULT puente de la 00028 hacia Sushi Service. Un INSERT que olvide el `tenant_id`
 * no da error: se va calladito a otra marca. Estas pruebas son el guardia de ese olvido.
 */

const KEY = 'whatsapp_auto_reply_enabled'

const created: string[] = []

async function makeTenant(provider: 'twilio' | 'zernio') {
  const t = await createTestTenant({ messagingProvider: provider })
  created.push(t.id)
  return t
}

/** El mismo upsert que hace `setAutoReplyEnabled()`, con `tenant_id` SIEMPRE explícito. */
async function setFlag(tenantId: string, enabled: boolean) {
  await getPool().query(
    `INSERT INTO admin_settings (key, value, tenant_id) VALUES ($1, $2, $3)
     ON CONFLICT (key, tenant_id) DO UPDATE SET value = EXCLUDED.value`,
    [KEY, enabled ? 'true' : 'false', tenantId]
  )
}

/** La misma lectura que hace `isAutoReplyEnabled()`. `null` = clave sin configurar. */
async function readFlag(tenantId: string): Promise<string | null> {
  const { rows } = await getPool().query<{ value: string }>(
    'SELECT value FROM admin_settings WHERE key = $1 AND tenant_id = $2',
    [KEY, tenantId]
  )
  return rows[0]?.value ?? null
}

afterAll(async () => {
  for (const id of created) await dropTestTenant(id)
  await closePool()
})

describe('Interruptor de auto-respuesta (§18.e) — aislamiento por marca', () => {
  it('apagarlo en la marca A deja a la marca B exactamente como estaba', async () => {
    const a = await makeTenant('zernio')
    const b = await makeTenant('twilio')

    await setFlag(a.id, false)

    expect(await readFlag(a.id)).toBe('false')
    // B nunca se configuró: tiene que seguir SIN clave, que es lo que la aplicación lee
    // como "el default" (prendida). Si acá saliera 'false', la marca B habría quedado
    // muda por una acción de la marca A.
    expect(await readFlag(b.id)).toBeNull()
  })

  it('las dos marcas pueden tener valores opuestos a la vez', async () => {
    const a = await makeTenant('zernio')
    const b = await makeTenant('zernio')

    await setFlag(a.id, false)
    await setFlag(b.id, true)

    expect(await readFlag(a.id)).toBe('false')
    expect(await readFlag(b.id)).toBe('true')
  })

  it('la PK es (key, tenant_id): dos marcas no chocan con la misma clave', async () => {
    const a = await makeTenant('twilio')
    const b = await makeTenant('twilio')

    // Si la PK fuera solo `key`, este segundo INSERT explotaría — o, peor, el
    // ON CONFLICT lo convertiría en un UPDATE del valor de la OTRA marca.
    await setFlag(a.id, false)
    await setFlag(b.id, false)

    const { rows } = await getPool().query<{ n: string }>(
      'SELECT count(*)::text AS n FROM admin_settings WHERE key = $1 AND tenant_id = ANY($2::uuid[])',
      [KEY, [a.id, b.id]]
    )
    expect(rows[0].n).toBe('2')
  })

  it('el upsert es idempotente: prender dos veces no duplica la fila', async () => {
    const a = await makeTenant('zernio')

    await setFlag(a.id, false)
    await setFlag(a.id, false)
    await setFlag(a.id, true)

    const { rows } = await getPool().query<{ n: string }>(
      'SELECT count(*)::text AS n FROM admin_settings WHERE key = $1 AND tenant_id = $2',
      [KEY, a.id]
    )
    expect(rows[0].n).toBe('1')
    expect(await readFlag(a.id)).toBe('true')
  })
})

describe('tenants.owner_email — la columna de la que cuelga «solo el dueño conecta»', () => {
  it('existe y nace NULL: un tenant nuevo NO tiene dueño registrado', async () => {
    const t = await makeTenant('zernio')

    const { rows } = await getPool().query<{ owner_email: string | null }>(
      'SELECT owner_email FROM tenants WHERE id = $1',
      [t.id]
    )
    // Es el caso fail-closed que la pantalla tiene que DECIR con todas sus letras, y es
    // el estado real de las 5 marcas vivas: `aios_provision_tenant` acepta `owner_email`
    // pero es opcional, así que hoy ningún tenant lo tiene cargado.
    expect(rows).toHaveLength(1)
    expect(rows[0].owner_email).toBeNull()
  })

  it('se puede registrar un dueño, y queda tal cual se escribió', async () => {
    const t = await makeTenant('zernio')
    await getPool().query('UPDATE tenants SET owner_email = $1 WHERE id = $2', [
      '  Dueno@Restaurante.com ',
      t.id,
    ])

    const { rows } = await getPool().query<{ owner_email: string | null }>(
      'SELECT owner_email FROM tenants WHERE id = $1',
      [t.id]
    )
    // La base NO normaliza: guarda lo que le pegaron. Por eso la comparación de
    // `emailsMatch()` hace `lower(trim(...))` de los DOS lados, y no confía en la columna.
    expect(rows[0].owner_email).toBe('  Dueno@Restaurante.com ')
  })
})
