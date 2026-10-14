/**
 * Sedes separadas, parte 1: el panel DIBUJADO (2026-10-14) — los componentes reales, a HTML.
 *
 * Sin navegador: `renderToStaticMarkup` sobre el selector del encabezado, la página de Métricas,
 * `MetricsCards`, «Tus sedes», la franja y la línea del número compartido, con los contextos
 * falsos (quién mira, qué sede eligió, qué devolvió la analítica). Lo que se fija (prompt
 * `docs/prompts/2026-10-14-sedes-separadas.md` §6, parte 1):
 *
 *   · el selector ofrece «Toda la marca (N sedes)» + las sedes, y NO «Sin sede» (el dueño:
 *     «¿Por qué salen 4 opciones?»); con una sede no se dibuja; en una pantalla de toda la marca
 *     es una etiqueta quieta;
 *   · con Envigado elegido, «Clientes de esta sede» es el número de Envigado y NO el de la
 *     marca (el panel decía «40» con las dos sedes); lo de la marca va bajo «De toda la marca»;
 *   · «Tus sedes» con los números de Tepuy (23 + 17, uno va a las dos, sin fila «Sin sede»);
 *   · un fallo de lectura se dice: nunca «0 clientes»;
 *   · una marca de una sede ve el panel de siempre, sin una etiqueta nueva.
 *
 * Contra el código anterior: `src/lib/panel-sedes.ts` y los componentes de `sedes/` no existen,
 * el selector viejo dibujaba «Todas las sedes» y «Sin sede», y la página pasaba
 * `brand.summary` (40) a la fila de tarjetas con cualquier sede elegida.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LocationScopeView } from '@/lib/location-scope-shared'
import type { DashboardAnalytics, ResumenDeSedes, AnalyticsSummary } from '@/types/analytics.types'

const h = vi.hoisted(() => ({
  view: null as LocationScopeView | null,
  selection: 'all',
  path: '/dashboard',
  analitica: { data: null as unknown, loading: false, error: null as string | null },
}))

vi.mock('@/contexts/LocationScopeContext', () => ({
  LOCATION_ALL: 'all',
  LOCATION_UNKNOWN: 'unknown',
  useLocationScope: () => ({
    view: h.view,
    loading: false,
    selection: h.selection,
    setSelection: () => {},
    queryParam: h.selection === 'all' ? '' : `location_id=${h.selection}`,
  }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => h.path,
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}))
vi.mock('@/contexts/DemoContext', () => ({
  useDemo: () => ({ isDemo: false, demoError: null, demoData: null, demoLoading: false }),
}))
vi.mock('@/hooks/useDashboardAnalytics', () => ({
  useDashboardAnalytics: () => ({ ...h.analitica, refetch: () => {} }),
}))

import { LocationSelector } from '@/components/layout/LocationSelector'
import { MetricsCards } from '@/components/dashboard/MetricsCards'
import { TusSedes } from '@/components/dashboard/sedes/TusSedes'
import { VistaFranjaTodaLaMarca } from '@/components/dashboard/sedes/FranjaTodaLaMarca'
import { VistaNumeroCompartido } from '@/components/dashboard/sedes/NumeroCompartido'
import DashboardPage from '@/app/(dashboard)/dashboard/page'
import {
  esPantallaConSuPropiaSede,
  esPantallaDeTodaLaMarca,
  explicacionSinSede,
  graficoDeSedes,
  lineaNumeroCompartido,
  lineaVanAVarias,
  modoDelPanel,
  opcionesDelSelector,
} from '@/lib/panel-sedes'
import { resumirSedes } from '@/services/dashboard.service'

// ═══════════════════════════════════════════════════════════════
// Fixtures: Tepuy (dos sedes), una marca de una sede, un administrador de sede
// ═══════════════════════════════════════════════════════════════

const ENV = 'bbbbbbbb-0000-4000-8000-000000000001'
const LAU = 'cccccccc-0000-4000-8000-000000000002'
const sedesTepuy = [
  { id: ENV, name: 'Tepuy Envigado', slug: 'envigado', is_primary: true },
  { id: LAU, name: 'Tepuy Laureles', slug: 'laureles', is_primary: false },
]

function vista(extra: Partial<LocationScopeView> = {}): LocationScopeView {
  return {
    role: 'brand',
    selection: 'all',
    selectedLocationId: null,
    canSeeAll: true,
    canSeeUnassigned: true,
    locations: sedesTepuy,
    multiSede: true,
    brandLocationCount: 2,
    ...extra,
  }
}

const unaSede = (): LocationScopeView =>
  vista({ locations: [{ id: ENV, name: 'Sede Principal', slug: null, is_primary: true }], multiSede: false, brandLocationCount: 1 })

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)
const opcionesDibujadas = (s: string) => [...s.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1])

function resumenTepuy(extra: Partial<ResumenDeSedes> = {}): ResumenDeSedes {
  const dias = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)
  return {
    sedes: [
      { locationId: ENV, nombre: 'Tepuy Envigado', activa: true, clientesQueTrajo: 23, clientesQueTrajoEsteMes: 4, clientesQueVinieron: 24, visitas: 24, premiosEntregados: 0 },
      { locationId: LAU, nombre: 'Tepuy Laureles', activa: true, clientesQueTrajo: 17, clientesQueTrajoEsteMes: 3, clientesQueVinieron: 17, visitas: 17, premiosEntregados: 0 },
    ],
    sinSede: null,
    clientesEnVariasSedes: 1,
    visitasPorDia: dias.map((date) => ({ date, porSede: { [ENV]: 1, [LAU]: 0 } })),
    ...extra,
  }
}

const resumenDe = (extra: Partial<AnalyticsSummary> = {}) => ({
  totalCustomers: 40,
  newCustomersToday: 1,
  newCustomersWeek: 6,
  frequentCustomers: 5,
  birthdaysToday: 0,
  ...extra,
})

/** Lo que devuelve la analítica de Tepuy: la marca (40) y, con una sede elegida, el recorte (23). */
function analiticaTepuy(conSede: boolean): DashboardAnalytics {
  const vacio = { newCustomersPerDay: [], customerTiers: [], acquisitionByMonth: [] }
  return {
    brand: { summary: resumenDe(), ...vacio, atRiskGroups: [], topCustomers: [], reactivationRate: [], roiEstimate: { reactivatedThisMonth: 0, avgTicket: 0, estimatedROI: 0 } },
    location: { summary: { visitsToday: 3, deliveriesToday: 0, qrToday: 3, visitorsLast30d: 24 }, visitsPerDay: [], heatmap: [] },
    origin: conSede ? { summary: resumenDe({ totalCustomers: 23, newCustomersWeek: 2, frequentCustomers: 3 }), ...vacio } : null,
    sedes: conSede ? null : resumenTepuy(),
  }
}

