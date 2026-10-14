/**
 * La pantalla «Ciclo» de Campañas, lo PURO (fase 2, parte B, 2026-10-14).
 *
 * Sin React, sin fetch propio y sin I/O: todo lo que decide QUÉ se le muestra al dueño sale de
 * acá, para poder fijarlo con tests sin un navegador. Los componentes de
 * `src/components/dashboard/cycle/` solo lo dibujan.
 *
 * UN SOLO MOTOR (regla 1 de las tres partes). Esta pantalla NO calcula etapas, ritmos, días ni
 * cajas: lee lo que `/api/dashboard/cycle/*` le devuelve (la parte A, que lo calcula con
 * `cycle-engine.ts`, la misma regla del cron). Lo único «de día» que se hace acá es buscar, en
 * los rangos que el servidor mandó, a qué caja pertenece una barra del histograma.
 *
 * LA REGLA DE ORO DE LA PANTALLA: **un fallo nunca es un cero.** Si el servidor contesta 500 o
 * la red cae, `leerJson()` devuelve `{ ok: false }` y la pantalla dice «no pudimos leer»; los
 * formateadores devuelven «—» ante un dato que falta. Es lo que se rompió el 04-10 («0
 * clientes» por un timeout de la analítica).
 *
 * Vocabulario de dueño (spec §6.6): «archivado», `t1`, `holdout` y «cola» no aparecen acá.
 * Colores: solo `--brand-*` de `globals.css` (la marca los pisa); ningún hex.
 *
 * Ref: docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md §6
 *      docs/prompts/2026-10-14-ciclo-fase-2-pantalla.md §4
 */

import { BRAND_RHYTHM_MIN_RETURNS, CYCLE_RHYTHMS, RHYTHM_LABELS, type CycleBoxKey, type CycleRhythm } from '@/lib/cycle-engine'
import { APP_UTC_OFFSET } from '@/lib/timezone'
import type {
  CajaDelCiclo,
  ClienteDeLaLista,
  CycleOverview,
  DiaDeLaProyeccion,
  EventoDelCalendario,
  PorDia,
  PrimerUso,
  RetornoDeEtapa,
  SegundaVisita,
  TarjetaParaHoy,
  UltimoToque,
} from '@/services/cycle-overview.service'
import type { EstadoDelCupo, NoLoReciben, VistaPreviaDelRegalo } from '@/services/cycle-gift.service'

// ═══════════════════════════════════════════════════════════════
// Rutas a las que la pantalla lleva (todas existen hoy)
// ═══════════════════════════════════════════════════════════════

export const RUTAS_DEL_CICLO = {
  /** Recompensas › «Premios para regalar»: donde se eligen el regalo pequeño y el fuerte (S-1). */
  regalos: '/dashboard/rewards?tab=premios',
  plantillas: '/dashboard/templates',
  /**
   * La vista «por fecha» de Campañas (parte C): el calendario de antes vive ahí, con el creador
   * de eventos. `/dashboard/calendar` redirige acá con sus parámetros.
   */
  calendario: '/dashboard/campaigns?vista=fecha',
  campanas: '/dashboard/campaigns',
} as const

// ═══════════════════════════════════════════════════════════════
// Números: un dato que falta es «—», nunca 0
// ═══════════════════════════════════════════════════════════════

export const SIN_DATO = '—'

const FORMATO_ENTERO = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const FORMATO_PCT = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

/** `1234` → «1.234». `null` / `undefined` / no finito → «—». Un cero REAL sigue siendo «0». */
export function cantidad(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? FORMATO_ENTERO.format(n) : SIN_DATO
}

/** `17.5` → «17,5 %». `null` (sin toques que medir) → «—», nunca «0 %». */
export function porcentaje(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? `${FORMATO_PCT.format(n)} %` : SIN_DATO
}

const DIAS_DE_LA_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

/** `2026-10-17` → «sábado 17 de octubre». Una fecha que no es `YYYY-MM-DD` vuelve tal cual. */
export function fechaLarga(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const [y, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dia = new Date(Date.UTC(y, mes - 1, d)).getUTCDay()
  return `${DIAS_DE_LA_SEMANA[dia]} ${d} de ${MESES[mes - 1]}`
}

/** `2026-05-18` → «18 de mayo». */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]}` : iso
}

/** `16:30` → «4:30 pm»; `10:30` → «10:30 am». */
export function horaLegible(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const h = Number(m[1])
  const sufijo = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${sufijo}`
}

/** El día de hoy en Bogotá como `YYYY-MM-DD` (solo para rotular; el día del ciclo lo pone el servidor). */
export function hoyEnBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

/** `0` → «hoy», `1` → «mañana», `n` → «en n días». */
export function enCuantosDias(dias: number): string {
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'mañana'
  return `en ${dias} días`
}

// ═══════════════════════════════════════════════════════════════
// Leer del servidor sin convertir un fallo en ceros
// ═══════════════════════════════════════════════════════════════

export type Lectura<T> = { ok: true; datos: T } | { ok: false; mensaje: string }

export const MENSAJE_SESION_VENCIDA = 'Tu sesión venció. Vuelve a iniciar sesión para ver tu ciclo.'

/**
 * Lo que el servidor dijo cuando algo falló. `message` gana sobre `error`: el `PUT` de Ajustes
 * contesta `{ error: 'Problema técnico', message: 'No pudimos guardar…' }` y la segunda es la
 * que se le puede leer al dueño. Las rutas del ciclo solo traen `error`, ya en español.
 */
function motivoDelServidor(cuerpo: unknown): string | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null
  const { message, error } = cuerpo as { message?: unknown; error?: unknown }
  if (typeof message === 'string' && message.trim()) return message
  if (typeof error === 'string' && error.trim()) return error
  return null
}

/**
 * `GET`/`POST` con `fetch` y el contrato de la pantalla: cualquier cosa distinta de un 2xx con un
 * objeto JSON es `{ ok: false, mensaje }`. Nunca lanza, y NUNCA entrega datos vacíos ante un
 * fallo: quien llama decide qué decir, pero no puede confundir «no pudimos leer» con «cero».
 * `mensajePorDefecto` es lo que lee el dueño si el servidor no dio un motivo propio.
 */
