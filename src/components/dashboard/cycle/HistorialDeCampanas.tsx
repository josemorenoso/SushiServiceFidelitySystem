'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLocationScope } from '@/contexts/LocationScopeContext'
import { leerJson } from '@/lib/cycle-screen'

interface Campaign {
  id: string
  name: string
  type: string
  status: string
  total_sent: number
  executed_at: string | null
  created_at: string
}

const statusLabels: Record<string, string> = {
  completed: 'Finalizada',
  running: 'En curso',
  draft: 'Borrador',
  failed: 'Fallida',
}

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  running: 'secondary',
  draft: 'outline',
  failed: 'destructive',
}

const typeLabels: Record<string, string> = {
  birthday: 'Cumpleaños',
  reactivation: 'Reactivación',
  manual: 'Manual',
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'lista'; campanas: Campaign[] }

/**
 * El historial de campañas (la pestaña «Historial», tal como era). Se monta solo cuando el
 * dueño abre la pestaña, así que no se lee nada que no se vaya a ver.
 *
 * Multi-sede F7 (§8.4): `campaigns.location_id` la deja NULL cualquier escritor hoy, así que el
 * filtro por sede es un no-op para el `role='brand'` y queda listo para cuando F6 lo llene.
 *
 * Un fallo al leer ya no se ve como «No hay campañas ejecutadas»: dice que no se pudo leer.
 */
export function HistorialDeCampanas() {
  const { queryParam } = useLocationScope()
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [lectura, setLectura] = useState(0)
  const url = queryParam ? `/api/dashboard/campaigns?${queryParam}` : '/api/dashboard/campaigns'

  useEffect(() => {
    let activo = true
    // La ruta contesta un ARREGLO (no un objeto): se lee como `unknown` y se valida.
    leerJson<unknown>(url, 'No pudimos leer el historial de campañas ahora mismo.').then((r) => {
      if (!activo) return
      if (!r.ok) setEstado({ tipo: 'error', mensaje: r.mensaje })
      else setEstado({ tipo: 'lista', campanas: Array.isArray(r.datos) ? (r.datos as Campaign[]) : [] })
    })
    return () => {
      activo = false
    }
  }, [url, lectura])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Historial de campañas</CardTitle>
      </CardHeader>
      <CardContent>
        {estado.tipo === 'cargando' && (
          <div className="space-y-3" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {estado.tipo === 'error' && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-red-800">
              {estado.mensaje}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEstado({ tipo: 'cargando' })
                setLectura((n) => n + 1)
              }}
            >
              Reintentar
            </Button>
          </div>
        )}

        {estado.tipo === 'lista' &&
          (estado.campanas.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Aún no hay campañas ejecutadas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaña</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Enviados</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estado.campanas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{typeLabels[c.type] ?? c.type}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={statusColors[c.status] ?? 'secondary'}>{statusLabels[c.status] ?? c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-center font-semibold">{c.total_sent}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(c.executed_at ?? c.created_at).toLocaleDateString('es-CO')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ))}
      </CardContent>
    </Card>
  )
}
