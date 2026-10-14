/**
 * La pantalla «Ciclo» DIBUJADA (fase 2 parte B, 2026-10-14) — los componentes reales, a HTML.
 *
 * Sin navegador: `renderToStaticMarkup` sobre las vistas que solo dibujan un estado
 * (`VistaDelCiclo`, `VistaDelMiniCiclo`, y los componentes de cada sección). Lo que se fija:
 *
 *   · **Un error NUNCA se dibuja como ceros.** Con la lectura fallada la pantalla (y el mini-ciclo
 *     del panel) dicen «no pudimos leer» y no muestran ni un dígito: fue el incidente del 04-10.
 *   · Quién ve qué: el dueño ve el estado del ciclo pero no el botón de encenderlo (solo el
 *     operador de Cada1); «Hoy no» solo con permiso de marca.
 *   · Las seis cajas + Dormidos, partidas en nuevos / ya volvieron, con «hoy entran» (mockup).
 *   · Lo que se RETIRA (spec §6.7, §7.6) ya no está en Campañas ni en el panel, y lo que se
 *     conserva a propósito (las burbujas en la demo pública) sigue ahí.
 *
 * Contra el código anterior: ninguno de los componentes existe, y la página vieja de Campañas
 * tenía `AtRiskBubbles`, las tarjetas «Automáticas» y la tira de 5 cajas.
 */

import { describe, it, expect } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { STAGE_LABELS, type CycleBoxKey } from '@/lib/cycle-engine'
import type { PortadaDelCiclo } from '@/lib/cycle-screen'
import { CajasDelCiclo } from '@/components/dashboard/cycle/CajasDelCiclo'
import { VistaDelCiclo } from '@/components/dashboard/cycle/CicloPantalla'
import { EstadoDelCiclo } from '@/components/dashboard/cycle/EstadoDelCiclo'
import { VistaDelMiniCiclo } from '@/components/dashboard/cycle/MiniCiclo'
import { NumerosDeArriba } from '@/components/dashboard/cycle/NumerosDeArriba'
import { ParaHoy } from '@/components/dashboard/cycle/ParaHoy'
import { PrimerUso } from '@/components/dashboard/cycle/PrimerUso'
import { VerPorDia } from '@/components/dashboard/cycle/VerPorDia'
import type { CajaDelCiclo, RetornoDeEtapa, TarjetaParaHoy } from '@/services/cycle-overview.service'

// ═══════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════

const sinRetorno = (): RetornoDeEtapa => ({
  con_mensaje: { toques: 0, volvieron: 0, pct: null },
  sin_mensaje: { toques: 0, volvieron: 0, pct: null },
})

function caja(key: CycleBoxKey, desde: number, hasta: number | null, total: number, nuevos: number, extra: Partial<CajaDelCiclo> = {}): CajaDelCiclo {
  return {
    key, etiqueta: STAGE_LABELS[key], desde, hasta, total, nuevos, ya_volvieron: total - nuevos, hoy_entran: 0, regalo: null,
    retorno: key === 'reciente' ? null : sinRetorno(), ...extra,
  }
}

