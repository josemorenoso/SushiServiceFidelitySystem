/**
 * Ciclo, fase 2 parte C — lo PURO (2026-10-14): la vista por fecha, los creadores y las reglas
 * que el drenador aplica al regalo del dueño. Sin navegador ni base.
 *
 *   · La vista por fecha entra como `?vista=fecha`; el viejo calendario redirige ahí con lo que
 *     pedía la URL, y «Crear evento» / «Subir foto» de «Para hoy» llevan ahí.
 *   · El regalo se FECHA al enviar: la regla («domingo», 3, 7, 14 días) se cuenta desde el envío,
 *     con el mismo adaptador de plantilla que el ciclo, y la fecha cae en la variable de SU
 *     plantilla. Un regalo vivo por cliente, también dentro de una tanda.
 *   · `cycle_enabled` lo escribe SOLO el operador de Cada1 (decisión H7, punto 5 del prompt).
 *   · La vista previa dice lo que va a salir (`ctaDelEvento` = `buildEventCta` del servidor).
 *
 * Contra el código anterior: ninguna de las funciones nuevas existía (el archivo no carga), y
 * `decidirEscrituraDeAjuste()` dejaba escribir `cycle_enabled` a cualquiera.
 */

import { describe, it, expect } from 'vitest'
import { bogotaDay, expiresOnSunday } from '@/lib/cycle-engine'
import {
  formatGiftDeadline,
  instanteDelRegalo,
  instanteEnBogota,
  isoDeDia,
  nextSendSlot,
  plantillaDelRegalo,
  variablesDelRegaloAlEnviar,
  venceSegunRegla,
  esReglaDeVencimiento,
  MAX_DIAS_PARA_PROGRAMAR_UN_REGALO,
} from '@/lib/cycle-touch'
import {
  avisoDePlantillaDelRegalo,
  celdaDelCalendario,
  ctaDelEvento,
  destinoDelCalendario,
  detalleDelDia,
  enlaceParaCrearEvento,
  enlaceParaSubirFoto,
  fechaDeLaInvitacion,
  invitadosDelEvento,
  moverMes,
  pedidoDeLaUrl,
  rangoDelMes,
  rellenarPlantilla,
  salidaDeLaInvitacion,
  semanasDelMes,
  textoDeUnaLinea,
  textoDelBotonDelEvento,
  textoDelCupo,
  textoNoLoReciben,
  textoSugeridoDelEvento,
  vistaDeUrl,
  vistaPreviaDelWhatsAppDelEvento,
  vistaPreviaDelWhatsAppDelRegalo,
  RUTAS_DEL_CICLO,
} from '@/lib/cycle-screen'
import { decidirEscrituraDeAjuste, CLAVES_DEL_OPERADOR } from '@/lib/settings-keys'
import { buildEventCta } from '@/services/calendar.service'
import { guardaDelRegalo, leerEntradaDelRegalo, leerRegaloDeLaCampana, type ContextoDeRegalosEnLaTanda } from '@/services/cycle-gift.service'
import { buildTemplateBody } from '@/constants/template-catalog'
import type { DiaDeLaProyeccion, EventoDelCalendario } from '@/services/cycle-overview.service'
import type { QueueRow } from '@/services/send-queue.service'

