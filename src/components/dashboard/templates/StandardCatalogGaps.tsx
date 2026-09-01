'use client'

/**
 * «Del set estándar te faltan estas» — para negocios que siguen en Twilio.
 *
 * Nace del reporte del dueño: en el apartado de Plantillas faltaban las dos de
 * cross-sell (invitar a domicilio a quien viene al local, y al revés). Están en
 * el catálogo estándar desde siempre, pero nunca se crearon en la cuenta Twilio
 * de esos negocios — y mientras no exista una plantilla APROBADA, su preset de
 * campaña ni siquiera se dibuja (§15.2 de docs/features/dashboard.md). El
 * resultado era una campaña que no se podía lanzar y nadie sabía por qué.
 *
 * Esta tarjeta hace visible ese hueco y lo cierra con un click. No toca nada de
 * lo que ya existe: solo crea las que faltan. La lógica y el porqué viven en
 * `src/services/twilio-catalog.service.ts`.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Clock,
  Loader2,
  PackagePlus,
  XCircle,
} from 'lucide-react'

type State = 'missing' | 'orphan' | 'pending' | 'approved'

interface StandardTemplate {
  key: string
  label: string
  description: string
  whenSent: string
  settingsKey: string
  category: string
  state: State
  pointer: string | null
  approvalStatus: string | null
  body: string
  needsMedia: boolean
}

interface Report {
  provider: 'twilio'
  brandName: string
  emoji: string
  style: string
  templates: StandardTemplate[]
  missingCount: number
  warning: string | null
}

const STATE_STYLE: Record<State, { label: string; className: string; icon: typeof CheckCircle }> = {
  approved: {
    label: 'Lista',
    className: 'text-green-700 bg-green-50 border-green-200',
    icon: CheckCircle,
  },
  pending: {
    label: 'Esperando a Meta',
    className: 'text-amber-700 bg-amber-50 border-amber-200',
    icon: Clock,
  },
  orphan: {
    label: 'Apunta a una plantilla que ya no existe',
    className: 'text-red-700 bg-red-50 border-red-200',
    icon: XCircle,
  },
  missing: {
    label: 'Falta crearla',
    className: 'text-orange-700 bg-orange-50 border-orange-200',
    icon: AlertTriangle,
  },
}

export default function StandardCatalogGaps({ onCreated }: { onCreated: () => void }) {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/templates/standard')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'No se pudo revisar el set estándar.')
        setReport(null)
        return
      }
      setError(null)
      setReport(data as Report)
    } catch {
      setError('No se pudo conectar para revisar el set estándar.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async (template: StandardTemplate) => {
    setCreating(template.key)
    setResult(null)
    try {
      const res = await fetch('/api/dashboard/templates/standard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: template.key }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ ok: false, msg: data.error ?? 'No se pudo crear.' })
        return
      }
      setResult({
        ok: true,
        msg: data.approval_submitted ?? data.approvalSubmitted
          ? `"${template.label}" creada y enviada a Meta. En 24-72 h queda aprobada y su campaña aparece sola.`
          : `"${template.label}" creada en Twilio, pero el envío a Meta falló. Búscala abajo en la lista y usa "Enviar a Meta".`,
      })
      await load()
      onCreated()
    } catch {
      setResult({ ok: false, msg: 'Error de conexión.' })
    } finally {
      setCreating(null)
    }
  }

  if (loading) return <div className="h-24 rounded-lg bg-muted animate-pulse" />

  // Un negocio sin Twilio configurado, o ya en Zernio, no tiene nada que ver
  // acá. Se calla en vez de mostrar un error que no es accionable.
  if (error || !report) return null

  const missing = report.templates.filter((t) => t.state === 'missing' && !t.needsMedia)
  const orphans = report.templates.filter((t) => t.state === 'orphan')
  const ready = report.templates.filter((t) => t.state === 'approved' || t.state === 'pending')

  if (missing.length === 0 && orphans.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 flex items-center gap-2">
        <CheckCircle className="h-4 w-4 shrink-0" />
        Tienes el set estándar completo: {ready.length} de {report.templates.length} plantillas
        asignadas.
      </div>
    )
  }

  return (
    <Card className="border-orange-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PackagePlus className="h-4 w-4" />
          Del set estándar te faltan {missing.length}
          {orphans.length > 0 ? ` (y ${orphans.length} apunta${orphans.length === 1 ? '' : 'n'} a algo que ya no existe)` : ''}
        </CardTitle>
        <CardDescription>
          Estas son las plantillas que todo negocio debería tener. Mientras falte una, la campaña
          que la usa <strong>no aparece</strong> en el apartado de Campañas — por eso no la
          encontrabas. Crearla no toca ninguna de las que ya tienes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {report.warning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {report.warning}
          </div>
        )}

        {result && (
          <div
            className={`rounded-lg p-2.5 text-sm flex items-start gap-2 ${
              result.ok
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {result.ok ? (
              <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            {result.msg}
          </div>
        )}

        {[...missing, ...orphans].map((template) => {
          const style = STATE_STYLE[template.state]
          const Icon = style.icon
          const isOpen = expanded === template.key

          return (
            <div key={template.key} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{template.label}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${style.className}`}
                    >
                      <Icon className="h-3 w-3" />
                      {style.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground italic">
                    Se envía: {template.whenSent}
                  </p>
                </div>

                {template.state === 'missing' ? (
                  <Button
                    size="sm"
                    onClick={() => handleCreate(template)}
                    disabled={creating !== null}
                    className="gap-1.5"
                  >
                    {creating === template.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PackagePlus className="h-3.5 w-3.5" />
                    )}
                    Crear y enviar a Meta
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Apunta a <code>{template.pointer}</code>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : template.key)}
                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                {isOpen ? 'Ocultar' : 'Ver'} el texto que se va a crear
              </button>

              {isOpen && (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">
                  {template.body}
                </pre>
              )}
            </div>
          )
        })}

        {orphans.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Las que «apuntan a algo que ya no existe» no se arreglan solas a propósito: repuntar una
            plantilla viva es una decisión, no un automatismo. Revísalas en la lista de abajo.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
