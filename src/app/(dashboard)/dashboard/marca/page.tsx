'use client'

/**
 * Tarjeta principal — §5 (pantalla del teléfono y tarjeta), §6 (logo y paleta)
 * y, desde el 2026-09-08, todo lo que la tarjeta muestra además de puntos y
 * sellos: el símbolo del sello, la decoración de contorno, las redes, el perfil
 * de Google, la descripción, el contacto y las políticas.
 *
 * Se llamó "Identidad visual" hasta que el dueño pidió el nombre que el
 * restaurante entiende: es la pantalla donde arma SU tarjeta.
 *
 * DOS DECISIONES DE PRODUCTO QUE SE VEN EN LA PANTALLA
 * ───────────────────────────────────────────────────
 * 1. **Un color, no siete.** La competencia pide siete hex sueltos (fondo,
 *    texto, contorno, sello activo, sello inactivo…). Acá se pide UNO y del
 *    resto se encarga `src/lib/brand-palette.ts`: el segundo tono del gradiente,
 *    el ✓ del sello, el color del QR y hasta si el texto del botón va blanco o
 *    negro. Un dueño de restaurante no debería tener que saber qué es un
 *    "contorno de sello".
 * 2. **Vista previa antes de guardar.** El panel de la derecha usa el resolver
 *    de verdad sobre la config que se está editando, así que lo que se ve es lo
 *    que va a quedar.
 *
 * Lo avanzado (segundo tono, gradientes literales) existe pero está plegado: es
 * el escape para quien sabe lo que quiere, no lo primero que se ve.
 *
 * TODO lo que se guarda pasa por la whitelist de `src/lib/tenant-config-paths.ts`:
 * los símbolos y decoraciones son ids de una lista cerrada, nunca un SVG del
 * dueño (la config es pública y viaja al navegador).
 *
 * QUIÉN GUARDA (SEG-3, 2026-10-13): la tarjeta es de la MARCA, así que el PUT de
 * `tenant-config` y el logo (`brand-logo`) exigen alcance de marca. Un
 * administrador de sede abre la pantalla, la ve y puede jugar con la vista previa,
 * pero Guardar, Subir y Quitar quedan apagados con un aviso que dice por qué y a
 * dónde ir (Sedes, para lo de SU sede). Si igual llega un 403, se muestra el
 * mensaje del servidor, en español.
 *
 * LA TARJETA DE CADA SEDE (sedes separadas, parte 2, 2026-10-14). El dueño, mirando
 * Tepuy: *«Si escojo una sede u otra, cuando voy a modificar la tarjeta sale la misma
 * para las dos, incoherente, a menos que haya un botón que diga "tarjetas separadas"»*.
 * Con 2+ sedes la pantalla abre con esa elección (`EleccionDeTarjeta`):
 *   · «La misma tarjeta para todas las sedes» (lo de siempre): se edita la de la marca,
 *     el selector de arriba queda quieto y la pantalla dice «Las N sedes muestran esta
 *     tarjeta».
 *   · «Una tarjeta para cada sede»: el selector de arriba SÍ elige. Con una sede, se
 *     editan su sello, su decoración, su descripción y sus políticas (`PUT
 *     /api/dashboard/locations/[id]/card`), con «Copiar la de…» para no empezar de cero;
 *     con «Toda la marca», la de la marca, que es la base de cada sede.
 * En los dos casos el nombre, el logo y los colores son de la marca, y la dirección, el
 * horario, los teléfonos y las redes son de cada sede («Mis sedes»): no se duplican acá.
 * La regla de qué se edita es pura (`src/lib/tarjeta-de-sede.ts`). Con una sola sede la
 * pantalla es exactamente la de antes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Palette, Save, Loader2, CheckCircle, Upload, Trash2, RotateCcw,
  ChevronDown, ChevronRight, ImageIcon, Smartphone, CreditCard, AlertTriangle, Store, Copy, MapPin,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resolveBranding } from '@/lib/branding'
import { contrastRatio, deriveGradientEnd, isHexColor, normalizeHex } from '@/lib/brand-palette'
import { brandWalletCardTheme } from '@/constants/wallet-card-theme'
import {
  CARD_MOTIF_IDS, CARD_MOTIF_LABELS, STAMP_ICON_IDS, STAMP_ICON_LABELS,
  isCardMotifId, isStampIconId, type CardMotifId, type StampIconId,
} from '@/constants/card-extras'
import { BrandPreview, type PreviewScreen } from '@/components/dashboard/BrandPreview'
import { EleccionDeTarjeta } from '@/components/dashboard/sedes/EleccionDeTarjeta'
import { StampIcon, CardMotif } from '@/components/features/wallet'
import { useLocationScope } from '@/contexts/LocationScopeContext'
import { avisarTarjetaPorSede } from '@/hooks/useTarjetaPorSede'
import type { CardMode } from '@/lib/tenant-config-paths'
import {
  CLAVES_DE_TARJETA, TARJETA_VACIA, anidarRutas, camposDesdeRutas, copiarTarjeta, fraseDeLaTarjeta,
  lasSedes, modoDeTarjeta, queSeEdita, rutasDesdeCampos, tieneTarjetaPropia, type CamposDeTarjeta,
} from '@/lib/tarjeta-de-sede'
import type { TenantConfig } from '@/types/tenant.types'

/** El estado editable. Cadena vacía = "usar lo del sistema de diseño" / "no mostrar". */
interface BrandForm {
  logo_url: string
  primary: string
  primary_end: string
  surface: string
  ink: string
  card_bg: string
  page_bg: string
  // Tarjeta principal (2026-09-08)
  stamp_icon: string
  motif: string
  instagram_url: string
  facebook_url: string
  tiktok_url: string
  whatsapp_link: string
  google_profile_url: string
  website_url: string
  description: string
  contact_phone: string
  contact_email: string
  address: string
  hours: string
  policies: string
}

