/**
 * El píxel de Meta — lo que se dispara, dónde, y sobre todo QUÉ NO SALE.
 *
 * Las tres garantías que estas pruebas fijan, y por las que existen:
 *
 *   1. **Ningún dato personal viaja a Meta.** `buildMetaEventParams()` es la
 *      única fábrica de parámetros y su salida está acotada a mano. Si alguien
 *      le agrega el celular "porque sirve para hacer match", esto se pone rojo
 *      antes de que llegue a un cliente real.
 *   2. **El píxel de la marca A jamás se mezcla con el de la marca B.** El de
 *      la plataforma es el mismo para todas, pero el propio sale de la config
 *      de ESE tenant y de ningún otro.
 *   3. **El mesero no se mide.** Es lo que separa una audiencia de clientes de
 *      una audiencia con el celular del local adentro.
 *
 * Ref: docs/features/meta-pixel.md
 */

import { describe, it, expect } from 'vitest'
import {
  META_EVENT_CHECK_IN,
  META_EVENT_PAGE_VIEW,
  META_EVENT_REGISTER,
  buildMetaEventParams,
  isMeasuredPath,
  normalizeMetaPixelId,
  resolveMetaPixelIds,
  surfaceForPath,
  tenantMetaPixelId,
} from '@/lib/meta-pixel'
import type { TenantConfig } from '@/types/tenant.types'

/** Un config mínimo: `brand_name` es lo único obligatorio del tipo. */
function config(integrations?: Record<string, unknown>): TenantConfig {
  return { brand_name: 'Marca', ...(integrations ? { integrations } : {}) }
}

describe('normalizeMetaPixelId', () => {
  it('acepta un id de 15 y de 16 dígitos', () => {
    expect(normalizeMetaPixelId('123456789012345')).toBe('123456789012345')
    expect(normalizeMetaPixelId('1234567890123456')).toBe('1234567890123456')
  })

  it('limpia lo que deja el copiar/pegar del Administrador de eventos', () => {
    expect(normalizeMetaPixelId('  1234 5678 9012 3456 ')).toBe('1234567890123456')
    expect(normalizeMetaPixelId('1234-5678-9012-3456')).toBe('1234567890123456')
  })

  it('rechaza el error de verdad: el snippet, una URL, o el id con basura', () => {
    // Nadie escribe mal un número. Lo que sí pasa es pegar el bloque entero.
    expect(normalizeMetaPixelId("fbq('init', '1234567890123456')")).toBeNull()
    expect(normalizeMetaPixelId('https://business.facebook.com/events_manager2/1234567890123456')).toBeNull()
    expect(normalizeMetaPixelId('1234567890123456;')).toBeNull()
  })

  it('rechaza el vacío, el nulo y lo que no es texto ni número', () => {
    for (const raw of ['', '   ', null, undefined, {}, [], true]) {
      expect(normalizeMetaPixelId(raw)).toBeNull()
    }
  })

  it('acepta un número entero (así lo devolvería un jsonb escrito a mano)', () => {
    expect(normalizeMetaPixelId(1234567890123456)).toBe('1234567890123456')
    expect(normalizeMetaPixelId(-5)).toBeNull()
    expect(normalizeMetaPixelId(1.5)).toBeNull()
  })
})

describe('tenantMetaPixelId — el píxel propio de la marca', () => {
  it('lo lee del espacio `integrations`', () => {
    expect(tenantMetaPixelId(config({ meta_pixel_id: '1234567890123456' }))).toBe('1234567890123456')
  })

  it('devuelve null sin config, sin espacio y sin la clave', () => {
    expect(tenantMetaPixelId(null)).toBeNull()
    expect(tenantMetaPixelId(undefined)).toBeNull()
    expect(tenantMetaPixelId(config())).toBeNull()
    expect(tenantMetaPixelId(config({ google: {} }))).toBeNull()
  })

  it('un valor MAL FORMADO en la base se ignora, no revienta la página pública', () => {
    // Es el caso real: alguien escribe el jsonb a mano por SQL y se equivoca.
    // La tarjeta del cliente no puede dejar de cargar por eso.
    expect(tenantMetaPixelId(config({ meta_pixel_id: 'pegué-el-snippet' }))).toBeNull()
    expect(tenantMetaPixelId(config({ meta_pixel_id: '' }))).toBeNull()
  })
})

