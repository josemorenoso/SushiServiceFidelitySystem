'use client'

import { useCallback, useEffect, useState } from 'react'
import { Gift, Loader2, CheckCircle2, PartyPopper, RefreshCw, Bookmark } from 'lucide-react'
import { expiryLabel } from '@/lib/format/grant-expiry'
import { useWaiters } from '@/hooks/useWaiters'
import { WaiterPicker } from './WaiterPicker'

export interface PendingGrant {
  id: string
  customer_id: string
  customer_name: string | null
  customer_phone: string | null
  prize_title: string
  grant_type: 'tier_prize' | 'campaign_prize'
  source: 'mystery_box' | 'safe_choice' | 'reactivation' | 'review' | 'manual'
  expires_at: string | null
  granted_at: string
  tier_id: string | null
  mystery_box_result_id: string | null
}

interface Props {
  /**
   * Getter, NO el objeto ya resuelto. `useStaffAuth` lo devuelve memoizado, así que solo
   * cambia cuando cambia la sesión: pasar el objeto obligaba a recrear el intervalo del poll
   * en CADA render, porque un literal nuevo nunca es igual al anterior.
   */
  getAuthHeaders: () => Record<string, string>
  /** Se llama cuando cambia el número de pendientes, para el contador del dashboard. */
  onCountChange?: (count: number) => void
}

const SOURCE_BADGE: Record<PendingGrant['source'], { label: string; className: string }> = {
  mystery_box: { label: 'MYSTERY', className: 'bg-purple-100 text-purple-700' },
  safe_choice: { label: 'SEGURO', className: 'bg-blue-100 text-blue-700' },
  reactivation: { label: 'CAMPAÑA', className: 'bg-amber-100 text-amber-700' },
  review: { label: 'RESEÑA', className: 'bg-emerald-100 text-emerald-700' },
  manual: { label: 'MANUAL', className: 'bg-gray-100 text-gray-700' },
}

/** El origen de la redención, tal como lo espera `reward_redemptions.source`. */
function redemptionSource(grant: PendingGrant): string {
  if (grant.source === 'safe_choice') return 'safe_choice'
  if (grant.grant_type === 'campaign_prize') return 'campaign_reward'
  return 'mystery_box'
}

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'ahora mismo'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

/**
 * Lista de premios pendientes de entrega, acotada a clientes presentes en el local.
 *
 * Es el arreglo de la condición de carrera: antes la única ventana para registrar la
 * entrega eran los 3 segundos posteriores al escaneo, cuando el cliente todavía no había
 * elegido su Mystery Box. Aquí el premio espera hasta que alguien lo entregue.
 *
 * Ref: docs/features/reward-grants.md
 */
