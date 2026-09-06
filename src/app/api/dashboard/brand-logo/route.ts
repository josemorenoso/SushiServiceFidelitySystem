/**
 * POST / DELETE /api/dashboard/brand-logo
 *
 * El logo del restaurante (§6). Sube un PNG/JPEG, lo normaliza y devuelve la URL
 * pública del bucket `brand-assets` (migración 00047). NO escribe
 * `tenants.config`: eso lo hace el panel con un PUT a `/api/dashboard/tenant-config`
 * sobre la ruta `branding.logo_url`, que es el único escritor de esa clave.
 *
 * POR QUÉ EL PATH LLEVA EL tenant_id POR DELANTE
 * ──────────────────────────────────────────────
 * `brand-assets/<tenant_id>/logo-<ts>.png`. El prefijo no es cosmético: es lo que
 * hace verificable de un vistazo que la marca A no puede escribir sobre el logo
 * de la marca B. Y lo impone ESTA ruta — el `tenant_id` sale de
 * `requireTenantId()`, nunca del cuerpo de la petición.
 *
 * POR QUÉ SE RE-CODIFICA SIEMPRE A PNG
 * ────────────────────────────────────
 * Tres razones, en orden de importancia:
 *   1. Un SVG servido desde un bucket público es un vector de XSS (lleva scripts
 *      adentro). `sharp` a PNG lo vuelve píxeles y el problema desaparece; el
 *      formato ni se acepta en la entrada.
 *   2. El logo se dibuja sobre un `<canvas>` en el póster QR y sobre gradientes
 *      oscuros en la tarjeta: hace falta canal alfa, y el JPEG no lo tiene.
 *   3. Tamaño acotado sin pedirle al dueño que redimensione nada.
 *
 * Ref: docs/features/identidad-visual.md · patrón calcado de
 *      `src/app/api/dashboard/calendar/media-upload/route.ts`
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { requireTenantId } from '@/lib/tenant'
import sharp from 'sharp'

const BUCKET_ID = 'brand-assets'

/** Límite de ENTRADA. Lo que se guarda siempre pesa mucho menos: se recomprime. */
const MAX_INPUT_BYTES = 8 * 1024 * 1024

/**
 * Caja máxima del logo guardado. 512 px de lado cubre los tres usos con margen:
 * la tarjeta lo pinta a ~120 px, la pantalla de check-in a ~56 px, y el póster QR
 * lo dibuja a un 22 % del lado del QR (unos 260 px en el tamaño A4 a 300 DPI).
 */
const MAX_SIDE = 512

const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp'])

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const tenantId = await requireTenantId()

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Campo `file` requerido (multipart/form-data)' },
        { status: 400 }
      )
    }

    if (!ALLOWED_MIMES.has(file.type)) {
      return NextResponse.json(
        {
          error: `Tipo no soportado: ${file.type || '(desconocido)'}. Subí un PNG, JPG o WEBP. El PNG con fondo transparente es el que mejor queda sobre la tarjeta.`,
        },
        { status: 415 }
      )
    }

    if (file.size > MAX_INPUT_BYTES) {
      return NextResponse.json(
        { error: `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${MAX_INPUT_BYTES / 1024 / 1024} MB.` },
        { status: 413 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()

    // `fit: 'inside'` + `withoutEnlargement` = nunca deforma ni agranda: un logo
    // apaisado sigue apaisado, y uno chico se guarda tal cual en vez de pixelarse.
    const png = await sharp(Buffer.from(arrayBuffer))
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer()

    const db = getServiceClient()

    // El nombre lleva timestamp para que el CDN no sirva el logo anterior. Sin
    // esto, cambiar de logo "no hace nada" durante toda la vida del caché.
    const path = `${tenantId}/logo-${Date.now()}.png`

    const { error: uploadError } = await db.storage
      .from(BUCKET_ID)
      .upload(path, new Uint8Array(png), {
        contentType: 'image/png',
        upsert: false,
        cacheControl: '31536000',
      })

    if (uploadError) {
      console.error('[BrandLogo] Error subiendo a Storage:', uploadError)
      return NextResponse.json({ error: `Error subiendo el logo: ${uploadError.message}` }, { status: 500 })
    }

    // Barrido de los logos anteriores de ESTE tenant. El bucket no es un archivo
    // histórico: guardar cada intento de un dueño probando logos lo llena de
    // basura que nadie va a mirar nunca. Si falla, no se corta: el logo nuevo ya
    // está subido y devolver un error acá haría creer que no se guardó.
    const { data: previous } = await db.storage.from(BUCKET_ID).list(tenantId)
    const stale = (previous ?? [])
      .map((f) => `${tenantId}/${f.name}`)
      .filter((p) => p !== path)
    if (stale.length > 0) {
      const { error: removeError } = await db.storage.from(BUCKET_ID).remove(stale)
      if (removeError) console.warn('[BrandLogo] No se pudieron borrar logos viejos:', removeError.message)
    }

    const { data: publicData } = db.storage.from(BUCKET_ID).getPublicUrl(path)

    return NextResponse.json(
      { url: publicData.publicUrl, path, bytes: png.byteLength, original_bytes: file.size },
      { status: 201 }
    )
  } catch (error) {
    console.error('[BrandLogo]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/dashboard/brand-logo
 * Borra TODOS los archivos del tenant en el bucket. Igual que el POST, no toca
 * `tenants.config`: el panel limpia `branding.logo_url` con su propio PUT.
 */
export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const tenantId = await requireTenantId()
    const db = getServiceClient()

    const { data: files, error: listError } = await db.storage.from(BUCKET_ID).list(tenantId)
    if (listError) {
      console.error('[BrandLogo DELETE] Error listando:', listError)
      return NextResponse.json({ error: 'Error borrando el logo' }, { status: 500 })
    }

    if (files && files.length > 0) {
      const { error } = await db.storage
        .from(BUCKET_ID)
        .remove(files.map((f) => `${tenantId}/${f.name}`))
      if (error) {
        console.error('[BrandLogo DELETE] Error borrando:', error)
        return NextResponse.json({ error: 'Error borrando el logo' }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, removed: files?.length ?? 0 })
  } catch (error) {
    console.error('[BrandLogo DELETE]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}
