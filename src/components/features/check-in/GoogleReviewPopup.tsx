'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Star, ExternalLink, Sparkles, X } from 'lucide-react'

const GOOGLE_MAPS_REVIEW_URL = process.env.NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL || '#'

interface GoogleReviewPopupProps {
  customerName: string
  totalVisits: number
  visible: boolean
  onClose: () => void
}

export function GoogleReviewPopup({
  customerName,
  totalVisits,
  visible,
  onClose,
}: GoogleReviewPopupProps) {
  const [animateIn, setAnimateIn] = useState(false)
  const [stars, setStars] = useState(0)
  const [hoveredStar, setHoveredStar] = useState(0)

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setAnimateIn(true), 300)
      return () => clearTimeout(timer)
    } else {
      setAnimateIn(false)
    }
  }, [visible])

  if (!visible) return null

  const firstName = customerName.split(' ')[0]
  const isNewCustomer = totalVisits <= 1

  const handleReviewClick = () => {
    window.open(GOOGLE_MAPS_REVIEW_URL, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className={`relative w-full max-w-md transform transition-all duration-700 ease-out ${
          animateIn
            ? 'translate-y-0 opacity-100 scale-100'
            : 'translate-y-8 opacity-0 scale-95'
        }`}
      >
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl border border-primary/10">
          <div className="relative bg-gradient-to-br from-primary via-red-600 to-red-700 px-6 py-8 text-white text-center overflow-hidden">
            <div className="absolute inset-0 opacity-20">
              {[...Array(12)].map((_, i) => (
                <Sparkles
                  key={i}
                  className="absolute text-yellow-300 animate-pulse"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    width: `${12 + Math.random() * 16}px`,
                    animationDelay: `${Math.random() * 2}s`,
                    animationDuration: `${1.5 + Math.random() * 2}s`,
                  }}
                />
              ))}
            </div>

            <button
              onClick={onClose}
              className="absolute right-3 top-3 rounded-full p-1 hover:bg-white/20 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative z-10">
              <div className="text-4xl mb-2">🍣</div>
              <h3 className="text-xl font-bold mb-1">
                {isNewCustomer
                  ? `¡${firstName}, nos encantó conocerte!`
                  : `¡${firstName}, eres parte de nuestra familia!`}
              </h3>
              <p className="text-white/90 text-sm">
                {isNewCustomer
                  ? 'Tu opinión nos ayuda a seguir mejorando'
                  : `Llevas ${totalVisits} visitas — tu opinión vale oro para nosotros`}
              </p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-3">
                ¿Cómo calificarías tu experiencia en Sushi Service?
              </p>
              <div className="flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setStars(n)}
                    onMouseEnter={() => setHoveredStar(n)}
                    onMouseLeave={() => setHoveredStar(0)}
                    className="group transition-transform duration-200 hover:scale-125 active:scale-95"
                  >
                    <Star
                      className={`h-10 w-10 transition-all duration-200 ${
                        n <= (hoveredStar || stars)
                          ? 'fill-yellow-400 text-yellow-400 drop-shadow-md'
                          : 'text-gray-200 group-hover:text-yellow-200'
                      }`}
                    />
                  </button>
                ))}
              </div>
              {stars > 0 && (
                <p className="mt-2 text-sm font-medium animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {stars === 5 && '🔥 ¡Increíble! Comparte tu experiencia'}
                  {stars === 4 && '😊 ¡Genial! Cuéntale al mundo'}
                  {stars === 3 && '👍 ¡Gracias! Tu feedback nos mejora'}
                  {stars <= 2 && '🙏 Lamentamos eso, queremos mejorar'}
                </p>
              )}
            </div>

            <div className="rounded-xl bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-yellow-600" />
                <span className="font-bold text-yellow-800 text-sm">INCENTIVO ESPECIAL</span>
                <Sparkles className="h-4 w-4 text-yellow-600" />
              </div>
              <p className="text-xs text-yellow-700">
                Déjanos tu reseña en Google y recibe un <strong>rollo cortesía</strong> en tu próxima visita.
                Muestra tu reseña al mesero para reclamarlo.
              </p>
            </div>

            <Button
              onClick={handleReviewClick}
              disabled={stars === 0}
              className="w-full h-12 text-base gap-2 bg-gradient-to-r from-primary to-red-600 hover:from-red-700 hover:to-red-800 shadow-lg shadow-primary/25 transition-all duration-300 disabled:opacity-40"
            >
              <ExternalLink className="h-5 w-5" />
              Dejar mi reseña en Google
            </Button>

            <p className="text-center text-[11px] text-muted-foreground">
              Se abrirá Google Maps — escribe tu comentario para reclamar el incentivo
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
