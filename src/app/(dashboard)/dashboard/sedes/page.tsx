'use client'

/**
 * Mis sedes — **el único lugar** donde el restaurante ve, elige y edita sus
 * locales.
 *
 * El pedido del dueño, 2026-09-08, textual: *"el cliente debe poder ver sus
 * sedes, seleccionarlas y modificarlas desde un solo lugar, punto final"*. Hasta
 * hoy no había ninguno: el selector del encabezado FILTRABA datos pero no
 * editaba nada, Ajustes editaba la geocerca de la sede **principal** y nada más,
 * y la ficha de Google, la dirección, el horario y los teléfonos de la segunda
 * sede no tenían pantalla ni acá ni en el AIOS.
 *
 * TRES DECISIONES QUE SE VEN EN LA PANTALLA
 * ─────────────────────────────────────────
 * 1. **Con una sola sede, la palabra "sede" no aparece.** No hay lista, no hay
 *    selector y el título es el nombre del local. Un restaurante de un solo
 *    local no tiene por qué aprenderse un concepto nuestro para cambiar su
 *    dirección. Es el interruptor de compatibilidad del §8.3, otra vez.
 * 2. **Cada campo dice qué pasa si lo dejás vacío.** No como ayuda: como
 *    respuesta a la única pregunta real que tiene un dueño con dos locales
 *    —*"¿esto es de la marca o de este local?"*—. Vacío = hereda la marca, y el
 *    marcador de posición enseña LO QUE HEREDA, con su valor.
 * 3. **Lo que no se puede cambiar se muestra igual, y dice por qué.** El
 *    subdominio está impreso en los QR: esconderlo haría que el cliente lo
 *    buscara en otro lado o nos llamara. Se enseña, apagado, con el motivo.
 *
 * Lo que NO está acá, a propósito: **crear y borrar sedes**. Abrir un local no
 * es un cambio de configuración, es un cambio de lo que el restaurante paga y de
 * lo que hay que mandar a imprimir. Eso lo hacemos nosotros desde el AIOS.
 *
 * Ref: docs/features/multi-sede.md §7 · migración 00058
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Store, Save, Loader2, CheckCircle, AlertTriangle, MapPin, Phone,
  Globe, ChevronDown, ChevronRight, Lock, Power,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Espejo de lo que devuelve `GET /api/dashboard/locations`. */
interface Sede {
  id: string
  name: string
  slug: string | null
  domain: string | null
  address: string | null
  lat: number | null
  lon: number | null
  radius_meters: number | null
  is_active: boolean
  is_primary: boolean
  sort_order: number
  config: Record<string, string | null | undefined>
}

interface Respuesta {
  role: 'brand' | 'location'
  multiSede: boolean
  brandConfig: Record<string, string | null | undefined>
  locations: Sede[]
}

/**
 * Los campos de `config` que una sede puede pisar, agrupados por la pregunta que
 * responden y no por dónde se guardan. Un dueño no piensa en "claves de jsonb":
 * piensa en *"dónde me encuentran"* y *"cómo me escriben"*.
 *
 * ⚠️ Las rutas son las de `src/lib/location-config-paths.ts`. Una que no esté en
 * esa whitelist el servidor la ignora en silencio, así que un error de dedo acá
 * se ve como "guardé y no pasó nada".
 */
const GRUPOS: { titulo: string; icono: typeof MapPin; campos: { path: string; label: string; hint?: string }[] }[] = [
  {
    titulo: 'Dónde te encuentran',
    icono: MapPin,
    campos: [
      { path: 'google_maps_url', label: 'Link para dejar reseña en Google', hint: 'El de ESTE local. Es el que se le manda al cliente después de comer.' },
      { path: 'card.google_profile_url', label: 'Perfil del local en Google' },
      { path: 'card.address', label: 'Dirección que ve el cliente en la tarjeta' },
      { path: 'card.hours', label: 'Horario de este local' },
    ],
  },
  {
    titulo: 'Cómo te contactan',
    icono: Phone,
    campos: [
      { path: 'whatsapp_link', label: 'WhatsApp (enlace wa.me)' },
      { path: 'delivery_phone', label: 'Teléfono de domicilios' },
      { path: 'card.contact_phone', label: 'Teléfono de contacto' },
      { path: 'card.contact_email', label: 'Correo de contacto' },
    ],
  },
  {
    titulo: 'Redes de este local',
    icono: Globe,
    campos: [
      { path: 'instagram_url', label: 'Instagram' },
      { path: 'card.facebook_url', label: 'Facebook' },
      { path: 'card.tiktok_url', label: 'TikTok' },
      { path: 'card.website_url', label: 'Página web' },
    ],
  },
]

