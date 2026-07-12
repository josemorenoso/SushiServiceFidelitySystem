'use client'

import { useMemo } from 'react'
import { Target, Gift, Flame, AlertTriangle } from 'lucide-react'
import {
  calibrate,
  deriveRewardVisit,
  simulateJourney,
  type PointsEngineConfig,
} from '@/lib/points-engine'
import { CALIBRATOR_MIN_VISITS, CALIBRATOR_MAX_VISITS } from '@/constants/rewards'

interface PointsCalibratorProps {
  /** Umbral del primer premio (el `point_threshold` más bajo entre los tiers activos). */
  threshold: number | null
  /** Los seis números del sistema, ya parseados por el padre. */
  config: PointsEngineConfig
  /** El padre recibe la propuesta y actualiza sus inputs de Ajustes avanzados. */
  onChange: (config: PointsEngineConfig) => void
  disabled?: boolean
}

/**
 * El traductor que faltaba: convierte una intención de negocio ("quiero que el premio se
 * gane en 5 visitas") en los seis números del sistema de puntos, y enseña el resultado
 * corriendo el algoritmo REAL visita a visita.
 *
 * Presentacional y controlado: no hace fetch, no guarda, no conoce `admin_settings`.
 *
 * Ref: docs/superpowers/specs/2026-07-12-points-calibrator-design.md
 */
export function PointsCalibrator({ threshold, config, onChange, disabled }: PointsCalibratorProps) {
  // La tabla SIEMPRE se dibuja desde la config efectiva — venga de la perilla o de una
  // edición a mano en Ajustes avanzados. Un solo camino de datos: no puede discrepar.
  const journey = useMemo(
    () => (threshold ? simulateJourney(config, threshold) : []),
    [config, threshold]
  )

  const currentVisits = useMemo(
    () => (threshold ? deriveRewardVisit(config, threshold) : null),
    [config, threshold]
  )

  const achievable = useMemo(() => {
    if (!threshold) return []
    return calibrate(threshold, CALIBRATOR_MIN_VISITS, config).achievableVisits
  }, [threshold, config])

  const handleSelect = (visits: number) => {
    if (!threshold) return
    const result = calibrate(threshold, visits, config)
    onChange(result.config)
  }

  if (!threshold) {
    return (
      <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px dashed rgba(168, 85, 247, 0.3)' }}>
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={1.5} style={{ color: '#a855f7' }} />
          <p className="text-xs" style={{ color: '#6b7280' }}>
            Crea primero un premio en <strong>Ajustes → Premios</strong> para poder calibrar en cuántas
            visitas se gana.
          </p>
        </div>
      </div>
    )
  }

  const options = Array.from(
    { length: CALIBRATOR_MAX_VISITS - CALIBRATOR_MIN_VISITS + 1 },
    (_, i) => CALIBRATOR_MIN_VISITS + i
  )
  const unreachable = currentVisits !== null && !achievable.includes(currentVisits)

  return (
    <div className="rounded-xl p-5 mb-6" style={{ background: 'rgba(168, 85, 247, 0.05)', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
      {/* La perilla */}
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <Target className="h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: '#a855f7' }} />
        <label htmlFor="calibrator-visits" className="text-sm font-semibold" style={{ color: '#1a1c1d' }}>
          ¿En cuántas visitas quieres que tus clientes se ganen su primer premio?
        </label>
        <select
          id="calibrator-visits"
          value={currentVisits ?? ''}
          disabled={disabled}
          onChange={(e) => handleSelect(Number(e.target.value))}
          className="h-9 rounded-lg border border-input bg-white px-2.5 text-sm font-semibold transition-colors outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50 disabled:opacity-50"
        >
          {currentVisits === null && <option value="">—</option>}
          {options.map((v) => (
            <option key={v} value={v} disabled={!achievable.includes(v)}>
              {v} visitas{!achievable.includes(v) ? ' (no alcanzable)' : ''}
            </option>
          ))}
        </select>
      </div>
      <p className="text-[11px] mb-4" style={{ color: '#9ca3af' }}>
        El premio de tu primer nivel cuesta <strong>{threshold} puntos</strong>. Al elegir un número de
        visitas se recalculan los puntos por visita y el bono de bienvenida para que ese premio caiga
        justo ahí.
      </p>

      {/* La tabla espejo */}
      {journey.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest px-3 pt-3 pb-2" style={{ color: '#6b7280' }}>
            Así lo vive tu cliente
          </p>
          <table className="w-full text-sm">
            <tbody>
              {journey.map((v) => (
                <tr key={v.visit} style={{ borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: '#6b7280' }}>
                    Visita {v.visit}
                    {v.isWelcome && (
                      <span className="text-[10px] ml-1.5" style={{ color: '#b0b0b0' }}>bienvenida</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: '#a855f7' }}>
                    +{v.points}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: '#1a1c1d' }}>
                    {v.accumulated} pts
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {v.isReward ? (
                      <span className="inline-flex items-center gap-1 font-semibold" style={{ color: '#10B981' }}>
                        <Gift className="h-3.5 w-3.5" strokeWidth={2} />
                        PREMIO
                      </span>
                    ) : v.isNearMiss ? (
                      <span className="inline-flex items-center gap-1" style={{ color: '#FF4D6D' }}>
                        <Flame className="h-3.5 w-3.5" strokeWidth={2} />
                        le faltan {v.remaining} — casi lo logra
                      </span>
                    ) : (
                      <span style={{ color: '#b0b0b0' }}>le faltan {v.remaining}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Meta inalcanzable con el umbral actual */}
      {unreachable && achievable.length > 0 && (
        <div className="flex items-start gap-2.5 mt-3 rounded-lg p-3" style={{ background: 'rgba(255, 77, 109, 0.06)' }}>
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={1.5} style={{ color: '#FF4D6D' }} />
          <p className="text-xs" style={{ color: '#6b7280' }}>
            Con un umbral de <strong>{threshold} puntos</strong> solo puedes elegir entre{' '}
            <strong>{achievable[0]}</strong> y <strong>{achievable[achievable.length - 1]}</strong> visitas.
            Más visitas darían menos de 15 puntos cada una y se vería sospechoso. Si quieres alargar más el
            camino, sube el umbral del premio en <strong>Ajustes → Premios</strong>.
          </p>
        </div>
      )}

      <p className="text-[10px] mt-3" style={{ color: '#b0b0b0' }}>
        ⚠ Esto solo afecta a los puntos que se otorguen de ahora en adelante. Los clientes que ya tienen
        puntos los conservan tal cual.
      </p>
    </div>
  )
}