const EMPTY_FORM: BrandForm = {
  logo_url: '', primary: '', primary_end: '', surface: '', ink: '', card_bg: '', page_bg: '',
  stamp_icon: '', motif: '',
  instagram_url: '', facebook_url: '', tiktok_url: '', whatsapp_link: '', google_profile_url: '', website_url: '',
  description: '', contact_phone: '', contact_email: '', address: '', hours: '', policies: '',
}

const PATH_OF: Record<keyof BrandForm, string> = {
  logo_url: 'branding.logo_url',
  primary: 'branding.primary',
  primary_end: 'branding.primary_end',
  surface: 'branding.surface',
  ink: 'branding.ink',
  card_bg: 'branding.card_bg',
  page_bg: 'branding.page_bg',
  stamp_icon: 'card.stamp_icon',
  motif: 'card.motif',
  instagram_url: 'instagram_url',
  facebook_url: 'card.facebook_url',
  tiktok_url: 'card.tiktok_url',
  whatsapp_link: 'whatsapp_link',
  google_profile_url: 'card.google_profile_url',
  website_url: 'card.website_url',
  description: 'card.description',
  contact_phone: 'card.contact_phone',
  contact_email: 'card.contact_email',
  address: 'card.address',
  hours: 'card.hours',
  policies: 'card.policies',
}

const FORM_KEYS = Object.keys(EMPTY_FORM) as (keyof BrandForm)[]

/**
 * La ficha de una sede que se MUESTRA (no se edita) con una sede elegida: vive en «Mis sedes».
 * Cada fila: la etiqueta, la clave del formulario de la marca y la ruta de la sede.
 */
const FICHA_DE_SEDE: ReadonlyArray<{ etiqueta: string; marca: keyof BrandForm; ruta: string }> = [
  { etiqueta: 'Dirección', marca: 'address', ruta: 'card.address' },
  { etiqueta: 'Horario', marca: 'hours', ruta: 'card.hours' },
  { etiqueta: 'Teléfono', marca: 'contact_phone', ruta: 'card.contact_phone' },
  { etiqueta: 'Correo', marca: 'contact_email', ruta: 'card.contact_email' },
  { etiqueta: 'Instagram', marca: 'instagram_url', ruta: 'instagram_url' },
  { etiqueta: 'Facebook', marca: 'facebook_url', ruta: 'card.facebook_url' },
  { etiqueta: 'TikTok', marca: 'tiktok_url', ruta: 'card.tiktok_url' },
  { etiqueta: 'WhatsApp', marca: 'whatsapp_link', ruta: 'whatsapp_link' },
  { etiqueta: 'Perfil de Google', marca: 'google_profile_url', ruta: 'card.google_profile_url' },
  { etiqueta: 'Sitio web', marca: 'website_url', ruta: 'card.website_url' },
]

/** Una sede tal como la necesita esta pantalla (de `GET /api/dashboard/locations`). */
interface SedeDeLaTarjeta {
  id: string
  name: string
  is_active: boolean
  /** Su ficha, en rutas planas (lo que edita «Mis sedes»). */
  ficha: Record<string, unknown>
  /** Su tarjeta guardada. `''` = la toma de la marca. */
  card: CamposDeTarjeta
}

interface SedesDeLaMarca {
  rol: 'brand' | 'location' | null
  multiSede: boolean
  lista: SedeDeLaTarjeta[]
}

