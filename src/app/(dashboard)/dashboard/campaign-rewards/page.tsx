'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Gift, Plus, Trash2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { CampaignReward } from '@/types/database.types'

/**
 * Catálogo de premios de campaña.
 *
 * Los premios que las campañas REGALAN (reactivación agresiva hoy; referidos, promos y
 * reseñas después). Es deliberadamente distinto de los premios de tier: esos SE GANAN con
 * puntos, y regalar uno gratis devaluaría el sistema de puntos.
 *
 * Ref: docs/features/reward-grants.md
 */
export default function CampaignRewardsPage() {
  const [rewards, setRewards] = useState<CampaignReward[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const fetchRewards = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/campaign-rewards')
      if (!res.ok) throw new Error()
      setRewards(await res.json())
    } catch {
      toast.error('No se pudo cargar el catálogo (¿falta correr la migración 00031?)')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRewards()
  }, [fetchRewards])

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
      if (!res.ok) throw new Error()
      setTitle('')
      setDescription('')
      toast.success('Premio creado')
      await fetchRewards()
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
      if (!res.ok) throw new Error()
      toast.success(reward.is_active ? 'Premio retirado' : 'Premio reactivado')
      await fetchRewards()
    } catch {
      toast.error('No se pudo actualizar el premio')
    }
  }

  const active = rewards.filter((r) => r.is_active)
  const inactive = rewards.filter((r) => !r.is_active)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Gift className="h-6 w-6" />
          Premios de campaña
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Los premios que tus campañas <span className="font-medium text-foreground">regalan</span> para
          que el cliente vuelva. Distintos de los premios por puntos, que el cliente se gana.
        </p>
      </div>

      {/* Crear */}
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
          ) : rewards.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Todavía no hay premios. Crea el primero para poder usarlo en la reactivación agresiva.
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
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Retirar un premio no afecta a los que ya están otorgados: los clientes que lo tienen lo
            siguen viendo y el mesero lo sigue pudiendo entregar.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
