'use client'

import { useEffect, useState, useCallback } from 'react'
import { useDemo } from '@/contexts/DemoContext'
import { useLocationScope } from '@/contexts/LocationScopeContext'
import type { DashboardAnalytics } from '@/types/analytics.types'

export function useDashboardAnalytics() {
  const { isDemo, demoData, demoLoading, demoError } = useDemo()
  const { queryParam } = useLocationScope()
  const [realData, setRealData] = useState<DashboardAnalytics | null>(null)
  const [realLoading, setRealLoading] = useState(false)
  const [realError, setRealError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (isDemo) return

    // Multi-sede F7 (§8.4): `queryParam` trae `location_id=…` cuando el
    // selector del header eligió algo distinto de "Todas las sedes". Ausente
    // por defecto — el servidor colapsa eso a "todo lo que este usuario puede
    // ver" (`requireLocationScope`), nunca a "toda la marca sin filtrar".
    const url = queryParam ? `/api/dashboard/analytics?${queryParam}` : '/api/dashboard/analytics'

    const load = () => {
      fetch(url, { cache: 'no-store' })
        .then((res) => {
          if (!res.ok) throw new Error('Error cargando analytics')
          return res.json()
        })
        .then((data) => setRealData(data))
        .catch((err) => setRealError(err.message))
        .finally(() => setRealLoading(false))
    }

    setRealLoading(true)
    setRealError(null)
    load()

    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
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
    data: realData,
    loading: realLoading,
    error: realError,
    refetch,
  }
}
