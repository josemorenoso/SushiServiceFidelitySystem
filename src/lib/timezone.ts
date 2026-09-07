/**
 * Zona horaria de operación del negocio.
 *
 * Los crons corren en UTC en el servidor (Vercel). Cualquier FECHA que se le muestre al
 * cliente —una fecha límite en un WhatsApp, un día en el dashboard— debe formatearse
 * explícitamente en esta zona: sin `timeZone`, `toLocaleDateString` usa la del servidor
 * (UTC) y de noche en Colombia el resultado se adelanta un día calendario.
 */
export const APP_TIMEZONE = 'America/Bogota'

/**
 * Offset fijo de la zona del negocio, en el formato que entiende `new Date()`.
 *
 * **Colombia no tiene horario de verano** (no lo usa desde 1993), así que este offset es
 * constante y se puede pegar a un literal de fecha sin consultar la base de husos. Si
 * alguna vez el producto operara en un país con DST, esto deja de servir y hay que pasar
 * a `Intl.DateTimeFormat` con `timeZone`.
 */
export const APP_UTC_OFFSET = '-05:00'

/** `YYYY-MM-DDTHH:mm` o `YYYY-MM-DDTHH:mm:ss` — lo que produce `<input type="datetime-local">`. */
const LOCAL_INPUT_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/

/**
 * Convierte lo que escribe un admin en un `<input type="datetime-local">` al INSTANTE
 * absoluto que corresponde en hora de Bogotá.
 *
 * ES EL ÚNICO SITIO DONDE ESA CONVERSIÓN PUEDE VIVIR. Un `datetime-local` no tiene huso:
 * `new Date('2026-09-10T14:30')` lo interpreta en la zona del NAVEGADOR. Mientras el admin
 * abra el dashboard desde Bogotá coincide por casualidad; desde Madrid, ese mismo "2:30 pm"
 * se guarda como `12:30Z` en vez de `19:30Z` y el cron dispara **siete horas antes** de lo
 * que el restaurante entendió. El servidor no puede reparar el error después: para cuando
 * recibe el ISO, la hora local ya se perdió.
 *
 * Devuelve `null` si el valor no tiene la forma de un `datetime-local` — quien llama decide
 * si eso es un error de validación o simplemente "no hay fecha".
 */
export function appLocalInputToISO(value: string): string | null {
  const match = LOCAL_INPUT_RE.exec(value.trim())
  if (!match) return null

  const [fecha, hora] = [match[1], match[2]]
  const instant = new Date(`${fecha}T${hora}${match[3] ?? ':00'}${APP_UTC_OFFSET}`)
  if (Number.isNaN(instant.getTime())) return null

  // Una fecha que no existe NO puede colarse rodando al mes siguiente. `new Date()` acepta
  // `2026-02-31` y devuelve el 3 de marzo sin quejarse — programar un envío en un día que el
  // admin no eligió es exactamente el bug que este módulo existe para cerrar, así que se
  // verifica que el instante resultante siga siendo el mismo día en hora de Bogotá.
  if (instant.toLocaleString('sv-SE', { timeZone: APP_TIMEZONE }).slice(0, 10) !== fecha) {
    return null
  }

  return instant.toISOString()
}

/**
 * Fin del día calendario en hora del negocio (23:59:59 en Bogotá).
 *
 * Con `T23:59:59Z` —el error que esto reemplaza— el día se cerraba a las 6:59 pm locales.
 */
export function appEndOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59${APP_UTC_OFFSET}`)
}

/**
 * Formatea un instante para un humano en Colombia. Es `toLocaleString('es-CO', …)` con el
 * `timeZone` ya puesto: sin él, el navegador de un admin fuera del país —o el servidor, que
 * corre en UTC— muestra una hora que no es la que el restaurante programó.
 */
export function formatInAppTz(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions
): string {
  const instant = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(instant.getTime())) return '—'
  return instant.toLocaleString('es-CO', { ...options, timeZone: APP_TIMEZONE })
}
