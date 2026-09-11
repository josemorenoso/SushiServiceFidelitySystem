'use client'

/**
 * El tablero diario de un Golden Bullet que está goteando.
 *
 * Existe porque un goteo de semanas sin tablero es un goteo a ciegas: hasta
 * ahora la única forma de saber qué salió ayer era contar filas a mano. Y
 * porque hacía falta un botón de parar — con una base grande, "me equivoqué"
 * tiene que poder resolverse en un clic, no en una consulta SQL.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Pause, Play, RefreshCw, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'

interface BatchProgress {
  batchId: string
  campaignId: string | null
  sourceFile: string
  sent: number
  sentToday: number
  queued: number
  bounced: number
  optedOut: number
  converted: number
  total: number
  paused: boolean
  nextBlockAt: string | null
  nextBlockSize: number
  estimatedEndAt: string | null
  blockSize: number | null
}

function fecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })
}

function esHoy(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const hoy = new Date()
  return d.toDateString() === hoy.toDateString() || d < hoy
}

export function ImportedContactsProgress({ refreshKey = 0 }: { refreshKey?: number }) {
  const [batches, setBatches] = useState<BatchProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [actuando, setActuando] = useState<string | null>(null)
  const [ritmo, setRitmo] = useState<Record<string, number>>({})

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/imported-contacts/progress')
      const data = await res.json()
      setBatches(data.batches ?? [])
    } catch {
      setBatches([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar, refreshKey])

  const actuar = async (b: BatchProgress, action: 'pause' | 'resume') => {
    if (!b.campaignId) return
    setActuando(b.batchId)
    try {
      const res = await fetch('/api/dashboard/imported-contacts/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: b.campaignId,
          action,
          block_size: action === 'resume' ? (ritmo[b.batchId] ?? b.blockSize ?? 100) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || data.error || 'No se pudo cambiar el estado')
        return
      }
      toast.success(
        action === 'pause'
          ? `Envío detenido. Quedan ${data.affected.toLocaleString('es-CO')} en espera.`
          : `Envío reanudado: ${data.affected.toLocaleString('es-CO')} reprogramados desde hoy.`
      )
      await cargar()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setActuando(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando envíos en curso...
      </div>
    )
  }

  if (batches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay ninguna base goteando ahora mismo. Cuando programés una, acá vas a ver cuántos mensajes
        salieron hoy y vas a poder detenerla.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {batches.map((b) => {
        const restante = b.total - b.sent - b.bounced - b.optedOut
        const avance = b.total > 0 ? Math.round((b.sent / b.total) * 100) : 0
        const ocupado = actuando === b.batchId

        return (
          <Card key={b.batchId} className={b.paused ? 'border-amber-300' : undefined}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{b.sourceFile}</CardTitle>
                {b.paused ? (
                  <Badge className="bg-amber-100 text-amber-900">Detenido</Badge>
                ) : (
                  <Badge className="bg-green-100 text-green-800">Goteando</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* La cifra que contesta "¿cuánto cupo me comí hoy?" */}
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-sm">
                  <strong className="text-lg">{b.sentToday.toLocaleString('es-CO')}</strong> mensajes de
                  esta base salieron <strong>hoy</strong>.
                </p>
                {!b.paused && b.nextBlockAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {esHoy(b.nextBlockAt)
                      ? `Quedan ${b.nextBlockSize.toLocaleString('es-CO')} por salir en el bloque de hoy.`
                      : `El próximo bloque (${b.nextBlockSize.toLocaleString('es-CO')}) sale el ${fecha(b.nextBlockAt)}.`}
                    {b.estimatedEndAt && ` Termina alrededor del ${fecha(b.estimatedEndAt)}.`}
                  </p>
                )}
                {b.paused && (
                  <p className="mt-1 text-xs text-amber-700">
                    Detenido. Los {b.queued.toLocaleString('es-CO')} que faltan no van a salir hasta que lo
                    reanudés. Lo que ya salió no se puede deshacer.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xl font-bold">{b.sent.toLocaleString('es-CO')}</p>
                  <p className="text-xs text-muted-foreground">Enviados ({avance}%)</p>
                </div>
                <div>
                  <p className="text-xl font-bold">{restante.toLocaleString('es-CO')}</p>
                  <p className="text-xs text-muted-foreground">Por salir</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-green-700">{b.converted.toLocaleString('es-CO')}</p>
                  <p className="text-xs text-muted-foreground">Se registraron</p>
                </div>
                <div>
                  <p className="text-xl font-bold">{b.optedOut.toLocaleString('es-CO')}</p>
                  <p className="text-xs text-muted-foreground">Dijeron que no</p>
                </div>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${avance}%` }} />
              </div>

              <div className="flex flex-wrap items-end gap-3">
                {b.paused ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor={`ritmo-${b.batchId}`} className="text-xs uppercase tracking-wide text-muted-foreground">
                        Reanudar a este ritmo
                      </Label>
                      <Input
                        id={`ritmo-${b.batchId}`}
                        type="number"
                        min={1}
                        className="w-32"
                        value={ritmo[b.batchId] ?? b.blockSize ?? 100}
                        onChange={(e) => setRitmo((r) => ({ ...r, [b.batchId]: Number(e.target.value) }))}
                      />
                    </div>
                    <Button onClick={() => actuar(b, 'resume')} disabled={ocupado} className="gap-2">
                      {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Reanudar
                    </Button>
                  </>
                ) : (
                  <Button variant="destructive" onClick={() => actuar(b, 'pause')} disabled={ocupado} className="gap-2">
                    {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                    Detener envío
                  </Button>
                )}
                <Button variant="outline" onClick={() => void cargar()} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Actualizar
                </Button>
              </div>

              {b.paused && (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Al reanudar se reprograma <strong className="mx-1">desde hoy</strong> al ritmo que elijas —
                  no se recuperan las fechas viejas, porque ya pasaron y todo saldría de golpe el mismo día.
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
