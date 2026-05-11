'use client'

import { useEffect, useState, useCallback } from 'react'
import { useDemo } from '@/contexts/DemoContext'
import type { DashboardAnalytics } from '@/types/analytics.types'

export function useDashboardAnalytics() {
  const { isDemo, demoData, demoLoading, demoError } = useDemo()
  const [realData, setRealData] = useState<DashboardAnalytics | null>(null)
  const [realLoading, setRealLoading] = useState(false)
  const [realError, setRealError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (isDemo) return

    const load = () => {
      fetch('/api/dashboard/analytics', { cache: 'no-store' })
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
  }, [isDemo, refreshKey])

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
