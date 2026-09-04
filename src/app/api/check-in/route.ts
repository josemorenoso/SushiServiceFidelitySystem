import { NextRequest, NextResponse } from 'next/server'
import { validatePhone } from '@/lib/validators/phone'
import { findCustomerByPhone, createCustomer, incrementVisit } from '@/services/customer.service'
import { createVisit } from '@/services/visit.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getMultipleSettings } from '@/services/settings.service'
import { syncGoogleContact } from '@/services/google-contacts-sync.service'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { awardVisitPoints, awardWelcomeBonus } from '@/services/points.service'
import { evaluateNewTier, getNextTier, buildTiersRoadmap, updateCustomerTier, getAllTiers } from '@/services/reward-tiers.service'
import { verifyCustomerQRToken, generateCustomerQRToken } from '@/lib/utils/qrcode'
import { markConverted } from '@/services/imported-contacts.service'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'
import { resolveHostContext } from '@/lib/tenant'
import { resolveVisitLocation, type LocationResolution } from '@/lib/location-resolver'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import type { Tenant } from '@/types/tenant.types'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

function getStaffSecret(): Uint8Array | null {
  const s = process.env.STAFF_JWT_SECRET
  if (!s) return null
  return new TextEncoder().encode(s)
}

/**
 * Deriva staff_id o device_token desde headers Authorization/X-Device-Token.
 * Usado por la app del mesero que manda auth via headers, no body.
 */
async function resolveStaffAuthFromHeaders(
  request: NextRequest
): Promise<{ staffId: string | null; deviceToken: string | null }> {
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null
  const deviceToken = request.headers.get('x-device-token')

  let staffId: string | null = null
  if (bearer) {
    const secret = getStaffSecret()
    if (secret) {
      try {
        const { payload } = await jwtVerify(bearer, secret, { clockTolerance: 60 })
        if (typeof payload.sub === 'string') staffId = payload.sub
      } catch (err) {
        console.warn('[CheckIn] Bearer staff JWT inválido:', err instanceof Error ? err.message : err)
      }
    } else {
      console.warn('[CheckIn] STAFF_JWT_SECRET no configurado — no se puede validar Bearer del mesero')
    }
  }

  return { staffId, deviceToken: deviceToken || null }
}

// Rate limits por IP
const LOOKUP_MAX = 30         // 30 lookups/min por IP (bajo para evitar enumeración)
const REGISTER_MAX = 5        // 5 registros/hora por IP (anti-spam de cuentas falsas)
const CHECKIN_MAX = 20        // 20 check-ins/min por IP
const MINUTE = 60_000
const HOUR = 3_600_000

interface CheckInRequestBody {
  phone: string
  action: 'lookup' | 'register' | 'checkin'
  name?: string
  birthday?: string | null
  city?: string | null
  accepts_marketing?: boolean
  table_number?: number | null
  lat?: number | null
  lon?: number | null
  source?: 'qr' | 'staff_scan'
  registered_by_staff_id?: string | null
  device_token?: string | null
  token?: string | null
}

/**
 * Envía plantilla WhatsApp de forma best-effort.
 * Si no hay SID configurado, solo loguea advertencia.
 * Variables estándar: {{1}}=nombre, {{2}}=visitas, {{3}}=hint/premio
 */
interface WhatsAppSendStatus {
  sent: boolean
  templateType: string
  reason?: string
}

