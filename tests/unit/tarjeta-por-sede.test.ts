/**
 * Sedes separadas, parte 2: la tarjeta de cada sede (2026-10-14) — lo puro y lo dibujado.
 *
 * El dueño, mirando Tepuy: *«Si escojo una sede u otra, cuando voy a modificar la tarjeta sale la
 * misma para las dos, incoherente, a menos que haya un botón que diga "tarjetas separadas"»*.
 * Lo que se fija (prompt `docs/prompts/2026-10-14-sedes-separadas.md` §4 y §6, parte 2):
 *
 *   · la whitelist: la tarjeta de la sede es su propia lista (sello, decoración, descripción,
 *     políticas) con las MISMAS validaciones que la de la marca; lo de fuera se ignora o se
 *     rechaza; `card.mode` es de la marca y solo vale `shared` o `per_location`;
 *   · el arreglo de paso: «Tarjeta principal» no podía guardar nada con el sello de siempre
 *     (`card.stamp_icon = ''` daba 400);
 *   · el resolver: con la tarjeta compartida, una sede muestra su dirección pero NO su sello; con
 *     una tarjeta por sede, el suyo; el nombre, el logo y los colores siempre de la marca; una
 *     marca de una sede, exactamente como antes;
 *   · la pantalla: qué se edita según la elección y la sede elegida, sus frases, «Copiar la de…»;
 *   · el encabezado: con una tarjeta por sede, en «Tarjeta principal» el selector deja de ser la
 *     etiqueta quieta y la franja de toda la marca no sale.
 *
 * Contra el código anterior: `tarjeta-de-sede.ts`, `EleccionDeTarjeta` y `buildLocationCardPatch`
 * no existen, `card.mode` no está en la whitelist y `''` en el sello da 400.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LocationScopeView } from '@/lib/location-scope-shared'
import type { TenantConfig } from '@/types/tenant.types'

const h = vi.hoisted(() => ({
  view: null as LocationScopeView | null,
  path: '/dashboard/marca',
  tarjetaPorSede: false,
}))

vi.mock('@/contexts/LocationScopeContext', () => ({
  LOCATION_ALL: 'all',
  LOCATION_UNKNOWN: 'unknown',
  useLocationScope: () => ({ view: h.view, loading: false, selection: 'all', setSelection: () => {}, queryParam: '' }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => h.path,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))
vi.mock('@/hooks/useTarjetaPorSede', () => ({
  useTarjetaPorSede: () => h.tarjetaPorSede,
  avisarTarjetaPorSede: () => {},
}))

import { buildConfigPatch } from '@/lib/tenant-config-paths'
import { buildLocationCardPatch, buildLocationConfigPatch, isLocationCardPath, isLocationEditablePath } from '@/lib/location-config-paths'
import { mergeLocationOverConfig, resolveBranding, tarjetaPorSede } from '@/lib/branding'
import { esPantallaDeTodaLaMarca } from '@/lib/panel-sedes'
import {
  TARJETA_VACIA, anidarRutas, camposDesdeRutas, copiarTarjeta, fraseDeLaTarjeta, modoDeTarjeta,
  opcionesDeTarjeta, queSeEdita, rutasDesdeCampos, tarjetaEfectiva, tieneTarjetaPropia,
} from '@/lib/tarjeta-de-sede'
import { LocationSelector } from '@/components/layout/LocationSelector'
import { FranjaTodaLaMarca } from '@/components/dashboard/sedes/FranjaTodaLaMarca'
import { EleccionDeTarjeta } from '@/components/dashboard/sedes/EleccionDeTarjeta'

const ENV = 'bbbbbbbb-0000-4000-8000-000000000001'
const LAU = 'cccccccc-0000-4000-8000-000000000002'
const sedesTepuy = [
  { id: ENV, name: 'Tepuy Envigado' },
  { id: LAU, name: 'Tepuy Laureles' },
]

function vista(extra: Partial<LocationScopeView> = {}): LocationScopeView {
  return {
    role: 'brand',
    selection: 'all',
    selectedLocationId: null,
    canSeeAll: true,
    canSeeUnassigned: true,
    locations: [
      { id: ENV, name: 'Tepuy Envigado', slug: 'envigado', is_primary: true },
      { id: LAU, name: 'Tepuy Laureles', slug: 'laureles', is_primary: false },
    ],
    multiSede: true,
    brandLocationCount: 2,
    ...extra,
  }
}

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

beforeEach(() => {
  h.view = vista()
  h.path = '/dashboard/marca'
  h.tarjetaPorSede = false
})

// ═══════════════════════════════════════════════════════════════
// La whitelist
// ═══════════════════════════════════════════════════════════════

describe('la whitelist de la tarjeta', () => {
  it('«Tarjeta principal» guarda con el sello y la decoración de siempre (antes: 400)', () => {
    // El panel manda TODAS las rutas juntas y, con el chulo y sin decoración, las dos van vacías.
    const out = buildConfigPatch({ 'card.stamp_icon': '', 'card.motif': '', 'branding.primary': '#0a7c4a' })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.patch).toEqual({ card: { stamp_icon: '', motif: '' }, branding: { primary: '#0a7c4a' } })
    // Lo que no es de la lista sigue fuera.
    expect(buildConfigPatch({ 'card.stamp_icon': '<svg onload=alert(1)>' }).ok).toBe(false)
  })

  it('`card.mode` es de la marca y solo vale «shared» o «per_location»', () => {
    const ok = buildConfigPatch({ 'card.mode': 'per_location' })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.patch).toEqual({ card: { mode: 'per_location' } })
    expect(buildConfigPatch({ 'card.mode': 'shared' }).ok).toBe(true)
    expect(buildConfigPatch({ 'card.mode': 'cada-una' }).ok).toBe(false)
    expect(buildConfigPatch({ 'card.mode': '' }).ok).toBe(false)
  })

  it('la tarjeta de la sede es su propia lista, con las validaciones de la marca', () => {
    const out = buildLocationCardPatch({
      'card.stamp_icon': 'pizza',
      'card.motif': '',
      'card.description': '  Terraza y música en vivo  ',
      'card.policies': 'Sin reservas',
      'card.address': 'Cra 70', // es de la FICHA: no entra por acá
      'branding.primary': '#000000', // es de la MARCA: tampoco
      'card.mode': 'per_location', // es de la MARCA
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.patch).toEqual({
      card: { stamp_icon: 'pizza', motif: '', description: 'Terraza y música en vivo', policies: 'Sin reservas' },
    })
    expect(buildLocationCardPatch({ 'card.stamp_icon': '<svg>' }).ok).toBe(false)
    expect(buildLocationCardPatch({ 'card.motif': 'https://evil.example/x.svg' }).ok).toBe(false)
    expect(buildLocationCardPatch({ 'card.address': 'Cra 70' }).ok).toBe(false) // nada editable
  })

  it('la ficha («Mis sedes») no deja escribir la tarjeta por la puerta de al lado', () => {
    for (const ruta of ['card.stamp_icon', 'card.motif', 'card.description', 'card.policies']) {
      expect(isLocationEditablePath(ruta)).toBe(false)
      expect(isLocationCardPath(ruta)).toBe(true)
    }
    const ficha = buildLocationConfigPatch({ 'card.stamp_icon': 'gem', 'card.address': 'Cra 70' })
    expect(ficha.ok).toBe(true)
    if (ficha.ok) expect(ficha.paths).toEqual(['card.address'])
  })
})

// ═══════════════════════════════════════════════════════════════
// El resolver
// ═══════════════════════════════════════════════════════════════

const marcaTepuy = {
  brand_name: 'Tepuy',
  branding: { primary: '#0a7c4a', logo_url: 'https://cdn.test/tepuy.png' },
  card: { stamp_icon: 'star', motif: 'ondas', description: 'De la marca', policies: 'Políticas de la marca', address: 'Dirección de la marca' },
} as unknown as TenantConfig

const laureles = {
  card: { address: 'Carrera 73 C3-5', stamp_icon: 'pizza', description: 'Laureles: terraza', motif: '' },
} as unknown as TenantConfig

const conModo = (modo: string): TenantConfig =>
  ({ ...marcaTepuy, card: { ...(marcaTepuy.card as object), mode: modo } }) as unknown as TenantConfig

describe('el resolver: qué tarjeta ve el cliente', () => {
  it('con la tarjeta COMPARTIDA (lo de siempre): la dirección de la sede sí, su sello y su texto no', () => {
    const b = resolveBranding(marcaTepuy, laureles)
    expect(b.card.address).toBe('Carrera 73 C3-5') // la ficha pisa siempre
    expect(b.card.stampIcon).toBe('star')
    expect(b.card.description).toBe('De la marca')
    expect(tarjetaPorSede(marcaTepuy)).toBe(false)
    expect(resolveBranding(conModo('shared'), laureles).card.stampIcon).toBe('star')
  })

  it('con UNA TARJETA POR SEDE: lo suyo donde puso algo, lo de la marca donde no', () => {
    const b = resolveBranding(conModo('per_location'), laureles)
    expect(b.card.stampIcon).toBe('pizza')
    expect(b.card.description).toBe('Laureles: terraza')
    expect(b.card.motif).toBe('ondas') // vacío en la sede = el de la marca
    expect(b.card.policies).toBe('Políticas de la marca')
    expect(b.card.address).toBe('Carrera 73 C3-5')
    // La identidad sigue siendo de la marca.
    expect(b.name).toBe('Tepuy')
    expect(b.logoUrl).toBe('https://cdn.test/tepuy.png')
    expect(b.primary).toBe('#0a7c4a')
  })

  it('una sede no decide cómo se reparte la tarjeta (su `mode` se ignora)', () => {
    const conModoEnSede = { card: { mode: 'per_location', stamp_icon: 'pizza' } } as unknown as TenantConfig
    const out = mergeLocationOverConfig(marcaTepuy, conModoEnSede)
    expect((out?.card as Record<string, unknown>).mode).toBeUndefined()
    expect(resolveBranding(marcaTepuy, conModoEnSede).card.stampIcon).toBe('star')
  })

  it('una marca de UNA sede se ve exactamente como antes', () => {
    // El día del despliegue: ninguna marca tiene `card.mode` y ninguna sede tiene tarjeta propia
    // (la 00058 ni las dejaba guardar). La ficha de la sede pisa campo a campo, como siempre.
    const sedeUnica = { google_maps_url: 'https://g.page/r/unica', card: { hours: 'L-D 12-22' } } as unknown as TenantConfig
    const sinSede = resolveBranding(marcaTepuy)
    const conSede = resolveBranding(marcaTepuy, sedeUnica)
    expect({ ...conSede, googleReviewUrl: sinSede.googleReviewUrl, card: { ...conSede.card, hours: null } }).toEqual(sinSede)
    expect(conSede.googleReviewUrl).toBe('https://g.page/r/unica')
    expect(conSede.card.hours).toBe('L-D 12-22')
    expect(resolveBranding(marcaTepuy, {} as TenantConfig)).toEqual(sinSede)
  })
})

// ═══════════════════════════════════════════════════════════════
// La pantalla: qué se edita
// ═══════════════════════════════════════════════════════════════

describe('«Tarjeta principal»: qué tarjeta se edita', () => {
  const base = { multiSede: true, rol: 'brand' as const, sedes: sedesTepuy }

  it('con una sola sede: la pantalla de siempre, sin una palabra de sedes', () => {
    const que = queSeEdita({ ...base, multiSede: false, modo: 'per_location', seleccion: LAU })
    expect(que).toEqual({ tipo: 'marca', motivo: 'una-sede' })
    expect(fraseDeLaTarjeta(que, 1)).toBeNull()
  })

  it('con la tarjeta compartida: la de la marca, elija la sede que elija, y lo dice', () => {
    for (const seleccion of ['all', ENV, LAU]) {
      expect(queSeEdita({ ...base, modo: 'shared', seleccion })).toEqual({ tipo: 'marca', motivo: 'compartida' })
    }
    expect(fraseDeLaTarjeta({ tipo: 'marca', motivo: 'compartida' }, 2)).toBe('Las dos sedes muestran esta tarjeta.')
    expect(fraseDeLaTarjeta({ tipo: 'marca', motivo: 'compartida' }, 3)).toBe('Las 3 sedes muestran esta tarjeta.')
  })

  it('con una tarjeta por sede: la de la sede elegida; con «Toda la marca», la de la marca', () => {
    expect(queSeEdita({ ...base, modo: 'per_location', seleccion: LAU })).toEqual({ tipo: 'sede', id: LAU, nombre: 'Tepuy Laureles' })
    expect(queSeEdita({ ...base, modo: 'per_location', seleccion: ENV })).toEqual({ tipo: 'sede', id: ENV, nombre: 'Tepuy Envigado' })
    expect(queSeEdita({ ...base, modo: 'per_location', seleccion: 'all' })).toEqual({ tipo: 'marca', motivo: 'base' })
    // Una sede que este usuario no ve (o de otra marca) no se edita: cae a la de la marca.
    expect(queSeEdita({ ...base, modo: 'per_location', seleccion: 'dddddddd-0000-4000-8000-000000000009' })).toEqual({
      tipo: 'marca',
      motivo: 'base',
    })
    expect(fraseDeLaTarjeta({ tipo: 'sede', id: LAU, nombre: 'Tepuy Laureles' }, 2)).toContain('Estás editando la tarjeta de Tepuy Laureles')
  })

  it('un administrador de UNA sede ve la de su sede', () => {
    const que = queSeEdita({ multiSede: true, rol: 'location', sedes: [sedesTepuy[1]], modo: 'per_location', seleccion: 'all' })
    expect(que).toEqual({ tipo: 'sede', id: LAU, nombre: 'Tepuy Laureles' })
  })

  it('el modo guardado: solo `per_location` separa; cualquier otra cosa es la compartida', () => {
    expect(modoDeTarjeta('per_location')).toBe('per_location')
    for (const v of [undefined, null, '', 'shared', 'otra']) expect(modoDeTarjeta(v)).toBe('shared')
  })

  it('«Copiar la de Envigado» deja a las dos mostrando lo mismo, sin congelar lo de la marca', () => {
    const marca = { stamp_icon: 'star', motif: 'ondas', description: 'De la marca', policies: 'P' }
    const envigado = { ...TARJETA_VACIA, motif: 'hojas', policies: 'Envigado: sin reservas' }
    const copia = copiarTarjeta(envigado)
    expect(copia).toEqual(envigado)
    expect(tarjetaEfectiva(marca, copia)).toEqual(tarjetaEfectiva(marca, envigado))
    expect(tarjetaEfectiva(marca, copia).description).toBe('De la marca')
    expect(tieneTarjetaPropia(TARJETA_VACIA)).toBe(false)
    expect(tieneTarjetaPropia(envigado)).toBe(true)
  })

  it('las rutas planas van y vuelven sin perder nada', () => {
    const campos = { stamp_icon: 'pizza', motif: '', description: 'Terraza', policies: '' }
    expect(camposDesdeRutas(rutasDesdeCampos(campos))).toEqual(campos)
    expect(camposDesdeRutas(undefined)).toEqual(TARJETA_VACIA)
    expect(anidarRutas({ 'card.address': 'Cra 70', 'card.stamp_icon': '', google_maps_url: 'https://g.page/x' })).toEqual({
      card: { address: 'Cra 70' },
      google_maps_url: 'https://g.page/x',
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// Lo dibujado
// ═══════════════════════════════════════════════════════════════

describe('el encabezado en «Tarjeta principal»', () => {
  it('con la tarjeta compartida: la etiqueta quieta y la franja, como en la parte 1', () => {
    const s = html(createElement(LocationSelector))
    expect(s).not.toContain('<select')
    expect(s).toContain('Toda la marca (2 sedes)')
    expect(html(createElement(FranjaTodaLaMarca))).toContain('Esto es de toda la marca')
    expect(esPantallaDeTodaLaMarca('/dashboard/marca')).toBe(true)
  })

  it('con una tarjeta por sede: el selector de verdad, sin franja', () => {
    h.tarjetaPorSede = true
    const s = html(createElement(LocationSelector))
    expect(s).toContain('<select')
    expect(s).toContain('Tepuy Laureles')
    expect(html(createElement(FranjaTodaLaMarca))).toBe('')
    expect(esPantallaDeTodaLaMarca('/dashboard/marca', { tarjetaPorSede: true })).toBe(false)
  })

  it('las demás pantallas de toda la marca no cambian con la tarjeta por sede', () => {
    h.tarjetaPorSede = true
    for (const ruta of ['/dashboard/templates', '/dashboard/conexiones', '/dashboard/settings']) {
      h.path = ruta
      expect(html(createElement(LocationSelector))).not.toContain('<select')
      expect(esPantallaDeTodaLaMarca(ruta, { tarjetaPorSede: true })).toBe(true)
    }
  })
})

describe('la elección «una tarjeta para todas» / «una para cada sede»', () => {
  it('dibuja las dos, con la vigente marcada', () => {
    const s = html(
      createElement(EleccionDeTarjeta, { sedes: 2, modo: 'shared', puedeCambiar: true, guardando: false, onElegir: () => {} })
    )
    expect(s).toContain('La misma tarjeta para todas las sedes')
    expect(s).toContain('Una tarjeta para cada sede')
    expect(s).toContain('Las dos sedes muestran esta tarjeta')
    const marcadas = [...s.matchAll(/aria-checked="(true|false)"/g)].map((m) => m[1])
    expect(marcadas).toEqual(['true', 'false'])
  })

  it('un administrador de sede la ve pero no la cambia', () => {
    const s = html(
      createElement(EleccionDeTarjeta, { sedes: 2, modo: 'per_location', puedeCambiar: false, guardando: false, onElegir: () => {} })
    )
    expect((s.match(/disabled=""/g) ?? []).length).toBe(2)
    expect([...s.matchAll(/aria-checked="(true|false)"/g)].map((m) => m[1])).toEqual(['false', 'true'])
  })

  it('el texto de cada opción dice qué sigue siendo de la marca', () => {
    const [compartida, porSede] = opcionesDeTarjeta(3)
    expect(compartida.detalle).toContain('Las 3 sedes muestran esta tarjeta')
    expect(porSede.detalle).toContain('El nombre, el logo y los colores siguen siendo de la marca')
  })
})
