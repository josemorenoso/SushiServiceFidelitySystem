# Wallet Card — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar el QR check-in de un formulario web a una tarjeta wallet estilo Clubify/Apple Wallet con sellos visuales y ruta permanente `/tarjeta`.

**Architecture:** Nuevo componente `StampsGrid` compartido entre `CustomerCard` (check-in) y `WalletCard` (vista permanente). `CustomerCard` pasa de `premium-card` blanca a overlay full-screen wallet. Nueva ruta server-side `/tarjeta?phone=XXX` con datos de Supabase directo.

**Tech Stack:** Next.js 16 App Router, React 19, TailwindCSS 4, qrcode.react (ya instalado), Supabase service role (ya configurado), TypeScript 5.

## Global Constraints

- TypeScript estricto — cero `any`
- TailwindCSS v4 con `@utility` (no `@layer utilities`)
- Todos los colores inline con `style={}` (patrón existente del proyecto)
- Importar `BRAND_NAME`, `STAFF_LABEL` desde `@/lib/branding`
- Rate limit en endpoints públicos: usar `rateLimit` de `@/lib/rate-limit`
- `findCustomerByPhone`, `getAllTiers`, `getNextTier` desde servicios existentes
- Next.js 15+: `searchParams` es `Promise<{...}>` en server components — usar `await searchParams`

---

## Mapa de Archivos

| Acción | Ruta | Responsabilidad |
|--------|------|-----------------|
| Nuevo | `src/components/features/wallet/StampsGrid.tsx` | Grid 5×2 de sellos circulares (lógica de mapeo pts→sellos) |
| Nuevo | `src/components/features/wallet/WalletCard.tsx` | Tarjeta wallet visual para /tarjeta (solo lectura) |
| Nuevo | `src/components/features/wallet/index.ts` | Barrel export |
| Nuevo | `src/app/(public)/tarjeta/page.tsx` | Server component: fetcha datos, renderiza WalletCard o formulario |
| Nuevo | `src/app/api/public/customer-card/route.ts` | API JSON pública para datos de tarjeta |
| Modificar | `src/components/features/check-in/CustomerCard.tsx` | Rediseño wallet (fixed full-screen, StampsGrid, glass banner) |
| Modificar | `src/app/globals.css` | Keyframe `stamp-pop` + utility `animate-stamp-pop` |
| Modificar | `docs/API_DOCS.md` | Documentar nuevo endpoint |
| Modificar | `CHANGELOG.md` | Entrada v2.1.0 |

---

### Task 1: CSS utilities de wallet

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: clase `animate-stamp-pop` disponible en toda la app

- [ ] **Step 1: Agregar keyframe y utility**

En `globals.css`, después del bloque `@utility animate-bubble-pop`, agregar:

```css
@keyframes stamp-pop {
  0%   { transform: scale(0); opacity: 0; }
  70%  { transform: scale(1.2); }
  100% { transform: scale(1);   opacity: 1; }
}

@utility animate-stamp-pop {
  animation: stamp-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
```

- [ ] **Step 2: Verificar**

Abrir `globals.css` y confirmar que los dos bloques están presentes.

---

### Task 2: StampsGrid

**Files:**
- Create: `src/components/features/wallet/StampsGrid.tsx`

**Interfaces:**
- Consumes: `TierItem[]`, `totalPoints: number`
- Produces: `export function StampsGrid({ totalPoints, tiers }: StampsGridProps)`

- [ ] **Step 1: Crear el componente**

