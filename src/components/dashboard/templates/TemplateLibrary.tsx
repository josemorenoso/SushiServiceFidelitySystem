'use client'

/**
 * Plantillas › Biblioteca para campañas (decisiones B4 y B5 del dueño, 2026-10-11).
 *
 * Las plantillas que el dueño crea para una campaña puntual, reutilizables: se crean acá y
 * Campañas → Mensaje libre las lista. Sirve a los DOS proveedores: en Twilio es lo que era
 * la pantalla de Plantillas (lista de la cuenta + «Crear Nueva Plantilla»), y en Zernio es
 * lo que no existía — hasta hoy una marca Zernio no podía crear una plantilla libre.
 *
 * Es el `TwilioTemplateManager` de siempre, con el mismo aspecto (el dueño: «me encanta cómo
 * se ven ahora»). Lo que cambió:
 *   · La lista separa las de campaña de las que usan los mensajes automáticos (`biblioteca`
 *     y `en_uso_por` de `GET /api/dashboard/templates`); las segundas van plegadas abajo.
 *     Esa lista entera es también la que el dueño pidió el 2026-10-02 para ver si una
 *     plantilla salió («Todas tus plantillas en WhatsApp»).
 *   · El formulario valida con `problemasDelCuerpoLibre()`, la MISMA regla que el servidor
 *     (`validarPlantillaLibre()`): antes no exigía la línea de SALIR ni variables sin huecos.
 *   · «Del set estándar te faltan N» se fue: esas filas viven en Mensajes automáticos.
 */

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
import { nombreDePlantillaLibre, problemasDelCuerpoLibre } from '@/constants/template-catalog'

interface LibraryTemplate {
  sid: string
  name: string
  language: string
  status: string
  category: string
  body: string
  has_media?: boolean
  rejection_reason?: string | null
  variables: Record<string, string>
  createdAt: string | null
  updatedAt: string | null
  /** El mensaje automático que la usa, o `null` (`src/lib/template-library.ts`). */
  en_uso_por?: string | null
  /** `true` = es de las de campaña. */
  biblioteca?: boolean
}

const STATUS_MAP: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  approved:    { label: 'Aprobada',         icon: CheckCircle, color: 'text-green-600 bg-green-50 border-green-200' },
  pending:     { label: 'Pendiente Meta',   icon: Clock,       color: 'text-amber-600 bg-amber-50 border-amber-200' },
  in_appeal:   { label: 'Pendiente Meta',   icon: Clock,       color: 'text-amber-600 bg-amber-50 border-amber-200' },
  received:    { label: 'En revisión Meta', icon: Clock,       color: 'text-blue-600 bg-blue-50 border-blue-200' },
  rejected:    { label: 'Rechazada',        icon: XCircle,     color: 'text-red-600 bg-red-50 border-red-200' },
  paused:      { label: 'Pausada por Meta', icon: XCircle,     color: 'text-red-600 bg-red-50 border-red-200' },
  disabled:    { label: 'Desactivada por Meta', icon: XCircle, color: 'text-red-600 bg-red-50 border-red-200' },
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

// These statuses need a "Send to Meta" button (solo Twilio: en Zernio crear ya somete)
const NEEDS_SUBMIT = new Set(['draft', 'unsubmitted', ''])

