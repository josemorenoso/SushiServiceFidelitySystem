'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Upload, Download, Loader2, CheckCircle2, Send, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { ImportedContactsCostEstimator } from './ImportedContactsCostEstimator'

interface ValidationResult {
  batch_id: string
  source_file: string
  total_rows: number
  valid: number
  invalid: number
  invalid_reasons: Record<string, number>
  preview: { phone: string; name: string; status: 'valid' | 'invalid'; reason?: string }[]
  valid_contacts: { phone: string; name: string | null; email: string | null }[]
  already_contacted: number
  estimated_cost_usd: number
  estimated_cost_cop: number
  twilio_cost_per_message: number
}

interface TemplateItem {
  sid: string
  name: string
  status: string
  category: string
  body: string
}

const REASON_LABEL: Record<string, string> = {
  formato_invalido: 'Formato inválido',
  no_es_movil_colombiano: 'No es móvil colombiano',
  duplicado: 'Duplicado en el archivo',
  ya_contactado: 'Ya contactado antes',
  sin_columna_telefono: 'Falta columna teléfono',
}

interface Props {
  onSent?: () => void
}

export function ImportedContactsUploader({ onSent }: Props) {
  const [validating, setValidating] = useState(false)
  const [sending, setSending] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [templateSid, setTemplateSid] = useState('')
  const [promoText, setPromoText] = useState('')
  const [fallbackName, setFallbackName] = useState('cliente')
  const [consent, setConsent] = useState(false)
  const [twilioBalance, setTwilioBalance] = useState<{ balance: number | null; balanceCOP?: number } | null>(null)
  const [result, setResult] = useState<{ sent: number; failed: number; blocked_auto: number; total_cost_usd: number } | null>(null)

  // Cargar plantillas MARKETING aprobadas + saldo Twilio
  useEffect(() => {
    fetch('/api/dashboard/templates')
      .then((r) => r.json())
      .then((d) => {
        const approved = (d.templates ?? []).filter(
          (t: TemplateItem) => t.status === 'approved' && (t.category ?? '').toUpperCase() === 'MARKETING'
        )
        setTemplates(approved)
      })
      .catch(() => setTemplates([]))
    fetch('/api/dashboard/twilio-balance')
      .then((r) => r.json())
      .then(setTwilioBalance)
      .catch(() => setTwilioBalance(null))
  }, [])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setValidating(true)
    setValidation(null)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/dashboard/imported-contacts/validate', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || data.error || 'Error validando CSV')
        return
      }
      setValidation(data)
      if (data.valid === 0) toast.warning('No hay contactos válidos para enviar')
    } catch {
      toast.error('Error procesando el archivo')
    } finally {
      setValidating(false)
      e.target.value = ''
    }
  }

  const handleSend = async () => {
    if (!validation || !templateSid || !promoText.trim() || !consent) return
    setSending(true)
    try {
      const res = await fetch('/api/dashboard/imported-contacts/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_id: validation.batch_id,
          source_file: validation.source_file,
          template_sid: templateSid,
          promo_text: promoText.trim(),
          fallback_name: fallbackName.trim() || 'cliente',
          contacts: validation.valid_contacts,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || data.error || 'Error enviando')
        return
      }
      setResult(data)
      setValidation(null)
      setConsent(false)
      setPromoText('')
      toast.success(`Golden Bullet enviado: ${data.sent} mensajes`)
      onSent?.()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSending(false)
    }
  }

  // ─── Pantalla de resultado ───
  if (result) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-10 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <h3 className="text-lg font-bold">Campaña enviada</h3>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
            <div><p className="text-2xl font-bold">{result.sent}</p><p className="text-muted-foreground">Enviados</p></div>
            <div><p className="text-2xl font-bold">{result.failed}</p><p className="text-muted-foreground">Fallidos</p></div>
            <div><p className="text-2xl font-bold">{result.blocked_auto}</p><p className="text-muted-foreground">Bloqueados</p></div>
            <div><p className="text-2xl font-bold">${result.total_cost_usd.toFixed(2)}</p><p className="text-muted-foreground">Costo USD</p></div>
          </div>
          <Button className="mt-6" variant="outline" onClick={() => setResult(null)}>Nueva importación</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* Paso 1 — Subir CSV */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> 1. Subir CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Formato del archivo:</p>
            <ul className="mt-1 list-disc pl-5 text-xs">
              <li>Columnas: <code>telefono</code> (requerido), <code>nombre</code> (opcional), <code>email</code> (opcional)</li>
              <li>Teléfono: móvil colombiano (ej. <code>3001234567</code> o <code>+573001234567</code>)</li>
              <li>Codificación UTF-8, delimitador coma</li>
            </ul>
            <a href="/plantilla_golden_bullet.csv" download className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#E63946] hover:underline">
              <Download className="h-3.5 w-3.5" /> Descargar plantilla de ejemplo
            </a>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 h-10 text-sm font-medium hover:bg-accent">
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {validating ? 'Validando...' : 'Seleccionar archivo CSV'}
            <input type="file" accept=".csv" className="hidden" onChange={handleFile} disabled={validating} />
          </label>
        </CardContent>
      </Card>

      {validation && (
        <>
          {/* Paso 2 — Validación */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2. Validación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">{validation.total_rows} filas</Badge>
                <Badge className="bg-green-100 text-green-800">{validation.valid} válidos</Badge>
                <Badge className="bg-red-100 text-red-800">{validation.invalid} inválidos</Badge>
              </div>

              {Object.keys(validation.invalid_reasons).length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {Object.entries(validation.invalid_reasons).map(([reason, count]) => (
                    <span key={reason}>{REASON_LABEL[reason] ?? reason}: <strong>{count}</strong></span>
                  ))}
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validation.preview.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{p.phone}</TableCell>
                      <TableCell>{p.name || '—'}</TableCell>
                      <TableCell>
                        {p.status === 'valid'
                          ? <Badge className="bg-green-100 text-green-800">válido</Badge>
                          : <Badge className="bg-red-100 text-red-800">{REASON_LABEL[p.reason ?? ''] ?? 'inválido'}</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">Vista previa de los primeros {validation.preview.length} registros.</p>
            </CardContent>
          </Card>

          {/* Paso 3 — Costo */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">3. Costo de envío</CardTitle>
            </CardHeader>
            <CardContent>
              <ImportedContactsCostEstimator
                validCount={validation.valid}
                estimatedCostUsd={validation.estimated_cost_usd}
                estimatedCostCop={validation.estimated_cost_cop}
                costPerMessage={validation.twilio_cost_per_message}
                alreadyContacted={validation.already_contacted}
                twilioBalance={twilioBalance}
              />
            </CardContent>
          </Card>

          {/* Paso 4 — Plantilla y mensaje */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">4. Plantilla y mensaje</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Plantilla MARKETING aprobada</Label>
                {templates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay plantillas MARKETING aprobadas. Créalas en Plantillas.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {templates.map((t) => (
                      <button
                        key={t.sid}
                        onClick={() => setTemplateSid(t.sid)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          templateSid === t.sid ? 'bg-foreground text-background border-foreground' : 'border-border bg-background hover:bg-muted'
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="promo" className="text-xs uppercase tracking-wide text-muted-foreground">Texto de la promo ({'{{2}}'})</Label>
                <Input id="promo" value={promoText} onChange={(e) => setPromoText(e.target.value)} placeholder="Ej: 2x1 en sushi rolls esta semana" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fallback" className="text-xs uppercase tracking-wide text-muted-foreground">Nombre genérico ({'{{1}}'} si el contacto no trae nombre)</Label>
                <Input id="fallback" value={fallbackName} onChange={(e) => setFallbackName(e.target.value)} placeholder="cliente" />
              </div>
            </CardContent>
          </Card>

          {/* Paso 5 — Confirmar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">5. Confirmar envío</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                <span className="text-muted-foreground">
                  Entiendo que estos contactos no han dado consentimiento de marketing y solo recibirán
                  este único mensaje. Los que no respondan/vuelvan no serán contactados de nuevo.
                </span>
              </label>
              <Button
                onClick={handleSend}
                disabled={sending || !templateSid || !promoText.trim() || !consent || validation.valid === 0}
                className="gap-2"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? 'Enviando...' : `Enviar Golden Bullet (${validation.valid})`}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
