'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Filter,
  Send,
  Users,
  Store,
  Truck,
  Sparkles,
  MapPin,
  Calendar,
  Hash,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  FileText,
  Crown,
  Gift,
  UserX,
  History,
} from 'lucide-react'
import { CampaignCostEstimate } from './TwilioWallet'

interface CampaignFilters {
  city: string
  minVisits: string
  maxVisits: string
  minAge: string
  maxAge: string
  minDays: string
  maxDays: string
  source: 'all' | 'qr_only' | 'delivery_only'
}

interface TwilioTemplate {
  sid: string
  friendly_name: string
  body: string
  approval_status: string
  status: string
  category: string
  /** true = plantilla twilio/media (eventos del calendario) — no sirve para campañas de texto */
  has_media?: boolean
}

interface PresetCampaign {
  id: string
  name: string
  description: string
  icon: typeof Store
  color: string
  bg: string
  border: string
  filters: Partial<CampaignFilters>
  /**
   * Clave de `admin_settings` con el SID de la plantilla propia de este preset.
   *
   * Solo la declaran los presets cuyo mensaje NO existe en ninguna otra
   * plantilla — los que sin ella no pueden enviar nada. Los que no la declaran
   * son atajos de segmentación: sirven con cualquier plantilla aprobada que el
   * operador elija abajo, así que siempre se muestran.
   *
   * Ver `isPresetSendable()` y REQUERIMIENTOS_AGOSTO_2026.md §15.2.
   */
  templateSettingKey?: string
}

const PRESETS: PresetCampaign[] = [
  {
    id: 'invite_restaurant',
    name: 'Invitar al Restaurante',
    description: 'Clientes que solo piden domicilio pero nunca han visitado el restaurante. ¡Incentivarlos a venir!',
    icon: Store,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    filters: { source: 'delivery_only', minVisits: '1' },
    // Plantilla "Campaña — invitar a visitar el local" del catálogo estándar (§12).
    templateSettingKey: 'campaign_domicilio_to_presencial_template_sid',
  },
  {
    id: 'invite_delivery',
    name: 'Invitar a pedir Domicilio',
    description: 'Clientes frecuentes del restaurante que nunca han pedido domicilio. ¡Que conozcan el servicio!',
    icon: Truck,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    filters: { source: 'qr_only', minVisits: '1' },
    // Plantilla "Campaña — invitar a pedir a domicilio" del catálogo estándar (§12).
    templateSettingKey: 'campaign_presencial_to_domicilio_template_sid',
  },
  {
    id: 'black_exclusive',
    name: 'Exclusiva Black',
    description: 'Solo clientes Black (10+ visitas). Eventos privados, ofertas VIP, o agradecimiento especial.',
    icon: Crown,
    color: 'text-amber-500',
    bg: 'bg-gradient-to-r from-gray-900/5 to-amber-50',
    border: 'border-amber-300',
    filters: { minVisits: '10' },
  },
  {
    id: 'near_reward',
    name: 'Cerca de un Premio',
    description: 'Clientes entre 2 y 9 visitas que están cerca de alcanzar su próxima recompensa. ¡Motivarlos a volver!',
    icon: Gift,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    filters: { minVisits: '2', maxVisits: '9' },
  },
  {
    id: 'rescue_lost',
    name: 'Rescatar Perdidos',
    description: 'Clientes con 26+ días sin venir (ya fuera del radar automático de reactivación). Última oportunidad con una oferta fuerte.',
    icon: UserX,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    filters: { minDays: '26' },
  },
]

const emptyFilters: CampaignFilters = {
  city: '',
  minVisits: '',
  maxVisits: '',
  minAge: '',
  maxAge: '',
  minDays: '',
  maxDays: '',
  source: 'all',
}

