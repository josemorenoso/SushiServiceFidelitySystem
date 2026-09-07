import { PlugZap } from 'lucide-react'
import { ConexionesPanel } from '@/components/dashboard/conexiones/ConexionesPanel'

/**
 * `/dashboard/conexiones` — el único lugar del panel donde el negocio conecta (y ve) una
 * cuenta de un tercero. Hoy WhatsApp; mañana Google y Meta entran como una tarjeta más.
 *
 * Fase **C1**: sin migración y sin una sola llamada a Zernio. Ya responde la pregunta que
 * hoy el cliente no puede contestar en ninguna pantalla: **por qué número sale su
 * WhatsApp**, cuánto cupo le queda y a dónde llegan sus pedidos de domicilio.
 *
 * Ref: docs/features/conexiones.md
 */

export const metadata = {
  title: 'Conexiones',
}

export default function ConexionesPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-end) 100%)' }}
        >
          <PlugZap className="h-5 w-5" style={{ color: 'var(--brand-on-primary)' }} strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="font-playfair text-2xl font-bold" style={{ color: 'var(--brand-ink)' }}>
            Conexiones
          </h1>
          <p className="text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
            Tus líneas son de la marca. Todas tus sedes mandan por ellas.
          </p>
        </div>
      </header>

      <ConexionesPanel />
    </div>
  )
}
