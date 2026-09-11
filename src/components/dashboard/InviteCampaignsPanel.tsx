'use client'

/**
 * Invitaciones con premio — la pestaña dentro de Recompensas.
 *
 * Doc: docs/features/invite-campaigns.md
 *
 * El dueño crea "2x1 en sushi", le queda un enlace y su QR, lo manda por WhatsApp
 * o lo pone en redes. Acá ve cuántos se registraron, cuántos VINIERON (el mesero
 * les entregó) y cuántos dejaron vencer el premio.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Copy, Download, Link2, Loader2, Pause, Play, Crosshair, Check } from 'lucide-react'
import { toast } from 'sonner'

interface Stats { granted: number; redeemed: number; pending: number; expired: number }
interface Campaign {
  id: string
  slug: string
  name: string
  reward_title: string
  reward_description: string | null
  window_days: number | null
  starts_at: string | null
  ends_at: string | null
  max_grants: number | null
  is_active: boolean
  created_at: string
  stats: Stats
}

function slugPreview(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** El QR de una invitación, con descarga en SVG (vector: sirve para imprimir). */
function InviteQr({ url, nombre }: { url: string; nombre: string }) {
  const ref = useRef<HTMLDivElement>(null)

  const descargar = () => {
    const svg = ref.current?.querySelector('svg')
    if (!svg) return
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `invitacion-${nombre}.svg`
    a.click()
    URL.revokeObjectURL(href)
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={ref} className="rounded-lg border border-border bg-white p-2">
        <QRCodeSVG value={url} size={112} level="M" />
      </div>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={descargar}>
        <Download className="h-3.5 w-3.5" /> QR
      </Button>
    </div>
  )
}

