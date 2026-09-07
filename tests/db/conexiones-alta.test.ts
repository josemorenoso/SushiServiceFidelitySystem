import { describe, it, expect, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant } from '../setup/db'

/**
 * Conexiones C2 contra Postgres real: **el aislamiento por marca y por nonce**.
 *
 * Es el archivo que cubre el peor resultado posible de este apartado, que no es una
 * pantalla fea: es que **los mensajes de una marca salgan por el número de otra**. Las
 * tres barreras que lo impiden viven en la 00054 y se prueban acá, no en un mock:
 *
 *   1. El índice único global sobre `zernio_account_id` — dos marcas no pueden reclamar
 *      la misma cuenta de Zernio.
 *   2. El índice único global sobre `signup_nonce` — el nonce identifica UNA conexión.
 *   3. `connection_apply_whatsapp()` — un solo cuerpo, con su `AND tenant_id` de cinturón.
 *
 * Y el detalle de Postgres que hace que el índice parcial sea obligatorio: **los NULL no
 * colisionan entre sí**. Un UNIQUE plano sobre `is_primary` prohibiría dos líneas
 * secundarias en vez de garantizar una principal.
 */

const created: string[] = []

async function makeTenant(provider: 'twilio' | 'zernio' = 'twilio') {
  const t = await createTestTenant({ messagingProvider: provider })
  created.push(t.id)
  return t
}

