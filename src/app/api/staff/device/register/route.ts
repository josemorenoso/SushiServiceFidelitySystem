import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'
import { resolveHostContext } from '@/lib/tenant'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'

/**
 * POST /api/staff/device/register — activar el celular DEL LOCAL.
 *
 * §19 invirtió el modelo (dueño, 2026-09-05): el aparato deja de ser de un mesero y pasa a
 * ser del restaurante. Textual: *"si lo hacemos por mesero hay que estar pendiente de que
 * cierren y abran sesión no tiene sentido alguno"*. Esta ruta es el ÚNICO login que queda
 * en todo el sistema, y se usa una vez en la vida de cada aparato.
 *
 * DOS CAMBIOS RESPECTO DE v2.8.1
 * ──────────────────────────────
 * 1. `staff_user_id` se escribe NULL. El aparato no tiene dueño, y por eso nada de lo que
 *    se haga desde él se atribuye solo: el mesero se elige en cada operación. Se retiró
 *    `assign_staff_phone`, que era justo la feature contraria.
 *
 * 2. `location_id` deja de heredarse del dueño (que ya no existe) y SE ELIGE. Es lo único
 *    que hace posible la lista de meseros filtrada por sede, o sea la razón de ser de §19.
 *    Precedencia: lo que eligió el supervisor → la sede del propio supervisor → la del host.
 *
 * 19.a la resolvió el dueño el 2026-09-05: la credencial sigue siendo TELÉFONO + PIN DE UN
 * SUPERVISOR, que es lo que ya existía. Cada marca es autosuficiente — crea su supervisor
 * desde su propio panel y activa sus aparatos sin depender de nadie.
 *
 * ⚠️ D18 (deuda conocida y ACEPTADA por el dueño): el token que se lleva el aparato es su
 * `device_fingerprint`, derivable del user agent. Con §19 pasa a ser la única credencial que
 * hay en el local. Se deja así a propósito; el arreglo sería emitir un token opaco aleatorio.
 *
 * Ref: docs/features/staff-qr-scan.md · spec 2026-09-05-staff-scanner-19-design.md
 */

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createClient(url, key)
}

type Db = ReturnType<typeof getServiceClient>

/**
 * Valida que `location_id` sea una sede ACTIVA DE ESTA MARCA. Multi-sede F4 (D11).
 * Devuelve el mensaje del problema, o `null` si la sede sirve.
 *
 * La FK compuesta `(location_id, tenant_id)` de la 00044 ya impediría atribuir el aparato a
 * una sede de otra marca, pero el motor contesta con un 23503 críptico. Esto lo convierte en
 * una frase que el supervisor entiende, sin dejar de ser el motor quien manda.
 */
