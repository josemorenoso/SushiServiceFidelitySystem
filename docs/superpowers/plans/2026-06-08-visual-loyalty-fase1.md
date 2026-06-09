# Fidelización Visual Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que el cliente entienda y sienta el sistema de fidelización: tarjeta wallet al escanear el QR (banner "dile al mesero" + termómetro de puntos + camino de recompensas), premios grandes en el registro, y gestión de dispositivos en el dashboard.

**Architecture:** Cambios mayormente de UI en React/Next.js. La tarjeta del cliente se calcula 100% client-side con datos que el `lookup` ya devuelve + los tiers del endpoint público. Dos cambios chicos de backend: exponer `mystery_box_enabled` en tiers públicos y un endpoint nuevo para el rango de puntos. Un endpoint nuevo para revocar/eliminar dispositivos.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript estricto, TailwindCSS v4, lucide-react, qrcode.react, Supabase (service client).

**Verificación:** El proyecto NO tiene framework de tests (solo `dev`/`build`/`lint`). Cada tarea se verifica con `npm run lint` + `npm run build` y chequeo manual en el navegador. NO se sube nada a GitHub (push/PR prohibidos por el usuario).

**Spec:** `docs/features/visual-loyalty-fase1-spec.md`

---

## File Structure

| Archivo | Responsabilidad |
|---------|----------------|
| `src/app/api/public/reward-tiers/route.ts` (mod) | Agregar `mystery_box_enabled` al payload público |
| `src/app/api/public/points-range/route.ts` (nuevo) | `GET` → `{ min, max }` de puntos por visita |
| `src/components/features/check-in/RewardsPreview.tsx` (mod) | Tarjetas de premios grandes + rango + Mystery Box |
| `src/components/features/check-in/CustomerCard.tsx` (nuevo) | Tarjeta wallet: banner + QR + termómetro + roadmap + dopamina |
| `src/components/features/check-in/CheckInForm.tsx` (mod) | Usar `CustomerCard`; mostrar `RewardsPreview` también en `register`; tipo `TierPreview` con `mystery_box_enabled`; fetch del rango |
| `src/app/api/dashboard/staff/device/route.ts` (nuevo) | `PATCH` revocar / `DELETE` eliminar dispositivo |
| `src/app/(dashboard)/dashboard/staff/page.tsx` (mod) | Columna "Acciones" en dispositivos + handlers |
| `docs/features/qr-checkin.md`, `docs/features/dashboard.md`, `CHANGELOG.md` (mod) | Documentación |

---

## Task 1: Backend — exponer datos para la tarjeta y el rango

**Files:**
- Modify: `src/app/api/public/reward-tiers/route.ts`
- Create: `src/app/api/public/points-range/route.ts`

- [ ] **Step 1: Agregar `mystery_box_enabled` al payload público de tiers**

En `src/app/api/public/reward-tiers/route.ts`, ampliar el `map`:

```ts
const publicTiers = tiers.map(({ tier_name, point_threshold, safe_reward_title, mystery_box_enabled, is_black, sort_order }) => ({
  tier_name,
  point_threshold,
  safe_reward_title,
  mystery_box_enabled: mystery_box_enabled ?? false,
  is_black,
  sort_order,
}))
```

- [ ] **Step 2: Crear endpoint del rango de puntos**

Crear `src/app/api/public/points-range/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getPointsConfig } from '@/services/points.service'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = rateLimit(`public-points-range:${ip}`, 60, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    )
  }

  try {
    const { min, max } = await getPointsConfig()
    return NextResponse.json(
      { min, max },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    )
  } catch (err) {
    console.error('[public/points-range] Error:', err)
    return NextResponse.json({ min: 60, max: 90 }, { status: 200 })
  }
}
```

- [ ] **Step 3: Verificar**

Run: `npm run lint`
Expected: sin errores nuevos en estos archivos.
Run (con dev server): `curl http://localhost:3000/api/public/points-range`
Expected: `{"min":<n>,"max":<n>}`

- [ ] **Step 4: Commit (local, sin push)**

```bash
git add src/app/api/public/reward-tiers/route.ts src/app/api/public/points-range/route.ts
git commit -m "feat(check-in): exponer mystery_box_enabled y rango de puntos (Fase 1)"
```

---