async function insertConnection(
  tenantId: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const cols = ['tenant_id', 'provider', ...Object.keys(extra)]
  const vals = [tenantId, 'whatsapp_zernio', ...Object.values(extra)]
  const holes = vals.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO tenant_connections (${cols.join(', ')}) VALUES (${holes}) RETURNING id`,
    vals
  )
  return rows[0].id
}

afterAll(async () => {
  const db = getPool()
  for (const id of created) {
    await db.query('DELETE FROM tenant_connections WHERE tenant_id = $1', [id])
    await dropTestTenant(id)
  }
  await closePool()
})

describe('tenant_connections — aislamiento por marca', () => {
  it('dos marcas NO pueden reclamar la misma cuenta de Zernio', async () => {
    const a = await makeTenant()
    const b = await makeTenant()

    await insertConnection(a.id, { zernio_account_id: 'acc_compartida' })

    // Sin este índice, el webhook resolvería el tenant equivocado y los mensajes de una
    // marca saldrían por el número de otra: el principio que no se negocia.
    await expect(
      insertConnection(b.id, { zernio_account_id: 'acc_compartida' })
    ).rejects.toThrow(/duplicate key|unique/i)
  })

  it('una marca no puede declarar el mismo número dos veces', async () => {
    const a = await makeTenant()
    await insertConnection(a.id, { phone_e164: '+573001110000' })
    await expect(insertConnection(a.id, { phone_e164: '+573001110000' })).rejects.toThrow(
      /duplicate key|unique/i
    )
  })

  it('dos marcas SÍ pueden tener el mismo número declarado (el UNIQUE es por marca)', async () => {
    // Suena raro, pero es lo correcto mientras nadie lo haya CONECTADO: el índice de la
    // unicidad real es el de `zernio_account_id`. Bloquearlo acá impediría corregir un
    // número mal tecleado en otra marca.
    const a = await makeTenant()
    const b = await makeTenant()
    await insertConnection(a.id, { phone_e164: '+573002220000' })
    await expect(insertConnection(b.id, { phone_e164: '+573002220000' })).resolves.toBeTruthy()
  })

  it('solo puede haber UNA línea principal por marca, y las secundarias no chocan', async () => {
    const a = await makeTenant()
    await insertConnection(a.id, { is_primary: true })

    await expect(insertConnection(a.id, { is_primary: true })).rejects.toThrow(/duplicate key|unique/i)

    // El índice es PARCIAL (`WHERE is_primary`). Con uno plano sobre (tenant_id, provider)
    // esto fallaría — y prohibir dos líneas secundarias es lo contrario de lo que se quiso.
    await expect(insertConnection(a.id, { is_primary: false })).resolves.toBeTruthy()
    await expect(insertConnection(a.id, { is_primary: false })).resolves.toBeTruthy()
  })
})

describe('signup_nonce — la puerta de vuelta del Embedded Signup', () => {
  it('el nonce es único a nivel global, no por marca', async () => {
    const a = await makeTenant()
    const b = await makeTenant()

    await insertConnection(a.id, { signup_nonce: 'nonce-de-la-marca-a' })

    // Dos filas con el mismo nonce harían AMBIGUA justo la comprobación que existe para
    // que no lo sea: `findConnectionByNonce()` usa `.maybeSingle()` y con dos filas
    // devolvería error, o peor, la fila de la otra marca.
    await expect(insertConnection(b.id, { signup_nonce: 'nonce-de-la-marca-a' })).rejects.toThrow(
      /duplicate key|unique/i
    )
  })

  it('varias conexiones SIN nonce conviven: los NULL no colisionan entre sí', async () => {
    const a = await makeTenant()
    await expect(insertConnection(a.id)).resolves.toBeTruthy()
    await expect(insertConnection(a.id)).resolves.toBeTruthy()
  })

  it('un nonce solo encuentra la conexión de SU marca', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    await insertConnection(a.id, { signup_nonce: 'nonce-exclusivo-a' })
    await insertConnection(b.id, { signup_nonce: 'nonce-exclusivo-b' })

    const { rows } = await getPool().query<{ tenant_id: string }>(
      'SELECT tenant_id FROM tenant_connections WHERE signup_nonce = $1',
      ['nonce-exclusivo-a']
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].tenant_id).toBe(a.id)
    expect(rows[0].tenant_id).not.toBe(b.id)
  })
})

describe('El camino se CONGELA (trigger de la 00054)', () => {
  it('se puede corregir mientras no haya número ni signup abierto', async () => {
    const a = await makeTenant()
    const id = await insertConnection(a.id, { route: 'coexistence' })

    await expect(
      getPool().query('UPDATE tenant_connections SET route = $1 WHERE id = $2', ['byo_cloud_api', id])
    ).resolves.toBeTruthy()
  })

  it('con número declarado ya NO se puede cambiar', async () => {
    const a = await makeTenant()
    const id = await insertConnection(a.id, { route: 'coexistence', phone_e164: '+573003330000' })

    // Cambiarlo dejaría un número comprado o una coexistencia a medias sin dueño. La regla
    // vive en el motor y no solo en la UI porque del lado del cliente una pestaña vieja
    // apuntando a otro camino es mucho más probable.
    await expect(
      getPool().query('UPDATE tenant_connections SET route = $1 WHERE id = $2', ['byo_cloud_api', id])
    ).rejects.toThrow(/camino_congelado/)
  })

  it('con el signup abierto tampoco', async () => {
    const a = await makeTenant()
    const id = await insertConnection(a.id, { route: 'coexistence', signup_nonce: 'nonce-abierto-xyz' })
    await expect(
      getPool().query('UPDATE tenant_connections SET route = $1 WHERE id = $2', ['byo_cloud_api', id])
    ).rejects.toThrow(/camino_congelado/)
  })

  it('congelado el CAMINO, el resto de la fila se sigue pudiendo actualizar', async () => {
    // Si el trigger bloqueara cualquier UPDATE, el webhook no podría mover el estado y la
    // pantalla se quedaría muda — que es justo el problema que vino a resolver.
    const a = await makeTenant()
    const id = await insertConnection(a.id, { route: 'coexistence', phone_e164: '+573004440000' })
    await expect(
      getPool().query('UPDATE tenant_connections SET status = $1 WHERE id = $2', [
        'verificacion_pendiente',
        id,
      ])
    ).resolves.toBeTruthy()
  })
})

describe('connection_apply_whatsapp() — un cuerpo, dos puertas', () => {
  it('activa la marca y deja la conexión activa en la MISMA transacción', async () => {
    const a = await makeTenant('twilio')
    await insertConnection(a.id, { is_primary: true, route: 'coexistence' })

    await getPool().query('SELECT connection_apply_whatsapp($1, $2, $3, $4)', [
      a.id,
      'prof_1',
      'acc_activa_1',
      '+573005550000',
    ])

    const { rows: t } = await getPool().query(
      'SELECT messaging_provider, zernio_account_id, zernio_phone_number FROM tenants WHERE id = $1',
      [a.id]
    )
    expect(t[0].messaging_provider).toBe('zernio')
    expect(t[0].zernio_account_id).toBe('acc_activa_1')
    expect(t[0].zernio_phone_number).toBe('+573005550000')

    const { rows: c } = await getPool().query(
      'SELECT status, signup_nonce FROM tenant_connections WHERE tenant_id = $1 AND is_primary',
      [a.id]
    )
    expect(c[0].status).toBe('activa')
    // El nonce se QUEMA al cerrar: un `code` reenviado no vuelve a entrar.
    expect(c[0].signup_nonce).toBeNull()
  })

  it('un número que no es E.164 se rechaza — la misma validación que la 00036', async () => {
    const a = await makeTenant()
    await expect(
      getPool().query('SELECT connection_apply_whatsapp($1, $2, $3, $4)', [a.id, 'p', 'acc_x', '3001234567'])
    ).rejects.toThrow(/phone_invalido/)
  })

  it('sin cuenta de Zernio se rechaza: «activa» exige las dos cosas', async () => {
    const a = await makeTenant()
    await expect(
      getPool().query('SELECT connection_apply_whatsapp($1, $2, $3, $4)', [a.id, 'p', '', '+573001234567'])
    ).rejects.toThrow(/account_id_requerido/)
  })

  it('NO deja que una marca se apropie de la cuenta de otra', async () => {
    const a = await makeTenant()
    const b = await makeTenant()
    await insertConnection(a.id, { is_primary: true, zernio_account_id: 'acc_de_a' })

    // La marca B intenta cerrar con la cuenta de A. La función encuentra la fila por
    // `zernio_account_id`, ve que es de otro tenant y aborta — sin este cinturón, B se
    // quedaría con la línea de A y sus mensajes saldrían por ese número.
    await expect(
      getPool().query('SELECT connection_apply_whatsapp($1, $2, $3, $4)', [
        b.id,
        'p',
        'acc_de_a',
        '+573006660000',
      ])
    ).rejects.toThrow(/conexion_de_otra_marca/)
  })

  it('aios_activate_whatsapp() sigue existiendo UNA sola vez y sigue funcionando igual', async () => {
    // La sobrecarga (42725) es la trampa que mató a `log_review_shown_deduped()`: dos
    // versiones dejan la llamada vieja ambigua dentro de un catch que solo loguea.
    const { rows } = await getPool().query<{ n: string }>(
      "SELECT count(*)::text AS n FROM pg_proc WHERE proname = 'aios_activate_whatsapp'"
    )
    expect(rows[0].n).toBe('1')

    const a = await makeTenant()
    await getPool().query('SELECT aios_activate_whatsapp($1, $2, $3, $4)', [
      a.slug,
      'prof_aios',
      'acc_aios_1',
      '+573007770000',
    ])

    const { rows: t } = await getPool().query(
      'SELECT messaging_provider, zernio_account_id FROM tenants WHERE id = $1',
      [a.id]
    )
    expect(t[0].messaging_provider).toBe('zernio')
    expect(t[0].zernio_account_id).toBe('acc_aios_1')

    // Y ahora TAMBIÉN deja la fila de la conexión, que antes no existía.
    const { rows: c } = await getPool().query(
      'SELECT status FROM tenant_connections WHERE tenant_id = $1',
      [a.id]
    )
    expect(c).toHaveLength(1)
    expect(c[0].status).toBe('activa')
  })

  it('un slug que no existe sigue dando el mismo error que en la 00036', async () => {
    await expect(
      getPool().query('SELECT aios_activate_whatsapp($1, $2, $3, $4)', [
        'no-existe-este-slug',
        'p',
        'a',
        '+573001234567',
      ])
    ).rejects.toThrow(/tenant_no_existe/)
  })
})
