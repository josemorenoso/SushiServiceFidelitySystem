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
  ShieldCheck,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Phone,
  User,
  MapPin,
  AlertTriangle,
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { useLocationScope, LOCATION_ALL, LOCATION_UNKNOWN } from '@/contexts/LocationScopeContext'

interface AuthorizedNumber {
  id: string
  phone: string
  name: string
  is_active: boolean
  created_at: string
  /** D9 — la sede del operador. NULL = «sede desconocida», y SE MUESTRA. */
  location_id: string | null
}

function formatPhone(phone: string): string {
  if (phone.length === 10) {
    return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`
  }
  return phone
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  if (days < 30) return `hace ${Math.floor(days / 7)} semana(s)`
  return `hace ${Math.floor(days / 30)} mes(es)`
}

export default function AuthorizedNumbersPage() {
  const [numbers, setNumbers] = useState<AuthorizedNumber[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newLocationId, setNewLocationId] = useState('')
  const [creating, setCreating] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [movingSede, setMovingSede] = useState<string | null>(null)
  const { queryParam, view: locationScopeView, selection } = useLocationScope()

  // Las sedes activas salen del mismo `LocationScopeProvider` que ya dibuja el selector del
  // encabezado — no hace falta un segundo fetch de `restaurant_locations`.
  const sedes = locationScopeView?.locations ?? []
  const multiSede = locationScopeView?.multiSede ?? false
  const sedeName = (id: string | null) =>
    id ? (sedes.find((l) => l.id === id)?.name ?? 'Sede desconocida') : 'Sin sede'

  // Con UNA sola sede, «sin sede» no es una elección: es un olvido. Con varias, la sede que
  // el encabezado ya tiene puesta es la respuesta correcta casi siempre.
  const sedePorDefecto =
    sedes.length === 1
      ? sedes[0].id
      : selection !== LOCATION_ALL && selection !== LOCATION_UNKNOWN && sedes.some((l) => l.id === selection)
        ? selection
        : ''

  const fetchNumbers = useCallback(async () => {
    try {
      const url = queryParam ? `/api/dashboard/authorized-numbers?${queryParam}` : '/api/dashboard/authorized-numbers'
      const res = await fetch(url)
      const data = await res.json()
      setNumbers(data.numbers ?? [])
    } catch {
      toast.error('Error cargando números')
    } finally {
      setLoading(false)
    }
  }, [queryParam])

  useEffect(() => { fetchNumbers() }, [fetchNumbers])

  // La sede por defecto llega puesta al abrir el modal. No pisa lo que la persona haya
  // elegido a mano —puede querer dejarlo en «Sin sede»— porque solo rellena si está vacío.
  useEffect(() => {
    if (showDialog) setNewLocationId((prev) => prev || sedePorDefecto)
  }, [showDialog, sedePorDefecto])

  const handleCreate = async () => {
    if (!newName.trim() || !newPhone.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/dashboard/authorized-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: newPhone, name: newName, location_id: newLocationId || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || data.error || 'Error al crear')
        return
      }
      toast.success(`Mesero "${newName}" agregado`)
      setNewName('')
      setNewPhone('')
      setNewLocationId('')
      setShowDialog(false)
      fetchNumbers()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setCreating(false)
    }
  }

  const handleToggle = async (id: string, currentActive: boolean) => {
    setToggling(id)
    try {
      const res = await fetch(`/api/dashboard/authorized-numbers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      })
      if (!res.ok) { toast.error('Error al cambiar estado'); return }
      setNumbers((prev) => prev.map((n) => n.id === id ? { ...n, is_active: !currentActive } : n))
    } catch {
      toast.error('Error de conexión')
    } finally {
      setToggling(null)
    }
  }

  /**
   * Cambia la sede de un número desde el propio listado.
   *
   * Es la vía por la que se arregla el parque viejo: hasta hoy el panel NUNCA escribía
   * `location_id`, así que todo lo que ya existe está en «sede desconocida» y todos los
   * domicilios de todas las sedes caen al mismo cubo.
   */
  const handleSedeChange = async (id: string, nuevaSede: string) => {
    const anterior = numbers.find((n) => n.id === id)?.location_id ?? null
    const valor = nuevaSede || null
    if (valor === anterior) return
    setMovingSede(id)
    // Optimista, pero se revierte si el servidor dice que no: dejar la pantalla afirmando
    // una sede que la base no guardó es peor que no haber hecho nada.
    setNumbers((prev) => prev.map((n) => (n.id === id ? { ...n, location_id: valor } : n)))
    try {
      const res = await fetch(`/api/dashboard/authorized-numbers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: valor }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNumbers((prev) => prev.map((n) => (n.id === id ? { ...n, location_id: anterior } : n)))
        toast.error(data.message || data.error || 'No se pudo cambiar la sede')
        return
      }
      toast.success(valor ? `Sus domicilios se atribuyen a ${sedeName(valor)}` : 'Queda sin sede')
    } catch {
      setNumbers((prev) => prev.map((n) => (n.id === id ? { ...n, location_id: anterior } : n)))
      toast.error('Error de conexión')
    } finally {
      setMovingSede(null)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar a "${name}"? Esta acción no se puede deshacer.`)) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/dashboard/authorized-numbers/${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Error al eliminar'); return }
      toast.success(`"${name}" eliminado`)
      setNumbers((prev) => prev.filter((n) => n.id !== id))
    } catch {
      toast.error('Error de conexión')
    } finally {
      setDeleting(null)
    }
  }

  // Los que no atribuyen nada. Solo se cuentan cuando la marca tiene 2+ sedes: con una
  // sola, «sin sede» y «la sede» nombran el mismo local y el aviso sería ruido.
  const sinSede = multiSede ? numbers.filter((n) => n.is_active && !n.location_id) : []

  return (
    <div className="space-y-6">
      <Toaster position="top-center" richColors />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" />
          Números Autorizados (Meseros)
        </h1>
        <Button onClick={() => setShowDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Agregar Mesero
        </Button>
      </div>

      {/* La sede del operador es la señal AUTENTICADA de la que sale la sede de un pedido
          (`resolveDeliveryLocation()`). Sin ella el domicilio entra igual —nunca se pierde
          un pedido por esto— pero queda sin atribuir a ningún local. */}
      {sinSede.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex flex-wrap items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-[16rem] flex-1">
              <p className="text-sm font-medium text-amber-900">
                {sinSede.length === 1
                  ? '1 número sin sede: sus domicilios no se atribuyen a ningún local'
                  : `${sinSede.length} números sin sede: sus domicilios no se atribuyen a ningún local`}
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                El pedido entra igual. Lo que se pierde es saber a qué sede iba. Elige la sede
                de cada uno en la columna «Sede» — nadie la adivina.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Meseros autorizados para registrar domicilios</CardTitle>
          <CardDescription>
            Solo los números en esta lista pueden enviar mensajes de WhatsApp para registrar pedidos de domicilio.
            {multiSede && ' La sede de cada número es la que se lleva el pedido que entre por ese celular.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : numbers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Aún no hay números autorizados</p>
              <p className="text-xs mt-1">Agrega el celular del mesero para que pueda registrar domicilios.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Número</TableHead>
                  {sedes.length > 0 && <TableHead>Sede</TableHead>}
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.name}</TableCell>
                    <TableCell className="font-mono text-sm">{formatPhone(n.phone)}</TableCell>
                    {sedes.length > 0 && (
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <MapPin
                            className={`h-3.5 w-3.5 shrink-0 ${n.location_id ? 'text-muted-foreground' : 'text-amber-600'}`}
                          />
                          <select
                            className={`h-8 rounded-md border bg-background px-2 text-xs ${
                              n.location_id ? '' : 'border-amber-400 text-amber-800'
                            }`}
                            value={n.location_id ?? ''}
                            disabled={movingSede === n.id}
                            onChange={(e) => handleSedeChange(n.id, e.target.value)}
                            aria-label={`Sede de ${n.name}`}
                          >
                            <option value="">Sin sede</option>
                            {sedes.map((l) => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </select>
                          {movingSede === n.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        </div>
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant={n.is_active ? 'default' : 'secondary'} className="text-[10px]">
                        {n.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {timeAgo(n.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleToggle(n.id, n.is_active)}
                          disabled={toggling === n.id}
                          title={n.is_active ? 'Desactivar' : 'Activar'}
                        >
                          {toggling === n.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : n.is_active ? (
                            <ToggleRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(n.id, n.name)}
                          disabled={deleting === n.id}
                          title="Eliminar"
                        >
                          {deleting === n.id ? (
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

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Agregar Mesero
            </DialogTitle>
            <DialogDescription>
              Ingresa el nombre y celular del mesero autorizado para registrar domicilios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Nombre
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
            {sedes.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Sede
                </Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={newLocationId}
                  onChange={(e) => setNewLocationId(e.target.value)}
                >
                  <option value="">Sin sede</option>
                  {sedes.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground">
                  {newLocationId
                    ? 'Los domicilios que entren por este celular se atribuyen a esa sede.'
                    : 'Sin sede, sus domicilios entran igual pero quedan sin atribuir a ningún local.'}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim() || !newPhone.trim()} className="gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creating ? 'Guardando...' : 'Agregar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
