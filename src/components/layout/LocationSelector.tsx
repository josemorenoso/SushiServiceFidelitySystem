'use client'

import { useLocationScope, LOCATION_ALL, LOCATION_UNKNOWN } from '@/contexts/LocationScopeContext'

/**
 * El selector de sede del panel — multi-sede F7, D10, §8.4 del spec.
 *
 * Vive en `DashboardHeader` (chrome global, en las 14 páginas de `(dashboard)`),
 * no en cada página: es lo que hace que "cambiar de sede" sea una acción, no un
 * ajuste que hay que repetir pantalla por pantalla.
 *
 * *"Todas las sedes" solo se dibuja si el usuario es de marca* — la regla
 * literal del §8.4 — y viene YA aplicada por el servidor en `view.canSeeAll`:
 * este componente no decide permisos, solo los dibuja.
 *
 * ⚠️ **CON UNA SOLA SEDE NO SE DIBUJA NADA** (dueño, 2026-09-08). Un admin de
 * marca de un restaurante de un solo local veía tres opciones —«Todas las
 * sedes», «Sede Principal» y «Sin sede»— que nombran EXACTAMENTE el mismo
 * conjunto de filas: elegir cualquiera daba la misma pantalla. El reporte fue
 * literal: *"si es sede única no quiero que me ande saliendo para seleccionar
 * sede porque es solo una y todos se confunden"*. Y tenía razón por debajo
 * también: «Sin sede» junto a «Sede Principal» le pide a un restaurantero que
 * entienda que su histórico anterior a multi-sede no está atribuido, que es un
 * detalle nuestro y no suyo.
 *
 * Es el **interruptor de compatibilidad** del §8.3 llevado a la pantalla: con 0
 * o 1 sede activa, el panel se ve exactamente como antes de multi-sede. Lo
 * decide el servidor (`view.multiSede`), contando las sedes activas de la
 * MARCA — no las que este usuario ve, porque un admin de UNA sede dentro de una
 * marca de tres sí necesita ver en cuál está parado.
 */
export function LocationSelector() {
  const { view, loading, selection, setSelection } = useLocationScope()

  if (loading && !view) return null
  if (!view) return null // /api/dashboard/location-scope falló — no interrumpir el resto del panel

  // Marca de una sola sede: no hay nada que elegir. Ver el comentario de arriba.
  if (!view.multiSede) return null

  const totalOpciones = (view.canSeeAll ? 1 : 0) + view.locations.length + (view.canSeeUnassigned ? 1 : 0)
  // Con una sola opción no hay nada entre qué elegir: un usuario `role=location`
  // de UNA sede, sin "Todas" ni "Sin sede", no necesita un dropdown para ver lo
  // único que puede ver.
  if (totalOpciones <= 1) return null

  return (
    <select
      value={selection}
      onChange={(e) => setSelection(e.target.value)}
      aria-label="Sede"
      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {view.canSeeAll && <option value={LOCATION_ALL}>Todas las sedes</option>}
      {view.locations.map((loc) => (
        <option key={loc.id} value={loc.id}>
          {loc.name}
        </option>
      ))}
      {view.canSeeUnassigned && <option value={LOCATION_UNKNOWN}>Sin sede</option>}
    </select>
  )
}
