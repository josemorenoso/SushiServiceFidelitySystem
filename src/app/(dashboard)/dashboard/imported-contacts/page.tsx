'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Crosshair, Loader2, Power } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { ImportedContactsUploader } from '@/components/dashboard/ImportedContactsUploader'
import { ImportedContactsHistory } from '@/components/dashboard/ImportedContactsHistory'
import { ImportedContactsProgress } from '@/components/dashboard/ImportedContactsProgress'
import { ImportedContactsTemplate } from '@/components/dashboard/ImportedContactsTemplate'

/**
 * El interruptor del módulo: `admin_settings.golden_bullet_enabled`.
 *
 * Nace en `false` (semilla de la 00023) y las tres rutas del módulo —validar,
 * confirmar, crear la plantilla— responden 403 mientras siga así. Hasta el
 * 2026-09-11 no había NINGÚN sitio del panel donde encenderlo: el 403 decía
 * «actívalo en Ajustes» y Ajustes no tenía la casilla, así que el CSV
 * «no cargaba» y el toast que lo explicaba ni siquiera se veía (esta página
 * no montaba `<Toaster>`). El botón vive acá, al lado de lo que apaga.
 */
type EstadoFlag = 'cargando' | 'apagado' | 'encendido'

export default function ImportedContactsPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab, setTab] = useState('curso')
  const [flag, setFlag] = useState<EstadoFlag>('cargando')
  const [encendiendo, setEncendiendo] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard/settings')
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: Record<string, string>) => setFlag(d.golden_bullet_enabled === 'true' ? 'encendido' : 'apagado'))
      .catch(() => setFlag('apagado'))
  }, [])

  const encender = useCallback(async () => {
    setEncendiendo(true)
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'golden_bullet_enabled', value: 'true' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.message || data.error || 'No se pudo encender Golden Bullet')
        return
      }
      setFlag('encendido')
      toast.success('Golden Bullet encendido para esta marca')
    } catch {
      toast.error('Error de conexión')
    } finally {
      setEncendiendo(false)
    }
  }, [])

  return (
    <div className="space-y-6">
      <Toaster position="top-center" richColors />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Crosshair className="h-6 w-6" />
          Golden Bullet
        </h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-3 max-w-2xl">
        Despierta bases de contactos externas preguntándoles si quieren estar, a un ritmo que la
        línea aguante. No son clientes hasta que vuelven y se registran — ahí se mide el ROI solo.
      </p>

      {flag === 'apagado' && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <strong>Golden Bullet está apagado en esta marca.</strong> Mientras siga así no se valida
            ningún CSV, no se programa ningún envío y no se puede crear la plantilla.
          </p>
          <Button onClick={encender} disabled={encendiendo} className="shrink-0 gap-2">
            {encendiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
            Encender Golden Bullet
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {/* «En curso» va primero a propósito: con un goteo de semanas, lo que
              uno abre el panel a mirar es qué salió hoy, no a cargar otro CSV. */}
          <TabsTrigger value="curso">En curso</TabsTrigger>
          <TabsTrigger value="nueva">Nueva campaña</TabsTrigger>
          <TabsTrigger value="plantilla">Plantilla</TabsTrigger>
          <TabsTrigger value="historial">Historial &amp; ROI</TabsTrigger>
        </TabsList>

        <TabsContent value="curso" className="mt-4">
          <ImportedContactsProgress refreshKey={refreshKey} />
        </TabsContent>

        <TabsContent value="nueva" className="mt-4">
          <ImportedContactsUploader
            apagado={flag !== 'encendido'}
            onSent={() => { setRefreshKey((k) => k + 1); setTab('curso') }}
          />
        </TabsContent>

        <TabsContent value="plantilla" className="mt-4">
          <ImportedContactsTemplate />
        </TabsContent>

        <TabsContent value="historial" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Lotes enviados</CardTitle>
            </CardHeader>
            <CardContent>
              <ImportedContactsHistory refreshKey={refreshKey} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
