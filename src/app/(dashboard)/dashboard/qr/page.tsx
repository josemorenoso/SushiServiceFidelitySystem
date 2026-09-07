'use client'

/**
 * QR Studio — el QR imprimible de cada sede.
 *
 * QUÉ CAMBIÓ, Y POR QUÉ ES MENOS QUE ANTES
 * ────────────────────────────────────────
 * Esta pantalla armaba PÓSTERS: 8 temas, 5 tamaños, titular, subtítulo, color de
 * acento y un QR distinto por cada mesa, todo dibujado en un `<canvas>` y bajado
 * como PNG a 300 DPI. Eran 583 líneas para algo que nadie mandaba a imprenta:
 * *"la gente no va a imprimir con los diseños, es muy básico"* (dueño, 2026-09-06).
 *
 * Ahora hace UNA cosa: elegís una sede y bajás su QR en SVG. Un vector no tiene
 * resolución, así que el mismo archivo sirve para un sticker de 5 cm y para una
 * pancarta de 3 m — el diseño lo arma quien sepa, con el QR adentro.
 *
 * Las decisiones están en `docs/DECISIONES-QR-Y-SEDE-2026-09-06.md`:
 *
 *   · **D-QR-1 — un QR por SEDE.** La sede se resuelve del HOST, nunca de un
 *     parámetro: no existe ni va a existir `?sede=`. Por eso el QR de una sede
 *     es su subdominio (`laureles.marca.com/check-in`) y una sede sin subdominio
 *     no puede tener QR todavía.
 *   · **D-QR-3 — los diseños se OCULTAN, no se borran.** `src/lib/utils/qr-poster.ts`
 *     sigue en el repo intacto y las rutas `qr_studio.*` siguen en la whitelist de
 *     `src/lib/tenant-config-paths.ts`: la config que ya guardaron los tenants no se
 *     toca. Es una pausa, y volver a encenderla es revertir este commit.
 *   · **D-QR-4 — la mesa la elige el MESERO.** El campo vive en `/mesero/confirm`
 *     y sigue llenando `visits.table_number`. Por eso sacar el QR por mesa de acá
 *     no deja ningún hueco en el dato.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  QrCode, Download, Copy, Check, ExternalLink, Loader2, AlertTriangle, Building2, FileImage,
} from 'lucide-react'
import { useBranding } from '@/lib/branding-context'
import {
  buildQrSvg, buildQrPngDataUrl, checkInUrlForDomain, PNG_SIDE_PX, type QrLocation,
} from '@/lib/utils/qr-svg'

/** Dispara la descarga de un archivo ya construido en memoria. */
function download(href: string, filename: string) {
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
}

