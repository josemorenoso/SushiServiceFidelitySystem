'use client'

/**
 * Recompensas — una sola pantalla con tres pestañas.
 *
 * · Niveles y premios — lo que ganan por puntos (lo que siempre estuvo acá).
 * · Invitaciones — un enlace o QR que regala algo a quien se registre
 *   (docs/features/invite-campaigns.md).
 * · Redenciones — lo que el mesero entregó, con mesa y nombre. Antes era una
 *   página aparte; `/dashboard/redemptions` sigue funcionando y redirige acá.
 *
 * La pestaña inicial se lee de `?tab=` con `window.location`, NO con
 * `useSearchParams()`: en esta versión de Next fuerza el CSR bailout (ver la
 * trampa en CLAUDE.md). Es la misma razón por la que el selector de sede vive
 * en localStorage. Se lee con `useSyncExternalStore` y no con un `useEffect` +
 * `setState`: así el servidor pinta «niveles», el cliente hidrata sin choque y
 * después aplica la de la URL — sin el render en cascada que la regla de hooks
 * marca como error.
 */

import { useState, useSyncExternalStore } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Gift } from 'lucide-react'
import { RewardsLevelsPanel } from '@/components/dashboard/RewardsLevelsPanel'
import { InviteCampaignsPanel } from '@/components/dashboard/InviteCampaignsPanel'
import { RedemptionsPanel } from '@/components/dashboard/RedemptionsPanel'

const TABS = new Set(['niveles', 'invitaciones', 'redenciones'])

const noSubscribe = () => () => {}
const leerTabDeUrl = () => {
  try {
    return new URLSearchParams(window.location.search).get('tab')
  } catch {
    return null
  }
}

export default function RewardsPage() {
  // La URL no cambia mientras la página vive, así que no hay a qué suscribirse;
  // lo que importa es el par cliente/servidor de snapshots.
  const tabDeUrl = useSyncExternalStore(noSubscribe, leerTabDeUrl, () => null)
  const [elegida, setTab] = useState<string | null>(null)
  const tab = elegida ?? (tabDeUrl && TABS.has(tabDeUrl) ? tabDeUrl : 'niveles')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Gift className="h-6 w-6" />
        Recompensas
      </h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="niveles">Niveles y premios</TabsTrigger>
          <TabsTrigger value="invitaciones">Invitaciones</TabsTrigger>
          <TabsTrigger value="redenciones">Redenciones</TabsTrigger>
        </TabsList>

        <TabsContent value="niveles" className="mt-4">
          <RewardsLevelsPanel />
        </TabsContent>
        <TabsContent value="invitaciones" className="mt-4">
          <InviteCampaignsPanel />
        </TabsContent>
        <TabsContent value="redenciones" className="mt-4">
          <RedemptionsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
