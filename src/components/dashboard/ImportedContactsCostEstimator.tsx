'use client'

import { Card, CardContent } from '@/components/ui/card'
import { DollarSign, Users, Wallet, AlertTriangle } from 'lucide-react'

interface TwilioBalance {
  balance: number | null
  currency?: string
  balanceCOP?: number
}

interface Props {
  validCount: number
  estimatedCostUsd: number
  estimatedCostCop: number
  costPerMessage: number
  alreadyContacted: number
  twilioBalance: TwilioBalance | null
}

const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

export function ImportedContactsCostEstimator({
  validCount,
  estimatedCostUsd,
  estimatedCostCop,
  costPerMessage,
  alreadyContacted,
  twilioBalance,
}: Props) {
  const insufficientBalance =
    twilioBalance?.balance != null && twilioBalance.balance < estimatedCostUsd

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> Contactos válidos</p>
            <p className="mt-1 text-2xl font-bold">{validCount.toLocaleString('es-CO')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><DollarSign className="h-3.5 w-3.5" /> Costo estimado</p>
            <p className="mt-1 text-2xl font-bold">{fmtCOP(estimatedCostCop)}</p>
            <p className="text-xs text-muted-foreground">${estimatedCostUsd.toFixed(2)} USD · ${costPerMessage}/msg</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> Saldo Twilio</p>
            <p className="mt-1 text-2xl font-bold">
              {twilioBalance?.balance != null ? `$${twilioBalance.balance.toFixed(2)}` : '—'}
            </p>
            {twilioBalance?.balanceCOP != null && (
              <p className="text-xs text-muted-foreground">{fmtCOP(twilioBalance.balanceCOP)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {alreadyContacted > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {alreadyContacted} número(s) ya fueron contactados previamente y han sido excluidos
            para evitar bloqueos de Twilio/Meta.
          </span>
        </div>
      )}

      {insufficientBalance && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>El saldo de Twilio podría ser insuficiente para esta campaña. Recarga antes de enviar.</span>
        </div>
      )}
    </div>
  )
}
