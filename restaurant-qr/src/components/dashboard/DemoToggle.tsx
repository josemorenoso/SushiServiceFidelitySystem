'use client'

import { useDemo } from '@/contexts/DemoContext'
import { Button } from '@/components/ui/button'
import { FlaskConical, X } from 'lucide-react'

export function DemoToggle() {
  const { isDemo, toggleDemo, demoError } = useDemo()

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={toggleDemo}
        variant={isDemo ? 'destructive' : 'outline'}
        size="sm"
        className="gap-2"
      >
        {isDemo ? <X className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
        {isDemo ? 'Salir Demo' : 'Modo Demo'}
      </Button>
      {isDemo && !demoError && (
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 animate-pulse">
          DEMOSTRACIÓN
        </span>
      )}
    </div>
  )
}
