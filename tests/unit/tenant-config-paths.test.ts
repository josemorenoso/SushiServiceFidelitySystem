/**
 * La whitelist de `tenants.config` (§3/§5/§6).
 *
 * `tenants.config` es UN jsonb con TODO lo del tenant: nombre, gradientes,
 * etiquetas de negocio, ciudad de domicilios. El endpoint del panel nunca lo
 * escribe entero — escribe rutas de una lista cerrada. Estas pruebas fijan las
 * dos mitades de esa garantía:
 *
 *   · lo que NO está en la lista no llega nunca al patch (incluido el espacio
 *     `integrations`, reservado para las cuentas de Google y Meta que vienen);
 *   · lo que sí está, llega VALIDADO y con la forma anidada que espera
 *     `merge_tenant_config_deep()`.
 */

import { describe, it, expect } from 'vitest'
import {
  QR_SIZE_IDS,
  QR_THEME_IDS,
  buildConfigPatch,
  isEditablePath,
  projectEditablePaths,
} from '@/lib/tenant-config-paths'
import { QR_SIZES, QR_THEMES } from '@/lib/utils/qr-poster'

describe('lo que la lista deja pasar y lo que no', () => {
  it('deja pasar exactamente lo de §3/§5/§6 más el link de reseñas', () => {
    expect(isEditablePath('google_maps_url')).toBe(true)
    expect(isEditablePath('branding.primary')).toBe(true)
    expect(isEditablePath('qr_studio.theme')).toBe(true)
  })

  it('NO deja tocar el resto de la marca, que se siembra al dar de alta', () => {
    for (const path of ['brand_name', 'delivery_default_city', 'template_emoji', 'card_bg', 'branding']) {
      expect(isEditablePath(path)).toBe(false)
    }
  })

  it('NO deja tocar `integrations`: ese espacio no se abre agregando una línea acá', () => {
    // Es la puerta que se dejó abierta para las cuentas de Google y de Meta. Se
    // abre desde su propio flujo de OAuth, y sin tokens dentro de `config`.
    for (const path of ['integrations', 'integrations.google', 'integrations.meta.page_id']) {
      expect(isEditablePath(path)).toBe(false)
    }
    const built = buildConfigPatch({ 'integrations.google': { refresh_token: 'x' } })
    expect(built.ok).toBe(false)
  })
})

describe('buildConfigPatch — de rutas planas a patch anidado', () => {
  it('agrupa por espacio', () => {
    const built = buildConfigPatch({
      'branding.primary': '#0A7C4A',
      'branding.logo_url': 'https://cdn.example/logo.png',
      'qr_studio.theme': 'sushi',
      'google_maps_url': 'https://maps.app.goo.gl/abc',
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.patch).toEqual({
      branding: { primary: '#0a7c4a', logo_url: 'https://cdn.example/logo.png' },
      qr_studio: { theme: 'sushi' },
      google_maps_url: 'https://maps.app.goo.gl/abc',
    })
  })

  it('ignora en silencio lo que no está en la lista, pero guarda el resto', () => {
    const built = buildConfigPatch({ 'branding.primary': '#0A7C4A', brand_name: 'Hackeado' })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.patch).toEqual({ branding: { primary: '#0a7c4a' } })
    expect(built.paths).toEqual(['branding.primary'])
  })

  it('un cuerpo sin nada editable es un 400, no un no-op silencioso', () => {
    const built = buildConfigPatch({ brand_name: 'Hackeado' })
    expect(built.ok).toBe(false)
  })
})

