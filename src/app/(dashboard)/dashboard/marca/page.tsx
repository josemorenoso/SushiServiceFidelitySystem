'use client'

/**
 * Identidad visual — §5 (pantalla del teléfono y tarjeta) y §6 (logo y paleta).
 *
 * Es el primer sitio del producto donde el dueño de un restaurante puede
 * cambiar cómo lo ve SU cliente. Hasta ahora la marca se sembraba una vez por
 * SQL al dar de alta el tenant (`scripts/seed-new-tenant.sql`) y no había forma
 * de tocarla después: `EDITABLE_KEYS` era `['google_maps_url']` y nada más.
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
import { BrandPreview, type PreviewScreen } from '@/components/dashboard/BrandPreview'
import type { TenantConfig } from '@/types/tenant.types'

/** El estado editable. Cadena vacía = "usar lo del sistema de diseño". */
interface BrandForm {
  logo_url: string
  primary: string
  primary_end: string
  surface: string
  ink: string
  card_bg: string
  page_bg: string
}

const EMPTY_FORM: BrandForm = {
  logo_url: '', primary: '', primary_end: '', surface: '', ink: '', card_bg: '', page_bg: '',
}

const PATH_OF: Record<keyof BrandForm, string> = {
  logo_url: 'branding.logo_url',
  primary: 'branding.primary',
  primary_end: 'branding.primary_end',
  surface: 'branding.surface',
  ink: 'branding.ink',
  card_bg: 'branding.card_bg',
  page_bg: 'branding.page_bg',
}

export default function MarcaPage() {
  const router = useRouter()
  const [form, setForm] = useState<BrandForm>(EMPTY_FORM)
  const [initial, setInitial] = useState<BrandForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState<PreviewScreen>('checkin')
  const [advanced, setAdvanced] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const dirty = useMemo(
    () => (Object.keys(form) as (keyof BrandForm)[]).some((k) => form[k] !== initial[k]),
    [form, initial]
  )

  // La marca tal como la va a resolver el producto, con lo que hay en el
  // formulario AHORA. Es el mismo `resolveBranding()` de las pantallas reales.
  const previewBranding = useMemo(() => {
    const config: TenantConfig = {
      brand_name: 'Tu Restaurante',
      branding: {
        logo_url: form.logo_url || undefined,
        primary: isHexColor(form.primary) ? form.primary : undefined,
        primary_end: isHexColor(form.primary_end) ? form.primary_end : undefined,
        surface: isHexColor(form.surface) ? form.surface : undefined,
        ink: isHexColor(form.ink) ? form.ink : undefined,
        card_bg: form.card_bg || undefined,
        page_bg: form.page_bg || undefined,
      },
    }
    return resolveBranding(config)
  }, [form])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/dashboard/tenant-config')
        if (!res.ok) throw new Error('No se pudo leer la configuración de la marca')
        const data = (await res.json()) as Record<string, unknown>
        if (cancelled) return
        const next = { ...EMPTY_FORM }
        for (const key of Object.keys(EMPTY_FORM) as (keyof BrandForm)[]) {
          const value = data[PATH_OF[key]]
          if (typeof value === 'string') next[key] = value
        }
        setForm(next)
        setInitial(next)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error cargando la marca')
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
      for (const key of Object.keys(form) as (keyof BrandForm)[]) {
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
            Identidad visual
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu logo y tu color, en la pantalla que ve tu cliente y en su tarjeta.
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