/** El formulario de la marca como `config`, para que `resolveBranding()` lo resuelva como el producto. */
function configDeLaMarca(form: BrandForm, modo: CardMode): TenantConfig {
  return {
    brand_name: 'Tu Restaurante',
    instagram_url: form.instagram_url || undefined,
    whatsapp_link: form.whatsapp_link || undefined,
    branding: {
      logo_url: form.logo_url || undefined,
      primary: isHexColor(form.primary) ? form.primary : undefined,
      primary_end: isHexColor(form.primary_end) ? form.primary_end : undefined,
      surface: isHexColor(form.surface) ? form.surface : undefined,
      ink: isHexColor(form.ink) ? form.ink : undefined,
      card_bg: form.card_bg || undefined,
      page_bg: form.page_bg || undefined,
    },
    card: {
      stamp_icon: form.stamp_icon || undefined,
      motif: form.motif || undefined,
      description: form.description || undefined,
      facebook_url: form.facebook_url || undefined,
      tiktok_url: form.tiktok_url || undefined,
      website_url: form.website_url || undefined,
      google_profile_url: form.google_profile_url || undefined,
      contact_phone: form.contact_phone || undefined,
      contact_email: form.contact_email || undefined,
      address: form.address || undefined,
      hours: form.hours || undefined,
      policies: form.policies || undefined,
      mode: modo,
    },
  }
}

