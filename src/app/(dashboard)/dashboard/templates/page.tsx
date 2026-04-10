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
  Save,
  Eye,
  AlertTriangle,
  MessageSquare,
  RefreshCw,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  CloudUpload,
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
  approved: { label: 'Aprobada', icon: CheckCircle, color: 'text-green-600 bg-green-50 border-green-200' },
  pending: { label: 'Pendiente', icon: Clock, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  rejected: { label: 'Rechazada', icon: XCircle, color: 'text-red-600 bg-red-50 border-red-200' },
  draft: { label: 'Borrador', icon: FileText, color: 'text-gray-600 bg-gray-50 border-gray-200' },
  received: { label: 'En revisión', icon: Clock, color: 'text-blue-600 bg-blue-50 border-blue-200' },
}

const CATEGORY_MAP: Record<string, { label: string; color: string }> = {
  MARKETING: { label: 'Marketing', color: 'bg-blue-100 text-blue-700' },
  UTILITY: { label: 'Utilidad', color: 'bg-green-100 text-green-700' },
  AUTHENTICATION: { label: 'Auth', color: 'bg-purple-100 text-purple-700' },
  marketing: { label: 'Marketing', color: 'bg-blue-100 text-blue-700' },
  utility: { label: 'Utilidad', color: 'bg-green-100 text-green-700' },
}

export default function TemplatesPage() {
  const [twilioTemplates, setTwilioTemplates] = useState<TwilioTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [twilioError, setTwilioError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newCategory, setNewCategory] = useState('MARKETING')
  const [creating, setCreating] = useState(false)
  const [createResult, setCreateResult] = useState<string | null>(null)

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

  const handleCreate = async () => {
    if (!newName.trim() || !newBody.trim()) return
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
        }),
      })
      const data = await res.json()
      if (data.success) {
        setCreateResult('Plantilla creada y enviada para aprobación')
        setNewName('')
        setNewBody('')
        setShowNew(false)
        fetchTemplates()
      } else {
        setCreateResult(`Error: ${data.error}`)
      }
    } catch {
      setCreateResult('Error de conexión')
    } finally {
      setCreating(false)
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
        <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${
          createResult.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'
        }`}>
          {createResult.startsWith('Error') ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
          {createResult}
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
              const statusInfo = STATUS_MAP[t.status] || STATUS_MAP.draft
              const catInfo = CATEGORY_MAP[t.category] || CATEGORY_MAP.MARKETING
              const StatusIcon = statusInfo.icon
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
              Usa {'{{1}}'}, {'{{2}}'} como variables numeradas (formato Twilio).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utilidad</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cuerpo del mensaje</Label>
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="¡Hola {{1}}! Tu pedido #{{2}} está listo..."
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!newName.trim() || !newBody.trim() || creating} className="gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {creating ? 'Creando...' : 'Crear y Enviar a Aprobación'}
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
