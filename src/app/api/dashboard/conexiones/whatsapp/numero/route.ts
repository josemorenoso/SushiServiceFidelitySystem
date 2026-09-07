import { NextRequest, NextResponse } from 'next/server'
import { requireConnectionActor } from '@/lib/tenant-owner'
import { setConnectionPhone, isValidE164 } from '@/services/connection.service'

/**
 * POST /api/dashboard/conexiones/whatsapp/numero — el cliente declara SU número
 * (caminos A y B).
 *
 * Este número no es cosmético: es lo que después viaja como `expectedPhoneNumber` al
 * cerrar el Embedded Signup, y **es la única verificación real de que se conectó esa línea
 * y no otra**. Por eso se valida en E.164 con el mismo patrón que el CHECK de la 00054 y
 * el de `aios_activate_whatsapp()` — tres sitios, un solo formato.
 */

export const dynamic = 'force-dynamic'

/**
 * Acepta lo que la gente escribe y lo lleva a E.164. Nada más: si después de esto no es
 * E.164 válido, se rechaza con el formato a la vista en vez de guardar algo a medias.
 */
function toE164(raw: string): string {
  const trimmed = raw.trim().replace(/[\s()-]/g, '')
  if (trimmed.startsWith('+')) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  // Un celular colombiano tecleado sin indicativo: 3001234567 → +573001234567. Es el
  // caso normal en las 25 marcas, y pedirle el '+57' a alguien que nunca lo escribe es
  // regalar un error de validación por cada alta.
  if (/^3\d{9}$/.test(digits)) return `+57${digits}`
  return `+${digits}`
}

export async function POST(req: NextRequest) {
  const actor = await requireConnectionActor()
  if (!actor.ok) {
    return NextResponse.json({ error: actor.denial!.error }, { status: actor.denial!.status })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const raw = (body as { phone?: unknown } | null)?.phone
  if (typeof raw !== 'string' || !raw.trim()) {
    return NextResponse.json({ error: 'Escribe el número de WhatsApp del negocio.' }, { status: 400 })
  }

  const phone = toE164(raw)
  if (!isValidE164(phone)) {
    return NextResponse.json(
      { error: 'Ese número no tiene un formato válido. Ejemplo: +57 300 123 4567.' },
      { status: 400 }
    )
  }

  try {
    const connection = await setConnectionPhone(actor.tenantId, phone)
    return NextResponse.json({ ok: true, connection })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // `uq_tenant_connections_phone`: el mismo número, dos veces en la misma marca.
    if (message.includes('uq_tenant_connections_phone') || message.includes('23505')) {
      return NextResponse.json(
        { error: 'Ese número ya está declarado en otra de tus líneas.' },
        { status: 409 }
      )
    }
    if (message.includes('conexion_de_otra_marca')) {
      return NextResponse.json({ error: 'Esa conexión no es de tu negocio.' }, { status: 403 })
    }

    console.error('[Conexiones] numero falló:', message)
    return NextResponse.json({ error: 'No se pudo guardar el número' }, { status: 500 })
  }
}
