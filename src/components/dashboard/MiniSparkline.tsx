'use client'

interface MiniSparklineProps {
  trend: 'up' | 'down' | 'stable'
  color: string
  delay?: number
}

const PATHS = {
  up: 'M0,20 C5,18 10,15 15,13 C20,11 25,9 30,7 C35,5 40,6 45,4 C50,2 55,1 60,0',
  down: 'M0,0 C5,2 10,3 15,5 C20,7 25,9 30,11 C35,13 40,14 45,16 C50,18 55,19 60,20',
  stable: 'M0,10 C5,9 10,11 15,10 C20,9 25,11 30,10 C35,9 40,12 45,10 C50,9 55,11 60,10',
}

export function MiniSparkline({ trend, color, delay = 0 }: MiniSparklineProps) {
  return (
    <svg
      width="60"
      height="22"
      viewBox="0 0 60 22"
      fill="none"
      aria-hidden="true"
    >
      {/* Área de relleno (estática, muy tenue) */}
      <path
        d={`${PATHS[trend]} L60,22 L0,22 Z`}
        fill={color}
        fillOpacity={0.07}
      />
      {/* Línea animada */}
      <path
        d={PATHS[trend]}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        pathLength="1"
        className="sparkline-path"
        style={{
          animationDelay: `${delay}ms`,
          animationDuration: '1.5s',
        }}
      />
    </svg>
  )
}
