'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  LOCATION_QUERY_PARAM,
  LOCATION_ALL,
  LOCATION_UNKNOWN,
  type LocationScopeView,
} from '@/lib/location-scope-shared'

const STORAGE_KEY = 'restaurantqr_location_selection'

interface LocationScopeContextType {
  /** `null` mientras carga, o si `/api/dashboard/location-scope` falló. */
  view: LocationScopeView | null
  loading: boolean
  /** La selección actual: `'all' | 'unknown' | <uuid>`. */
  selection: string
  setSelection: (value: string) => void
  /**
   * El query string a anexar a un `fetch('/api/dashboard/...')` para que la
   * ruta reciba `?location_id=` (multi-sede F7, §8.4). Vacío cuando la
   * selección es "all" — ausente ya significa "todas las que pueda ver".
   */
  queryParam: string
}

const LocationScopeContext = createContext<LocationScopeContextType>({
  view: null,
  loading: false,
  selection: LOCATION_ALL,
  setSelection: () => {},
  queryParam: '',
})

/**
 * Selección persistida por SESIÓN DE NAVEGADOR (localStorage), no en la URL —
 * el mismo patrón de `DemoContext`. La encuesta de F7 avisó que meter la sede
 * en `useSearchParams()` en el header forzaría un CSR bailout de todo
 * `(dashboard)`, que hoy no tiene `loading.tsx`/Suspense en ninguna página. El
 * transporte del spec (`?location_id=` sobre las rutas) sigue siendo literal:
 * viaja en la query string de cada `fetch()`, nunca en la barra de direcciones.
 */
export function LocationScopeProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<LocationScopeView | null>(null)
  const [loading, setLoading] = useState(true)
  const [selection, setSelectionState] = useState(LOCATION_ALL)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) setSelectionState(saved)
  }, [])

  const load = useCallback(async (currentSelection: string) => {
    setLoading(true)
    try {
      const qs = currentSelection === LOCATION_ALL ? '' : `?${LOCATION_QUERY_PARAM}=${encodeURIComponent(currentSelection)}`
      const res = await fetch(`/api/dashboard/location-scope${qs}`, { cache: 'no-store' })
      if (!res.ok) {
        // Un 403 aquí típicamente significa "la sede guardada ya no es válida"
        // (se desactivó, o el permiso cambió) — se cae a "all", que el servidor
        // siempre puede resolver (§5.1: sin selección válida, colapsa a lo
        // permitido).
        if (res.status === 403 && currentSelection !== LOCATION_ALL) {
          setSelectionState(LOCATION_ALL)
          localStorage.removeItem(STORAGE_KEY)
          return
        }
        setView(null)
        return
      }
      const data: LocationScopeView = await res.json()
      setView(data)
    } catch {
      setView(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(selection)
  }, [selection, load])

  const setSelection = useCallback((value: string) => {
    setSelectionState(value)
    if (value === LOCATION_ALL) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, value)
  }, [])

  const queryParam = selection === LOCATION_ALL ? '' : `${LOCATION_QUERY_PARAM}=${encodeURIComponent(selection)}`

  return (
    <LocationScopeContext.Provider value={{ view, loading, selection, setSelection, queryParam }}>
      {children}
    </LocationScopeContext.Provider>
  )
}

export function useLocationScope() {
  return useContext(LocationScopeContext)
}

export { LOCATION_ALL, LOCATION_UNKNOWN }