/**
 * ¿Este preset puede enviar algo de verdad hoy?
 *
 * REQUERIMIENTOS_AGOSTO_2026.md §15.2 — el dueño detectó dos campañas que se
 * ofrecían sin tener plantilla aprobada detrás: *"hay campañas como invitar a
 * restaurante los que piden domi o invitar a que pidan domi los que van a
 * restaurante, que no tienen plantillas y no van a poder usarse, son básicamente
 * de mentira"*.
 *
 * La regla es genérica a propósito, porque la decisión de fondo (15.b: ¿se
 * eliminan esos dos presets o se les crea plantilla?) sigue abierta y esta regla
 * sirve para las dos salidas:
 *
 *   - un preset que declara `templateSettingKey` se muestra SOLO si esa clave de
 *     `admin_settings` apunta a una plantilla que existe y está aprobada;
 *   - un preset sin `templateSettingKey` no depende de ninguna plantilla propia
 *     y se muestra siempre.
 *
 * Efecto hoy: los dos presets fantasma desaparecen solos. El día que se les cree
 * y apruebe la plantilla, reaparecen sin tocar una línea de código.
 *
 * @param approvedSids SIDs de plantillas aprobadas y sin media (las únicas que
 *                     el camino de campañas puede enviar).
 */
function isPresetSendable(
  preset: PresetCampaign,
  settings: Record<string, string>,
  approvedSids: Set<string>
): boolean {
  if (!preset.templateSettingKey) return true
  const sid = settings[preset.templateSettingKey]
  return !!sid && approvedSids.has(sid)
}

