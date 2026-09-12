'use client'

/**
 * Las bases de Golden Bullet, una tarjeta por CSV cargado.
 *
 * Existe porque un goteo de semanas sin tablero es un goteo a ciegas: hasta
 * el 2026-09-10 la única forma de saber qué salió ayer era contar filas a
 * mano, y hacía falta un botón de parar.
 *
 * Desde el 2026-09-12 contesta además lo que el dueño pidió después de su
 * primera campaña: la base ENTERA se ve mientras exista —terminada también,
 * con sus registrados y sus rechazos, que antes desaparecían con la cola—, y
 * dice cuántos quedan por programar. La siguiente tanda se programa desde
 * acá, sin resubir el CSV: los que esperan ya están guardados y los que ya
 * salieron no pueden volver a entrar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Pause, Play, RefreshCw, CalendarClock, Send, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { plantillaCompatible, plantillaUsaPromo } from './ImportedContactsUploader'

interface BaseProgress {
  batchId: string
  campaignId: string | null
  activeCampaignIds: string[]
  sourceFile: string
  createdAt: string
  total: number
  pending: number
  programmed: number
  batches: number
  sent: number
  sentToday: number
  delivered: number
  queued: number
  bounced: number
  optedOut: number
  converted: number
  paused: boolean
  nextBlockAt: string | null
  nextBlockSize: number
  estimatedEndAt: string | null
  blockSize: number | null
  lastBatch: { templateSid: string | null; promoText: string; fallbackName: string | null; size: number } | null
  finished: boolean
}

interface TemplateItem {
  sid: string
  name: string
  status: string
  category: string
  body: string
}

interface LineBudgetInfo {
  enforced?: boolean
  campaignBudget?: number | null
}

const n = (x: number) => x.toLocaleString('es-CO')

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

function estadoDe(b: BaseProgress): { texto: string; clase: string } {
  if (b.paused) return { texto: 'Detenida', clase: 'bg-amber-100 text-amber-900' }
  if (b.queued > 0) return { texto: 'Goteando', clase: 'bg-green-100 text-green-800' }
  if (b.pending > 0) return { texto: 'Con contactos por programar', clase: 'bg-blue-100 text-blue-900' }
  return { texto: 'Terminada', clase: 'bg-muted text-muted-foreground' }
}

export function ImportedContactsProgress({ refreshKey = 0 }: { refreshKey?: number }) {
  const [bases, setBases] = useState<BaseProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [actuando, setActuando] = useState<string | null>(null)
  const [ritmo, setRitmo] = useState<Record<string, number>>({})
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [budget, setBudget] = useState<LineBudgetInfo | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/imported-contacts/progress')
      const data = await res.json()
      setBases(data.batches ?? [])
    } catch {
      setBases([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar, refreshKey])

  useEffect(() => {
    // Las mismas plantillas y el mismo cupo que usa «Nueva campaña»: la tanda
    // siguiente sale por la misma línea y con las mismas reglas.
    fetch('/api/dashboard/templates?provider=golden_bullet')
      .then((r) => r.json())
      .then((d) =>
        setTemplates(
          (d.templates ?? []).filter(
            (t: TemplateItem) => (t.category ?? '').toUpperCase() === 'MARKETING' && t.status === 'approved' && plantillaCompatible(t.body)
          )
        )
      )
      .catch(() => setTemplates([]))
    fetch('/api/dashboard/line-budget')
      .then((r) => r.json())
      .then(setBudget)
      .catch(() => setBudget(null))
  }, [])

  const cupo = budget?.enforced ? (budget.campaignBudget ?? null) : null

  const actuar = async (b: BaseProgress, action: 'pause' | 'resume') => {
    if (b.activeCampaignIds.length === 0) return
    setActuando(b.batchId)
    try {
      // Una base puede tener más de una tanda goteando a la vez (cada una es
      // una campaña): parar la base es parar todas.
      let afectados = 0
      for (const campaignId of b.activeCampaignIds) {
        const res = await fetch('/api/dashboard/imported-contacts/pause', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_id: campaignId,
            action,
            block_size: action === 'resume' ? (ritmo[b.batchId] ?? b.blockSize ?? 100) : undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.message || data.error || 'No se pudo cambiar el estado')
          return
        }
        afectados += Number(data.affected ?? 0)
      }
      toast.success(
        action === 'pause'
          ? `Envío detenido. Quedan ${n(afectados)} en espera.`
          : `Envío reanudado: ${n(afectados)} reprogramados desde hoy.`
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
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando bases...
      </div>
    )
  }

  if (bases.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no cargaste ninguna base. Cuando programés una desde «Nueva campaña», acá vas a ver
        cuántos mensajes salieron, quién se registró, quién dijo que no, y cuántos te quedan por programar.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {bases.map((b) => {
        const avance = b.programmed > 0 ? Math.round((b.sent / b.programmed) * 100) : 0
        const ocupado = actuando === b.batchId
        const estado = estadoDe(b)

        return (
          <Card key={b.batchId} className={b.paused ? 'border-amber-300' : undefined}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{b.sourceFile}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Cargada el {fecha(b.createdAt)} · {b.batches === 1 ? '1 tanda' : `${b.batches} tandas`}
                  </p>
                </div>
                <Badge className={estado.clase}>{estado.texto}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* La base: cuántos hay, cuántos ya entraron en una tanda, cuántos esperan. */}
              <div className="grid grid-cols-3 gap-x-6 gap-y-2 rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="text-xl font-bold">{n(b.total)}</p>
                  <p className="text-xs text-muted-foreground">En la base</p>
                </div>
                <div>
                  <p className="text-xl font-bold">{n(b.programmed)}</p>
                  <p className="text-xs text-muted-foreground">Programados</p>
                </div>
                <div>
                  <p className={`text-xl font-bold ${b.pending > 0 ? 'text-blue-800' : ''}`}>{n(b.pending)}</p>
                  <p className="text-xs text-muted-foreground">Sin programar</p>
                </div>
              </div>

              {/* La cifra que contesta "¿cuánto cupo me comí hoy?" — solo mientras gotea. */}
              {b.queued > 0 && (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-sm">
                    <strong className="text-lg">{n(b.sentToday)}</strong> mensajes de esta base salieron{' '}
                    <strong>hoy</strong>.
                  </p>
                  {!b.paused && b.nextBlockAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {esHoy(b.nextBlockAt)
                        ? `Quedan ${n(b.nextBlockSize)} por salir en el bloque de hoy.`
                        : `El próximo bloque (${n(b.nextBlockSize)}) sale el ${fecha(b.nextBlockAt)}.`}
                      {b.estimatedEndAt && ` Termina alrededor del ${fecha(b.estimatedEndAt)}.`}
                    </p>
                  )}
                  {b.paused && (
                    <p className="mt-1 text-xs text-amber-700">
                      Detenida. Los {n(b.queued)} que faltan no van a salir hasta que la reanudés. Lo que ya salió
                      no se puede deshacer.
                    </p>
                  )}
                </div>
              )}

              {/* El resultado de lo programado. Se queda aunque la base termine. */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <p className="text-xl font-bold">{n(b.sent)}</p>
                  <p className="text-xs text-muted-foreground">Enviados ({avance}%)</p>
                </div>
                <div>
                  <p className="text-xl font-bold">{n(b.queued)}</p>
                  <p className="text-xs text-muted-foreground">Por salir</p>
                </div>
                <div>
                  <p className="text-xl font-bold">{n(b.delivered)}</p>
                  <p className="text-xs text-muted-foreground">Entregados</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-green-700">{n(b.converted)}</p>
                  <p className="text-xs text-muted-foreground">Se registraron</p>
                </div>
                <div>
                  <p className="text-xl font-bold">{n(b.optedOut)}</p>
                  <p className="text-xs text-muted-foreground">Dijeron que no</p>
                </div>
                <div>
                  <p className="text-xl font-bold">{n(b.bounced)}</p>
                  <p className="text-xs text-muted-foreground">Rebotados</p>
                </div>
              </div>
              {b.delivered === 0 && b.sent > 0 && (
                <p className="text-xs text-muted-foreground">
                  «Entregados» solo lo reporta la línea de Zernio; por Twilio queda en 0 aunque los mensajes hayan llegado.
                </p>
              )}

              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${avance}%` }} />
              </div>

              <div className="flex flex-wrap items-end gap-3">
                {b.queued > 0 &&
                  (b.paused ? (
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
                  ))}
                {b.pending > 0 && (
                  <Button
                    variant={abierta === b.batchId ? 'outline' : 'default'}
                    onClick={() => setAbierta(abierta === b.batchId ? null : b.batchId)}
                    className="gap-2"
                  >
                    <Layers className="h-4 w-4" />
                    {abierta === b.batchId ? 'Cerrar' : `Programar otra tanda (${n(b.pending)} esperan)`}
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

              {abierta === b.batchId && b.pending > 0 && (
                <SiguienteTanda
                  base={b}
                  templates={templates}
                  cupo={cupo}
                  onProgramada={async () => {
                    setAbierta(null)
                    await cargar()
                  }}
                />
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

/**
 * El formulario de «otra tanda»: dos números y, si la anterior no dejó
 * guardada la plantilla, elegirla. Todo lo demás se hereda de la tanda
 * anterior en el servidor.
 */
function SiguienteTanda({
  base,
  templates,
  cupo,
  onProgramada,
}: {
  base: BaseProgress
  templates: TemplateItem[]
  cupo: number | null
  onProgramada: () => Promise<void>
}) {
  const heredada = base.lastBatch?.templateSid ?? null
  const [cuantos, setCuantos] = useState<number>(Math.min(base.pending, base.lastBatch?.size || base.pending))
  const [porDia, setPorDia] = useState<number>(base.blockSize ?? (cupo ? Math.max(1, Math.floor(cupo / 2)) : 100))
  const [templateSid, setTemplateSid] = useState<string>(heredada ?? '')
  const [promoText, setPromoText] = useState<string>(base.lastBatch?.promoText ?? '')
  const [enviando, setEnviando] = useState(false)

  const enTanda = Math.max(0, Math.min(Math.floor(cuantos || 0), base.pending))
  const elegida = templates.find((t) => t.sid === templateSid) ?? null
  const plantillaHeredadaYNoListada = !!heredada && templateSid === heredada && !elegida
  const pidePromo = elegida ? plantillaUsaPromo(elegida.body) : !!(base.lastBatch?.promoText)
  const promoLista = !pidePromo || promoText.trim().length > 0

  const proyeccion = useMemo(() => {
    if (!porDia || porDia < 1 || enTanda === 0) return null
    const efectivo = cupo !== null ? Math.min(porDia, cupo) : porDia
    const dias = Math.ceil(enTanda / efectivo)
    const fin = new Date()
    fin.setDate(fin.getDate() + Math.max(0, dias - 1))
    return { efectivo, dias, fin: fin.toISOString() }
  }, [porDia, cupo, enTanda])

  const programar = async () => {
    if (enTanda < 1 || !porDia || porDia < 1 || !templateSid || !promoLista) return
    setEnviando(true)
    try {
      const res = await fetch('/api/dashboard/imported-contacts/continue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_id: base.batchId,
          max_contacts: enTanda,
          block_size: porDia,
          template_sid: templateSid,
          promo_text: pidePromo ? promoText.trim() : '',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || data.error || 'No se pudo programar la tanda')
        return
      }
      toast.success(
        `${n(data.queued)} programados: ${n(data.plan?.blockSize ?? porDia)} por día durante ${data.plan?.days ?? '?'} ${
          data.plan?.days === 1 ? 'día' : 'días'
        }.`
      )
      await onProgramada()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
      <p className="text-sm">
        <strong>{n(base.pending)}</strong> contactos de esta base esperan sin programar. Elegí cuántos entran ahora
        y cuántos salen por día: los que ya recibieron el mensaje no pueden volver a entrar.
      </p>

      <div className="flex flex-wrap gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={`cuantos-${base.batchId}`} className="text-xs uppercase tracking-wide text-muted-foreground">
            Cuántos en esta tanda
          </Label>
          <Input
            id={`cuantos-${base.batchId}`}
            type="number"
            min={1}
            max={base.pending}
            value={cuantos}
            onChange={(e) => setCuantos(Number(e.target.value))}
            className="w-36"
          />
          <p className="text-xs text-muted-foreground">De los {n(base.pending)} que esperan. Quedan {n(base.pending - enTanda)} para después.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`pordia-${base.batchId}`} className="text-xs uppercase tracking-wide text-muted-foreground">
            Mensajes por día
          </Label>
          <Input
            id={`pordia-${base.batchId}`}
            type="number"
            min={1}
            value={porDia}
            onChange={(e) => setPorDia(Number(e.target.value))}
            className="w-36"
          />
          <p className="text-xs text-muted-foreground">
            {cupo !== null ? `El cupo de campaña de hoy es ${n(cupo)}: si pedís más, se recorta.` : 'Sin límite conocido de Meta: este número es el único freno.'}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Plantilla</Label>
        {plantillaHeredadaYNoListada && (
          <p className="text-xs text-muted-foreground">
            Sale con la misma plantilla de la tanda anterior. Si querés otra, elegila abajo.
          </p>
        )}
        {templates.length === 0 && !heredada ? (
          <p className="text-xs text-amber-700">No hay ninguna plantilla MARKETING aprobada que sirva para Golden Bullet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button
                key={t.sid}
                type="button"
                onClick={() => setTemplateSid(t.sid)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  templateSid === t.sid ? 'bg-foreground text-background border-foreground' : 'border-border bg-background hover:bg-muted'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
        {!templateSid && (
          <p className="text-xs text-amber-700">
            La tanda anterior no dejó guardada su plantilla (es de antes del 12 de septiembre): elegí una.
          </p>
        )}
      </div>

      {pidePromo && (
        <div className="space-y-1.5">
          <Label htmlFor={`promo-${base.batchId}`} className="text-xs uppercase tracking-wide text-muted-foreground">
            Texto de la promo ({'{{2}}'})
          </Label>
          <Input id={`promo-${base.batchId}`} value={promoText} onChange={(e) => setPromoText(e.target.value)} placeholder="Ej: un postre gratis en tu próxima visita" />
        </div>
      )}

      {proyeccion && (
        <p className="text-sm">
          <strong>{n(enTanda)}</strong> contactos · <strong>{n(proyeccion.efectivo)}</strong> por día ·{' '}
          <strong>{proyeccion.dias} {proyeccion.dias === 1 ? 'día' : 'días'}</strong>: el último bloque sale el{' '}
          <strong>{fecha(proyeccion.fin)}</strong>. La billetera cobra la tanda entera al confirmar.
        </p>
      )}

      <Button onClick={programar} disabled={enviando || enTanda < 1 || !templateSid || !promoLista || !porDia} className="gap-2">
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Programar {n(enTanda)}
      </Button>
    </div>
  )
}