function txt(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export default function SedesPage() {
  const [data, setData] = useState<Respuesta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const [form, setForm] = useState<Sede | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [avanzado, setAvanzado] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/dashboard/locations')
      const j = await r.json()
      if (!r.ok) {
        setError(j.error ?? 'No se pudieron cargar las sedes')
        setData(null)
        return
      }
      setData(j as Respuesta)
      // Se conserva la sede que estaba abierta si sigue existiendo: recargar
      // después de guardar no debería devolverte a la primera de la lista.
      setSeleccionada((actual) => {
        const sigue = actual && (j as Respuesta).locations.some((l) => l.id === actual)
        return sigue ? actual : ((j as Respuesta).locations[0]?.id ?? null)
      })
    } catch {
      setError('No se pudieron cargar las sedes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const sedeActual = useMemo(
    () => data?.locations.find((l) => l.id === seleccionada) ?? null,
    [data, seleccionada]
  )

  // El formulario se rearma cuando cambia la sede elegida. Copia, no referencia:
  // editar sin guardar no debe alterar la lista de la izquierda.
  useEffect(() => {
    setForm(sedeActual ? { ...sedeActual, config: { ...sedeActual.config } } : null)
    setGuardado(false)
  }, [sedeActual])

  const guardar = async () => {
    if (!form) return
    setGuardando(true)
    setError(null)
    try {
      const r = await fetch(`/api/dashboard/locations/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          address: form.address ?? '',
          lat: form.lat ?? '',
          lon: form.lon ?? '',
          radius_meters: form.radius_meters ?? undefined,
          config: form.config,
        }),
      })
      const j = await r.json()
      if (!r.ok) {
        setError(j.error ?? 'No se pudo guardar')
        return
      }
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
      await cargar()
    } catch {
      setError('No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const cambiarEstado = async (activa: boolean) => {
    if (!form) return
    setGuardando(true)
    setError(null)
    try {
      const r = await fetch(`/api/dashboard/locations/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: activa }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error ?? 'No se pudo cambiar el estado'); return }
      await cargar()
    } catch {
      setError('No se pudo cambiar el estado')
    } finally {
      setGuardando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando tus sedes…
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="flex items-start gap-3 p-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">No se pudieron cargar tus sedes</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data || data.locations.length === 0) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="flex items-start gap-3 p-6">
            <Store className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Todavía no hay ningún local cargado</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Los locales los damos de alta nosotros, porque cada uno lleva su propio enlace y su
                material impreso. Escribinos y lo dejamos listo.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const unaSola = data.locations.length === 1

  return (
    <div className="space-y-5 p-4 md:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Store className="h-5 w-5" />
          {unaSola ? 'Mi local' : 'Mis sedes'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {unaSola
            ? 'Los datos de tu local: dónde te encuentran, cómo te contactan y tus redes.'
            : 'Elegí una sede para editar sus datos. Lo que dejes vacío lo hereda de la marca.'}
        </p>
      </div>

      <div className={unaSola ? '' : 'grid gap-5 lg:grid-cols-[260px_1fr]'}>
        {/* ── La lista. Con una sola sede no se dibuja: no hay nada que elegir. ── */}
        {!unaSola && (
          <div className="space-y-2">
            {data.locations.map((l) => {
              const activa = l.id === seleccionada
              return (
                <button
                  key={l.id}
                  onClick={() => setSeleccionada(l.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    activa ? 'border-foreground/30 bg-muted' : 'border-transparent bg-muted/40 hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{l.name}</span>
                    {l.is_primary && (
                      <span className="shrink-0 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase">
                        Principal
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {l.address || 'Sin dirección'}
                  </p>
                  {!l.is_active && (
                    <p className="mt-1 text-xs font-medium text-amber-600">Cerrada</p>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* ── El formulario de la sede elegida ── */}
        {form && (
          <div className="space-y-5">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Datos del local</CardTitle>
                <CardDescription>Cómo se llama y dónde queda.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="sede-name">Nombre</Label>
                  <Input
                    id="sede-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Sede Laureles"
                  />
                </div>
                <div>
                  <Label htmlFor="sede-address">Dirección</Label>
                  <Input
                    id="sede-address"
                    value={txt(form.address)}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Cra 43 #10-20"
                  />
                </div>

                {/*
                  El subdominio se ENSEÑA aunque no se pueda cambiar. Esconderlo
                  haría que el cliente lo buscara en otro lado o nos llamara para
                  preguntar cuál es el enlace de esta sede.
                */}
                {form.domain && (
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Lock className="h-3 w-3" /> Enlace de esta sede
                    </Label>
                    <Input value={form.domain} readOnly disabled />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Es el que está impreso en tus QR, así que no se puede cambiar acá. Si de verdad
                      necesitás otro, escribinos: hay que reimprimir.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {GRUPOS.map((grupo) => {
              const Icono = grupo.icono
              return (
                <Card key={grupo.titulo}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icono className="h-4 w-4" /> {grupo.titulo}
                    </CardTitle>
                    {data.multiSede && (
                      <CardDescription>
                        Lo que dejes vacío se toma de la marca.
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {grupo.campos.map((campo) => {
                      const heredado = txt(data.brandConfig[campo.path])
                      return (
                        <div key={campo.path}>
                          <Label htmlFor={`c-${campo.path}`}>{campo.label}</Label>
                          <Input
                            id={`c-${campo.path}`}
                            value={txt(form.config[campo.path])}
                            onChange={(e) =>
                              setForm({ ...form, config: { ...form.config, [campo.path]: e.target.value } })
                            }
                            placeholder={heredado || 'Sin configurar'}
                          />
                          {/*
                            El marcador de posición ya enseña lo heredado, pero un
                            campo vacío con texto gris se lee como "sin configurar".
                            Esta línea es la que responde la única pregunta real de
                            un dueño con dos locales: ¿esto es de la marca o mío?
                          */}
                          {heredado && !txt(form.config[campo.path]) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Ahora mismo usa el de la marca: <span className="font-medium">{heredado}</span>
                            </p>
                          )}
                          {campo.hint && (
                            <p className="mt-1 text-xs text-muted-foreground">{campo.hint}</p>
                          )}
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )
            })}

            {/* ── Avanzado: la geocerca, plegada. Casi nadie la usa. ── */}
            <Card>
              <CardHeader className="pb-3">
                <button
                  onClick={() => setAvanzado((v) => !v)}
                  className="flex w-full items-center gap-2 text-left text-sm font-medium"
                >
                  {avanzado ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Ubicación en el mapa (opcional)
                </button>
              </CardHeader>
              {avanzado && (
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Solo hace falta si querés que el check-in compruebe que el cliente está de verdad
                    en el local. Las dos coordenadas van juntas: media no ubica nada.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="sede-lat">Latitud</Label>
                      <Input
                        id="sede-lat"
                        value={form.lat ?? ''}
                        onChange={(e) => setForm({ ...form, lat: e.target.value === '' ? null : Number(e.target.value) })}
                        placeholder="6.2442"
                      />
                    </div>
                    <div>
                      <Label htmlFor="sede-lon">Longitud</Label>
                      <Input
                        id="sede-lon"
                        value={form.lon ?? ''}
                        onChange={(e) => setForm({ ...form, lon: e.target.value === '' ? null : Number(e.target.value) })}
                        placeholder="-75.5812"
                      />
                    </div>
                    <div>
                      <Label htmlFor="sede-radius">Radio (metros)</Label>
                      <Input
                        id="sede-radius"
                        value={form.radius_meters ?? ''}
                        onChange={(e) => setForm({ ...form, radius_meters: e.target.value === '' ? null : Number(e.target.value) })}
                        placeholder="150"
                      />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={guardar} disabled={guardando}>
                {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar
              </Button>
              {guardado && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <CheckCircle className="h-4 w-4" /> Guardado
                </span>
              )}

              {/*
                Abrir y cerrar un local solo lo hace un super usuario, y solo
                aparece con más de una sede: con una sola, el botón que apaga el
                único local del restaurante no tiene ningún uso legítimo y sí un
                uso catastrófico.
              */}
              {data.role === 'brand' && !unaSola && (
                <Button
                  variant="outline"
                  onClick={() => cambiarEstado(!form.is_active)}
                  disabled={guardando}
                  className="ml-auto"
                >
                  <Power className="mr-2 h-4 w-4" />
                  {form.is_active ? 'Marcar como cerrada' : 'Reabrir esta sede'}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
