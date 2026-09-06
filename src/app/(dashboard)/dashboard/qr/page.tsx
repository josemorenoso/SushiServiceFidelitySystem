'use client'

/**
 * QR Studio — el material imprimible de las mesas.
 *
 * QUÉ CAMBIÓ EN §3
 * ────────────────
 * La config (tema, tamaño, textos, acento, número de mesas) vivía SOLO en el
 * `localStorage` del navegador. Eso quiere decir que el diseño que el
 * restaurante mandó a imprenta se perdía al cambiar de equipo, de navegador o al
 * limpiar el caché — y nadie podía reimprimir la misma pieza. Ahora vive en
 * `tenants.config.qr_studio` y viaja con la cuenta.
 *
 * Lo que había en `localStorage` NO se tira: la primera vez que se abre esta
 * página sin config en el servidor, se sube lo que hubiera guardado el navegador
 * (ver `migrateLegacyLocalStorage`). Después se limpian esas claves.
 *
 * EL LOGO YA NO ES DE ESTA PÁGINA. Antes se subía acá y quedaba en un
 * `localStorage` propio, así que el póster y la tarjeta del cliente podían tener
 * logos distintos. Ahora es el logo de la MARCA y se administra en
 * `/dashboard/marca` (§6); acá solo se muestra cuál se va a estampar.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { QrCode, Download, Copy, Check, ExternalLink, Plus, Minus, Palette, Ruler, Loader2, Save, CheckCircle, ImageIcon } from 'lucide-react'
import { useBranding } from '@/lib/branding-context'
import { QR_THEMES, QR_SIZES, composeQrPoster } from '@/lib/utils/qr-poster'

/**
 * Claves del `localStorage` de antes de §3. Se siguen leyendo UNA vez, para no
 * perderle el diseño a quien ya lo tenía, y después se borran.
 * `qr_logo_dataurl` solo se borra: su reemplazo es `branding.logo_url`.
 */
const LEGACY_STORAGE_KEYS = {
  color: 'qr_color',
  logo: 'qr_logo_dataurl',
  theme: 'qr_theme',
  size: 'qr_size',
  headline: 'qr_headline',
  subline: 'qr_subline',
}

const DEFAULT_HEADLINE = '¡GANA PREMIOS GRATIS!'
const DEFAULT_SUBLINE = 'Escanea, regístrate y suma puntos en cada visita'
const DEFAULT_THEME = 'restaurante'
const DEFAULT_SIZE = 'mesa'
const DEFAULT_TABLES = 10

interface StudioConfig {
  theme: string
  size: string
  accent: string
  headline: string
  subline: string
  tables: number
}

const DEFAULT_CONFIG: StudioConfig = {
  theme: DEFAULT_THEME,
  size: DEFAULT_SIZE,
  accent: '',
  headline: DEFAULT_HEADLINE,
  subline: DEFAULT_SUBLINE,
  tables: DEFAULT_TABLES,
}

/** Lo que el navegador tenía guardado antes de §3, o `null` si no había nada. */
function readLegacyLocalStorage(): Partial<StudioConfig> | null {
  if (typeof window === 'undefined') return null
  const legacy: Partial<StudioConfig> = {}
  let found = false

  const color = localStorage.getItem(LEGACY_STORAGE_KEYS.color)
  if (color) { legacy.accent = color; found = true }
  const theme = localStorage.getItem(LEGACY_STORAGE_KEYS.theme)
  if (theme && QR_THEMES.some((t) => t.id === theme)) { legacy.theme = theme; found = true }
  const size = localStorage.getItem(LEGACY_STORAGE_KEYS.size)
  if (size && QR_SIZES.some((s) => s.id === size)) { legacy.size = size; found = true }
  const headline = localStorage.getItem(LEGACY_STORAGE_KEYS.headline)
  if (headline !== null) { legacy.headline = headline; found = true }
  const subline = localStorage.getItem(LEGACY_STORAGE_KEYS.subline)
  if (subline !== null) { legacy.subline = subline; found = true }

  return found ? legacy : null
}

