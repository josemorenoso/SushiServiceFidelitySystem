'use client'

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type {
  RestaurantEvent,
  EventType,
  EventStatus,
} from '@/types/database.types'
import {
  Calendar,
  Clock,
  Filter,
  Image as ImageIcon,
  Video as VideoIcon,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  Pencil,
  Save,
  X,
  Send,
  CheckCircle2,
} from 'lucide-react'

interface EventDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: RestaurantEvent | null
  onUpdated?: () => void
}

const TYPE_COLORS: Record<EventType, string> = {
  festival: 'bg-purple-100 text-purple-800 border-purple-200',
  promo: 'bg-pink-100 text-pink-800 border-pink-200',
  activacion: 'bg-amber-100 text-amber-800 border-amber-200',
  aniversario: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  otro: 'bg-slate-100 text-slate-800 border-slate-200',
}

const STATUS_LABELS: Record<EventStatus, string> = {
  planned: 'Planeado',
  scheduled: 'Programado',
  sent: 'Enviado',
  cancelled: 'Cancelado',
  failed: 'Falló',
}

const STATUS_VARIANT: Record<EventStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  planned: 'outline',
  scheduled: 'secondary',
  sent: 'default',
  cancelled: 'destructive',
  failed: 'destructive',
}

function formatDateLegible(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  if (!y || !m || !d) return yyyymmdd
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  return `${d} de ${months[m - 1]} de ${y}`
}

