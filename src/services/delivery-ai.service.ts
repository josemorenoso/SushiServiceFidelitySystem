/**
 * Extracción con IA del cuadro de un pedido de domicilio.
 *
 * Es la réplica dentro del producto de los nodos «IA Extrae Datos del Pedido» y
 * «Parsear Respuesta IA» de `n8n/domicilios_whatsapp_v4.json` (Fase 2 de §25). El prompt
 * y el parseo defensivo **no se reinventaron**: son los que llevan meses en producción.
 * Ver `docs/features/delivery-ai-parsing.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL PARSEO ES UNA FUNCIÓN PURA, Y ESO ES LO QUE SE PRUEBA
 * ─────────────────────────────────────────────────────────────────────────────
 * `parseDeliveryAiJson()` no toca la red ni la base: recibe el texto que devolvió el
 * modelo y devuelve el pedido o lanza con el motivo real. Toda la parte frágil — los
 * backticks del markdown, el celular que la IA se inventa, el monto que llega como
 * `"45.000"` — se prueba sin llamar a OpenAI ni una vez.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NADA FALLA EN SILENCIO
 * ─────────────────────────────────────────────────────────────────────────────
 * Cada salida mala lanza `DeliveryExtractionError` con un `reason` de la unión de abajo.
 * El llamador lo registra y, cuando el canal lo permite, se lo dice al operador. Perder
 * un domicilio callado es peor que fallar ruidosamente (§24).
 */

import { OpenAIConfigError, getOpenAIClient } from '@/lib/openai/client'
import {
  DELIVERY_AI_MAX_TOKENS,
  DELIVERY_AI_MODEL,
  DELIVERY_AI_TEMPERATURE,
  buildDeliveryExtractionPrompt,
} from '@/constants/delivery-ai'

/**
 * Por qué no se pudo sacar un pedido del mensaje. Se propaga hasta el log y, en Twilio,
 * hasta el mesero. Son categorías con acciones distintas:
 *   · `mensaje_vacio` / `json_invalido` / `celular_invalido` → el mensaje se reenvía mejor.
 *   · `ia_no_configurada` / `ia_error` → no es culpa del operador; avisar al administrador.
 */
export type DeliveryExtractionReason =
  | 'mensaje_vacio'
  | 'ia_no_configurada'
  | 'ia_sin_respuesta'
  | 'ia_error'
  | 'json_invalido'
  | 'celular_invalido'

/** Fallo de extracción con el motivo REAL, nunca un `catch` mudo. */
export class DeliveryExtractionError extends Error {
  readonly reason: DeliveryExtractionReason
  /** Detalle crudo para el log: el texto de la IA recortado, el mensaje de la excepción… */
  readonly detail: string

  constructor(reason: DeliveryExtractionReason, detail: string) {
    super(`[${reason}] ${detail}`)
    this.name = 'DeliveryExtractionError'
    this.reason = reason
    this.detail = detail
  }
}

/** El pedido ya estructurado. Mismos seis campos que arma el nodo «Parsear Respuesta IA». */
export interface ParsedDeliveryOrder {
  nombre_cliente: string
  /** 10 dígitos colombianos validados contra `^3\d{9}$`. Nunca vacío. */
  celular: string
  direccion: string | null
  metodo_pago: string | null
  monto_total: number | null
  ciudad: string | null
}

/**
 * La llamada al modelo, aislada en una función para poder inyectarla en las pruebas.
 * Devuelve el CONTENIDO en crudo del mensaje del asistente, sin tocar.
 */
export type DeliveryCompletion = (args: { system: string; user: string }) => Promise<string>

/** ¿Es un objeto JSON (y no un número, un string, un array o `null`)? */
function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/** Campo de texto opcional: `''`, `null` y `undefined` colapsan a `null`, igual que el `||` de n8n. */
function textoOpcional(valor: unknown): string | null {
  if (typeof valor === 'string') {
    const limpio = valor.trim()
    return limpio.length > 0 ? limpio : null
  }
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  return null
}

/**
 * Normaliza el monto igual que el nodo de n8n: si ya es número se respeta; si es texto se
 * le quitan los caracteres que no sean dígito o punto y se hace `parseFloat`; si queda
 * `NaN`, `null`.
 *
 * ⚠️ `"45.000"` (cuarenta y cinco mil, con punto de miles colombiano) se convierte en
 * `45` — el punto se lee como decimal. Es el comportamiento que corre hoy en producción y
 * se conserva TAL CUAL: la defensa real está en el prompt, que le pide a la IA el número
 * ya limpio ("sin puntos, sin $"). Cambiar esto aquí sin cambiar el prompt movería montos
 * de pedidos reales sin que nadie lo pida.
 */
function normalizarMonto(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'number') return Number.isNaN(valor) ? null : valor
  const numero = parseFloat(String(valor).replace(/[^0-9.]/g, ''))
  return Number.isNaN(numero) ? null : numero
}

