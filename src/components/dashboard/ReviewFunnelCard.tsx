'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Star, ArrowRight } from 'lucide-react'

export interface ReviewFunnelData {
  shown: number
  clicked: number
  postponed: number
  redeemed: number
  click_rate: number
  redemption_rate: number
}

interface Props {
  funnel: ReviewFunnelData | null
  loading: boolean
}

/**
 * El embudo de reseñas de Google (R6.a).
 *
 * Las dos tasas miden cosas distintas y por eso se muestran separadas:
 *   - `click_rate` es el GANCHO. Un 3% aquí significa que el premio no convence o que el
 *     copy no se lee. Es un problema de marketing.
 *   - `redemption_rate` es la OPERACIÓN. Un 20% aquí significa que la gente sí deja la
 *     reseña, pero el mesero no está cerrando el ciclo. Es un problema de servicio.
 *
 * Un solo número agregado escondería cuál de los dos está roto.
 *
 * Ref: docs/features/review-flow.md
 */
export function ReviewFunnelCard({ funnel, loading }: Props) {
  if (loading) return <Skeleton className="h-40 w-full" />
  if (!funnel) return null

  const steps = [
    { label: 'Se mostró', value: funnel.shown, sub: `${funnel.postponed} lo pospusieron` },
    { label: 'Fueron a Google', value: funnel.clicked, sub: `${funnel.click_rate}% de los que lo vieron` },
    { label: 'Reclamaron el premio', value: funnel.redeemed, sub: `${funnel.redemption_rate}% de los que reseñaron` },
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Star className="h-4 w-4" /> Reseñas de Google
        </CardTitle>
      </CardHeader>
      <CardContent>
        {funnel.shown === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no se le ha mostrado el pop-up a nadie en este rango. Revisa que el{' '}
            <a href="/dashboard/settings" className="underline">link de Google</a> esté configurado.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-4">
            {steps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="min-w-[110px]">
                  <p className="text-2xl font-bold">{step.value}</p>
                  <p className="text-xs font-medium">{step.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{step.sub}</p>
                </div>
                {i < steps.length - 1 && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
