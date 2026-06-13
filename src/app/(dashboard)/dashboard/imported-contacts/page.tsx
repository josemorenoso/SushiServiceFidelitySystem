'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Crosshair } from 'lucide-react'
import { ImportedContactsUploader } from '@/components/dashboard/ImportedContactsUploader'
import { ImportedContactsHistory } from '@/components/dashboard/ImportedContactsHistory'

export default function ImportedContactsPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [tab, setTab] = useState('nueva')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Crosshair className="h-6 w-6" />
          Golden Bullet
        </h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-3 max-w-2xl">
        Importa bases de contactos externas y envía UN solo mensaje de promo directa. Los contactos
        no son clientes hasta que vuelven y se registran — ahí se mide el ROI automáticamente.
      </p>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="nueva">Nueva campaña</TabsTrigger>
          <TabsTrigger value="historial">Historial & ROI</TabsTrigger>
        </TabsList>

        <TabsContent value="nueva" className="mt-4">
          <ImportedContactsUploader
            onSent={() => { setRefreshKey((k) => k + 1); setTab('historial') }}
          />
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
