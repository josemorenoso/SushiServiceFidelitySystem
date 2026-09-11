/**
 * POST /api/dashboard/imported-contacts/reply-image
 *
 * Las fotos de Golden Bullet: la que acompaña la respuesta al botón «sí» (la
 * del regalo; por defecto) y, con `uso=mensaje1` en el multipart, la que va
 * ARRIBA del mensaje 1 (se hornea en la plantilla al crearla). Sube un
 * JPEG/PNG, lo recomprime y devuelve la URL pública del bucket `brand-assets`
 * (00047). NO escribe `admin_settings`: eso lo hace el panel con un PUT a
 * `/api/dashboard/settings` (`golden_bullet_reply_si_image_url` o
 * `golden_bullet_template_image_url`), igual que con el resto de los textos.
 *
 * El path lleva el `tenant_id` por delante (`brand-assets/<tenant_id>/…`) y ese
 * `tenant_id` sale de `requireTenantId()`, nunca del cuerpo: es lo que hace
 * verificable que la marca A no puede escribir sobre la foto de la marca B.
 * Patrón calcado de `brand-logo/route.ts`.
 *
 * Se recomprime siempre a JPEG (máx. 1600 px, 82 %): WhatsApp acepta hasta 5 MB
 * por imagen y así nadie tiene que redimensionar nada, y un SVG —que es un
 * vector de XSS servido desde un bucket público— ni se acepta en la entrada.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import sharp from 'sharp'

export const dynamic = 'force-dynamic'

const BUCKET_ID = 'brand-assets'
const MAX_INPUT_BYTES = 15 * 1024 * 1024
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const tenantId = await requireTenantId()

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Campo `file` requerido (multipart/form-data)' }, { status: 400 })
    }
    if (!ALLOWED_MIMES.has(file.type)) {
      return NextResponse.json(
        { error: `Tipo no soportado: ${file.type || '(desconocido)'}. Subí un JPG, PNG o WebP.` },
        { status: 415 }
      )
    }
    if (file.size > MAX_INPUT_BYTES) {
      return NextResponse.json({ error: 'La imagen pesa más de 15 MB.' }, { status: 413 })
    }

    // Dos fotos con dos prefijos, para que subir una no borre la otra. La del
    // sí conserva el prefijo con el que nació (`golden-bullet-<ts>`).
    const uso = formData.get('uso') === 'mensaje1' ? 'mensaje1' : 'si'
    const prefijo = uso === 'mensaje1' ? 'golden-bullet-m1-' : 'golden-bullet-'

    const jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true })
      .toBuffer()

    const db = getServiceClient()
    const path = `${tenantId}/${prefijo}${Date.now()}.jpg`
    const { error: uploadError } = await db.storage
      .from(BUCKET_ID)
      .upload(path, new Uint8Array(jpeg), { contentType: 'image/jpeg', upsert: false })
    if (uploadError) {
      console.error('[GoldenBullet] Error subiendo la foto:', uploadError.message)
      return NextResponse.json({ error: 'No se pudo subir la foto' }, { status: 500 })
    }

    // Barrido de las fotos anteriores del «sí» de ESTE tenant. Igual que con
    // el logo: el bucket no es un archivo de versiones, y la URL se lee del
    // ajuste en cada respuesta, así que la vieja ya no la usa nadie.
    //
    // Las del mensaje 1 NO se barren: su URL queda horneada en una plantilla
    // que Meta aprobó y WhatsApp la descarga en cada envío. Borrar la foto de
    // una plantilla viva rompería la campaña que está goteando con ella.
    if (uso === 'si') {
      const { data: previous } = await db.storage.from(BUCKET_ID).list(tenantId)
      const stale = (previous ?? [])
        .filter((f) => f.name.startsWith('golden-bullet-') && !f.name.startsWith('golden-bullet-m1-') && `${tenantId}/${f.name}` !== path)
        .map((f) => `${tenantId}/${f.name}`)
      if (stale.length > 0) {
        const { error: removeError } = await db.storage.from(BUCKET_ID).remove(stale)
        if (removeError) console.warn('[GoldenBullet] No se pudieron borrar fotos viejas:', removeError.message)
      }
    }

    const { data: publicData } = db.storage.from(BUCKET_ID).getPublicUrl(path)
    return NextResponse.json({ url: publicData.publicUrl, bytes: jpeg.length })
  } catch (error) {
    console.error('[GoldenBullet] Error procesando la foto:', error)
    return NextResponse.json({ error: 'No se pudo procesar la imagen' }, { status: 500 })
  }
}