```tsx
'use client'

const STAMPS_COUNT = 10

interface TierItem {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  is_black: boolean
}

interface StampsGridProps {
  totalPoints: number
  tiers: TierItem[]
}

export function StampsGrid({ totalPoints, tiers }: StampsGridProps) {
  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)
  const nextTier = sorted.find((t) => totalPoints < t.point_threshold)

  let filledStamps: number
  if (!nextTier) {
    filledStamps = STAMPS_COUNT
  } else {
    const ptsPerStamp = nextTier.point_threshold / STAMPS_COUNT
    filledStamps = Math.min(STAMPS_COUNT, Math.floor(totalPoints / ptsPerStamp))
  }

  return (
    <div>
      {nextTier && (
        <p className="text-center text-xs text-white/50 mb-2.5 font-medium uppercase tracking-widest">
          {filledStamps}/{STAMPS_COUNT} → {nextTier.safe_reward_title}
        </p>
      )}
      {!nextTier && tiers.length > 0 && (
        <p className="text-center text-xs text-white/50 mb-2.5 font-medium uppercase tracking-widest">
          ¡Todos los niveles completados!
        </p>
      )}
      <div className="grid grid-cols-5 gap-2.5 w-full">
        {Array.from({ length: STAMPS_COUNT }).map((_, i) => {
          const filled = i < filledStamps
          return (
            <div
              key={i}
              className={`aspect-square rounded-full flex items-center justify-center ${filled ? 'animate-stamp-pop' : ''}`}
              style={{
                animationDelay: filled ? `${i * 40}ms` : '0ms',
                background: filled ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.18)',
                border: filled
                  ? '2px solid rgba(255,255,255,0.9)'
                  : '2px solid rgba(255,255,255,0.35)',
                boxShadow: filled ? '0 2px 8px rgba(0,0,0,0.18)' : 'none',
              }}
            >
              {filled && (
                <span className="text-sm font-bold" style={{ color: '#C1121F' }}>✓</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

### Task 3: WalletCard (vista /tarjeta)

**Files:**
- Create: `src/components/features/wallet/WalletCard.tsx`

**Interfaces:**
- Consumes: `StampsGrid` de `./StampsGrid`
- Produces: `export function WalletCard({ name, totalPoints, tiers }: WalletCardProps)`

- [ ] **Step 1: Crear el componente**

```tsx
'use client'

import { BRAND_NAME } from '@/lib/branding'
import { StampsGrid } from './StampsGrid'

interface TierItem {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled?: boolean
  is_black: boolean
}

interface WalletCardProps {
  name: string
  totalPoints: number
  tiers: TierItem[]
}

const WALLET_BG = 'linear-gradient(160deg, #7B0D1E 0%, #C1121F 35%, #E63946 70%, #FF6B6B 100%)'

