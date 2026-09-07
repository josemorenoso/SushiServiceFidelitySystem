import { CallbackClient } from '@/components/dashboard/conexiones/CallbackClient'

/**
 * `/dashboard/conexiones/whatsapp/callback` — donde aterriza el navegador del cliente al
 * volver del Embedded Signup de Meta.
 *
 * ⚠️ **Esta página existe porque el `redirect_url` de hoy no puede recibir a nadie.** El
 * AIOS lo arma como `${PRODUCT_WEBHOOK_BASE_URL}/api/webhook/zernio` (y, con la variable
 * vacía, manda literalmente `https://zernio.com`). Pero esa ruta **solo exporta POST** y
 * exige firma HMAC: un navegador que caiga ahí por GET recibe **405**. No era un camino a
 * medias — no existía.
 *
 * Es una PÁGINA del panel, no el webhook. El webhook sigue siendo suyo y no se toca.
 */

export const metadata = {
  title: 'Conectando tu WhatsApp',
}

export default function WhatsappCallbackPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="font-playfair text-2xl font-bold" style={{ color: 'var(--brand-ink)' }}>
          Conectando tu WhatsApp
        </h1>
        <p className="text-sm" style={{ color: 'var(--brand-ink-soft)' }}>
          Estamos terminando el paso que hiciste en Meta.
        </p>
      </header>

      <CallbackClient />
    </div>
  )
}