describe('resolveMetaPixelIds — los dos píxeles', () => {
  it('sin nada configurado no hay píxel, y por lo tanto no se carga nada de Meta', () => {
    expect(resolveMetaPixelIds({ platformId: undefined, tenantConfig: config() })).toEqual([])
    expect(resolveMetaPixelIds({ platformId: '', tenantConfig: null })).toEqual([])
  })

  it('solo el de la plataforma cuando la marca no cargó el suyo', () => {
    expect(resolveMetaPixelIds({ platformId: '111111111111111', tenantConfig: config() }))
      .toEqual(['111111111111111'])
  })

  it('solo el de la marca cuando el despliegue no tiene el de la plataforma', () => {
    expect(resolveMetaPixelIds({ platformId: null, tenantConfig: config({ meta_pixel_id: '222222222222222' }) }))
      .toEqual(['222222222222222'])
  })

  it('los dos, plataforma primero', () => {
    expect(resolveMetaPixelIds({
      platformId: '111111111111111',
      tenantConfig: config({ meta_pixel_id: '222222222222222' }),
    })).toEqual(['111111111111111', '222222222222222'])
  })

  it('si la marca pega POR ERROR el id de la plataforma, no se cuenta dos veces', () => {
    // Sin el dedupe, `fbq('init', X)` dos veces hace que Meta cuente cada evento
    // DOBLE en esa cuenta. No da error: se descubre semanas después.
    expect(resolveMetaPixelIds({
      platformId: '111111111111111',
      tenantConfig: config({ meta_pixel_id: ' 111111111111111 ' }),
    })).toEqual(['111111111111111'])
  })

  it('la marca A y la marca B nunca comparten el píxel propio', () => {
    const a = resolveMetaPixelIds({ platformId: null, tenantConfig: config({ meta_pixel_id: '111111111111111' }) })
    const b = resolveMetaPixelIds({ platformId: null, tenantConfig: config({ meta_pixel_id: '222222222222222' }) })
    expect(a).toEqual(['111111111111111'])
    expect(b).toEqual(['222222222222222'])
  })
})

describe('buildMetaEventParams — el contrato de lo que sale hacia Meta', () => {
  it('manda la marca, la sede y la pantalla, y NADA más', () => {
    const params = buildMetaEventParams({ tenant: 'sushi-service', location: 'loc-1' }, 'check-in')
    expect(params).toEqual({ tenant: 'sushi-service', location: 'loc-1', content_category: 'check-in' })
  })

  it('las claves de un dato personal NO existen en la salida', () => {
    // Esta es la prueba que tiene que ponerse roja si alguien "mejora" el evento.
    const params = buildMetaEventParams({ tenant: 'sushi-service', location: 'loc-1' }, 'tarjeta') as Record<string, unknown>
    for (const prohibida of ['phone', 'ph', 'email', 'em', 'name', 'fn', 'ln', 'external_id', 'customer_id', 'birthday', 'db']) {
      expect(params[prohibida]).toBeUndefined()
    }
    expect(Object.keys(params).sort()).toEqual(['content_category', 'location', 'tenant'])
  })

  it('sede desconocida = la clave se OMITE, no se manda vacía', () => {
    // Un `location: ''` en Meta se ve como un valor real y ensucia el desglose.
    const params = buildMetaEventParams({ tenant: 'sushi-service', location: null }, 'check-in')
    expect(params).toEqual({ tenant: 'sushi-service', content_category: 'check-in' })
    expect('location' in params).toBe(false)
  })

  it('sin contexto sigue devolviendo algo usable', () => {
    expect(buildMetaEventParams(null, 'check-in')).toEqual({ content_category: 'check-in' })
    expect(buildMetaEventParams(undefined, 'tarjeta')).toEqual({ content_category: 'tarjeta' })
  })
})

describe('isMeasuredPath — el mesero no entra a la audiencia', () => {
  it('mide las pantallas del cliente', () => {
    for (const path of ['/check-in', '/tarjeta', '/tarjeta?phone=300', '/privacidad']) {
      expect(isMeasuredPath(path)).toBe(true)
    }
  })

  it('NO mide ninguna pantalla del mesero', () => {
    for (const path of ['/mesero', '/mesero/scan', '/mesero/dashboard', '/mesero/rewards', '/mesero/confirm']) {
      expect(isMeasuredPath(path)).toBe(false)
    }
  })

  it('no confunde una ruta que solo EMPIEZA parecido', () => {
    expect(isMeasuredPath('/meseros-del-mes')).toBe(true)
  })
})

describe('surfaceForPath y los eventos', () => {
  it('la tarjeta es tarjeta; todo lo demás es check-in', () => {
    expect(surfaceForPath('/tarjeta')).toBe('tarjeta')
    expect(surfaceForPath('/tarjeta?phone=300')).toBe('tarjeta')
    expect(surfaceForPath('/check-in')).toBe('check-in')
    expect(surfaceForPath('/privacidad')).toBe('check-in')
  })

  it('los estándar van por `track` y el inventado por `trackCustom`', () => {
    // Mandar un nombre propio por `track` hace que Meta lo DESCARTE en silencio.
    expect(META_EVENT_PAGE_VIEW).toEqual({ name: 'PageView', standard: true })
    expect(META_EVENT_REGISTER).toEqual({ name: 'CompleteRegistration', standard: true })
    expect(META_EVENT_CHECK_IN.standard).toBe(false)
  })
})
