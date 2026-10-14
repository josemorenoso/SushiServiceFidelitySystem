'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Settings, DollarSign, Save, Loader2, CheckCircle, Crown, Mail, RefreshCw, X, Plus, Zap, MapPin, Gift, ScanLine, Star, Megaphone, ArrowRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PointsCalibrator } from '@/components/dashboard/PointsCalibrator'
import type { PointsEngineConfig } from '@/lib/points-engine'
import { normalizeMetaPixelId } from '@/lib/meta-pixel'
import { guardarAjuste, guardarAjustes } from '@/lib/guardar-ajustes'

/** El motivo de un guardado que no salió, debajo de su botón (OPER-4-mudo). */
function ErrorDeGuardado({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null
  return (
    <p role="alert" className="text-xs mt-2 font-medium text-destructive">
      {mensaje}
    </p>
  )
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
  const [loadError, setLoadError] = useState<string | null>(null)
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
  const [benefitsError, setBenefitsError] = useState<string | null>(null)

  // Las plantillas de WhatsApp ya no se eligen acá (2026-10-11): se crean, se mandan a
  // Meta y se eligen en Plantillas, una sola pantalla para Twilio y Zernio. Esta página
  // solo lee el puntero del recordatorio, para no dejar encenderlo sin plantilla.

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
  const [pointsError, setPointsError] = useState<string | null>(null)
  /** Umbral del primer premio: el `point_threshold` más bajo entre los tiers activos. */
  const [firstTierThreshold, setFirstTierThreshold] = useState<number | null>(null)

  // Check-in verification config
  const [checkinMode, setCheckinMode] = useState<'auto' | 'staff_verified'>('auto')
  const [firstVisitFree, setFirstVisitFree] = useState(true)
  const [checkinSaving, setCheckinSaving] = useState(false)
  const [checkinSaved, setCheckinSaved] = useState(false)
  const [checkinError, setCheckinError] = useState<string | null>(null)

  // Reactivation days config
  const [reactivationSoftDays, setReactivationSoftDays] = useState('21')
  const [reactivationAggressiveDays, setReactivationAggressiveDays] = useState('25')
  const [reactivationSaving, setReactivationSaving] = useState(false)
  const [reactivationSaved, setReactivationSaved] = useState(false)
  const [reactivationError, setReactivationError] = useState<string | null>(null)

  // Los premios que se regalan (el de la reactivación insistente, el de la reseña y su
  // recordatorio de vencimiento) ya no se eligen acá: viven en Recompensas › Premios para regalar
  // (S-1, 2026-10-13).

  // Location config
  // Reseñas de Google (Bloque 3, migración 00032)
  const [googleReviewUrl, setGoogleReviewUrl] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewSaved, setReviewSaved] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  // Píxel de Meta de la marca (dueño, 2026-09-10). Vive en tenants.config
  // (`integrations.meta_pixel_id`), no en admin_settings: es un dato de la marca
  // que leen las páginas públicas, igual que el link de reseñas de acá arriba.
  const [metaPixelId, setMetaPixelId] = useState('')
  const [pixelSaving, setPixelSaving] = useState(false)
  const [pixelSaved, setPixelSaved] = useState(false)
  const [pixelError, setPixelError] = useState<string | null>(null)
  // El token de la API de Conversiones (00061). NUNCA se lee de vuelta: el
  // panel solo sabe si hay uno y de cuándo es. El campo siempre arranca vacío.
  const [capiToken, setCapiToken] = useState('')
  const [capiConfigured, setCapiConfigured] = useState<boolean | null>(null)
  const [capiUpdatedAt, setCapiUpdatedAt] = useState<string | null>(null)
  const [capiUnavailable, setCapiUnavailable] = useState<string | null>(null)

  const [locationLat, setLocationLat] = useState('')
  const [locationLon, setLocationLon] = useState('')
  const [locationRadius, setLocationRadius] = useState('20')
  const [locationAddress, setLocationAddress] = useState('')
  const [geoStrictMode, setGeoStrictMode] = useState(false)

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

  // Lanza con el motivo del servidor en español (un 403 de OPER-4 incluido): `guardar-ajustes.ts`.
  const saveSetting = useCallback((key: string, value: string) => guardarAjuste(key, value), [])

  useEffect(() => {
    Promise.all([
      // Un fallo al LEER no puede verse como «tus ajustes son los de fábrica»: los valores
      // por defecto de los campos parecerían los guardados, y guardarlos pisaría los reales.
      fetch('/api/dashboard/settings').then(async (r) => {
        if (!r.ok) throw new Error('settings')
        return r.json()
      }),
      fetch('/api/dashboard/location').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/dashboard/reward-tiers').then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/dashboard/tenant-config').then((r) => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([settingsData, locationData, tiersData, tenantConfigData]) => {
        setSettings(settingsData)
        if (settingsData.avg_ticket) setAvgTicket(settingsData.avg_ticket)
        if (settingsData.black_benefits) {
          try { setBenefits(JSON.parse(settingsData.black_benefits)) } catch { /* keep default */ }
        }
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

        // Reseñas de Google (migración 00032). El link vive en tenants.config, no en
        // admin_settings: es de donde lo lee resolveBranding().
        if (tenantConfigData?.google_maps_url) setGoogleReviewUrl(tenantConfigData.google_maps_url)
        if (typeof tenantConfigData?.['integrations.meta_pixel_id'] === 'string') {
          setMetaPixelId(tenantConfigData['integrations.meta_pixel_id'])
        }

        if (locationData) {
          setLocationLat(String(locationData.lat ?? ''))
          setLocationLon(String(locationData.lon ?? ''))
          setLocationRadius(String(locationData.radius_meters ?? '20'))
          setLocationAddress(locationData.address ?? '')
        }
      })
      .catch(() => {
        setLoadError('No pudimos leer tu configuración. Lo que ves abajo son valores de ejemplo, no los tuyos: recarga la página antes de guardar.')
      })
      .finally(() => {
        setLoading(false)
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

  // OPER-4-mudo (2026-10-15): estas tres secciones guardaban con un `catch` vacío y un 403
  // (administrador de sede) o un 500 no se veía. Ahora el motivo sale debajo del botón y
  // «Guardado» solo aparece si se guardó TODO (`guardarAjustes()` espera a cada valor).
  const handleSaveBenefits = async () => {
    setBenefitsSaving(true)
    setBenefitsSaved(false)
    setBenefitsError(null)
    const error = await guardarAjustes([['black_benefits', JSON.stringify(benefits.filter((b) => b.trim()))]])
    setBenefitsSaving(false)
    if (error) { setBenefitsError(error); return }
    setBenefitsSaved(true)
    setTimeout(() => setBenefitsSaved(false), 3000)
  }

  const handleSavePoints = async () => {
    setPointsSaving(true)
    setPointsSaved(false)
    setPointsError(null)
    const error = await guardarAjustes([
      ['points_per_visit_min', pointsMin],
      ['points_per_visit_max', pointsMax],
      ['welcome_bonus_points_min', welcomeMin],
      ['welcome_bonus_points_max', welcomeMax],
      ['shortfall_min', shortfallMin],
      ['shortfall_max', shortfallMax],
      ['pity_timer_threshold', pityThreshold],
      ['points_system_enabled', String(pointsEnabled)],
    ])
    setPointsSaving(false)
    if (error) { setPointsError(error); return }
    setPointsSaved(true)
    setTimeout(() => setPointsSaved(false), 3000)
  }

  const handleSaveCheckin = async () => {
    setCheckinSaving(true)
    setCheckinSaved(false)
    setCheckinError(null)
    const error = await guardarAjustes([
      ['checkin_mode', checkinMode],
      ['checkin_first_visit_free', String(firstVisitFree)],
    ])
    setCheckinSaving(false)
    if (error) { setCheckinError(error); return }
    setCheckinSaved(true)
    setTimeout(() => setCheckinSaved(false), 3000)
  }

  const handleSaveReview = async () => {
    setReviewError(null)

    const url = googleReviewUrl.trim()
    if (url && !/^https?:\/\//i.test(url)) {
      setReviewError('El link debe empezar por https://')
      return
    }

    setReviewSaving(true)
    setReviewSaved(false)
    try {
      const resConfig = await fetch('/api/dashboard/tenant-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_maps_url: url }),
      })
      if (!resConfig.ok) {
        const data = await resConfig.json().catch(() => ({}))
        // 403 = administrador de sede (SEG-3): el link de la MARCA es de un super usuario,
        // pero el de SU sede sí lo puede cambiar, en Sedes. Se lo decimos en vez de dejarlo ahí.
        const aDondeIr = resConfig.status === 403 ? ' El link de reseñas de tu sede se cambia en Sedes.' : ''
        throw new Error((data.error ?? 'Error guardando el link') + aDondeIr)
      }
      setReviewSaved(true)
      setTimeout(() => setReviewSaved(false), 3000)
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Error guardando')
    } finally {
      setReviewSaving(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard/meta-conversions')
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) {
          // 503 = la 00061 no corrió todavía. Se muestra tal cual, en la tarjeta.
          setCapiUnavailable(typeof data.error === 'string' ? data.error : 'No se pudo consultar el token')
          return
        }
        setCapiConfigured(Boolean(data.configured))
        setCapiUpdatedAt(typeof data.updated_at === 'string' ? data.updated_at : null)
      })
      .catch(() => { if (!cancelled) setCapiUnavailable('No se pudo consultar el token') })
    return () => { cancelled = true }
  }, [])

  const handleSavePixel = async () => {
    const raw = metaPixelId.trim()
    setPixelError(null)

    // Se valida ANTES de mandar con el MISMO normalizador que usa el servidor
    // (`meta-pixel.ts`), para que el mensaje salga al lado del campo y no como
    // un 400 genérico. La validación de verdad sigue siendo la del servidor.
    if (raw !== '' && !normalizeMetaPixelId(raw)) {
      setPixelError('Pegá solo el número del píxel (15 o 16 dígitos), no el código ni un enlace.')
      return
    }

    setPixelSaving(true)
    setPixelSaved(false)
    try {
      const res = await fetch('/api/dashboard/tenant-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'integrations.meta_pixel_id': raw }),
      })
      if (!res.ok) {
        // Un 403 (administrador de sede, SEG-3) trae su motivo en español: se muestra tal cual.
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Error guardando el píxel')
      }
      setMetaPixelId(normalizeMetaPixelId(raw) ?? '')

      // El token va aparte y SOLO si escribieron algo: un campo vacío no borra
      // el token guardado (para borrarlo está el botón «Quitar token»).
      const token = capiToken.trim()
      if (token !== '') {
        const resToken = await fetch('/api/dashboard/meta-conversions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (!resToken.ok) {
          const data = await resToken.json().catch(() => ({}))
          throw new Error(data.error ?? 'Error guardando el token')
        }
        setCapiToken('')
        setCapiConfigured(true)
        setCapiUpdatedAt(new Date().toISOString())
        setCapiUnavailable(null)
      }

      setPixelSaved(true)
      setTimeout(() => setPixelSaved(false), 3000)
    } catch (err) {
      setPixelError(err instanceof Error ? err.message : 'Error guardando')
    } finally {
      setPixelSaving(false)
    }
  }

  const handleRemoveCapiToken = async () => {
    setPixelError(null)
    setPixelSaving(true)
    try {
      const res = await fetch('/api/dashboard/meta-conversions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: '' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Error quitando el token')
      }
      setCapiConfigured(false)
      setCapiUpdatedAt(null)
    } catch (err) {
      setPixelError(err instanceof Error ? err.message : 'Error quitando el token')
    } finally {
      setPixelSaving(false)
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

  // «Ubicación del Local» no guarda nada desde aquí: la sección está bajo «Próximamente» y su
  // `handleSaveLocation()` (con un `catch` vacío y sin botón que lo llamara) se retiró el
  // 2026-10-15 (OPER-4-mudo). La ubicación de cada sede se edita en Mis sedes.

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


  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6" strokeWidth={1.5} style={{ color: '#6b7280' }} />
        <h1 className="font-playfair text-3xl font-bold" style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}>
          Ajustes
        </h1>
      </div>

      {loadError && (
        <div role="alert" className="max-w-2xl rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {loadError}
        </div>
      )}

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
        <ErrorDeGuardado mensaje={benefitsError} />
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
          <ErrorDeGuardado mensaje={pointsError} />
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
          <ErrorDeGuardado mensaje={checkinError} />
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

      {/* ─── PREMIOS PARA REGALAR ─── */}
      {/* Hasta el 2026-10-13 acá estaba el «Premio de Reactivación Agresiva» (premio, ventana y
          recordatorio de vencimiento) y, dentro de Reseñas, el premio de la reseña. Ahora todos los
          premios que se regalan se eligen en UNA pestaña de Recompensas, junto al catálogo. Queda
          esta tarjeta porque varios avisos del sistema todavía dicen «configúralo en Ajustes». */}
      <div className="dashboard-card p-6 max-w-2xl" style={{ border: '1px solid rgba(245, 158, 11, 0.2)' }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(245, 158, 11, 0.15)' }}>
            <Gift className="h-5 w-5" strokeWidth={1.5} style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>Premios para regalar</h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Ahora viven en Recompensas.</p>
          </div>
        </div>
        <p className="text-sm mb-4" style={{ color: '#6b7280' }}>
          El premio de la reactivación (y cuánto dura), el regalo pequeño, el premio por reseña y el aviso
          antes de que un premio venza se eligen en <strong>Recompensas → Premios para regalar</strong>,
          junto al catálogo de premios.
        </p>
        <Link
          href="/dashboard/rewards?tab=premios"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}
        >
          Ir a Premios para regalar
          <ArrowRight className="h-4 w-4" />
        </Link>
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

        <p className="mt-4 text-[11px]" style={{ color: '#9ca3af' }}>
          El premio que gana el cliente por su reseña, y cuántos días tiene para reclamarlo, se elige en{' '}
          <Link href="/dashboard/rewards?tab=premios" className="underline">Recompensas → Premios para regalar</Link>.
        </p>

        {reviewError && (
          <p className="text-xs mt-3 font-medium" style={{ color: '#ef4444' }}>{reviewError}</p>
        )}

        <div className="mt-4">
          <SaveButton saving={reviewSaving} saved={reviewSaved} onClick={handleSaveReview} disabled={reviewSaving || loading} />
        </div>
      </div>

      {/* ─── PÍXEL DE META (dueño, 2026-09-10) ─── */}
      <div className="dashboard-card p-6 max-w-2xl" style={{ border: '1px solid rgba(24, 119, 242, 0.2)' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(24, 119, 242, 0.15)' }}>
            <Megaphone className="h-5 w-5" strokeWidth={1.5} style={{ color: '#1877F2' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>Píxel de Meta</h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Conectá tu cuenta publicitaria de Facebook e Instagram para tirar campañas con la gente que abre tu enlace, se registra y vuelve.</p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>ID de tu píxel</label>
          <Input
            type="text"
            inputMode="numeric"
            value={metaPixelId}
            onChange={(e) => setMetaPixelId(e.target.value)}
            disabled={loading}
            placeholder="1234567890123456"
          />
          <p className="text-[10px]" style={{ color: '#b0b0b0' }}>
            Sácalo del <span className="font-semibold">Administrador de eventos</span> de Meta → <em>Orígenes de datos</em>. Es solo el número: no pegues el código ni un enlace. <span className="font-semibold">Déjalo vacío para desconectarlo.</span>
          </p>
        </div>

        <div className="mt-4 space-y-1">
          <label className="text-[11px] font-semibold" style={{ color: '#6b7280' }}>Token de la API de Conversiones</label>
          <Input
            type="password"
            autoComplete="off"
            value={capiToken}
            onChange={(e) => setCapiToken(e.target.value)}
            disabled={loading || Boolean(capiUnavailable)}
            placeholder={capiConfigured ? '•••••••• (ya hay uno guardado; pegá otro para reemplazarlo)' : 'EAAG…'}
          />
          <p className="text-[10px]" style={{ color: '#b0b0b0' }}>
            Mismo Administrador de eventos → tu píxel → <em>Configuración</em> → <em>API de Conversiones</em> → <span className="font-semibold">Generar token de acceso</span>. Con él, tus check-ins se miden aunque el cliente tenga un bloqueador de anuncios. <span className="font-semibold">No se vuelve a mostrar</span>: si lo perdés, generás otro.
          </p>
          {capiUnavailable && (
            <p className="text-[10px] font-medium" style={{ color: '#d97706' }}>{capiUnavailable}</p>
          )}
          {capiConfigured && !capiUnavailable && (
            <p className="text-[10px]" style={{ color: '#6b7280' }}>
              Token guardado{capiUpdatedAt ? ` el ${new Date(capiUpdatedAt).toLocaleDateString('es-CO')}` : ''}.{' '}
              <button type="button" onClick={handleRemoveCapiToken} disabled={pixelSaving} className="underline">Quitar token</button>
            </p>
          )}
        </div>

        <div className="mt-4 rounded-xl p-3 text-[11px] leading-relaxed" style={{ background: 'rgba(24, 119, 242, 0.06)', color: '#4b5563' }}>
          <p className="mb-1"><span className="font-semibold">Qué se le manda a Meta:</span> que alguien vio la página, se registró o hizo check-in, con tu marca y tu sede; y, desde el servidor, <span className="font-semibold">el celular del cliente cifrado</span> (SHA-256) para que Meta lo reconozca aunque el píxel del navegador esté bloqueado.</p>
          <p className="mb-1"><span className="font-semibold">Qué NO se le manda:</span> el nombre, el correo, el cumpleaños, la ciudad ni los puntos de tus clientes.</p>
          <p>Las pantallas del {'mesero'} no se miden — si no, tu propio personal entraría a la audiencia como si fuera tu mejor cliente. Tus clientes lo aceptan al registrarse y ven un aviso con enlace a la <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline">política de privacidad</a>.</p>
        </div>

        {pixelError && (
          <p className="text-xs mt-3 font-medium" style={{ color: '#ef4444' }}>{pixelError}</p>
        )}

        <div className="mt-4">
          <SaveButton saving={pixelSaving} saved={pixelSaved} onClick={handleSavePixel} disabled={pixelSaving || loading} />
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

      {/* ─── PLANTILLAS WHATSAPP ─── */}
      {/* Hasta el 2026-10-11 acá había 15 desplegables y un «Guardar» para asignar plantillas
          que se creaban en otra pantalla. Ahora crear, mandar a Meta y elegir es UNA sola
          pantalla, Plantillas, para Twilio y Zernio. Queda esta tarjeta porque varios avisos
          del sistema todavía dicen «configúrala en Ajustes». */}
      <div className="dashboard-card p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(99, 102, 241, 0.15)' }}>
            <Mail className="h-5 w-5" strokeWidth={1.5} style={{ color: '#6366f1' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>Plantillas WhatsApp</h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Ahora viven en un solo lugar.</p>
          </div>
        </div>
        <p className="text-sm mb-4" style={{ color: '#6b7280' }}>
          Los mensajes que tu negocio envía solo (bienvenida, puntos, cumpleaños, recordatorios…) se crean,
          se mandan a WhatsApp y se eligen en <strong>Plantillas</strong>. Allí ves el estado real de cada
          uno y, si WhatsApp rechazó alguno, el motivo.
        </p>
        <Link
          href="/dashboard/templates"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}
        >
          Ir a Plantillas
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