## Task 2: Rediseñar `RewardsPreview` (premios grandes en el registro)

**Files:**
- Modify: `src/components/features/check-in/RewardsPreview.tsx`

- [ ] **Step 1: Reescribir el componente**

Reemplazar el contenido completo de `src/components/features/check-in/RewardsPreview.tsx`:

```tsx
'use client'

import { Gift, Dices } from 'lucide-react'
import { getTierEmoji } from '@/lib/tier-emojis'

interface TierPreview {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled?: boolean
  is_black: boolean
  sort_order: number
}

interface RewardsPreviewProps {
  tiers: TierPreview[]
  pointsRange?: { min: number; max: number } | null
}

export function RewardsPreview({ tiers, pointsRange }: RewardsPreviewProps) {
  if (tiers.length === 0) return null

  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)

  return (
    <div className="mt-5">
      <h3
        className="mb-3 text-center text-base font-bold"
        style={{ color: '#1a1c1d', letterSpacing: '-0.01em' }}
      >
        Ganás premios reales en cada visita 👇
      </h3>

      {pointsRange && (
        <div className="mb-3 flex justify-center">
          <span
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={{ background: 'rgba(230, 57, 70, 0.1)', color: '#E63946' }}
          >
            Cada visita: +{pointsRange.min} a +{pointsRange.max} pts
          </span>
        </div>
      )}

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 snap-x">
        {sorted.map((tier, index) => (
          <div
            key={tier.tier_name}
            className="snap-start shrink-0 rounded-2xl border p-4 text-center"
            style={{
              minWidth: '150px',
              borderColor: 'rgba(0,0,0,0.08)',
              background: tier.is_black
                ? 'linear-gradient(135deg, #1a1c1d 0%, #2d2f30 100%)'
                : '#fff',
            }}
          >
            <div className="text-4xl leading-none">{getTierEmoji(index, tier.is_black)}</div>
            <div
              className="mt-2 text-lg font-bold"
              style={{ color: tier.is_black ? '#fbbf24' : '#1a1c1d', letterSpacing: '-0.01em' }}
            >
              {tier.tier_name}
            </div>
            <div
              className="mt-1 text-sm font-medium"
              style={{ color: tier.is_black ? 'rgba(251,191,36,0.85)' : '#6b7280' }}
            >
              {tier.safe_reward_title}
            </div>
            <div
              className="mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold"
              style={{
                background: tier.is_black ? 'rgba(251,191,36,0.15)' : 'rgba(245,158,11,0.12)',
                color: tier.is_black ? '#fbbf24' : '#b45309',
              }}
            >
              {tier.point_threshold} pts
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium"
        style={{ background: 'rgba(245,158,11,0.08)', color: '#92400e' }}
      >
        <Dices className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: '#d97706' }} />
        En cada premio elegís ir a la segura o arriesgar con la Mystery Box 🎲
      </div>

      <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px]" style={{ color: '#9ca3af' }}>
        <Gift className="h-3 w-3" strokeWidth={1.5} />
        A veces ganás más puntos y te acercás más rápido a tu premio
      </div>
    </div>
  )
}
```

Nota: `Dices` existe en lucide-react v1.7. Si el build falla por el icono, usar `Gift` en su lugar.

- [ ] **Step 2: Verificar**

Run: `npm run lint`
Expected: sin errores nuevos.
Verificación manual: en `/check-in`, las tarjetas de premios se ven grandes con emoji, premio y pts.

- [ ] **Step 3: Commit (local)**

```bash
git add src/components/features/check-in/RewardsPreview.tsx
git commit -m "feat(check-in): premios grandes + rango de puntos + Mystery Box en registro (Fase 1)"
```

---

## Task 3: Componente `CustomerCard` (tarjeta wallet)

**Files:**
- Create: `src/components/features/check-in/CustomerCard.tsx`

Reusa `TiersRoadmap` (ya existe) para el camino de recompensas. El termómetro y el cálculo del próximo tier son nuevos.

