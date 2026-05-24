import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const BUCKET_ID = 'event-media'

// Límites por tipo (validados aquí, no en Storage)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024     // 5 MB
const MAX_VIDEO_BYTES = 16 * 1024 * 1024    // 16 MB

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png'])
const ALLOWED_VIDEO_MIMES = new Set(['video/mp4'])

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

function sanitizeFilename(name: string): string {
  // Quita caracteres peligrosos en paths y deja solo alfanuméricos, ., -, _
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  return base.length > 0 ? base : `file_${Date.now()}`
}

function extensionFor(mime: string): string {
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/png') return '.png'
  if (mime === 'video/mp4') return '.mp4'
  return ''
}

/**
 * POST /api/dashboard/calendar/media-upload
 *
 * Recibe multipart/form-data con:
 *   - `file`: el archivo (image/jpeg, image/png o video/mp4)
 *   - `event_id` (opcional): si el evento ya existe, el path es event-media/{event_id}/...
 *                            si no, el path va a event-media/_temp/{uuid}/...
 *
 * Devuelve:
 *   { url, media_type, path, bytes }
 *
 * Notas:
 *   - El bucket es público (lectura anónima), necesario para que servicios externos
 *     puedan descargar el asset directamente desde la URL retornada.
 *   - NO inserta nada en restaurant_events. El admin debe luego llamar a POST/PATCH
 *     /api/dashboard/calendar/events con `media_url` y `media_type` del response.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    const eventIdRaw = formData.get('event_id')
    const eventId = typeof eventIdRaw === 'string' && eventIdRaw.length > 0 ? eventIdRaw : null

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Campo `file` requerido (multipart/form-data)' },
        { status: 400 }
      )
    }

    // Determinar tipo
    const mime = file.type
    let mediaType: 'image' | 'video'
    let maxBytes: number
    if (ALLOWED_IMAGE_MIMES.has(mime)) {
      mediaType = 'image'
      maxBytes = MAX_IMAGE_BYTES
    } else if (ALLOWED_VIDEO_MIMES.has(mime)) {
      mediaType = 'video'
      maxBytes = MAX_VIDEO_BYTES
    } else {
      return NextResponse.json(
        {
          error: `Tipo no soportado: ${mime || '(desconocido)'}. Permitidos: image/jpeg, image/png, video/mp4`,
        },
        { status: 415 }
      )
    }

    if (file.size > maxBytes) {
      return NextResponse.json(
        {
          error: `Archivo excede el límite (${(maxBytes / 1024 / 1024).toFixed(0)} MB para ${mediaType}). Tamaño recibido: ${(file.size / 1024 / 1024).toFixed(2)} MB`,
        },
        { status: 413 }
      )
    }

    // Construir path final
    const folder = eventId ?? `_temp/${crypto.randomUUID()}`
    const safeName = sanitizeFilename(file.name || `upload${extensionFor(mime)}`)
    const path = `${folder}/${Date.now()}_${safeName}`

    // Convertir a buffer para Supabase Storage
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const db = getServiceClient()
    const { error: uploadError } = await db.storage
      .from(BUCKET_ID)
      .upload(path, buffer, {
        contentType: mime,
        upsert: false,
        cacheControl: '3600',
      })

    if (uploadError) {
      console.error('[Media Upload] Error subiendo a Storage:', uploadError)
      return NextResponse.json(
        { error: `Error subiendo archivo: ${uploadError.message}` },
        { status: 500 }
      )
    }

    const { data: publicData } = db.storage.from(BUCKET_ID).getPublicUrl(path)

    return NextResponse.json({
      url: publicData.publicUrl,
      media_type: mediaType,
      path,
      bytes: file.size,
    }, { status: 201 })
  } catch (error) {
    console.error('[Media Upload]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/dashboard/calendar/media-upload?path=...
 * Borra un asset específico del bucket. Útil para limpiar uploads que el admin
 * descartó antes de asociarlos a un evento.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const path = searchParams.get('path')
    if (!path) {
      return NextResponse.json({ error: '`path` requerido' }, { status: 400 })
    }

    // Restringir a paths dentro del bucket (no permitir traversal)
    if (path.includes('..') || path.startsWith('/')) {
      return NextResponse.json({ error: 'path inválido' }, { status: 400 })
    }

    const db = getServiceClient()
    const { error } = await db.storage.from(BUCKET_ID).remove([path])
    if (error) {
      return NextResponse.json(
        { error: `Error borrando: ${error.message}` },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Media Upload DELETE]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}
