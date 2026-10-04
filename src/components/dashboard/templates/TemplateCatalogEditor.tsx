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
 *
 * La excepción, pedida por el dueño (2026-10-02): al final va la lista REAL de
 * la WABA, con nombres y estado de Meta, porque sin ella no había dónde ver si
 * una plantilla recién creada (la del Golden Bullet, por ejemplo) salió o no.
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
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react'
import TemplateEditorDialog from './TemplateEditorDialog'
import type { TemplateCatalogEntry, TemplateCatalogResponse } from '@/types/template.types'

/** Estado de Meta (en minúsculas, como lo deja `mapZernioTemplateToItem`) en palabras del dueño. */
function wabaStatusOf(status: string) {
  switch (status) {
    case 'approved':
      return { label: 'Aprobada', className: 'text-green-700 bg-green-50 border-green-200' }
    case 'pending':
    case 'in_appeal':
      return { label: 'En revisión', className: 'text-amber-700 bg-amber-50 border-amber-200' }
    case 'rejected':
      return { label: 'Rechazada', className: 'text-red-700 bg-red-50 border-red-200' }
    case 'paused':
      return { label: 'Pausada por Meta', className: 'text-red-700 bg-red-50 border-red-200' }
    case 'disabled':
      return { label: 'Desactivada por Meta', className: 'text-red-700 bg-red-50 border-red-200' }
    default:
      return { label: status, className: 'text-muted-foreground bg-muted border-border' }
  }
}

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
  if (entry.approvedInWaba) {
    return {
      label: 'Aprobado, falta activarlo',
      icon: Link2,
      className: 'text-teal-700 bg-teal-50 border-teal-200',
    }
  }
  // No es un estado de error: es el estado NORMAL de un negocio recién dado de
  // alta. "Sin configurar" sonaba a algo roto y no decía qué hacer; "Pendiente
  // de enviar" nombra la acción que tiene al lado.
  return {
    label: 'Pendiente de enviar',
    icon: Send,
    className: 'text-blue-700 bg-blue-50 border-blue-200',
  }
}

/** Un mensaje que todavía no existe en WhatsApp y no tiene nada en revisión. */
function isUnsent(entry: TemplateCatalogEntry): boolean {
  return !entry.current && !entry.adoptedRef && !entry.pending && !entry.approvedInWaba
}

/** Ya aprobado en WhatsApp pero sin conectar: el sistema todavía no lo envía. */
function isAdoptable(entry: TemplateCatalogEntry): boolean {
  return !entry.current && !entry.adoptedRef && !entry.pending && Boolean(entry.approvedInWaba)
}