export async function leerJson<T>(
  url: string,
  mensajePorDefecto: string,
  opciones: { init?: RequestInit; fetchFn?: typeof fetch } = {}
): Promise<Lectura<T>> {
  const fetchFn = opciones.fetchFn ?? fetch
  try {
    const res = await fetchFn(url, { cache: 'no-store', ...opciones.init })
    const cuerpo: unknown = await res.json().catch(() => null)
    if (res.status === 401) return { ok: false, mensaje: MENSAJE_SESION_VENCIDA }
    if (!res.ok) return { ok: false, mensaje: motivoDelServidor(cuerpo) ?? mensajePorDefecto }
    if (cuerpo === null || typeof cuerpo !== 'object') return { ok: false, mensaje: mensajePorDefecto }
    return { ok: true, datos: cuerpo as T }
  } catch {
    return { ok: false, mensaje: mensajePorDefecto }
  }
}

export const MENSAJE_NO_SE_PUDO_LEER_EL_CICLO =
  'No pudimos leer tu ciclo de recuperación en este momento. Intenta de nuevo en un minuto.'

/** La portada tal como la contesta la ruta: lo del servicio más `permisos` (`null` en la versión mini). */
export type PortadaDelCiclo = CycleOverview & { permisos?: PermisosDelCiclo | null }

/** ¿Lo que llegó tiene la forma de la portada? Un 200 con otra cosa tampoco se dibuja. */
export function esPortadaDelCiclo(x: unknown): x is PortadaDelCiclo {
  if (!x || typeof x !== 'object') return false
  const o = x as Partial<CycleOverview>
  return (
    Array.isArray(o.cajas) &&
    !!o.dormidos &&
    typeof o.dormidos.total === 'number' &&
    !!o.ciclo &&
    typeof o.ciclo.encendido === 'boolean' &&
    !!o.ritmo
  )
}

/** La portada del ciclo (`?mini=1` para el panel principal). */
export async function leerPortadaDelCiclo(
  opciones: { mini?: boolean; fetchFn?: typeof fetch } = {}
): Promise<Lectura<PortadaDelCiclo>> {
  const url = opciones.mini ? '/api/dashboard/cycle/overview?mini=1' : '/api/dashboard/cycle/overview'
  const lectura = await leerJson<unknown>(url, MENSAJE_NO_SE_PUDO_LEER_EL_CICLO, { fetchFn: opciones.fetchFn })
  if (!lectura.ok) return lectura
  if (!esPortadaDelCiclo(lectura.datos)) return { ok: false, mensaje: MENSAJE_NO_SE_PUDO_LEER_EL_CICLO }
  return { ok: true, datos: lectura.datos }
}

// ═══════════════════════════════════════════════════════════════
// Las cajas
// ═══════════════════════════════════════════════════════════════

export type ClaveDeCaja = CycleBoxKey | 'dormidos'

/**
 * El color de cada caja, SIN un solo hex: una rampa que se calienta con la urgencia, hecha de
 * los `--brand-*` de la marca (`globals.css`). Se evalúa en el elemento, así que una marca que
 * pise `--brand-primary` repinta las cajas. «Recién vino» y «Dormidos» son grises de la marca:
 * no son una urgencia.
 */
export const COLOR_DE_CAJA: Readonly<Record<ClaveDeCaja, string>> = {
  reciente: 'var(--brand-ink-soft)',
  t1: 'color-mix(in oklab, var(--brand-primary) 35%, var(--brand-surface))',
  t2: 'color-mix(in oklab, var(--brand-primary) 62%, var(--brand-surface))',
  t3: 'var(--brand-primary)',
  t4: 'var(--brand-primary-end)',
  t5: 'color-mix(in oklab, var(--brand-primary-end) 60%, var(--brand-ink))',
  dormidos: 'var(--brand-ink-muted)',
}

/** Qué recibe quien está en cada caja, en palabras del dueño (spec §6.2 / §3.2). */
export const QUE_RECIBEN: Readonly<Record<ClaveDeCaja, string>> = {
  reciente: 'Vinieron hace poco: todavía no les toca ningún mensaje.',
  t1: 'Reciben un recordatorio con sus puntos y lo que les falta. Sin oferta.',
  t2: 'Reciben un regalo pequeño que vence el domingo.',
  t3: 'Si solo vinieron al local les mostramos el domicilio; si solo pidieron a casa, el local.',
  t4: 'Reciben el regalo fuerte, que vence el domingo, y un aviso antes de que venza.',
  t5: 'Reciben un último mensaje con sus puntos guardados. Si no vuelven, pasan a dormidos.',
  dormidos: 'Un toque cada tres meses, dos como mucho: primero el regalo pequeño, luego el fuerte. No se les insiste.',
}

/** «día 14–27 sin venir», «día 80+ sin venir». «Recién vino» no es «sin venir». */
export function rangoDeCaja(c: Pick<CajaDelCiclo, 'key' | 'desde' | 'hasta'>): string {
  const tramo = c.hasta === null ? `${c.desde}+` : `${c.desde}–${c.hasta}`
  return c.key === 'reciente' ? `día ${tramo}` : `día ${tramo} sin venir`
}

/** El ancho (0–100) de la parte «nuevos» de la barra partida. Una caja vacía no pinta nada. */
export function porcentajeDeNuevos(c: { total: number; nuevos: number }): number {
  if (!(c.total > 0)) return 0
  return Math.max(0, Math.min(100, Math.round((c.nuevos / c.total) * 100)))
}

/**
 * «Volvieron en 2 semanas: 17,5 % · sin mensaje 0 %». `null` cuando no hay nada que decir:
 * «Recién vino» no tiene toque, y una etapa sin toques medibles no es «0 %» (es «aún sin datos»).
 */
