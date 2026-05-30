import { NextRequest, NextResponse } from 'next/server'
import { validatePhone } from '@/lib/validators/phone'
import { findCustomerByPhone, createCustomer, incrementVisit } from '@/services/customer.service'
import { createVisit, getRecentVisit } from '@/services/visit.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getMultipleSettings } from '@/services/settings.service'
import { syncGoogleContact } from '@/services/google-contacts-sync.service'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { awardVisitPoints, awardWelcomeBonus } from '@/services/points.service'
import { evaluateNewTier, getNextTier, buildTiersRoadmap, updateCustomerTier, getAllTiers } from '@/services/reward-tiers.service'
import { verifyCustomerQRToken } from '@/lib/utils/qrcode'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
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
async function sendCheckinTemplate(
  templateSid: string | undefined,
  templateType: string,
  phone: string,
  variables: Record<string, string>
): Promise<void> {
  if (!templateSid) {
    console.warn(`[CheckIn] No hay plantilla configurada para "${templateType}" — mensaje NO enviado. Configúrala en Dashboard > Ajustes.`)
    return
  }
  try {
    await sendTemplateMessage(phone, templateSid, variables)
  } catch (err) {
    console.error(`[CheckIn] Error enviando plantilla ${templateType}:`, err)
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
    const { source = 'qr', registered_by_staff_id, device_token } = body
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
      const customer = await findCustomerByPhone(cleaned)
      const settings = await getMultipleSettings([
        'checkin_mode',
        'checkin_first_visit_free',
      ])
      const checkinMode = settings.checkin_mode ?? 'auto'
      const firstVisitFree = settings.checkin_first_visit_free !== 'false'

      if (customer) {
        return NextResponse.json({
          found: true,
          checkin_mode: checkinMode,
          checkin_first_visit_free: firstVisitFree,
          customer: {
            id: customer.id,
            name: customer.name,
            total_visits: customer.total_visits,
            current_tier: customer.current_tier,
            total_points: customer.total_points,
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

      const existing = await findCustomerByPhone(cleaned)
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
      ])
      const checkinMode = regSettings.checkin_mode ?? 'auto'
      const firstVisitFree = regSettings.checkin_first_visit_free !== 'false'

      // Si modo staff_verified y primera visita NO es libre, requiere auth de mesero
      let regStaffAuthValid = false
      let regResolvedStaffId: string | null = null
      if (checkinMode === 'staff_verified' && !firstVisitFree) {
        const supabase = getServiceClient()
        if (registered_by_staff_id) {
          const { data: staff } = await supabase
            .from('staff_users')
            .select('id, is_active')
            .eq('id', registered_by_staff_id)
            .single()
          if (staff && staff.is_active) {
            regStaffAuthValid = true
            regResolvedStaffId = staff.id
          }
        } else if (device_token) {
          const { data: device } = await supabase
            .from('staff_devices')
            .select('id, is_trusted, expires_at')
            .eq('device_fingerprint', device_token)
            .eq('is_trusted', true)
            .single()
          if (device) {
            if (!device.expires_at || new Date(device.expires_at) >= new Date()) {
              regStaffAuthValid = true
            }
          }
        }

        if (!regStaffAuthValid) {
          return NextResponse.json(
            {
              error: 'Validación requerida',
              message: 'Este restaurante requiere que un mesero valide la primera visita.',
            },
            { status: 403 }
          )
        }
      }

      const customer = await createCustomer({
        phone: cleaned,
        name: name.trim(),
        birthday: birthday ?? null,
        city: city?.trim() || null,
        accepts_marketing: body.accepts_marketing ?? true,
      })

      // Visita (best-effort — no debe bloquear el registro)
      // Usa source staff_scan si fue validado por mesero, sino qr
      const regSource: 'qr' | 'staff_scan' = regResolvedStaffId ? 'staff_scan' : 'qr'
      let visitRecord
      try {
        visitRecord = await createVisit({
          customerId: customer.id,
          source: regSource,
          tableNumber: body.table_number ?? null,
          registeredByStaffId: regResolvedStaffId,
        })
      } catch (visitErr) {
        console.error('[CheckIn] Error creando visita (registro continuará):', visitErr)
      }

      // Puntos de bienvenida (Endowed Progress Effect)
      let welcomePoints = { pointsAwarded: 0, newBalance: 0 }
      try {
        welcomePoints = await awardWelcomeBonus(customer.id)
      } catch (err) {
        console.error('[CheckIn] Error otorgando puntos de bienvenida:', err)
      }

      // WhatsApp de bienvenida — DEBE usar await para que Vercel no mate el proceso
      const settings = await getMultipleSettings(['welcome_template_sid'])
      let tiersRoadmap = '🌟 ¡Seguí sumando puntos para desbloquear premios!'
      try {
        tiersRoadmap = await buildTiersRoadmap(welcomePoints.newBalance)
      } catch (err) {
        console.error('[CheckIn] Error generando tiers roadmap:', err)
      }
      await sendCheckinTemplate(
        settings.welcome_template_sid,
        'welcome',
        cleaned,
        { '1': customer.name, '2': String(welcomePoints.newBalance), '3': tiersRoadmap }
      )

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
        allTiers = await getAllTiers()
      } catch (err) {
        console.error('[CheckIn] Error obteniendo tiers:', err)
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
      const customer = await findCustomerByPhone(cleaned)
      if (!customer) {
        return NextResponse.json(
          { error: 'No encontrado', message: 'Cliente no encontrado' },
          { status: 404 }
        )
      }

      // Leer modo de check-in
      const settings = await getMultipleSettings([
        'checkin_mode',
        'checkin_first_visit_free',
        'points_earned_far_template_sid',
        'points_earned_near_template_sid',
        'tier_unlocked_template_sid',
      ])
      const checkinMode = settings.checkin_mode ?? 'auto'
      const firstVisitFree = settings.checkin_first_visit_free !== 'false'
      const isExistingCustomer = customer.total_visits >= 1

      // ─── Anti-fraude: modo staff_verified ───
      if (checkinMode === 'staff_verified' && isExistingCustomer && source !== 'staff_scan') {
        return NextResponse.json(
          {
            error: 'Validación requerida',
            message: 'Este restaurante requiere que un mesero valide tu visita.',
          },
          { status: 403 }
        )
      }

      let staffAuthValid = false
      let resolvedStaffId: string | null = null

      if (source === 'staff_scan') {
        const supabase = getServiceClient()

        // Validar QR token (firma + expiración)
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
            .single()
          if (staff && staff.is_active) {
            staffAuthValid = true
            resolvedStaffId = staff.id
          }
        } else if (device_token) {
          const { data: device } = await supabase
            .from('staff_devices')
            .select('id, is_trusted, expires_at')
            .eq('device_fingerprint', device_token)
            .eq('is_trusted', true)
            .single()
          if (device) {
            if (!device.expires_at || new Date(device.expires_at) >= new Date()) {
              staffAuthValid = true
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
      }

      // Verificar check-in duplicado (mínimo 24h entre check-ins)
      const recentVisit = await getRecentVisit(customer.id, 1440)
      if (recentVisit) {
        return NextResponse.json(
          {
            error: 'Check-in reciente',
            message: `Ya registraste tu visita hoy, ${customer.name}. ¡Solo puedes registrar una visita por día!`,
            customer: { name: customer.name, total_visits: customer.total_visits },
          },
          { status: 429 }
        )
      }

      const updated = await incrementVisit(customer.id, customer.total_visits, source)
      const visit = await createVisit({
        customerId: customer.id,
        source,
        tableNumber: body.table_number ?? null,
        registeredByStaffId: resolvedStaffId,
      })

      // Otorgar puntos aleatorios por la visita
      const previousPoints = customer.total_points ?? 0
      let pointsResult = { pointsAwarded: 0, newBalance: previousPoints }
      try {
        pointsResult = await awardVisitPoints(customer.id, visit.id, source)
        console.log(`[CheckIn] Puntos otorgados: +${pointsResult.pointsAwarded} → balance=${pointsResult.newBalance} (prev=${previousPoints})`)
      } catch (err) {
        console.error('[CheckIn] ERROR otorgando puntos (se usa fallback 0):', err)
      }

      // Evaluar si cruzó un nuevo tier
      let newTier = null
      let nextTierInfo = null
      try {
        newTier = await evaluateNewTier(previousPoints, pointsResult.newBalance)
        if (newTier) {
          await updateCustomerTier(customer.id, newTier.tier_name)
        }
        nextTierInfo = await getNextTier(pointsResult.newBalance)
      } catch (err) {
        console.error('[CheckIn] ERROR evaluando tiers (se continúa sin tiers):', err)
      }

      let tiersRoadmapText = '🌟 ¡Seguí sumando puntos para desbloquear premios!'
      try {
        tiersRoadmapText = await buildTiersRoadmap(pointsResult.newBalance)
      } catch (err) {
        console.error('[CheckIn] Error generando tiers roadmap:', err)
      }

      // Google Contacts sync (best-effort pero awaited para Vercel)
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
        // Enviar plantilla de tier desbloqueado (si existe)
        if (settings.tier_unlocked_template_sid) {
          await sendCheckinTemplate(
            settings.tier_unlocked_template_sid,
            'tier_unlocked',
            cleaned,
            { '1': updated.name, '2': newTier.tier_name, '3': newTier.safe_reward_title, '4': tiersRoadmapText }
          )
        }

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
        })
      }

      // ─── SIN TIER NUEVO: puntos sumados, evaluar cercanía ───
      const isNearTier = nextTierInfo && nextTierInfo.pointsRemaining <= 30

      if (isNearTier && settings.points_earned_near_template_sid) {
        await sendCheckinTemplate(
          settings.points_earned_near_template_sid,
          'points_earned_near',
          cleaned,
          {
            '1': updated.name,
            '2': String(pointsResult.pointsAwarded),
            '3': String(pointsResult.newBalance),
            '4': nextTierInfo!.tier.safe_reward_title,
          }
        )
      } else if (settings.points_earned_far_template_sid) {
        await sendCheckinTemplate(
          settings.points_earned_far_template_sid,
          'points_earned_far',
          cleaned,
          {
            '1': updated.name,
            '2': String(pointsResult.pointsAwarded),
            '3': String(pointsResult.newBalance),
            '4': tiersRoadmapText,
          }
        )
      } else {
        console.warn('[CheckIn] No hay plantilla de puntos configurada (points_earned_near/far_template_sid). Mensaje WhatsApp NO enviado.')
      }

      const allTiersForResponse = await getAllTiers()
      return NextResponse.json({
        message: newTier ? 'tier_unlocked' : 'points_earned',
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
