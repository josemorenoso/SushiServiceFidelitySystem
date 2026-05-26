'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Gift,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Sparkles,
  AlertTriangle,
  Crown,
  Pencil,
  Dices,
  X,
} from 'lucide-react'
import type { RewardTier, MysteryPrize } from '@/types/database.types'

// ═══════════════════════════════════════════════════════════════
// Tier emojis
// ═══════════════════════════════════════════════════════════════
const TIER_EMOJIS: Record<string, string> = {
  'Bronce': '🥉',
  'Plata': '🥈',
  'Oro': '🥇',
  'BLACK': '🖤',
}

function tierEmoji(name: string): string {
  return TIER_EMOJIS[name] ?? '🎯'
}

// ═══════════════════════════════════════════════════════════════
// Empty prize row factory
// ═══════════════════════════════════════════════════════════════
function emptyPrize(): MysteryPrize {
  return { title: '', probability: 0, emoji: '🎁' }
}

// ═══════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════
export default function RewardsPage() {
  const [tiers, setTiers] = useState<RewardTier[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTier, setEditingTier] = useState<RewardTier | null>(null)

  // Form fields
  const [formName, setFormName] = useState('')
  const [formThreshold, setFormThreshold] = useState('')
  const [formSafeReward, setFormSafeReward] = useState('')
  const [formIsBlack, setFormIsBlack] = useState(false)
  const [formMysteryEnabled, setFormMysteryEnabled] = useState(true)
  const [formPrizes, setFormPrizes] = useState<MysteryPrize[]>([
    { title: '', probability: 70, emoji: '☕' },
    { title: '', probability: 25, emoji: '🍰' },
    { title: '', probability: 5, emoji: '🍽️' },
  ])

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Fetch ──
  const fetchTiers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/reward-tiers')
      const data = await res.json()
      setTiers(Array.isArray(data) ? data : [])
    } catch {
      setTiers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTiers()
  }, [fetchTiers])

  // ── Open dialog (create or edit) ──
  const openCreate = () => {
    setEditingTier(null)
    setFormName('')
    setFormThreshold('')
    setFormSafeReward('')
    setFormIsBlack(false)
    setFormMysteryEnabled(true)
    setFormPrizes([
      { title: '', probability: 70, emoji: '☕' },
      { title: '', probability: 25, emoji: '🍰' },
      { title: '', probability: 5, emoji: '🍽️' },
    ])
    setFormError(null)
    setDialogOpen(true)
  }

  const openEdit = (tier: RewardTier) => {
    setEditingTier(tier)
    setFormName(tier.tier_name)
    setFormThreshold(String(tier.point_threshold))
    setFormSafeReward(tier.safe_reward_title)
    setFormIsBlack(tier.is_black)
    setFormMysteryEnabled(tier.mystery_box_enabled)
    setFormPrizes(
      tier.mystery_prizes.length > 0
        ? tier.mystery_prizes.map((p) => ({ ...p }))
        : [emptyPrize()]
    )
    setFormError(null)
    setDialogOpen(true)
  }

  // ── Mystery prizes helpers ──
  const updatePrize = (index: number, field: keyof MysteryPrize, value: string | number) => {
    setFormPrizes((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const addPrize = () => setFormPrizes((prev) => [...prev, emptyPrize()])

  const removePrize = (index: number) => {
    setFormPrizes((prev) => prev.filter((_, i) => i !== index))
  }

  const totalProbability = formPrizes.reduce((s, p) => s + (Number(p.probability) || 0), 0)

  // ── Save (create or update) ──
  const handleSave = async () => {
    setFormError(null)
    const threshold = parseInt(formThreshold)

    if (!formName.trim()) { setFormError('Nombre del tier es requerido'); return }
    if (isNaN(threshold) || threshold < 1) { setFormError('Umbral de puntos debe ser positivo'); return }
    if (!formSafeReward.trim()) { setFormError('Premio seguro es requerido'); return }

    if (formMysteryEnabled && !formIsBlack) {
      const validPrizes = formPrizes.filter((p) => p.title.trim())
      if (validPrizes.length === 0) { setFormError('Agrega al menos un premio a la Mystery Box'); return }
      const total = validPrizes.reduce((s, p) => s + (Number(p.probability) || 0), 0)
      if (Math.abs(total - 100) > 0.01) {
        setFormError(`Las probabilidades deben sumar 100% (actual: ${total}%)`)
        return
      }
    }

    setSaving(true)

    const prizes = formMysteryEnabled && !formIsBlack
      ? formPrizes.filter((p) => p.title.trim()).map((p) => ({
          title: p.title.trim(),
          probability: Number(p.probability) || 0,
          emoji: p.emoji || '🎁',
        }))
      : []

    const payload = {
      ...(editingTier ? { id: editingTier.id } : {}),
      tier_name: formName.trim(),
      point_threshold: threshold,
      safe_reward_title: formSafeReward.trim(),
      mystery_box_enabled: formIsBlack ? false : formMysteryEnabled,
      mystery_prizes: prizes,
      is_black: formIsBlack,
    }

    try {
      const res = await fetch('/api/dashboard/reward-tiers', {
        method: editingTier ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        setFormError(err.error ?? 'Error guardando tier')
        return
      }
      setDialogOpen(false)
      fetchTiers()
    } catch {
      setFormError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active ──
  const handleToggle = async (id: string, currentActive: boolean) => {
    try {
      await fetch('/api/dashboard/reward-tiers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !currentActive }),
      })
      fetchTiers()
    } catch { /* best effort */ }
  }

  // ── Delete ──
  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      await fetch(`/api/dashboard/reward-tiers?id=${id}`, { method: 'DELETE' })
      setDeleteConfirm(null)
      fetchTiers()
    } catch { /* best effort */ } finally {
      setDeleting(false)
    }
  }

  // ── Render ──
  const sortedTiers = tiers.slice().sort((a, b) => a.point_threshold - b.point_threshold)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="h-6 w-6" />
          Tiers de Recompensas
        </h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo Tier
        </Button>
      </div>

      {/* Tiers table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Progresión por Puntos</CardTitle>
          <CardDescription>
            Los clientes acumulan puntos en cada visita. Al cruzar un umbral, desbloquean el tier y eligen entre el premio seguro o la Mystery Box.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : sortedTiers.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-muted-foreground">No hay tiers configurados.</p>
              <Button variant="outline" onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                Crear primer tier
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Tier</TableHead>
                  <TableHead className="text-center w-24">Umbral</TableHead>
                  <TableHead>Premio Seguro</TableHead>
                  <TableHead className="text-center w-28">Mystery Box</TableHead>
                  <TableHead className="text-center w-24">Estado</TableHead>
                  <TableHead className="text-center w-28">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTiers.map((t) => (
                  <TableRow key={t.id} className={t.is_black ? 'bg-amber-50/60 dark:bg-amber-950/20' : !t.is_active ? 'opacity-50' : ''}>
                    <TableCell>
                      <span className="text-lg">{tierEmoji(t.tier_name)}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {t.is_black ? (
                        <Badge className="text-sm px-2.5 py-0.5 bg-amber-500 hover:bg-amber-500 text-white gap-1">
                          <Crown className="h-3 w-3" />
                          {t.point_threshold} pts
                        </Badge>
                      ) : (
                        <Badge variant="default" className="text-sm px-2.5 py-0.5">
                          {t.point_threshold} pts
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>
                        <span>{t.tier_name}</span>
                        {t.is_black && (
                          <Badge className="ml-2 bg-amber-500 hover:bg-amber-500 text-white text-[10px] gap-0.5">
                            <Crown className="h-2.5 w-2.5" /> BLACK
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.safe_reward_title}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      {t.mystery_box_enabled ? (
                        <Badge variant="default" className="gap-1 text-[11px]">
                          <Dices className="h-3 w-3" /> ON
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[11px]">OFF</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={t.is_active ? 'default' : 'secondary'}>
                        {t.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => openEdit(t)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleToggle(t.id, t.is_active)}
                        >
                          {t.is_active
                            ? <ToggleRight className="h-4 w-4 text-green-600" />
                            : <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          }
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                          onClick={() => setDeleteConfirm(t.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ═══ Create / Edit Dialog ═══ */}
      <Dialog open={dialogOpen} onOpenChange={() => { setDialogOpen(false); setFormError(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {editingTier ? `Editar Tier: ${editingTier.tier_name}` : 'Nuevo Tier'}
            </DialogTitle>
            <DialogDescription>
              Configura el umbral de puntos, el premio seguro y opcionalmente la Mystery Box.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* ── Basic fields ── */}
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nombre del Tier</Label>
                <Input
                  placeholder="Ej: Bronce, Plata, Oro..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Umbral (pts)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="150"
                  value={formThreshold}
                  onChange={(e) => setFormThreshold(e.target.value)}
                  className="text-center text-lg font-bold"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Premio Seguro</Label>
              <Input
                placeholder="Ej: Bebida gratis, Postre gratis..."
                value={formSafeReward}
                onChange={(e) => setFormSafeReward(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Premio garantizado que el cliente recibe si elige &quot;ir a la segura&quot;.
              </p>
            </div>

            {/* ── BLACK toggle ── */}
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Crown className="h-4 w-4 text-amber-500" />
                  Nivel BLACK
                </Label>
                <p className="text-xs text-muted-foreground">
                  Tier maximo del programa. Sin Mystery Box, solo premio seguro especial.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={formIsBlack}
                onClick={() => setFormIsBlack(!formIsBlack)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  formIsBlack ? 'bg-amber-500' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formIsBlack ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* ── Mystery Box config ── */}
            {!formIsBlack && (
              <div className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                      <Dices className="h-4 w-4 text-purple-500" />
                      Mystery Box
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      El cliente puede arriesgarse a girar la ruleta en vez del premio seguro.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formMysteryEnabled}
                    onClick={() => setFormMysteryEnabled(!formMysteryEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      formMysteryEnabled ? 'bg-purple-500' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formMysteryEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {formMysteryEnabled && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-[40px_1fr_80px_40px] gap-2 items-center text-xs font-semibold text-muted-foreground">
                      <span>Emoji</span>
                      <span>Premio</span>
                      <span className="text-center">Prob. %</span>
                      <span />
                    </div>

                    {formPrizes.map((prize, i) => (
                      <div key={i} className="grid grid-cols-[40px_1fr_80px_40px] gap-2 items-center">
                        <Input
                          value={prize.emoji}
                          onChange={(e) => updatePrize(i, 'emoji', e.target.value)}
                          className="text-center text-lg px-1"
                          maxLength={4}
                        />
                        <Input
                          placeholder="Ej: Bebida gratis"
                          value={prize.title}
                          onChange={(e) => updatePrize(i, 'title', e.target.value)}
                        />
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={prize.probability}
                          onChange={(e) => updatePrize(i, 'probability', Number(e.target.value) || 0)}
                          className="text-center font-bold"
                        />
                        {formPrizes.length > 1 && (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" onClick={() => removePrize(i)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}

                    <div className="flex items-center justify-between">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={addPrize}>
                        <Plus className="h-3.5 w-3.5" />
                        Agregar premio
                      </Button>
                      <div className={`text-sm font-bold ${Math.abs(totalProbability - 100) < 0.01 ? 'text-green-600' : 'text-red-500'}`}>
                        Total: {totalProbability}%
                        {Math.abs(totalProbability - 100) < 0.01 ? ' ✓' : ' (debe ser 100%)'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Error ── */}
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingTier ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingTier ? 'Guardar Cambios' : 'Crear Tier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Delete Confirm Dialog ═══ */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Tier</DialogTitle>
            <DialogDescription>
              Si hay clientes que ya alcanzaron este tier, se desactivara en vez de eliminarse fisicamente. Podras reactivarlo despues.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleting}
              className="gap-2"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Eliminar / Desactivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
