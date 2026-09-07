'use client'

/**
 * Bloque 1 del apartado de Domicilios — «cómo funciona», escrito para el dueño del
 * restaurante y no para nosotros.
 *
 * §18.d: el dueño pidió *«una parte reservada para domicilios para explicarles cómo
 * funciona»*. Lo que esta tarjeta resuelve de verdad es el requisito que destapó la
 * coexistencia: **bajo coexistencia cada marca recibe el cuadro en SU número**, y el
 * dueño de Cada1 no puede tener 25 números en la cabeza. El número sale de la fila del
 * tenant (`twilio_whatsapp_number` o `zernio_phone_number` según `messaging_provider`);
 * no se guarda en ningún sitio nuevo.
 *
 * COLORES: ni un hex. Los grises salen de las variables del sistema (`--brand-ink*`, en
 * `globals.css`) y lo de marca de `--brand-primary`, así que una marca que cambie su
 * paleta cambia también esta tarjeta.
 */

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Copy, ShieldCheck, Smartphone, ExternalLink, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { DeliveryChannel } from '@/services/delivery-dashboard.service'

const PASOS = [
  {
    titulo: 'El cliente pide por WhatsApp',
    detalle:
      'Te escribe al WhatsApp del restaurante como siempre: por el chat, no por la app. No tiene que registrarse en nada ni hacer nada distinto.',
  },
  {
    titulo: 'Tu operador reenvía el cuadro del pedido',
    detalle:
      'La misma persona que toma el pedido lo reenvía, tal cual, al número de abajo. No hay formato obligatorio: se escribe como se hable.',
  },
  {
    titulo: 'El sistema lee el pedido y lo guarda',
    detalle:
      'Saca solo el nombre, el celular, la dirección, el método de pago y el monto. Crea al cliente si es nuevo, le registra la visita y le suma sus puntos.',
  },
  {
    titulo: 'Al cliente le llega su WhatsApp',
    detalle:
      'Se le manda la plantilla que corresponda —bienvenida, premio desbloqueado o puntos ganados— sin que nadie tenga que escribirla.',
  },
]

const EJEMPLO = 'pedido de Juan 3009876543 cra 43a #1-50 apto 302, paga con nequi, 45 mil'

export function ComoFuncionaCard({ channel }: { channel: DeliveryChannel | null }) {
  const [copiado, setCopiado] = useState(false)

  const copiarNumero = async () => {
    if (!channel?.receivingNumber) return
    try {
      await navigator.clipboard.writeText(channel.receivingNumber)
      setCopiado(true)
      toast.success('Número copiado')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('No se pudo copiar. Seleccionalo y copialo a mano.')
    }
  }

  return (
    <Card className="premium-card">
      <CardHeader>
        <CardTitle className="text-lg" style={{ color: 'var(--brand-ink)' }}>
          Cómo funcionan los domicilios
        </CardTitle>
        <CardDescription style={{ color: 'var(--brand-ink-soft)' }}>
          Cuatro pasos. Lo único que cambia respecto a hoy es que tu operador reenvía el pedido a un
          número.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── Los 4 pasos ── */}
        <ol className="space-y-3">
          {PASOS.map((paso, i) => (
            <li key={paso.titulo} className="flex gap-3">
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-end) 100%)',
                  color: 'var(--brand-on-primary)',
                }}
              >
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--brand-ink)' }}>
                  {paso.titulo}
                </p>
                <p className="text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
                  {paso.detalle}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* ── A qué número se manda el cuadro ── */}
        <div className="rounded-2xl p-4" style={{ background: 'var(--brand-surface)' }}>
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" strokeWidth={1.5} style={{ color: 'var(--brand-ink-soft)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--brand-ink)' }}>
              A este número se manda el cuadro
            </p>
          </div>

          {channel?.receivingNumber ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code
                  className="rounded-xl bg-white px-3 py-2 text-base font-semibold tracking-wide"
                  style={{ color: 'var(--brand-ink)' }}
                >
                  {channel.receivingNumber}
                </code>
                <Button size="sm" variant="outline" onClick={copiarNumero} className="btn-secondary-premium">
                  {copiado ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                  ) : (
                    <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                  )}
                  {copiado ? 'Copiado' : 'Copiar'}
                </Button>
                <Badge variant="outline" className="uppercase">
                  {channel.provider}
                </Badge>
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--brand-ink-muted)' }}>
                Es el número de {channel.tenantName}. Cada marca recibe en el suyo: no hay uno solo
                para todos.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
              {channel === null
                ? 'No se pudo leer la ficha de tu marca ahora mismo, así que no podemos decirte con certeza a qué número mandar el cuadro. Recargá en un momento; si sigue igual, avisale a Cada1.'
                : 'Tu marca todavía no tiene número de WhatsApp configurado, así que no hay a dónde mandar el cuadro. Avisale a Cada1 para terminar de conectar la línea.'}
            </p>
          )}
        </div>

        {/* ── Lo único imprescindible ── */}
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--brand-ink)' }}>
            Lo único imprescindible: el celular del cliente
          </p>
          <p className="mt-1 text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
            Diez dígitos y empieza por 3. Todo lo demás —el nombre, la dirección, el pago, el
            monto— lo saca el sistema solo, y si falta alguno el pedido igual entra. Si falta el
            celular, no.
          </p>
          <div className="mt-3 rounded-2xl p-3" style={{ background: 'var(--brand-surface)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--brand-ink-muted)' }}>
              Un ejemplo que funciona
            </p>
            <p className="mt-1 font-mono text-sm" style={{ color: 'var(--brand-ink)' }}>
              {EJEMPLO}
            </p>
          </div>
        </div>

        {/* ── Quién puede mandarlo ── */}
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--brand-ink-faint)' }}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" strokeWidth={1.5} style={{ color: 'var(--brand-ink-soft)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--brand-ink)' }}>
              Quién puede mandar pedidos
            </p>
          </div>
          <p className="mt-1 text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
            Solo los celulares que tengas autorizados. Un pedido que llegue desde cualquier otro
            número se trata como el mensaje de un cliente, no como un pedido — así es como el
            sistema distingue una cosa de la otra.
          </p>
          {/* `Link` con las clases del botón, no `<Button asChild>`: este Button es
              base-ui y no expone `asChild`. Así la navegación sigue siendo un <a> de
              verdad — se puede abrir en otra pestaña — y se ve igual. */}
          <Link
            href="/dashboard/authorized-numbers"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'btn-secondary-premium mt-3')}
          >
            Gestionar números autorizados
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        </div>

        {/* ── El webhook apagado: se DICE, no se esconde la pantalla ── */}
        {channel && !channel.hasDeliveryWebhook && (
          <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Los domicilios por WhatsApp no están activados en tu marca
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Todo lo de arriba es cómo funcionaría; hoy no está encendido, así que un cuadro
                reenviado a ese número no se procesaría como pedido. Para activarlo hace falta que
                Cada1 lo prenda en la ficha de tu marca: escribiles y quedará andando sin que tengas
                que cambiar nada de tu operación.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
