'use client'

/**
 * Contexto de marca por-tenant para componentes cliente.
 *
 * El root layout resuelve la marca por dominio (server-side) y la inyecta acá.
 * Los componentes cliente leen con `useBranding()` en vez de importar constantes
 * de entorno, así cada tenant ve SU marca sin rebuild.
 */

import { createContext, useContext } from 'react'
import { DEFAULT_BRANDING, type Branding } from './branding'

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING)

export function BrandingProvider({
  value,
  children,
}: {
  value: Branding
  children: React.ReactNode
}) {
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

/** Marca del tenant actual (resuelta por dominio). Fallback: DEFAULT_BRANDING. */
export function useBranding(): Branding {
  return useContext(BrandingContext)
}
