'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Settings, DollarSign, Save, Loader2, CheckCircle, Crown, CalendarHeart, Mail, RefreshCw, Gift, UserPlus, X, Plus, Zap, MapPin, Sparkles, Package, TrendingUp, Flame, ScanLine, Star } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PointsCalibrator } from '@/components/dashboard/PointsCalibrator'
import type { PointsEngineConfig } from '@/lib/points-engine'

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

/** Premio del catálogo de campaña (Dashboard > Premios de campaña, migración 00031). */
interface CampaignRewardOption {
  id: string
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
  const [birthdayTemplateSid, setBirthdayTemplateSid] = useState('')
  const [reactivationNoRewardSid, setReactivationNoRewardSid] = useState('')
  const [reactivationWithRewardSid, setReactivationWithRewardSid] = useState('')
  const [reactivationRewardId, setReactivationRewardId] = useState('')
  const [safeRewardTemplateSid, setSafeRewardTemplateSid] = useState('')
  const [mysteryBoxResultTemplateSid, setMysteryBoxResultTemplateSid] = useState('')
  const [goldenBoxResultTemplateSid, setGoldenBoxResultTemplateSid] = useState('')
  const [pointsEarnedFarTemplateSid, setPointsEarnedFarTemplateSid] = useState('')
  const [pointsEarnedNearTemplateSid, setPointsEarnedNearTemplateSid] = useState('')
  const [reactivationAggressiveTemplateSid, setReactivationAggressiveTemplateSid] = useState('')
  const [eventTemplateImageSid, setEventTemplateImageSid] = useState('')
  const [eventTemplateVideoSid, setEventTemplateVideoSid] = useState('')
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
  /** Umbral del primer premio: el `point_threshold` más bajo entre los tiers activos. */
  const [firstTierThreshold, setFirstTierThreshold] = useState<number | null>(null)

  // Check-in verification config
  const [checkinMode, setCheckinMode] = useState<'auto' | 'staff_verified'>('auto')
  const [firstVisitFree, setFirstVisitFree] = useState(true)
  const [checkinSaving, setCheckinSaving] = useState(false)
  const [checkinSaved, setCheckinSaved] = useState(false)

  // Reactivation days config
  const [reactivationSoftDays, setReactivationSoftDays] = useState('21')
  const [reactivationAggressiveDays, setReactivationAggressiveDays] = useState('25')
  const [reactivationSaving, setReactivationSaving] = useState(false)
  const [reactivationSaved, setReactivationSaved] = useState(false)
  const [reactivationError, setReactivationError] = useState<string | null>(null)

