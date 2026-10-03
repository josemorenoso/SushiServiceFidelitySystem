import { NextRequest, NextResponse } from 'next/server'
import { findCustomerByPhone } from '@/services/customer.service'
import { getNivelOfrecido, buildTiersRoadmap } from '@/services/reward-tiers.service'
import { resolveMysteryBox, generateNearMissText } from '@/services/mystery-box.service'
import { grantReward } from '@/services/reward-grant.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getMultipleSettings } from '@/services/settings.service'
import { resolveHostContext } from '@/lib/tenant'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { validatePhone } from '@/lib/validators/phone'
import { logDbFailure } from '@/lib/db-failure'
import type { MysteryBoxChoice } from '@/types/database.types'

interface ResolveRequestBody {
  phone: string
  tier_id: string
  choice: MysteryBoxChoice
}

function demasiadas(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: 'Demasiadas solicitudes', message: 'Espera un momento e intenta de nuevo.', retryAfter: retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  )
}

/**
 * El cliente elige su premio (seguro o mystery box) y se le otorga.
 *
 * ⚠️ PÚBLICA Y SIN SESIÓN: la llama el celular del cliente. Por eso **solo otorga el
 * nivel que `GET /api/check-in/status` le está ofreciendo** —de la marca del host, de
 * su sede, alcanzado y sin reclamar—, calculado con la MISMA función
 * (`getNivelOfrecido()`). El `tier_id` del body no elige nada: solo confirma que el
 * cliente está contestando a esa oferta. Hasta la ola 0 (AISLA-1, auditoría
 * 2026-09-28) lo elegía, y se buscaba sin marca: premios sin límite y entre marcas.
 *
 * Que sea «sin reclamar» la hace idempotente por diseño: la fila de
 * `mystery_box_results` que escribe `resolveMysteryBox()` sella el reclamo (00059), y la
 * próxima llamada ya no encuentra oferta (409). Lo que esto NO cubre es la carrera de
 * dos llamadas simultáneas que leen antes de que la primera escriba; el límite de tasa
 * la acota, no la elimina (`docs/features/points-mystery-box.md` §7.4.ter).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ResolveRequestBody
    const { phone, tier_id, choice } = body

    if (!phone || !tier_id || !choice) {
      return NextResponse.json(
        { error: 'Datos inválidos', message: 'Se requiere phone, tier_id y choice' },
        { status: 400 }
      )
    }

    if (choice !== 'safe' && choice !== 'mystery') {
      return NextResponse.json(
        { error: 'Choice inválido', message: 'choice debe ser "safe" o "mystery"' },
        { status: 400 }
      )
    }

    // El mismo `cleaned` con el que `check-in/status` encontró al cliente.
    const { valid, cleaned } = validatePhone(phone)
    if (!valid) {
      return NextResponse.json(
        { error: 'Teléfono inválido', message: 'El teléfono no es válido' },
        { status: 400 }
      )
    }

    // ─── LÍMITE DE TASA ───
    // Un cliente elige premio una vez por nivel, así que 5 cada 10 min por celular
    // sobra para reintentos de red. Por IP, más holgado (el WiFi del local lo
    // comparten todos): frena a quien prueba celulares ajenos desde un mismo lugar.
    // En memoria de cada instancia (`rate-limit.ts`): acota, no es un candado.
    const porCelular = rateLimit(`mystery-resolve:${cleaned}`, 5, 10 * 60_000)
    if (!porCelular.allowed) return demasiadas(porCelular.retryAfterSeconds)
    const porIp = rateLimit(`mystery-resolve-ip:${getClientIp(request)}`, 30, 60_000)
    if (!porIp.allowed) return demasiadas(porIp.retryAfterSeconds)

    // La marca Y la sede del host, igual que `check-in/status`: el celular que
    // consulta la oferta es el mismo que la acepta, desde el mismo enlace.
    const host = request.headers.get('host')
    const { tenant, locationId } = await resolveHostContext(host)
    if (!tenant) {
      return NextResponse.json(
        { error: 'Restaurante no reconocido', message: 'No se pudo identificar el restaurante para este dominio' },
        { status: 404 }
      )
    }

    // Buscar cliente
    const customer = await findCustomerByPhone(cleaned, tenant.id)
    if (!customer) {
      return NextResponse.json(
        { error: 'No encontrado', message: 'Cliente no encontrado' },
        { status: 404 }
      )
    }

    // ─── El único nivel que se puede otorgar: el que status ofrece ───
    const ofrecido = await getNivelOfrecido({
      customerId: customer.id,
      totalPoints: customer.total_points ?? 0,
      tenantId: tenant.id,
      locationId,
    })
    if (!ofrecido.ok) {
      logDbFailure({
        scope: 'MysteryBox',
        reason: 'claimed_tiers_lookup_error',
        error: ofrecido.error,
        context: { tenant: tenant.slug, customer_id: customer.id, tier_id },
      })
      return NextResponse.json(
        { error: 'Problema técnico', message: 'No pudimos confirmar tu premio ahora mismo. Intenta de nuevo en un momento.' },
        { status: 503 }
      )
    }
    // Un id de otra marca, un nivel ya reclamado, uno no alcanzado o uno que no es el
    // que se ofrece: todos son «esa oferta no existe». Un solo mensaje a propósito —
    // distinguirlos le contaría a quien prueba ids qué niveles tiene cada marca.
    if (!ofrecido.nivel || ofrecido.nivel.id !== tier_id) {
      return NextResponse.json(
        { error: 'Premio no disponible', message: 'Este premio ya fue reclamado o no está disponible.' },
        { status: 409 }
      )
    }
    const tier = ofrecido.nivel

    // Resolver mystery box
    const result = await resolveMysteryBox({
      customerId: customer.id,
      tier,
      choice,
      tenantId: tenant.id,
    })

    // ─── Otorgar el premio (migración 00031) ───
    // Este es el arreglo de la condición de carrera: hasta ahora el premio elegido solo
    // existía como mystery_box_results, y el mesero ya había pasado de pantalla. Ahora
    // queda como `reward_grant` activo y aparece en /mesero/rewards hasta que se entregue.
    //
    // No propaga: si el grant falla, el cliente igual ve su premio en pantalla. Un premio
    // sin registrar es recuperable; un check-in caído, no.
    try {
      const granted = await grantReward(
        {
          customerId: customer.id,
          grantType: 'tier_prize',
          source: choice === 'safe' ? 'safe_choice' : 'mystery_box',
          prizeTitle: result.prizeTitle,
          tierId: tier.id,
          mysteryBoxResultId: result.resultId,
          // Los premios de tier no vencen.
        },
        tenant.id
      )
      if (!granted.ok) {
        console.error('[MysteryBox] No se pudo otorgar el premio:', granted.code, granted.error)
      }
    } catch (err) {
      console.error('[MysteryBox] Error otorgando el premio:', err)
    }

    // Near-miss text (solo para mystery box)
    const nearMissText = choice === 'mystery'
      ? generateNearMissText(
          { title: result.prizeTitle, probability: 0, emoji: result.prizeEmoji },
          result.allPrizes
        )
      : null

    // Enviar WhatsApp con resultado
    // La sede sale del NIVEL que se está canjeando: `tier.location_id` dice de qué
    // local es ese premio (`null` = de la marca). Como el nivel salió de la escalera
    // de la sede del host, es la misma escalera que `getAllTiers(tenant, locationId)`:
    // una sede sin niveles propios hereda los de la marca, y `null` da esos mismos.
    const roadmap = await buildTiersRoadmap(customer.total_points, tenant.id, tier.location_id ?? null)

    const settings = await getMultipleSettings([
      'reward_safe_template_sid',
      'mystery_box_result_template_sid',
      'golden_box_result_template_sid',
    ], tenant.id)

    // ─── ENVÍO DE WHATSAPP ───
    // Auditoría 12-Julio: antes el .catch() silencioso ocultaba los fallos y la API
    // respondía ok:true aunque el cliente nunca recibiera el mensaje. Ahora capturamos
    // el resultado y lo reportamos al frontend en `whatsapp_sent` para que la UI muestre
    // un fallback ("muestra esta pantalla al mesero"). El envío queda persistido en
    // message_logs por sendTemplateMessage vía logContext.
    let whatsappSent = false
    let whatsappReason: string | undefined

    try {
      if (choice === 'safe') {
        if (settings.reward_safe_template_sid) {
          const res = await sendTemplateMessage(
            customer.phone,
            settings.reward_safe_template_sid,
            { '1': customer.name, '2': tier.tier_name, '3': result.prizeTitle, '4': roadmap },
            tenant,
            { customerId: customer.id, messageType: 'safe_reward' }
          )
          whatsappSent = res !== null
          if (!whatsappSent) whatsappReason = 'twilio_error_or_unconfigured'
        } else {
          whatsappReason = 'no_template_configured'
        }
      } else {
        const templateSid = result.wasGolden
          ? settings.golden_box_result_template_sid
          : settings.mystery_box_result_template_sid

        if (templateSid) {
          const vars: Record<string, string> = result.wasGolden
            ? { '1': customer.name, '2': result.prizeTitle, '3': roadmap }
            : { '1': customer.name, '2': tier.tier_name, '3': result.prizeTitle, '4': roadmap }

          const res = await sendTemplateMessage(
            customer.phone,
            templateSid,
            vars,
            tenant,
            { customerId: customer.id, messageType: result.wasGolden ? 'golden_box' : 'mystery_box' }
          )
          whatsappSent = res !== null
          if (!whatsappSent) whatsappReason = 'twilio_error_or_unconfigured'
        } else {
          whatsappReason = 'no_template_configured'
        }
      }
    } catch (err) {
      console.error('[MysteryBox] Error enviando WhatsApp:', err)
      whatsappSent = false
      whatsappReason = err instanceof Error ? err.message : 'unknown_error'
    }

    return NextResponse.json({
      ok: true,
      whatsapp_sent: whatsappSent,
      whatsapp_reason: whatsappReason,
      result: {
        result_id: result.resultId,
        choice: result.choice,
        prize_title: result.prizeTitle,
        prize_emoji: result.prizeEmoji,
        prize_index: result.prizeIndex,
        was_golden: result.wasGolden,
        near_miss: nearMissText,
        all_prizes: result.allPrizes,
        effective_prizes: result.effectivePrizes,
      },
      customer: {
        name: customer.name,
        total_points: customer.total_points,
        tier: tier.tier_name,
      },
    })
  } catch (error) {
    console.error('[MysteryBox] Error:', error)
    return NextResponse.json(
      { error: 'Error del servidor', message: 'Ocurrió un error procesando la mystery box' },
      { status: 500 }
    )
  }
}
