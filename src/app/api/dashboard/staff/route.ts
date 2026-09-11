import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import bcrypt from 'bcryptjs'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/**
 * Valida que `location_id` sea una sede ACTIVA DE ESTA MARCA. Multi-sede F4 (D11).
 *
 * La FK compuesta de la 00044 ya impide grabar la sede de otra marca (23503), pero un 23503
 * crudo sale por el `catch` como un 500 sin explicación. Esto lo convierte en un 400 que
 * dice qué pasó, y de paso rechaza las sedes DESACTIVADAS —que la FK sí aceptaría— porque
 * asignar un mesero a una sede cerrada es un error de dedo, no una intención.
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

/**
 * Desde la 00062 hay TRES llaves de nombre que pueden dar 23505, y las tres se traducen
 * distinto: dentro de una sede (00046), entre rotativos (00062) y el cruce sede↔rotativo
 * (trigger de la 00062). Devuelve `undefined` si el 23505 no es de nombre (es de celular).
 */
function mensajeDeNombreDuplicado(message: string | undefined): string | undefined {
  const m = message || ''
  if (m.includes('staff_users_nombre_rotativo_cruce')) {
    return 'Ya hay un mesero con ese nombre en la marca: uno fijo en una sede y otro rotativo saldrían juntos en la misma lista del escáner. Diferéncialos (por ejemplo "Ana L." y "Ana P.").'
  }
  if (m.includes('staff_users_nombre_rotativo_key')) {
    return 'Ya hay un mesero rotativo con ese nombre. Los rotativos salen en todos los escáneres, así que tienen que distinguirse entre sí.'
  }
  if (m.includes('staff_users_nombre_sede_key')) {
    return 'Ya hay un mesero con ese nombre en esa sede. Diferéncialos (por ejemplo "Ana L." y "Ana P."): en el escáner se eligen por el nombre.'
  }
  return undefined
}

