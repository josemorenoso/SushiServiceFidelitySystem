import { NextResponse } from 'next/server'
import { getTenantById, requireTenantId } from '@/lib/tenant'
import { CYCLE_STAGES } from '@/lib/cycle-engine'
import {
  getCycleCustomers,
  POR_PAGINA_DEFAULT,
  POR_PAGINA_MAX,
  type FiltroDeClientes,
} from '@/services/cycle-overview.service'

/**
 * GET /api/dashboard/cycle/customers — quiénes están en una caja (spec §6.2: tocar una caja
 * abre la lista), paginado. UN filtro:
 *   · `?stage=reciente|t1|t2|t3|t4|t5` — los que están HOY en esa caja;
 *   · `?day=N` — los que llevan N días sin venir (el detalle «Ver por día»);
 *   · `?state=dormido` — la caja Dormidos (con los que ya no reciben nada automático);
 *   · `?fecha=AAAA-MM-DD` (y opcional `&stage=t1…t5|heartbeat`) — los que ENTRAN a un toque ese
 *     día: el calendario, al tocar un día.
 * `&page=1&limit=50` (máximo 100). Cada fila: nombre, ciclo, visitas, puntos, nuevo o ya volvió,
 * el último toque y si volvió. Sin teléfono: la lista no lo necesita.
 */

export const dynamic = 'force-dynamic'

const NO_SE_PUDO = 'No pudimos leer esta lista en este momento. Intenta de nuevo en un minuto.'
const CAJAS = ['reciente', ...CYCLE_STAGES] as const
const TOQUES = [...CYCLE_STAGES, 'heartbeat'] as const
const FECHA = /^\d{4}-\d{2}-\d{2}$/

type Lectura = { ok: true; filtro: FiltroDeClientes } | { ok: false; error: string }

function leerFiltro(params: URLSearchParams): Lectura {
  const stage = params.get('stage')
  const day = params.get('day')
  const state = params.get('state')
  const fecha = params.get('fecha')

  if (fecha !== null) {
    if (!FECHA.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) {
      return { ok: false, error: '«fecha» va como AAAA-MM-DD.' }
    }
    if (stage !== null && !(TOQUES as readonly string[]).includes(stage)) {
      return { ok: false, error: `Con «fecha», «stage» es uno de: ${TOQUES.join(', ')}.` }
    }
    return { ok: true, filtro: { tipo: 'fecha', fecha, etapa: (stage as (typeof TOQUES)[number] | null) ?? null } }
  }

  const pedidos = [stage, day, state].filter((x) => x !== null).length
  if (pedidos !== 1) return { ok: false, error: 'Pide UNA cosa: stage, day, state=dormido o fecha.' }
  if (stage !== null) {
    if (!(CAJAS as readonly string[]).includes(stage)) {
      return { ok: false, error: `«stage» es una de: ${CAJAS.join(', ')}.` }
    }
    return { ok: true, filtro: { tipo: 'etapa', etapa: stage as (typeof CAJAS)[number] } }
  }
  if (day !== null) {
    if (!/^\d{1,4}$/.test(day)) return { ok: false, error: '«day» es un número de días sin venir (0 o más).' }
    return { ok: true, filtro: { tipo: 'dia', dia: Number(day) } }
  }
  if (state !== 'dormido') return { ok: false, error: '«state» solo puede ser «dormido».' }
  return { ok: true, filtro: { tipo: 'dormidos' } }
}

function entero(texto: string | null, porDefecto: number, max: number): number | null {
  if (texto === null) return porDefecto
  if (!/^\d{1,6}$/.test(texto) || Number(texto) < 1) return null
  return Math.min(max, Number(texto))
}

export async function GET(request: Request) {
  let tenantId: string
  try {
    tenantId = await requireTenantId()
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const params = new URL(request.url).searchParams
  const lectura = leerFiltro(params)
  if (!lectura.ok) return NextResponse.json({ error: lectura.error }, { status: 400 })
  const pagina = entero(params.get('page'), 1, Number.MAX_SAFE_INTEGER)
  const porPagina = entero(params.get('limit'), POR_PAGINA_DEFAULT, POR_PAGINA_MAX)
  if (pagina === null || porPagina === null) {
    return NextResponse.json({ error: '«page» y «limit» son números de 1 en adelante.' }, { status: 400 })
  }

  const tenant = await getTenantById(tenantId)
  if (!tenant) return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })

  try {
    return NextResponse.json(await getCycleCustomers(tenant, lectura.filtro, { pagina, porPagina }))
  } catch (error) {
    console.error('[CycleScreen][FALLO] reason=customers', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: NO_SE_PUDO }, { status: 500 })
  }
}
