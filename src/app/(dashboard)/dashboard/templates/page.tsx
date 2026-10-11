'use client'

/**
 * Plantillas — UNA pantalla para los dos proveedores (2026-10-11, «un solo libro»).
 *
 * Dos pestañas:
 *   · **Mensajes automáticos** — `TemplateCatalogEditor`: un renglón por mensaje del
 *     catálogo, con su estado real y su botón, sea la marca Twilio o Zernio. Reemplaza a
 *     la pantalla Twilio de antes, a su tarjeta «Del set estándar te faltan» y a
 *     Ajustes › Plantillas WhatsApp (los 15 desplegables).
 *   · **Biblioteca para campañas** — `TemplateLibrary`: las plantillas puntuales que el
 *     dueño crea para una campaña, reutilizables, en los dos proveedores (decisiones B4 y
 *     B5). Campañas → Mensaje libre las lista.
 *
 * Hasta esa fecha la pantalla se bifurcaba: `GET …/catalog` contestaba 409 a un negocio
 * Twilio y caía al gestor Twilio. Ahora esa ruta contesta a los dos con la misma forma.
 *
 * ⚠️ Ni un `useSearchParams()`: en Next.js 16 fuerza el CSR bailout del grupo `(dashboard)`.
 * La pestaña inicial se lee de `?tab=` con `window.location` vía `useSyncExternalStore`,
 * igual que Domicilios y Recompensas.
 *
 * Docs: docs/features/whatsapp-templates.md
 */

import { useState, useSyncExternalStore } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import TemplateCatalogEditor from '@/components/dashboard/templates/TemplateCatalogEditor'
import TemplateLibrary from '@/components/dashboard/templates/TemplateLibrary'

const TABS = new Set(['mensajes', 'biblioteca'])

const noSubscribe = () => () => {}
const leerTabDeUrl = () => {
  try {
    return new URLSearchParams(window.location.search).get('tab')
  } catch {
    return null
  }
}

export default function TemplatesPage() {
  // La URL no cambia mientras la página vive: no hay a qué suscribirse.
  const tabDeUrl = useSyncExternalStore(noSubscribe, leerTabDeUrl, () => null)
  const [tabElegida, setTab] = useState<string | null>(null)
  const tab = tabElegida ?? (tabDeUrl && TABS.has(tabDeUrl) ? tabDeUrl : 'mensajes')

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="mensajes">Mensajes automáticos</TabsTrigger>
        <TabsTrigger value="biblioteca">Biblioteca para campañas</TabsTrigger>
      </TabsList>

      <TabsContent value="mensajes" className="mt-4">
        <TemplateCatalogEditor />
      </TabsContent>

      <TabsContent value="biblioteca" className="mt-4">
        <TemplateLibrary />
      </TabsContent>
    </Tabs>
  )
}
