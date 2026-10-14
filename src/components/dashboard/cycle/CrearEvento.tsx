'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MediaUploader } from '@/components/dashboard/Calendar/MediaUploader'
import {
  MAX_TEXTO_DEL_EVENTO,
  cantidad,
  hoyEnBogota,
  invitadosDelEvento,
  leerJson,
  salidaDeLaInvitacion,
  textoDeUnaLinea,
  textoDelBotonDelEvento,
  textoSugeridoDelEvento,
  vistaPreviaDelWhatsAppDelEvento,
  type Lectura,
} from '@/lib/cycle-screen'
import { DEFAULT_PRE_EVENT_BLACKOUT_DAYS } from '@/constants/rewards'
import { BurbujaDeWhatsApp } from './MandarRegalo'

export interface DatosDelEventoNuevo {
  /** Los que reciben la invitación: en el ciclo y dormidos (de la portada). */
  enElCiclo: number
  dormidos: number
  /** El ciclo encendido en la marca: solo entonces «incluir dormidos» cambia algo. */
  encendido: boolean
  /** La hora de la marca (`16:30`): la invitación sale ese día a esa hora. */
  hora: string
  /** Para la vista previa: la marca y el cuerpo de la invitación del catálogo (`null` mientras carga). */
  marca: string | null
  cuerpo: string | null
}

type Media = { url: string; type: 'image' | 'video'; path: string } | null

/**
 * «Crear un evento» con el mismo trato que el regalo (spec §6.5), en vez del formulario de antes
 * que nadie usó (`EventCreateDialog`, retirado): nombre · fecha · foto · **texto sugerido ya
 * escrito y editable** · enlace opcional · **incluir dormidos** (default apagada: con el ciclo
 * encendido, un evento no les llega a los dormidos salvo esa casilla, spec §3.1/§3.5).
 *
 * La invitación sale el día del evento a la hora de la marca, con la plantilla de evento de
 * siempre (`calendar-dispatch`), y los días antes quedan «reservados para el evento». Sin foto se
 * guarda igual, y «Para hoy» avisa que sin foto no sale (WhatsApp exige la imagen).
 */
