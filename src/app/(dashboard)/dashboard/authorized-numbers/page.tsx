import { redirect } from 'next/navigation'

/**
 * Autorizados Domicilio vive dentro de Domicilios desde el 2026-09-12 (pestaña
 * «Autorizados»). Esta ruta se conserva para que no se rompa ningún enlace guardado
 * ni ningún hábito: redirige. Los endpoints `/api/dashboard/authorized-numbers` siguen igual.
 */
export default function AuthorizedNumbersRedirect() {
  redirect('/dashboard/domicilios?tab=autorizados')
}