// ═══════════════════════════════════════════════════════════════
describe('la vista por fecha: rutas y lo que pide la URL', () => {
  it('?vista=fecha abre la vista por fecha; las demás vistas no cambian', () => {
    expect(vistaDeUrl('?vista=fecha')).toBe('fecha')
    expect(vistaDeUrl('?vista=fecha&fecha=2026-10-31')).toBe('fecha')
    expect(vistaDeUrl('')).toBe('ciclo')
    expect(vistaDeUrl('?tab=historial')).toBe('historial')
    expect(vistaDeUrl('?tab=manuales')).toBe('libre')
  })

  it('el calendario de antes vive en Campañas: las rutas y los botones de «Para hoy» llevan ahí', () => {
    expect(RUTAS_DEL_CICLO.calendario).toBe('/dashboard/campaigns?vista=fecha')
    expect(enlaceParaCrearEvento({ fecha: '2026-10-31', nombre: 'Halloween' })).toBe(
      '/dashboard/campaigns?vista=fecha&fecha=2026-10-31&nombre=Halloween'
    )
    expect(enlaceParaSubirFoto({ evento_id: '11111111-2222-4333-8444-555555555555' })).toBe(
      '/dashboard/campaigns?vista=fecha&evento=11111111-2222-4333-8444-555555555555'
    )
  })

  it('/dashboard/calendar redirige con fecha, nombre y evento (y nada más)', () => {
    expect(destinoDelCalendario({})).toBe('/dashboard/campaigns?vista=fecha')
    expect(destinoDelCalendario({ fecha: '2026-10-31', nombre: 'Halloween', otro: 'x' })).toBe(
      '/dashboard/campaigns?vista=fecha&fecha=2026-10-31&nombre=Halloween'
    )
    expect(destinoDelCalendario({ evento: ['ev-1', 'ev-2'] })).toBe('/dashboard/campaigns?vista=fecha&evento=ev-1')
  })

  it('pedidoDeLaUrl solo acepta lo que tiene la forma correcta', () => {
    expect(pedidoDeLaUrl('?vista=fecha&fecha=2026-10-31&nombre=%20Halloween%20%20party ')).toEqual({
      fecha: '2026-10-31',
      nombre: 'Halloween party',
    })
    expect(pedidoDeLaUrl('?fecha=31-10-2026&evento=<script>')).toEqual({})
    expect(pedidoDeLaUrl('?evento=11111111-2222-4333-8444-555555555555')).toEqual({
      evento: '11111111-2222-4333-8444-555555555555',
    })
    expect(pedidoDeLaUrl(null)).toEqual({})
  })
})

