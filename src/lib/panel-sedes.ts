/**
 * El panel con varias sedes: qué ofrece el selector, en qué modo se dibuja el panel y qué
 * pantallas son de toda la marca (sedes separadas, parte 1, 2026-10-14).
 *
 * El dueño, mirando Tepuy: *«¿Por qué salen 4 opciones? Eso no tiene sentido alguno»* (Todas
 * las sedes · Laureles · Envigado · Sin sede) y *«Al cambiar de sede en el dashboard no cambia
 * nada»*. Lo que pidió: *«una jerarquía bien hecha… cada cosa en su lugar, se ven desde el
 * mismo lado pero bien separadas»*. Arriba la marca, debajo cada sede; cada número es de la sede
 * elegida o dice que es de toda la marca.
 *
 * PURO a propósito y seguro para el navegador (solo importa `location-scope-shared.ts`): lo
 * usan el selector, la franja y la página de Métricas, y se prueba sin base ni navegador.
 *
 * Vocabulario de pantalla: «sede», «toda la marca», «las dos sedes», «sin sede». Nunca
 * «location», «scope» ni «origin».
 */

import { LOCATION_ALL, type LocationScopeView } from '@/lib/location-scope-shared'
import { SIN_SEDE, type ResumenDeSedes } from '@/types/analytics.types'

export interface OpcionDelSelector {
  value: string
  label: string
}

/** «2 sedes», «1 sede». */
export function contarSedes(n: number): string {
  return `${n} ${n === 1 ? 'sede' : 'sedes'}`
}

/**
 * Las opciones del selector del encabezado. Lista vacía = el selector no se dibuja.
 *
 * - Marca de 0 o 1 sede activa: nada (el interruptor de compatibilidad del §8.3).
 * - Usuario de marca con 2+ sedes: **«Toda la marca (N sedes)» y una por sede. Nada más.**
 *   «Sin sede» salió del selector: no es un lugar que se pueda elegir, es lo que el sistema no
 *   sabe. Se sigue mostrando, en su propia fila de «Tus sedes»; `?location_id=unknown` sigue
 *   funcionando en las rutas para quien lo use.
 * - Administrador de UNA sede: una sola opción → no se dibuja (como antes).
 * - Administrador de varias sedes: «Tus N sedes» y una por sede (antes el selector quedaba
 *   parado en un valor que no estaba en la lista).
 */
export function opcionesDelSelector(view: LocationScopeView | null): OpcionDelSelector[] {
  if (!view || !view.multiSede) return []
  const opciones: OpcionDelSelector[] = []
  if (view.canSeeAll) {
    opciones.push({ value: LOCATION_ALL, label: `Toda la marca (${contarSedes(view.brandLocationCount)})` })
  } else if (view.locations.length >= 2) {
    opciones.push({ value: LOCATION_ALL, label: `Tus ${contarSedes(view.locations.length)}` })
  }
  for (const l of view.locations) opciones.push({ value: l.id, label: l.name })
  return opciones.length > 1 ? opciones : []
}

/**
 * Cómo se dibuja el panel de Métricas.
 *
 * - `una-sede`: la marca tiene 0 o 1 sede activa (o el alcance no se pudo leer). **Exactamente
 *   como antes de esta parte**: ni una etiqueta nueva.
 * - `toda-la-marca`: marca con 2+ sedes y «Toda la marca» elegida. Los totales, y debajo «Tus sedes».
 * - `sede`: una sede elegida (o las sedes de un administrador de sede). Arriba lo de esa sede;
 *   debajo, con su título, lo que es de toda la marca.
 */
export type ModoDelPanel =
  | { modo: 'una-sede' }
  | { modo: 'toda-la-marca'; sedes: number }
  | {
      modo: 'sede'
      /** «Tepuy Envigado», o «tus 2 sedes» para un administrador de varias. */
      nombre: string
      /** `true` si el recorte son varias sedes (un administrador de varias): cambia «esta sede» por «tus sedes». */
      varias: boolean
      sedes: number
    }