export function textoDeRetorno(retorno: RetornoDeEtapa | null): string | null {
  if (!retorno) return null
  const con = retorno.con_mensaje.pct
  if (con === null) return 'Aún sin toques que medir'
  const sin = retorno.sin_mensaje.pct
  return sin === null
    ? `Volvieron en 2 semanas: ${porcentaje(con)}`
    : `Volvieron en 2 semanas: ${porcentaje(con)} · sin mensaje ${porcentaje(sin)}`
}

export function regaloDeCaja(regalo: string | null): string {
  return regalo ? `🎁 ${regalo}` : 'sin regalo'
}

/** Singular/plural de «cliente» con el número ya formateado. */
export function clientes(n: number): string {
  return n === 1 ? '1 cliente' : `${cantidad(n)} clientes`
}

// ═══════════════════════════════════════════════════════════════
// Los números de arriba (spec §6.3): ninguno es «enviados»
// ═══════════════════════════════════════════════════════════════

export interface NumeroDeArriba {
  clave: 'volvieron' | 'stock' | 'evento'
  titulo: string
  valor: string
  /** Letra chica al lado del valor. */
  sufijo?: string
  detalle: string
  /** Una advertencia (p. ej. «falta la foto»). */
  aviso?: string
}

export function numerosDeArriba(o: CycleOverview): NumeroDeArriba[] {
  const v = o.numeros.volvieron_por_mensaje
  let volvieron: NumeroDeArriba
  if (!v) {
    volvieron = {
      clave: 'volvieron',
      titulo: 'Volvieron por un mensaje',
      valor: SIN_DATO,
      detalle: 'Aún no hay toques con dos semanas cumplidas para medir.',
    }
  } else if (v.con_mensaje_pct === null) {
    // Sin toques medibles: un «0» sería inventar que el ciclo no trajo a nadie.
    volvieron = {
      clave: 'volvieron',
      titulo: 'Volvieron por un mensaje',
      valor: v.clientes > 0 ? cantidad(v.clientes) : SIN_DATO,
      detalle: 'Aún no hay toques con dos semanas cumplidas para medir.',
    }
  } else {
    volvieron = {
      clave: 'volvieron',
      titulo: 'Volvieron por un mensaje',
      valor: cantidad(v.clientes),
      sufijo: 'en 30 días',
      detalle:
        v.sin_mensaje_pct === null
          ? `Con mensaje volvieron el ${porcentaje(v.con_mensaje_pct)}. Todavía no hay clientes «sin mensaje» para comparar.`
          : `Con mensaje volvieron el ${porcentaje(v.con_mensaje_pct)} · sin mensaje, el ${porcentaje(v.sin_mensaje_pct)}.`,
    }
  }

  const stock: NumeroDeArriba = {
    clave: 'stock',
    titulo: 'En el ciclo · dormidos',
    valor: cantidad(o.numeros.en_el_ciclo),
    sufijo: `· ${cantidad(o.numeros.dormidos)} dormidos`,
    detalle: 'recorriendo sus toques · sin insistir',
  }

  const e = o.numeros.proximo_evento
  const evento: NumeroDeArriba = e
    ? {
        clave: 'evento',
        titulo: 'Próximo evento',
        valor: e.titulo,
        sufijo: enCuantosDias(e.dias),
        detalle: `${fechaLarga(e.fecha)}${e.invitados !== null ? ` · ${cantidad(e.invitados)} invitados` : ''}`,
        aviso: e.sin_foto ? 'falta la foto' : undefined,
      }
    : {
        clave: 'evento',
        titulo: 'Próximo evento',
        valor: 'Ninguno',
        detalle: 'No hay eventos en los próximos 60 días.',
      }

  return [volvieron, stock, evento]
}

// ═══════════════════════════════════════════════════════════════
// Primer uso (spec §6.0): tres pasos con barra, ninguno bloquea el ciclo
// ═══════════════════════════════════════════════════════════════

export interface PasoDelPrimerUso {
  clave: 'regalo_pequeno' | 'regalo_fuerte' | 'plantilla_regalo'
  listo: boolean
  titulo: string
  texto: string
  enlace?: { href: string; etiqueta: string }
}

export function pasosDelPrimerUso(p: PrimerUso): PasoDelPrimerUso[] {
  const regalo = (
    clave: 'regalo_pequeno' | 'regalo_fuerte',
    titulo: string,
    r: PrimerUso['regalo_pequeno'],
    sinEleccion: string
  ): PasoDelPrimerUso => {
    if (r.listo) return { clave, listo: true, titulo, texto: r.titulo ?? 'elegido' }
    return {
      clave,
      listo: false,
      titulo,
      texto: r.elegido_inactivo ? `el que elegiste ya no está activo. ${sinEleccion}` : `sin elegir. ${sinEleccion}`,
      enlace: { href: RUTAS_DEL_CICLO.regalos, etiqueta: 'Elegir' },
    }
  }

  const plantilla: PasoDelPrimerUso =
    p.plantilla_regalo.estado === 'aprobada'
      ? { clave: 'plantilla_regalo', listo: true, titulo: 'Plantilla «Regalo que vence»', texto: 'aprobada' }
      : p.plantilla_regalo.estado === 'pendiente'
        ? {
            clave: 'plantilla_regalo',
            listo: false,
            titulo: 'Plantilla «Regalo que vence»',
            texto:
              'en revisión de Meta. Mientras tanto, los regalos salen con tu mensaje insistente de siempre y llegan igual a la tarjeta.',
          }
        : {
            clave: 'plantilla_regalo',
            listo: false,
            titulo: 'Plantilla «Regalo que vence»',
            texto:
              'todavía no está creada. Mientras tanto, los regalos salen con tu mensaje insistente de siempre y llegan igual a la tarjeta.',
            enlace: { href: RUTAS_DEL_CICLO.plantillas, etiqueta: 'Crearla' },
          }

  return [
    regalo('regalo_pequeno', 'Regalo pequeño', p.regalo_pequeno, '«Le regalamos algo» sale sin regalo.'),
    regalo('regalo_fuerte', 'Regalo fuerte', p.regalo_fuerte, 'El Rescate sale sin regalo.'),
    plantilla,
  ]
}

