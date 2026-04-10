/**
 * Dispara sincronización de Google Contacts vía n8n webhook.
 * Se usa después de crear/actualizar un cliente (QR o delivery).
 * Es fire-and-forget: si falla, no afecta el flujo principal.
 */

interface ContactSyncPayload {
  phone: string
  name: string
  address?: string | null
  source: 'qr' | 'delivery'
  action: 'created' | 'updated'
}

export async function syncGoogleContact(payload: ContactSyncPayload): Promise<void> {
  const webhookUrl = process.env.N8N_GOOGLE_CONTACTS_WEBHOOK_URL

  if (!webhookUrl) {
    console.warn('[GoogleSync] N8N_GOOGLE_CONTACTS_WEBHOOK_URL no configurada — sync omitido')
    return
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        celular: payload.phone,
        nombre_cliente: payload.name,
        direccion: payload.address ?? null,
        source: payload.source,
        action: payload.action,
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      console.error(`[GoogleSync] n8n respondió ${response.status}`)
    } else {
      console.log(`[GoogleSync] Contacto sincronizado: ${payload.phone} (${payload.action})`)
    }
  } catch (error) {
    console.error('[GoogleSync] Error disparando sync:', error)
  }
}
