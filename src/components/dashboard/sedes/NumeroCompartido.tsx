'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { useLocationScope } from '@/contexts/LocationScopeContext'
import { lineaNumeroCompartido } from '@/lib/panel-sedes'

/**
 * «Las dos sedes comparten el WhatsApp {número} ({Twilio o Zernio}). Un número propio para cada
 * sede: próximamente.» — para «Mis sedes» (sedes separadas, parte 1, 2026-10-14).
 *
 * El dueño: *«Comparte número y datos sí, perfecto, pero hay cosas que son de cada sede»*. El
 * número hoy es de la marca (0.THETA, D6); esta línea lo dice donde el dueño mira sus sedes.
 * Lee el número de donde el panel ya lo lee (`GET /api/dashboard/conexiones`, que puede llamar
 * cualquier administrador de la marca). Si esa lectura falla, la frase sale sin el número: nunca
 * un número inventado. Con 0 o 1 sede no se dibuja.
 */
export function NumeroCompartido() {
  const { view } = useLocationScope()
  const multiSede = !!view?.multiSede
  const [linea, setLinea] = useState<{ telefono: string | null; proveedor: string | null } | null>(null)

  useEffect(() => {
    if (!multiSede) return
    let vigente = true
    fetch('/api/dashboard/conexiones', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vigente) return
        const wa = j?.available ? j.whatsapp : null
        setLinea({ telefono: wa?.phone ?? null, proveedor: wa?.provider ?? null })
      })
      .catch(() => {
        if (vigente) setLinea({ telefono: null, proveedor: null })
      })
    return () => {
      vigente = false
    }
  }, [multiSede])

  if (!view?.multiSede || !linea) return null
  return <VistaNumeroCompartido sedes={view.brandLocationCount} telefono={linea.telefono} proveedor={linea.proveedor} />
}

/** La línea sin estado (se prueba dibujada). */
export function VistaNumeroCompartido({
  sedes,
  telefono,
  proveedor,
}: {
  sedes: number
  telefono: string | null
  proveedor: string | null
}) {
  // Si la lectura falló no se sabe ni el número ni el proveedor: la frase lo dice sin nombrarlos.
  const frase = proveedor
    ? lineaNumeroCompartido({ sedes, telefono, proveedor })
    : `${sedes === 2 ? 'Las dos sedes' : `Las ${sedes} sedes`} comparten el WhatsApp de la marca. Un número propio para cada sede: próximamente.`
  return (
    <div
      className="flex items-start gap-2 rounded-lg border p-3 text-sm"
      style={{ borderColor: 'rgba(0,0,0,0.08)', color: 'var(--brand-ink-soft)' }}
      data-linea="numero-compartido"
    >
      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--brand-primary-end)' }} strokeWidth={1.75} />
      <span>
        {frase}{' '}
        <Link href="/dashboard/conexiones" className="font-medium underline-offset-2 hover:underline" style={{ color: 'var(--brand-primary-end)' }}>
          Ver la línea
        </Link>
      </span>
    </div>
  )
}
