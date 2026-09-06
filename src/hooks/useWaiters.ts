'use client'

import { useState, useEffect } from 'react'

export interface Waiter {
  id: string
  name: string
}

export interface UseWaitersResult {
  waiters: Waiter[]
  loading: boolean
  error: string | null
  /**
   * El aparato no tiene sede, así que no hay lista que mostrar. Es un estado DISTINTO de
   * "no hay meseros" y de "falló la base", porque tiene un arreglo concreto y de una sola
   * vez: asignarle la sede al aparato en `/mesero`.
   */
  sedeSinAsignar: boolean
}

/**
 * Los meseros de la sede del aparato (§19).
 *
 * NUNCA devuelve "todos los de la marca". Si la sede no se puede resolver, la ruta responde
 * 409 y esto lo traduce a `sedeSinAsignar` — la lista se queda vacía a propósito. Textual del
 * dueño (2026-09-05): *"si metemos a todos de todas las sedes buscarse a la hora de entregar
 * premio es una focking bestialidad"*.
 *
 * `getAuthHeaders` viene de `useStaffAuth` y es un `useCallback` que solo cambia cuando cambia
 * la sesión: por eso puede ir en las dependencias sin provocar un bucle de peticiones.
 */
export function useWaiters(
  getAuthHeaders: () => Record<string, string>,
  enabled: boolean
): UseWaitersResult {
  const [waiters, setWaiters] = useState<Waiter[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sedeSinAsignar, setSedeSinAsignar] = useState(false)

  useEffect(() => {
    if (!enabled) return

    // Una respuesta que llega después de que el componente se desmontó (o de que la sesión
    // cambió) no debe pisar el estado nuevo: en la pantalla del mesero eso se vería como una
    // lista que "vuelve" a la de la sede anterior.
    let cancelado = false

    const cargar = async () => {
      setLoading(true)
      setError(null)
      setSedeSinAsignar(false)
      try {
        const res = await fetch('/api/staff/waiters', { headers: getAuthHeaders() })
        const data = await res.json()
        if (cancelado) return
        if (!res.ok) {
          if (data.code === 'sede_no_asignada') {
            setSedeSinAsignar(true)
            setWaiters([])
          } else {
            setError(data.message || 'No pudimos cargar los meseros')
          }
          return
        }
        setWaiters(data.waiters ?? [])
      } catch {
        if (!cancelado) setError('Error de conexión')
      } finally {
        if (!cancelado) setLoading(false)
      }
    }

    cargar()
    return () => {
      cancelado = true
    }
  }, [getAuthHeaders, enabled])

  return { waiters, loading, error, sedeSinAsignar }
}
