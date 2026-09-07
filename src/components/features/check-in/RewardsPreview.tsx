'use client'

import { Gift, Box } from 'lucide-react'
import { useBranding } from '@/lib/branding-context'
import { surfaceMedalPalette, walletMedalPalette } from '@/constants/tier-medal-theme'
import { BLACK_WALLET_CARD_THEME } from '@/constants/wallet-card-theme'
import { TierMedal } from '@/components/features/wallet'

/**
 * El carrusel de premios de la pantalla de entrada: la primera promesa que ve
 * alguien que todavía no es cliente.
 *
 * CAPA VISUAL v3 (2026-09-07). Los emojis de 40px que abrían cada tarjeta
 * (🥉🥈🥇💎) eran lo primero que se veía del producto, y los dibuja el sistema
 * operativo: el mismo premio se veía distinto en cada teléfono. Ahora es la
 * misma `TierMedal` que usan la tarjeta y el camino de recompensas, en el color
 * del tenant — y el nivel Black estrena la paleta negra y dorada de §17.2 en vez
 * del ámbar genérico que tenía horneado.
 *
 * Los ámbares (`#f59e0b`, `#b45309`, `#92400e`…) tampoco eran de marca: eran hex
 * horneados en una pantalla pública. Salieron todos.
 */

interface TierPreview {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled?: boolean
  is_black: boolean
  sort_order: number
}

interface RewardsPreviewProps {
  tiers: TierPreview[]
  pointsRange?: { min: number; max: number } | null
}

export function RewardsPreview({ tiers, pointsRange }: RewardsPreviewProps) {
  const branding = useBranding()

  if (tiers.length === 0) return null

  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)
  const medals = surfaceMedalPalette(branding)
  // El nivel Black va con SU paleta (§17.2), no con la de la marca: es la misma
  // que verá en la tarjeta el día que lo alcance.
  const blackMedals = walletMedalPalette(BLACK_WALLET_CARD_THEME)

  return (
    <div className="mt-5">
      <h3
        className="mb-3 text-center text-base font-bold"
        style={{ color: 'var(--brand-ink)', letterSpacing: '-0.01em' }}
      >
        Ganás premios reales en cada visita
      </h3>

      {pointsRange && (
        <div className="mb-3 flex justify-center">
          <span
            className="rounded-full px-3 py-1 text-xs font-bold tabular-nums"
            style={{ background: `${branding.primary}1a`, color: branding.primaryEnd }}
          >
            Cada visita: +{pointsRange.min} a +{pointsRange.max} pts
          </span>
        </div>
      )}

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 snap-x">
        {sorted.map((tier, index) => (
          <div
            key={tier.tier_name}
            className="snap-start shrink-0 rounded-2xl p-4 text-center"
            style={{
              minWidth: '150px',
              border: tier.is_black
                ? BLACK_WALLET_CARD_THEME.tierReachedBorder
                : '1px solid rgba(0,0,0,0.08)',
              background: tier.is_black ? BLACK_WALLET_CARD_THEME.cardBg : '#fff',
            }}
          >
            <div className="flex justify-center">
              {/* Nadie llegó a ningún nivel todavía: acá se está PROMETIENDO la
                  escalera, no mostrando un progreso. Por eso van todas cerradas
                  y con su número — menos la Black, que siempre lleva corona. */}
              <TierMedal
                reached={false}
                isBlack={tier.is_black}
                rank={index + 1}
                palette={tier.is_black ? blackMedals : medals}
                size={48}
              />
            </div>
            <div
              className="mt-2 text-lg font-bold"
              style={{
                color: tier.is_black ? BLACK_WALLET_CARD_THEME.name : 'var(--brand-ink)',
                letterSpacing: '-0.01em',
              }}
            >
              {tier.tier_name}
            </div>
            <div
              className="mt-1 text-sm font-medium"
              style={{
                color: tier.is_black ? BLACK_WALLET_CARD_THEME.tierReward : 'var(--brand-ink-soft)',
              }}
            >
              {tier.safe_reward_title}
            </div>
            <div
              className="mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
              style={{
                background: tier.is_black
                  ? BLACK_WALLET_CARD_THEME.tierReachedBg
                  : `${branding.primary}14`,
                // `hintStrong` y no `tierPts`: sobre la píldora dorada al 13 %,
                // el dorado al 50 % de `tierPts` se lee apenas.
                color: tier.is_black ? BLACK_WALLET_CARD_THEME.hintStrong : branding.primaryEnd,
              }}
            >
              {tier.point_threshold} pts
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium"
        style={{ background: 'rgba(0,0,0,0.03)', color: 'var(--brand-ink-soft)' }}
      >
        <Box className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: branding.primaryEnd }} />
        En cada premio elegís ir a la segura o arriesgar con la Mystery Box
      </div>

      <div
        className="mt-2 flex items-center justify-center gap-1.5 text-[11px]"
        style={{ color: 'var(--brand-ink-muted)' }}
      >
        <Gift className="h-3 w-3" strokeWidth={1.5} />
        A veces ganás más puntos y te acercás más rápido a tu premio
      </div>
    </div>
  )
}
