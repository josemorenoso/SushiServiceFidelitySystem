'use client'

/**
 * La pestaña «Plantilla» de Golden Bullet: los TRES textos del flujo.
 *
 *   1. El mensaje 1 —la plantilla con los dos botones— se escribe acá entero,
 *      con los títulos de los botones, y se crea en el proveedor por el que
 *      sale la difusión (Twilio, o la línea de coexistencia en Zernio) y se
 *      manda a aprobar a Meta sin que nadie copie un token.
 *   2. La respuesta al «sí» (texto + enlace de registro + foto del regalo).
 *   3. La respuesta al «no».
 *
 * Nada de esto está horneado en el código: lo que no se escribe sale con los
 * textos de defecto del servidor. Los comodines `{nombre}`, `{enlace}` y
 * `{marca}` se rellenan al contestar (`club-optin.service.ts`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, MessageSquarePlus, CheckCircle2, ImagePlus, Save, Reply } from 'lucide-react'
import { toast } from 'sonner'

interface Creada {
  contentSid: string
  friendlyName: string
  approvalSubmitted: boolean
  approvalError: string | null
  provider?: 'twilio' | 'zernio'
}

interface Config {
  brand_name: string
  /** Por qué línea sale la difusión hoy. */
  provider: 'twilio' | 'zernio'
  /** Por qué línea manda la MARCA lo normal (recibos, campañas). */
  brand_provider: 'twilio' | 'zernio'
  /** Solo si la marca está en Twilio Y tiene cuenta de Zernio: se puede elegir. */
  provider_switchable: boolean
  zernio_phone: string | null
  provider_setting: string
  body_default: string
  boton_si_default: string
  boton_no_default: string
  boton_max: number
  cuerpo_max: number
  respuestas: {
    si: string
    no: string
    si_default: string
    no_default: string
    foto_si: string
    boton_si: string
    boton_no: string
  }
  invitacion_slug: string | null
  enlace: string | null
  nombre_generico: string
  nombre_generico_default: string
  foto_mensaje1: string
}

const TEXTAREA =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed resize-y font-normal'

/** Largo en caracteres como los cuenta WhatsApp (un emoji es uno). */
const largo = (s: string) => [...s].length

/** Twilio rechaza emojis en los botones («Button Title text cannot contain emojis»). Espejo de `validarBoton()`. */
const tieneEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(s)

/** Qué variables `{{n}}` usa un cuerpo. Espejo de `variablesDelCuerpo()` del servidor. */
function variablesDe(body: string): Set<number> {
  const vars = new Set<number>()
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) vars.add(Number(m[1]))
  return vars
}

/** Réplica de `renderClubReply()` para la vista previa. La que manda es la del servidor. */
function previa(plantilla: string, nombre: string | null, enlace: string | null, marca: string): string {
  let t = plantilla
  t = nombre
    ? t.replace(/\{nombre(?:\|[^}]*)?\}/g, nombre)
    : t.replace(/(,?[ \t]*)\{nombre(?:\|([^}]*))?\}/g, (_m, coma: string, alt?: string) =>
        alt?.trim() ? `${coma}${alt.trim()}` : ''
      )
  t = enlace ? t.replaceAll('{enlace}', enlace) : t.replace(/^[^\n]*\{enlace\}[^\n]*\n?/gm, '').replaceAll('{enlace}', '')
  return t.replaceAll('{marca}', marca).replace(/\n{3,}/g, '\n\n').trim()
}