async function sedeInvalida(db: Db, tenantId: string, locationId: string): Promise<string | null> {
  const { data, error } = await db
    .from('restaurant_locations')
    .select('id, is_active')
    .eq('id', locationId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (isDbFailure(error)) {
    logDbFailure({
      scope: 'DeviceRegister',
      reason: 'location_lookup_error',
      error,
      context: { tenant_id: tenantId, location_id: locationId },
    })
    return 'No pudimos verificar la sede ahora mismo. Intenta de nuevo en un momento.'
  }
  if (!data) return 'La sede indicada no existe en este restaurante.'
  if (!data.is_active) return 'Esa sede está desactivada.'
  return null
}

export async function POST(request: NextRequest) {
  try {
    // Multi-sede F4 (D11): `resolveHostContext` resuelve la marca TAMBIEN por
    // `restaurant_locations.domain`. Sin eso, el mesero de la sede 2 abre
    // `laureles.marca.com/mesero` y toda esta superficie responde 404. `getTenantByDomain`
    // solo mira `tenants.domain` y CONSERVA su firma: la sede viaja por aqui.
    const hostContext = await resolveHostContext(request.headers.get('host'))
    const tenant = hostContext.tenant
    if (!tenant) {
      return NextResponse.json({ error: 'Restaurante no reconocido' }, { status: 404 })
    }

    const body = await request.json()
    const { phone, pin, device_fingerprint, device_name, location_id } = body as {
      phone?: string
      pin?: string
      device_fingerprint?: string
      device_name?: string
      /** Sede donde queda FÍSICAMENTE el aparato. La elige el supervisor al activarlo. */
      location_id?: string | null
    }

    if (!phone || !pin || !device_fingerprint) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere phone, pin y device_fingerprint' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()

    // ─── Validar supervisor/admin ───
    const { data: staff, error: staffError } = await supabase
      .from('staff_users')
      .select('id, name, pin, role, is_active, location_id')
      .eq('phone', phone)
      .eq('tenant_id', tenant.id)
      .maybeSingle()

    if (isDbFailure(staffError)) {
      logDbFailure({
        scope: 'DeviceRegister',
        reason: 'supervisor_lookup_error',
        error: staffError,
        context: { tenant: tenant.slug },
      })
      return NextResponse.json(
        {
          error: 'Problema técnico',
          message: 'No pudimos validar tus credenciales ahora mismo. Intenta de nuevo en un momento.',
        },
        { status: 503 }
      )
    }

    if (!staff || !staff.is_active) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Usuario no encontrado o inactivo' },
        { status: 401 }
      )
    }

    if (staff.role !== 'supervisor' && staff.role !== 'admin') {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Solo supervisores o admins pueden activar dispositivos' },
        { status: 403 }
      )
    }

    if (!staff.pin) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'Este usuario no tiene PIN configurado' },
        { status: 401 }
      )
    }

    const valid = await bcrypt.compare(String(pin), staff.pin)
    if (!valid) {
      return NextResponse.json(
        { error: 'No autorizado', message: 'PIN incorrecto' },
        { status: 401 }
      )
    }

    // ─── §19: la sede del APARATO ───
    // Ya no se hereda de un dueño: el aparato no tiene dueño. Se elige, y si no se eligió se
    // deduce de lo que sí se sabe con certeza — dónde trabaja el supervisor que lo está
    // activando, o qué sede resolvió el dominio por el que entró.
    let deviceLocationId: string | null =
      (location_id ?? null) || staff.location_id || hostContext.locationId || null

    if (location_id) {
      const problema = await sedeInvalida(supabase, tenant.id, location_id)
      if (problema) {
        return NextResponse.json({ error: 'Sede inválida', message: problema }, { status: 400 })
      }
      deviceLocationId = location_id
    }

    // Sin sede no hay lista de meseros, así que un aparato sin sede no sirve para nada. Se
    // exige AQUÍ —una vez, mientras el supervisor está mirando la pantalla— en vez de
    // dejarlo pasar y que el mesero se estrelle con un 409 en plena hora pico.
    // La excepción es la marca que todavía no tiene ninguna sede creada: no se puede exigir
    // elegir entre cero opciones. Ahí el aparato queda sin sede y `/api/staff/waiters`
    // responde 409 hasta que exista una.
    if (!deviceLocationId) {
      const { data: sedes, error: sedesError } = await supabase
        .from('restaurant_locations')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .limit(1)

      if (isDbFailure(sedesError)) {
        logDbFailure({
          scope: 'DeviceRegister',
          reason: 'locations_probe_error',
          error: sedesError,
          context: { tenant: tenant.slug },
        })
        return NextResponse.json(
          {
            error: 'Problema técnico',
            message: 'No pudimos verificar las sedes ahora mismo. Intenta de nuevo en un momento.',
          },
          { status: 503 }
        )
      }

      if ((sedes ?? []).length > 0) {
        return NextResponse.json(
          {
            error: 'Falta la sede',
            code: 'sede_requerida',
            message: 'Elige en qué sede queda este celular. Se pregunta una sola vez.',
          },
          { status: 400 }
        )
      }
    }

    const finalDeviceName = device_name?.trim() || 'Celular del local'

    // Verificar si ya existe dispositivo con ese fingerprint.
    //
    // Este es el patrón "leer-antes-de-escribir", y es el que peor se lleva con el vacío
    // indistinguible: ante un fallo de base `existing` llega `null`, el código concluye "no
    // existe" y se va por la rama del INSERT — que choca contra el UNIQUE de
    // `device_fingerprint` que trajo la 00044. La comprobación de duplicados no se
    // "salta": queda ANULADA por completo, y solo el motor la sostiene.
    const { data: existing, error: existingError } = await supabase
      .from('staff_devices')
      .select('id')
      .eq('device_fingerprint', device_fingerprint)
      .eq('tenant_id', tenant.id)
      .maybeSingle()

    if (isDbFailure(existingError)) {
      logDbFailure({
        scope: 'DeviceRegister',
        reason: 'device_dup_check_error',
        error: existingError,
        context: { tenant: tenant.slug },
      })
      return NextResponse.json(
        {
          error: 'Problema técnico',
          message: 'No pudimos activar el dispositivo ahora mismo. Intenta de nuevo en un momento.',
        },
        { status: 503 }
      )
    }

    let writeError
    if (existing) {
      // Reactivar. Es también el camino por el que un aparato ya activo se ASIGNA a una sede
      // o se cambia de sede: pide el PIN del supervisor otra vez, que es lo correcto para una
      // acción de autoridad, y es lo que hace el parque instalado (todo con sede NULL).
      const result = await supabase
        .from('staff_devices')
        .update({
          // §19: el aparato deja de tener dueño. También se limpia en los que ya lo tenían,
          // para que no quede una atribución fantasma en una columna que nadie vuelve a leer.
          staff_user_id: null,
          is_trusted: true,
          trusted_at: new Date().toISOString(),
          expires_at: null,
          last_used_at: new Date().toISOString(),
          device_name: finalDeviceName,
          location_id: deviceLocationId,
        })
        .eq('id', existing.id)
        .eq('tenant_id', tenant.id)
      writeError = result.error
    } else {
      const result = await supabase.from('staff_devices').insert({
        staff_user_id: null,
        device_fingerprint,
        device_name: finalDeviceName,
        is_trusted: true,
        trusted_at: new Date().toISOString(),
        expires_at: null,
        // `tenant_id` EXPLÍCITO: la 00030 nunca se aplicó y el DEFAULT puente sigue vivo.
        tenant_id: tenant.id,
        location_id: deviceLocationId,
      })
      writeError = result.error
    }

    if (writeError) {
      // 23514 = el trigger de coherencia de sede/marca de la 00044. Con `staff_user_id` NULL
      //         ese trigger devuelve NEW de inmediato, así que aquí ya no debería aparecer;
      //         se conserva el manejo porque el trigger sigue vivo y vigila otras escrituras.
      // 23505 = `staff_devices_fingerprint_tenant_key`, la carrera de dos activaciones
      //         simultáneas del mismo aparato.
      console.error('[DeviceRegister] Error guardando dispositivo:', writeError)
      const conflicto = writeError.code === '23514' || writeError.code === '23505'
      return NextResponse.json(
        {
          error: conflicto ? 'Conflicto' : 'Error del servidor',
          message: conflicto ? writeError.message : 'Ocurrió un error activando el dispositivo',
        },
        { status: conflicto ? 409 : 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Celular activado',
      device_name: finalDeviceName,
      location_id: deviceLocationId,
    })
  } catch (error) {
    console.error('[DeviceRegister] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error activando el dispositivo' },
      { status: 500 }
    )
  }
}
