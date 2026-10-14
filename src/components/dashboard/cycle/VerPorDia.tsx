'use client'

import type { CSSProperties } from 'react'
import { COLOR_DE_CAJA, barrasPorDia, cantidad } from '@/lib/cycle-screen'
import type { CajaDelCiclo, PorDia } from '@/services/cycle-overview.service'

/**
 * «Ver por día» (spec §6.2): el histograma, plegado. Es el detalle de escritorio: el dueño no
 * necesita el día exacto, pero quien quiera ver DÓNDE se amontonan los clientes lo abre. Una
 * barra por día sin venir (el color es la caja a la que cae, según los rangos que mandó el
 * servidor), y tocar una barra abre la lista de quiénes llevan exactamente ese día.
 *
 * Una barra de 0 clientes se dibuja chata pero no se oculta: el hueco también es información.
 */
export function VerPorDia({
  porDia,
  cajas,
  seleccion,
  onElegirDia,
}: {
  porDia: PorDia | null
  cajas: CajaDelCiclo[]
  seleccion: number | null
  onElegirDia: (dia: number) => void
}) {
  const { barras, maximo, masAlla } = barrasPorDia(porDia, cajas)
  if (barras.length === 0) return null

  // El día de cada etapa (donde cae su primer toque) se rotula debajo, para ubicarse.
  const marcas = new Map(cajas.filter((c) => c.key !== 'reciente').map((c) => [c.desde, c.etiqueta]))

  return (
    <details className="group mt-4 border-t pt-3">
      <summary className="cursor-pointer select-none text-[13px] font-semibold text-muted-foreground">
        Ver por día sin venir (detalle)
      </summary>

      <div className="mt-3 overflow-x-auto pb-1">
        <div className="min-w-[640px]">
          <div
            className="grid h-36 items-end gap-px"
            style={{ gridTemplateColumns: `repeat(${barras.length}, minmax(0, 1fr))` }}
            role="group"
            aria-label="Clientes por día sin venir"
          >
            {barras.map((b) => (
              <button
                key={b.dia}
                type="button"
                aria-pressed={seleccion === b.dia}
                aria-label={`Día ${b.dia}: ${b.clientes} ${b.clientes === 1 ? 'cliente' : 'clientes'}`}
                title={`Día ${b.dia} · ${cantidad(b.clientes)} ${b.clientes === 1 ? 'cliente' : 'clientes'}`}
                onClick={() => onElegirDia(b.dia)}
                style={
                  {
                    height: `${b.clientes > 0 && maximo > 0 ? Math.max(4, (b.clientes / maximo) * 100) : 2}%`,
                    background: b.clientes > 0 ? COLOR_DE_CAJA[b.caja] : undefined,
                  } as CSSProperties
                }
                className={`min-w-0 rounded-t-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  b.clientes > 0 ? '' : 'bg-muted'
                } ${seleccion === b.dia ? 'brightness-75 ring-2 ring-foreground' : 'hover:brightness-90'}`}
              />
            ))}
          </div>

          <div
            className="relative mt-1 grid h-8 gap-px text-[10px] text-muted-foreground"
            style={{ gridTemplateColumns: `repeat(${barras.length}, minmax(0, 1fr))` }}
            aria-hidden="true"
          >
            {barras.map((b) => (
              <span key={b.dia} className="relative">
                {marcas.has(b.dia) && (
                  <span className="absolute left-0 top-0 whitespace-nowrap leading-tight">
                    <b className="font-semibold text-foreground">día {b.dia}</b>
                    <br />
                    {marcas.get(b.dia)}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Cada barra es un día sin venir; su color, la etapa en la que cae. Toca una para ver quiénes son.
        {masAlla > 0 && <> Además, {cantidad(masAlla)} llevan más de {barras.length - 1} días.</>}
      </p>
    </details>
  )
}
