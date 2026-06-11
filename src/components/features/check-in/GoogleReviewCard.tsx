'use client'

import { useState, useEffect } from 'react'
import { Star, ExternalLink, CheckCircle2, Heart } from 'lucide-react'
import { BRAND_NAME } from '@/lib/branding'

const GOOGLE_MAPS_REVIEW_URL = process.env.NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL || '#'

interface GoogleReviewCardProps {
  customerName: string
  totalVisits: number
  visible: boolean
}

/**
 * Card inline de solicitud de reseña (Req P1.2 — Rediseño Review UX).
 *
 * Decisiones de diseño:
 * - NO es un modal: aparece inline dentro del flujo de éxito del check-in,
 *   eliminando el "instinct close" del patrón de cerrar popups.
 * - El CTA a Google está SIEMPRE habilitado y es la acción principal.
 * - El rating interno es opcional, va DEBAJO del CTA y está etiquetado
 *   explícitamente como "no es la reseña de Google".
 */
export function GoogleReviewCard({ customerName, totalVisits, visible }: GoogleReviewCardProps) {
  const [animateIn, setAnimateIn] = useState(false)
  const [internalRating, setInternalRating] = useState(0)
  const [hoveredStar, setHoveredStar] = useState(0)
  const [clickedReview, setClickedReview] = useState(false)

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setAnimateIn(true), 150)
      return () => clearTimeout(timer)
    } else {
      setAnimateIn(false)
    }
  }, [visible])

  if (!visible) return null

  const firstName = customerName.split(' ')[0]
  const isNewCustomer = totalVisits <= 1

  const handleReviewClick = () => {
    setClickedReview(true)
    window.open(GOOGLE_MAPS_REVIEW_URL, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className={`transform transition-all duration-500 ease-out ${
        animateIn ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="premium-card overflow-hidden p-0">
        {/* Header compacto */}
        <div className="px-5 pt-5 pb-3 text-center">
          <div className="flex justify-center mb-2">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{
                background: 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)',
                boxShadow: '0 6px 18px rgba(230, 57, 70, 0.25)',
              }}
            >
              <Heart className="h-5 w-5 text-white" strokeWidth={1.5} />
            </div>
          </div>
          <h3 className="font-playfair text-lg font-bold" style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}>
            {isNewCustomer
              ? `${firstName}, ¿nos regalas una reseña?`
              : `${firstName}, ayúdanos con una reseña`}
          </h3>
          <p className="mt-1 text-xs" style={{ color: '#9ca3af' }}>
            {isNewCustomer
              ? `Tu opinión en Google ayuda a que más personas conozcan ${BRAND_NAME}`
              : `Llevas ${totalVisits} visitas — tu reseña en Google vale oro para nosotros`}
          </p>
        </div>

        {/* CTA principal — SIEMPRE habilitado */}
        <div className="px-5 pb-4">
          {clickedReview ? (
            <div
              className="flex items-center justify-center gap-2 rounded-xl px-4 py-3.5"
              style={{ background: 'rgba(5, 150, 105, 0.08)', border: '1px solid rgba(5, 150, 105, 0.25)' }}
            >
              <CheckCircle2 className="h-5 w-5" style={{ color: '#059669' }} />
              <p className="text-sm font-semibold" style={{ color: '#065f46' }}>
                ¡Gracias! Termina tu reseña en Google Maps
              </p>
            </div>
          ) : (
            <>
              <button
                onClick={handleReviewClick}
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)',
                  boxShadow: '0 8px 24px rgba(230, 57, 70, 0.3)',
                }}
              >
                <ExternalLink className="h-4 w-4" strokeWidth={2} />
                Escribir mi reseña en Google
              </button>
              <p className="mt-2 text-center text-[11px]" style={{ color: '#9ca3af' }}>
                Al tocar el botón se abre <span className="font-semibold">Google Maps</span> — ahí escribes tu reseña. Toma menos de 1 minuto.
              </p>
            </>
          )}
        </div>

        {/* Rating interno — claramente separado del CTA */}
        <div className="px-5 py-4" style={{ borderTop: '1px dashed rgba(156, 163, 175, 0.3)', background: 'rgba(249, 250, 251, 0.6)' }}>
          <p className="text-center text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#9ca3af' }}>
            Calificación rápida interna (opcional)
          </p>
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setInternalRating(n)}
                onMouseEnter={() => setHoveredStar(n)}
                onMouseLeave={() => setHoveredStar(0)}
                aria-label={`Calificación interna: ${n} de 5`}
                className="transition-transform duration-150 hover:scale-110 active:scale-95"
              >
                <Star
                  className={`h-6 w-6 transition-colors duration-150 ${
                    n <= (hoveredStar || internalRating)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-center text-[10px]" style={{ color: '#b0b0b0' }}>
            {internalRating > 0
              ? internalRating >= 4
                ? '¡Gracias! Recuerda que la reseña real se deja en Google con el botón de arriba ☝️'
                : 'Gracias por tu feedback — lo usamos para mejorar'
              : 'Esto NO es la reseña de Google — solo nos ayuda a mejorar internamente'}
          </p>
        </div>
      </div>
    </div>
  )
}
