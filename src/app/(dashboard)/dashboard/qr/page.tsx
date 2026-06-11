'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { QrCode, Download, Copy, Check, ExternalLink, Plus, Minus, Upload, Trash2, Palette, Ruler } from 'lucide-react'
import { BRAND_NAME, BRAND_SHORT } from '@/lib/branding'
import { QR_THEMES, QR_SIZES, composeQrPoster } from '@/lib/utils/qr-poster'

const STORAGE_KEYS = {
  color: 'qr_color',
  logo: 'qr_logo_dataurl',
  theme: 'qr_theme',
  size: 'qr_size',
  headline: 'qr_headline',
  subline: 'qr_subline',
}

const DEFAULT_HEADLINE = '¡GANA PREMIOS GRATIS!'
const DEFAULT_SUBLINE = 'Escanea, regístrate y suma puntos en cada visita'

export default function QrPage() {
  const [baseUrl, setBaseUrl] = useState('')
  const [totalTables, setTotalTables] = useState(10)
  const [selectedTable, setSelectedTable] = useState<number | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [color, setColor] = useState('')
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [themeId, setThemeId] = useState('restaurante')
  const [sizeId, setSizeId] = useState('mesa')
  const [headline, setHeadline] = useState(DEFAULT_HEADLINE)
  const [subline, setSubline] = useState(DEFAULT_SUBLINE)

  const theme = QR_THEMES.find((t) => t.id === themeId) ?? QR_THEMES[0]
  const size = QR_SIZES.find((s) => s.id === sizeId) ?? QR_SIZES[0]

  // Cargar preferencias de localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedColor = localStorage.getItem(STORAGE_KEYS.color)
    if (savedColor) setColor(savedColor)
    const savedLogo = localStorage.getItem(STORAGE_KEYS.logo)
    if (savedLogo) setLogoDataUrl(savedLogo)
    const savedTheme = localStorage.getItem(STORAGE_KEYS.theme)
    if (savedTheme && QR_THEMES.some((t) => t.id === savedTheme)) setThemeId(savedTheme)
    const savedSize = localStorage.getItem(STORAGE_KEYS.size)
    if (savedSize && QR_SIZES.some((s) => s.id === savedSize)) setSizeId(savedSize)
    const savedHeadline = localStorage.getItem(STORAGE_KEYS.headline)
    if (savedHeadline !== null) setHeadline(savedHeadline)
    const savedSubline = localStorage.getItem(STORAGE_KEYS.subline)
    if (savedSubline !== null) setSubline(savedSubline)
  }, [])

  // Persistir preferencias
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (color) localStorage.setItem(STORAGE_KEYS.color, color)
    else localStorage.removeItem(STORAGE_KEYS.color)
    localStorage.setItem(STORAGE_KEYS.theme, themeId)
    localStorage.setItem(STORAGE_KEYS.size, sizeId)
    localStorage.setItem(STORAGE_KEYS.headline, headline)
    localStorage.setItem(STORAGE_KEYS.subline, subline)
  }, [color, themeId, sizeId, headline, subline])

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Por favor sube una imagen (PNG con fondo transparente recomendado)')
      return
    }
    if (file.size > 500_000) {
      alert('La imagen es demasiado grande. Máximo 500 KB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setLogoDataUrl(dataUrl)
      localStorage.setItem(STORAGE_KEYS.logo, dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleLogoRemove = () => {
    setLogoDataUrl(null)
    localStorage.removeItem(STORAGE_KEYS.logo)
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
          brandName: BRAND_NAME,
          headline,
          subline,
          label: mesaLabel,
          logoDataUrl,
          accentOverride: color || null,
        })
      } catch (err) {
        console.error('Error generando QR:', err)
        return null
      }
    },
    [theme, size, headline, subline, color, logoDataUrl]
  )

  useEffect(() => {
    if (!checkInUrl) return
    const label = selectedTable ? `MESA ${selectedTable}` : 'GENERAL'
    generateQR(checkInUrl, label).then(setQrDataUrl)
  }, [checkInUrl, generateQR, selectedTable])

  const slug = BRAND_SHORT.toLowerCase().replace(/\s+/g, '-')

  const handleDownload = () => {
    if (!qrDataUrl) return
    const label = selectedTable ? `mesa-${selectedTable}` : 'general'
    const link = document.createElement('a')
    link.download = `${slug}-qr-${label}-${sizeId}.png`
    link.href = qrDataUrl
    link.click()
  }

  const handleDownloadAll = async () => {
    setGenerating(true)
    try {
      for (let i = 1; i <= totalTables; i++) {
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
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <QrCode className="h-6 w-6" />
        QR Studio
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuración</CardTitle>
            <CardDescription>
              Diseña tu material imprimible: elige tema, tamaño y textos. Cada mesa tiene su propio QR para rastrear rendimiento.
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
            </div>

            <div className="space-y-2">
              <Label>Número de mesas</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setTotalTables(Math.max(1, totalTables - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={totalTables}
                  onChange={(e) => setTotalTables(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 text-center"
                  min={1}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setTotalTables(totalTables + 1)}
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
                    onClick={() => setThemeId(t.id)}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs font-medium transition-all ${
                      themeId === t.id
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
                    onClick={() => setSizeId(s.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      sizeId === s.id
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
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder={DEFAULT_HEADLINE}
                maxLength={40}
              />
            </div>

            <div className="space-y-2">
              <Label>Subtítulo</Label>
              <Input
                value={subline}
                onChange={(e) => setSubline(e.target.value)}
                placeholder={DEFAULT_SUBLINE}
                maxLength={70}
              />
            </div>

            <div className="space-y-2">
              <Label>Color de acento (opcional — sobreescribe el del tema)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color || theme.accent}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-16 cursor-pointer rounded border border-input bg-background"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder={theme.accent}
                  className="font-mono text-sm flex-1"
                />
                {color && (
                  <Button variant="outline" size="sm" onClick={() => setColor('')}>
                    Usar tema
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Aplica al QR, titular y número de mesa. Déjalo vacío para usar el color del tema.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Logo (PNG transparente, máx. 500KB)</Label>
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent gap-2 flex-1">
                  <Upload className="h-4 w-4" />
                  {logoDataUrl ? 'Cambiar logo' : 'Subir logo'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
                {logoDataUrl && (
                  <Button variant="outline" size="icon" onClick={handleLogoRemove} title="Eliminar logo">
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                )}
              </div>
              {logoDataUrl && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoDataUrl} alt="Logo preview" className="h-10 w-10 rounded object-contain bg-white" />
                  <p className="text-xs text-muted-foreground">Logo cargado — se superpondrá en el centro del QR.</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Selecciona mesa para vista previa</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedTable(null)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition-all ${
                    selectedTable === null
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-input hover:bg-accent'
                  }`}
                >
                  General
                </button>
                {Array.from({ length: totalTables }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setSelectedTable(n)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition-all ${
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
                <Button variant="outline" size="icon" onClick={handleCopyUrl}>
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleDownload} disabled={!qrDataUrl} className="gap-2 flex-1">
                <Download className="h-4 w-4" />
                {selectedTable ? `Descargar Mesa ${selectedTable}` : 'Descargar General'}
              </Button>
              <a
                href={checkInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Probar
              </a>
            </div>

            <Button
              onClick={handleDownloadAll}
              disabled={generating || !baseUrl}
              variant="outline"
              className="w-full gap-2"
            >
              <Download className="h-4 w-4" />
              {generating ? 'Generando...' : `Descargar TODAS las mesas (1-${totalTables})`}
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
