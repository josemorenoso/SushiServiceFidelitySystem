'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Upload, Download, Loader2, CheckCircle2, Send, FileText, CalendarClock, AlertTriangle } from 'lucide-react'
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

/** Lo que importa de `GET /api/dashboard/line-budget` para esta pantalla. */
interface LineBudgetInfo {
  available?: boolean
  enforced?: boolean
  campaignBudget?: number | null
  campaignAvailable?: number | null
  qualityRating?: string
  lineStatus?: string
}

interface BlockPlan {
  totalContacts: number
  requestedBlockSize: number
  blockSize: number
  campaignBudget: number | null
  cappedByBudget: boolean
  days: number
  startsAt: string
  endsAt: string
}

interface ConfirmResult {
  queued: number
  inserted: number
  blocked_auto: number
  total_cost_usd: number
  plan: BlockPlan | null
}

const REASON_LABEL: Record<string, string> = {
  formato_invalido: 'Formato inválido',
  no_es_movil_colombiano: 'No es móvil colombiano',
  duplicado: 'Duplicado en el archivo',
  ya_contactado: 'Ya contactado antes',
  sin_columna_telefono: 'Falta columna teléfono',
}

/**
 * La frase que hay que ESCRIBIR para confirmar.
 *
 * Es una frase escrita y no una casilla porque una casilla se marca sin leer, y
 * lo que se está aceptando acá es que una base sin consentimiento salga por la
 * línea principal de atención del restaurante (spec §3.4.1, conservado por D-7).
 */
const FRASE_CONFIRMACION = 'ENTIENDO EL RIESGO'

/** El texto exacto que se guarda como evidencia de lo que la persona aceptó. */
const TEXTO_ADVERTENCIA =
  'Estos contactos NO dieron consentimiento de marketing. El envío sale por la línea ' +
  'principal de atención del restaurante, así que una restricción de Meta afectaría ' +
  'también la atención a los clientes actuales. Cada contacto recibe UN solo mensaje y ' +
  'quien pida salir no vuelve a ser contactado nunca.'

/**
 * Qué variables `{{n}}` usa el cuerpo de una plantilla.
 *
 * Existe por una trampa que costaría los 15.000 mensajes de una sola vez:
 * `confirmImport()` rellena EXACTAMENTE dos variables —`{{1}}`=nombre y
 * `{{2}}`=promo— pero la lista del paso 4 ofrece **todas** las MARKETING
 * aprobadas del negocio. Y las MARKETING del catálogo estándar llevan tres o
 * cuatro (saldo de puntos, camino de niveles): elegir una de esas manda un
 * envío con variables faltantes que el proveedor rechaza entero.
 *
 * Fallaría en el 100% de los destinatarios, y recién se vería después de
 * confirmar. Más barato es no dejar elegirla.
 */
