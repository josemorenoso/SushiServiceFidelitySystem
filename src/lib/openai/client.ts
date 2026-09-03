/**
 * Cliente de OpenAI — el único lugar del producto que instancia el SDK.
 *
 * Nace con la Fase 2 de §25 (`docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md`): el
 * parseo con IA de los domicilios sale de n8n y entra al producto. Hasta hoy no había
 * ni una referencia a OpenAI en el repo — la llamada vivía en el nodo HTTP Request de
 * `n8n/domicilios_whatsapp_v4.json`, con la key guardada en las credenciales de n8n.
 *
 * Mismo patrón que `src/lib/twilio/client.ts` y `src/lib/zernio/client.ts`: una función
 * que resuelve el cliente perezosamente y **falla explícito** si falta la variable de
 * entorno, en vez de devolver un cliente medio configurado que reviente más adentro.
 *
 * ⚠️ Mandamiento VIII: `OPENAI_API_KEY` NUNCA va hardcodeada ni con prefijo
 * `NEXT_PUBLIC_`. Es una credencial de servidor, se consume solo desde API Routes.
 */

import OpenAI from 'openai'
import { DELIVERY_AI_MAX_RETRIES, DELIVERY_AI_TIMEOUT_MS } from '@/constants/delivery-ai'

/**
 * Falta `OPENAI_API_KEY`. Es un error de CONFIGURACIÓN, no de contenido: el mesero
 * escribió bien y el pedido se pierde igual. Lleva su propia clase para que el llamador
 * pueda decirle al operador *«avisa al administrador»* en vez de *«reenvía el mensaje»*.
 */
export class OpenAIConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenAIConfigError'
  }
}

let client: OpenAI | null = null

/**
 * Cliente compartido del proceso. Perezoso a propósito: instanciarlo en el import haría
 * fallar el build de cualquier ruta que importe este módulo en un entorno sin la key.
 *
 * @throws {OpenAIConfigError} si `OPENAI_API_KEY` no está configurada.
 */
export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new OpenAIConfigError('OPENAI_API_KEY no configurado')
  }
  if (!client) {
    client = new OpenAI({
      apiKey,
      // Ver el porqué de los dos números en src/constants/delivery-ai.ts: el reloj de
      // Twilio (15 s) y el de Zernio (5 s) corren dentro de nuestra función desde que
      // el parseo dejó de estar en n8n.
      timeout: DELIVERY_AI_TIMEOUT_MS,
      maxRetries: DELIVERY_AI_MAX_RETRIES,
    })
  }
  return client
}

/** Solo para pruebas: olvida el cliente memoizado. */
export function resetOpenAIClientForTests(): void {
  client = null
}
