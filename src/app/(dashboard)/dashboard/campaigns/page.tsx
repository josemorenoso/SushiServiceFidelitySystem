'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import Link from 'next/link'
import { Megaphone, Cake, UserX, Send, Zap, Clock, CheckCircle, AlertTriangle, Settings2, MessageSquareText, BarChart3, CalendarClock } from 'lucide-react'
import { ManualCampaigns } from '@/components/dashboard/ManualCampaigns'
import { AtRiskBubbles } from '@/components/dashboard/AtRiskBubbles'
import { WalletCard } from '@/components/dashboard/WalletCard'
import { SegmentRadar } from '@/components/dashboard/SegmentRadar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useDemo } from '@/contexts/DemoContext'
import { useLocationScope } from '@/contexts/LocationScopeContext'
import { useDashboardAnalytics } from '@/hooks/useDashboardAnalytics'
import { FREQUENCY_CAP_DAYS, RECOVERY_ZONE_START_DAYS, RECOVERY_ZONE_END_DAYS } from '@/constants/rewards'

interface Campaign {
  id: string
  name: string
  type: string
  status: string
  total_sent: number
  executed_at: string | null
  created_at: string
}

interface TwilioTemplate {
  sid: string
  friendly_name: string
  body: string
  approval_status: string
}

interface AutoCampaignDef {
  type: 'birthday' | 'reactivation'
  label: string
  icon: typeof Cake
  color: string
  bg: string
  border: string
  description: (softDays: string, aggressiveDays: string) => string
  cron: string
  templateSettingKeys: string[]
}

const autoCampaigns: AutoCampaignDef[] = [
  {
    type: 'birthday',
    label: 'Cumpleaños',
    icon: Cake,
    color: 'text-pink-600',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    description: () => 'Envía un saludo automático a los clientes que cumplen años hoy. Prioridad absoluta: ignora el cap de frecuencia.',
    cron: 'Todos los días a las 8:00 AM',
    templateSettingKeys: ['birthday_template_sid'],
  },
  {
    type: 'reactivation',
    label: 'Reactivación',
    icon: UserX,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    description: (softDays, aggressiveDays) =>
      `Recupera clientes inactivos en dos toques: suave a los ${softDays} días y agresivo a los ${aggressiveDays} días. Los días se ajustan en Ajustes.`,
    cron: 'Todos los días a las 10:00 AM',
    templateSettingKeys: ['reactivation_no_reward_template_sid', 'reactivation_with_reward_template_sid', 'reactivation_template_sid'],
  },
]

const statusLabels: Record<string, string> = {
  completed: 'Finalizada',
  running: 'En curso',
  draft: 'Borrador',
  failed: 'Fallida',
}

/**
 * Apartado de Campañas.
 *
 * REQUERIMIENTOS_AGOSTO_2026.md §15.3 — textual del dueño: *"considerando el día
 * a día del cliente deberíamos eliminar las burbujas flotantes catalogadas por
 * días en el dashboard y meterla en el área de campañas"*. `AtRiskBubbles` se
 * mudó desde `/dashboard` a la pestaña **Manuales**, que es donde vive el resto
 * de lo que dispara envíos a mano: el diálogo de la burbuja publica en
 * `/api/dashboard/campaigns/manual`, igual que `ManualCampaigns`.
 */
