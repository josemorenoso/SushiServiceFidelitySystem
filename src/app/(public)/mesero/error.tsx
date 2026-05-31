'use client'

import { useEffect } from 'react'

export default function MeseroErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[MeseroErrorBoundary]', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-6 text-white">
      <div className="w-full max-w-md space-y-6 rounded-2xl bg-gray-800 p-6">
        <h2 className="text-xl font-bold text-red-400">Error en la app del mesero</h2>
        <p className="text-sm text-white/70">
          Captura esta pantalla y envíala al desarrollador. El error exacto está abajo:
        </p>
        <div className="rounded-xl bg-gray-900 p-4">
          <p className="text-xs font-mono text-red-300 break-all">
            {error.message}
          </p>
          {error.stack && (
            <pre className="mt-2 max-h-40 overflow-auto text-[10px] font-mono text-white/50 break-all whitespace-pre-wrap">
              {error.stack}
            </pre>
          )}
          {error.digest && (
            <p className="mt-2 text-[10px] text-white/40">
              Digest: {error.digest}
            </p>
          )}
        </div>
        <button
          onClick={reset}
          className="w-full rounded-xl bg-red-500 py-3 text-sm font-semibold text-white hover:bg-red-600"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  )
}
