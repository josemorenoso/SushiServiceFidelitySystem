'use client'

import { useSyncExternalStore } from 'react'

/**
 * ¿La marca tiene «Una tarjeta para cada sede»? Lo sabe «Tarjeta principal» (lo lee de
 * `tenants.config.card.mode`) y lo necesita el ENCABEZADO, que vive fuera de la página: con una
 * tarjeta por sede, el selector de sede SÍ cambia lo que se edita en esa pantalla, así que no
 * puede ser la etiqueta quieta «Toda la marca» ni llevar la franja «Esto es de toda la marca»
 * (sedes separadas, parte 2, 2026-10-14).
 *
 * Un contexto de React no sirve: la página está DEBAJO del encabezado y un contexto no sube. Es
 * un store de módulo leído con `useSyncExternalStore` (como la pestaña de Recompensas), nunca la
 * URL (`useSearchParams()` fuerza el CSR bailout). Arranca en `false`, que es lo de siempre: hasta
 * que la página no leyó el modo, el encabezado se dibuja como hoy.
 */

let porSede = false
const oyentes = new Set<() => void>()

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

/** Lo llama «Tarjeta principal» cuando lee o cambia el modo de la tarjeta. */
export function avisarTarjetaPorSede(valor: boolean): void {
  if (porSede === valor) return
  porSede = valor
  for (const o of oyentes) o()
}

export function useTarjetaPorSede(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => porSede,
    () => false
  )
}
