# Guía: Implementación de Geolocalización — Anti QR-Scam

> **Estado:** ✅ COMPLETO (v1.0.5). Frontend, API validation y Dashboard settings implementados.
> **Objetivo:** Evitar que escaneen el QR fuera del local.

---

## ✅ Qué YA está hecho (por mí)

### 1. Base de datos
- Migración `00014_geolocation.sql` ejecutada:
  - Tabla `restaurant_locations` (lat, lon, radius_meters)
  - Columnas `checkin_lat`, `checkin_lon`, `checkin_distance_meters` en `customers`
  - Función `calculate_distance()` (Haversine) en PostgreSQL

### 2. Utilidades frontend
- `src/lib/utils/geolocation.ts`:
  - `calculateDistanceMeters(lat1, lon1, lat2, lon2)`
  - `getCurrentPosition(timeoutMs)` — pide GPS al navegador

---

## 🔴 Qué DEBES hacer tú

### Paso 1: Configurar ubicación del local en Supabase

Por cada restaurante, ejecuta esto en Supabase SQL Editor:

```sql
-- Actualizar con las coordenadas reales del local
UPDATE restaurant_locations
SET 
  lat = 6.244203,        -- ← REEMPLAZA con latitud real
  lon = -75.581211,      -- ← REEMPLAZA con longitud real
  address = 'Carrera 43A # 1A Sur-50, Medellín',
  radius_meters = 20     -- ← Radio permitido (default 20m)
WHERE id = (SELECT id FROM restaurant_locations LIMIT 1);
```

**Cómo obtener lat/lon:**
1. Ve a Google Maps
2. Busca tu dirección
3. Clic derecho → "¿Qué hay aquí?" → copia los números (lat, lon)
4. O usa: https://www.latlong.net

---

### Paso 2: Modificar CheckInForm.tsx (pedir GPS antes de enviar)

En `src/components/features/check-in/CheckInForm.tsx`, antes de enviar el formulario de teléfono:

```tsx
import { getCurrentPosition } from '@/lib/utils/geolocation'

// Dentro del componente, agregar estado:
const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'verified' | 'denied' | 'error'>('idle')
const [locationError, setLocationError] = useState<string | null>(null)
const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null)

// Función para verificar ubicación:
const verifyLocation = async () => {
  setLocationStatus('requesting')
  try {
    const pos = await getCurrentPosition(10000)
    setUserCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude })
    setLocationStatus('verified')
    return { lat: pos.coords.latitude, lon: pos.coords.longitude }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error de ubicación'
    setLocationError(msg)
    setLocationStatus('denied')
    return null
  }
}

// En handlePhoneSubmit, ANTES de enviar el fetch:
const handlePhoneSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  if (phone.length < 10) return

  // PEDIR UBICACIÓN
  const coords = await verifyLocation()
  if (!coords) {
    // No dio permiso o falló — mostrar error y NO enviar
    return
  }

  setLoading(true)
  try {
    // Enviar coords junto con el teléfono
    const res = await fetch('/api/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        action: 'lookup',
        table_number: tableNumber,
        lat: coords.lat,
        lon: coords.lon,
      }),
    })
    // ... resto del código
```

**UI visual mientras pide ubicación:**

```tsx
{locationStatus === 'requesting' && (
  <div className="text-center py-3 rounded-xl" style={{ background: 'rgba(251,191,36,0.1)' }}>
    <p className="text-sm font-medium" style={{ color: '#d97706' }}>
      📍 Verificando tu ubicación...
    </p>
  </div>
)}

{locationStatus === 'verified' && (
  <div className="text-center py-3 rounded-xl" style={{ background: 'rgba(5,150,105,0.08)' }}>
    <p className="text-sm font-medium" style={{ color: '#059669' }}>
      ✅ Ubicación verificada
    </p>
  </div>
)}

{locationStatus === 'denied' && (
  <div className="text-center py-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)' }}>
    <p className="text-sm font-medium" style={{ color: '#dc2626' }}>
      ❌ {locationError || 'Debes activar la ubicación para hacer check-in'}
    </p>
    <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
      El QR solo funciona dentro del restaurante
    </p>
  </div>
)}
```

---

### Paso 3: Modificar API /api/check-in (validar distancia)

En `src/app/api/check-in/route.ts`:

```typescript
// Agregar import:
import { calculateDistanceMeters } from '@/lib/utils/geolocation'

// Dentro de POST, después de validar teléfono:
if (action === 'checkin' || action === 'register') {
  const { lat, lon } = body
  
  if (lat == null || lon == null) {
    return NextResponse.json(
      { error: 'Ubicación requerida', message: 'Activa la ubicación para hacer check-in' },
      { status: 403 }
    )
  }

  // Obtener ubicación del local desde DB
  const { data: location } = await getServiceClient()
    .from('restaurant_locations')
    .select('lat, lon, radius_meters')
    .eq('is_active', true)
    .single()

  if (location) {
    const distance = calculateDistanceMeters(lat, lon, location.lat, location.lon)
    if (distance > location.radius_meters) {
      return NextResponse.json(
        { error: 'Fuera del local', message: `Debes estar dentro del restaurante (${Math.round(distance)}m de distancia)` },
        { status: 403 }
      )
    }
    // Guardar coords en customer (opcional, para analytics)
    // ...update customer set checkin_lat=lat, checkin_lon=lon, checkin_distance_meters=distance
  }
}
```

