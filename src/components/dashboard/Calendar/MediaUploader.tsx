'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, X, ImageIcon, Video as VideoIcon, Loader2 } from 'lucide-react'

interface MediaUploaderProps {
  value: { url: string; type: 'image' | 'video'; path?: string } | null
  onChange: (next: { url: string; type: 'image' | 'video'; path: string } | null) => void
  eventId?: string | null
  disabled?: boolean
}

const ALLOWED_MIMES: Record<string, 'image' | 'video'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'video/mp4': 'video',
}

// La imagen admite hasta 30 MB de entrada: el servidor la comprime a JPEG ≤5MB
// (límite WhatsApp) automáticamente. El video no se comprime server-side.
const MAX_BYTES = {
  image: 30 * 1024 * 1024,
  video: 16 * 1024 * 1024,
}

export function MediaUploader({ value, onChange, eventId = null, disabled }: MediaUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function uploadFile(file: File) {
    setError(null)
    const mediaType = ALLOWED_MIMES[file.type]
    if (!mediaType) {
      setError(`Tipo no soportado: ${file.type || '(desconocido)'}. Usa JPG, PNG o MP4.`)
      return
    }
    if (file.size > MAX_BYTES[mediaType]) {
      const max = MAX_BYTES[mediaType] / 1024 / 1024
      setError(`Archivo excede ${max} MB`)
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (eventId) formData.append('event_id', eventId)

      const res = await fetch('/api/dashboard/calendar/media-upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Error subiendo archivo')
        return
      }
      onChange({ url: data.url, type: data.media_type, path: data.path })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setUploading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    // Reset input para permitir re-subir el mismo archivo
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (disabled || uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  async function handleRemove() {
    if (!value) return
    onChange(null)
    // Best-effort: borrar el asset del bucket si tenemos path
    if (value.path) {
      try {
        await fetch(`/api/dashboard/calendar/media-upload?path=${encodeURIComponent(value.path)}`, {
          method: 'DELETE',
        })
      } catch {
        // best effort
      }
    }
  }

  if (value) {
    return (
      <div className="space-y-2">
        <div className="relative rounded-lg border bg-muted/30 overflow-hidden">
          {value.type === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.url}
              alt="Media del evento"
              className="block w-full max-h-72 object-contain"
            />
          ) : (
            <video
              src={value.url}
              controls
              className="block w-full max-h-72"
            />
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2 gap-1.5"
            onClick={handleRemove}
            disabled={disabled || uploading}
          >
            <X className="h-3.5 w-3.5" />
            Quitar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          {value.type === 'image' ? (
            <ImageIcon className="h-3.5 w-3.5" />
          ) : (
            <VideoIcon className="h-3.5 w-3.5" />
          )}
          {value.type === 'image' ? 'Imagen' : 'Video'} cargada
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`
          flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors
          ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'}
          ${disabled || uploading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/30'}
        `}
      >
        {uploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Subiendo…</p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Arrastra o haz click para subir</p>
            <p className="text-xs text-muted-foreground">
              JPG o PNG (se optimiza automáticamente) · MP4 (máx 16 MB)
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,video/mp4"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled || uploading}
        />
      </div>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}