// ─── GET: listar meseros + dispositivos ───
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const tenantId = await requireTenantId()
    const db = getServiceClient()
    // `location_id` desde F4 (00044). NULL = mesero sin sede asignada, y SE MUESTRA: no se
    // adivina ni se reparte. La pantalla lo pinta como «Sin sede». `works_any_location`
    // (00062) es el otro NULL: el rotativo, que sale en todos los escáneres.
    const { data: staffList, error } = await db
      .from('staff_users')
      .select('id, name, phone, role, is_active, last_login_at, created_at, location_id, works_any_location')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    const { data: devices, error: devicesError } = await db
      .from('staff_devices')
      .select('id, staff_user_id, device_name, is_trusted, trusted_at, expires_at, last_used_at, location_id')
      .eq('tenant_id', tenantId)
      .order('trusted_at', { ascending: false })

    if (isDbFailure(devicesError)) {
      logDbFailure({
        scope: 'DashboardStaff',
        reason: 'devices_lookup_error',
        error: devicesError,
        context: { tenant_id: tenantId },
      })
      return NextResponse.json({ error: 'Error del servidor' }, { status: 503 })
    }

    return NextResponse.json({ staff: staffList ?? [], devices: devices ?? [] })
  } catch (error) {
    console.error('[DashboardStaff GET] Error:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// ─── POST: crear mesero ───
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    // `location_id` (D11): opcional. Omitirlo deja al mesero SIN sede, que es exactamente el
    // estado de todo el parque actual y sigue funcionando igual que siempre.
    // `works_any_location` (00062): «rota entre sedes». Excluyente con la sede.
    const {
      name,
      phone,
      pin,
      role = 'waiter',
      location_id = null,
      works_any_location = false,
    } = body as {
      name?: string
      phone?: string
      pin?: string
      role?: string
      location_id?: string | null
      works_any_location?: boolean
    }

    // §19.2 (00046): un mesero se da de alta con NOMBRE y nada más. El teléfono y el PIN
    // pasan a ser cosa de los SUPERVISORES —los únicos que todavía se autentican, para
    // activar un aparato— y por eso siguen aceptándose.
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere el nombre' },
        { status: 400 }
      )
    }

    // 00062: un rotativo NO tiene sede (CHECK `staff_users_rotativo_sin_sede`). Con una, la
    // vía 1 de la precedencia le atribuiría a esa sede las visitas que registre en otra.
    if (works_any_location && location_id) {
      return NextResponse.json(
        {
          error: 'Datos inválidos',
          message: 'Un mesero que rota entre sedes no lleva sede fija: la sede de cada visita la pone el aparato donde escanea.',
        },
        { status: 400 }
      )
    }

    // 19.f — el CHECK `staff_users_identidad_minima` de la 00046 (+00062) dice exactamente
    // esto. Se comprueba también aquí para dar una frase que se entienda en vez de un 23514,
    // pero la garantía la sostiene el motor: sin teléfono, sin sede y sin ser rotativo, un
    // mesero no tiene ninguna llave de identidad (los NULL no colisionan entre sí) y encima
    // no aparecería en ninguna lista.
    if (!phone && !location_id && !works_any_location) {
      return NextResponse.json(
        {
          error: 'Falta la sede',
          message: 'Un mesero sin celular tiene que tener sede o rotar entre sedes: es lo que lo hace aparecer en la lista del escáner.',
        },
        { status: 400 }
      )
    }

    if (pin !== undefined && pin !== null && pin !== '' && (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin))) {
      return NextResponse.json(
        { error: 'PIN inválido', message: 'El PIN debe ser numérico de 4 a 6 dígitos' },
        { status: 400 }
      )
    }

    const hashedPin = pin ? await bcrypt.hash(pin, 10) : null
    const tenantId = await requireTenantId()
    const db = getServiceClient()

    if (location_id) {
      const problema = await sedeInvalida(db, tenantId, location_id)
      if (problema) {
        return NextResponse.json({ error: 'Sede inválida', message: problema }, { status: 400 })
      }
    }

    const { data, error } = await db
      .from('staff_users')
      .insert({
        name: name.trim(),
        // `null`, no cadena vacía: '' colisionaría consigo misma en
        // `staff_users_phone_tenant_key` y el segundo mesero sin teléfono daría un 23505
        // incomprensible. Los NULL no colisionan, que aquí es justo lo que queremos.
        phone: phone?.trim() || null,
        pin: hashedPin,
        role,
        // `tenant_id` EXPLÍCITO siempre: la 00030 nunca se aplicó en producción y la columna
        // arrastra un DEFAULT puente que manda a Sushi Service todo INSERT que lo omita.
        tenant_id: tenantId,
        location_id: location_id ?? null,
        works_any_location: works_any_location === true,
      })
      .select('id, name, phone, role, is_active, created_at, location_id, works_any_location')
      .single()

    if (error) {
      // Desde la 00046 hay varias llaves que pueden dar 23505, y decir siempre "ese celular
      // ya existe" mandaría al dueño a buscar un teléfono que a lo mejor ni escribió.
      if (error.code === '23505') {
        return NextResponse.json(
          {
            error: 'Duplicado',
            message: mensajeDeNombreDuplicado(error.message) ?? 'Ya existe un mesero con ese número de celular',
          },
          { status: 409 }
        )
      }
      // 23514 = `staff_users_identidad_minima` o `staff_users_rotativo_sin_sede`. Las
      // validaciones de arriba los cubren, pero el motor es el que manda y su mensaje crudo
      // no le sirve a nadie.
      if (error.code === '23514') {
        const porRotativo = (error.message || '').includes('staff_users_rotativo_sin_sede')
        return NextResponse.json(
          {
            error: 'Datos inválidos',
            message: porRotativo
              ? 'Un mesero que rota entre sedes no lleva sede fija.'
              : 'Un mesero sin celular tiene que tener sede o rotar entre sedes.',
          },
          { status: 400 }
        )
      }
      throw error
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('[DashboardStaff POST] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error creando el mesero' },
      { status: 500 }
    )
  }
}

