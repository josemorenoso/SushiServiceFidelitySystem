'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Wallet, MessageSquare, TrendingDown, AlertTriangle } from 'lucide-react'

/**
 * Tarjeta de saldo del tenant (su propia billetera COP).
 *
 * Reemplaza al viejo TwilioWallet en las vistas del tenant: aquí ve SU saldo
 * y SUS mensajes disponibles, no el saldo de la cuenta matriz del operador.
 *
 * Ref: docs/features/wallet-billing.md
 */

interface WalletSummary {
  balanceCop: number
  pricePerMessage: number
  messagesAvailable: number
  monthSpendCop: number
}

function formatCop(n: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(n)
}

export function WalletCard() {
  const [data, setData] = useState<WalletSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/wallet')
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /></CardContent>
      </Card>
    )
  }

  const negative = (data?.balanceCop ?? 0) < 0
  const low = !negative && (data?.messagesAvailable ?? 0) <= 100

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          Tu saldo de mensajes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className={`rounded-lg p-3 text-center ${negative ? 'bg-red-50' : 'bg-primary/5'}`}>
            <p className="text-xs text-muted-foreground mb-1">Saldo</p>
            <p className={`text-lg font-bold ${negative ? 'text-red-600' : 'text-primary'}`}>
              {data ? formatCop(data.balanceCop) : '—'}
            </p>
            {data && (
              <p className="text-[10px] text-muted-foreground">{formatCop(data.pricePerMessage)}/mensaje</p>
            )}
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Mensajes disponibles</p>
            <p className={`text-lg font-bold flex items-center justify-center gap-1 ${negative ? 'text-red-600' : low ? 'text-amber-600' : ''}`}>
              {(negative || low) ? <AlertTriangle className="h-4 w-4" /> : <MessageSquare className="h-4 w-4 text-muted-foreground" />}
              {data ? data.messagesAvailable.toLocaleString('es-CO') : '—'}
            </p>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Consumo del mes</p>
            <p className="text-lg font-bold flex items-center justify-center gap-1">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              {data ? formatCop(data.monthSpendCop) : '—'}
            </p>
          </div>
        </div>

        {(negative || low) && (
          <p className="mt-3 text-xs text-amber-600 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {negative
              ? 'Tu saldo está en negativo. Recarga para poder enviar campañas.'
              : 'Te queda poco saldo. Recarga pronto para no interrumpir tus campañas.'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
