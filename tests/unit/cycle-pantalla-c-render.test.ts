/**
 * Ciclo, fase 2 parte C — la vista por fecha y los creadores DIBUJADOS (componentes reales, a
 * HTML con `renderToStaticMarkup`, sin navegador).
 *
 *   · Un error NUNCA se dibuja como ceros: el calendario y «Mandar un regalo» dicen «no pudimos»
 *     y no muestran ni un conteo.
 *   · La vista por fecha: la sombra «reservado para el evento», los eventos, las fechas
 *     especiales, la proyección y «Crear aquí» solo en un día que no pasó.
 *   · «Mandar un regalo»: el conteo vivo por caja, «Recién vino» no se ofrece, el cupo, el
 *     adaptador dicho en pantalla y la vista previa del WhatsApp; sin permiso de marca no programa.
 *   · «Crear un evento»: texto sugerido, «incluir dormidos» solo con el ciclo encendido.
 *   · `/dashboard/calendar` redirige a la vista por fecha con sus parámetros.
 *   · Ningún hex horneado y nada de `useSearchParams()` en lo nuevo.
 *
 * Contra el código anterior: ninguno de estos componentes existía y el calendario era una
 * pantalla aparte (`EventCreateDialog`, `CalendarMonthView`).
 */

import { describe, it, expect } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CalendarioDelCiclo, type EstadoDelCalendario } from '@/components/dashboard/cycle/VistaPorFecha'
import { MandarRegalo } from '@/components/dashboard/cycle/MandarRegalo'
import { CrearEvento } from '@/components/dashboard/cycle/CrearEvento'
import { VistaDelCiclo } from '@/components/dashboard/cycle/CicloPantalla'
import { buildTemplateBody } from '@/constants/template-catalog'
import type { CycleProjection } from '@/services/cycle-overview.service'
import type { VistaPreviaDelRegalo } from '@/services/cycle-gift.service'
import type { PortadaDelCiclo } from '@/lib/cycle-screen'

