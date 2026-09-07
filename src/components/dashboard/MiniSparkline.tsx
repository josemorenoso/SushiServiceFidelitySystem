'use client'

interface MiniSparklineProps {
  trend: 'up' | 'down' | 'stable'
  /**
   * Color de la curva. Puede ser una variable CSS (`var(--brand-primary)`).
   *
   * ⚠️ Por eso `stroke` y `fill` van por `style` y NO como atributos del SVG: un
   * atributo de presentación se parsea como valor SVG, no como CSS, así que
   * `stroke="var(--x)"` no resuelve nada y la línea sale sin color. Dentro de
   * `style` sí es CSS y la variable funciona.
   */
  color: string
  delay?: number
  /** Ancho. La tarjeta héroe del panel la pide más grande, o al 100 %. */
  width?: number | string
  /** Alto. La curva se estira con `preserveAspectRatio="none"`. */
  height?: number | string
  /** Opacidad del área bajo la curva. */
  fillOpacity?: number
}

const PATHS = {
  up: 'M0,20 C5,18 10,15 15,13 C20,11 25,9 30,7 C35,5 40,6 45,4 C50,2 55,1 60,0',
  down: 'M0,0 C5,2 10,3 15,5 C20,7 25,9 30,11 C35,13 40,14 45,16 C50,18 55,19 60,20',
  stable: 'M0,10 C5,9 10,11 15,10 C20,9 25,11 30,10 C35,9 40,12 45,10 C50,9 55,11 60,10',
}

export function MiniSparkline({
  trend,
  color,
  delay = 0,
  width = 60,
  height = 22,
  fillOpacity = 0.12,
}: MiniSparklineProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 60 22"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {/* Área de relleno (estática, muy tenue) */}
      <path
        d={`${PATHS[trend]} L60,22 L0,22 Z`}
        style={{ fill: color, fillOpacity }}
      />
      {/* Línea animada */}
      <path
        d={PATHS[trend]}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="1"
        /* Con `preserveAspectRatio="none"` el trazo se estiraria a lo ancho
           junto con el viewBox; esto lo mantiene de 1.5px siempre. */
        vectorEffect="non-scaling-stroke"
        className="sparkline-path"
        style={{
          stroke: color,
          fill: 'none',
          animationDelay: `${delay}ms`,
          animationDuration: '1.5s',
        }}
      />
    </svg>
  )
}