function portada(extra: Partial<PortadaDelCiclo> = {}): PortadaDelCiclo {
  return {
    mini: false,
    ciclo: { encendido: true, encendido_desde: '2026-10-13T20:00:04Z', hora: '16:30', grupo_de_control_pct: 10 },
    ritmo: { marca: 'restaurant', etiqueta: 'Cada mes', origen: 'calculado', dias: [14, 28, 42, 60, 80], mediana: 27, regresos: 135, con_ritmo_propio: 41 },
    cajas: [
      caja('reciente', 0, 13, 120, 70, { hoy_entran: 6 }),
      caja('t1', 14, 27, 40, 30),
      caja('t2', 28, 41, 31, 20, { regalo: 'Postre del chef' }),
      caja('t4', 60, 79, 23, 15, {
        regalo: '½ rollo gratis',
        hoy_entran: 2,
        retorno: { con_mensaje: { toques: 40, volvieron: 7, pct: 17.5 }, sin_mensaje: { toques: 5, volvieron: 0, pct: 0 } },
      }),
      caja('t5', 80, null, 9, 4),
    ],
    dormidos: { etiqueta: 'Dormidos', total: 508, nuevos: 315, ya_volvieron: 193, sin_toques_hace_6_meses: 193, hoy_entran: 3, regalo: 'Postre del chef', retorno: sinRetorno() },
    no_reciben_mensajes: 12,
    numeros: {
      en_el_ciclo: 223,
      dormidos: 508,
      volvieron_por_mensaje: { clientes: 31, con_mensaje_pct: 14, sin_mensaje_pct: 6 },
      proximo_evento: { id: 'ev1', titulo: 'Noche de sushi', fecha: '2026-10-17', dias: 3, estado: 'scheduled', invitados: 412, sin_foto: true },
    },
    segunda_visita: { ventana_dias: 60, desde: '2026-05-18', hasta: '2026-08-15', clientes: 210, volvieron: 47, pct: 22.4 },
    primer_uso: {
      regalo_pequeno: { listo: true, titulo: 'Postre del chef', elegido_inactivo: false },
      regalo_fuerte: { listo: false, titulo: null, elegido_inactivo: false },
      plantilla_regalo: { estado: 'pendiente' },
      listos: 1,
      total: 3,
    },
    para_hoy: [],
    por_dia: { conteo: [3, 1, 0, 2, 5], mas_alla: 4 },
    permisos: { aprobar: true, interruptor: false },
    ...extra,
  }
}

