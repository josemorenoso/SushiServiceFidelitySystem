/**
 * Guardar ajustes de Configuración sin que un fallo se vea como «guardado» (OPER-4-mudo,
 * 2026-10-15).
 *
 * «Beneficios Black», «Sistema de puntos» y «Check-in» guardaban con un `catch` vacío
 * («silent»): un administrador de sede recibía el 403 de OPER-4 («Los ajustes son de la marca…») y la
 * pantalla no decía nada, así que creía que había guardado. Ahora cada sección guarda por acá
 * y muestra el motivo.
 *
 * Se usa desde el navegador (`dashboard/settings/page.tsx`); `fetch` entra por parámetro para
 * que se pruebe sin red.
 */

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** El texto que se muestra cuando el servidor no dice nada legible (un 500 con HTML, la red). */
export const NO_SE_PUDO_GUARDAR = 'No pudimos guardar. Revisa tu conexión e intenta de nuevo.'

/** Guarda UN ajuste. Lanza un `Error` con el motivo del servidor (en español) si no se guardó. */
export async function guardarAjuste(key: string, value: string, fetchImpl: Fetch = fetch): Promise<void> {
  let res: Response
  try {
    res = await fetchImpl('/api/dashboard/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
  } catch {
    throw new Error(NO_SE_PUDO_GUARDAR)
  }
  if (res.ok) return
  // Un 500 de la plataforma puede venir en HTML: `res.json()` lanzaría y el mensaje sería
  // «Unexpected token <», que no le dice nada a nadie.
  const data = (await res.json().catch(() => ({}))) as { error?: unknown; message?: unknown }
  const motivo =
    typeof data.message === 'string' && data.message
      ? data.message
      : typeof data.error === 'string' && data.error
        ? data.error
        : NO_SE_PUDO_GUARDAR
  throw new Error(motivo)
}

/**
 * Guarda VARIOS ajustes de una sección. Devuelve `null` si se guardaron TODOS, o el motivo
 * del primero que falló. Espera a todos (`allSettled`): con `Promise.all` el error salía
 * antes de que terminaran los demás y no se sabía qué había quedado escrito.
 */
export async function guardarAjustes(
  pares: ReadonlyArray<readonly [string, string]>,
  fetchImpl: Fetch = fetch
): Promise<string | null> {
  const resultados = await Promise.allSettled(pares.map(([k, v]) => guardarAjuste(k, v, fetchImpl)))
  const fallos = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (fallos.length === 0) return null
  const motivo = fallos[0].reason instanceof Error ? fallos[0].reason.message : NO_SE_PUDO_GUARDAR
  // Si una parte sí se guardó, se dice: lo que se ve en pantalla ya no es lo de la base.
  return fallos.length < pares.length
    ? `${motivo} (no se guardaron ${fallos.length} de ${pares.length} valores; recarga la página para ver lo que quedó).`
    : motivo
}
