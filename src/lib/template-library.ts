/**
 * La BIBLIOTECA de plantillas para campañas (decisiones B4 y B5 del dueño, 2026-10-11).
 *
 * «Las plantillas puntuales (las que el dueño crea para una campaña) viven en una biblioteca
 * reutilizable, en una pestaña aparte dentro de Plantillas.» No hay tabla nueva: la cuenta
 * de WhatsApp del negocio YA es el lugar donde viven (la WABA en Zernio, la Content API en
 * Twilio), y las dos se listan por `GET /api/dashboard/templates`. Lo único que faltaba era
 * separar las de campaña de las de los mensajes automáticos, que es lo que hace esto.
 *
 * Una plantilla es de la BIBLIOTECA si ningún mensaje automático la está usando (ningún
 * puntero apunta a ella) y, en Zernio, si su nombre no es el de un mensaje del catálogo
 * (`bienvenida_v2` es una versión de la Bienvenida aunque hoy no esté vigente).
 *
 * PURA. La usan la ruta (`GET /api/dashboard/templates`), la pestaña Biblioteca y
 * Campañas → Mensaje libre.
 */

import { TEMPLATE_CATALOG, esNombreDelCatalogo } from '@/constants/template-catalog'

/** Punteros que no son del catálogo pero sí de un mensaje automático (los retira la fase 1B). */
const PUNTEROS_LEGACY: Record<string, string> = {
  reactivation_with_reward_template_sid: 'Reactivación con premio (sistema anterior)',
  reactivation_template_sid: 'Reactivación (sistema anterior)',
}

/** Plantilla (`sid` en Twilio, nombre en Zernio) → mensaje automático que la usa. */
export function mensajesQueLaUsan(pointers: Record<string, string | null | undefined>): Map<string, string> {
  const uso = new Map<string, string>()
  for (const t of TEMPLATE_CATALOG) {
    const ref = pointers[t.settingsKey]
    if (ref) uso.set(ref, t.label)
  }
  for (const [key, label] of Object.entries(PUNTEROS_LEGACY)) {
    const ref = pointers[key]
    if (ref && !uso.has(ref)) uso.set(ref, label)
  }
  return uso
}

export interface ClasificacionDeBiblioteca {
  /** El mensaje automático que la está usando, o `null`. */
  en_uso_por: string | null
  /** `true` = es de la biblioteca (para campañas). */
  biblioteca: boolean
}

export function clasificarParaLaBiblioteca<T extends { sid: string; name: string }>(
  items: T[],
  pointers: Record<string, string | null | undefined>,
  provider: 'twilio' | 'zernio'
): Array<T & ClasificacionDeBiblioteca> {
  const uso = mensajesQueLaUsan(pointers)
  return items.map((item) => {
    const en_uso_por = uso.get(item.sid) ?? null
    const delCatalogo = provider === 'zernio' && esNombreDelCatalogo(item.name)
    return { ...item, en_uso_por, biblioteca: !en_uso_por && !delCatalogo }
  })
}