export default function MarcaPage() {
  const router = useRouter()
  const { view, selection, setSelection } = useLocationScope()
  const [form, setForm] = useState<BrandForm>(EMPTY_FORM)
  const [initial, setInitial] = useState<BrandForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState<PreviewScreen>('card')
  const [advanced, setAdvanced] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  // La tarjeta es de la MARCA: un administrador de sede la ve y no la guarda. La ruta lo
  // hace cumplir (`exigirAlcanceDeMarca()`); esto es la otra mitad: no ofrecerle botones
  // que van a responder 403. Mismo patrón que `RewardsLevelsPanel`.
  const [soloLectura, setSoloLectura] = useState(false)

  // ─── La tarjeta de cada sede (parte 2) ──────────────────────────────────────
  const [modo, setModo] = useState<CardMode>('shared')
  const [guardandoModo, setGuardandoModo] = useState(false)
  const [sedes, setSedes] = useState<SedesDeLaMarca | null>(null)
  /** Lo que se está cambiando de cada sede, por id. Sin entrada = lo guardado. */
  const [ediciones, setEdiciones] = useState<Record<string, CamposDeTarjeta>>({})
  const [aviso, setAviso] = useState<string | null>(null)

  const multiSede = sedes?.multiSede ?? false
  const sedesActivas = useMemo(() => (sedes?.lista ?? []).filter((s) => s.is_active), [sedes])
  // «Las N sedes» cuenta las de la MARCA (el selector ya lo sabe), no solo las que ve un administrador.
  const nSedes = view?.brandLocationCount ?? sedesActivas.length
  const que = queSeEdita({ multiSede, modo, seleccion: selection, rol: sedes?.rol ?? null, sedes: sedesActivas })
  const sedeEditada = que.tipo === 'sede' ? (sedesActivas.find((s) => s.id === que.id) ?? null) : null
  const tarjetaDeSede: CamposDeTarjeta = sedeEditada ? (ediciones[sedeEditada.id] ?? sedeEditada.card) : TARJETA_VACIA
  const frase = fraseDeLaTarjeta(que, nSedes)

  // El encabezado vive fuera de la página: con una tarjeta por sede, su selector deja de ser la
  // etiqueta quieta «Toda la marca» en esta pantalla (`useTarjetaPorSede`).
  useEffect(() => {
    avisarTarjetaPorSede(multiSede && modo === 'per_location')
  }, [multiSede, modo])

  const dirtyMarca = useMemo(() => FORM_KEYS.some((k) => form[k] !== initial[k]), [form, initial])
  const dirtySede = sedeEditada ? CLAVES_DE_TARJETA.some((k) => tarjetaDeSede[k] !== sedeEditada.card[k]) : false
  const dirty = sedeEditada ? dirtySede : dirtyMarca

  // La marca tal como la va a resolver el producto, con lo que hay en el
  // formulario AHORA. Es el mismo `resolveBranding()` de las pantallas reales; con
  // una sede elegida, con la ficha y la tarjeta de ESA sede encima.
  const previewBranding = useMemo(() => {
    const marca = configDeLaMarca(form, modo)
    if (!sedeEditada) return resolveBranding(marca)
    const deLaSede = anidarRutas({ ...sedeEditada.ficha, ...rutasDesdeCampos(tarjetaDeSede) })
    return resolveBranding(marca, deLaSede as unknown as TenantConfig)
  }, [form, modo, sedeEditada, tarjetaDeSede])

  const previewTheme = useMemo(() => brandWalletCardTheme(previewBranding), [previewBranding])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/dashboard/tenant-config')
        if (!res.ok) throw new Error('No se pudo leer la configuración de la tarjeta')
        const data = (await res.json()) as Record<string, unknown>
        if (cancelled) return
        const next = { ...EMPTY_FORM }
        for (const key of FORM_KEYS) {
          const value = data[PATH_OF[key]]
          if (typeof value === 'string') next[key] = value
        }
        setForm(next)
        setInitial(next)
        setModo(modoDeTarjeta(data['card.mode']))
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error cargando la tarjeta')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    fetch('/api/dashboard/locations')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return
        if (j.role === 'location') setSoloLectura(true)
        const lista = ((j.locations ?? []) as Array<Record<string, unknown>>).map((l) => ({
          id: String(l.id),
          name: String(l.name ?? ''),
          is_active: l.is_active === true,
          ficha: (l.config ?? {}) as Record<string, unknown>,
          card: camposDesdeRutas(l.card as Record<string, unknown> | undefined),
        }))
        setSedes({ rol: j.role === 'brand' || j.role === 'location' ? j.role : null, multiSede: j.multiSede === true, lista })
      })
      .catch(() => { /* sin la respuesta, la pantalla se comporta como siempre: la ruta decide */ })
  }, [])

  const patch = useCallback((changes: Partial<BrandForm>) => {
    setForm((prev) => ({ ...prev, ...changes }))
    setSaved(false)
    setError(null)
  }, [])

  /** Cambia la tarjeta de la sede elegida (solo en la pantalla: se guarda con Guardar). */
  const patchSede = (changes: Partial<CamposDeTarjeta>) => {
    if (!sedeEditada) return
    setEdiciones((prev) => ({ ...prev, [sedeEditada.id]: { ...tarjetaDeSede, ...changes } }))
    setSaved(false)
    setError(null)
  }

  const copiarDe = (otra: SedeDeLaTarjeta) => {
    patchSede(copiarTarjeta(otra.card))
    setAviso(`Copiaste la tarjeta de ${otra.name}. Revisala y apretá Guardar.`)
  }

  const usarLaDeLaMarca = () => {
    patchSede(TARJETA_VACIA)
    setAviso('Esta sede va a mostrar la tarjeta de la marca. Apretá Guardar para confirmarlo.')
  }

  const elegirModo = async (nuevo: CardMode) => {
    setGuardandoModo(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/tenant-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'card.mode': nuevo }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'No se pudo cambiar la tarjeta de las sedes')
      }
      setModo(nuevo)
      setAviso(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cambiando la tarjeta de las sedes')
    } finally {
      setGuardandoModo(false)
    }
  }

  /**
   * Elegir el color principal sugiere el segundo tono, PERO solo si el dueño no
   * lo fijó a mano. Si lo fijó, se respeta: nada de pisar una decisión explícita
   * porque el usuario movió otro control.
   */
  const handlePrimaryChange = (value: string) => {
    const norm = normalizeHex(value)
    if (norm && (form.primary_end === '' || form.primary_end === deriveGradientEnd(form.primary || '#ff4d6d'))) {
      patch({ primary: value, primary_end: '' })
      return
    }
    patch({ primary: value })
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/dashboard/brand-logo', { method: 'POST', body })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'No se pudo subir el logo')
      patch({ logo_url: data.url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error subiendo el logo')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const handleRemoveLogo = async () => {
    setUploading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/brand-logo', { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'No se pudo borrar el logo')
      }
      patch({ logo_url: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error borrando el logo')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (sedeEditada) {
        // La tarjeta de UNA sede: su sello, su decoración, su descripción y sus políticas.
        const id = sedeEditada.id
        const guardada = tarjetaDeSede
        const res = await fetch(`/api/dashboard/locations/${id}/card`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rutasDesdeCampos(guardada)),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error ?? 'No se pudo guardar la tarjeta de la sede')
        }
        setSedes((prev) =>
          prev ? { ...prev, lista: prev.lista.map((s) => (s.id === id ? { ...s, card: guardada } : s)) } : prev
        )
        setEdiciones((prev) => {
          const { [id]: _hecha, ...resto } = prev
          void _hecha
          return resto
        })
      } else {
        const body: Record<string, string> = {}
        for (const key of FORM_KEYS) {
          body[PATH_OF[key]] = form[key]
        }
        const res = await fetch('/api/dashboard/tenant-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error ?? 'No se pudo guardar')
        }
        setInitial(form)
      }
      setAviso(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      // La marca del panel la resuelve el servidor por dominio: sin este refresh,
      // el logo del encabezado y del QR Studio seguirían mostrando el anterior.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    patch({ primary: '', primary_end: '', surface: '', ink: '', card_bg: '', page_bg: '' })
  }

  // Aviso de contraste: un color muy claro sobre el marfil deja el CTA ilegible.
  // No bloquea — el dueño manda —, pero se le dice antes de que lo vea un cliente.
  const contrastWarning = useMemo(() => {
    if (!isHexColor(form.primary)) return null
    const ratio = contrastRatio(previewBranding.onPrimary, previewBranding.primary)
    return ratio < 4.5
      ? `Este color deja el texto del botón con poco contraste (${ratio.toFixed(1)}:1). Se lee, pero un tono más oscuro se lee mejor en la calle y con sol.`
      : null
  }, [form.primary, previewBranding])

  // Con una sede elegida, el sello y la decoración que se VEN son los de la sede, o los de la
  // marca donde la sede no eligió nada.
  const selloVisto = sedeEditada && tarjetaDeSede.stamp_icon ? tarjetaDeSede.stamp_icon : form.stamp_icon
  const motivoVisto = sedeEditada && tarjetaDeSede.motif ? tarjetaDeSede.motif : form.motif
  const stampIcon: StampIconId = isStampIconId(selloVisto) ? selloVisto : 'check'
  const motif: CardMotifId = isCardMotifId(motivoVisto) ? motivoVisto : 'none'

  const elegirSello = (id: StampIconId) => {
    if (sedeEditada) patchSede({ stamp_icon: id })
    else patch({ stamp_icon: id === 'check' ? '' : id })
  }
  const elegirMotivo = (id: CardMotifId) => {
    if (sedeEditada) patchSede({ motif: id })
    else patch({ motif: id === 'none' ? '' : id })
  }

  // Las otras sedes de las que se puede copiar (las que este usuario ve).
  const otrasSedes = sedeEditada ? sedesActivas.filter((s) => s.id !== sedeEditada.id) : []
  // Con 2+ sedes, la marca edita sus datos de contacto como el valor por defecto de las sedes.
  const notaDeSedes = multiSede
    ? 'Cada sede puede tener los suyos en Mis sedes: estos se muestran donde una sede no puso nada.'
    : null

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Palette className="h-6 w-6" />
            {sedeEditada ? `Tarjeta de ${sedeEditada.name}` : 'Tarjeta principal'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu logo, tu color, tus sellos, tus redes y tu información: la tarjeta que ve tu cliente.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs font-medium text-amber-600">Cambios sin guardar</span>}
          <Button onClick={handleSave} disabled={saving || !dirty || soloLectura} className="min-h-11 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Guardado' : 'Guardar'}
          </Button>
        </div>
      </div>

      {soloLectura && (
        <Card className="border-dashed">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium">
                {sedeEditada ? 'La tarjeta de tu sede la cambia un super usuario' : 'La tarjeta es de la marca'}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {sedeEditada
                  ? 'Acá la podés ver y probar en la vista previa, pero guardarla es de quien administra la marca: pedíselo. '
                  : 'Acá la podés ver y probar colores en la vista previa, pero guardarla le cambiaría la tarjeta a todas las sedes a la vez, así que solo lo hace un super usuario. Pedíselo a quien administra la marca. '}
                El link de reseñas y los datos de tu sede se cambian en{' '}
                <Link href="/dashboard/sedes" className="font-medium underline">Sedes</Link>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── La tarjeta de cada sede (solo con 2+ sedes) ───────────────── */}
      {multiSede && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="h-4 w-4" />
              ¿Una tarjeta para {lasSedes(nSedes)} o una para cada una?
            </CardTitle>
            {frase && <CardDescription>{frase}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            <EleccionDeTarjeta
              sedes={nSedes}
              modo={modo}
              puedeCambiar={!soloLectura}
              guardando={guardandoModo}
              onElegir={elegirModo}
            />

            {/* Con una tarjeta por sede y «Toda la marca» elegida: a cuál ir. */}
            {que.tipo === 'marca' && que.motivo === 'base' && sedesActivas.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {sedesActivas.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{s.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {tieneTarjetaPropia(s.card) ? 'Tiene la suya' : 'Usa la de la marca'}
                      </span>
                    </span>
                    <Button variant="outline" onClick={() => setSelection(s.id)} className="min-h-11">
                      Editar la de {s.name}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {/* Con una sede elegida: no empezar de cero. */}
            {sedeEditada && !soloLectura && (
              <div className="flex flex-wrap gap-2">
                {otrasSedes.map((s) => (
                  <Button key={s.id} variant="outline" onClick={() => copiarDe(s)} className="min-h-11 gap-2">
                    <Copy className="h-4 w-4" />
                    Copiar la de {s.name}
                  </Button>
                ))}
                {tieneTarjetaPropia(tarjetaDeSede) && (
                  <Button variant="ghost" onClick={usarLaDeLaMarca} className="min-h-11 gap-2 text-muted-foreground">
                    <RotateCcw className="h-4 w-4" />
                    Usar la de la marca
                  </Button>
                )}
              </div>
            )}

            {aviso && <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{aviso}</p>}
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ─── Controles ─────────────────────────────────────────────── */}
        <div className="space-y-6">
          {sedeEditada ? (
            // Con una sede elegida, lo de la marca se ve pero no se toca acá.
            <Card>
              <CardHeader>
                <CardTitle className="text-base">De la marca</CardTitle>
                <CardDescription>
                  El nombre, el logo y los colores son los mismos en {lasSedes(nSedes)}: los puntos y los
                  sellos de tu cliente también son de la marca. Se cambian eligiendo «Toda la marca» arriba.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#F9F8F6] p-2">
                  {form.logo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={form.logo_url} alt="Logo" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground/30" strokeWidth={1.25} />
                  )}
                </div>
                <span
                  aria-label="Color de la marca"
                  className="h-11 w-11 shrink-0 rounded-full border"
                  style={{ background: previewBranding.primary }}
                />
              </CardContent>
            </Card>
          ) : (
            <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Logo</CardTitle>
              <CardDescription>
                PNG con fondo transparente es lo que mejor queda: se usa sobre marfil en la
                pantalla de check-in y sobre el gradiente oscuro de la tarjeta. Lo guardamos
                a 512 px como máximo, así que no hace falta que lo redimensiones.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-[#F9F8F6] p-2">
                  {form.logo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={form.logo_url} alt="Logo" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-7 w-7 text-muted-foreground/30" strokeWidth={1.25} />
                  )}
                </div>
                <div className="flex flex-1 flex-wrap gap-2">
                  <label
                    aria-disabled={soloLectura || undefined}
                    className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent${soloLectura ? ' pointer-events-none opacity-50' : ''}`}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {form.logo_url ? 'Cambiar logo' : 'Subir logo'}
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleUpload}
                      disabled={uploading || soloLectura}
                      className="hidden"
                    />
                  </label>
                  {form.logo_url && (
                    <Button variant="outline" onClick={handleRemoveLogo} disabled={uploading || soloLectura} className="min-h-11 gap-2">
                      <Trash2 className="h-4 w-4 text-red-600" />
                      Quitar
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                El mismo logo se estampa en el centro del QR del{' '}
                <Link href="/dashboard/qr" className="underline">material imprimible</Link>.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Color de la marca</CardTitle>
              <CardDescription>
                Elige uno. Del resto nos encargamos: el segundo tono del gradiente, el color del
                sello, el del QR y si el texto del botón va en blanco o en negro salen de este.
                Déjalo vacío para usar el rojo del sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ColorField
                label="Color principal"
                value={form.primary}
                placeholder="#FF4D6D"
                onChange={handlePrimaryChange}
                onClear={() => patch({ primary: '', primary_end: '' })}
              />

              {contrastWarning && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {contrastWarning}
                </p>
              )}

              <ColorField
                label="Fondo de las pantallas"
                value={form.surface}
                placeholder="#F9F8F6 (marfil)"
                onChange={(v) => patch({ surface: v })}
                onClear={() => patch({ surface: '' })}
              />

              <ColorField
                label="Color del texto"
                value={form.ink}
                placeholder="#1a1c1d"
                onChange={(v) => patch({ ink: v })}
                onClear={() => patch({ ink: '' })}
              />

              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {advanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Ajuste fino
              </button>

              {advanced && (
                <div className="space-y-4 rounded-lg bg-muted/40 p-4">
                  <p className="text-xs text-muted-foreground">
                    Solo si necesitas algo que no se deriva de un color. Vacío = calculado a
                    partir del color principal.
                  </p>

                  <ColorField
                    label="Segundo tono del gradiente"
                    value={form.primary_end}
                    placeholder={form.primary && isHexColor(form.primary) ? deriveGradientEnd(form.primary) : '#E63946'}
                    onChange={(v) => patch({ primary_end: v })}
                    onClear={() => patch({ primary_end: '' })}
                  />

                  <div className="space-y-1.5">
                    <Label className="text-xs">Gradiente de la tarjeta (CSS)</Label>
                    <Input
                      value={form.card_bg}
                      onChange={(e) => patch({ card_bg: e.target.value })}
                      placeholder={previewBranding.cardBg}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Gradiente del fondo de la tarjeta (CSS)</Label>
                    <Input
                      value={form.page_bg}
                      onChange={(e) => patch({ page_bg: e.target.value })}
                      placeholder={previewBranding.pageBg}
                      className="font-mono text-xs"
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Solo se acepta <code>linear-gradient(...)</code> o <code>radial-gradient(...)</code>.
                  </p>
                </div>
              )}

              <Button variant="ghost" onClick={handleReset} className="min-h-11 gap-2 text-muted-foreground">
                <RotateCcw className="h-4 w-4" />
                Volver a los colores del sistema
              </Button>
            </CardContent>
          </Card>
            </>
          )}

          {/* ─── Sellos y decoración (Tarjeta principal) ──────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sellos y decoración</CardTitle>
              <CardDescription>
                El símbolo que aparece en cada sello que gana tu cliente, y un contorno decorativo
                detrás de la tarjeta. Los dos se pintan con tu color.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-xs">Símbolo del sello</Label>
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-7 md:grid-cols-10">
                  {STAMP_ICON_IDS.map((id) => {
                    const selected = id === stampIcon
                    return (
                      <button
                        key={id}
                        type="button"
                        title={STAMP_ICON_LABELS[id]}
                        aria-label={STAMP_ICON_LABELS[id]}
                        aria-pressed={selected}
                        onClick={() => elegirSello(id)}
                        className={`flex aspect-square items-center justify-center rounded-full transition-transform hover:scale-105 ${
                          selected ? 'ring-2 ring-primary ring-offset-2' : ''
                        }`}
                        style={{
                          background: previewTheme.stamps.filledBg,
                          border: previewTheme.stamps.filledBorder,
                          boxShadow: previewTheme.stamps.filledShadow,
                        }}
                      >
                        <StampIcon id={id} color={previewTheme.stamps.check} sizeClass="h-[55%] w-[55%]" />
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Seleccionado: {STAMP_ICON_LABELS[stampIcon]}
                  {sedeEditada && !tarjetaDeSede.stamp_icon && ' (el de la marca)'}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">
                  Decoración de contorno
                  {sedeEditada && !tarjetaDeSede.motif && <span className="font-normal text-muted-foreground"> · la de la marca</span>}
                </Label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-7">
                  {CARD_MOTIF_IDS.map((id) => {
                    const selected = id === motif
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => elegirMotivo(id)}
                        className={`flex flex-col items-center gap-1.5 rounded-lg p-1.5 text-center transition-colors hover:bg-accent ${
                          selected ? 'bg-accent ring-2 ring-primary' : ''
                        }`}
                      >
                        <span
                          className="relative isolate block h-14 w-full overflow-hidden rounded-md"
                          style={{ background: previewTheme.cardBg }}
                        >
                          <CardMotif id={id} />
                        </span>
                        <span className="text-[11px] leading-tight text-muted-foreground">{CARD_MOTIF_LABELS[id]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {sedeEditada ? (
            <>
              {/* ─── La ficha de la sede: se ve, se cambia en Mis sedes ─── */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="h-4 w-4" />
                    Dirección, horario, teléfonos y redes de {sedeEditada.name}
                  </CardTitle>
                  <CardDescription>
                    La tarjeta de esta sede los muestra con cualquiera de las dos opciones de arriba. Se
                    cambian en{' '}
                    <Link href="/dashboard/sedes" className="font-medium underline">Mis sedes</Link>; donde la sede
                    no puso nada, se ve lo de la marca.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FichaVista sede={sedeEditada} marca={form} />
                </CardContent>
              </Card>

              {/* ─── Lo que la tarjeta de la sede cuenta de sí misma ───── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quiénes somos y políticas de {sedeEditada.name}</CardTitle>
                  <CardDescription>
                    Van plegados dentro de la tarjeta. Vacío = el texto de la marca.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <TextAreaField
                    label="Descripción breve"
                    value={tarjetaDeSede.description}
                    maxLength={400}
                    rows={3}
                    placeholder={form.description || 'Cocina de autor con productos de la región, desde 2012.'}
                    onChange={(v) => patchSede({ description: v })}
                  />
                  <TextAreaField
                    label="Políticas"
                    value={tarjetaDeSede.policies}
                    maxLength={2000}
                    rows={6}
                    placeholder={form.policies || 'Reservas: se mantienen 15 minutos.\nPremios: se entregan en el local presentando la tarjeta.'}
                    onChange={(v) => patchSede({ policies: v })}
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            <>
            {/* ─── Redes y perfil de Google ───────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Redes y perfil de Google</CardTitle>
                <CardDescription>
                  Aparecen como botones redondos dentro de la tarjeta. Solo se muestran los que
                  tengan enlace. Pega la dirección completa, empezando por https://.
                  {notaDeSedes && ` ${notaDeSedes}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <UrlField label="Instagram" value={form.instagram_url} placeholder="https://instagram.com/tu-restaurante" onChange={(v) => patch({ instagram_url: v })} />
                <UrlField label="Facebook" value={form.facebook_url} placeholder="https://facebook.com/tu-restaurante" onChange={(v) => patch({ facebook_url: v })} />
                <UrlField label="TikTok" value={form.tiktok_url} placeholder="https://tiktok.com/@tu-restaurante" onChange={(v) => patch({ tiktok_url: v })} />
                <UrlField label="WhatsApp (enlace wa.me)" value={form.whatsapp_link} placeholder="https://wa.me/573001234567" onChange={(v) => patch({ whatsapp_link: v })} />
                <UrlField label="Perfil de Google" value={form.google_profile_url} placeholder="https://g.page/tu-restaurante" onChange={(v) => patch({ google_profile_url: v })} />
                <UrlField label="Sitio web" value={form.website_url} placeholder="https://tu-restaurante.com" onChange={(v) => patch({ website_url: v })} />
              </CardContent>
            </Card>

            {/* ─── Descripción, contacto y políticas ──────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quiénes somos, contacto y políticas</CardTitle>
                <CardDescription>
                  Van plegados dentro de la tarjeta: el cliente los abre con un toque. Lo que dejes
                  vacío no aparece.
                  {notaDeSedes && ` La dirección, el horario y los teléfonos también. ${notaDeSedes}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <TextAreaField
                  label="Descripción breve"
                  value={form.description}
                  maxLength={400}
                  rows={3}
                  placeholder="Cocina de autor con productos de la región, desde 2012."
                  onChange={(v) => patch({ description: v })}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Teléfono de contacto</Label>
                    <Input value={form.contact_phone} onChange={(e) => patch({ contact_phone: e.target.value })} placeholder="+57 300 123 4567" inputMode="tel" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Correo</Label>
                    <Input value={form.contact_email} onChange={(e) => patch({ contact_email: e.target.value })} placeholder="hola@tu-restaurante.com" inputMode="email" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Dirección</Label>
                  <Input value={form.address} onChange={(e) => patch({ address: e.target.value })} placeholder="Cra 43A #5-12, Manila, Medellín" maxLength={160} />
                </div>
                <TextAreaField
                  label="Horario"
                  value={form.hours}
                  maxLength={300}
                  rows={3}
                  placeholder={'Lun a Jue: 12:00 – 22:00\nVie y Sáb: 12:00 – 23:00\nDom: 12:00 – 18:00'}
                  onChange={(v) => patch({ hours: v })}
                />
                <TextAreaField
                  label="Políticas"
                  value={form.policies}
                  maxLength={2000}
                  rows={6}
                  placeholder={'Reservas: se mantienen 15 minutos.\nPremios: se entregan en el local presentando la tarjeta.\nDatos: usamos tu celular solo para el programa de fidelidad.'}
                  onChange={(v) => patch({ policies: v })}
                />
              </CardContent>
            </Card>
            </>
          )}
        </div>

        {/* ─── Vista previa ──────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setScreen('checkin')}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all ${
                screen === 'checkin'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-background hover:bg-accent'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              Pantalla
            </button>
            <button
              onClick={() => setScreen('card')}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all ${
                screen === 'card'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-background hover:bg-accent'
              }`}
            >
              <CreditCard className="h-3.5 w-3.5" />
              Tarjeta
            </button>
          </div>

          <BrandPreview branding={previewBranding} screen={screen} />

          <p className="mt-3 text-center text-xs text-muted-foreground">
            Vista previa con datos de ejemplo. Los colores son los que va a ver tu cliente.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * La ficha de una sede, de solo lectura (sedes separadas, parte 2): lo que la tarjeta de esa sede
 * muestra de dirección, horario, teléfonos y redes. Vive en «Mis sedes»: acá no se duplica.
 */
function FichaVista({ sede, marca }: { sede: SedeDeLaTarjeta; marca: BrandForm }) {
  const filas = FICHA_DE_SEDE.map((f) => {
    const propio = sede.ficha[f.ruta]
    const deSede = typeof propio === 'string' && propio.trim() !== '' ? propio : ''
    return { etiqueta: f.etiqueta, valor: deSede || marca[f.marca], deLaMarca: deSede === '' }
  }).filter((f) => f.valor.trim() !== '')

  if (filas.length === 0) {
    return <p className="text-sm text-muted-foreground">Esta sede todavía no tiene dirección, horario ni teléfonos cargados.</p>
  }
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {filas.map((f) => (
        <div key={f.etiqueta} className="min-w-0">
          <dt className="text-xs text-muted-foreground">
            {f.etiqueta}
            {f.deLaMarca && ' · el de la marca'}
          </dt>
          <dd className="whitespace-pre-line break-words">{f.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Selector de color + hex escribible + botón de "volver al del sistema". */
function ColorField({
  label,
  value,
  placeholder,
  onChange,
  onClear,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  onClear: () => void
}) {
  // El `<input type="color">` no acepta cadena vacía: necesita SIEMPRE un hex.
  // Cuando el campo está vacío se le da el del placeholder, que es el valor del
  // sistema — así el selector abre en el color que efectivamente se está usando.
  const swatch = normalizeHex(value) ?? normalizeHex(placeholder) ?? '#ff4d6d'
  const invalid = value !== '' && !isHexColor(value)

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-16 shrink-0 cursor-pointer rounded border border-input bg-background"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`flex-1 font-mono text-sm ${invalid ? 'border-red-400' : ''}`}
        />
        {value !== '' && (
          <Button variant="outline" size="sm" onClick={onClear} className="min-h-11 shrink-0">
            Usar el del sistema
          </Button>
        )}
      </div>
      {invalid && <p className="text-xs text-red-600">Debe ser un color hex, por ejemplo #0A7C4A.</p>}
    </div>
  )
}

/** Un enlace. Avisa si no empieza por http(s), que es lo único que la whitelist acepta. */
function UrlField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  const invalid = value.trim() !== '' && !/^https?:\/\//i.test(value.trim())
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="url"
        className={invalid ? 'border-red-400' : ''}
      />
      {invalid && <p className="text-xs text-red-600">Debe empezar por https://</p>}
    </div>
  )
}

function TextAreaField({
  label,
  value,
  maxLength,
  rows,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  maxLength: number
  rows: number
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-[11px] text-muted-foreground">{value.length}/{maxLength}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  )
}
