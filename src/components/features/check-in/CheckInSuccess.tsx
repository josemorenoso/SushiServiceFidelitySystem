'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CheckCircle, Gift, PartyPopper, RotateCcw } from 'lucide-react'
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

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            {type === 'welcome' ? (
              <PartyPopper className="h-12 w-12 text-green-500" />
            ) : (
              <CheckCircle className="h-12 w-12 text-green-500" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {type === 'welcome'
              ? `¡Bienvenido/a, ${customerName}!`
              : type === 'duplicate'
                ? `¡Hola, ${customerName}!`
                : `¡Hola de nuevo, ${customerName}!`}
          </CardTitle>
          <CardDescription className="text-base">
            {type === 'welcome'
              ? 'Te has registrado exitosamente en nuestro programa de fidelidad.'
              : type === 'duplicate'
                ? 'Ya registraste tu visita hoy. ¡Gracias por venir!'
                : `Esta es tu visita #${totalVisits}. ¡Gracias por volver!`}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <div className="inline-flex items-center justify-center rounded-full bg-primary/10 px-4 py-2 text-sm font-medium">
            Visitas totales: <span className="ml-1 font-bold text-primary">{totalVisits}</span>
          </div>
        </CardContent>
      </Card>

      {reward && (
        <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-2">
              <Gift className="h-10 w-10 text-yellow-500" />
            </div>
            <CardTitle className="text-xl text-yellow-700 dark:text-yellow-400">
              ¡Ganaste: {reward.title}!
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-yellow-600 dark:text-yellow-300">
            <p>Te enviamos los detalles por WhatsApp. ¡Muestra el mensaje para reclamar tu premio!</p>
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Te hemos enviado un mensaje por WhatsApp con los detalles.
      </p>

      <Button
        variant="outline"
        className="w-full"
        onClick={onReset}
      >
        <RotateCcw className="mr-2 h-4 w-4" />
        Nuevo check-in
      </Button>

      <GoogleReviewPopup
        customerName={customerName}
        totalVisits={totalVisits}
        visible={showReview}
        onClose={() => setShowReview(false)}
      />
    </div>
  )
}