/**
 * Normaliza el celular que devolvió la IA y lo valida contra `^3\d{9}$`.
 *
 * Réplica exacta de la cadena de `replace` del nodo «Parsear Respuesta IA»:
 * separadores → prefijo `+57`/`57` → un `0` inicial → los últimos 10 dígitos.
 */
function normalizarCelular(valor: unknown): string {
  return String(valor ?? '')
    .replace(/[\s\-()]/g, '')
    .replace(/^\+?57/, '')
    .replace(/^0/, '')
    .slice(-10)
}

/**
 * El nodo «Parsear Respuesta IA», sin red ni base de datos.
 *
 * @param content contenido crudo del mensaje del modelo.
 * @param cityHint ciudad por defecto de la marca; se usa solo si la IA no devolvió ciudad.
 * @throws {DeliveryExtractionError} `json_invalido` o `celular_invalido`.
 */
export function parseDeliveryAiJson(content: string, cityHint: string | null = null): ParsedDeliveryOrder {
  // Limpiar posibles backticks o whitespace — la IA a veces envuelve el JSON en un
  // bloque markdown pese a que el prompt se lo prohíbe. Está probado en producción.
  const limpio = content.replace(/```json\n?/g, '').replace(/```/g, '').trim()

  let crudo: unknown
  try {
    crudo = JSON.parse(limpio)
  } catch {
    throw new DeliveryExtractionError(
      'json_invalido',
      `La IA no devolvió JSON válido: ${content.slice(0, 200)}`
    )
  }

  if (!esObjetoPlano(crudo)) {
    throw new DeliveryExtractionError(
      'json_invalido',
      `La IA devolvió JSON que no es un objeto: ${limpio.slice(0, 200)}`
    )
  }

  const celular = normalizarCelular(crudo.celular)
  if (!/^3\d{9}$/.test(celular)) {
    throw new DeliveryExtractionError(
      'celular_invalido',
      `No se encontró un celular colombiano válido. IA extrajo: ${textoOpcional(crudo.celular) ?? 'nada'}`
    )
  }

  const nombre = textoOpcional(crudo.nombre_cliente) ?? 'Cliente Domicilio'

  return {
    nombre_cliente: nombre,
    celular,
    direccion: textoOpcional(crudo.direccion),
    metodo_pago: textoOpcional(crudo.metodo_pago),
    monto_total: normalizarMonto(crudo.monto_total),
    // El default de ciudad ya NO está horneado en el parseo (era «Envigado», de un solo
    // tenant). Sale de la marca; sin configurar, se queda en null. Ver delivery-ai.ts.
    ciudad: textoOpcional(crudo.ciudad) ?? cityHint,
  }
}

/** La llamada real a OpenAI. Es el único punto del módulo que sale a la red. */
const completarConOpenAI: DeliveryCompletion = async ({ system, user }) => {
  const respuesta = await getOpenAIClient().chat.completions.create({
    model: DELIVERY_AI_MODEL,
    temperature: DELIVERY_AI_TEMPERATURE,
    max_completion_tokens: DELIVERY_AI_MAX_TOKENS,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  return respuesta.choices[0]?.message?.content ?? ''
}

export interface ExtractDeliveryOrderOptions {
  /** El cuadro del pedido tal como lo escribió el operador. */
  message: string
  /** `tenants.config.delivery_default_city`. `null` = la IA no inventa ciudad. */
  cityHint?: string | null
  /** Costura para las pruebas: NINGÚN test llama a la API de verdad. */
  complete?: DeliveryCompletion
}

/**
 * Mensaje libre del operador → pedido estructurado.
 *
 * @throws {DeliveryExtractionError} siempre con el motivo real; nunca devuelve un pedido
 *         a medias ni se traga la excepción.
 */
export async function extractDeliveryOrder({
  message,
  cityHint = null,
  complete = completarConOpenAI,
}: ExtractDeliveryOrderOptions): Promise<ParsedDeliveryOrder> {
  const texto = (message ?? '').trim()
  if (!texto) {
    // Mismo corte que el nodo «Extraer Remitente y Body»: `if (!body) throw`.
    throw new DeliveryExtractionError('mensaje_vacio', 'El mensaje del operador llegó vacío')
  }

  let contenido: string
  try {
    contenido = await complete({ system: buildDeliveryExtractionPrompt(cityHint), user: texto })
  } catch (err) {
    if (err instanceof OpenAIConfigError) {
      throw new DeliveryExtractionError('ia_no_configurada', err.message)
    }
    throw new DeliveryExtractionError(
      'ia_error',
      err instanceof Error ? err.message : String(err)
    )
  }

  if (!contenido || !contenido.trim()) {
    throw new DeliveryExtractionError('ia_sin_respuesta', 'OpenAI devolvió una respuesta vacía')
  }

  return parseDeliveryAiJson(contenido, cityHint)
}
