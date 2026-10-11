'use client'

/**
 * Plantillas › Mensajes automáticos: UN renglón por mensaje del catálogo, con su estado
 * real y su botón, para los DOS proveedores (2026-10-11, «un solo libro»).
 *
 * Hasta esa fecha había tres pantallas para una sola cosa (`docs/PENDIENTES-PLANTILLAS.md`
 * §1.3): esta, solo Zernio; la de Twilio (lista cruda + «Del set estándar te faltan»); y
 * Ajustes › Plantillas WhatsApp, 15 desplegables para asignar lo que se creaba en otro lado.
 * Ahora es esta, con el mismo aspecto de siempre (el dueño: «me encanta cómo se ven ahora»):
 *
 *   · Zernio — «Enviar a Meta» (el texto del catálogo tal cual), «Editar» (el texto del
 *     dueño, con advertencia), «Activar» (una aprobada que el panel no conocía). El puntero
 *     lo mueve solo `promoteVersion()` al aprobarse.
 *   · Twilio — «Enviar a Meta» (crea la que falta y la somete; `fillEmptyPointer()` la deja
 *     asignada), «Enviar a Meta» también para una que quedó sin someter, el motivo del
 *     rechazo a la vista, y «Elegir otra» (lo que hacía Ajustes). Sin editor: los textos
 *     aprobados de las marcas Twilio no se tocan (decisión 6).
 *
 * El vocabulario es deliberado: el dueño ve «mensajes», no «plantillas»; ve «Activo» y «En
 * revisión», no `approved`/`pending`; nunca ve un SID. Lo que sí se le cuenta es lo que le
 * afecta: que Meta tarda 1-3 días y que mientras tanto sus clientes reciben lo de siempre.
 *
 * La lista de TODO lo que hay en la cuenta de WhatsApp (pedida por el dueño el 2026-10-02)
 * se mudó a la pestaña Biblioteca, junto con las plantillas para campañas.
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
  Repeat,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react'
import TemplateEditorDialog from './TemplateEditorDialog'
import TemplateSelector from './TemplateSelector'
import type { TemplateCatalogEntry, TemplateCatalogResponse } from '@/types/template.types'

type Provider = TemplateCatalogResponse['provider']

const CATEGORIA: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidad',
  AUTHENTICATION: 'Autenticación',
}

/** Estados del proveedor que significan «Meta lo frenó»: el mensaje no sale. */
const FRENADA = new Set(['paused', 'disabled'])
/** Twilio: la plantilla existe pero nunca se mandó a revisión. */
const SIN_SOMETER = new Set(['draft', 'unsubmitted', ''])

/** Qué se le muestra al dueño según el estado real del mensaje. */
function statusOf(entry: TemplateCatalogEntry, provider: Provider, aviso: string | null) {
  const real = entry.enWhatsApp?.status ?? null

  if (provider === 'twilio') {
    if (!entry.adoptedRef) {
      return { label: 'Pendiente de enviar', icon: Send, className: 'text-blue-700 bg-blue-50 border-blue-200' }
    }
    if (!entry.enWhatsApp) {
      return aviso
        ? { label: 'Asignado', icon: CheckCircle, className: 'text-muted-foreground bg-muted border-border' }
        : { label: 'Apunta a una plantilla que ya no existe', icon: XCircle, className: 'text-red-700 bg-red-50 border-red-200' }
    }
    if (real === 'approved') {
      return { label: 'Activo', icon: CheckCircle, className: 'text-green-700 bg-green-50 border-green-200' }
    }
    if (real === 'rejected') {
      return { label: 'Rechazado por WhatsApp', icon: XCircle, className: 'text-red-700 bg-red-50 border-red-200' }
    }
    if (real && FRENADA.has(real)) {
      return { label: 'Pausado por Meta', icon: XCircle, className: 'text-red-700 bg-red-50 border-red-200' }
    }
    if (SIN_SOMETER.has(real ?? '')) {
      return { label: 'Sin enviar a Meta', icon: AlertTriangle, className: 'text-orange-700 bg-orange-50 border-orange-200' }
    }
    return { label: 'En revisión de WhatsApp', icon: Clock, className: 'text-amber-700 bg-amber-50 border-amber-200' }
  }

  if (entry.pending) {
    return {
      label: entry.current || entry.adoptedRef ? 'Revisando un cambio' : 'En revisión de WhatsApp',
      icon: Clock,
      className: 'text-amber-700 bg-amber-50 border-amber-200',
    }
  }
  if (entry.lastRejected) {
    return {
      label: entry.current || entry.adoptedRef ? 'Cambio rechazado' : 'Rechazado por WhatsApp',
      icon: XCircle,
      className: 'text-red-700 bg-red-50 border-red-200',
    }
  }
  if ((entry.current || entry.adoptedRef) && real && FRENADA.has(real)) {
    return { label: 'Pausado por Meta', icon: XCircle, className: 'text-red-700 bg-red-50 border-red-200' }
  }
  if (entry.current || entry.adoptedRef) {
    return { label: 'Activo', icon: CheckCircle, className: 'text-green-700 bg-green-50 border-green-200' }
  }
  if (entry.approvedInWaba) {
    return { label: 'Aprobado, falta activarlo', icon: Link2, className: 'text-teal-700 bg-teal-50 border-teal-200' }
  }
  // No es un estado de error: es el estado NORMAL de un negocio recién dado de alta.
  return { label: 'Pendiente de enviar', icon: Send, className: 'text-blue-700 bg-blue-50 border-blue-200' }
}