/** Los tres pasos se ven hasta que estén los tres (y nunca bloquean el ciclo). */
export function mostrarPrimerUso(p: PrimerUso | null): p is PrimerUso {
  return p !== null && p.listos < p.total
}

export function progresoDelPrimerUso(p: { listos: number; total: number }): number {
  if (!(p.total > 0)) return 0
  return Math.max(0, Math.min(100, Math.round((p.listos / p.total) * 100)))
}

// ═══════════════════════════════════════════════════════════════
// El ritmo de la marca (spec §6.0, «la pregunta del ritmo»)
// ═══════════════════════════════════════════════════════════════

/** «Tus clientes vuelven cada mes». */
export function frasesDelRitmo(r: CycleOverview['ritmo']): { principal: string; origen: string } {
  const principal = `Tus clientes vuelven ${r.etiqueta.toLowerCase()}`
  const origen =
    r.origen === 'dueno'
      ? 'Lo elegiste tú.'
      : r.origen === 'calculado'
        ? `Calculado con ${cantidad(r.regresos)} regresos de tu marca.`
        : `Aún hay pocos regresos para calcularlo (${cantidad(r.regresos)} de ${BRAND_RHYTHM_MIN_RETURNS}): usamos «${r.etiqueta.toLowerCase()}» hasta que haya más.`
  return { principal, origen }
}

export type ValorDeRitmo = CycleRhythm | 'auto'

export interface OpcionDeRitmo {
  valor: ValorDeRitmo
  etiqueta: string
  elegida: boolean
}

/** Lo que el dueño puede elegir: dejar que el sistema lo calcule, o uno de los cuatro. */
export function opcionesDeRitmo(r: Pick<CycleOverview['ritmo'], 'marca' | 'origen'>): OpcionDeRitmo[] {
  const elegidoPorElDueno = r.origen === 'dueno'
  return [
    { valor: 'auto', etiqueta: 'Que lo calcule el sistema', elegida: !elegidoPorElDueno },
    ...CYCLE_RHYTHMS.map((valor) => ({
      valor,
      etiqueta: RHYTHM_LABELS[valor],
      elegida: elegidoPorElDueno && r.marca === valor,
    })),
  ]
}

// ═══════════════════════════════════════════════════════════════
// El estado del ciclo y quién lo enciende
// ═══════════════════════════════════════════════════════════════

export interface PermisosDelCiclo {
  /** Puede usar «Hoy no» (alcance de marca). */
  aprobar: boolean
  /** Es el operador de Cada1: el único que ve y usa el interruptor (decisión H7). */
  interruptor: boolean
}

export interface EstadoDelCiclo {
  encendido: boolean
  titular: string
  detalle: string
  /** Solo el operador de Cada1 ve el botón. */
  botonDeInterruptor: 'encender' | 'apagar' | null
}

export function estadoDelCiclo(c: CycleOverview['ciclo'], permisos: PermisosDelCiclo | null): EstadoDelCiclo {
  const operador = permisos?.interruptor === true
  if (c.encendido) {
    return {
      encendido: true,
      titular: 'El ciclo está encendido',
      detalle: `Cada cliente recibe su mensaje en su momento, a las ${horaLegible(c.hora)}.${
        c.encendido_desde ? ` Encendido desde el ${fechaLarga(c.encendido_desde.slice(0, 10))}.` : ''
      }`,
      botonDeInterruptor: operador ? 'apagar' : null,
    }
  }
  return {
    encendido: false,
    titular: 'El ciclo está apagado en tu marca',
    detalle:
      'Tus clientes siguen con la reactivación de siempre. Las cajas de abajo muestran en qué etapa estarían. ' +
      (operador ? '' : 'Cada1 lo enciende contigo cuando estén listos los regalos.'),
    botonDeInterruptor: operador ? 'encender' : null,
  }
}

// ═══════════════════════════════════════════════════════════════
// «Para hoy» (spec §6.1): aprobar, no crear
// ═══════════════════════════════════════════════════════════════

export type AccionDeTarjeta = TarjetaParaHoy['acciones'][number]

export interface BotonDeTarjeta {
  accion: AccionDeTarjeta
  etiqueta: string
  estilo: 'primario' | 'secundario' | 'fantasma'
  /** Con `href` es un enlace; sin él, la pantalla hace algo en el lugar (OK, Hoy no). */
  href?: string
}

/**
 * El enlace a «Crear evento»: la vista por fecha con la fecha y el nombre que la tarjeta sugirió
 * (la pantalla los lee al abrir y abre el creador ya lleno: `pedidoDeLaUrl()`).
 */
export function enlaceParaCrearEvento(t: Pick<TarjetaParaHoy, 'fecha' | 'nombre'>): string {
  const q = new URLSearchParams({ vista: 'fecha' })
  if (t.fecha) q.set('fecha', t.fecha)
  if (t.nombre) q.set('nombre', t.nombre)
  return `${RUTAS_DEL_CICLO.campanas}?${q.toString()}`
}

/** «Subir foto»: la vista por fecha con ese evento abierto (su ficha deja subir la foto). */
export function enlaceParaSubirFoto(t: Pick<TarjetaParaHoy, 'evento_id'>): string {
  const q = new URLSearchParams({ vista: 'fecha' })
  if (t.evento_id) q.set('evento', t.evento_id)
  return `${RUTAS_DEL_CICLO.campanas}?${q.toString()}`
}

/**
 * Los botones de una tarjeta. «Hoy no» solo con permiso de marca (un administrador de sede no
 * frena lo automático de toda la marca: el POST le daría 403, así que ni se le ofrece).
 */
