'use client'

import type { CSSProperties } from 'react'
import {
  COLOR_DE_CAJA,
  cantidad,
  porcentajeDeNuevos,
  rangoDeCaja,
  regaloDeCaja,
  textoDeRetorno,
  type ClaveDeCaja,
} from '@/lib/cycle-screen'
import type { CajaDelCiclo, CajaDormidos } from '@/services/cycle-overview.service'

interface DatosDeLaCaja {
  clave: ClaveDeCaja
  etiqueta: string
  rango: string
  total: number
  nuevos: number
  yaVolvieron: number
  hoyEntran: number
  regalo: string | null
  retorno: string | null
  /** Solo Dormidos: los que ya no reciben nada automático. */
  sinToques?: number
}

function deCaja(c: CajaDelCiclo): DatosDeLaCaja {
  return {
    clave: c.key,
    etiqueta: c.etiqueta,
    rango: rangoDeCaja(c),
    total: c.total,
    nuevos: c.nuevos,
    yaVolvieron: c.ya_volvieron,
    hoyEntran: c.hoy_entran,
    regalo: c.regalo,
    retorno: textoDeRetorno(c.retorno),
  }
}

function deDormidos(d: CajaDormidos): DatosDeLaCaja {
  return {
    clave: 'dormidos',
    etiqueta: d.etiqueta,
    rango: 'sin insistir',
    total: d.total,
    nuevos: d.nuevos,
    yaVolvieron: d.ya_volvieron,
    hoyEntran: d.hoy_entran,
    regalo: d.regalo,
    retorno: textoDeRetorno(d.retorno),
    sinToques: d.sin_toques_hace_6_meses,
  }
}

/**
 * Las cajas (spec §6.2): una por etapa —Recién vino y las que existan para la marca— y una gris
 * de Dormidos. El dueño no necesita el día exacto: necesita cuántos hay en cada etapa y cuántos
 * son NUEVOS (una sola visita) contra los que YA VOLVIERON. Contesta Juanita contra Sara de un
 * vistazo y cabe en un celular en dos columnas. Tocar una abre la lista de quiénes.
 *
 * Los colores salen de `COLOR_DE_CAJA` (solo `--brand-*`, sin hex). Todo lo que se muestra viene
 * de la portada (el motor del cron); acá no se calcula ninguna etapa.
 */
export function CajasDelCiclo({
  cajas,
  dormidos,
  seleccion,
  onElegir,
}: {
  cajas: CajaDelCiclo[]
  dormidos: CajaDormidos
  seleccion: ClaveDeCaja | null
  onElegir: (clave: ClaveDeCaja) => void
}) {
  const todas = [...cajas.map(deCaja), deDormidos(dormidos)]

  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4" aria-label="Clientes por etapa">
      {todas.map((c) => {
        const elegida = seleccion === c.clave
        const pctNuevos = porcentajeDeNuevos({ total: c.total, nuevos: c.nuevos })
        return (
          <li key={c.clave} className="min-w-0">
            <button
              type="button"
              aria-pressed={elegida}
              onClick={() => onElegir(c.clave)}
              style={{ '--c': COLOR_DE_CAJA[c.clave] } as CSSProperties}
              className={`grid h-full w-full min-w-0 gap-1.5 rounded-lg border border-t-[5px] border-t-[var(--c)] bg-[color-mix(in_oklab,var(--c)_8%,var(--card))] p-2.5 text-left transition-shadow focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                elegida ? 'ring-2 ring-foreground' : 'hover:shadow-sm'
              }`}
            >
              <span className="text-[13px] font-semibold leading-tight">{c.etiqueta}</span>
              <span className="text-[11px] text-muted-foreground">{c.rango}</span>
              <span className="text-2xl font-semibold leading-none tabular-nums sm:text-[28px]">{cantidad(c.total)}</span>

              <span className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <i className="block h-full bg-[var(--c)]" style={{ width: `${pctNuevos}%` }} />
                <i
                  className="block h-full bg-[color-mix(in_oklab,var(--c)_40%,var(--card))]"
                  style={{ width: `${c.total > 0 ? 100 - pctNuevos : 0}%` }}
                />
              </span>
              <span className="flex justify-between gap-1.5 text-[11px] text-muted-foreground">
                <span>
                  <b className="font-semibold text-foreground tabular-nums">{cantidad(c.nuevos)}</b> nuevos
                </span>
                <span>
                  <b className="font-semibold text-foreground tabular-nums">{cantidad(c.yaVolvieron)}</b> ya volvieron
                </span>
              </span>

              <span className="grid gap-0.5 border-t border-dashed pt-1.5 text-[11px] text-muted-foreground">
                <span>
                  Hoy entran <b className="font-semibold text-foreground tabular-nums">{cantidad(c.hoyEntran)}</b>
                  {c.clave !== 'reciente' && <> · {regaloDeCaja(c.regalo)}</>}
                </span>
                {c.retorno && <span>{c.retorno}</span>}
                {c.sinToques !== undefined && c.sinToques > 0 && (
                  <span>{cantidad(c.sinToques)} sin toques desde hace más de 6 meses</span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
