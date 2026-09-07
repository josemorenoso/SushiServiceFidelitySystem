import { NextRequest, NextResponse } from 'next/server'
import { requireConnectionActor } from '@/lib/tenant-owner'
import {
  applyWhatsappConnection,
  failConnection,
  findConnectionByNonce,
  onboardingForRoute,
} from '@/services/connection.service'
import { completeWhatsappConnect, SELECT_PHONE_NUMBER_STEP } from '@/lib/zernio/connect'

/**
 * POST /api/dashboard/conexiones/whatsapp/code — cierra la conexión con el `code` de Meta.
 *
 * Dos caminos llegan acá y son EL MISMO: la página de callback que recibe el redirect, y
 * la escotilla de «pegar el code a mano».
 *
 * **La escotilla no se quita nunca**, y no es pereza: el §6.4 del parte de coexistencia
 * deja abierto si en modo `headless` el `code` llega por redirect o por `postMessage`, y
 * no se puede quitar la red antes de saberlo. El día que se compruebe, se quita.
 *
 * EL NONCE ES LA PUERTA
 * ─────────────────────
 * `code` + `nonce`. El nonce se busca en la fila que lo guardó al abrir el signup, y se
 * comprueba que esa fila sea **de la marca de la sesión**. Un `code` sin nonce válido, o
 * con un nonce de otra marca, devuelve **409 y NO cierra nada**. Sin esto, un `code`
 * pegado desde otra pestaña conectaría la WABA equivocada y los mensajes de una marca
 * saldrían por el número de otra.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const actor = await requireConnectionActor()
  if (!actor.ok) {
    return NextResponse.json({ error: actor.denial!.error }, { status: actor.denial!.status })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const { code, nonce } = (body ?? {}) as { code?: unknown; nonce?: unknown }
  if (typeof code !== 'string' || !code.trim()) {
    return NextResponse.json({ error: 'Pega el código que te dio Meta.' }, { status: 400 })
  }
  if (typeof nonce !== 'string' || !nonce.trim()) {
    return NextResponse.json(
      { error: 'Falta el identificador de esta conexión. Vuelve a abrir el paso de Meta.' },
      { status: 409 }
    )
  }

  let connection
  try {
    connection = await findConnectionByNonce(nonce)
  } catch (err) {
    // Fail-closed: si no se pudo COMPROBAR el nonce, no se cierra la conexión.
    console.error('[Conexiones] code: no se pudo verificar el nonce:', err)
    return NextResponse.json({ error: 'No se pudo verificar la conexión' }, { status: 503 })
  }

  // Las dos mitades de la misma comprobación, con el mismo texto a propósito: distinguir
  // «ese nonce no existe» de «ese nonce es de otra marca» le diría a quien lo intenta
  // cuál de las dos cosas acertó.
  if (!connection || connection.tenant_id !== actor.tenantId) {
    console.warn(
      `[Conexiones][NONCE] rechazado tenant=${actor.tenantId} encontrada=${connection ? connection.tenant_id : 'ninguna'}`
    )
    return NextResponse.json(
      { error: 'Esta conexión ya no es válida. Vuelve a abrir el paso de Meta desde tu panel.' },
      { status: 409 }
    )
  }

  if (!connection.route || connection.route === 'zernio_number') {
    return NextResponse.json({ error: 'Esta conexión no se cierra con un código.' }, { status: 409 })
  }

  const { isCoexistence } = onboardingForRoute(connection.route)

  try {
    const result = await completeWhatsappConnect({
      code: code.trim(),
      profileId: connection.zernio_profile_id ?? '',
      wabaId: connection.waba_id,
      phoneNumberId: connection.phone_number_id,
      isCoexistence,
      // SIEMPRE que haya número declarado. Es la única verificación real de que se conectó
      // esa línea y no otra.
      expectedPhoneNumber: connection.phone_e164,
    })

    // §3.b.3 — la WABA tiene 2+ números. NO se implementa el paso (decisión del dueño),
    // pero se DETECTA y se dice: la diferencia entre una deuda declarada y un callejón sin
    // salida es que el cliente lea a quién llamar en vez de mirar una pantalla que no
    // avanza. El `console.error` es lo que le avisa al operador.
    if (result.step === SELECT_PHONE_NUMBER_STEP) {
      console.error(
        `[Conexiones][AVISO-OPERADOR] select_phone_number tenant=${actor.tenantId} connection=${connection.id} — la WABA tiene 2+ numeros`
      )
      await failConnection(
        actor.tenantId,
        connection.id,
        'La cuenta de Meta tiene varios números: este paso lo termina tu asesor.'
      )
      return NextResponse.json(
        {
          error:
            'Tu cuenta de Meta tiene más de un número de WhatsApp. Este paso lo termina tu asesor — ya le avisamos.',
          step: SELECT_PHONE_NUMBER_STEP,
        },
        { status: 409 }
      )
    }

    const accountId = result.accountId
    const phone = result.phoneNumber ?? connection.phone_e164

    if (!accountId || !phone) {
      // Conectada pero incompleta. NO se activa: `activa` exige las dos cosas, la misma
      // invariante que corta `sendViaZernio()` con `zernio_not_configured`. Decir «activa»
      // acá dejaría al cliente creyendo que ya envía mientras no sale ni un mensaje.
      await failConnection(
        actor.tenantId,
        connection.id,
        'Meta aceptó la conexión pero no devolvió la cuenta o el número. Tu asesor lo termina.'
      )
      return NextResponse.json(
        { error: 'Meta aceptó la conexión pero falta un dato. Tu asesor lo termina — ya quedó registrado.' },
        { status: 502 }
      )
    }

    // Todo en UNA transacción del motor: `tenants.zernio_*` + `messaging_provider` + la
    // fila de la conexión. El nonce se quema ahí dentro.
    await applyWhatsappConnection({
      tenantId: actor.tenantId,
      profileId: connection.zernio_profile_id,
      accountId,
      phone,
    })

    return NextResponse.json({ ok: true, status: 'activa', phone })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Conexiones] code falló:', message)

    // 409 de Zernio: ese número ya está conectado en otro profile/workspace. Es un caso
    // real y tiene su propio texto, porque «error del servidor» no le dice a nadie qué
    // hacer.
    const yaConectado = message.includes('409')
    try {
      await failConnection(actor.tenantId, connection.id, message.slice(0, 300))
    } catch {
      // Si ni siquiera se puede marcar el fallo, el 502 de abajo sigue siendo la verdad.
    }

    return NextResponse.json(
      {
        error: yaConectado
          ? 'Ese número ya está conectado a otra cuenta de WhatsApp Business. Habla con tu asesor.'
          : 'No se pudo cerrar la conexión con Meta. Vuelve a intentarlo o habla con tu asesor.',
      },
      { status: 502 }
    )
  }
}