export function WalletCard({ name, totalPoints, tiers }: WalletCardProps) {
  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)
  const nextTier = sorted.find((t) => totalPoints < t.point_threshold)
  const remaining = nextTier ? nextTier.point_threshold - totalPoints : 0

  return (
    <div
      className="min-h-screen flex flex-col items-center px-5 pt-10 pb-12"
      style={{ background: WALLET_BG }}
    >
      <div className="w-full max-w-sm flex flex-col items-center animate-fade-in-up">
        {/* Brand */}
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/50">
          {BRAND_NAME}
        </p>
        <p className="text-[11px] text-white/35 mt-0.5 tracking-wide">Tarjeta de Fidelidad</p>

        {/* Name */}
        <h1 className="mt-4 font-playfair text-4xl font-bold text-white text-center leading-tight">
          {name}
        </h1>

        {/* Points */}
        <div className="mt-4 text-center">
          <div className="flex items-end justify-center gap-2">
            <span className="text-7xl font-bold text-white leading-none">{totalPoints}</span>
            <span className="text-white/60 text-2xl mb-1">pts</span>
          </div>
          {nextTier ? (
            <p className="text-sm text-white/55 mt-2">
              Faltan <span className="text-white font-semibold">{remaining} pts</span> para {nextTier.safe_reward_title}
            </p>
          ) : (
            tiers.length > 0 && (
              <p className="text-sm text-white/70 mt-2">🎉 ¡Nivel máximo alcanzado!</p>
            )
          )}
        </div>

        {/* Stamps */}
        {tiers.length > 0 && (
          <div className="mt-7 w-full">
            <StampsGrid totalPoints={totalPoints} tiers={tiers} />
          </div>
        )}

        {/* Tiers list */}
        {sorted.length > 0 && (
          <div className="mt-8 w-full space-y-2.5">
            <p className="text-[11px] text-white/40 uppercase tracking-[0.15em] text-center mb-3">
              Tu camino de recompensas
            </p>
            {sorted.map((tier) => {
              const reached = totalPoints >= tier.point_threshold
              return (
                <div
                  key={tier.tier_name}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3"
                  style={{
                    background: reached ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                    border: reached
                      ? '1px solid rgba(255,255,255,0.4)'
                      : '1px solid rgba(255,255,255,0.14)',
                  }}
                >
                  <span className="text-xl shrink-0">{reached ? '✅' : '🔒'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{tier.tier_name}</p>
                    <p className="text-xs text-white/55 truncate">{tier.safe_reward_title}</p>
                  </div>
                  <span className="text-xs text-white/45 font-medium shrink-0">
                    {tier.point_threshold} pts
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* CTA */}
        <div
          className="mt-8 w-full rounded-2xl px-5 py-4 text-center"
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <p className="text-sm text-white/60">¿Estás en el restaurante?</p>
          <a
            href="/check-in"
            className="mt-1 block text-sm font-bold text-white"
          >
            Escanea el QR en mesa para ganar puntos →
          </a>
        </div>

        <p className="mt-8 text-[11px] text-white/25 text-center">
          {BRAND_NAME} · Programa de Fidelidad
        </p>
      </div>
    </div>
  )
}
```

---

### Task 4: Barrel export

**Files:**
- Create: `src/components/features/wallet/index.ts`

- [ ] **Step 1: Crear barrel**

```ts
export { StampsGrid } from './StampsGrid'
export { WalletCard } from './WalletCard'
```

---

### Task 5: API /api/public/customer-card

**Files:**
- Create: `src/app/api/public/customer-card/route.ts`

**Interfaces:**
- Consumes: `findCustomerByPhone`, `getAllTiers`, `getNextTier`, `validatePhone`, `rateLimit`, `getClientIp`
- Produces: `GET /api/public/customer-card?phone=XXX` → JSON

- [ ] **Step 1: Crear endpoint**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { validatePhone } from '@/lib/validators/phone'
import { findCustomerByPhone } from '@/services/customer.service'
import { getNextTier, getAllTiers } from '@/services/reward-tiers.service'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = rateLimit(`public-card:${ip}`, 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    )
  }

  const { searchParams } = new URL(request.url)
  const rawPhone = searchParams.get('phone')

  if (!rawPhone) {
    return NextResponse.json({ error: 'Se requiere phone' }, { status: 400 })
  }

  const { valid, cleaned } = validatePhone(rawPhone)
  if (!valid) {
    return NextResponse.json({ error: 'Teléfono inválido' }, { status: 400 })
  }

  try {
    const customer = await findCustomerByPhone(cleaned)
    if (!customer) {
      return NextResponse.json({ found: false })
    }

    const totalPoints = customer.total_points ?? 0
    const [tiers, nextTierInfo] = await Promise.all([
      getAllTiers(),
      getNextTier(totalPoints),
    ])

    const publicTiers = tiers.map(({ tier_name, point_threshold, safe_reward_title, mystery_box_enabled, is_black }) => ({
      tier_name,
      point_threshold,
      safe_reward_title,
      mystery_box_enabled: mystery_box_enabled ?? false,
      is_black,
    }))

    return NextResponse.json({
      found: true,
      customer: {
        name: customer.name,
        total_points: totalPoints,
        total_visits: customer.total_visits ?? 0,
      },
      tiers: publicTiers,
      next_tier: nextTierInfo
        ? {
            name: nextTierInfo.tier.tier_name,
            threshold: nextTierInfo.tier.point_threshold,
            points_remaining: nextTierInfo.pointsRemaining,
          }
        : null,
    })
  } catch (err) {
    console.error('[public/customer-card] Error:', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
```

---

### Task 6: Página /tarjeta

**Files:**
- Create: `src/app/(public)/tarjeta/page.tsx`

**Interfaces:**
- Consumes: `WalletCard` de `@/components/features/wallet`, servicios Supabase
- Produces: Server Component con ruta `/tarjeta`

- [ ] **Step 1: Crear página**

```tsx
import { findCustomerByPhone } from '@/services/customer.service'
import { getAllTiers } from '@/services/reward-tiers.service'
import { validatePhone } from '@/lib/validators/phone'
import { WalletCard } from '@/components/features/wallet'
import { BRAND_NAME } from '@/lib/branding'

const WALLET_BG = 'linear-gradient(160deg, #7B0D1E 0%, #C1121F 35%, #E63946 70%, #FF6B6B 100%)'

export default async function TarjetaPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>
}) {
  const { phone } = await searchParams

  if (!phone) {
    return <TarjetaInput />
  }

  const { valid, cleaned } = validatePhone(phone)
  if (!valid) {
    return <TarjetaInput error="Número de celular inválido" />
  }

  let customer = null
  let tiers: Awaited<ReturnType<typeof getAllTiers>> = []

  try {
    ;[customer, tiers] = await Promise.all([
      findCustomerByPhone(cleaned),
      getAllTiers(),
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
      tiers={tiers}
    />
  )
}

function TarjetaInput({ error }: { error?: string }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5"
      style={{ background: WALLET_BG }}
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
```

---

### Task 7: Rediseño CustomerCard

**Files:**
- Modify: `src/components/features/check-in/CustomerCard.tsx`

**Interfaces:**
- Consumes: `StampsGrid` de `@/components/features/wallet`
- Produces: mismo interface público que antes (props idénticos, render diferente)

- [ ] **Step 1: Reemplazar contenido completo**

Ver código en `src/components/features/check-in/CustomerCard.tsx` (rediseño wallet full-screen).

Props sin cambios:
```ts
interface CustomerCardProps {
  name: string
  totalPoints: number
  qrUrl: string
  tiers: TierItem[]
  checkingStatus: boolean
  justEarnedPoints: number | null
  onBack: () => void
}
```

Cambios visuales:
- `fixed inset-0 z-50 overflow-y-auto` con gradient rojo (mismo que WalletCard)
- StampsGrid bajo los puntos
- Banner de acción con `backdrop-blur`
- QR en card blanca autónoma
- Sin TiersRoadmap
- Sin barra de progreso numérica
- Dopamina overlay con `fixed inset-0 z-[60]`

---

### Task 8: Documentación

**Files:**
- Modify: `docs/API_DOCS.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Agregar endpoint a API_DOCS.md**

En la tabla de índice de endpoints, agregar:
```
| GET | /api/public/customer-card | Datos de tarjeta del cliente por teléfono | NO (público) |
```

- [ ] **Step 2: Agregar entrada CHANGELOG**

```markdown
## [v2.1.0] — 2026-06-18 — feat: rediseño wallet card + tarjeta digital permanente
```

---

### Task 9: Branch y push

- [ ] **Step 1: Crear branch**
```bash
git checkout -b "rediseño qr 2"
```

- [ ] **Step 2: Stage y commit**
```bash
git add docs/features/wallet-card.md src/components/features/wallet/ src/app/(public)/tarjeta/ src/app/api/public/customer-card/ src/components/features/check-in/CustomerCard.tsx src/app/globals.css docs/API_DOCS.md CHANGELOG.md
git commit -m "feat(wallet): rediseño QR tarjeta digital estilo wallet + sellos visuales (v2.1.0)"
```

- [ ] **Step 3: Push**
```bash
git push -u origin "rediseño qr 2"
```
