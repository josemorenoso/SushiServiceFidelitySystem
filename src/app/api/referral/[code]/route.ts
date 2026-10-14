import { NextRequest, NextResponse } from 'next/server'
import { resolveHostContext } from '@/lib/tenant'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { vistaPublicaDelCodigo } from '@/services/referral.service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/referral/{código} — lo que la landing `/r/{código}` necesita saber.
 *
 * PÚBLICO, como `/api/invite/{slug}`: quien abrió el enlace ya tiene el enlace. Devuelve el
 * PRIMER nombre de quien invita y el regalo del amigo; nada más. La marca sale del dominio: un
 * código de la marca A no existe desde el dominio de la marca B. Un código que no existe, de otra
 * marca o con el programa apagado es un 404 y la landing muestra la de siempre, sin error.
 *
 * Límite por IP: el código es corto, así que barrerlos para leer nombres no puede ser gratis.
 *
 * Doc: docs/features/referral-program.md
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params

  const rl = rateLimit(`referral-code:${getClientIp(request)}`, 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    )
  }

  const tenant = (await resolveHostContext(request.headers.get('host'))).tenant
  if (!tenant) return NextResponse.json({ error: 'Restaurante no reconocido' }, { status: 404 })

  try {
    const vista = await vistaPublicaDelCodigo(code ?? '', tenant.id)
    if (!vista) return NextResponse.json({ error: 'Enlace no encontrado' }, { status: 404 })
    return NextResponse.json(vista)
  } catch (err) {
    // Ya quedó en el log con su contexto. La landing cae a la de siempre, pero esto no es un 404.
    console.error('[Referidos] Error leyendo el código para la landing:', err)
    return NextResponse.json({ error: 'Problema técnico' }, { status: 500 })
  }
}
