'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Lock, Mail, UtensilsCrossed } from 'lucide-react'
import { BRAND_NAME } from '@/lib/branding'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError('Credenciales inválidas. Verifica tu email y contraseña.')
        return
      }

      window.location.href = '/dashboard'
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="premium-bg relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Orb decorativo */}
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-[400px] w-[400px] rounded-full opacity-[0.06]"
        style={{ background: "radial-gradient(circle, #FF4D6D 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-20 h-[320px] w-[320px] rounded-full opacity-[0.05]"
        style={{ background: "radial-gradient(circle, #E63946 0%, transparent 70%)" }}
      />

      <div className="animate-fade-in-up relative z-10 w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background: "linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)",
              boxShadow: "0 8px 24px rgba(230, 57, 70, 0.28)",
            }}
          >
            <UtensilsCrossed className="h-7 w-7 text-white" strokeWidth={1.25} />
          </div>
          <div>
            <h1
              className="font-playfair text-3xl font-bold"
              style={{ color: "#1a1c1d", letterSpacing: "-0.02em" }}
            >
              {BRAND_NAME}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "#9ca3af" }}>
              Panel de administración
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="premium-card p-7">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "#6b7280", letterSpacing: "0.05em" }}
              >
                Email
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                  strokeWidth={1.5}
                  style={{ color: "#9ca3af" }}
                />
                <input
                  id="email"
                  type="email"
                  placeholder="admin@sushiservice.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-premium w-full rounded-xl py-3 pl-10 pr-4 text-sm outline-none"
                  style={{ color: "#1a1c1d" }}
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Contraseña */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "#6b7280", letterSpacing: "0.05em" }}
              >
                Contraseña
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                  strokeWidth={1.5}
                  style={{ color: "#9ca3af" }}
                />
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-premium w-full rounded-xl py-3 pl-10 pr-4 text-sm outline-none"
                  style={{ color: "#1a1c1d" }}
                  required
                />
              </div>
            </div>

            {error && (
              <p className="rounded-xl px-4 py-2.5 text-sm text-center"
                style={{ background: "rgba(230, 57, 70, 0.07)", color: "#E63946" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn-premium mt-1 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold"
              style={{ letterSpacing: "-0.01em" }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                  Ingresando...
                </>
              ) : (
                'Iniciar sesión'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
