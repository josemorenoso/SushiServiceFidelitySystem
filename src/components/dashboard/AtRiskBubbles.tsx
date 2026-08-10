'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Send, AlertTriangle, FileText, RefreshCw } from 'lucide-react'
import { RISK_LEVELS } from '@/constants/rankings'
import type { RiskGroup } from '@/types/analytics.types'

const FLOAT_DURATIONS = ['3.1s', '3.8s', '4.5s', '4.1s']

interface ApprovedTemplate {
  sid: string
  friendly_name: string
  body: string
  approval_status: string
  status: string
  has_media?: boolean
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Rango de días del nivel según RISK_LEVELS (fuente de verdad compartida con analytics). */
function daysRangeForLevel(level: string): { minDays: number; maxDays: number | null } {
  const def = RISK_LEVELS.find((r) => r.name === level)
  if (!def) return { minDays: 7, maxDays: null }
  return { minDays: def.minDays, maxDays: def.maxDays === Infinity ? null : def.maxDays }
}

interface AtRiskBubblesProps {
  groups: RiskGroup[]
  loading: boolean
  isDemo: boolean
}

export function AtRiskBubbles({ groups, loading, isDemo }: AtRiskBubblesProps) {
  const [selected, setSelected] = useState<RiskGroup | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendSummary, setSendSummary] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [poppedKey, setPoppedKey] = useState<string | null>(null)