export function modoDelPanel(view: LocationScopeView | null): ModoDelPanel {
  if (!view || !view.multiSede) return { modo: 'una-sede' }
  const sedes = view.brandLocationCount
  if (view.selection === 'all' && view.role === 'brand') return { modo: 'toda-la-marca', sedes }
  if (view.selection === 'one') {
    const sede = view.locations.find((l) => l.id === view.selectedLocationId)
    return { modo: 'sede', nombre: sede?.name ?? 'Esta sede', varias: false, sedes }
  }
  if (view.selection === 'unknown') return { modo: 'sede', nombre: 'Sin sede', varias: false, sedes }
  // Administrador de sede con «todas» = sus sedes.
  if (view.locations.length === 1) return { modo: 'sede', nombre: view.locations[0].name, varias: false, sedes }
  return { modo: 'sede', nombre: `tus ${contarSedes(view.locations.length)}`, varias: true, sedes }
}

/**
 * Las pantallas que son de TODA la marca: lo que se ve y se cambia ahí lo ven y lo usan todas
 * las sedes, y el selector de sede no les cambia nada. En ellas el selector se reemplaza por
 * una etiqueta quieta («Toda la marca») y debajo del encabezado sale la franja «Esto es de toda
 * la marca: lo ven y lo usan las N sedes» (`FranjaTodaLaMarca`). La auditoría pantalla por
 * pantalla que decidió esta lista está en `docs/features/multi-sede.md` § «Qué es de la marca y
 * qué es de cada sede, pantalla por pantalla».
 *
 * ⚠️ Campañas y Calendario NO están, a propósito: los rehace la fase 2 del ciclo (parte C) y su
 * línea quedó en `docs/PENDIENTES.md`.
 */
export const PANTALLAS_DE_TODA_LA_MARCA: readonly string[] = [
  '/dashboard/customers', // Clientes: los clientes son de la marca (filtrar por sede de registro: PENDIENTES)
  '/dashboard/imported-contacts', // Golden Bullet
  '/dashboard/marca', // Tarjeta principal (hasta la parte 2: «una tarjeta por sede»)
  '/dashboard/templates', // Plantillas
  '/dashboard/staff', // Meseros: la lista entera de la marca, cada uno con su sede al lado
  '/dashboard/conexiones', // Conexiones: la línea de WhatsApp es de la marca (D6)
  '/dashboard/accesos', // Accesos: los usuarios de la marca, cada uno con sus sedes
  '/dashboard/settings', // Ajustes
]

/**
 * Las pantallas que eligen la sede ADENTRO (su propia lista): el selector del encabezado no les
 * cambia nada y no se dibuja, para que no parezca que sí.
 */
export const PANTALLAS_CON_SU_PROPIA_SEDE: readonly string[] = [
  '/dashboard/sedes', // Mis sedes: la lista de sedes es la pantalla
  '/dashboard/qr', // QR Studio: un QR por sede, con su propio selector
]