export function botonesDeTarjeta(t: TarjetaParaHoy, permisos: Pick<PermisosDelCiclo, 'aprobar'> | null): BotonDeTarjeta[] {
  const botones: BotonDeTarjeta[] = []
  for (const accion of t.acciones) {
    switch (accion) {
      case 'ok':
        botones.push({ accion, etiqueta: 'OK', estilo: 'primario' })
        break
      case 'hoy_no':
        if (permisos?.aprobar) botones.push({ accion, etiqueta: 'Hoy no', estilo: 'fantasma' })
        break
      case 'cambiar_regalo':
        botones.push({ accion, etiqueta: 'Cambiar regalo', estilo: 'secundario', href: RUTAS_DEL_CICLO.regalos })
        break
      case 'elegir_regalo':
        botones.push({ accion, etiqueta: 'Elegir regalo', estilo: 'primario', href: RUTAS_DEL_CICLO.regalos })
        break
      case 'crear_evento':
        botones.push({ accion, etiqueta: 'Crear evento', estilo: 'primario', href: enlaceParaCrearEvento(t) })
        break
      case 'subir_foto':
        botones.push({ accion, etiqueta: 'Subir foto', estilo: 'primario', href: enlaceParaSubirFoto(t) })
        break
    }
  }
  return botones
}

/** El filo de color de cada tipo de tarjeta: de la misma rampa de la marca que las cajas. */
export const COLOR_DE_TARJETA: Readonly<Record<TarjetaParaHoy['tipo'], string>> = {
  trimestral: COLOR_DE_CAJA.dormidos,
  fecha_especial: 'var(--brand-primary)',
  evento_sin_foto: 'var(--brand-primary-end)',
  rescate_sin_regalo: COLOR_DE_CAJA.t4,
  cupo_sin_regalo: COLOR_DE_CAJA.t2,
}

/** Lo que dice una tarjeta después de «OK» (no escribe nada: lo automático sale solo, A6). */
export const TEXTO_DESPUES_DE_OK = 'Listo: sale solo, no tienes que hacer nada.'

/** La clave con la que un navegador recuerda que ya dijo «OK» a esta tarjeta HOY. */
export function claveDeOk(tarjetaId: string, hoyIso: string): string {
  return `ciclo-ok:${hoyIso}:${tarjetaId}`
}

// ═══════════════════════════════════════════════════════════════
// «Ver por día»: el histograma plegado
// ═══════════════════════════════════════════════════════════════

export interface BarraDelDia {
  dia: number
  clientes: number
  /** A qué caja cae ese día según los RANGOS que mandó el servidor (no se recalcula). */
  caja: ClaveDeCaja
}

/** Busca, en los rangos de las cajas que mandó el servidor, a cuál pertenece un día sin venir. */
export function cajaDelDia(dia: number, cajas: ReadonlyArray<Pick<CajaDelCiclo, 'key' | 'desde' | 'hasta'>>): ClaveDeCaja {
  for (const c of cajas) {
    if (dia >= c.desde && (c.hasta === null || dia <= c.hasta)) return c.key
  }
  return cajas.length > 0 ? cajas[cajas.length - 1].key : 'reciente'
}

export function barrasPorDia(
  porDia: PorDia | null,
  cajas: ReadonlyArray<Pick<CajaDelCiclo, 'key' | 'desde' | 'hasta'>>
): { barras: BarraDelDia[]; maximo: number; masAlla: number } {
  if (!porDia) return { barras: [], maximo: 0, masAlla: 0 }
  const barras = porDia.conteo.map((clientes, dia) => ({ dia, clientes, caja: cajaDelDia(dia, cajas) }))
  return { barras, maximo: barras.reduce((m, b) => Math.max(m, b.clientes), 0), masAlla: porDia.mas_alla }
}

// ═══════════════════════════════════════════════════════════════
// La lista de quiénes (tocar una caja o una barra)
// ═══════════════════════════════════════════════════════════════

export type FiltroDeLista =
  | { tipo: 'caja'; clave: ClaveDeCaja }
  | { tipo: 'dia'; dia: number }
  /** La vista por fecha: los que ENTRAN a un toque ese día (parte C). */
  | { tipo: 'fecha'; fecha: string }

export const POR_PAGINA_DE_LA_LISTA = 20

/** La consulta de `/api/dashboard/cycle/customers` (UN filtro, como pide la ruta). */
export function consultaDeLista(f: FiltroDeLista, pagina = 1): string {
  const q = new URLSearchParams()
  if (f.tipo === 'dia') q.set('day', String(f.dia))
  else if (f.tipo === 'fecha') q.set('fecha', f.fecha)
  else if (f.clave === 'dormidos') q.set('state', 'dormido')
  else q.set('stage', f.clave)
  q.set('page', String(pagina))
  q.set('limit', String(POR_PAGINA_DE_LA_LISTA))
  return `/api/dashboard/cycle/customers?${q.toString()}`
}

/** La pastilla de cada cliente: «nuevo · 1 visita» o «volvió 2 veces». */
export function pildoraDeCliente(c: Pick<ClienteDeLaLista, 'nuevo' | 'visitas'>): { texto: string; nuevo: boolean } {
  if (c.nuevo) return { texto: c.visitas <= 0 ? 'nuevo' : 'nuevo · 1 visita', nuevo: true }
  const veces = Math.max(1, c.visitas - 1)
  return { texto: `volvió ${veces} ${veces === 1 ? 'vez' : 'veces'}`, nuevo: false }
}

/** «recibió “Rescate”», «“Rescate”: sin mensaje, para comparar», con «· volvió» si volvió. */
export function textoUltimoToque(t: UltimoToque | null): string {
  if (!t) return 'sin toques aún'
  const base = t.con_mensaje ? `recibió «${t.etiqueta}»` : `«${t.etiqueta}»: sin mensaje, para comparar`
  return t.volvio ? `${base} · volvió` : base
}

/** Una línea por cliente: visitas, puntos, días sin venir y último toque. */
export function detalleDeCliente(c: ClienteDeLaLista): string {
  const partes = [`${c.visitas} ${c.visitas === 1 ? 'visita' : 'visitas'}`, `${cantidad(c.puntos)} pts`]
  if (c.dias_sin_venir !== null) partes.push(`${c.dias_sin_venir} días sin venir`)
  partes.push(textoUltimoToque(c.ultimo_toque))
  return partes.join(' · ')
}

