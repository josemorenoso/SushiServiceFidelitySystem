'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Info } from 'lucide-react'
import { CalendarMonthView } from '@/components/dashboard/Calendar/CalendarMonthView'
import { EventCreateDialog } from '@/components/dashboard/Calendar/EventCreateDialog'
import { EventDetailDrawer } from '@/components/dashboard/Calendar/EventDetailDrawer'
import type { RestaurantEvent } from '@/types/database.types'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export default function CalendarPage() {
  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())     // 0-11

  const [events, setEvents] = useState<RestaurantEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createDefaultDate, setCreateDefaultDate] = useState<string | undefined>(undefined)

  const [drawerEvent, setDrawerEvent] = useState<RestaurantEvent | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Rango del mes en formato YYYY-MM-DD (incluyendo padding de la grilla por buena medida)
  const { fromISO, toISO } = useMemo(() => {
    // 1 semana de padding antes y después para capturar eventos del mes vecino visible
    const start = new Date(year, month, 1)
    start.setDate(start.getDate() - 7)
    const end = new Date(year, month + 1, 0)
    end.setDate(end.getDate() + 7)
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { fromISO: fmt(start), toISO: fmt(end) }
  }, [year, month])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/dashboard/calendar/events?from=${fromISO}&to=${toISO}`,
        { cache: 'no-store' }
      )
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error cargando eventos')
        setEvents([])
        return
      }
      setEvents(Array.isArray(data.events) ? data.events : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [fromISO, toISO])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  function goPrev() {
    if (month === 0) {
      setYear(year - 1)
      setMonth(11)
    } else {
      setMonth(month - 1)
    }
  }

  function goNext() {
    if (month === 11) {
      setYear(year + 1)
      setMonth(0)
    } else {
      setMonth(month + 1)
    }
  }

  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  function handleDayClick(dateISO: string) {
    setCreateDefaultDate(dateISO)
    setCreateOpen(true)
  }

  function handleEventClick(ev: RestaurantEvent) {
    setDrawerEvent(ev)
    setDrawerOpen(true)
  }

  // Stats del mes visible
  const monthStats = useMemo(() => {
    const inMonth = events.filter((e) => {
      const [y, m] = e.event_date.split('-').map(Number)
      return y === year && m === month + 1 && e.status !== 'cancelled'
    })
    const planned = inMonth.filter((e) => e.status === 'planned').length
    const scheduled = inMonth.filter((e) => e.status === 'scheduled').length
    const sent = inMonth.filter((e) => e.status === 'sent').length
    return { total: inMonth.length, planned, scheduled, sent }
  }, [events, year, month])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          Calendario
        </h1>
        <Button
          onClick={() => {
            setCreateDefaultDate(undefined)
            setCreateOpen(true)
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Crear evento
        </Button>
      </div>

      {/* Nota informativa */}
      <div className="rounded-lg border bg-blue-50/50 border-blue-200 p-3 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-900">
          <p className="font-medium">Planifica el mes aquí.</p>
          <p className="text-blue-800/90 text-xs mt-0.5">
            Los eventos en modo <strong>Recordatorio</strong> quedan visibles para ti.
            Los de <strong>Auto-envío</strong> se dispararán automáticamente cuando el path de plantillas con media esté aprobado por Meta.
          </p>
        </div>
      </div>

      {/* Navegación + stats */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-base min-w-[180px] text-center">
                {MONTH_NAMES[month]} {year}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={goNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={goToday}>
                Hoy
              </Button>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <StatBadge label="Eventos" value={monthStats.total} />
              <StatBadge label="Planeados" value={monthStats.planned} />
              <StatBadge label="Programados" value={monthStats.scheduled} />
              <StatBadge label="Enviados" value={monthStats.sent} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-3 rounded-lg bg-destructive/10 border border-destructive/30 p-2.5 text-sm text-destructive">
              {error}
            </div>
          )}
          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : (
            <CalendarMonthView
              year={year}
              month={month}
              events={events}
              onEventClick={handleEventClick}
              onDayClick={handleDayClick}
            />
          )}
        </CardContent>
      </Card>

      <EventCreateDialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o)
          if (!o) setCreateDefaultDate(undefined)
        }}
        defaultDate={createDefaultDate}
        onCreated={loadEvents}
      />

      <EventDetailDrawer
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o)
          if (!o) setDrawerEvent(null)
        }}
        event={drawerEvent}
        onUpdated={loadEvents}
      />
    </div>
  )
}

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center px-2.5">
      <span className="text-lg font-bold leading-none">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</span>
    </div>
  )
}