function Burbuja({ texto, foto, botones }: { texto: string; foto?: string | null; botones?: [string, string] }) {
  return (
    <div className="space-y-2">
      <div className="max-w-md space-y-2 rounded-lg border border-border bg-[#e7ffdb] p-3 text-sm text-neutral-900">
        {foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="Foto del regalo" className="max-h-56 w-full rounded-md object-cover" />
        )}
        <p className="whitespace-pre-wrap">{texto}</p>
      </div>
      {botones && (
        <div className="flex max-w-md gap-2">
          {botones.map((b) => (
            <span
              key={b}
              className="flex-1 rounded border border-border bg-background py-1.5 text-center text-xs font-medium text-[#0a7cff]"
            >
              {b}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function ImportedContactsTemplate() {
  const [config, setConfig] = useState<Config | null>(null)

  // ── Mensaje 1: la plantilla ──
  const [body, setBody] = useState('')
  const [botonSi, setBotonSi] = useState('')
  const [botonNo, setBotonNo] = useState('')
  const [promo, setPromo] = useState('un postre gratis en tu próxima visita')
  const [nombreGenerico, setNombreGenerico] = useState('')
  const [guardandoNombre, setGuardandoNombre] = useState(false)
  const [fotoM1, setFotoM1] = useState('')
  const [subiendoM1, setSubiendoM1] = useState(false)
  const [creando, setCreando] = useState(false)
  const [creada, setCreada] = useState<Creada | null>(null)
  const [cambiandoLinea, setCambiandoLinea] = useState(false)

  // ── Respuestas a los botones ──
  const [respSi, setRespSi] = useState('')
  const [respNo, setRespNo] = useState('')
  const [fotoSi, setFotoSi] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/imported-contacts/template')
      if (!res.ok) return
      const d: Config = await res.json()
      setConfig(d)
      setBody((prev) => prev || d.body_default)
      setBotonSi((prev) => prev || d.respuestas.boton_si || d.boton_si_default)
      setBotonNo((prev) => prev || d.respuestas.boton_no || d.boton_no_default)
      setRespSi(d.respuestas.si)
      setRespNo(d.respuestas.no)
      setFotoSi(d.respuestas.foto_si)
      setNombreGenerico(d.nombre_generico)
      setFotoM1(d.foto_mensaje1)
    } catch {
      /* la pantalla se pinta igual, con los campos vacíos */
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const vars = useMemo(() => variablesDe(body), [body])
  const usaPromo = vars.has(2)
  const botonMax = config?.boton_max ?? 20
  const cuerpoMax = config?.cuerpo_max ?? 1024

  const errorCuerpo = !body.trim()
    ? 'El mensaje está vacío.'
    : largo(body) > cuerpoMax
      ? `Tiene ${largo(body)} caracteres y Meta acepta hasta ${cuerpoMax}.`
      : !vars.has(1)
        ? 'Falta {{1}}: es donde va el nombre de la persona.'
        : [...vars].some((n) => n !== 1 && n !== 2)
          ? 'Solo se rellenan {{1}} (nombre) y {{2}} (regalo). Quitá las demás.'
          : null
  const errorBotones =
    !botonSi.trim() || !botonNo.trim()
      ? 'Los dos botones necesitan texto.'
      : largo(botonSi) > botonMax || largo(botonNo) > botonMax
        ? `Un botón no puede pasar de ${botonMax} caracteres.`
        : tieneEmoji(botonSi) || tieneEmoji(botonNo)
          ? 'Los botones no aceptan emojis (WhatsApp los rechaza). En el mensaje sí van.'
          : null

  const marca = config?.brand_name ?? 'la marca'
  const generico = nombreGenerico.trim() || config?.nombre_generico_default || 'cliente'
  const proveedor = config?.provider ?? 'twilio'
  const nombreProveedor = proveedor === 'zernio' ? 'Zernio' : 'Twilio'

  /**
   * «La difusión sale por…». Solo aparece cuando hay algo que elegir: marca en
   * Twilio con la cuenta de Zernio conectada. Se guarda como cualquier otro
   * ajuste del Golden Bullet; el servidor decide con `goldenBulletProviderFor()`.
   */
  const cambiarLinea = async (valor: 'zernio' | '') => {
    setCambiandoLinea(true)
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'golden_bullet_provider', value: valor }),
      })
      if (!res.ok) {
        toast.error('No se pudo cambiar la línea de la difusión')
        return
      }
      toast.success(valor === 'zernio' ? 'La difusión sale por la línea de coexistencia (Zernio).' : 'La difusión sale por Twilio.')
      await cargar()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setCambiandoLinea(false)
    }
  }
  const previaMensaje1 = (nombre: string) =>
    body.replaceAll(/\{\{\s*1\s*\}\}/g, nombre).replaceAll(/\{\{\s*2\s*\}\}/g, promo.trim() || '[regalo]')

  /** Guarda la URL de la foto del mensaje 1 en la marca (vacío = sin foto). */
  const guardarFotoM1 = async (url: string) => {
    const res = await fetch('/api/dashboard/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'golden_bullet_template_image_url', value: url }),
    })
    if (!res.ok) throw new Error('No se pudo guardar la foto')
  }

  const subirFotoM1 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendoM1(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('uso', 'mensaje1')
      const res = await fetch('/api/dashboard/imported-contacts/reply-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'No se pudo subir la foto')
        return
      }
      await guardarFotoM1(data.url)
      setFotoM1(data.url)
      toast.success('Foto del mensaje 1 lista: se hornea en la plantilla al crearla')
    } catch {
      toast.error('Error subiendo la foto')
    } finally {
      setSubiendoM1(false)
      e.target.value = ''
    }
  }

  const quitarFotoM1 = async () => {
    try {
      await guardarFotoM1('')
      setFotoM1('')
    } catch {
      toast.error('No se pudo quitar la foto')
    }
  }

  const guardarNombreGenerico = async () => {
    setGuardandoNombre(true)
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'golden_bullet_fallback_name', value: nombreGenerico.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.message || data.error || 'No se pudo guardar')
        return
      }
      toast.success('Guardado: es lo que dirá {{1}} cuando no haya nombre')
    } catch {
      toast.error('Error de conexión')
    } finally {
      setGuardandoNombre(false)
    }
  }

  const crear = async () => {
    if (errorCuerpo || errorBotones) return
    setCreando(true)
    try {
      const res = await fetch('/api/dashboard/imported-contacts/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: body.trim(),
          boton_si: botonSi.trim(),
          boton_no: botonNo.trim(),
          promo_ejemplo: usaPromo ? promo.trim() : '',
          image_url: fotoM1.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || data.error || 'No se pudo crear la plantilla')
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

  const subirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSubiendo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/dashboard/imported-contacts/reply-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'No se pudo subir la foto')
        return
      }
      setFotoSi(data.url)
      toast.success('Foto subida. Guardá las respuestas para que quede.')
    } catch {
      toast.error('Error subiendo la foto')
    } finally {
      setSubiendo(false)
      e.target.value = ''
    }
  }

  const guardarRespuestas = async () => {
    setGuardando(true)
    try {
      const pares: [string, string][] = [
        ['golden_bullet_reply_si_text', respSi.trim()],
        ['golden_bullet_reply_no_text', respNo.trim()],
        ['golden_bullet_reply_si_image_url', fotoSi.trim()],
      ]
      for (const [key, value] of pares) {
        const res = await fetch('/api/dashboard/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          toast.error(data.message || data.error || `No se pudo guardar ${key}`)
          return
        }
      }
      toast.success('Respuestas guardadas')
    } catch {
      toast.error('Error de conexión')
    } finally {
      setGuardando(false)
    }
  }

  const textoSi = respSi.trim() || config?.respuestas.si_default || ''
  const textoNo = respNo.trim() || config?.respuestas.no_default || ''

  return (
    <div className="space-y-5">
      {/* ── 1. La plantilla ── */}
      {creada ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <p className="font-semibold">Plantilla creada</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Se llama <code className="text-xs">{creada.friendlyName}</code>.{' '}
              {creada.approvalSubmitted
                ? `Ya está en revisión de Meta (por ${creada.provider === 'zernio' ? 'Zernio' : 'Twilio'}): tarda entre 24 y 48 horas. Cuando la aprueben aparece sola en la lista de plantillas del paso 4.`
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
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4" /> Mensaje 1 — la plantilla con botones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {config && (config.provider_switchable || config.brand_provider !== config.provider) && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-2">
                <p>
                  La difusión sale por <strong>{nombreProveedor}</strong>
                  {proveedor === 'zernio' && config.zernio_phone ? ` (${config.zernio_phone})` : ''}
                  {config.brand_provider !== proveedor
                    ? `, aunque lo demás de la marca sigue saliendo por ${config.brand_provider === 'zernio' ? 'Zernio' : 'Twilio'}.`
                    : '.'}
                </p>
                <p className="text-xs text-muted-foreground">
                  La plantilla de abajo se crea en esa línea, y la prueba y la base salen por ella. Una base
                  fría confía más en el número que ya conoce (el de coexistencia) que en uno nuevo.
                </p>
                {config.provider_switchable && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cambiandoLinea}
                    onClick={() => cambiarLinea(proveedor === 'zernio' ? '' : 'zernio')}
                  >
                    {cambiandoLinea ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {proveedor === 'zernio' ? 'Volver a mandar la difusión por Twilio' : 'Mandar la difusión por la línea de coexistencia (Zernio)'}
                  </Button>
                )}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Es el único mensaje que revisa Meta. Pregunta en vez de promocionar y trae dos botones: el
              «no» de un toque cuesta mucho menos que un «Bloquear», y el «sí» deja el consentimiento
              registrado. <strong>{'{{1}}'}</strong> es el nombre de la persona (obligatorio);{' '}
              <strong>{'{{2}}'}</strong> es el regalo como variable (opcional: podés escribirlo en el texto).
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="cuerpo" className="text-xs uppercase tracking-wide text-muted-foreground">
                El mensaje
              </Label>
              <textarea
                id="cuerpo"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className={TEXTAREA}
                placeholder="Hola {{1}} ❤️ …"
              />
              <div className="flex justify-between text-xs">
                <span className={errorCuerpo ? 'text-amber-700' : 'text-muted-foreground'}>
                  {errorCuerpo ?? 'Listo para crear.'}
                </span>
                <span className="text-muted-foreground">{largo(body)} / {cuerpoMax}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Decí de dónde salió su número, <strong>y que sea verdad</strong>: es lo que separa una
                invitación de un mensaje no solicitado. Si la base es comprada o de origen desconocido,
                no se puede decir que te visitaron.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="boton-si" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Botón del sí (solo texto, sin emojis)
                </Label>
                <Input id="boton-si" value={botonSi} onChange={(e) => setBotonSi(e.target.value)} />
                <p className={`text-xs ${largo(botonSi) > botonMax || tieneEmoji(botonSi) ? 'text-amber-700' : 'text-muted-foreground'}`}>
                  {tieneEmoji(botonSi) ? 'Sin emojis en los botones · ' : ''}{largo(botonSi)} / {botonMax}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="boton-no" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Botón del no
                </Label>
                <Input id="boton-no" value={botonNo} onChange={(e) => setBotonNo(e.target.value)} />
                <p className={`text-xs ${largo(botonNo) > botonMax || tieneEmoji(botonNo) ? 'text-amber-700' : 'text-muted-foreground'}`}>
                  {tieneEmoji(botonNo) ? 'Sin emojis en los botones · ' : ''}{largo(botonNo)} / {botonMax}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Foto arriba del mensaje (opcional)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 h-9 text-sm font-medium hover:bg-accent">
                  {subiendoM1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {subiendoM1 ? 'Subiendo...' : fotoM1 ? 'Cambiar foto' : 'Subir foto'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={subirFotoM1} disabled={subiendoM1} />
                </label>
                {fotoM1 && (
                  <Button variant="ghost" size="sm" onClick={quitarFotoM1}>
                    Quitar
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Con foto, la plantilla se crea con cabecera de imagen + texto + botones. Meta revisa la foto junto
                con el texto y es la misma para todos los envíos: si después querés otra, se crea otra plantilla.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nombre-generico" className="text-xs uppercase tracking-wide text-muted-foreground">
                Si la persona no tiene nombre, {'{{1}}'} dice
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="nombre-generico"
                  value={nombreGenerico}
                  onChange={(e) => setNombreGenerico(e.target.value)}
                  placeholder={config?.nombre_generico_default ?? 'cliente'}
                  className="max-w-xs"
                />
                <Button variant="outline" size="sm" onClick={guardarNombreGenerico} disabled={guardandoNombre} className="gap-1.5">
                  {guardandoNombre ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Guardar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Una de cada cuatro personas de la base no tiene nombre, y {'{{1}}'} no puede ir vacía (es una variable
                de Meta). Queda guardado en la marca; el paso 4 de «Nueva campaña» arranca con este valor.
              </p>
            </div>

            {usaPromo && (
              <div className="space-y-1.5">
                <Label htmlFor="promo-ej" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Ejemplo de {'{{2}}'} (es lo que Meta revisa, no lo que se envía)
                </Label>
                <Input id="promo-ej" value={promo} onChange={(e) => setPromo(e.target.value)} />
              </div>
            )}

            {body.trim() && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Así le llega (con nombre)</Label>
                  <Burbuja texto={previaMensaje1('Juan')} foto={fotoM1 || null} botones={[botonSi || '…', botonNo || '…']} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Así le llega (sin nombre)</Label>
                  <Burbuja texto={previaMensaje1(generico)} foto={fotoM1 || null} botones={[botonSi || '…', botonNo || '…']} />
                </div>
              </div>
            )}

            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Al crearla se abre una solicitud de aprobación en la cuenta de Meta del negocio.{' '}
              <strong>Meta tarda entre 24 y 48 horas</strong> y la solicitud queda registrada en su WABA.
            </div>

            <Button onClick={crear} disabled={creando || !!errorCuerpo || !!errorBotones} className="gap-2">
              {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
              {creando ? 'Creando...' : 'Crear y enviar a Meta'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── 2 y 3. Las respuestas a los botones ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Reply className="h-4 w-4" /> Respuestas a los botones
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Salen al instante cuando la persona toca un botón, y no pasan por Meta. Comodines:{' '}
            <code>{'{nombre}'}</code>, <code>{'{enlace}'}</code> (el de registro, solo en el sí) y{' '}
            <code>{'{marca}'}</code>. Si dejás un campo vacío sale el texto de defecto.
          </p>
          <p className="text-xs text-muted-foreground">
            Una de cada cuatro personas de la base no tiene nombre. Con <code>{'{nombre}'}</code> a secas, el
            comodín se va con su coma («por aquí, {'{nombre}'}!» → «por aquí!»). Si preferís otra cosa, escribí
            el alternativo adentro: <code>{'{nombre|¿cómo estás?}'}</code>. La vista previa muestra los dos casos.
          </p>

          {config && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                config.invitacion_slug
                  ? 'border-green-300 bg-green-50 text-green-900'
                  : 'border-amber-300 bg-amber-50 text-amber-900'
              }`}
            >
              {config.invitacion_slug ? (
                <>
                  El enlace del sí es la invitación con premio <strong>{config.invitacion_slug}</strong>:
                  quien se registra por ahí recibe el regalo en su tarjeta.{' '}
                  <span className="break-all">{config.enlace}</span>
                </>
              ) : (
                <>
                  <strong>No elegiste una invitación con premio.</strong> El enlace del sí será el general de la
                  tarjeta y quien se registre <strong>no recibirá ningún regalo</strong>. Creala en Recompensas →
                  Invitaciones y marcá «Usar en Golden Bullet».
                </>
              )}
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="resp-si" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Mensaje 2 — cuando toca el sí
                </Label>
                <textarea
                  id="resp-si"
                  value={respSi}
                  onChange={(e) => setRespSi(e.target.value)}
                  rows={9}
                  className={TEXTAREA}
                  placeholder={config?.respuestas.si_default ?? ''}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Foto del regalo (va con el mensaje 2)</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 h-9 text-sm font-medium hover:bg-accent">
                    {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    {subiendo ? 'Subiendo...' : fotoSi ? 'Cambiar foto' : 'Subir foto'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={subirFoto} disabled={subiendo} />
                  </label>
                  {fotoSi && (
                    <Button variant="ghost" size="sm" onClick={() => setFotoSi('')}>
                      Quitar
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Así le llega (con nombre)</Label>
                <Burbuja texto={previa(textoSi, 'Juan', config?.enlace ?? null, marca)} foto={fotoSi || null} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Así le llega (sin nombre)</Label>
                <Burbuja texto={previa(textoSi, null, config?.enlace ?? null, marca)} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="resp-no" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Cuando toca el no
                </Label>
                <textarea
                  id="resp-no"
                  value={respNo}
                  onChange={(e) => setRespNo(e.target.value)}
                  rows={5}
                  className={TEXTAREA}
                  placeholder={config?.respuestas.no_default ?? ''}
                />
                <p className="text-xs text-muted-foreground">
                  Quien toca el no queda marcado como opt-out y no vuelve a entrar en ninguna importación.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Así le llega</Label>
                <Burbuja texto={previa(textoNo, null, null, marca)} />
              </div>
            </div>
          </div>

          <Button onClick={guardarRespuestas} disabled={guardando} className="gap-2">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {guardando ? 'Guardando...' : 'Guardar respuestas'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
