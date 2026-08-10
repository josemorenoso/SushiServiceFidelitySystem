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
  ScanLine,
  Copy,
  Check,
  Search,
  Ban,
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
  const [phoneError, setPhoneError] = useState<string | null>(null)

  // Edit dialog
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<'waiter' | 'supervisor' | 'admin'>('waiter')
  const [editPin, setEditPin] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Action states
  const [toggling, setToggling] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<'all' | 'waiter' | 'supervisor' | 'admin'>('all')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')

  // Copy link state
  const [copied, setCopied] = useState(false)
  const meseroUrl = typeof window !== 'undefined' ? `${window.location.origin}/mesero` : '/mesero'

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
    setPhoneError(null)
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(meseroUrl)
      setCopied(true)
      toast.success('Enlace copiado')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  const handleCreate = async () => {
    setPhoneError(null)
    if (!newName.trim() || !newPhone.trim() || !newPin.trim()) return
    if (!/^\d{10}$/.test(newPhone)) {
      setPhoneError('El número debe tener exactamente 10 dígitos')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/dashboard/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), phone: newPhone, pin: newPin, role: newRole }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.message || json.error || `Error ${res.status} al crear mesero`)
        return
      }
      toast.success(`Mesero "${newName.trim()}" creado`)
      resetCreateForm()
      setShowCreate(false)
      fetchData()
    } catch {
      toast.error('Error de conexión al crear mesero')
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

  const confirmDelete = (id: string, name: string) => {
    setDeleteTarget({ id, name })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/dashboard/staff?id=${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Error al eliminar'); return }
      toast.success(`"${deleteTarget.name}" eliminado`)
      setData((prev) => ({ ...prev, staff: prev.staff.filter((s) => s.id !== deleteTarget.id) }))
      setDeleteTarget(null)
    } catch {
      toast.error('Error de conexión')
    } finally {
      setDeleting(false)
    }
  }

  const handleRevokeDevice = async (id: string) => {
    if (!window.confirm('¿Revocar este dispositivo? Dejará de poder registrar visitas.')) return
    try {
      const res = await fetch('/api/dashboard/staff/device', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: id }),
      })
      if (!res.ok) { toast.error('No se pudo revocar el dispositivo'); return }
      toast.success('Dispositivo revocado')
      await fetchData()
    } catch {
      toast.error('Error de conexión')
    }
  }

  const handleDeleteDevice = async (id: string) => {
    if (!window.confirm('¿Eliminar definitivamente este dispositivo?')) return
    try {
      const res = await fetch(`/api/dashboard/staff/device?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error ?? 'No se pudo eliminar el dispositivo')
        return
      }
      toast.success('Dispositivo eliminado')
      await fetchData()
    } catch {
      toast.error('Error de conexión')
    }
  }

  const devicesForStaff = (staffId: string) =>
    data.devices.filter((d) => d.staff_user_id === staffId)

  // Filtered staff list
  const filteredStaff = data.staff.filter((s) => {
    if (search) {
      const q = search.toLowerCase()
      if (!s.name.toLowerCase().includes(q) && !s.phone.includes(q)) return false
    }
    if (filterRole !== 'all' && s.role !== filterRole) return false
    if (filterActive === 'active' && !s.is_active) return false
    if (filterActive === 'inactive' && s.is_active) return false
    return true
  })

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
          {/* Filters */}
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o celular..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as typeof filterRole)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="all">Todos los roles</option>
              <option value="waiter">Mesero</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserCog className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">
                {data.staff.length === 0 ? 'Aún no hay meseros registrados' : 'Sin resultados para la búsqueda'}
              </p>
              {data.staff.length === 0 && (
                <p className="text-xs mt-1">Crea un mesero para habilitar el escaneo QR con PIN.</p>
              )}
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
                {filteredStaff.map((s) => (
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
                          onClick={() => confirmDelete(s.id, s.name)}
                          title="Eliminar"
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

      {/* Devices Section */}
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
          {data.devices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Ningún dispositivo activado aún.</p>
              <p className="text-xs mt-1">El supervisor puede activar el celular del local desde <span className="font-mono">/mesero</span>.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre del dispositivo</TableHead>
                  <TableHead>Activado por</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden sm:table-cell">Último uso</TableHead>
                  <TableHead className="hidden sm:table-cell">Expira</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
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
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {d.is_trusted ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              onClick={() => handleRevokeDevice(d.id)}
                              title="Revocar"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDeleteDevice(d.id)}
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ═══ App del Mesero ═══ */}
      <Card className="border-red-100 bg-red-50/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-red-500" />
            App del Mesero
          </CardTitle>
          <CardDescription>
            Comparte este enlace con tus meseros. Al abrirlo, pueden iniciar sesión con su PIN o escanear directo si el dispositivo ya fue activado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* URL + copy button */}
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-red-200 bg-white px-3 py-2 font-mono text-sm text-gray-700 select-all">
              {meseroUrl}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="gap-2 border-red-200 text-red-600 hover:bg-red-50"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>

          {/* Mini pasos */}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-white p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-red-500 mb-1">1</p>
              <p className="text-xs text-gray-600">Crea un mesero con PIN desde esta página</p>
            </div>
            <div className="rounded-lg bg-white p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-red-500 mb-1">2</p>
              <p className="text-xs text-gray-600">Envía el enlace al celular del local o del mesero</p>
            </div>
            <div className="rounded-lg bg-white p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-red-500 mb-1">3</p>
              <p className="text-xs text-gray-600">El mesero toca <strong>Escanear QR</strong> y listo</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            <strong>Dispositivo del local:</strong> El supervisor abre el enlace y toca &quot;Activar este dispositivo&quot; con su PIN una sola vez. Después, cualquier mesero puede escanear sin login.
            {' '}<strong>Dispositivo de un mesero:</strong> en la misma pantalla, marca &quot;Asignar a un mesero específico&quot; e ingresa el celular del mesero — las visitas que registre ese dispositivo quedarán a su nombre.
          </p>
        </CardContent>
      </Card>

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
                onChange={(e) => {
                  setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
                  setPhoneError(null)
                }}
                placeholder="3001234567"
                maxLength={10}
                inputMode="numeric"
                className={phoneError ? 'border-red-400 focus-visible:ring-red-300' : ''}
              />
              {phoneError ? (
                <p className="text-[10px] text-red-500">{phoneError}</p>
              ) : (
                <p className="text-[10px] text-muted-foreground">Colombiano sin +57. Ej: 3024254326</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                PIN (4-6 dígitos)
              </Label>
              <Input
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
                onChange={(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
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

      {/* ═══ Delete Confirm Dialog ═══ */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-4 w-4" />
              Eliminar mesero
            </DialogTitle>
            <DialogDescription>
              ¿Eliminar a <strong>{deleteTarget?.name}</strong>? Esta acción no se puede deshacer y eliminará también sus dispositivos asociados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-2"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
