'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useLocationScope, LOCATION_ALL, LOCATION_UNKNOWN } from '@/contexts/LocationScopeContext'
import { useTarjetaPorSede } from '@/hooks/useTarjetaPorSede'
import {
  contarSedes,
  esPantallaConSuPropiaSede,
  esPantallaDeTodaLaMarca,
  opcionesDelSelector,
} from '@/lib/panel-sedes'

/**
 * El selector de sede del panel — multi-sede F7, D10, §8.4 del spec.
 *
 * Vive en `DashboardHeader` (chrome global, en las 14 páginas de `(dashboard)`),
 * no en cada página: es lo que hace que "cambiar de sede" sea una acción, no un
 * ajuste que hay que repetir pantalla por pantalla.
 *
 * *"Toda la marca" solo se dibuja si el usuario es de marca* — la regla
 * literal del §8.4 — y viene YA aplicada por el servidor en `view.canSeeAll`:
 * este componente no decide permisos, solo los dibuja.
 *
 * ⚠️ **CON UNA SOLA SEDE NO SE DIBUJA NADA** (dueño, 2026-09-08). Un admin de
 * marca de un restaurante de un solo local veía tres opciones —«Todas las
 * sedes», «Sede Principal» y «Sin sede»— que nombran EXACTAMENTE el mismo
 * conjunto de filas: elegir cualquiera daba la misma pantalla. El reporte fue
 * literal: *"si es sede única no quiero que me ande saliendo para seleccionar
 * sede porque es solo una y todos se confunden"*.
 *
 * Es el **interruptor de compatibilidad** del §8.3 llevado a la pantalla: con 0
 * o 1 sede activa, el panel se ve exactamente como antes de multi-sede. Lo
 * decide el servidor (`view.multiSede`), contando las sedes activas de la
 * MARCA — no las que este usuario ve, porque un admin de UNA sede dentro de una
 * marca de tres sí necesita ver en cuál está parado.
 *
 * SEDES SEPARADAS, PARTE 1 (dueño, 2026-10-14, mirando Tepuy): *«¿Por qué salen 4
 * opciones? Eso no tiene sentido alguno.»* Con 2+ sedes las opciones son **«Toda la
 * marca (N sedes)» y una por sede**: «Sin sede» salió (no es un lugar que se elija; se
 * muestra en «Tus sedes»). Y en las pantallas que son de toda la marca el selector no
 * finge cambiarlas: se vuelve una etiqueta quieta, y la franja de debajo lo explica
 * (`opcionesDelSelector()`, `esPantallaDeTodaLaMarca()` en `src/lib/panel-sedes.ts`).
 */
export function LocationSelector() {
  const { view, loading, selection, setSelection } = useLocationScope()
  const pathname = usePathname()
  // Con «Una tarjeta para cada sede», en «Tarjeta principal» el selector SÍ elige qué tarjeta se
  // edita (parte 2): ahí no es la etiqueta quieta.
  const tarjetaPorSede = useTarjetaPorSede()

  // «Sin sede» ya no se ofrece: quien la tenía guardada de antes vuelve a «Toda la marca»,
  // en vez de quedar parado en un valor que el selector no muestra (el panel filtraría por él
  // sin decirlo). La ruta sigue aceptando `?location_id=unknown`.
  const sinSedeGuardada = !!view?.multiSede && selection === LOCATION_UNKNOWN
  useEffect(() => {
    if (sinSedeGuardada) setSelection(LOCATION_ALL)
  }, [sinSedeGuardada, setSelection])

  if (loading && !view) return null
  if (!view) return null // /api/dashboard/location-scope falló — no interrumpir el resto del panel

  const opciones = opcionesDelSelector(view)
  // Marca de una sola sede, o una sola opción posible: no hay nada que elegir.
  if (opciones.length === 0) return null

  // La pantalla elige la sede adentro (Mis sedes): el selector de arriba no le cambia nada.
  if (esPantallaConSuPropiaSede(pathname)) return null

  // Pantalla de toda la marca: el selector no puede parecer que la cambia. Una etiqueta quieta,
  // con el mismo tamaño, en vez del desplegable; la franja de debajo dice por qué.
  if (esPantallaDeTodaLaMarca(pathname, { tarjetaPorSede })) {
    return (
      <span
        aria-label="Sede: toda la marca"
        title="Esta pantalla es de toda la marca: el selector de sede no la cambia."
        className="inline-flex h-9 max-w-[56vw] items-center truncate rounded-md border border-dashed border-input px-2 text-xs text-muted-foreground sm:max-w-none sm:px-3 sm:text-sm"
      >
        Toda la marca ({contarSedes(view.brandLocationCount)})
      </span>
    )
  }

  // En el celular (el dueño mira el panel desde el teléfono): letra chica y un tope de ancho,
  // para que «Toda la marca (2 sedes)» quepa al lado del nombre de la marca y de «salir».
  return (
    <select
      value={selection}
      onChange={(e) => setSelection(e.target.value)}
      aria-label="Sede"
      className="h-9 max-w-[56vw] rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:max-w-none sm:px-3 sm:text-sm"
    >
      {opciones.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
