import { NextRequest, NextResponse } from 'next/server'
import { validatePhone } from '@/lib/validators/phone'
import { rateLimit } from '@/lib/rate-limit'
import { resolveHostContext } from '@/lib/tenant'
import { findCustomerByPhone } from '@/services/customer.service'
import {
  beneficioDe,
  invitadosDe,
  leerAjustesDeReferidos,
  obtenerOCrearCodigo,
} from '@/services/referral.service'
import {
  construirEnlace,
  dominioDelEnlace,
  enlaceDeWhatsApp,
  mensajeParaCompartir,
  primerNombre,
  programaActivo,
} from '@/lib/referidos'

export const dynamic = 'force-dynamic'

/**
 * GET /api/referral/me?phone= — el botón «🎁 Gánate {X} por traer a un amigo» de la tarjeta.
 *
 * PÚBLICO y por celular, como `/api/check-in/status` (la tarjeta del cliente no tiene sesión).
 * Devuelve `{ activo: false }` —y el botón no aparece— si el programa está apagado o quien invita
 * no tiene nada que ganar. Si está activo: su código (se crea la primera vez), el enlace, el texto
 * listo para WhatsApp y sus invitados con su estado. De cada invitado viaja SOLO el primer nombre.
 *
 * El dominio del enlace (§1.6 del prompt): en una marca de 2+ sedes, desde el dominio raíz el
 * enlace sale con el de la sede donde quien invita vino por última vez (`dominioDelEnlace()`).
 *
 * Doc: docs/features/referral-program.md
 */
export async function GET(request: NextRequest) {
  const phone = new URL(request.url).searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'Se requiere phone' }, { status: 400 })
  const { valid, cleaned } = validatePhone(phone)
  if (!valid) return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 })

  const rl = rateLimit(`referral-me:${cleaned}`, 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    )
  }

  const host = request.headers.get('host') ?? ''
  const hostContext = await resolveHostContext(host)
  const tenant = hostContext.tenant
  if (!tenant) return NextResponse.json({ error: 'Restaurante no reconocido' }, { status: 404 })

  try {
    const ajustes = await leerAjustesDeReferidos(tenant.id)
    if (!programaActivo(ajustes)) return NextResponse.json({ activo: false })

    const customer = await findCustomerByPhone(cleaned, tenant.id)
    if (!customer) return NextResponse.json({ activo: false })

    // Sin nada que prometer (el premio del catálogo se retiró), el botón no aparece.
    const gana = await beneficioDe(ajustes.premioDeQuienInvita, tenant.id)
    if (!gana) return NextResponse.json({ activo: false })
    const regaloDelAmigo = await beneficioDe(ajustes.premioDelAmigo, tenant.id)

    const codigo = await obtenerOCrearCodigo(customer.id, tenant.id)
    const dominio = dominioDelEnlace({
      host,
      requiereElegirSede: hostContext.requiresLocationChoice,
      sedes: hostContext.locationChoices,
      sedeDeUltimaVisita: customer.last_visit_location_id ?? null,
    })
    const enlace = construirEnlace(dominio, codigo)
    const texto = mensajeParaCompartir(ajustes.mensaje, {
      nombre: primerNombre(customer.name),
      beneficio: regaloDelAmigo,
      marca: tenant.name,
      enlace,
    })
    const invitados = await invitadosDe(customer.id, tenant.id)

    return NextResponse.json({
      activo: true,
      codigo,
      enlace,
      gana,
      regalo_del_amigo: regaloDelAmigo,
      dias: ajustes.diasDeVencimiento,
      tope_al_mes: ajustes.topeAlMes,
      mensaje: texto,
      whatsapp_url: enlaceDeWhatsApp(texto),
      invitados,
      resumen: {
        registrados: invitados.length,
        vinieron: invitados.filter((i) => i.estado === 'completed').length,
        ganados: invitados.filter((i) => i.gano).length,
      },
    })
  } catch (err) {
    // Ya quedó en el log con su contexto. La tarjeta no muestra el botón, pero esto no es «apagado».
    console.error('[Referidos] Error armando la tarjeta de quien invita:', err)
    return NextResponse.json({ error: 'Problema técnico' }, { status: 500 })
  }
}
