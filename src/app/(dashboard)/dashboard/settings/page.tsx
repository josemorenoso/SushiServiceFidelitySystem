'use client'

import { useEffect, useState, useCallback } from 'react'
import { Settings, DollarSign, Save, Loader2, CheckCircle, Crown, CalendarHeart, Mail, RefreshCw } from 'lucide-react'

interface TwilioTemplate {
  sid: string
  friendly_name: string
  approval_status: string
  body: string
}

function SaveButton({ saving, saved, onClick, disabled }: { saving: boolean; saved: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02]"
      style={{
        background: saved
          ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
          : 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)',
        boxShadow: saved
          ? '0 4px 12px rgba(16, 185, 129, 0.25)'
          : '0 4px 12px rgba(230, 57, 70, 0.25)',
      }}
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
      {saved ? 'Guardado' : 'Guardar'}
    </button>
  )
}

const DEFAULT_BLACK_BENEFITS = [
  '15% descuento permanente',
  'Eventos exclusivos',
  'Prioridad en reservas',
  'Sorpresas especiales',
]

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<Record<string, string>>({})

  // Ticket promedio
  const [avgTicket, setAvgTicket] = useState('')
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketSaved, setTicketSaved] = useState(false)
  const [ticketError, setTicketError] = useState<string | null>(null)

  // Black benefits
  const [benefits, setBenefits] = useState<string[]>(DEFAULT_BLACK_BENEFITS)
  const [benefitsSaving, setBenefitsSaving] = useState(false)
  const [benefitsSaved, setBenefitsSaved] = useState(false)

  // Cron templates
  const [templates, setTemplates] = useState<TwilioTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [birthdayTemplateSid, setBirthdayTemplateSid] = useState('')
  const [reactivationTemplateSid, setReactivationTemplateSid] = useState('')
  const [cronSaving, setCronSaving] = useState(false)
  const [cronSaved, setCronSaved] = useState(false)

  const saveSetting = useCallback(async (key: string, value: string) => {
    const res = await fetch('/api/dashboard/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error ?? 'Error guardando')
    }
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/settings').then((r) => r.json()),
      fetch('/api/dashboard/templates').then((r) => r.json()),
    ])
      .then(([settingsData, templatesData]) => {
        setSettings(settingsData)
        if (settingsData.avg_ticket) setAvgTicket(settingsData.avg_ticket)
        if (settingsData.black_benefits) {
          try { setBenefits(JSON.parse(settingsData.black_benefits)) } catch { /* keep default */ }
        }
        if (settingsData.birthday_template_sid) setBirthdayTemplateSid(settingsData.birthday_template_sid)
        if (settingsData.reactivation_template_sid) setReactivationTemplateSid(settingsData.reactivation_template_sid)

        const allTemplates: TwilioTemplate[] = templatesData.templates ?? []
        setTemplates(allTemplates)
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false)
        setTemplatesLoading(false)
      })
  }, [])

  const handleSaveTicket = async () => {
    setTicketSaving(true)
    setTicketSaved(false)
    setTicketError(null)
    try {
      await saveSetting('avg_ticket', avgTicket)
      setTicketSaved(true)
      setTimeout(() => setTicketSaved(false), 3000)
    } catch (err) {
      setTicketError(err instanceof Error ? err.message : 'Error')
    } finally {
      setTicketSaving(false)
    }
  }

  const handleSaveBenefits = async () => {
    setBenefitsSaving(true)
    setBenefitsSaved(false)
    try {
      await saveSetting('black_benefits', JSON.stringify(benefits.filter((b) => b.trim())))
      setBenefitsSaved(true)
      setTimeout(() => setBenefitsSaved(false), 3000)
    } catch { /* silent */ } finally {
      setBenefitsSaving(false)
    }
  }

  const handleSaveCron = async () => {
    setCronSaving(true)
    setCronSaved(false)
    try {
      await Promise.all([
        saveSetting('birthday_template_sid', birthdayTemplateSid),
        saveSetting('reactivation_template_sid', reactivationTemplateSid),
      ])
      setCronSaved(true)
      setTimeout(() => setCronSaved(false), 3000)
    } catch { /* silent */ } finally {
      setCronSaving(false)
    }
  }

  const updateBenefit = (index: number, value: string) => {
    const next = [...benefits]
    next[index] = value
    setBenefits(next)
  }

  const addBenefit = () => setBenefits([...benefits, ''])
  const removeBenefit = (index: number) => setBenefits(benefits.filter((_, i) => i !== index))

  const formattedValue = avgTicket
    ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(avgTicket))
    : ''

  const approvedTemplates = templates.filter((t) => t.approval_status === 'approved')

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6" strokeWidth={1.5} style={{ color: '#6b7280' }} />
        <h1 className="font-playfair text-3xl font-bold" style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}>
          Ajustes
        </h1>
      </div>

      {/* ─── TICKET PROMEDIO ─── */}
      <div className="dashboard-card p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
            <DollarSign className="h-5 w-5" strokeWidth={1.5} style={{ color: '#10b981' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>Ticket Promedio</h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Valor promedio de consumo por cliente (COP). Se usa para calcular el ROI.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: '#9ca3af' }}>$</span>
            <input
              type="number"
              value={avgTicket}
              onChange={(e) => setAvgTicket(e.target.value)}
              disabled={loading}
              placeholder="35000"
              className="input-premium w-full pl-7 pr-4 py-2.5 rounded-xl text-sm font-medium"
              style={{ border: '1px solid rgba(226,190,192,0.35)', background: 'rgba(255,255,255,0.8)', color: '#1a1c1d' }}
            />
          </div>
          <SaveButton saving={ticketSaving} saved={ticketSaved} onClick={handleSaveTicket} disabled={ticketSaving || loading} />
        </div>

        {formattedValue && <p className="text-sm mt-3 font-medium" style={{ color: '#10b981' }}>Valor actual: {formattedValue}</p>}
        {ticketError && <p className="text-xs mt-2 font-medium" style={{ color: '#ef4444' }}>{ticketError}</p>}
        <p className="text-xs mt-4 italic" style={{ color: '#b0b0b0' }}>Ej: 60000 para $60,000 COP. ROI = reactivados × ticket.</p>
      </div>

      {/* ─── BENEFICIOS BLACK ─── */}
      <div className="dashboard-card p-6 max-w-2xl" style={{ border: '1px solid rgba(255, 215, 0, 0.15)' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #FFD700 0%, #B8860B 100%)' }}>
            <Crown className="h-5 w-5" strokeWidth={1.5} style={{ color: '#0a0a0a' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>Beneficios Black</h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Edita los beneficios que se muestran para clientes nivel Black (10+ visitas).</p>
          </div>
        </div>

        <div className="space-y-2">
          {benefits.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm" style={{ color: '#FFD700' }}>★</span>
              <input
                type="text"
                value={b}
                onChange={(e) => updateBenefit(i, e.target.value)}
                placeholder="Ej: 15% descuento permanente"
                className="input-premium flex-1 rounded-xl py-2 px-3 text-sm"
                style={{ border: '1px solid rgba(226,190,192,0.35)', background: 'rgba(255,255,255,0.8)', color: '#1a1c1d' }}
              />
              {benefits.length > 1 && (
                <button onClick={() => removeBenefit(i)} className="text-xs px-2 py-1 rounded-lg hover:bg-red-50" style={{ color: '#ef4444' }}>✕</button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={addBenefit}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
            style={{ color: '#6b7280', borderColor: 'rgba(226,190,192,0.35)' }}
          >
            + Agregar beneficio
          </button>
          <SaveButton saving={benefitsSaving} saved={benefitsSaved} onClick={handleSaveBenefits} disabled={benefitsSaving} />
        </div>
      </div>

      {/* ─── PLANTILLAS CAMPAÑAS AUTOMÁTICAS ─── */}
      <div className="dashboard-card p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(99, 102, 241, 0.15)' }}>
            <Mail className="h-5 w-5" strokeWidth={1.5} style={{ color: '#6366f1' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>Campañas Automáticas</h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Selecciona qué plantilla aprobada usar para cumpleaños y reactivación.</p>
          </div>
        </div>

        {templatesLoading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#9ca3af' }} />
            <span className="text-sm" style={{ color: '#9ca3af' }}>Cargando plantillas...</span>
          </div>
        ) : approvedTemplates.length === 0 ? (
          <div className="rounded-lg p-4 text-center" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <p className="text-sm font-medium" style={{ color: '#D97706' }}>No hay plantillas aprobadas</p>
            <p className="text-xs mt-1" style={{ color: '#92400E' }}>
              Ve a Dashboard &gt; Plantillas, crea al menos una para cumpleaños y una para reactivación, y espera aprobación de Meta.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Birthday template */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>
                <CalendarHeart className="h-3.5 w-3.5" style={{ color: '#6366f1' }} />
                Plantilla de Cumpleaños
              </label>
              <select
                value={birthdayTemplateSid}
                onChange={(e) => setBirthdayTemplateSid(e.target.value)}
                className="input-premium w-full rounded-xl py-2.5 px-3 text-sm"
                style={{ border: '1px solid rgba(226,190,192,0.35)', background: 'rgba(255,255,255,0.8)', color: '#1a1c1d' }}
              >
                <option value="">— Sin plantilla (usa texto libre) —</option>
                {approvedTemplates.map((t) => (
                  <option key={t.sid} value={t.sid}>{t.friendly_name}</option>
                ))}
              </select>
              {birthdayTemplateSid && (
                <p className="text-xs italic" style={{ color: '#9ca3af' }}>
                  {approvedTemplates.find((t) => t.sid === birthdayTemplateSid)?.body?.slice(0, 120)}...
                </p>
              )}
            </div>

            {/* Reactivation template */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>
                <RefreshCw className="h-3.5 w-3.5" style={{ color: '#6366f1' }} />
                Plantilla de Reactivación
              </label>
              <select
                value={reactivationTemplateSid}
                onChange={(e) => setReactivationTemplateSid(e.target.value)}
                className="input-premium w-full rounded-xl py-2.5 px-3 text-sm"
                style={{ border: '1px solid rgba(226,190,192,0.35)', background: 'rgba(255,255,255,0.8)', color: '#1a1c1d' }}
              >
                <option value="">— Sin plantilla (usa texto libre) —</option>
                {approvedTemplates.map((t) => (
                  <option key={t.sid} value={t.sid}>{t.friendly_name}</option>
                ))}
              </select>
              {reactivationTemplateSid && (
                <p className="text-xs italic" style={{ color: '#9ca3af' }}>
                  {approvedTemplates.find((t) => t.sid === reactivationTemplateSid)?.body?.slice(0, 120)}...
                </p>
              )}
            </div>

            <SaveButton saving={cronSaving} saved={cronSaved} onClick={handleSaveCron} disabled={cronSaving} />
          </div>
        )}

        <p className="text-xs mt-4 italic" style={{ color: '#b0b0b0' }}>
          Si seleccionas una plantilla, el cron la enviará vía Twilio Content API (funciona fuera de 24h). Sin plantilla, usa texto libre (solo funciona dentro de la ventana de 24h).
        </p>
      </div>
    </div>
  )
}