/** La segunda visita (A12), en una frase. `null` si la cohorte está vacía (no se inventa un 0 %). */
export function textoSegundaVisita(s: SegundaVisita | null): string | null {
  if (!s || s.clientes <= 0) return null
  return (
    `Segunda visita: de los ${cantidad(s.clientes)} que vinieron por primera vez entre el ${fechaCorta(s.desde)} y el ` +
    `${fechaCorta(s.hasta)}, ${cantidad(s.volvieron)} (${porcentaje(s.pct)}) volvieron dentro de ${s.ventana_dias} días.`
  )
}

// ═══════════════════════════════════════════════════════════════
// En qué vista de Campañas abre la pantalla
// ═══════════════════════════════════════════════════════════════

/**
 * `ciclo` (default, por etapa) · `fecha` (el ciclo por fecha: el calendario, parte C) ·
 * `historial` · `libre` («Mensaje libre (avanzado)», no es una pestaña).
 */
export type VistaDeCampanas = 'ciclo' | 'fecha' | 'historial' | 'libre'

/**
 * Lee `?vista=` o el viejo `?tab=` de `window.location.search` (no `useSearchParams()`: fuerza el
 * CSR bailout). Los enlaces viejos siguen sirviendo: `tab=manuales` abre el mensaje libre y
 * `tab=automaticas` el ciclo. Lo desconocido abre el ciclo.
 */
export function vistaDeUrl(search: string | null | undefined): VistaDeCampanas {
  const q = new URLSearchParams(search ?? '')
  const pedida = q.get('vista') ?? q.get('tab')
  if (pedida === 'historial') return 'historial'
  if (pedida === 'libre' || pedida === 'manuales') return 'libre'
  if (pedida === 'fecha') return 'fecha'
  return 'ciclo'
}

export interface PedidoDeLaUrl {
  /** `AAAA-MM-DD`: abrir el creador de eventos con esta fecha («Crear evento» de «Para hoy»). */
  fecha?: string
  /** El nombre sugerido para ese evento («Halloween»). */
  nombre?: string
  /** Abrir la ficha de este evento («Subir foto»). */
  evento?: string
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/
const ID_DE_EVENTO = /^[0-9a-f-]{8,64}$/i

/**
 * Lo que una URL le pide a la vista por fecha al abrir (`?fecha=…&nombre=…` / `?evento=<id>`).
 * Solo lo que tiene la forma correcta: una fecha mal escrita no abre nada.
 */
export function pedidoDeLaUrl(search: string | null | undefined): PedidoDeLaUrl {
  const q = new URLSearchParams(search ?? '')
  const pedido: PedidoDeLaUrl = {}
  const fecha = q.get('fecha')
  if (fecha && FECHA_ISO.test(fecha)) pedido.fecha = fecha
  const nombre = q.get('nombre')?.replace(/\s+/g, ' ').trim()
  if (nombre) pedido.nombre = nombre.slice(0, 120)
  const evento = q.get('evento')
  if (evento && ID_DE_EVENTO.test(evento)) pedido.evento = evento
  return pedido
}

// ═══════════════════════════════════════════════════════════════
// La vista «por fecha» (spec §6.4, parte C): el mismo dato, girado
// ═══════════════════════════════════════════════════════════════

export const NOMBRES_DE_MES = MESES

/** El mes que se mira: `mes` va de 0 (enero) a 11. */
export interface MesDelCalendario {
  anio: number
  mes: number
}

const dosCifras = (n: number) => String(n).padStart(2, '0')

/** `(2026, 9, 1)` → `2026-10-01`. */
export function isoDelDia(anio: number, mes: number, dia: number): string {
  return `${anio}-${dosCifras(mes + 1)}-${dosCifras(dia)}`
}

/** El mes de un `AAAA-MM-DD`. */
export function mesDeFecha(iso: string): MesDelCalendario {
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  return m ? { anio: Number(m[1]), mes: Number(m[2]) - 1 } : { anio: 1970, mes: 0 }
}

export function moverMes(m: MesDelCalendario, delta: number): MesDelCalendario {
  const total = m.anio * 12 + m.mes + delta
  return { anio: Math.floor(total / 12), mes: ((total % 12) + 12) % 12 }
}

/** El primer y el último día del mes, para `/api/dashboard/cycle/projection?from&to` (≤ 31 días). */
export function rangoDelMes(m: MesDelCalendario): { desde: string; hasta: string } {
  const ultimo = new Date(Date.UTC(m.anio, m.mes + 1, 0)).getUTCDate()
  return { desde: isoDelDia(m.anio, m.mes, 1), hasta: isoDelDia(m.anio, m.mes, ultimo) }
}

/** «octubre 2026». */
export function tituloDelMes(m: MesDelCalendario): string {
  return `${MESES[m.mes]} ${m.anio}`
}

/**
 * La cuadrícula del mes: semanas de lunes a domingo (como el prototipo), con `null` en los
 * huecos de antes del día 1 y después del último. Es diseño de calendario, no un día del ciclo.
 */
export function semanasDelMes(m: MesDelCalendario): Array<Array<string | null>> {
  const ultimo = new Date(Date.UTC(m.anio, m.mes + 1, 0)).getUTCDate()
  // 0 = lunes … 6 = domingo.
  const primerDia = (new Date(Date.UTC(m.anio, m.mes, 1)).getUTCDay() + 6) % 7
  const celdas: Array<string | null> = new Array<string | null>(primerDia).fill(null)
  for (let d = 1; d <= ultimo; d++) celdas.push(isoDelDia(m.anio, m.mes, d))
  while (celdas.length % 7 !== 0) celdas.push(null)
  const semanas: Array<Array<string | null>> = []
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7))
  return semanas
}

export const DIAS_DE_LA_SEMANA_CORTOS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

