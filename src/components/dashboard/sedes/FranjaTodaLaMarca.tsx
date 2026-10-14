'use client'

import { usePathname } from 'next/navigation'
import { Store } from 'lucide-react'
import { useLocationScope } from '@/contexts/LocationScopeContext'
import { useTarjetaPorSede } from '@/hooks/useTarjetaPorSede'
import { esPantallaDeTodaLaMarca, fraseTodaLaMarca } from '@/lib/panel-sedes'

/**
 * La franja «Esto es de toda la marca: lo ven y lo usan las N sedes» (sedes separadas,
 * parte 1, 2026-10-14).
 *
 * Va debajo del encabezado, en las pantallas que son de toda la marca (Tarjeta principal,
 * Plantillas, Conexiones, Golden Bullet, QR Studio, Ajustes: `PANTALLAS_DE_TODA_LA_MARCA`).
 * Ahí el selector de sede se vuelve una etiqueta quieta; esta línea dice por qué, en
 * palabras del dueño. Con 0 o 1 sede no se dibuja: no hay nada que aclarar.
 */
export function FranjaTodaLaMarca() {
  const pathname = usePathname()
  const { view } = useLocationScope()
  // «Tarjeta principal» con una tarjeta por sede no es de toda la marca (parte 2, 2026-10-14).
  const tarjetaPorSede = useTarjetaPorSede()
  if (!view?.multiSede || !esPantallaDeTodaLaMarca(pathname, { tarjetaPorSede })) return null
  return <VistaFranjaTodaLaMarca sedes={view.brandLocationCount} />
}

/** La franja sin estado (se prueba dibujada). */
export function VistaFranjaTodaLaMarca({ sedes }: { sedes: number }) {
  return (
    <div
      role="note"
      className="flex items-center gap-2 border-b px-5 py-2 text-sm"
      style={{ background: 'rgba(var(--brand-primary-rgb), 0.06)', color: 'var(--brand-ink-soft)' }}
    >
      <Store className="h-4 w-4 shrink-0" style={{ color: 'var(--brand-primary-end)' }} strokeWidth={1.75} />
      <span>{fraseTodaLaMarca(sedes)}</span>
    </div>
  )
}