/** `Sede Laureles` → `sede-laureles`. Para que el archivo se llame como la sede. */
function toFileSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function QrPage() {
  const branding = useBranding()

  const [locations, setLocations] = useState<QrLocation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [svg, setSvg] = useState<string | null>(null)
  const [pngLoading, setPngLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/dashboard/qr-locations')
        if (!res.ok) throw new Error('No se pudieron leer las sedes')
        const data = (await res.json()) as QrLocation[]
        if (cancelled) return
        setLocations(data)
        // La primera con subdominio: es la única que puede imprimirse hoy, y
        // arrancar en una que no se puede sería ofrecer un botón muerto.
        setSelectedId((data.find((l) => l.domain) ?? data[0])?.id ?? null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error cargando las sedes')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const selected = useMemo(
    () => locations.find((l) => l.id === selectedId) ?? null,
    [locations, selectedId]
  )
  const checkInUrl = checkInUrlForDomain(selected?.domain)

  useEffect(() => {
    let cancelled = false
    if (!checkInUrl) { setSvg(null); return }
    buildQrSvg(checkInUrl)
      .then((out) => { if (!cancelled) setSvg(out) })
      .catch((err) => {
        console.error('Error generando el QR:', err)
        if (!cancelled) setSvg(null)
      })
    return () => { cancelled = true }
  }, [checkInUrl])

  /** El SVG como `data:` para la vista previa. Evita inyectar markup en el DOM. */
  const svgPreview = useMemo(
    () => (svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null),
    [svg]
  )

  const fileBase = useMemo(() => {
    const marca = toFileSlug(branding.short || branding.name || 'qr')
    const sede = selected ? toFileSlug(selected.slug || selected.name) : 'sede'
    return `${marca}-${sede}-qr`
  }, [branding.short, branding.name, selected])

  const handleDownloadSvg = useCallback(() => {
    if (!svg) return
    // Blob y no `data:`: un `data:` largo lo truncan algunos navegadores al descargar.
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    download(url, `${fileBase}.svg`)
    // Sin esto el blob queda retenido toda la sesión. El timeout es porque
    // revocar en el mismo tick cancela la descarga en Safari.
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }, [svg, fileBase])

  const handleDownloadPng = useCallback(async () => {
    if (!checkInUrl) return
    setPngLoading(true)
    try {
      download(await buildQrPngDataUrl(checkInUrl), `${fileBase}.png`)
    } catch (err) {
      console.error('Error generando el PNG:', err)
      setError('No se pudo generar el PNG. El SVG sigue disponible.')
    } finally {
      setPngLoading(false)
    }
  }, [checkInUrl, fileBase])

  const handleCopyUrl = useCallback(async () => {
    if (!checkInUrl) return
    await navigator.clipboard.writeText(checkInUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [checkInUrl])

  const sinSubdominio = locations.filter((l) => !l.domain)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <QrCode className="h-6 w-6" />
          QR Studio
        </h1>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sede</CardTitle>
            <CardDescription>
              Cada sede tiene su propio QR: es la única señal que dice dónde está el cliente
              cuando se registra por primera vez, porque todavía no tiene tarjeta que el mesero
              pueda escanear. La mesa ya no va en el QR — la elige el mesero desde su celular
              al escanear.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando sedes…
              </div>
            ) : locations.length === 0 ? (
              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                Esta marca todavía no tiene ninguna sede activa, así que no hay QR que imprimir.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> Selecciona la sede
                  </Label>
                  <div className="grid gap-2">
                    {locations.map((l) => {
                      const activa = Boolean(l.domain)
                      const elegida = l.id === selectedId
                      return (
                        <button
                          key={l.id}
                          onClick={() => activa && setSelectedId(l.id)}
                          disabled={!activa}
                          className={`flex min-h-11 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-all ${
                            elegida && activa
                              ? 'border-primary ring-2 ring-primary/30'
                              : 'border-input hover:bg-accent'
                          } ${activa ? '' : 'cursor-not-allowed opacity-60 hover:bg-transparent'}`}
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            {l.name}
                            {l.is_primary && <Badge variant="outline" className="text-[10px]">Principal</Badge>}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {l.domain ?? 'sin subdominio todavía'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {sinSubdominio.length > 0 && (
                  /* No es un detalle cosmético: con 2+ sedes activas el dominio RAÍZ deja de
                     registrar clientes nuevos (responde 409 pidiendo elegir sede). Un QR
                     impreso para una sede sin subdominio sería un cartel que no registra a
                     nadie, y eso no se descubre hasta que ya está pegado en la pared. */
                  <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      {sinSubdominio.length === 1
                        ? <>La sede <strong>{sinSubdominio[0].name}</strong> todavía no tiene subdominio</>
                        : <><strong>{sinSubdominio.length} sedes</strong> todavía no tienen subdominio</>}
                      {' '}y por eso no se les puede imprimir el QR. Cada sede necesita el suyo
                      (<span className="font-mono">laureles.tumarca.com</span>): es lo único que le
                      dice al sistema en qué sede se registró el cliente.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>URL del check-in</Label>
                  <div className="flex gap-2">
                    <Input
                      value={checkInUrl ?? ''}
                      readOnly
                      placeholder="La sede necesita un subdominio"
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-11 w-11"
                      onClick={handleCopyUrl}
                      disabled={!checkInUrl}
                      aria-label="Copiar la URL del check-in"
                    >
                      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleDownloadSvg} disabled={!svg} className="min-h-11 flex-1 gap-2">
                    <Download className="h-4 w-4" />
                    Descargar SVG
                  </Button>
                  <Button
                    onClick={handleDownloadPng}
                    disabled={!checkInUrl || pngLoading}
                    variant="outline"
                    className="min-h-11 gap-2"
                  >
                    {pngLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
                    PNG
                  </Button>
                  {checkInUrl && (
                    <a
                      href={checkInUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Probar
                    </a>
                  )}
                </div>

                <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                  <p>
                    <strong>El SVG es vectorial:</strong> se agranda a cualquier medida sin perder
                    nitidez. Es el archivo que se le pasa al diseñador o a la imprenta.
                  </p>
                  <p>
                    El PNG ({PNG_SIDE_PX}×{PNG_SIDE_PX} px) es el respaldo para donde no acepten
                    vectores.
                  </p>
                  <p>
                    Sale <strong>negro sobre blanco</strong> a propósito: es lo que mejor escanea
                    impreso. El color de la marca va en el diseño alrededor del QR, no en el QR.
                  </p>
                  <p>
                    Lleva corrección de errores alta, así que admite un logo encima del centro
                    (hasta ~25% del área) sin dejar de escanear.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Vista previa</CardTitle>
              {selected && (
                <Badge variant="outline" className="gap-1">{selected.name}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-primary/20 bg-white p-4">
              {svgPreview ? (
                <div className="rounded-xl border bg-white p-3 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={svgPreview}
                    alt={`QR de check-in${selected ? ` de ${selected.name}` : ''}`}
                    className="h-auto w-full max-w-[360px]"
                  />
                </div>
              ) : (
                <div className="flex h-[340px] w-full max-w-[360px] items-center justify-center rounded-xl bg-muted">
                  <QrCode className="h-16 w-16 text-muted-foreground/30" />
                </div>
              )}
              <p className="text-center text-xs text-muted-foreground">
                {checkInUrl
                  ? 'Esto es exactamente lo que se descarga. Escanealo con el celular para comprobarlo antes de mandarlo a imprenta.'
                  : 'Elegí una sede con subdominio para ver su QR.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