const NADA = () => {}
const html = (el: ReactElement) => renderToStaticMarkup(el)
const texto = (el: ReactElement) => html(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

// ═══════════════════════════════════════════════════════════════
// La vista por fecha
// ═══════════════════════════════════════════════════════════════

const OCTUBRE = { anio: 2026, mes: 9 }

function proyeccion(): CycleProjection {
  const dias = Array.from({ length: 31 }, (_, i) => {
    const fecha = `2026-10-${String(i + 1).padStart(2, '0')}`
    return { fecha, entran: [] as CycleProjection['dias'][number]['entran'], eventos: [] as string[], fechas_especiales: [] as CycleProjection['dias'][number]['fechas_especiales'], reservado_para: [] as string[] }
  })
  dias[14].entran = [{ etapa: 't4', etiqueta: 'Rescate', total: 23, nuevos: 15 }]
  for (let d = 12; d <= 16; d++) dias[d - 1].reservado_para = ['ev1']
  dias[16].eventos = ['ev1']
  dias[30].fechas_especiales = [{ id: 'halloween', nombre: 'Halloween', fecha: '2026-10-31' }]
  return {
    desde: '2026-10-01',
    hasta: '2026-10-31',
    hoy: '2026-10-14',
    encendido: true,
    dias,
    eventos: [{ id: 'ev1', titulo: 'Noche de sushi', fecha: '2026-10-17', estado: 'scheduled', sin_foto: true, reservado_desde: '2026-10-12' }],
  }
}

const calendario = (estado: EstadoDelCalendario, elegido = '2026-10-15') =>
  createElement(CalendarioDelCiclo, {
    estado,
    mes: OCTUBRE,
    hoyIso: '2026-10-14',
    elegido,
    onElegir: NADA,
    onMes: NADA,
    onReintentar: NADA,
    onCrearAqui: NADA,
    onAbrirEvento: NADA,
  })

describe('la vista por fecha', () => {
  it('en error dice «no pudimos leer» con Reintentar, y no dibuja ni un día ni un conteo', () => {
    const marcado = html(calendario({ tipo: 'error', mensaje: 'No pudimos leer el calendario de tu ciclo en este momento.' }))
    expect(marcado).toContain('role="alert"')
    expect(marcado).toContain('No pudimos leer el calendario de tu ciclo')
    expect(marcado).toContain('Reintentar')
    expect(marcado).not.toContain('role="gridcell"')
    // Ni un conteo: el encabezado explica qué es la vista, pero no hay «N entran» de ningún día.
    expect(texto(calendario({ tipo: 'error', mensaje: 'x' }))).not.toMatch(/\d+\s+entran/)
  })

  it('el mes en cuadrícula, lunes a domingo, con los 31 días', () => {
    const marcado = html(calendario({ tipo: 'listo', proyeccion: proyeccion() }))
    expect(marcado.match(/role="gridcell" aria-selected/g)).toHaveLength(31)
    expect(marcado).toContain('Calendario de octubre 2026')
  })

  it('los días antes del evento llevan la sombra «reservado» (de la marca, sin hex); el evento, su nombre; la fecha especial y la proyección', () => {
    const marcado = html(calendario({ tipo: 'listo', proyeccion: proyeccion() }))
    expect(marcado.match(/repeating-linear-gradient/g)!.length).toBeGreaterThanOrEqual(5 + 1) // 5 días + la leyenda
    expect(marcado).toContain('color-mix(in oklab, var(--brand-primary)')
    expect(marcado).toContain('Noche de sushi')
    expect(marcado).toContain('Halloween')
    expect(marcado).toContain('23 → rescate')
    expect(marcado).toContain('reservado para un evento (los días antes)')
  })

  it('tocar un día que viene: quiénes entran (nuevos / ya volvieron) y «Crear aquí»', () => {
    const t = texto(calendario({ tipo: 'listo', proyeccion: proyeccion() }, '2026-10-15'))
    expect(t).toContain('23 clientes entran a un toque')
    expect(t).toContain('15 nuevos · 8 ya volvieron antes')
    expect(t).toContain('Reservado para «Noche de sushi»')
    expect(t).toContain('Crear aquí')
    expect(t).toContain('Ver quiénes')
  })

  it('un día que ya pasó no deja «Crear aquí»; el del evento sin foto ofrece subirla', () => {
    expect(texto(calendario({ tipo: 'listo', proyeccion: proyeccion() }, '2026-10-02'))).not.toContain('Crear aquí')
    expect(texto(calendario({ tipo: 'listo', proyeccion: proyeccion() }, '2026-10-17'))).toContain('Subir foto · Noche de sushi')
  })
})

// ═══════════════════════════════════════════════════════════════
// «Mandar un regalo»
// ═══════════════════════════════════════════════════════════════

function vistaPrevia(extra: Partial<VistaPreviaDelRegalo> = {}): VistaPreviaDelRegalo {
  const cero = { regalo_vivo: 0, siete_dias: 0, tope_mes: 0 }
  return {
    encendido: true,
    hora: '16:30',
    sale: '2026-10-14T21:30:00.000Z',
    sale_texto: 'hoy a las 4:30 pm',
    vence: [
      { regla: 'domingo', iso: '2026-10-25T04:59:59.000Z', texto: 'domingo 25 de octubre' },
      { regla: '3', iso: '2026-10-18T04:59:59.000Z', texto: 'sábado 17 de octubre' },
      { regla: '7', iso: '2026-10-22T04:59:59.000Z', texto: 'miércoles 21 de octubre' },
      { regla: '14', iso: '2026-10-29T04:59:59.000Z', texto: 'miércoles 28 de octubre' },
    ],
    plantilla: { clave: 'reactivation_aggressive', regalo_que_vence: 'pendiente' },
    regalos: [{ id: 'r1', titulo: 'Postre del chef' }, { id: 'r2', titulo: '½ rollo gratis' }],
    audiencias: [
      { clave: 'reciente', etiqueta: 'Recién vino', disponible: false, total: 120, reciben: 0, no_reciben: cero },
      { clave: 't4', etiqueta: 'Rescate', disponible: true, total: 23, reciben: 19, no_reciben: { regalo_vivo: 1, siete_dias: 3, tope_mes: 0 } },
      { clave: 'dormidos', etiqueta: 'Dormidos', disponible: true, total: 508, reciben: 500, no_reciben: { ...cero, siete_dias: 8 } },
      { clave: 'todos', etiqueta: 'Todos', disponible: true, total: 600, reciben: 580, no_reciben: { ...cero, siete_dias: 20 } },
    ],
    cupo: { estado: 'con_tope', hoy: 180, por_dia: 250 },
    marca: { nombre: 'Sushi Service', emoji: '🍣' },
    cuerpos: {
      gift_expiring: buildTemplateBody('gift_expiring', 'Sushi Service', '🍣'),
      reactivation_aggressive: buildTemplateBody('reactivation_aggressive', 'Sushi Service', '🍣'),
      event_image: buildTemplateBody('event_image', 'Sushi Service', '🍣'),
    },
    ejemplo: { nombre: 'Sara', puntos: 412, premio_proximo: 'Plata', camino: '🥈 Plata 412/450' },
    ...extra,
  }
}

const regalo = (lectura: Parameters<typeof MandarRegalo>[0]['lectura'], puedeMandar = true) =>
  createElement(MandarRegalo, { lectura, cuando: 'hoy', onCuando: NADA, puedeMandar })

describe('«Mandar un regalo»', () => {
  it('si la vista previa falla, dice por qué y no muestra NINGÚN conteo ni el botón', () => {
    const t = texto(regalo({ ok: false, mensaje: 'No pudimos preparar el regalo en este momento.' }))
    expect(t).toBe('No pudimos preparar el regalo en este momento.')
    expect(t).not.toMatch(/\d/)
    expect(html(regalo(null))).toContain('aria-busy="true"')
  })

  it('el conteo vivo por caja (los que lo reciben), y «Recién vino» no se ofrece', () => {
    const marcado = html(regalo({ ok: true, datos: vistaPrevia() }))
    expect(texto(regalo({ ok: true, datos: vistaPrevia() }))).toContain('Rescate 19')
    expect(marcado).toMatch(/<button[^>]*aria-pressed="false"[^>]*disabled=""[^>]*title="Vinieron hace poco[^"]*"[^>]*>Recién vino/)
  })

  it('abre en el Rescate; dice cuántos lo reciben y por qué no el resto', () => {
    const t = texto(regalo({ ok: true, datos: vistaPrevia() }))
    expect(t).toContain('Lo reciben 19 de 23. No lo reciben: 1 ya tiene un regalo vivo · 3 recibieron otro mensaje hace menos de 7 días.')
    expect(t).toContain('Programar 19 regalos')
  })

  it('hasta cuándo: «Este domingo» por defecto y 3/7/14 días; el cupo de la línea; el adaptador dicho', () => {
    const t = texto(regalo({ ok: true, datos: vistaPrevia() }))
    expect(t).toContain('Este domingo 25 de octubre')
    expect(t).toContain('En 3 días')
    expect(t).toContain('En 14 días')
    expect(t).toContain('Hoy puedes mandar 180. Si son más, el resto sale en los días siguientes.')
    expect(t).toContain('«Regalo que vence» está en revisión de Meta')
    expect(t).toContain('Sale hoy a las 4:30 pm.')
  })

  it('la vista previa es el WhatsApp real: con la insistente, el regalo va a la tarjeta y lo dice', () => {
    const t = texto(regalo({ ok: true, datos: vistaPrevia() }))
    expect(t).toContain('Tus *412 puntos*')
    expect(t).toContain('En la tarjeta, Sara ve: «Disponible: Postre del chef · vence el domingo 25 de octubre»')
  })

  it('con «Regalo que vence» aprobada, el regalo y la fecha van en el mensaje', () => {
    const t = texto(regalo({ ok: true, datos: vistaPrevia({ plantilla: { clave: 'gift_expiring', regalo_que_vence: 'aprobada' } }) }))
    expect(t).toContain('Te guardamos *Postre del chef*. Ven antes del *domingo 25 de octubre*')
    expect(t).not.toContain('revisión de Meta')
  })

  it('sin permiso de marca (administrador de sede) no se puede programar', () => {
    const marcado = html(regalo({ ok: true, datos: vistaPrevia() }, false))
    expect(marcado).toMatch(/<button[^>]*disabled=""[^>]*>Programar 19 regalos<\/button>/)
    expect(texto(regalo({ ok: true, datos: vistaPrevia() }, false))).toContain('lo manda un super usuario')
  })

  it('el cupo que no se pudo leer no se inventa', () => {
    const t = texto(regalo({ ok: true, datos: vistaPrevia({ cupo: { estado: 'no_se_pudo', hoy: null, por_dia: null } }) }))
    expect(t).toContain('No pudimos leer el cupo de hoy')
    expect(t).not.toContain('Hoy puedes mandar')
  })
})

// ═══════════════════════════════════════════════════════════════
// «Crear un evento»
// ═══════════════════════════════════════════════════════════════

const evento = (encendido: boolean, extra: { fechaInicial?: string; nombreInicial?: string } = {}) =>
  createElement(CrearEvento, {
    datos: {
      enElCiclo: 341,
      dormidos: 508,
      encendido,
      hora: '16:30',
      marca: 'Sushi Service',
      cuerpo: buildTemplateBody('event_image', 'Sushi Service', '🍣'),
    },
    ...extra,
  })

describe('«Crear un evento»', () => {
  it('trae la fecha y el nombre que pidió «Para hoy», con el texto ya escrito', () => {
    const t = texto(evento(true, { fechaInicial: '2026-10-31', nombreInicial: 'Halloween' }))
    expect(html(evento(true, { fechaInicial: '2026-10-31', nombreInicial: 'Halloween' }))).toContain('value="Halloween"')
    expect(t).toContain('El sábado 31 de octubre tenemos Halloween. Ven con tu tarjeta')
    expect(t).toContain('Programar para el sábado 31 de octubre a las 4:30 pm')
  })

  it('con el ciclo encendido: la casilla «Incluir a los dormidos», apagada, y el evento llega a los del ciclo', () => {
    const marcado = html(evento(true))
    expect(marcado).toMatch(/<input type="checkbox"[^>]*\/?>/)
    expect(marcado).not.toMatch(/<input type="checkbox"[^>]*checked/)
    expect(texto(evento(true))).toContain('Incluir a los dormidos (508)')
    expect(texto(evento(true))).toContain('A todos los que están en el ciclo: 341.')
  })

  it('con el ciclo apagado no hay casilla: llega a todos, como siempre', () => {
    expect(html(evento(false))).not.toContain('type="checkbox"')
    expect(texto(evento(false))).toContain('A todos los que aceptan mensajes: 849.')
  })

  it('sin foto avisa que no sale; la vista previa es la invitación real', () => {
    const t = texto(evento(true, { nombreInicial: 'Noche de sushi', fechaInicial: '2026-10-17' }))
    expect(t).toContain('Sin foto no sale')
    expect(t).toContain('*Noche de sushi*')
    expect(t).toContain('Te escribimos de _Sushi Service_')
  })
})

// ═══════════════════════════════════════════════════════════════
// La barra de la pantalla del ciclo
// ═══════════════════════════════════════════════════════════════

function portadaMinima(aprobar: boolean): PortadaDelCiclo {
  const sin = { con_mensaje: { toques: 0, volvieron: 0, pct: null }, sin_mensaje: { toques: 0, volvieron: 0, pct: null } }
  return {
    mini: false,
    ciclo: { encendido: true, encendido_desde: null, hora: '16:30', grupo_de_control_pct: 10 },
    ritmo: { marca: 'restaurant', etiqueta: 'Cada mes', origen: 'calculado', dias: [14, 28, 42, 60, 80], mediana: 27, regresos: 135, con_ritmo_propio: 0 },
    cajas: [{ key: 't4', etiqueta: 'Rescate', desde: 60, hasta: 79, total: 23, nuevos: 15, ya_volvieron: 8, hoy_entran: 0, regalo: null, retorno: sin }],
    dormidos: { etiqueta: 'Dormidos', total: 508, nuevos: 315, ya_volvieron: 193, sin_toques_hace_6_meses: 0, hoy_entran: 0, regalo: null, retorno: sin },
    no_reciben_mensajes: 0,
    numeros: { en_el_ciclo: 223, dormidos: 508, volvieron_por_mensaje: null, proximo_evento: null },
    segunda_visita: null,
    primer_uso: null,
    para_hoy: [],
    por_dia: null,
    permisos: { aprobar, interruptor: false },
  }
}

const pantalla = (aprobar: boolean, vista: 'etapa' | 'fecha') =>
  createElement(VistaDelCiclo, {
    estado: { tipo: 'listo', portada: portadaMinima(aprobar), aviso: null },
    seleccion: null,
    onElegir: NADA,
    onReintentar: NADA,
    vista,
    onVista: NADA,
    onCrear: NADA,
  })

describe('arriba: «Por etapa | Por fecha» y el botón principal', () => {
  it('«Mandar un regalo» es el botón principal, con permiso de marca', () => {
    expect(texto(pantalla(true, 'etapa'))).toContain('Mandar un regalo')
    expect(texto(pantalla(false, 'etapa'))).not.toContain('Mandar un regalo')
  })

  it('el selector dice en qué vista está; por fecha no dibuja las cajas', () => {
    const porEtapa = html(pantalla(true, 'etapa'))
    expect(porEtapa).toMatch(/aria-pressed="true"[^>]*>Por etapa</)
    expect(porEtapa).toContain('Cuántos hay en cada etapa')
    const porFecha = html(pantalla(true, 'fecha'))
    expect(porFecha).toMatch(/aria-pressed="true"[^>]*>Por fecha</)
    expect(porFecha).not.toContain('Cuántos hay en cada etapa')
    expect(porFecha).toContain('Qué pasa cada día')
  })
})

// ═══════════════════════════════════════════════════════════════
// El calendario viejo redirige; lo que se retira; ningún hex
// ═══════════════════════════════════════════════════════════════

const RAIZ = process.cwd()
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8')
const sinComentarios = (fuente: string) => fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('el calendario vive en Campañas', () => {
  it('/dashboard/calendar redirige a la vista por fecha con lo que pedía la URL', async () => {
    const { default: CalendarRedirect } = await import('@/app/(dashboard)/dashboard/calendar/page')
    await expect(
      CalendarRedirect({ searchParams: Promise.resolve({ fecha: '2026-10-31', nombre: 'Halloween' }) })
    ).rejects.toMatchObject({ digest: expect.stringContaining('/dashboard/campaigns?vista=fecha&fecha=2026-10-31&nombre=Halloween') })
    await expect(CalendarRedirect({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining('/dashboard/campaigns?vista=fecha;'),
    })
  })

  it('EventCreateDialog y CalendarMonthView se retiraron; MediaUploader y EventDetailDrawer se reusan', () => {
    expect(existsSync(join(RAIZ, 'src/components/dashboard/Calendar/EventCreateDialog.tsx'))).toBe(false)
    expect(existsSync(join(RAIZ, 'src/components/dashboard/Calendar/CalendarMonthView.tsx'))).toBe(false)
    expect(leer('src/components/dashboard/cycle/CrearEvento.tsx')).toContain("from '@/components/dashboard/Calendar/MediaUploader'")
    expect(leer('src/components/dashboard/cycle/CicloPantalla.tsx')).toContain("from '@/components/dashboard/Calendar/EventDetailDrawer'")
    // La ficha del evento deja subir la foto (antes: «cancélalo y créalo de nuevo»).
    expect(leer('src/components/dashboard/Calendar/EventDetailDrawer.tsx')).toContain('<MediaUploader')
  })

  it('lo nuevo no hornea colores ni usa useSearchParams()', () => {
    for (const a of [
      'src/components/dashboard/cycle/VistaPorFecha.tsx',
      'src/components/dashboard/cycle/MandarRegalo.tsx',
      'src/components/dashboard/cycle/CrearEvento.tsx',
      'src/components/dashboard/cycle/CreadorDelCiclo.tsx',
      'src/components/dashboard/cycle/CicloPantalla.tsx',
      'src/app/(dashboard)/dashboard/campaigns/page.tsx',
    ]) {
      const fuente = sinComentarios(leer(a))
      expect(fuente, a).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(fuente, a).not.toContain('useSearchParams')
    }
  })
})
