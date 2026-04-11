'use client'

import { useState, useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Send, AlertTriangle, X } from 'lucide-react'
import type { RiskGroup } from '@/types/analytics.types'

// Colores pasteles desaturados por nivel
const BUBBLE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  'En Riesgo':  { bg: 'rgba(252, 165, 165, 0.55)', border: 'rgba(239, 68, 68, 0.3)',  text: '#b91c1c' },
  'Perdidos':   { bg: 'rgba(253, 186, 116, 0.55)', border: 'rgba(249, 115, 22, 0.3)', text: '#c2410c' },
  'Críticos':   { bg: 'rgba(196, 181, 253, 0.55)', border: 'rgba(139, 92, 246, 0.3)', text: '#6d28d9' },
}

const FLOAT_DURATIONS = ['3.1s', '3.8s', '4.5s']

interface AtRiskBubblesProps {
  groups: RiskGroup[]
  loading: boolean
  isDemo: boolean
}

export function AtRiskBubbles({ groups, loading, isDemo }: AtRiskBubblesProps) {
  const [selected, setSelected] = useState<RiskGroup | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [poppedKey, setPoppedKey] = useState<string | null>(null)

  const maxCount = Math.max(...groups.map((g) => g.count), 1)
  const totalAtRisk = groups.reduce((sum, g) => sum + g.count, 0)

  const groupStats = useMemo(() => {
    return groups.map((g) => {
      const avgVisits = g.customers.length > 0
        ? Math.round(g.customers.reduce((s, c) => s + c.total_visits, 0) / g.customers.length)
        : 0
      const avgDays = g.customers.length > 0
        ? Math.round(g.customers.reduce((s, c) => s + c.daysInactive, 0) / g.customers.length)
        : 0
      return { ...g, avgVisits, avgDays }
    })
  }, [groups])

  const handleBubbleClick = (group: typeof groupStats[0], idx: number) => {
    if (group.count === 0) return
    // Trigger spring animation
    setPoppedKey(group.level)
    setTimeout(() => setPoppedKey(null), 500)
    setSelected(group)
  }

  const handleSendCampaign = async () => {
    if (!selected) return
    setSending(true)
    if (isDemo) {
      await new Promise((r) => setTimeout(r, 1500))
      setSent(true)
      setSending(false)
      return
    }
    try {
      await fetch('/api/dashboard/campaigns/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riskLevel: selected.level,
          daysRange: selected.daysRange,
          customerCount: selected.count,
        }),
      })
      setSent(true)
    } catch {
      // best effort
    } finally {
      setSending(false)
    }
  }

  const handleClose = () => {
    setSelected(null)
    setSent(false)
    setSending(false)
  }

  const bubbleStyle = (level: string) =>
    BUBBLE_STYLES[level] ?? { bg: 'rgba(156,163,175,0.45)', border: 'rgba(107,114,128,0.3)', text: '#374151' }

  return (
    <>
      <div className="dashboard-card p-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" strokeWidth={1.5} style={{ color: '#f59e0b' }} />
          <h3
            className="font-playfair text-lg font-bold"
            style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
          >
            Clientes en Riesgo
          </h3>
          <span
            className="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: 'rgba(245,158,11,0.1)', color: '#d97706' }}
          >
            {totalAtRisk}
          </span>
        </div>

        {loading ? (
          <Skeleton className="h-[280px] w-full rounded-xl" />
        ) : (
          <div className="flex items-end justify-center gap-10 py-8 min-h-[280px]">
            {groupStats.map((group, idx) => {
              const size = Math.max(72, (group.count / maxCount) * 200)
              const style = bubbleStyle(group.level)
              const isPopping = poppedKey === group.level
              const floatDuration = FLOAT_DURATIONS[idx % FLOAT_DURATIONS.length]

              return (
                <button
                  key={group.level}
                  onClick={() => handleBubbleClick(group, idx)}
                  className="flex flex-col items-center gap-4 focus:outline-none"
                  disabled={group.count === 0}
                >
                  <div
                    className={isPopping ? 'animate-bubble-pop' : 'bubble-float'}
                    style={{
                      '--float-duration': floatDuration,
                      animationDelay: `${idx * 0.6}s`,
                    } as React.CSSProperties}
                  >
                    <div
                      className="flex flex-col items-center justify-center rounded-full font-bold select-none"
                      style={{
                        width: `${size}px`,
                        height: `${size}px`,
                        background: group.count === 0 ? 'rgba(209,213,219,0.3)' : style.bg,
                        border: `2px solid ${group.count === 0 ? 'rgba(209,213,219,0.4)' : style.border}`,
                        opacity: group.count === 0 ? 0.4 : 1,
                        cursor: group.count > 0 ? 'pointer' : 'default',
                        transition: 'box-shadow 300ms ease',
                        boxShadow: group.count > 0
                          ? `0 8px 24px ${style.border}`
                          : 'none',
                      }}
                    >
                      <span
                        style={{
                          fontSize: `${Math.max(22, size / 3.5)}px`,
                          fontWeight: 700,
                          letterSpacing: '-0.04em',
                          color: style.text,
                          fontFamily: 'var(--font-inter)',
                        }}
                      >
                        {group.count}
                      </span>
                      {group.count > 0 && size >= 90 && (
                        <span
                          className="text-[10px] font-semibold uppercase"
                          style={{ color: style.text, opacity: 0.7, letterSpacing: '0.04em' }}
                        >
                          clientes
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-center space-y-0.5">
                    <p className="text-sm font-semibold" style={{ color: '#1a1c1d' }}>
                      {group.level}
                    </p>
                    <p className="text-xs" style={{ color: '#9ca3af' }}>
                      {group.daysRange}
                    </p>
                    {group.count > 0 && (
                      <p className="text-[10px]" style={{ color: '#d1d5db' }}>
                        ~{group.avgVisits} visitas · ~{group.avgDays}d
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <p className="text-center text-xs" style={{ color: '#d1d5db' }}>
          Toca una burbuja para ver los clientes y enviar campaña de reactivación
        </p>
      </div>

      {/* Popover / Dialog premium */}
      <Dialog open={!!selected} onOpenChange={handleClose}>
        <DialogContent
          className="border-none p-0 overflow-hidden"
          style={{ borderRadius: '20px', boxShadow: '0 24px 60px rgba(0,0,0,0.12)', maxWidth: '420px' }}
        >
          {/* Header del dialog con color de burbuja */}
          <div
            className="px-6 pt-6 pb-4"
            style={{
              background: selected ? bubbleStyle(selected.level).bg : 'transparent',
              borderBottom: `1px solid ${selected ? bubbleStyle(selected.level).border : 'transparent'}`,
            }}
          >
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle
                  className="font-playfair text-xl font-bold flex items-center gap-2"
                  style={{ color: selected ? bubbleStyle(selected.level).text : '#1a1c1d', letterSpacing: '-0.02em' }}
                >
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ background: selected ? bubbleStyle(selected.level).text : '#6b7280' }}
                  />
                  {selected?.level}
                </DialogTitle>
              </div>
              <DialogDescription className="text-sm mt-1" style={{ color: '#6b7280' }}>
                {selected?.description}
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Contenido */}
          <div className="px-6 py-4 space-y-4 bg-white">
            <div
              className="rounded-2xl p-4 space-y-2"
              style={{ background: '#F9F8F6' }}
            >
              <p className="text-sm" style={{ color: '#374151' }}>
                <span
                  className="font-bold text-base"
                  style={{ fontFamily: 'var(--font-inter)', letterSpacing: '-0.03em', color: '#1a1c1d' }}
                >
                  {selected?.count}
                </span>{' '}
                clientes con{' '}
                <span className="font-semibold">{selected?.daysRange}</span> sin visitar
              </p>

              {selected?.customers && selected.customers.length > 0 && (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {selected.customers.map((c) => (
                    <div
                      key={c.id}
                      className="flex justify-between items-center rounded-xl px-3 py-2 text-xs"
                      style={{ background: '#fff', color: '#6b7280' }}
                    >
                      <span className="font-medium" style={{ color: '#1a1c1d' }}>{c.name}</span>
                      <span>{c.daysInactive}d · {c.total_visits} vis.</span>
                    </div>
                  ))}
                  {selected.count > selected.customers.length && (
                    <p className="text-xs text-center" style={{ color: '#d1d5db' }}>
                      ...y {selected.count - selected.customers.length} más
                    </p>
                  )}
                </div>
              )}
            </div>

            {sent && (
              <div
                className="rounded-2xl px-4 py-3 text-sm font-medium text-center"
                style={{ background: 'rgba(16,185,129,0.08)', color: '#059669' }}
              >
                {isDemo ? '(Demo) Campaña simulada exitosamente ✓' : 'Campaña de reactivación enviada ✓'}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-white flex gap-3" style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
            <button
              onClick={handleClose}
              className="flex-1 h-11 rounded-xl text-sm font-medium transition-colors duration-200"
              style={{ background: '#F9F8F6', color: '#6b7280' }}
            >
              Cerrar
            </button>
            {!sent && (
              <button
                onClick={handleSendCampaign}
                disabled={sending}
                className="btn-premium flex-1 h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold"
                style={{ letterSpacing: '-0.01em' }}
              >
                <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
                {sending
                  ? 'Enviando...'
                  : `WhatsApp → ${selected?.count ?? 0}`}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
