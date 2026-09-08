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
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Palette, Save, Loader2, CheckCircle, Upload, Trash2, RotateCcw,
  ChevronDown, ChevronRight, ImageIcon, Smartphone, CreditCard, AlertTriangle,
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
import { StampIcon, CardMotif } from '@/components/features/wallet'
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

export default function MarcaPage() {
  const router = useRouter()
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

  const dirty = useMemo(() => FORM_KEYS.some((k) => form[k] !== initial[k]), [form, initial])

  // La marca tal como la va a resolver el producto, con lo que hay en el
  // formulario AHORA. Es el mismo `resolveBranding()` de las pantallas reales.
  const previewBranding = useMemo(() => {
    const config: TenantConfig = {
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
      },
    }
    return resolveBranding(config)
  }, [form])

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
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error cargando la tarjeta')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const patch = useCallback((changes: Partial<BrandForm>) => {
    setForm((prev) => ({ ...prev, ...changes }))
    setSaved(false)
    setError(null)
  }, [])

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

  const stampIcon: StampIconId = isStampIconId(form.stamp_icon) ? form.stamp_icon : 'check'
  const motif: CardMotifId = isCardMotifId(form.motif) ? form.motif : 'none'

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
            Tarjeta principal
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu logo, tu color, tus sellos, tus redes y tu información: la tarjeta que ve tu cliente.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs font-medium text-amber-600">Cambios sin guardar</span>}
          <Button onClick={handleSave} disabled={saving || !dirty} className="min-h-11 gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Guardado' : 'Guardar'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ─── Controles ─────────────────────────────────────────────── */}
        <div className="space-y-6">
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
                  <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {form.logo_url ? 'Cambiar logo' : 'Subir logo'}
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleUpload}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                  {form.logo_url && (
                    <Button variant="outline" onClick={handleRemoveLogo} disabled={uploading} className="min-h-11 gap-2">
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
                        onClick={() => patch({ stamp_icon: id === 'check' ? '' : id })}
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
                <p className="text-xs text-muted-foreground">Seleccionado: {STAMP_ICON_LABELS[stampIcon]}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Decoración de contorno</Label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-7">
                  {CARD_MOTIF_IDS.map((id) => {
                    const selected = id === motif
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => patch({ motif: id === 'none' ? '' : id })}
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

          {/* ─── Redes y perfil de Google ───────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Redes y perfil de Google</CardTitle>
              <CardDescription>
                Aparecen como botones redondos dentro de la tarjeta. Solo se muestran los que
                tengan enlace. Pega la dirección completa, empezando por https://.
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