- [ ] **Step 1: Crear `CustomerCard.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ScanLine, Loader2, Sparkles } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { BRAND_NAME, STAFF_LABEL } from '@/lib/branding'
import { getTierEmoji } from '@/lib/tier-emojis'
import { TiersRoadmap } from './TiersRoadmap'

interface TierItem {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled?: boolean
  is_black: boolean
  sort_order: number
}

interface CustomerCardProps {
  name: string
  totalPoints: number
  qrUrl: string
  tiers: TierItem[]
  checkingStatus: boolean
  justEarnedPoints: number | null   // si != null, muestra overlay de dopamina
  onBack: () => void
}

export function CustomerCard({
  name,
  totalPoints,
  qrUrl,
  tiers,
  checkingStatus,
  justEarnedPoints,
  onBack,
}: CustomerCardProps) {
  const sorted = [...tiers].sort((a, b) => a.point_threshold - b.point_threshold)
  const nextTier = sorted.find((t) => totalPoints < t.point_threshold) ?? null
  const nextIndex = nextTier ? sorted.indexOf(nextTier) : -1
  const nextThreshold = nextTier?.point_threshold ?? totalPoints
  const remaining = nextTier ? Math.max(nextThreshold - totalPoints, 0) : 0
  const progressPercent = nextTier
    ? Math.min((totalPoints / nextThreshold) * 100, 100)
    : 100

  // Animación de llenado de la barra
  const [barWidth, setBarWidth] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setBarWidth(progressPercent), 150)
    return () => clearTimeout(t)
  }, [progressPercent])

  return (
    <div className="premium-card animate-fade-in-up w-full p-6 text-center relative overflow-hidden">
      {/* Overlay de dopamina cuando el mesero registra */}
      {justEarnedPoints != null && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)' }}
        >
          <Sparkles className="h-12 w-12 text-white animate-pulse" strokeWidth={1.5} />
          <p className="mt-3 font-playfair text-3xl font-bold text-white">¡Listo!</p>
          <p className="mt-1 text-5xl font-bold text-white animate-fade-in-up">
            +{justEarnedPoints}
          </p>
          <p className="text-sm text-white/90">puntos</p>
        </div>
      )}

      {/* Branding */}
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#9ca3af', letterSpacing: '0.08em' }}>
        {BRAND_NAME}
      </p>
      <h2 className="mt-1 font-playfair text-2xl font-bold" style={{ color: '#1a1c1d', letterSpacing: '-0.02em' }}>
        ¡Hola, {name}!
      </h2>

      {/* Banner imperativo — la acción dominante */}
      <div
        className="mt-4 flex items-center justify-center gap-2 rounded-2xl px-4 py-3"
        style={{ background: '#E63946' }}
      >
        <ScanLine className="h-6 w-6 text-white animate-pulse shrink-0" strokeWidth={2} />
        <div className="text-left">
          <p className="text-base font-bold leading-tight text-white">
            DILE AL {STAFF_LABEL.toUpperCase()} QUE TE ESCANEE
          </p>
          <p className="text-xs font-medium text-white/85">Si no, NO sumás puntos</p>
        </div>
      </div>

      {/* QR grande con borde pulsante */}
      <div className="mx-auto my-5 flex justify-center">
        <div className="rounded-2xl border-4 p-3 animate-pulse" style={{ borderColor: '#E63946' }}>
          <QRCodeSVG value={qrUrl} size={270} level="M" />
        </div>
      </div>

      {/* Termómetro de puntos */}
      <div className="mb-2">
        <div className="relative h-8 w-full overflow-hidden rounded-full" style={{ background: 'rgba(0,0,0,0.06)' }}>
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${barWidth}%`, background: 'linear-gradient(90deg, #f59e0b 0%, #E63946 100%)' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold" style={{ color: totalPoints > 0 ? '#fff' : '#6b7280', textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
              {totalPoints} {nextTier ? `/ ${nextThreshold}` : ''} pts
            </span>
          </div>
        </div>
        <p className="mt-2 text-sm font-semibold" style={{ color: '#92400e' }}>
          {nextTier
            ? `${getTierEmoji(nextIndex, nextTier.is_black)} Te faltan ${remaining} pts: ${nextTier.safe_reward_title}`
            : '🎉 ¡Alcanzaste el nivel máximo!'}
        </p>
      </div>

      {/* Camino completo de recompensas */}
      {sorted.length > 0 && (
        <div className="mt-4">
          <TiersRoadmap tiers={sorted} totalPoints={totalPoints} />
        </div>
      )}

      {/* Estado de polling */}
      {checkingStatus && justEarnedPoints == null && (
        <div className="mt-4 flex items-center justify-center gap-2 text-xs" style={{ color: '#9ca3af' }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Esperando que el {STAFF_LABEL.toLowerCase()} te escanee...
        </div>
      )}

      <p className="mt-3 text-xs" style={{ color: '#d1d5db' }}>
        Este código expira en 30 minutos
      </p>

      <button
        type="button"
        className="mt-4 flex w-full items-center justify-center gap-1.5 py-2 text-sm font-medium"
        style={{ color: '#9ca3af' }}
        onClick={onBack}
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        Volver
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit (local)**

```bash
git add src/components/features/check-in/CustomerCard.tsx
git commit -m "feat(check-in): componente CustomerCard tipo wallet (Fase 1)"
```

---

## Task 4: Integrar en `CheckInForm` (tarjeta + dopamina + premios en registro)

**Files:**
- Modify: `src/components/features/check-in/CheckInForm.tsx`

- [ ] **Step 1: Tipo `TierPreview` con `mystery_box_enabled` + estado del rango y dopamina**

En `CheckInForm.tsx`, actualizar la interface `TierPreview` (líneas ~9-15):

```ts
interface TierPreview {
  tier_name: string
  point_threshold: number
  safe_reward_title: string
  mystery_box_enabled?: boolean
  is_black: boolean
  sort_order: number
}
```

Agregar import al inicio (junto a los otros imports de componentes):

```ts
import { CustomerCard } from './CustomerCard'
```

Agregar dos estados nuevos (junto a `previewTiers`):

```ts
const [pointsRange, setPointsRange] = useState<{ min: number; max: number } | null>(null)
const [justEarnedPoints, setJustEarnedPoints] = useState<number | null>(null)
```

- [ ] **Step 2: Fetch del rango de puntos**

Agregar un `useEffect` junto al fetch de `reward-tiers` (después de las líneas 102-107):

```ts
useEffect(() => {
  fetch('/api/public/points-range')
    .then((r) => r.json())
    .then((data) => {
      if (data && typeof data.min === 'number' && typeof data.max === 'number') {
        setPointsRange({ min: data.min, max: data.max })
      }
    })
    .catch(() => {})
}, [])
```

- [ ] **Step 3: Dopamina antes de pasar a éxito**

En el `useEffect` del polling, reemplazar el bloque que llama `onCheckInSuccess` (líneas ~155-171) por uno que primero muestre el overlay:

```ts
        if (data.hasRecentVisit) {
          const tierUnlocked = data.tier_unlocked ?? null
          const awarded = data.points_awarded ?? 0
          const result: CheckInResult = {
            message: tierUnlocked ? 'tier_unlocked' : 'points_earned',
            customer: {
              name: data.customer.name,
              total_visits: data.customer.total_visits,
              total_points: data.customer.total_points,
            },
            points_awarded: awarded,
            tier_unlocked: tierUnlocked,
            next_tier: data.next_tier ?? null,
            tiers: data.tiers ?? [],
          }
          // Mostrar dopamina ~1.6s, luego continuar al éxito
          setJustEarnedPoints(awarded)
          setTimeout(() => onCheckInSuccess(result, phone), 1600)
          return
        }
```

- [ ] **Step 4: Mostrar `RewardsPreview` en el step `register` y pasarle el rango**

En el step `phone` (línea ~337), pasar el rango:

```tsx
{previewTiers.length > 0 && <RewardsPreview tiers={previewTiers} pointsRange={pointsRange} />}
```

En el step `register`, antes del `</form>` de cierre o tras el botón "Volver" (dentro del `<div className="premium-card ...">` que envuelve el form, después de `</form>`), agregar:

```tsx
{previewTiers.length > 0 && <RewardsPreview tiers={previewTiers} pointsRange={pointsRange} />}
```

- [ ] **Step 5: Reemplazar el bloque `customer_qr` por `CustomerCard`**

Reemplazar todo el bloque `if (step === 'customer_qr' && customerQR && lookupCustomer) { ... }` (líneas ~547-611) por:

```tsx
  if (step === 'customer_qr' && customerQR && lookupCustomer) {
    return (
      <CustomerCard
        name={lookupCustomer.name}
        totalPoints={lookupCustomer.total_points ?? 0}
        qrUrl={customerQR}
        tiers={previewTiers}
        checkingStatus={checkingStatus}
        justEarnedPoints={justEarnedPoints}
        onBack={() => {
          setStep('phone')
          setCustomerQR(null)
          setLookupCustomer(null)
          setJustEarnedPoints(null)
        }}
      />
    )
  }
```

- [ ] **Step 6: Verificar build completo**

Run: `npm run lint`
Expected: sin errores.
Run: `npm run build`
Expected: build exitoso (Compiled successfully).
Verificación manual: en `/check-in` con un teléfono existente → se ve la tarjeta wallet con banner, QR 270px, termómetro y roadmap. Al registrar la visita desde `/mesero`, aparece el overlay verde "+X pts".

- [ ] **Step 7: Commit (local)**

```bash
git add src/components/features/check-in/CheckInForm.tsx
git commit -m "feat(check-in): integrar CustomerCard, dopamina y premios en registro (Fase 1)"
```

---

## Task 5: Revocar/eliminar dispositivos (API + UI)

**Files:**
- Create: `src/app/api/dashboard/staff/device/route.ts`
- Modify: `src/app/(dashboard)/dashboard/staff/page.tsx`

- [ ] **Step 1: Revisar el patrón de auth de una API de dashboard existente**

Run: `ls src/app/api/dashboard/staff/`
Leer una ruta hermana (ej. `src/app/api/dashboard/staff/route.ts` si existe) para copiar el patrón exacto de autenticación/cliente Supabase que usa el dashboard. Usar EXACTAMENTE ese patrón en el endpoint nuevo (no inventar auth).

- [ ] **Step 2: Crear el endpoint**

Crear `src/app/api/dashboard/staff/device/route.ts`. Plantilla (ajustar el import/uso de auth al patrón encontrado en Step 1):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

// PATCH: revocar (soft) — is_trusted = false
export async function PATCH(request: NextRequest) {
  try {
    const { device_id } = (await request.json()) as { device_id?: string }
    if (!device_id) {
      return NextResponse.json({ error: 'device_id requerido' }, { status: 400 })
    }
    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('staff_devices')
      .update({ is_trusted: false })
      .eq('id', device_id)
      .select('id')
      .single()
    if (error || !data) {
      return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[dashboard/staff/device] PATCH error:', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// DELETE: eliminar (hard) — solo si ya está revocado
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    }
    const supabase = getServiceClient()
    const { data: device } = await supabase
      .from('staff_devices')
      .select('id, is_trusted')
      .eq('id', id)
      .single()
    if (!device) {
      return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })
    }
    if (device.is_trusted) {
      return NextResponse.json(
        { error: 'Revocá el dispositivo antes de eliminarlo' },
        { status: 409 }
      )
    }
    const { error } = await supabase.from('staff_devices').delete().eq('id', id)
    if (error) {
      return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[dashboard/staff/device] DELETE error:', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
```

Si el patrón del Step 1 requiere validar sesión de admin, agregar esa validación al inicio de PATCH y DELETE (devolver 401 si no hay sesión válida).

- [ ] **Step 3: Agregar columna "Acciones" y handlers en la tabla de dispositivos**

En `src/app/(dashboard)/dashboard/staff/page.tsx`:

(a) Asegurar imports de iconos usados (`Ban`, `Trash2`) desde lucide-react (Trash2 ya se importa).

(b) Agregar handlers cerca de los demás (ej. junto a `confirmDelete`):

```tsx
const handleRevokeDevice = async (id: string) => {
  if (!confirm('¿Revocar este dispositivo? Dejará de poder registrar visitas.')) return
  const res = await fetch('/api/dashboard/staff/device', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: id }),
  })
  if (res.ok) { await loadData() } else { alert('No se pudo revocar el dispositivo') }
}