// ─── PATCH: actualizar mesero (toggle activo, resetear PIN) ───
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { id, is_active, pin, name, role, location_id, works_any_location } = body as {
      id?: string
      is_active?: boolean
      pin?: string
      name?: string
      role?: string
      /** D11. `null` explícito = quitarle la sede al mesero; ausente = no se toca. */
      location_id?: string | null
      /** 00062. `true` exige `location_id` NULL (se manda `null` en la misma llamada). */
      works_any_location?: boolean
    }

    if (!id) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere id' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (is_active !== undefined) updateData.is_active = is_active
    if (name !== undefined) updateData.name = name.trim()
    if (role !== undefined) updateData.role = role
    if (pin) {
      if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
        return NextResponse.json(
          { error: 'PIN inválido', message: 'El PIN debe ser numérico de 4 a 6 dígitos' },
          { status: 400 }
        )
      }
      updateData.pin = await bcrypt.hash(pin, 10)
    }

    const tenantId = await requireTenantId()
    const db = getServiceClient()

    // D11: mover de sede a un mesero. `null` explícito lo deja sin sede.
    if (location_id !== undefined) {
      if (location_id !== null) {
        const problema = await sedeInvalida(db, tenantId, location_id)
        if (problema) {
          return NextResponse.json({ error: 'Sede inválida', message: problema }, { status: 400 })
        }
      }
      updateData.location_id = location_id
    }

    // 00062: marcar o desmarcar «rota entre sedes». Marcarlo y mandar sede a la vez es la
    // combinación que el CHECK rechaza; se dice acá con palabras. Marcarlo SIN mandar
    // `location_id` deja que el motor decida sobre la sede que la fila ya tenga (23514 si
    // la tenía): el panel manda `location_id: null` en la misma llamada a propósito.
    if (works_any_location !== undefined) {
      if (works_any_location && location_id) {
        return NextResponse.json(
          {
            error: 'Datos inválidos',
            message: 'Un mesero que rota entre sedes no lleva sede fija: la sede de cada visita la pone el aparato donde escanea.',
          },
          { status: 400 }
        )
      }
      updateData.works_any_location = works_any_location === true
    }

    const { data, error } = await db
      .from('staff_users')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('id, name, phone, role, is_active, updated_at, location_id, works_any_location')
      .single()

    if (error) {
      // El trigger `trg_staff_users_sede_coherente` (00044) rechaza con 23514 mover de sede a
      // un mesero que tiene dispositivos en la sede vieja. Un aparato físico está donde está:
      // arrastrarlo reasignaría en silencio las visitas de una tablet que nadie movió del
      // mostrador. Se traduce a un 409 con el mensaje del motor, que ya dice qué hacer.
      if (error.code === '23514') {
        // Puede ser el trigger de sede, `staff_users_identidad_minima` (00046: quitarle la
        // sede a un mesero sin teléfono lo dejaría sin ninguna llave de identidad) o
        // `staff_users_rotativo_sin_sede` (00062: rotativo con sede).
        const msg = error.message || ''
        const porIdentidad = msg.includes('staff_users_identidad_minima')
        const porRotativo = msg.includes('staff_users_rotativo_sin_sede')
        return NextResponse.json(
          {
            error: porIdentidad || porRotativo ? 'Datos inválidos' : 'Conflicto de sede',
            message: porIdentidad
              ? 'Este mesero no tiene celular, así que no puede quedarse sin sede ni sin rotar: es lo único que lo identifica y lo que lo hace aparecer en el escáner.'
              : porRotativo
                ? 'Un mesero que rota entre sedes no lleva sede fija. Quítale la sede en la misma edición.'
                : error.message,
          },
          { status: porIdentidad || porRotativo ? 400 : 409 }
        )
      }
      // Las llaves de nombre (00046 y 00062) al renombrar, mover de sede o marcar rotativo.
      if (error.code === '23505') {
        return NextResponse.json(
          {
            error: 'Duplicado',
            message: mensajeDeNombreDuplicado(error.message) ?? 'Ya existe un mesero con ese número de celular',
          },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[DashboardStaff PATCH] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error actualizando el mesero' },
      { status: 500 }
    )
  }
}

// ─── DELETE: eliminar mesero ───
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere id' },
        { status: 400 }
      )
    }

    const tenantId = await requireTenantId()
    const db = getServiceClient()
    await db.from('staff_users').delete().eq('id', id).eq('tenant_id', tenantId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DashboardStaff DELETE] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error eliminando el mesero' },
      { status: 500 }
    )
  }
}
