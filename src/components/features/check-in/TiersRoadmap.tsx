'use client'

import { Box } from 'lucide-react'
import { useBranding } from '@/lib/branding-context'
import { surfaceMedalPalette } from '@/constants/tier-medal-theme'
import { TierMedal } from '@/components/features/wallet'

/**
 * El camino de recompensas, sobre el marfil del check-in.
 *
 * CAPA VISUAL v3 (2026-09-07). Qué cambió y por qué:
 *
 *   - **Los emojis se fueron.** Cada fila abría con 🥉/🥈/🥇 y cerraba con
 *     «✅ Listo» o «🔥 Faltan N». Los dibuja el sistema operativo, así que el
 *     mismo nivel se veía distinto en cada teléfono. Ahora es `TierMedal`.
 *   - **El semáforo se fue.** Verde para alcanzado, ámbar para el próximo y gris
 *     para el resto eran tres familias de color peleando en una lista de cuatro
 *     filas: todo pesaba igual, entonces nada pesaba. Ahora manda una sola
 *     jerarquía — el PRÓXIMO nivel es el único con color fuerte, porque es el
 *     único sobre el que el cliente puede hacer algo hoy.
 *   - **Y ninguno de esos verdes y ámbares era de marca**: eran hex horneados en
 *     una pantalla pública, justo lo que §5 vino a sacar. Todo lo que se ve acá
 *     sale ahora de `Branding` o de las variables `--brand-ink-*`.
 */

interface TierItem {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled?: boolean
  is_black: boolean
}

interface TiersRoadmapProps {
  tiers: TierItem[]
  totalPoints: number
}

export function TiersRoadmap({ tiers, totalPoints }: TiersRoadmapProps) {
  const branding = useBranding()

  if (!tiers || tiers.length === 0) return null

  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)
  const medals = surfaceMedalPalette(branding)

  return (
    <div className="premium-card p-5 space-y-3">
      <h3
        className="text-xs font-bold text-center uppercase"
        style={{ color: 'var(--brand-ink-muted)', letterSpacing: '0.08em' }}
      >
        Tu camino de recompensas
      </h3>

      <div className="space-y-2.5">
        {sorted.map((tier, index) => {
          const reached = totalPoints >= tier.point_threshold
          const isNext =
            !reached && (index === 0 || totalPoints >= sorted[index - 1].point_threshold)
          const remaining = tier.point_threshold - totalPoints

          return (
            <div
              key={tier.tier_name}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
              style={{
                // El próximo nivel es el único con presencia. Regla 01 del kit
                // visual, aplicada a una lista: una sola fila brilla.
                background: isNext
                  ? `${branding.primary}12`
                  : reached
                    ? 'rgba(0,0,0,0.02)'
                    : 'transparent',
                border: isNext
                  ? `1px solid ${branding.primary}59`
                  : '1px solid rgba(0,0,0,0.05)',
              }}
            >
              <TierMedal
                reached={reached}
                isBlack={tier.is_black}
                rank={index + 1}
                palette={medals}
                size={36}
              />

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: reached || isNext ? 'var(--brand-ink)' : 'var(--brand-ink-soft)' }}
                  >
                    {tier.tier_name}
                  </span>
                  <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--brand-ink-muted)' }}>
                    {tier.point_threshold} pts
                  </span>
                  {reached && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                      style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--brand-ink-soft)' }}
                    >
                      Listo
                    </span>
                  )}
                  {isNext && remaining > 0 && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
                      style={{ background: `${branding.primary}1f`, color: branding.primaryEnd }}
                    >
                      Faltan {remaining} pts
                    </span>
                  )}
                </div>
                <p
                  className="text-xs font-medium truncate"
                  style={{ color: isNext ? 'var(--brand-ink)' : 'var(--brand-ink-soft)' }}
                >
                  {tier.safe_reward_title}
                  {tier.mystery_box_enabled && !tier.is_black && (
                    <span
                      className="ml-1 inline-flex items-center gap-0.5"
                      style={{ color: 'var(--brand-ink-muted)' }}
                    >
                      <Box className="h-3 w-3 inline" strokeWidth={2} /> o Mystery Box
                    </span>
                  )}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
