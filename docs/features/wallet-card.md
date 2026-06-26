# Wallet Card — Tarjeta Digital de Fidelidad

> Estado: 🟢 Implementado (v2.1.0)
> Última actualización: 2026-06-18

---

## Propósito

Transformar la experiencia del cliente de un "formulario web" a una **tarjeta digital de fidelización** estilo Apple/Google Wallet. El cliente necesita sentir que tiene algo tangible y personalizado en su celular, no una UI de administración.

Resuelve tres problemas de engagement:
1. **Sin permanencia**: el QR expiraba en 30 min, sin forma de volver a ver el progreso entre visitas.
2. **Progreso abstracto**: una barra de porcentaje no genera la misma dopamina que sellos visuales que se llenan.
3. **Identidad de marca débil**: fondo marfil + card blanca = sensación de formulario, no de tarjeta premium.

---

## Decisiones de Diseño

| Decisión | Elección | Razón |
|----------|----------|-------|
| Puntos vs Sellos | Puntos como lógica de negocio, **sellos como visualización** | No romper tiers, mystery box, campaigns existentes |
| QR vs Barcode | Solo QR | Meseros usan cámara de celular; barcode necesita lector láser |
| Color de tarjeta | Gradient rojo brand (`#7B0D1E → #E63946 → #FF6B6B`), fijo | Sin config por restaurante en esta fase (YAGNI) |
| Tarjeta permanente | `/tarjeta?phone=XXXX` sin token | Solo expone nombre + puntos (datos públicos equivalentes al flujo existente) |
| Scope | Fases A + C (tarjeta permanente + sellos) | Máximo impacto, menor riesgo; check-in rediseñado incluido |

---

## Componentes

### StampsGrid (`src/components/features/wallet/StampsGrid.tsx`)

Grid 5×2 de círculos que representan progreso hacia el siguiente tier.

**Lógica:** 1 visita = 1 sello. Cada 10 visitas se reinicia la tarjeta (nuevo ciclo). Los sellos son visualización del conteo de visitas; los puntos siguen siendo la lógica de negocio para tiers, recompensas y campañas.

**Fórmula de mapeo:**

```text
STAMPS_COUNT = 10
mod = totalVisits % STAMPS_COUNT
filledStamps = (mod === 0 && totalVisits > 0) ? STAMPS_COUNT : mod
cycleNumber  = (totalVisits > 0) ? floor((totalVisits - 1) / STAMPS_COUNT) + 1 : 1
```

Ejemplos: 0 visitas → 0/10 #1 · 7 visitas → 7/10 #1 · 10 visitas → 10/10 #1 · 11 visitas → 1/10 #2 · 20 visitas → 10/10 #2

- **Círculo lleno**: fondo blanco, check rojo `✓`, sombra
- **Círculo vacío**: fondo blanco/20, borde blanco/40

### WalletCard (`src/components/features/wallet/WalletCard.tsx`)

Tarjeta visual pura para la ruta `/tarjeta`. Vista de solo lectura (sin QR de check-in).

**Layout:**
1. Brand name (pequeño, blanco/50)
2. "Tarjeta de Fidelidad" subtítulo
3. Nombre del cliente (Playfair Display)
4. Puntos grandes + texto próximo tier
5. StampsGrid
6. Lista compacta de tiers (alcanzados/pendientes)
7. CTA → link al check-in QR

### CustomerCard (rediseñada, `src/components/features/check-in/CustomerCard.tsx`)

Misma lógica de polling, nuevo look de tarjeta wallet. Ocupa pantalla completa (`fixed inset-0 z-50`).

**Layout:**
1. Brand name
2. `¡Hola, {name}!`
3. Puntos + texto de progreso
4. StampsGrid
5. Banner de acción (glass effect: "DILE AL MESERO QUE TE ESCANEE")
6. QR sobre fondo blanco
7. Estado de polling (spinner)
8. Texto de expiración
9. Botón Volver

**Diferencias respecto a CustomerCard anterior:**
- ❌ Eliminado: `premium-card` blanca flotante
- ❌ Eliminado: TiersRoadmap (reemplazado por StampsGrid)
- ❌ Eliminado: barra de progreso numérica
- ✅ Nuevo: fondo gradient rojo full-screen
- ✅ Nuevo: StampsGrid
- ✅ Nuevo: banner glass (backdrop-blur)
- ✅ Nuevo: QR sobre card blanca independiente

---

## Ruta `/tarjeta`

### URL
```
/tarjeta          → formulario de ingreso de celular
/tarjeta?phone=3001234567 → tarjeta digital del cliente
```

### Seguridad
- **Sin token**: los datos expuestos (nombre + puntos) son equivalentes a lo que ya retorna `/api/check-in/status` (endpoint público existente).
- El número de celular es requerido para acceder; sin él no hay lookup.
- Rate limit: heredado del server-side rendering (no es un API directo).

### Server Component
La página es un Server Component de Next.js App Router que:
1. Lee `searchParams.phone`
2. Llama directamente a `findCustomerByPhone()` y `getAllTiers()` (servicios Supabase con service role)
3. Renderiza `WalletCard` (Client Component) con los datos
4. Si no hay phone → renderiza formulario HTML nativo (sin JS)

---

## API Nueva

### `GET /api/public/customer-card?phone=XXXX`

Endpoint JSON alternativo (útil para integraciones futuras). Mismos datos que el server-side rendering.

**Auth:** Ninguna (público)
**Rate limit:** 30 req/min por IP

**Response:**
```json
{
  "found": true,
  "customer": {
    "name": "Juan García",
    "total_points": 340,
    "total_visits": 8
  },
  "tiers": [
    {
      "tier_name": "Bronce",
      "point_threshold": 200,
      "safe_reward_title": "Rollo gratis",
      "mystery_box_enabled": true,
      "is_black": false
    }
  ],
  "next_tier": {
    "name": "Plata",
    "threshold": 500,
    "points_remaining": 160
  }
}
```

---

## Archivos Creados/Modificados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `src/components/features/wallet/StampsGrid.tsx` | ✅ Nuevo | Grid de sellos circulares |
| `src/components/features/wallet/WalletCard.tsx` | ✅ Nuevo | Tarjeta wallet para /tarjeta (view mode) |
| `src/components/features/wallet/index.ts` | ✅ Nuevo | Barrel exports |
| `src/app/(public)/tarjeta/page.tsx` | ✅ Nuevo | Tarjeta digital permanente |
| `src/app/api/public/customer-card/route.ts` | ✅ Nuevo | API JSON de tarjeta |
| `src/components/features/check-in/CustomerCard.tsx` | 🔄 Modificado | Rediseño wallet full-screen |
| `src/app/globals.css` | 🔄 Modificado | Keyframe stamp-pop |
| `docs/API_DOCS.md` | 🔄 Modificado | Nuevo endpoint documentado |
| `CHANGELOG.md` | 🔄 Modificado | Entrada v2.1.0 |

---

## Limitaciones / Próximas Fases

- **Fase D (Barcode)**: no implementado. Requiere `react-barcode` y hardware de lector en el restaurante.
- **Fase E (Branding configurable)**: color de tarjeta hardcodeado en brand red. Configuración por restaurante → pendiente (requiere `admin_settings` entry `wallet_card_color`).
- **PWA / Agregar a inicio**: no implementado. Requiere `manifest.json` y service worker.
- **TiersRoadmap en /tarjeta**: versión compacta incluida como lista de tiers, no el componente completo.
