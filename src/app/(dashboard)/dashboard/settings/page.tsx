'use client'

import { useEffect, useState, useCallback } from 'react'
import { Settings, DollarSign, Save, Loader2, CheckCircle, Crown, CalendarHeart, Mail, RefreshCw, MessageCircle, Gift, UserPlus, X, Plus, Zap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface TwilioTemplate {
  sid: string
  friendly_name: string
  approval_status: string
  body: string
}

interface RewardOption {
  id: string
  visit_milestone: number | null
  title: string
  is_active: boolean
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

interface TemplateSelectorProps {
  label: string
  icon: React.ReactNode
  hint: string
  value: string
  onChange: (sid: string) => void
  templates: TwilioTemplate[]
}

function TemplateSelector({ label, icon, hint, value, onChange, templates }: TemplateSelectorProps) {
  const selected = templates.find((t) => t.sid === value)
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>
        {icon}
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
      >
        <option value="">— Sin plantilla (NO se enviará mensaje) —</option>
        {templates.map((t) => (
          <option key={t.sid} value={t.sid}>{t.friendly_name}</option>
        ))}
      </select>
      <p className="text-[10px]" style={{ color: '#b0b0b0' }}>{hint}</p>
      {selected && (
        <p className="text-xs italic" style={{ color: '#9ca3af' }}>
          {selected.body?.slice(0, 120)}{(selected.body?.length ?? 0) > 120 ? '...' : ''}
        </p>
      )}
    </div>
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

  // Templates (ALL message types)
  const [templates, setTemplates] = useState<TwilioTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [rewards, setRewards] = useState<RewardOption[]>([])
  const [welcomeTemplateSid, setWelcomeTemplateSid] = useState('')
  const [welcomeBackNearTemplateSid, setWelcomeBackNearTemplateSid] = useState('')
  const [welcomeBackFarTemplateSid, setWelcomeBackFarTemplateSid] = useState('')
  const [rewardTemplateSid, setRewardTemplateSid] = useState('')
  const [birthdayTemplateSid, setBirthdayTemplateSid] = useState('')
  const [reactivationNoRewardSid, setReactivationNoRewardSid] = useState('')
  const [reactivationWithRewardSid, setReactivationWithRewardSid] = useState('')
  const [reactivationRewardId, setReactivationRewardId] = useState('')
  const [templatesSaving, setTemplatesSaving] = useState(false)
  const [templatesSaved, setTemplatesSaved] = useState(false)

  // Points system config
  const [pointsMin, setPointsMin] = useState('60')
  const [pointsMax, setPointsMax] = useState('90')
  const [welcomeMin, setWelcomeMin] = useState('75')
  const [welcomeMax, setWelcomeMax] = useState('90')
  const [shortfallMin, setShortfallMin] = useState('5')
  const [shortfallMax, setShortfallMax] = useState('30')
  const [pityThreshold, setPityThreshold] = useState('2')
  const [pointsEnabled, setPointsEnabled] = useState(true)
  const [pointsSaving, setPointsSaving] = useState(false)
  const [pointsSaved, setPointsSaved] = useState(false)

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
      fetch('/api/dashboard/rewards').then((r) => r.json()),
    ])
      .then(([settingsData, templatesData, rewardsData]) => {
        setSettings(settingsData)
        if (settingsData.avg_ticket) setAvgTicket(settingsData.avg_ticket)
        if (settingsData.black_benefits) {
          try { setBenefits(JSON.parse(settingsData.black_benefits)) } catch { /* keep default */ }
        }
        if (settingsData.welcome_template_sid) setWelcomeTemplateSid(settingsData.welcome_template_sid)
        // near/far: si no hay valor, intenta usar el legacy welcome_back_template_sid como default
        const legacyBack = settingsData.welcome_back_template_sid ?? ''
        setWelcomeBackNearTemplateSid(settingsData.welcome_back_near_template_sid ?? legacyBack)
        setWelcomeBackFarTemplateSid(settingsData.welcome_back_far_template_sid ?? legacyBack)
        if (settingsData.reward_template_sid) setRewardTemplateSid(settingsData.reward_template_sid)
        if (settingsData.birthday_template_sid) setBirthdayTemplateSid(settingsData.birthday_template_sid)
        // reactivación: legacy reactivation_template_sid migra a reactivation_no_reward por defecto
        const legacyReact = settingsData.reactivation_template_sid ?? ''
        setReactivationNoRewardSid(settingsData.reactivation_no_reward_template_sid ?? legacyReact)
        setReactivationWithRewardSid(settingsData.reactivation_with_reward_template_sid ?? '')
        setReactivationRewardId(settingsData.reactivation_reward_id ?? '')

        const allTemplates: TwilioTemplate[] = templatesData.templates ?? []
        setTemplates(allTemplates)

        const allRewards: RewardOption[] = Array.isArray(rewardsData) ? rewardsData : []
        setRewards(allRewards.filter((r) => r.is_active))

        // Points system config
        if (settingsData.points_per_visit_min) setPointsMin(settingsData.points_per_visit_min)
        if (settingsData.points_per_visit_max) setPointsMax(settingsData.points_per_visit_max)
        if (settingsData.welcome_bonus_points_min) setWelcomeMin(settingsData.welcome_bonus_points_min)
        if (settingsData.welcome_bonus_points_max) setWelcomeMax(settingsData.welcome_bonus_points_max)
        if (settingsData.shortfall_min) setShortfallMin(settingsData.shortfall_min)
        if (settingsData.shortfall_max) setShortfallMax(settingsData.shortfall_max)
        if (settingsData.pity_timer_threshold) setPityThreshold(settingsData.pity_timer_threshold)
        if (settingsData.points_system_enabled !== undefined) setPointsEnabled(settingsData.points_system_enabled === 'true')
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

  const handleSaveTemplates = async () => {
    setTemplatesSaving(true)
    setTemplatesSaved(false)
    try {
      await Promise.all([
        saveSetting('welcome_template_sid', welcomeTemplateSid),
        saveSetting('welcome_back_near_template_sid', welcomeBackNearTemplateSid),
        saveSetting('welcome_back_far_template_sid', welcomeBackFarTemplateSid),
        saveSetting('reward_template_sid', rewardTemplateSid),
        saveSetting('birthday_template_sid', birthdayTemplateSid),
        saveSetting('reactivation_no_reward_template_sid', reactivationNoRewardSid),
        saveSetting('reactivation_with_reward_template_sid', reactivationWithRewardSid),
        saveSetting('reactivation_reward_id', reactivationRewardId),
      ])
      setTemplatesSaved(true)
      setTimeout(() => setTemplatesSaved(false), 3000)
    } catch { /* silent */ } finally {
      setTemplatesSaving(false)
    }
  }

  const handleSavePoints = async () => {
    setPointsSaving(true)
    setPointsSaved(false)
    try {
      await Promise.all([
        saveSetting('points_per_visit_min', pointsMin),
        saveSetting('points_per_visit_max', pointsMax),
        saveSetting('welcome_bonus_points_min', welcomeMin),
        saveSetting('welcome_bonus_points_max', welcomeMax),
        saveSetting('shortfall_min', shortfallMin),
        saveSetting('shortfall_max', shortfallMax),
        saveSetting('pity_timer_threshold', pityThreshold),
        saveSetting('points_system_enabled', String(pointsEnabled)),
      ])
      setPointsSaved(true)
      setTimeout(() => setPointsSaved(false), 3000)
    } catch { /* silent */ } finally {
      setPointsSaving(false)
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
            <Input
              type="number"
              value={avgTicket}
              onChange={(e) => setAvgTicket(e.target.value)}
              disabled={loading}
              placeholder="35000"
              className="pl-7"
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
              <Input
                value={b}
                onChange={(e) => updateBenefit(i, e.target.value)}
                placeholder="Ej: 15% descuento permanente"
                className="flex-1"
              />
              {benefits.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => removeBenefit(i)} className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2">
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-4">
          <Button variant="outline" size="sm" onClick={addBenefit} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Agregar beneficio
          </Button>
          <SaveButton saving={benefitsSaving} saved={benefitsSaved} onClick={handleSaveBenefits} disabled={benefitsSaving} />
        </div>
      </div>

      {/* ─── SISTEMA DE PUNTOS ─── */}
      <div className="dashboard-card p-6 max-w-2xl" style={{ border: '1px solid rgba(168, 85, 247, 0.15)' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(168, 85, 247, 0.15)' }}>
            <Zap className="h-5 w-5" strokeWidth={1.5} style={{ color: '#a855f7' }} />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>Sistema de Puntos</h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Configura los rangos de puntos por visita, bienvenida y shortfall.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={pointsEnabled}
            onClick={() => setPointsEnabled(!pointsEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              pointsEnabled ? 'bg-purple-500' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                pointsEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="space-y-5">
          {/* Puntos por visita */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
              Puntos por visita (check-in)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px]" style={{ color: '#9ca3af' }}>Minimo</label>
                <Input type="number" min={1} value={pointsMin} onChange={(e) => setPointsMin(e.target.value)} disabled={loading} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px]" style={{ color: '#9ca3af' }}>Maximo</label>
                <Input type="number" min={1} value={pointsMax} onChange={(e) => setPointsMax(e.target.value)} disabled={loading} />
              </div>
            </div>
            <p className="text-[10px] mt-1" style={{ color: '#b0b0b0' }}>Rango aleatorio de puntos que el cliente recibe en cada visita. Default: 60-90.</p>
          </div>

          {/* Puntos de bienvenida */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
              Puntos de bienvenida (registro)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px]" style={{ color: '#9ca3af' }}>Minimo</label>
                <Input type="number" min={0} value={welcomeMin} onChange={(e) => setWelcomeMin(e.target.value)} disabled={loading} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px]" style={{ color: '#9ca3af' }}>Maximo</label>
                <Input type="number" min={0} value={welcomeMax} onChange={(e) => setWelcomeMax(e.target.value)} disabled={loading} />
              </div>
            </div>
            <p className="text-[10px] mt-1" style={{ color: '#b0b0b0' }}>Monto alto de bienvenida que crea ilusion de que en 2 visitas llegan al primer tier. Default: 75-90.</p>
          </div>

          {/* Shortfall */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
              Shortfall (2da visita)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px]" style={{ color: '#9ca3af' }}>Min pts corto</label>
                <Input type="number" min={1} value={shortfallMin} onChange={(e) => setShortfallMin(e.target.value)} disabled={loading} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px]" style={{ color: '#9ca3af' }}>Max pts corto</label>
                <Input type="number" min={1} value={shortfallMax} onChange={(e) => setShortfallMax(e.target.value)} disabled={loading} />
              </div>
            </div>
            <p className="text-[10px] mt-1" style={{ color: '#b0b0b0' }}>Cuantos puntos queda corto el cliente tras la 2da visita. Obliga una 3ra visita. Default: 5-30.</p>
          </div>

          {/* Pity Timer */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
              Pity Timer (Golden Box)
            </label>
            <div className="max-w-[200px]">
              <Input type="number" min={1} value={pityThreshold} onChange={(e) => setPityThreshold(e.target.value)} disabled={loading} />
            </div>
            <p className="text-[10px] mt-1" style={{ color: '#b0b0b0' }}>Racha de premios bajos consecutivos antes de activar la Golden Box. Default: 2.</p>
          </div>

          <SaveButton saving={pointsSaving} saved={pointsSaved} onClick={handleSavePoints} disabled={pointsSaving || loading} />
        </div>
      </div>

      {/* ─── PLANTILLAS WHATSAPP (TODAS) ─── */}
      <div className="dashboard-card p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(99, 102, 241, 0.15)' }}>
            <Mail className="h-5 w-5" strokeWidth={1.5} style={{ color: '#6366f1' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>Plantillas WhatsApp</h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Asigna una plantilla aprobada a cada tipo de mensaje.</p>
          </div>
        </div>

        <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
          <p className="text-xs font-medium" style={{ color: '#DC2626' }}>
            ⚠️ TODOS los mensajes de WhatsApp requieren plantilla aprobada por Meta. No existe ventana de 24h porque el cliente nunca envía un mensaje al negocio.
          </p>
          <p className="text-xs mt-1" style={{ color: '#7F1D1D' }}>
            Sin plantilla configurada = el mensaje NO se enviará.
          </p>
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
              Ve a Dashboard &gt; Plantillas, crea las plantillas necesarias y espera aprobación de Meta.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Welcome (registro nuevo) */}
            <TemplateSelector
              label="Bienvenida (registro nuevo)"
              icon={<UserPlus className="h-3.5 w-3.5" style={{ color: '#10B981' }} />}
              hint="Variables: {{1}}=nombre"
              value={welcomeTemplateSid}
              onChange={setWelcomeTemplateSid}
              templates={approvedTemplates}
            />

            {/* Welcome Back NEAR (visita con próximo premio en visit+1) */}
            <TemplateSelector
              label="Visita: cerca de premio (faltan 1)"
              icon={<MessageCircle className="h-3.5 w-3.5" style={{ color: '#3B82F6' }} />}
              hint="Variables: {{1}}=nombre, {{2}}=visitas, {{3}}=título del próximo premio"
              value={welcomeBackNearTemplateSid}
              onChange={setWelcomeBackNearTemplateSid}
              templates={approvedTemplates}
            />

            {/* Welcome Back FAR (visita con próximo premio en visit+2 o más) */}
            <TemplateSelector
              label="Visita: lejos de premio (faltan 2+)"
              icon={<MessageCircle className="h-3.5 w-3.5" style={{ color: '#6366F1' }} />}
              hint="Variables: {{1}}=nombre, {{2}}=visitas, {{3}}=título del próximo premio"
              value={welcomeBackFarTemplateSid}
              onChange={setWelcomeBackFarTemplateSid}
              templates={approvedTemplates}
            />

            {/* Reward (milestone) */}
            <TemplateSelector
              label="Ganaste premio (milestone)"
              icon={<Gift className="h-3.5 w-3.5" style={{ color: '#F59E0B' }} />}
              hint="Variables: {{1}}=nombre, {{2}}=visitas, {{3}}=nombre del premio"
              value={rewardTemplateSid}
              onChange={setRewardTemplateSid}
              templates={approvedTemplates}
            />

            {/* Birthday */}
            <TemplateSelector
              label="Cumpleaños (cron diario)"
              icon={<CalendarHeart className="h-3.5 w-3.5" style={{ color: '#EC4899' }} />}
              hint="Variables: {{1}}=nombre"
              value={birthdayTemplateSid}
              onChange={setBirthdayTemplateSid}
              templates={approvedTemplates}
            />

            {/* Reactivation SIN regalo */}
            <TemplateSelector
              label="Reactivación SIN regalo"
              icon={<RefreshCw className="h-3.5 w-3.5" style={{ color: '#F97316' }} />}
              hint="Variables: {{1}}=nombre. Mensaje tipo 'te echamos de menos'."
              value={reactivationNoRewardSid}
              onChange={setReactivationNoRewardSid}
              templates={approvedTemplates}
            />

            {/* Reactivation CON regalo */}
            <TemplateSelector
              label="Reactivación CON regalo"
              icon={<RefreshCw className="h-3.5 w-3.5" style={{ color: '#EF4444' }} />}
              hint="Variables: {{1}}=nombre, {{3}}=premio. Si está configurada y hay reward seleccionado abajo, se usa esta plantilla."
              value={reactivationWithRewardSid}
              onChange={setReactivationWithRewardSid}
              templates={approvedTemplates}
            />

            {/* Reactivation reward picker */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>
                <Gift className="h-3.5 w-3.5" style={{ color: '#EF4444' }} />
                Recompensa para reactivación CON regalo
              </label>
              <select
                value={reactivationRewardId}
                onChange={(e) => setReactivationRewardId(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                <option value="">— Sin recompensa fija (usa plantilla SIN regalo) —</option>
                {rewards.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}{r.visit_milestone !== null ? ` (visita #${r.visit_milestone})` : ' (sin milestone)'}
                  </option>
                ))}
              </select>
              <p className="text-[10px]" style={{ color: '#b0b0b0' }}>
                Si seleccionas una recompensa Y configuras "Reactivación CON regalo", el cron usará esa plantilla con `{'{{3}}'}` = título del premio.
              </p>
            </div>

            <SaveButton saving={templatesSaving} saved={templatesSaved} onClick={handleSaveTemplates} disabled={templatesSaving} />
          </div>
        )}
      </div>
    </div>
  )
}
