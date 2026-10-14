'use client'

import { Card, CardContent } from '@/components/ui/card'

/**
 * «¿Cómo decide el sistema?» — seis renglones para el dueño curioso (prototipo, spec §3). Cada
 * uno es una regla del motor, dicha en palabras de dueño: si alguna cambia, se corrige aquí en
 * el mismo commit. El de «para comparar» sale del porcentaje real de la marca: con 0 % (marcas
 * chicas, decisión 11) no se afirma un grupo de control que no existe.
 */
export function ComoDecide({ grupoDeControlPct }: { grupoDeControlPct: number }) {
  const pasos: Array<[string, string]> = [
    ['Visita', 'Por QR, mesero o domicilio. Empieza un ciclo nuevo y queda anotado qué toque lo trajo.'],
    ['Toques', 'Cinco, cada vez más espaciados. Nunca dos en una semana, nunca más de tres al mes.'],
    ['Para solo', 'Al sexto mensaje sin volver (los tuyos también cuentan), o al terminar el ciclo.'],
    ['Eventos', 'Si hay un evento esa semana, el toque espera: el evento tiene fecha, el toque no.'],
    ['Regalos', 'Suben dentro del ciclo, nunca entre ciclos. El fuerte, una vez por semestre por persona.'],
  ]
  if (grupoDeControlPct > 0) {
    pasos.push([
      'Para comparar',
      `A ${grupoDeControlPct} de cada 100 clientes no se les manda nada, para saber cuántos vuelven solos.`,
    ])
  }

  return (
    <Card size="sm">
      <CardContent>
        <details>
          <summary className="cursor-pointer select-none text-sm font-semibold">¿Cómo decide el sistema?</summary>
          <dl className="mt-3 grid gap-2 text-xs text-muted-foreground">
            {pasos.map(([titulo, texto]) => (
              <div key={titulo} className="grid grid-cols-[88px_1fr] gap-2">
                <dt className="font-semibold text-foreground">{titulo}</dt>
                <dd>{texto}</dd>
              </div>
            ))}
          </dl>
        </details>
      </CardContent>
    </Card>
  )
}
