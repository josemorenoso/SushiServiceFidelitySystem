/**
 * Recompensas en un solo lugar (S-1, 2026-10-13) — la lógica de los selectores y dónde vive cada premio.
 *
 * Los premios vivían en cuatro lugares: Recompensas, Campañas › Premios, Ajustes (la reactivación
 * insistente y la reseña) y el texto libre de cada invitación. Ahora el catálogo y los selectores
 * «para qué se usa cada premio» viven en Recompensas › Premios para regalar.
 *
 * Qué se fija acá:
 *   1. La lógica PURA de los selectores (`src/lib/premios-para-regalar.ts`): qué dice uno cuyo
 *      premio ya no está activo, cómo se reescribe la lista del regalo pequeño (con el MISMO
 *      analizador que el ciclo) y cómo se dice cuánto dura un premio.
 *   2. Que el selector «Regalo fuerte» escribe `aggressive_reward_id` y que el ciclo lo usa como
 *      fuerte mientras `cycle_strong_reward_id` esté vacío: UNA sola elección para los dos caminos.
 *   3. Dónde vive cada cosa, leyendo el código de las pantallas (ningún test importa páginas ni
 *      componentes: arrastrarían React y `next/*`): la pestaña ya no está en Campañas, los dos
 *      bloques ya no están en Ajustes, y los enlaces viejos llevan a Recompensas.
 *
 * Los permisos del catálogo y el fallo de base van en `campaign-rewards-permisos.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  AVISO_PREMIO_NO_DISPONIBLE,
  cicloTieneFuerteAparte,
  conPrimerRegaloPequeno,
  estadoDelSelector,
  idsDeLista,
  textoDeVigencia,
  ventanaEnDias,
  type PremioDelCatalogo,
} from '@/lib/premios-para-regalar'
import { normalizeCycleSettings } from '@/lib/cycle-engine'
import { CLAVES_ESCRIBIBLES } from '@/lib/settings-keys'

const RAIZ = path.resolve(import.meta.dirname, '../..')
const fuente = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8')

const CATALOGO: PremioDelCatalogo[] = [
  { id: 'a', title: '1/2 sushi gratis', is_active: true },
  { id: 'b', title: 'Postre cortesía', is_active: true },
  { id: 'c', title: 'Promo vieja', is_active: false },
]

// ═══════════════════════════════════════════════════════════════
// 1 · Qué dice un selector
// ═══════════════════════════════════════════════════════════════

describe('estadoDelSelector — un premio que ya no sirve se DICE, no se muestra vacío', () => {
  it('sin nada guardado: sin premio (una decisión válida)', () => {
    expect(estadoDelSelector('', CATALOGO)).toEqual({ tipo: 'sin_premio' })
    expect(estadoDelSelector(null, CATALOGO)).toEqual({ tipo: 'sin_premio' })
    expect(estadoDelSelector('   ', CATALOGO)).toEqual({ tipo: 'sin_premio' })
  })

  it('un premio activo del catálogo: activo', () => {
    expect(estadoDelSelector('a', CATALOGO)).toEqual({ tipo: 'activo', premio: CATALOGO[0] })
  })

  it('un premio RETIRADO: no disponible (no «sin premio»)', () => {
    expect(estadoDelSelector('c', CATALOGO)).toEqual({ tipo: 'no_disponible', id: 'c' })
  })

  it('un id que no está en el catálogo de la marca (borrado, o de otra marca): no disponible', () => {
    expect(estadoDelSelector('de-otra-marca', CATALOGO)).toEqual({ tipo: 'no_disponible', id: 'de-otra-marca' })
  })

  it('con el catálogo vacío, un id guardado sigue siendo «no disponible», no «sin premio»', () => {
    expect(estadoDelSelector('a', [])).toEqual({ tipo: 'no_disponible', id: 'a' })
  })

  it('el aviso dice lo que pidió el dueño', () => {
    expect(AVISO_PREMIO_NO_DISPONIBLE).toBe('Este premio ya no está activo: elige otro.')
  })
})

// ═══════════════════════════════════════════════════════════════
// 2 · La lista del regalo pequeño
// ═══════════════════════════════════════════════════════════════

describe('idsDeLista — lee `cycle_small_reward_ids` igual que el ciclo', () => {
  const casos = ['', '   ', 'a', 'a,b', ' a , b ,, c', '["a","b"]', '[ "a" , "b" ]', '[roto', '[]', 'a;b']

  it.each(casos)('%j da lo mismo que normalizeCycleSettings()', (valor) => {
    const delCiclo = normalizeCycleSettings({ cycle_small_reward_ids: valor }, { totalClientes: 1 }).smallRewardIds
    expect(idsDeLista(valor)).toEqual(delCiclo)
  })

  it('null y undefined son lista vacía', () => {
    expect(idsDeLista(null)).toEqual([])
    expect(idsDeLista(undefined)).toEqual([])
  })
})

describe('conPrimerRegaloPequeno — el selector edita solo el primero', () => {
  /** Lo que el ciclo entendería de lo que escribe el selector. */
  const comoLoLeeElCiclo = (v: string) => normalizeCycleSettings({ cycle_small_reward_ids: v }, { totalClientes: 1 }).smallRewardIds

  it('sin nada guardado, elegir un premio deja una lista de uno', () => {
    expect(conPrimerRegaloPequeno('', 'a')).toBe('a')
    expect(conPrimerRegaloPequeno(undefined, 'a')).toBe('a')
    expect(comoLoLeeElCiclo(conPrimerRegaloPequeno('', 'a'))).toEqual(['a'])
  })

  it('cambia el primero y conserva el resto (puesto a mano), sin repetir', () => {
    expect(conPrimerRegaloPequeno('a,b', 'c')).toBe('c,b')
    expect(conPrimerRegaloPequeno('a,b', 'b')).toBe('b')
    expect(conPrimerRegaloPequeno('["a","b","c"]', 'z')).toBe('z,b,c')
    expect(comoLoLeeElCiclo(conPrimerRegaloPequeno('["a","b","c"]', 'z'))).toEqual(['z', 'b', 'c'])
  })

  it('«sin regalo pequeño» vacía la lista ENTERA: dejar el segundo lo volvería «el pequeño» sin que nadie lo eligiera', () => {
    expect(conPrimerRegaloPequeno('a,b', '')).toBe('')
    expect(comoLoLeeElCiclo(conPrimerRegaloPequeno('a,b', ''))).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// 3 · Cuánto dura un premio
// ═══════════════════════════════════════════════════════════════

describe('textoDeVigencia — C2: «temporal» es la ventana de reclamo que ya existe', () => {
  it('a los N días', () => {
    expect(textoDeVigencia({ dias: 7 })).toBe('vence a los 7 días')
    expect(textoDeVigencia({ dias: 30 })).toBe('vence a los 30 días')
  })
  it('un solo día no dice «1 días»', () => {
    expect(textoDeVigencia({ dias: 1 })).toBe('vence al día siguiente')
  })
  it('en el ciclo de recuperación vence el domingo', () => {
    expect(textoDeVigencia('domingo')).toBe('vence el domingo')
  })
})

describe('ventanaEnDias', () => {
  it('acepta enteros de 1 en adelante', () => {
    expect(ventanaEnDias('7')).toBe(7)
    expect(ventanaEnDias(' 30 ')).toBe(30)
  })
  it('rechaza vacío, cero, negativos y texto', () => {
    for (const malo of ['', '0', '-3', 'abc', null, undefined]) expect(ventanaEnDias(malo)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 4 · «Regalo fuerte»: una sola elección para los dos caminos
// ═══════════════════════════════════════════════════════════════

describe('Regalo fuerte — `aggressive_reward_id` es el del rescate mientras `cycle_strong_reward_id` esté vacío', () => {
  it('el selector escribe `aggressive_reward_id` (y su ventana)', () => {
    const src = fuente('src/components/dashboard/RewardUsageSelectors.tsx')
    expect(src).toMatch(/saveSetting\('aggressive_reward_id', fuerteId\)/)
    expect(src).toMatch(/saveSetting\('aggressive_reward_window_days'/)
  })

  it('el ciclo usa ese mismo premio como fuerte cuando el propio está vacío', () => {
    const ajustes = normalizeCycleSettings({ aggressive_reward_id: 'a', cycle_strong_reward_id: '' }, { totalClientes: 1 })
    expect(ajustes.strongRewardId).toBe('a')
    expect(normalizeCycleSettings({ aggressive_reward_id: 'a' }, { totalClientes: 1 }).strongRewardId).toBe('a')
  })

  it('el propio del ciclo, si está puesto, manda — y la pantalla lo avisa', () => {
    const crudo = { aggressive_reward_id: 'a', cycle_strong_reward_id: 'b' }
    expect(normalizeCycleSettings(crudo, { totalClientes: 1 }).strongRewardId).toBe('b')
    expect(cicloTieneFuerteAparte(crudo)).toBe(true)
  })

  it('sin uno propio, o igual al del selector, no hay nada que avisar', () => {
    expect(cicloTieneFuerteAparte({ aggressive_reward_id: 'a' })).toBe(false)
    expect(cicloTieneFuerteAparte({ aggressive_reward_id: 'a', cycle_strong_reward_id: '' })).toBe(false)
    expect(cicloTieneFuerteAparte({ aggressive_reward_id: 'a', cycle_strong_reward_id: 'a' })).toBe(false)
  })
})

describe('las claves que escriben los selectores están en la lista cerrada del PUT', () => {
  it('todas las que manda `RewardUsageSelectors`', () => {
    const src = fuente('src/components/dashboard/RewardUsageSelectors.tsx')
    const claves = [...src.matchAll(/saveSetting\(\s*'([a-z0-9_]+)'/g)].map((m) => m[1])
    expect(claves.sort()).toEqual(
      [
        'aggressive_reward_id',
        'aggressive_reward_window_days',
        'cycle_small_reward_ids',
        'review_reward_id',
        'review_reward_window_days',
        'reward_reminder_days_before',
        'reward_reminder_enabled',
      ].sort()
    )
    for (const c of claves) expect(CLAVES_ESCRIBIBLES.has(c), c).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// 5 · Dónde vive cada cosa (A7, C1)
// ═══════════════════════════════════════════════════════════════

describe('A7 — «Premios» sale de Campañas y va a Recompensas', () => {
  it('Recompensas tiene la pestaña `premios` y renderiza el panel nuevo', () => {
    const src = fuente('src/app/(dashboard)/dashboard/rewards/page.tsx')
    expect(src).toMatch(/new Set\(\[[^\]]*'premios'[^\]]*\]\)/)
    expect(src).toContain('<TabsTrigger value="premios">Premios para regalar</TabsTrigger>')
    expect(src).toContain('<PremiosParaRegalarPanel />')
  })

  it('Recompensas lee la pestaña con useSyncExternalStore, nunca con useSearchParams()', () => {
    const src = fuente('src/app/(dashboard)/dashboard/rewards/page.tsx')
    expect(src).toContain('useSyncExternalStore')
    // Se mira el import, no la palabra: el comentario de la página explica por qué no se usa.
    expect(src).not.toMatch(/import[^\n]*useSearchParams/)
  })

  it('Campañas ya no tiene la pestaña ni importa el catálogo', () => {
    const src = fuente('src/app/(dashboard)/dashboard/campaigns/page.tsx')
    expect(src).not.toContain('CampaignRewardsCatalog')
    expect(src).not.toMatch(/<TabsTrigger value="premios"/)
    expect(src).not.toMatch(/<TabsContent value="premios"/)
  })

  it('`/dashboard/campaigns?tab=premios` sigue sirviendo: lleva a Recompensas', () => {
    const src = fuente('src/app/(dashboard)/dashboard/campaigns/page.tsx')
    expect(src).toMatch(/tab === 'premios'[\s\S]{0,80}window\.location\.replace\('\/dashboard\/rewards\?tab=premios'\)/)
  })

  it('`/dashboard/campaign-rewards` redirige a Recompensas', () => {
    const src = fuente('src/app/(dashboard)/dashboard/campaign-rewards/page.tsx')
    expect(src).toContain("redirect('/dashboard/rewards?tab=premios')")
  })
})

describe('C1 — Recompensas absorbe los premios que estaban en Ajustes', () => {
  const ajustes = () => fuente('src/app/(dashboard)/dashboard/settings/page.tsx')

  it('Ajustes ya no escribe el premio de la reactivación, el de la reseña ni el recordatorio', () => {
    const src = ajustes()
    for (const clave of [
      'aggressive_reward_id',
      'aggressive_reward_window_days',
      'review_reward_id',
      'review_reward_window_days',
      'reward_reminder_enabled',
      'reward_reminder_days_before',
    ]) {
      expect(src, clave).not.toMatch(new RegExp(`saveSetting\\(\\s*'${clave}'`))
    }
  })

  it('Ajustes ya no lee el catálogo ni tiene el bloque «Premio de Reactivación Agresiva»', () => {
    const src = ajustes()
    expect(src).not.toContain('/api/dashboard/campaign-rewards')
    expect(src).not.toContain('>Premio de Reactivación Agresiva</h2>')
  })

  it('Ajustes deja una tarjeta que lleva a Recompensas', () => {
    expect(ajustes()).toContain('href="/dashboard/rewards?tab=premios"')
  })

  it('lo que C1 dice «después» NO se movió: puntos, Black, ticket promedio, check-in y el link de reseñas siguen en Ajustes', () => {
    const src = ajustes()
    for (const clave of ['avg_ticket', 'black_benefits', 'points_system_enabled', 'checkin_mode', 'reactivation_soft_days']) {
      expect(src, clave).toMatch(new RegExp(`saveSetting\\(\\s*'${clave}'`))
    }
    expect(src).toContain("google_maps_url")
  })
})

describe('Un administrador de sede no ve botones que van a responder 403', () => {
  it('el catálogo oculta «Nuevo premio» y «Retirar» con `soloLectura`', () => {
    const src = fuente('src/components/dashboard/CampaignRewardsCatalog.tsx')
    expect(src).toMatch(/soloLectura \? \(/)
    expect(src).toMatch(/\{!soloLectura && \(\s*<Button/)
  })

  it('los selectores se desactivan y no ofrecen «Guardar» con `soloLectura`', () => {
    const src = fuente('src/components/dashboard/RewardUsageSelectors.tsx')
    expect(src).toMatch(/\{!soloLectura && \(\s*<Button onClick=\{onGuardar\}/)
    expect(src.match(/disabled=\{soloLectura\}/g)?.length).toBeGreaterThanOrEqual(5)
  })

  it('el panel decide `soloLectura` con el mismo `role` que ya usa la pantalla de niveles', () => {
    const src = fuente('src/components/dashboard/PremiosParaRegalarPanel.tsx')
    expect(src).toMatch(/\/api\/dashboard\/locations/)
    expect(src).toMatch(/role === 'location'/)
  })
})

describe('Un fallo de base no se muestra como «sin premio»', () => {
  it('si no se pudo leer el catálogo o los ajustes, el panel no dibuja los selectores', () => {
    const src = fuente('src/components/dashboard/PremiosParaRegalarPanel.tsx')
    expect(src).toMatch(/rewardsError \|\| ajustesError/)
    expect(src).toMatch(/No se pudo leer/)
  })

  it('el catálogo dice que no pudo leer en vez de «Todavía no hay premios»', () => {
    const src = fuente('src/components/dashboard/CampaignRewardsCatalog.tsx')
    expect(src).toMatch(/loadError \? \(/)
    expect(src).toMatch(/No se pudo leer el catálogo/)
  })
})

// ═══════════════════════════════════════════════════════════════
// 6 · C3 — las invitaciones eligen del catálogo, sin migración
// ═══════════════════════════════════════════════════════════════

describe('C3 — el premio de una invitación se elige del catálogo (o se escribe libre)', () => {
  const panel = () => fuente('src/components/dashboard/InviteCampaignsPanel.tsx')

  it('lee el catálogo de premios ACTIVOS y deja escribir uno libre', () => {
    const src = panel()
    expect(src).toContain("/api/dashboard/campaign-rewards?active=true")
    expect(src).toContain('— Escribir uno libre —')
  })

  it('elegir del catálogo llena el título; la invitación sigue mandando `reward_title` (no hay id nuevo)', () => {
    const src = panel()
    expect(src).toMatch(/if \(premio\) setRewardTitle\(premio\.title\)/)
    expect(src).toMatch(/reward_title: rewardTitle\.trim\(\)/)
    expect(src).not.toMatch(/campaign_reward_id/)
  })

  it('no hay migración: `qr_campaigns` no gana columna y el otorgamiento sigue guardando el título', () => {
    const servicio = fuente('src/services/qr-campaign.service.ts')
    expect(servicio).toMatch(/prizeTitle: c\.reward_title/)
    expect(servicio).not.toMatch(/campaign_reward_id|campaignRewardId/)
  })
})
