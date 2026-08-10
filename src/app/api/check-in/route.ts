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
import { getTenantByDomain } from '@/lib/tenant'
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
  customerId?: string | null
): Promise<WhatsAppSendStatus> {
  if (!templateSid) {
    console.warn(`[CheckIn] No hay plantilla configurada para "${templateType}" — mensaje NO enviado. Configúrala en Dashboard > Ajustes.`)
    return { sent: false, templateType, reason: 'no_template_configured' }
  }
  try {
    const res = await sendTemplateMessage(phone, templateSid, variables, tenant, {
      customerId: customerId ?? null,
      messageType: templateType,
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

    // ─── RESOLVER TENANT POR DOMINIO ───
    const host = request.headers.get('host')
    const tenant = await getTenantByDomain(host)
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

    // ─── VALIDACIÓN DE GEOLOCALIZACIÓN — STANDBY (desactivado v1.0.5-3) ───
    // const { lat, lon } = body
    // const { data: geoStrictRow } = await getServiceClient()
    //   .from('admin_settings')
    //   .select('value')
    //   .eq('key', 'geo_strict_mode')
    //   .single()
    // const geoStrictMode = geoStrictRow?.value === 'true'

    // if (geoStrictMode && (lat == null || lon == null)) {
    //   return NextResponse.json(
    //     { error: 'Ubicación requerida', message: 'El restaurante requiere activar la ubicación para hacer check-in' },
    //     { status: 403 }
    //   )
    // }

    // if (lat != null && lon != null) {
    //   const { data: location } = await getServiceClient()
    //     .from('restaurant_locations')
    //     .select('lat, lon, radius_meters')
    //     .eq('is_active', true)
    //     .single()

    //   if (location) {
    //     const distance = calculateDistanceMeters(
    //       lat, lon,
    //       Number(location.lat), Number(location.lon)
    //     )
    //     if (distance > location.radius_meters) {
    //       return NextResponse.json(
    //         { error: 'Fuera del local', message: `Debes estar dentro del restaurante para hacer check-in (${Math.round(distance)}m de distancia)` },
    //         { status: 403 }
    //       )
    //     }
    //   }
    // }

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
      let pendingStaffScan = false
      if (checkinMode === 'staff_verified' && !firstVisitFree) {
        const supabase = getServiceClient()
        if (registered_by_staff_id) {
          const { data: staff } = await supabase
            .from('staff_users')
            .select('id, is_active')
            .eq('id', registered_by_staff_id)
            .eq('tenant_id', tenant.id)
            .single()
          if (staff && staff.is_active) {
            regStaffAuthValid = true
            regResolvedStaffId = staff.id
          }
        } else if (device_token) {
          const { data: device } = await supabase
            .from('staff_devices')
            .select('id, staff_user_id, is_trusted, expires_at')
            .eq('device_fingerprint', device_token)
            .eq('is_trusted', true)
            .eq('tenant_id', tenant.id)
            .single()
          if (device) {
            if (!device.expires_at || new Date(device.expires_at) >= new Date()) {
              regStaffAuthValid = true
              // Atribuir la visita al mesero dueño del dispositivo (si lo tiene).
              regResolvedStaffId = device.staff_user_id ?? null
            }
          }
        }

        if (!regStaffAuthValid) {
          pendingStaffScan = true
        }
      }

      const customer = await createCustomer({
        phone: cleaned,
        name: name.trim(),
        birthday: birthday ?? null,
        city: city?.trim() || null,
        tenantId: tenant.id,
        accepts_marketing: body.accepts_marketing ?? true,
        countFirstVisit: !pendingStaffScan,
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
          welcomePoints = await awardWelcomeBonus(customer.id, tenant.id)
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
          customer.id
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
      const supabase = getServiceClient()

      // Validar QR token del cliente (firma + expiración)
      if (qrToken) {
        try {
          await verifyCustomerQRToken(qrToken)
        } catch {
          return NextResponse.json(
            { error: 'QR inválido', message: 'El código QR del cliente ha expirado o es inválido.' },
            { status: 403 }
          )
        }
      }

      // Validar auth del mesero: staff_id O device_token
      if (registered_by_staff_id) {
        const { data: staff } = await supabase
          .from('staff_users')
          .select('id, is_active')
          .eq('id', registered_by_staff_id)
          .eq('tenant_id', tenant.id)
          .single()
        if (staff && staff.is_active) {
          staffAuthValid = true
          resolvedStaffId = staff.id
        }
      } else if (device_token) {
        const { data: device } = await supabase
          .from('staff_devices')
          .select('id, staff_user_id, is_trusted, expires_at')
          .eq('device_fingerprint', device_token)
          .eq('is_trusted', true)
          .eq('tenant_id', tenant.id)
          .single()
        if (device) {
          if (!device.expires_at || new Date(device.expires_at) >= new Date()) {
            staffAuthValid = true
            // Atribuir la visita al mesero dueño del dispositivo (si lo tiene):
            // sin esto, todo escaneo desde dispositivo quedaba sin mesero en visits.
            resolvedStaffId = device.staff_user_id ?? null
            // Actualizar last_used_at del dispositivo
            await supabase
              .from('staff_devices')
              .update({ last_used_at: new Date().toISOString() })
              .eq('id', device.id)
          }
        }
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

      const updated = await incrementVisit(customer.id, customer.total_visits, source)
      const visit = await createVisit({
        customerId: customer.id,
        source,
        tenantId: tenant.id,
        tableNumber: body.table_number ?? null,
        registeredByStaffId: resolvedStaffId,
      })

      // Otorgar puntos aleatorios por la visita
      const previousPoints = customer.total_points ?? 0
      let pointsResult = { pointsAwarded: 0, newBalance: previousPoints }
      try {
        pointsResult = await awardVisitPoints(customer.id, visit.id, source, tenant.id)
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
          customer.id
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
          customer.id
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
            customer.id
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
            customer.id
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
