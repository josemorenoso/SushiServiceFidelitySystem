'use client'

/**
 * Selector del estilo del negocio + re-aplicación al catálogo completo.
 *
 * DOS DECISIONES DEL DUEÑO GOBIERNAN ESTE COMPONENTE:
 *
 * 1. UN SOLO ESTILO POR NEGOCIO (§12 respuesta 2). Textual: "no puedes enviar un
 *    mensaje con tono urbano y uno cálido, no tiene el más mínimo sentido".
 *    Por eso es una elección única y no un ajuste por mensaje.
 *
 * 2. EL ESTILO ES SUGERENCIA, NO CANDADO (§12 respuesta 4). Cambiarlo NO
 *    reescribe nada: solo cambia el punto de partida de lo que se cree o edite
 *    después. Re-aplicarlo a los 13 mensajes es una acción aparte y explícita,
 *    y — textual — "Re-aplicar un estilo = 13 aprobaciones nuevas de Meta. La
 *    pantalla tiene que decirlo ANTES de confirmar, no después."
 *    De ahí que el diálogo de confirmación diga el número, diga los días y exija
 *    la casilla de responsabilidad antes de habilitar el botón.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Check, Loader2, Palette, ShieldAlert } from 'lucide-react'
import { CATALOG_SIZE, TEMPLATE_STYLES, TEMPLATE_STYLE_INFO } from '@/constants/template-catalog'
import type { TemplateStyle } from '@/types/template.types'

interface Props {
  style: TemplateStyle
  /** Cuántos mensajes tienen hoy un texto activo — el número real que se reescribiría. */
  activeCount: number
  onApplied: (message: string) => void
}

export default function StyleSelector({ style, activeCount, onApplied }: Props) {
  const [confirming, setConfirming] = useState<TemplateStyle | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState<'style' | 'all' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const send = async (next: TemplateStyle, reapplyAll: boolean) => {
    setBusy(reapplyAll ? 'all' : 'style')
    setError(null)
    try {
      const res = await fetch('/api/dashboard/templates/style', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Se manda el valor REAL de la casilla, no `reapplyAll`. El botón ya está
        // deshabilitado sin ella, pero `disclaimer_accepted_at` es un registro de
        // responsabilidad: tiene que reflejar lo que el dueño marcó, no lo que
        // dedujimos por el botón que apretó.
        body: JSON.stringify({ style: next, reapplyAll, acceptedDisclaimer: accepted }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'No se pudo guardar el estilo.')
        return
      }
      setConfirming(null)
      setAccepted(false)
      onApplied(data.message)
    } catch {
      setError('No se pudo conectar. Revisa tu internet e inténtalo de nuevo.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Estilo de tus mensajes
          </CardTitle>
          <CardDescription>
            Todos tus mensajes hablan con el mismo tono. Elige el que suene a tu negocio.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {TEMPLATE_STYLES.map((option) => {
            const info = TEMPLATE_STYLE_INFO[option]
            const active = option === style
            return (
              <button
                key={option}
                type="button"
                onClick={() => !active && setConfirming(option)}
                disabled={busy !== null}
                className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
                  active
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:border-primary/40 hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{info.label}</span>
                  {active && <Check className="h-4 w-4 text-primary shrink-0" />}
                </div>
                <p className="text-[11px] font-medium text-muted-foreground">{info.tagline}</p>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{info.description}</p>
              </button>
            )
          })}
        </CardContent>
      </Card>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && busy === null) {
            setConfirming(null)
            setAccepted(false)
            setError(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Cambiar al estilo {confirming ? TEMPLATE_STYLE_INFO[confirming].label : ''}
            </DialogTitle>
            <DialogDescription>
              Puedes cambiar solo la preferencia, o reescribir todos tus mensajes con el estilo nuevo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border border-border p-3 text-xs space-y-1">
              <p className="font-semibold">Solo cambiar la preferencia</p>
              <p className="text-muted-foreground">
                Tus mensajes actuales no se tocan. El estilo nuevo se usará como punto de partida cuando
                crees o edites un mensaje.
              </p>
            </div>

            {/* La advertencia que el dueño pidió explícitamente que se vea ANTES. */}
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Reescribir los {CATALOG_SIZE} mensajes
              </p>
              <p>
                WhatsApp tiene que aprobar cada mensaje por separado:{' '}
                <strong>son {CATALOG_SIZE} revisiones nuevas</strong> y pueden tardar{' '}
                <strong>entre 1 y 3 días</strong> en quedar activas.
              </p>
              <p>
                {activeCount > 0 ? (
                  <>
                    Mientras las revisan, tus clientes siguen recibiendo los {activeCount} mensajes que ya
                    tienes activos. No se pierde ninguno.
                  </>
                ) : (
                  <>Todavía no tienes mensajes activos, así que empezarán a funcionar al aprobarse.</>
                )}
              </p>
              <p>Cualquier texto que hayas escrito a mano se reemplaza por el del estilo nuevo.</p>
            </div>

            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
              />
              <span>
                <span className="flex items-center gap-1.5 font-semibold">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Entiendo que el contenido es mi responsabilidad
                </span>
                <span className="block mt-1">
                  Si WhatsApp rechaza o bloquea alguno de estos mensajes, la responsabilidad es mía. Queda
                  registrado quién hizo el cambio y cuándo.
                </span>
              </span>
            </label>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => confirming && send(confirming, false)}
              disabled={busy !== null}
              className="gap-2"
            >
              {busy === 'style' && <Loader2 className="h-4 w-4 animate-spin" />}
              Solo cambiar la preferencia
            </Button>
            <Button
              onClick={() => confirming && send(confirming, true)}
              disabled={busy !== null || !accepted}
              className="gap-2"
            >
              {busy === 'all' && <Loader2 className="h-4 w-4 animate-spin" />}
              Reescribir los {CATALOG_SIZE} mensajes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
