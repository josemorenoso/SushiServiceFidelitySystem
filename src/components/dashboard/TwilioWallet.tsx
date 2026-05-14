'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Wallet, MessageSquare, Calculator, AlertTriangle } from 'lucide-react'

interface WalletData {
  balance: number | null
  currency: string
  costPerMessage: number
  costPerMessageCOP: number
  maxMessages?: number
  balanceCOP?: number
  error?: string
}

export function TwilioWallet() {
  const [data, setData] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/twilio-balance')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  const hasBalance = data?.balance !== null && data?.balance !== undefined

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          Billetera Twilio
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-primary/5 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Saldo</p>
            {hasBalance ? (
              <>
                <p className="text-lg font-bold text-primary">
                  ${data!.balance!.toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  ~${data!.balanceCOP?.toLocaleString()} COP
                </p>
              </>
            ) : (
              <div className="flex items-center justify-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                Sin datos
              </div>
            )}
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Costo/msg</p>
            <p className="text-lg font-bold">
              ${data?.costPerMessage?.toFixed(4) ?? '—'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              ~${data?.costPerMessageCOP?.toLocaleString() ?? '—'} COP
            </p>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Msgs disponibles</p>
            <p className="text-lg font-bold flex items-center justify-center gap-1">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              {hasBalance ? data!.maxMessages?.toLocaleString() : '—'}
            </p>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Recarga</p>
            <a
              href="https://www.twilio.com/console/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary underline hover:text-primary/80 flex items-center justify-center gap-1 mt-1"
            >
              <Calculator className="h-3 w-3" />
              Twilio Console
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function CampaignCostEstimate({ recipientCount }: { recipientCount: number }) {
  // Meta Fee: $0.0125/msg + Twilio Fee: $0.005/msg = $0.0175/msg total
  const META_FEE = 0.0125
  const TWILIO_FEE = 0.005
  const costPerMsg = META_FEE + TWILIO_FEE
  const usdToCop = 4200
  const totalUsd = recipientCount * costPerMsg
  const totalCop = Math.round(totalUsd * usdToCop)

  if (recipientCount <= 0) return null

  return (
    <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-0.5">
      <div className="flex items-center gap-2">
        <Calculator className="h-3.5 w-3.5 shrink-0" />
        <span>
          Costo estimado: <strong>${totalUsd.toFixed(4)} USD</strong> (~${totalCop.toLocaleString()} COP)
          &nbsp;&mdash;&nbsp;{recipientCount} mensajes
        </span>
      </div>
      <p className="text-[10px] text-amber-600 pl-5">
        Meta ${META_FEE}/msg + Twilio ${TWILIO_FEE}/msg = ${costPerMsg}/msg total
      </p>
    </div>
  )
}
