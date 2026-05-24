'use client'

import { useMemo } from 'react'

interface RestaurantEvent {
  id: string
  title: string
  event_date: string
  event_type: 'promo' | 'festival' | 'activacion' | 'aniversario' | 'otro'
  status: 'planned' | 'scheduled' | 'sent' | 'cancelled' | 'failed'
  blackout_days: number
  send_mode: 'auto' | 'remind'
}

interface CalendarMonthViewProps {
  year: number
  month: number                    // 0-11
  events: RestaurantEvent[]
  onEventClick?: (event: RestaurantEvent) => void
  onDayClick?: (dateISO: string) => void
}

const TYPE_DOT_COLOR: Record<RestaurantEvent['event_type'], string> = {
  festival: 'bg-purple-500',
  promo: 'bg-pink-500',
  activacion: 'bg-amber-500',
  aniversario: 'bg-emerald-500',
  otro: 'bg-slate-500',
}

const TYPE_BG_COLOR: Record<RestaurantEvent['event_type'], string> = {
  festival: 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100',
  promo: 'bg-pink-50 text-pink-900 border-pink-200 hover:bg-pink-100',
  activacion: 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100',
  aniversario: 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100',
  otro: 'bg-slate-50 text-slate-900 border-slate-200 hover:bg-slate-100',
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function toISO(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

function isToday(year: number, month: number, day: number): boolean {
  const now = new Date()
  return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day
}

function diffDays(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00Z`)
  const b = new Date(`${toISO}T00:00:00Z`)
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))
}

export function CalendarMonthView({
  year,
  month,
  events,
  onEventClick,
  onDayClick,
}: CalendarMonthViewProps) {
  // Construir la grilla del mes con padding a lunes
  const grid = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    // JS: 0=Sun, 1=Mon... convertir a lunes-first: (day + 6) % 7
    const leadBlanks = (firstDay.getDay() + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells: { day: number | null; iso: string | null }[] = []
    for (let i = 0; i < leadBlanks; i++) cells.push({ day: null, iso: null })
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, iso: toISO(year, month, d) })
    }
    // Padding final hasta múltiplo de 7
    while (cells.length % 7 !== 0) cells.push({ day: null, iso: null })
    return cells
  }, [year, month])

  // Indexar eventos por fecha
  const eventsByDate = useMemo(() => {
    const map: Record<string, RestaurantEvent[]> = {}
    for (const ev of events) {
      if (ev.status === 'cancelled') continue
      if (!map[ev.event_date]) map[ev.event_date] = []
      map[ev.event_date].push(ev)
    }
    return map
  }, [events])

  // Calcular blackouts activos por día (un día está en blackout si hay un evento futuro cuyo blackout incluye ese día)
  const blackoutSet = useMemo(() => {
    const set = new Set<string>()
    for (const ev of events) {
      if (ev.status === 'cancelled' || ev.status === 'sent') continue
      const eventISO = ev.event_date
      for (let i = 1; i <= ev.blackout_days; i++) {
        // i días antes del evento
        const date = new Date(`${eventISO}T00:00:00Z`)
        date.setUTCDate(date.getUTCDate() - i)
        const iso = date.toISOString().split('T')[0]
        set.add(iso)
      }
    }
    return set
  }, [events])

  const todayISO = toISO(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate(),
  )

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header de días de semana */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Grid de días */}
      <div className="grid grid-cols-7 auto-rows-fr">
        {grid.map((cell, idx) => {
          if (cell.day === null) {
            return <div key={idx} className="min-h-[96px] border-b border-r bg-muted/10" />
          }

          const iso = cell.iso!
          const dayEvents = eventsByDate[iso] ?? []
          const inBlackout = blackoutSet.has(iso)
          const today = isToday(year, month, cell.day)
          const isPast = diffDays(iso, todayISO) < 0

          return (
            <div
              key={idx}
              onClick={() => onDayClick?.(iso)}
              className={`
                min-h-[96px] border-b border-r p-1.5 cursor-pointer transition-colors
                ${inBlackout ? 'bg-orange-50/60' : 'bg-card'}
                ${isPast ? 'opacity-70' : ''}
                hover:bg-muted/30
              `}
              title={inBlackout ? 'Blackout pre-evento activo' : undefined}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`
                    inline-flex items-center justify-center text-xs font-medium
                    ${today
                      ? 'h-6 w-6 rounded-full bg-primary text-primary-foreground'
                      : 'h-6 w-6 rounded-full text-foreground'}
                  `}
                >
                  {cell.day}
                </span>
                {inBlackout && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-orange-400"
                    title="Día en blackout pre-evento"
                  />
                )}
              </div>

              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick?.(ev)
                    }}
                    className={`
                      w-full text-left text-[11px] leading-tight rounded border px-1.5 py-1 truncate transition-colors
                      ${TYPE_BG_COLOR[ev.event_type]}
                      ${ev.send_mode === 'auto' ? 'font-medium' : ''}
                    `}
                    title={ev.title}
                  >
                    <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${TYPE_DOT_COLOR[ev.event_type]}`} />
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">
                    +{dayEvents.length - 3} más
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Leyenda */}
      <div className="border-t bg-muted/20 px-3 py-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <LegendItem color="bg-purple-500" label="Festival" />
        <LegendItem color="bg-pink-500" label="Promo" />
        <LegendItem color="bg-amber-500" label="Activación" />
        <LegendItem color="bg-emerald-500" label="Aniversario" />
        <LegendItem color="bg-slate-500" label="Otro" />
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="h-2 w-2 rounded-full bg-orange-400" />
          <span>Día en blackout pre-evento</span>
        </div>
      </div>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  )
}
