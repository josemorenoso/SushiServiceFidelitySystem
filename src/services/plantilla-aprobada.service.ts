import type { Tenant } from '@/types/tenant.types'
import { isTwilioTemplateApproved } from '@/services/twilio-catalog.service'

/**
 * ¿Se puede usar YA este puntero de plantilla? (PL-2, 2026-10-15)
 *
 * En **Twilio** el puntero (`admin_settings.*_template_sid`) se escribe al CREAR la plantilla
 * (`fillEmptyPointer()`), con Meta todavía revisándola: mandarla falla en Meta y el cliente se
 * queda sin el mensaje. Por eso hay que preguntar. En **Zernio** el puntero solo existe ya
 * aprobado (`promoteVersion()`), y en la marca **demo** el envío es simulado: no se pregunta.
 * Ante la duda (sin cuenta, error de red o de Twilio) cuenta como NO aprobada, igual que los
 * crons de cumpleaños y recordatorio y el check-in (PL-2-a).
 *
 * Es la MISMA pregunta que `punteroAprobado()` de `cron/reward-reminder` y
 * `nivelDesbloqueadoAprobado()` del check-in, que se quedan como estaban (otros territorios);
 * los emisores nuevos preguntan por aquí.
 */
export async function punteroAprobado(tenant: Tenant, sid: string | null | undefined): Promise<boolean> {
  const s = sid?.trim()
  if (!s) return false
  if (tenant.is_demo || tenant.messaging_provider === 'zernio') return true
  return isTwilioTemplateApproved(tenant, s)
}

/**
 * Cuánto se recuerda la respuesta para una PANTALLA (N-PORTADA-TWILIO, 2026-10-15). La portada
 * del ciclo le preguntaba a Twilio en cada carga; 60 s por marca y plantilla, como la WABA de
 * P1-a. Los crons y los envíos NO usan el caché: preguntan una vez por corrida o por envío.
 */
export const APROBACION_EN_PANTALLA_MS = 60_000

const cacheDePantalla = new Map<string, { aprobada: boolean; leidaEn: number }>()

/** `punteroAprobado()` con el caché de 60 s por marca y plantilla. Solo para pantallas. */
export async function punteroAprobadoEnPantalla(
  tenant: Tenant,
  sid: string | null | undefined,
  ahora: number = Date.now()
): Promise<boolean> {
  const s = sid?.trim()
  if (!s) return false
  // Zernio y demo no le preguntan a nadie: no hay nada que guardar.
  if (tenant.is_demo || tenant.messaging_provider === 'zernio') return true
  const clave = `${tenant.id}:${s}`
  const guardada = cacheDePantalla.get(clave)
  if (guardada && ahora - guardada.leidaEn < APROBACION_EN_PANTALLA_MS) return guardada.aprobada
  const aprobada = await punteroAprobado(tenant, s)
  cacheDePantalla.set(clave, { aprobada, leidaEn: ahora })
  return aprobada
}

/** Olvida lo guardado (las pruebas, o cuando la marca cambia una plantilla por nuestra mano). */
export function olvidarAprobacionesEnPantalla(): void {
  cacheDePantalla.clear()
}
