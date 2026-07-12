'use client'

import { useState, useEffect, useCallback } from 'react'

export interface StaffSession {
  type: 'staff' | 'device'
  name: string
  token?: string
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
          setSession({ type: 'staff', name: parsed.name, token: parsed.token })
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
          setSession({ type: 'device', name: data.device?.name || 'Dispositivo del local' })
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

  const login = useCallback(async (phone: string, pin: string) => {
    const res = await fetch('/api/staff/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, pin }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Error de login')

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: data.token, name: data.staff.name }))
    setSession({ type: 'staff', name: data.staff.name, token: data.token })
    return data
  }, [])

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

  return { session, loading, login, logout, verifySession, getAuthHeaders }
}