// ═══════════════════════════════════════════════════════════════
describe('la cuadrícula del mes', () => {
  it('octubre de 2026 empieza en jueves: lunes a domingo, con huecos', () => {
    const semanas = semanasDelMes({ anio: 2026, mes: 9 })
    expect(semanas[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(semanas.every((s) => s.length === 7)).toBe(true)
    expect(semanas.flat().filter(Boolean)).toHaveLength(31)
    expect(semanas.at(-1)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null])
  })

  it('febrero, años bisiestos y el cambio de año', () => {
    expect(rangoDelMes({ anio: 2028, mes: 1 })).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' })
    expect(rangoDelMes({ anio: 2026, mes: 1 })).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(moverMes({ anio: 2026, mes: 11 }, 1)).toEqual({ anio: 2027, mes: 0 })
    expect(moverMes({ anio: 2026, mes: 0 }, -1)).toEqual({ anio: 2025, mes: 11 })
  })
})

describe('una celda y el detalle de un día salen de la proyección del servidor', () => {
  const evento: EventoDelCalendario = {
    id: 'ev1',
    titulo: 'Noche de sushi',
    fecha: '2026-10-17',
    estado: 'scheduled',
    sin_foto: true,
    reservado_desde: '2026-10-12',
  }
  const eventos = new Map([[evento.id, evento]])
  const dia = (fecha: string, extra: Partial<DiaDeLaProyeccion> = {}): DiaDeLaProyeccion => ({
    fecha,
    entran: [],
    eventos: [],
    fechas_especiales: [],
    reservado_para: [],
    ...extra,
  })

  it('un día reservado lleva la sombra; el del evento, el evento; la proyección, «23 → rescate»', () => {
    const reservado = celdaDelCalendario(
      dia('2026-10-15', {
        reservado_para: ['ev1'],
        entran: [
          { etapa: 't4', etiqueta: 'Rescate', total: 23, nuevos: 15 },
          { etapa: 't2', etiqueta: 'Le regalamos algo', total: 8, nuevos: 5 },
        ],
      }),
      eventos,
      '2026-10-14'
    )
    expect(reservado).toMatchObject({ reservado: true, total: 31, pasado: false, hoy: false, numero: 15 })
    expect(reservado.entran.map((e) => e.texto)).toEqual(['23 → rescate', '8 → le regalamos algo'])

    const delEvento = celdaDelCalendario(dia('2026-10-17', { eventos: ['ev1'] }), eventos, '2026-10-14')
    expect(delEvento.eventos).toEqual([{ id: 'ev1', titulo: 'Noche de sushi', sinFoto: true }])
    expect(delEvento.reservado).toBe(false)
  })

  it('el detalle: un día reservado dice para qué evento; uno pasado no deja crear', () => {
    const d = detalleDelDia(dia('2026-10-15', { reservado_para: ['ev1'] }), eventos, '2026-10-14')
    expect(d.texto).toContain('Reservado para «Noche de sushi» (sábado 17 de octubre)')
    expect(d.sePuedeCrear).toBe(true)
    expect(detalleDelDia(dia('2026-10-01'), eventos, '2026-10-14')).toMatchObject({ titulo: 'Ya pasó', sePuedeCrear: false })
    expect(
      detalleDelDia(dia('2026-10-20', { entran: [{ etapa: 't4', etiqueta: 'Rescate', total: 1, nuevos: 1 }] }), eventos, '2026-10-14').titulo
    ).toBe('1 cliente entra a un toque')
  })
})

// ═══════════════════════════════════════════════════════════════
describe('el regalo del dueño: se fecha AL ENVIAR', () => {
  const lunes = new Date('2026-10-12T21:30:00Z') // lunes 12, 16:30 de Bogotá

  it('«domingo» es el mismo vencimiento de los toques; N días cierra el día N después del envío', () => {
    expect(venceSegunRegla('domingo', lunes).toISOString()).toBe(expiresOnSunday(lunes).toISOString())
    expect(venceSegunRegla('3', lunes).toISOString()).toBe(new Date('2026-10-15T23:59:59-05:00').toISOString())
    expect(venceSegunRegla('7', lunes).toISOString()).toBe(new Date('2026-10-19T23:59:59-05:00').toISOString())
    expect(venceSegunRegla('14', lunes).toISOString()).toBe(new Date('2026-10-26T23:59:59-05:00').toISOString())
    // Un regalo que esperó cupo dos días vale sus días completos desde que salió.
    const miercoles = new Date('2026-10-14T21:30:00Z')
    expect(venceSegunRegla('3', miercoles).toISOString()).toBe(new Date('2026-10-17T23:59:59-05:00').toISOString())
    expect(esReglaDeVencimiento('domingo')).toBe(true)
    expect(esReglaDeVencimiento('5')).toBe(false)
  })

  it('la fecha va en la variable de SU plantilla: {{3}} en «Regalo que vence», {{5}} en la insistente', () => {
    const conRegalo = variablesDelRegaloAlEnviar('gift_expiring', '7', { '1': 'Sara', '2': 'Postre', '4': 'camino' }, lunes)
    expect(conRegalo.variables).toEqual({ '1': 'Sara', '2': 'Postre', '3': formatGiftDeadline(conRegalo.vence), '4': 'camino' })
    const insistente = variablesDelRegaloAlEnviar('reactivation_aggressive', 'domingo', { '1': 'Sara', '4': 'Postre' }, lunes)
    expect(insistente.variables['5']).toBe(formatGiftDeadline(expiresOnSunday(lunes)))
  })

  it('el adaptador del ciclo: «Regalo que vence» solo aprobada; si no, la insistente; sin ninguna, nada', () => {
    const sids = { gift_expiring: 'HX_REGALO', reactivation_aggressive: 'HX_INSISTENTE' }
    expect(plantillaDelRegalo({ sids, regaloQueVenceAprobada: true })).toEqual({ key: 'gift_expiring', sid: 'HX_REGALO' })
    expect(plantillaDelRegalo({ sids, regaloQueVenceAprobada: false })).toEqual({ key: 'reactivation_aggressive', sid: 'HX_INSISTENTE' })
    expect(plantillaDelRegalo({ sids: {}, regaloQueVenceAprobada: true })).toBeNull()
  })

  it('cuándo sale: hoy es la próxima hora de la marca; una fecha, esa fecha a esa hora; lo pasado no', () => {
    const manana = new Date('2026-10-14T13:00:00Z') // 8:00 de Bogotá
    expect(instanteDelRegalo('hoy', 'dinner', manana)?.toISOString()).toBe(nextSendSlot(manana, 'dinner').toISOString())
    expect(instanteDelRegalo('2026-10-20', 'lunch', manana)?.toISOString()).toBe(instanteEnBogota(bogotaDay('2026-10-20T12:00:00-05:00'), 10, 30).toISOString())
    // Hoy, con la hora de la marca ya pasada (almuerzo a las 10:30, ahora son las 18:00): no.
    expect(instanteDelRegalo('2026-10-14', 'lunch', new Date('2026-10-14T23:00:00Z'))).toBeNull()
    expect(instanteDelRegalo('2026-10-13', 'dinner', manana)).toBeNull()
    expect(instanteDelRegalo('2026-02-30', 'dinner', manana)).toBeNull()
    expect(instanteDelRegalo('mañana', 'dinner', manana)).toBeNull()
    const limite = isoDeDia(bogotaDay(manana) + MAX_DIAS_PARA_PROGRAMAR_UN_REGALO)
    const pasado = isoDeDia(bogotaDay(manana) + MAX_DIAS_PARA_PROGRAMAR_UN_REGALO + 1)
    expect(instanteDelRegalo(limite, 'dinner', manana)).not.toBeNull()
    expect(instanteDelRegalo(pasado, 'dinner', manana)).toBeNull()
  })
})

describe('el regalo vive en la campaña (`filters.regalo`) y el drenador lo lee de ahí', () => {
  it('leerRegaloDeLaCampana: lo bien guardado, sí; lo demás es «no es un regalo»', () => {
    const r = { reward_id: 'r1', titulo: 'Postre', vence: '7', plantilla: 'gift_expiring' }
    expect(leerRegaloDeLaCampana({ regalo: r, audiencia: 't4' })).toEqual(r)
    expect(leerRegaloDeLaCampana({})).toBeNull()
    expect(leerRegaloDeLaCampana(null)).toBeNull()
    expect(leerRegaloDeLaCampana({ regalo: { ...r, vence: '5' } })).toBeNull()
    expect(leerRegaloDeLaCampana({ regalo: { ...r, plantilla: 'reactivation_no_reward' } })).toBeNull()
    expect(leerRegaloDeLaCampana({ regalo: { ...r, titulo: '  ' } })).toBeNull()
  })

  it('un regalo vivo por cliente: si ya tiene uno, o le llega otro en la misma tanda, no sale', () => {
    const item = { id: 'q1', customer_id: 'c1', campaign_id: 'k1', message_type: 'manual' } as QueueRow
    const ctx: ContextoDeRegalosEnLaTanda = { regalos: new Map(), vivos: new Set(['c9']) }
    expect(guardaDelRegalo(item, ctx, new Set())).toEqual({ tipo: 'enviar' })
    expect(guardaDelRegalo(item, { ...ctx, vivos: new Set(['c1']) }, new Set())).toMatchObject({ tipo: 'cancelar' })
    expect(guardaDelRegalo(item, ctx, new Set(['c1']))).toEqual({ tipo: 'cancelar', motivo: 'Le llega otro regalo en este mismo envío' })
  })

  it('lo que llega del navegador: el motivo en español si algo falta', () => {
    const bien = { regalo: { id: 'r1' }, vence: 'domingo', audiencia: 't4', cuando: 'hoy' }
    expect(leerEntradaDelRegalo(bien)).toEqual({ ok: true, entrada: bien })
    expect(leerEntradaDelRegalo({ ...bien, regalo: { titulo: 'Café gratis' } })).toMatchObject({ ok: true })
    expect(leerEntradaDelRegalo({ ...bien, regalo: {} })).toMatchObject({ ok: false, error: 'Elige un regalo del catálogo o escribe uno.' })
    expect(leerEntradaDelRegalo({ ...bien, vence: '30' })).toMatchObject({ ok: false })
    expect(leerEntradaDelRegalo({ ...bien, audiencia: 'archivados' })).toMatchObject({ ok: false, error: 'Elige a quién se lo mandas.' })
    expect(leerEntradaDelRegalo(null)).toMatchObject({ ok: false })
  })
})

// ═══════════════════════════════════════════════════════════════
describe('los textos del creador', () => {
  it('el cupo: «Hoy puedes mandar 180», y nunca un número inventado', () => {
    expect(textoDelCupo({ estado: 'con_tope', hoy: 180, por_dia: 250 }, true)).toBe(
      'Hoy puedes mandar 180. Si son más, el resto sale en los días siguientes.'
    )
    expect(textoDelCupo({ estado: 'con_tope', hoy: 180, por_dia: 250 }, false)).toContain('hasta 250 al día')
    expect(textoDelCupo({ estado: 'no_se_pudo', hoy: null, por_dia: null }, true)).not.toMatch(/\d/)
    expect(textoDelCupo({ estado: 'congelada', hoy: null, por_dia: null }, true)).toContain('detenida por calidad')
  })

  it('por qué no lo reciben, en palabras', () => {
    expect(textoNoLoReciben({ regalo_vivo: 0, siete_dias: 0, tope_mes: 0 })).toBeNull()
    expect(textoNoLoReciben({ regalo_vivo: 1, siete_dias: 3, tope_mes: 0 })).toBe(
      '1 ya tiene un regalo vivo · 3 recibieron otro mensaje hace menos de 7 días'
    )
  })

  it('el adaptador dicho en pantalla (spec §4)', () => {
    expect(avisoDePlantillaDelRegalo({ clave: 'gift_expiring', regalo_que_vence: 'aprobada' })).toBeNull()
    expect(avisoDePlantillaDelRegalo({ clave: 'reactivation_aggressive', regalo_que_vence: 'pendiente' })).toContain('en revisión de Meta')
    expect(avisoDePlantillaDelRegalo({ clave: 'reactivation_aggressive', regalo_que_vence: 'sin_plantilla' })).toContain('El regalo igual llega a la tarjeta')
    expect(avisoDePlantillaDelRegalo({ clave: null, regalo_que_vence: 'sin_plantilla' })).toContain('Plantillas')
  })

  it('la vista previa del regalo es el cuerpo del catálogo con el regalo y la fecha', () => {
    const v = {
      cuerpos: {
        gift_expiring: buildTemplateBody('gift_expiring', 'Sushi Service', '🍣'),
        reactivation_aggressive: buildTemplateBody('reactivation_aggressive', 'Sushi Service', '🍣'),
        event_image: '',
      },
      ejemplo: { nombre: 'Sara', puntos: 412, premio_proximo: 'Plata', camino: '🥈 Plata 412/450' },
    }
    const nueva = vistaPreviaDelWhatsAppDelRegalo(v, 'gift_expiring', 'Postre del chef', 'domingo 18 de octubre')
    expect(nueva).toContain('Te guardamos *Postre del chef*. Ven antes del *domingo 18 de octubre*')
    expect(nueva).not.toMatch(/\{\{\d\}\}/)
    const vieja = vistaPreviaDelWhatsAppDelRegalo(v, 'reactivation_aggressive', 'Postre del chef', 'domingo 18 de octubre')
    expect(vieja).toContain('Tus *412 puntos*')
    expect(rellenarPlantilla('{{1}} y {{9}}', { '1': 'a' })).toBe('a y ')
  })

  it('el evento: texto sugerido en UNA línea, el cierre igual al del servidor, la fecha igual a la del envío', () => {
    const t = textoSugeridoDelEvento('  Noche   de sushi ', '2026-10-17')
    expect(t).toBe('El sábado 17 de octubre tenemos Noche de sushi. Ven con tu tarjeta: sumas puntos y te acercas a tu próximo premio. ¡Te esperamos!')
    expect(t).not.toMatch(/\n/)
    expect(textoDeUnaLinea('Hola\n\n  mundo\r\n  y  más')).toBe('Hola mundo y más')
    for (const [texto, enlace] of [
      ['¡Promo 2x1!', 'https://x.co/a'],
      ['', null],
      ['  ', 'https://x.co/b'],
      ['Ven', ''],
    ] as const) {
      expect(ctaDelEvento(texto, enlace)).toBe(buildEventCta(texto, enlace))
    }
    // `formatEventDate()` del servidor: la fecha local con `toLocaleDateString('es-CO')`.
    expect(fechaDeLaInvitacion('2026-10-17')).toBe(new Date(2026, 9, 17).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }))
  })

  it('la invitación sale el día del evento a la hora de la marca (en Bogotá)', () => {
    expect(salidaDeLaInvitacion('2026-10-17', '16:30')).toBe('2026-10-17T21:30:00.000Z')
    expect(salidaDeLaInvitacion('2026-10-17', '10:30')).toBe('2026-10-17T15:30:00.000Z')
    expect(salidaDeLaInvitacion('17/10/2026', '16:30')).toBeNull()
    expect(textoDelBotonDelEvento('2026-10-17', '16:30')).toBe('Programar para el sábado 17 de octubre a las 4:30 pm')
  })

  it('«incluir dormidos»: con el ciclo encendido suma a los dormidos solo si se marca; apagado, siempre', () => {
    expect(invitadosDelEvento({ enElCiclo: 341, dormidos: 508, encendido: true, incluirDormidos: false })).toBe(341)
    expect(invitadosDelEvento({ enElCiclo: 341, dormidos: 508, encendido: true, incluirDormidos: true })).toBe(849)
    expect(invitadosDelEvento({ enElCiclo: 341, dormidos: 508, encendido: false, incluirDormidos: false })).toBe(849)
  })

  it('la vista previa del evento no deja variables sin llenar', () => {
    const cuerpo = buildTemplateBody('event_image', 'Sushi Service', '🍣')
    const texto = vistaPreviaDelWhatsAppDelEvento(cuerpo, {
      cliente: 'Sara',
      marca: 'Sushi Service',
      nombre: 'Noche de sushi',
      fecha: '2026-10-17',
      texto: 'Barra libre\nhasta las 10',
      enlace: 'https://x.co/r',
    })
    expect(texto).toContain('*Noche de sushi*')
    expect(texto).toContain('Barra libre hasta las 10 👉 https://x.co/r')
    expect(texto).not.toMatch(/\{\{\d\}\}/)
  })
})