const NADA = () => {}
const html = (el: ReactElement) => renderToStaticMarkup(el)
/** El texto que lee una persona: sin etiquetas. */
const texto = (el: ReactElement) => html(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const vista = (estado: Parameters<typeof VistaDelCiclo>[0]['estado'], seleccion = null) =>
  createElement(VistaDelCiclo, { estado, seleccion, onElegir: NADA, onReintentar: NADA, onCambio: NADA })

const tarjetaTrimestral: TarjetaParaHoy = {
  id: 'trimestral', tipo: 'trimestral', texto: '31 dormidos reciben su toque trimestral hoy a las 4:30 pm con Postre del chef.',
  clientes: 31, dias: 0, acciones: ['ok', 'cambiar_regalo', 'hoy_no'], regalo: 'Postre del chef',
}

// ═══════════════════════════════════════════════════════════════
// 1 · LA REGLA DE ORO: un error no se dibuja como ceros
// ═══════════════════════════════════════════════════════════════

describe('un error de lectura NUNCA se muestra como «0 clientes»', () => {
  const mensaje = 'No pudimos leer tu ciclo de recuperación en este momento. Intenta de nuevo en un minuto.'

  it('la pantalla en error dice el mensaje y ofrece reintentar — y no tiene un solo dígito ni una caja', () => {
    const t = texto(vista({ tipo: 'error', mensaje }))
    expect(t).toContain(mensaje)
    expect(t).toContain('Reintentar')
    expect(t).not.toMatch(/\d/)
    for (const caja of ['Recién vino', 'Le recordamos', 'Rescate', 'Despedida', 'Dormidos', 'nuevos', 'ya volvieron']) {
      expect(t).not.toContain(caja)
    }
  })

  it('la pantalla cargando es un esqueleto: ningún número', () => {
    const marcado = html(vista({ tipo: 'cargando' }))
    expect(marcado).toContain('aria-busy="true"')
    expect(texto(vista({ tipo: 'cargando' }))).not.toMatch(/\d/)
  })

  it('el mini-ciclo del panel en error: el mensaje, el enlace y ningún número', () => {
    const el = createElement(VistaDelMiniCiclo, { estado: { tipo: 'error', mensaje }, deToda: false, onReintentar: NADA })
    const t = texto(el)
    expect(t).toContain(mensaje)
    expect(t).toContain('Reintentar')
    expect(t).not.toMatch(/\d/)
    expect(t).not.toContain('Dormidos')
  })

  it('una RELECTURA fallida no borra lo que ya se veía: avisa y conserva las cajas', () => {
    const t = texto(vista({ tipo: 'listo', portada: portada(), aviso: 'No pudimos actualizar el ciclo.' }))
    expect(t).toContain('No pudimos actualizar el ciclo. Lo que ves es lo último que pudimos leer.')
    expect(t).toContain('508')
  })
})

// ═══════════════════════════════════════════════════════════════
// 2 · Las cajas (el prototipo aprobado)
// ═══════════════════════════════════════════════════════════════

describe('las cajas: seis etapas + Dormidos, nuevos contra ya volvieron', () => {
  const dibujo = (seleccion: 'reciente' | 't1' | 't2' | 't3' | 't4' | 't5' | 'dormidos' | null = null) => {
    const p = portada()
    return createElement(CajasDelCiclo, { cajas: p.cajas, dormidos: p.dormidos, seleccion, onElegir: NADA })
  }

  it('cada caja lleva su nombre, su rango, el total y la partición', () => {
    const t = texto(dibujo())
    for (const nombre of ['Recién vino', 'Le recordamos', 'Le regalamos algo', 'Rescate', 'Despedida', 'Dormidos']) {
      expect(t).toContain(nombre)
    }
    expect(t).toContain('día 60–79 sin venir')
    expect(t).toContain('día 80+ sin venir')
    expect(t).toContain('día 0–13')
    expect(t).not.toContain('día 0–13 sin venir') // «Recién vino» no es «sin venir»
    expect(t).toContain('23') // Rescate
    expect(t).toContain('15 nuevos')
    expect(t).toContain('8 ya volvieron')
    expect(t).toContain('508') // Dormidos
    expect(t).toContain('315 nuevos')
    expect(t).toContain('193 ya volvieron')
  })

  it('«hoy entran», el regalo de la etapa y el retorno con y sin mensaje', () => {
    const t = texto(dibujo())
    expect(t).toContain('Hoy entran 2 · 🎁 ½ rollo gratis')
    expect(t).toContain('Volvieron en 2 semanas: 17,5 % · sin mensaje 0 %')
    expect(t).toContain('Hoy entran 0 · sin regalo') // Le recordamos: no lleva regalo
    expect(t).toContain('193 sin toques desde hace más de 6 meses')
  })

  it('una etapa sin toques medibles dice «Aún sin toques que medir», no «0 %»', () => {
    const t = texto(dibujo())
    expect(t).toContain('Aún sin toques que medir')
    expect(t).not.toContain('0 % · sin mensaje 0 %')
  })

  it('«Recién vino» no lleva regalo ni retorno (no tiene toque)', () => {
    const marcado = html(dibujo())
    const reciente = marcado.split('<li')[1]
    expect(reciente).toContain('Recién vino')
    expect(reciente).not.toContain('sin regalo')
    expect(reciente).not.toContain('Volvieron')
  })

  it('tocar una caja la deja marcada (aria-pressed) y el color viene de --brand-*', () => {
    const marcado = html(dibujo('t4'))
    expect(marcado.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(marcado).toContain('--c:var(--brand-primary-end)')
    expect(marcado).toContain('color-mix(in oklab')
  })

  it('el vocabulario del dueño: «archivado», `t1`, holdout y cola no aparecen', () => {
    const t = texto(dibujo()).toLowerCase()
    for (const p of ['archivado', 'holdout', ' cola ', 'heartbeat']) expect(t).not.toContain(p)
  })
})

describe('«Ver por día»: el histograma, plegado', () => {
  it('una barra por día, accesible, y avisa de los que no caben', () => {
    const p = portada()
    const marcado = html(createElement(VerPorDia, { porDia: p.por_dia, cajas: p.cajas, seleccion: 3, onElegirDia: NADA }))
    expect(marcado).toContain('<details')
    expect(marcado.match(/aria-label="Día \d+: /g)).toHaveLength(5)
    expect(marcado).toContain('aria-label="Día 4: 5 clientes"')
    expect(marcado).toContain('aria-label="Día 1: 1 cliente"')
    expect(marcado).toContain('Además, 4 llevan más de 4 días')
  })

  it('sin conteo (versión mini) no dibuja nada', () => {
    const p = portada()
    expect(html(createElement(VerPorDia, { porDia: null, cajas: p.cajas, seleccion: null, onElegirDia: NADA }))).toBe('')
  })
})

// ═══════════════════════════════════════════════════════════════
// 3 · Quién ve qué
// ═══════════════════════════════════════════════════════════════

describe('el interruptor del ciclo lo ve y lo usa solo el operador de Cada1', () => {
  const apagado: PortadaDelCiclo['ciclo'] = { encendido: false, encendido_desde: null, hora: '16:30', grupo_de_control_pct: 0 }
  const ritmo = portada().ritmo
  const dibujo = (ciclo: typeof apagado, permisos: PortadaDelCiclo['permisos']) =>
    createElement(EstadoDelCiclo, { ciclo, ritmo, permisos: permisos ?? null })

  it('apagado: el dueño lee el estado en una línea y NO ve el botón', () => {
    const t = texto(dibujo(apagado, { aprobar: true, interruptor: false }))
    expect(t).toContain('El ciclo está apagado en tu marca')
    expect(t).toContain('reactivación de siempre')
    expect(t).not.toContain('Encender el ciclo')
    expect(t).not.toContain('Apagar el ciclo')
  })

  it('apagado: el operador ve «Encender el ciclo»', () => {
    expect(texto(dibujo(apagado, { aprobar: true, interruptor: true }))).toContain('Encender el ciclo')
  })

  it('encendido: el operador ve «Apagar el ciclo»; el dueño, la hora de la marca', () => {
    const encendido = portada().ciclo
    expect(texto(dibujo(encendido, { aprobar: true, interruptor: true }))).toContain('Apagar el ciclo')
    const dueno = texto(dibujo(encendido, { aprobar: true, interruptor: false }))
    expect(dueno).toContain('El ciclo está encendido')
    expect(dueno).toContain('4:30 pm')
    expect(dueno).not.toContain('Apagar el ciclo')
  })

  it('el ritmo se dice en palabras de dueño; «cambiar» solo con permiso de marca', () => {
    const conPermiso = texto(dibujo(apagado, { aprobar: true, interruptor: false }))
    expect(conPermiso).toContain('Tus clientes vuelven cada mes.')
    expect(conPermiso).toContain('Calculado con 135 regresos de tu marca.')
    expect(conPermiso).toContain('cambiar')
    expect(texto(dibujo(apagado, { aprobar: false, interruptor: false }))).not.toContain('cambiar')
    expect(texto(dibujo(apagado, null))).not.toContain('cambiar')
  })
})

describe('«Para hoy»: Hoy no solo con permiso de marca', () => {
  const dibujo = (permisos: { aprobar: boolean; interruptor: boolean } | null, tarjetas = [tarjetaTrimestral]) =>
    createElement(ParaHoy, { tarjetas, permisos, hoyIso: '2026-10-14' })

  it('con permiso: OK · Cambiar regalo · Hoy no', () => {
    const marcado = html(dibujo({ aprobar: true, interruptor: false }))
    const botones = [...marcado.matchAll(/<(?:button|a)[^>]*>([^<]+)<\/(?:button|a)>/g)].map((m) => m[1])
    expect(botones).toEqual(['OK', 'Cambiar regalo', 'Hoy no'])
  })

  it('sin permiso (administrador de sede): no hay «Hoy no» — el POST le daría 403', () => {
    const t = texto(dibujo({ aprobar: false, interruptor: false }))
    expect(t).toContain('OK')
    expect(t).not.toContain('Hoy no')
  })

  it('«Cambiar regalo» y «Elegir regalo» llevan a Recompensas › Premios para regalar; «Subir foto», a la vista por fecha', () => {
    const marcado = html(
      dibujo({ aprobar: true, interruptor: false }, [
        tarjetaTrimestral,
        { id: 'r', tipo: 'rescate_sin_regalo', texto: '23 clientes llegan al rescate esta semana.', clientes: 23, dias: 3, acciones: ['elegir_regalo'] },
        { id: 'e', tipo: 'evento_sin_foto', texto: 'Noche de sushi no tiene foto.', clientes: 412, dias: 3, acciones: ['subir_foto'], evento_id: 'ev1' },
      ])
    )
    expect(marcado.match(/href="\/dashboard\/rewards\?tab=premios"/g)).toHaveLength(2)
    expect(marcado).toContain('href="/dashboard/campaigns?vista=fecha&amp;evento=ev1"')
  })

  it('sin tarjetas: «Hoy no hay nada que aprobar» (no una sección vacía)', () => {
    expect(texto(dibujo({ aprobar: true, interruptor: false }, []))).toContain('Hoy no hay nada que aprobar. Todo está al día.')
  })

  it('el color de la tarjeta sale de --brand-*', () => {
    expect(html(dibujo({ aprobar: true, interruptor: false }))).toContain('--c:var(--brand-ink-muted)')
  })
})

// ═══════════════════════════════════════════════════════════════
// 4 · Primer uso y los números de arriba
// ═══════════════════════════════════════════════════════════════

describe('primer uso', () => {
  it('2 de 3 listos: la barra, los tres pasos y el enlace a donde se arregla', () => {
    const p = portada()
    p.primer_uso = { ...p.primer_uso!, listos: 2, regalo_fuerte: { listo: true, titulo: '½ rollo gratis', elegido_inactivo: false } }
    const marcado = html(createElement(PrimerUso, { datos: p.primer_uso }))
    expect(marcado).toContain('role="progressbar"')
    expect(marcado).toContain('aria-valuenow="2"')
    const t = texto(createElement(PrimerUso, { datos: p.primer_uso }))
    expect(t).toContain('Para que el ciclo corra solo: 2 de 3 listos')
    expect(t).toContain('Nada de esto lo frena. Lo mejora.')
    expect(t).toContain('Regalo pequeño: Postre del chef')
    expect(t).toContain('en revisión de Meta')
  })

  it('un regalo sin elegir lleva a Recompensas', () => {
    const marcado = html(createElement(PrimerUso, { datos: portada().primer_uso }))
    expect(marcado).toContain('href="/dashboard/rewards?tab=premios"')
  })

  it('con los tres listos (o sin datos) no se dibuja nada', () => {
    const p = portada()
    expect(html(createElement(PrimerUso, { datos: { ...p.primer_uso!, listos: 3 } }))).toBe('')
    expect(html(createElement(PrimerUso, { datos: null }))).toBe('')
  })
})

describe('los números de arriba', () => {
  it('tres tarjetas; ninguna dice «enviados»', () => {
    const t = texto(createElement(NumerosDeArriba, { portada: portada() }))
    expect(t).toContain('Volvieron por un mensaje')
    expect(t).toContain('En el ciclo · dormidos')
    expect(t).toContain('Próximo evento')
    expect(t).toContain('Con mensaje volvieron el 14 % · sin mensaje, el 6 %.')
    expect(t).toContain('falta la foto')
    expect(t.toLowerCase()).not.toContain('enviados')
    expect(t).toContain('Segunda visita: de los 210')
  })

  it('sin toques medibles el primer número es «—», no «0»', () => {
    const p = portada()
    p.numeros.volvieron_por_mensaje = { clientes: 0, con_mensaje_pct: null, sin_mensaje_pct: null }
    const marcado = html(createElement(NumerosDeArriba, { portada: p }))
    expect(marcado).toMatch(/Volvieron por un mensaje<\/p><p[^>]*>—/)
  })
})

// ═══════════════════════════════════════════════════════════════
// 5 · La pantalla completa y el mini-ciclo
// ═══════════════════════════════════════════════════════════════

describe('la pantalla armada', () => {
  it('en este orden: estado, primer uso, para hoy, números, cajas', () => {
    const p = portada({ para_hoy: [tarjetaTrimestral] })
    const marcado = html(vista({ tipo: 'listo', portada: p, aviso: null }))
    const orden = ['Estado del ciclo', 'Para que el ciclo corra solo', 'Para hoy', 'Resumen del ciclo', 'Cuántos hay en cada etapa']
    const posiciones = orden.map((o) => marcado.indexOf(o))
    expect(posiciones.every((x) => x >= 0)).toBe(true)
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones)
  })

  it('sin tocar nada, el panel lateral invita a tocar una caja', () => {
    expect(texto(vista({ tipo: 'listo', portada: portada(), aviso: null }))).toContain('Toca una caja para ver quiénes son.')
  })

  it('el cupo de la línea ya NO está en la portada (la parte C lo lleva al creador)', () => {
    const t = texto(vista({ tipo: 'listo', portada: portada({ para_hoy: [] }), aviso: null }))
    expect(t).not.toContain('Cupo de envío')
    expect(t).not.toContain('Hoy puedes mandar')
  })

  it('«¿Cómo decide el sistema?» dice el porcentaje REAL del grupo de control, y lo calla si es 0', () => {
    const con = texto(vista({ tipo: 'listo', portada: portada(), aviso: null }))
    expect(con).toContain('A 10 de cada 100 clientes no se les manda nada')
    const p0 = portada()
    p0.ciclo.grupo_de_control_pct = 0
    expect(texto(vista({ tipo: 'listo', portada: p0, aviso: null }))).not.toContain('Para comparar')
  })
})

describe('el mini-ciclo del panel principal', () => {
  const mini = (extra: Partial<PortadaDelCiclo> = {}, deToda = false) =>
    createElement(VistaDelMiniCiclo, { estado: { tipo: 'listo', portada: portada({ mini: true, ...extra }) }, deToda, onReintentar: NADA })

  it('las cajas sin detalle (nombre, rango, total) con un enlace a Campañas', () => {
    const marcado = html(mini())
    expect(marcado).toContain('href="/dashboard/campaigns"')
    const t = texto(mini())
    expect(t).toContain('Tu ciclo de recuperación')
    for (const n of ['Recién vino', 'Le recordamos', 'Rescate', 'Dormidos']) expect(t).toContain(n)
    expect(t).toContain('508')
    // Sin detalle: ni «nuevos», ni regalos, ni retorno.
    expect(t).not.toContain('nuevos')
    expect(t).not.toContain('Volvieron')
    expect(marcado.match(/<li /g)).toHaveLength(6) // 5 cajas del fixture + Dormidos
  })

  it('con el ciclo apagado lo dice; con varias sedes aclara que es de toda la marca', () => {
    const apagado = portada({ mini: true })
    apagado.ciclo.encendido = false
    expect(texto(mini({ ciclo: apagado.ciclo }))).toContain('El ciclo automático está apagado en tu marca')
    expect(texto(mini({}, true))).toContain('de toda la marca, no de una sede')
    expect(texto(mini({}, false))).not.toContain('de toda la marca')
  })
})

// ═══════════════════════════════════════════════════════════════
// 6 · Lo que se retira (spec §6.7, §7.6) y lo que se conserva a propósito
// ═══════════════════════════════════════════════════════════════

const RAIZ = process.cwd()
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8')
/** El código sin comentarios: los guardas miran lo que se ejecuta, no lo que se explica. */
const sinComentarios = (fuente: string) => fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function archivosDe(dir: string, salida: string[] = []): string[] {
  for (const f of readdirSync(join(RAIZ, dir))) {
    const ruta = `${dir}/${f}`
    if (statSync(join(RAIZ, ruta)).isDirectory()) archivosDe(ruta, salida)
    else if (/\.(ts|tsx)$/.test(f)) salida.push(ruta)
  }
  return salida
}

describe('lo que se retira de Campañas y del panel', () => {
  const pagina = sinComentarios(leer('src/app/(dashboard)/dashboard/campaigns/page.tsx'))

  it('Campañas ya no tiene las burbujas, las tarjetas «Automáticas», la tira de 5 cajas ni la insignia «Activa»', () => {
    expect(pagina).not.toContain('AtRiskBubbles')
    expect(pagina).not.toContain('autoCampaigns')
    expect(pagina).not.toContain('Ciclo de recuperación del cliente')
    expect(pagina).not.toContain('Ejecutar Ahora')
    expect(pagina).not.toContain('Activa')
    expect(pagina).not.toContain('deriveCycleBands')
    expect(pagina).not.toContain('run-auto')
  })

  it('Campañas abre en el Ciclo y tiene dos pestañas; el mensaje libre es un enlace, no una pestaña', () => {
    expect(pagina).toContain('<CicloPantalla')
    expect(pagina).toContain('<TabsTrigger value="ciclo">Ciclo</TabsTrigger>')
    expect(pagina).toContain('<TabsTrigger value="historial">Historial</TabsTrigger>')
    expect(pagina).not.toContain('<TabsTrigger value="manuales"')
    expect(pagina).toContain('Mensaje libre (avanzado)')
    expect(pagina).toContain('<ManualCampaigns />')
  })

  it('el cupo de la línea sale de la portada y vive donde se dispara un envío a mano', () => {
    // El cupo está en la vista del mensaje libre, antes del asistente — y no en la del ciclo.
    const libre = pagina.slice(pagina.indexOf("vista === 'libre'"), pagina.indexOf('Ciclo y campañas\n'))
    expect(libre).toContain('<CupoEnvioCard />')
    expect(libre.indexOf('<CupoEnvioCard />')).toBeLessThan(libre.indexOf('<ManualCampaigns />'))
    const ciclo = pagina.slice(pagina.indexOf('Ciclo y campañas\n'))
    expect(ciclo).not.toContain('CupoEnvioCard')
  })

  it('los enlaces viejos siguen sirviendo: ?tab=manuales, ?tab=historial y ?tab=premios (a Recompensas)', () => {
    expect(pagina).toContain("window.location.replace('/dashboard/rewards?tab=premios')")
    expect(pagina).toContain('vistaDeUrl(busqueda)')
    expect(pagina).not.toContain('useSearchParams')
  })

  it('el panel principal trae el mini-ciclo y no las burbujas', () => {
    const panel = sinComentarios(leer('src/app/(dashboard)/dashboard/page.tsx'))
    expect(panel).toContain("import { MiniCiclo } from '@/components/dashboard/cycle/MiniCiclo'")
    expect(panel).toContain('<MiniCiclo />')
    expect(panel).not.toContain("from '@/components/dashboard/AtRiskBubbles'")
  })

  it('AtRiskBubbles sobrevive SOLO en la demo pública (sin sesión no hay ciclo que leer)', () => {
    const quienLoImporta = archivosDe('src').filter((f) => /from '@\/components\/dashboard\/AtRiskBubbles'/.test(readFileSync(join(RAIZ, f), 'utf8')))
    expect(quienLoImporta).toEqual(['src/app/demo/page.tsx'])
  })

  it('RISK_LEVELS / deriveCycleBands() se QUEDAN: siguen en uso (analítica, demo, mensaje libre)', () => {
    const rankings = leer('src/constants/rankings.ts')
    expect(rankings).toContain('export const RISK_LEVELS')
    expect(rankings).toContain('export function deriveCycleBands')
    const usos = archivosDe('src').filter(
      (f) => f !== 'src/constants/rankings.ts' && /RISK_LEVELS|deriveCycleBands|deriveRiskLevels/.test(readFileSync(join(RAIZ, f), 'utf8'))
    )
    expect(usos.length).toBeGreaterThanOrEqual(3)
  })
})

describe('un solo motor: la pantalla no calcula etapas, ritmos ni días', () => {
  it('ni la lógica ni los componentes importan funciones de cálculo del motor (solo etiquetas y tipos)', () => {
    // Importar `boxOf`, `resolveStage`, `daysWithoutVisit`, etc. en la pantalla sería calcular acá lo que dice el cron.
    const prohibidas = ['boxOf', 'boxEnteredOn', 'resolveStage', 'stageEntryDays', 'daysWithoutVisit', 'decidirCliente', 'resolverToque', 'effectiveRhythm', 'personalRhythm', 'brandRhythm']
    const archivos = ['src/lib/cycle-screen.ts', ...archivosDe('src/components/dashboard/cycle')]
    for (const a of archivos) {
      const fuente = sinComentarios(leer(a))
      for (const f of prohibidas) expect(fuente, `${a} usa ${f}`).not.toMatch(new RegExp(`\\b${f}\\(`))
    }
  })
})
