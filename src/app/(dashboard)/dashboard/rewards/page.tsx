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
  MessageSquare,
  AlertTriangle,
} from 'lucide-react'
import type { Reward } from '@/types/database.types'

function buildPreviewTemplate(milestone: number, title: string): string {
  if (!milestone || !title) return ''
  return `\u00a1Felicidades {{name}}! \ud83c\udf89 Has completado tu visita #${milestone}. Como agradecimiento, te has ganado: ${title}. \u00a1Reclama tu premio en tu pr\u00f3xima visita!`
}

export default function RewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newMilestone, setNewMilestone] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchRewards = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/rewards')
      const data = await res.json()
      setRewards(Array.isArray(data) ? data : [])
    } catch {
      setRewards([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRewards()
  }, [fetchRewards])

  const handleCreate = async () => {
    const milestone = parseInt(newMilestone)
    if (!milestone || milestone < 1 || !newTitle.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/dashboard/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visit_milestone: milestone, title: newTitle.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        setCreateError(err.error ?? 'Error creando recompensa')
        return
      }
      setNewMilestone('')
      setNewTitle('')
      setCreateOpen(false)
      fetchRewards()
    } catch {
      setCreateError('Error de conexi\u00f3n')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      await fetch(`/api/dashboard/rewards?id=${id}`, { method: 'DELETE' })
      setDeleteConfirm(null)
      fetchRewards()
    } catch { /* best effort */ } finally {
      setDeleting(false)
    }
  }

  const handleToggle = async (id: string, currentActive: boolean) => {
    try {
      await fetch('/api/dashboard/rewards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !currentActive }),
      })
      fetchRewards()
    } catch { /* best effort */ }
  }

  const previewTemplate = buildPreviewTemplate(
    parseInt(newMilestone) || 0,
    newTitle
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="h-6 w-6" />
          Recompensas
        </h1>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nueva Recompensa
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recompensas por Visitas</CardTitle>
          <CardDescription>
            Cuando un cliente alcanza una meta de visitas, recibe autom\u00e1ticamente un mensaje de WhatsApp con su premio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rewards.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-muted-foreground">
                No hay recompensas configuradas.
              </p>
              <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Crear primera recompensa
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center w-24">Visita #</TableHead>
                  <TableHead>Recompensa</TableHead>
                  <TableHead className="hidden md:table-cell">Mensaje WhatsApp</TableHead>
                  <TableHead className="text-center w-24">Estado</TableHead>
                  <TableHead className="text-center w-28">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rewards
                  .slice()
                  .sort((a, b) => (a.visit_milestone ?? Infinity) - (b.visit_milestone ?? Infinity))
                  .map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-center">
                      <Badge variant="default" className="text-lg px-3 py-1">
                        {r.visit_milestone ?? '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate hidden md:table-cell">
                      {r.message_template}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={r.is_active ? 'default' : 'secondary'}>
                        {r.is_active ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleToggle(r.id, r.is_active)}
                        >
                          {r.is_active
                            ? <ToggleRight className="h-4 w-4 text-green-600" />
                            : <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          }
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                          onClick={() => setDeleteConfirm(r.id)}
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

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={() => { setCreateOpen(false); setCreateError(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Nueva Recompensa
            </DialogTitle>
            <DialogDescription>
              Ingresa la meta de visitas y el premio. El mensaje de WhatsApp se genera autom\u00e1ticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Visita #</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Ej: 5"
                  value={newMilestone}
                  onChange={(e) => setNewMilestone(e.target.value)}
                  className="text-center text-lg font-bold"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Recompensa / Premio</Label>
                <Input
                  placeholder="Ej: Rollo California gratis, 10% descuento..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
            </div>

            {previewTemplate && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-1">
                <p className="text-xs font-semibold text-green-800 flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Vista previa del mensaje autom\u00e1tico:
                </p>
                <p className="text-xs text-green-700 italic">
                  &quot;{previewTemplate.replace('{{name}}', 'Juan')}&quot;
                </p>
              </div>
            )}

            {createError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {createError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newMilestone || parseInt(newMilestone) < 1 || !newTitle.trim()}
              className="gap-2"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Crear Recompensa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Recompensa</DialogTitle>
            <DialogDescription>
              \u00bfEst\u00e1s seguro de que quieres eliminar esta recompensa? Esta acci\u00f3n no se puede deshacer.
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
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
