/**
 * El divisor de bloques de Golden Bullet (D-7) y los dos botones de la plantilla.
 *
 * Las dos cosas que se prueban acá son PURAS a propósito: la aritmética de
 * "cuántos días son" es exactamente lo que el dueño mira antes de decir que sí,
 * y el reconocimiento del botón es lo único que separa un "no me interesa" de
 * que le sigamos escribiendo a alguien que pidió salir.
 *
 * Ref: docs/features/golden-bullet.md
 *      docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md §20 / D-7
 */

import { describe, it, expect } from 'vitest'
import { planBlocks } from '@/services/imported-contacts.service'
import { detectClubButton, CLUB_PAYLOAD_SI, CLUB_PAYLOAD_NO } from '@/services/club-optin.service'

const AHORA = new Date('2026-09-10T12:00:00.000Z')

function dias(plan: { startsAt: string; endsAt: string }): number {
  const ini = new Date(plan.startsAt)
  const fin = new Date(plan.endsAt)
  return Math.round((fin.getTime() - ini.getTime()) / 86_400_000)
}

describe('planBlocks — el reparto en bloques', () => {
  it('el caso que originó todo: 25.000 contactos en una línea de 250', () => {
    // Presupuesto de campaña 180 = 250 − 70 de reserva transaccional.
    const plan = planBlocks(25_000, 1_000, 180, AHORA)

    expect(plan.blockSize).toBe(180)
    expect(plan.cappedByBudget).toBe(true)
    // 25.000 / 180 = 138,9 → 139 días. Es EL número que hay que ver antes de
    // prometerle a alguien que su base se despierta mañana.
    expect(plan.days).toBe(139)
    expect(dias(plan)).toBe(138) // el bloque 0 sale hoy
  })

  it('la misma base en una línea de 10.000 son 3 días', () => {
    const plan = planBlocks(25_000, 10_000, 9_900, AHORA)
    expect(plan.blockSize).toBe(9_900)
    expect(plan.days).toBe(3)
  })

  it('respeta al operador cuando pide MENOS que el cupo', () => {
    // D-7: el tamaño lo elige el operador. El sistema solo acota hacia abajo,
    // nunca lo sube porque haya cupo de sobra.
    const plan = planBlocks(1_000, 50, 900, AHORA)
    expect(plan.blockSize).toBe(50)
    expect(plan.cappedByBudget).toBe(false)
    expect(plan.days).toBe(20)
  })

  it('sin límite conocido, el número del operador es el único freno', () => {
    // `campaignBudget = null` es el estado real de las 5 marcas vivas: se mide
    // el consumo pero no se frena. Inventar un tope acá le cortaría campañas a
    // quien sí tenía cupo.
    const plan = planBlocks(5_000, 500, null, AHORA)
    expect(plan.blockSize).toBe(500)
    expect(plan.campaignBudget).toBeNull()
    expect(plan.cappedByBudget).toBe(false)
    expect(plan.days).toBe(10)
  })

  it('una base que cabe en un bloque es un solo día, y empieza y termina hoy', () => {
    const plan = planBlocks(100, 180, 180, AHORA)
    expect(plan.days).toBe(1)
    expect(plan.startsAt).toBe(plan.endsAt)
  })

  it('cero contactos son cero días, no una división por cero', () => {
    const plan = planBlocks(0, 180, 180, AHORA)
    expect(plan.days).toBe(0)
    expect(plan.blockSize).toBe(180)
  })

  it('un tamaño de bloque absurdo no rompe la aritmética', () => {
    // El formulario ya lo valida, pero esto no puede depender del formulario:
    // un 0 o un negativo daría Infinity días y una fecha inválida.
    expect(planBlocks(500, 0, null, AHORA).days).toBe(500)
    expect(planBlocks(500, -10, null, AHORA).days).toBe(500)
    expect(planBlocks(500, 3.7, null, AHORA).blockSize).toBe(3)
  })

  it('un presupuesto de cero se trata como desconocido, no como "no mandes nada"', () => {
    // Un 0 acá vendría de una línea sin cupo hoy. La puerta de calidad y el
    // drenador son quienes frenan eso; el planificador no puede devolver una
    // división por cero.
    const plan = planBlocks(100, 25, 0, AHORA)
    expect(plan.blockSize).toBe(25)
    expect(plan.days).toBe(4)
  })
})

describe('detectClubButton — los dos botones de la plantilla', () => {
  it('reconoce los payloads, que son el contrato con la plantilla', () => {
    expect(detectClubButton('lo que sea', CLUB_PAYLOAD_SI)).toBe('opt_in')
    expect(detectClubButton('lo que sea', CLUB_PAYLOAD_NO)).toBe('opt_out')
  })

  it('el payload manda sobre el texto visible', () => {
    // Si el proveedor manda las dos cosas, la que no depende de la redacción gana.
    expect(detectClubButton('No, gracias', CLUB_PAYLOAD_SI)).toBe('opt_in')
  })

  it('cae al texto visible cuando no viene payload', () => {
    expect(detectClubButton('Quiero ser parte')).toBe('opt_in')
    expect(detectClubButton('No, gracias')).toBe('opt_out')
  })

  it('no le importan mayúsculas ni espacios de más', () => {
    expect(detectClubButton('  QUIERO SER PARTE  ')).toBe('opt_in')
    expect(detectClubButton('no, gracias')).toBe('opt_out')
  })

  it('«No, gracias» NO lo agarraba la lista vieja de palabras clave', () => {
    // Esta es la razón de que este detector exista. `OPT_OUT_KEYWORDS` compara
    // el cuerpo ENTERO contra la lista, y 'NO, GRACIAS' no es 'NO': sin este
    // bloque, quien tocara el botón de rechazo recibía el menú de intenciones.
    const KEYWORDS_VIEJAS = ['STOP', 'SALIR', 'NO', 'BAJA']
    expect(KEYWORDS_VIEJAS.includes('NO, GRACIAS')).toBe(false)
    expect(detectClubButton('No, gracias')).toBe('opt_out')
  })

  it('un mensaje normal no es un botón', () => {
    expect(detectClubButton('hola quiero pedir un domicilio')).toBeNull()
    expect(detectClubButton('')).toBeNull()
    expect(detectClubButton('   ')).toBeNull()
    // 'NO' pelado sigue siendo asunto de OPT_OUT_KEYWORDS, no de este detector:
    // meterlo acá le robaría el opt-out a la ruta que sí sabe contestarlo.
    expect(detectClubButton('NO')).toBeNull()
  })
})
