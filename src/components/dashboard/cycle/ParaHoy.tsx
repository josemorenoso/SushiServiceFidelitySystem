'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  COLOR_DE_TARJETA,
  TEXTO_DESPUES_DE_OK,
  botonesDeTarjeta,
  claveDeOk,
  leerJson,
  type BotonDeTarjeta,
  type Lectura,
  type PermisosDelCiclo,
} from '@/lib/cycle-screen'
import type { TarjetaParaHoy } from '@/services/cycle-overview.service'

/** «Hoy no»: pospone UN día lo automático (POST, alcance de marca). */
async function posponerHoy(tarjeta: TarjetaParaHoy): Promise<Lectura<{ mensaje?: string }>> {
  return leerJson<{ mensaje?: string }>(
    '/api/dashboard/cycle/hoy-no',
    'No pudimos guardar «Hoy no». Intenta de nuevo: hasta que quede guardado, sale como estaba.',
    {
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tarjeta: tarjeta.tipo }),
      },
    }
  )
}

/** Lo que este navegador ya aprobó hoy (una comodidad por visitante: no escribe nada en la base). */
function leerOkDeHoy(tarjetas: readonly TarjetaParaHoy[], hoyIso: string): Set<string> {
  const vistas = new Set<string>()
  try {
    for (const t of tarjetas) {
      if (window.localStorage.getItem(claveDeOk(t.id, hoyIso)) === '1') vistas.add(t.id)
    }
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): la tarjeta vuelve a aparecer. No pasa nada.
  }
  return vistas
}

function recordarOk(id: string, hoyIso: string) {
  try {
    window.localStorage.setItem(claveDeOk(id, hoyIso), '1')
  } catch {
    // Ídem.
  }
}

/**
 * «Para hoy» (spec §6.1): dos o tres tarjetas ya armadas, con un botón cada una. Las genera el
 * motor y llegan ordenadas por lo que mueven. **Aprobar, no crear:**
 *   · OK no escribe nada —lo automático sale solo (decisión A6)—, solo se marca hecho aquí.
 *   · Hoy no pospone UN día lo automático (solo con permiso de marca).
 *   · Cambiar / Elegir regalo → Recompensas › Premios para regalar.
 *   · Crear evento / Subir foto → el calendario (hasta que la parte C traiga el creador).
 */
export function ParaHoy({
  tarjetas,
  permisos,
  hoyIso,
  posponer = posponerHoy,
  onCambio,
}: {
  tarjetas: TarjetaParaHoy[]
  permisos: PermisosDelCiclo | null
  /** El día de hoy en Bogotá (`YYYY-MM-DD`): el «OK» recordado vale solo hoy. */
  hoyIso: string
  /** Inyectable para las pruebas. */
  posponer?: (t: TarjetaParaHoy) => Promise<Lectura<{ mensaje?: string }>>
  /** Avisa que algo cambió en el servidor (para volver a leer la portada). */
  onCambio?: () => void
}) {
  // El valor inicial se lee UNA vez, ya en el navegador (esta sección solo se dibuja con la portada cargada).
  const [aprobadas, setAprobadas] = useState<Set<string>>(() => leerOkDeHoy(tarjetas, hoyIso))
  const [hechas, setHechas] = useState<Record<string, string>>({})
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})

  const aprobar = (t: TarjetaParaHoy) => {
    recordarOk(t.id, hoyIso)
    setAprobadas((prev) => new Set(prev).add(t.id))
    setHechas((prev) => ({ ...prev, [t.id]: TEXTO_DESPUES_DE_OK }))
  }

  const decirHoyNo = async (t: TarjetaParaHoy) => {
    setOcupada(t.id)
    setErrores((prev) => {
      const resto = { ...prev }
      delete resto[t.id]
      return resto
    })
    const r = await posponer(t)
    setOcupada(null)
    if (!r.ok) {
      // No se dice «listo»: no quedó guardado, y la tarjeta sigue como estaba.
      setErrores((prev) => ({ ...prev, [t.id]: r.mensaje }))
      return
    }
    setHechas((prev) => ({ ...prev, [t.id]: r.datos.mensaje ?? 'Listo: lo pospusimos un día.' }))
    onCambio?.()
  }

  const pendientes = tarjetas.filter((t) => !aprobadas.has(t.id) || hechas[t.id])

  return (
    <section aria-labelledby="ciclo-para-hoy" className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="ciclo-para-hoy" className="text-lg font-semibold">
          Para hoy
        </h2>
        <p className="text-xs text-muted-foreground">Lo automático sale solo. Aquí puedes frenarlo o dejarlo listo.</p>
      </div>

      {pendientes.length === 0 ? (
        <Card size="sm">
          <CardContent>
            <p className="text-sm text-muted-foreground">Hoy no hay nada que aprobar. Todo está al día.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pendientes.map((t) => {
            const hecho = hechas[t.id]
            const botones = botonesDeTarjeta(t, permisos)
            return (
              <Card
                key={t.id}
                size="sm"
                className="border-l-4 border-l-[var(--c)]"
                style={{ '--c': COLOR_DE_TARJETA[t.tipo] } as CSSProperties}
              >
                <CardContent className="flex h-full flex-col gap-3">
                  {hecho ? (
                    <p className="text-sm">✓ {hecho}</p>
                  ) : (
                    <>
                      <p className="text-sm">{t.texto}</p>
                      {errores[t.id] && (
                        <p role="alert" className="text-xs text-red-700">
                          {errores[t.id]}
                        </p>
                      )}
                      <div className="mt-auto flex flex-wrap gap-2">
                        {botones.map((b) => (
                          <BotonDeLaTarjeta
                            key={b.accion}
                            boton={b}
                            ocupado={ocupada === t.id}
                            onOk={() => aprobar(t)}
                            onHoyNo={() => decirHoyNo(t)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}

function BotonDeLaTarjeta({
  boton,
  ocupado,
  onOk,
  onHoyNo,
}: {
  boton: BotonDeTarjeta
  ocupado: boolean
  onOk: () => void
  onHoyNo: () => void
}) {
  const variante = boton.estilo === 'primario' ? 'default' : boton.estilo === 'secundario' ? 'outline' : 'ghost'
  if (boton.href) {
    return (
      <Link href={boton.href} className={buttonVariants({ variant: variante, size: 'sm' })}>
        {boton.etiqueta}
      </Link>
    )
  }
  return (
    <Button
      type="button"
      size="sm"
      variant={variante}
      disabled={ocupado}
      onClick={boton.accion === 'hoy_no' ? onHoyNo : onOk}
    >
      {ocupado && boton.accion === 'hoy_no' ? 'Guardando…' : boton.etiqueta}
    </Button>
  )
}
