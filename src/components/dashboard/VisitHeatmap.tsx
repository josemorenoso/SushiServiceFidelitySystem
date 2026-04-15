'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { useMemo } from 'react'
import type { HeatmapCell } from '@/types/analytics.types'

interface VisitHeatmapProps {
  data: HeatmapCell[]
  loading: boolean
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const HOURS_TO_SHOW = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]

function getHourLabel(h: number): string {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

function getColor(count: number, max: number): string {
  if (max === 0 || count === 0) return 'rgba(0,0,0,0.03)'
  const intensity = count / max
  if (intensity > 0.75) return 'rgba(220, 38, 38, 0.85)'
  if (intensity > 0.5) return 'rgba(249, 115, 22, 0.7)'
  if (intensity > 0.25) return 'rgba(251, 191, 36, 0.55)'
  return 'rgba(16, 185, 129, 0.3)'
}

export function VisitHeatmap({ data, loading }: VisitHeatmapProps) {
  const { filteredData, maxCount } = useMemo(() => {
    const hoursSet = new Set(HOURS_TO_SHOW)
    const filtered = data.filter((c) => hoursSet.has(c.hour))
    const max = Math.max(...filtered.map((c) => c.count), 0)
    return { filteredData: filtered, maxCount: max }
  }, [data])

  const grid = useMemo(() => {
    const map: Record<string, number> = {}
    for (const cell of filteredData) {
      map[`${cell.day}-${cell.hour}`] = cell.count
    }
    return map
  }, [filteredData])

  return (
    <div className="dashboard-card p-6">
      <div className="mb-4">
        <h3
          className="font-playfair text-lg font-bold"
          style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
        >
          Mapa de Calor — Visitas
        </h3>
        <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
          Días y horas con más afluencia de clientes (últimos 6 meses)
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-[260px] w-full rounded-xl" />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Header: horas */}
            <div className="flex">
              <div className="w-10 flex-shrink-0" />
              {HOURS_TO_SHOW.map((h) => (
                <div
                  key={h}
                  className="flex-1 text-center text-[10px] font-medium pb-1"
                  style={{ color: '#9ca3af' }}
                >
                  {getHourLabel(h)}
                </div>
              ))}
            </div>

            {/* Rows: días */}
            {DAY_LABELS.map((dayLabel, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-0">
                <div
                  className="w-10 flex-shrink-0 text-[11px] font-semibold pr-2 text-right"
                  style={{ color: '#6b7280' }}
                >
                  {dayLabel}
                </div>
                {HOURS_TO_SHOW.map((h) => {
                  const count = grid[`${dayIdx}-${h}`] ?? 0
                  return (
                    <div
                      key={h}
                      className="flex-1 aspect-square m-[1px] rounded-md cursor-default transition-transform hover:scale-110 relative group"
                      style={{
                        background: getColor(count, maxCount),
                        minHeight: '24px',
                      }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20">
                        <div
                          className="rounded-lg px-2 py-1 text-[10px] font-medium whitespace-nowrap"
                          style={{
                            background: '#1a1c1d',
                            color: '#fff',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          }}
                        >
                          {dayLabel} {getHourLabel(h)}: {count} visitas
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

            {/* Legend */}
            <div className="flex items-center justify-end gap-2 mt-3">
              <span className="text-[10px]" style={{ color: '#9ca3af' }}>Menos</span>
              {[0.03, 0.3, 0.55, 0.7, 0.85].map((opacity, i) => (
                <div
                  key={i}
                  className="h-3 w-3 rounded-sm"
                  style={{
                    background: i === 0
                      ? 'rgba(0,0,0,0.03)'
                      : i === 1
                        ? 'rgba(16, 185, 129, 0.3)'
                        : i === 2
                          ? 'rgba(251, 191, 36, 0.55)'
                          : i === 3
                            ? 'rgba(249, 115, 22, 0.7)'
                            : 'rgba(220, 38, 38, 0.85)',
                  }}
                />
              ))}
              <span className="text-[10px]" style={{ color: '#9ca3af' }}>Más</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