/** Lo que dibuja una celda del calendario. Todo sale de la proyección del servidor. */
export interface CeldaDelCalendario {
  fecha: string
  numero: number
  pasado: boolean
  hoy: boolean
  /** «Reservado para el evento»: la sombra del blackout. */
  reservado: boolean
  eventos: Array<{ id: string; titulo: string; sinFoto: boolean }>
  especiales: string[]
  /** Hasta tres líneas «23 → rescate», en el orden del ciclo. */
  entran: Array<{ etapa: string; texto: string; total: number }>
  /** Cuántos entran ese día a cualquier toque. */
  total: number
}

const eventosDelDia = (ids: readonly string[], eventos: ReadonlyMap<string, EventoDelCalendario>) =>
  ids.map((id) => eventos.get(id)).filter((e): e is EventoDelCalendario => !!e)

export function celdaDelCalendario(
  dia: DiaDeLaProyeccion,
  eventos: ReadonlyMap<string, EventoDelCalendario>,
  hoyIso: string
): CeldaDelCalendario {
  return {
    fecha: dia.fecha,
    numero: Number(dia.fecha.slice(8, 10)),
    pasado: dia.fecha < hoyIso,
    hoy: dia.fecha === hoyIso,
    reservado: dia.reservado_para.length > 0,
    eventos: eventosDelDia(dia.eventos, eventos).map((e) => ({ id: e.id, titulo: e.titulo, sinFoto: e.sin_foto })),
    especiales: dia.fechas_especiales.map((f) => f.nombre),
    entran: dia.entran
      .slice(0, 3)
      .map((e) => ({ etapa: e.etapa, texto: `${cantidad(e.total)} → ${e.etiqueta.toLowerCase()}`, total: e.total })),
    total: dia.entran.reduce((n, e) => n + e.total, 0),
  }
}

/** El encabezado del detalle de un día (el panel al lado del calendario). */
export function detalleDelDia(
  dia: DiaDeLaProyeccion,
  eventos: ReadonlyMap<string, EventoDelCalendario>,
  hoyIso: string
): { titulo: string; texto: string; sePuedeCrear: boolean } {
  const total = dia.entran.reduce((n, e) => n + e.total, 0)
  const pasado = dia.fecha < hoyIso
  const delDia = eventosDelDia(dia.eventos, eventos)
  const reservadoPara = eventosDelDia(dia.reservado_para, eventos)
  const titulo = pasado
    ? 'Ya pasó'
    : total > 0
      ? `${clientes(total)} ${total === 1 ? 'entra' : 'entran'} a un toque`
      : 'Nadie entra a un toque'
  let texto: string
  if (delDia.length > 0) {
    texto = `Evento: ${delDia.map((e) => e.titulo).join(', ')}. Los días antes quedan reservados: los toques del ciclo de sus invitados esperan a que pase.`
  } else if (reservadoPara.length > 0) {
    const e = reservadoPara[0]
    texto = `Reservado para «${e.titulo}» (${fechaLarga(e.fecha)}): los toques de sus invitados esperan al día siguiente del evento.`
  } else if (dia.fechas_especiales.length > 0) {
    texto = `${dia.fechas_especiales.map((f) => f.nombre).join(', ')}: buen día para un evento.`
  } else {
    texto = pasado ? 'Este día ya pasó.' : 'Sin eventos. Buen día para un regalo.'
  }
  return { titulo, texto, sePuedeCrear: !pasado }
}

/** «12 nuevos · 11 ya volvieron antes». */
export function particionDeEntrada(e: { total: number; nuevos: number }): string {
  return `${cantidad(e.nuevos)} ${e.nuevos === 1 ? 'nuevo' : 'nuevos'} · ${cantidad(e.total - e.nuevos)} ya volvieron antes`
}

// ═══════════════════════════════════════════════════════════════
// Los creadores (spec §6.5): «Mandar un regalo» y «Crear un evento»
// ═══════════════════════════════════════════════════════════════

/** Reemplaza `{{n}}` por su valor (vacío si falta). Para la vista previa del WhatsApp. */
export function rellenarPlantilla(cuerpo: string, variables: Readonly<Record<string, string>>): string {
  return cuerpo.replace(/\{\{(\d+)\}\}/g, (_, n: string) => variables[n] ?? '')
}

/**
 * Un texto en UNA línea: `{{5}}` del evento es una variable de plantilla y Twilio rechaza
 * (21656) las variables con saltos de línea, lo que tumbaría la invitación de toda la audiencia.
 */
export function textoDeUnaLinea(texto: string): string {
  return texto.replace(/\s*[\r\n]+\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim()
}

/** El tope del texto del evento (la descripción, `{{5}}`). */
export const MAX_TEXTO_DEL_EVENTO = 500

/**
 * El texto sugerido del evento, ya escrito (spec §6.5: «texto sugerido ya escrito y editable»).
 * El dueño lo cambia si quiere; sin tocarlo, sale este.
 */
export function textoSugeridoDelEvento(nombre: string, fechaIso: string | null | undefined): string {
  const que = nombre.replace(/\s+/g, ' ').trim() || 'algo especial'
  const cuando = fechaIso && FECHA_ISO.test(fechaIso) ? `El ${fechaLarga(fechaIso)}` : 'Muy pronto'
  return `${cuando} tenemos ${que}. Ven con tu tarjeta: sumas puntos y te acercas a tu próximo premio. ¡Te esperamos!`
}

/**
 * El cierre de la invitación (`{{5}}`): el texto y, si hay, el enlace pegado con « 👉 ». Es la
 * MISMA regla que `buildEventCta()` del servidor (un test compara las dos): la vista previa
 * tiene que decir lo que va a salir.
 */
export function ctaDelEvento(texto: string | null | undefined, enlace: string | null | undefined): string {
  const t = texto?.trim() || '¡Te esperamos!'
  const l = enlace?.trim()
  return l ? `${t} 👉 ${l}` : t
}

/** «sábado, 17 de octubre»: la fecha como la escribe la invitación (`{{4}}`, `formatEventDate()`). */
export function fechaDeLaInvitacion(fechaIso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaIso)
  if (!m) return fechaIso
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  )
}

