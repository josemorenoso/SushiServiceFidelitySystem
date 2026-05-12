'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Phone,
  Calendar,
  MapPin,
  TrendingUp,
  Gift,
  Plus,
  Loader2,
  CheckCircle,
  MessageCircle,
  MessageCircleOff,
  Clock,
  Pencil,
} from 'lucide-react'
import { getCustomerRank } from '@/constants/rankings'
import type { Customer } from '@/types/database.types'

interface CustomerDetailDialogProps {
  customer: Customer | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onVisitsAdded?: () => void
}

function getGradientColors(gradient: string): string {
  const colorMap: Record<string, string> = {
    'from-neutral-900 to-neutral-700': '#171717, #404040',
    'from-slate-300 to-slate-600': '#CBD5E1, #475569',
    'from-yellow-400 to-amber-600': '#FACC15, #D97706',
    'from-gray-300 to-gray-500': '#D1D5DB, #6B7280',
  }
  return colorMap[gradient] ?? '#9CA3AF, #4B5563'
}

export function CustomerDetailDialog({ customer, open, onOpenChange, onVisitsAdded }: CustomerDetailDialogProps) {
  const [addCount, setAddCount] = useState('1')
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [addSuccess, setAddSuccess] = useState(false)
  const [nextReward, setNextReward] = useState<{ milestone: number; title: string } | null>(null)

  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBirthday, setEditBirthday] = useState('')
  const [editCity, setEditCity] = useState('')
  const [editMarketing, setEditMarketing] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    if (customer && open) {
      setAddCount('1')
      setReason('')
      setAddSuccess(false)
      setEditMode(false)
      setEditError(null)
      setEditName(customer.name)
      setEditBirthday(customer.birthday ?? '')
      setEditCity(customer.city ?? '')
      setEditMarketing(customer.accepts_marketing)
      fetch(`/api/dashboard/customers/${customer.id}/next-reward`)
        .then((r) => r.json())
        .then((d) => setNextReward(d.reward ?? null))
        .catch(() => setNextReward(null))
    }
  }, [customer, open])

  if (!customer) return null

  const rank = getCustomerRank(customer.total_visits)
  const daysInactive = customer.last_visit_at
    ? Math.floor((Date.now() - new Date(customer.last_visit_at).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const handleSaveEdit = async () => {
    if (!customer) return
    setEditSaving(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/dashboard/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          birthday: editBirthday || null,
          city: editCity || null,
          accepts_marketing: editMarketing,
        }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      setEditMode(false)
      onVisitsAdded?.()
    } catch {
      setEditError('No se pudo guardar los cambios')
    } finally {
      setEditSaving(false)
    }
  }

  const handleAddVisits = async () => {
    const count = parseInt(addCount)
    if (!count || count < 1) return
    setAdding(true)
    setAddSuccess(false)
    try {
      for (let i = 0; i < count; i++) {
        await fetch('/api/dashboard/check-in-override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: customer.phone,
            reason: reason || `Admin asignó ${count} visita(s)`,
          }),
        })
      }
      setAddSuccess(true)
      onVisitsAdded?.()
    } catch {
      // best effort
    } finally {
      setAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{rank.emoji}</span>
            <div>
              <p className="text-lg font-bold" style={{ color: '#1a1c1d' }}>
                {customer.name}
              </p>
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                style={{
                  background: `linear-gradient(135deg, ${getGradientColors(rank.gradient)})`,
                  fontSize: '0.65rem',
                }}
              >
                {rank.name}
              </span>
            </div>
          </div>
          {!editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
              title="Editar cliente"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Modo edición */}
          {editMode ? (
            <div className="space-y-3 rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)' }}>
              <div>
                <label className="text-[10px] uppercase font-semibold" style={{ color: '#9ca3af' }}>Nombre</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase font-semibold" style={{ color: '#9ca3af' }}>Cumpleaños</label>
                  <Input type="date" value={editBirthday} onChange={(e) => setEditBirthday(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-semibold" style={{ color: '#9ca3af' }}>Ciudad</label>
                  <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} placeholder="Ciudad" className="mt-1" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editMarketing}
                  onChange={(e) => setEditMarketing(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Acepta mensajes de marketing (WhatsApp)
              </label>
              {editError && <p className="text-xs" style={{ color: '#ef4444' }}>{editError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditMode(false); setEditError(null) }}
                  className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                  className="flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)' }}
                >
                  {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : 'Guardar'}
                </button>
              </div>
            </div>
          ) : (
          <>
          {/* Info básica */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-3.5 w-3.5" style={{ color: '#9ca3af' }} strokeWidth={1.5} />
              <span className="font-mono text-xs" style={{ color: '#6b7280' }}>{customer.phone}</span>
            </div>
            {customer.city && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-3.5 w-3.5" style={{ color: '#9ca3af' }} strokeWidth={1.5} />
                <span className="text-xs" style={{ color: '#6b7280' }}>{customer.city}</span>
              </div>
            )}
            {customer.birthday && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-3.5 w-3.5" style={{ color: '#9ca3af' }} strokeWidth={1.5} />
                <span className="text-xs" style={{ color: '#6b7280' }}>
                  {new Date(customer.birthday + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              {customer.accepts_marketing ? (
                <>
                  <MessageCircle className="h-3.5 w-3.5" style={{ color: '#10b981' }} strokeWidth={1.5} />
                  <span className="text-xs" style={{ color: '#10b981' }}>Acepta WhatsApp</span>
                </>
              ) : (
                <>
                  <MessageCircleOff className="h-3.5 w-3.5" style={{ color: '#ef4444' }} strokeWidth={1.5} />
                  <span className="text-xs" style={{ color: '#ef4444' }}>No acepta marketing</span>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(0,0,0,0.02)' }}>
              <p className="text-2xl font-bold" style={{ color: '#1a1c1d', letterSpacing: '-0.04em' }}>
                {customer.total_visits}
              </p>
              <p className="text-[10px] font-semibold uppercase" style={{ color: '#9ca3af' }}>Visitas</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(0,0,0,0.02)' }}>
              <p className="text-2xl font-bold" style={{ color: '#1a1c1d', letterSpacing: '-0.04em' }}>
                {daysInactive ?? '—'}
              </p>
              <p className="text-[10px] font-semibold uppercase" style={{ color: '#9ca3af' }}>Días sin venir</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(0,0,0,0.02)' }}>
              <p className="text-xs font-semibold" style={{ color: '#1a1c1d' }}>
                {customer.source_channels === 'both' ? 'QR + Delivery' : customer.source_channels === 'delivery' ? 'Delivery' : 'QR'}
              </p>
              <p className="text-[10px] font-semibold uppercase" style={{ color: '#9ca3af' }}>Canal</p>
            </div>
          </div>

          {/* Next reward */}
          {nextReward && (
            <div
              className="flex items-center gap-2 rounded-xl p-3"
              style={{ background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.2)' }}
            >
              <Gift className="h-4 w-4" style={{ color: '#F59E0B' }} strokeWidth={1.5} />
              <div className="flex-1">
                <p className="text-xs font-semibold" style={{ color: '#92400E' }}>
                  Próxima recompensa en visita #{nextReward.milestone}
                </p>
                <p className="text-xs" style={{ color: '#B45309' }}>
                  {nextReward.title} — le faltan {nextReward.milestone - customer.total_visits} visita(s)
                </p>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex items-center gap-4 text-[10px]" style={{ color: '#d1d5db' }}>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" strokeWidth={1.5} />
              Registro: {new Date(customer.created_at).toLocaleDateString('es-CO')}
            </div>
            {customer.last_visit_at && (
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" strokeWidth={1.5} />
                Última: {new Date(customer.last_visit_at).toLocaleDateString('es-CO')}
              </div>
            )}
          </div>

          {/* Asignar visitas */}
          <div className="rounded-xl p-4" style={{ border: '1px solid rgba(226,190,192,0.3)', background: 'rgba(255,255,255,0.6)' }}>
            <p className="text-xs font-bold mb-2" style={{ color: '#1a1c1d' }}>
              <Plus className="inline h-3.5 w-3.5 mr-1" strokeWidth={1.5} />
              Asignar visitas manualmente
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[10px] uppercase font-semibold" style={{ color: '#9ca3af' }}>Cantidad</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={addCount}
                  onChange={(e) => setAddCount(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-[2]">
                <label className="text-[10px] uppercase font-semibold" style={{ color: '#9ca3af' }}>Razón (opcional)</label>
                <Input
                  placeholder="Ej: cliente frecuente, corrección"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                onClick={handleAddVisits}
                disabled={adding || addSuccess || parseInt(addCount) < 1}
                className="gap-1 h-8"
                style={{
                  background: addSuccess
                    ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                    : 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)',
                }}
              >
                {adding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : addSuccess ? (
                  <CheckCircle className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {addSuccess ? 'Listo' : 'Agregar'}
              </Button>
            </div>
          </div>
          </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
