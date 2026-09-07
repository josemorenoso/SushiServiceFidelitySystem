'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { LucideIcon } from 'lucide-react'

/**
 * La tarjeta de un proveedor que todavía no existe (Google y Meta, el norte de
 * `ESTADO.md` §3).
 *
 * Está acá por una razón concreta y no decorativa: **Conexiones no se llama «WhatsApp»**
 * justamente para que el día que llegue Google sea una tarjeta más y no una pantalla
 * nueva. Mostrarlas apagadas desde el día uno es lo que hace que esa promesa sea visible.
 *
 * No tiene botón, no tiene enlace y no promete fecha. Un «Próximamente» con un botón
 * muerto es peor que no tenerlo.
 */
export function ProximamenteCard({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <Card className="dashboard-card">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'rgba(0,0,0,0.05)' }}
          >
            <Icon className="h-5 w-5" style={{ color: 'var(--brand-ink-muted)' }} strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--brand-ink-soft)' }}>
              {title}
            </h2>
            <p className="text-sm" style={{ color: 'var(--brand-ink-muted)' }}>
              {description}
            </p>
          </div>
        </div>
        <Badge variant="outline">Próximamente</Badge>
      </CardContent>
    </Card>
  )
}
