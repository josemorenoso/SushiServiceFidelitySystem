'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Megaphone, Cake, UserX, Send, Zap, Clock, CheckCircle, SlidersHorizontal } from 'lucide-react'
import { ManualCampaigns } from '@/components/dashboard/ManualCampaigns'
import { TwilioWallet } from '@/components/dashboard/TwilioWallet'

interface Campaign {
  id: string
  name: string
  type: string
  status: string
  total_sent: number
  executed_at: string | null
  created_at: string
}

const autoCampaigns = [
  {
    type: 'birthday',
    label: 'Cumpleaños',
    icon: Cake,
    color: 'text-pink-600',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    description: 'Envía un saludo automático a los clientes que cumplen años hoy.',
    cron: 'Diario a las 8:00 AM',
    template: '¡Feliz cumpleaños {{name}}! 🎂 Te esperamos hoy con un regalo especial en Sushi Service 🍣',
  },
  {
    type: 'reactivation',
    label: 'Reactivación',
    icon: UserX,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    description: 'Recupera clientes que no han visitado en más de 21 días.',
    cron: 'Diario a las 10:00 AM',
    template: '¡Hola {{name}}! 👋 Te extrañamos en Sushi Service. Vuelve pronto, tenemos algo especial para ti 🍣',
  },
]

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [manualDialog, setManualDialog] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/campaigns')
      .then((res) => res.json())
      .then((data) => setCampaigns(Array.isArray(data) ? data : []))
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false))
  }, [])

  const handleManualCampaign = async (type: string) => {
    setSending(true)
    try {
      const endpoint = type === 'birthday' ? '/api/cron/birthday' : '/api/cron/reactivation'
      await fetch(endpoint, { method: 'POST' })
      setSent(type)
      setTimeout(() => {
        fetch('/api/dashboard/campaigns')
          .then((res) => res.json())
          .then((data) => setCampaigns(Array.isArray(data) ? data : []))
      }, 1000)
    } catch {
      // best effort
    } finally {
      setSending(false)
    }
  }

  const typeLabels: Record<string, string> = {
    birthday: 'Cumpleaños',
    reactivation: 'Reactivación',
    manual: 'Manual',
  }

  const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    completed: 'default',
    running: 'secondary',
    draft: 'outline',
    failed: 'destructive',
  }

  const recentByType = (type: string) =>
    campaigns.filter((c) => c.type === type).slice(0, 1)[0]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Megaphone className="h-6 w-6" />
        Campañas
      </h1>

      <div className="grid gap-4 md:grid-cols-2">
        {autoCampaigns.map((ac) => {
          const recent = recentByType(ac.type)
          return (
            <Card key={ac.type} className={`border ${ac.border}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className={`rounded-lg p-1.5 ${ac.bg}`}>
                      <ac.icon className={`h-4 w-4 ${ac.color}`} />
                    </div>
                    {ac.label}
                  </CardTitle>
                  <Badge variant="outline" className="gap-1">
                    <Zap className="h-3 w-3" />
                    Automática
                  </Badge>
                </div>
                <CardDescription>{ac.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Frecuencia: {ac.cron}</span>
                  </div>
                  <p className="text-muted-foreground italic">&quot;{ac.template}&quot;</p>
                </div>

                {recent && (
                  <div className="flex items-center justify-between rounded-lg border p-2 text-xs">
                    <span className="text-muted-foreground">Última ejecución:</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusColors[recent.status] ?? 'secondary'} className="text-xs">
                        {recent.status}
                      </Badge>
                      <span className="font-semibold">{recent.total_sent} enviados</span>
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => setManualDialog(ac.type)}
                >
                  <Send className="h-3.5 w-3.5" />
                  Ejecutar Ahora
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <TwilioWallet />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" />
          Campañas Manuales
        </h2>
        <ManualCampaigns />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Historial de Campañas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No hay campañas ejecutadas aún. Usa los botones de arriba o espera los cron jobs automáticos.
            </p>
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
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {typeLabels[c.type] ?? c.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={statusColors[c.status] ?? 'secondary'}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-semibold">
                      {c.total_sent}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.executed_at
                        ? new Date(c.executed_at).toLocaleDateString('es-CO')
                        : new Date(c.created_at).toLocaleDateString('es-CO')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!manualDialog} onOpenChange={() => { setManualDialog(null); setSent(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ejecutar campaña: {manualDialog === 'birthday' ? 'Cumpleaños' : 'Reactivación'}
            </DialogTitle>
            <DialogDescription>
              {manualDialog === 'birthday'
                ? 'Se enviará un mensaje de WhatsApp a todos los clientes que cumplen años hoy.'
                : 'Se enviará un mensaje de WhatsApp a todos los clientes inactivos (21+ días).'}
            </DialogDescription>
          </DialogHeader>
          {sent && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Campaña ejecutada exitosamente.
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setManualDialog(null); setSent(null) }}>
              Cerrar
            </Button>
            {!sent && (
              <Button
                onClick={() => manualDialog && handleManualCampaign(manualDialog)}
                disabled={sending}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                {sending ? 'Enviando...' : 'Confirmar y Enviar'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
