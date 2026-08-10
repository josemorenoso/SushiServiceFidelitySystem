'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MediaUploader } from './MediaUploader'
import { CalendarPlus, Loader2 } from 'lucide-react'

interface EventCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDate?: string         // YYYY-MM-DD
  onCreated?: () => void
}

type EventType = 'promo' | 'festival' | 'activacion' | 'aniversario' | 'otro'
type SendMode = 'auto' | 'remind'

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'festival', label: 'Festival' },
  { value: 'promo', label: 'Promoción' },
  { value: 'activacion', label: 'Activación' },
  { value: 'aniversario', label: 'Aniversario' },
  { value: 'otro', label: 'Otro' },
]

export function EventCreateDialog({
  open,
  onOpenChange,
  defaultDate,
  onCreated,
}: EventCreateDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventDate, setEventDate] = useState(defaultDate ?? '')
  const [eventTime, setEventTime] = useState('')
  const [eventType, setEventType] = useState<EventType>('festival')
  const [sendMode, setSendMode] = useState<SendMode>('remind')
  const [scheduledSendAt, setScheduledSendAt] = useState('')
  const [blackoutDays, setBlackoutDays] = useState('5')
  const [media, setMedia] = useState<{ url: string; type: 'image' | 'video'; path: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filtros básicos (mismo shape que ManualCampaigns)
  const [filterCity, setFilterCity] = useState('')
  const [filterMinVisits, setFilterMinVisits] = useState('')
  const [filterMaxVisits, setFilterMaxVisits] = useState('')
  const [audienceCount, setAudienceCount] = useState<number | null>(null)

  // Estimación en vivo de la audiencia (debounced) con los mismos filtros del evento.
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (filterCity.trim()) params.set('city', filterCity.trim())
        if (filterMinVisits) params.set('minVisits', filterMinVisits)
        if (filterMaxVisits) params.set('maxVisits', filterMaxVisits)
        const res = await fetch(`/api/dashboard/campaigns/estimate?${params}`)
        const data = await res.json()
        setAudienceCount(typeof data.count === 'number' ? data.count : null)
      } catch {
        setAudienceCount(null)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [open, filterCity, filterMinVisits, filterMaxVisits])

  useEffect(() => {
    if (open && defaultDate) {
      setEventDate(defaultDate)
    }
  }, [open, defaultDate])

  function reset() {
    setTitle('')
    setDescription('')
    setEventDate('')
    setEventTime('')
    setEventType('festival')
    setSendMode('remind')
    setScheduledSendAt('')
    setBlackoutDays('5')
    setMedia(null)
    setError(null)
    setFilterCity('')
    setFilterMinVisits('')
    setFilterMaxVisits('')
    setAudienceCount(null)
  }

  function handleClose() {
    if (submitting) return
    reset()
    onOpenChange(false)
  }

  async function handleSubmit() {
    setError(null)

    if (!title.trim()) {
      setError('Título requerido')
      return
    }
    if (!eventDate) {
      setError('Fecha del evento requerida')
      return
    }
    if (sendMode === 'auto' && !scheduledSendAt) {
      setError('Si vas a auto-enviar, indica cuándo')
      return
    }
    if (sendMode === 'auto' && !media) {
      setError(
        'Los envíos automáticos usan plantillas de WhatsApp con imagen o video: sube el flyer del evento antes de programarlo. ' +
        'Si solo quieres un recordatorio en el calendario, usa el modo "Solo recordarme".'
      )
      return
    }

    const filters: Record<string, unknown> = {}
    if (filterCity.trim()) filters.city = filterCity.trim()
    if (filterMinVisits) filters.minVisits = parseInt(filterMinVisits)
    if (filterMaxVisits) filters.maxVisits = parseInt(filterMaxVisits)

    const body = {
      title: title.trim(),
      description: description.trim() || null,
      event_date: eventDate,
      event_time: eventTime || null,
      event_type: eventType,
      send_mode: sendMode,
      scheduled_send_at: sendMode === 'auto' && scheduledSendAt
        ? new Date(scheduledSendAt).toISOString()
        : null,
      filters,
      media_url: media?.url ?? null,
      media_type: media?.type ?? null,
      blackout_days: parseInt(blackoutDays) || 5,
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/dashboard/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error creando evento')
        return
      }
      reset()
      onOpenChange(false)
      onCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" />
            Crear evento del calendario
          </DialogTitle>
          <DialogDescription>
            Planifica una promo, festival o activación. En modo auto-envío el flyer (imagen o video)
            llega por WhatsApp a la audiencia que elijas en la fecha programada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              placeholder="Ej. Festival del Sushi"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="description">Descripción / CTA corta</Label>
            <textarea
              id="description"
              placeholder="Ej. ¡Promo 2x1 todo el día! Te esperamos."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Fecha + hora + tipo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="event_date">Fecha *</Label>
              <Input
                id="event_date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event_time">Hora</Label>
              <Input
                id="event_time"
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event_type">Tipo</Label>
              <select
                id="event_type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value as EventType)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Modo de envío */}
          <div className="space-y-2">
            <Label>Modo de envío</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSendMode('remind')}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  sendMode === 'remind' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                }`}
              >
                <div className="font-medium">Solo recordarme</div>
                <div className="text-xs text-muted-foreground">
                  El evento queda en el calendario. Tú decides cuándo enviar.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSendMode('auto')}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  sendMode === 'auto' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                }`}
              >
                <div className="font-medium">Auto-enviar</div>
                <div className="text-xs text-muted-foreground">
                  El sistema envía la invitación en la fecha/hora que elijas.
                </div>
              </button>
            </div>
          </div>

          {sendMode === 'auto' && (
            <div className="space-y-2">
              <Label htmlFor="scheduled_send_at">Enviar el</Label>
              <Input
                id="scheduled_send_at"
                type="datetime-local"
                value={scheduledSendAt}
                onChange={(e) => setScheduledSendAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Debe ser igual o anterior a la fecha del evento.
              </p>
            </div>
          )}

          {/* Media */}
          <div className="space-y-2">
            <Label>
              Imagen o video {sendMode === 'auto' ? <span className="text-destructive">*</span> : '(opcional)'}
            </Label>
            <MediaUploader value={media} onChange={setMedia} disabled={submitting} />
            {sendMode === 'auto' && !media && (
              <p className="text-xs text-amber-700">
                El auto-envío requiere el flyer: la plantilla de WhatsApp del evento lleva la imagen o el video adjunto.
              </p>
            )}
          </div>

          {/* Audiencia */}
          <div className="space-y-2">
            <Label>Audiencia objetivo (opcional)</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Input
                placeholder="Ciudad"
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
              />
              <Input
                placeholder="Min visitas"
                type="number"
                min={0}
                value={filterMinVisits}
                onChange={(e) => setFilterMinVisits(e.target.value)}
              />
              <Input
                placeholder="Max visitas"
                type="number"
                min={0}
                value={filterMaxVisits}
                onChange={(e) => setFilterMaxVisits(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Si dejas vacío, el evento aplica a todos los clientes que aceptan marketing.
              {audienceCount !== null && (
                <span className="ml-1 font-medium text-foreground">
                  Audiencia estimada hoy: {audienceCount} clientes.
                </span>
              )}
            </p>
          </div>

          {/* Blackout */}
          <div className="space-y-2">
            <Label htmlFor="blackout_days">Días de bloqueo pre-evento</Label>
            <Input
              id="blackout_days"
              type="number"
              min={0}
              max={30}
              value={blackoutDays}
              onChange={(e) => setBlackoutDays(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Cuántos días antes de la fecha del evento se bloquean las campañas manuales conflictivas (0-30, default 5).
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            {submitting ? 'Creando…' : 'Crear evento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
