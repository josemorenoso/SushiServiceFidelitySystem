'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Users, ShoppingBag, UserPlus, Star, Cake, QrCode, TrendingUp } from 'lucide-react'
import { MiniSparkline } from './MiniSparkline'
import type { AnalyticsSummary } from '@/types/analytics.types'

/**
 * La fila de métricas que abre el panel.
 *
 * CAPA VISUAL v3 (2026-09-07). Hasta hoy eran SIETE tarjetas idénticas: mismo
 * tamaño, mismo borde y siete colores distintos, uno por métrica. Todo pesaba
 * igual, entonces nada pesaba — el dueño abría el panel y no sabía en tres
 * segundos si el día iba bien. Este panel es el argumento de venta del producto:
 * si se ve caro, se cobra más.
 *
 * Qué cambió, y qué NO:
 *
 *   - **Ninguna métrica se fue.** Siguen las siete. El kit visual sugería dejar
 *     "1 héroe + 4 secundarias", pero sacar métricas del panel es una decisión
 *     del dueño, no de quien lo pinta. Lo que cambió es el PESO, no el contenido.
 *   - **Visitas Hoy pasa a ser la tarjeta héroe**: es la única que responde
 *     "¿cómo va hoy?", así que es la única oscura, grande y a doble columna.
 *   - **El arcoíris se fue.** Siete colores decorativos (verde, azul, violeta,
 *     cian, índigo, ámbar, rosa) que no significaban nada: no eran una escala,
 *     no codificaban un estado, solo diferenciaban tarjetas que ya se
 *     diferencian por su título. Ahora el color es de la marca y aparece en un
 *     solo sitio — el héroe (regla 01 del kit: una sola cosa brilla).
 *
 * Los colores salen de las variables del sistema (`--brand-*`), no de hex
 * horneados acá: la regla de §5 vale igual en el panel que en las públicas.
 */

interface MetricsCardsProps {
  summary: AnalyticsSummary | null
  loading: boolean
}

/** La métrica que abre el panel: grande, oscura y a doble columna. */
const HERO_METRIC = {
  key: 'visitsToday' as const,
  label: 'Visitas Hoy',
  icon: TrendingUp,
  trend: 'up' as const,
}

/** Las otras seis: claras, chicas y todas con el mismo peso entre sí. */
const SECONDARY_METRICS = [
  { key: 'qrToday' as const, label: 'QR Hoy', icon: QrCode, trend: 'stable' as const },
  { key: 'deliveriesToday' as const, label: 'Domicilios Hoy', icon: ShoppingBag, trend: 'up' as const },
  { key: 'newCustomersToday' as const, label: 'Nuevos Hoy', icon: UserPlus, trend: 'up' as const },
  { key: 'totalCustomers' as const, label: 'Total Clientes', icon: Users, trend: 'up' as const },
  { key: 'frequentCustomers' as const, label: 'Frecuentes (3+)', icon: Star, trend: 'stable' as const },
  { key: 'birthdaysToday' as const, label: 'Cumpleaños Hoy', icon: Cake, trend: 'stable' as const },
]

export function MetricsCards({ summary, loading }: MetricsCardsProps) {
  const HeroIcon = HERO_METRIC.icon

  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {/* ── Héroe ─────────────────────────────────────────────────────── */}
      <div className="metric-card-hero relative col-span-2 overflow-hidden rounded-2xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'rgba(var(--brand-primary-rgb), 0.18)' }}
          >
            <HeroIcon
              className="h-[18px] w-[18px]"
              strokeWidth={1.5}
              style={{ color: 'var(--brand-primary)' }}
            />
          </div>
        </div>

        {loading ? (
          <Skeleton className="mb-1 h-11 w-24 bg-white/10" />
        ) : (
          <p
            className="tabular-nums leading-none text-white"
            style={{ fontSize: '2.75rem', fontWeight: 700, letterSpacing: '-0.05em' }}
          >
            {summary?.[HERO_METRIC.key] ?? 0}
          </p>
        )}

        <p
          className="mt-2 text-xs font-semibold uppercase"
          style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}
        >
          {HERO_METRIC.label}
        </p>

        {!loading && (
          <div className="pointer-events-none absolute bottom-0 right-0 left-0 opacity-70">
            <MiniSparkline
              trend={HERO_METRIC.trend}
              color="var(--brand-primary)"
              width="100%"
              height={54}
            />
          </div>
        )}
      </div>

      {/* ── Secundarias ───────────────────────────────────────────────── */}
      {SECONDARY_METRICS.map((m, i) => {
        const Icon = m.icon
        return (
          <div key={m.key} className="metric-card relative overflow-hidden rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-xl"
                style={{ background: 'rgba(0,0,0,0.04)' }}
              >
                <Icon
                  className="h-4 w-4"
                  strokeWidth={1.5}
                  style={{ color: 'var(--brand-ink-soft)' }}
                />
              </div>
            </div>

            {loading ? (
              <Skeleton className="mb-1 h-8 w-14" />
            ) : (
              <p
                className="tabular-nums leading-none"
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  letterSpacing: '-0.05em',
                  color: 'var(--brand-ink)',
                  fontFamily: 'var(--font-inter)',
                }}
              >
                {summary?.[m.key] ?? 0}
              </p>
            )}

            <p
              className="mt-1 text-xs font-semibold uppercase"
              style={{ color: 'var(--brand-ink-muted)', letterSpacing: '0.04em' }}
            >
              {m.label}
            </p>

            {!loading && (
              <div className="pointer-events-none absolute bottom-3 right-3 opacity-45">
                <MiniSparkline
                  trend={m.trend}
                  color="var(--brand-ink-muted)"
                  delay={i * 80}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