export default function TemplateLibrary() {
  const [templates, setTemplates] = useState<LibraryTemplate[]>([])
  const [provider, setProvider] = useState<'twilio' | 'zernio'>('twilio')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showInUse, setShowInUse] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newCategory, setNewCategory] = useState('MARKETING')
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState<{ ok: boolean; msg: string; approvalError?: string } | null>(null)
  const [showWarning, setShowWarning] = useState(false)
  const [showTips, setShowTips] = useState(false)
  const [sampleVars, setSampleVars] = useState<Record<string, string>>({})
  // Per-template submit state: sid → 'idle' | 'loading' | 'ok' | error string
  const [submitState, setSubmitState] = useState<Record<string, string>>({})

  const fetchTemplates = useCallback(async () => {
    setSyncing(true)
    setListError(null)
    try {
      const res = await fetch('/api/dashboard/templates')
      const data = await res.json()
      if (data.templates) {
        setTemplates(data.templates)
      }
      if (data.provider === 'zernio' || data.provider === 'twilio') setProvider(data.provider)
      if (data.error) {
        setListError(data.error)
      }
    } catch {
      setListError('Error de conexión')
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  // La vista previa rellena lo mismo que manda Campañas → Mensaje libre:
  // {{1}} nombre, {{2}} puntos, {{3}} próximo premio.
  const handlePreview = (body: string) => {
    const previewed = body
      .replace(/\{\{1\}\}/g, 'María')
      .replace(/\{\{2\}\}/g, '120')
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

  // Reglas duras de Meta, validadas en vivo para no quemar un ciclo de aprobación de 24-72h.
  // Las MISMAS que aplica el servidor (`validarPlantillaLibre()`), para los dos proveedores.
  const bodyIssues = newBody.trim() ? problemasDelCuerpoLibre(newBody, newCategory) : []

  // Meta exige nombres en minúsculas/números/guiones bajos; así se enviará realmente
  // (misma normalización que hace el servidor).
  const normalizedMetaName = nombreDePlantillaLibre(newName)

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
          setCreateResult({ ok: true, msg: 'Plantilla creada y enviada a Meta para aprobación. En 24-72h aparecerá Aprobada, y desde ahí la puedes usar en Campañas → Mensaje libre.' })
        } else {
          setCreateResult({
            ok: false,
            msg: 'Plantilla creada, pero el envío a Meta falló.',
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

  const handleSubmitToMeta = async (t: LibraryTemplate) => {
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
        setTemplates((prev) =>
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

  const deCampana = templates.filter((t) => t.biblioteca !== false)
  const automaticas = templates.filter((t) => t.biblioteca === false)

  const renderTemplate = (t: LibraryTemplate) => {
    const statusKey = (t.status || 'draft').toLowerCase()
    const statusInfo = STATUS_MAP[statusKey] || STATUS_MAP.draft
    const catInfo = CATEGORY_MAP[t.category] || CATEGORY_MAP.MARKETING
    const StatusIcon = statusInfo.icon
    const needsSubmit = provider === 'twilio' && NEEDS_SUBMIT.has(statusKey)
    const submitSt = submitState[t.sid]

    return (
      <Card key={`${t.sid}-${t.language}`}>
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
                {t.name.startsWith('club_invite_') && (
                  <Badge variant="outline" className="h-5 text-[10px]">Golden Bullet</Badge>
                )}
                {t.en_uso_por && (
                  <Badge variant="outline" className="h-5 text-[10px] text-green-700 border-green-200">
                    En uso: {t.en_uso_por}
                  </Badge>
                )}
                {provider === 'twilio' && (
                  <span className="text-[10px] text-muted-foreground font-mono">{t.sid}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{t.body}</p>

              {statusKey === 'rejected' && t.rejection_reason && (
                <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                  <strong>Motivo del rechazo:</strong> {t.rejection_reason}
                </p>
              )}

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
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Biblioteca para campañas
          </h1>
          <p className="text-sm text-muted-foreground">
            Las plantillas que creas para una campaña puntual. Se reusan en Campañas → Mensaje libre.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTemplates} disabled={syncing} className="gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {listError && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            No se pudo leer la lista de tu cuenta de WhatsApp ({listError}). Prueba «Actualizar» en un rato.
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
              Crear plantilla para campañas
            </CardTitle>
            <CardDescription>
              Se crea en tu cuenta de WhatsApp y se envía a Meta para aprobación.
              En Campañas → Mensaje libre se rellena {'{{1}}'} = nombre, {'{{2}}'} = puntos, {'{{3}}'} = próximo premio.
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
                  <li>Personaliza con variables: {'{{1}}'} nombre, {'{{2}}'} puntos, {'{{3}}'} próximo premio</li>
                  <li>Incluye el nombre del negocio para que sepan quién les escribe</li>
                  <li>Un solo CTA (call to action) claro: &quot;Visítanos&quot;, &quot;Pide tu domicilio&quot;</li>
                  <li>Tono amigable y profesional — como le hablarías a un cliente en persona</li>
                  <li>Categoría MARKETING para promos; UTILITY para confirmaciones y transacciones</li>
                  <li>Por cada dato variable, al menos 3 palabras de texto fijo — si no, Meta la rechaza</li>
                  <li>Máximo 1024 caracteres — lo ideal es menos de 200</li>
                </ul>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: promo_fin_de_semana"
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Sin espacios ni caracteres especiales
                {normalizedMetaName && normalizedMetaName !== newName.trim() && (
                  <span> — se enviará a Meta como <code className="font-mono">{normalizedMetaName}</code></span>
                )}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoría</Label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="MARKETING">MARKETING — Promos, cumpleaños, reactivación</option>
                <option value="UTILITY">UTILITY — Confirmaciones y avisos de algo que el cliente hizo</option>
              </select>
              {newCategory === 'MARKETING' && (
                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  ⚠️ MARKETING exige ofrecer una salida: termina el mensaje con «Responde SALIR para no recibir más mensajes.». Sin esa línea no te dejamos enviarla.
                </p>
              )}
              {newCategory === 'UTILITY' && (
                <p className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                  UTILITY es para avisos sobre algo que el cliente hizo (una visita, un pedido). Si el mensaje promociona, Meta la pasa a MARKETING.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cuerpo del mensaje</Label>
              <textarea
                value={newBody}
                onChange={(e) => { setNewBody(e.target.value); setSampleVars({}) }}
                placeholder="¡Hola {{1}}! Este fin de semana tenemos 2x1 en todo el menú. Tienes {{2}} puntos para usar. Responde SALIR para no recibir más mensajes."
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
              {bodyIssues.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 space-y-1">
                  {bodyIssues.map((issue) => (
                    <p key={issue} className="text-[11px] text-red-700 flex items-start gap-1.5">
                      <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      {issue}
                    </p>
                  ))}
                  <p className="text-[10px] text-red-500">Meta rechazaría esta plantilla — corrígela antes de enviar.</p>
                </div>
              )}
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
                      placeholder={v === '1' ? 'Ej: María' : v === '2' ? 'Ej: 120' : 'Ej: Rollo California'}
                      className="h-7 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || !newBody.trim() || !allSamplesFilled || bodyIssues.length > 0 || creating}
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

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <CloudUpload className="h-4 w-4" />
              Para campañas ({deCampana.length})
            </h2>
            {deCampana.length > 0 ? (
              <div className="grid gap-3">{deCampana.map(renderTemplate)}</div>
            ) : !listError ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Todavía no tienes plantillas para campañas. Crea la primera arriba.</p>
              </div>
            ) : null}
          </div>

          {/* Las de los mensajes automáticos, plegadas: están en la cuenta y se pueden
              usar, pero su lugar es la pestaña Mensajes automáticos. */}
          {automaticas.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowInUse(!showInUse)}
                className="text-sm font-semibold text-muted-foreground flex items-center gap-2"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showInUse ? 'rotate-180' : ''}`} />
                De tus mensajes automáticos ({automaticas.length})
              </button>
              {showInUse && <div className="grid gap-3">{automaticas.map(renderTemplate)}</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
