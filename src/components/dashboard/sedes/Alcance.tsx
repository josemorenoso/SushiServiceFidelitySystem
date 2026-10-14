/**
 * Las dos piezas que dicen DE DÓNDE es un número en el panel (sedes separadas, parte 1,
 * 2026-10-14): la etiqueta junto al título de una tarjeta y el título de una sección.
 *
 * El dueño: *«cada cosa en su lugar, se ven desde el mismo lado pero bien separadas»*. Con una
 * sede elegida el panel tiene dos niveles —arriba la sede, abajo lo de toda la marca— y cada
 * tarjeta lo dice. Con 0 o 1 sede ninguna de las dos se dibuja (la página no las pide).
 *
 * Sin estado y sin `'use client'` propio: se dibujan igual en el servidor (las pruebas) que
 * dentro de los componentes cliente del panel. Colores de la marca (`--brand-*`), ningún hex.
 */

/** De quién es el número: de la sede elegida, o de toda la marca. */
export type DeQuien = 'sede' | 'marca'

export function EtiquetaDeAlcance({ texto, de }: { texto: string; de: DeQuien }) {
  // `font-sans` y `tracking-normal`: va DENTRO de títulos en Playfair, y la etiqueta no es título.
  return (
    <span
      data-alcance={de}
      className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold tracking-normal"
      style={
        de === 'sede'
          ? { background: 'rgba(var(--brand-primary-rgb), 0.12)', color: 'var(--brand-primary-end)' }
          : { background: 'rgba(0,0,0,0.05)', color: 'var(--brand-ink-soft)' }
      }
    >
      {texto}
    </span>
  )
}

/** El título de una sección del panel: «Tepuy Envigado · esta sede», «De toda la marca · las 2 sedes». */
export function TituloDeSeccion({
  titulo,
  detalle,
  de,
}: {
  titulo: string
  detalle?: string
  de: DeQuien
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
      <h2
        className="font-playfair text-xl font-bold"
        style={{ color: 'var(--brand-ink)', letterSpacing: '-0.02em' }}
        data-alcance={de}
      >
        {titulo}
      </h2>
      {detalle && (
        <p className="text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
          {detalle}
        </p>
      )}
    </div>
  )
}