async function sendCheckinTemplate(
  templateSid: string | undefined,
  templateType: string,
  phone: string,
  variables: Record<string, string>,
  tenant: Tenant,
  customerId?: string | null,
  /**
   * Sede a la que se imputa el mensaje (D4 / `message_logs.location_id`, multi-sede F3).
   * Es la "sede del acto" del §6.1: el check-in que acaba de ocurrir.
   */
  locationId?: string | null
): Promise<WhatsAppSendStatus> {
  if (!templateSid) {
    console.warn(`[CheckIn] No hay plantilla configurada para "${templateType}" — mensaje NO enviado. Configúrala en Dashboard > Ajustes.`)
    return { sent: false, templateType, reason: 'no_template_configured' }
  }
  try {
    const res = await sendTemplateMessage(phone, templateSid, variables, tenant, {
      customerId: customerId ?? null,
      messageType: templateType,
      locationId: locationId ?? null,
    })
    if (!res) {
      // sendTemplateMessage devuelve null cuando Twilio no está configurado o el envío falló
      console.warn(`[CheckIn] Plantilla "${templateType}" NO enviada (Twilio sin config o rechazó el envío). Revisa logs [WhatsApp].`)
      return { sent: false, templateType, reason: 'twilio_error_or_unconfigured' }
    }
    return { sent: true, templateType }
  } catch (err) {
    console.error(`[CheckIn] Error enviando plantilla ${templateType}:`, err)
    return { sent: false, templateType, reason: err instanceof Error ? err.message : 'unknown_error' }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CheckInRequestBody
    const { phone, action } = body

    if (!phone || !action) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere phone y action' },
        { status: 400 }
      )
    }

    const { valid, cleaned } = validatePhone(phone)
    if (!valid) {
      return NextResponse.json(
        { error: 'Teléfono inválido', message: 'Ingresa un número colombiano válido (10 dígitos, empieza con 3)' },
        { status: 400 }
      )
    }

    // ─── RESOLVER MARCA + SEDE POR DOMINIO (multi-sede F3, spec §3.1-§3.3) ───
    // `resolveHostContext` reemplaza a `getTenantByDomain` aquí porque además de la marca
    // devuelve la SEDE: el subdominio propio de una sede (`host`), o la «sede única
    // implícita» del dominio raíz cuando la marca tiene exactamente una sede activa
    // (`host_single`). `getTenantByDomain` conserva su firma y sus otros 15 llamadores.
    const host = request.headers.get('host')
    const hostContext = await resolveHostContext(host)
    const tenant = hostContext.tenant
    if (!tenant) {
      return NextResponse.json(
        { error: 'Restaurante no reconocido', message: 'No se pudo identificar el restaurante para este dominio' },
        { status: 404 }
      )
    }

    // ─── RATE LIMITING por IP ───
    const ip = getClientIp(request)
    const rateLimitConfig = {
      lookup: { max: LOOKUP_MAX, window: MINUTE },
      register: { max: REGISTER_MAX, window: HOUR },
      checkin: { max: CHECKIN_MAX, window: MINUTE },
    }[action]

    if (rateLimitConfig) {
      const rl = rateLimit(`checkin:${action}:${ip}`, rateLimitConfig.max, rateLimitConfig.window)
      if (!rl.allowed) {
        return NextResponse.json(
          {
            error: 'Demasiadas solicitudes',
            message: `Espera ${rl.retryAfterSeconds} segundos antes de intentar nuevamente.`,
          },
          {
            status: 429,
            headers: { 'Retry-After': String(rl.retryAfterSeconds) },
          }
        )
      }
    }

    // ─── RATE LIMITING por staff (cuando source es staff_scan) ───
    const { source = 'qr' } = body
    let { registered_by_staff_id, device_token } = body

    // Si no vinieron en body, derivarlos de headers (la app del mesero los manda asi)
    if (source === 'staff_scan' && !registered_by_staff_id && !device_token) {
      const resolved = await resolveStaffAuthFromHeaders(request)
      registered_by_staff_id = resolved.staffId
      device_token = resolved.deviceToken
    }

    if (source === 'staff_scan') {
      const staffKey = registered_by_staff_id
        ? `checkin:staff:${registered_by_staff_id}`
        : `checkin:device:${device_token}`
      const staffRl = rateLimit(staffKey, 10, MINUTE)
      if (!staffRl.allowed) {
        return NextResponse.json(
          {
            error: 'Demasiadas solicitudes',
            message: `Espera ${staffRl.retryAfterSeconds} segundos antes de registrar otra visita.`,
          },
          {
            status: 429,
            headers: { 'Retry-After': String(staffRl.retryAfterSeconds) },
          }
        )
      }
    }

    // ─── La geocerca comentada SE BORRÓ en F3 (spec §3.5) ───
    // Estuvo aquí comentada desde v1.0.5-3. Como control de acceso ya la reemplazó, con
    // ventaja, la exigencia de `source === 'staff_scan'` de más abajo. Como resolver de sede
    // era la peor de las cuatro vías del §3.1. Y dejarla comentada era PELIGROSO: su query no
    // filtraba `tenant_id` y usaba `.single()`, así que el primero que la descomentara cuando
    // existan 2 sedes rompería el check-in con PGRST116 para TODOS los clientes de TODOS los
    // tenants. El campo `lat`/`lon` del body se sigue aceptando y se ignora.

    // ─── LOOKUP: buscar si el cliente existe ───
    if (action === 'lookup') {
      const customer = await findCustomerByPhone(cleaned, tenant.id)
      const settings = await getMultipleSettings([
        'checkin_mode',
        'checkin_first_visit_free',
      ], tenant.id)
      const checkinMode = settings.checkin_mode ?? 'auto'
      const firstVisitFree = settings.checkin_first_visit_free !== 'false'

      if (customer) {
        let qr_token: string | null = null
        try {
          console.log('[CheckIn] Generando QR token para cliente:', customer.id, customer.name)
          qr_token = await generateCustomerQRToken({
            sub: customer.id,
            phone: cleaned,
            name: customer.name || 'Cliente',
            // Claim `loc`: la sede desde la que se generó el QR. SOLO detecta conflicto al
            // escanear, nunca decide la sede de la visita (§3.1 y conflicto 7 de §11).
            ...(hostContext.locationId ? { loc: hostContext.locationId } : {}),
          })
          console.log('[CheckIn] QR token generado OK')
        } catch (qrErr) {
          console.error('[CheckIn] Error generando QR token:', qrErr)
          // STAFF_QR_JWT_SECRET not set — QR flow disabled but lookup still succeeds
        }

        return NextResponse.json({
          found: true,
          checkin_mode: checkinMode,
          checkin_first_visit_free: firstVisitFree,
          qr_token,
          customer: {
            id: customer.id,
            name: customer.name || 'Cliente',
            total_visits: customer.total_visits ?? 0,
            current_tier: customer.current_tier ?? null,
            total_points: customer.total_points ?? 0,
          },
        })
      }
      return NextResponse.json({
        found: false,
        checkin_mode: checkinMode,
        checkin_first_visit_free: firstVisitFree,
      })
    }

    // ─── REGISTER: crear cliente nuevo + primera visita ───
    if (action === 'register') {
      const { name, birthday, city } = body

      if (!name || name.trim().length < 2) {
        return NextResponse.json(
          { error: 'Nombre inválido', message: 'El nombre debe tener al menos 2 caracteres' },
          { status: 400 }
        )
      }

      const existing = await findCustomerByPhone(cleaned, tenant.id)
      if (existing) {
        return NextResponse.json(
          { error: 'Ya registrado', message: 'Este número ya está registrado' },
          { status: 409 }
        )
      }

      // ─── SEDE REQUERIDA (multi-sede F3, spec §3.2) ───
      // El host es el dominio RAÍZ de una marca con 2+ sedes activas: no hay forma honesta
      // de saber en cuál está la persona, y adivinar metería su registro y todas sus visitas
      // futuras en el reporte de la sede equivocada. Se responde 409 con la lista para que
      // ELIJA: cada sede trae su `domain`, y abrir ese subdominio resuelve por la vía `host`.
      //
      // Con 0 o 1 sedes activas esto NO se dispara: es el interruptor de compatibilidad del
      // §8.3. Los 4 tenants vivos tienen exactamente una sede, así que para ellos el registro
      // se comporta hoy exactamente igual que antes de F3.
      if (hostContext.requiresLocationChoice) {
        return NextResponse.json(
          {
            error: 'Sede requerida',
            message: 'Este negocio tiene varias sedes. Abre el enlace de la sede donde estás para registrarte.',
            locations: hostContext.locationChoices.map((l) => ({
              id: l.id,
              name: l.name,
              slug: l.slug,
              domain: l.domain,
            })),
          },
          { status: 409 }
        )
      }

      // Leer modo de check-in para validar si primera visita requiere mesero
      const regSettings = await getMultipleSettings([
        'checkin_mode',
        'checkin_first_visit_free',
      ], tenant.id)
      const checkinMode = regSettings.checkin_mode ?? 'auto'
      const firstVisitFree = regSettings.checkin_first_visit_free !== 'false'

      // Si modo staff_verified y primera visita NO es libre, valida si hay auth de mesero.
      // Con auth válida (mesero registrando en el local) la visita se cuenta de una.
      // Sin auth, el registro continúa pero la visita queda PENDIENTE del escaneo del mesero.
      let regStaffAuthValid = false
      let regResolvedStaffId: string | null = null
      // Multi-sede F4: las dos vías más fuertes de la precedencia del §3.1, ya con fuente
      // (`staff_users.location_id` / `staff_devices.location_id`, migración 00044).
      let regStaffLocationId: string | null = null
      let regDeviceLocationId: string | null = null
      let pendingStaffScan = false
      if (checkinMode === 'staff_verified' && !firstVisitFree) {
        const supabase = getServiceClient()
        if (registered_by_staff_id) {
          const { data: staff, error: staffError } = await supabase
            .from('staff_users')
            .select('id, is_active, location_id')
            .eq('id', registered_by_staff_id)
            .eq('tenant_id', tenant.id)
            .maybeSingle()
          // El `error` va ANTES que el `data`: sin esto un timeout del pooler deja
          // `regStaffAuthValid` en false igual que un mesero inexistente, y el registro se
          // degrada a "pendiente de escaneo" sin dejar UNA sola línea de log.
          if (isDbFailure(staffError)) {
            logDbFailure({
              scope: 'CheckIn',
              reason: 'register_staff_lookup_error',
              error: staffError,
              context: { tenant: tenant.slug, staff_id: registered_by_staff_id },
            })
          } else if (staff && staff.is_active) {
            regStaffAuthValid = true
            regResolvedStaffId = staff.id
            regStaffLocationId = staff.location_id ?? null
          }
        } else if (device_token) {
          const { data: device, error: deviceError } = await supabase
            .from('staff_devices')
            .select('id, staff_user_id, is_trusted, expires_at, location_id')
            .eq('device_fingerprint', device_token)
            .eq('is_trusted', true)
            .eq('tenant_id', tenant.id)
            .maybeSingle()
          if (isDbFailure(deviceError)) {
            logDbFailure({
              scope: 'CheckIn',
              reason: 'register_device_lookup_error',
              error: deviceError,
              context: { tenant: tenant.slug },
            })
          } else if (device) {
            if (!device.expires_at || new Date(device.expires_at) >= new Date()) {
              regStaffAuthValid = true
              // Atribuir la visita al mesero dueño del dispositivo (si lo tiene).
              regResolvedStaffId = device.staff_user_id ?? null
              regDeviceLocationId = device.location_id ?? null
            }
          }
        }

        // AQUÍ SÍ se degrada a propósito, y por eso no se responde 503: el cliente se
        // registra igual unas líneas más abajo. Dejar la visita pendiente del escaneo del
        // mesero es la dirección SEGURA (no regala visita ni puntos) y se auto-repara en
        // cuanto el mesero escanea, que es justo lo que está a punto de hacer. Lo que no
        // era aceptable es que ocurriera EN SILENCIO: el log de arriba es la diferencia.
        if (!regStaffAuthValid) {
          pendingStaffScan = true
        }
      }

      // ─── SEDE DEL REGISTRO (multi-sede, precedencia del §3.1) ───
      // El registro en modo `auto` nunca pasa por auth de mesero, así que ahí las dos vías
      // fuertes llegan vacías y la precedencia cae al host — que es justo el argumento por el
      // que el host es imprescindible (§3.1). En modo `staff_verified` con la primera visita
      // no libre sí hubo auth, y desde F4 esa auth trae sede.
      const regLocation = resolveVisitLocation({
        staffLocationId: regStaffLocationId,
        deviceLocationId: regDeviceLocationId,
        hostLocationId: hostContext.locationId,
        hostSource: hostContext.locationSource,
      })

      const customer = await createCustomer({
        phone: cleaned,
        name: name.trim(),
        birthday: birthday ?? null,
        city: city?.trim() || null,
        tenantId: tenant.id,
        accepts_marketing: body.accepts_marketing ?? true,
        countFirstVisit: !pendingStaffScan,
        // D2: dónde se registró. Corregible solo por el admin de marca.
        originLocationId: regLocation.locationId,
      })

      // ─── Conversión Golden Bullet ───
      // Si este teléfono provino de un contacto importado al que ya se le envió
      // el mensaje, lo marcamos como 'converted' y dejamos trazabilidad en
      // customers.imported_contact_id (activa el ROI automático del lote).
      try {
        const importedContactId = await markConverted(cleaned, customer.id, tenant.id)
        if (importedContactId) {
          await getServiceClient()
            .from('customers')
            .update({ imported_contact_id: importedContactId })
            .eq('id', customer.id)
        }
      } catch (err) {
        console.error('[CheckIn] Error marcando conversión Golden Bullet:', err)
      }

      // Visita (best-effort — no debe bloquear el registro)
      // Usa source staff_scan si fue validado por mesero, sino qr.
      // Si está pendiente del escaneo del mesero, NO se crea visita todavía.
      const regSource: 'qr' | 'staff_scan' = regResolvedStaffId ? 'staff_scan' : 'qr'
      let visitRecord
      if (!pendingStaffScan) {
        try {
          visitRecord = await createVisit({
            customerId: customer.id,
            source: regSource,
            tenantId: tenant.id,
            tableNumber: body.table_number ?? null,
            registeredByStaffId: regResolvedStaffId,
            location: regLocation,
          })
        } catch (visitErr) {
          console.error('[CheckIn] Error creando visita (registro continuará):', visitErr)
        }
      }

      // Puntos de bienvenida (Endowed Progress Effect)
      // Se omiten cuando la visita está pendiente del mesero (pendingStaffScan=true):
      // el escaneo del mesero ya otorgará los puntos de la primera visita,
      // y el bono de bienvenida previo causaría doble conteo.
      let welcomePoints = { pointsAwarded: 0, newBalance: 0 }
      if (!pendingStaffScan) {
        try {
          welcomePoints = await awardWelcomeBonus(customer.id, tenant.id, regLocation.locationId)
        } catch (err) {
          console.error('[CheckIn] Error otorgando puntos de bienvenida:', err)
        }
      }

      // WhatsApp de bienvenida — solo cuando la visita se confirma de inmediato
      if (!pendingStaffScan) {
        const welcomeSettings = await getMultipleSettings(['welcome_template_sid'], tenant.id)
        let tiersRoadmap = '🌟 ¡Seguí sumando puntos para desbloquear premios!'
        try {
          tiersRoadmap = await buildTiersRoadmap(welcomePoints.newBalance, tenant.id)
        } catch (err) {
          console.error('[CheckIn] Error generando tiers roadmap:', err)
        }
        await sendCheckinTemplate(
          welcomeSettings.welcome_template_sid,
          'welcome',
          cleaned,
          { '1': customer.name, '2': String(welcomePoints.newBalance), '3': tiersRoadmap },
          tenant,
          customer.id,
          regLocation.locationId
        )
      }

      // Google Contacts sync (best-effort pero awaited para Vercel)
      try {
        await syncGoogleContact({
          phone: cleaned,
          name: customer.name,
          birthday: customer.birthday ?? null,
          city: customer.city ?? null,
          totalVisits: customer.total_visits,
          source: regSource,
          action: 'created',
        })
      } catch (err) {
        console.error('[CheckIn] Error sync Google Contacts:', err)
      }

      let allTiers: unknown[] = []
      try {
        allTiers = await getAllTiers(tenant.id)
      } catch (err) {
        console.error('[CheckIn] Error obteniendo tiers:', err)
      }

      // Primera visita pendiente del mesero: devolver QR dinámico para que lo escanee
      if (pendingStaffScan) {
        let regQrToken: string | null = null
        try {
          regQrToken = await generateCustomerQRToken({
            sub: customer.id,
            phone: cleaned,
            name: customer.name || 'Cliente',
            ...(regLocation.locationId ? { loc: regLocation.locationId } : {}),
          })
        } catch (qrErr) {
          console.error('[CheckIn] Error generando QR token post-registro:', qrErr)
        }

        return NextResponse.json(
          {
            message: 'registered_pending_scan',
            qr_token: regQrToken,
            customer: {
              id: customer.id,
              name: customer.name,
              total_visits: customer.total_visits,
              total_points: welcomePoints.newBalance,
            },
            points_awarded: welcomePoints.pointsAwarded,
            tiers: allTiers,
          },
          { status: 201 }
        )
      }

      return NextResponse.json(
        {
          message: 'welcome',
          customer: {
            name: customer.name,
            total_visits: customer.total_visits,
            total_points: welcomePoints.newBalance,
          },
          points_awarded: welcomePoints.pointsAwarded,
          tiers: allTiers,
        },
        { status: 201 }
      )
    }

    // ─── CHECKIN: cliente existente + registrar visita ───
    if (action === 'checkin') {
      const { token: qrToken } = body
      const customer = await findCustomerByPhone(cleaned, tenant.id)
      if (!customer) {
        return NextResponse.json(
          { error: 'No encontrado', message: 'Cliente no encontrado' },
          { status: 404 }
        )
      }

      // Leer templates para WhatsApp
      const settings = await getMultipleSettings([
        'points_earned_far_template_sid',
        'points_earned_near_template_sid',
        'tier_unlocked_template_sid',
        'welcome_template_sid',
      ], tenant.id)

      // Primera visita verificada por el mesero (cliente nuevo en modo staff_verified):
      // el welcome bonus/WhatsApp se omitió en el registro porque la visita estaba pendiente.
      // Se detecta ANTES de incrementar la visita (total_visits aún en 0).
      const isFirstVisit = (customer.total_visits ?? 0) === 0

      // ─── Solo mesero puede registrar visitas ───
      if (source !== 'staff_scan') {
        return NextResponse.json(
          {
            error: 'Validación requerida',
            message: 'Solo un mesero puede registrar visitas.',
          },
          { status: 403 }
        )
      }

      let staffAuthValid = false
      let resolvedStaffId: string | null = null
      // Multi-sede F4: las vías 1 y 2 del §3.1, ya con fuente (migración 00044).
      let staffLocationId: string | null = null
      let deviceLocationId: string | null = null
      const supabase = getServiceClient()

      // Validar QR token del cliente (firma + expiración)
      // El claim `loc` se guarda para DETECTAR conflicto de sede, nunca para decidirla:
      // el QR lo arma el navegador del cliente con el subdominio que tenga abierto, que
      // puede ser un enlace guardado de otra sede (§3.1, conflicto 7 de §11 del spec).
      let qrLocationId: string | null = null
      if (qrToken) {
        try {
          const qrPayload = await verifyCustomerQRToken(qrToken)
          qrLocationId = qrPayload.loc ?? null
        } catch {
          return NextResponse.json(
            { error: 'QR inválido', message: 'El código QR del cliente ha expirado o es inválido.' },
            { status: 403 }
          )
        }
      }

      // Validar auth del mesero: staff_id O device_token
      //
      // `staffAuthDbFailure` es el tercer estado que faltaba. Sin él, un timeout del
      // pooler, una policy de RLS o una columna que no existe (42703 — el escenario real si
      // la 00044 se despliega en el orden equivocado) dejan `staffAuthValid` en false y el
      // mesero recibe un 403 IDÉNTICO al de una credencial mala. El mesero concluye que su
      // sesión caducó, vuelve a entrar, y la visita del cliente no se registra nunca — sin
      // una sola línea de log en ningún sitio.
      let staffAuthDbFailure = false
      if (registered_by_staff_id) {
        const { data: staff, error: staffError } = await supabase
          .from('staff_users')
          .select('id, is_active, location_id')
          .eq('id', registered_by_staff_id)
          .eq('tenant_id', tenant.id)
          .maybeSingle()
        if (isDbFailure(staffError)) {
          logDbFailure({
            scope: 'CheckIn',
            reason: 'staff_lookup_error',
            error: staffError,
            context: { tenant: tenant.slug, staff_id: registered_by_staff_id },
          })
          staffAuthDbFailure = true
        } else if (staff && staff.is_active) {
          staffAuthValid = true
          resolvedStaffId = staff.id
          staffLocationId = staff.location_id ?? null
        }
      } else if (device_token) {
        const { data: device, error: deviceError } = await supabase
          .from('staff_devices')
          .select('id, staff_user_id, is_trusted, expires_at, location_id')
          .eq('device_fingerprint', device_token)
          .eq('is_trusted', true)
          .eq('tenant_id', tenant.id)
          .maybeSingle()
        if (isDbFailure(deviceError)) {
          logDbFailure({
            scope: 'CheckIn',
            reason: 'device_lookup_error',
            error: deviceError,
            context: { tenant: tenant.slug },
          })
          staffAuthDbFailure = true
        }
        if (device) {
          if (!device.expires_at || new Date(device.expires_at) >= new Date()) {
            staffAuthValid = true
            // Atribuir la visita al mesero dueño del dispositivo (si lo tiene):
            // sin esto, todo escaneo desde dispositivo quedaba sin mesero en visits.
            resolvedStaffId = device.staff_user_id ?? null
            // Vía 2 del §3.1. Se usa la sede DEL DISPOSITIVO, no la del mesero al que está
            // atribuido: el mesero no se autenticó aquí, el aparato sí. El trigger
            // `trg_staff_devices_sede_coherente` (00044) garantiza que, cuando las dos se
            // conocen, son la misma — así que la distinción solo importa cuando una es NULL.
            deviceLocationId = device.location_id ?? null
            // Actualizar last_used_at del dispositivo. Es telemetría —que falle no
            // invalida el escaneo— pero hasta hoy descartaba su resultado entero.
            const { error: touchError } = await supabase
              .from('staff_devices')
              .update({ last_used_at: new Date().toISOString() })
              .eq('id', device.id)
            if (touchError) {
              logDbFailure({
                scope: 'CheckIn',
                reason: 'device_touch_error',
                error: touchError,
                context: { tenant: tenant.slug, device_id: device.id },
              })
            }
          }
        }
      }

      // 503 y NO 403: la credencial del mesero puede ser perfecta. Decirle "no autorizado"
      // cuando lo que falló fue la base es la mentira que hace que la visita se pierda en
      // silencio — el mesero da por hecho que su sesión murió y no vuelve a escanear.
      if (staffAuthDbFailure) {
        return NextResponse.json(
          {
            error: 'Problema técnico',
            message:
              'No pudimos verificar tu sesión ahora mismo. La visita NO quedó registrada: vuelve a escanear en un momento.',
          },
          { status: 503 }
        )
      }

      if (!staffAuthValid) {
        return NextResponse.json(
          {
            error: 'No autorizado',
            message: 'Mesero o dispositivo no válido. No se puede registrar la visita.',
          },
          { status: 403 }
        )
      }

      // ─── SEDE DE LA VISITA (multi-sede F3, precedencia del §3.1) ───
      // mesero → dispositivo → host → NULL. El mesero GANA sobre el host: un cliente parado
      // en Laureles puede abrir su enlace guardado de `envigado.marca.com`, y si ganara el
      // host la visita se acreditaría a Envigado y el reporte de D12 mentiría sin que nadie
      // lo note. El mesero es de UNA sede (D11) y está físicamente donde ocurre la visita.
      // F4 (migración 00044) le dio fuente a las dos vías fuertes: se piden en el SELECT de
      // arriba y llegan aquí con valor. Un mesero o un dispositivo sin sede asignada manda
      // `null` y la precedencia cae al host, exactamente como antes de F4.
      // NOTA: aquí NO se responde 403 por discrepancia entre el host y la sede del mesero.
      // El 403 del §5.3 es del LOGIN del mesero (`/api/staff/login`), no de esta ruta: el
      // cliente puede perfectamente llegar con un enlace guardado de otra sede, y ése es
      // justo el caso para el que existe la precedencia. La discrepancia se REGISTRA en
      // `visits.location_conflict`, no se bloquea.
      const visitLocation: LocationResolution = resolveVisitLocation({
        staffLocationId,
        deviceLocationId,
        hostLocationId: hostContext.locationId,
        hostSource: hostContext.locationSource,
        qrLocationId,
      })

      const updated = await incrementVisit(
        customer.id,
        customer.total_visits,
        source,
        visitLocation.locationId
      )
      const visit = await createVisit({
        customerId: customer.id,
        source,
        tenantId: tenant.id,
        tableNumber: body.table_number ?? null,
        registeredByStaffId: resolvedStaffId,
        location: visitLocation,
      })

      // Otorgar puntos aleatorios por la visita
      const previousPoints = customer.total_points ?? 0
      let pointsResult = { pointsAwarded: 0, newBalance: previousPoints }
      try {
        pointsResult = await awardVisitPoints(
          customer.id,
          visit.id,
          source,
          tenant.id,
          visitLocation.locationId
        )
        console.log(`[CheckIn] Puntos otorgados: +${pointsResult.pointsAwarded} → balance=${pointsResult.newBalance} (prev=${previousPoints})`)
      } catch (err) {
        console.error('[CheckIn] ERROR otorgando puntos (se usa fallback 0):', err)
      }

      // Evaluar si cruzó un nuevo tier
      let newTier = null
      let nextTierInfo = null
      try {
        newTier = await evaluateNewTier(previousPoints, pointsResult.newBalance, tenant.id)
        if (newTier) {
          await updateCustomerTier(customer.id, newTier.tier_name)
        }
        nextTierInfo = await getNextTier(pointsResult.newBalance, tenant.id)
      } catch (err) {
        console.error('[CheckIn] ERROR evaluando tiers (se continúa sin tiers):', err)
      }

      let tiersRoadmapText = '🌟 ¡Seguí sumando puntos para desbloquear premios!'
      try {
        tiersRoadmapText = await buildTiersRoadmap(pointsResult.newBalance, tenant.id)
      } catch (err) {
        console.error('[CheckIn] Error generando tiers roadmap:', err)
      }

      // ─── ENVÍO DE WHATSAPP ───
      // Se envía ANTES del sync de Google Contacts para que una latencia/timeout del
      // webhook externo nunca impida la entrega del mensaje al cliente.
      let whatsappStatus: WhatsAppSendStatus = { sent: false, templateType: 'none', reason: 'not_attempted' }

      if (newTier) {
        // Tier desbloqueado: mensaje en el momento del cruce (requiere tier_unlocked_template_sid)
        whatsappStatus = await sendCheckinTemplate(
          settings.tier_unlocked_template_sid,
          'tier_unlocked',
          cleaned,
          { '1': updated.name, '2': newTier.tier_name, '3': newTier.safe_reward_title, '4': tiersRoadmapText },
          tenant,
          customer.id,
          visitLocation.locationId
        )
      } else if (isFirstVisit) {
        // Primera visita verificada por el mesero: mensaje de BIENVENIDA, no de "sumaste puntos",
        // para que el cliente nuevo no parezca frecuente. {{1}}=nombre, {{2}}=saldo, {{3}}=roadmap.
        whatsappStatus = await sendCheckinTemplate(
          settings.welcome_template_sid,
          'welcome',
          cleaned,
          { '1': updated.name, '2': String(pointsResult.newBalance), '3': tiersRoadmapText },
          tenant,
          customer.id,
          visitLocation.locationId
        )
      } else {
        // Sin tier nuevo: puntos sumados. Cada caso usa SU plantilla — sin fallback engañoso.
        const isNearTier = !!(nextTierInfo && nextTierInfo.pointsRemaining <= 30)
        if (isNearTier) {
          whatsappStatus = await sendCheckinTemplate(
            settings.points_earned_near_template_sid,
            'points_earned_near',
            cleaned,
            {
              '1': updated.name,
              '2': String(pointsResult.pointsAwarded),
              '3': String(pointsResult.newBalance),
              '4': nextTierInfo!.tier.safe_reward_title,
            },
            tenant,
            customer.id,
            visitLocation.locationId
          )
        } else {
          whatsappStatus = await sendCheckinTemplate(
            settings.points_earned_far_template_sid,
            'points_earned_far',
            cleaned,
            {
              '1': updated.name,
              '2': String(pointsResult.pointsAwarded),
              '3': String(pointsResult.newBalance),
              '4': tiersRoadmapText,
            },
            tenant,
            customer.id,
            visitLocation.locationId
          )
        }
      }

      // Google Contacts sync (best-effort, DESPUÉS del WhatsApp para no bloquear la entrega)
      try {
        await syncGoogleContact({
          phone: cleaned,
          name: updated.name,
          totalVisits: updated.total_visits,
          source,
          action: 'updated',
        })
      } catch (err) {
        console.error('[CheckIn] Error sync Google Contacts:', err)
      }

      // ─── NUEVO SISTEMA DE PUNTOS ───
      // Si el cliente desbloqueó un tier → responder con opciones de reward/mystery box
      if (newTier) {
        return NextResponse.json({
          message: 'tier_unlocked',
          customer: {
            name: updated.name,
            total_visits: updated.total_visits,
            total_points: pointsResult.newBalance,
          },
          points_awarded: pointsResult.pointsAwarded,
          tier_unlocked: {
            id: newTier.id,
            name: newTier.tier_name,
            safe_reward: newTier.safe_reward_title,
            mystery_box_enabled: newTier.mystery_box_enabled,
            mystery_prizes: newTier.mystery_prizes,
            is_black: newTier.is_black,
          },
          next_tier: nextTierInfo ? {
            name: nextTierInfo.tier.tier_name,
            points_remaining: nextTierInfo.pointsRemaining,
            threshold: nextTierInfo.tier.point_threshold,
          } : null,
          tiers_roadmap: tiersRoadmapText,
          whatsapp: whatsappStatus,
        })
      }

      const allTiersForResponse = await getAllTiers(tenant.id)
      return NextResponse.json({
        message: 'points_earned',
        customer: {
          name: updated.name,
          total_visits: updated.total_visits,
          total_points: pointsResult.newBalance,
        },
        points_awarded: pointsResult.pointsAwarded,
        next_tier: nextTierInfo ? {
          name: nextTierInfo.tier.tier_name,
          points_remaining: nextTierInfo.pointsRemaining,
          threshold: nextTierInfo.tier.point_threshold,
        } : null,
        tiers_roadmap: tiersRoadmapText,
        tiers: allTiersForResponse,
        whatsapp: whatsappStatus,
      })
    }

    return NextResponse.json(
      { error: 'Acción inválida', message: 'action debe ser: lookup, register o checkin' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[CheckIn] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error procesando tu solicitud' },
      { status: 500 }
    )
  }
}
