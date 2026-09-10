/**
 * La whitelist de `tenants.config` (§3/§5/§6).
 *
 * `tenants.config` es UN jsonb con TODO lo del tenant: nombre, gradientes,
 * etiquetas de negocio, ciudad de domicilios. El endpoint del panel nunca lo
 * escribe entero — escribe rutas de una lista cerrada. Estas pruebas fijan las
 * dos mitades de esa garantía:
 *
 *   · lo que NO está en la lista no llega nunca al patch (incluido casi todo el
 *     espacio `integrations`, del que solo se abrió `meta_pixel_id`);
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
import { CARD_MOTIF_IDS, STAMP_ICON_IDS } from '@/constants/card-extras'

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

  it('de `integrations` solo se abrió el píxel de Meta, y nada más', () => {
    // 2026-09-10: el espacio dejó de estar entero afuera. Entró UNA ruta, porque
    // un id de píxel es público y no lo escribe ningún OAuth. Todo lo demás
    // —empezando por cualquier cosa que huela a credencial— sigue afuera.
    expect(isEditablePath('integrations.meta_pixel_id')).toBe(true)
    for (const path of ['integrations', 'integrations.google', 'integrations.meta.page_id']) {
      expect(isEditablePath(path)).toBe(false)
    }
    const built = buildConfigPatch({ 'integrations.google': { refresh_token: 'x' } })
    expect(built.ok).toBe(false)
  })

  it('el píxel de Meta llega anidado y normalizado, y el vacío lo desconecta', () => {
    const built = buildConfigPatch({ 'integrations.meta_pixel_id': ' 1234-5678 9012 3456 ' })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.patch).toEqual({ integrations: { meta_pixel_id: '1234567890123456' } })

    const vacío = buildConfigPatch({ 'integrations.meta_pixel_id': '' })
    expect(vacío.ok).toBe(true)
    if (!vacío.ok) return
    expect(vacío.patch).toEqual({ integrations: { meta_pixel_id: '' } })
  })

  it('rechaza el error real: pegar el snippet entero en vez del número', () => {
    const built = buildConfigPatch({
      'integrations.meta_pixel_id': "<script>fbq('init', '1234567890123456');</script>",
    })
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

describe('Tarjeta principal — el espacio `card` y las redes planas (2026-09-08)', () => {
  it('abre exactamente lo que la pantalla edita, y nada más del espacio', () => {
    for (const path of [
      'instagram_url', 'whatsapp_link',
      'card.stamp_icon', 'card.motif', 'card.description', 'card.facebook_url', 'card.tiktok_url',
      'card.website_url', 'card.google_profile_url', 'card.contact_phone', 'card.contact_email',
      'card.address', 'card.hours', 'card.policies',
    ]) {
      expect(isEditablePath(path), path).toBe(true)
    }
    expect(isEditablePath('card')).toBe(false)
    expect(isEditablePath('card.token')).toBe(false)
  })

  it('el símbolo del sello y la decoración son listas cerradas: un id inventado no se guarda', () => {
    for (const id of STAMP_ICON_IDS) expect(buildConfigPatch({ 'card.stamp_icon': id }).ok, id).toBe(true)
    for (const id of CARD_MOTIF_IDS) expect(buildConfigPatch({ 'card.motif': id }).ok, id).toBe(true)
    expect(buildConfigPatch({ 'card.stamp_icon': '<svg onload=alert(1)>' }).ok).toBe(false)
    expect(buildConfigPatch({ 'card.motif': 'https://evil.example/x.svg' }).ok).toBe(false)
  })

  it('las redes son URLs http(s); el vacío borra', () => {
    expect(buildConfigPatch({ 'card.facebook_url': 'https://facebook.com/sushi' }).ok).toBe(true)
    expect(buildConfigPatch({ 'card.facebook_url': '' }).ok).toBe(true)
    expect(buildConfigPatch({ 'card.tiktok_url': 'javascript:alert(1)' }).ok).toBe(false)
    expect(buildConfigPatch({ 'instagram_url': 'instagram.com/sushi' }).ok).toBe(false)
  })

  it('teléfono y correo se validan como lo que son', () => {
    expect(buildConfigPatch({ 'card.contact_phone': '+57 300 123 4567' }).ok).toBe(true)
    expect(buildConfigPatch({ 'card.contact_phone': 'llámame' }).ok).toBe(false)
    const mail = buildConfigPatch({ 'card.contact_email': 'Hola@Sushi.CO' })
    expect(mail.ok).toBe(true)
    if (mail.ok) expect(mail.patch).toEqual({ card: { contact_email: 'hola@sushi.co' } })
    expect(buildConfigPatch({ 'card.contact_email': 'sin-arroba' }).ok).toBe(false)
  })

  it('los textos largos conservan los saltos de línea y respetan su tope', () => {
    const built = buildConfigPatch({ 'card.hours': 'Lun a Vie: 12-22\r\nSáb: 12-23' })
    expect(built.ok).toBe(true)
    if (built.ok) expect(built.patch).toEqual({ card: { hours: 'Lun a Vie: 12-22\nSáb: 12-23' } })
    expect(buildConfigPatch({ 'card.policies': 'x'.repeat(2000) }).ok).toBe(true)
    expect(buildConfigPatch({ 'card.policies': 'x'.repeat(2001) }).ok).toBe(false)
    expect(buildConfigPatch({ 'card.description': 'x'.repeat(401) }).ok).toBe(false)
  })

  it('el GET proyecta el espacio card aplanado', () => {
    const projected = projectEditablePaths({
      card: { stamp_icon: 'star', motif: 'ondas', policies: 'Sin reservas' },
      instagram_url: 'https://instagram.com/sushi',
    })
    expect(projected['card.stamp_icon']).toBe('star')
    expect(projected['card.motif']).toBe('ondas')
    expect(projected['card.policies']).toBe('Sin reservas')
    expect(projected['instagram_url']).toBe('https://instagram.com/sushi')
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
      integrations: { meta_pixel_id: '1234567890123456', google: { refresh_token: 'SECRETO' } },
      branding: { primary: '#0a7c4a', logo_url: 'https://cdn.example/l.png' },
      qr_studio: { theme: 'sushi', tables: 14 },
    })

    expect(projected['branding.primary']).toBe('#0a7c4a')
    expect(projected['qr_studio.tables']).toBe(14)
    expect(projected['branding.surface']).toBeUndefined()

    // De `integrations` sale EXACTAMENTE una clave: el id del píxel, que es
    // público. Todo lo demás de ese espacio —empezando por cualquier cosa que
    // huela a credencial— se queda del lado del servidor.
    expect(projected['integrations.meta_pixel_id']).toBe('1234567890123456')
    expect(Object.keys(projected).filter((k) => k.startsWith('integrations')))
      .toEqual(['integrations.meta_pixel_id'])
    expect(JSON.stringify(projected)).not.toContain('SECRETO')
    expect(Object.keys(projected)).not.toContain('brand_name')
  })

  it('una config vacía no revienta', () => {
    expect(() => projectEditablePaths({})).not.toThrow()
  })
})