export function PendingRewardsList({ getAuthHeaders, onCountChange }: Props) {
  const [grants, setGrants] = useState<PendingGrant[]>([])
  const [loading, setLoading] = useState(true)
  const [tables, setTables] = useState<Record<string, string>>({})
  const [redeemingId, setRedeemingId] = useState<string | null>(null)
  const [justRedeemed, setJustRedeemed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // §19.5 — "Redimir ahora" o "Acumular". `expandedId` es la tarjeta abierta para entregar;
  // `savedId` es la que acaba de decir "guardar", que NO ESCRIBE NADA (19.d): el premio sigue
  // pendiente exactamente como estaba, con la ventana que tuviera, y vuelve a salir solo.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  // §19.6 — quién entrega. Uno por tarjeta: dos premios distintos los pueden entregar dos
  // meseros distintos, y compartir el estado haría que el segundo heredara el nombre del
  // primero sin que nadie lo note.
  const [redeemers, setRedeemers] = useState<Record<string, string>>({})
  const {
    waiters,
    loading: waitersLoading,
    error: waitersError,
    sedeSinAsignar,
  } = useWaiters(getAuthHeaders, true)

  const fetchGrants = useCallback(async () => {
    try {
      const res = await fetch('/api/staff/pending-rewards', { headers: getAuthHeaders() })
      if (!res.ok) return
      const data = await res.json()
      setGrants(data.grants ?? [])
      onCountChange?.(data.count ?? 0)
    } catch {
      // Silencioso: es un poll. Un fallo de red puntual no debe llenar la pantalla de errores.
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders, onCountChange])

  useEffect(() => {
    fetchGrants()
    // Un premio recién elegido por el cliente debe aparecer sin que el mesero recargue.
    const interval = setInterval(fetchGrants, 20_000)
    return () => clearInterval(interval)
  }, [fetchGrants])

  /**
   * §19.5 "Acumular". No hay endpoint ni columna: guardar un premio es NO redimirlo. El
   * grant ya está pendiente y conserva su `expires_at` tal cual (19.d). Lo único que pasa
   * aquí es que se lo decimos al mesero, para que no se quede con la duda de si lo consumió.
   */
  const handleSave = (grantId: string) => {
    setExpandedId(null)
    setSavedId(grantId)
    setTimeout(() => setSavedId((prev) => (prev === grantId ? null : prev)), 3500)
  }

  const handleRedeem = async (grant: PendingGrant) => {
    const redeemerId = redeemers[grant.id]
    if (!redeemerId) return

    setRedeemingId(grant.id)
    setError(null)

    const rawTable = tables[grant.id]?.trim()
    const tableNumber = rawTable ? Number(rawTable) : null

    try {
      const res = await fetch('/api/reward-redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          customer_id: grant.customer_id,
          grant_id: grant.id,
          mystery_box_result_id: grant.mystery_box_result_id,
          tier_id: grant.tier_id,
          prize_title: grant.prize_title,
          source: redemptionSource(grant),
          // §19.6: quién entrega. Del selector, nunca deducido del aparato.
          redeemed_by_staff_id: redeemerId,
          table_number: Number.isFinite(tableNumber) ? tableNumber : null,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        // 409 = otro mesero lo entregó primero. No es un error del que lo intentó:
        // el premio SÍ se entregó, así que lo sacamos de la lista igual.
        if (res.status === 409) {
          setGrants((prev) => prev.filter((g) => g.id !== grant.id))
          setRedeemingId(null)
          return
        }
        setError(data.message || 'No se pudo registrar la entrega')
        setRedeemingId(null)
        return
      }

      setJustRedeemed(grant.id)
      setTimeout(() => {
        setGrants((prev) => prev.filter((g) => g.id !== grant.id))
        setJustRedeemed(null)
      }, 1400)
    } catch {
      setError('Error de conexión')
    } finally {
      setRedeemingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (grants.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <PartyPopper className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-3 font-semibold text-gray-700">Todo entregado</p>
        <p className="mt-1 text-sm text-gray-400">
          No hay premios pendientes de clientes en el local.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p>
      )}

      {grants.map((grant) => {
        const badge = SOURCE_BADGE[grant.source]
        const expiry = expiryLabel(grant.expires_at)
        const isRedeemed = justRedeemed === grant.id

        if (isRedeemed) {
          return (
            <div
              key={grant.id}
              className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-4"
            >
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
              <p className="text-sm font-medium text-green-700">
                Premio entregado a {grant.customer_name ?? 'el cliente'} ✅
              </p>
            </div>
          )
        }

        return (
          <div key={grant.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">
                  {grant.customer_name ?? 'Cliente'}
                </p>
                {grant.customer_phone && (
                  <p className="font-mono text-xs text-gray-400">{grant.customer_phone}</p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>

            <p className="mt-3 flex items-center gap-2 text-base font-semibold text-gray-900">
              <Gift className="h-4 w-4 shrink-0 text-amber-500" />
              {grant.prize_title}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              {timeAgo(grant.granted_at)}
              {expiry && <span className="font-medium text-amber-600"> · {expiry}</span>}
            </p>

            {savedId === grant.id && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <Bookmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span>
                  Guardado para después. El premio sigue disponible tal cual y le vuelve a
                  salir en su próxima visita.
                </span>
              </p>
            )}

            {expandedId !== grant.id ? (
              // §19.5: las dos salidas de la conversación en la mesa. "Guardar" no escribe.
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setExpandedId(grant.id)}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-semibold text-white transition-colors hover:bg-amber-600 active:bg-amber-700"
                >
                  Entregar
                </button>
                <button
                  onClick={() => handleSave(grant.id)}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Guardar
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                <div>
                  <label
                    htmlFor={`mesa-${grant.id}`}
                    className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    Mesa
                  </label>
                  <input
                    id={`mesa-${grant.id}`}
                    type="number"
                    inputMode="numeric"
                    placeholder="Ej: 7"
                    value={tables[grant.id] ?? ''}
                    onChange={(e) =>
                      setTables((prev) => ({ ...prev, [grant.id]: e.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-gray-200 px-3 text-base font-medium text-gray-900 focus:border-gray-400 focus:outline-none"
                  />
                </div>

                <WaiterPicker
                  waiters={waiters}
                  value={redeemers[grant.id] ?? null}
                  onChange={(id) => setRedeemers((prev) => ({ ...prev, [grant.id]: id }))}
                  loading={waitersLoading}
                  error={waitersError}
                  sedeSinAsignar={sedeSinAsignar}
                  label="¿Quién lo entrega?"
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => setExpandedId(null)}
                    disabled={redeemingId === grant.id}
                    className="flex h-12 min-w-[96px] items-center justify-center rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleRedeem(grant)}
                    disabled={redeemingId === grant.id || !redeemers[grant.id]}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-semibold text-white transition-colors hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50"
                  >
                    {redeemingId === grant.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Registrando...
                      </>
                    ) : (
                      'Confirmar entrega'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <button
        onClick={fetchGrants}
        className="flex w-full items-center justify-center gap-2 py-2 text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Actualizar
      </button>
    </div>
  )
}
