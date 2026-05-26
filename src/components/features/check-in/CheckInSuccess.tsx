'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { CheckCircle, Crown, Gift, PartyPopper, RotateCcw, Star } from 'lucide-react'
import { GoogleReviewPopup } from './GoogleReviewPopup'
import { PointsDisplay } from './PointsDisplay'
import { RewardChoice } from './RewardChoice'
import { MysteryBoxResult } from './MysteryBoxResult'
import { TiersRoadmap } from './TiersRoadmap'
import type { CheckInSuccessProps } from './CheckInSuccess.types'

interface MysteryBoxResponse {
  ok: boolean
  message?: string
  result: {
    choice: 'safe' | 'mystery'
    prize_title: string
    prize_emoji: string
    prize_index: number
    was_golden: boolean
    near_miss: string | null
    all_prizes: { title: string; probability: number; emoji: string }[]
    effective_prizes: { title: string; probability: number; emoji: string }[]
  }
}

export function CheckInSuccess({
  type,
  customerName,
  totalVisits,
  totalPoints,
  pointsAwarded,
  reward,
  nextRewardHint,
  roadmap,
  tierUnlocked,
  nextTier,
  tiers,
  customerPhone,
  onReset,
}: CheckInSuccessProps) {
  const [showReview, setShowReview] = useState(false)
  const [choicePhase, setChoicePhase] = useState<'choosing' | 'resolving' | 'result'>('choosing')
  const [mysteryResult, setMysteryResult] = useState<MysteryBoxResponse['result'] | null>(null)
  const [choiceLoading, setChoiceLoading] = useState(false)

  useEffect(() => {
    if (type !== 'duplicate') {
      const timer = setTimeout(() => setShowReview(true), 4000)
      return () => clearTimeout(timer)
    }
  }, [type])

  const handleRewardChoice = useCallback(async (choice: 'safe' | 'mystery') => {
    if (!tierUnlocked || !customerPhone) {
      toast.error('No se pudo identificar el teléfono. Intenta de nuevo.')
      return
    }
    setChoiceLoading(true)
    try {
      const res = await fetch('/api/mystery-box/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: customerPhone,
          tier_id: tierUnlocked.id,
          choice,
        }),
      })
      const data = (await res.json()) as MysteryBoxResponse
      if (data.ok) {
        setMysteryResult(data.result)
        setChoicePhase('result')
      } else {
        toast.error(data.message ?? 'Error reclamando el premio. Intenta de nuevo.')
      }
    } catch (err) {
      console.error('[CheckInSuccess] Error resolving mystery box:', err)
      toast.error('Error de conexión. Intenta de nuevo.')
    } finally {
      setChoiceLoading(false)
    }
  }, [tierUnlocked, customerPhone])

  const isWelcome = type === 'welcome'
  const isDuplicate = type === 'duplicate'
  const isPointsBased = type === 'welcome' || type === 'points_earned' || type === 'tier_unlocked'

  return (
    <div className="animate-fade-in-up w-full max-w-md mx-auto space-y-4">
      {/* Card principal */}
      <div className="premium-card p-7 text-center">
        <div className="flex justify-center mb-5">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background: isWelcome
                ? "linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)"
                : "linear-gradient(135deg, #34d399 0%, #059669 100%)",
              boxShadow: isWelcome
                ? "0 8px 24px rgba(230, 57, 70, 0.28)"
                : "0 8px 24px rgba(5, 150, 105, 0.28)",
            }}
          >
            {isWelcome ? (
              <PartyPopper className="h-7 w-7 text-white" strokeWidth={1.25} />
            ) : (
              <CheckCircle className="h-7 w-7 text-white" strokeWidth={1.25} />
            )}
          </div>
        </div>

        <h2
          className="font-playfair text-2xl font-bold"
          style={{ color: "#1a1c1d", letterSpacing: "-0.02em" }}
        >
          {isWelcome
            ? `¡Bienvenid@, ${customerName}!`
            : isDuplicate
              ? `¡Hola, ${customerName}!`
              : `¡${customerName}, volviste!`}
        </h2>

        <p className="mt-2 text-sm" style={{ color: "#9ca3af" }}>
          {isWelcome
            ? 'Ya sos parte del club. En cada visita sumás puntos y desbloqueás premios.'
            : isDuplicate
              ? 'Ya registraste tu visita hoy. ¡Nos vemos pronto!'
              : `Visita #${totalVisits} registrada`}
        </p>

        <div className="mt-5 flex items-center justify-center gap-2">
          <Star className="h-4 w-4" strokeWidth={1.5} style={{ color: "#E63946" }} />
          <span className="text-sm font-semibold" style={{ color: "#6b7280" }}>
            Visitas:
          </span>
          <span
            className="font-playfair text-xl font-bold"
            style={{ color: "#E63946", letterSpacing: "-0.02em" }}
          >
            {totalVisits}
          </span>
        </div>
      </div>

      {/* Puntos ganados — siempre visible cuando el sistema de puntos está activo */}
      {isPointsBased && totalPoints != null && choicePhase === 'choosing' && !tierUnlocked && (
        <PointsDisplay
          pointsAwarded={pointsAwarded ?? 0}
          totalPoints={totalPoints}
          nextTierName={nextTier?.name}
          nextTierThreshold={nextTier?.threshold}
          pointsRemaining={nextTier?.points_remaining}
        />
      )}

      {/* Roadmap visual de tiers */}
      {isPointsBased && tiers && tiers.length > 0 && choicePhase === 'choosing' && (
        <TiersRoadmap tiers={tiers} totalPoints={totalPoints ?? 0} />
      )}

      {/* Tier desbloqueado — elegir premio */}
      {type === 'tier_unlocked' && tierUnlocked && choicePhase === 'choosing' && (
        <>
          {pointsAwarded != null && pointsAwarded > 0 && totalPoints != null && (
            <PointsDisplay
              pointsAwarded={pointsAwarded}
              totalPoints={totalPoints}
            />
          )}
          <RewardChoice
            tierName={tierUnlocked.name}
            safeReward={tierUnlocked.safe_reward}
            mysteryBoxEnabled={tierUnlocked.mystery_box_enabled}
            mysteryPrizes={tierUnlocked.mystery_prizes}
            isBlack={tierUnlocked.is_black}
            onChoice={handleRewardChoice}
            loading={choiceLoading}
          />
        </>
      )}

      {/* Mystery Box resultado */}
      {choicePhase === 'result' && mysteryResult && (
        mysteryResult.choice === 'mystery' ? (
          <MysteryBoxResult
            prizeTitle={mysteryResult.prize_title}
            prizeEmoji={mysteryResult.prize_emoji}
            wasGolden={mysteryResult.was_golden}
            nearMiss={mysteryResult.near_miss}
            allPrizes={mysteryResult.all_prizes}
          />
        ) : (
          <div
            className="premium-card p-6 text-center animate-fade-in-up"
            style={{ border: '1px solid rgba(5,150,105,0.25)' }}
          >
            <div className="flex justify-center mb-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
                  boxShadow: '0 6px 18px rgba(5,150,105,0.3)',
                }}
              >
                <Gift className="h-5 w-5 text-white" strokeWidth={1.25} />
              </div>
            </div>
            <h3
              className="font-playfair text-xl font-bold"
              style={{ color: '#065f46', letterSpacing: '-0.02em' }}
            >
              {mysteryResult.prize_title}
            </h3>
            <p className="mt-1.5 text-sm" style={{ color: '#059669' }}>
              Mostrále este mensaje al mesero para reclamar tu premio 🎁
            </p>
          </div>
        )
      )}

      {/* Card de recompensa BLACK — solo legacy (no se muestra con sistema de puntos) */}
      {!isPointsBased && reward?.is_black && (
        <div
          className="premium-card p-6 text-center overflow-hidden relative"
          style={{
            background: 'linear-gradient(135deg, #1a1c1d 0%, #2d2f30 100%)',
            border: '1px solid rgba(251, 191, 36, 0.45)',
          }}
        >
          <div
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, #fbbf24 0, #fbbf24 1px, transparent 0, transparent 50%)',
              backgroundSize: '12px 12px',
            }}
          />
          <div className="relative">
            <div className="flex justify-center mb-3">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                  boxShadow: '0 8px 24px rgba(245, 158, 11, 0.55)',
                }}
              >
                <Crown className="h-7 w-7 text-white" strokeWidth={1.25} />
              </div>
            </div>
            <div
              className="inline-block px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2"
              style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24' }}
            >
              Nivel BLACK Desbloqueado
            </div>
            <h3
              className="font-playfair text-2xl font-bold"
              style={{ color: '#fbbf24', letterSpacing: '-0.02em' }}
            >
              {reward.title}
            </h3>
            <p className="mt-2 text-sm" style={{ color: 'rgba(251, 191, 36, 0.7)' }}>
              Has alcanzado el nivel máximo de fidelidad.
            </p>
            <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Te enviamos los detalles por WhatsApp. ¡Muestra el mensaje para reclamar!
            </p>
          </div>
        </div>
      )}

      {/* Card de recompensa normal — solo legacy (no se muestra con sistema de puntos) */}
      {!isPointsBased && reward && !reward.is_black && (
        <div
          className="premium-card p-6 text-center"
          style={{ border: "1px solid rgba(251, 191, 36, 0.25) !important" }}
        >
          <div className="flex justify-center mb-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{
                background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                boxShadow: "0 6px 18px rgba(245, 158, 11, 0.30)",
              }}
            >
              <Gift className="h-5 w-5 text-white" strokeWidth={1.25} />
            </div>
          </div>
          <h3
            className="font-playfair text-xl font-bold"
            style={{ color: "#92400e", letterSpacing: "-0.02em" }}
          >
            ¡Ganaste: {reward.title}!
          </h3>
          <p className="mt-1.5 text-sm" style={{ color: "#b45309" }}>
            Te enviamos los detalles por WhatsApp. ¡Muestra el mensaje para reclamar tu premio!
          </p>
        </div>
      )}

      {roadmap && roadmap.length > 0 && (
        <div className="premium-card p-5 space-y-3">
          <h3
            className="text-sm font-bold text-center uppercase tracking-wide"
            style={{ color: '#9ca3af', letterSpacing: '0.06em' }}
          >
            Tus próximos premios
          </h3>
          <div className="space-y-2.5">
            {roadmap.map((r, i) => {
              const remaining = r.milestone - totalVisits
              const isNext = i === 0
              return (
                <div
                  key={r.milestone}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{
                    background: r.is_black
                      ? 'rgba(26,28,29,0.06)'
                      : isNext ? 'rgba(251, 191, 36, 0.08)' : 'rgba(0,0,0,0.015)',
                    border: r.is_black
                      ? '1px solid rgba(251, 191, 36, 0.35)'
                      : isNext ? '1px solid rgba(251, 191, 36, 0.2)' : '1px solid transparent',
                  }}
                >
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold shrink-0"
                    style={{
                      background: r.is_black
                        ? 'linear-gradient(135deg, #1a1c1d 0%, #374151 100%)'
                        : isNext
                          ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
                          : 'rgba(0,0,0,0.04)',
                      color: r.is_black ? '#fbbf24' : isNext ? '#fff' : '#9ca3af',
                      boxShadow: r.is_black
                        ? '0 3px 10px rgba(0,0,0,0.25)'
                        : isNext ? '0 3px 10px rgba(245, 158, 11, 0.25)' : 'none',
                    }}
                  >
                    {r.is_black ? <Crown style={{ width: 14, height: 14 }} strokeWidth={1.5} /> : `#${r.milestone}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: r.is_black ? '#92400e' : isNext ? '#92400e' : '#6b7280' }}>
                      {r.is_black ? `BLACK: ${r.title}` : r.title}
                    </p>
                    <p className="text-[11px]" style={{ color: r.is_black ? '#b45309' : isNext ? '#b45309' : '#d1d5db' }}>
                      {remaining === 1 ? '¡En tu siguiente visita!' : `Faltan ${remaining} visitas`}
                    </p>
                  </div>
                  {r.is_black ? (
                    <Crown className="h-4 w-4 shrink-0" style={{ color: '#fbbf24' }} strokeWidth={1.5} />
                  ) : isNext && (
                    <span className="text-lg" aria-hidden>🎯</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {nextRewardHint && !reward && (!roadmap || roadmap.length === 0) && (
        <div
          className="premium-card p-4 text-center"
          style={{ border: '1px solid rgba(16, 185, 129, 0.2)' }}
        >
          <p className="text-sm font-medium" style={{ color: '#059669' }}>
            🎁 {nextRewardHint}
          </p>
        </div>
      )}

      <p className="text-center text-xs" style={{ color: "#d1d5db" }}>
        Te hemos enviado un mensaje por WhatsApp con los detalles.
      </p>

      {/* Botón volver */}
      <button
        className="btn-secondary-premium flex h-[52px] w-full items-center justify-center gap-2 rounded-xl text-sm font-medium"
        style={{ color: "#6b7280", letterSpacing: "-0.01em" }}
        onClick={onReset}
      >
        <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} />
        Nuevo check-in
      </button>

      <GoogleReviewPopup
        customerName={customerName}
        totalVisits={totalVisits}
        visible={showReview}
        onClose={() => setShowReview(false)}
      />
    </div>
  )
}
