'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { QrCode, Download, Copy, Check, ExternalLink, UtensilsCrossed, Plus, Minus, Upload, Trash2 } from 'lucide-react'
import QRCode from 'qrcode'
import { BRAND_NAME, BRAND_SHORT } from '@/lib/branding'

const STORAGE_KEYS = {
  color: 'qr_color',
  logo: 'qr_logo_dataurl',
}

async function composeQrWithLogoAndLabel(
  url: string,
  opts: { color: string; logoDataUrl: string | null; label: string; brandName: string }
): Promise<string> {
  const QR_SIZE = 600
  const PADDING = 40
  const HEADER_H = 80
  const FOOTER_H = 80
  const canvas = document.createElement('canvas')
  canvas.width = QR_SIZE + PADDING * 2
  canvas.height = QR_SIZE + PADDING * 2 + HEADER_H + FOOTER_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')

  // Fondo blanco
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Header: nombre del negocio
  ctx.fillStyle = opts.color
  ctx.font = 'bold 32px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(opts.brandName, canvas.width / 2, 45)

  ctx.fillStyle = '#6b7280'
  ctx.font = '14px system-ui, -apple-system, sans-serif'
  ctx.fillText('Escanea y registra tu visita', canvas.width / 2, 68)

  // QR en el centro
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: QR_SIZE,
    margin: 2,
    color: { dark: opts.color, light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  })

  const qrImg = new Image()
  await new Promise<void>((resolve, reject) => {
    qrImg.onload = () => resolve()
    qrImg.onerror = () => reject(new Error('No se pudo cargar el QR'))
    qrImg.src = qrDataUrl
  })
  ctx.drawImage(qrImg, PADDING, HEADER_H + PADDING / 2, QR_SIZE, QR_SIZE)

  // Logo overlay (transparente, centro del QR)
  if (opts.logoDataUrl) {
    const logoImg = new Image()
    await new Promise<void>((resolve, reject) => {
      logoImg.onload = () => resolve()
      logoImg.onerror = () => reject(new Error('No se pudo cargar el logo'))
      logoImg.src = opts.logoDataUrl!
    })
    const logoSize = QR_SIZE * 0.22 // 22% del QR (seguro con ecc H)
    const logoX = PADDING + (QR_SIZE - logoSize) / 2
    const logoY = HEADER_H + PADDING / 2 + (QR_SIZE - logoSize) / 2
    // Fondo blanco redondeado detrás del logo para legibilidad
    ctx.fillStyle = '#FFFFFF'
    const bgPad = 8
    ctx.fillRect(logoX - bgPad, logoY - bgPad, logoSize + bgPad * 2, logoSize + bgPad * 2)
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize)
  }

  // Footer: número de mesa (prominente)
  ctx.fillStyle = opts.color
  ctx.font = 'bold 40px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(opts.label, canvas.width / 2, HEADER_H + QR_SIZE + PADDING + 50)

  return canvas.toDataURL('image/png')
}

export default function QrPage() {
  const [baseUrl, setBaseUrl] = useState('')
  const [totalTables, setTotalTables] = useState(10)
  const [selectedTable, setSelectedTable] = useState<number | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [color, setColor] = useState('#991B1B')
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)

  // Cargar preferencias de localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedColor = localStorage.getItem(STORAGE_KEYS.color)
    if (savedColor) setColor(savedColor)
    const savedLogo = localStorage.getItem(STORAGE_KEYS.logo)
    if (savedLogo) setLogoDataUrl(savedLogo)
  }, [])

  // Persistir color
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEYS.color, color)
  }, [color])

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
        return await composeQrWithLogoAndLabel(url, {
          color,
          logoDataUrl,
          label: mesaLabel,
          brandName: BRAND_NAME,
        })
      } catch (err) {
        console.error('Error generando QR:', err)
        return null
      }
    },
    [color, logoDataUrl]
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
    link.download = `${slug}-qr-${label}.png`
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
        Código QR por Mesa
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuración</CardTitle>
            <CardDescription>
              Cada mesa tiene su propio QR. Esto permite rastrear qué mesas generan más visitas y detectar registros sospechosos.
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
              <Label>Color del QR</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-16 cursor-pointer rounded border border-input bg-background"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#991B1B"
                  className="font-mono text-sm flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                El color aplica al QR, al nombre del negocio y al número de mesa.
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
                <UtensilsCrossed className="h-3 w-3" />
                {selectedTable ? `Mesa ${selectedTable}` : 'General'}
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
                Este PNG incluye el nombre del negocio, logo (si cargaste), y el número de mesa — listo para imprimir.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
