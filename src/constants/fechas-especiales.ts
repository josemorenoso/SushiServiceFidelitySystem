/**
 * Fechas especiales de Colombia — el catálogo estático del ciclo de recuperación (spec §10).
 *
 * Alimenta las tarjetas «Para hoy» («Halloween es en 27 días. ¿Creamos el evento?») y la
 * proyección del calendario (`/api/dashboard/cycle/projection`). No envía nada: sugiere.
 * Puro, sin I/O ni zona horaria: las fechas son días calendario `YYYY-MM-DD`.
 *
 * Por marca, según su `business_type` y, donde aplica, su RUBRO: «Día del Sushi» solo le
 * sirve a una marca de sushi, y `business_type` no lo dice (es `restaurant`); el rubro se
 * reconoce por el emoji de la marca o por su nombre (`rubroDeLaMarca()`).
 *
 * Las fechas móviles son las de Colombia: Día de la Madre el segundo domingo de mayo, Día del
 * Padre el tercer domingo de junio, Amor y Amistad el tercer sábado de septiembre (no el 14 de
 * febrero, que va aparte como San Valentín). Los festivos (Ley Emiliani) NO están: no son una
 * ocasión para invitar, y moverlos al lunes es otra regla.
 *
 * Ref: docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md §6.1, §6.4, §10
 */

import type { BusinessType } from '@/types/tenant.types'

/** Rubros que cambian el catálogo. Hoy uno: el sushi (Día del Sushi). */
export type Rubro = 'sushi'

export interface FechaEspecial {
  /** Estable entre años: `halloween`, `dia_de_la_madre`… */
  id: string
  nombre: string
  /** `YYYY-MM-DD` */
  fecha: string
}

interface ReglaDeFecha {
  id: string
  nombre: string
  /** El día del mes de ese año (mes 1-12). */
  dia: (anio: number) => { mes: number; dia: number }
  /** Para qué tipos de negocio. `todos` = cualquiera. */
  para: 'todos' | readonly BusinessType[]
  /** Si la fecha es de un rubro (Día del Sushi), solo para marcas de ese rubro. */
  rubro?: Rubro
}

const DIA_MS = 24 * 60 * 60 * 1000

/** 0 = domingo … 6 = sábado, del día calendario (UTC puro: no hay hora). */
function diaDeLaSemana(anio: number, mes: number, dia: number): number {
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()
}

/** El n-ésimo `diaSemana` (0 = domingo) del mes: «el segundo domingo de mayo». */
export function enesimoDelMes(anio: number, mes: number, diaSemana: number, n: number): number {
  const primero = diaDeLaSemana(anio, mes, 1)
  return 1 + ((diaSemana - primero + 7) % 7) + 7 * (n - 1)
}

const fija = (mes: number, dia: number) => () => ({ mes, dia })

/** El catálogo. Agregar una fecha es agregar una fila: ninguna pantalla cambia. */
export const FECHAS_ESPECIALES_CO: readonly ReglaDeFecha[] = [
  { id: 'san_valentin', nombre: 'San Valentín', dia: fija(2, 14), para: 'todos' },
  { id: 'dia_de_la_mujer', nombre: 'Día de la Mujer', dia: fija(3, 8), para: 'todos' },
  {
    id: 'dia_de_la_madre',
    nombre: 'Día de la Madre',
    dia: (a) => ({ mes: 5, dia: enesimoDelMes(a, 5, 0, 2) }),
    para: 'todos',
  },
  {
    id: 'dia_del_padre',
    nombre: 'Día del Padre',
    dia: (a) => ({ mes: 6, dia: enesimoDelMes(a, 6, 0, 3) }),
    para: 'todos',
  },
  { id: 'dia_del_sushi', nombre: 'Día del Sushi', dia: fija(6, 18), para: ['restaurant'], rubro: 'sushi' },
  {
    id: 'amor_y_amistad',
    nombre: 'Amor y Amistad',
    dia: (a) => ({ mes: 9, dia: enesimoDelMes(a, 9, 6, 3) }),
    para: 'todos',
  },
  { id: 'halloween', nombre: 'Halloween', dia: fija(10, 31), para: 'todos' },
  { id: 'noche_de_velitas', nombre: 'Noche de Velitas', dia: fija(12, 7), para: ['restaurant'] },
  { id: 'novenas', nombre: 'Novenas de aguinaldo', dia: fija(12, 16), para: ['restaurant'] },
  // En Colombia la Navidad se celebra la noche del 24.
  { id: 'navidad', nombre: 'Navidad', dia: fija(12, 24), para: 'todos' },
  { id: 'fin_de_ano', nombre: 'Fin de año', dia: fija(12, 31), para: 'todos' },
]

const dos = (n: number) => String(n).padStart(2, '0')

/** `YYYY-MM-DD` → número de día (días desde 1970-01-01). */
function numeroDeDia(fecha: string): number {
  return Math.floor(Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`) / DIA_MS)
}

export interface MarcaParaFechas {
  businessType: BusinessType | string | null | undefined
  rubro: Rubro | null
}

/**
 * Las fechas especiales de la marca entre `desde` y `hasta` (`YYYY-MM-DD`, ambas incluidas),
 * ordenadas por fecha. Cruza años: diciembre → enero sale bien.
 */
export function fechasEspecialesEntre(desde: string, hasta: string, marca: MarcaParaFechas): FechaEspecial[] {
  const ini = numeroDeDia(desde)
  const fin = numeroDeDia(hasta)
  if (!Number.isFinite(ini) || !Number.isFinite(fin) || fin < ini) return []
  const anioIni = new Date(ini * DIA_MS).getUTCFullYear()
  const anioFin = new Date(fin * DIA_MS).getUTCFullYear()
  const tipo = marca.businessType ?? 'restaurant'

  const out: FechaEspecial[] = []
  for (let anio = anioIni; anio <= anioFin; anio++) {
    for (const r of FECHAS_ESPECIALES_CO) {
      if (r.para !== 'todos' && !r.para.includes(tipo as BusinessType)) continue
      if (r.rubro && r.rubro !== marca.rubro) continue
      const { mes, dia } = r.dia(anio)
      const fecha = `${anio}-${dos(mes)}-${dos(dia)}`
      const n = numeroDeDia(fecha)
      if (n >= ini && n <= fin) out.push({ id: r.id, nombre: r.nombre, fecha })
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))
}

/** Emojis que dicen «sushi» en `tenants.config.template_emoji`. */
const EMOJIS_DE_SUSHI = ['🍣', '🍱', '🥢']

/**
 * El rubro de la marca, donde se puede saber: el emoji de sus plantillas
 * (`config.template_emoji`) o el nombre / slug («Sushi Service», `sushi-fun`). Sin señal,
 * `null`: la marca recibe solo las fechas de su tipo de negocio.
 */
export function rubroDeLaMarca(marca: {
  slug?: string | null
  name?: string | null
  config?: { template_emoji?: string | null } | null
}): Rubro | null {
  const emoji = marca.config?.template_emoji ?? ''
  if (EMOJIS_DE_SUSHI.some((e) => emoji.includes(e))) return 'sushi'
  const texto = `${marca.slug ?? ''} ${marca.name ?? ''}`.toLowerCase()
  return texto.includes('sushi') ? 'sushi' : null
}
