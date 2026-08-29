import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const BUCKET_ID = 'event-media'

// Límites ANTES de comprimir (la compresión siempre queda bajo 5MB)
const MAX_IMAGE_INPUT_BYTES = 30 * 1024 * 1024   // 30 MB input max (sharp comprimirá)
const MAX_VIDEO_BYTES = 16 * 1024 * 1024          // 16 MB (WhatsApp limit, sin compresión server-side)

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
    if (ALLOWED_IMAGE_MIMES.has(mime)) {
      mediaType = 'image'
    } else if (ALLOWED_VIDEO_MIMES.has(mime)) {
      mediaType = 'video'
    } else {
      return NextResponse.json(
        {
          error: `Tipo no soportado: ${mime || '(desconocido)'}. Permitidos: image/jpeg, image/png, video/mp4`,
        },
        { status: 415 }
      )
    }

    if (mediaType === 'video' && file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        {
          error: `Video excede el límite de ${(MAX_VIDEO_BYTES / 1024 / 1024).toFixed(0)} MB. Tamaño recibido: ${(file.size / 1024 / 1024).toFixed(2)} MB. Por favor comprime el video antes de subir.`,
        },
        { status: 413 }
      )
    }

    if (mediaType === 'image' && file.size > MAX_IMAGE_INPUT_BYTES) {
      return NextResponse.json(
        { error: `Imagen excede el límite de ${(MAX_IMAGE_INPUT_BYTES / 1024 / 1024).toFixed(0)} MB de entrada.` },
        { status: 413 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()

    // Auto-compresión de imágenes: resize a max 1920px, JPEG 80%
    // Siempre se almacena como JPEG para consistencia con WhatsApp
    let uploadBuffer: Uint8Array
    let uploadMime: string
    let uploadExt: string

    if (mediaType === 'image') {
      const compressed = await sharp(Buffer.from(arrayBuffer))
        .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer()
      uploadBuffer = new Uint8Array(compressed)
      uploadMime = 'image/jpeg'
      uploadExt = '.jpg'
    } else {
      uploadBuffer = new Uint8Array(arrayBuffer)
      uploadMime = mime
      uploadExt = '.mp4'
    }

    // Construir path final PLANO, sin subcarpetas (extensión forzada según tipo).
    //
    // El path es exactamente el valor que viaja en `{{6}}` de la plantilla
    // `twilio/media` aprobada, sustituido por Twilio DENTRO de una URL ya formada
    // (`<bucket>/{{6}}`). Una barra ahí depende de que Twilio no escape el valor al
    // sustituirlo — y el sample con el que Meta aprobó la plantilla es plano. Un path
    // plano hace el envío determinista en vez de depender de ese detalle.
    // La trazabilidad al evento se conserva en el propio nombre del archivo.
    const scope = eventId ? sanitizeFilename(eventId) : `tmp_${crypto.randomUUID()}`
    const baseNameRaw = (file.name || `upload${uploadExt}`).replace(/\.[^.]+$/, '')
    const safeName = sanitizeFilename(baseNameRaw)
    const path = `${scope}_${Date.now()}_${safeName}${uploadExt}`

    const db = getServiceClient()
    const { error: uploadError } = await db.storage
      .from(BUCKET_ID)
      .upload(path, uploadBuffer, {
        contentType: uploadMime,
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
      bytes: uploadBuffer.byteLength,
      original_bytes: file.size,
      compressed: mediaType === 'image' && uploadBuffer.byteLength < file.size,
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

    const path = request.nextUrl.searchParams.get('path')
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
