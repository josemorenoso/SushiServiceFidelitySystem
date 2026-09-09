/**
 * La whitelist de la SEDE, y su espejo en SQL.
 *
 * `restaurant_locations.config` tiene DOS guardianes: el CHECK
 * `location_config_es_valida()` (migración 00058 §1) y la lista de
 * `src/lib/location-config-paths.ts`. El de la base es el que manda —55 archivos
 * escriben con `service_role`, que se salta el RLS— pero si los dos se separan
 * pasa lo peor de los dos mundos: el panel ofrece un campo que la base rechaza
 * con un 23514 críptico, o deja de ofrecer uno que sí se podía guardar.
 *
 * Este test lee el SQL de verdad y los compara.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  LOCATION_EDITABLE_PATH_NAMES,
  LOCATION_CONFIG_TOP_LEVEL_KEYS,
  LOCATION_CONFIG_CARD_KEYS,
  buildLocationConfigPatch,
  isLocationEditablePath,
  projectLocationEditablePaths,
} from '@/lib/location-config-paths'
import { EDITABLE_PATH_NAMES } from '@/lib/tenant-config-paths'
import { elegirFilasDeSede } from '@/services/reward-tiers.service'
import { mergeLocationOverConfig, resolveBranding } from '@/lib/branding'
import type { TenantConfig } from '@/types/tenant.types'

const MIGRACION = path.resolve(
  __dirname,
  '../../supabase/migrations/00058_sedes_de_cara_al_cliente.sql'
)

/** Las claves de una lista `k NOT IN ( 'a', 'b' )` del SQL. */
function clavesDelCheck(sql: string, despuesDe: string): string[] {
  const desde = sql.indexOf(despuesDe)
  expect(desde).toBeGreaterThan(-1)
  const bloque = sql.slice(desde, desde + 600)
  const abre = bloque.indexOf('NOT IN (')
  const cierra = bloque.indexOf(')', abre)
  return [...bloque.slice(abre, cierra).matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('la whitelist de la sede es un SUBCONJUNTO de la de la marca', () => {
  it('cada ruta de sede existe en EDITABLE_PATHS', () => {
    // Si no, `pickEditablePaths()` habría lanzado al importar el módulo. Este
    // test lo dice con nombre y apellido en vez de dejar un import roto.
    for (const ruta of LOCATION_EDITABLE_PATH_NAMES) {
      expect(EDITABLE_PATH_NAMES).toContain(ruta)
    }
  })

  it('la identidad de la marca NO baja a la sede', () => {
    // La tarjeta muestra puntos y sellos que son DE LA MARCA: si el nombre, el
    // logo o los colores cambiaran con la sede, la tarjeta mentiría.
    for (const prohibida of [
      'branding.logo_url', 'branding.primary', 'branding.card_bg',
      'card.stamp_icon', 'card.motif', 'card.description', 'card.policies',
      'qr_studio.theme',
    ]) {
      expect(LOCATION_EDITABLE_PATH_NAMES as readonly string[]).not.toContain(prohibida)
      expect(isLocationEditablePath(prohibida)).toBe(false)
    }
  })
})

describe('espejo exacto con el CHECK de la 00058', () => {
  const sql = fs.readFileSync(MIGRACION, 'utf-8')

  it('las claves de primer nivel dicen lo mismo en los dos lados', () => {
    const enSql = clavesDelCheck(sql, 'FROM jsonb_object_keys(p_config) AS k')
    expect([...enSql].sort()).toEqual([...LOCATION_CONFIG_TOP_LEVEL_KEYS].sort())
  })

  it('las claves de `card` dicen lo mismo en los dos lados', () => {
    const enSql = clavesDelCheck(sql, "COALESCE(p_config -> 'card'")
    expect([...enSql].sort()).toEqual([...LOCATION_CONFIG_CARD_KEYS].sort())
  })
})

describe('buildLocationConfigPatch', () => {
  it('aplana a la forma anidada que espera merge_location_config_deep', () => {
    const out = buildLocationConfigPatch({
      google_maps_url: 'https://g.page/r/laureles',
      'card.address': '  Cra 43 #10-20  ',
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.patch).toEqual({
      google_maps_url: 'https://g.page/r/laureles',
      card: { address: 'Cra 43 #10-20' },
    })
  })

  it('ignora en silencio lo que no es de la sede, pero corta con lo mal formado', () => {
    // Una ruta de más no es motivo para rechazar el resto: el panel manda lo que
    // sabe mandar. Un valor inválido sí corta, y dice cuál.
    const conRutaAjena = buildLocationConfigPatch({
      'branding.primary': '#000000',
      instagram_url: 'https://instagram.com/laureles',
    })
    expect(conRutaAjena.ok).toBe(true)
    if (conRutaAjena.ok) expect(conRutaAjena.paths).toEqual(['instagram_url'])

    expect(buildLocationConfigPatch({ instagram_url: 'no-es-una-url' }).ok).toBe(false)
  })

  it('proyecta de vuelta lo guardado, incluida la forma anidada', () => {
    const plano = projectLocationEditablePaths({
      google_maps_url: 'https://g.page/x',
      card: { address: 'Cra 43' },
      branding: { primary: '#fff' }, // no es de la sede: no sale
    })
    expect(plano['google_maps_url']).toBe('https://g.page/x')
    expect(plano['card.address']).toBe('Cra 43')
    expect(plano['branding.primary']).toBeUndefined()
  })
})

describe('elegirFilasDeSede — recompensas por sede (00058 §3)', () => {
  const marca = { id: 'm1', location_id: null }
  const marca2 = { id: 'm2', location_id: null }
  const laureles = { id: 'l1', location_id: 'sede-laureles' }

  it('sin sede, solo las de la marca', () => {
    // Es el camino de TODO el código que todavía no conoce su sede, y es el
    // comportamiento anterior a la 00058 bit a bit: hoy todas las filas son NULL.
    expect(elegirFilasDeSede([marca, marca2, laureles], null)).toEqual([marca, marca2])
    expect(elegirFilasDeSede([marca, laureles], undefined)).toEqual([marca])
  })

  it('una sede SIN filas propias hereda las de la marca', () => {
    expect(elegirFilasDeSede([marca, marca2], 'sede-envigado')).toEqual([marca, marca2])
  })

  it('una sede CON filas propias reemplaza las de la marca, no las mezcla', () => {
    // Reemplazar y no mezclar es lo que hace que «esta sede tiene los suyos» se
    // pueda explicar en una frase, y lo que permite tener MENOS niveles que la
    // marca — imposible si se mezclara.
    expect(elegirFilasDeSede([marca, marca2, laureles], 'sede-laureles')).toEqual([laureles])
  })

  it('nunca devuelve filas de OTRA sede', () => {
    const envigado = { id: 'e1', location_id: 'sede-envigado' }
    expect(elegirFilasDeSede([laureles, envigado], 'sede-laureles')).toEqual([laureles])
  })
})


describe('la sede pisa a la marca campo a campo (00058)', () => {
  const marca = {
    brand_name: 'Tepuy',
    google_maps_url: 'https://g.page/tepuy-marca',
    instagram_url: 'https://instagram.com/tepuy',
    card: { address: 'Sede principal', hours: 'L-D 12-22' },
  } as unknown as TenantConfig

  it('una sede SIN config hereda todo de la marca', () => {
    // Es el estado del día del despliegue: `config = {}` en las 6 sedes vivas.
    const out = mergeLocationOverConfig(marca, {} as TenantConfig)
    expect(out?.google_maps_url).toBe('https://g.page/tepuy-marca')
    expect(resolveBranding(marca, {} as TenantConfig).googleReviewUrl).toBe('https://g.page/tepuy-marca')
  })

  it('una sede CON ficha propia gana, y solo en ese campo', () => {
    // El requisito del dueño: cada local manda a reseñar SU ficha. Lo demás sigue
    // siendo de la marca — si el nombre cambiara con la sede, la tarjeta mentiría.
    const laureles = { google_maps_url: 'https://g.page/tepuy-laureles' } as unknown as TenantConfig
    const out = mergeLocationOverConfig(marca, laureles)
    expect(out?.google_maps_url).toBe('https://g.page/tepuy-laureles')
    expect(out?.brand_name).toBe('Tepuy')
    expect(out?.instagram_url).toBe('https://instagram.com/tepuy')
  })

  it('el vacío NO borra: es como una sede dice «esto lo hereda»', () => {
    // Un campo en blanco en la pantalla de «Mis sedes» tiene que devolver el valor
    // de la marca, no dejar al cliente sin link.
    const out = mergeLocationOverConfig(marca, { google_maps_url: '   ' } as unknown as TenantConfig)
    expect(out?.google_maps_url).toBe('https://g.page/tepuy-marca')
  })

  it('`card` se mezcla clave a clave, no de golpe', () => {
    // Sin esto, una sede que solo pone su dirección borraría el horario de la marca.
    const out = mergeLocationOverConfig(marca, { card: { address: 'Carrera 73 C3-5' } } as unknown as TenantConfig)
    const card = out?.card as Record<string, unknown> | undefined
    expect(card?.address).toBe('Carrera 73 C3-5')
    expect(card?.hours).toBe('L-D 12-22')
  })
})
