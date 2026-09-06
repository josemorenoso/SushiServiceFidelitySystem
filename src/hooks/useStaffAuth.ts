'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Sesión del escáner.
 *
 * §19 (dueño, 2026-09-05): el celular es DEL LOCAL. Hay un solo login, el del aparato, y se
 * hace una vez en su vida — textual: *"si lo hacemos por mesero hay que estar pendiente de
 * que cierren y abran sesión no tiene sentido alguno"*. Por eso este hook YA NO EXPONE
 * `login()`: el login por mesero desapareció junto con `/api/staff/login`.
 *
 * El tipo `'staff'` sobrevive solo para los JWT que sigan vivos cuando esto se despliegue
 * (duran 8 h). No se emiten más.
 */
export interface StaffSession {
  type: 'staff' | 'device'
  name: string
  token?: string
  /**
   * Sede del aparato. `null` = sin asignar, y la pantalla lo trata como un paso pendiente:
   * sin sede no hay lista de meseros, y NUNCA se cae a "todos los de todas las sedes".
   */
  locationId: string | null
  /** Nombre de la sede, para mostrar. `null` cuando no hay sede o no se pudo leer. */
  locationName: string | null
}

const STORAGE_KEY = 'staff_session'
const DEVICE_KEY = 'staff_device_token'

export function useStaffAuth() {
  const [session, setSession] = useState<StaffSession | null>(null)
  const [loading, setLoading] = useState(true)

  const verifySession = useCallback(async () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const deviceToken = localStorage.getItem(DEVICE_KEY)

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { token: string; name: string }
        const res = await fetch('/api/staff/me', {
          headers: { Authorization: `Bearer ${parsed.token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setSession({
            type: 'staff',
            name: parsed.name,
            token: parsed.token,
            locationId: data.staff?.location_id ?? null,
            locationName: null,
          })
          setLoading(false)
          return
        }
      } catch {
        // fall through
      }
    }

    if (deviceToken) {
      try {
        const res = await fetch('/api/staff/me', {
          headers: { 'X-Device-Token': deviceToken },
        })
        if (res.ok) {
          const data = await res.json()
          setSession({
            type: 'device',
            name: data.device?.name || 'Celular del local',
            locationId: data.device?.location_id ?? null,
            locationName: data.device?.location_name ?? null,
          })
          setLoading(false)
          return
        }
      } catch {
        // fall through
      }
    }

    setSession(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    verifySession()
  }, [verifySession])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(DEVICE_KEY)
    setSession(null)
  }, [])

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (session?.type === 'staff' && session.token) {
      return { Authorization: `Bearer ${session.token}` }
    }
    const deviceToken = localStorage.getItem(DEVICE_KEY)
    if (deviceToken) {
      return { 'X-Device-Token': deviceToken }
    }
    return {}
  }, [session])

  return { session, loading, logout, verifySession, getAuthHeaders }
}
