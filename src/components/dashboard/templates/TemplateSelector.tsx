'use client'

/**
 * El desplegable «elige una plantilla aprobada para este mensaje».
 *
 * Vivía dentro de Ajustes › Plantillas WhatsApp (`dashboard/settings/page.tsx`), que tenía
 * 15 de estos y un «Guardar». El 2026-10-11 esa sección se fue a Plantillas —una sola
 * pantalla para crear, mandar a Meta y elegir— y el componente vino tal cual: mismo
 * aspecto, mismas pistas. Solo lo usan las marcas Twilio: en Zernio el puntero lo mueve
 * `promoteVersion()` al aprobarse, nunca una persona.
 */

export interface TemplateSelectorOption {
  sid: string
  friendly_name: string
  body: string
}

interface TemplateSelectorProps {
  label: string
  icon?: React.ReactNode
  hint: string
  value: string
  onChange: (sid: string) => void
  templates: TemplateSelectorOption[]
  disabled?: boolean
}

export default function TemplateSelector({ label, icon, hint, value, onChange, templates, disabled }: TemplateSelectorProps) {
  const selected = templates.find((t) => t.sid === value)
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>
        {icon}
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
      >
        <option value="">— Sin plantilla (NO se enviará mensaje) —</option>
        {/* Un puntero a algo que ya no está aprobado sigue a la vista: si no, el desplegable
            mostraría «Sin plantilla» y guardar lo borraría sin que nadie lo pidiera. */}
        {value && !selected && <option value={value}>{value} (no está entre las aprobadas)</option>}
        {templates.map((t) => (
          <option key={t.sid} value={t.sid}>{t.friendly_name}</option>
        ))}
      </select>
      <p className="text-[10px]" style={{ color: '#b0b0b0' }}>{hint}</p>
      {selected && (
        <p className="text-xs italic" style={{ color: '#9ca3af' }}>
          {selected.body?.slice(0, 120)}{(selected.body?.length ?? 0) > 120 ? '...' : ''}
        </p>
      )}
    </div>
  )
}