export default function TemplateCatalogEditor() {
  const [state, setState] = useState<TemplateCatalogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<TemplateCatalogEntry | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [adoptingAll, setAdoptingAll] = useState(false)

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
    setActionError(null)
    load()
  }

  /**
   * Manda el texto propuesto TAL CUAL, sin abrir el editor. El cuerpo no viaja
   * desde acá a propósito: lo resuelve el servidor con el estilo del negocio,
   * para que este botón no pueda convertirse en «guardar sin la advertencia».
   */
  const handleSubmitAsIs = async (entry: TemplateCatalogEntry) => {
    setSubmitting(entry.definition.key)
    setActionError(null)
    setNotice(null)
    try {
      const res = await fetch(
        `/api/dashboard/templates/catalog/${entry.definition.key}/submit`,
        { method: 'POST' }
      )
      const data = await res.json()
      if (!res.ok || !data.success) {
        setActionError(data.error || 'No se pudo enviar a revisión. Inténtalo de nuevo.')
        return
      }
      setNotice(`"${entry.definition.label}": ${data.message}`)
      await load()
    } catch {
      setActionError('No se pudo conectar. Revisa tu internet e inténtalo de nuevo.')
    } finally {
      setSubmitting(null)
    }
  }

  /** Una llamada al servidor; el servidor decide QUÉ plantilla conecta. */
  const adoptOne = async (entry: TemplateCatalogEntry): Promise<string | null> => {
    try {
      const res = await fetch(`/api/dashboard/templates/catalog/${entry.definition.key}/adopt`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.success) return data.error || 'No se pudo activar.'
      return null
    } catch {
      return 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.'
    }
  }

  const handleAdopt = async (entry: TemplateCatalogEntry) => {
    setSubmitting(entry.definition.key)
    setActionError(null)
    setNotice(null)
    const err = await adoptOne(entry)
    if (err) setActionError(`"${entry.definition.label}": ${err}`)
    else setNotice(`"${entry.definition.label}": ya está activo y tus clientes empiezan a recibirlo.`)
    setSubmitting(null)
    await load()
  }

  /** De a una, en orden: cada activación escribe su propia fila y su puntero. */
  const handleAdoptAll = async (entries: TemplateCatalogEntry[]) => {
    setAdoptingAll(true)
    setActionError(null)
    setNotice(null)
    const failures: string[] = []
    for (const entry of entries) {
      setSubmitting(entry.definition.key)
      const err = await adoptOne(entry)
      if (err) failures.push(`"${entry.definition.label}": ${err}`)
    }
    setSubmitting(null)
    setAdoptingAll(false)
    const ok = entries.length - failures.length
    if (ok > 0) setNotice(`Listo: ${ok === 1 ? '1 mensaje quedó activo' : `${ok} mensajes quedaron activos`}.`)
    if (failures.length > 0) setActionError(failures.join(' · '))
    await load()
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

  const pendingCount = state.entries.filter((e) => e.pending).length
  const unsentCount = state.entries.filter(isUnsent).length
  const adoptable = state.entries.filter(isAdoptable)

  // Qué mensaje del catálogo está usando cada plantilla de la WABA, para la
  // lista de abajo. Solo las vigentes: una pendiente todavía no se envía.
  const inUseBy = new Map<string, string>()
  for (const e of state.entries) {
    const ref = e.current?.provider_ref ?? e.adoptedRef
    if (ref) inUseBy.set(ref, e.definition.label)
  }
  const wabaBodyOf = (name: string) =>
    state.wabaTemplates?.find((t) => t.name === name)?.body ?? null

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

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-xs underline shrink-0"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Aprobadas en Meta pero sin conectar: el alta las creó allá sin
          registrarlas acá. Mientras no se activen, el sistema NO las envía. */}
      {adoptable.length > 0 && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 flex items-start gap-2">
          <Link2 className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <p>
              {adoptable.length === 1
                ? 'Tienes 1 mensaje que WhatsApp ya aprobó pero que todavía no está activo.'
                : `Tienes ${adoptable.length} mensajes que WhatsApp ya aprobó pero que todavía no están activos.`}{' '}
              <strong>Mientras no los actives, tus clientes no los reciben.</strong> No hace falta
              enviarlos a Meta otra vez.
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => handleAdoptAll(adoptable)}
              disabled={submitting !== null || adoptingAll}
            >
              {adoptingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              {adoptable.length === 1 ? 'Activarlo' : `Activar los ${adoptable.length}`}
            </Button>
          </div>
        </div>
      )}

      {/* El estado de un negocio recién dado de alta: nada enviado todavía. Se
          dice acá arriba porque es lo primero que hay que hacer en esta
          pantalla, y hasta ahora no lo decía nada. */}
      {unsentCount > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex items-start gap-2">
          <Send className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            {unsentCount === 1
              ? 'Te queda 1 mensaje sin enviar a WhatsApp.'
              : `Te quedan ${unsentCount} mensajes sin enviar a WhatsApp.`}{' '}
            Cada uno ya viene escrito: <strong>envíalo tal cual</strong> con el botón de su fila, o
            ábrelo en <strong>Editar</strong> si quieres cambiarle algo antes. Hasta que WhatsApp los
            apruebe, tu negocio no puede mandarlos.
          </p>
        </div>
      )}

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
          const shownBody =
            entry.current?.body ?? (entry.approvedInWaba ? wabaBodyOf(entry.approvedInWaba) : null)

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
                      // Se muestra el texto que se va a enviar, no un "todavía
                      // no está activo": es justo lo que hay que leer antes de
                      // apretar "Enviar a Meta". Recortado, porque son 13.
                      <p className="line-clamp-4 whitespace-pre-wrap text-xs text-foreground/80">
                        {entry.suggestedBody}
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

                    {entry.blockedReason && (
                      <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                        {entry.blockedReason}
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

                  {/* Dos salidas para el mismo mensaje: mandarlo tal cual —que
                      es lo que se quiere en casi todos— o abrirlo para tocarle
                      algo puntual. "Enviar a Meta" solo existe mientras no haya
                      nada enviado: reemplazar un mensaje vivo pasa SIEMPRE por
                      el editor, con su advertencia. */}
                  <div className="flex shrink-0 flex-col gap-2">
                    {isAdoptable(entry) && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleAdopt(entry)}
                        disabled={submitting !== null || adoptingAll}
                        title="WhatsApp ya la aprobó: solo falta empezar a usarla"
                      >
                        {submitting === entry.definition.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5" />
                        )}
                        Activar
                      </Button>
                    )}

                    {isUnsent(entry) && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleSubmitAsIs(entry)}
                        disabled={submitting !== null || Boolean(entry.blockedReason)}
                        title={entry.blockedReason ?? undefined}
                      >
                        {submitting === entry.definition.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Enviar a Meta
                      </Button>
                    )}

                    <Button
                      variant={isUnsent(entry) || isAdoptable(entry) ? 'outline' : 'default'}
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setEditing(entry)}
                      disabled={
                        Boolean(entry.pending) || submitting !== null || Boolean(entry.blockedReason)
                      }
                      title={
                        entry.pending
                          ? 'Espera a que WhatsApp termine de revisar el cambio anterior'
                          : (entry.blockedReason ?? undefined)
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* La WABA tal cual: todo lo que existe en WhatsApp, del catálogo o no. */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <div>
            <h2 className="text-base font-semibold">Todas tus plantillas en WhatsApp</h2>
            <p className="text-xs text-muted-foreground">
              Lo que hay de verdad en tu cuenta de WhatsApp y en qué estado lo tiene Meta: los mensajes
              de arriba, las invitaciones del Golden Bullet y cualquier otra. Usa «Actualizar» para ver
              el último estado.
            </p>
          </div>

          {state.wabaTemplates === null ? (
            <p className="text-xs text-amber-800 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
              No se pudo consultar WhatsApp en este momento. Prueba de nuevo con «Actualizar».
            </p>
          ) : state.wabaTemplates.length === 0 ? (
            <p className="text-xs text-muted-foreground">Tu cuenta de WhatsApp todavía no tiene plantillas.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {state.wabaTemplates.map((t) => {
                const st = wabaStatusOf(t.status)
                const usedBy = inUseBy.get(t.name)
                return (
                  <li key={`${t.name}-${t.language}`} className="px-3 py-2.5 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs break-all">{t.name}</span>
                      <Badge variant="outline" className={`h-5 border text-[10px] ${st.className}`}>
                        {st.label}
                      </Badge>
                      {t.name.startsWith('club_invite_') && (
                        <Badge variant="outline" className="h-5 text-[10px]">Golden Bullet</Badge>
                      )}
                      {usedBy && (
                        <Badge variant="outline" className="h-5 text-[10px] text-green-700 border-green-200">
                          En uso: {usedBy}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {t.language} · {t.category.toLowerCase()}
                        {t.has_media ? ' · con foto/video' : ''}
                      </span>
                    </div>
                    <p className="line-clamp-2 whitespace-pre-wrap text-[11px] text-foreground/70">{t.body}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <TemplateEditorDialog
        entry={editing}
        brandName={state.brandName}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />
    </div>
  )
}