function variablesDe(body: string): Set<number> {
  const encontradas = new Set<number>()
  for (const m of (body ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    encontradas.add(Number(m[1]))
  }
  return encontradas
}

/**
 * Una plantilla sirve para Golden Bullet si usa {{1}}, opcionalmente {{2}},
 * y ninguna más. Hasta el 2026-09-11 {{2}} también era obligatoria; un mensaje
 * que nombra el regalo en el propio texto no la necesita.
 */
export function plantillaCompatible(body: string): boolean {
  const vars = variablesDe(body)
  return vars.has(1) && [...vars].every((n) => n === 1 || n === 2)
}

/** ¿La plantilla elegida pide el texto de la promo? */
export function plantillaUsaPromo(body: string): boolean {
  return variablesDe(body).has(2)
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * `apagado`: el flag `golden_bullet_enabled` de la marca no está en `'true'`.
 * El servidor responde 403 a todo mientras siga así, así que el selector de
 * archivo se deshabilita en vez de dejar que el CSV «no cargue» sin explicación.
 * El botón para encenderlo vive en la página (`imported-contacts/page.tsx`).
 */
export function ImportedContactsUploader({ onSent, apagado = false }: { onSent?: () => void; apagado?: boolean }) {
  const [validating, setValidating] = useState(false)
  const [sending, setSending] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [templateSid, setTemplateSid] = useState('')
  const [promoText, setPromoText] = useState('')
  const [fallbackName, setFallbackName] = useState('cliente')
  const [confirmacion, setConfirmacion] = useState('')
  const [blockSize, setBlockSize] = useState<number | null>(null)
  const [budget, setBudget] = useState<LineBudgetInfo | null>(null)
  const [twilioBalance, setTwilioBalance] = useState<{ balance: number | null; balanceCOP?: number } | null>(null)
  const [result, setResult] = useState<ConfirmResult | null>(null)

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
    // El nombre genérico de {{1}} se escribe al lado del mensaje 1 (pestaña
    // Plantilla) y queda en la marca; acá solo se arranca con ese valor.
    fetch('/api/dashboard/settings')
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: Record<string, string>) => {
        if (d.golden_bullet_fallback_name?.trim()) setFallbackName(d.golden_bullet_fallback_name.trim())
      })
      .catch(() => undefined)
    fetch('/api/dashboard/line-budget')
      .then((r) => r.json())
      .then((d: LineBudgetInfo) => {
        setBudget(d)
        // Arranca en la MITAD del cupo, no en el cupo entero.
        //
        // D-7 dejó el techo en el presupuesto completo y dijo, con todas las
        // letras, cuál es el riesgo: un Golden Bullet a tope se come todo el
        // cupo de campaña del día y deja sin mensaje a los clientes que SÍ
        // consintieron. Los cumpleaños y los recordatorios de premio NO pasan
        // por la cola —salen de su propio cron, a las 13:00 y 11:00 de
        // Bogotá—, así que si el goteo vació el presupuesto de madrugada, esos
        // mensajes fallan.
        //
        // El techo sigue siendo el cupo completo: el operador puede subirlo.
        // Lo que cambia es qué se propone cuando nadie eligió nada.
        if (typeof d.campaignBudget === 'number' && d.campaignBudget > 0) {
          setBlockSize(Math.max(1, Math.floor(d.campaignBudget / 2)))
        }
      })
      .catch(() => setBudget(null))
  }, [])

  // Solo se ofrecen las que Golden Bullet puede rellenar de verdad. Ver `plantillaCompatible`.
  const compatibles = templates.filter((t) => plantillaCompatible(t.body))
  const incompatibles = templates.filter((t) => !plantillaCompatible(t.body))
  const elegida = compatibles.find((t) => t.sid === templateSid) ?? null
  // La promo ({{2}}) solo se pide si la plantilla elegida la usa.
  const pidePromo = elegida ? plantillaUsaPromo(elegida.body) : false
  const promoLista = !pidePromo || promoText.trim().length > 0

  const cupo = budget?.enforced ? (budget.campaignBudget ?? null) : null
  const lineaTocada =
    budget?.lineStatus === 'frozen' ||
    budget?.lineStatus === 'throttled' ||
    budget?.qualityRating === 'yellow' ||
    budget?.qualityRating === 'red'

  /**
   * Proyección del plan, en el navegador.
   *
   * Es la MISMA aritmética que `planBlocks()` en el servidor, repetida acá a
   * propósito: ese módulo arrastra el cliente de Supabase y no puede cruzar al
   * navegador. Son dos líneas de división que no pueden divergir de forma
   * interesante, y el plan que MANDA es el que devuelve `confirm` — que es el
   * que se muestra al final.
   */
  const proyeccion = useMemo(() => {
    if (!validation || !blockSize || blockSize < 1) return null
    const efectivo = cupo !== null ? Math.min(blockSize, cupo) : blockSize
    const dias = validation.valid === 0 ? 0 : Math.ceil(validation.valid / efectivo)
    const fin = new Date()
    fin.setDate(fin.getDate() + Math.max(0, dias - 1))
    return { efectivo, dias, fin: fin.toISOString(), recortado: cupo !== null && blockSize > cupo }
  }, [validation, blockSize, cupo])

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
    if (!validation || !templateSid || !promoLista || !blockSize) return
    if (confirmacion.trim().toUpperCase() !== FRASE_CONFIRMACION) return
    setSending(true)
    try {
      const res = await fetch('/api/dashboard/imported-contacts/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_id: validation.batch_id,
          source_file: validation.source_file,
          template_sid: templateSid,
          promo_text: pidePromo ? promoText.trim() : '',
          fallback_name: fallbackName.trim() || 'cliente',
          block_size: blockSize,
          consent_text: TEXTO_ADVERTENCIA,
          contacts: validation.valid_contacts,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || data.error || 'No se pudo programar el envío')
        return
      }
      setResult(data)
      setValidation(null)
      setConfirmacion('')
      setPromoText('')
      toast.success(`${data.queued.toLocaleString('es-CO')} contactos programados`)
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
          <h3 className="text-lg font-bold">Campaña programada</h3>
          {result.plan && (
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Salen <strong>{result.plan.blockSize.toLocaleString('es-CO')} por día</strong> durante{' '}
              <strong>{result.plan.days} {result.plan.days === 1 ? 'día' : 'días'}</strong>. El último bloque
              sale el <strong>{formatearFecha(result.plan.endsAt)}</strong>, si la calidad de la línea aguanta.
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
            <div><p className="text-2xl font-bold">{result.queued.toLocaleString('es-CO')}</p><p className="text-muted-foreground">En cola</p></div>
            <div><p className="text-2xl font-bold">{result.inserted.toLocaleString('es-CO')}</p><p className="text-muted-foreground">Importados</p></div>
            <div><p className="text-2xl font-bold">{result.blocked_auto.toLocaleString('es-CO')}</p><p className="text-muted-foreground">Bloqueados</p></div>
            <div><p className="text-2xl font-bold">${result.total_cost_usd.toFixed(2)}</p><p className="text-muted-foreground">Costo USD</p></div>
          </div>
          <Button className="mt-6" variant="outline" onClick={() => setResult(null)}>Nueva importación</Button>
        </CardContent>
      </Card>
    )
  }

  const confirmacionOk = confirmacion.trim().toUpperCase() === FRASE_CONFIRMACION

  return (
    <div className="space-y-5">
      {lineaTocada && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>La línea no está en verde.</strong> Golden Bullet es la única campaña que le escribe a
            gente que no dio consentimiento, así que es la primera que se apaga cuando Meta marca el número.
            La confirmación va a ser rechazada hasta que la línea vuelva a estar activa y en verde.
          </p>
        </div>
      )}

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
              <li>Máximo <strong>30.000</strong> contactos por archivo</li>
            </ul>
            <a href="/plantilla_golden_bullet.csv" download className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#E63946] hover:underline">
              <Download className="h-3.5 w-3.5" /> Descargar plantilla de ejemplo
            </a>
          </div>
          <label
            className={`inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 h-10 text-sm font-medium ${
              apagado ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-accent'
            }`}
          >
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {validating ? 'Validando...' : apagado ? 'Golden Bullet apagado' : 'Seleccionar archivo CSV'}
            <input type="file" accept=".csv" className="hidden" onChange={handleFile} disabled={validating || apagado} />
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
                ) : compatibles.length === 0 ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <p>
                      <strong>Ninguna de tus plantillas aprobadas sirve para esto.</strong> Golden Bullet rellena
                      {'{{1}}'} (nombre) y, si está, {'{{2}}'} (promo); las que tenés usan otras variables — un
                      envío con variables faltantes lo rechaza el proveedor entero.
                    </p>
                    <p className="mt-2">
                      Creá la de los dos botones en la pestaña <strong>Plantilla</strong>. Meta tarda 24-48 h y
                      cuando la apruebe aparece sola acá.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {compatibles.map((t) => (
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
                {incompatibles.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    No se ofrecen {incompatibles.length}{' '}
                    {incompatibles.length === 1 ? 'plantilla aprobada' : 'plantillas aprobadas'} porque usan
                    variables distintas de {'{{1}}'} y {'{{2}}'}: {incompatibles.map((t) => t.name).join(', ')}.
                  </p>
                )}
              </div>
              {pidePromo && (
                <div className="space-y-1.5">
                  <Label htmlFor="promo" className="text-xs uppercase tracking-wide text-muted-foreground">Texto de la promo ({'{{2}}'})</Label>
                  <Input id="promo" value={promoText} onChange={(e) => setPromoText(e.target.value)} placeholder="Ej: un postre gratis en tu próxima visita" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="fallback" className="text-xs uppercase tracking-wide text-muted-foreground">Si el contacto no trae nombre, {'{{1}}'} dice</Label>
                <Input id="fallback" value={fallbackName} onChange={(e) => setFallbackName(e.target.value)} placeholder="cliente" />
                <p className="text-xs text-muted-foreground">Arranca con lo que guardaste en la pestaña Plantilla. Cambiarlo acá vale solo para esta campaña.</p>
              </div>
            </CardContent>
          </Card>

          {/* Paso 5 — Ritmo */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4" /> 5. Ritmo de envío</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Una base grande no se despierta en un día, y el techo no lo ponemos nosotros: lo pone Meta.
                Elegí cuántos mensajes salen por día.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="bloque" className="text-xs uppercase tracking-wide text-muted-foreground">Mensajes por día</Label>
                <Input
                  id="bloque"
                  type="number"
                  min={1}
                  value={blockSize ?? ''}
                  onChange={(e) => setBlockSize(e.target.value ? Number(e.target.value) : null)}
                  placeholder="180"
                  className="max-w-40"
                />
                {cupo !== null ? (
                  <p className="text-xs text-muted-foreground">
                    El cupo de campaña de esta línea hoy es <strong>{cupo.toLocaleString('es-CO')}</strong> por día.
                    Si pedís más, se recorta a ese número.
                  </p>
                ) : (
                  <p className="text-xs text-amber-700">
                    <strong>No conocemos el límite de Meta de esta línea todavía.</strong> Mientras no se sepa, el
                    número que pongas acá es el único freno que existe. El sondeo de salud de línea lo averigua solo
                    y actualiza este cupo.
                  </p>
                )}
              </div>

              {proyeccion && validation.valid > 0 && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <p>
                    <strong>{validation.valid.toLocaleString('es-CO')}</strong> contactos ·{' '}
                    <strong>{proyeccion.efectivo.toLocaleString('es-CO')}</strong> por día ={' '}
                    <strong>{proyeccion.dias} {proyeccion.dias === 1 ? 'día' : 'días'}</strong>
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    El último bloque saldría el <strong>{formatearFecha(proyeccion.fin)}</strong>.
                  </p>
                  {proyeccion.recortado && (
                    <p className="mt-1 text-xs text-amber-700">
                      Pediste {blockSize?.toLocaleString('es-CO')} por día, pero la línea solo da{' '}
                      {proyeccion.efectivo.toLocaleString('es-CO')}.
                    </p>
                  )}
                  {cupo !== null && proyeccion.efectivo > cupo / 2 && (
                    <p className="mt-1 text-xs text-amber-700">
                      Este bloque se lleva {Math.round((proyeccion.efectivo / cupo) * 100)}% del cupo de
                      campaña del día. Los cumpleaños y los recordatorios de premio salen de su propio
                      cron y <strong>no</strong> pasan por esta cola: si el goteo vacía el presupuesto de
                      madrugada, esos mensajes no salen.
                    </p>
                  )}
                  {proyeccion.dias > 30 && (
                    <p className="mt-1 text-xs text-amber-700">
                      Son más de un mes de goteo. Los mensajes que no salgan en 30 días desde el día que les tocaba
                      se descartan.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Paso 6 — Confirmar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">6. Confirmar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {TEXTO_ADVERTENCIA}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="frase" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Escribí <strong>{FRASE_CONFIRMACION}</strong> para confirmar
                </Label>
                <Input
                  id="frase"
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  placeholder={FRASE_CONFIRMACION}
                  className="max-w-72"
                />
              </div>
              <Button
                onClick={handleSend}
                disabled={sending || !templateSid || !promoLista || !confirmacionOk || !blockSize || validation.valid === 0}
                className="gap-2"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? 'Programando...' : `Programar envío (${validation.valid.toLocaleString('es-CO')})`}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
