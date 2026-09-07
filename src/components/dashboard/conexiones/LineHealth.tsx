'use client'

import { Loader2 } from 'lucide-react'
import type { LineBudgetResponse } from './types'

/**
 * La salud de la línea, dentro de la tarjeta de WhatsApp.
 *
 * **Reusa `/api/dashboard/line-budget` tal cual.** No recalcula nada: la gobernanza de
 * envío (`line_budget()`, `reserve_send_slot()`, la cola) no se toca ni se duplica. Si
 * algún día cambia el cupo, cambia acá solo porque cambió esa ruta.
 *
 * `enforced: false` no es «sin datos»: es «no conocemos el límite de esta línea, así que
 * se cuenta el consumo pero no se bloquea ningún envío» — el estado de los tenants Twilio
 * anteriores a la 00037. Decirle «0 de 0» a alguien que envía sin problema sería mentir.
 */

const QUALITY_LABEL: Record<string, string> = {
  green: 'Calidad alta',
  yellow: 'Calidad media',
  red: 'Calidad baja',
  unknown: 'Calidad sin calificar',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  throttled: 'Limitada por Meta',
  frozen: 'Congelada por Meta',
}

export function LineHealth({ budget, loading }: { budget: LineBudgetResponse | null; loading: boolean }) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando la salud de la línea…
      </p>
    )
  }

  if (!budget || !budget.available) {
    return (
      <p className="text-sm" style={{ color: 'var(--brand-ink-muted)' }}>
        Salud de la línea: no disponible.
      </p>
    )
  }

  const used = budget.used24h ?? 0
  const limit = budget.limit ?? null
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null
  const quality = QUALITY_LABEL[budget.qualityRating ?? 'unknown'] ?? QUALITY_LABEL.unknown
  const status = STATUS_LABEL[budget.lineStatus ?? 'active'] ?? STATUS_LABEL.active

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-medium" style={{ color: 'var(--brand-ink)' }}>
          Salud de la línea
        </span>
        {budget.enforced && limit ? (
          <span style={{ color: 'var(--brand-ink-soft)' }}>
            {used} de {limit} personas distintas en las últimas 24 h
          </span>
        ) : (
          <span style={{ color: 'var(--brand-ink-soft)' }}>
            {used} personas distintas en las últimas 24 h · Meta todavía no le fijó un tope a esta línea
          </span>
        )}
      </div>

      {pct !== null && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: 'rgba(0,0,0,0.06)' }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Cupo de la línea consumido hoy"
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, var(--brand-primary) 0%, var(--brand-primary-end) 100%)',
            }}
          />
        </div>
      )}

      <p className="text-xs" style={{ color: 'var(--brand-ink-muted)' }}>
        {status} · {quality}
        {typeof budget.queueDepth === 'number' && budget.queueDepth > 0
          ? ` · ${budget.queueDepth} mensaje(s) esperando en la cola`
          : ''}
      </p>
    </div>
  )
}
