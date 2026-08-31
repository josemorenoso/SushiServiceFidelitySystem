'use client'

/**
 * Pantalla de Plantillas para tenants ZERNIO: el catálogo estándar de 13
 * mensajes, con un solo estilo por negocio y edición tipo documento.
 *
 * REQUERIMIENTOS_AGOSTO_2026.md §12. Todo el vocabulario de esta pantalla es
 * deliberado: el dueño ve "mensajes", no "plantillas"; ve "activo" y "revisando
 * un cambio", no "approved/pending"; y nunca ve un SID, un nombre técnico ni la
 * palabra "versión". La mecánica real (crear una plantilla nueva, someterla a
 * Meta, cambiar el puntero al aprobarse) vive entera en `template.service.ts` y
 * no se filtra hacia aquí.
 *
 * Lo único que sí se le cuenta es lo que le afecta: que un cambio tarda 1-3 días
 * y que mientras tanto sus clientes siguen recibiendo el mensaje anterior.
 */

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Pencil,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import StyleSelector from './StyleSelector'
import TemplateEditorDialog from './TemplateEditorDialog'
import type { TemplateCatalogEntry, TemplateCatalogResponse } from '@/types/template.types'

/** Qué se le muestra al dueño según el estado real del slot. */
function statusOf(entry: TemplateCatalogEntry) {
  if (entry.pending) {
    return {
      label: 'Revisando un cambio',
      icon: Clock,
      className: 'text-amber-700 bg-amber-50 border-amber-200',
    }
  }
  if (entry.lastRejected) {
    return {
      label: 'Cambio rechazado',
      icon: XCircle,
      className: 'text-red-700 bg-red-50 border-red-200',
    }
  }
  if (entry.current || entry.adoptedRef) {
    return {
      label: 'Activo',
      icon: CheckCircle,
      className: 'text-green-700 bg-green-50 border-green-200',
    }
  }
  return {
    label: 'Sin configurar',
    icon: AlertTriangle,
    className: 'text-orange-700 bg-orange-50 border-orange-200',
  }
}

export default function TemplateCatalogEditor() {
  const [state, setState] = useState<TemplateCatalogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<TemplateCatalogEntry | null>(null)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/dashboard/templates/catalog')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'No se pudieron cargar tus mensajes.')
        return
      }
      setState(data as TemplateCatalogResponse)
      setError(null)
    } catch {
      setError('No se pudo conectar. Revisa tu internet e inténtalo de nuevo.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleSaved = (message: string) => {
    setEditing(null)
    setNotice(message)
    load()
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (error && !state) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        {error}
      </div>
    )
  }

  if (!state) return null

  const activeCount = state.entries.filter((e) => e.current || e.adoptedRef).length
  const pendingCount = state.entries.filter((e) => e.pending).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Mensajes de WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground">
            Los {state.entries.length} mensajes que tu negocio le envía a sus clientes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={refreshing} className="gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {notice && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 flex items-start gap-2">
          <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs underline shrink-0"
          >
            Cerrar
          </button>
        </div>
      )}

      <StyleSelector style={state.style} activeCount={activeCount} onApplied={handleSaved} />

      {pendingCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            WhatsApp está revisando {pendingCount === 1 ? 'un cambio' : `${pendingCount} cambios`}. Suele
            tardar entre 1 y 3 días.{' '}
            <strong>Mientras tanto tus clientes siguen recibiendo los mensajes actuales.</strong>
          </p>
        </div>
      )}

      <div className="grid gap-3">
        {state.entries.map((entry) => {
          const status = statusOf(entry)
          const StatusIcon = status.icon
          const shownBody = entry.current?.body ?? null

          return (
            <Card key={entry.definition.key}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{entry.definition.label}</span>
                      <Badge variant="outline" className={`h-5 gap-1 border text-[10px] ${status.className}`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground">{entry.definition.whenSent}</p>

                    {shownBody ? (
                      <p className="line-clamp-3 whitespace-pre-wrap text-xs text-foreground/80">
                        {shownBody}
                      </p>
                    ) : entry.adoptedRef ? (
                      // Puntero cargado fuera del panel: está enviando, pero no
                      // tenemos su texto. Se dice tal cual en vez de mostrar un
                      // texto que quizá no es el que reciben los clientes.
                      <p className="text-xs text-muted-foreground italic">
                        Este mensaje está activo, pero se configuró fuera de este panel y no tenemos su
                        texto guardado. Al editarlo verás el texto sugerido para tu estilo.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Todavía no está activo. Al guardarlo lo enviamos a revisión de WhatsApp.
                      </p>
                    )}

                    {entry.pending && (
                      <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                        Tu cambio está en revisión desde el{' '}
                        {new Date(entry.pending.created_at).toLocaleDateString('es-CO', {
                          day: 'numeric',
                          month: 'long',
                        })}
                        . Los clientes siguen recibiendo el mensaje de arriba.
                      </p>
                    )}

                    {entry.lastRejected && (
                      <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                        <strong>WhatsApp no aprobó tu último cambio.</strong>{' '}
                        {entry.lastRejected.rejection_reason
                          ? `Motivo: ${entry.lastRejected.rejection_reason}.`
                          : 'No indicó un motivo.'}{' '}
                        El mensaje de arriba sigue funcionando: puedes corregir el texto y volver a
                        guardarlo.
                      </p>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => setEditing(entry)}
                    disabled={Boolean(entry.pending)}
                    title={
                      entry.pending
                        ? 'Espera a que WhatsApp termine de revisar el cambio anterior'
                        : undefined
                    }
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <TemplateEditorDialog
        entry={editing}
        brandName={state.brandName}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />
    </div>
  )
}
