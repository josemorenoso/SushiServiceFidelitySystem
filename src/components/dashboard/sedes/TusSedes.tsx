'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import type { ResumenDeSedes, ResumenDeUnaSede } from '@/types/analytics.types'
import { explicacionSinSede, graficoDeSedes, lineaVanAVarias } from '@/lib/panel-sedes'
import { TituloDeSeccion } from './Alcance'

/**
 * «Tus sedes» — lo de cada sede, debajo de los totales de la marca (sedes separadas, parte 1,
 * 2026-10-14).
 *
 * El dueño: *«Tiene que haber una distinción clara en el dashboard de cuántos clientes entró
 * cada una… Si hace falta añadir un nuevo gráfico para las que son sucursales, hagámoslo.»*
 *
 * - Una tarjeta por sede, lado a lado (dos columnas en el celular): clientes que trajo (total y
 *   este mes), clientes que vinieron, visitas y premios entregados, los tres en 30 días.
 *   Conteos, nunca pesos (D7).
 * - Una línea con los clientes que van a las dos sedes: se cuentan en cada tarjeta, no se reparten.
 * - La fila «Sin sede», solo si hay algo sin sede, con la frase que dice qué es.
 * - El gráfico nuevo: visitas por día de cada sede, en el mismo gráfico, 30 días.
 *
 * Solo se dibuja con «toda la marca» elegida y 2+ sedes (la página decide). Sin estado: lo que
 * llega en `resumen` (de `getFullAnalytics()`, `sedes`) es lo que se ve.
 */
export function TusSedes({ resumen, loading }: { resumen: ResumenDeSedes | null; loading: boolean }) {
  const activas = resumen ? resumen.sedes.filter((s) => s.activa).length : 0
  const grafico = resumen ? graficoDeSedes(resumen) : null
  const columnasLg = resumen && resumen.sedes.length >= 4 ? 'lg:grid-cols-4' : resumen && resumen.sedes.length === 3 ? 'lg:grid-cols-3' : ''

  return (
    <section className="space-y-4" aria-label="Tus sedes">
      <TituloDeSeccion titulo="Tus sedes" detalle="Lo de cada sede, en los últimos 30 días. Arriba, la marca entera." de="sede" />

      {loading || !resumen || !grafico ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <div className={`grid grid-cols-2 gap-3 ${columnasLg}`}>
            {resumen.sedes.map((s) => (
              <TarjetaDeSede key={s.locationId} sede={s} punto={grafico.estiloDe(s.locationId).color} />
            ))}
          </div>

          <p className="text-sm" style={{ color: 'var(--brand-ink-soft)' }} data-linea="van-a-varias">
            {lineaVanAVarias(resumen.clientesEnVariasSedes, activas)}
          </p>

          {resumen.sinSede && <FilaSinSede fila={resumen.sinSede} sedes={activas} />}

          <div className="dashboard-card p-4 sm:p-6">
            <h3 className="font-playfair mb-1 text-lg font-bold" style={{ color: 'var(--brand-ink)', letterSpacing: '-0.02em' }}>
              Visitas por día, cada sede
            </h3>
            <p className="mb-4 text-xs" style={{ color: 'var(--brand-ink-soft)' }}>
              Últimos 30 días. Una línea por sede{grafico.series.some((x) => x.key === 'sin_sede') ? '; la punteada gris es lo que no tiene sede' : ''}.
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={grafico.filas.map((f) => ({ ...f, label: etiquetaDeDia(String(f.date)) }))} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', fontSize: '13px', border: '1px solid rgba(0,0,0,0.08)' }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: '13px' }} />
                {grafico.series.map((serie) => (
                  <Line
                    key={serie.key}
                    type="monotone"
                    dataKey={serie.key}
                    name={serie.nombre}
                    stroke={serie.color}
                    strokeWidth={2}
                    strokeDasharray={serie.trazo}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  )
}

function etiquetaDeDia(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

function Dato({ valor, label, extra }: { valor: number; label: string; extra?: string }) {
  return (
    <div>
      <p className="tabular-nums leading-none" style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.04em', color: 'var(--brand-ink)' }}>
        {valor}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase leading-tight" style={{ color: 'var(--brand-ink-muted)', letterSpacing: '0.03em' }}>
        {label}
      </p>
      {extra && (
        <p className="text-[11px] leading-tight" style={{ color: 'var(--brand-ink-soft)' }}>
          {extra}
        </p>
      )}
    </div>
  )
}

function TarjetaDeSede({ sede, punto }: { sede: ResumenDeUnaSede; punto: string }) {
  return (
    <div className="dashboard-card min-w-0 p-4" data-sede={sede.locationId ?? 'sin_sede'}>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: punto }} aria-hidden />
        <h3 className="truncate text-sm font-bold" style={{ color: 'var(--brand-ink)' }} title={sede.nombre}>
          {sede.nombre}
        </h3>
        {!sede.activa && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase" style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--brand-ink-soft)' }}>
            Cerrada
          </span>
        )}
      </div>
      <div className="grid gap-3">
        <Dato valor={sede.clientesQueTrajo} label="Clientes que trajo" extra={`${sede.clientesQueTrajoEsteMes} este mes`} />
        <Dato valor={sede.clientesQueVinieron} label="Vinieron · 30 días" />
        <Dato valor={sede.visitas} label="Visitas · 30 días" />
        <Dato valor={sede.premiosEntregados} label="Premios entregados · 30 días" />
      </div>
    </div>
  )
}

function FilaSinSede({ fila, sedes }: { fila: ResumenDeUnaSede; sedes: number }) {
  return (
    <div className="rounded-2xl border border-dashed p-4" style={{ borderColor: 'rgba(0,0,0,0.15)' }} data-sede="sin_sede">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className="text-sm font-bold" style={{ color: 'var(--brand-ink)' }}>
          Sin sede
        </h3>
        <p className="text-sm tabular-nums" style={{ color: 'var(--brand-ink-soft)' }}>
          {fila.clientesQueTrajo} clientes registrados · en 30 días, {fila.visitas} visitas y {fila.premiosEntregados} premios entregados
        </p>
      </div>
      <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--brand-ink-soft)' }}>
        {explicacionSinSede(fila, sedes).map((frase) => (
          <li key={frase}>{frase}</li>
        ))}
      </ul>
    </div>
  )
}
