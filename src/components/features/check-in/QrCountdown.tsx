'use client'

import { useEffect, useState } from 'react'

/**
 * Cuenta regresiva del QR del cliente.
 *
 * Antes decía «Este código expira en 30 minutos» y no se movía nunca: a los 29
 * minutos seguía diciendo lo mismo. Un reloj que corre crea la urgencia real de
 * mostrarle el código al mesero AHORA, que es justo lo que el negocio necesita.
 *
 * ⚠️ **El vencimiento NO se estima: se lee del token.** El JWT que arma
 * `generateCustomerQRToken()` (`src/lib/utils/qrcode.ts`) trae su propio `exp`,
 * y es el mismo que después valida `verifyCustomerQRToken()`. Contar 30 minutos
 * desde que la pantalla se abrió parecería equivalente y no lo es: si el token
 * viajó, si el reloj del servidor va corrido o si mañana el TTL cambia de 30m a
 * otra cosa, el reloj estaría mintiéndole al cliente. Acá se lee el dato real.
 *
 * Solo se DECODIFICA el payload, nunca se verifica la firma: verificar es cosa
 * del servidor, y este componente únicamente pinta un número.
 *
 * Si el token no se puede leer (formato raro, `exp` ausente), no inventa nada:
 * vuelve al texto de siempre.
 */

interface QrCountdownProps {
  /** La URL del escáner, con el JWT en `?token=`. */
  qrUrl: string
  className?: string
}

/** Segundos que faltan hasta el `exp` del JWT, o `null` si no se puede leer. */
function secondsLeftFromToken(qrUrl: string): number | null {
  try {
    const token = new URL(qrUrl, 'http://localhost').searchParams.get('token')
    if (!token) return null

    const payload = token.split('.')[1]
    if (!payload) return null

    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp = (JSON.parse(json) as { exp?: unknown }).exp
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null

    return Math.max(0, Math.round(exp - Date.now() / 1000))
  } catch {
    return null
  }
}

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function QrCountdown({ qrUrl, className = '' }: QrCountdownProps) {
  // `null` = todavía no se midió (primer render, incluido el del servidor).
  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setLeft(secondsLeftFromToken(qrUrl))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [qrUrl])

  if (left === null) {
    return (
      <p className={`text-[11px] text-white/25 ${className}`}>Este código expira en 30 minutos</p>
    )
  }

  if (left === 0) {
    return (
      <p className={`text-[11px] font-semibold text-white/60 ${className}`}>
        Este código expiró · volvé a ingresar tu celular
      </p>
    )
  }

  return (
    <p className={`flex items-baseline gap-2 ${className}`}>
      <span className="text-[10px] uppercase tracking-[0.16em] text-white/25">Expira en</span>
      <span className="font-mono text-base tabular-nums text-white/55">{mmss(left)}</span>
    </p>
  )
}
