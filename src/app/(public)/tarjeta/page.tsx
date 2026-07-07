import { headers } from 'next/headers'
import { findCustomerByPhone } from '@/services/customer.service'
import { getAllTiers } from '@/services/reward-tiers.service'
import { validatePhone } from '@/lib/validators/phone'
import { rateLimit } from '@/lib/rate-limit'
import { WalletCard } from '@/components/features/wallet'
import { BRAND_NAME, BRAND_CARD_BG } from '@/lib/branding'
import { getTenantByDomain } from '@/lib/tenant'

export default async function TarjetaPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>
}) {
  const headersList = await headers()
  const forwarded = headersList.get('x-forwarded-for')
  const realIp = headersList.get('x-real-ip')
  const ip = (forwarded ? forwarded.split(',')[0].trim() : realIp) ?? 'unknown'
  const rl = rateLimit(`public-tarjeta:${ip}`, 30, 60_000)
  if (!rl.allowed) {
    return <TarjetaInput error="Demasiadas solicitudes. Intenta de nuevo en un momento." />
  }

  const { phone } = await searchParams

  if (!phone) {
    return <TarjetaInput />
  }

  const { valid, cleaned } = validatePhone(phone)
  if (!valid) {
    return <TarjetaInput error="Número de celular inválido" />
  }

  const tenant = await getTenantByDomain(headersList.get('host'))
  if (!tenant) {
    return <TarjetaInput error="Restaurante no reconocido" />
  }

  let customer: Awaited<ReturnType<typeof findCustomerByPhone>> = null
  let tiers: Awaited<ReturnType<typeof getAllTiers>> = []

  try {
    ;[customer, tiers] = await Promise.all([
      findCustomerByPhone(cleaned, tenant.id),
      getAllTiers(tenant.id),
    ])
  } catch {
    return <TarjetaInput error="Error cargando tu tarjeta. Intenta de nuevo." />
  }

  if (!customer) {
    return <TarjetaInput error="No encontramos una tarjeta para ese número" />
  }

  return (
    <WalletCard
      name={customer.name}
      totalPoints={customer.total_points ?? 0}
      totalVisits={customer.total_visits ?? 0}
      tiers={tiers}
    />
  )
}

function TarjetaInput({ error }: { error?: string }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5"
      style={{ background: BRAND_CARD_BG }}
    >
      <div className="w-full max-w-sm">
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/50 text-center mb-1">
          {BRAND_NAME}
        </p>
        <h1 className="font-playfair text-3xl font-bold text-white text-center mb-2">
          Tu Tarjeta Digital
        </h1>
        <p className="text-sm text-white/55 text-center mb-8">
          Ingresa tu celular para ver tu progreso y puntos
        </p>

        {error && (
          <div
            className="mb-5 rounded-2xl px-4 py-3 text-sm text-white text-center"
            style={{ background: 'rgba(0,0,0,0.25)' }}
          >
            {error}
          </div>
        )}

        <form action="/tarjeta" method="GET" className="space-y-3">
          <input
            name="phone"
            type="tel"
            inputMode="numeric"
            placeholder="3001234567"
            maxLength={10}
            className="w-full rounded-2xl py-4 px-5 text-xl font-medium text-center outline-none placeholder-white/30"
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: 'white',
            }}
            autoFocus
          />
          <button
            type="submit"
            className="w-full rounded-2xl py-4 text-base font-bold transition-opacity hover:opacity-90"
            style={{ background: 'white', color: '#C1121F' }}
          >
            Ver mi tarjeta
          </button>
        </form>

        <p className="mt-8 text-xs text-white/25 text-center">
          ¿No tienes cuenta? Escanea el QR en el restaurante para registrarte.
        </p>
      </div>
    </div>
  )
}
