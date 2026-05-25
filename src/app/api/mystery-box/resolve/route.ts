import { NextRequest, NextResponse } from 'next/server'
import { findCustomerByPhone } from '@/services/customer.service'
import { getTierById } from '@/services/reward-tiers.service'
import { resolveMysteryBox, generateNearMissText } from '@/services/mystery-box.service'
import { buildTiersRoadmap } from '@/services/reward-tiers.service'
import { sendTemplateMessage } from '@/services/whatsapp.service'
import { getMultipleSettings } from '@/services/settings.service'
import type { MysteryBoxChoice } from '@/types/database.types'

interface ResolveRequestBody {
  phone: string
  tier_id: string
  choice: MysteryBoxChoice
}

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

    // Buscar cliente
    const customer = await findCustomerByPhone(phone)
    if (!customer) {
      return NextResponse.json(
        { error: 'No encontrado', message: 'Cliente no encontrado' },
        { status: 404 }
      )
    }

    // Buscar tier
    const tier = await getTierById(tier_id)
    if (!tier) {
      return NextResponse.json(
        { error: 'Tier no encontrado', message: 'El tier especificado no existe' },
        { status: 404 }
      )
    }

    // Validar que el cliente tiene suficientes puntos para este tier
    if (customer.total_points < tier.point_threshold) {
      return NextResponse.json(
        {
          error: 'Puntos insuficientes',
          message: `Necesitas ${tier.point_threshold} puntos. Tienes ${customer.total_points}.`,
        },
        { status: 400 }
      )
    }

    // Resolver mystery box
    const result = await resolveMysteryBox({
      customerId: customer.id,
      tier,
      choice,
    })

    // Near-miss text (solo para mystery box)
    const nearMissText = choice === 'mystery'
      ? generateNearMissText(
          { title: result.prizeTitle, probability: 0, emoji: result.prizeEmoji },
          result.allPrizes
        )
      : null

    // Enviar WhatsApp con resultado
    const roadmap = await buildTiersRoadmap(customer.total_points)

    const settings = await getMultipleSettings([
      'reward_safe_template_sid',
      'mystery_box_result_template_sid',
      'golden_box_result_template_sid',
    ])

    if (choice === 'safe' && settings.reward_safe_template_sid) {
      await sendTemplateMessage(customer.phone, settings.reward_safe_template_sid, {
        '1': customer.name,
        '2': tier.tier_name,
        '3': result.prizeTitle,
        '4': roadmap,
      }).catch((err) => console.error('[MysteryBox] Error enviando WhatsApp safe:', err))
    } else if (choice === 'mystery') {
      const templateSid = result.wasGolden
        ? settings.golden_box_result_template_sid
        : settings.mystery_box_result_template_sid

      if (templateSid) {
        const vars: Record<string, string> = result.wasGolden
          ? { '1': customer.name, '2': result.prizeTitle, '3': roadmap }
          : { '1': customer.name, '2': tier.tier_name, '3': result.prizeTitle, '4': roadmap }

        await sendTemplateMessage(customer.phone, templateSid, vars)
          .catch((err) => console.error('[MysteryBox] Error enviando WhatsApp mystery:', err))
      }
    }

    return NextResponse.json({
      ok: true,
      result: {
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