export default function CampaignsPage() {
  const { isDemo } = useDemo()
  const { data: analytics, loading: analyticsLoading } = useDashboardAnalytics()
  const { queryParam: locationQueryParam } = useLocationScope()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [templates, setTemplates] = useState<TwilioTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [manualDialog, setManualDialog] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [runSummary, setRunSummary] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  // Multi-sede F7 (§8.4): `campaigns.location_id` la deja NULL cualquier
  // escritor hoy (F6 la llena), así que este filtro es un no-op para el
  // `role='brand'` de los 4 tenants vivos y queda listo para cuando F6 exista.
  const campaignsUrl = locationQueryParam
    ? `/api/dashboard/campaigns?${locationQueryParam}`
    : '/api/dashboard/campaigns'

  useEffect(() => {
    Promise.all([
      fetch(campaignsUrl).then((res) => res.json()).catch(() => []),
      fetch('/api/dashboard/settings').then((res) => res.json()).catch(() => ({})),
      fetch('/api/dashboard/templates').then((res) => res.json()).catch(() => ({ templates: [] })),
    ])
      .then(([campaignsData, settingsData, templatesData]) => {
        setCampaigns(Array.isArray(campaignsData) ? campaignsData : [])
        setSettings(settingsData && typeof settingsData === 'object' ? settingsData : {})
        setTemplates(Array.isArray(templatesData?.templates) ? templatesData.templates : [])
      })
      .finally(() => setLoading(false))
  }, [campaignsUrl])

  const softDays = settings.reactivation_soft_days ?? '21'
  const aggressiveDays = settings.reactivation_aggressive_days ?? '25'

  /** SID de plantilla configurada para una campaña automática (primer setting con valor). */
  const configuredTemplateSid = (keys: string[]): string | null => {
    for (const key of keys) {
      if (settings[key]) return settings[key]
    }
    return null
  }

  const templateBody = (sid: string | null): string | null => {
    if (!sid) return null
    return templates.find((t) => t.sid === sid)?.body ?? null
  }

  // KPIs del mes en curso
  const now = new Date()
  const monthCampaigns = campaigns.filter((c) => {
    const d = new Date(c.executed_at ?? c.created_at)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  const monthSent = monthCampaigns.reduce((acc, c) => acc + (c.total_sent ?? 0), 0)
  const lastExecution = campaigns.find((c) => c.executed_at)?.executed_at ?? null

  const handleManualCampaign = async (type: string) => {
    setSending(true)
    setRunError(null)
    setRunSummary(null)
    try {
      const res = await fetch('/api/dashboard/campaigns/run-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) {
        setRunError(data.error || 'La campaña no se pudo ejecutar. Revisa la configuración de plantillas en Ajustes.')
        return
      }
      const audience = type === 'birthday'
        ? (data.total_birthday_customers ?? 0)
        : (data.total_inactive_customers ?? 0)
      setRunSummary(
        `Enviados: ${data.sent ?? 0}` +
        (data.failed ? ` · Fallidos: ${data.failed}` : '') +
        ` · Audiencia detectada: ${audience}`
      )
      setSent(type)
      setTimeout(() => {
        fetch(campaignsUrl)
          .then((res) => res.json())
          .then((data) => setCampaigns(Array.isArray(data) ? data : []))
      }, 1000)
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Error de red ejecutando la campaña')
    } finally {
      setSending(false)
    }
  }

  const typeLabels: Record<string, string> = {
    birthday: 'Cumpleaños',
    reactivation: 'Reactivación',
    manual: 'Manual',
  }

  const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    completed: 'default',
    running: 'secondary',
    draft: 'outline',
    failed: 'destructive',
  }

  const recentByType = (type: string) =>
    campaigns.filter((c) => c.type === type).slice(0, 1)[0]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Megaphone className="h-6 w-6" />
          Campañas
        </h1>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Configurar plantillas y días
        </Link>
      </div>

      {/* ─── KPIs del mes ─── */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-lg bg-blue-50 p-2">
              <BarChart3 className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Campañas este mes</p>
              <p className="text-lg font-bold">{loading ? '—' : monthCampaigns.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-lg bg-green-50 p-2">
              <Send className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Mensajes enviados (mes)</p>
              <p className="text-lg font-bold">{loading ? '—' : monthSent}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="rounded-lg bg-purple-50 p-2">
              <CalendarClock className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Última ejecución</p>
              <p className="text-lg font-bold">
                {loading ? '—' : lastExecution ? new Date(lastExecution).toLocaleDateString('es-CO') : 'Nunca'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <SegmentRadar />

      <Tabs defaultValue="automaticas">
        <TabsList className="w-full">
          <TabsTrigger value="automaticas" className="flex-1">Automáticas</TabsTrigger>
          <TabsTrigger value="manuales" className="flex-1">Manuales</TabsTrigger>
          <TabsTrigger value="historial" className="flex-1">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="automaticas" className="space-y-4 pt-4">

      <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Las campañas automáticas se ejecutan solas todos los días — no tienes que hacer nada.
          Solo asegúrate de que cada una tenga su plantilla configurada (badge verde <strong>Activa</strong>).
        </span>
      </div>

      {/* ─── Ciclo de recuperación del cliente ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ciclo de recuperación del cliente</CardTitle>
          <CardDescription>
            Cada cliente recorre este camino desde su última visita. El sistema coordina los mensajes
            para traerlo de regreso sin saturarlo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-5">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Día 0</p>
              <p className="text-sm font-semibold text-emerald-900 mt-0.5">Visita</p>
              <p className="text-xs text-emerald-800/80 mt-1">
                Escanea el QR o pide domicilio. Gana puntos y arranca el ciclo.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Días 1–{FREQUENCY_CAP_DAYS}</p>
              <p className="text-sm font-semibold mt-0.5">Protegido</p>
              <p className="text-xs text-muted-foreground mt-1">
                Cap de frecuencia: no recibe marketing. La experiencia manda.
              </p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">Días {FREQUENCY_CAP_DAYS}–{RECOVERY_ZONE_START_DAYS - 1}</p>
              <p className="text-sm font-semibold text-blue-900 mt-0.5">Ventana manual</p>
              <p className="text-xs text-blue-800/80 mt-1">
                Burbujas de riesgo y campañas manuales con filtro por días sin venir.
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Días {RECOVERY_ZONE_START_DAYS}–{RECOVERY_ZONE_END_DAYS}</p>
              <p className="text-sm font-semibold text-amber-900 mt-0.5">Recuperación automática</p>
              <p className="text-xs text-amber-800/80 mt-1">
                Zona reservada: toque suave al día {softDays} y agresivo al día {aggressiveDays}, sin intervención tuya.
              </p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50/60 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">Día {RECOVERY_ZONE_END_DAYS + 1}+</p>
              <p className="text-sm font-semibold text-red-900 mt-0.5">Rescate</p>
              <p className="text-xs text-red-800/80 mt-1">
                Campaña manual &quot;Rescatar Perdidos&quot; con oferta fuerte: última oportunidad.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {autoCampaigns.map((ac) => {
          const recent = recentByType(ac.type)
          const templateSid = configuredTemplateSid(ac.templateSettingKeys)
          const isConfigured = !!templateSid
          const preview = templateBody(templateSid)
          return (
            <Card key={ac.type} className={`border ${ac.border}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className={`rounded-lg p-1.5 ${ac.bg}`}>
                      <ac.icon className={`h-4 w-4 ${ac.color}`} />
                    </div>
                    {ac.label}
                  </CardTitle>
                  {loading ? (
                    <Skeleton className="h-5 w-20" />
                  ) : isConfigured ? (
                    <Badge className="gap-1 bg-green-100 text-green-800 hover:bg-green-100">
                      <CheckCircle className="h-3 w-3" />
                      Activa
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Sin plantilla
                    </Badge>
                  )}
                </div>
                <CardDescription>{ac.description(softDays, aggressiveDays)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{ac.cron}</span>
                  </div>
                  {preview ? (
                    <div className="flex items-start gap-2">
                      <MessageSquareText className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                      <p className="text-muted-foreground italic line-clamp-3">&quot;{preview}&quot;</p>
                    </div>
                  ) : !loading && (
                    <p className="text-red-600">
                      No se enviará ningún mensaje hasta asignar una plantilla en{' '}
                      <Link href="/dashboard/settings" className="underline font-medium">Ajustes</Link>.
                    </p>
                  )}
                </div>

                {recent && (
                  <div className="flex items-center justify-between rounded-lg border p-2 text-xs">
                    <span className="text-muted-foreground">Última ejecución:</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusColors[recent.status] ?? 'secondary'} className="text-xs">
                        {statusLabels[recent.status] ?? recent.status}
                      </Badge>
                      <span className="font-semibold">{recent.total_sent} enviados</span>
                      <span className="text-muted-foreground">
                        {new Date(recent.executed_at ?? recent.created_at).toLocaleDateString('es-CO')}
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => setManualDialog(ac.type)}
                  disabled={!isConfigured}
                >
                  <Send className="h-3.5 w-3.5" />
                  {isConfigured ? 'Ejecutar Ahora' : 'Configura una plantilla primero'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

          <WalletCard />

        </TabsContent>

        <TabsContent value="manuales" className="space-y-4 pt-4">
          <AtRiskBubbles
            groups={analytics?.brand.atRiskGroups ?? []}
            loading={analyticsLoading}
            isDemo={isDemo}
          />
          <ManualCampaigns />
        </TabsContent>

        <TabsContent value="historial" className="pt-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Historial de Campañas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No hay campañas ejecutadas aún. Usa los botones de arriba o espera los cron jobs automáticos.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaña</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Enviados</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {typeLabels[c.type] ?? c.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={statusColors[c.status] ?? 'secondary'}>
                        {statusLabels[c.status] ?? c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-semibold">
                      {c.total_sent}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.executed_at
                        ? new Date(c.executed_at).toLocaleDateString('es-CO')
                        : new Date(c.created_at).toLocaleDateString('es-CO')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </TabsContent>

      </Tabs>

      <Dialog open={!!manualDialog} onOpenChange={() => { setManualDialog(null); setSent(null); setRunSummary(null); setRunError(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ejecutar campaña: {manualDialog === 'birthday' ? 'Cumpleaños' : 'Reactivación'}
            </DialogTitle>
            <DialogDescription>
              {manualDialog === 'birthday'
                ? 'Se enviará un mensaje de WhatsApp a todos los clientes que cumplen años hoy.'
                : `Se enviará un mensaje de WhatsApp a todos los clientes inactivos (${softDays}+ días).`}
            </DialogDescription>
          </DialogHeader>
          {manualDialog && (() => {
            const def = autoCampaigns.find((a) => a.type === manualDialog)
            const preview = def ? templateBody(configuredTemplateSid(def.templateSettingKeys)) : null
            return preview ? (
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-medium flex items-center gap-1.5">
                  <MessageSquareText className="h-3 w-3" />
                  Mensaje que recibirán:
                </p>
                <p className="italic text-muted-foreground">&quot;{preview}&quot;</p>
              </div>
            ) : null
          })()}
          {sent && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-start gap-2">
              <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Campaña ejecutada.</p>
                {runSummary && <p className="mt-0.5 text-xs">{runSummary}</p>}
              </div>
            </div>
          )}
          {runError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              {runError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setManualDialog(null); setSent(null); setRunSummary(null); setRunError(null) }}>
              Cerrar
            </Button>
            {!sent && (
              <Button
                onClick={() => manualDialog && handleManualCampaign(manualDialog)}
                disabled={sending}
                className="gap-2"
              >
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
