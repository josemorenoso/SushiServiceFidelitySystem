import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId, getTenantById } from '@/lib/tenant'
import { confirmImport, type ParsedContact } from '@/services/imported-contacts.service'
import { getSettingValue } from '@/services/settings.service'

export const dynamic = 'force-dynamic'
// Ya NO envía dentro del request: inserta los contactos y los encola. Lo que
// tarda es la escritura de N filas en trozos de 500, no N llamadas al
// proveedor. Se conserva el margen porque 25.000 filas siguen siendo 50 viajes
// a la base.
export const maxDuration = 300

/**
 * Tope de contactos por confirmación.
 *
 * NO es una regla de negocio: es el límite de tamaño del cuerpo de la petición.
 * `validate` no persiste nada (por requerimiento), así que los contactos ya
 * validados vuelven a viajar en el cuerpo de este POST. A ~70 bytes por
 * contacto, 30.000 son ~2 MB — todavía debajo del tope de Vercel, pero el
 * margen deja de ser cómodo. Pasado ese número hay que partir el CSV, y es
 * mejor decirlo con un mensaje claro que dejar que la petición muera sola.
 */
const MAX_CONTACTOS_POR_CONFIRMACION = 30_000

interface ConfirmBody {
  batch_id: string
  source_file: string
  template_sid: string
  /** Texto de `{{2}}`. Vacío si la plantilla no la usa. */
  promo_text?: string
  fallback_name?: string
  /** Mensajes por día. Lo elige el operador (D-7); el servicio lo acota al cupo. */
  block_size: number
  /** Texto EXACTO de la advertencia que se aceptó. */
  consent_text?: string
  contacts: ParsedContact[]
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const tenantId = await requireTenantId()
  const enabled = await getSettingValue('golden_bullet_enabled', tenantId)
  if (enabled !== 'true') {
    return NextResponse.json(
      { error: 'Función desactivada', message: 'Golden Bullet está apagado en esta marca. Encendelo con el botón de la pantalla Golden Bullet.' },
      { status: 403 }
    )
  }

  try {
    const tenant = await getTenantById(tenantId)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const body = (await request.json()) as ConfirmBody
    if (!body.batch_id || !body.template_sid || !Array.isArray(body.contacts) || body.contacts.length === 0) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere batch_id, template_sid y contacts' },
        { status: 400 }
      )
    }
    // `promo_text` es OPCIONAL desde el 2026-09-11: solo hace falta si la
    // plantilla usa `{{2}}`, y eso lo sabe el asistente, que la pide solo en
    // ese caso. Acá se acepta vacía.

    if (body.contacts.length > MAX_CONTACTOS_POR_CONFIRMACION) {
      return NextResponse.json(
        {
          error: 'Lote demasiado grande',
          message:
            `Esta importación trae ${body.contacts.length.toLocaleString('es-CO')} contactos y el máximo por ` +
            `confirmación es ${MAX_CONTACTOS_POR_CONFIRMACION.toLocaleString('es-CO')}. ` +
            'Partí el archivo en varios y subilos uno por uno: cada lote conserva su propio plan de bloques ' +
            'y la regla anti-reenvío impide que alguien repetido en dos archivos reciba dos mensajes.',
        },
        { status: 413 }
      )
    }

    const blockSize = Number(body.block_size)
    if (!Number.isFinite(blockSize) || blockSize < 1) {
      return NextResponse.json(
        {
          error: 'Datos inválidos',
          message: 'Se requiere block_size: cuántos mensajes por día. Lo elige el operador, no el sistema.',
        },
        { status: 400 }
      )
    }

    const result = await confirmImport({
      batchId: body.batch_id,
      sourceFile: body.source_file || 'import.csv',
      templateSid: body.template_sid,
      promoText: (body.promo_text ?? '').trim(),
      fallbackName: body.fallback_name,
      blockSize,
      consentText: body.consent_text,
      acceptedByEmail: user.email ?? undefined,
      contacts: body.contacts,
      tenant,
    })

    // Puerta de calidad: la línea está tocada y no se le echa una base fría
    // encima. No se encoló nada (spec §3.4.1, conservada por D-7).
    if (result.blocked_by_quality) {
      return NextResponse.json(
        {
          error: 'La línea no está en condiciones de mandar una base fría',
          reason: 'line_quality',
          ...result.blocked_by_quality,
        },
        { status: 409 }
      )
    }

    // Saldo insuficiente: nada se encoló (spec W-D6).
    if (result.insufficient_balance) {
      return NextResponse.json(
        {
          error: 'Saldo insuficiente para esta importación',
          reason: 'insufficient_balance',
          ...result.insufficient_balance,
        },
        { status: 409 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[GoldenBullet] Error confirmando importación:', error)
    return NextResponse.json({ error: 'Error encolando la campaña' }, { status: 500 })
  }
}
