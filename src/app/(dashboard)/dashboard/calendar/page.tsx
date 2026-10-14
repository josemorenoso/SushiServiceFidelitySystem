import { redirect } from 'next/navigation'
import { destinoDelCalendario } from '@/lib/cycle-screen'

/**
 * El calendario vive en Campañas desde la fase 2 del ciclo, parte C (2026-10-14): es el ciclo
 * «por fecha» (spec §6.4, §6.7), el mismo dato girado, con el creador de eventos. Esta ruta
 * queda como redirección para que no se rompa ningún enlace guardado (el menú, favoritos, los
 * botones viejos de «Para hoy») y pasa lo que pedía la URL: `fecha` y `nombre` abren el creador
 * de eventos con eso puesto; `evento` abre la ficha de ese evento (para subirle la foto).
 *
 * La pantalla de destino lee esos parámetros con `window.location` (`pedidoDeLaUrl()`), nunca
 * con `useSearchParams()` (CSR bailout, ver la trampa en `CLAUDE.md`).
 */
export default async function CalendarRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  redirect(destinoDelCalendario(await searchParams))
}
