/**
 * TODAS las plantillas de una cuenta Twilio (Content API + estado de aprobación).
 *
 * POR QUÉ EXISTE (N23, 2026-10-11)
 * ────────────────────────────────
 * `ContentAndApprovals?PageSize=100` devuelve UNA página y el código no seguía
 * `meta.next_page_url`: pasadas 100 plantillas, las demás desaparecían en silencio de
 * Campañas → Manuales, de Ajustes › Plantillas y del reporte «Del set estándar te faltan»
 * (que además las daba por faltantes y ofrecía crearlas de nuevo). Una marca Twilio con
 * historia —cada rechazo de Meta obliga a crear otra con nombre nuevo— llega a 100 sola.
 *
 * Todo o nada: si una página falla, se devuelve el fallo y no la mitad leída. Una lista
 * cortada que parece entera es justo el defecto que esto arregla.
 *
 * Solo se sigue un `next_page_url` de `content.twilio.com`: la petición lleva las
 * credenciales de la cuenta en el header y no se le mandan a otro host.
 */

export const TWILIO_CONTENT_AND_APPROVALS_URL = 'https://content.twilio.com/v1/ContentAndApprovals?PageSize=100'

const HOST_PERMITIDO = 'https://content.twilio.com/'

/** Techo de páginas (10.000 plantillas). Pasarlo es un bucle, no una cuenta real. */
export const MAX_PAGINAS_TWILIO = 100

export type ListadoTwilio<T> =
  | { ok: true; contents: T[] }
  | { ok: false; status: number; detalle: string }

export async function listarContenidoTwilio<T>(basicAuth: string): Promise<ListadoTwilio<T>> {
  const contents: T[] = []
  let url: string | null = TWILIO_CONTENT_AND_APPROVALS_URL

  for (let pagina = 0; url; pagina++) {
    if (pagina >= MAX_PAGINAS_TWILIO) {
      return { ok: false, status: 508, detalle: `más de ${MAX_PAGINAS_TWILIO} páginas de plantillas` }
    }
    const res = await fetch(url, {
      headers: { Authorization: basicAuth, 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) {
      return { ok: false, status: res.status, detalle: await res.text().catch(() => '') }
    }
    const data = (await res.json()) as { contents?: T[]; meta?: { next_page_url?: string | null } }
    contents.push(...(data.contents ?? []))

    const siguiente = data.meta?.next_page_url
    url = typeof siguiente === 'string' && siguiente.startsWith(HOST_PERMITIDO) ? siguiente : null
  }

  return { ok: true, contents }
}
