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
  MapPin,
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import type { StaffUser, StaffDevice } from '@/types/database.types'
import { useLocationScope } from '@/contexts/LocationScopeContext'

interface StaffResponse {
  staff: StaffUser[]
  devices: StaffDevice[]
}

function formatPhone(phone: string | null): string {
  // §19.2: los meseros nuevos no tienen celular. Se muestra el hueco, no una cadena vacía
  // que parecería un dato perdido.
  if (!phone) return '—'
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
  // '' = sin sede. Multi-sede F7 (D10, deuda #16): el formulario ya tenía el
  // resto de campos; a esto es a lo único que le faltaba dibujo — la API
  // (`POST`/`PATCH /api/dashboard/staff`) acepta `location_id` desde F4 (00044).
  const [newLocationId, setNewLocationId] = useState('')
  const [creating, setCreating] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)

  // Edit dialog
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<'waiter' | 'supervisor' | 'admin'>('waiter')
  const [editPin, setEditPin] = useState('')
  const [editLocationId, setEditLocationId] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Las sedes activas de la marca — el mismo `LocationScopeProvider` que ya
  // alimenta el selector del header (§8.4), reutilizado aquí para no inventar
  // un segundo fetch de `restaurant_locations`.
  const { view: locationScopeView } = useLocationScope()
  const assignableLocations = locationScopeView?.locations ?? []
  const locationName = (id: string | null) =>
    id ? (assignableLocations.find((l) => l.id === id)?.name ?? 'Sede desconocida') : 'Sin sede'

  // El ROL gobierna el formulario (dueño, 2026-09-06). Desde §19 el mesero NO inicia sesión:
  // se elige de una lista que el escáner filtra por la sede del aparato. El celular y el PIN
  // dejaron de ser "para entrar" y pasaron a ser la llave que ACTIVA un aparato — y eso solo
  // lo hace un supervisor o un admin. Pedírselos a un mesero es pedirle un dato que nadie usa.
  const rolUsaCredenciales = (rol: string) => rol !== 'waiter'

  // Con UNA sola sede activa, «Sin sede» no es una elección: es un olvido. Y para un mesero
  // además rompe `staff_users_identidad_minima` (00046) — celular O sede, alguna de las dos.
  const sedeUnica = assignableLocations.length === 1 ? assignableLocations[0].id : ''

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Action states
  const [toggling, setToggling] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<'all' | 'waiter' | 'supervisor' | 'admin'>('all')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  // Atajo del aviso de arriba: aísla a los que no aparecen en ningún escáner.
  const [onlySinSede, setOnlySinSede] = useState(false)

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

  // La sede única llega preseleccionada al abrir el modal, y también si las sedes terminan
  // de cargar con el modal ya abierto. `prev ||` a propósito: no le pisa una elección hecha
  // —un supervisor puede querer quedarse en «Sin sede»— porque el efecto no vuelve a correr
  // cuando cambia `newLocationId`.
  useEffect(() => {
    if (showCreate) setNewLocationId((prev) => prev || sedeUnica)
  }, [showCreate, sedeUnica])

  const resetCreateForm = () => {
    setNewName('')
    setNewPhone('')
    setNewPin('')
    setNewRole('waiter')
    setNewLocationId(sedeUnica)
    setPhoneError(null)
  }

  /**
   * Cambiar de rol no arrastra lo del rol anterior: al volver a «Mesero», el celular y el
   * PIN que se hubieran escrito se BORRAN, no se esconden. Un campo invisible que igual
   * viaja en el POST es un dato que el dueño grabó sin verlo.
   */
  const handleNewRole = (rol: 'waiter' | 'supervisor' | 'admin') => {
    setNewRole(rol)
    if (!rolUsaCredenciales(rol)) {
      setNewPhone('')
      setNewPin('')
      setPhoneError(null)
      setNewLocationId((prev) => prev || sedeUnica)
    }
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
    if (!newName.trim()) return
    const conCredenciales = rolUsaCredenciales(newRole)
    // Un mesero se manda SIEMPRE sin celular y sin PIN, aunque hayan quedado restos de haber
    // pasado por el rol de supervisor: el formulario ya no los muestra, así que enviarlos
    // sería grabar un dato que el dueño no está viendo.
    const phone = conCredenciales ? newPhone.trim() : ''
    const pin = conCredenciales ? newPin.trim() : ''
    // §19.2: el celular sigue siendo OPCIONAL para un supervisor. Si lo escribe, tiene que
    // ser válido: medio número es peor que ninguno.
    if (phone && !/^\d{10}$/.test(phone)) {
      setPhoneError('El número debe tener exactamente 10 dígitos')
      return
    }
    // 19.f — el CHECK `staff_users_identidad_minima` de la 00046. Sin celular NI sede no hay
    // ninguna llave de identidad, y encima el mesero no saldría en ningún escáner. El
    // formulario ya no deja armar esa combinación; esto es el cinturón por si se cuela.
    if (!phone && !newLocationId) {
      toast.error(
        assignableLocations.length === 0
          ? 'Esta marca no tiene sedes activas todavía. Sin sede solo se puede crear un supervisor o un admin, y con celular.'
          : 'Elige la sede: es lo que hace que aparezca en el escáner de ese local.'
      )
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/dashboard/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          phone: phone || null,
          pin: pin || null,
          role: newRole,
          location_id: newLocationId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.message || json.error || `Error ${res.status} al crear mesero`)
        return
      }
      toast.success(`${roleLabel(newRole)} "${newName.trim()}" creado`)
      resetCreateForm()
      setShowCreate(false)
      fetchData()
    } catch {
      toast.error('Error de conexión al crear mesero')
    } finally {
      setCreating(false)
    }
  }

  /** Mismo criterio que `handleNewRole`, del lado de la edición. */
  const handleEditRole = (rol: 'waiter' | 'supervisor' | 'admin') => {
    setEditRole(rol)
    if (!rolUsaCredenciales(rol)) {
      setEditPin('')
      setEditLocationId((prev) => prev || sedeUnica)
    }
  }

  const openEdit = (staff: StaffUser) => {
    setEditingStaff(staff)
    setEditName(staff.name)
    setEditRole(staff.role as 'waiter' | 'supervisor' | 'admin')
    setEditPin('')
    setEditLocationId(staff.location_id ?? '')
  }

  const handleEditSave = async () => {
    if (!editingStaff) return
    // Guardar es la vía por la que se arregla el parque viejo (todos con `location_id`
    // NULL): dejar salir a un mesero sin sede sería reponer el mismo problema.
    if (!rolUsaCredenciales(editRole) && !editLocationId && assignableLocations.length > 0) {
      toast.error('Elige la sede: sin ella este mesero no aparece en ningún escáner.')
      return
    }
    setSavingEdit(true)
    try {
      const payload: Record<string, unknown> = {
        id: editingStaff.id,
        name: editName.trim(),
        role: editRole,
        location_id: editLocationId || null,
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
      if (!s.name.toLowerCase().includes(q) && !(s.phone ?? '').includes(q)) return false
    }
    if (filterRole !== 'all' && s.role !== filterRole) return false
    if (filterActive === 'active' && !s.is_active) return false
    if (filterActive === 'inactive' && s.is_active) return false
    if (onlySinSede && s.location_id) return false
    return true
  })

  // Los invisibles del escáner. `location_id` NULL no se adivina NUNCA (D11): se marca, se
  // cuenta y se le pide al dueño que la asigne. Ver `SQL-PARA-CORRER/meseros-sin-sede/`.
  const sinSede = data.staff.filter((s) => s.is_active && !s.location_id)

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
            Los meseros se eligen de una lista en el escáner del local; no inician sesión ni tienen
            PIN. El PIN lo llevan los supervisores, que es con lo que activan un aparato.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/*
            Problema B: el parque viejo tiene `location_id` NULL y en la tabla se veía igual
            que cualquier otro. Se MARCA y se cuenta, nunca se adivina (D11): asignar una sede
            por nosotros atribuiría visitas a un local en el que esa persona no trabajó. El
            listado para asignarlas a mano está en `SQL-PARA-CORRER/meseros-sin-sede/`.
          */}
          {sinSede.length > 0 && (
            <div className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-amber-900">
                  {sinSede.length === 1
                    ? '1 mesero sin sede: no aparece en ningún escáner'
                    : `${sinSede.length} meseros sin sede: no aparecen en ningún escáner`}
                </p>
                <p className="mt-0.5 text-xs text-amber-800">
                  {assignableLocations.length === 0
                    ? 'Esta marca todavía no tiene sedes activas. Hasta que exista una, la lista del escáner sale vacía.'
                    : 'La lista del escáner se arma con la sede del aparato. Asígnalas con el lápiz de cada fila — nadie las adivina.'}
                </p>
              </div>
              {assignableLocations.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOnlySinSede((v) => !v)}
                  className="shrink-0 border-amber-300 text-amber-900 hover:bg-amber-100"
                >
                  {onlySinSede ? 'Ver todos' : 'Ver solo esos'}
                </Button>
              )}
            </div>
          )}

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
                <p className="text-xs mt-1">Crea el primero: le basta su nombre y su sede.</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Celular</TableHead>
                  <TableHead>Rol</TableHead>
                  {assignableLocations.length > 0 && <TableHead>Sede</TableHead>}
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
                    {assignableLocations.length > 0 && (
                      <TableCell>
                        {/* NULL se muestra, nunca se adivina (D11) — y se muestra COMO EL
                            PROBLEMA QUE ES: ese mesero no sale en ninguna lista del escáner. */}
                        {s.location_id ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {locationName(s.location_id)}
                          </Badge>
                        ) : (
                          <div className="flex flex-col items-start gap-0.5">
                            <Badge
                              variant="outline"
                              className="border-amber-300 bg-amber-50 text-[10px] text-amber-800"
                            >
                              Sin sede
                            </Badge>
                            <span className="text-[10px] leading-tight text-amber-700">
                              No aparece en ningún escáner
                            </span>
                          </div>
                        )}
                      </TableCell>
                    )}
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
            Este es el enlace del escáner. Se abre una sola vez en el celular o la tablet del
            local, un supervisor lo activa con su PIN, y desde ahí cualquier mesero de esa sede
            escanea sin volver a entrar.
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
              <p className="text-xs text-gray-600">Crea los meseros de la sede, y un supervisor con PIN</p>
            </div>
            <div className="rounded-lg bg-white p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-red-500 mb-1">2</p>
              <p className="text-xs text-gray-600">Abre el enlace en el celular del local y actívalo con ese PIN</p>
            </div>
            <div className="rounded-lg bg-white p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-red-500 mb-1">3</p>
              <p className="text-xs text-gray-600">Se toca <strong>Escanear QR</strong> y se elige quién atiende</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            <strong>El aparato es del local, no de una persona.</strong> El supervisor lo activa con
            su celular y su PIN una sola vez, y elige a qué sede pertenece: eso es lo que decide qué
            meseros salen en la lista. Después, en cada visita se marca quién atendió — por eso los
            meseros no necesitan ni celular ni PIN.
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
              El rol decide qué se pide. Un <strong>mesero</strong> solo necesita nombre y sede:
              no inicia sesión en ningún lado, se elige de la lista del escáner del local. El
              celular y el PIN son la llave que <strong>activa un aparato</strong>, y esa la
              tienen los supervisores y los admins.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* El Rol va PRIMERO porque es lo que decide qué campos existen debajo. */}
            <div className="space-y-1.5">
              <Label className="text-xs">Rol</Label>
              <select
                value={newRole}
                onChange={(e) => handleNewRole(e.target.value as 'waiter' | 'supervisor' | 'admin')}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="waiter">Mesero — solo nombre y sede</option>
                <option value="supervisor">Supervisor — con celular y PIN, activa aparatos</option>
                <option value="admin">Admin — con celular y PIN, activa aparatos</option>
              </select>
            </div>

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
              <p className="text-[10px] text-muted-foreground">
                Es el nombre que sale en la lista del escáner: tiene que distinguirse de sus
                compañeros de sede («Ana L.», «Ana P.»).
              </p>
            </div>

            {/* La Sede se pide SIEMPRE: es lo que decide en qué escáner aparece. */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Sede
              </Label>
              {assignableLocations.length === 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  Esta marca todavía no tiene sedes activas. Sin sede solo se puede crear un
                  supervisor o un admin, que se identifican por su celular: un mesero sin sede no
                  aparecería en ningún escáner.
                </p>
              ) : (
                <>
                  <select
                    value={newLocationId}
                    onChange={(e) => setNewLocationId(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {/* Para un mesero, «Sin sede» deja de ser una opción: sin ella no aparece
                        en ningún escáner y —si además no tiene celular— la rechaza el CHECK. */}
                    {rolUsaCredenciales(newRole) ? (
                      <option value="">Sin sede</option>
                    ) : (
                      newLocationId === '' && (
                        <option value="" disabled>Elige una sede…</option>
                      )
                    )}
                    {assignableLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground">
                    {rolUsaCredenciales(newRole)
                      ? 'Un supervisor puede quedarse sin sede: lo identifica su celular.'
                      : 'Un mesero es de UNA sede (D11), y es la que decide en qué escáner aparece.'}
                  </p>
                </>
              )}
            </div>

            {rolUsaCredenciales(newRole) && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    Celular <span className="text-muted-foreground">(opcional)</span>
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
                    <p className="text-[10px] text-muted-foreground">
                      Colombiano sin +57. Es la mitad de la llave que activa un celular o una
                      tablet del local: sin él, este supervisor no puede activar ninguno.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" />
                    PIN <span className="text-muted-foreground">(opcional)</span>
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
                  <p className="text-[10px] text-muted-foreground">
                    4 a 6 dígitos. Es la otra mitad de esa llave, y se teclea una sola vez por
                    aparato.
                  </p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || (!rolUsaCredenciales(newRole) && !newLocationId)}
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
              Cambia el rol, el nombre o la sede de {editingStaff?.name}. El rol decide qué se
              pide: el PIN solo existe para supervisores y admins, que son los que activan los
              aparatos del local.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Mismo orden que en «Crear»: el Rol manda, y va primero. */}
            <div className="space-y-1.5">
              <Label className="text-xs">Rol</Label>
              <select
                value={editRole}
                onChange={(e) => handleEditRole(e.target.value as 'waiter' | 'supervisor' | 'admin')}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="waiter">Mesero — solo nombre y sede</option>
                <option value="supervisor">Supervisor — con celular y PIN, activa aparatos</option>
                <option value="admin">Admin — con celular y PIN, activa aparatos</option>
              </select>
            </div>

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
              <Label className="text-xs flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Sede
              </Label>
              {assignableLocations.length === 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  Esta marca todavía no tiene sedes activas, así que no hay ninguna que asignar.
                  Mientras tanto, este mesero no aparece en ningún escáner.
                </p>
              ) : (
                <>
                  <select
                    value={editLocationId}
                    onChange={(e) => setEditLocationId(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {/* «Sin sede» sigue siendo el valor de las filas viejas, así que se DIBUJA
                        —tapar el estado real sería mentir— pero para un mesero va `disabled`:
                        se puede salir de ahí, no volver. */}
                    {rolUsaCredenciales(editRole) ? (
                      <option value="">Sin sede</option>
                    ) : (
                      editLocationId === '' && (
                        <option value="" disabled>
                          Sin sede — no aparece en ningún escáner
                        </option>
                      )
                    )}
                    {assignableLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                  {!rolUsaCredenciales(editRole) && editLocationId === '' && (
                    <p className="text-[10px] text-amber-700">
                      Hoy no aparece en ninguna lista del escáner. Elige su sede para que sus
                      compañeros lo vean al registrar una visita.
                    </p>
                  )}
                  {devicesForStaff(editingStaff?.id ?? '').length > 0 && (
                    <p className="text-[10px] text-amber-600">
                      Este mesero tiene dispositivos. Moverlo de sede se rechaza si alguno quedó en otra (D11).
                    </p>
                  )}
                </>
              )}
            </div>

            {rolUsaCredenciales(editRole) && (
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
            )}

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
              disabled={savingEdit || !editName.trim() || (!rolUsaCredenciales(editRole) && !editLocationId && assignableLocations.length > 0)}
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
