'use client'

/**
 * Crea la plantilla de invitación al club (la de los dos botones) sin salir del
 * panel: la escribe en la cuenta Twilio del negocio y la manda a aprobar a Meta.
 *
 * Nadie tiene que copiar un token a ninguna parte — las credenciales salen de
 * la fila del tenant en el servidor, igual que en el resto del panel.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, MessageSquarePlus, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface Creada {
  contentSid: string
  friendlyName: string
  approvalSubmitted: boolean
  approvalError: string | null
}

/** Ejemplos de la línea de procedencia. Se eligen, no se inventan. */
const EJEMPLOS_PROCEDENCIA = [
  'Tenés este número registrado con nosotros de una visita anterior.',
  'Nos dejaste tus datos en el local cuando pediste la carta.',
  'Hiciste un pedido a domicilio con nosotros.',
]

export function ImportedContactsTemplate() {
  const [procedencia, setProcedencia] = useState('')
  const [promo, setPromo] = useState('un postre gratis en tu próxima visita')
  const [preview, setPreview] = useState('')
  const [creando, setCreando] = useState(false)
  const [creada, setCreada] = useState<Creada | null>(null)

  const cargarPreview = useCallback(async () => {
    try {
      const url = `/api/dashboard/imported-contacts/template?procedencia=${encodeURIComponent(procedencia)}`
      const res = await fetch(url)
      const data = await res.json()
      setPreview(data.body ?? '')
    } catch {
      setPreview('')
    }
  }, [procedencia])

  useEffect(() => {
    const t = setTimeout(() => void cargarPreview(), 300)
    return () => clearTimeout(t)
  }, [cargarPreview])

  const crear = async () => {
    if (!procedencia.trim()) return
    setCreando(true)
    try {
      const res = await fetch('/api/dashboard/imported-contacts/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procedencia: procedencia.trim(), promo_ejemplo: promo.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'No se pudo crear la plantilla')
        return
      }
      setCreada(data)
      toast.success(
        data.approvalSubmitted
          ? 'Plantilla creada y enviada a Meta. Tarda entre 24 y 48 horas.'
          : 'Plantilla creada, pero no se pudo enviar a Meta. Reenviala desde Plantillas.'
      )
    } catch {
      toast.error('Error de conexión')
    } finally {
      setCreando(false)
    }
  }

  if (creada) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <p className="font-semibold">Plantilla creada</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Se llama <code className="text-xs">{creada.friendlyName}</code>.{' '}
            {creada.approvalSubmitted
              ? 'Ya está en revisión de Meta: tarda entre 24 y 48 horas. Cuando la aprueben aparece sola en la lista de plantillas del paso 4.'
              : 'Quedó creada en Twilio pero NO se pudo mandar a revisión. Enviala desde la pantalla de Plantillas.'}
          </p>
          {creada.approvalError && (
            <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              {creada.approvalError}
            </p>
          )}
          <Button variant="outline" onClick={() => setCreada(null)}>Crear otra</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquarePlus className="h-4 w-4" /> Crear la plantilla con botones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          La plantilla pregunta en vez de promocionar, y trae dos botones:{' '}
          <strong>Quiero ser parte</strong> y <strong>No, gracias</strong>. El «no» de un toque cuesta
          mucho menos que un «Bloquear», y el «sí» deja el consentimiento registrado.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="procedencia" className="text-xs uppercase tracking-wide text-muted-foreground">
            De dónde salió su número — y tiene que ser verdad
          </Label>
          <Input
            id="procedencia"
            value={procedencia}
            onChange={(e) => setProcedencia(e.target.value)}
            placeholder="Tenés este número registrado con nosotros de una visita anterior."
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {EJEMPLOS_PROCEDENCIA.map((ej) => (
              <button
                key={ej}
                onClick={() => setProcedencia(ej)}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
              >
                {ej.slice(0, 40)}…
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Es lo que separa una invitación de un mensaje no solicitado. Si la base es comprada o de
            origen desconocido, <strong>no se puede decir que te visitaron</strong>.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="promo-ej" className="text-xs uppercase tracking-wide text-muted-foreground">
            Ejemplo de regalo (es lo que Meta revisa, no lo que se envía)
          </Label>
          <Input id="promo-ej" value={promo} onChange={(e) => setPromo(e.target.value)} />
        </div>

        {preview && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Vista previa</Label>
            <div className="rounded-lg border border-border bg-[#e7ffdb] p-3 text-sm text-neutral-900 whitespace-pre-wrap">
              {preview}
            </div>
            <div className="flex gap-2">
              <span className="flex-1 rounded border border-border bg-background py-1.5 text-center text-xs font-medium text-[#0a7cff]">
                Quiero ser parte
              </span>
              <span className="flex-1 rounded border border-border bg-background py-1.5 text-center text-xs font-medium text-[#0a7cff]">
                No, gracias
              </span>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          Al crearla se abre una solicitud de aprobación en la cuenta de Meta del negocio.{' '}
          <strong>Meta tarda entre 24 y 48 horas</strong> y la solicitud queda registrada en su WABA.
        </div>

        <Button onClick={crear} disabled={creando || !procedencia.trim()} className="gap-2">
          {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
          {creando ? 'Creando...' : 'Crear y enviar a Meta'}
        </Button>
      </CardContent>
    </Card>
  )
}
