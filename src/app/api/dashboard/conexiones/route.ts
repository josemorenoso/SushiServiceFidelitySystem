import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTenantIdFromJwt } from '@/lib/tenant'
import { isTenantOwner, ownerDenialMessage } from '@/lib/tenant-owner'
import { getConnectionsView, getPrimaryConnection } from '@/services/connection.service'

/**
 * GET /api/dashboard/conexiones — el estado de todas las tarjetas del apartado.
 *
 * ⚠️ **Devuelve un OBJETO PLANO, nunca una lista.** Es la lección de
 * `/api/dashboard/location`, cuyo contrato es un objeto: el día que alguien le devolvió
 * la lista de sedes, `dashboard/settings/page.tsx` se rompió en silencio. Las tarjetas
 * futuras (Google, Meta) entran como CLAVES nuevas de este objeto, no como elementos.
 *
 * PERMISOS (§5 del diseño, decisión del dueño 2026-09-06)
 * ──────────────────────────────────────────────────────
 * Este GET lo puede llamar **cualquier admin del tenant**: ver por qué número sale su
 * WhatsApp es la mitad del valor del apartado, y el encargado que atiende el día a día lo
 * necesita justo cuando algo falla. Lo que CAMBIA estado exige ser el dueño, y eso lo
 * cuida cada ruta de acción — acá el bloque `permissions` solo le dice a la pantalla qué
 * puede pintar habilitado. **No es la autorización**: el servidor vuelve a comprobarlo en
 * cada acción, porque un `canAct: false` en un JSON no frena a nadie.
 *
 * ÁMBITO MARCA: no lee `LocationScope` ni acepta `location_id`. Ver connection.service.ts.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // El tenant sale de la SESIÓN, jamás de un parámetro. Si viniera del cliente, un admin
  // de la marca A pediría el número de la marca B con un id copiado.
  const tenantId = await getTenantIdFromJwt()
  if (!tenantId) {
    // Un super-admin puede no tener tenant en el JWT. Se degrada limpio, como
    // /api/dashboard/line-budget, en vez de reventar la pantalla entera.
    return NextResponse.json({ available: false })
  }

  try {
    const [view, owner, connection] = await Promise.all([
      getConnectionsView(tenantId),
      isTenantOwner(tenantId),
      // C2: el estado del ALTA. `null` = todavía no empezó, y la tarjeta muestra los tres
      // caminos. Falla BLANDO: si la 00054 no está aplicada, PostgREST devuelve 42703 y
      // esta pantalla respondería 403 —que parece permisos y no lo es—; degradar a `null`
      // deja viva la mitad de C1, que no necesita la tabla para nada.
      getPrimaryConnection(tenantId).catch((err) => {
        console.error('[Conexiones] estado del alta no disponible:', err instanceof Error ? err.message : err)
        return null
      }),
    ])

    return NextResponse.json({
      available: true,
      permissions: {
        canAct: owner.canAct,
        isSuperAdmin: owner.isSuperAdmin,
        isOwner: owner.isOwner,
        ownerRegistered: owner.ownerRegistered,
        denialMessage: owner.canAct ? null : ownerDenialMessage(owner.reason),
      },
      whatsapp: view.whatsapp,
      connection,
      // Las dos del norte de ESTADO.md §3. Se declaran acá para que la pantalla no las
      // invente: el día que existan, cambia el `available` y nada más.
      google: { available: false },
      meta: { available: false },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Conexiones] GET falló:', message)
    return NextResponse.json({ error: 'No se pudo leer el estado de las conexiones' }, { status: 500 })
  }
}
