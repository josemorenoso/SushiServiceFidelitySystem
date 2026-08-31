'use client'

/**
 * Plantillas — la pantalla se bifurca según el proveedor de mensajería del negocio.
 *
 *   Zernio → `TemplateCatalogEditor`: el catálogo estándar de 13 mensajes con
 *            estilo único y edición tipo documento (§12 de
 *            docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md).
 *   Twilio → `TwilioTemplateManager`: exactamente la pantalla anterior, sin un
 *            solo cambio. Decisión textual del dueño sobre los 4 tenants que ya
 *            operan en Twilio: "déjalos así, ni los toques".
 *
 * La bifurcación NO se decide en el cliente por comodidad: `GET
 * /api/dashboard/templates/catalog` responde 409 con el proveedor real cuando el
 * negocio no es Zernio. El servidor es quien manda; esto solo lee su respuesta.
 * El guardarraíl de verdad está en `template.service.ts`, donde ninguna ruta
 * puede saltárselo.
 *
 * Docs: docs/features/whatsapp-templates.md
 */

import { useEffect, useState } from 'react'
import TemplateCatalogEditor from '@/components/dashboard/templates/TemplateCatalogEditor'
import TwilioTemplateManager from '@/components/dashboard/templates/TwilioTemplateManager'

type Mode = 'loading' | 'catalog' | 'twilio'

export default function TemplatesPage() {
  const [mode, setMode] = useState<Mode>('loading')

  useEffect(() => {
    let cancelled = false

    const resolveProvider = async () => {
      try {
        const res = await fetch('/api/dashboard/templates/catalog')
        if (cancelled) return
        // 409 = el negocio no es Zernio. Cualquier otro fallo (401, 500, red) NO
        // debe dejar al dueño sin pantalla: el gestor Twilio es el que existía
        // antes y sabe mostrar sus propios errores.
        setMode(res.status === 409 || !res.ok ? 'twilio' : 'catalog')
      } catch {
        if (!cancelled) setMode('twilio')
      }
    }

    resolveProvider()
    return () => {
      cancelled = true
    }
  }, [])

  if (mode === 'loading') {
    return (
      <div className="space-y-3">
        <div className="h-8 w-64 rounded bg-muted animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  return mode === 'catalog' ? <TemplateCatalogEditor /> : <TwilioTemplateManager />
}
