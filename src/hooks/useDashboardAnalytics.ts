'use client'

import { useEffect, useState, useCallback } from 'react'
import { useDemo } from '@/contexts/DemoContext'
import { useLocationScope } from '@/contexts/LocationScopeContext'
import type { DashboardAnalytics } from '@/types/analytics.types'

export function useDashboardAnalytics() {
  const { isDemo, demoData, demoLoading, demoError } = useDemo()
  const { queryParam } = useLocationScope()
  // Los datos van con la selección PARA la que se pidieron (sedes separadas, parte 1): con otra
  // sede elegida no se devuelven. Sin esto, al cambiar de Envigado a Laureles el panel mostraba
  // un momento los números de Envigado bajo el nombre de Laureles.
  const [realData, setRealData] = useState<{ para: string; data: DashboardAnalytics } | null>(null)
  const [realLoading, setRealLoading] = useState(false)
  const [realError, setRealError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (isDemo) return

    // Multi-sede F7 (§8.4): `queryParam` trae `location_id=…` cuando el
    // selector del header eligió algo distinto de "Toda la marca". Ausente
    // por defecto — el servidor colapsa eso a "todo lo que este usuario puede
    // ver" (`requireLocationScope`), nunca a "toda la marca sin filtrar".
    const url = queryParam ? `/api/dashboard/analytics?${queryParam}` : '/api/dashboard/analytics'
    // Una respuesta que llega después de cambiar de sede (o de desmontar) se descarta: no puede
    // pisar la de la sede que está elegida ahora.
    let vigente = true

    const load = () => {
      fetch(url, { cache: 'no-store' })
        .then((res) => {
          if (!res.ok) throw new Error('Error cargando analytics')
          return res.json()
        })
        .then((data: DashboardAnalytics) => {
          if (!vigente) return
          setRealData({ para: queryParam, data })
          setRealError(null)
        })
        .catch((err) => {
          if (vigente) setRealError(err.message)
        })
        .finally(() => {
          if (vigente) setRealLoading(false)
        })
    }

    setRealLoading(true)
    setRealError(null)
    load()

    const interval = setInterval(load, 60_000)
    return () => {
      vigente = false
      clearInterval(interval)
    }
  }, [isDemo, refreshKey, queryParam])

  if (isDemo) {
    return {
      data: demoData,
      loading: demoLoading,
      error: demoError,
      refetch,
    }
  }

  return {
    data: realData && realData.para === queryParam ? realData.data : null,
    loading: realLoading,
    error: realError,
    refetch,
  }
}