beforeEach(() => {
  h.view = null
  h.selection = 'all'
  h.path = '/dashboard'
  h.analitica = { data: null, loading: false, error: null }
})

// ═══════════════════════════════════════════════════════════════
// 1. El selector
// ═══════════════════════════════════════════════════════════════

describe('el selector: «Toda la marca (N sedes)» y una por sede, nada más', () => {
  it('marca de dos sedes: tres opciones, sin «Sin sede» ni «Todas las sedes»', () => {
    h.view = vista()
    const s = html(createElement(LocationSelector))
    expect(opcionesDibujadas(s)).toEqual(['Toda la marca (2 sedes)', 'Tepuy Envigado', 'Tepuy Laureles'])
    expect(s).not.toContain('Sin sede')
    expect(s).not.toContain('Todas las sedes')
  })

  it('marca de una sede: no se dibuja nada (como siempre)', () => {
    h.view = unaSede()
    expect(html(createElement(LocationSelector))).toBe('')
    expect(opcionesDelSelector(unaSede())).toEqual([])
  })

  it('administrador de UNA sede: una sola opción → no se dibuja; de dos: «Tus 2 sedes» + las dos', () => {
    const deUna = vista({ role: 'location', canSeeAll: false, canSeeUnassigned: false, locations: [sedesTepuy[1]] })
    h.view = deUna
    expect(html(createElement(LocationSelector))).toBe('')
    const deDos = vista({ role: 'location', canSeeAll: false, canSeeUnassigned: false, brandLocationCount: 3 })
    expect(opcionesDelSelector(deDos).map((o) => o.label)).toEqual(['Tus 2 sedes', 'Tepuy Envigado', 'Tepuy Laureles'])
  })

  it('en una pantalla de toda la marca el selector es una etiqueta quieta; en Mis sedes y QR Studio, nada', () => {
    h.view = vista()
    for (const ruta of ['/dashboard/templates', '/dashboard/conexiones', '/dashboard/marca', '/dashboard/imported-contacts']) {
      h.path = ruta
      const s = html(createElement(LocationSelector))
      expect(s).not.toContain('<select')
      expect(s).toContain('Toda la marca (2 sedes)')
    }
    for (const ruta of ['/dashboard/sedes', '/dashboard/qr']) {
      h.path = ruta
      expect(html(createElement(LocationSelector))).toBe('')
    }
    h.path = '/dashboard/rewards'
    expect(html(createElement(LocationSelector))).toContain('<select')
  })

  it('las listas: Campañas y Calendario NO (son de la parte C del ciclo); Métricas, Rendimiento y Domicilios usan el selector', () => {
    for (const ruta of ['/dashboard/campaigns', '/dashboard/calendar', '/dashboard', '/dashboard/rendimiento', '/dashboard/domicilios']) {
      expect(esPantallaDeTodaLaMarca(ruta)).toBe(false)
      expect(esPantallaConSuPropiaSede(ruta)).toBe(false)
    }
    expect(esPantallaDeTodaLaMarca('/dashboard/conexiones/whatsapp/callback')).toBe(true)
    expect(esPantallaDeTodaLaMarca('/dashboard/marcados')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. Los modos del panel y la página de Métricas
// ═══════════════════════════════════════════════════════════════

describe('el panel: arriba la sede, abajo la marca; ningún total de la marca disfrazado', () => {
  it('modoDelPanel: una sede → como siempre; toda la marca; una sede elegida con su nombre', () => {
    expect(modoDelPanel(unaSede())).toEqual({ modo: 'una-sede' })
    expect(modoDelPanel(null)).toEqual({ modo: 'una-sede' })
    expect(modoDelPanel(vista())).toEqual({ modo: 'toda-la-marca', sedes: 2 })
    expect(modoDelPanel(vista({ selection: 'one', selectedLocationId: LAU }))).toEqual({
      modo: 'sede',
      nombre: 'Tepuy Laureles',
      varias: false,
      sedes: 2,
    })
    const admin = vista({ role: 'location', canSeeAll: false, locations: [sedesTepuy[1]] })
    expect(modoDelPanel(admin)).toMatchObject({ modo: 'sede', nombre: 'Tepuy Laureles' })
  })

  it('con Envigado elegido: «Clientes de esta sede» es 23 (no 40), y lo de la marca va bajo «De toda la marca»', () => {
    h.view = vista({ selection: 'one', selectedLocationId: ENV })
    h.selection = ENV
    h.analitica = { data: analiticaTepuy(true), loading: false, error: null }
    const s = html(createElement(DashboardPage))
    expect(s).toMatch(/>23<\/p>[\s\S]{0,300}Clientes de esta sede/)
    expect(s).not.toMatch(/>40<\/p>[\s\S]{0,300}Clientes de esta sede/)
    expect(s).not.toContain('Total Clientes')
    expect(s).toContain('Vinieron a esta sede')
    expect(s).toContain('Un cliente que va a las dos sedes cuenta en las dos.')
    expect(s).toContain('De toda la marca')
    expect(s).toContain('Lo ven y lo usan las 2 sedes')
    // Las tarjetas de la marca llevan su etiqueta.
    expect((s.match(/data-alcance="marca"/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(s.indexOf('Tepuy Envigado')).toBeLessThan(s.indexOf('De toda la marca'))
  })

  it('con «toda la marca»: los totales (40) y debajo «Tus sedes» con Envigado y Laureles', () => {
    h.view = vista()
    h.analitica = { data: analiticaTepuy(false), loading: false, error: null }
    const s = html(createElement(DashboardPage))
    expect(s).toContain('Toda la marca')
    expect(s).toContain('Las 2 sedes juntas')
    expect(s).toMatch(/>40<\/p>[\s\S]{0,300}Total Clientes/)
    expect(s).toContain('Tus sedes')
    expect(s).toContain('Tepuy Envigado')
    expect(s).toContain('Tepuy Laureles')
    expect(s).toContain('1 cliente va a las dos sedes')
  })

  it('marca de una sede: el panel de siempre, sin una etiqueta ni un título nuevo', () => {
    h.view = unaSede()
    h.analitica = { data: { ...analiticaTepuy(false), sedes: null }, loading: false, error: null }
    const s = html(createElement(DashboardPage))
    expect(s).toContain('Total Clientes')
    for (const nuevo of ['Toda la marca', 'Tus sedes', 'De toda la marca', 'data-alcance', 'Clientes de esta sede', 'Vinieron']) {
      expect(s).not.toContain(nuevo)
    }
  })

  it('un fallo de lectura se DICE: sin datos no se dibuja ni un «0 clientes»', () => {
    h.view = vista({ selection: 'one', selectedLocationId: LAU })
    h.selection = LAU
    h.analitica = { data: null, loading: false, error: 'Error cargando analytics' }
    const s = html(createElement(DashboardPage))
    expect(s).toContain('No pudimos leer tus métricas')
    expect(s).not.toContain('Clientes de esta sede')
    expect(s).not.toContain('Total Clientes')
    // Y con una sede de una marca de una sede, igual.
    h.view = unaSede()
    h.selection = 'all'
    const t = html(createElement(DashboardPage))
    expect(t).toContain('No pudimos leer tus métricas')
    expect(t).not.toContain('Total Clientes')
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. MetricsCards, con y sin sede
// ═══════════════════════════════════════════════════════════════

describe('MetricsCards: con una sede, cada tarjeta dice de dónde sale', () => {
  const resumen = { ...resumenDe({ totalCustomers: 17 }), visitsToday: 2, deliveriesToday: 0, qrToday: 2, visitorsLast30d: 17 }

  it('con sede: «Clientes de esta sede», «Se registraron aquí», «En esta sede» y la franja de «Vinieron»', () => {
    const s = html(createElement(MetricsCards, { summary: resumen, loading: false, sede: { varias: false, sedesDeLaMarca: 2 } }))
    expect(s).toContain('Clientes de esta sede')
    expect(s).toContain('Se registraron aquí · 6 esta semana')
    expect(s).toContain('En esta sede')
    expect(s).toContain('Vinieron a esta sede')
    expect(s).not.toContain('Total Clientes')
  })

  it('sin sede: la fila de siempre, sin una letra de cambio', () => {
    const s = html(createElement(MetricsCards, { summary: resumen, loading: false }))
    expect(s).toContain('Total Clientes')
    for (const nuevo of ['esta sede', 'registraron', 'Vinieron']) expect(s).not.toContain(nuevo)
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. «Tus sedes»
// ═══════════════════════════════════════════════════════════════

describe('«Tus sedes»: una tarjeta por sede, quién va a las dos, la fila «sin sede» solo si hay', () => {
  it('Tepuy hoy: 23 y 17, «1 cliente va a las dos sedes», sin fila «Sin sede»', () => {
    const s = html(createElement(TusSedes, { resumen: resumenTepuy(), loading: false }))
    expect(s).toMatch(/Tepuy Envigado[\s\S]*>23<[\s\S]*Clientes que trajo/)
    expect(s).toMatch(/Tepuy Laureles[\s\S]*>17<[\s\S]*Clientes que trajo/)
    expect(s).toContain('1 cliente va a las dos sedes')
    expect(s).toContain('Premios entregados · 30 días')
    expect(s).toContain('Visitas por día, cada sede')
    expect(s).not.toContain('Sin sede')
    expect(s).not.toMatch(/#[0-9a-fA-F]{6}/) // ningún hex: los colores son de la marca
  })

  it('con datos sin sede: su fila, con la frase que dice qué es (no se reparte)', () => {
    const conSinSede = resumenTepuy({
      sinSede: { locationId: null, nombre: 'Sin sede', activa: true, clientesQueTrajo: 40, clientesQueTrajoEsteMes: 0, clientesQueVinieron: 2, visitas: 5, premiosEntregados: 1 },
    })
    const s = html(createElement(TusSedes, { resumen: conSinSede, loading: false }))
    expect(s).toContain('Sin sede')
    expect(s).toContain('40 clientes se registraron antes de tener dos sedes, o por el enlace general de la marca.')
    expect(s).toContain('No se reparte entre las sedes: se muestra aparte.')
  })

  it('las frases: ninguno, uno, varios; dos sedes o más', () => {
    expect(lineaVanAVarias(0, 2)).toBe('Ningún cliente vino a las dos sedes en estos 30 días.')
    expect(lineaVanAVarias(1, 2)).toBe('1 cliente va a las dos sedes: en estos 30 días vino a las dos y cuenta en cada tarjeta. No se reparte.')
    expect(lineaVanAVarias(3, 4)).toContain('3 clientes van a más de una sede')
    expect(explicacionSinSede({ clientesQueTrajo: 0, visitas: 1, premiosEntregados: 0 }, 2)[0]).toContain('1 visita de estos 30 días no dice en qué sede fue')
  })

  it('el gráfico: una línea por sede con colores de la marca; con más de cuatro sedes, «Otras N sedes»', () => {
    const g = graficoDeSedes(resumenTepuy())
    expect(g.series.map((x) => x.nombre)).toEqual(['Tepuy Envigado', 'Tepuy Laureles'])
    expect(g.series.every((x) => x.color.startsWith('var(--brand-'))).toBe(true)
    const doce = resumenTepuy({
      sedes: Array.from({ length: 12 }, (_, i) => ({
        locationId: `sede-${i}`, nombre: `Sede ${i}`, activa: true, clientesQueTrajo: 1, clientesQueTrajoEsteMes: 0, clientesQueVinieron: 1, visitas: 1, premiosEntregados: 0,
      })),
      visitasPorDia: [{ date: '2026-10-01', porSede: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`sede-${i}`, 1])) }],
    })
    const g12 = graficoDeSedes(doce)
    expect(g12.series.map((x) => x.nombre)).toEqual(['Sede 0', 'Sede 1', 'Sede 2', 'Otras 9 sedes'])
    expect(g12.filas[0].otras_sedes).toBe(9)
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. resumirSedes (puro): partición, sedes cerradas, «sin sede»
// ═══════════════════════════════════════════════════════════════

describe('resumirSedes: los números de «Tus sedes»', () => {
  const dias30 = ['2026-10-13', '2026-10-14']
  const base = {
    sedes: [
      { id: 'a', name: 'A', is_active: true },
      { id: 'b', name: 'B', is_active: true },
      { id: 'c', name: 'C (cerrada, con historia)', is_active: false },
      { id: 'd', name: 'D (cerrada, sin nada)', is_active: false },
    ],
    dias30,
    mesActual: '2026-10',
  }

  it('cada cliente en una sola sede (o en «sin sede»); una sede cerrada con datos sale, una vacía no', () => {
    const r = resumirSedes({
      ...base,
      clientes: [
        { origin_location_id: 'a', created_at: '2026-10-14T10:00:00+00:00' },
        { origin_location_id: 'a', created_at: '2026-08-01T10:00:00+00:00' },
        { origin_location_id: 'c', created_at: '2026-01-01T10:00:00+00:00' },
        { origin_location_id: null, created_at: '2026-10-02T10:00:00+00:00' },
      ],
      visitas30d: [
        { customer_id: 'x', location_id: 'a', created_at: '2026-10-14T12:00:00+00:00' },
        { customer_id: 'x', location_id: 'b', created_at: '2026-10-13T12:00:00+00:00' },
        { customer_id: 'y', location_id: 'b', created_at: '2026-10-13T13:00:00+00:00' },
      ],
      premios30d: [{ redeemed_location_id: 'b' }, { redeemed_location_id: null }],
    })
    expect(r.sedes.map((s) => s.locationId)).toEqual(['a', 'b', 'c'])
    expect(r.sedes[0]).toMatchObject({ clientesQueTrajo: 2, clientesQueTrajoEsteMes: 1, clientesQueVinieron: 1, visitas: 1 })
    expect(r.sedes[1]).toMatchObject({ clientesQueTrajo: 0, clientesQueVinieron: 2, visitas: 2, premiosEntregados: 1 })
    expect(r.sedes[2]).toMatchObject({ activa: false, clientesQueTrajo: 1 })
    expect(r.sinSede).toMatchObject({ clientesQueTrajo: 1, premiosEntregados: 1, visitas: 0 })
    expect(r.clientesEnVariasSedes).toBe(1)
    // Sin visitas sin sede, el gráfico no lleva su línea.
    expect(Object.keys(r.visitasPorDia[1].porSede).sort()).toEqual(['a', 'b', 'c'])
    expect(r.visitasPorDia.find((d) => d.date === '2026-10-13')!.porSede.b).toBe(2)
  })

  it('sin nada sin sede, `sinSede` es null', () => {
    const r = resumirSedes({ ...base, clientes: [{ origin_location_id: 'a', created_at: '2026-10-14T10:00:00+00:00' }], visitas30d: [], premios30d: [] })
    expect(r.sinSede).toBeNull()
    expect(r.sedes.map((s) => s.locationId)).toEqual(['a', 'b'])
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. La franja y el número compartido
// ═══════════════════════════════════════════════════════════════

describe('lo que es de toda la marca, dicho', () => {
  it('la franja: «Esto es de toda la marca: lo ven y lo usan las 2 sedes.»', () => {
    expect(html(createElement(VistaFranjaTodaLaMarca, { sedes: 2 }))).toContain('Esto es de toda la marca: lo ven y lo usan las 2 sedes.')
  })

  it('el número compartido, con el número y el proveedor; sin lectura, sin inventar un número', () => {
    expect(lineaNumeroCompartido({ sedes: 2, telefono: '+576042011012', proveedor: 'zernio' })).toBe(
      'Las dos sedes comparten el WhatsApp +57 604 201 1012 (Zernio). Un número propio para cada sede: próximamente.'
    )
    expect(lineaNumeroCompartido({ sedes: 3, telefono: 'whatsapp:+573009033799', proveedor: 'twilio' })).toBe(
      'Las 3 sedes comparten el WhatsApp +57 300 903 3799 (Twilio). Un número propio para cada sede: próximamente.'
    )
    const sinLectura = html(createElement(VistaNumeroCompartido, { sedes: 2, telefono: null, proveedor: null }))
    expect(sinLectura).toContain('Las dos sedes comparten el WhatsApp de la marca.')
    expect(sinLectura).not.toMatch(/\+57/)
  })
})
