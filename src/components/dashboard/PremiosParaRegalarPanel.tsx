'use client'

/**
 * Recompensas › Premios para regalar (S-1, 2026-10-13).
 *
 * Junta en UN lugar lo que antes vivía en tres: el catálogo (era la pestaña «Premios» de
 * Campañas), los selectores de «qué premio regala cada mensaje» (eran dos bloques de Ajustes) y,
 * por separado en la pestaña Invitaciones, el premio de cada invitación.
 *
 * Este panel es el único que lee: el catálogo completo (activos y retirados, para poder avisar
 * cuando un selector apunta a uno que ya no sirve) y los ajustes de la marca. Los dos hijos
 * reciben los datos ya leídos, así que crear o retirar un premio abajo se ve de inmediato arriba.
 *
 * Una lectura que FALLA se dice. Un fallo de base no se muestra como «no hay premios» ni deja un
 * selector vacío: vacío quiere decir «la marca no eligió premio», que es otra cosa.
 */

import { useCallback, useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { CampaignReward } from '@/types/database.types'
import { CampaignRewardsCatalog } from '@/components/dashboard/CampaignRewardsCatalog'
import { RewardUsageSelectors } from '@/components/dashboard/RewardUsageSelectors'

export function PremiosParaRegalarPanel() {
  const [rewards, setRewards] = useState<CampaignReward[]>([])
  const [rewardsLoading, setRewardsLoading] = useState(true)
  const [rewardsError, setRewardsError] = useState(false)

  const [ajustes, setAjustes] = useState<Record<string, string> | null>(null)
  const [ajustesError, setAjustesError] = useState(false)

  // Los premios son de la MARCA: un administrador de sede los ve y no los toca. Es lo mismo que
  // hace `RewardsLevelsPanel` con los niveles; la ruta lo hace cumplir (`exigirAlcanceDeMarca()`)
  // y esto es la mitad de la pantalla: no ofrecerle botones que van a responder 403.
  const [soloLectura, setSoloLectura] = useState(false)

  const cargarCatalogo = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/campaign-rewards')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: unknown = await res.json()
      if (!Array.isArray(data)) throw new Error('respuesta inesperada')
      setRewards(data as CampaignReward[])
      setRewardsError(false)
    } catch {
      setRewardsError(true)
    } finally {
      setRewardsLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargarCatalogo()
  }, [cargarCatalogo])

  useEffect(() => {
    fetch('/api/dashboard/settings')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data: unknown = await r.json()
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('respuesta inesperada')
        setAjustes(data as Record<string, string>)
      })
      .catch(() => setAjustesError(true))
  }, [])

  useEffect(() => {
    fetch('/api/dashboard/locations')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.role === 'location') setSoloLectura(true)
      })
      .catch(() => { /* sin la respuesta, la pantalla se comporta como siempre: la ruta decide */ })
  }, [])

  return (
    <div className="space-y-8">
      {rewardsError || ajustesError ? (
        <p className="rounded-lg border border-destructive/40 p-4 text-sm font-medium text-destructive">
          No se pudo leer {rewardsError ? 'el catálogo de premios' : 'la configuración de la marca'}. Recarga la
          página; si sigue igual, avísanos. No significa que no hayas elegido premios: por eso no se muestran los
          selectores.
        </p>
      ) : ajustes === null || rewardsLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <RewardUsageSelectors rewards={rewards} ajustes={ajustes} soloLectura={soloLectura} />
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Catálogo de premios para regalar</h2>
        <CampaignRewardsCatalog
          rewards={rewards}
          loading={rewardsLoading}
          loadError={rewardsError}
          soloLectura={soloLectura}
          onChanged={cargarCatalogo}
        />
      </div>
    </div>
  )
}
