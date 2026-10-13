'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { CampaignReward } from '@/types/database.types'

interface Props {
  rewards: CampaignReward[]
  loading: boolean
  /** La lectura del catálogo falló: se dice, en vez de mostrar «todavía no hay premios». */
  loadError: boolean
  /** Un administrador de sede VE el catálogo pero no lo cambia (la ruta responde 403). */
  soloLectura: boolean
  /** Avisa al panel que el catálogo cambió, para que lo vuelva a pedir (los selectores de arriba lo usan). */
  onChanged: () => void | Promise<void>
}

/**
 * Catálogo de premios para regalar.
 *
 * Los premios que las campañas REGALAN (reactivación, reseña, invitaciones, regalos del ciclo).
 * Es deliberadamente distinto de los premios de tier: esos SE GANAN con puntos, y regalar uno
 * gratis devaluaría el sistema de puntos.
 *
 * Vive en Recompensas › Premios para regalar desde 2026-10-13 (S-1; antes era una pestaña de
 * Campañas y, antes, la página `/dashboard/campaign-rewards`, hoy una redirección). La lectura la
 * hace `PremiosParaRegalarPanel`, que comparte el catálogo con los selectores de arriba.
 * Ref: docs/features/reward-grants.md
 */
export function CampaignRewardsCatalog({ rewards, loading, loadError, soloLectura, onChanged }: Props) {
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  /** El mensaje que dijo la ruta (el 403 explica quién puede), o el de siempre. */
  const mensajeDe = async (res: Response, porDefecto: string) => {
    const data = await res.json().catch(() => null)
    return typeof data?.error === 'string' ? data.error : porDefecto
  }

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Escribe el nombre del premio')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/dashboard/campaign-rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null }),
      })
      if (!res.ok) {
        toast.error(await mensajeDe(res, 'No se pudo crear el premio'))
        return
      }
      setTitle('')
      setDescription('')
      toast.success('Premio creado')
      await onChanged()
    } catch {
      toast.error('No se pudo crear el premio')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (reward: CampaignReward) => {
    try {
      const res = await fetch('/api/dashboard/campaign-rewards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reward.id, is_active: !reward.is_active }),
      })
      if (!res.ok) {
        toast.error(await mensajeDe(res, 'No se pudo actualizar el premio'))
        return
      }
      toast.success(reward.is_active ? 'Premio retirado' : 'Premio reactivado')
      await onChanged()
    } catch {
      toast.error('No se pudo actualizar el premio')
    }
  }

  const active = rewards.filter((r) => r.is_active)
  const inactive = rewards.filter((r) => !r.is_active)

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Los premios que las campañas <span className="font-medium text-foreground">regalan</span>,
        distintos de los premios por puntos, que el cliente se gana.
      </p>

      {/* Crear */}
      {soloLectura ? (
        <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
          Los premios son de la marca: los ves aquí, pero solo un super usuario puede crearlos o retirarlos.
        </p>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Nuevo premio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1 space-y-1">
                <Label htmlFor="title" className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Nombre del premio
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="1/2 sushi gratis"
                  className="h-9"
                />
              </div>
              <div className="min-w-[220px] flex-1 space-y-1">
                <Label
                  htmlFor="description"
                  className="text-[11px] uppercase tracking-wide text-muted-foreground"
                >
                  Nota para el mesero (opcional)
                </Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Cualquier roll de 5 piezas"
                  className="h-9"
                />
              </div>
              <Button onClick={handleCreate} disabled={saving} className="h-9 gap-1.5">
                <Plus className="h-4 w-4" />
                Crear
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              El nombre es lo que el cliente ve en su WhatsApp y en su tarjeta. Sé concreto: &ldquo;1/2
              sushi gratis&rdquo; funciona; &ldquo;descuento especial&rdquo; no.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Catálogo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Catálogo</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : loadError ? (
            <p className="py-8 text-center text-sm font-medium text-destructive">
              No se pudo leer el catálogo (¿falta correr la migración 00031?). Recarga la página; si sigue
              igual, avísanos: no significa que no tengas premios.
            </p>
          ) : rewards.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Todavía no hay premios.
              {soloLectura
                ? ' Un super usuario de la marca puede crear el primero.'
                : ' Crea el primero para poder usarlo como regalo de la reactivación, de la reseña o de una invitación.'}
            </p>
          ) : (
            <div className="space-y-2">
              {[...active, ...inactive].map((reward) => (
                <div
                  key={reward.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-3 ${
                    reward.is_active ? '' : 'opacity-55'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{reward.title}</p>
                      {!reward.is_active && (
                        <Badge variant="secondary" className="text-[10px]">
                          Retirado
                        </Badge>
                      )}
                    </div>
                    {reward.description && (
                      <p className="truncate text-xs text-muted-foreground">{reward.description}</p>
                    )}
                  </div>

                  {!soloLectura && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      onClick={() => handleToggle(reward)}
                    >
                      {reward.is_active ? (
                        <>
                          <Trash2 className="h-3.5 w-3.5" /> Retirar
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-3.5 w-3.5" /> Reactivar
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Retirar un premio no afecta a los que ya están otorgados: los clientes que lo tienen lo
            siguen viendo y el mesero lo sigue pudiendo entregar. Si estaba elegido arriba, deja de
            regalarse y el selector te pide escoger otro.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
