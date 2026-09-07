'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

/**
 * El aterrizaje del redirect de Meta.
 *
 * ⚠️ **Lee los parámetros de `window.location`, no con `useSearchParams()`.** En Next.js 16
 * `useSearchParams()` fuerza el CSR bailout de toda la rama; es la misma razón por la que
 * el selector de sede guarda en `localStorage` en vez de en la URL.
 *
 * Y los lee en un **ref**, no en un estado. Lo que viene en la URL no cambia nunca durante
 * la vida de esta pantalla: guardarlo en `useState` obligaría a escribirlo desde un efecto
 * y eso es una cascada de renders por un dato que ya estaba ahí. El estado guarda solo lo
 * que de verdad cambia — el resultado de hablar con el servidor.
 *
 * LA ESCOTILLA NO SE QUITA
 * ────────────────────────
 * Si el `code` no llega por la URL, se muestra el campo para pegarlo a mano. El §6.4 del
 * parte de coexistencia deja abierto si en modo `headless` el code llega por redirect o
 * por `postMessage`: quitar la red antes de comprobarlo es dejar al cliente sin salida
 * justo en el paso final.
 */

type Phase = 'leyendo' | 'cerrando' | 'listo' | 'a_mano' | 'error'

interface Outcome {
  phase: Phase
  message: string | null
}

interface Params {
  nonce: string | null
  code: string | null
  step: string | null
}

const SIN_NONCE =
  'Este enlace no trae el identificador de tu conexión. Vuelve a abrir el paso de Meta desde Conexiones.'
const VARIOS_NUMEROS =
  'Tu cuenta de Meta tiene más de un número de WhatsApp. Este paso lo termina tu asesor — avísale.'

/** Qué se muestra ANTES de hablar con el servidor. Derivado, no guardado. */
function faseInicial(params: Params | null): Outcome {
  if (!params) return { phase: 'leyendo', message: null }
  if (params.step === 'select_phone_number') return { phase: 'error', message: VARIOS_NUMEROS }
  if (!params.nonce) return { phase: 'error', message: SIN_NONCE }
  if (!params.code) return { phase: 'a_mano', message: null }
  return { phase: 'cerrando', message: null }
}

export function CallbackClient() {
  // Lectura perezosa en un ref: no dispara render y no existe en el render del servidor.
  const params = useRef<Params | null>(null)
  if (params.current === null && typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search)
    params.current = { nonce: q.get('nonce'), code: q.get('code'), step: q.get('step') }
  }

  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [enviando, setEnviando] = useState(false)

  // El redirect de Meta puede montar esto más de una vez; el `code` se canjea UNA sola vez.
  // Un segundo canje del mismo code sería un 409 de Zernio confundido con un fallo real.
  const enviado = useRef(false)

  const { phase, message } = outcome ?? faseInicial(params.current)
  const nonce = params.current?.nonce ?? null

  const enviarCode = useCallback(async (code: string, nonceValue: string) => {
    try {
      const res = await fetch('/api/dashboard/conexiones/whatsapp/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, nonce: nonceValue }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setOutcome({ phase: 'error', message: json.error ?? 'No se pudo cerrar la conexión.' })
        return
      }
      setOutcome({
        phase: 'listo',
        message: json.phone ? `Tu WhatsApp quedó conectado en ${json.phone}.` : 'Tu WhatsApp quedó conectado.',
      })
    } catch {
      setOutcome({ phase: 'error', message: 'No se pudo hablar con el servidor. Intenta de nuevo.' })
    }
  }, [])

  useEffect(() => {
    const p = params.current
    if (!p?.code || !p.nonce || p.step === 'select_phone_number') return
    if (enviado.current) return
    enviado.current = true
    void enviarCode(p.code, p.nonce)
  }, [enviarCode])

  const enviarAMano = async () => {
    if (!nonce || !manualCode.trim()) return
    setEnviando(true)
    try {
      await enviarCode(manualCode.trim(), nonce)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Card className="dashboard-card">
      <CardContent className="space-y-4 p-6">
        {(phase === 'leyendo' || phase === 'cerrando') && (
          <p className="flex items-center gap-2 text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            {phase === 'leyendo' ? 'Leyendo la respuesta de Meta…' : 'Cerrando la conexión…'}
          </p>
        )}

        {phase === 'listo' && (
          <p className="flex items-start gap-2 text-sm" style={{ color: 'var(--brand-ink)' }}>
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--brand-primary-end)' }} />
            <span>{message}</span>
          </p>
        )}

        {phase === 'error' && (
          <p className="flex items-start gap-2 text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{message}</span>
          </p>
        )}

        {phase === 'a_mano' && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
              Meta no nos devolvió el código automáticamente. Si lo ves en tu pantalla, pégalo aquí y
              terminamos.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="code">Código de Meta</Label>
              <Input
                id="code"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="AQD…"
                autoComplete="off"
              />
            </div>
            <Button onClick={enviarAMano} disabled={!nonce || !manualCode.trim() || enviando}>
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Conectar mi WhatsApp
            </Button>
          </div>
        )}

        <Link
          href="/dashboard/conexiones"
          className="inline-block text-sm font-medium"
          style={{ color: 'var(--brand-primary-end)' }}
        >
          ← Volver a Conexiones
        </Link>
      </CardContent>
    </Card>
  )
}