function formatScheduledAt(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return date.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function EventDetailDrawer({ open, onOpenChange, event, onUpdated }: EventDetailDrawerProps) {
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const [dispatchResult, setDispatchResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    if (event) {
      setDraftTitle(event.title)
      setDraftDescription(event.description ?? '')
      setEditing(false)
      setError(null)
      setDispatchResult(null)
    }
  }, [event])

  // Carga las plantillas Twilio para advertir si falta la requerida por el evento.
  useEffect(() => {
    if (!open || event?.send_mode !== 'auto') return
    let active = true
    fetch('/api/dashboard/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) setSettings(data as Record<string, string>)
      })
      .catch(() => { /* la alerta de plantilla es best-effort */ })
    return () => { active = false }
  }, [open, event?.send_mode])

  if (!event) return null

  // El path de envío resuelve la plantilla por media_type: 'video' usa el SID
  // de video; imagen y texto-plano usan el SID de imagen.
  const requiredTemplateKey = event.media_type === 'video'
    ? 'event_template_video_sid'
    : 'event_template_image_sid'
  const templateMissing = settings !== null && !settings[requiredTemplateKey]
  const canDispatch = event.send_mode === 'auto'
    && (event.status === 'scheduled' || event.status === 'failed')

  async function dispatchNow() {
    if (!event) return
    const verb = event.status === 'failed' ? 'reintentar el envío de' : 'enviar ahora'
    if (!confirm(`¿Confirmas ${verb} "${event.title}"? Se enviará el WhatsApp a la audiencia objetivo.`)) return
    setDispatching(true)
    setError(null)
    setDispatchResult(null)
    try {
      const res = await fetch(`/api/dashboard/calendar/events/${event.id}/dispatch`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error enviando el evento')
        return
      }
      setDispatchResult(
        `Enviados: ${data.sent} · Fallidos: ${data.failed} · Excluidos por cap mensual: ${data.excluded_monthly_cap}`
      )
      onUpdated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setDispatching(false)
    }
  }

  async function saveEdit() {
    if (!event) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/calendar/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle.trim(),
          description: draftDescription.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error guardando')
        return
      }
      setEditing(false)
      onUpdated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  async function cancelEvent() {
    if (!event) return
    if (!confirm(`¿Cancelar el evento "${event.title}"? Quedará archivado y no se podrá disparar.`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/dashboard/calendar/events/${event.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error cancelando')
        return
      }
      onUpdated?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  const filtersList = Object.entries(event.filters ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {editing ? (
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  maxLength={120}
                />
              ) : (
                <SheetTitle className="text-lg leading-tight">{event.title}</SheetTitle>
              )}
              <SheetDescription className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[event.event_type]}`}>
                  {event.event_type}
                </span>
                <Badge variant={STATUS_VARIANT[event.status]}>
                  {STATUS_LABELS[event.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {event.send_mode === 'auto' ? 'Auto-envío' : 'Recordatorio'}
                </span>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="px-4 space-y-4 pb-4">
          {/* Media */}
          {event.media_url && (
            <div className="rounded-lg overflow-hidden border bg-muted/30">
              {event.media_type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={event.media_url} alt={event.title} className="block w-full max-h-72 object-contain" />
              ) : (
                <video src={event.media_url} controls className="block w-full max-h-72" />
              )}
              <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5 border-t bg-background">
                {event.media_type === 'image' ? <ImageIcon className="h-3.5 w-3.5" /> : <VideoIcon className="h-3.5 w-3.5" />}
                {event.media_type === 'image' ? 'Imagen adjunta' : 'Video adjunto'}
              </div>
            </div>
          )}

          {/* Descripción */}
          <section className="space-y-1.5">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Descripción</h4>
            {editing ? (
              <textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            ) : (
              <p className="text-sm">
                {event.description || <span className="text-muted-foreground italic">Sin descripción</span>}
              </p>
            )}
          </section>

          {/* Fechas */}
          <section className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fecha del evento</h4>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{formatDateLegible(event.event_date)}</span>
              {event.event_time && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{event.event_time.slice(0, 5)}</span>
                </>
              )}
            </div>

            {event.send_mode === 'auto' && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs space-y-1">
                <div className="font-medium text-amber-900 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Programado para auto-enviar
                </div>
                <div className="text-amber-800">{formatScheduledAt(event.scheduled_send_at)}</div>
                <div className="text-amber-700 text-[11px]">
                  El cron <code className="font-mono">calendar-dispatch</code> lo enviará automáticamente al llegar esta fecha. También puedes dispararlo manualmente con &ldquo;Enviar ahora&rdquo;.
                </div>
              </div>
            )}

            {templateMissing && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2.5 text-xs space-y-1">
                <div className="font-medium text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Falta la plantilla de Twilio
                </div>
                <div className="text-destructive/90 text-[11px]">
                  No hay <code className="font-mono">{requiredTemplateKey}</code> configurada en Ajustes. El envío fallará hasta que la agregues en Dashboard → Ajustes.
                </div>
              </div>
            )}
          </section>

          {/* Filtros */}
          <section className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Audiencia objetivo
            </h4>
            {filtersList.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Todos los clientes que aceptan marketing</p>
            ) : (
              <ul className="text-sm space-y-0.5">
                {filtersList.map(([k, v]) => (
                  <li key={k} className="flex gap-2">
                    <span className="text-muted-foreground">{k}:</span>
                    <span className="font-medium">{String(v)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Blackout */}
          <section className="space-y-1.5">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" />
              Bloqueo pre-evento
            </h4>
            <p className="text-sm">
              {event.blackout_days} días antes del evento las campañas manuales conflictivas quedan bloqueadas.
            </p>
          </section>

          {/* Metadata */}
          <section className="pt-2 border-t space-y-1 text-xs text-muted-foreground">
            <div>Creado: {new Date(event.created_at).toLocaleString('es-CO')}</div>
            {event.updated_at !== event.created_at && (
              <div>Actualizado: {new Date(event.updated_at).toLocaleString('es-CO')}</div>
            )}
            <div className="font-mono opacity-60">ID: {event.id.slice(0, 8)}…</div>
          </section>

          {dispatchResult && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-sm text-emerald-800 flex items-start gap-1.5">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{dispatchResult}</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2.5 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <SheetFooter>
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                <X className="h-3.5 w-3.5 mr-1" />
                Cancelar
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={busy || !draftTitle.trim()}>
                <Save className="h-3.5 w-3.5 mr-1" />
                {busy ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          ) : (
            <>
              {canDispatch && (
                <Button
                  size="sm"
                  onClick={dispatchNow}
                  disabled={dispatching || busy}
                >
                  <Send className="h-3.5 w-3.5 mr-1" />
                  {dispatching
                    ? 'Enviando…'
                    : event.status === 'failed' ? 'Reintentar envío' : 'Enviar ahora'}
                </Button>
              )}
              {event.status !== 'cancelled' && event.status !== 'sent' && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={dispatching}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Editar
                </Button>
              )}
              {event.status !== 'cancelled' && event.status !== 'sent' && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={cancelEvent}
                  disabled={busy || dispatching}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Cancelar evento
                </Button>
              )}
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
