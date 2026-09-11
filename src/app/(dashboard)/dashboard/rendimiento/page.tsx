import { Trophy } from 'lucide-react'
import { StaffActivityPanel } from '@/components/dashboard/StaffActivityPanel'

/**
 * Rendimiento del equipo — cómo va cada mesero y cada mesa: escaneos, clientes
 * nuevos vs frecuentes, premios entregados y mesas que más piden.
 * docs/features/staff-activity.md
 */
export default function RendimientoPage() {
  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Trophy className="h-6 w-6" />
        Rendimiento
      </h1>
      <StaffActivityPanel />
    </div>
  )
}
