/**
 * Las dos funciones PURAS del apartado de Domicilios (§18.d + §24.3-B):
 *
 *   · `explainDeliveryFailure()` — el mapa de motivos, espejo de la tabla de
 *     `docs/features/delivery-ai-parsing.md`.
 *   · `assessDeliverySilence()`  — la alarma de silencio con umbral DERIVADO del
 *     historial de cada marca.
 *
 * Cero llamadas reales a nada: ni base, ni red, ni `Date.now()`. El día de hoy entra por
 * parámetro justamente para que estas pruebas no dependan del reloj de quien las corre —
 * si dependieran, fallarían a medianoche y nadie sabría por qué.
 */

import { describe, it, expect } from 'vitest'
import {
  explainDeliveryFailure,
  knownDeliveryFailureReasons,
} from '@/lib/delivery-reasons'
import {
  assessDeliverySilence,
  daysBetween,
  MIN_ACTIVE_DAYS_FOR_BASELINE,
  SILENCE_WINDOW_DAYS,
  type DeliveryDayBucket,
} from '@/lib/delivery-silence'

// ═══════════════════════════════════════════════════════════════
// El mapa de motivos
// ═══════════════════════════════════════════════════════════════

describe('explainDeliveryFailure() — el motivo, traducido', () => {
  /**
   * La unión `DeliveryIntakeReason` de `src/services/delivery.service.ts`, que es
   * `DeliveryExtractionReason` más los tres que aportan el registro y la puerta de
   * entrada. Escrita a mano acá a propósito: si alguien agrega un motivo nuevo al intake
   * y no lo traduce, esta prueba lo dice en vez de dejar que salga en pantalla como
   * «motivo nuevo, sin traducir» para siempre.
   */
  const MOTIVOS_DEL_INTAKE = [
    'mensaje_vacio',
    'ia_no_configurada',
    'ia_sin_respuesta',
    'ia_error',
    'json_invalido',
    'celular_invalido',
    'celular_invalido_registro',
    'registro_fallido',
    'remitente_no_verificable',
  ]

  it('traduce los nueve motivos que el intake sabe producir hoy', () => {
    for (const reason of MOTIVOS_DEL_INTAKE) {
      const e = explainDeliveryFailure(reason)
      expect(e.conocido, `«${reason}» no está traducido`).toBe(true)
      expect(e.reason).toBe(reason)
      expect(e.label.length).toBeGreaterThan(0)
      expect(e.quePaso.length).toBeGreaterThan(0)
      expect(e.queHacer.length).toBeGreaterThan(0)
    }
  })

  it('el mapa no traduce motivos que el intake no produce (espejo, en las dos direcciones)', () => {
    expect(knownDeliveryFailureReasons().sort()).toEqual([...MOTIVOS_DEL_INTAKE].sort())
  })

  it('distingue lo que arregla el operador de lo que arreglamos nosotros', () => {
    // El TwiML de Twilio ya hace esta distinción («escribe mejor el pedido» vs «avisa al
    // administrador»); la pantalla la conserva en vez de aplanarla a "error".
    expect(explainDeliveryFailure('celular_invalido').blame).toBe('operador')
    expect(explainDeliveryFailure('ia_no_configurada').blame).toBe('nosotros')
    expect(explainDeliveryFailure('registro_fallido').blame).toBe('nosotros')
    // El más traicionero: NO es culpa de quien escribió el pedido.
    expect(explainDeliveryFailure('remitente_no_verificable').blame).toBe('nosotros')
  })

  it('un motivo desconocido NO se pierde ni rompe: se muestra crudo y marcado', () => {
    // `reason` es texto libre en la 00053 a propósito (un CHECK obligaría una migración
    // cada vez que el intake aprenda a fallar de una forma nueva). Esta es la contraparte
    // en la interfaz de esa decisión.
    const e = explainDeliveryFailure('motivo_que_todavia_no_existe')
    expect(e.conocido).toBe(false)
    expect(e.reason).toBe('motivo_que_todavia_no_existe')
    expect(e.label).toBe('motivo_que_todavia_no_existe')
    expect(e.blame).toBe('nosotros')
  })

  it('null, undefined y vacío no revientan', () => {
    for (const v of [null, undefined, '', '   ']) {
      const e = explainDeliveryFailure(v)
      expect(e.conocido).toBe(false)
      expect(e.reason).toBe('(sin motivo)')
    }
  })

  it('ignora los espacios de alrededor', () => {
    expect(explainDeliveryFailure('  celular_invalido  ').conocido).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// La alarma de silencio
// ═══════════════════════════════════════════════════════════════

describe('daysBetween()', () => {
  it('cuenta días calendario', () => {
    expect(daysBetween('2026-09-01', '2026-09-08')).toBe(7)
    expect(daysBetween('2026-09-07', '2026-09-07')).toBe(0)
  })

  it('cruza fin de mes y fin de año sin correrse un día', () => {
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
  })

  it('devuelve null ante una fecha con otra forma', () => {
    expect(daysBetween('7/9/2026', '2026-09-08')).toBeNull()
    expect(daysBetween('2026-09-08', 'ayer')).toBeNull()
  })
})

/** Construye N días consecutivos con pedido, terminando el día indicado. */
function diasSeguidos(hasta: string, cuantos: number, count = 1): DeliveryDayBucket[] {
  const [y, m, d] = hasta.split('-').map(Number)
  const out: DeliveryDayBucket[] = []
  for (let i = 0; i < cuantos; i++) {
    const fecha = new Date(Date.UTC(y, m - 1, d - i))
    out.push({ date: fecha.toISOString().slice(0, 10), count })
  }
  return out
}

describe('assessDeliverySilence() — el umbral sale del historial, nunca es fijo', () => {
  it('sin un solo pedido en la ventana: no afirma nada, y lo dice', () => {
    const r = assessDeliverySilence({ days: [], today: '2026-09-07' })
    expect(r.status).toBe('sin_historial')
    expect(r.activeDays).toBe(0)
    expect(r.daysSilent).toBeNull()
    expect(r.lastDeliveryDate).toBeNull()
    expect(r.alarmaAtDays).toBeNull()
  })

  it(`con menos de ${MIN_ACTIVE_DAYS_FOR_BASELINE} días activos prefiere callarse a inventar un promedio`, () => {
    const r = assessDeliverySilence({
      days: [
        { date: '2026-08-20', count: 1 },
        { date: '2026-08-21', count: 2 },
      ],
      today: '2026-09-07',
    })
    expect(r.status).toBe('sin_historial')
    expect(r.activeDays).toBe(2)
    expect(r.totalDeliveries).toBe(3)
    // El silencio SÍ se calcula aunque no haya umbral: es un hecho, no un juicio.
    expect(r.daysSilent).toBe(17)
    expect(r.alarmaAtDays).toBeNull()
  })

  // ── La marca que pide a diario (Sushi Service) ──
  describe('una marca con pedidos casi diarios', () => {
    const days = diasSeguidos('2026-09-07', 28)

    it('con un pedido hoy está al día', () => {
      const r = assessDeliverySilence({ days, today: '2026-09-07' })
      expect(r.status).toBe('al_dia')
      expect(r.activeDays).toBe(28)
      expect(r.typicalGapDays).toBe(1)
      expect(r.avisoAtDays).toBe(2)
      expect(r.alarmaAtDays).toBe(3)
      expect(r.daysSilent).toBe(0)
    })

    it('un día tranquilo todavía NO es un aviso', () => {
      const r = assessDeliverySilence({ days, today: '2026-09-08' })
      expect(r.daysSilent).toBe(1)
      expect(r.status).toBe('al_dia')
    })

    it('dos días de silencio ya se salieron de su ritmo', () => {
      const r = assessDeliverySilence({ days, today: '2026-09-09' })
      expect(r.daysSilent).toBe(2)
      expect(r.status).toBe('aviso')
    })

    it('tres días sin un solo pedido es una alarma', () => {
      const r = assessDeliverySilence({ days, today: '2026-09-10' })
      expect(r.daysSilent).toBe(3)
      expect(r.status).toBe('alarma')
      expect(r.message).toContain('3 días')
    })
  })

  // ── La marca de ritmo lento (la barbería / Café Frangal del requisito) ──
  describe('una marca de ritmo lento', () => {
    // 4 días con pedido en 28 → un pedido cada 7 días.
    const days: DeliveryDayBucket[] = [
      { date: '2026-08-17', count: 1 },
      { date: '2026-08-24', count: 1 },
      { date: '2026-08-31', count: 2 },
      { date: '2026-09-05', count: 1 },
    ]

    it('deriva un umbral MUCHO más alto que el de la marca diaria', () => {
      const r = assessDeliverySilence({ days, today: '2026-09-07' })
      expect(r.activeDays).toBe(4)
      expect(r.typicalGapDays).toBe(7)
      expect(r.avisoAtDays).toBe(8)
      expect(r.alarmaAtDays).toBe(15)
    })

    it('LOS MISMOS 3 días de silencio que alarman a la marca diaria acá no dicen nada', () => {
      // Es el requisito de §24.3-B, textual: un número fijo le sirve a Sushi Service y no
      // a una barbería. Esta es la prueba de que no es fijo.
      const r = assessDeliverySilence({ days, today: '2026-09-08' })
      expect(r.daysSilent).toBe(3)
      expect(r.status).toBe('al_dia')

      const diaria = assessDeliverySilence({ days: diasSeguidos('2026-09-05', 28), today: '2026-09-08' })
      expect(diaria.daysSilent).toBe(3)
      expect(diaria.status).toBe('alarma')
    })

    it('a los 8 días avisa y a los 15 alarma', () => {
      expect(assessDeliverySilence({ days, today: '2026-09-13' }).status).toBe('aviso')
      expect(assessDeliverySilence({ days, today: '2026-09-20' }).status).toBe('alarma')
    })
  })

  it('el promedio se calcula sobre días DISTINTOS, no sobre pedidos', () => {
    // Veinte pedidos en tres días no son «veinte días activos»: si contáramos filas, una
    // marca con un solo día muy movido parecería tener un ritmo diario.
    const days: DeliveryDayBucket[] = [
      { date: '2026-09-01', count: 12 },
      { date: '2026-09-03', count: 5 },
      { date: '2026-09-05', count: 3 },
    ]
    const r = assessDeliverySilence({ days, today: '2026-09-07' })
    expect(r.activeDays).toBe(3)
    expect(r.totalDeliveries).toBe(20)
    expect(r.typicalGapDays).toBeCloseTo(SILENCE_WINDOW_DAYS / 3, 6)
  })

  it('las fechas repetidas cuentan una vez y los días en cero no cuentan', () => {
    const days: DeliveryDayBucket[] = [
      { date: '2026-09-01', count: 1 },
      { date: '2026-09-01', count: 2 },
      { date: '2026-09-02', count: 0 },
      { date: '2026-09-03', count: 1 },
      { date: '2026-09-04', count: 1 },
    ]
    const r = assessDeliverySilence({ days, today: '2026-09-05' })
    // 3 días DISTINTOS con pedido, pero 1+2+1+1 = 5 pedidos: la fecha repetida se cuenta
    // una vez para el ritmo y sus pedidos se suman igual. Son dos preguntas distintas.
    expect(r.activeDays).toBe(3)
    expect(r.totalDeliveries).toBe(5)
    expect(r.lastDeliveryDate).toBe('2026-09-04')
  })

  it('una fecha con otra forma se ignora en vez de romper el cálculo', () => {
    const days = [
      ...diasSeguidos('2026-09-07', 5),
      { date: 'ayer', count: 99 } as DeliveryDayBucket,
    ]
    const r = assessDeliverySilence({ days, today: '2026-09-07' })
    expect(r.activeDays).toBe(5)
    expect(r.totalDeliveries).toBe(5)
  })

  it('un pedido con fecha futura no produce un silencio negativo', () => {
    const r = assessDeliverySilence({ days: diasSeguidos('2026-09-10', 5), today: '2026-09-07' })
    expect(r.daysSilent).toBe(0)
    expect(r.status).toBe('al_dia')
  })

  it('la ventana es configurable y mueve los dos umbrales con ella', () => {
    const days = diasSeguidos('2026-09-07', 7)
    const r = assessDeliverySilence({ days, today: '2026-09-07', windowDays: 14 })
    expect(r.windowDays).toBe(14)
    expect(r.typicalGapDays).toBe(2)
    expect(r.avisoAtDays).toBe(3)
    expect(r.alarmaAtDays).toBe(5)
  })

  it('el mensaje siempre nombra los días de silencio Y el ritmo propio', () => {
    // «llevás N días sin un solo pedido, cuando tu promedio es M» — §24.3-B, textual.
    const r = assessDeliverySilence({ days: diasSeguidos('2026-09-01', 28), today: '2026-09-07' })
    expect(r.status).toBe('alarma')
    expect(r.message).toContain('6 días')
    expect(r.message).toContain('casi todos los días')
  })
})