/** Un mensaje que todavía no existe en WhatsApp y no tiene nada en revisión. */
function isUnsent(entry: TemplateCatalogEntry, provider: Provider): boolean {
  if (provider === 'twilio') return !entry.adoptedRef
  return !entry.current && !entry.adoptedRef && !entry.pending && !entry.approvedInWaba
}

/** Ya aprobado en WhatsApp pero sin conectar: el sistema todavía no lo envía (Zernio). */
function isAdoptable(entry: TemplateCatalogEntry, provider: Provider): boolean {
  return provider === 'zernio' && !entry.current && !entry.adoptedRef && !entry.pending && Boolean(entry.approvedInWaba)
}

/** Twilio: la plantilla asignada existe pero nunca se mandó a Meta. */
function needsTwilioSubmit(entry: TemplateCatalogEntry, provider: Provider): boolean {
  return provider === 'twilio' && Boolean(entry.enWhatsApp) && SIN_SOMETER.has(entry.enWhatsApp?.status ?? '')
}

interface RewardOption {
  id: string
  title: string
  visit_milestone: number | null
  is_active: boolean
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
  const [bulk, setBulk] = useState(false)
  // Twilio: el mensaje cuyo «Elegir otra» está abierto, y lo que se eligió.
  const [choosing, setChoosing] = useState<string | null>(null)
  const [chosen, setChosen] = useState('')
  // Twilio: la reactivación con premio del sistema anterior.
  const [rewards, setRewards] = useState<RewardOption[]>([])
  const [legacySid, setLegacySid] = useState('')
  const [legacyRewardId, setLegacyRewardId] = useState('')
  const [legacySaving, setLegacySaving] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/dashboard/templates/catalog')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'No se pudieron cargar tus mensajes.')
        return
      }
      const next = data as TemplateCatalogResponse
      setState(next)
      setLegacySid(next.sistemaAntiguo?.reactivationWithRewardSid ?? '')
      setLegacyRewardId(next.sistemaAntiguo?.reactivationRewardId ?? '')
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

  const provider: Provider = state?.provider ?? 'zernio'

  // Los premios fijos solo hacen falta para el bloque del sistema anterior (Twilio).
  useEffect(() => {
    if (provider !== 'twilio') return
    fetch('/api/dashboard/rewards')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRewards(Array.isArray(data) ? data.filter((r: RewardOption) => r.is_active) : []))
      .catch(() => setRewards([]))
  }, [provider])

  const handleSaved = (message: string) => {
    setEditing(null)
    setNotice(message)
    setActionError(null)
    load()
  }

  /**
   * Manda el mensaje a Meta con el texto del catálogo. El cuerpo NO viaja desde acá: lo
   * resuelve el servidor, para que este botón no pueda convertirse en «guardar sin la
   * advertencia». Zernio: `catalog/[key]/submit`. Twilio: `standard` (crea la que falta).
   * Devuelve el error, o `null` si salió bien.
   */
  const sendOne = async (entry: TemplateCatalogEntry): Promise<string | null> => {
    try {
      const res =
        provider === 'twilio'
          ? await fetch('/api/dashboard/templates/standard', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: entry.definition.key }),
            })
          : await fetch(`/api/dashboard/templates/catalog/${entry.definition.key}/submit`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) return data.error || 'No se pudo enviar a revisión. Inténtalo de nuevo.'
      if (provider === 'twilio' && !data.approvalSubmitted) {
        return 'Se creó, pero WhatsApp no la recibió para revisión. Usa «Enviar a Meta» en su fila.'
      }
      return null
    } catch {
      return 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.'
    }
  }

  const handleSubmitAsIs = async (entry: TemplateCatalogEntry) => {
    setSubmitting(entry.definition.key)
    setActionError(null)
    setNotice(null)
    const err = await sendOne(entry)
    if (err) setActionError(`"${entry.definition.label}": ${err}`)
    else setNotice(`"${entry.definition.label}": enviado a WhatsApp. Suele tardar entre 1 y 3 días; se activa solo cuando lo aprueben.`)
    setSubmitting(null)
    await load()
  }

  /**
   * TODOS los que faltan, de una vez: un solo viaje a Meta por marca (decisión B6 del
   * dueño). De a uno y en orden, igual que «Activar los N»: cada uno es su propia plantilla.
   */
  const handleSubmitAll = async (entries: TemplateCatalogEntry[]) => {
    setBulk(true)
    setActionError(null)
    setNotice(null)
    const failures: string[] = []
    for (const entry of entries) {
      setSubmitting(entry.definition.key)
      const err = await sendOne(entry)
      if (err) failures.push(`"${entry.definition.label}": ${err}`)
    }
    setSubmitting(null)
    setBulk(false)
    const ok = entries.length - failures.length
    if (ok > 0) {
      setNotice(
        `${ok === 1 ? '1 mensaje enviado' : `${ok} mensajes enviados`} a WhatsApp. Suele tardar entre 1 y 3 días; cada uno se activa solo cuando lo aprueben.`
      )
    }
    if (failures.length > 0) setActionError(failures.join(' · '))
    await load()
  }

  /** Twilio: la plantilla asignada quedó creada pero sin mandar a revisión. */
  const handleSubmitTwilioDraft = async (entry: TemplateCatalogEntry) => {
    if (!entry.enWhatsApp) return
    setSubmitting(entry.definition.key)
    setActionError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/dashboard/templates/${entry.enWhatsApp.ref}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: entry.definition.category }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) setActionError(`"${entry.definition.label}": ${data.error || 'No se pudo enviar.'}`)
      else setNotice(`"${entry.definition.label}": enviado a WhatsApp. Suele tardar entre 1 y 3 días.`)
    } catch {
      setActionError('No se pudo conectar. Revisa tu internet e inténtalo de nuevo.')
    } finally {
      setSubmitting(null)
    }
    await load()
  }

  /** Una llamada al servidor; el servidor decide QUÉ plantilla conecta (Zernio). */
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
    setBulk(true)
    setActionError(null)
    setNotice(null)
    const failures: string[] = []
    for (const entry of entries) {
      setSubmitting(entry.definition.key)
      const err = await adoptOne(entry)
      if (err) failures.push(`"${entry.definition.label}": ${err}`)
    }
    setSubmitting(null)
    setBulk(false)
    const ok = entries.length - failures.length
    if (ok > 0) setNotice(`Listo: ${ok === 1 ? '1 mensaje quedó activo' : `${ok} mensajes quedaron activos`}.`)
    if (failures.length > 0) setActionError(failures.join(' · '))
    await load()
  }

  /** Guarda un ajuste por la ruta de siempre (en Twilio acepta los punteros). */
  const saveSetting = async (key: string, value: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      if (res.ok) return null
      const data = await res.json().catch(() => ({}))
      return data.error || 'No se pudo guardar.'
    } catch {
      return 'No se pudo conectar. Revisa tu internet e inténtalo de nuevo.'
    }
  }

  /** Twilio: «Elegir otra» — lo que hacía el desplegable de Ajustes, mensaje por mensaje. */
  const handleChoose = async (entry: TemplateCatalogEntry) => {
    setSubmitting(entry.definition.key)
    setActionError(null)
    setNotice(null)
    // El error se MUESTRA. En Ajustes, `handleSaveTemplates` lo tragaba (OPER-4-bis).
    const err = await saveSetting(entry.definition.settingsKey, chosen)
    if (err) setActionError(`"${entry.definition.label}": ${err}`)
    else {
      setNotice(
        chosen
          ? `"${entry.definition.label}": desde ahora sale con la plantilla que elegiste.`
          : `"${entry.definition.label}": quedó sin plantilla. Este mensaje NO se enviará.`
      )
      setChoosing(null)
    }
    setSubmitting(null)
    await load()
  }

  const handleSaveLegacy = async () => {
    setLegacySaving(true)
    setActionError(null)
    setNotice(null)
    const errs = (
      await Promise.all([
        saveSetting('reactivation_with_reward_template_sid', legacySid),
        saveSetting('reactivation_reward_id', legacyRewardId),
      ])
    ).filter(Boolean)
    if (errs.length > 0) setActionError(errs.join(' · '))
    else setNotice('Reactivación con premio (sistema anterior): guardado.')
    setLegacySaving(false)
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

  const aviso = state.aviso ?? null
  const pendingCount = state.entries.filter((e) =>
    provider === 'twilio'
      ? e.enWhatsApp && !SIN_SOMETER.has(e.enWhatsApp.status) && !['approved', 'rejected'].includes(e.enWhatsApp.status) && !FRENADA.has(e.enWhatsApp.status)
      : e.pending
  ).length
  const unsent = state.entries.filter((e) => isUnsent(e, provider))
  const sendable = unsent.filter((e) => !e.blockedReason)
  const adoptable = state.entries.filter((e) => isAdoptable(e, provider))
  const elegibles = (state.elegibles ?? []).map((o) => ({ sid: o.ref, friendly_name: o.name, body: o.body }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Mensajes de WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground">
            Los {state.entries.length} mensajes que tu negocio le envía solo a sus clientes.
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
          <button type="button" onClick={() => setNotice(null)} className="text-xs underline shrink-0">
            Cerrar
          </button>
        </div>
      )}

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="text-xs underline shrink-0">
            Cerrar
          </button>
        </div>
      )}

      {aviso && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>{aviso}</p>
        </div>
      )}

      {/* Lo que estaba en WhatsApp y el panel no conocía: se registró al abrir la pantalla. */}
      {state.reconocidas && state.reconocidas.length > 0 && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 flex items-start gap-2">
          <Sparkles className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p>Encontramos en tu cuenta de WhatsApp mensajes que esta pantalla no conocía. Ya quedaron al día:</p>
            <ul className="list-disc pl-4 text-xs">
              {state.reconocidas.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Aprobadas en Meta pero sin conectar: el alta las creó allá sin registrarlas acá.
          Mientras no se activen, el sistema NO las envía. */}
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
              disabled={submitting !== null || bulk}
            >
              {bulk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              {adoptable.length === 1 ? 'Activarlo' : `Activar los ${adoptable.length}`}
            </Button>
          </div>
        </div>
      )}

      {/* Lo primero que hay que hacer en esta pantalla: los que faltan. Se pueden mandar
          TODOS de una vez, que es un solo viaje a Meta (decisión B6). */}
      {unsent.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex items-start gap-2">
          <Send className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <p>
              {unsent.length === 1
                ? 'Te queda 1 mensaje sin enviar a WhatsApp.'
                : `Te quedan ${unsent.length} mensajes sin enviar a WhatsApp.`}{' '}
              Cada uno ya viene escrito: <strong>léelo y envíalo tal cual</strong>
              {provider === 'zernio' ? (
                <>
                  , o ábrelo en <strong>Editar</strong> si quieres cambiarle algo antes
                </>
              ) : null}
              . Hasta que WhatsApp los apruebe, tu negocio no puede mandarlos.
            </p>
            {sendable.length > 1 && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => handleSubmitAll(sendable)}
                disabled={submitting !== null || bulk}
              >
                {bulk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Enviar los {sendable.length} juntos a Meta
              </Button>
            )}
          </div>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            WhatsApp está revisando {pendingCount === 1 ? 'un mensaje' : `${pendingCount} mensajes`}. Suele
            tardar entre 1 y 3 días.{' '}
            <strong>Mientras tanto tus clientes siguen recibiendo los mensajes actuales.</strong>
          </p>
        </div>
      )}

      <div className="grid gap-3">
        {state.entries.map((entry) => {
          const status = statusOf(entry, provider, aviso)
          const StatusIcon = status.icon
          const real = entry.enWhatsApp
          const shownBody =
            provider === 'twilio'
              ? (real?.body ?? (entry.adoptedRef ? null : entry.suggestedBody))
              : (entry.current?.body ??
                (entry.approvedInWaba
                  ? (state.wabaTemplates?.find((t) => t.name === entry.approvedInWaba)?.body ?? null)
                  : entry.adoptedRef
                    ? (real?.body ?? null)
                    : (entry.pending?.body ?? null)))
          const categoriaDistinta =
            real && real.category && real.category.toUpperCase() !== entry.definition.category
              ? real.category.toUpperCase()
              : null

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
                      <p className="line-clamp-3 whitespace-pre-wrap text-xs text-foreground/80">{shownBody}</p>
                    ) : entry.adoptedRef ? (
                      // Puntero cargado fuera del panel y sin texto a la vista (el proveedor no
                      // respondió o no la conoce). Se dice tal cual en vez de inventar un texto.
                      <p className="text-xs text-muted-foreground italic">
                        Este mensaje tiene una plantilla asignada, pero ahora no pudimos leer su texto en WhatsApp.
                      </p>
                    ) : (
                      // Se muestra el texto que se va a enviar: es justo lo que hay que leer
                      // antes de apretar "Enviar a Meta". Recortado, porque son muchos.
                      <p className="line-clamp-4 whitespace-pre-wrap text-xs text-foreground/80">
                        {entry.suggestedBody}
                      </p>
                    )}

                    {entry.pending && (
                      <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                        {entry.current || entry.adoptedRef ? 'Tu cambio está en revisión' : 'En revisión'}
                        {entry.pending.submitted_at
                          ? ` desde el ${new Date(entry.pending.submitted_at).toLocaleDateString('es-CO', {
                              day: 'numeric',
                              month: 'long',
                            })}`
                          : ''}
                        .{' '}
                        {entry.current || entry.adoptedRef
                          ? 'Los clientes siguen recibiendo el mensaje de arriba.'
                          : 'Se activa solo cuando WhatsApp lo apruebe.'}
                      </p>
                    )}

                    {entry.blockedReason && isUnsent(entry, provider) && (
                      <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                        {entry.blockedReason}
                      </p>
                    )}

                    {entry.lastRejected && (
                      <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                        <strong>
                          {entry.current || entry.adoptedRef
                            ? 'WhatsApp no aprobó tu último cambio.'
                            : 'WhatsApp no aprobó este mensaje.'}
                        </strong>{' '}
                        {entry.lastRejected.rejection_reason
                          ? `Motivo: ${entry.lastRejected.rejection_reason}.`
                          : 'No indicó un motivo.'}{' '}
                        {entry.current || entry.adoptedRef
                          ? 'El mensaje de arriba sigue funcionando: puedes corregir el texto y volver a guardarlo.'
                          : 'Corrige el texto con Editar y vuelve a enviarlo.'}
                      </p>
                    )}

                    {provider === 'twilio' && real?.status === 'rejected' && (
                      <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                        <strong>WhatsApp rechazó la plantilla asignada.</strong>{' '}
                        {real.rejectionReason ? `Motivo: ${real.rejectionReason}.` : 'No indicó un motivo.'} Mientras
                        tanto este mensaje no sale: elige otra aprobada con «Elegir otra», o crea una corregida en la
                        pestaña Biblioteca y elígela acá cuando la aprueben.
                      </p>
                    )}

                    {real && FRENADA.has(real.status) && (entry.current || entry.adoptedRef) && (
                      <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
                        <strong>Meta pausó esta plantilla.</strong> Mientras siga así, este mensaje no les llega a tus
                        clientes.
                      </p>
                    )}

                    {categoriaDistinta && (
                      <p className="text-[11px] text-muted-foreground">
                        WhatsApp la clasificó como {CATEGORIA[categoriaDistinta] ?? categoriaDistinta.toLowerCase()} (se
                        pidió {CATEGORIA[entry.definition.category] ?? entry.definition.category.toLowerCase()}).
                      </p>
                    )}

                    {provider === 'twilio' && choosing === entry.definition.key && (
                      <div className="space-y-2 rounded-lg border p-3">
                        <TemplateSelector
                          label={entry.definition.label}
                          hint={`Datos que manda el sistema: ${entry.definition.variables
                            .map((v) => `{{${v.index}}}=${v.label.toLowerCase()}`)
                            .join(' · ')}`}
                          value={chosen}
                          onChange={setChosen}
                          templates={elegibles}
                          disabled={submitting !== null}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleChoose(entry)} disabled={submitting !== null}>
                            {submitting === entry.definition.key ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            Guardar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setChoosing(null)}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Las salidas de cada mensaje. «Enviar a Meta» solo existe mientras no haya
                      nada enviado: reemplazar un mensaje vivo pasa SIEMPRE por el editor
                      (Zernio) o por «Elegir otra» (Twilio). */}
                  <div className="flex shrink-0 flex-col gap-2">
                    {isAdoptable(entry, provider) && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleAdopt(entry)}
                        disabled={submitting !== null || bulk}
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

                    {(isUnsent(entry, provider) || needsTwilioSubmit(entry, provider)) && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() =>
                          needsTwilioSubmit(entry, provider) ? handleSubmitTwilioDraft(entry) : handleSubmitAsIs(entry)
                        }
                        disabled={submitting !== null || bulk || (isUnsent(entry, provider) && Boolean(entry.blockedReason))}
                        title={isUnsent(entry, provider) ? (entry.blockedReason ?? undefined) : undefined}
                      >
                        {submitting === entry.definition.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Enviar a Meta
                      </Button>
                    )}

                    {provider === 'zernio' ? (
                      <Button
                        variant={isUnsent(entry, provider) || isAdoptable(entry, provider) ? 'outline' : 'default'}
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setEditing(entry)}
                        disabled={Boolean(entry.pending) || submitting !== null || Boolean(entry.blockedReason)}
                        title={
                          entry.pending
                            ? 'Espera a que WhatsApp termine de revisar el cambio anterior'
                            : (entry.blockedReason ?? undefined)
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          setChosen(entry.adoptedRef ?? '')
                          setChoosing(choosing === entry.definition.key ? null : entry.definition.key)
                        }}
                        disabled={submitting !== null || bulk}
                        title="Elegir una plantilla que WhatsApp ya aprobó en tu cuenta"
                      >
                        <Repeat className="h-3.5 w-3.5" />
                        Elegir otra
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Twilio: la reactivación «con premio» del sistema anterior. No está en el catálogo y
          la retira la fase 1B del ciclo; mientras exista, se cambia acá (antes, en Ajustes). */}
      {provider === 'twilio' && state.sistemaAntiguo && (
        <details className="rounded-lg border border-dashed" style={{ borderColor: 'rgba(156,163,175,0.4)' }}>
          <summary
            className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-widest select-none"
            style={{ color: '#9ca3af' }}
          >
            Sistema antiguo — No usar si ya migraste a puntos
          </summary>
          <div className="px-3 pb-3 space-y-3 pt-2">
            <TemplateSelector
              label="Reactivación CON regalo (legacy)"
              hint="Variables: {{1}}=nombre, {{3}}=premio. Solo instancias que aún no migraron a puntos."
              value={legacySid}
              onChange={setLegacySid}
              templates={elegibles}
            />
            <div className="space-y-1.5">
              <label
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest"
                style={{ color: '#9ca3af' }}
              >
                Recompensa fija (legacy)
              </label>
              <select
                value={legacyRewardId}
                onChange={(e) => setLegacyRewardId(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
              >
                <option value="">— Sin recompensa fija —</option>
                {rewards.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                    {r.visit_milestone !== null ? ` (visita #${r.visit_milestone})` : ' (sin milestone)'}
                  </option>
                ))}
              </select>
            </div>
            <Button size="sm" onClick={handleSaveLegacy} disabled={legacySaving}>
              {legacySaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Guardar
            </Button>
          </div>
        </details>
      )}

      {provider === 'zernio' && (
        <TemplateEditorDialog
          entry={editing}
          brandName={state.brandName}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
