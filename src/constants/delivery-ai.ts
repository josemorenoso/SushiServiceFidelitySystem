/**
 * El prompt de extracción de domicilios — LITERAL, traído de n8n.
 *
 * Fase 2 de §25 (`docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md`): el parseo con IA
 * deja de vivir en `n8n/domicilios_whatsapp_v4.json` y pasa al producto. Este archivo es
 * la copia del `system` del nodo «IA Extrae Datos del Pedido», que lleva meses en
 * producción. Ver `docs/features/delivery-ai-parsing.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE ARCHIVO NO LLAMA A NADIE, A PROPÓSITO
 * ─────────────────────────────────────────────────────────────────────────────
 * Mandamiento II: el texto va separado de la lógica. Aquí solo hay constantes y una
 * función pura que arma un string; el I/O contra OpenAI vive en
 * `src/services/delivery-ai.service.ts` y el cliente en `src/lib/openai/client.ts`.
 *
 * ⚠️ CAMBIAR EL PROMPT CAMBIA LOS DATOS QUE ENTRAN A LA BASE. Los seis campos que
 * declara abajo son exactamente los que `registerDeliveryOrder()` escribe en
 * `customers` y `visits`. Quitar uno no rompe el parseo: lo deja en `null` en silencio.
 */

/** El modelo del nodo de n8n. No se cambia sin medir: el prompt está calibrado para él. */
export const DELIVERY_AI_MODEL = 'gpt-4o-mini'

/** `temperature: 0` — extracción, no redacción. Copiado del nodo de n8n. */
export const DELIVERY_AI_TEMPERATURE = 0

/** `max_tokens: 400` en n8n. El JSON de un pedido cabe de sobra. */
export const DELIVERY_AI_MAX_TOKENS = 400

/**
 * Cuánto esperamos a OpenAI antes de rendirnos, y cuántas veces reintentamos.
 *
 * Twilio corta su webhook a los ~15 s y Zernio pide 2xx en menos de 5 s. n8n no tenía
 * este problema porque respondía a Twilio desde otro proceso; ahora el reloj corre
 * dentro de nuestra función. Con 8 s + 1 reintento el peor caso son ~16 s: Twilio
 * registra el timeout en su consola pero **el pedido ya quedó guardado** — el orden de
 * las operaciones es primero la base, después la respuesta.
 */
export const DELIVERY_AI_TIMEOUT_MS = 8_000
export const DELIVERY_AI_MAX_RETRIES = 1

/**
 * El prompt, con el hueco de la ciudad.
 *
 * ⚠️ POR QUÉ LA CIUDAD ES UN PARÁMETRO Y NO ESTÁ HORNEADA
 * ──────────────────────────────────────────────────────
 * El prompt que corre hoy en n8n termina con *«Por defecto: Envigado»*. Eso era correcto
 * cuando n8n servía a un solo restaurante; horneado en el producto le pondría **Envigado**
 * a los clientes de domicilio de los 25 tenants, y esa ciudad se escribe en
 * `customers.city` sin que nada avise. Así que el default sale de
 * `tenants.config.delivery_default_city` y, cuando no está configurado, el prompt deja de
 * inventar ciudad y devuelve `null`.
 *
 * **Sushi Service necesita `delivery_default_city: "Envigado"` en su `tenants.config`
 * para comportarse exactamente como hoy.** Sin eso no se rompe nada: los pedidos entran
 * igual, con `ciudad = null`.
 *
 * @param cityHint ciudad por defecto de la marca. `null` = sin default, la IA no inventa.
 */
export function buildDeliveryExtractionPrompt(cityHint: string | null): string {
  const lineaCiudad = cityHint
    ? `- ciudad (string) — ciudad del cliente inferida de la dirección. Si hay Cra, Cl, Tr, Calle sin ciudad explícita → ${cityHint}. Si hay una ciudad distinta escrita con claridad en el mensaje, usarla. Por defecto: ${cityHint}.`
    : '- ciudad (string | null) — ciudad del cliente, SOLO si aparece escrita en el mensaje o se deduce sin ambigüedad de la dirección. Si no hay ciudad clara, usa null. NO inventes una ciudad.'

  // Se arma con un array + join('\n') y comillas simples, no con un template literal:
  // la última línea termina con tres comillas invertidas y dentro de un template
  // literal habría que escaparlas, que es justo como se cuela una diferencia con el
  // texto que corre en n8n.
  return [
    'Eres un asistente que extrae datos de pedidos de domicilio desde mensajes de WhatsApp de un restaurante. Del mensaje del usuario, extrae estos campos en JSON estricto:',
    '- nombre_cliente (string) — nombre del cliente. Si no hay nombre claro, usa "Cliente Domicilio"',
    '- celular (string) — SOLO los 10 dígitos del celular colombiano (sin +57, sin espacios). Empieza con 3.',
    '- direccion (string | null) — dirección de entrega',
    '- metodo_pago (string | null) — efectivo, transferencia, nequi, daviplata, tarjeta, etc.',
    '- monto_total (number | null) — valor total en COP como número (sin puntos, sin $, "35mil"=35000, "50k"=50000)',
    lineaCiudad,
    '',
    'Si no puedes extraer un campo, usa null. El celular es OBLIGATORIO.',
    'Responde SOLO con el JSON válido, sin markdown, sin explicaciones, sin ```.',
  ].join('\n')
}
