/**
 * El motivo de un domicilio perdido, traducido a algo que el dueño del restaurante
 * pueda leer y ACTUAR.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ───────────────────────────
 * `delivery_intake_failures.reason` guarda el `DeliveryIntakeReason` crudo
 * (`celular_invalido`, `remitente_no_verificable`…). Es la cadena correcta para el
 * log y para el AIOS, y es ilegible para quien manda los pedidos. Esta es la capa de
 * traducción, y vive aparte del servicio a propósito: es **pura** y se prueba entera
 * sin base de datos.
 *
 * LOS TEXTOS NO SON INVENTADOS
 * ────────────────────────────
 * La columna «qué pasó» es la tabla de motivos de `docs/features/delivery-ai-parsing.md`
 * § "Cuando falla — el motivo REAL, nunca el silencio", pasada a lenguaje de dueño. Si
 * esa tabla cambia, este archivo cambia con ella **en el mismo commit**: son espejo.
 *
 * `reason` ES TEXTO LIBRE EN LA BASE, Y ESO ES DELIBERADO
 * ──────────────────────────────────────────────────────
 * La 00053 lo dice con todas las letras: un CHECK obligaría a una migración cada vez
 * que el intake aprenda a fallar de una forma nueva, y perder el motivo es peor que
 * guardarlo sin validar. Consecuencia para esta capa: **un motivo desconocido no puede
 * romper la pantalla ni desaparecer**. Se muestra crudo, marcado como desconocido, que
 * es exactamente la información que hace falta para ir a leer el código.
 */

/** Quién puede hacer algo con este fallo. Es la distinción que ya hace el TwiML de Twilio. */
export type DeliveryFailureBlame =
  /** Se arregla escribiendo mejor el pedido. El operador puede reenviarlo y ya. */
  | 'operador'
  /** Se arregla del lado de Cada1 (configuración, base, IA). Reenviar no sirve de nada. */
  | 'nosotros'

export interface DeliveryFailureExplanation {
  /** El valor crudo tal como está en la base. Nunca se pierde. */
  reason: string
  /** Etiqueta corta, para una insignia. */
  label: string
  /** Qué pasó, en una frase. Espejo de la tabla de `delivery-ai-parsing.md`. */
  quePaso: string
  /** Qué hacer al respecto. */
  queHacer: string
  blame: DeliveryFailureBlame
  /**
   * `false` = este `reason` no está en el mapa. El intake aprendió a fallar de una
   * forma que esta pantalla todavía no sabe nombrar; se muestra crudo en vez de
   * esconderlo detrás de un "error desconocido" que no dice nada.
   */
  conocido: boolean
}

type Entry = Omit<DeliveryFailureExplanation, 'reason' | 'conocido'>

/**
 * El mapa. Las nueve claves son la unión `DeliveryIntakeReason` de
 * `src/services/delivery.service.ts` (que a su vez extiende `DeliveryExtractionReason`
 * de `delivery-ai.service.ts`).
 */
const MOTIVOS: Record<string, Entry> = {
  mensaje_vacio: {
    label: 'Mensaje vacío',
    quePaso: 'El cuadro del pedido llegó sin texto.',
    queHacer:
      'Suele ser una foto o un audio reenviado sin escribir nada. El pedido tiene que ir como TEXTO: reenvíalo escrito.',
    blame: 'operador',
  },
  ia_no_configurada: {
    label: 'Falta la clave de la IA',
    quePaso: 'El lector de pedidos no tiene su clave configurada (`OPENAI_API_KEY`).',
    queHacer:
      'No es culpa de quien mandó el pedido y reenviarlo no sirve: mientras esto siga así no entra ni un domicilio. Avísale a Cada1.',
    blame: 'nosotros',
  },
  ia_error: {
    label: 'La IA no respondió',
    quePaso: 'El lector de pedidos se cayó o tardó demasiado.',
    queHacer: 'Es pasajero. Reenviá el mismo cuadro: casi siempre entra al segundo intento.',
    blame: 'operador',
  },
  ia_sin_respuesta: {
    label: 'La IA respondió vacío',
    quePaso: 'El lector de pedidos contestó, pero sin contenido.',
    queHacer: 'Es pasajero. Reenviá el mismo cuadro.',
    blame: 'operador',
  },
  json_invalido: {
    label: 'Respuesta ilegible',
    quePaso: 'El lector de pedidos devolvió algo que no se pudo interpretar.',
    queHacer:
      'Reenviá el pedido. Si pasa varias veces con el mismo cuadro, es el formato del mensaje: probá escribirlo más simple.',
    blame: 'operador',
  },
  celular_invalido: {
    label: 'Celular no válido',
    quePaso:
      'En el mensaje no había un celular colombiano de 10 dígitos que empiece por 3 — o el que había no lo era.',
    queHacer:
      'Es el único dato imprescindible. Reenviá el pedido con el celular del CLIENTE completo (10 dígitos, empieza por 3).',
    blame: 'operador',
  },
  celular_invalido_registro: {
    label: 'Celular rechazado al guardar',
    quePaso: 'El celular pasó el lector de pedidos pero no la validación de la base.',
    queHacer:
      'Revisá que sea el celular del cliente y no un fijo, un número de otro país o el número del local. Reenvialo corregido.',
    blame: 'operador',
  },
  registro_fallido: {
    label: 'No se pudo guardar',
    quePaso: 'El pedido se leyó bien, pero falló la escritura en la base de datos.',
    queHacer:
      'El pedido se entendió y aun así no quedó registrado. Reenvialo; si vuelve a fallar, avisale a Cada1.',
    blame: 'nosotros',
  },
  remitente_no_verificable: {
    label: 'No se pudo verificar quién lo mandó',
    quePaso:
      'La consulta a la lista de autorizados se cayó, así que no se pudo saber si quien escribió era un operador tuyo.',
    queHacer:
      'Es el fallo más traicionero de todos y por eso tiene nombre propio: el pedido NO se descartó por estar mal escrito, se descartó porque la base no contestó. Reenvialo; si se repite, avisale a Cada1.',
    blame: 'nosotros',
  },
}

/**
 * Traduce un `reason` crudo. **Nunca lanza y nunca devuelve `null`**: un motivo que no
 * conoce se devuelve marcado con `conocido: false` y su cadena original a la vista.
 */
export function explainDeliveryFailure(reason: string | null | undefined): DeliveryFailureExplanation {
  const crudo = (reason ?? '').trim()
  const entry = MOTIVOS[crudo]

  if (!entry) {
    return {
      reason: crudo || '(sin motivo)',
      label: crudo || 'Sin motivo',
      quePaso: 'Un motivo que esta pantalla todavía no sabe nombrar.',
      queHacer:
        'El detalle y el mensaje original están abajo tal cual quedaron guardados. Pasáselos a Cada1: el intake aprendió a fallar de una forma nueva.',
      blame: 'nosotros',
      conocido: false,
    }
  }

  return { reason: crudo, ...entry, conocido: true }
}

/** Los motivos que esta pantalla sabe traducir. Existe para el test de espejo. */
export function knownDeliveryFailureReasons(): string[] {
  return Object.keys(MOTIVOS)
}
