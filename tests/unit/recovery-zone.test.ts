import { describe, it, expect } from 'vitest'
import {
  FREQUENCY_CAP_DAYS,
  RECOVERY_ZONE_START_DAYS,
  RECOVERY_ZONE_END_DAYS,
  deriveRecoveryZone,
  normalizeReactivationDays,
} from '@/constants/rewards'
import { isInRecoveryZone } from '@/services/campaign.service'

/**
 * La Recovery Zone es la ventana que las campañas manuales NO tocan porque el
 * cron de reactivación ya tiene a esos clientes en el radar. Estaba fija en
 * 18-25 mientras los días del toque suave/agresivo eran configurables por
 * tenant: bajar el toque suave a 15 dejaba los días 15-17 sin proteger, y la
 * tarjeta del panel seguía anunciando "Días 18-25".
 */
describe('deriveRecoveryZone', () => {
  it('con los defaults (21/25) reproduce EXACTAMENTE las constantes que reemplaza', () => {
    // Este es el test que importa: la derivación no cambia el comportamiento de
    // ningún tenant que no haya tocado sus días.
    expect(deriveRecoveryZone(21, 25)).toEqual({
      startDays: RECOVERY_ZONE_START_DAYS,
      endDays: RECOVERY_ZONE_END_DAYS,
    })
  })

  it('la zona baja con el toque suave: el día del toque queda siempre dentro', () => {
    const zone = deriveRecoveryZone(15, 20)
    expect(zone).toEqual({ startDays: 12, endDays: 20 })
    expect(15).toBeGreaterThanOrEqual(zone.startDays)
    expect(15).toBeLessThanOrEqual(zone.endDays)
  })

  it('nunca abre por debajo del frequency cap (la ventana manual no desaparece)', () => {
    // Con un toque suave muy temprano, soft-3 caería dentro del cap de 7 días,
    // donde el cliente ya está protegido por otra regla.
    expect(deriveRecoveryZone(8, 12).startDays).toBe(FREQUENCY_CAP_DAYS)
    expect(deriveRecoveryZone(1, 5).startDays).toBe(FREQUENCY_CAP_DAYS)
  })

  it('nunca produce una zona invertida', () => {
    const zone = deriveRecoveryZone(30, 8)
    expect(zone.endDays).toBeGreaterThanOrEqual(zone.startDays)
  })
})

describe('normalizeReactivationDays', () => {
  it('cae a los defaults con valores vacíos, cero, negativos o basura', () => {
    expect(normalizeReactivationDays(undefined, undefined)).toEqual({ softDays: 21, aggressiveDays: 25 })
    expect(normalizeReactivationDays('', '')).toEqual({ softDays: 21, aggressiveDays: 25 })
    expect(normalizeReactivationDays('0', '-4')).toEqual({ softDays: 21, aggressiveDays: 25 })
    expect(normalizeReactivationDays('abc', '1.5')).toEqual({ softDays: 21, aggressiveDays: 25 })
  })

  it('lee los strings de admin_settings como números', () => {
    expect(normalizeReactivationDays('15', '20')).toEqual({ softDays: 15, aggressiveDays: 20 })
  })

  it('fuerza la agresiva por detrás de la suave', () => {
    expect(normalizeReactivationDays('30', '10')).toEqual({ softDays: 30, aggressiveDays: 34 })
    expect(normalizeReactivationDays('30', '30')).toEqual({ softDays: 30, aggressiveDays: 34 })
  })
})

describe('isInRecoveryZone', () => {
  const now = new Date('2026-09-06T12:00:00Z')
  const hace = (dias: number) =>
    new Date(now.getTime() - dias * 24 * 60 * 60 * 1000).toISOString()

  it('respeta la ventana del tenant, no las constantes fijas', () => {
    const zone = deriveRecoveryZone(15, 20) // 12-20

    expect(isInRecoveryZone(hace(14), zone, now)).toBe(true)   // dentro
    expect(isInRecoveryZone(hace(10), zone, now)).toBe(false)  // aún no entra
    expect(isInRecoveryZone(hace(22), zone, now)).toBe(false)  // ya salió

    // El caso que motivó el cambio: con la zona fija en 18-25 este cliente
    // quedaba disponible para una campaña manual el mismo día del toque suave.
    expect(isInRecoveryZone(hace(15), zone, now)).toBe(true)
  })

  it('sin la ventana del tenant usa el default 18-25 (protege de más, no de menos)', () => {
    expect(isInRecoveryZone(hace(20), undefined, now)).toBe(true)
    expect(isInRecoveryZone(hace(10), undefined, now)).toBe(false)
  })

  it('un cliente sin última visita nunca está en la zona', () => {
    expect(isInRecoveryZone(null, deriveRecoveryZone(15, 20), now)).toBe(false)
    expect(isInRecoveryZone(undefined, deriveRecoveryZone(15, 20), now)).toBe(false)
  })
})