const handleDeleteDevice = async (id: string) => {
  if (!confirm('¿Eliminar definitivamente este dispositivo?')) return
  const res = await fetch(`/api/dashboard/staff/device?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (res.ok) { await loadData() } else {
    const d = await res.json().catch(() => ({}))
    alert(d.error ?? 'No se pudo eliminar el dispositivo')
  }
}
```

Nota: usar el nombre real de la función de recarga de datos de la página (buscar cómo se recargan `data.devices`; arriba se asume `loadData()` — reemplazar por el real).

(c) Agregar el header de la columna en el `<TableHeader>` de dispositivos (tras "Expira"):

```tsx
<TableHead className="text-right">Acciones</TableHead>
```

(d) Agregar la celda en cada `<TableRow>` de dispositivo (tras la celda de "Expira"):

```tsx
<TableCell className="text-right">
  <div className="flex items-center justify-end gap-1">
    {d.is_trusted ? (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
        onClick={() => handleRevokeDevice(d.id)}
        title="Revocar"
      >
        <Ban className="h-4 w-4" />
      </Button>
    ) : (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
        onClick={() => handleDeleteDevice(d.id)}
        title="Eliminar"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    )}
  </div>
</TableCell>
```

- [ ] **Step 4: Verificar**

Run: `npm run lint`
Expected: sin errores.
Run: `npm run build`
Expected: build exitoso.
Verificación manual: en `/dashboard/staff`, un dispositivo activo muestra "Revocar"; al revocar pasa a "Revocado" y muestra "Eliminar"; al eliminar desaparece de la tabla.

- [ ] **Step 5: Commit (local)**

```bash
git add src/app/api/dashboard/staff/device/route.ts "src/app/(dashboard)/dashboard/staff/page.tsx"
git commit -m "feat(staff): revocar y eliminar dispositivos de confianza (Fase 1)"
```

---

## Task 6: Documentación + CHANGELOG

**Files:**
- Modify: `docs/features/qr-checkin.md`, `docs/features/dashboard.md`, `CHANGELOG.md`

- [ ] **Step 1: Actualizar `docs/features/qr-checkin.md`**

En la sección "UI / Pantallas", actualizar la descripción de la pantalla del QR del cliente para reflejar la tarjeta wallet (banner imperativo, QR 270px, termómetro de puntos, camino de recompensas con `TiersRoadmap`, overlay de dopamina al registrar). Mencionar que los premios en el registro ahora son tarjetas grandes con el rango de puntos por visita.

- [ ] **Step 2: Actualizar `docs/features/dashboard.md`**

Documentar la gestión de dispositivos de confianza: Revocar (soft, `PATCH /api/dashboard/staff/device`) y Eliminar (hard, `DELETE /api/dashboard/staff/device?id=`), con la regla de que solo se elimina un dispositivo ya revocado.

- [ ] **Step 3: Agregar entrada al `CHANGELOG.md`**

Agregar entrada v1.3.0 describiendo: tarjeta wallet del cliente con banner "dile al mesero", termómetro de puntos y camino de recompensas; premios grandes + rango de puntos + Mystery Box en el registro; overlay de dopamina; revocar/eliminar dispositivos.

- [ ] **Step 4: Commit (local)**

```bash
git add docs/features/qr-checkin.md docs/features/dashboard.md CHANGELOG.md docs/features/visual-loyalty-fase1-spec.md docs/superpowers
git commit -m "docs: Fase 1 fidelización visual (spec, plan, features, changelog)"
```

---

## Self-Review (cobertura del spec)

- ✅ A. Tarjeta wallet: banner imperativo (T3/T4), QR 270px (T3), termómetro (T3), camino de recompensas vía TiersRoadmap (T3), dopamina (T4).
- ✅ A. Sin sellos de visitas (decisión del usuario) — el termómetro es el único indicador de progreso.
- ✅ B. Premios grandes en registro + Mystery Box explicada + rango de puntos (T1/T2/T4).
- ✅ C. Revocar/eliminar dispositivos con confirmación + endpoint (T5).
- ✅ Backend: `mystery_box_enabled` público + endpoint de rango (T1).
- ✅ Verificación por lint/build/manual (no hay test framework).
- ✅ Docs + CHANGELOG (T6).
- ✅ NO push a GitHub: todos los commits son locales.

**Riesgos conocidos a confirmar en ejecución:**
- Nombre real de la función de recarga de datos en `staff/page.tsx` (Step T5.3 asume `loadData`).
- Patrón de auth de las APIs de dashboard (T5.1) — copiar el existente.
- Icono `Dices` en lucide-react v1.7 (T2) — fallback a `Gift` si no existe.
- Ubicación exacta para insertar `RewardsPreview` en el step `register` (T4.4).
