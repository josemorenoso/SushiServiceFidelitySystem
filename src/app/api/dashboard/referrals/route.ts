import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireTenantId } from '@/lib/tenant'
import { exigirAlcanceDeMarca } from '@/lib/alcance-de-marca'
import { logDbFailure } from '@/lib/db-failure'
import { ajustesAFilas, validarAjustesDeReferidos, type EntradaDeAjustes } from '@/lib/referidos'
import { getCampaignRewards } from '@/services/campaign-reward.service'
import { isPointsSystemEnabled } from '@/services/settings.service'
import { leerAjustesDeReferidos, numerosDeReferidos } from '@/services/referral.service'

export const dynamic = 'force-dynamic'

/**
 * Recompensas › Referidos (2026-10-15). Doc: docs/features/referral-program.md
 *
 * GET — los ajustes del programa y sus números (conteos, NUNCA pesos). Cualquier sesión de la
 *   marca: un administrador de sede los ve, como el catálogo. Un fallo de base es 500 —la pantalla
 *   dice que no pudo leer—, nunca «0 referidos» ni «apagado».
 *
 * PUT — guarda el programa ENTERO de una vez (las diez claves `referral_*`). Exige alcance de marca
 *   (`exigirAlcanceDeMarca()`): el programa es de la marca. Valida que cada premio elegido esté en
 *   el catálogo ACTIVO de ESTA marca —un id de otra marca es un 400—, los rangos, y que encender
 *   traiga un premio para quien invita. Es el ÚNICO escritor de esas claves: `PUT
 *   /api/dashboard/settings` las rechaza (`src/lib/settings-keys.ts`, `CLAVES_DE_REFERIDOS`).
 */

const SOLO_LA_MARCA = 'Los referidos son de la marca: solo un super usuario puede cambiarlos.'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const tenantId = await requireTenantId()
    const [ajustes, numeros, puntosEncendidos] = await Promise.all([
      leerAjustesDeReferidos(tenantId),
      numerosDeReferidos(tenantId),
      isPointsSystemEnabled(tenantId),
    ])
    return NextResponse.json({ ajustes, numeros, puntos_encendidos: puntosEncendidos })
  } catch (err) {
    console.error('[Referidos] Error leyendo el panel:', err)
    return NextResponse.json(
      { error: 'No pudimos leer los referidos de tu marca. Recarga la página; si sigue igual, avísanos.' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  const guardia = await exigirAlcanceDeMarca(request, SOLO_LA_MARCA)
  if (!guardia.ok) return guardia.res
  const tenantId = guardia.tenantId

  const entrada = (await request.json().catch(() => null)) as EntradaDeAjustes | null
  if (!entrada || typeof entrada !== 'object') {
    return NextResponse.json({ error: 'Faltan los ajustes.' }, { status: 400 })
  }

  try {
    // Solo los ACTIVOS de ESTA marca: es la lista de lo que un selector puede guardar.
    const catalogo = await getCampaignRewards(tenantId, true)
    const v = validarAjustesDeReferidos(entrada, new Set(catalogo.map((r) => r.id)))
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const ahora = new Date().toISOString()
    const filas = Object.entries(ajustesAFilas(v.ajustes)).map(([key, value]) => ({
      key,
      value,
      tenant_id: tenantId, // SIEMPRE explícito (DEFAULT puente de la 00028)
      updated_at: ahora,
    }))
    const { error } = await getServiceClient().from('admin_settings').upsert(filas, { onConflict: 'key,tenant_id' })
    if (error) {
      logDbFailure({ scope: 'Referidos', reason: 'settings_write_error', error, context: { tenant_id: tenantId } })
      return NextResponse.json({ error: 'No pudimos guardar. Intenta de nuevo en un momento.' }, { status: 500 })
    }
    return NextResponse.json({ ajustes: v.ajustes })
  } catch (err) {
    console.error('[Referidos] Error guardando el programa:', err)
    return NextResponse.json({ error: 'No pudimos guardar. Intenta de nuevo en un momento.' }, { status: 500 })
  }
}
