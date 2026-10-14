'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ArrowLeft, Megaphone, MessageSquareText } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CicloPantalla } from '@/components/dashboard/cycle/CicloPantalla'
import { HistorialDeCampanas } from '@/components/dashboard/cycle/HistorialDeCampanas'
import { CupoEnvioCard } from '@/components/dashboard/CupoEnvioCard'
import { ManualCampaigns } from '@/components/dashboard/ManualCampaigns'
import { SegmentRadar } from '@/components/dashboard/SegmentRadar'
import { WalletCard } from '@/components/dashboard/WalletCard'
import { RUTAS_DEL_CICLO, vistaDeUrl, type VistaDeCampanas } from '@/lib/cycle-screen'

/**
 * Ciclo y campañas (fase 2 del ciclo de recuperación, parte B, 2026-10-14).
 *
 * Dos pestañas: **Ciclo** (la que abre) e **Historial**. «Mensaje libre (avanzado)» NO es una
 * pestaña: es un enlace aquí arriba que lleva al asistente manual de siempre (`ManualCampaigns`)
 * y, como ese es el lugar desde donde se dispara un envío a mano, ahí viven también el cupo de
 * la línea y el radar de segmentos (la parte C lleva el cupo al creador de «Mandar un regalo»).
 *
 * Desaparecen con esta pantalla (spec §6.7, §7.6): las tarjetas de «Automáticas» (cumpleaños y
 * reactivación, con su «Ejecutar ahora» y la insignia «Activa» que no miraba la plantilla
 * insistente), la tira «Ciclo de recuperación del cliente» y las burbujas de riesgo
 * (`AtRiskBubbles`): las cajas las contienen, con UNA sola escala de días —la del motor—.
 *
 * La vista inicial se lee de `?vista=` o del viejo `?tab=` con `window.location`, NO con
 * `useSearchParams()`: en esta versión de Next fuerza el CSR bailout (ver la trampa en
 * CLAUDE.md). Se lee con `useSyncExternalStore`, igual que Recompensas. Los enlaces viejos
 * siguen sirviendo: `?tab=manuales` abre el mensaje libre y `?tab=premios` lleva a Recompensas.
 *
 * Parte C (2026-10-14): `?vista=fecha` abre el ciclo POR FECHA (el calendario, spec §6.4), dentro
 * de la misma pestaña «Ciclo»; `/dashboard/calendar` redirige acá. El creador («Mandar un
 * regalo», «Crear un evento») vive en `CicloPantalla`; desde él, «Mensaje libre (avanzado)»
 * trae al asistente manual de siempre.
 */

const noSubscribe = () => () => {}
const leerBusqueda = () => {
  try {
    return window.location.search
  } catch {
    return ''
  }
}

export default function CampaignsPage() {
  const busqueda = useSyncExternalStore(noSubscribe, leerBusqueda, () => '')
  const [elegida, setElegida] = useState<VistaDeCampanas | null>(null)

  // `?tab=premios` era la pestaña «Premios», que desde 2026-10-13 vive en Recompensas (S-1).
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab === 'premios') window.location.replace('/dashboard/rewards?tab=premios')
  }, [])

  const vista = elegida ?? vistaDeUrl(busqueda)

  /** Cambia de vista y deja la URL al día (recargar abre donde estaba), sin navegar. */
  const irA = (v: VistaDeCampanas) => {
    setElegida(v)
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('tab')
      if (v === 'ciclo') url.searchParams.delete('vista')
      else url.searchParams.set('vista', v)
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`)
    } catch {
      // Sin historial: la vista cambia igual, la URL no.
    }
  }

  if (vista === 'libre') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageSquareText className="h-6 w-6" />
            Mensaje libre
          </h1>
          <Button type="button" variant="outline" size="sm" onClick={() => irA('ciclo')}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Volver al ciclo
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          La salida de emergencia: un mensaje a la medida, con filtros. Para lo de siempre usa el ciclo; esto cuenta
          igual para los topes de cada cliente.
        </p>

        {/* Encima del asistente a propósito: el cupo se ve desde donde se dispara un envío. Es de la
            MARCA, así que no lo filtra el selector de sede del encabezado. */}
        <CupoEnvioCard />
        <SegmentRadar />
        <ManualCampaigns />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Megaphone className="h-6 w-6" />
          Ciclo y campañas
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => irA('libre')}>
            <MessageSquareText className="size-3.5" aria-hidden="true" />
            Mensaje libre (avanzado)
          </Button>
          <Link href={RUTAS_DEL_CICLO.plantillas} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Plantillas
          </Link>
        </div>
      </div>

      {/* «Por fecha» es el ciclo girado: la misma pestaña «Ciclo». */}
      <Tabs value={vista === 'fecha' ? 'ciclo' : vista} onValueChange={(v) => irA(v as VistaDeCampanas)}>
        <TabsList>
          <TabsTrigger value="ciclo">Ciclo</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="ciclo" className="space-y-5 pt-4">
          <CicloPantalla
            vista={vista === 'fecha' ? 'fecha' : 'etapa'}
            onVista={(v) => irA(v === 'fecha' ? 'fecha' : 'ciclo')}
            onMensajeLibre={() => irA('libre')}
          />
          <WalletCard />
        </TabsContent>

        <TabsContent value="historial" className="pt-4">
          <HistorialDeCampanas />
        </TabsContent>
      </Tabs>
    </div>
  )
}
