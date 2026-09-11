import { redirect } from 'next/navigation'

/**
 * Redenciones vive dentro de Recompensas desde el 2026-09-11 (pestaña
 * «Redenciones»). Esta ruta se conserva para que no se rompa ningún enlace
 * guardado ni ningún hábito: redirige.
 */
export default function RedemptionsRedirect() {
  redirect('/dashboard/rewards?tab=redenciones')
}
