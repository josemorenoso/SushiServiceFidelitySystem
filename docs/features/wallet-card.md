# Wallet Card — Tarjeta Digital de Fidelidad

> Estado: 🟢 Implementado (v2.1.0)
> Última actualización: 2026-09-06 — logo y paleta por marca (§5/§6), ver [`identidad-visual.md`](identidad-visual.md)

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
| Color de tarjeta | Gradient rojo brand (`#7B0D1E → #E63946 → #FF6B6B`) **por defecto**; desde §6 cada marca puede poner el suyo | El literal se conserva: un tenant sin color propio ve exactamente el mismo gradiente. Ver [`identidad-visual.md`](identidad-visual.md) |
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

- **Círculo lleno**: fondo blanco, check `✓` en el color de la marca (`branding.stampCheck`; sin
  marca propia es el `#C1121F` de siempre), sombra
- **Círculo vacío**: fondo blanco/20, borde blanco/40

⚠️ `CustomerCard` llamaba a `StampsGrid` **sin tema**, así que el ✓ del check-in se quedaba en el rojo
del sistema aunque el tenant tuviera otro color. Corregido en §5: ahora le pasa
`brandWalletCardTheme(branding).stamps`, el mismo tema que usa `/tarjeta`.

### WalletCard (`src/components/features/wallet/WalletCard.tsx`)

Tarjeta visual pura para la ruta `/tarjeta`. Vista de solo lectura (sin QR de check-in).

**Layout:**
0. Logo de la marca (`BrandMark`, §6). Sin logo subido no dibuja nada y la tarjeta arranca en el punto 1
1. Brand name (pequeño, blanco/50)
2. "Tarjeta de Fidelidad" subtítulo
3. Nombre del cliente (Playfair Display)
4. Puntos grandes + texto próximo tier
5. StampsGrid
6. Lista compacta de tiers (alcanzados/pendientes)
7. CTA → link al check-in QR

### Tarjeta Black — negra y dorada (v2.14.0, `REQUERIMIENTOS_AGOSTO_2026.md` §17.2)

Textual del dueño: *"al entrar a Black, la tarjeta del cliente en su celular cambia a negro y
dorado"*, con distintivo claro. Es **solo visual**: no cambia ni un dato, ni un cálculo, ni un envío.

**Cómo está partido** (Mandamiento II — la lógica y los estilos no comparten archivo):

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/lib/black-tier.ts` | **Quién es Black.** `isBlackMember(tiers, totalPoints)` + `findBlackTier(tiers)`. Nada de colores |
| `src/constants/wallet-card-theme.ts` | **Los colores.** `brandWalletCardTheme(branding)` (el de siempre) y `BLACK_WALLET_CARD_THEME`. Nada de negocio |
| `WalletCard.tsx` / `StampsGrid.tsx` | Solo layout: eligen tema y lo aplican |

**La definición de Black que usa la tarjeta.** Hoy conviven dos nociones distintas en el producto:

1. **Por visitas** — `POWER_RANKS` llama Black a quien tiene **10+ visitas**. Es lo que usan el
   ranking del dashboard, `BlackTierSection` y el preset `black_exclusive` de campañas manuales.
2. **Por puntos** — `reward_tiers.is_black` marca **uno** de los niveles de premios del tenant (la
   API garantiza que solo haya uno); se alcanza cruzando su `point_threshold`.

La tarjeta usa la **segunda**, y no por capricho: la tarjeta enseña la escalera de premios por
puntos. Si se pintara de negro por visitas, un cliente con 10 visitas y pocos puntos vería una
tarjeta Black encima de una lista que le dice que el nivel Black sigue bloqueado (🔒) — la tarjeta se
contradiría sola. Sin nivel `is_black` configurado en el tenant, nadie es Black y la tarjeta se ve
como siempre.

⚠️ **Cuál de las dos manda a nivel de producto es la pregunta 17.b, que sigue abierta** (*"¿El umbral
de Black se define por visitas, por puntos, o por cualquiera de los dos?"*). Por eso la regla vive en
una sola función: cuando el dueño responda, se cambia `isBlackMember()` y nada más. El umbral de 10
visitas de `ManualCampaigns.tsx` **no se tocó** — §17.4 (umbral configurable por tenant) sigue
congelado a propósito.

**Qué cambia visualmente** cuando `isBlackMember()` da `true`:

- Fondo de página y de tarjeta en negros (`#000 → #141210` y `#0a0a0a → #131211`), borde y halo dorados.
- Distintivo nuevo bajo la marca: pastilla dorada con corona y **«Miembro Black»**.
- Nombre, puntos, barra de progreso y sellos en dorado (`#D4AF37` / `#F2D479`, oro viejo — el
  `#FFD700` puro sobre negro se lee barato y vibra en AMOLED; mismo criterio que la regla «sin negro
  puro» del sistema de diseño, aplicada al otro extremo).
