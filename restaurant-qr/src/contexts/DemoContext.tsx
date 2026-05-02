'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { DashboardAnalytics, DemoCustomer } from '@/types/analytics.types'
import { computeDemoAnalytics } from '@/lib/demo-analytics'

interface DemoContextType {
  isDemo: boolean
  toggleDemo: () => void
  demoData: DashboardAnalytics | null
  demoLoading: boolean
  demoError: string | null
}

const DemoContext = createContext<DemoContextType>({
  isDemo: false,
  toggleDemo: () => {},
  demoData: null,
  demoLoading: false,
  demoError: null,
})

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(false)
  const [demoData, setDemoData] = useState<DashboardAnalytics | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState<string | null>(null)

  const loadDemoData = useCallback(async () => {
    setDemoLoading(true)
    setDemoError(null)
    try {
      const res = await fetch('/demo-data.json')
      if (!res.ok) throw new Error('No se encontró demo-data.json')
      const customers: DemoCustomer[] = await res.json()
      if (!Array.isArray(customers) || customers.length === 0) {
        throw new Error('demo-data.json está vacío. Genera los datos de demostración primero.')
      }
      const analytics = computeDemoAnalytics(customers)
      setDemoData(analytics)
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : 'Error cargando datos demo')
      setDemoData(null)
    } finally {
      setDemoLoading(false)
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('restaurantqr_demo')
    if (saved === 'true') {
      setIsDemo(true)
      loadDemoData()
    }
  }, [loadDemoData])

  const toggleDemo = useCallback(() => {
    setIsDemo((prev) => {
      const next = !prev
      localStorage.setItem('restaurantqr_demo', String(next))
      if (next) loadDemoData()
      else setDemoData(null)
      return next
    })
  }, [loadDemoData])

  return (
    <DemoContext.Provider value={{ isDemo, toggleDemo, demoData, demoLoading, demoError }}>
      {children}
    </DemoContext.Provider>
  )
}

export function useDemo() {
  return useContext(DemoContext)
}
