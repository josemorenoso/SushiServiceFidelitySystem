import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireConnectionActor } from '@/lib/tenant-owner'
import { isDbFailure, logDbFailure } from '@/lib/db-failure'
import {
  ensurePrimaryConnection,
  onboardingForRoute,
  openSignup,
} from '@/services/connection.service'
import { newSignupNonce, startWhatsappConnect } from '@/lib/zernio/connect'

/**
 * POST /api/dashboard/conexiones/whatsapp/signup — genera el `authUrl` de Meta.
 *
 * Devuelve la URL para que el navegador del CLIENTE la abra. La `ZERNIO_API_KEY` se queda
 * de este lado: el navegador solo recibe una URL de Facebook.
 *
 * LAS DOS COSAS QUE ESTA RUTA ARREGLA
 * ───────────────────────────────────
 * 1. **El `redirect_url` deja de apuntar a un endpoint imposible.** El AIOS arma
 *    `${PRODUCT_WEBHOOK_BASE_URL}/api/webhook/zernio` y, con la variable vacía, manda
 *    literalmente `https://zernio.com`. Pero esa ruta **solo exporta POST** y exige firma
 *    HMAC: un navegador que aterrice ahí recibe **405**. Acá el destino es una PÁGINA del
 *    panel.
 * 2. **El nonce es NUESTRO.** El `state` que devuelve Zernio
 *    (`"user123-profile456-timestamp-callbackurl"`) no identifica al tenant de forma
 *    confiable. Se genera un nonce propio, se guarda en la fila y se compara al volver.
 *    Sin esto, un `code` pegado desde otra pestaña conecta la WABA equivocada y nadie se
 *    entera hasta que los mensajes salen por el número de otra marca.
 */

export const dynamic = 'force-dynamic'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

/**
 * La URL pública del panel, para armar el `redirect_url`.
 *
 * Se prefiere el `origin` de la propia petición: el panel de cada marca vive en SU
 * dominio (`marca.com`, `laureles.marca.com`), y hornear una sola base mandaría al cliente
 * de vuelta al dominio de otra marca a mitad del alta.
 */
function callbackUrl(req: NextRequest): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || new URL(req.url).origin
  return `${base}/dashboard/conexiones/whatsapp/callback`
}

export async function POST(req: NextRequest) {
  const actor = await requireConnectionActor()
  if (!actor.ok) {
    return NextResponse.json({ error: actor.denial!.error }, { status: actor.denial!.status })
  }

  let connection
  try {
    connection = await ensurePrimaryConnection(actor.tenantId)
  } catch (err) {
    console.error('[Conexiones] signup: no se pudo leer la conexión:', err)
    return NextResponse.json({ error: 'No se pudo preparar la conexión' }, { status: 500 })
  }

  if (!connection.route) {
    return NextResponse.json({ error: 'Primero elige cómo quieres conectar tu WhatsApp.' }, { status: 409 })
  }
  if (connection.route === 'zernio_number') {
    // El camino C no pasa por Embedded Signup: §3.a lo activa solo con
    // `connectWhatsapp: true`. Es justo la pregunta §6.6 del parte, que desaparece por
    // construcción al partir los caminos en tres.
    return NextResponse.json(
      { error: 'Una línea nueva de Zernio no se conecta por aquí: la activa tu asesor al comprarla.' },
      { status: 409 }
    )
  }

  // El `profileId` lo crea el OPERADOR en el AIOS (§7 del reparto). Si todavía no existe,
  // el cliente no puede empezar — y tiene que leer eso, no un error genérico.
  const service = getServiceClient()
  const { data: tenant, error: tenantError } = await service
    .from('tenants')
    .select('zernio_profile_id')
    .eq('id', actor.tenantId)
    .maybeSingle<{ zernio_profile_id: string | null }>()

  if (isDbFailure(tenantError)) {
    logDbFailure({
      scope: 'Conexiones',
      reason: 'profile_read_error',
      error: tenantError,
      context: { tenant_id: actor.tenantId },
    })
    return NextResponse.json({ error: 'No se pudo leer la marca' }, { status: 500 })
  }

  const profileId = tenant?.zernio_profile_id ?? null
  if (!profileId) {
    return NextResponse.json(
      { error: 'Tu asesor todavía no creó el perfil de mensajería de este negocio. Avísale para continuar.' },
      { status: 409 }
    )
  }

  const { onboarding } = onboardingForRoute(connection.route)
  const nonce = newSignupNonce()

  // El nonce se guarda ANTES de pedirle la URL a Zernio. Al revés, un fallo al guardar
  // dejaría una URL viva cuyo `code` nadie podría validar: el cliente terminaría el paso
  // en Meta y la vuelta rebotaría con 409 sin que él haya hecho nada mal.
  try {
    await openSignup(actor.tenantId, connection.id, nonce)
  } catch (err) {
    console.error('[Conexiones] signup: no se pudo guardar el nonce:', err)
    return NextResponse.json({ error: 'No se pudo abrir la conexión' }, { status: 500 })
  }

  try {
    const redirectUrl = `${callbackUrl(req)}?nonce=${encodeURIComponent(nonce)}`
    const { authUrl, state } = await startWhatsappConnect({ profileId, redirectUrl, onboarding })

    // El `state` de Zernio se devuelve solo como dato: NO autoriza nada. Quien identifica
    // la conexión al volver es el nonce.
    return NextResponse.json({ ok: true, authUrl, nonce, zernioState: state })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Conexiones] signup: Zernio falló:', message)
    return NextResponse.json(
      { error: 'No se pudo abrir la conexión con Meta. Intenta de nuevo en un momento.' },
      { status: 502 }
    )
  }
}
