/**
 * `aios_attach_zernio_account()` — Zernio EN PARALELO a Twilio.
 *
 * Migración: supabase/migrations/00067_aios_attach_zernio_account.sql
 * Pedido: dueño, 2026-09-12 — la difusión (Golden Bullet) por la línea de
 * coexistencia en Zernio y todo lo demás por Twilio, hasta que Twilio muera.
 *
 * Lo que estas pruebas fijan:
 *   1. Escribe los tres `zernio_*` y **no toca** `messaging_provider`. Es la
 *      única razón de existir de la función: si un día cambia el proveedor,
 *      el Golden Bullet deja de ser una excepción y se lleva los recibos.
 *   2. Se niega en una marca que ya manda por Zernio (para eso está
 *      `aios_activate_whatsapp`).
 *   3. Valida el teléfono igual que `aios_activate_whatsapp` (E.164 con +).
 *   4. La activación completa de después (`aios_activate_whatsapp`) sigue
 *      funcionando sobre lo que esta dejó: es el paso de la migración final.
 */

import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'

interface Fila {
  messaging_provider: string
  zernio_profile_id: string | null
  zernio_account_id: string | null
  zernio_phone_number: string | null
}

async function fila(id: string): Promise<Fila> {
  const { rows } = await getPool().query<Fila>(
    'SELECT messaging_provider, zernio_profile_id, zernio_account_id, zernio_phone_number FROM tenants WHERE id = $1',
    [id]
  )
  return rows[0]
}

const attach = (slug: string, account: string, phone = '+573001234567') =>
  getPool().query('SELECT aios_attach_zernio_account($1, $2, $3, $4)', [slug, 'prof_1', account, phone])

describe('aios_attach_zernio_account — Zernio en paralelo, sin cambiar de proveedor', () => {
  const creados: TestTenant[] = []
  afterEach(async () => {
    for (const t of creados.splice(0)) await dropTestTenant(t.id)
  })
  afterAll(closePool)

  it('deja los zernio_* y la marca sigue en twilio', async () => {
    const t = await createTestTenant({ messagingProvider: 'twilio' })
    creados.push(t)
    const acc = `acc_${t.slug}`
    const { rows } = await attach(t.slug, acc)
    const r = rows[0].aios_attach_zernio_account
    expect(r.messaging_provider).toBe('twilio')
    expect(r.replaced_account).toBe(false)

    const f = await fila(t.id)
    expect(f.messaging_provider).toBe('twilio')
    expect(f.zernio_account_id).toBe(acc)
    expect(f.zernio_profile_id).toBe('prof_1')
    expect(f.zernio_phone_number).toBe('+573001234567')
  })

  it('se niega en una marca que ya manda por Zernio', async () => {
    const t = await createTestTenant({ messagingProvider: 'zernio' })
    creados.push(t)
    await expect(attach(t.slug, `acc_${t.slug}`)).rejects.toThrow(/ya_es_zernio/)
  })

  it('rechaza un teléfono que no sea E.164 con + y una marca inexistente', async () => {
    const t = await createTestTenant({ messagingProvider: 'twilio' })
    creados.push(t)
    await expect(attach(t.slug, `acc_${t.slug}`, '3001234567')).rejects.toThrow(/phone_invalido/)
    await expect(attach('no-existe-' + t.slug, 'acc_x')).rejects.toThrow(/tenant_no_existe/)
  })

  it('la activación completa de después funciona sobre lo que dejó (el día que Twilio muera)', async () => {
    const t = await createTestTenant({ messagingProvider: 'twilio' })
    creados.push(t)
    const acc = `acc_${t.slug}`
    await attach(t.slug, acc)
    await getPool().query('SELECT aios_activate_whatsapp($1, $2, $3, $4)', [t.slug, 'prof_1', acc, '+573001234567'])
    const f = await fila(t.id)
    expect(f.messaging_provider).toBe('zernio')
    expect(f.zernio_account_id).toBe(acc)
    // La activación (00054) deja una fila en tenant_connections que la limpieza
    // genérica no conoce; se saca acá para que dropTestTenant pueda borrar la marca.
    await getPool().query('DELETE FROM tenant_connections WHERE tenant_id = $1', [t.id])
  })
})
