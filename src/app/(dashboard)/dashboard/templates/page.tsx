'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Plus,
  Eye,
  AlertTriangle,
  MessageSquare,
  RefreshCw,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  CloudUpload,
  ChevronDown,
  ShieldAlert,
  Lightbulb,
  Send,
} from 'lucide-react'

interface TwilioTemplate {
  sid: string
  name: string
  language: string
  status: string
  category: string
  body: string
  variables: Record<string, string>
  createdAt: string
  updatedAt: string
}

const STATUS_MAP: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  approved:    { label: 'Aprobada',         icon: CheckCircle, color: 'text-green-600 bg-green-50 border-green-200' },
  pending:     { label: 'Pendiente Meta',   icon: Clock,       color: 'text-amber-600 bg-amber-50 border-amber-200' },
  received:    { label: 'En revisión Meta', icon: Clock,       color: 'text-blue-600 bg-blue-50 border-blue-200' },
  rejected:    { label: 'Rechazada',        icon: XCircle,     color: 'text-red-600 bg-red-50 border-red-200' },
  unsubmitted: { label: 'Sin enviar a Meta',icon: AlertTriangle,color: 'text-orange-600 bg-orange-50 border-orange-200' },
  draft:       { label: 'Sin enviar a Meta',icon: AlertTriangle,color: 'text-orange-600 bg-orange-50 border-orange-200' },
}

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  MARKETING:  { label: 'Marketing', color: 'bg-blue-100 text-blue-700' },
  UTILITY:    { label: 'Utilidad',  color: 'bg-green-100 text-green-700' },
  AUTHENTICATION: { label: 'Auth', color: 'bg-purple-100 text-purple-700' },
  marketing:  { label: 'Marketing', color: 'bg-blue-100 text-blue-700' },
  utility:    { label: 'Utilidad',  color: 'bg-green-100 text-green-700' },
}

// These statuses need a "Send to Meta" button
const NEEDS_SUBMIT = new Set(['draft', 'unsubmitted', ''])