function clearLegacyLocalStorage() {
  if (typeof window === 'undefined') return
  for (const key of Object.values(LEGACY_STORAGE_KEYS)) localStorage.removeItem(key)
}

export default function QrPage() {
  const branding = useBranding()
  const [baseUrl, setBaseUrl] = useState('')
  const [selectedTable, setSelectedTable] = useState<number | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)

  const [config, setConfig] = useState<StudioConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const theme = QR_THEMES.find((t) => t.id === config.theme) ?? QR_THEMES[0]
  const size = QR_SIZES.find((s) => s.id === config.size) ?? QR_SIZES[0]

  const patch = useCallback((changes: Partial<StudioConfig>) => {
    setConfig((prev) => ({ ...prev, ...changes }))
    setDirty(true)
    setSaved(false)
  }, [])

  const persist = useCallback(async (next: StudioConfig) => {
    const res = await fetch('/api/dashboard/tenant-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'qr_studio.theme': next.theme,
        'qr_studio.size': next.size,
        'qr_studio.accent': next.accent,
        'qr_studio.headline': next.headline,
        'qr_studio.subline': next.subline,
        'qr_studio.tables': next.tables,
      }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? 'No se pudo guardar el diseño')
    }
  }, [])

  // Carga inicial: servidor primero; si está vacío, se rescata el localStorage.
  const migrated = useRef(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/dashboard/tenant-config')
        if (!res.ok) throw new Error('No se pudo leer la configuración')
        const data = (await res.json()) as Record<string, unknown>
        if (cancelled) return

        const fromServer: Partial<StudioConfig> = {}
        if (typeof data['qr_studio.theme'] === 'string') fromServer.theme = data['qr_studio.theme'] as string
        if (typeof data['qr_studio.size'] === 'string') fromServer.size = data['qr_studio.size'] as string
        if (typeof data['qr_studio.accent'] === 'string') fromServer.accent = data['qr_studio.accent'] as string
        if (typeof data['qr_studio.headline'] === 'string') fromServer.headline = data['qr_studio.headline'] as string
        if (typeof data['qr_studio.subline'] === 'string') fromServer.subline = data['qr_studio.subline'] as string
        if (typeof data['qr_studio.tables'] === 'number') fromServer.tables = data['qr_studio.tables'] as number

        if (Object.keys(fromServer).length > 0) {
          setConfig({ ...DEFAULT_CONFIG, ...fromServer })
          clearLegacyLocalStorage()
        } else if (!migrated.current) {
          // Nada en el servidor. Si el navegador tiene el diseño viejo, se sube
          // una vez y se limpia — así el dueño no pierde lo que ya había hecho.
          migrated.current = true
          const legacy = readLegacyLocalStorage()
          if (legacy) {
            const merged = { ...DEFAULT_CONFIG, ...legacy }
            setConfig(merged)
            try {
              await persist(merged)
              clearLegacyLocalStorage()
            } catch {
              // Si la subida falla, se deja el localStorage donde está: es lo
              // único que queda del diseño y borrarlo sería perderlo.
            }
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error cargando la configuración')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [persist])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await persist(config)
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  const getCheckInUrl = useCallback((mesa?: number) => {
    if (!baseUrl) return ''
    return mesa ? `${baseUrl}/check-in?mesa=${mesa}` : `${baseUrl}/check-in`
  }, [baseUrl])

  const checkInUrl = getCheckInUrl(selectedTable ?? undefined)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin)
    }
  }, [])

  const generateQR = useCallback(
    async (url: string, mesaLabel: string) => {
      if (!url) return null
      try {
        return await composeQrPoster({
          url,
          theme,
          size,
          brandName: branding.name,
          headline: config.headline,
          subline: config.subline,
          label: mesaLabel,
          logoSrc: branding.logoUrl,
          accentOverride: config.accent || null,
        })
      } catch (err) {
        console.error('Error generando QR:', err)
        return null
      }
    },
    [theme, size, config.headline, config.subline, config.accent, branding.name, branding.logoUrl]
  )

  useEffect(() => {
    if (!checkInUrl) return
    const label = selectedTable ? `MESA ${selectedTable}` : 'GENERAL'
    generateQR(checkInUrl, label).then(setQrDataUrl)
  }, [checkInUrl, generateQR, selectedTable])

  const slug = branding.short.toLowerCase().replace(/\s+/g, '-')

  const handleDownload = () => {
    if (!qrDataUrl) return
    const label = selectedTable ? `mesa-${selectedTable}` : 'general'
    const link = document.createElement('a')
    link.download = `${slug}-qr-${label}-${config.size}.png`
    link.href = qrDataUrl
    link.click()
  }

  const handleDownloadAll = async () => {
    setGenerating(true)
    try {
      for (let i = 1; i <= config.tables; i++) {
        const url = getCheckInUrl(i)
        const dataUrl = await generateQR(url, `MESA ${i}`)
        if (dataUrl) {
          const link = document.createElement('a')
          link.download = `${slug}-qr-mesa-${i}.png`
          link.href = dataUrl
          link.click()
          await new Promise((r) => setTimeout(r, 300))
        }
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleCopyUrl = async () => {
    if (!checkInUrl) return
    await navigator.clipboard.writeText(checkInUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <QrCode className="h-6 w-6" />
          QR Studio
        </h1>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-xs text-amber-600 font-medium">Cambios sin guardar</span>}
          <Button onClick={handleSave} disabled={saving || loading || !dirty} className="gap-2 min-h-11">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Guardado' : 'Guardar diseño'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuración</CardTitle>
            <CardDescription>
              Diseña tu material imprimible: elige tema, tamaño y textos. Cada mesa tiene su propio QR para rastrear rendimiento.
              El diseño se guarda en tu cuenta, así que lo ves igual desde cualquier equipo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>URL base del sitio</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://tu-dominio.com"
              />
              <p className="text-xs text-muted-foreground">
                Solo afecta a esta sesión: sale del dominio desde el que abriste el panel.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Número de mesas</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11"
                  onClick={() => patch({ tables: Math.max(1, config.tables - 1) })}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={config.tables}
                  onChange={(e) => patch({ tables: Math.max(1, Math.min(200, parseInt(e.target.value) || 1)) })}
                  className="w-20 text-center"
                  min={1}
                  max={200}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11"
                  onClick={() => patch({ tables: Math.min(200, config.tables + 1) })}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Tema del negocio</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {QR_THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => patch({ theme: t.id })}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs font-medium transition-all ${
                      config.theme === t.id
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-input hover:bg-accent'
                    }`}
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
                      style={{ background: t.bg, border: `2px solid ${t.accent}` }}
                    >
                      {t.icon}
                    </span>
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                El tema define el patrón de fondo, los colores y el estilo del póster.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Ruler className="h-3.5 w-3.5" /> Tamaño de impresión (300 DPI)</Label>
              <div className="flex flex-wrap gap-2">
                {QR_SIZES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => patch({ size: s.id })}
                    className={`min-h-11 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      config.size === s.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-input hover:bg-accent'
                    }`}
                  >
                    {s.label}
                    <span className="ml-1 opacity-70">({s.physical})</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Titular gancho</Label>
              <Input
                value={config.headline}
                onChange={(e) => patch({ headline: e.target.value })}
                placeholder={DEFAULT_HEADLINE}
                maxLength={40}
              />
            </div>

            <div className="space-y-2">
              <Label>Subtítulo</Label>
              <Input
                value={config.subline}
                onChange={(e) => patch({ subline: e.target.value })}
                placeholder={DEFAULT_SUBLINE}
                maxLength={70}
              />
            </div>

            <div className="space-y-2">
              <Label>Color de acento (opcional — sobreescribe el del tema)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.accent || theme.accent}
                  onChange={(e) => patch({ accent: e.target.value })}
                  className="h-11 w-16 cursor-pointer rounded border border-input bg-background"
                />
                <Input
                  value={config.accent}
                  onChange={(e) => patch({ accent: e.target.value })}
                  placeholder={theme.accent}
                  className="font-mono text-sm flex-1"
                />
                {config.accent && (
                  <Button variant="outline" size="sm" className="min-h-11" onClick={() => patch({ accent: '' })}>
                    Usar tema
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Aplica al QR, titular y número de mesa. Déjalo vacío para usar el color del tema.
              </p>
            </div>

            {/* El logo es de la MARCA, no de esta página (§6). Un solo logo para
                el póster, la tarjeta del cliente y la pantalla de check-in. */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Logo</Label>
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                {branding.logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={branding.logoUrl} alt="Logo de la marca" className="h-10 w-10 rounded object-contain bg-white" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-white">
                    <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                  </div>
                )}
                <p className="flex-1 text-xs text-muted-foreground">
                  {branding.logoUrl
                    ? 'Se superpone en el centro del QR.'
                    : 'Sin logo. El póster sale sin marca en el centro del QR.'}{' '}
                  <Link href="/dashboard/marca" className="underline font-medium">
                    Cambiarlo en Identidad visual
                  </Link>
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Selecciona mesa para vista previa</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedTable(null)}
                  className={`min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all ${
                    selectedTable === null
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-input hover:bg-accent'
                  }`}
                >
                  General
                </button>
                {Array.from({ length: config.tables }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setSelectedTable(n)}
                    className={`min-h-11 min-w-11 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all ${
                      selectedTable === n
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-input hover:bg-accent'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>URL del check-in</Label>
              <div className="flex gap-2">
                <Input value={checkInUrl} readOnly className="font-mono text-sm" />
                <Button variant="outline" size="icon" className="h-11 w-11" onClick={handleCopyUrl}>
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleDownload} disabled={!qrDataUrl} className="gap-2 flex-1 min-h-11">
                <Download className="h-4 w-4" />
                {selectedTable ? `Descargar Mesa ${selectedTable}` : 'Descargar General'}
              </Button>
              <a
                href={checkInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Probar
              </a>
            </div>

            <Button
              onClick={handleDownloadAll}
              disabled={generating || !baseUrl}
              variant="outline"
              className="w-full gap-2 min-h-11"
            >
              <Download className="h-4 w-4" />
              {generating ? 'Generando...' : `Descargar TODAS las mesas (1-${config.tables})`}
            </Button>

            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p><strong>Tip:</strong> Imprime un QR diferente para cada mesa.</p>
              <p>El sistema rastreará qué mesa escaneó cada cliente para detectar fraudes y medir rendimiento por mesa.</p>
              <p><strong>Anti-fraude:</strong> Si detectamos 3+ registros seguidos desde la misma mesa fuera del restaurante, se marcan como sospechosos.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Vista Previa</CardTitle>
              <Badge variant="outline" className="gap-1">
                <span>{theme.icon}</span>
                {selectedTable ? `Mesa ${selectedTable}` : 'General'} · {size.physical}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-primary/20 bg-white p-4">
              {qrDataUrl ? (
                <div className="rounded-xl border p-2 shadow-sm bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl}
                    alt={`QR Code ${selectedTable ? `Mesa ${selectedTable}` : 'General'}`}
                    className="rounded-lg max-w-full h-auto"
                    style={{ maxHeight: 420 }}
                  />
                </div>
              ) : (
                <div className="flex h-[400px] w-[340px] items-center justify-center rounded-xl bg-muted">
                  <QrCode className="h-16 w-16 text-muted-foreground/30" />
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">
                PNG a 300 DPI ({size.width}×{size.height}px · {size.physical}) con tema, textos, logo y mesa — listo para imprenta.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
