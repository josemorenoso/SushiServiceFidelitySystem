'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStaffAuth } from '@/hooks/useStaffAuth'
import { Html5Qrcode } from 'html5-qrcode'
import { Loader2, ArrowLeft, Flashlight, FlashlightOff, Keyboard } from 'lucide-react'
import { decodeCustomerQRTokenUnsafe } from '@/lib/utils/qrcode'

export default function MeseroScanPage() {
  const router = useRouter()
  const { session, loading: authLoading } = useStaffAuth()
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const navigatingRef = useRef(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [manualPhone, setManualPhone] = useState('')
  const [showManual, setShowManual] = useState(false)

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/mesero')
    }
  }, [authLoading, session, router])

  // Capturador global de errores para diagnosticar crashes del scanner
  useEffect(() => {
    const handleErr = (e: ErrorEvent) => {
      console.error('[WindowError]', e.error)
      setError(`CRASH: ${e.message} — Captura esta pantalla y envíala.`)
    }
    const handleRejection = (e: PromiseRejectionEvent) => {
      console.error('[UnhandledRejection]', e.reason)
      setError(`CRASH: ${String(e.reason)} — Captura esta pantalla y envíala.`)
    }
    window.addEventListener('error', handleErr)
    window.addEventListener('unhandledrejection', handleRejection)
    return () => {
      window.removeEventListener('error', handleErr)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  useEffect(() => {
    if (authLoading || !session || showManual) return

    const scanner = new Html5Qrcode('reader')
    scannerRef.current = scanner

    const start = async () => {
      try {
        setScanning(true)
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            handleScan(decodedText)
          },
          () => {
            // ignore scan errors (no QR in frame)
          }
        )
      } catch (err) {
        console.error('[Scanner] Error starting:', err)
        setError('No se pudo iniciar la cámara. Intenta el modo manual.')
        setScanning(false)
      }
    }

    start()

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current.clear()
      }
    }
  }, [authLoading, session, showManual])

  const handleScan = (decodedText: string) => {
    if (navigatingRef.current) return
    navigatingRef.current = true

    // Extraer token de URL si viene como URL completa
    let token = decodedText
    try {
      const url = new URL(decodedText)
      const t = url.searchParams.get('token')
      if (t) token = t
    } catch {
      // no es URL, usar raw
    }

    const payload = decodeCustomerQRTokenUnsafe(token)
    if (!payload) {
      navigatingRef.current = false
      setError('Código QR inválido')
      return
    }

    // Persist decoded data before navigating — confirm page reads this on first render
    // to avoid App Router's Suspense gap where useSearchParams returns empty on first paint
    try {
      sessionStorage.setItem(
        'mesero_pending_customer',
        JSON.stringify({ name: payload.name, phone: payload.phone, sub: payload.sub, token })
      )
    } catch {
      // sessionStorage unavailable — confirm falls back to URL decode
    }

    // Detener scanner limpiamente antes de navegar para evitar race condition
    const stopAndNavigate = async () => {
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop()
        } catch {
          // ignore
        }
        try {
          scannerRef.current.clear()
        } catch {
          // ignore
        }
      }
      router.push(`/mesero/confirm?token=${encodeURIComponent(token)}`)
    }

    stopAndNavigate()
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualPhone.length < 10) return
    router.push(`/mesero/confirm?phone=${encodeURIComponent(manualPhone)}`)
  }

  const toggleTorch = async () => {
    try {
      const track = (document.getElementById('reader')?.querySelector('video') as HTMLVideoElement)?.srcObject as MediaStream
      const videoTrack = track?.getVideoTracks()[0]
      if (videoTrack && 'applyConstraints' in videoTrack) {
        await (videoTrack as unknown as { applyConstraints(c: object): Promise<void> }).applyConstraints({
          advanced: [{ torch: !torchOn } as unknown as object],
        })
        setTorchOn(!torchOn)
      }
    } catch {
      // ignore
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="flex min-h-screen flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => router.push('/mesero/dashboard')}
          className="rounded-xl p-2 text-white/70 transition-colors hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-sm font-semibold">Escanear QR</h1>
        <div className="flex gap-2">
          <button
            onClick={toggleTorch}
            className="rounded-xl p-2 text-white/70 transition-colors hover:bg-white/10"
            title="Linterna"
          >
            {torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
          </button>
          <button
            onClick={() => {
              if (scannerRef.current) {
                scannerRef.current.stop().catch(() => {})
              }
              setShowManual(!showManual)
            }}
            className="rounded-xl p-2 text-white/70 transition-colors hover:bg-white/10"
            title="Manual"
          >
            <Keyboard className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Scanner or Manual */}
      {!showManual ? (
        <div className="relative flex flex-1 flex-col items-center justify-center">
          <div
            id="reader"
            className="w-full overflow-hidden"
            style={{ maxWidth: 500, aspectRatio: '1/1' }}
          />

          {/* Overlay frame */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[250px] w-[250px]">
              <div className="absolute left-0 top-0 h-6 w-6 border-l-4 border-t-4 border-red-500" />
              <div className="absolute right-0 top-0 h-6 w-6 border-r-4 border-t-4 border-red-500" />
              <div className="absolute bottom-0 left-0 h-6 w-6 border-b-4 border-l-4 border-red-500" />
              <div className="absolute bottom-0 right-0 h-6 w-6 border-b-4 border-r-4 border-red-500" />
            </div>
          </div>

          {error && (
            <div className="absolute bottom-8 mx-4 rounded-lg bg-red-500/90 px-4 py-2 text-sm text-white">
              {error}
            </div>
          )}

          <p className="absolute bottom-20 text-xs text-white/60">
            Apunta al código QR del cliente
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <form onSubmit={handleManualSubmit} className="w-full max-w-sm space-y-4">
            <p className="text-center text-sm text-white/70">
              Si la cámara no funciona, ingresa el número del cliente:
            </p>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="3001234567"
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="w-full rounded-xl border border-white/20 bg-white/10 py-3 px-4 text-center text-lg text-white outline-none placeholder:text-white/30 focus:border-red-400"
              maxLength={10}
              autoFocus
            />
            <button
              type="submit"
              disabled={manualPhone.length < 10}
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-red-500 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              Buscar cliente
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
