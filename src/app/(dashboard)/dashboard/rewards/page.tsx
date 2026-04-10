'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Gift } from 'lucide-react'
import type { Reward } from '@/types/database.types'

export default function RewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/rewards')
      .then((res) => res.json())
      .then((data) => setRewards(Array.isArray(data) ? data : []))
      .catch(() => setRewards([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Gift className="h-6 w-6" />
        Recompensas
      </h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recompensas por Visitas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rewards.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No hay recompensas configuradas.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">Visita #</TableHead>
                  <TableHead>Recompensa</TableHead>
                  <TableHead>Mensaje WhatsApp</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rewards.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-center">
                      <Badge variant="default" className="text-lg px-3 py-1">
                        {r.visit_milestone}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {r.message_template}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={r.is_active ? 'default' : 'secondary'}>
                        {r.is_active ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
