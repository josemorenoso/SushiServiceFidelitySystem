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
import { calculateDistanceMeters } from '@/lib/utils/geolocation'
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
      if (customer) {
        return NextResponse.json({
          found: true,
          customer: { name: customer.name, total_visits: customer.total_visits },
        })
      }
      return NextResponse.json({ found: false })
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

      const customer = await createCustomer({
        phone: cleaned,
        name: name.trim(),
        birthday: birthday ?? null,
        city: city?.trim() || null,
        accepts_marketing: body.accepts_marketing ?? true,
      })

      // Visita (best-effort — no debe bloquear el registro)
      let visitRecord
      try {
        visitRecord = await createVisit({ customerId: customer.id, source: 'qr', tableNumber: body.table_number ?? null })
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
          source: 'qr',
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
      const customer = await findCustomerByPhone(cleaned)
      if (!customer) {
        return NextResponse.json(
          { error: 'No encontrado', message: 'Cliente no encontrado' },
          { status: 404 }
        )
      }

      // Verificar check-in duplicado (mínimo 24h entre check-ins QR)
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

      const updated = await incrementVisit(customer.id, customer.total_visits, 'qr')
      const visit = await createVisit({ customerId: customer.id, source: 'qr', tableNumber: body.table_number ?? null })

      // Guardar coordenadas del check-in — STANDBY (desactivado v1.0.5-3)
      // if (lat != null && lon != null) {
      //   try {
      //     const svc = getServiceClient()
      //     const { data: loc } = await svc
      //       .from('restaurant_locations')
      //       .select('lat, lon')
      //       .eq('is_active', true)
      //       .single()
      //     const dist = loc ? Math.round(calculateDistanceMeters(lat, lon, Number(loc.lat), Number(loc.lon))) : null
      //     await svc.from('customers').update({
      //       checkin_lat: lat,
      //       checkin_lon: lon,
      //       checkin_distance_meters: dist,
      //     }).eq('id', customer.id)
      //   } catch (geoErr) {
      //     console.error('[CheckIn] Error guardando coords:', geoErr)
      //   }
      // }

      // Otorgar puntos aleatorios por la visita
      const previousPoints = customer.total_points ?? 0
      let pointsResult = { pointsAwarded: 0, newBalance: previousPoints }
      try {
        pointsResult = await awardVisitPoints(customer.id, visit.id, 'qr')
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

      // Fetch settings para plantillas
      const settings = await getMultipleSettings([
        'points_earned_far_template_sid',      // puntos sumados (lejos)
        'points_earned_near_template_sid',     // puntos sumados (cerca)
        'tier_unlocked_template_sid',          // tier desbloqueado
      ])

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
          source: 'qr',
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
