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
  UserCog,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Phone,
  User,
  Pencil,
  KeyRound,
  Smartphone,
  X,
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import type { StaffUser, StaffDevice } from '@/types/database.types'

interface StaffResponse {
  staff: StaffUser[]
  devices: StaffDevice[]
}

function formatPhone(phone: string): string {
  if (phone.length === 10) {
    return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`
  }
  return phone
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Nunca'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  if (days < 30) return `hace ${Math.floor(days / 7)} semana(s)`
  return `hace ${Math.floor(days / 30)} mes(es)`
}

function roleLabel(role: string): string {
  switch (role) {
    case 'admin': return 'Admin'
    case 'supervisor': return 'Supervisor'
    default: return 'Mesero'
  }
}

function roleBadgeVariant(role: string): 'default' | 'secondary' | 'destructive' {
  switch (role) {
    case 'admin': return 'destructive'
    case 'supervisor': return 'default'
    default: return 'secondary'
  }
}

export default function StaffPage() {
  const [data, setData] = useState<StaffResponse>({ staff: [], devices: [] })
  const [loading, setLoading] = useState(true)

  // Create dialog
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newRole, setNewRole] = useState<'waiter' | 'supervisor' | 'admin'>('waiter')
  const [creating, setCreating] = useState(false)

  // Edit dialog
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<'waiter' | 'supervisor' | 'admin'>('waiter')
  const [editPin, setEditPin] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Action states
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/staff')
      const json = await res.json()
      setData({ staff: json.staff ?? [], devices: json.devices ?? [] })
    } catch {
      toast.error('Error cargando meseros')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const resetCreateForm = () => {
    setNewName('')
    setNewPhone('')
    setNewPin('')
    setNewRole('waiter')
  }

  const handleCreate = async () => {
    if (!newName.trim() || !newPhone.trim() || !newPin.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/dashboard/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), phone: newPhone, pin: newPin, role: newRole }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.message || json.error || 'Error al crear')
        return
      }
      toast.success(`Mesero "${newName.trim()}" creado`)
      resetCreateForm()
      setShowCreate(false)
      fetchData()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (staff: StaffUser) => {
    setEditingStaff(staff)
    setEditName(staff.name)
    setEditRole(staff.role as 'waiter' | 'supervisor' | 'admin')
    setEditPin('')
  }

  const handleEditSave = async () => {
    if (!editingStaff) return
    setSavingEdit(true)
    try {
      const payload: Record<string, unknown> = {
        id: editingStaff.id,
        name: editName.trim(),
        role: editRole,
      }
      if (editPin.trim()) payload.pin = editPin.trim()

      const res = await fetch('/api/dashboard/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.message || json.error || 'Error al guardar')
        return
      }
      toast.success('Mesero actualizado')
      setEditingStaff(null)
      fetchData()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleToggle = async (id: string, currentActive: boolean) => {
    setToggling(id)
    try {
      const res = await fetch('/api/dashboard/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !currentActive }),
      })
      if (!res.ok) { toast.error('Error al cambiar estado'); return }
      setData((prev) => ({
        ...prev,
        staff: prev.staff.map((s) => s.id === id ? { ...s, is_active: !currentActive } : s),
      }))
      toast.success(currentActive ? 'Mesero desactivado' : 'Mesero activado')
    } catch {
      toast.error('Error de conexión')
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Eliminar a "${name}"? Esta acción no se puede deshacer.`)) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/dashboard/staff?id=${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Error al eliminar'); return }
      toast.success(`"${name}" eliminado`)
      setData((prev) => ({ ...prev, staff: prev.staff.filter((s) => s.id !== id) }))
    } catch {
      toast.error('Error de conexión')
    } finally {
      setDeleting(null)
    }
  }

  const devicesForStaff = (staffId: string) =>
    data.devices.filter((d) => d.staff_user_id === staffId)

  return (
    <div className="space-y-6">
      <Toaster position="top-center" richColors />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCog className="h-6 w-6" />
          Meseros y Dispositivos
        </h1>
        <Button onClick={() => { resetCreateForm(); setShowCreate(true) }} className="gap-2">
          <Plus className="h-4 w-4" />
          Crear Mesero
        </Button>
      </div>

      {/* Staff Users Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Meseros del restaurante</CardTitle>
          <CardDescription>
            Administra meseros con PIN para escaneo QR. Los dispositivos de confianza se registran desde la app del mesero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data.staff.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserCog className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Aún no hay meseros registrados</p>
              <p className="text-xs mt-1">Crea un mesero para habilitar el escaneo QR con PIN.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Celular</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden sm:table-cell">Último login</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.staff.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="font-mono text-sm">{formatPhone(s.phone)}</TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant(s.role)} className="text-[10px]">
                        {roleLabel(s.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.is_active ? 'default' : 'secondary'} className="text-[10px]">
                        {s.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {timeAgo(s.last_login_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(s)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleToggle(s.id, s.is_active)}
                          disabled={toggling === s.id}
                          title={s.is_active ? 'Desactivar' : 'Activar'}
                        >
                          {toggling === s.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : s.is_active ? (
                            <ToggleRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(s.id, s.name)}
                          disabled={deleting === s.id}
                          title="Eliminar"
                        >
                          {deleting === s.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
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

      {/* Devices Section */}
      {data.devices.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Dispositivos de confianza
            </CardTitle>
            <CardDescription>
              Celulares o tablets del restaurante activados para escanear sin PIN.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre del dispositivo</TableHead>
                  <TableHead>Activado por</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden sm:table-cell">Último uso</TableHead>
                  <TableHead className="hidden sm:table-cell">Expira</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.devices.map((d) => {
                  const activator = data.staff.find((s) => s.id === d.staff_user_id)
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium text-sm">
                        {d.device_name || 'Dispositivo sin nombre'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {activator ? activator.name : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={d.is_trusted ? 'default' : 'secondary'} className="text-[10px]">
                          {d.is_trusted ? 'Activo' : 'Revocado'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {timeAgo(d.last_used_at)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {d.expires_at ? timeAgo(d.expires_at) : 'Nunca'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ═══ Create Dialog ═══ */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Crear Mesero
            </DialogTitle>
            <DialogDescription>
              Asigna un PIN numérico de 4 a 6 dígitos para que el mesero inicie sesión en la app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Nombre completo
              </Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: Juan Pérez"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                Celular
              </Label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="3001234567"
                maxLength={10}
              />
              <p className="text-[10px] text-muted-foreground">Celular colombiano sin +57. Ej: 3024254326</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                PIN (4-6 dígitos)
              </Label>
              <Input
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="1234"
                maxLength={6}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rol</Label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'waiter' | 'supervisor' | 'admin')}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="waiter">Mesero</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !newPhone.trim() || !newPin.trim()}
              className="gap-2"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creating ? 'Guardando...' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Edit Dialog ═══ */}
      <Dialog open={!!editingStaff} onOpenChange={() => setEditingStaff(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Editar Mesero
            </DialogTitle>
            <DialogDescription>
              Actualiza datos o restablece el PIN de {editingStaff?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Nombre
              </Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nombre completo"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rol</Label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as 'waiter' | 'supervisor' | 'admin')}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="waiter">Mesero</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                Nuevo PIN (opcional)
              </Label>
              <Input
                value={editPin}
                onChange={(e) => setEditPin(e.target.value)}
                placeholder="Dejar vacío para no cambiar"
                maxLength={6}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <p className="text-[10px] text-muted-foreground">4-6 dígitos numéricos. Solo se actualiza si escribes uno nuevo.</p>
            </div>

            {/* Devices for this staff */}
            {editingStaff && devicesForStaff(editingStaff.id).length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <Label className="text-xs font-semibold">Dispositivos asociados</Label>
                {devicesForStaff(editingStaff.id).map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{d.device_name || 'Dispositivo'}</span>
                    <Badge variant={d.is_trusted ? 'default' : 'secondary'} className="text-[10px]">
                      {d.is_trusted ? 'Activo' : 'Revocado'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStaff(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={savingEdit || !editName.trim()}
              className="gap-2"
            >
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              {savingEdit ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
