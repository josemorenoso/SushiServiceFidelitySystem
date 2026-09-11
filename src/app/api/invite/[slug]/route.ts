import { NextRequest, NextResponse } from 'next/server'
import { resolveHostContext } from '@/lib/tenant'
import { getPublicCampaign } from '@/services/qr-campaign.service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/invite/{slug} — lo que la landing pública `/c/{slug}` necesita saber.
 *
 * PÚBLICO y sin auth, como el check-in: quien abrió el enlace ya tiene el enlace.
 * Devuelve solo nombre, premio, vigencia y si queda cupo — nada que no estuviera
 * ya en el mensaje que se compartió. La marca sale del dominio, así que un slug
 * de la marca A no se puede leer desde el dominio de la marca B.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const limpio = (slug ?? '').trim().toLowerCase()
  if (!limpio) return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })

  const hostContext = await resolveHostContext(request.headers.get('host'))
  const tenant = hostContext.tenant
  if (!tenant) return NextResponse.json({ error: 'Restaurante no reconocido' }, { status: 404 })

  const view = await getPublicCampaign(limpio, tenant.id)
  if (!view) return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 })

  return NextResponse.json(view)
}
