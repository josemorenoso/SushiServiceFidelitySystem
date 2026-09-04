import { NextRequest, NextResponse } from 'next/server'
import { getPendingGrantsForPresentCustomers } from '@/services/reward-grant.service'
import { resolveHostContext } from '@/lib/tenant'
import { resolveStaffAuth } from '@/lib/staff-auth'

/**
 * GET /api/staff/pending-rewards
 *
 * Premios pendientes de entrega, acotados a clientes PRESENTES (check-in en las últimas
 * 6 horas). Alimenta la pantalla /mesero/rewards.
 *
 * Esta pantalla es el arreglo de la condición de carrera: hasta ahora el mesero solo podía
 * registrar la entrega durante los 3 segundos posteriores al escaneo, cuando el cliente
 * todavía no había elegido su Mystery Box. Ahora el premio espera aquí hasta que alguien
 * lo entregue.
 *
 * Ref: docs/features/reward-grants.md
 */

/** Ventana de "presente en el local". No es configurable a propósito: un turno cabe de sobra. */
const HOURS_PRESENT = 6

export async function GET(request: NextRequest) {
  try {
    const host = request.headers.get('host')
    // Multi-sede F4 (D11): `resolveHostContext` resuelve la marca TAMBIEN por
    // `restaurant_locations.domain`. Sin eso, el mesero de la sede 2 abre
    // `laureles.marca.com/mesero` y toda esta superficie responde 404. `getTenantByDomain`
    // solo mira `tenants.domain` y CONSERVA su firma: la sede viaja por aqui.
    const tenant = (await resolveHostContext(host)).tenant
    if (!tenant) {
      return NextResponse.json(
        { error: 'Restaurante no reconocido', message: 'No se pudo identificar el restaurante para este dominio' },
        { status: 404 }
      )
    }

    const auth = await resolveStaffAuth(request, tenant)
    // El fallo de base NO es un 401: decirle "no válido" al mesero cuando la base está
    // caída le hace reintentar con la misma credencial buena y deja el incidente invisible.
    if (auth.dbFailure) {
      return NextResponse.json(
        {
          error: 'Problema técnico',
          message: 'No pudimos verificar tu sesión ahora mismo. Intenta de nuevo en un momento.',
        },
        { status: 503 }
      )
    }
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Mesero o dispositivo no válido.' },
        { status: 401 }
      )
    }

    const grants = await getPendingGrantsForPresentCustomers(tenant.id, HOURS_PRESENT)

    return NextResponse.json({ ok: true, grants, count: grants.length })
  } catch (error) {
    console.error('[PendingRewards] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error consultando los premios pendientes' },
      { status: 500 }
    )
  }
}
