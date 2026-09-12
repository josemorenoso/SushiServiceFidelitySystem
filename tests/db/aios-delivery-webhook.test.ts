/**
 * 00066 — el AIOS enciende y apaga los domicilios por WhatsApp de una marca.
 *
 * Migración bajo prueba: `00066_aios_delivery_webhook.sql` (la aplica el globalSetup)
 * Feature: `docs/features/delivery-dashboard.md` § «Si has_delivery_webhook === false»
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 * ───────────────────────────
 * La bandera vive dentro de `tenants.config`, que el rol del AIOS no ve. Lo que se
 * vigila acá son los tres contratos que el AIOS y el panel del cliente comparten:
 *
 *   1. la lectura replica la regla de `buildDeliveryChannel()`: AUSENTE = encendido,
 *      solo un `false` explícito apaga;
 *   2. la escritura pasa por `merge_tenant_config_deep()`: cambiar la bandera no borra
 *      `branding` ni ninguna otra clave hermana (el `||` plano sí lo haría);
 *   3. se niega con nombre sobre un slug que no existe y sobre un estado NULL.
 *
 * El permiso no se puede ejercer acá —el arnés no crea el rol `aios_constelarys`—
 * pero sí que PUBLIC ya no puede llamarlas: es lo que el REVOKE de la migración deja.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getPool, closePool, createTestTenant, dropTestTenant, type TestTenant } from '../setup/db'

let tenant: TestTenant

async function leerConfig(): Promise<Record<string, unknown>> {
  const { rows } = await getPool().query<{ config: Record<string, unknown> | null }>(
    `SELECT config FROM tenants WHERE id = $1`,
    [tenant.id]
  )
  return rows[0].config ?? {}
}

async function enabled(): Promise<boolean> {
  const { rows } = await getPool().query<{ enabled: boolean }>(
    `SELECT aios_delivery_webhook_enabled($1) AS enabled`,
    [tenant.slug]
  )
  return rows[0].enabled
}

beforeAll(async () => {
  tenant = await createTestTenant()
})

afterAll(async () => {
  await dropTestTenant(tenant.id)
  await closePool()
})

describe('aios_delivery_webhook_enabled — la lectura dice lo mismo que el panel', () => {
  it('sin la clave se lee como ENCENDIDO (los tenants viejos nunca la tuvieron)', async () => {
    expect((await leerConfig()).has_delivery_webhook).toBeUndefined()
    expect(await enabled()).toBe(true)
  })

  it('se niega con nombre sobre un slug que no existe', async () => {
    await expect(
      getPool().query(`SELECT aios_delivery_webhook_enabled($1)`, ['no-existe-00066'])
    ).rejects.toThrow('tenant_no_existe')
  })
})

describe('aios_set_delivery_webhook — la escritura no pisa el resto de config', () => {
  it('apaga, y deja la clave EXPLÍCITA en false', async () => {
    const { rows } = await getPool().query<{ r: Record<string, unknown> }>(
      `SELECT aios_set_delivery_webhook($1, false) AS r`,
      [tenant.slug]
    )
    expect(rows[0].r).toMatchObject({ slug: tenant.slug, enabled: false, previous: true })
    expect((await leerConfig()).has_delivery_webhook).toBe(false)
    expect(await enabled()).toBe(false)
  })

  it('enciende sin borrar branding ni claves hermanas', async () => {
    // Una clave anidada al lado, como la que el panel de identidad visual escribe.
    await getPool().query(`SELECT merge_tenant_config_deep($1, $2::jsonb)`, [
      tenant.id,
      JSON.stringify({ branding: { primary: '#123456' }, brand_name: 'Prueba 00066' }),
    ])

    const { rows } = await getPool().query<{ r: Record<string, unknown> }>(
      `SELECT aios_set_delivery_webhook($1, true) AS r`,
      [tenant.slug]
    )
    expect(rows[0].r).toMatchObject({ enabled: true, previous: false })

    const config = await leerConfig()
    expect(config.has_delivery_webhook).toBe(true)
    expect(config.branding).toEqual({ primary: '#123456' })
    expect(config.brand_name).toBe('Prueba 00066')
    expect(await enabled()).toBe(true)
  })

  it('se niega con nombre sobre un slug que no existe y sobre un estado NULL', async () => {
    await expect(
      getPool().query(`SELECT aios_set_delivery_webhook($1, true)`, ['no-existe-00066'])
    ).rejects.toThrow('tenant_no_existe')
    await expect(
      getPool().query(`SELECT aios_set_delivery_webhook($1, NULL::boolean)`, [tenant.slug])
    ).rejects.toThrow('enabled_requerido')
  })
})

describe('permisos — cerradas a PUBLIC, como toda función del AIOS', () => {
  it('ni anon ni authenticated pueden llamarlas', async () => {
    const { rows } = await getPool().query<{ fn: string; anon: boolean; auth: boolean }>(
      `SELECT fn,
              has_function_privilege('anon', fn, 'EXECUTE')          AS anon,
              has_function_privilege('authenticated', fn, 'EXECUTE') AS auth
         FROM unnest(ARRAY[
           'aios_delivery_webhook_enabled(text)',
           'aios_set_delivery_webhook(text, boolean)'
         ]) AS fn`
    )
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.anon, row.fn).toBe(false)
      expect(row.auth, row.fn).toBe(false)
    }
  })
})
