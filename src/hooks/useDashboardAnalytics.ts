'use client'

import { useEffect, useState } from 'react'
import { useDemo } from '@/contexts/DemoContext'
import type { DashboardAnalytics } from '@/types/analytics.types'

export function useDashboardAnalytics() {
  const { isDemo, demoData, demoLoading, demoError } = useDemo()
  const [realData, setRealData] = useState<DashboardAnalytics | null>(null)
  const [realLoading, setRealLoading] = useState(false)
  const [realError, setRealError] = useState<string | null>(null)

  useEffect(() => {
    if (isDemo) return

    setRealLoading(true)
    setRealError(null)
    fetch('/api/dashboard/analytics')
      .then((res) => {
        if (!res.ok) throw new Error('Error cargando analytics')
        return res.json()
      })
      .then((data) => setRealData(data))
      .catch((err) => setRealError(err.message))
      .finally(() => setRealLoading(false))
  }, [isDemo])

  if (isDemo) {
    return {
      data: demoData,
      loading: demoLoading,
      error: demoError,
    }
  }

  return {
    data: realData,
    loading: realLoading,
    error: realError,
  }
}