  const [templates, setTemplates] = useState<ApprovedTemplate[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<ApprovedTemplate | null>(null)
  const [eligibleCount, setEligibleCount] = useState<number | null>(null)

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

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    try {
      const res = await fetch('/api/dashboard/templates')
      const data = await res.json()
      // Solo texto aprobado (las twilio/media son de eventos y exigen {{6}}).
      const approved = (data.templates ?? []).filter(
        (t: ApprovedTemplate) =>
          (t.approval_status || t.status)?.toLowerCase() === 'approved' && !t.has_media
      )
      setTemplates(approved)
    } catch {
      setTemplates([])
    } finally {
      setLoadingTemplates(false)
      setTemplatesLoaded(true)
    }
  }, [])

  // Al abrir el diálogo (modo real): cargar plantillas y calcular elegibles reales
  // (después de frequency cap, recovery zone y opt-out) para el rango de días del nivel.
  useEffect(() => {
    if (!selected || isDemo) return
    if (!templatesLoaded) fetchTemplates()

    const { minDays, maxDays } = daysRangeForLevel(selected.level)
    const params = new URLSearchParams({ minDays: String(minDays) })
    if (maxDays !== null) params.set('maxDays', String(maxDays))

    let active = true
    setEligibleCount(null)
    fetch(`/api/dashboard/campaigns/estimate?${params}`)
      .then((res) => res.json())
      .then((data) => { if (active) setEligibleCount(data.count ?? 0) })
      .catch(() => { if (active) setEligibleCount(null) })
    return () => { active = false }
  }, [selected, isDemo, templatesLoaded, fetchTemplates])

  const handleBubbleClick = (group: typeof groupStats[0]) => {
    if (group.count === 0) return
    setPoppedKey(group.level)
    setTimeout(() => setPoppedKey(null), 500)
    setSelected(group)
  }

  const handleSendCampaign = async () => {
    if (!selected) return
    setSending(true)
    setSendError(null)
    setSendSummary(null)
    if (isDemo) {
      await new Promise((r) => setTimeout(r, 1500))
      setSent(true)
      setSending(false)
      return
    }
    if (!selectedTemplate) {
      setSendError('Selecciona una plantilla aprobada para enviar.')
      setSending(false)
      return
    }
    try {
      const { minDays, maxDays } = daysRangeForLevel(selected.level)
      const res = await fetch('/api/dashboard/campaigns/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Reactivación · ${selected.level} (${selected.daysRange})`,
          filters: {
            city: '',
            minVisits: '',
            maxVisits: '',
            minAge: '',
            maxAge: '',
            source: 'all',
            minDays: String(minDays),
            maxDays: maxDays !== null ? String(maxDays) : '',
          },
          templateSid: selectedTemplate.sid,
          messageTemplate: selectedTemplate.body,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.reason === 'insufficient_balance') {
          setSendError(
            `Saldo insuficiente: se necesitan ${data.recipients} mensajes y el saldo alcanza para ${data.messagesAvailable}. Recarga tu billetera.`
          )
        } else {
          setSendError(data.error || 'Error enviando la campaña')
        }
        return
      }
      const skipped =
        (data.totalSkippedFrequencyCap ?? 0) +
        (data.totalSkippedRecoveryZone ?? 0) +
        (data.totalSkippedMonthlyCap ?? 0)
      setSendSummary(
        `Enviados: ${data.totalSent}` +
        (data.totalFailed ? ` · Fallidos: ${data.totalFailed}` : '') +
        (skipped ? ` · Protegidos por reglas anti-spam: ${skipped}` : '')
      )
      setSent(true)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Error de red enviando la campaña')
    } finally {
      setSending(false)
    }
  }

  const handleClose = () => {
    setSelected(null)
    setSent(false)
    setSending(false)
    setSendSummary(null)
    setSendError(null)
    setSelectedTemplate(null)
    setEligibleCount(null)
  }

  const bubbleStyle = (group: RiskGroup) => ({
    bg: hexToRgba(group.color, 0.28),
    border: hexToRgba(group.color, 0.35),
    text: group.color,
  })

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
          <div className="flex flex-wrap items-end justify-center gap-x-10 gap-y-6 py-8 min-h-[280px]">
            {groupStats.map((group, idx) => {
              const size = Math.max(72, (group.count / maxCount) * 200)
              const style = bubbleStyle(group)
              const isPopping = poppedKey === group.level
              const floatDuration = FLOAT_DURATIONS[idx % FLOAT_DURATIONS.length]

              return (
                <button
                  key={group.level}
                  onClick={() => handleBubbleClick(group)}
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

      {/* Dialog premium con selector de plantilla y envío real */}
      <Dialog open={!!selected} onOpenChange={handleClose}>
        <DialogContent
          className="border-none p-0 overflow-hidden"
          style={{ borderRadius: '20px', boxShadow: '0 24px 60px rgba(0,0,0,0.12)', maxWidth: '460px' }}
        >
          {/* Header del dialog con color de burbuja */}
          <div
            className="px-6 pt-6 pb-4"
            style={{
              background: selected ? bubbleStyle(selected).bg : 'transparent',
              borderBottom: `1px solid ${selected ? bubbleStyle(selected).border : 'transparent'}`,
            }}
          >
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle
                  className="font-playfair text-xl font-bold flex items-center gap-2"
                  style={{ color: selected ? bubbleStyle(selected).text : '#1a1c1d', letterSpacing: '-0.02em' }}
                >
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ background: selected ? bubbleStyle(selected).text : '#6b7280' }}
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
          <div className="px-6 py-4 space-y-4 bg-white max-h-[60vh] overflow-y-auto">
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

              {!isDemo && eligibleCount !== null && selected && eligibleCount < selected.count && (
                <p className="text-xs" style={{ color: '#9ca3af' }}>
                  Elegibles hoy: <strong style={{ color: '#374151' }}>{eligibleCount}</strong> — el resto está
                  protegido por las reglas anti-spam (mensaje reciente o reservado para la reactivación automática).
                </p>
              )}

              {selected?.customers && selected.customers.length > 0 && (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
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

            {/* Selector de plantilla (solo modo real, antes de enviar) */}
            {!isDemo && !sent && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#374151' }}>
                    <FileText className="h-3.5 w-3.5" />
                    Plantilla del mensaje
                  </p>
                  <button
                    onClick={fetchTemplates}
                    disabled={loadingTemplates}
                    className="text-xs flex items-center gap-1 rounded-md px-2 py-1 transition-colors"
                    style={{ color: '#6b7280' }}
                  >
                    <RefreshCw className={`h-3 w-3 ${loadingTemplates ? 'animate-spin' : ''}`} />
                    Sincronizar
                  </button>
                </div>

                {loadingTemplates && (
                  <p className="text-xs" style={{ color: '#9ca3af' }}>Cargando plantillas…</p>
                )}

                {!loadingTemplates && templatesLoaded && templates.length === 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    No hay plantillas aprobadas por WhatsApp. Créalas en <strong>Dashboard → Plantillas</strong> y
                    espera la aprobación de Meta para poder enviar.
                  </div>
                )}

                {templates.length > 0 && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {templates.map((t) => (
                      <button
                        key={t.sid}
                        onClick={() => setSelectedTemplate(t)}
                        className="w-full text-left rounded-xl border p-2.5 text-xs transition-all"
                        style={{
                          borderColor: selectedTemplate?.sid === t.sid ? '#1a1c1d' : 'rgba(0,0,0,0.08)',
                          background: selectedTemplate?.sid === t.sid ? '#F9F8F6' : '#fff',
                        }}
                      >
                        <p className="font-medium" style={{ color: '#1a1c1d' }}>{t.friendly_name}</p>
                        <p className="line-clamp-2 italic mt-0.5" style={{ color: '#9ca3af' }}>
                          &quot;{t.body}&quot;
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {sent && (
              <div
                className="rounded-2xl px-4 py-3 text-sm font-medium text-center"
                style={{ background: 'rgba(16,185,129,0.08)', color: '#059669' }}
              >
                {isDemo
                  ? '(Demo) Campaña simulada exitosamente ✓'
                  : `Campaña de reactivación enviada ✓${sendSummary ? ` — ${sendSummary}` : ''}`}
              </div>
            )}

            {sendError && (
              <div
                className="rounded-2xl px-4 py-3 text-sm font-medium"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#b91c1c' }}
              >
                {sendError}
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
                disabled={sending || (!isDemo && !selectedTemplate)}
                className="btn-premium flex-1 h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ letterSpacing: '-0.01em' }}
              >
                <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
                {sending
                  ? 'Enviando...'
                  : `WhatsApp → ${!isDemo && eligibleCount !== null ? eligibleCount : selected?.count ?? 0}`}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
