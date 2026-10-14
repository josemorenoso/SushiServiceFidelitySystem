/**
 * El aviso amarillo de Plantillas: «WhatsApp está revisando N mensajes…» (2026-10-15).
 *
 * Decía SIEMPRE «Mientras tanto tus clientes siguen recibiendo los mensajes actuales». En una
 * marca que todavía no tenía ninguno aprobado (Tepuy, 14-10) eso es falso: no hay «actuales», y
 * esos mensajes no salen hasta que Meta los apruebe. Ahora el texto depende de cuántos de los que
 * están en revisión tienen ya una versión aprobada que sigue saliendo.
 *
 * Quién la tiene lo decide la pantalla: en Zernio, `entry.current` (la versión vigente; la que
 * está en revisión es `entry.pending`); en Twilio el puntero ES la plantilla en revisión
 * (`fillEmptyPointer()` la escribe al crearla), así que no hay otra saliendo.
 */
export function avisoDeRevision(p: { enRevision: number; conVersionAprobada: number }): {
  resumen: string
  mientrasTanto: string
} | null {
  const n = p.enRevision
  if (n <= 0) return null
  const conVersion = Math.min(Math.max(p.conVersionAprobada, 0), n)
  const sinVersion = n - conVersion
  const resumen = `WhatsApp está revisando ${n === 1 ? 'un mensaje' : `${n} mensajes`}. Suele tardar entre 1 y 3 días.`

  if (sinVersion === 0) {
    return {
      resumen,
      mientrasTanto:
        n === 1
          ? 'Mientras tanto tus clientes siguen recibiendo la versión aprobada de ese mensaje.'
          : 'Mientras tanto tus clientes siguen recibiendo la versión aprobada de esos mensajes.',
    }
  }
  if (conVersion === 0) {
    return {
      resumen,
      mientrasTanto:
        n === 1
          ? 'Mientras tanto ese mensaje no les llega a tus clientes: tu negocio todavía no tiene una versión aprobada.'
          : 'Mientras tanto esos mensajes no les llegan a tus clientes: tu negocio todavía no tiene una versión aprobada de ellos.',
    }
  }
  return {
    resumen,
    mientrasTanto:
      `Mientras tanto, ${conVersion === 1 ? '1 sigue' : `${conVersion} siguen`} saliendo con su versión aprobada; ` +
      `${sinVersion === 1 ? 'el otro no sale hasta que WhatsApp lo apruebe' : `los otros ${sinVersion} no salen hasta que WhatsApp los apruebe`}.`,
  }
}
