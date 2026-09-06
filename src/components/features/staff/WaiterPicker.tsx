'use client'

import { Loader2, Check, MapPin } from 'lucide-react'
import type { Waiter } from '@/hooks/useWaiters'

interface WaiterPickerProps {
  waiters: Waiter[]
  value: string | null
  onChange: (id: string) => void
  loading: boolean
  error: string | null
  sedeSinAsignar: boolean
  /** "¿Quién atiende?" en el check-in, "¿Quién lo entrega?" en la redención. */
  label: string
}

/**
 * El selector de mesero (§19).
 *
 * Es el propósito de la pantalla, no un adorno. Textual del dueño (2026-09-05): *"tengo que
 * separarlos para trackear eficiencia eso no se puede juntar"*. Sin esto la visita se
 * registra igual y la métrica por mesero nace incompleta.
 *
 * NO PIDE PIN. El dueño lo quitó el 2026-09-05. Para el escaneo nunca lo hubo —*"nadie lo va
 * a hacer porque es una estupidez regalar tu premio a otro"*— y para la redención se decidió
 * que basta el nombre. Está escrito acá para que nadie lo trate como un olvido.
 *
 * La lista solo trae los de la sede del aparato. Los tres estados vacíos son distintos y se
 * dicen distinto: sin sede (tiene arreglo), sin meseros (falta darlos de alta), o falló la
 * base (reintentar). Un selector vacío y mudo haría que el mesero registrara sin atribuir.
 */
export function WaiterPicker({
  waiters,
  value,
  onChange,
  loading,
  error,
  sedeSinAsignar,
  label,
}: WaiterPickerProps) {
  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </span>

      {loading && (
        <div className="flex min-h-[52px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      )}

      {!loading && sedeSinAsignar && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Este celular no tiene sede asignada, así que no sabemos qué meseros mostrar.
            Asígnasela una vez desde la pantalla de activación.
          </span>
        </div>
      )}

      {!loading && !sedeSinAsignar && error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {!loading && !sedeSinAsignar && !error && waiters.length === 0 && (
        <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
          Todavía no hay meseros dados de alta en esta sede. Se crean desde el panel, solo con
          el nombre.
        </div>
      )}

      {!loading && waiters.length > 0 && (
        <div
          className={
            waiters.length > 6
              ? 'max-h-[260px] space-y-2 overflow-y-auto pr-1'
              : 'space-y-2'
          }
        >
          {waiters.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => onChange(w.id)}
              aria-pressed={value === w.id}
              className={`flex min-h-[52px] w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-base transition-colors ${
                value === w.id
                  ? 'border-2 border-red-500 bg-red-50 font-semibold text-gray-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{w.name}</span>
              {value === w.id && <Check className="h-5 w-5 flex-shrink-0 text-red-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