export function ManualCampaigns() {
  const [filters, setFilters] = useState<CampaignFilters>(emptyFilters)
  const [matchCount, setMatchCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<PresetCampaign | null>(null)
  const [templates, setTemplates] = useState<TwilioTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<TwilioTemplate | null>(null)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [settings, setSettings] = useState<Record<string, string> | null>(null)
  const [confirmDialog, setConfirmDialog] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendSummary, setSendSummary] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    try {
      const res = await fetch('/api/dashboard/templates')
      const data = await res.json()
      // Solo texto aprobado: las plantillas twilio/media (eventos del calendario)
      // exigen la variable de media {{6}} y fallarían enviadas como campaña.
      const approved = (data.templates ?? []).filter(
        (t: TwilioTemplate) =>
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

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  // `admin_settings` dice qué plantilla tiene asignada cada preset (§15.2).
  useEffect(() => {
    fetch('/api/dashboard/settings')
      .then((res) => res.json())
      .then((data) => setSettings(data && typeof data === 'object' ? data : {}))
      .catch(() => setSettings({}))
  }, [])

  const approvedSids = useMemo(() => new Set(templates.map((t) => t.sid)), [templates])

  /** Presets que hoy pueden enviar de verdad. El resto ni se dibuja (§15.2). */
  const visiblePresets = useMemo(
    () => (settings === null ? [] : PRESETS.filter((p) => isPresetSendable(p, settings, approvedSids))),
    [settings, approvedSids]
  )

  // "Listo" es la PRIMERA carga, no cada sincronización: re-sincronizar no debe
  // hacer desaparecer la rejilla de presets a mitad de uso.
  const presetsReady = settings !== null && templatesLoaded

  // Si el preset elegido deja de ser enviable (p. ej. tras "Sincronizar" porque
  // Meta revocó la plantilla), se deselecciona para no enviar a ciegas.
  useEffect(() => {
    if (!presetsReady || !selectedPreset) return
    if (!visiblePresets.some((p) => p.id === selectedPreset.id)) {
      setSelectedPreset(null)
    }
  }, [presetsReady, selectedPreset, visiblePresets])

  const fetchCount = useCallback(async (f: CampaignFilters) => {
    setLoadingCount(true)
    try {
      const params = new URLSearchParams()
      if (f.city) params.set('city', f.city)
      if (f.minVisits) params.set('minVisits', f.minVisits)
      if (f.maxVisits) params.set('maxVisits', f.maxVisits)
      if (f.minAge) params.set('minAge', f.minAge)
      if (f.maxAge) params.set('maxAge', f.maxAge)
      if (f.minDays) params.set('minDays', f.minDays)
      if (f.maxDays) params.set('maxDays', f.maxDays)
      if (f.source !== 'all') params.set('source', f.source)

      const res = await fetch(`/api/dashboard/campaigns/estimate?${params}`)
      const data = await res.json()
      setMatchCount(data.count ?? 0)
    } catch {
      setMatchCount(null)
    } finally {
      setLoadingCount(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCount(filters)
    }, 500)
    return () => clearTimeout(timer)
  }, [filters, fetchCount])

  const handlePresetSelect = (preset: PresetCampaign) => {
    setSelectedPreset(preset)
    const newFilters = { ...emptyFilters, ...preset.filters }
    setFilters(newFilters)
  }

  const handleSend = async () => {
    if (!selectedTemplate) return
    setSending(true)
    setSendError(null)
    setSendSummary(null)
    try {
      const res = await fetch('/api/dashboard/campaigns/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedPreset?.name ?? 'Campaña Manual',
          filters,
          templateSid: selectedTemplate.sid,
          messageTemplate: selectedTemplate.body,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.reason === 'insufficient_balance') {
          setSendError(
            `Saldo insuficiente: la campaña necesita ${data.recipients} mensajes y el saldo alcanza para ${data.messagesAvailable}. Recarga tu billetera para continuar.`
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

  const handleReset = () => {
    setFilters(emptyFilters)
    setSelectedPreset(null)
    setSelectedTemplate(null)
    setConfirmDialog(false)
    setSent(false)
    setSendSummary(null)
    setSendError(null)
  }

  const updateFilter = (key: keyof CampaignFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-4">
      {!presetsReady && (
        <p className="text-xs text-muted-foreground">Cargando campañas predefinidas...</p>
      )}

      {presetsReady && visiblePresets.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">No hay campañas predefinidas disponibles</p>
            <p className="mt-1">
              Cada campaña predefinida necesita su plantilla aprobada por Meta. Asígnalas en{' '}
              <strong>Plantillas</strong> y volverán a aparecer aquí solas. Mientras tanto puedes
              enviar con los filtros de abajo.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {visiblePresets.map((preset) => (
          <Card
            key={preset.id}
            className={`border cursor-pointer transition-all hover:shadow-md ${
              selectedPreset?.id === preset.id ? preset.border + ' ring-2 ring-offset-1 ring-primary/30' : 'border-border'
            }`}
            onClick={() => handlePresetSelect(preset)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className={`rounded-lg p-1.5 ${preset.bg}`}>
                  <preset.icon className={`h-4 w-4 ${preset.color}`} />
                </div>
                {preset.name}
                <Badge variant="outline" className="ml-auto text-xs gap-1">
                  <Sparkles className="h-3 w-3" />
                  Predefinida
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">{preset.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground italic line-clamp-2">{preset.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros de Segmentación
          </CardTitle>
          <CardDescription>Define tu audiencia objetivo para la campaña</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Ciudad
              </Label>
              <Input
                placeholder="Ej: Bogotá"
                value={filters.city}
                onChange={(e) => updateFilter('city', e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Hash className="h-3 w-3" /> Visitas mínimas
              </Label>
              <Input
                type="number"
                placeholder="0"
                value={filters.minVisits}
                onChange={(e) => updateFilter('minVisits', e.target.value)}
                className="h-9"
                min={0}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Hash className="h-3 w-3" /> Visitas máximas
              </Label>
              <Input
                type="number"
                placeholder="∞"
                value={filters.maxVisits}
                onChange={(e) => updateFilter('maxVisits', e.target.value)}
                className="h-9"
                min={0}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Edad mínima
              </Label>
              <Input
                type="number"
                placeholder="18"
                value={filters.minAge}
                onChange={(e) => updateFilter('minAge', e.target.value)}
                className="h-9"
                min={0}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Edad máxima
              </Label>
              <Input
                type="number"
                placeholder="99"
                value={filters.maxAge}
                onChange={(e) => updateFilter('maxAge', e.target.value)}
                className="h-9"
                min={0}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <History className="h-3 w-3" /> Días sin venir (mín)
              </Label>
              <Input
                type="number"
                placeholder="Ej: 15"
                value={filters.minDays}
                onChange={(e) => updateFilter('minDays', e.target.value)}
                className="h-9"
                min={0}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <History className="h-3 w-3" /> Días sin venir (máx)
              </Label>
              <Input
                type="number"
                placeholder="∞"
                value={filters.maxDays}
                onChange={(e) => updateFilter('maxDays', e.target.value)}
                className="h-9"
                min={0}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Users className="h-3 w-3" /> Tipo de cliente
              </Label>
              <select
                value={filters.source}
                onChange={(e) => updateFilter('source', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">Todos</option>
                <option value="qr_only">Solo Restaurante (QR)</option>
                <option value="delivery_only">Solo Domicilio</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                Clientes que coinciden:
                {loadingCount ? (
                  <span className="ml-1 text-muted-foreground">calculando...</span>
                ) : (
                  <strong className="ml-1 text-primary">{matchCount ?? '—'}</strong>
                )}
              </span>
            </div>
            <CampaignCostEstimate recipientCount={matchCount ?? 0} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1">
                <FileText className="h-3 w-3" /> Plantilla aprobada por WhatsApp
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchTemplates}
                disabled={loadingTemplates}
                className="h-6 text-xs gap-1"
              >
                <RefreshCw className={`h-3 w-3 ${loadingTemplates ? 'animate-spin' : ''}`} />
                Sincronizar
              </Button>
            </div>

            {templates.length === 0 && !loadingTemplates && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">No hay plantillas aprobadas</p>
                  <p className="mt-1">Meta/WhatsApp requiere que los mensajes de campañas usen plantillas pre-aprobadas. Ve a <strong>Plantillas</strong> para crear y enviar plantillas a aprobación.</p>
                </div>
              </div>
            )}

            {loadingTemplates && (
              <p className="text-xs text-muted-foreground">Cargando plantillas...</p>
            )}

            {templates.length > 0 && (
              <div className="space-y-2">
                {templates.map((t) => (
                  <div
                    key={t.sid}
                    onClick={() => setSelectedTemplate(t)}
                    className={`cursor-pointer rounded-lg border p-3 text-xs transition-all hover:shadow-sm ${
                      selectedTemplate?.sid === t.sid
                        ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{t.friendly_name}</span>
                      <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 italic">&quot;{t.body}&quot;</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => setConfirmDialog(true)}
              disabled={!selectedTemplate || (matchCount ?? 0) === 0}
              className="gap-2 flex-1"
            >
              <Send className="h-4 w-4" />
              Enviar Campaña ({matchCount ?? 0} destinatarios)
            </Button>
            <Button variant="outline" onClick={handleReset}>
              Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmDialog} onOpenChange={() => { setConfirmDialog(false); setSent(false); setSendError(null); setSendSummary(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Campaña Manual</DialogTitle>
            <DialogDescription>
              Se enviará un mensaje de WhatsApp a <strong>{matchCount}</strong> clientes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border p-3 text-xs space-y-1">
              <p><strong>Filtros:</strong></p>
              {filters.city && <p>Ciudad: {filters.city}</p>}
              {filters.minVisits && <p>Visitas mín: {filters.minVisits}</p>}
              {filters.maxVisits && <p>Visitas máx: {filters.maxVisits}</p>}
              {filters.minDays && <p>Días sin venir mín: {filters.minDays}</p>}
              {filters.maxDays && <p>Días sin venir máx: {filters.maxDays}</p>}
              {filters.source !== 'all' && <p>Tipo: {filters.source === 'qr_only' ? 'Solo QR' : 'Solo Domicilio'}</p>}
              {filters.minAge && <p>Edad mín: {filters.minAge}</p>}
              {filters.maxAge && <p>Edad máx: {filters.maxAge}</p>}
            </div>

            <CampaignCostEstimate recipientCount={matchCount ?? 0} />

            {selectedTemplate && (
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-medium">{selectedTemplate.friendly_name}</p>
                <p className="italic">&quot;{selectedTemplate.body}&quot;</p>
              </div>
            )}

            {sent && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Campaña enviada.</p>
                  {sendSummary && <p className="mt-0.5 text-xs">{sendSummary}</p>}
                </div>
              </div>
            )}

            {sendError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {sendError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmDialog(false); setSent(false) }}>
              {sent ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!sent && (
              <Button onClick={handleSend} disabled={sending} className="gap-2">
                <Send className="h-4 w-4" />
                {sending ? 'Enviando...' : 'Confirmar y Enviar'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
