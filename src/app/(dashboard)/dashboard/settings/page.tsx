'use client'

import { useEffect, useState } from 'react'
import { Settings, DollarSign, Save, Loader2, CheckCircle } from 'lucide-react'

export default function SettingsPage() {
  const [avgTicket, setAvgTicket] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.avg_ticket) setAvgTicket(data.avg_ticket)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'avg_ticket', value: avgTicket }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6" strokeWidth={1.5} style={{ color: '#6b7280' }} />
        <h1
          className="font-playfair text-3xl font-bold"
          style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}
        >
          Ajustes
        </h1>
      </div>

      <div className="dashboard-card p-6 max-w-lg">
        <div className="flex items-center gap-3 mb-6">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'rgba(16, 185, 129, 0.15)' }}
          >
            <DollarSign className="h-5 w-5" strokeWidth={1.5} style={{ color: '#10b981' }} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1c1d' }}>
              Ticket Promedio
            </h2>
            <p className="text-xs" style={{ color: '#9ca3af' }}>
              Valor promedio de consumo por cliente (COP). Se usa para calcular el ROI estimado del sistema.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium"
              style={{ color: '#9ca3af' }}
            >
              $
            </span>
            <input
              type="number"
              value={avgTicket}
              onChange={(e) => setAvgTicket(e.target.value)}
              disabled={loading}
              placeholder="35000"
              className="input-premium w-full pl-7 pr-4 py-2.5 rounded-xl text-sm font-medium"
              style={{
                border: '1px solid rgba(226,190,192,0.35)',
                background: 'rgba(255,255,255,0.8)',
                color: '#1a1c1d',
              }}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: saved
                ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #FF4D6D 0%, #E63946 100%)',
              boxShadow: saved
                ? '0 4px 12px rgba(16, 185, 129, 0.25)'
                : '0 4px 12px rgba(230, 57, 70, 0.25)',
            }}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saved ? 'Guardado' : 'Guardar'}
          </button>
        </div>

        <p className="text-xs mt-4 italic" style={{ color: '#b0b0b0' }}>
          Ejemplo: si tu ticket promedio es $35,000 COP y el sistema reactivó 10 clientes,
          el ROI estimado del mes es $350,000 COP.
        </p>
      </div>
    </div>
  )
}