export function InviteCampaignsPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [publicBase, setPublicBase] = useState('')
  const [goldenSlug, setGoldenSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [creando, setCreando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)

  // Formulario
  const [name, setName] = useState('')
  const [rewardTitle, setRewardTitle] = useState('')
  const [rewardDesc, setRewardDesc] = useState('')
  const [windowDays, setWindowDays] = useState<string>('30')
  const [maxGrants, setMaxGrants] = useState<string>('')
  const [endsAt, setEndsAt] = useState<string>('')

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/qr-campaigns')
      const data = await res.json()
      setCampaigns(data.campaigns ?? [])
      setPublicBase(data.public_base ?? window.location.origin)
      setGoldenSlug(data.golden_bullet_invite_slug ?? null)
    } catch {
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const crear = async () => {
    if (!name.trim() || !rewardTitle.trim()) return
    setGuardando(true)
    try {
      const res = await fetch('/api/dashboard/qr-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          reward_title: rewardTitle.trim(),
          reward_description: rewardDesc.trim() || null,
          window_days: windowDays.trim() === '' ? null : Number(windowDays),
          max_grants: maxGrants.trim() === '' ? null : Number(maxGrants),
          ends_at: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'No se pudo crear')
        return
      }
      toast.success('Invitación creada. Copiá el enlace o descargá el QR.')
      setCreando(false)
      setName(''); setRewardTitle(''); setRewardDesc(''); setWindowDays('30'); setMaxGrants(''); setEndsAt('')
      await cargar()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setGuardando(false)
    }
  }

  const alternar = async (c: Campaign) => {
    setOcupado(c.id)
    try {
      const res = await fetch('/api/dashboard/qr-campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, is_active: !c.is_active }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'No se pudo cambiar')
        return
      }
      await cargar()
    } finally {
      setOcupado(null)
    }
  }

  const usarParaGoldenBullet = async (c: Campaign) => {
    setOcupado(c.id)
    try {
      const nuevo = goldenSlug === c.slug ? '' : c.slug
      const res = await fetch('/api/dashboard/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'golden_bullet_invite_slug', value: nuevo }),
      })
      if (!res.ok) {
        toast.error('No se pudo guardar')
        return
      }
      setGoldenSlug(nuevo || null)
      toast.success(
        nuevo
          ? `«${c.name}» es lo que recibe quien toca «Quiero ser parte» en Golden Bullet.`
          : 'Golden Bullet vuelve a mandar el enlace general de la tarjeta.'
      )
    } finally {
      setOcupado(null)
    }
  }

  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Un enlace o QR que regala algo a quien se registre por él. Mandalo por WhatsApp o ponelo en
          redes: el premio le queda en la tarjeta y <strong>solo se entrega cuando el mesero lo escanea
          en el local</strong>. Quien llega por acá no suma la visita #1 hasta que viene.
        </p>
        <Button onClick={() => setCreando((v) => !v)} className="gap-2">
          <Plus className="h-4 w-4" /> Nueva invitación
        </Button>
      </div>

      {creando && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Nueva invitación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-name" className="text-xs uppercase tracking-wide text-muted-foreground">Nombre (para vos)</Label>
                <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Promo apertura" />
                {name.trim() && (
                  <p className="text-xs text-muted-foreground">
                    Enlace: <code>{publicBase}/c/{slugPreview(name)}</code>
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-reward" className="text-xs uppercase tracking-wide text-muted-foreground">Qué se regala</Label>
                <Input id="inv-reward" value={rewardTitle} onChange={(e) => setRewardTitle(e.target.value)} placeholder="2x1 en sushi rolls" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-desc" className="text-xs uppercase tracking-wide text-muted-foreground">Detalle (opcional)</Label>
              <Input id="inv-desc" value={rewardDesc} onChange={(e) => setRewardDesc(e.target.value)} placeholder="Válido de lunes a jueves" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-days" className="text-xs uppercase tracking-wide text-muted-foreground">Días para reclamarlo</Label>
                <Input id="inv-days" type="number" min={0} value={windowDays} onChange={(e) => setWindowDays(e.target.value)} placeholder="Vacío = no vence" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-max" className="text-xs uppercase tracking-wide text-muted-foreground">Cupo de premios</Label>
                <Input id="inv-max" type="number" min={1} value={maxGrants} onChange={(e) => setMaxGrants(e.target.value)} placeholder="Vacío = sin cupo" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-ends" className="text-xs uppercase tracking-wide text-muted-foreground">Se puede pedir hasta</Label>
                <Input id="inv-ends" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={crear} disabled={guardando || !name.trim() || !rewardTitle.trim()} className="gap-2">
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Crear
              </Button>
              <Button variant="ghost" onClick={() => setCreando(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay invitaciones. Creá la primera.</p>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => {
            const url = `${publicBase}/c/${c.slug}`
            const esGolden = goldenSlug === c.slug
            const vinieron = c.stats.granted > 0 ? Math.round((c.stats.redeemed / c.stats.granted) * 100) : 0
            return (
              <Card key={c.id} className={!c.is_active ? 'opacity-70' : undefined}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <div className="flex flex-wrap gap-1.5">
                      {esGolden && <Badge className="bg-amber-100 text-amber-900 gap-1"><Crosshair className="h-3 w-3" /> Golden Bullet</Badge>}
                      {c.is_active
                        ? <Badge className="bg-green-100 text-green-800">Activa</Badge>
                        : <Badge variant="secondary">Pausada</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <InviteQr url={url} nombre={c.slug} />
                    <div className="flex-1 space-y-3">
                      <div>
                        <p className="text-sm">
                          Regala <strong>{c.reward_title}</strong>
                          {c.reward_description && <span className="text-muted-foreground"> — {c.reward_description}</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {c.window_days !== null ? `${c.window_days} días para reclamarlo` : 'No vence'}
                          {c.max_grants !== null && ` · cupo ${c.max_grants}`}
                          {c.ends_at && ` · hasta el ${new Date(c.ends_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <code className="flex-1 truncate text-xs">{url}</code>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => copiar(url)}>
                          <Copy className="h-3.5 w-3.5" /> Copiar
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                        <div><p className="text-lg font-bold">{c.stats.granted}</p><p className="text-xs text-muted-foreground">Se registraron</p></div>
                        <div><p className="text-lg font-bold text-green-700">{c.stats.redeemed}</p><p className="text-xs text-muted-foreground">Vinieron ({vinieron}%)</p></div>
                        <div><p className="text-lg font-bold">{c.stats.pending}</p><p className="text-xs text-muted-foreground">Pendientes</p></div>
                        <div><p className="text-lg font-bold text-muted-foreground">{c.stats.expired}</p><p className="text-xs text-muted-foreground">Vencidos</p></div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" disabled={ocupado === c.id} onClick={() => alternar(c)}>
                      {c.is_active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      {c.is_active ? 'Pausar' : 'Reactivar'}
                    </Button>
                    <Button
                      variant={esGolden ? 'secondary' : 'outline'}
                      size="sm"
                      className="gap-1.5"
                      disabled={ocupado === c.id || !c.is_active}
                      onClick={() => usarParaGoldenBullet(c)}
                      title="Quien toque «Quiero ser parte» en la plantilla de Golden Bullet recibe este enlace"
                    >
                      <Crosshair className="h-3.5 w-3.5" />
                      {esGolden ? 'Es el regalo de Golden Bullet' : 'Usar en Golden Bullet'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
