'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Crosshair } from 'lucide-react'
import { ImportedContactsUploader } from '@/components/dashboard/ImportedContactsUploader'
import { ImportedContactsHistory } from '@/components/dashboard/ImportedContactsHistory'
import { ImportedContactsProgress } from '@/components/dashboard/ImportedContactsProgress'
import { ImportedContactsTemplate } from '@/components/dashboard/ImportedContactsTemplate'

export default function ImportedContactsPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab, setTab] = useState('curso')

  return (
    <div className="space-y-6">
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