function coincide(lista: readonly string[], pathname: string | null): boolean {
  if (!pathname) return false
  return lista.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function esPantallaDeTodaLaMarca(pathname: string | null): boolean {
  return coincide(PANTALLAS_DE_TODA_LA_MARCA, pathname)
}

export function esPantallaConSuPropiaSede(pathname: string | null): boolean {
  return coincide(PANTALLAS_CON_SU_PROPIA_SEDE, pathname)
}

/**
 * Por qué «vinieron» de las sedes no suma el total: quien va a varias cuenta en cada una. Se
 * cuenta, no se reparte.
 */
export function fraseVanAVarias(sedes: number): string {
  return sedes === 2
    ? 'Un cliente que va a las dos sedes cuenta en las dos.'
    : 'Un cliente que va a varias sedes cuenta en cada una.'
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * La línea de «Tus sedes» sobre los clientes que van a más de una sede (30 días). Se cuentan en
 * cada tarjeta, no se reparten: por eso «vinieron» de las sedes suma más que la marca.
 */
export function lineaVanAVarias(clientes: number, sedes: number): string {
  const dos = sedes === 2
  const destino = dos ? 'a las dos sedes' : 'a más de una sede'
  if (clientes === 0) return `Ningún cliente vino ${destino} en estos 30 días.`
  const uno = clientes === 1
  return (
    `${plural(clientes, 'cliente va', 'clientes van')} ${destino}: en estos 30 días ` +
    `${uno ? 'vino' : 'vinieron'} ${dos ? 'a las dos' : 'a varias'} y ${uno ? 'cuenta' : 'cuentan'} en cada tarjeta. ` +
    `${uno ? 'No se reparte.' : 'No se reparten.'}`
  )
}

/**
 * Qué es la fila «Sin sede», en palabras del dueño. Lo que no sabe de qué sede es no se reparte
 * ni se esconde (multi-sede §4): va aparte, con la frase que dice por qué.
 */
export function explicacionSinSede(
  fila: { clientesQueTrajo: number; visitas: number; premiosEntregados: number },
  sedes: number
): string[] {
  const cuantas = sedes === 2 ? 'dos' : 'varias'
  const frases: string[] = []
  if (fila.clientesQueTrajo > 0) {
    frases.push(
      `${plural(fila.clientesQueTrajo, 'cliente se registró', 'clientes se registraron')} antes de tener ${cuantas} sedes, o por el enlace general de la marca.`
    )
  }
  if (fila.visitas > 0) {
    frases.push(
      `${plural(fila.visitas, 'visita', 'visitas')} de estos 30 días no ${fila.visitas === 1 ? 'dice' : 'dicen'} en qué sede fue: un aparato o un mesero sin sede asignada, o el enlace general.`
    )
  }
  if (fila.premiosEntregados > 0) {
    frases.push(
      `${plural(fila.premiosEntregados, 'premio se entregó', 'premios se entregaron')} sin que el sistema supiera la sede (antes del 14-10-2026 no se guardaba).`
    )
  }
  frases.push('No se reparte entre las sedes: se muestra aparte.')
  return frases
}

// ─── El gráfico «Visitas por día, cada sede» ───────────────────────────────────

/** Una línea del gráfico. `trazo` = guiones del SVG: la segunda señal, además del color. */
export interface SerieDelGrafico {
  key: string
  nombre: string
  color: string
  trazo?: string
}

/**
 * Los colores salen de la MARCA (`--brand-*`, que cada tenant pisa), nunca un hex. Orden fijo,
 * por la posición de la sede en el selector (la principal primero): el color sigue a la sede,
 * no a su puesto en visitas. Desde la tercera, además del color, un trazo propio.
 */
const ESTILOS: readonly { color: string; trazo?: string }[] = [
  { color: 'var(--brand-primary)' },
  { color: 'var(--brand-ink)' },
  { color: 'var(--brand-primary-end)', trazo: '6 3' },
  { color: 'var(--brand-ink-soft)', trazo: '2 3' },
]
const ESTILO_SIN_SEDE = { color: 'var(--brand-ink-muted)', trazo: '4 4' }

/** Con más de cuatro sedes, las tres primeras con nombre y el resto sumado: doce líneas no se leen. */
export const MAX_SEDES_CON_LINEA_PROPIA = 4
export const OTRAS_SEDES = 'otras_sedes'

/**
 * Las series y las filas del gráfico, y el color de cada sede (el mismo punto en su tarjeta).
 * «Sin sede» va con su propia línea punteada, solo si tiene visitas: no se reparte ni se esconde.
 */
export function graficoDeSedes(resumen: ResumenDeSedes): {
  series: SerieDelGrafico[]
  filas: Array<Record<string, number | string>>
  estiloDe: (locationId: string | null) => { color: string; trazo?: string }
} {
  const sedes = resumen.sedes
  const doblan = sedes.length > MAX_SEDES_CON_LINEA_PROPIA
  const conNombre = doblan ? sedes.slice(0, MAX_SEDES_CON_LINEA_PROPIA - 1) : sedes
  const resto = doblan ? sedes.slice(MAX_SEDES_CON_LINEA_PROPIA - 1) : []

  const estilos = new Map<string, { color: string; trazo?: string }>()
  const series: SerieDelGrafico[] = conNombre.map((s, i) => {
    const estilo = ESTILOS[i]
    estilos.set(s.locationId as string, estilo)
    return { key: `s${i}`, nombre: s.nombre, ...estilo }
  })
  if (resto.length > 0) {
    const estilo = ESTILOS[MAX_SEDES_CON_LINEA_PROPIA - 1]
    for (const s of resto) estilos.set(s.locationId as string, estilo)
    series.push({ key: OTRAS_SEDES, nombre: `Otras ${contarSedes(resto.length)}`, ...estilo })
  }
  const conSinSede = resumen.visitasPorDia.some((d) => SIN_SEDE in d.porSede)
  if (conSinSede) series.push({ key: SIN_SEDE, nombre: 'Sin sede', ...ESTILO_SIN_SEDE })

  const filas = resumen.visitasPorDia.map((d) => {
    const fila: Record<string, number | string> = { date: d.date }
    conNombre.forEach((s, i) => (fila[`s${i}`] = d.porSede[s.locationId as string] ?? 0))
    if (resto.length > 0) fila[OTRAS_SEDES] = resto.reduce((n, s) => n + (d.porSede[s.locationId as string] ?? 0), 0)
    if (conSinSede) fila[SIN_SEDE] = d.porSede[SIN_SEDE] ?? 0
    return fila
  })

  return {
    series,
    filas,
    estiloDe: (locationId) => (locationId === null ? ESTILO_SIN_SEDE : (estilos.get(locationId) ?? ESTILO_SIN_SEDE)),
  }
}

// ─── El número de WhatsApp, compartido ─────────────────────────────────────────

/** El número como se lee: `+57 300 903 3799`. Mismo formato que la tarjeta de Conexiones. */
export function formatearWhatsapp(raw: string | null | undefined): string | null {
  if (!raw) return null
  const clean = raw.replace(/^whatsapp:/i, '').trim()
  const m = clean.match(/^\+57(\d{3})(\d{3})(\d{4})$/)
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : clean
}

/**
 * «Las 2 sedes comparten el WhatsApp +57 604 201 1012 (Zernio). Un número propio para cada sede:
 * próximamente.» Hoy la línea se elige leyendo solo columnas de `tenants` (0.THETA): un número
 * por sede es la parte 3 de este trabajo (diseño). El número sale de donde el panel ya lo lee
 * (`GET /api/dashboard/conexiones` → `whatsapp.phone` y `whatsapp.provider`).
 */
export function lineaNumeroCompartido(p: { sedes: number; telefono: string | null | undefined; proveedor: string | null | undefined }): string {
  const numero = formatearWhatsapp(p.telefono)
  const por = p.proveedor === 'zernio' ? 'Zernio' : 'Twilio'
  const cuales = p.sedes === 2 ? 'Las dos sedes' : `Las ${contarSedes(p.sedes)}`
  const comparten = numero ? `comparten el WhatsApp ${numero} (${por})` : `comparten el WhatsApp de la marca (${por}), que todavía no tiene número`
  return `${cuales} ${comparten}. Un número propio para cada sede: próximamente.`
}

/** La frase de la franja. Una sola, para que la pantalla y la prueba no discrepen. */
export function fraseTodaLaMarca(sedes: number): string {
  return `Esto es de toda la marca: lo ven y lo usan las ${contarSedes(sedes)}.`
}
