'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Smartphone, Cloud, AlertTriangle, PhoneCall } from 'lucide-react'
import { toast } from 'sonner'
import type { ConnectionPermissions, TenantConnectionView } from './types'

/**
 * El alta de WhatsApp, **un paso a la vez**.
 *
 * Nunca cinco pasos en gris. Esa fue la queja literal del dueño —*«siempre me sale que
 * falta el último paso de instalar WhatsApp»*— y es la razón de que la tarjeta sea el
 * flujo en vez de tener el flujo dentro. Cada estado muestra una sola cosa que hacer, o
 * una sola cosa que esperar, con el motivo real a la vista.
 */

interface Props {
  connection: TenantConnectionView | null
  permissions: ConnectionPermissions
  onChanged: () => void
}

/** Los dos caminos que esta fase implementa. El C (línea nueva) lo activa el asesor. */
const CAMINOS = [
  {
    route: 'coexistence' as const,
    icon: Smartphone,
    titulo: 'Ya atiendo por WhatsApp desde mi celular',
    detalle:
      'Conectamos ese mismo número. Tu app de WhatsApp Business sigue funcionando igual en tu teléfono — no la pierdes ni tienes que cerrarla.',
  },
  {
    route: 'byo_cloud_api' as const,
    icon: Cloud,
    titulo: 'Mi número ya está conectado a la API de WhatsApp',
    detalle: 'Lo enlazamos con tu panel. Este caso es raro: si no sabes, casi seguro es la opción de arriba.',
  },
]

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'No se pudo completar el paso')
  return json
}

export function AltaFlow({ connection, permissions, onChanged }: Props) {
  const [busy, setBusy] = useState(false)
  const [phone, setPhone] = useState('')

  const disabled = !permissions.canAct || busy

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar el paso')
    } finally {
      setBusy(false)
    }
  }

  const status = connection?.status ?? 'sin_empezar'

  // ── Esperas: el cliente no tiene nada que apretar, pero sí tiene que SABER ────────
  if (status === 'verificacion_pendiente') {
    return (
      <Aviso icon={PhoneCall}>
        <strong>Meta te va a mandar un SMS o una llamada</strong>
        {connection?.phone_e164 ? ` a ${connection.phone_e164}` : ''}. Contéstala y confirma el código: es el
        último paso y lo hace Meta, no nosotros.
      </Aviso>
    )
  }

  if (status === 'kyc_pendiente') {
    return (
      <Aviso>
        Estamos esperando la verificación de tu documentación. Esto lo revisa un tercero y puede tardar —
        te avisamos apenas se mueva.
      </Aviso>
    )
  }

  if (status === 'conectada') {
    return <Aviso>Tu WhatsApp quedó conectado. Estamos esperando que Meta lo deje activo.</Aviso>
  }

  if (status === 'suspendida' || status === 'liberada' || status === 'fallida') {
    return (
      <Aviso icon={AlertTriangle}>
        {connection?.last_error ??
          (status === 'liberada'
            ? 'Esta línea quedó liberada. Habla con tu asesor: un número liberado no vuelve.'
            : 'Esta línea está suspendida. Habla con tu asesor.')}
      </Aviso>
    )
  }

  // ── Paso 1: elegir el camino ─────────────────────────────────────────────────────
  if (!connection?.route) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium" style={{ color: 'var(--brand-ink)' }}>
          ¿Cómo quieres conectar tu WhatsApp?
        </p>
        {CAMINOS.map((c) => (
          <button
            key={c.route}
            type="button"
            disabled={disabled}
            onClick={() => run(async () => { await post('/api/dashboard/conexiones/whatsapp/camino', { route: c.route }) })}
            className="flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors enabled:hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderColor: 'rgba(0,0,0,0.08)' }}
          >
            <c.icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--brand-primary-end)' }} />
            <span>
              <span className="block text-sm font-medium" style={{ color: 'var(--brand-ink)' }}>
                {c.titulo}
              </span>
              <span className="block text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
                {c.detalle}
              </span>
            </span>
          </button>
        ))}
        <p className="text-xs" style={{ color: 'var(--brand-ink-muted)' }}>
          ¿Necesitas una línea nueva? La cotiza y la habilita tu asesor.
        </p>
      </div>
    )
  }

  // ── Paso 2: declarar el número ───────────────────────────────────────────────────
  if (!connection.phone_e164) {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="whatsapp-phone">¿Cuál es el número de WhatsApp del negocio?</Label>
          <Input
            id="whatsapp-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="300 123 4567"
            inputMode="tel"
            disabled={disabled}
          />
          <p className="text-xs" style={{ color: 'var(--brand-ink-muted)' }}>
            Tiene que ser el mismo por el que atiendes hoy. Es lo que comprobamos con Meta para no conectar
            otro por error.
          </p>
        </div>
        <Button
          disabled={disabled || !phone.trim()}
          onClick={() => run(async () => { await post('/api/dashboard/conexiones/whatsapp/numero', { phone }) })}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar el número
        </Button>
      </div>
    )
  }

  // ── Paso 3: abrir Meta ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      <p className="text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
        {status === 'signup_abierto'
          ? 'Termina el paso en la ventana de Meta. Si la cerraste, ábrela otra vez desde aquí.'
          : `Vamos a conectar ${connection.phone_e164}. Se abre una ventana de Meta donde autorizas la conexión.`}
      </p>
      <Button
        disabled={disabled}
        onClick={() =>
          run(async () => {
            const { authUrl } = await post('/api/dashboard/conexiones/whatsapp/signup', {})
            // Se abre en la MISMA pestaña: el popup se lo come cualquier bloqueador, y en
            // un celular —donde el dueño de un restaurante hace esto— casi siempre.
            window.location.href = authUrl
          })
        }
      >
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Conectar mi WhatsApp
      </Button>
    </div>
  )
}

function Aviso({
  children,
  icon: Icon,
}: {
  children: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <p
      className="flex items-start gap-2 rounded-xl p-3 text-sm"
      style={{ background: 'rgba(0,0,0,0.03)', color: 'var(--brand-ink-soft)' }}
    >
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" /> : null}
      <span>{children}</span>
    </p>
  )
}
