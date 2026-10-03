import { NextResponse } from 'next/server'
import { requireTenantId } from '@/lib/tenant'
import { isSuperAdmin } from '@/lib/admin'
import { requireLocationScope, puedeEscribirEnLaMarca } from '@/lib/location-scope'

/**
 * EL GUARDIÁN DE LAS ESCRITURAS DE LA MARCA. Lo que es de la MARCA (premios,
 * ajustes) solo lo cambia un super usuario (`role='brand'`) —o el operador de
 * Cada1—, nunca un administrador de UNA sede.
 *
 * QUÉ SE ARREGLÓ, Y POR QUÉ ERA CARO
 * ─────────────────────────────────
 * Las rutas autenticaban con `requireTenantId()`, que solo comprueba que el JWT
 * traiga una marca. Un **administrador de UNA sede** (`role='location'`) pasaba
 * esa puerta igual que el dueño:
 *   · `/api/dashboard/reward-tiers` (2026-09-09): editaba y borraba los premios
 *     de la marca **y los de sus sedes hermanas**.
 *   · `PUT /api/dashboard/settings` (ola 0, 2026-10-03, OPER-4): pisaba cualquier
 *     `admin_settings` de la marca, `*_template_sid` vigentes incluidos.
 * Con una sola sede daba lo mismo; con doce, el encargado de Laureles le cambiaba
 * la marca a Envigado sin salir de su pantalla.
 *
 * La decisión vive en `puedeEscribirEnLaMarca()`, que es PURA y lleva el `OR` del
 * operador de Cada1 que el RLS ya tenía (`is_super_admin()`, 00045). Con 0 o 1
 * sede activa nada cambia.
 *
 * Ref: docs/features/multi-sede.md §3.septies · migraciones 00045 y 00058
 *
 * @param mensaje403 Lo que lee quien no puede, en su pantalla.
 */
export async function exigirAlcanceDeMarca(
  request: Request,
  mensaje403: string
): Promise<{ ok: true; tenantId: string } | { ok: false; res: NextResponse }> {
  // El alcance de ESCRITURA depende del ROL, nunca de la sede que la petición
  // esté mirando — así que se resuelve sobre una URL SIN `?location_id=`. No es
  // decorativo: hoy ninguna escritura manda ese parámetro, pero el día que
  // alguien copie el `?location_id=brand` de un GET, `decideLocationScope()`
  // contestaría 403 «Sede no válida» y el error diría "permisos" cuando el
  // problema sería el formato.
  const url = new URL(request.url)
  url.searchParams.delete('location_id')

  const scopeResult = await requireLocationScope(new Request(url.toString()))
  const scope = scopeResult.ok ? scopeResult.scope : null
  const esSuperAdmin = await isSuperAdmin()

  if (puedeEscribirEnLaMarca({ scope, esSuperAdmin })) {
    // `scope.tenantId` y `requireTenantId()` leen el MISMO `app_metadata.tenant_id`.
    // La segunda solo hace falta para el operador de Cada1 cuando el alcance no
    // se pudo resolver: sin marca en el JWT lanza, y el `catch` del verbo lo
    // convierte en el 500 de siempre.
    return { ok: true, tenantId: scope ? scope.tenantId : await requireTenantId() }
  }

  // Sin alcance y sin super-admin se contesta lo que dijo la fábrica —401 sin
  // sesión, 403 sin permiso, **500 si la base falló**—, nunca un 403 genérico:
  // confundir un fallo de base con "no tenés permiso" es lo que manda a alguien
  // a revisar los accesos durante media hora.
  if (!scopeResult.ok) {
    return {
      ok: false,
      res: NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status }),
    }
  }

  return { ok: false, res: NextResponse.json({ error: mensaje403 }, { status: 403 }) }
}