// ═══════════════════════════════════════════════════════════════
describe('punto 5: encender o apagar el ciclo lo hace SOLO el operador de Cada1 (H7)', () => {
  const base = { valor: 'true', proveedor: 'twilio', valorActual: null }

  it('un super usuario de la marca recibe 403 con el motivo en español', () => {
    expect(decidirEscrituraDeAjuste({ key: 'cycle_enabled', ...base, esOperador: false })).toEqual({
      ok: false,
      status: 403,
      error: CLAVES_DEL_OPERADOR.get('cycle_enabled'),
    })
    expect(CLAVES_DEL_OPERADOR.get('cycle_enabled')).toContain('Encender o apagar el ciclo lo hace el equipo de Cada1')
  })

  it('el operador sí; y el resto de los ajustes del ciclo siguen siendo de la marca', () => {
    expect(decidirEscrituraDeAjuste({ key: 'cycle_enabled', ...base, esOperador: true })).toEqual({ ok: true, escribir: true })
    for (const key of ['cycle_rhythm', 'cycle_small_reward_ids', 'cycle_strong_reward_id', 'cycle_send_slot']) {
      expect(decidirEscrituraDeAjuste({ key, ...base, esOperador: false })).toEqual({ ok: true, escribir: true })
    }
  })

  it('una clave del sistema sigue siendo 400 aunque escriba el operador', () => {
    expect(decidirEscrituraDeAjuste({ key: 'cycle_enabled_at', ...base, esOperador: true })).toMatchObject({ ok: false, status: 400 })
  })
})