- Sellos llenos con gradiente dorado y ✓ casi negro (antes: blanco con ✓ rojo, que sobre negro choca).
- En el nivel máximo el texto pasa de «🎉 ¡Nivel máximo alcanzado!» a «🖤 Estás en el nivel Black».

**El aspecto por defecto no cambió.** La refactorización pasó los colores literales que ya tenía la
tarjeta (`text-white/50` → `rgba(255,255,255,0.5)`, etc.) a `brandWalletCardTheme()`, valor por valor.

**Alcance:** solo la tarjeta permanente de `/tarjeta` (`WalletCard`). La `CustomerCard` del check-in
sigue con el gradiente de marca — §17.2 habla de *"la tarjeta del cliente en su celular"* y no pidió
tocar el flujo de check-in. `src/app/(public)/tarjeta/page.tsx` **no necesitó cambios**: ya le pasaba
`tiers` (con `is_black`) y `totalPoints` a `WalletCard`.

### CustomerCard (rediseñada, `src/components/features/check-in/CustomerCard.tsx`)

Misma lógica de polling, nuevo look de tarjeta wallet. Ocupa pantalla completa (`fixed inset-0 z-50`).

**Layout:**
0. Logo de la marca (`BrandMark variant="onColor"`, §6)
1. Brand name
2. `¡Hola, {name}!`
3. Puntos + texto de progreso
4. StampsGrid
5. Banner de acción (glass effect: "DILE AL MESERO QUE TE ESCANEE")
6. QR sobre fondo blanco — desde §3 lleva el color de la marca (pasado por `qrSafe()`, ≥7:1 contra
   blanco) y el logo en el centro, con `level="H"`: el 30 % de redundancia que hace falta para que un
   logo encima no lo vuelva ilegible. Con el `level="M"` de antes, poner un logo lo habría roto
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
| `src/lib/black-tier.ts` | ✅ Nuevo (v2.14.0) | Quién es Black: `isBlackMember()` / `findBlackTier()` |
| `src/constants/wallet-card-theme.ts` | ✅ Nuevo (v2.14.0) | Paletas de la tarjeta: marca y Black |
| `src/components/features/wallet/StampsGrid.tsx` | ✅ Nuevo · 🔄 v2.14.0 | Grid de sellos circulares; acepta `theme` opcional |
| `src/components/features/wallet/WalletCard.tsx` | ✅ Nuevo · 🔄 v2.14.0 | Tarjeta wallet para /tarjeta (view mode); tema Black |
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
- ~~**Fase E (Branding configurable)**~~ → ✅ **HECHA** en §5/§6 (2026-09-06). No usó una entrada de
  `admin_settings`: la marca vive en `tenants.config.branding`, donde ya vivía el resto del branding.
  Ver [`identidad-visual.md`](identidad-visual.md).
- **PWA / Agregar a inicio**: no implementado. Requiere `manifest.json` y service worker.
- **TiersRoadmap en /tarjeta**: versión compacta incluida como lista de tiers, no el componente completo.
