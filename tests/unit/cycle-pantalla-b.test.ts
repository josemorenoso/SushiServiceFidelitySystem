/**
 * La pantalla «Ciclo» de Campañas, lo PURO (fase 2 parte B, 2026-10-14).
 *
 * La parte B dibuja la pantalla con los endpoints de la parte A. Lo que se fija acá es lo que
 * NO necesita un navegador: qué se le muestra al dueño y qué NO.
 *
 *   · LA REGLA DE ORO: un fallo nunca es un cero. `leerJson()` y `leerPortadaDelCiclo()` devuelven
 *     `{ ok: false }` ante un 500, una red caída o un 200 con otra forma; los formateadores dan
 *     «—» ante un dato que falta y los tres números de arriba no inventan un «0».
 *   · Un solo motor: las barras del histograma caen en la misma caja que dice el cron (se prueba
 *     contra `boxOf()`/`bandsFromConfig()` con los cuatro ritmos, no contra números copiados).
 *   · Quién ve qué: «Hoy no» solo con permiso de marca; el interruptor solo el operador.
 *   · Cero hex: ningún color horneado en la lógica de la pantalla.
 *
 * Contra el código anterior: `src/lib/cycle-screen.ts` y `contarPorDia()` no existen (el archivo
 * no carga y los 100 % de estos casos caen).
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bandsFromConfig,
  boxOf,
  CYCLE_RHYTHMS,
  daysForRhythm,
  STAGE_LABELS,
  type CycleBoxKey,
} from '@/lib/cycle-engine'
import {
  COLOR_DE_CAJA,
  COLOR_DE_TARJETA,
  MENSAJE_NO_SE_PUDO_LEER_EL_CICLO,
  MENSAJE_SESION_VENCIDA,
  QUE_RECIBEN,
  RUTAS_DEL_CICLO,
  SIN_DATO,
  barrasPorDia,
  botonesDeTarjeta,
  cajaDelDia,
  cantidad,
  claveDeOk,
  consultaDeLista,
  detalleDeCliente,
  enCuantosDias,
  enlaceParaCrearEvento,
  enlaceParaSubirFoto,
  esPortadaDelCiclo,
  estadoDelCiclo,
  fechaCorta,
  fechaLarga,
  frasesDelRitmo,
  hoyEnBogota,
  horaLegible,
  leerJson,
  leerPortadaDelCiclo,
  mostrarPrimerUso,
  numerosDeArriba,
  opcionesDeRitmo,
  pasosDelPrimerUso,
  pildoraDeCliente,
  porcentaje,
  porcentajeDeNuevos,
  progresoDelPrimerUso,
  rangoDeCaja,
  regaloDeCaja,
  textoDeRetorno,
  textoSegundaVisita,
  textoUltimoToque,
  vistaDeUrl,
  type PortadaDelCiclo,
} from '@/lib/cycle-screen'
import {
  contarPorDia,
  DIAS_DESPUES_DE_LA_DESPEDIDA,
  type CajaDelCiclo,
  type ClienteDeLaLista,
  type PrimerUso,
  type RetornoDeEtapa,
  type TarjetaParaHoy,
} from '@/services/cycle-overview.service'

// ═══════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════

const sinRetorno = (): RetornoDeEtapa => ({
  con_mensaje: { toques: 0, volvieron: 0, pct: null },
  sin_mensaje: { toques: 0, volvieron: 0, pct: null },
})

function caja(key: CycleBoxKey, desde: number, hasta: number | null, total: number, nuevos: number, extra: Partial<CajaDelCiclo> = {}): CajaDelCiclo {
  return {
    key,
    etiqueta: STAGE_LABELS[key],
    desde,
    hasta,
    total,
    nuevos,
    ya_volvieron: total - nuevos,
    hoy_entran: 0,
    regalo: null,
    retorno: key === 'reciente' ? null : sinRetorno(),
    ...extra,
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
      caja('t4', 60, 79, 23, 15, { regalo: '½ rollo gratis', hoy_entran: 2 }),
      caja('t5', 80, null, 9, 4),
    ],
    dormidos: {
      etiqueta: 'Dormidos', total: 508, nuevos: 315, ya_volvieron: 193, sin_toques_hace_6_meses: 193, hoy_entran: 3, regalo: 'Postre del chef', retorno: sinRetorno(),
    },
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
      regalo_fuerte: { listo: true, titulo: '½ rollo gratis', elegido_inactivo: false },
      plantilla_regalo: { estado: 'pendiente' },
      listos: 2,
      total: 3,
    },
    para_hoy: [],
    por_dia: null,
    permisos: { aprobar: true, interruptor: false },
    ...extra,
  }
}

const respuesta = (status: number, cuerpo: unknown) =>
  vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }) as unknown as Response) as unknown as typeof fetch

// ═══════════════════════════════════════════════════════════════
// 1 · Un dato que falta es «—», nunca «0»
// ═══════════════════════════════════════════════════════════════

describe('cantidad / porcentaje: lo que falta no es cero', () => {
  it('null, undefined y NaN son «—»; un cero REAL sigue siendo «0»', () => {
    for (const v of [null, undefined, NaN, Infinity]) expect(cantidad(v)).toBe(SIN_DATO)
    expect(cantidad(0)).toBe('0')
    expect(porcentaje(null)).toBe(SIN_DATO)
    expect(porcentaje(undefined)).toBe(SIN_DATO)
    expect(porcentaje(0)).toBe('0 %')
  })

  it('separa miles y usa coma decimal (es-CO)', () => {
    expect(cantidad(12345)).toBe('12.345')
    expect(porcentaje(17.5)).toBe('17,5 %')
  })
})

describe('fechas y horas legibles', () => {
  it('fechaLarga / fechaCorta / horaLegible / enCuantosDias', () => {
    expect(fechaLarga('2026-10-17')).toBe('sábado 17 de octubre')
    expect(fechaLarga('2026-10-04')).toBe('domingo 4 de octubre')
    expect(fechaLarga('no es fecha')).toBe('no es fecha')
    expect(fechaCorta('2026-05-18')).toBe('18 de mayo')
    expect(horaLegible('16:30')).toBe('4:30 pm')
    expect(horaLegible('10:30')).toBe('10:30 am')
    expect(horaLegible('00:15')).toBe('12:15 am')
    expect(enCuantosDias(0)).toBe('hoy')
    expect(enCuantosDias(1)).toBe('mañana')
    expect(enCuantosDias(13)).toBe('en 13 días')
  })

  it('hoyEnBogota: a las 22:00 de Bogotá todavía es «hoy», aunque en UTC ya sea mañana', () => {
    expect(hoyEnBogota(new Date('2026-10-15T03:00:00Z'))).toBe('2026-10-14')
    expect(hoyEnBogota(new Date('2026-10-15T05:30:00Z'))).toBe('2026-10-15')
  })
})

// ═══════════════════════════════════════════════════════════════
// 2 · LA REGLA DE ORO: un fallo de lectura nunca se dibuja como ceros
// ═══════════════════════════════════════════════════════════════

describe('leerJson: ante un fallo, {ok:false} — jamás datos vacíos', () => {
  it('un 500 con el motivo del servidor lo lee el dueño', async () => {
    const r = await leerJson('/x', 'por defecto', { fetchFn: respuesta(500, { error: 'Se cayó la base' }) })
    expect(r).toEqual({ ok: false, mensaje: 'Se cayó la base' })
  })

  it('`message` gana sobre `error` (el PUT de Ajustes: «Problema técnico» no se le lee a nadie)', async () => {
    const r = await leerJson('/x', 'por defecto', {
      fetchFn: respuesta(503, { error: 'Problema técnico', message: 'No pudimos guardar la configuración ahora mismo.' }),
    })
    expect(r).toEqual({ ok: false, mensaje: 'No pudimos guardar la configuración ahora mismo.' })
  })

  it('un 500 sin cuerpo usable, una red caída y un 200 que no es JSON dicen el mensaje por defecto', async () => {
    const sinCuerpo = vi.fn(async () => ({ ok: false, status: 500, json: async () => { throw new Error('no json') } }) as unknown as Response) as unknown as typeof fetch
    expect(await leerJson('/x', 'por defecto', { fetchFn: sinCuerpo })).toEqual({ ok: false, mensaje: 'por defecto' })
    const caida = vi.fn(async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    expect(await leerJson('/x', 'por defecto', { fetchFn: caida })).toEqual({ ok: false, mensaje: 'por defecto' })
    const noJson = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('no json') } }) as unknown as Response) as unknown as typeof fetch
    expect(await leerJson('/x', 'por defecto', { fetchFn: noJson })).toEqual({ ok: false, mensaje: 'por defecto' })
  })

  it('un 401 dice que la sesión venció', async () => {
    const r = await leerJson('/x', 'por defecto', { fetchFn: respuesta(401, { error: 'No autorizado' }) })
    expect(r).toEqual({ ok: false, mensaje: MENSAJE_SESION_VENCIDA })
  })

  it('un 200 con un objeto es ok; siempre pide la lectura fresca (no-store)', async () => {
    const f = respuesta(200, { hola: 1 })
    const r = await leerJson<{ hola: number }>('/x', 'por defecto', { fetchFn: f })
    expect(r).toEqual({ ok: true, datos: { hola: 1 } })
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(['/x', { cache: 'no-store' }])
  })
})

describe('leerPortadaDelCiclo: la portada o un error, nunca una portada vacía', () => {
  it('un 500 (la ruta contesta el mensaje para el dueño) es error con ese mensaje', async () => {
    const r = await leerPortadaDelCiclo({ fetchFn: respuesta(500, { error: MENSAJE_NO_SE_PUDO_LEER_EL_CICLO }) })
    expect(r).toEqual({ ok: false, mensaje: MENSAJE_NO_SE_PUDO_LEER_EL_CICLO })
  })

  it('un 200 con otra forma ({} o sin cajas) también es error: no se dibuja con ceros', async () => {
    for (const cuerpo of [{}, { cajas: [] }, { cajas: [], dormidos: { total: 1 } }, { error: 'x' }]) {
      const r = await leerPortadaDelCiclo({ fetchFn: respuesta(200, cuerpo) })
      expect(r.ok).toBe(false)
    }
  })

  it('una portada real pasa; `mini` pide `?mini=1`', async () => {
    const f = respuesta(200, portada())
    const r = await leerPortadaDelCiclo({ mini: true, fetchFn: f })
    expect(r.ok).toBe(true)
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/dashboard/cycle/overview?mini=1')
    const g = respuesta(200, portada())
    await leerPortadaDelCiclo({ fetchFn: g })
    expect((g as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/dashboard/cycle/overview')
  })

  it('esPortadaDelCiclo no deja pasar basura', () => {
    expect(esPortadaDelCiclo(portada())).toBe(true)
    expect(esPortadaDelCiclo(null)).toBe(false)
    expect(esPortadaDelCiclo('x')).toBe(false)
    expect(esPortadaDelCiclo({ ...portada(), cajas: undefined })).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// 3 · Las cajas
// ═══════════════════════════════════════════════════════════════

describe('cajas: rango, nuevos contra ya volvieron, retorno', () => {
  it('rangoDeCaja: «Recién vino» no es «sin venir»; la Despedida no tiene tope', () => {
    expect(rangoDeCaja({ key: 'reciente', desde: 0, hasta: 13 })).toBe('día 0–13')
    expect(rangoDeCaja({ key: 't1', desde: 14, hasta: 27 })).toBe('día 14–27 sin venir')
    expect(rangoDeCaja({ key: 't5', desde: 80, hasta: null })).toBe('día 80+ sin venir')
  })

  it('porcentajeDeNuevos: una caja vacía no pinta barra; nunca pasa de 0–100', () => {
    expect(porcentajeDeNuevos({ total: 0, nuevos: 0 })).toBe(0)
    expect(porcentajeDeNuevos({ total: 23, nuevos: 15 })).toBe(65)
    expect(porcentajeDeNuevos({ total: 10, nuevos: 99 })).toBe(100)
  })

  it('textoDeRetorno: sin toques medibles NO es «0 %»; con datos dice con y sin mensaje', () => {
    expect(textoDeRetorno(null)).toBeNull()
    expect(textoDeRetorno(sinRetorno())).toBe('Aún sin toques que medir')
    expect(textoDeRetorno(sinRetorno())).not.toContain('0 %')
    const conControl: RetornoDeEtapa = {
      con_mensaje: { toques: 40, volvieron: 7, pct: 17.5 },
      sin_mensaje: { toques: 5, volvieron: 0, pct: 0 },
    }
    expect(textoDeRetorno(conControl)).toBe('Volvieron en 2 semanas: 17,5 % · sin mensaje 0 %')
    const sinControl: RetornoDeEtapa = { con_mensaje: { toques: 40, volvieron: 7, pct: 17.5 }, sin_mensaje: { toques: 0, volvieron: 0, pct: null } }
    expect(textoDeRetorno(sinControl)).toBe('Volvieron en 2 semanas: 17,5 %')
  })

  it('regaloDeCaja', () => {
    expect(regaloDeCaja('Postre del chef')).toBe('🎁 Postre del chef')
    expect(regaloDeCaja(null)).toBe('sin regalo')
  })

  it('las siete cajas tienen color y explicación; el vocabulario de ingeniero no aparece', () => {
    const claves = ['reciente', 't1', 't2', 't3', 't4', 't5', 'dormidos'] as const
    for (const k of claves) {
      expect(COLOR_DE_CAJA[k]).toBeTruthy()
      expect(QUE_RECIBEN[k].length).toBeGreaterThan(10)
    }
    const todo = JSON.stringify([QUE_RECIBEN, Object.values(STAGE_LABELS)]).toLowerCase()
    for (const prohibida of ['archivado', 'holdout', 'cola', 'heartbeat']) expect(todo).not.toContain(prohibida)
  })
})

describe('«Cero hex»: los colores salen de --brand-*, nada horneado', () => {
  it('ningún valor de COLOR_DE_CAJA ni de COLOR_DE_TARJETA es un hex, y todos nacen de var(--brand-*)', () => {
    for (const v of [...Object.values(COLOR_DE_CAJA), ...Object.values(COLOR_DE_TARJETA)]) {
      expect(v).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(v).toContain('var(--brand-')
    }
  })

  it('ni la lógica ni ningún componente de la pantalla tienen un literal hex', () => {
    const archivos = [
      'src/lib/cycle-screen.ts',
      ...[
        'CajasDelCiclo', 'CicloPantalla', 'ComoDecide', 'EstadoDelCiclo', 'HistorialDeCampanas',
        'ListaDeCaja', 'MiniCiclo', 'NumerosDeArriba', 'ParaHoy', 'PrimerUso', 'VerPorDia',
      ].map((c) => `src/components/dashboard/cycle/${c}.tsx`),
    ]
    for (const a of archivos) {
      const fuente = readFileSync(join(process.cwd(), a), 'utf8')
      expect(fuente, a).not.toMatch(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-zA-Z-])/)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// 4 · Los números de arriba: ninguno es «enviados», ninguno inventa un cero
// ═══════════════════════════════════════════════════════════════

describe('numerosDeArriba', () => {
  it('con datos y grupo de control: «con mensaje 14 %, sin mensaje 6 %»', () => {
    const [volvieron, stock, evento] = numerosDeArriba(portada())
    expect(volvieron.valor).toBe('31')
    expect(volvieron.detalle).toBe('Con mensaje volvieron el 14 % · sin mensaje, el 6 %.')
    expect(stock.valor).toBe('223')
    expect(stock.sufijo).toBe('· 508 dormidos')
    expect(evento.valor).toBe('Noche de sushi')
    expect(evento.sufijo).toBe('en 3 días')
    expect(evento.detalle).toBe('sábado 17 de octubre · 412 invitados')
    expect(evento.aviso).toBe('falta la foto')
  })

  it('ninguno de los tres es «enviados»', () => {
    const texto = JSON.stringify(numerosDeArriba(portada())).toLowerCase()
    expect(texto).not.toContain('enviados')
    expect(texto).not.toContain('mensajes enviados')
  })

  it('sin grupo de control todavía: lo dice, no inventa un «sin mensaje 0 %»', () => {
    const p = portada()
    p.numeros.volvieron_por_mensaje = { clientes: 9, con_mensaje_pct: 12, sin_mensaje_pct: null }
    const [volvieron] = numerosDeArriba(p)
    expect(volvieron.detalle).toContain('Todavía no hay clientes «sin mensaje» para comparar')
    expect(volvieron.detalle).not.toContain('sin mensaje, el')
  })

  it('sin toques medibles NO es «0 volvieron»: es «—» y dice por qué', () => {
    const p = portada()
    p.numeros.volvieron_por_mensaje = { clientes: 0, con_mensaje_pct: null, sin_mensaje_pct: null }
    const [volvieron] = numerosDeArriba(p)
    expect(volvieron.valor).toBe(SIN_DATO)
    expect(volvieron.detalle).toContain('Aún no hay toques')

    p.numeros.volvieron_por_mensaje = null
    expect(numerosDeArriba(p)[0].valor).toBe(SIN_DATO)
  })

  it('sin próximo evento, lo dice; sin invitados (evento «solo recordarme») no inventa un número', () => {
    const p = portada()
    p.numeros.proximo_evento = null
    expect(numerosDeArriba(p)[2]).toMatchObject({ valor: 'Ninguno', detalle: 'No hay eventos en los próximos 60 días.' })
    p.numeros.proximo_evento = { id: 'e', titulo: 'Cena', fecha: '2026-10-20', dias: 0, estado: 'planned', invitados: null, sin_foto: false }
    const ev = numerosDeArriba(p)[2]
    expect(ev.sufijo).toBe('hoy')
    expect(ev.detalle).toBe('martes 20 de octubre')
    expect(ev.aviso).toBeUndefined()
  })

  it('la segunda visita (A12): una frase con la cohorte; sin cohorte no hay frase (no un 0 %)', () => {
    expect(textoSegundaVisita(portada().segunda_visita)).toBe(
      'Segunda visita: de los 210 que vinieron por primera vez entre el 18 de mayo y el 15 de agosto, 47 (22,4 %) volvieron dentro de 60 días.'
    )
    expect(textoSegundaVisita({ ventana_dias: 60, desde: '2026-05-18', hasta: '2026-08-15', clientes: 0, volvieron: 0, pct: null })).toBeNull()
    expect(textoSegundaVisita(null)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// 5 · Primer uso (spec §6.0)
// ═══════════════════════════════════════════════════════════════

describe('primer uso: tres pasos, cada uno lleva a donde se arregla', () => {
  const primerUso = (extra: Partial<PrimerUso> = {}): PrimerUso => ({
    regalo_pequeno: { listo: false, titulo: null, elegido_inactivo: false },
    regalo_fuerte: { listo: false, titulo: null, elegido_inactivo: false },
    plantilla_regalo: { estado: 'sin_plantilla' },
    listos: 0,
    total: 3,
    ...extra,
  })

  it('nada listo: los regalos llevan a Recompensas › Premios para regalar; la plantilla, a Plantillas', () => {
    const [pequeno, fuerte, plantilla] = pasosDelPrimerUso(primerUso())
    expect(pequeno.enlace?.href).toBe('/dashboard/rewards?tab=premios')
    expect(fuerte.enlace?.href).toBe('/dashboard/rewards?tab=premios')
    expect(plantilla.enlace?.href).toBe('/dashboard/templates')
    expect(RUTAS_DEL_CICLO.regalos).toBe('/dashboard/rewards?tab=premios')
    expect(pequeno.texto).toContain('«Le regalamos algo» sale sin regalo')
    expect(fuerte.texto).toContain('El Rescate sale sin regalo')
  })

  it('un regalo elegido que ya no está activo se dice distinto de «sin elegir»', () => {
    const [pequeno] = pasosDelPrimerUso(primerUso({ regalo_pequeno: { listo: false, titulo: null, elegido_inactivo: true } }))
    expect(pequeno.texto).toContain('ya no está activo')
  })

  it('listo = el nombre del regalo, sin enlace; plantilla en revisión dice qué pasa mientras tanto', () => {
    const pasos = pasosDelPrimerUso(
      primerUso({
        regalo_pequeno: { listo: true, titulo: 'Postre del chef', elegido_inactivo: false },
        plantilla_regalo: { estado: 'pendiente' },
      })
    )
    expect(pasos[0]).toMatchObject({ listo: true, texto: 'Postre del chef' })
    expect(pasos[0].enlace).toBeUndefined()
    expect(pasos[2].texto).toContain('en revisión de Meta')
    expect(pasos[2].texto).toContain('mensaje insistente de siempre')
    expect(pasos[2].enlace).toBeUndefined()
  })

  it('se muestra hasta que estén los tres; la barra es listos/total', () => {
    expect(mostrarPrimerUso(null)).toBe(false)
    expect(mostrarPrimerUso(primerUso({ listos: 2 }))).toBe(true)
    expect(mostrarPrimerUso(primerUso({ listos: 3 }))).toBe(false)
    expect(progresoDelPrimerUso({ listos: 2, total: 3 })).toBe(67)
    expect(progresoDelPrimerUso({ listos: 0, total: 0 })).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// 6 · El ritmo y el interruptor: quién ve qué
// ═══════════════════════════════════════════════════════════════

describe('el ritmo de la marca, en palabras de dueño', () => {
  it('«Tus clientes vuelven cada mes» + de dónde salió', () => {
    expect(frasesDelRitmo(portada().ritmo)).toEqual({
      principal: 'Tus clientes vuelven cada mes',
      origen: 'Calculado con 135 regresos de tu marca.',
    })
    expect(frasesDelRitmo({ ...portada().ritmo, origen: 'dueno' }).origen).toBe('Lo elegiste tú.')
    const poco = frasesDelRitmo({ ...portada().ritmo, origen: 'por_defecto', regresos: 12 })
    expect(poco.origen).toContain('12 de 30')
  })

  it('opcionesDeRitmo: «que lo calcule el sistema» + los cuatro; marca la que rige', () => {
    const calculado = opcionesDeRitmo({ marca: 'restaurant', origen: 'calculado' })
    expect(calculado.map((o) => o.valor)).toEqual(['auto', ...CYCLE_RHYTHMS])
    expect(calculado.filter((o) => o.elegida).map((o) => o.valor)).toEqual(['auto'])
    const elegido = opcionesDeRitmo({ marca: 'cafe', origen: 'dueno' })
    expect(elegido.filter((o) => o.elegida).map((o) => o.valor)).toEqual(['cafe'])
    expect(elegido.find((o) => o.valor === 'cafe')?.etiqueta).toBe('Cada semana')
  })
})

describe('estadoDelCiclo: el interruptor lo ve SOLO el operador de Cada1', () => {
  const apagado: PortadaDelCiclo['ciclo'] = { encendido: false, encendido_desde: null, hora: '16:30', grupo_de_control_pct: 0 }
  const encendido = portada().ciclo

  it('apagado: lo dice en una línea; el dueño no ve botón, el operador sí', () => {
    const dueno = estadoDelCiclo(apagado, { aprobar: true, interruptor: false })
    expect(dueno.encendido).toBe(false)
    expect(dueno.titular).toBe('El ciclo está apagado en tu marca')
    expect(dueno.detalle).toContain('reactivación de siempre')
    expect(dueno.botonDeInterruptor).toBeNull()
    expect(estadoDelCiclo(apagado, { aprobar: false, interruptor: false }).botonDeInterruptor).toBeNull()
    expect(estadoDelCiclo(apagado, null).botonDeInterruptor).toBeNull()
    expect(estadoDelCiclo(apagado, { aprobar: true, interruptor: true }).botonDeInterruptor).toBe('encender')
  })

  it('encendido: dice la hora de la marca; solo el operador puede apagarlo', () => {
    const dueno = estadoDelCiclo(encendido, { aprobar: true, interruptor: false })
    expect(dueno.titular).toBe('El ciclo está encendido')
    expect(dueno.detalle).toContain('4:30 pm')
    expect(dueno.detalle).toContain('martes 13 de octubre')
    expect(dueno.botonDeInterruptor).toBeNull()
    expect(estadoDelCiclo(encendido, { aprobar: true, interruptor: true }).botonDeInterruptor).toBe('apagar')
  })
})

// ═══════════════════════════════════════════════════════════════
// 7 · «Para hoy»: aprobar, no crear
// ═══════════════════════════════════════════════════════════════

describe('botonesDeTarjeta', () => {
  const tarjeta = (extra: Partial<TarjetaParaHoy>): TarjetaParaHoy => ({
    id: 't', tipo: 'trimestral', texto: '…', clientes: 31, dias: 0, acciones: ['ok', 'cambiar_regalo', 'hoy_no'], ...extra,
  })

  it('trimestral: OK · Cambiar regalo · Hoy no — «Hoy no» solo con permiso de marca', () => {
    const conPermiso = botonesDeTarjeta(tarjeta({}), { aprobar: true })
    expect(conPermiso.map((b) => b.etiqueta)).toEqual(['OK', 'Cambiar regalo', 'Hoy no'])
    const sinPermiso = botonesDeTarjeta(tarjeta({}), { aprobar: false })
    expect(sinPermiso.map((b) => b.etiqueta)).toEqual(['OK', 'Cambiar regalo'])
    expect(botonesDeTarjeta(tarjeta({}), null).map((b) => b.etiqueta)).toEqual(['OK', 'Cambiar regalo'])
  })

  it('OK y Hoy no actúan en el lugar (sin enlace); Cambiar regalo lleva a Recompensas', () => {
    const [ok, cambiar, hoyNo] = botonesDeTarjeta(tarjeta({}), { aprobar: true })
    expect(ok.href).toBeUndefined()
    expect(hoyNo.href).toBeUndefined()
    expect(cambiar.href).toBe('/dashboard/rewards?tab=premios')
  })

  it('Elegir regalo → Recompensas; Crear evento trae la fecha y el nombre; Subir foto trae el evento', () => {
    const elegir = botonesDeTarjeta(tarjeta({ tipo: 'rescate_sin_regalo', acciones: ['elegir_regalo'] }), { aprobar: true })
    expect(elegir[0]).toMatchObject({ etiqueta: 'Elegir regalo', href: '/dashboard/rewards?tab=premios' })

    const crear = botonesDeTarjeta(
      tarjeta({ tipo: 'fecha_especial', acciones: ['crear_evento'], fecha: '2026-10-31', nombre: 'Halloween' }),
      { aprobar: true }
    )
    expect(crear[0].href).toBe('/dashboard/calendar?fecha=2026-10-31&nombre=Halloween')
    expect(enlaceParaCrearEvento({})).toBe('/dashboard/calendar')

    const foto = botonesDeTarjeta(tarjeta({ tipo: 'evento_sin_foto', acciones: ['subir_foto'], evento_id: 'ev-1' }), { aprobar: false })
    expect(foto[0]).toMatchObject({ etiqueta: 'Subir foto', href: '/dashboard/calendar?evento=ev-1' })
    expect(enlaceParaSubirFoto({})).toBe('/dashboard/calendar')
  })

  it('el «OK» recordado vale solo HOY', () => {
    expect(claveDeOk('trimestral', '2026-10-14')).not.toBe(claveDeOk('trimestral', '2026-10-15'))
  })
})

// ═══════════════════════════════════════════════════════════════
// 8 · «Ver por día»: las barras caen en la misma caja que dice el motor
// ═══════════════════════════════════════════════════════════════

describe('contarPorDia (el conteo que se suma a la portada)', () => {
  it('cuenta por día, manda lo que no cabe a `mas_alla` y conserva el total', () => {
    const r = contarPorDia([0, 0, 3, 3, 3, 5, 99, 120], 6)
    expect(r.conteo).toEqual([2, 0, 0, 3, 0, 1])
    expect(r.mas_alla).toBe(2)
    expect(r.conteo.reduce((a, b) => a + b, 0) + r.mas_alla).toBe(8)
  })

  it('un día negativo no se cuela; un largo 0 manda todo a `mas_alla`', () => {
    expect(contarPorDia([-1, 2], 4).conteo).toEqual([0, 0, 1, 0])
    expect(contarPorDia([1, 2], 0)).toEqual({ conteo: [], mas_alla: 2 })
  })

  it('el largo que usa la portada cubre la Despedida y deja 10 días más', () => {
    expect(DIAS_DESPUES_DE_LA_DESPEDIDA).toBe(10)
  })
})

describe('barrasPorDia / cajaDelDia: el color de una barra es la caja del motor, para los cuatro ritmos', () => {
  for (const ritmo of CYCLE_RHYTHMS) {
    for (const tieneDomicilio of [true, false]) {
      it(`${ritmo} ${tieneDomicilio ? 'con' : 'sin'} domicilio: día por día coincide con boxOf()`, () => {
        const cajas = bandsFromConfig(ritmo, { tieneDomicilio }).map((c) => ({
          key: c.key,
          desde: c.minDays,
          hasta: Number.isFinite(c.maxDays) ? c.maxDays : null,
        }))
        const  ultimo = daysForRhythm(ritmo)[4] + DIAS_DESPUES_DE_LA_DESPEDIDA
        for (let d = 0; d <= ultimo; d++) {
          expect(cajaDelDia(d, cajas), `día ${d}`).toBe(boxOf(d, ritmo, { tieneDomicilio }))
        }
      })
    }
  }

  it('sin datos (versión mini) no hay barras; con datos, una barra por día y el máximo', () => {
    expect(barrasPorDia(null, [])).toEqual({ barras: [], maximo: 0, masAlla: 0 })
    const cajas = [
      { key: 'reciente' as const, desde: 0, hasta: 13 },
      { key: 't1' as const, desde: 14, hasta: null },
    ]
    const r = barrasPorDia({ conteo: [1, 5, 0, 2], mas_alla: 7 }, cajas)
    expect(r.barras.map((b) => b.clientes)).toEqual([1, 5, 0, 2])
    expect(r.maximo).toBe(5)
    expect(r.masAlla).toBe(7)
    expect(r.barras.every((b) => b.caja === 'reciente')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// 9 · La lista de quiénes
// ═══════════════════════════════════════════════════════════════

describe('la lista: consulta, pastilla y detalle', () => {
  it('consultaDeLista: UN filtro por consulta, paginada de a 20', () => {
    expect(consultaDeLista({ tipo: 'caja', clave: 't4' })).toBe('/api/dashboard/cycle/customers?stage=t4&page=1&limit=20')
    expect(consultaDeLista({ tipo: 'caja', clave: 'reciente' }, 2)).toBe('/api/dashboard/cycle/customers?stage=reciente&page=2&limit=20')
    expect(consultaDeLista({ tipo: 'caja', clave: 'dormidos' })).toBe('/api/dashboard/cycle/customers?state=dormido&page=1&limit=20')
    expect(consultaDeLista({ tipo: 'dia', dia: 42 })).toBe('/api/dashboard/cycle/customers?day=42&page=1&limit=20')
  })

  it('pildoraDeCliente: nuevo contra «volvió N veces»', () => {
    expect(pildoraDeCliente({ nuevo: true, visitas: 1 })).toEqual({ texto: 'nuevo · 1 visita', nuevo: true })
    expect(pildoraDeCliente({ nuevo: false, visitas: 2 })).toEqual({ texto: 'volvió 1 vez', nuevo: false })
    expect(pildoraDeCliente({ nuevo: false, visitas: 5 })).toEqual({ texto: 'volvió 4 veces', nuevo: false })
  })

  it('textoUltimoToque: con mensaje, «sin mensaje, para comparar» y si volvió', () => {
    expect(textoUltimoToque(null)).toBe('sin toques aún')
    expect(textoUltimoToque({ etapa: 't2', etiqueta: 'Le regalamos algo', con_mensaje: true, fecha: 'x', volvio: false })).toBe(
      'recibió «Le regalamos algo»'
    )
    expect(textoUltimoToque({ etapa: 't4', etiqueta: 'Rescate', con_mensaje: false, fecha: 'x', volvio: true })).toBe(
      '«Rescate»: sin mensaje, para comparar · volvió'
    )
  })

  it('detalleDeCliente: visitas, puntos, días sin venir y último toque (los dormidos no tienen días)', () => {
    const c: ClienteDeLaLista = {
      id: '1', nombre: 'Juanita', ciclo: 1, visitas: 1, puntos: 80, nuevo: true, dias_sin_venir: 62, caja: 't4', archivado: false,
      ultimo_toque: { etapa: 't2', etiqueta: 'Le regalamos algo', con_mensaje: true, fecha: 'x', volvio: false },
    }
    expect(detalleDeCliente(c)).toBe('1 visita · 80 pts · 62 días sin venir · recibió «Le regalamos algo»')
    expect(detalleDeCliente({ ...c, visitas: 3, dias_sin_venir: null, ultimo_toque: null })).toBe('3 visitas · 80 pts · sin toques aún')
  })
})

// ═══════════════════════════════════════════════════════════════
// 10 · En qué vista abre Campañas (los enlaces viejos siguen sirviendo)
// ═══════════════════════════════════════════════════════════════

describe('vistaDeUrl', () => {
  it('el ciclo es la vista por defecto; los enlaces viejos siguen sirviendo', () => {
    expect(vistaDeUrl('')).toBe('ciclo')
    expect(vistaDeUrl(null)).toBe('ciclo')
    expect(vistaDeUrl('?tab=automaticas')).toBe('ciclo')
    expect(vistaDeUrl('?tab=historial')).toBe('historial')
    expect(vistaDeUrl('?tab=manuales')).toBe('libre')
    expect(vistaDeUrl('?vista=libre')).toBe('libre')
    expect(vistaDeUrl('?vista=historial')).toBe('historial')
  })

  it('lo desconocido abre el ciclo; `?vista=` manda sobre `?tab=`', () => {
    expect(vistaDeUrl('?tab=cualquiera')).toBe('ciclo')
    expect(vistaDeUrl('?vista=fecha')).toBe('ciclo') // la vista por fecha es de la parte C
    expect(vistaDeUrl('?vista=historial&tab=manuales')).toBe('historial')
  })
})
