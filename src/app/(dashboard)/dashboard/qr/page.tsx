'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { QrCode, Download, Copy, Check, ExternalLink, UtensilsCrossed } from 'lucide-react'
import QRCode from 'qrcode'

export default function QrPage() {
  const [baseUrl, setBaseUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const checkInUrl = baseUrl ? `${baseUrl}/check-in` : ''

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin)
    }
  }, [])

  useEffect(() => {
    if (!checkInUrl) return
    generateQR()
  }, [checkInUrl])

  const generateQR = async () => {
    if (!checkInUrl) return
    try {
      const dataUrl = await QRCode.toDataURL(checkInUrl, {
        width: 600,
        margin: 2,
        color: {
          dark: '#991B1B',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'H',
      })
      setQrDataUrl(dataUrl)
    } catch {
      // silent
    }
  }

  const handleDownload = () => {
    if (!qrDataUrl) return
    const link = document.createElement('a')
    link.download = 'sushi-service-qr.png'
    link.href = qrDataUrl
    link.click()
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
        Código QR
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuración</CardTitle>
            <CardDescription>
              Este QR dirige a los clientes directamente al formulario de registro.
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
              <Label>URL del check-in (destino del QR)</Label>
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
                Descargar QR (PNG)
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

            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p><strong>Tip:</strong> Imprime este QR y colócalo en las mesas del restaurante.</p>
              <p>Los clientes escanean → ingresan su celular → quedan registrados automáticamente.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Vista Previa</CardTitle>
              <Badge variant="outline" className="gap-1">
                <UtensilsCrossed className="h-3 w-3" />
                Sushi Service
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-primary/20 bg-white p-6">
              <div className="text-center space-y-1">
                <h3 className="font-bold text-primary text-lg">Sushi Service</h3>
                <p className="text-xs text-muted-foreground">Escanea y registra tu visita</p>
              </div>

              {qrDataUrl ? (
                <div className="rounded-xl border p-2 shadow-sm">
                  <img src={qrDataUrl} alt="QR Code Sushi Service" width={300} height={300} className="rounded-lg" />
                </div>
              ) : (
                <div className="flex h-[300px] w-[300px] items-center justify-center rounded-xl bg-muted">
                  <QrCode className="h-16 w-16 text-muted-foreground/30" />
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Acumula visitas y gana premios exclusivos
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
