'use client'

import Link from 'next/link'
import { Check, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { mostrarPrimerUso, pasosDelPrimerUso, progresoDelPrimerUso } from '@/lib/cycle-screen'
import type { PrimerUso as PrimerUsoDatos } from '@/services/cycle-overview.service'

/**
 * Primer uso (spec §6.0): los tres pasos con barra, hasta que estén los tres. Ninguno BLOQUEA el
 * ciclo —lo mejoran—, y cada uno lleva a donde se arregla: los regalos se eligen en Recompensas ›
 * Premios para regalar y la plantilla en Plantillas. Sin los tres listos no se dibuja nada
 * (cuando están, la barra sobra).
 */
export function PrimerUso({ datos }: { datos: PrimerUsoDatos | null }) {
  if (!mostrarPrimerUso(datos)) return null
  const pasos = pasosDelPrimerUso(datos)
  const avance = progresoDelPrimerUso(datos)

  return (
    <Card aria-label="Para que el ciclo corra solo">
      <CardContent className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">
            Para que el ciclo corra solo: {datos.listos} de {datos.total} listos
          </h2>
          <p className="text-xs text-muted-foreground">Nada de esto lo frena. Lo mejora.</p>
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={datos.listos}
          aria-valuemin={0}
          aria-valuemax={datos.total}
          aria-label={`${datos.listos} de ${datos.total} listos`}
        >
          <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${avance}%` }} />
        </div>

        <ul className="grid gap-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {pasos.map((p) => (
            <li key={p.clave} className="flex min-w-0 items-start gap-2">
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white ${
                  p.listo ? 'bg-emerald-600' : 'bg-amber-600'
                }`}
                aria-hidden="true"
              >
                {p.listo ? <Check className="size-3" strokeWidth={3} /> : <Clock className="size-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <b className="font-semibold">{p.titulo}:</b> <span className="text-muted-foreground">{p.texto}</span>
                {p.enlace && (
                  <>
                    {' '}
                    <Link href={p.enlace.href} className="font-medium text-foreground underline underline-offset-2">
                      {p.enlace.etiqueta}
                    </Link>
                  </>
                )}
                <span className="sr-only">{p.listo ? ' (listo)' : ' (pendiente)'}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
