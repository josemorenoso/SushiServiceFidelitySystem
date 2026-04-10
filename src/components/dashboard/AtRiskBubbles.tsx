'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { AlertTriangle, Send } from 'lucide-react'
import type { RiskGroup } from '@/types/analytics.types'

interface AtRiskBubblesProps {
  groups: RiskGroup[]
  loading: boolean
  isDemo: boolean
}

export function AtRiskBubbles({ groups, loading, isDemo }: AtRiskBubblesProps) {
  const [selected, setSelected] = useState<RiskGroup | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const maxCount = Math.max(...groups.map((g) => g.count), 1)
  const totalAtRisk = groups.reduce((sum, g) => sum + g.count, 0)

  const groupStats = useMemo(() => {
    return groups.map((g) => {
      const avgVisits = g.customers.length > 0
        ? Math.round(g.customers.reduce((s, c) => s + c.total_visits, 0) / g.customers.length)
        : 0
      const avgDays = g.customers.length > 0
        ? Math.round(g.customers.reduce((s, c) => s + c.daysInactive, 0) / g.customers.length)
        : 0
      return { ...g, avgVisits, avgDays }
    })
  }, [groups])

  const handleSendCampaign = async () => {
    if (!selected) return
    setSending(true)
    if (isDemo) {
      await new Promise((r) => setTimeout(r, 1500))
      setSent(true)
      setSending(false)
      return
    }
    try {
      await fetch('/api/dashboard/campaigns/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riskLevel: selected.level,
          daysRange: selected.daysRange,
          customerCount: selected.count,
        }),
      })
      setSent(true)
    } catch {
      // best effort
    } finally {
      setSending(false)
    }
  }

  const handleClose = () => {
    setSelected(null)
    setSent(false)
    setSending(false)
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            Clientes en Riesgo
            <span className="text-sm font-normal text-muted-foreground">
              ({totalAtRisk})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <div className="flex items-end justify-center gap-8 py-6 min-h-[260px]">
              {groupStats.map((group) => {
                const size = Math.max(64, (group.count / maxCount) * 180)
                return (
                  <button
                    key={group.level}
                    onClick={() => group.count > 0 && setSelected(group)}
                    className="flex flex-col items-center gap-3 group transition-transform hover:scale-105 focus:outline-none"
                    disabled={group.count === 0}
                  >
                    <div
                      className="rounded-full flex flex-col items-center justify-center font-bold text-white transition-all duration-500 shadow-lg group-hover:shadow-2xl cursor-pointer relative"
                      style={{
                        width: `${size}px`,
                        height: `${size}px`,
                        backgroundColor: group.color,
                        opacity: group.count === 0 ? 0.15 : 1,
                      }}
                    >
                      <span style={{ fontSize: `${Math.max(20, size / 3.5)}px` }}>
                        {group.count}
                      </span>
                      {group.count > 0 && size >= 80 && (
                        <span className="text-[10px] font-normal opacity-80">clientes</span>
                      )}
                    </div>
                    <div className="text-center space-y-0.5">
                      <p className="text-sm font-semibold">{group.level}</p>
                      <p className="text-xs text-muted-foreground">{group.daysRange}</p>
                      {group.count > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          ~{group.avgVisits} visitas · ~{group.avgDays}d inactivo
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center mt-2">
            Toca una burbuja para ver los clientes y enviar campaña de reactivación
          </p>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: selected?.color }}
              />
              Campaña para: {selected?.level}
            </DialogTitle>
            <DialogDescription>
              {selected?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm">
                <strong>{selected?.count}</strong> clientes con <strong>{selected?.daysRange}</strong> sin visitar
              </p>
              {selected?.customers && selected.customers.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {selected.customers.map((c) => (
                    <div key={c.id} className="flex justify-between text-xs text-muted-foreground">
                      <span>{c.name}</span>
                      <span>{c.daysInactive} días · {c.total_visits} visitas</span>
                    </div>
                  ))}
                  {selected.count > selected.customers.length && (
                    <p className="text-xs text-muted-foreground italic">
                      ...y {selected.count - selected.customers.length} más
                    </p>
                  )}
                </div>
              )}
            </div>
            {sent && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                {isDemo
                  ? '(Demo) Campaña simulada exitosamente'
                  : 'Campaña de reactivación enviada al grupo'}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cerrar</Button>
            {!sent && (
              <Button onClick={handleSendCampaign} disabled={sending} className="gap-2">
                <Send className="h-4 w-4" />
                {sending ? 'Enviando...' : `Enviar WhatsApp a ${selected?.count ?? 0} clientes`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