  // Premio de reactivación agresiva + recordatorio de vencimiento (migración 00031)
  const [campaignRewards, setCampaignRewards] = useState<CampaignRewardOption[]>([])
  const [aggressiveRewardId, setAggressiveRewardId] = useState('')
  const [aggressiveWindowDays, setAggressiveWindowDays] = useState('7')
  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderDaysBefore, setReminderDaysBefore] = useState('2')
  const [reminderTemplateSid, setReminderTemplateSid] = useState('')
  const [grantSaving, setGrantSaving] = useState(false)
  const [grantSaved, setGrantSaved] = useState(false)
  const [grantError, setGrantError] = useState<string | null>(null)

  // Location config
  // Reseñas de Google (Bloque 3, migración 00032)
  const [googleReviewUrl, setGoogleReviewUrl] = useState('')
  const [reviewRewardId, setReviewRewardId] = useState('')
  const [reviewWindowDays, setReviewWindowDays] = useState('30')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewSaved, setReviewSaved] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  const [locationLat, setLocationLat] = useState('')
  const [locationLon, setLocationLon] = useState('')
  const [locationRadius, setLocationRadius] = useState('20')
  const [locationAddress, setLocationAddress] = useState('')
  const [geoStrictMode, setGeoStrictMode] = useState(false)
  const [locationSaving, setLocationSaving] = useState(false)
  const [locationSaved, setLocationSaved] = useState(false)

  /** Los seis inputs de Ajustes avanzados, traducidos a la config que entiende el motor. */
  const pointsConfig = useMemo<PointsEngineConfig>(() => ({
    visitMin: parseInt(pointsMin, 10),
    visitMax: parseInt(pointsMax, 10),
    welcomeMin: parseInt(welcomeMin, 10),
    welcomeMax: parseInt(welcomeMax, 10),
    shortfallMin: parseInt(shortfallMin, 10),
    shortfallMax: parseInt(shortfallMax, 10),
  }), [pointsMin, pointsMax, welcomeMin, welcomeMax, shortfallMin, shortfallMax])

  /** El calibrador propone: se vuelcan los seis números en los inputs. Guardar sigue siendo manual. */
  const applyCalibration = useCallback((cfg: PointsEngineConfig) => {
    setPointsMin(String(cfg.visitMin))
    setPointsMax(String(cfg.visitMax))
    setWelcomeMin(String(cfg.welcomeMin))
    setWelcomeMax(String(cfg.welcomeMax))
    setShortfallMin(String(cfg.shortfallMin))
    setShortfallMax(String(cfg.shortfallMax))
    setPointsSaved(false)
  }, [])

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
      fetch('/api/dashboard/location').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/dashboard/campaign-rewards?active=true').then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/dashboard/reward-tiers').then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/dashboard/tenant-config').then((r) => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([settingsData, templatesData, rewardsData, locationData, campaignRewardsData, tiersData, tenantConfigData]) => {
        setSettings(settingsData)
        if (settingsData.avg_ticket) setAvgTicket(settingsData.avg_ticket)
        if (settingsData.black_benefits) {
          try { setBenefits(JSON.parse(settingsData.black_benefits)) } catch { /* keep default */ }
        }
        if (settingsData.welcome_template_sid) setWelcomeTemplateSid(settingsData.welcome_template_sid)
        if (settingsData.birthday_template_sid) setBirthdayTemplateSid(settingsData.birthday_template_sid)
        // reactivación: legacy reactivation_template_sid migra a reactivation_no_reward por defecto
        const legacyReact = settingsData.reactivation_template_sid ?? ''
        setReactivationNoRewardSid(settingsData.reactivation_no_reward_template_sid ?? legacyReact)
        setReactivationWithRewardSid(settingsData.reactivation_with_reward_template_sid ?? '')
        setReactivationRewardId(settingsData.reactivation_reward_id ?? '')
        setSafeRewardTemplateSid(settingsData.reward_safe_template_sid ?? '')
        setMysteryBoxResultTemplateSid(settingsData.mystery_box_result_template_sid ?? '')
        setGoldenBoxResultTemplateSid(settingsData.golden_box_result_template_sid ?? '')
        setPointsEarnedFarTemplateSid(settingsData.points_earned_far_template_sid ?? '')
        setPointsEarnedNearTemplateSid(settingsData.points_earned_near_template_sid ?? '')
        setReactivationAggressiveTemplateSid(settingsData.reactivation_aggressive_template_sid ?? '')
        setEventTemplateImageSid(settingsData.event_template_image_sid ?? '')
        setEventTemplateVideoSid(settingsData.event_template_video_sid ?? '')

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

        // Umbral de referencia del calibrador: el primer premio que el cliente puede ganar.
        const activeTiers: { point_threshold: number; is_active: boolean }[] = Array.isArray(tiersData)
          ? tiersData.filter((t: { is_active: boolean }) => t.is_active)
          : []
        setFirstTierThreshold(
          activeTiers.length > 0
            ? Math.min(...activeTiers.map((t) => t.point_threshold))
            : null
        )

        if (settingsData.checkin_mode === 'staff_verified' || settingsData.checkin_mode === 'auto') setCheckinMode(settingsData.checkin_mode)
        setFirstVisitFree(settingsData.checkin_first_visit_free !== 'false')
        if (settingsData.reactivation_soft_days) setReactivationSoftDays(settingsData.reactivation_soft_days)
        if (settingsData.reactivation_aggressive_days) setReactivationAggressiveDays(settingsData.reactivation_aggressive_days)
        if (settingsData.geo_strict_mode !== undefined) setGeoStrictMode(settingsData.geo_strict_mode === 'true')

        // Premio de reactivación agresiva + recordatorio (migración 00031)
        setCampaignRewards(Array.isArray(campaignRewardsData) ? campaignRewardsData : [])
        setAggressiveRewardId(settingsData.aggressive_reward_id ?? '')
        if (settingsData.aggressive_reward_window_days) setAggressiveWindowDays(settingsData.aggressive_reward_window_days)
        setReminderEnabled(settingsData.reward_reminder_enabled === 'true')
        if (settingsData.reward_reminder_days_before) setReminderDaysBefore(settingsData.reward_reminder_days_before)
        setReminderTemplateSid(settingsData.reward_reminder_template_sid ?? '')

        // Reseñas de Google (migración 00032). El link vive en tenants.config, no en
        // admin_settings: es de donde lo lee resolveBranding().
        if (tenantConfigData?.google_maps_url) setGoogleReviewUrl(tenantConfigData.google_maps_url)
        setReviewRewardId(settingsData.review_reward_id ?? '')
        if (settingsData.review_reward_window_days) setReviewWindowDays(settingsData.review_reward_window_days)

        if (locationData) {
          setLocationLat(String(locationData.lat ?? ''))
          setLocationLon(String(locationData.lon ?? ''))
          setLocationRadius(String(locationData.radius_meters ?? '20'))
          setLocationAddress(locationData.address ?? '')
        }
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
        saveSetting('birthday_template_sid', birthdayTemplateSid),
        saveSetting('reactivation_no_reward_template_sid', reactivationNoRewardSid),
        saveSetting('reactivation_with_reward_template_sid', reactivationWithRewardSid),
        saveSetting('reactivation_reward_id', reactivationRewardId),
        saveSetting('reward_safe_template_sid', safeRewardTemplateSid),
        saveSetting('mystery_box_result_template_sid', mysteryBoxResultTemplateSid),
        saveSetting('golden_box_result_template_sid', goldenBoxResultTemplateSid),
        saveSetting('points_earned_far_template_sid', pointsEarnedFarTemplateSid),
        saveSetting('points_earned_near_template_sid', pointsEarnedNearTemplateSid),
        saveSetting('reactivation_aggressive_template_sid', reactivationAggressiveTemplateSid),
        saveSetting('reward_reminder_template_sid', reminderTemplateSid),
        saveSetting('event_template_image_sid', eventTemplateImageSid),
        saveSetting('event_template_video_sid', eventTemplateVideoSid),
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

  const handleSaveCheckin = async () => {
    setCheckinSaving(true)
    setCheckinSaved(false)
    try {
      await Promise.all([
        saveSetting('checkin_mode', checkinMode),
        saveSetting('checkin_first_visit_free', String(firstVisitFree)),
      ])
      setCheckinSaved(true)
      setTimeout(() => setCheckinSaved(false), 3000)
    } catch { /* silent */ } finally {
      setCheckinSaving(false)
    }
  }

  const handleSaveGrantConfig = async () => {
    const windowDays = parseInt(aggressiveWindowDays, 10)
    const daysBefore = parseInt(reminderDaysBefore, 10)
    setGrantError(null)

    if (!Number.isInteger(windowDays) || windowDays < 1) {
      setGrantError('La ventana del premio debe ser un número mayor a 0.')
      return
    }
    if (reminderEnabled) {
      if (!Number.isInteger(daysBefore) || daysBefore < 1) {
        setGrantError('Los días de aviso deben ser un número mayor a 0.')
        return
      }
      if (daysBefore >= windowDays) {
        setGrantError('El aviso debe salir ANTES de que venza el premio: los días de aviso tienen que ser menores que la ventana.')
        return
      }
      if (!reminderTemplateSid) {
        setGrantError('Elige la plantilla del recordatorio abajo, en Plantillas de WhatsApp.')
        return
      }
    }

    setGrantSaving(true)
    setGrantSaved(false)
    try {
      await Promise.all([
        saveSetting('aggressive_reward_id', aggressiveRewardId),
        saveSetting('aggressive_reward_window_days', String(windowDays)),
        saveSetting('reward_reminder_enabled', String(reminderEnabled)),
        saveSetting('reward_reminder_days_before', String(daysBefore)),
      ])
      setGrantSaved(true)
      setTimeout(() => setGrantSaved(false), 3000)
    } catch (err) {
      setGrantError(err instanceof Error ? err.message : 'Error guardando')
    } finally {
      setGrantSaving(false)
    }
  }

  const handleSaveReview = async () => {
    const windowDays = parseInt(reviewWindowDays, 10)
    setReviewError(null)

    const url = googleReviewUrl.trim()
    if (url && !/^https?:\/\//i.test(url)) {
      setReviewError('El link debe empezar por https://')
      return
    }
    if (!Number.isInteger(windowDays) || windowDays < 1) {
      setReviewError('La ventana del premio debe ser un número mayor a 0.')
      return
    }

    setReviewSaving(true)
    setReviewSaved(false)
    try {
      const [resConfig] = await Promise.all([
        fetch('/api/dashboard/tenant-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ google_maps_url: url }),
        }),
        saveSetting('review_reward_id', reviewRewardId),
        saveSetting('review_reward_window_days', String(windowDays)),
      ])
      if (!resConfig.ok) {
        const data = await resConfig.json()
        throw new Error(data.error ?? 'Error guardando el link')
      }
      setReviewSaved(true)
      setTimeout(() => setReviewSaved(false), 3000)
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Error guardando')
    } finally {
      setReviewSaving(false)
    }
  }

  const handleSaveReactivation = async () => {
    const soft = parseInt(reactivationSoftDays, 10)
    const aggressive = parseInt(reactivationAggressiveDays, 10)
    setReactivationError(null)
    if (!Number.isInteger(soft) || soft < 1) {
      setReactivationError('Los días de reactivación suave deben ser un número mayor a 0.')
      return
    }
    if (!Number.isInteger(aggressive) || aggressive <= soft) {
      setReactivationError('Los días de reactivación agresiva deben ser mayores que los de la suave.')
      return
    }
    setReactivationSaving(true)
    setReactivationSaved(false)
    try {
      await Promise.all([
        saveSetting('reactivation_soft_days', String(soft)),
        saveSetting('reactivation_aggressive_days', String(aggressive)),
      ])
      setReactivationSaved(true)
      setTimeout(() => setReactivationSaved(false), 3000)
    } catch (err) {
      setReactivationError(err instanceof Error ? err.message : 'Error guardando')
    } finally {
      setReactivationSaving(false)
    }
  }

  const handleSaveLocation = async () => {
    setLocationSaving(true)
    setLocationSaved(false)
    try {
      const [resLoc] = await Promise.all([
        fetch('/api/dashboard/location', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: parseFloat(locationLat),
            lon: parseFloat(locationLon),
            radius_meters: parseInt(locationRadius) || 20,
            address: locationAddress || undefined,
          }),
        }),
        saveSetting('geo_strict_mode', String(geoStrictMode)),
      ])
      if (!resLoc.ok) throw new Error('Error guardando')
      setLocationSaved(true)
      setTimeout(() => setLocationSaved(false), 3000)
    } catch { /* silent */ } finally {
      setLocationSaving(false)
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
            <p className="text-xs" style={{ color: '#9ca3af' }}>Elige en cuántas visitas se gana el premio. Los puntos se calculan solos.</p>
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

        {/* El calibrador: la perilla de "en cuántas visitas se gana el premio" + la tabla espejo.
            Los seis números que hay debajo son su consecuencia, no su causa. */}
        <PointsCalibrator
          threshold={firstTierThreshold}
          config={pointsConfig}
          onChange={applyCalibration}
          disabled={loading}
        />

        <div className="space-y-5">
          {/* Los seis números: plegados, porque el calibrador ya los decide. Quien los edite a
              mano ve la tabla de arriba recalcularse en vivo con sus valores. */}
          <details className="rounded-xl" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
            <summary className="cursor-pointer select-none px-4 py-3 text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>
              Ajustes avanzados
            </summary>

            <div className="space-y-5 px-4 pt-1 pb-4">
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
                <p className="text-[10px] mt-1" style={{ color: '#b0b0b0' }}>Rango aleatorio de puntos que el cliente recibe de su 2da visita en adelante. Default: 60-90.</p>
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
                <p className="text-[10px] mt-1" style={{ color: '#b0b0b0' }}>Lo que recibe en su PRIMERA visita, al registrarse. Es la palanca mas fuerte del sistema: sobre un umbral de 150, un bono de 75-90 ya regala mas de medio premio. Default: 75-90.</p>
              </div>

              {/* Shortfall */}
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
                  Shortfall (el &quot;casi lo logro&quot;)
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
                <p className="text-[10px] mt-1" style={{ color: '#b0b0b0' }}>Cuantos puntos queda corto el cliente en la visita previa al premio. Es lo que le hace volver una vez mas. Default: 5-30.</p>
              </div>
            </div>
          </details>

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

      {/* ─── CHECK-IN Y VERIFICACIÓN ─── */}
      <div className="dashboard-card p-6 max-w-2xl" style={{ border: '1px solid rgba(14, 165, 233, 0.15)' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(14, 165, 233, 0.15)' }}>
            <ScanLine className="h-5 w-5" strokeWidth={1.5} style={{ color: '#0ea5e9' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>Check-in y Verificación</h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Controla cómo se validan las visitas de los clientes.</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Modo de check-in */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#6b7280' }}>
              Modo de check-in
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCheckinMode('auto')}
                className={`rounded-xl border p-3 text-left transition-all ${
                  checkinMode === 'auto' ? 'border-sky-500 ring-2 ring-sky-500/20' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-semibold" style={{ color: '#1a1c1d' }}>Automático</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#9ca3af' }}>El cliente registra su visita solo al escanear el QR de la mesa. Sin fricción, menos seguro.</p>
              </button>
              <button
                type="button"
                onClick={() => setCheckinMode('staff_verified')}
                className={`rounded-xl border p-3 text-left transition-all ${
                  checkinMode === 'staff_verified' ? 'border-sky-500 ring-2 ring-sky-500/20' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-semibold" style={{ color: '#1a1c1d' }}>Verificado por mesero</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#9ca3af' }}>El cliente muestra su QR personal y el mesero lo escanea para sumar la visita. Anti-fraude.</p>
              </button>
            </div>
          </div>

          {/* Primera visita libre */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: '#1a1c1d' }}>Primera visita automática</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#9ca3af' }}>
                <strong>Activado:</strong> el cliente nuevo recibe su primera visita al registrarse.{' '}
                <strong>Desactivado:</strong> tras registrarse se le muestra su QR y el mesero debe escanearlo para validar la primera visita (recomendado para promos, influencers y QR dinámicos).
              </p>
              {checkinMode === 'auto' && !firstVisitFree && (
                <p className="text-[11px] mt-1 font-medium" style={{ color: '#d97706' }}>
                  ⚠️ Esta opción solo aplica en modo “Verificado por mesero”.
                </p>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={firstVisitFree}
              onClick={() => setFirstVisitFree(!firstVisitFree)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                firstVisitFree ? 'bg-sky-500' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  firstVisitFree ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <SaveButton saving={checkinSaving} saved={checkinSaved} onClick={handleSaveCheckin} disabled={checkinSaving || loading} />
        </div>
      </div>

      {/* ─── REACTIVACIÓN ─── */}
      <div className="dashboard-card p-6 max-w-2xl" style={{ border: '1px solid rgba(249, 115, 22, 0.15)' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(249, 115, 22, 0.15)' }}>
            <RefreshCw className="h-5 w-5" strokeWidth={1.5} style={{ color: '#f97316' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>Reactivación de Clientes</h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Días de inactividad antes de enviar el mensaje de “te extrañamos”. Ajusta según el ciclo de visita de tu negocio.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Reactivación suave (días)</label>
            <Input
              type="number"
              min={1}
              value={reactivationSoftDays}
              onChange={(e) => setReactivationSoftDays(e.target.value)}
              disabled={loading}
              placeholder="21"
            />
            <p className="text-[10px]" style={{ color: '#b0b0b0' }}>Primer toque amistoso. Default: 21 días.</p>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Reactivación agresiva (días)</label>
            <Input
              type="number"
              min={2}
              value={reactivationAggressiveDays}
              onChange={(e) => setReactivationAggressiveDays(e.target.value)}
              disabled={loading}
              placeholder="25"
            />
            <p className="text-[10px]" style={{ color: '#b0b0b0' }}>Segundo toque con incentivo. Default: 25 días. Debe ser mayor que la suave.</p>
          </div>
        </div>

        {reactivationError && (
          <p className="text-xs mt-3 font-medium" style={{ color: '#ef4444' }}>{reactivationError}</p>
        )}

        <div className="mt-4">
          <SaveButton saving={reactivationSaving} saved={reactivationSaved} onClick={handleSaveReactivation} disabled={reactivationSaving || loading} />
        </div>
      </div>

      {/* ─── PREMIO DE REACTIVACIÓN AGRESIVA (migración 00031) ─── */}
      <div className="dashboard-card p-6 max-w-2xl" style={{ border: '1px solid rgba(245, 158, 11, 0.2)' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(245, 158, 11, 0.15)' }}>
            <Flame className="h-5 w-5" strokeWidth={1.5} style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>Premio de Reactivación Agresiva</h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>&ldquo;Vuelve antes del 18 y te llevas 1/2 sushi gratis.&rdquo; El premio se otorga al enviar el mensaje y el cliente lo ve en su tarjeta con la cuenta regresiva.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Premio a regalar</label>
            <select
              value={aggressiveRewardId}
              onChange={(e) => setAggressiveRewardId(e.target.value)}
              disabled={loading}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
            >
              <option value="">— Sin premio (solo mensaje) —</option>
              {campaignRewards.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
            <p className="text-[10px]" style={{ color: '#b0b0b0' }}>
              Del catálogo de <a href="/dashboard/campaign-rewards" className="underline">Premios de campaña</a>. Sin premio, la campaña sigue siendo solo un recordatorio.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Ventana del premio (días)</label>
            <Input
              type="number"
              min={1}
              value={aggressiveWindowDays}
              onChange={(e) => setAggressiveWindowDays(e.target.value)}
              disabled={loading}
              placeholder="7"
            />
            <p className="text-[10px]" style={{ color: '#b0b0b0' }}>
              Cuánto tiempo tiene el cliente para venir a reclamarlo. Default: 7 días. Es independiente de los días de reactivación.
            </p>
          </div>
        </div>

        <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(e) => setReminderEnabled(e.target.checked)}
              disabled={loading}
              className="mt-0.5 h-4 w-4 rounded"
            />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#1a1c1d' }}>Recordarle antes de que venza</p>
              <p className="text-[11px]" style={{ color: '#9ca3af' }}>
                Un solo mensaje, solo a quien no ha vuelto. Cuenta contra el límite de 3 mensajes de marketing al mes por cliente.
              </p>
            </div>
          </label>

          {reminderEnabled && (
            <div className="mt-4 max-w-[220px] space-y-1">
              <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Días antes de vencer</label>
              <Input
                type="number"
                min={1}
                value={reminderDaysBefore}
                onChange={(e) => setReminderDaysBefore(e.target.value)}
                disabled={loading}
                placeholder="2"
              />
              <p className="text-[10px]" style={{ color: '#b0b0b0' }}>
                Debe ser menor que la ventana. Con ventana de 7 y aviso de 2, el mensaje sale el día 5.
              </p>
            </div>
          )}
        </div>

        {grantError && (
          <p className="text-xs mt-3 font-medium" style={{ color: '#ef4444' }}>{grantError}</p>
        )}

        <div className="mt-4">
          <SaveButton saving={grantSaving} saved={grantSaved} onClick={handleSaveGrantConfig} disabled={grantSaving || loading} />
        </div>
      </div>

      {/* ─── RESEÑAS DE GOOGLE (Bloque 3, migración 00032) ─── */}
      <div className="dashboard-card p-6 max-w-2xl" style={{ border: '1px solid rgba(66, 133, 244, 0.2)' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(66, 133, 244, 0.15)' }}>
            <Star className="h-5 w-5" strokeWidth={1.5} style={{ color: '#4285F4' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>Reseñas de Google</h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Tras el check-in, al cliente le sale un pop-up: &ldquo;gánate X por dejarnos una reseña&rdquo;. Al que ya reseñó no se le vuelve a mostrar.</p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Link de reseñas de Google</label>
          <Input
            type="url"
            value={googleReviewUrl}
            onChange={(e) => setGoogleReviewUrl(e.target.value)}
            disabled={loading}
            placeholder="https://g.page/r/.../review"
          />
          <p className="text-[10px]" style={{ color: '#b0b0b0' }}>
            <span className="font-semibold">Sin este link el pop-up no aparece nunca</span> — no hay a dónde mandar al cliente. Sácalo de tu ficha de Google Business → <em>Pedir reseñas</em>.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Recompensa por reseña</label>
            <select
              value={reviewRewardId}
              onChange={(e) => setReviewRewardId(e.target.value)}
              disabled={loading}
              className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
            >
              <option value="">— Sin premio (solo se pide el favor) —</option>
              {campaignRewards.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
            <p className="text-[10px]" style={{ color: '#b0b0b0' }}>
              Del catálogo de <a href="/dashboard/campaign-rewards" className="underline">Premios de campaña</a>. El {'mesero'} lo entrega desde <em>Premios pendientes</em>, igual que todos los demás.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Ventana del premio (días)</label>
            <Input
              type="number"
              min={1}
              value={reviewWindowDays}
              onChange={(e) => setReviewWindowDays(e.target.value)}
              disabled={loading}
              placeholder="30"
            />
            <p className="text-[10px]" style={{ color: '#b0b0b0' }}>
              Lo normal es que lo reclame en la misma visita. Default: 30 días.
            </p>
          </div>
        </div>

        {reviewError && (
          <p className="text-xs mt-3 font-medium" style={{ color: '#ef4444' }}>{reviewError}</p>
        )}

        <div className="mt-4">
          <SaveButton saving={reviewSaving} saved={reviewSaved} onClick={handleSaveReview} disabled={reviewSaving || loading} />
        </div>
      </div>

      {/* ─── UBICACIÓN DEL LOCAL — PRÓXIMAMENTE ─── */}
      <div className="dashboard-card p-6 max-w-2xl relative" style={{ border: '1px solid rgba(59, 130, 246, 0.15)' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(59, 130, 246, 0.15)' }}>
            <MapPin className="h-5 w-5" strokeWidth={1.5} style={{ color: '#3b82f6' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>Ubicación del Local</h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Validación GPS para check-in</p>
          </div>
        </div>

        {/* Overlay Próximamente */}
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl"
          style={{ background: 'rgba(26, 28, 29, 0.75)', backdropFilter: 'blur(2px)' }}
        >
          <span
            className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest"
            style={{ background: '#374151', color: '#9ca3af' }}
          >
            Próximamente
          </span>
          <p className="mt-3 text-xs font-medium" style={{ color: '#9ca3af' }}>
            Validación por GPS desactivada temporalmente
          </p>
        </div>

        {/* Contenido standby (oculto bajo overlay) */}
        <div className="space-y-4 opacity-30 pointer-events-none">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Latitud</label>
              <Input type="text" value={locationLat} onChange={() => {}} placeholder="6.244203" disabled />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Longitud</label>
              <Input type="text" value={locationLon} onChange={() => {}} placeholder="-75.581211" disabled />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Radio (metros)</label>
              <Input type="number" min={5} max={500} value={locationRadius} onChange={() => {}} placeholder="20" disabled />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Dirección (opcional)</label>
              <Input type="text" value={locationAddress} onChange={() => {}} placeholder="Carrera 43A # 1A Sur-50" disabled />
            </div>
          </div>
          <label className="flex items-center gap-2 select-none">
            <input type="checkbox" checked={geoStrictMode} disabled className="h-4 w-4 rounded border-gray-300" />
            <span className="text-xs font-medium" style={{ color: '#1a1c1d' }}>Modo estricto: requerir GPS</span>
          </label>
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
              hint="Variables: {{1}}=nombre · {{2}}=pts iniciales · {{3}}=roadmap tiers"
              value={welcomeTemplateSid}
              onChange={setWelcomeTemplateSid}
              templates={approvedTemplates}
            />

            {/* Birthday */}
            <TemplateSelector
              label="Cumpleaños (cron diario)"
              icon={<CalendarHeart className="h-3.5 w-3.5" style={{ color: '#EC4899' }} />}
              hint="Variables: {{1}}=nombre · {{2}}=pts actuales"
              value={birthdayTemplateSid}
              onChange={setBirthdayTemplateSid}
              templates={approvedTemplates}
            />

            {/* Reactivation Suave (día 21) */}
            <TemplateSelector
              label="Reactivación Suave (día 21)"
              icon={<RefreshCw className="h-3.5 w-3.5" style={{ color: '#F97316' }} />}
              hint="Variables: {{1}}=nombre · {{2}}=pts actuales · {{3}}=próximo premio. Cron día 21 sin visitar."
              value={reactivationNoRewardSid}
              onChange={setReactivationNoRewardSid}
              templates={approvedTemplates}
            />

            {/* ── Sistema antiguo (legacy) ── */}
            <details className="rounded-lg border border-dashed" style={{ borderColor: 'rgba(156,163,175,0.4)' }}>
              <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-widest select-none" style={{ color: '#9ca3af' }}>
                Sistema antiguo — No usar si ya migraste a puntos
              </summary>
              <div className="px-3 pb-3 space-y-3 pt-2">
                <TemplateSelector
                  label="Reactivación CON regalo (legacy)"
                  icon={<RefreshCw className="h-3.5 w-3.5" style={{ color: '#9ca3af' }} />}
                  hint="Variables: {{1}}=nombre, {{3}}=premio. Solo instancias que aún no migraron a puntos."
                  value={reactivationWithRewardSid}
                  onChange={setReactivationWithRewardSid}
                  templates={approvedTemplates}
                />
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#9ca3af' }}>
                    <Gift className="h-3.5 w-3.5" />
                    Recompensa fija (legacy)
                  </label>
                  <select
                    value={reactivationRewardId}
                    onChange={(e) => setReactivationRewardId(e.target.value)}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                  >
                    <option value="">— Sin recompensa fija —</option>
                    {rewards.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}{r.visit_milestone !== null ? ` (visita #${r.visit_milestone})` : ' (sin milestone)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </details>

            {/* Reactivation AGRESIVA (25d+) */}
            <TemplateSelector
              label="Reactivación AGRESIVA (25d+)"
              icon={<Flame className="h-3.5 w-3.5" style={{ color: '#DC2626' }} />}
              hint="Variables: {{1}}=nombre · {{2}}=puntos · {{3}}=próximo tier · {{4}}=premio · {{5}}=fecha límite. {{4}} y {{5}} solo si configuraste un premio arriba."
              value={reactivationAggressiveTemplateSid}
              onChange={setReactivationAggressiveTemplateSid}
              templates={approvedTemplates}
            />

            {/* Recordatorio de vencimiento del premio (migración 00031) */}
            <TemplateSelector
              label="Premio por vencer (recordatorio)"
              icon={<Flame className="h-3.5 w-3.5" style={{ color: '#F59E0B' }} />}
              hint="Variables: {{1}}=nombre · {{2}}=premio · {{3}}=días restantes. Se envía solo si activaste el recordatorio arriba."
              value={reminderTemplateSid}
              onChange={setReminderTemplateSid}
              templates={approvedTemplates}
            />

            <div className="border-t border-dashed border-gray-200 pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#6b7280' }}>
                Sistema de Puntos + Mystery Box
              </p>

              {/* Puntos sumados (lejos) */}
              <TemplateSelector
                label="Puntos sumados (lejos del premio)"
                icon={<TrendingUp className="h-3.5 w-3.5" style={{ color: '#3B82F6' }} />}
                hint="Variables: {{1}}=nombre, {{2}}=puntos ganados hoy, {{3}}=puntos totales, {{4}}=roadmap tiers"
                value={pointsEarnedFarTemplateSid}
                onChange={setPointsEarnedFarTemplateSid}
                templates={approvedTemplates}
              />

              {/* Puntos sumados (cerca) */}
              <TemplateSelector
                label="Puntos sumados (cerca del premio)"
                icon={<TrendingUp className="h-3.5 w-3.5" style={{ color: '#10B981' }} />}
                hint="Variables: {{1}}=nombre, {{2}}=puntos ganados hoy, {{3}}=puntos totales, {{4}}=próximo premio"
                value={pointsEarnedNearTemplateSid}
                onChange={setPointsEarnedNearTemplateSid}
                templates={approvedTemplates}
              />

              {/* Premio seguro */}
              <TemplateSelector
                label="Premio seguro (cliente eligió 'a la segura')"
                icon={<Package className="h-3.5 w-3.5" style={{ color: '#6366F1' }} />}
                hint="Variables: {{1}}=nombre, {{2}}=tier, {{3}}=premio ganado, {{4}}=roadmap tiers"
                value={safeRewardTemplateSid}
                onChange={setSafeRewardTemplateSid}
                templates={approvedTemplates}
              />

              {/* Mystery Box resultado */}
              <TemplateSelector
                label="Mystery Box resultado"
                icon={<Sparkles className="h-3.5 w-3.5" style={{ color: '#8B5CF6' }} />}
                hint="Variables: {{1}}=nombre, {{2}}=tier, {{3}}=premio mystery box, {{4}}=roadmap tiers"
                value={mysteryBoxResultTemplateSid}
                onChange={setMysteryBoxResultTemplateSid}
                templates={approvedTemplates}
              />

              {/* Golden Box resultado */}
              <TemplateSelector
                label="Golden Box resultado (pity timer)"
                icon={<Crown className="h-3.5 w-3.5" style={{ color: '#FFD700' }} />}
                hint="Variables: {{1}}=nombre, {{2}}=premio golden box, {{3}}=roadmap tiers"
                value={goldenBoxResultTemplateSid}
                onChange={setGoldenBoxResultTemplateSid}
                templates={approvedTemplates}
              />
            </div>

            <div className="border-t border-dashed border-gray-200 pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#6b7280' }}>
                Calendario / Eventos
              </p>
              <p className="text-[10px] mb-3" style={{ color: '#b0b0b0' }}>
                Plantillas con imagen o video para campañas del calendario. La imagen/video se adjunta al crear cada evento.
              </p>

              <TemplateSelector
                label="Evento con imagen (JPG/PNG)"
                icon={<CalendarHeart className="h-3.5 w-3.5" style={{ color: '#6366F1' }} />}
                hint="Variables: {{1}}=nombre · {{2}}=restaurante · {{3}}=título evento · {{4}}=fecha · {{5}}=CTA"
                value={eventTemplateImageSid}
                onChange={setEventTemplateImageSid}
                templates={approvedTemplates}
              />

              <TemplateSelector
                label="Evento con video (MP4)"
                icon={<Sparkles className="h-3.5 w-3.5" style={{ color: '#8B5CF6' }} />}
                hint="Variables: {{1}}=nombre · {{2}}=restaurante · {{3}}=título evento · {{4}}=fecha · {{5}}=CTA"
                value={eventTemplateVideoSid}
                onChange={setEventTemplateVideoSid}
                templates={approvedTemplates}
              />
            </div>

            <SaveButton saving={templatesSaving} saved={templatesSaved} onClick={handleSaveTemplates} disabled={templatesSaving} />
          </div>
        )}
      </div>
    </div>
  )
}