---

### Paso 4: Agregar settings de ubicación en Dashboard

En `src/app/(dashboard)/dashboard/settings/page.tsx`, agregar sección:

```tsx
// Nuevo estado:
const [restaurantLocation, setRestaurantLocation] = useState({
  lat: '',
  lon: '',
  radius: '20',
})

// En useEffect que carga settings, agregar:
const loadLocation = async () => {
  const res = await fetch('/api/dashboard/location')
  if (res.ok) {
    const data = await res.json()
    setRestaurantLocation({
      lat: String(data.lat ?? ''),
      lon: String(data.lon ?? ''),
      radius: String(data.radius_meters ?? '20'),
    })
  }
}

// Sección en el JSX:
<div className="space-y-4">
  <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>
    📍 Ubicación del Local
  </h3>
  <p className="text-xs" style={{ color: '#9ca3af' }}>
    Configura la ubicación para validar que los clientes estén físicamente en el restaurante al hacer check-in.
  </p>
  <div className="grid grid-cols-3 gap-3">
    <div>
      <label className="text-xs font-semibold">Latitud</label>
      <Input value={restaurantLocation.lat} onChange={(e) => setRestaurantLocation(p => ({ ...p, lat: e.target.value }))} placeholder="6.244203" />
    </div>
    <div>
      <label className="text-xs font-semibold">Longitud</label>
      <Input value={restaurantLocation.lon} onChange={(e) => setRestaurantLocation(p => ({ ...p, lon: e.target.value }))} placeholder="-75.581211" />
    </div>
    <div>
      <label className="text-xs font-semibold">Radio (metros)</label>
      <Input value={restaurantLocation.radius} onChange={(e) => setRestaurantLocation(p => ({ ...p, radius: e.target.value }))} placeholder="20" />
    </div>
  </div>
  <SaveButton saving={saving} saved={saved} onClick={saveLocation} disabled={!restaurantLocation.lat || !restaurantLocation.lon} />
</div>

// Función saveLocation:
const saveLocation = async () => {
  setSaving(true)
  await fetch('/api/dashboard/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: 'restaurant_location',
      value: JSON.stringify({
        lat: parseFloat(restaurantLocation.lat),
        lon: parseFloat(restaurantLocation.lon),
        radius_meters: parseInt(restaurantLocation.radius) || 20,
      }),
    }),
  })
  setSaving(false)
  setSaved(true)
  setTimeout(() => setSaved(false), 2000)
}
```

---

### Paso 5: Crear API para leer ubicación

Crear `src/app/api/dashboard/location/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('restaurant_locations')
    .select('lat, lon, radius_meters')
    .eq('is_active', true)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

---

## 🎯 Checklist de deploy por restaurante

| # | Paso | Cómo |
|---|------|------|
| 1 | Mergear PR en GitHub | GitHub → Pull Requests → Merge |
| 2 | Ejecutar migración 00013 | Supabase SQL Editor → `supabase/migrations/00013_points_mystery_box.sql` |
| 3 | Ejecutar migración 00014 | Supabase SQL Editor → `supabase/migrations/00014_geolocation.sql` |
| 4 | Ejecutar migración 00015 | Supabase SQL Editor → `supabase/migrations/00015_migrate_visits_to_points.sql` |
| 5 | Configurar ubicación del local | Supabase → `UPDATE restaurant_locations SET lat=..., lon=...` |
| 6 | Insertar tiers por defecto | Supabase → `INSERT INTO reward_tiers ...` (Bronce/Plata/Oro/BLACK) |
| 7 | Configurar settings de puntos | Dashboard → Ajustes → Sistema de Puntos |
| 8 | Configurar plantillas Twilio | Dashboard → Ajustes → asignar SIDs |
| 9 | Deploy Vercel | `git push` → Vercel auto-deploy |
| 10 | Probar check-in | Escanear QR desde el local (dentro de 20m) |

---

## 📍 Branches enviadas a cada repo

| Repo | Branch | PR URL |
|------|--------|--------|
| SushiServiceFidelitySystem | `feat/points-mystery-box-system` | https://github.com/josemorenoso/SushiServiceFidelitySystem/pull/new/feat/points-mystery-box-system |
| Sushi-Fun-System | `feat/points-mystery-box-system` | https://github.com/josemorenoso/Sushi-Fun-System/pull/new/feat/points-mystery-box-system |
| Restaurant_Fidelity_System | `feat/points-mystery-box-system` | Ya en repo principal (origin) |
