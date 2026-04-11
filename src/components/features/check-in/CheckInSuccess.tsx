'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, Gift, PartyPopper, RotateCcw, Star } from 'lucide-react'
import { GoogleReviewPopup } from './GoogleReviewPopup'
import type { CheckInSuccessProps } from './CheckInSuccess.types'

export function CheckInSuccess({
  type,
  customerName,
  totalVisits,
  reward,
  onReset,
}: CheckInSuccessProps) {
  const [showReview, setShowReview] = useState(false)

  useEffect(() => {
    if (type !== 'duplicate') {
      const timer = setTimeout(() => setShowReview(true), 2500)
      return () => clearTimeout(timer)
    }
  }, [type])

  const isWelcome = type === 'welcome'
  const isDuplicate = type === 'duplicate'

  return (
    <div className="animate-fade-in-up w-full max-w-md mx-auto space-y-4">
      {/* Card principal */}
      <div className="premium-card p-7 text-center">
        {/* Ícono de estado */}
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

        {/* Título */}
        <h2
          className="font-playfair text-2xl font-bold"
          style={{ color: "#1a1c1d", letterSpacing: "-0.02em" }}
        >
          {isWelcome
            ? `¡Bienvenido/a, ${customerName}!`
            : isDuplicate
              ? `¡Hola, ${customerName}!`
              : `¡Hola de nuevo, ${customerName}!`}
        </h2>

        <p className="mt-2 text-sm" style={{ color: "#9ca3af" }}>
          {isWelcome
            ? 'Te has registrado exitosamente en nuestro programa de fidelidad.'
            : isDuplicate
              ? 'Ya registraste tu visita hoy. ¡Gracias por venir!'
              : `Esta es tu visita #${totalVisits}. ¡Gracias por volver!`}
        </p>

        {/* Contador de visitas */}
        <div className="mt-5 flex items-center justify-center gap-2">
          <Star className="h-4 w-4" strokeWidth={1.5} style={{ color: "#E63946" }} />
          <span className="text-sm font-semibold" style={{ color: "#6b7280" }}>
            Visitas totales:
          </span>
          <span
            className="font-playfair text-xl font-bold"
            style={{ color: "#E63946", letterSpacing: "-0.02em" }}
          >
            {totalVisits}
          </span>
        </div>
      </div>

      {/* Card de recompensa */}
      {reward && (
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
