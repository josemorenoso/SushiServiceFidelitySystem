'use client'

import { Card, CardContent } from '@/components/ui/card'
import { numerosDeArriba, textoSegundaVisita } from '@/lib/cycle-screen'
import type { CycleOverview } from '@/services/cycle-overview.service'

/**
 * Arriba, tres números (spec §6.3): volvieron por un mensaje (con «con mensaje X % / sin mensaje
 * Y %» cuando hay grupo de control), en el ciclo y dormidos, y el próximo evento. NINGUNO es
 * «enviados»: mandar mensajes no es el logro, que vuelvan sí. Un dato que no se pudo medir es
 * «—», nunca «0». Debajo, en una línea, la segunda visita (A12: la métrica principal).
 */
export function NumerosDeArriba({ portada }: { portada: CycleOverview }) {
  const numeros = numerosDeArriba(portada)
  const segundaVisita = textoSegundaVisita(portada.segunda_visita)

  return (
    <section aria-label="Resumen del ciclo" className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {numeros.map((n, i) => (
          <Card
            key={n.clave}
            size="sm"
            className={i === numeros.length - 1 ? 'col-span-2 sm:col-span-1' : undefined}
          >
            <CardContent className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{n.titulo}</p>
              <p className="text-2xl font-semibold leading-tight tabular-nums">
                {n.valor}
                {n.sufijo && <small className="ml-1.5 text-sm font-medium text-muted-foreground">{n.sufijo}</small>}
              </p>
              <p className="text-xs text-muted-foreground">
                {n.detalle}
                {n.aviso && <span className="ml-1 font-medium text-amber-700"> · {n.aviso}</span>}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {segundaVisita && <p className="px-1 text-xs text-muted-foreground">{segundaVisita}</p>}
    </section>
  )
}