/** El instante (ISO) en que sale la invitación: ese día a la hora de la marca, en Bogotá. */
export function salidaDeLaInvitacion(fechaIso: string, hora: string): string | null {
  if (!FECHA_ISO.test(fechaIso) || !/^\d{2}:\d{2}$/.test(hora)) return null
  const t = Date.parse(`${fechaIso}T${hora}:00${APP_UTC_OFFSET}`)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/** «Programar para el sábado 17 de octubre a las 4:30 pm». */
export function textoDelBotonDelEvento(fechaIso: string, hora: string): string {
  return FECHA_ISO.test(fechaIso) ? `Programar para el ${fechaLarga(fechaIso)} a las ${horaLegible(hora)}` : 'Programar'
}

/** Cuántos reciben la invitación: los del ciclo y, con la casilla (o el ciclo apagado), los dormidos. */
export function invitadosDelEvento(n: { enElCiclo: number; dormidos: number; encendido: boolean; incluirDormidos: boolean }): number {
  return n.enElCiclo + (n.encendido && !n.incluirDormidos ? 0 : n.dormidos)
}

/** «Hoy puedes mandar 180. Si son más, el resto sale en los días siguientes.» (spec §5). */
export function textoDelCupo(cupo: EstadoDelCupo, esHoy: boolean): string {
  switch (cupo.estado) {
    case 'con_tope':
      return esHoy
        ? `Hoy puedes mandar ${cantidad(cupo.hoy)}. Si son más, el resto sale en los días siguientes.`
        : `Tu línea manda hasta ${cantidad(cupo.por_dia)} al día. Si son más, el resto sale en los días siguientes.`
    case 'sin_tope':
      return 'Tu línea todavía no tiene un tope diario fijado por Meta: sale todo el mismo día.'
    case 'congelada':
      return 'Tu línea está detenida por calidad: nada sale hasta que se reactive. Lo que programes espera.'
    case 'no_se_pudo':
      return 'No pudimos leer el cupo de hoy. Si son muchos, el resto sale en los días siguientes.'
  }
}

/** «3 recibieron otro mensaje hace menos de 7 días · 1 ya tiene un regalo vivo». `null` si nadie queda fuera. */
export function textoNoLoReciben(no: NoLoReciben): string | null {
  const partes: string[] = []
  if (no.regalo_vivo) partes.push(`${cantidad(no.regalo_vivo)} ya ${no.regalo_vivo === 1 ? 'tiene' : 'tienen'} un regalo vivo`)
  if (no.siete_dias) partes.push(`${cantidad(no.siete_dias)} recibieron otro mensaje hace menos de 7 días`)
  if (no.tope_mes) partes.push(`${cantidad(no.tope_mes)} ya ${no.tope_mes === 1 ? 'tiene' : 'tienen'} sus 3 mensajes del mes`)
  return partes.length > 0 ? partes.join(' · ') : null
}

/** Lo que dice el creador sobre la plantilla con que va a salir (spec §4: el adaptador, dicho). */
export function avisoDePlantillaDelRegalo(p: VistaPreviaDelRegalo['plantilla']): string | null {
  if (p.clave === null) return 'Tu marca todavía no tiene con qué mandar un regalo: crea «Regalo que vence» en Plantillas.'
  if (p.clave === 'gift_expiring') return null
  return p.regalo_que_vence === 'pendiente'
    ? '«Regalo que vence» está en revisión de Meta: mientras tanto sale con tu mensaje insistente de siempre. El regalo igual llega a la tarjeta con su fecha.'
    : 'Esta marca aún no tiene «Regalo que vence»: sale con tu mensaje insistente de siempre. El regalo igual llega a la tarjeta con su fecha.'
}

/**
 * El WhatsApp de la vista previa del regalo, con el cliente de ejemplo. Con «Regalo que vence»
 * el regalo y la fecha van en el mensaje; con la insistente del catálogo, no (van a la tarjeta).
 */
export function vistaPreviaDelWhatsAppDelRegalo(
  v: Pick<VistaPreviaDelRegalo, 'cuerpos' | 'ejemplo'>,
  plantilla: 'gift_expiring' | 'reactivation_aggressive',
  regalo: string,
  vence: string
): string {
  if (plantilla === 'gift_expiring') {
    return rellenarPlantilla(v.cuerpos.gift_expiring, { '1': v.ejemplo.nombre, '2': regalo, '3': vence, '4': v.ejemplo.camino })
  }
  return rellenarPlantilla(v.cuerpos.reactivation_aggressive, {
    '1': v.ejemplo.nombre,
    '2': cantidad(v.ejemplo.puntos),
    '3': v.ejemplo.premio_proximo ?? 'premios exclusivos',
    '4': regalo,
    '5': vence,
  })
}

/** La invitación del evento tal como la recibe el cliente de ejemplo. */
export function vistaPreviaDelWhatsAppDelEvento(
  cuerpo: string,
  datos: { cliente: string; marca: string; nombre: string; fecha: string; texto: string; enlace: string }
): string {
  return rellenarPlantilla(cuerpo, {
    '1': datos.cliente,
    '2': datos.marca,
    '3': datos.nombre.trim() || 'Tu evento',
    '4': datos.fecha ? fechaDeLaInvitacion(datos.fecha) : '…',
    '5': ctaDelEvento(textoDeUnaLinea(datos.texto), datos.enlace),
  })
}

/**
 * A dónde lleva el viejo `/dashboard/calendar`: la vista por fecha de Campañas, con lo que pedía
 * la URL (`fecha`, `nombre`, `evento`). Lo usa la página que redirige.
 */
export function destinoDelCalendario(pedidos: Readonly<Record<string, string | string[] | undefined>>): string {
  const q = new URLSearchParams({ vista: 'fecha' })
  for (const k of ['fecha', 'nombre', 'evento'] as const) {
    const v = pedidos[k]
    const valor = Array.isArray(v) ? v[0] : v
    if (valor) q.set(k, valor)
  }
  return `${RUTAS_DEL_CICLO.campanas}?${q.toString()}`
}
