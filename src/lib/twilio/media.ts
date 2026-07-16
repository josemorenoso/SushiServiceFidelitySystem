/**
 * Media dinámica para plantillas `twilio/media` (eventos de calendario).
 *
 * Dos restricciones de Twilio gobiernan este archivo:
 *
 * 1. En la URL de media de una plantilla, las variables SOLO se admiten después
 *    del dominio ("Variables are only supported after the domain" —
 *    https://www.twilio.com/docs/content/twilio-media). Por eso la plantilla se
 *    aprueba con el dominio del bucket público como parte FIJA y `{{6}}` como el
 *    path del archivo dentro del bucket:
 *
 *      media: ["https://<proj>.supabase.co/storage/v1/object/public/event-media/{{6}}"]
 *      contentVariables: { "6": "<event_id>/1720000000_flyer.jpg" }
 *
 * 2. `ContentSid` y `MediaUrl` son MUTUAMENTE EXCLUYENTES en la API de Mensajes.
 *    Al enviar una plantilla, la media sale ÚNICAMENTE de la definición de la
 *    plantilla: pasar `mediaUrl` junto a `contentSid` NO sobreescribe nada.
 *    (Esa suposición era el bug: todos los clientes recibían la imagen de muestra.)
 */

export const EVENT_MEDIA_BUCKET = 'event-media'

/** Base pública del bucket, sin barra final. Es la parte FIJA (no variable) de la URL. */
export function getEventMediaBaseUrl(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL no configurada — no se puede construir la URL de media')
  }
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${EVENT_MEDIA_BUCKET}`
}

/**
 * Extrae el path dentro del bucket desde la URL pública guardada en
 * `restaurant_events.media_url`. Es el valor que se manda en `{{6}}`.
 *
 * Devuelve `null` si la URL no pertenece al bucket (p.ej. media externa): en ese
 * caso la plantilla aprobada no puede servirla, porque su dominio es fijo.
 */
export function eventMediaPathFromPublicUrl(publicUrl: string): string | null {
  const base = `${getEventMediaBaseUrl()}/`
  if (!publicUrl.startsWith(base)) return null

  const [path] = publicUrl.slice(base.length).split('?')
  return path && path.length > 0 ? path : null
}
