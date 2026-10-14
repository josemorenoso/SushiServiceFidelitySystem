/**
 * Arreglos chicos del 15-10, grupo 4 · Textos que dejaron de ser verdad
 * (`docs/prompts/2026-10-15-arreglos-chicos.md`).
 *
 *   · S-1.7: el recordatorio de premio decía «encendido en Ajustes» (vive en Recompensas › Premios
 *     para regalar desde S-1) y el calibrador de puntos mandaba a «Ajustes → Premios» (los niveles
 *     están en Recompensas › Niveles y premios).
 *   · N-CATALOGO-1B: «Regalo que vence» decía «Todavía no se envía» y su comentario «hasta entonces
 *     nadie la envía»; desde la 1B la manda el ciclo y desde la parte C «Mandar un regalo».
 *   · SEDE-AJUSTES: con 2+ sedes, Ajustes › Ubicación del Local mostraba la sede principal sin decir
 *     cuál; ahora manda a Mis sedes.
 *   · El aviso amarillo de Plantillas decía «tus clientes siguen recibiendo los mensajes actuales»
 *     también en una marca sin ninguno aprobado (Tepuy, 14-10).
 *
 * Los componentes se dibujan de verdad a HTML (`renderToStaticMarkup`, sin navegador), como en
 * `cycle-pantalla-b-render.test.ts`. Ningún cuerpo de plantilla ni variable cambia: el contrato
 * `{{n}}` lo fija `template-catalog.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TEMPLATE_CATALOG_BY_KEY } from '@/constants/template-catalog'
import { PointsCalibrator } from '@/components/dashboard/PointsCalibrator'
import { avisoDeRevision } from '@/lib/aviso-de-revision'
import type { LocationScopeView } from '@/lib/location-scope-shared'

const h = vi.hoisted(() => ({ view: null as null | Partial<LocationScopeView> }))
vi.mock('@/contexts/LocationScopeContext', () => ({ useLocationScope: () => ({ view: h.view }) }))

const RAIZ = join(__dirname, '..', '..')
const fuente = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8')

describe('S-1.7 y N-CATALOGO-1B: el catálogo de plantillas dice dónde y cuándo de verdad', () => {
  it('el recordatorio de premio se enciende en Recompensas › Premios para regalar, no en Ajustes', () => {
    const t = TEMPLATE_CATALOG_BY_KEY.reward_reminder.whenSent
    expect(t).toContain('Recompensas › Premios para regalar')
    expect(t).not.toContain('Ajustes')
  })

  it('«Regalo que vence» ya se envía: «Mandar un regalo» y el ciclo encendido, con el adaptador a la insistente', () => {
    const t = TEMPLATE_CATALOG_BY_KEY.gift_expiring.whenSent
    expect(t).not.toMatch(/Todavía no se envía/)
    expect(t).toContain('«Mandar un regalo»')
    expect(t).toContain('ciclo de recuperación encendido')
    expect(t).toContain('«Reactivación insistente»')
    expect(fuente('src/constants/template-catalog.ts')).not.toContain('// Hasta entonces nadie la envía')
  })

  it('el contrato de «Regalo que vence» no se tocó (cuatro variables, en su orden)', () => {
    expect(TEMPLATE_CATALOG_BY_KEY.gift_expiring.variables.map((v) => v.index)).toEqual([1, 2, 3, 4])
  })
})

describe('S-1.7: el calibrador de puntos manda a Recompensas › Niveles y premios', () => {
  const config = { visitMin: 60, visitMax: 90, welcomeMin: 75, welcomeMax: 90, shortfallMin: 5, shortfallMax: 30 }

  it('sin premios todavía: el enlace va a la pestaña de niveles', () => {
    const html = renderToStaticMarkup(createElement(PointsCalibrator, { threshold: null, config, onChange: () => {} }))
    expect(html).toContain('href="/dashboard/rewards?tab=niveles"')
    expect(html).toContain('Recompensas › Niveles y premios')
    expect(html).not.toContain('Ajustes → Premios')
  })

  it('en lo que se dibuja ya no queda «Ajustes → Premios» (el comentario que lo cuenta, sí)', () => {
    expect(fuente('src/components/dashboard/PointsCalibrator.tsx')).not.toContain('<strong>Ajustes → Premios</strong>')
  })
})

describe('SEDE-AJUSTES: con 2+ sedes, «Ubicación del Local» manda a Mis sedes', () => {
  async function ajustes(view: Partial<LocationScopeView> | null): Promise<string> {
    h.view = view
    const { default: SettingsPage } = await import('@/app/(dashboard)/dashboard/settings/page')
    return renderToStaticMarkup(createElement(SettingsPage))
  }

  it('Tepuy (2 sedes): lo dice y lleva a /dashboard/sedes; no muestra la principal bajo «Próximamente»', async () => {
    const html = await ajustes({ multiSede: true, brandLocationCount: 2 })
    expect(html).toContain('Tu marca tiene <strong>2 sedes</strong>')
    expect(html).toContain('href="/dashboard/sedes"')
    expect(html).not.toContain('Próximamente')
  })

  it('una marca de una sede, igual que antes', async () => {
    const html = await ajustes({ multiSede: false, brandLocationCount: 1 })
    expect(html).toContain('Próximamente')
    expect(html).not.toContain('href="/dashboard/sedes"')
  })
})

describe('Plantillas: el aviso amarillo dice la verdad en los dos casos', () => {
  it('Tepuy: ninguno aprobado todavía → esos mensajes NO les llegan', () => {
    expect(avisoDeRevision({ enRevision: 16, conVersionAprobada: 0 })).toEqual({
      resumen: 'WhatsApp está revisando 16 mensajes. Suele tardar entre 1 y 3 días.',
      mientrasTanto: 'Mientras tanto esos mensajes no les llegan a tus clientes: tu negocio todavía no tiene una versión aprobada de ellos.',
    })
  })

  it('un cambio a un mensaje que ya salía → siguen recibiendo la versión aprobada', () => {
    expect(avisoDeRevision({ enRevision: 1, conVersionAprobada: 1 })?.mientrasTanto).toBe(
      'Mientras tanto tus clientes siguen recibiendo la versión aprobada de ese mensaje.'
    )
  })

  it('mezclado: cuenta cuáles siguen saliendo y cuáles no', () => {
    expect(avisoDeRevision({ enRevision: 3, conVersionAprobada: 2 })?.mientrasTanto).toBe(
      'Mientras tanto, 2 siguen saliendo con su versión aprobada; el otro no sale hasta que WhatsApp lo apruebe.'
    )
    expect(avisoDeRevision({ enRevision: 4, conVersionAprobada: 1 })?.mientrasTanto).toBe(
      'Mientras tanto, 1 sigue saliendo con su versión aprobada; los otros 3 no salen hasta que WhatsApp los apruebe.'
    )
  })

  it('nada en revisión → no hay aviso', () => {
    expect(avisoDeRevision({ enRevision: 0, conVersionAprobada: 0 })).toBeNull()
  })

  it('la pantalla usa el aviso y ya no promete «los mensajes actuales»; en Twilio no cuenta versiones aprobadas', () => {
    const src = fuente('src/components/dashboard/templates/TemplateCatalogEditor.tsx')
    expect(src).not.toContain('siguen recibiendo los mensajes actuales')
    expect(src).toMatch(/avisoDeRevision\(\{/)
    expect(src).toMatch(/conVersionAprobada: provider === 'twilio' \? 0 :/)
  })
})
