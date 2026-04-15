'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { QrCode, Download, Copy, Check, ExternalLink, UtensilsCrossed, Plus, Minus } from 'lucide-react'
import QRCode from 'qrcode'

export default function QrPage() {
  const [baseUrl, setBaseUrl] = useState('')
  const [totalTables, setTotalTables] = useState(10)
  const [selectedTable, setSelectedTable] = useState<number | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)

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

  const generateQR = useCallback(async (url: string) => {
    if (!url) return null
    try {
      return await QRCode.toDataURL(url, {
        width: 600,
        margin: 2,
        color: { dark: '#991B1B', light: '#FFFFFF' },
        errorCorrectionLevel: 'H',
      })
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (!checkInUrl) return
    generateQR(checkInUrl).then(setQrDataUrl)
  }, [checkInUrl, generateQR])

  const handleDownload = () => {
    if (!qrDataUrl) return
    const label = selectedTable ? `mesa-${selectedTable}` : 'general'
    const link = document.createElement('a')
    link.download = `sushi-service-qr-${label}.png`
    link.href = qrDataUrl
    link.click()
  }

  const handleDownloadAll = async () => {
    setGenerating(true)
    try {
      for (let i = 1; i <= totalTables; i++) {
        const url = getCheckInUrl(i)
        const dataUrl = await generateQR(url)
        if (dataUrl) {
          const link = document.createElement('a')
          link.download = `sushi-service-qr-mesa-${i}.png`
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
            <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-primary/20 bg-white p-6">
              <div className="text-center space-y-1">
                <h3 className="font-bold text-primary text-lg">Sushi Service</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedTable ? `Mesa ${selectedTable} — ` : ''}Escanea y registra tu visita
                </p>
              </div>

              {qrDataUrl ? (
                <div className="rounded-xl border p-2 shadow-sm">
                  <img src={qrDataUrl} alt={`QR Code ${selectedTable ? `Mesa ${selectedTable}` : 'General'}`} width={300} height={300} className="rounded-lg" />
                </div>
              ) : (
                <div className="flex h-[300px] w-[300px] items-center justify-center rounded-xl bg-muted">
                  <QrCode className="h-16 w-16 text-muted-foreground/30" />
                </div>
              )}

              {selectedTable && (
                <div className="rounded-full bg-primary/10 px-4 py-1.5">
                  <span className="text-sm font-bold text-primary">Mesa {selectedTable}</span>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Acumula visitas y sube de nivel: 🥈 Plata → 🥇 Oro → ⚜️ Platino → 👑 Black
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
