'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Star, Megaphone, AlertTriangle } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { WhatsappCard } from './WhatsappCard'
import { ProximamenteCard } from './ProximamenteCard'
import type { ConnectionsResponse, LineBudgetResponse } from './types'

/**
 * El cuerpo del apartado Conexiones.
 *
 * ⚠️ **NO usa `useLocationScope()`, y es a propósito.** La línea de WhatsApp es de la
 * MARCA y la comparten todas las sedes (D6, re-cerrada el 2026-09-07). Si esta pantalla
 * se filtrara por el selector de sede del encabezado, elegir una sede escondería la línea
 * y el cliente creería que no tiene WhatsApp. El ámbito es marca **siempre**.
 *
 * Dos peticiones, a propósito separadas: el estado de las conexiones sale de
 * `/api/dashboard/conexiones` y la salud de la línea de `/api/dashboard/line-budget`, que
 * ya existía y **no se toca**. Si el cupo falla, la tarjeta sigue diciendo por qué número
 * sale el WhatsApp — que es lo que el cliente vino a ver.
 */
export function ConexionesPanel() {
  const [data, setData] = useState<ConnectionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [budget, setBudget] = useState<LineBudgetResponse | null>(null)
  const [budgetLoading, setBudgetLoading] = useState(true)

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/conexiones')
      const json: ConnectionsResponse = await res.json()
      setData(res.ok ? json : { available: false, error: json.error ?? 'No se pudo cargar' })
    } catch {
      setData({ available: false, error: 'No se pudo cargar el estado de las conexiones' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchConnections()
  }, [fetchConnections])

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard/line-budget')
      .then((r) => r.json())
      .then((json: LineBudgetResponse) => {
        if (!cancelled) setBudget(json)
      })
      .catch(() => {
        if (!cancelled) setBudget(null)
      })
      .finally(() => {
        if (!cancelled) setBudgetLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleAutoReply = useCallback(async (enabled: boolean) => {
    const res = await fetch('/api/dashboard/conexiones/whatsapp/auto-respuesta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error ?? 'No se pudo guardar')
      return
    }
    // Se refleja el valor que confirmó el SERVIDOR, no el que se pidió: si la escritura
    // se cayó a mitad, la pantalla no puede quedar diciendo lo contrario de la base.
    setData((prev) =>
      prev?.whatsapp
        ? { ...prev, whatsapp: { ...prev.whatsapp, autoReplyEnabled: json.autoReplyEnabled } }
        : prev
    )
    toast.success(enabled ? 'Respuesta automática activada' : 'Respuesta automática apagada')
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-52 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full rounded-3xl" />
      </div>
    )
  }

  if (!data?.available || !data.whatsapp || !data.permissions) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex items-start gap-3 p-6">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--brand-ink-muted)' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--brand-ink)' }}>
              No hay conexiones que mostrar
            </p>
            <p className="text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
              {data?.error ?? 'Esta sesión no está asociada a ninguna marca.'}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Toaster position="top-center" richColors />

      <WhatsappCard
        whatsapp={data.whatsapp}
        permissions={data.permissions}
        connection={data.connection ?? null}
        budget={budget}
        budgetLoading={budgetLoading}
        onToggleAutoReply={toggleAutoReply}
        onConnectionChanged={fetchConnections}
      />

      <ProximamenteCard
        icon={Star}
        title="Google"
        description="Responder las reseñas de tu negocio sin salir de aquí."
      />
      <ProximamenteCard
        icon={Megaphone}
        title="Meta"
        description="Publicar y medir campañas de Facebook e Instagram."
      />
    </div>
  )
}
