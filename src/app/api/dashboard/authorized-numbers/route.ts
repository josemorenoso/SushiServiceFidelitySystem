import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import { requireLocationScope, applyLocationFilter } from '@/lib/location-scope'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/**
 * Valida que `location_id` sea una sede ACTIVA DE ESTA MARCA.
 *
 * Es el mismo control que `/api/dashboard/staff` (00044, D11) y existe por la misma razón:
 * la FK compuesta `(location_id, tenant_id)` de la 00043 ya impide grabar la sede de otra
 * marca, pero su 23503 crudo sale por el `catch` como un 500 sin explicación. Esto lo
 * convierte en un 400 que dice qué pasó, y de paso rechaza las sedes DESACTIVADAS —que la
 * FK sí aceptaría— porque atribuirle domicilios a un local cerrado es un error de dedo.
 *
 * Devuelve `undefined` si es válida, o el mensaje de error si no lo es.
 */
async function sedeInvalida(
  db: ReturnType<typeof getServiceClient>,
  tenantId: string,
  locationId: string
): Promise<string | undefined> {
  const { data, error } = await db
    .from('restaurant_locations')
    .select('id')
    // El `.eq('tenant_id', …)` es el aislamiento real: esta ruta usa `service_role`.
    .eq('tenant_id', tenantId)
    .eq('id', locationId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) return 'No se pudo verificar la sede'
  if (!data) return 'La sede no existe, no está activa o no pertenece a este restaurante'
  return undefined
}

export async function GET(request: NextRequest) {
  const scopeResult = await requireLocationScope(request)
  if (!scopeResult.ok) {
    return NextResponse.json({ error: scopeResult.error }, { status: scopeResult.status })
  }

  try {
    const db = getServiceClient()
    const base = db.from('authorized_numbers').select('*').eq('tenant_id', scopeResult.scope.tenantId)
    const query = applyLocationFilter(base, scopeResult.scope, 'location_id')
    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ numbers: data ?? [] })
  } catch (error) {
    console.error('[AuthorizedNumbers] GET error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    // `location_id` (D9): OPCIONAL y nullable. Omitirlo deja el número en «sede
    // desconocida», que es exactamente el estado de todo el parque actual y sigue
    // funcionando igual que siempre. Lo que cambia es que ahora se PUEDE escribir: hasta
    // hoy la columna existía (00043) y el panel no la escribía nunca, así que con dos o más
    // sedes TODOS los domicilios caían al mismo cubo sin forma de saber a qué local iban.
    const { phone, name, location_id = null } = body as {
      phone?: string
      name?: string
      location_id?: string | null
    }

    if (!phone || !name) {
      return NextResponse.json({ error: 'Teléfono y nombre son requeridos' }, { status: 400 })
    }

    const cleaned = String(phone).replace(/[^0-9]/g, '').replace(/^57/, '').slice(-10)
    if (!/^3\d{9}$/.test(cleaned)) {
      return NextResponse.json({ error: 'Formato inválido. Debe ser celular colombiano (3XXXXXXXXX)' }, { status: 400 })
    }

    const tenantId = await requireTenantId()
    const db = getServiceClient()

    if (location_id) {
      const problema = await sedeInvalida(db, tenantId, location_id)
      if (problema) {
        return NextResponse.json({ error: 'Sede inválida', message: problema }, { status: 400 })
      }
    }

    // Esta lectura ES el dup-check: ante un fallo de base `existing` llegaba `null`, el
    // código concluía "no hay duplicado" y el INSERT seguía adelante. `.maybeSingle()`
    // separa el vacío legítimo (número nuevo) del fallo real.
    //
    // El alcance es la MARCA, no la sede, y así tiene que ser: la llave del motor es
    // `authorized_numbers_phone_tenant_key (phone, tenant_id)` (00028). Un mismo celular NO
    // puede existir dos veces en la misma marca, ni siquiera en sedes distintas — de ahí
    // que un número REALMENTE compartido por varias sedes se quede en «sede desconocida»
    // en vez de mentir diciendo que es de una.
    const { data: existing, error: existingError } = await db
      .from('authorized_numbers')
      .select('id')
      .eq('phone', cleaned)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (isDbFailure(existingError)) {
      logDbFailure({
        scope: 'AuthorizedNumbers',
        reason: 'dup_check_error',
        error: existingError,
        context: { tenant_id: tenantId },
      })
      return NextResponse.json(
        {
          error: 'Problema técnico',
          message: 'No pudimos verificar el número ahora mismo. Intenta de nuevo en un momento.',
        },
        { status: 503 }
      )
    }

    if (existing) {
      return NextResponse.json({ error: 'Este número ya está registrado' }, { status: 409 })
    }

    const { data, error } = await db
      .from('authorized_numbers')
      // `tenant_id` EXPLÍCITO siempre: la 00030 nunca se aplicó en producción y la columna
      // arrastra un DEFAULT puente que manda a Sushi Service todo INSERT que lo omita.
      .insert({
        phone: cleaned,
        name: String(name).trim(),
        is_active: true,
        tenant_id: tenantId,
        location_id: location_id ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, number: data })
  } catch (error) {
    console.error('[AuthorizedNumbers] POST error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
