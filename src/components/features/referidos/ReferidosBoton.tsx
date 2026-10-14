'use client'

/**
 * «🎁 Gánate {X} por traer a un amigo» — el botón de la tarjeta del cliente (2026-10-15).
 *
 * Doc: docs/features/referral-program.md
 *
 * Se pinta SOLO si la marca tiene los referidos encendidos y un premio para quien invita
 * (`GET /api/referral/me` contesta `activo: true`); si no, o si la lectura falla, no dibuja nada:
 * la tarjeta queda como siempre. Al tocarlo se abre, en la misma tarjeta (nada de modales en un
 * celular con mala señal): su enlace con «Copiar», «Compartir por WhatsApp» (su WhatsApp PERSONAL,
 * `wa.me/?text=…`: no gasta la línea de la marca y el amigo da su consentimiento al registrarse), lo
 * que gana cada uno, y «Tus invitados» con su estado.
 *
 * Ningún hex nuevo: el color sale de la marca (`useBranding()`) y de blancos con transparencia sobre
 * la tarjeta. `tono` dice sobre qué fondo está: la tarjeta (oscura, de la marca) o una pantalla clara.
 */

import { useEffect, useState } from 'react'
import { Check, ChevronDown, Copy, MessageCircle, Users } from 'lucide-react'
import { useBranding } from '@/lib/branding-context'

interface Invitado {
  nombre: string
  estado: 'pending' | 'completed' | 'expired'
  etiqueta: string
  gano: boolean
}

interface MiReferido {
  activo: true
  codigo: string
  enlace: string
  gana: string
  regalo_del_amigo: string | null
  dias: number
  tope_al_mes: number
  whatsapp_url: string
  invitados: Invitado[]
  resumen: { registrados: number; vinieron: number; ganados: number }
}

export function ReferidosBoton({ phone, tono = 'oscuro' }: { phone: string; tono?: 'oscuro' | 'claro' }) {
  const branding = useBranding()
  const [datos, setDatos] = useState<MiReferido | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!phone) return
    let cancelado = false
    fetch(`/api/referral/me?phone=${encodeURIComponent(phone)}`)
      .then(async (r) => (r.ok ? ((await r.json()) as { activo: boolean } & Partial<MiReferido>) : null))
      .then((d) => {
        if (!cancelado && d?.activo) setDatos(d as MiReferido)
      })
      .catch(() => {
        /* sin respuesta, la tarjeta queda como siempre */
      })
    return () => {
      cancelado = true
    }
  }, [phone])

  if (!datos) return null

  const oscuro = tono === 'oscuro'
  const texto = oscuro ? 'text-white' : ''
  const tenue = oscuro ? 'text-white/60' : ''
  const estiloTexto = oscuro ? undefined : { color: 'var(--brand-ink)' }
  const estiloTenue = oscuro ? undefined : { color: 'var(--brand-ink-muted)' }
  const mesero = branding.staffLabel?.toLowerCase() ?? 'mesero'

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(datos.enlace)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* sin portapapeles (navegador viejo): el enlace sigue a la vista para copiarlo a mano */
    }
  }

  return (
    <div className="mt-5 w-full">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left shadow-lg transition-transform active:scale-[0.98] ${
          oscuro ? 'bg-white' : 'text-white'
        }`}
        style={
          oscuro
            ? { color: branding.primary }
            : { background: `linear-gradient(135deg, ${branding.primary}, ${branding.primaryEnd})` }
        }
      >
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="text-2xl motion-safe:animate-pulse">
            🎁
          </span>
          <span className="min-w-0 text-sm font-bold leading-snug">Gánate {datos.gana} por traer a un amigo</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div
          className="animate-fade-in-up mt-2 space-y-4 rounded-2xl px-4 py-4"
          style={
            oscuro
              ? { background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }
              : { background: 'var(--brand-surface)', border: '1px solid var(--brand-ink-faint)' }
          }
        >
          <div className={`space-y-1 text-sm ${texto}`} style={estiloTexto}>
            {datos.regalo_del_amigo && (
              <p>
                Tu amigo recibe de regalo: <strong>{datos.regalo_del_amigo}</strong>.
              </p>
            )}
            <p>
              Tú ganas <strong>{datos.gana}</strong> cuando venga y el {mesero} lo escanee.
            </p>
            <p className={`text-xs ${tenue}`} style={estiloTenue}>
              Tiene {datos.dias} días para venir · hasta {datos.tope_al_mes} premios al mes.
            </p>
          </div>

          <a
            href={datos.whatsapp_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-premium flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold"
          >
            <MessageCircle className="h-4 w-4" /> Compartir por WhatsApp
          </a>

          <div className="flex items-center gap-2">
            <p
              className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 font-mono text-xs ${texto}`}
              style={oscuro ? { background: 'rgba(0,0,0,0.18)' } : { ...estiloTexto, background: 'var(--brand-surface)' }}
            >
              {datos.enlace}
            </p>
            <button
              type="button"
              onClick={copiar}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${texto}`}
              style={oscuro ? { background: 'rgba(255,255,255,0.18)' } : { ...estiloTexto, border: '1px solid var(--brand-ink-faint)' }}
            >
              {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          <div>
            <p className={`mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${tenue}`} style={estiloTenue}>
              <Users className="h-3.5 w-3.5" /> Tus invitados
              {datos.resumen.registrados > 0 && ` · ${datos.resumen.vinieron} de ${datos.resumen.registrados} vinieron`}
            </p>
            {datos.invitados.length === 0 ? (
              <p className={`text-sm ${tenue}`} style={estiloTenue}>
                Todavía no invitas a nadie. Comparte tu enlace y empieza a ganar.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {datos.invitados.map((inv, i) => (
                  <li key={`${inv.nombre}-${i}`} className={`flex items-center justify-between gap-3 text-sm ${texto}`} style={estiloTexto}>
                    <span className="min-w-0 truncate">{inv.nombre}</span>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      // «Vino» resalta con el color de la marca (ningún verde horneado, §5).
                      style={
                        inv.estado === 'completed'
                          ? oscuro
                            ? { background: 'rgba(255,255,255,0.32)' }
                            : { background: 'rgba(var(--brand-primary-rgb), 0.14)' }
                          : oscuro
                            ? { background: 'rgba(255,255,255,0.12)' }
                            : { border: '1px solid var(--brand-ink-faint)' }
                      }
                    >
                      {inv.estado === 'completed' ? (inv.gano ? '✓ Vino · ganaste' : '✓ Vino') : inv.etiqueta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
