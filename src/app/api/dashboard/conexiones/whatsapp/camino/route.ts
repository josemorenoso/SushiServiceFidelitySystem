import { NextRequest, NextResponse } from 'next/server'
import { requireConnectionActor } from '@/lib/tenant-owner'
import { setConnectionRoute, type ConnectionRoute } from '@/services/connection.service'

/**
 * POST /api/dashboard/conexiones/whatsapp/camino — fija cuál de los tres caminos sigue
 * esta marca (§2 del diseño).
 *
 * **409 si el camino ya está congelado.** Se puede corregir mientras no se haya declarado
 * número ni abierto el signup; después no, porque cambiarlo deja un número comprado o una
 * coexistencia a medias sin dueño. La regla vive en el MOTOR (trigger de la 00054), no
 * solo acá: del lado del cliente una pestaña vieja apuntando a otro camino es mucho más
 * probable que del lado del operador.
 */

export const dynamic = 'force-dynamic'

const ROUTES: ConnectionRoute[] = ['coexistence', 'byo_cloud_api', 'zernio_number']

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

  const route = (body as { route?: unknown } | null)?.route
  if (typeof route !== 'string' || !ROUTES.includes(route as ConnectionRoute)) {
    return NextResponse.json(
      { error: `\`route\` debe ser uno de: ${ROUTES.join(', ')}` },
      { status: 400 }
    )
  }

  // El camino C (línea nueva) COMPRA. Esta fase no lo implementa, y se rechaza del lado
  // del SERVIDOR en vez de solo esconder el botón: un cliente que llame la ruta a mano no
  // puede quedar en un estado que ninguna pantalla sabe terminar.
  if (route === 'zernio_number') {
    return NextResponse.json(
      {
        error:
          'La línea nueva todavía no se puede pedir desde aquí. Habla con tu asesor: él la cotiza y la habilita.',
      },
      { status: 409 }
    )
  }

  try {
    const connection = await setConnectionRoute(actor.tenantId, route as ConnectionRoute)
    return NextResponse.json({ ok: true, connection })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // `camino_congelado` lo lanza el trigger de la 00054. Es un 409 con causa, no un 500
    // mudo: el cliente tiene que leer POR QUÉ no puede cambiarlo.
    if (message.includes('camino_congelado')) {
      return NextResponse.json(
        {
          error:
            'Ya declaraste un número o abriste la conexión con Meta, así que el camino no se puede cambiar. Habla con tu asesor.',
        },
        { status: 409 }
      )
    }
    if (message.includes('conexion_de_otra_marca')) {
      return NextResponse.json({ error: 'Esa conexión no es de tu negocio.' }, { status: 403 })
    }

    console.error('[Conexiones] camino falló:', message)
    return NextResponse.json({ error: 'No se pudo guardar el camino' }, { status: 500 })
  }
}