export default function TemplatesPage() {
  const [twilioTemplates, setTwilioTemplates] = useState<TwilioTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [twilioError, setTwilioError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newCategory, setNewCategory] = useState('UTILITY')
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState<{ ok: boolean; msg: string; approvalError?: string } | null>(null)
  const [showWarning, setShowWarning] = useState(false)
  const [showTips, setShowTips] = useState(false)
  const [sampleVars, setSampleVars] = useState<Record<string, string>>({})
  // Per-template submit state: sid → 'idle' | 'loading' | 'ok' | error string
  const [submitState, setSubmitState] = useState<Record<string, string>>({})

  const fetchTemplates = useCallback(async () => {
    setSyncing(true)
    setTwilioError(null)
    try {
      const res = await fetch('/api/dashboard/templates')
      const data = await res.json()
      if (data.templates) {
        setTwilioTemplates(data.templates)
      }
      if (data.error) {
        setTwilioError(data.error)
      }
    } catch {
      setTwilioError('Error de conexión')
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const handlePreview = (body: string) => {
    const previewed = body
      .replace(/\{\{1\}\}/g, 'María')
      .replace(/\{\{2\}\}/g, '10')
      .replace(/\{\{3\}\}/g, 'Rollo California Gratis')
      .replace(/\{\{name\}\}/g, 'María')
      .replace(/\{\{visits\}\}/g, '10')
      .replace(/\{\{reward\}\}/g, 'Rollo California Gratis')
      .replace(/\{\{days\}\}/g, '15')
    setPreview(previewed)
  }

  const detectedVars = (() => {
    const matches = newBody.match(/\{\{\d+\}\}/g) || []
    const unique = [...new Set(matches)].sort()
    return unique.map((v) => v.replace(/[{}]/g, ''))
  })()

  const allSamplesFilled = detectedVars.length === 0 || detectedVars.every((v) => (sampleVars[v] ?? '').trim().length > 0)

  const handleCreate = async () => {
    if (!newName.trim() || !newBody.trim() || !allSamplesFilled) return
    setCreating(true)
    setCreateResult(null)
    try {
      const res = await fetch('/api/dashboard/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          body: newBody.trim(),
          category: newCategory,
          language: 'es',
          variables: sampleVars,
        }),
      })
      const data = await res.json()
      if (data.success) {
        if (data.approval_submitted) {
          setCreateResult({ ok: true, msg: 'Plantilla creada y enviada a Meta para aprobación. En 24-72h aparecerá Aprobada.' })
        } else {
          setCreateResult({
            ok: false,
            msg: 'Plantilla creada en Twilio, pero el envío a Meta falló.',
            approvalError: data.approval_error || 'Error desconocido — usa el botón "Enviar a Meta" en la lista.',
          })
        }
        setNewName('')
        setNewBody('')
        setSampleVars({})
        setShowNew(false)
        fetchTemplates()
      } else {
        setCreateResult({ ok: false, msg: `Error: ${data.error}` })
      }
    } catch {
      setCreateResult({ ok: false, msg: 'Error de conexión' })
    } finally {
      setCreating(false)
    }
  }

  const handleSubmitToMeta = async (t: TwilioTemplate) => {
    setSubmitState((s) => ({ ...s, [t.sid]: 'loading' }))
    try {
      const res = await fetch(`/api/dashboard/templates/${t.sid}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: t.category || 'UTILITY' }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setSubmitState((s) => ({ ...s, [t.sid]: 'ok' }))
        // Optimistically update the status in the list
        setTwilioTemplates((prev) =>
          prev.map((tmpl) =>
            tmpl.sid === t.sid ? { ...tmpl, status: data.status || 'received' } : tmpl
          )
        )
      } else {
        setSubmitState((s) => ({ ...s, [t.sid]: data.error || 'Error enviando' }))
      }
    } catch {
      setSubmitState((s) => ({ ...s, [t.sid]: 'Error de conexión' }))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Plantillas de Mensajes
        </h1>
        <Button variant="outline" size="sm" onClick={fetchTemplates} disabled={syncing} className="gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          Sincronizar Twilio
        </Button>
      </div>

      {twilioError && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Twilio:</strong> {twilioError}.
            Las plantillas creadas aquí se enviarán a Twilio Content API cuando esté configurado.
          </div>
        </div>
      )}

      {createResult && (
        <div className={`rounded-lg p-3 text-sm flex flex-col gap-1 ${
          createResult.ok
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {createResult.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            {createResult.msg}
          </div>
          {createResult.approvalError && (
            <p className="text-xs ml-6 opacity-80">
              Detalle: {createResult.approvalError}
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : twilioTemplates.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <CloudUpload className="h-4 w-4" />
            Plantillas en Twilio ({twilioTemplates.length})
          </h2>
          <div className="grid gap-3">
            {twilioTemplates.map((t) => {
              const statusKey = (t.status || 'draft').toLowerCase()
              const statusInfo = STATUS_MAP[statusKey] || STATUS_MAP.draft
              const catInfo = CATEGORY_MAP[t.category] || CATEGORY_MAP.MARKETING
              const StatusIcon = statusInfo.icon
              const needsSubmit = NEEDS_SUBMIT.has(statusKey)
              const submitSt = submitState[t.sid]

              return (
                <Card key={t.sid}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm">{t.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${catInfo.color}`}>
                            {catInfo.label}
                          </span>
                          <Badge variant="outline" className={`text-[10px] h-5 gap-1 border ${statusInfo.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusInfo.label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">{t.sid}</span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{t.body}</p>

                        {/* Per-template submit button for drafts */}
                        {needsSubmit && (
                          <div className="flex items-center gap-2 pt-0.5">
                            {submitSt === 'ok' ? (
                              <span className="text-xs text-green-700 flex items-center gap-1">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Enviada a Meta — espera 24-72h
                              </span>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50"
                                  onClick={() => handleSubmitToMeta(t)}
                                  disabled={submitSt === 'loading'}
                                >
                                  {submitSt === 'loading'
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Send className="h-3 w-3" />
                                  }
                                  {submitSt === 'loading' ? 'Enviando…' : 'Enviar a Meta'}
                                </Button>
                                {submitSt && submitSt !== 'loading' && submitSt !== 'ok' && (
                                  <span className="text-[10px] text-red-600">{submitSt}</span>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePreview(t.body)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ) : !twilioError ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No hay plantillas en Twilio aún</p>
        </div>
      ) : null}

      {preview && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Vista Previa del Mensaje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm max-w-sm mx-auto">
              <div className="flex items-center gap-2 mb-2 text-xs text-green-700">
                <MessageSquare className="h-3 w-3" />
                WhatsApp Preview
              </div>
              <p className="whitespace-pre-wrap">{preview}</p>
            </div>
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setPreview(null)}>
              Cerrar preview
            </Button>
          </CardContent>
        </Card>
      )}

      {showNew ? (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Crear Plantilla en Twilio
            </CardTitle>
            <CardDescription>
              Se creará directamente en Twilio Content API y se enviará para aprobación de WhatsApp.
              Usa {'{{1}}'} = nombre, {'{{2}}'} = visitas, {'{{3}}'} = próxima recompensa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              type="button"
              onClick={() => setShowWarning(!showWarning)}
              className="flex items-center gap-2 w-full text-left text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-100 transition-colors"
            >
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              Advertencia importante sobre aprobación de Meta
              <ChevronDown className={`h-3.5 w-3.5 ml-auto transition-transform ${showWarning ? 'rotate-180' : ''}`} />
            </button>
            {showWarning && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-800 space-y-1.5">
                <p>Las plantillas pasan por aprobación de Meta (<strong>24 a 72 horas</strong>). Plantillas rechazadas repetidamente pueden <strong>afectar la reputación de tu número</strong> y eventualmente suspenderlo.</p>
                <p className="font-medium">Evitar:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Contenido engañoso, amenazante o con lenguaje abusivo</li>
                  <li>URLs acortadas (bit.ly, tinyurl) — Meta las rechaza</li>
                  <li>Pedir datos sensibles (contraseñas, tarjetas, documentos)</li>
                  <li>Plantillas idénticas a una previamente rechazada</li>
                  <li>Exceso de emojis, MAYÚSCULAS o signos de exclamación</li>
                  <li>Contenido que simule urgencia falsa (&quot;ÚLTIMA OPORTUNIDAD&quot;)</li>
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowTips(!showTips)}
              className="flex items-center gap-2 w-full text-left text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-100 transition-colors"
            >
              <Lightbulb className="h-3.5 w-3.5 shrink-0" />
              Recomendaciones para plantillas exitosas
              <ChevronDown className={`h-3.5 w-3.5 ml-auto transition-transform ${showTips ? 'rotate-180' : ''}`} />
            </button>
            {showTips && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-800 space-y-1.5">
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Sé claro y directo — el cliente debe entender el mensaje en 3 segundos</li>
                  <li>Personaliza con variables: {'{{1}}'} nombre, {'{{2}}'} visitas, {'{{3}}'} recompensa</li>
                  <li>Incluye el nombre del negocio para que sepan quién les escribe</li>
                  <li>Un solo CTA (call to action) claro: &quot;Visítanos&quot;, &quot;Pide tu domicilio&quot;</li>
                  <li>Tono amigable y profesional — como le hablarías a un cliente en persona</li>
                  <li>Categoría MARKETING para promos; UTILITY para confirmaciones y transacciones</li>
                  <li>Máximo 1024 caracteres — lo ideal es menos de 200</li>
                </ul>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: sushi_promo_fin_de_semana"
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground">Sin espacios ni caracteres especiales</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoría</Label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="UTILITY">UTILITY — Visitas, confirmaciones, premios ✅ Recomendado</option>
                <option value="MARKETING">MARKETING — Promos, cumpleaños, reactivación ⚠️ Requiere opt-out</option>
              </select>
              {newCategory === 'UTILITY' && (
                <p className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                  ✅ UTILITY es la categoría correcta para check-in, confirmación de visita y recompensas. Meta la aprueba como Business Initiated sin botón de opt-out.
                </p>
              )}
              {newCategory === 'MARKETING' && (
                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  ⚠️ MARKETING Business Initiated requiere botón de opt-out desde 2024. Sin él, Meta rechaza la plantilla. Úsala solo para campañas manuales donde el cliente ya interactuó contigo.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cuerpo del mensaje</Label>
              <textarea
                value={newBody}
                onChange={(e) => { setNewBody(e.target.value); setSampleVars({}) }}
                placeholder="¡Hola {{1}}! Tu pedido #{{2}} está listo..."
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>

            {detectedVars.length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2">
                <p className="text-xs font-semibold text-blue-800">Valores de ejemplo para variables</p>
                <p className="text-[10px] text-blue-600">Meta requiere un valor de ejemplo para cada variable. Sin esto, la plantilla no será aprobada para mensajes directos de WhatsApp.</p>
                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                  ⚠️ No uses saltos de línea (\n) en los valores de muestra — Meta los rechaza. Si tienes un roadmap con múltiples líneas, pon un ejemplo de una sola línea corta.
                </p>
                {detectedVars.map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-blue-700 w-10 shrink-0">{`{{${v}}}`}</span>
                    <Input
                      value={sampleVars[v] ?? ''}
                      onChange={(e) => setSampleVars((prev) => ({ ...prev, [v]: e.target.value }))}
                      placeholder={v === '1' ? 'Ej: María' : v === '2' ? 'Ej: 10' : 'Ej: Rollo California'}
                      className="h-7 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || !newBody.trim() || !allSamplesFilled || creating}
                className="gap-2"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                {creating ? 'Enviando...' : 'Enviar a Aprobación de WhatsApp'}
              </Button>
              <Button variant="outline" onClick={() => setShowNew(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" className="w-full gap-2" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" />
          Crear Nueva Plantilla
        </Button>
      )}
    </div>
  )
}
