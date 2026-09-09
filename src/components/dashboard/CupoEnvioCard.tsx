'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, Gauge, OctagonAlert } from 'lucide-react'
import { useLocationScope } from '@/contexts/LocationScopeContext'
import type { LineBudgetResponse } from '@/components/dashboard/conexiones/types'

/**
 * El cupo de envío de la línea, donde se manda: la pantalla de Campañas.
 *
 * **El problema que resuelve.** Meta limita cada línea a N destinatarios ÚNICOS por 24 h
 * rodantes, ese cupo es de la MARCA y lo comparten todas las sedes, y cuando se agota el
 * sistema falla CERRADO (00037): los mensajes dejan de salir **en silencio**, para todos.
 * Con doce locales sobre 250 destinatarios eso pasa a media mañana. Hasta hoy el número
 * solo se veía en `/dashboard/conexiones`, que además está detrás de `isTenantOwner()` y
 * con `owner_email` vacío en las cinco marcas vivas **solo la abre el super-admin**: el
 * cliente no tenía ninguna pantalla donde enterarse antes de quedarse mudo.
 *
 * **Lo que NO hace.** No cambia el modelo de cupo ni lo reparte por sede — eso es F9 y
 * choca con D6 (la línea es de la marca). No calcula nada por su cuenta: reusa
 * `/api/dashboard/line-budget` tal cual, que ya envuelve a `line_budget()`. Si algún día
 * cambia la contabilidad, cambia aquí solo porque cambió esa función.
 *
 * `enforced: false` NO es «sin datos»: es «Meta todavía no le fijó tope a esta línea», el
 * estado de los tenants Twilio anteriores a la 00037. Decirle «0 de 0» a quien envía sin
 * problema sería mentir, así que ahí solo se informa el consumo.
 *
 * Ref: docs/features/send-governance.md · docs/RUNBOOK-DEPLOY.md (subir el tope real)
 */

/** A partir de aquí se avisa. El punto es enterarse ANTES del cero, no en el cero. */
const UMBRAL_AVISO = 0.75

export function CupoEnvioCard() {
  const [budget, setBudget] = useState<LineBudgetResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const { view } = useLocationScope()

  useEffect(() => {
    let cancelled = false
    // Sin `location_id` a propósito: el cupo es de la MARCA (D6). Filtrarlo por la sede que
    // el encabezado tenga puesta daría un número que no existe en ninguna parte.
    fetch('/api/dashboard/line-budget', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json: LineBudgetResponse) => { if (!cancelled) setBudget(json) })
      .catch(() => { if (!cancelled) setBudget(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    )
  }

  // Falla blando: si no se pudo calcular, esta tarjeta se calla. Es un aviso, no un freno —
  // el freno de verdad vive en `reserve_send_slot()` y no depende de que esto se dibuje.
  if (!budget || !budget.available) return null

  const used = budget.used24h ?? 0
  const limit = budget.limit ?? null
  const enforced = Boolean(budget.enforced) && limit !== null && limit > 0
  const campaignAvailable = budget.campaignAvailable ?? null
  const multiSede = view?.multiSede ?? false

  const compartido = multiSede
    ? 'Este cupo es de la marca: lo gastan TODAS tus sedes juntas, y también los mensajes automáticos.'
    : 'El cupo lo gastan por igual las campañas y los mensajes automáticos.'

  // ─── Sin tope conocido: se informa, no se alarma ───
  if (!enforced) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          <Gauge className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {used} {used === 1 ? 'persona distinta' : 'personas distintas'} en las últimas 24 h
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Meta todavía no le fijó un tope a esta línea, así que no se bloquea ningún envío.
              {' '}{compartido}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const total = limit as number
  const pct = Math.min(100, Math.round((used / total) * 100))
  const restanTransaccional = budget.transactionalAvailable ?? Math.max(total - used, 0)
  const agotado = campaignAvailable !== null ? campaignAvailable <= 0 : used >= total
  const cerca = !agotado && used / total >= UMBRAL_AVISO
  const congelada = budget.lineStatus === 'frozen'

  const tono = agotado || congelada
    ? { borde: 'border-red-300', fondo: 'bg-red-50', texto: 'text-red-900', suave: 'text-red-800', barra: 'bg-red-500', icono: 'text-red-600' }
    : cerca
      ? { borde: 'border-amber-300', fondo: 'bg-amber-50', texto: 'text-amber-900', suave: 'text-amber-800', barra: 'bg-amber-500', icono: 'text-amber-600' }
      : { borde: '', fondo: '', texto: '', suave: 'text-muted-foreground', barra: 'bg-emerald-500', icono: 'text-muted-foreground' }

  const Icono = agotado || congelada ? OctagonAlert : cerca ? AlertTriangle : Gauge

  const titular = congelada
    ? 'La línea está congelada por Meta: las campañas no salen'
    : agotado
      ? 'Se agotó el cupo de campañas de hoy'
      : cerca
        ? `Queda poco cupo: ${used} de ${total} en las últimas 24 h`
        : `Cupo de envío: ${used} de ${total} personas distintas en las últimas 24 h`

  const explicacion = congelada
    ? 'Los mensajes automáticos siguen saliendo. Las campañas se reanudan cuando Meta libere la línea.'
    : agotado
      ? `Lo que mandes ahora se encola y sale solo cuando la ventana de 24 h libere cupo. Quedan ${restanTransaccional} para mensajes automáticos.`
      : `Quedan ${campaignAvailable ?? Math.max(total - used, 0)} destinatarios para campañas${
          cerca ? '. Al llegar a cero los envíos se detienen solos, sin avisar en el momento.' : '.'
        }`

  return (
    <Card className={`${tono.borde} ${tono.fondo}`}>
      <CardContent className="flex items-start gap-3 p-4">
        <Icono className={`mt-0.5 h-5 w-5 shrink-0 ${tono.icono}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${tono.texto}`}>{titular}</p>

          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/10"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Cupo de la línea consumido en las últimas 24 horas"
          >
            <div className={`h-full rounded-full transition-all duration-500 ${tono.barra}`} style={{ width: `${pct}%` }} />
          </div>

          <p className={`mt-1.5 text-xs ${tono.suave}`}>
            {explicacion} {compartido}
          </p>

          {typeof budget.queueDepth === 'number' && budget.queueDepth > 0 && (
            <p className={`mt-0.5 text-xs ${tono.suave}`}>
              {budget.queueDepth} mensaje(s) esperando en la cola.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
