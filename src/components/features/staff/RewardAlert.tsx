'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Gift, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

interface ActiveGrant {
  id: string
  prize_title: string
  grant_type: 'tier_prize' | 'campaign_prize'
  source: 'mystery_box' | 'safe_choice' | 'reactivation' | 'review' | 'manual'
  expires_at: string | null
  granted_at: string
  tier_id: string | null
  mystery_box_result_id: string | null
}

interface Props {
  /** Teléfono del cliente (10 dígitos) — se usa para consultar premios activos */
  phone: string
  /** Headers de auth del mesero (Bearer o X-Device-Token), vía useStaffAuth().getAuthHeaders() */
  authHeaders: Record<string, string>
  /** Mesa actual (se adjunta a la redención para conciliación) */
  tableNumber?: number | null
  /** Callback tras registrar una entrega */
  onRedeemed?: () => void
}

/** El origen de la redención, tal como lo espera `reward_redemptions.source`. */
function redemptionSource(grant: ActiveGrant): string {
  if (grant.source === 'safe_choice') return 'safe_choice'
  if (grant.grant_type === 'campaign_prize') return 'campaign_reward'
  return 'mystery_box'
}

/** Cada cuánto reconsultar mientras el mesero sigue en la pantalla de confirmación. */
const POLL_MS = 3_000
/** Cuánto tiempo seguir reconsultando. Pasado esto, el premio vive en /mesero/rewards. */
const POLL_WINDOW_MS = 60_000

/**
 * Alerta de premio pendiente en la pantalla del mesero, tras escanear.
 *
 * Lee `reward_grants` activos (migración 00031), no `mystery_box_results`. Eso hace que
 * funcione para el caso que antes era imposible: el PREMIO DE CAMPAÑA, que ya existe antes
 * de que el cliente llegue y por tanto salta inmediatamente al escanear.
 *
 * Para el Mystery Box sigue habiendo una carrera natural — el cliente elige su premio en su
 * propio celular, segundos después del escaneo — así que reconsultamos cada 3s durante un
 * minuto. Pero eso es un ATAJO, no la garantía: la garantía es /mesero/rewards, donde el
 * premio espera indefinidamente. Antes ese atajo era el único camino, y por eso los premios
 * no se registraban nunca.
 *
 * Ref: docs/features/reward-grants.md
 */
export function RewardAlert({ phone, authHeaders, tableNumber, onRedeemed }: Props) {
  const [grants, setGrants] = useState<ActiveGrant[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [redeemingId, setRedeemingId] = useState<string | null>(null)
  const [redeemedCount, setRedeemedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const startedAt = useRef(Date.now())

  const fetchGrants = useCallback(async () => {
    if (!phone) {
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/check-in/status?phone=${encodeURIComponent(phone)}`)
      const data = await res.json()
      if (data.found) {
        setGrants(data.active_grants ?? [])
        setCustomerId(data.customer?.id ?? null)
      }
    } catch {
      // Silencioso: es un poll.
    } finally {
      setLoading(false)
    }
  }, [phone])

  useEffect(() => {
    fetchGrants()
    const interval = setInterval(() => {
      if (Date.now() - startedAt.current > POLL_WINDOW_MS) {
        clearInterval(interval)
        return
      }
      fetchGrants()
    }, POLL_MS)
    return () => clearInterval(interval)
  }, [fetchGrants])

  const handleRedeem = async (grant: ActiveGrant) => {
    if (!customerId) return
    setRedeemingId(grant.id)
    setError(null)

    try {
      const res = await fetch('/api/reward-redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          customer_id: customerId,
          grant_id: grant.id,
          mystery_box_result_id: grant.mystery_box_result_id,
          tier_id: grant.tier_id,
          prize_title: grant.prize_title,
          source: redemptionSource(grant),
          table_number: tableNumber ?? null,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        // 409 = ya lo entregó otro mesero. El premio SÍ está entregado: lo sacamos igual.
        if (res.status === 409) {
          setGrants((prev) => prev.filter((g) => g.id !== grant.id))
          setRedeemingId(null)
          return
        }
        setError(data.message || 'No se pudo registrar la entrega')
        setRedeemingId(null)
        return
      }

      setGrants((prev) => prev.filter((g) => g.id !== grant.id))
      setRedeemedCount((n) => n + 1)
      onRedeemed?.()
    } catch {
      setError('Error de conexión')
    } finally {
      setRedeemingId(null)
    }
  }

  // Sin premios y sin nada entregado → no renderiza nada (no estorba el flujo del mesero).
  if (loading || (grants.length === 0 && redeemedCount === 0)) return null

  return (
    <div className="mt-4 space-y-3">
      {redeemedCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          <p className="text-sm font-medium text-green-700">
            {redeemedCount === 1
              ? 'Premio entregado y registrado ✅'
              : `${redeemedCount} premios entregados y registrados ✅`}
          </p>
        </div>
      )}

      {grants.map((grant) => (
        <div key={grant.id} className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">
                {grant.grant_type === 'campaign_prize'
                  ? '🎁 Cliente tiene premio de campaña'
                  : '⚠️ Cliente tiene premio pendiente'}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-base font-semibold text-amber-900">
                <Gift className="h-4 w-4" /> {grant.prize_title}
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Entrega el premio al cliente y registra la entrega para cuadrar con el POS.
              </p>

              <button
                onClick={() => handleRedeem(grant)}
                disabled={redeemingId === grant.id || !customerId}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                {redeemingId === grant.id ? (
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
      ))}

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}