describe('validación por tipo de campo', () => {
  it('el color tiene que ser hex, y el vacío significa "volver al del sistema"', () => {
    expect(buildConfigPatch({ 'branding.primary': '#0a7c4a' }).ok).toBe(true)
    expect(buildConfigPatch({ 'branding.primary': '' }).ok).toBe(true)
    expect(buildConfigPatch({ 'branding.primary': 'verde' }).ok).toBe(false)
    expect(buildConfigPatch({ 'branding.primary': 42 }).ok).toBe(false)
  })

  it('el color se normaliza antes de guardarse', () => {
    const built = buildConfigPatch({ 'branding.ink': '1A1C1D' })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.patch).toEqual({ branding: { ink: '#1a1c1d' } })
  })

  it('el logo tiene que ser una URL http(s)', () => {
    expect(buildConfigPatch({ 'branding.logo_url': 'https://cdn.example/l.png' }).ok).toBe(true)
    expect(buildConfigPatch({ 'branding.logo_url': '' }).ok).toBe(true)
    // Es lo que impide que el logo de la tarjeta acabe siendo un `javascript:`.
    expect(buildConfigPatch({ 'branding.logo_url': 'javascript:alert(1)' }).ok).toBe(false)
    expect(buildConfigPatch({ 'branding.logo_url': 'data:image/svg+xml,<svg onload=alert(1)>' }).ok).toBe(false)
  })

  it('el gradiente literal solo acepta un gradient, y nada que pueda salirse de él', () => {
    expect(buildConfigPatch({ 'branding.card_bg': 'linear-gradient(160deg, #000 0%, #fff 100%)' }).ok).toBe(true)
    expect(buildConfigPatch({ 'branding.card_bg': 'radial-gradient(circle, #000, #fff)' }).ok).toBe(true)
    expect(buildConfigPatch({ 'branding.card_bg': '' }).ok).toBe(true)

    // Estos son los que terminan en un `style={{ background }}` y no deben pasar.
    for (const bad of [
      'red',
      'url(https://evil.example/x.png)',
      'linear-gradient(#000,#fff); background: url(https://evil.example/x)',
      'linear-gradient(#000,#fff) } body { display:none',
    ]) {
      expect(buildConfigPatch({ 'branding.card_bg': bad }).ok).toBe(false)
    }
  })

  it('el tema y el tamaño del QR son listas cerradas', () => {
    expect(buildConfigPatch({ 'qr_studio.theme': 'sushi' }).ok).toBe(true)
    expect(buildConfigPatch({ 'qr_studio.theme': 'inventado' }).ok).toBe(false)
    expect(buildConfigPatch({ 'qr_studio.size': 'a4' }).ok).toBe(true)
    expect(buildConfigPatch({ 'qr_studio.size': 'a0' }).ok).toBe(false)
  })

  it('el número de mesas es un entero acotado', () => {
    expect(buildConfigPatch({ 'qr_studio.tables': 12 }).ok).toBe(true)
    expect(buildConfigPatch({ 'qr_studio.tables': 0 }).ok).toBe(false)
    expect(buildConfigPatch({ 'qr_studio.tables': 500 }).ok).toBe(false)
    expect(buildConfigPatch({ 'qr_studio.tables': 3.5 }).ok).toBe(false)
  })

  it('los textos del póster respetan el mismo tope que el input del panel', () => {
    expect(buildConfigPatch({ 'qr_studio.headline': 'x'.repeat(40) }).ok).toBe(true)
    expect(buildConfigPatch({ 'qr_studio.headline': 'x'.repeat(41) }).ok).toBe(false)
    expect(buildConfigPatch({ 'qr_studio.subline': 'x'.repeat(70) }).ok).toBe(true)
    expect(buildConfigPatch({ 'qr_studio.subline': 'x'.repeat(71) }).ok).toBe(false)
  })
})

describe('espejo con qr-poster.ts', () => {
  // La lista de ids vive dos veces: acá (server, valida) y en `qr-poster.ts`
  // (navegador, dibuja). No se importa una de la otra porque ese módulo dibuja
  // sobre un `<canvas>`. Que se desincronicen significa que el panel deja de
  // poder guardar un tema que sí existe, o al revés.
  it('los ids de tema coinciden', () => {
    expect([...QR_THEME_IDS].sort()).toEqual(QR_THEMES.map((t) => t.id).sort())
  })

  it('los ids de tamaño coinciden', () => {
    expect([...QR_SIZE_IDS].sort()).toEqual(QR_SIZES.map((s) => s.id).sort())
  })
})

describe('projectEditablePaths — lo que el GET le devuelve al panel', () => {
  it('aplana los espacios y no filtra nada de fuera de la lista', () => {
    const projected = projectEditablePaths({
      brand_name: 'Sushi Service',
      delivery_default_city: 'Envigado',
      integrations: { google: { refresh_token: 'SECRETO' } },
      branding: { primary: '#0a7c4a', logo_url: 'https://cdn.example/l.png' },
      qr_studio: { theme: 'sushi', tables: 14 },
    })

    expect(projected['branding.primary']).toBe('#0a7c4a')
    expect(projected['qr_studio.tables']).toBe(14)
    expect(projected['branding.surface']).toBeUndefined()

    // Ni el nombre de la marca ni NADA de `integrations` sale por este endpoint.
    expect(JSON.stringify(projected)).not.toContain('SECRETO')
    expect(Object.keys(projected)).not.toContain('brand_name')
    expect(Object.keys(projected).some((k) => k.startsWith('integrations'))).toBe(false)
  })

  it('una config vacía no revienta', () => {
    expect(() => projectEditablePaths({})).not.toThrow()
  })
})
