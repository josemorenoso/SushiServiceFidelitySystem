'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  MessageCircle,
  FileText,
  ShieldCheck,
  Lock,
  Loader2,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { LineHealth } from './LineHealth'
import { AltaFlow } from './AltaFlow'
import type {
  ConnectionPermissions,
  LineBudgetResponse,
  TenantConnectionView,
  WhatsappConnection,
} from './types'

/**
 * La tarjeta de WhatsApp — la única que hoy tiene contenido real.
 *
 * Responde, de arriba abajo, las cuatro preguntas que el cliente hoy no puede contestar:
 * por qué número sale su WhatsApp, cuánto cupo le queda, a dónde llegan los pedidos de
 * domicilio y dónde están sus plantillas.
 *
 * DOS TARJETAS, NO UNA
 * ────────────────────
 * Un tenant de **Twilio** ve una versión de SOLO LECTURA: «WhatsApp por Twilio, cuenta
 * propia». No se le inventa una fila en ninguna tabla ni se le ofrece un flujo que no le
 * toca — es la regla de honestidad del §3 del diseño. Las 4 marcas vivas de Twilio caen
 * acá y no deben ver un solo botón de alta.
 */

function formatPhone(raw: string | null): string {
  if (!raw) return 'sin número'
  // Zernio guarda E.164 con '+'; Twilio guarda su propio formato, a veces con el prefijo
  // `whatsapp:` delante. Se le quita solo para mostrar: el dato guardado no se toca.
  const clean = raw.replace(/^whatsapp:/i, '').trim()
  const m = clean.match(/^\+57(\d{3})(\d{3})(\d{4})$/)
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : clean
}

export function WhatsappCard({
  whatsapp,
  permissions,
  connection,
  budget,
  budgetLoading,
  onToggleAutoReply,
  onConnectionChanged,
}: {
  whatsapp: WhatsappConnection
  permissions: ConnectionPermissions
  connection: TenantConnectionView | null
  budget: LineBudgetResponse | null
  budgetLoading: boolean
  onToggleAutoReply: (enabled: boolean) => Promise<void>
  onConnectionChanged: () => void
}) {
  const [saving, setSaving] = useState(false)
  const isZernio = whatsapp.provider === 'zernio'

  const handleToggle = async () => {
    if (!permissions.canAct || saving) return
    setSaving(true)
    try {
      await onToggleAutoReply(!whatsapp.autoReplyEnabled)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="dashboard-card">
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-end) 100%)' }}
            >
              <MessageCircle className="h-5 w-5" style={{ color: 'var(--brand-on-primary)' }} strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--brand-ink)' }}>
                WhatsApp · Línea principal
              </h2>
              <p className="text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
                {formatPhone(whatsapp.phone)}
                {isZernio ? ' · por Zernio' : ' · por Twilio, cuenta propia'}
              </p>
            </div>
          </div>

          {whatsapp.configured ? (
            <Badge variant="secondary">● Activa</Badge>
          ) : (
            <Badge variant="destructive">Sin configurar</Badge>
          )}
        </div>

        {/* Sin línea lista, la tarjeta ES EL FLUJO (§3 del diseño): un paso a la vez,
            nunca cinco en gris. Salvo para un tenant Twilio, que trae su propia cuenta y
            no tiene ningún alta que hacer aquí. */}
        {!whatsapp.configured && !whatsapp.readOnly && (
          <div className="space-y-3 border-t pt-4" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
            <AltaFlow connection={connection} permissions={permissions} onChanged={onConnectionChanged} />
          </div>
        )}

        {!whatsapp.configured && whatsapp.readOnly && (
          <p
            className="flex items-start gap-2 rounded-xl p-3 text-sm"
            style={{ background: 'rgba(0,0,0,0.03)', color: 'var(--brand-ink-soft)' }}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Esta marca todavía no tiene una línea de WhatsApp lista para enviar. Mientras siga así, no sale
              ningún mensaje automático. Habla con tu asesor.
            </span>
          </p>
        )}

        {/* Por qué número sale su WhatsApp — el ámbito es la MARCA, no la sede. */}
        <p className="text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
          Tus mensajes salen por este número, y lo comparten <strong>todas tus sedes</strong>. Los puntos y las
          plantillas son de la marca; lo que cambia de una sede a otra viaja dentro del mensaje.
        </p>

        <LineHealth budget={budget} loading={budgetLoading} />

        <div className="space-y-2 border-t pt-4" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <p className="text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
            <strong style={{ color: 'var(--brand-ink)' }}>Los pedidos de domicilio llegan a ESTE número.</strong>{' '}
            Solo se registran los que envían los celulares que autorizaste — el resto recibe una respuesta
            genérica.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/authorized-numbers"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/[0.04]"
              style={{ color: 'var(--brand-primary-end)' }}
            >
              <ShieldCheck className="h-4 w-4" /> Números autorizados
            </Link>
            <Link
              href="/dashboard/templates"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/[0.04]"
              style={{ color: 'var(--brand-primary-end)' }}
            >
              <FileText className="h-4 w-4" /> Ver plantillas
            </Link>
          </div>
        </div>

        {/* §18.e — el interruptor de la auto-respuesta. */}
        <div className="space-y-2 border-t pt-4" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button
            type="button"
            onClick={handleToggle}
            disabled={!permissions.canAct || saving}
            aria-pressed={whatsapp.autoReplyEnabled}
            className="flex w-full items-start gap-3 rounded-xl p-2 text-left transition-colors enabled:hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? (
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" style={{ color: 'var(--brand-ink-muted)' }} />
            ) : whatsapp.autoReplyEnabled ? (
              <ToggleRight className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--brand-primary-end)' }} />
            ) : (
              <ToggleLeft className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--brand-ink-muted)' }} />
            )}
            <span>
              <span className="block text-sm font-medium" style={{ color: 'var(--brand-ink)' }}>
                Responder automáticamente a quien escriba
              </span>
              <span className="block text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
                {whatsapp.autoReplyEnabled
                  ? 'Hoy, a quien escriba a este número le contestamos que es un número de avisos automáticos. Apágalo si atiendes personalmente por aquí.'
                  : 'Apagado: a quien escriba a este número no le contestamos nada. Tú atiendes.'}
              </span>
            </span>
          </button>

          {!whatsapp.autoReplyApplies && (
            <p className="pl-2 text-xs" style={{ color: 'var(--brand-ink-muted)' }}>
              Con Zernio esta respuesta automática todavía no se envía nunca. El interruptor queda guardado para
              cuando aplique.
            </p>
          )}
        </div>

        {whatsapp.readOnly && (
          <p
            className="flex items-start gap-2 rounded-xl p-3 text-sm"
            style={{ background: 'rgba(0,0,0,0.03)', color: 'var(--brand-ink-soft)' }}
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Esta línea está en <strong>tu propia cuenta de Twilio</strong>. Aquí se muestra tal como está: el
              alta y los cambios de la línea los hace tu asesor, no esta pantalla.
            </span>
          </p>
        )}

        {!permissions.canAct && permissions.denialMessage && (
          <p
            className="flex items-start gap-2 rounded-xl p-3 text-sm"
            style={{ background: 'rgba(0,0,0,0.03)', color: 'var(--brand-ink-soft)' }}
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{permissions.denialMessage}</span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