export function CrearEvento({
  datos,
  fechaInicial,
  nombreInicial,
  onCreado,
  crear = crearEnElServidor,
}: {
  datos: DatosDelEventoNuevo
  fechaInicial?: string
  nombreInicial?: string
  onCreado?: () => void
  /** Inyectable para las pruebas. */
  crear?: (cuerpo: unknown) => Promise<Lectura<{ event?: { id: string } }>>
}) {
  const [nombre, setNombre] = useState(nombreInicial ?? '')
  const [fecha, setFecha] = useState(fechaInicial ?? '')
  const [media, setMedia] = useState<Media>(null)
  // El texto sugerido sigue al nombre y a la fecha hasta que el dueño lo toca.
  const [textoPropio, setTextoPropio] = useState<string | null>(null)
  const [enlace, setEnlace] = useState('')
  const [incluirDormidos, setIncluirDormidos] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  const texto = textoPropio ?? textoSugeridoDelEvento(nombre, fecha)
  const invitados = invitadosDelEvento({ enElCiclo: datos.enElCiclo, dormidos: datos.dormidos, encendido: datos.encendido, incluirDormidos })
  const hoy = hoyEnBogota()

  const enviar = async () => {
    setError(null)
    if (!nombre.trim()) return setError('Ponle un nombre al evento.')
    if (!fecha) return setError('Elige la fecha del evento.')
    if (fecha < hoy) return setError('Esa fecha ya pasó.')
    const link = enlace.trim()
    if (link && !/^https?:\/\//i.test(link)) return setError('El enlace empieza con http:// o https:// (ej. https://tucarta.com/festival).')
    if (/\s/.test(link)) return setError('El enlace no puede llevar espacios.')
    // Un evento de hoy cuya hora ya pasó sale en la próxima vuelta del despachador (cada 15 min):
    // `calendar-dispatch` toma todo lo programado con la hora cumplida.
    const sale = salidaDeLaInvitacion(fecha, datos.hora)
    if (!sale) return setError('No pudimos calcular la hora de la invitación.')

    setEnviando(true)
    const r = await crear({
      title: nombre.trim(),
      description: textoDeUnaLinea(texto).slice(0, MAX_TEXTO_DEL_EVENTO) || null,
      event_date: fecha,
      event_type: 'promo',
      send_mode: 'auto',
      scheduled_send_at: sale,
      filters: {},
      media_url: media?.url ?? null,
      media_type: media?.type ?? null,
      link_url: link || null,
      blackout_days: DEFAULT_PRE_EVENT_BLACKOUT_DAYS,
      include_dormant: incluirDormidos,
    })
    setEnviando(false)
    if (!r.ok) return setError(r.mensaje)
    setHecho(
      `Programado: «${nombre.trim()}» sale ${textoDelBotonDelEvento(fecha, datos.hora).replace(/^Programar para /, '')} a ${cantidad(invitados)} personas. ` +
        `Los ${DEFAULT_PRE_EVENT_BLACKOUT_DAYS} días antes nadie de ellos recibe otro mensaje.` +
        (media ? '' : ' Falta la foto: sin foto no sale. Súbela desde su ficha en la vista por fecha.')
    )
    onCreado?.()
  }

  if (hecho) {
    return (
      <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
        {hecho}
      </p>
    )
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
      <div className="min-w-0 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="evento-nombre">Nombre</Label>
          <Input id="evento-nombre" value={nombre} maxLength={120} placeholder="Ej. Noche de sushi" onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="evento-fecha">Fecha</Label>
          <Input id="evento-fecha" type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} className="w-auto" />
        </div>
        <div className="space-y-1.5">
          <Label>Foto</Label>
          <MediaUploader value={media} onChange={setMedia} disabled={enviando} />
          {!media && <p className="text-xs text-amber-700">Sin foto no sale: WhatsApp exige la imagen en este tipo de mensaje.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="evento-texto">Texto (ya escrito, cámbialo si quieres)</Label>
          <textarea
            id="evento-texto"
            value={texto}
            maxLength={MAX_TEXTO_DEL_EVENTO}
            rows={3}
            onChange={(e) => setTextoPropio(e.target.value)}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">Va en un solo párrafo: WhatsApp no acepta saltos de línea en esta parte.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="evento-enlace">Enlace (opcional)</Label>
          <Input
            id="evento-enlace"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={enlace}
            maxLength={500}
            onChange={(e) => setEnlace(e.target.value)}
          />
        </div>
        {datos.encendido && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={incluirDormidos} onChange={(e) => setIncluirDormidos(e.target.checked)} />
            <span>
              Incluir a los dormidos <span className="text-xs text-muted-foreground">({cantidad(datos.dormidos)})</span>
            </span>
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          {datos.encendido
            ? incluirDormidos
              ? `A los del ciclo y a los dormidos: ${cantidad(invitados)}.`
              : `A todos los que están en el ciclo: ${cantidad(invitados)}.`
            : `A todos los que aceptan mensajes: ${cantidad(invitados)}.`}{' '}
          Los {DEFAULT_PRE_EVENT_BLACKOUT_DAYS} días antes quedan reservados: ningún otro mensaje tuyo ni del ciclo les llega esa semana.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="button" disabled={enviando} onClick={enviar}>
          {enviando ? 'Programando…' : textoDelBotonDelEvento(fecha, datos.hora)}
        </Button>
      </div>

      <div className="min-w-0 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Así lo ve el cliente</p>
        <BurbujaDeWhatsApp
          conFoto
          texto={
            datos.cuerpo
              ? vistaPreviaDelWhatsAppDelEvento(datos.cuerpo, {
                  cliente: 'Sara',
                  marca: datos.marca ?? '',
                  nombre,
                  fecha,
                  texto,
                  enlace,
                })
              : 'Cargando la vista previa…'
          }
        />
      </div>
    </div>
  )
}

async function crearEnElServidor(cuerpo: unknown): Promise<Lectura<{ event?: { id: string } }>> {
  return leerJson<{ event?: { id: string } }>('/api/dashboard/calendar/events', 'No pudimos crear el evento. Intenta de nuevo en un minuto.', {
    init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) },
  })
}
