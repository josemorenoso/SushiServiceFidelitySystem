import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { isTenantOwner, ownerDenialMessage } from '@/lib/tenant-owner'
import { setAutoReplyEnabled } from '@/services/connection.service'

/**
 * POST /api/dashboard/conexiones/whatsapp/auto-respuesta — el interruptor de §18.e.
 *
 * QUÉ APAGA
 * ─────────
 * Cuando le escribe alguien que no es operador autorizado, el webhook de Twilio le
 * contesta *«este número de MARCA es exclusivo para mensajes automáticos — para hablar
 * con nosotros: [link]»*. Eso era cierto cuando el número era una línea de sistema. Bajo
 * coexistencia **es la línea por la que el restaurante atiende**, y el sistema le está
 * diciendo a un cliente real que ahí no lo atienden. Sale una vez cada 4 horas por
 * número, o sea que le pega justo al PRIMER contacto.
 *
 * Solo el camino Twilio contesta; el webhook de Zernio nunca mandó una auto-respuesta.
 * El interruptor se guarda igual para los dos, para que no cambie de sitio el día que un
 * tenant migre de proveedor.
 *
 * Cambia estado ⇒ **exige ser el dueño** (§5). Y sí, se vuelve a comprobar acá aunque el
 * GET ya haya dicho `canAct: false`: la pantalla es una sugerencia, esto es la puerta.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const enabled = (body as { enabled?: unknown } | null)?.enabled
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: '`enabled` debe ser true o false' }, { status: 400 })
  }

  const tenantId = await requireTenantId()

  const owner = await isTenantOwner(tenantId)
  if (!owner.canAct) {
    return NextResponse.json({ error: ownerDenialMessage(owner.reason) }, { status: 403 })
  }

  try {
    await setAutoReplyEnabled(tenantId, enabled)
    return NextResponse.json({ ok: true, autoReplyEnabled: enabled })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Conexiones] auto-respuesta falló:', message)
    return NextResponse.json({ error: 'No se pudo guardar el interruptor' }, { status: 500 })
  }
}
