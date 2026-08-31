'use client'

/**
 * Editor de UNA plantilla del catálogo estándar.
 *
 * §12 punto 6, textual: el dueño "ve una plantilla existente, la edita como si
 * fuera un documento — cambia texto, tal vez el estilo — y guarda. Debe sentirse
 * como una edición simple, nunca como 'estoy creando algo nuevo'."
 *
 * De ahí las decisiones de esta pantalla:
 *  · El botón dice "Guardar cambios", no "Crear plantilla". Nunca aparecen las
 *    palabras "versión", "plantilla nueva" ni "SID".
 *  · El dueño no elige nombre, ni categoría, ni idioma, ni valores de ejemplo:
 *    todo eso lo pone el catálogo. Solo escribe el mensaje.
 *  · Las variables no se explican como `{{1}}`: se muestran como fichas con
 *    nombre ("Nombre del cliente") y se insertan con un clic.
 *  · La vista previa muestra el mensaje YA armado con datos de ejemplo, que es
 *    lo que el dueño quiere juzgar.
 *
 * Lo único de la mecánica real que SÍ se le cuenta es lo que le afecta: que el
 * cambio tarda en verse y que mientras tanto sus clientes siguen recibiendo el
 * mensaje anterior. Ocultarle eso lo dejaría creyendo que ya cambió.
 *
 * La advertencia de responsabilidad y su casilla son obligatorias: decisión 3
 * del dueño ("si se las llegan a bloquear va a ser su culpa, ahí se lo
 * especificamos"). El backend rechaza el guardado sin ella y registra quién
 * aceptó y cuándo.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Clock, Loader2, MessageSquare, RotateCcw, ShieldAlert, XCircle } from 'lucide-react'
import { renderTemplatePreview, validateTemplateBody } from '@/constants/template-catalog'
import type { TemplateCatalogEntry } from '@/types/template.types'

interface Props {
  entry: TemplateCatalogEntry | null
  brandName: string
  onClose: () => void
  onSaved: (message: string) => void
}

export default function TemplateEditorDialog({ entry, brandName, onClose, onSaved }: Props) {
  const [body, setBody] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // El punto de partida es lo que se está enviando HOY. Solo cuando no hay nada
  // enviándose se parte del texto sugerido por el estilo del negocio.
  useEffect(() => {
    if (!entry) return
    setBody(entry.current?.body ?? entry.suggestedBody)
    setAccepted(false)
    setServerError(null)
  }, [entry])

  const issues = useMemo(() => {
    if (!entry) return []
    return validateTemplateBody(body, {
      category: entry.definition.category,
      expectedVariables: entry.definition.variables.length,
    })
  }, [body, entry])

  const preview = useMemo(() => {
    if (!entry) return ''
    return renderTemplatePreview(entry.definition.key, body, brandName)
  }, [body, entry, brandName])

  if (!entry) return null

  const { definition, current } = entry
  const unchanged = (current?.body ?? '').trim() === body.trim()
  const canSave = accepted && issues.length === 0 && body.trim().length > 0 && !unchanged && !saving

  /** Inserta una variable donde está el cursor, no al final. */
  const insertVariable = (index: number) => {
    const el = textareaRef.current
    const token = `{{${index}}}`
    if (!el) {
      setBody((b) => b + token)
      return
    }
    const start = el.selectionStart
    const end = el.selectionEnd
    setBody((b) => b.slice(0, start) + token + b.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setServerError(null)
    try {
      const res = await fetch(`/api/dashboard/templates/catalog/${definition.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), acceptedDisclaimer: true }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setServerError(data.error || 'No se pudo guardar. Inténtalo de nuevo.')
        return
      }
      onSaved(data.message)
    } catch {
      setServerError('No se pudo conectar. Revisa tu internet e inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{definition.label}</DialogTitle>
          <DialogDescription>{definition.whenSent}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="template-body" className="text-xs font-medium">
                Mensaje
              </label>
              <textarea
                id="template-body"
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed resize-y font-normal"
              />
              <p className="text-[10px] text-muted-foreground">
                Usa *asteriscos* para poner una palabra en negrita, como en WhatsApp.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium">Datos que el sistema completa solo</p>
              <div className="flex flex-wrap gap-1.5">
                {definition.variables.map((v) => (
                  <button
                    key={v.index}
                    type="button"
                    onClick={() => insertVariable(v.index)}
                    className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Haz clic para insertarlos donde está el cursor. Todos deben aparecer en el mensaje.
              </p>
            </div>

            {issues.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 space-y-1">
                {issues.map((issue) => (
                  <p key={issue} className="text-[11px] text-red-700 flex items-start gap-1.5">
                    <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    {issue}
                  </p>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setBody(entry.suggestedBody)}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Volver al texto sugerido para el estilo del negocio
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Así lo recibe tu cliente
            </p>
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-[13px] leading-relaxed">
              {definition.header && (
                <div className="mb-2 flex h-20 items-center justify-center rounded-lg bg-green-100 text-[11px] text-green-700">
                  {definition.header.format === 'image' ? 'Imagen del evento' : 'Video del evento'}
                </div>
              )}
              <p className="whitespace-pre-wrap break-words">{preview}</p>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Los datos son de ejemplo. En el mensaje real van los del cliente.
            </p>
          </div>
        </div>

        {/* Lo único de la mecánica real que le importa al dueño: que tarda, y
            que mientras tanto no se pierde ningún mensaje. */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900 flex items-start gap-2">
          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            WhatsApp revisa los cambios de mensajes antes de activarlos, y eso puede tardar entre 1 y 3
            días.{' '}
            {current ? (
              <>
                Mientras tanto, <strong>tus clientes siguen recibiendo el mensaje actual</strong>: no se
                pierde ninguno.
              </>
            ) : (
              <>Te avisamos en esta misma pantalla apenas quede activo.</>
            )}
          </p>
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
          />
          <span className="space-y-1">
            <span className="flex items-center gap-1.5 font-semibold">
              <ShieldAlert className="h-3.5 w-3.5" />
              Entiendo que el contenido es mi responsabilidad
            </span>
            <span className="block">
              WhatsApp puede rechazar o bloquear un mensaje si su contenido incumple sus políticas
              (contenido engañoso, urgencia falsa, enlaces acortados, pedir datos sensibles). Si eso
              ocurre por un texto que yo escribí, la responsabilidad es mía. Queda registrado quién hizo
              este cambio y cuándo.
            </span>
          </span>
        </label>

        {serverError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            {serverError}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!canSave} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
        {unchanged && issues.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-right -mt-2">
            No has hecho ningún cambio todavía.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
