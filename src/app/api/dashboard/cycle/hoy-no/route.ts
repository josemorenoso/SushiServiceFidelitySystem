import { NextResponse } from 'next/server'
import { exigirAlcanceDeMarca } from '@/lib/alcance-de-marca'
import { bogotaDay } from '@/lib/cycle-engine'
import { esTarjetaConHoyNo, isoDeDia, HOY_NO_CLAVES } from '@/lib/cycle-touch'
import { anotarHoyNo } from '@/services/cycle.service'

/**
 * POST /api/dashboard/cycle/hoy-no — «Hoy no» (decisión A6): lo automático de «Para hoy» sale
 * solo; este botón lo pospone UN día. Cuerpo: `{ "tarjeta": "trimestral" }`.
 *
 * Anota en `admin_settings` el día de la PRÓXIMA corrida del cron (antes de las 15:00 de
 * Bogotá, la de hoy; después, la de mañana) y esa corrida no encola esa tarjeta
 * (`ejecutarCicloDeLaMarca()`, `pospuestoHoy()`). Es la ÚNICA escritura de la parte A.
 *
 * Escribir es de la MARCA: `exigirAlcanceDeMarca()` (un administrador de una sede no frena lo
 * de toda la marca). Un fallo de base es 500: la pantalla no puede decir «listo» si no quedó.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const guardia = await exigirAlcanceDeMarca(
    request,
    'Lo automático del ciclo es de toda la marca: solo un super usuario puede posponerlo.'
  )
  if (!guardia.ok) return guardia.res

  const cuerpo = (await request.json().catch(() => ({}))) as { tarjeta?: unknown }
  if (!esTarjetaConHoyNo(cuerpo.tarjeta)) {
    return NextResponse.json(
      { error: `«tarjeta» es una de: ${Object.keys(HOY_NO_CLAVES).join(', ')}.` },
      { status: 400 }
    )
  }

  try {
    const ahora = new Date()
    const dia = await anotarHoyNo(guardia.tenantId, cuerpo.tarjeta, ahora)
    const esHoy = dia === isoDeDia(bogotaDay(ahora))
    return NextResponse.json({
      ok: true,
      tarjeta: cuerpo.tarjeta,
      pospuesto: dia,
      mensaje: `Listo: el toque trimestral de ${esHoy ? 'hoy' : 'mañana'} sale un día después.`,
    })
  } catch (error) {
    console.error('[CycleScreen][FALLO] reason=hoy_no', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'No pudimos guardar «Hoy no». Intenta de nuevo: hasta que quede guardado, sale como estaba.' },
      { status: 500 }
    )
  }
}
