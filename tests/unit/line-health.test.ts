/**
 * El sondeo de salud de línea (Bloque 3).
 *
 * Lo que se prueba acá es lo que decide si una marca puede mandar campañas y a
 * qué ritmo. Dos cosas importan más que el resto:
 *
 *  1. **Que un dato que no se entiende NO se convierta en un número.** Inventar
 *     un límite le corta las campañas a una marca que sí tenía cupo — es el
 *     desastre contra el que la 00037 advierte por escrito.
 *  2. **Que el sondeo solo pueda APRETAR.** Un proceso automático que reactiva
 *     una línea reanuda también la campaña que la hundió.
 *
 * Ref: docs/features/send-governance.md
 *      docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md §3.5
 */

import { describe, it, expect } from 'vitest'
import {
  parseMessagingLimit,
  parseQualityRating,
  decidirEstado,
  type LineHealthReading,
} from '@/services/line-health.service'

function lectura(quality: 'green' | 'yellow' | 'red' | 'unknown', limit: number | null = null): LineHealthReading {
  return { qualityRating: quality, messagingLimit: limit, source: 'twilio_api', raw: {} }
}

describe('parseMessagingLimit — el escalón de Meta', () => {
  it('entiende el enum de Meta', () => {
    expect(parseMessagingLimit('TIER_250')).toBe(250)
    expect(parseMessagingLimit('TIER_1K')).toBe(1_000)
    expect(parseMessagingLimit('TIER_10K')).toBe(10_000)
    expect(parseMessagingLimit('TIER_100K')).toBe(100_000)
  })

  it('entiende el número pelado y la forma corta', () => {
    // Los dos proveedores lo escriben distinto y nadie confirmó cuál manda.
    expect(parseMessagingLimit('1000')).toBe(1_000)
    expect(parseMessagingLimit(2_000)).toBe(2_000)
    expect(parseMessagingLimit('10K')).toBe(10_000)
  })

  it('«sin límite» es null, y eso es lo CORRECTO, no un fallo', () => {
    // null deja el freno apagado (medir sin bloquear), que es exactamente el
    // comportamiento que corresponde a una línea sin tope.
    expect(parseMessagingLimit('TIER_UNLIMITED')).toBeNull()
    expect(parseMessagingLimit('UNLIMITED')).toBeNull()
  })

  it('lo que no entiende es null — NUNCA un número inventado', () => {
    expect(parseMessagingLimit(null)).toBeNull()
    expect(parseMessagingLimit(undefined)).toBeNull()
    expect(parseMessagingLimit('')).toBeNull()
    expect(parseMessagingLimit('   ')).toBeNull()
    expect(parseMessagingLimit('DESCONOCIDO')).toBeNull()
    expect(parseMessagingLimit(0)).toBeNull()
    expect(parseMessagingLimit(-5)).toBeNull()
  })
})

describe('parseQualityRating', () => {
  it('normaliza lo que mandan los proveedores', () => {
    expect(parseQualityRating('GREEN')).toBe('green')
    expect(parseQualityRating('green')).toBe('green')
    expect(parseQualityRating('YELLOW')).toBe('yellow')
    expect(parseQualityRating('RED')).toBe('red')
  })

  it('cualquier otra cosa es unknown, y unknown no mueve nada', () => {
    expect(parseQualityRating('UNKNOWN')).toBe('unknown')
    expect(parseQualityRating(null)).toBe('unknown')
    expect(parseQualityRating('')).toBe('unknown')
    expect(parseQualityRating('AZUL')).toBe('unknown')
  })
})

describe('decidirEstado — el sondeo solo puede apretar', () => {
  it('rojo congela de inmediato, sin esperar una segunda lectura', () => {
    const d = decidirEstado(lectura('red'), 'active', 'green')
    expect(d.nuevoEstado).toBe('frozen')
    expect(d.motivo).toContain('ROJO')
  })

  it('un amarillo AISLADO no hace nada', () => {
    // Un amarillo suelto suele ser ruido. La histéresis es intencional.
    expect(decidirEstado(lectura('yellow'), 'active', 'green').nuevoEstado).toBeNull()
  })

  it('dos amarillos seguidos estrangulan', () => {
    const d = decidirEstado(lectura('yellow'), 'active', 'yellow')
    expect(d.nuevoEstado).toBe('throttled')
  })

  it('VERDE NO REACTIVA NADA — ni desde frozen ni desde throttled', () => {
    // La regla más importante del archivo. Si la métrica mejoró porque la
    // campaña dejó de enviar, reactivarla vuelve a poner en marcha justo lo que
    // causó la caída. Reactivar es una decisión humana con motivo escrito.
    expect(decidirEstado(lectura('green'), 'frozen', 'red').nuevoEstado).toBeNull()
    expect(decidirEstado(lectura('green'), 'throttled', 'yellow').nuevoEstado).toBeNull()
  })

  it('unknown tampoco mueve el estado', () => {
    // No poder leer la calidad no es una razón para cambiar nada.
    expect(decidirEstado(lectura('unknown'), 'active', 'green').nuevoEstado).toBeNull()
    expect(decidirEstado(lectura('unknown'), 'frozen', 'red').nuevoEstado).toBeNull()
  })

  it('no re-congela lo ya congelado (no genera un cambio de estado vacío)', () => {
    expect(decidirEstado(lectura('red'), 'frozen', 'red').nuevoEstado).toBeNull()
  })

  it('el límite se propaga aunque el estado no cambie', () => {
    // Sincronizar el escalón y apretar el freno son cosas independientes: una
    // línea verde que subió de escalón tiene que actualizar su cupo igual.
    const d = decidirEstado(lectura('green', 10_000), 'active', 'green')
    expect(d.nuevoEstado).toBeNull()
    expect(d.limite).toBe(10_000)
  })
})
