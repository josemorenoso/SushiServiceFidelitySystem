'use client'

import { useEffect, useState, useCallback } from 'react'
import { Gift, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

interface PendingReward {
  mystery_box_result_id: string
  tier_id: string
  prize_title: string
  choice: 'safe' | 'mystery'
  created_at: string
}

interface Props {
  /** Teléfono del cliente (10 dígitos) — se usa para consultar premio pendiente */
  phone: string
  /** Headers de auth del mesero (Bearer o X-Device-Token), vía useStaffAuth().getAuthHeaders() */
  authHeaders: Record<string, string>
  /** Mesa actual (se adjunta a la redención para conciliación) */
  tableNumber?: number | null
  /** Callback tras registrar la entrega */
  onRedeemed?: () => void
}

/**
 * Alerta de premio pendiente para la pantalla del mesero.
 * Si el cliente ya eligió un premio (mystery box / safe) que aún NO fue entregado
 * físicamente, muestra el aviso y un botón "Registrar Entrega" que lo marca como
 * redimido (POST /api/reward-redeem).
 *
 * Ref: docs/features/redemption-tracking.md
 */
export function RewardAlert({ phone, authHeaders, tableNumber, onRedeemed }: Props) {
  const [pending, setPending] = useState<PendingReward | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [redeeming, setRedeeming] = useState(false)
  const [redeemed, setRedeemed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    if (!phone) { setLoading(false); return }
    try {
      const res = await fetch(`/api/check-in/status?phone=${encodeURIComponent(phone)}`)
      const data = await res.json()
      if (data.found && data.pending_reward) {
        setPending(data.pending_reward)
        setCustomerId(data.customer?.id ?? null)
      } else {
        setPending(null)
      }
    } catch {
      setPending(null)
    } finally {
      setLoading(false)
    }
  }, [phone])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  const handleRedeem = async () => {
    if (!pending || !customerId) return
    setRedeeming(true)
    setError(null)
    try {
      const res = await fetch('/api/reward-redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          customer_id: customerId,
          mystery_box_result_id: pending.mystery_box_result_id,
          tier_id: pending.tier_id,
          prize_title: pending.prize_title,
          source: pending.choice === 'safe' ? 'safe_choice' : 'mystery_box',
          table_number: tableNumber ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'No se pudo registrar la entrega')
        setRedeeming(false)
        return
      }
      setRedeemed(true)
      onRedeemed?.()
    } catch {
      setError('Error de conexión')
    } finally {
      setRedeeming(false)
    }
  }

  // Sin premio pendiente → no renderiza nada (no estorba el flujo normal del mesero)
  if (loading || (!pending && !redeemed)) return null

  if (redeemed) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
        <p className="text-sm font-medium text-green-700">Premio entregado y registrado ✅</p>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-800">⚠️ Cliente tiene premio pendiente</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-base font-semibold text-amber-900">
            <Gift className="h-4 w-4" /> {pending?.prize_title}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Entrega el premio al cliente y registra la entrega para cuadrar con el POS.
          </p>

          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

          <button
            onClick={handleRedeem}
            disabled={redeeming || !customerId}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {redeeming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Registrando entrega...
              </>
            ) : (
              'Registrar Entrega'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
