# Auditaje UX + Propuesta de Cambios — Fidelización Visual

> **Estado:** 🔍 Auditaje completo — esperando aprobación para implementar
> **Fecha:** 2026-06-08
> **Versión:** v1.2.0-target

---

## 1. Problemas Identificados (Root Cause Analysis)

### 1.1 — Clientes escanean QR y se van sin que el mesero los registre

**Archivo:** `src/components/features/check-in/CheckInForm.tsx:547-610` (pantalla `customer_qr`)

**Síntoma:** Clientes escanean el QR en mesa, ven su QR personal, no entienden qué hacer, lo cierran y se van.

**Causa raíz:**
- Mensaje clave (`"Muéstrale este código a tu mesero"`) está en letra gris pequeña (`text-sm`, color `#9ca3af`), sin jerarquía visual.
- El QR es estático y pasa desapercibido (no hay animación ni borde llamativo).
- No hay indicación visual de que el cliente GANA algo si lo escanean.
- El botón "Volver" tiene mismo peso visual que la acción principal.
- No hay contador de puntos visible en la pantalla del QR (solo visitas, tier, puntos en texto plano pequeño).

**Impacto:** Visitas fantasmas en la DB (clientes registrados, 0 visitas registradas por mesero). El sistema de puntos no arranca.

---

### 1.2 — Premios invisibles en registro

**Archivo:** `src/components/features/check-in/CheckInForm.tsx:337` (`<RewardsPreview tiers={previewTiers} />`)

**Síntoma:** Nadie lee los premios al ingresar su celular. Los premios son texto pequeño al final del formulario.

**Causa raíz:**
- `RewardsPreview` no existe como componente separado en el codebase (busqué `find_by_name` y `grep_search`). El código referencia `<RewardsPreview tiers={previewTiers} />` en `CheckInForm.tsx:337` pero el componente no está en los resultados de búsqueda — posiblemente importado de un index barrel o no existe y está causando un error silencioso.
- Si existe, está en letra diminuta, sin emojis grandes, sin explicación de "cuántas visitas = cuántos puntos = qué premio".
- No hay storytelling: el cliente no entiende por qué debería registrarse.

**Impacto:** Baja conversión de escaneo → registro.

---

### 1.3 — No hay manera de eliminar/revoke dispositivos seguros

**Archivo:** `src/app/(dashboard)/dashboard/staff/page.tsx:445-483` (tabla de dispositivos)

**Síntoma:** Dispositivos de confianza se acumulan, algunos son de ex-meseros o celulares rotos, y no se pueden limpiar.

**Causa raíz:**
- Tabla de dispositivos (`staff_devices`) solo muestra estado (`is_trusted`, `Activo`/`Revocado`).
- Columna "Acciones" existe para meseros pero **no para dispositivos**.
- No hay endpoint API para revocar/eliminar un `staff_device` desde el dashboard.

**Impacto:** Superficie de ataque aumentada, confusión administrativa.

---

### 1.4 — No hay "tarjeta de fidelidad" visual (competencia: Google/Apple Wallet)

**Archivo:** No existe componente ni ruta.

**Síntoma:** Clientes no tienen nada tangible que mostrar al mesero. El QR se genera al vuelo y expira en 30 min. Competidores dan una tarjeta con nombre, logo y QR permanente.

**Causa raíz:**
- El QR del cliente es efímero (JWT 30 min) y se muestra solo durante el check-in.
- No hay ruta pública `/tarjeta` o similar donde el cliente pueda acceder a su estado de fidelización en cualquier momento.
- No hay diseño tipo "tarjeta" con identidad visual del restaurante.

**Impacto:** Cliente no siente pertenencia al programa. Bajo engagement.

---

### 1.5 — Puntos son abstractos, sin "pegada" visual

**Archivo:** `src/components/features/check-in/PointsDisplay.tsx`, `src/components/features/check-in/TiersRoadmap.tsx`

**Síntoma:** El cliente ve "+58 puntos" y una barra delgada. No conecta emocionalmente.

**Causa raíz:**
- `PointsDisplay` tiene barra de progreso de `h-3` (3 píxeles de alto), casi invisible en móvil.
- Los puntos se muestran como texto plano (`142 / 150 pts`) sin contexto visual de qué significa.
- `TiersRoadmap` es una lista vertical de texto. No hay representación visual de "cuánto falta" para cada premio.
- No hay animación de "llenado" emocional cuando gana puntos.

**Impacto:** Cliente no siente progreso. No hay dopamina.

---

## 2. Propuestas de Cambio (Sin Implementar)

### 2.1 — Pantalla QR del Cliente: "A Prueba de Imbéciles"

**Archivo:** `src/components/features/check-in/CheckInForm.tsx` (step `customer_qr`)

**Cambios propuestos:**

1. **Banner invasivo arriba** (rojo vivo, texto blanco, 18px bold):
   ```
   ┌─────────────────────────────┐
   │  🔴 DILE AL MESERO QUE      │
   │     TE ESCANEE 🔴            │
   │  (sino, no ganás puntos)     │
   └─────────────────────────────┘
   ```
   - Fondo: `#E63946` (brand color)
   - Texto: blanco, 18px, bold, centrado
   - Icono: `ScanLine` (Lucide) animado (pulse)

2. **QR con animación de borde pulse**:
   - Borde rojo parpadeante (`animate-pulse` de Tailwind) para que no pase desapercibido.
   - Tamaño aumentado de 240px a 280px.

3. **Barra de progreso GIGANTE** debajo del QR:
   - Altura: `h-6` (24px) — 8x más grande que la actual.
   - Colores: gradiente dorado a rojo (`#f59e0b → #E63946`).
   - Texto superpuesto: `"142 de 150 pts"` en blanco, bold, 14px.
   - Animación: se llena progresivamente al cargar la pantalla (1.5s ease-out).

4. **Próximo premio visible**:
   - Emoji grande (48px) + nombre del tier + premio seguro.
   - Texto: `"🥉 BRONCE a 8 pts — Bebida gratis"`.

5. **Botón "Volver"**: disminuir peso visual (texto solo, sin fondo, color gris claro).

6. **Estado de polling más visible**:
   - Cuando el mesero registra la visita, mostrar una animación de "✅ ¡Listo! +XX puntos" ocupando toda la pantalla antes de cambiar a `CheckInSuccess`.

---

### 2.2 — Premios en Registro: Tarjetas Gigantes

**Archivo:** `src/components/features/check-in/CheckInForm.tsx` (step `phone`)

**Cambios propuestos:**

1. **Re-diseñar `RewardsPreview`** (o crearlo si no existe):
   - Horizontal scroll en móvil (tarjetas tipo carrusel).
   - Cada tarjeta: emoji 48px, nombre del tier 20px bold, premio 16px, puntos necesarios 14px.
   - Barra de progreso mini por tier (h-2, color del tier).
   - Texto introductorio grande: `"Ganá puntos en cada visita y desbloqueá premios reales 👇"`

2. **Explicación de puntos por visita**:
   - Badge: `"Cada visita: +40 a +65 pts"` (tomado de `admin_settings`).
   - Texto: `"Solo 3 visitas para tu primer premio"`.

3. **Mystery Box explicada**:
   - Icono de dado + texto: `"En cada premio podés elegir ir a la segura o arriesgar con la Mystery Box 🎲"`.

---

### 2.3 — Eliminar/Revocar Dispositivos

**Archivo:** `src/app/(dashboard)/dashboard/staff/page.tsx`

**Cambios propuestos:**

1. **Agregar columna "Acciones"** a la tabla de dispositivos (línea 445-483).
2. **Botón "Revocar"** por dispositivo:
   - PATCH a `/api/dashboard/staff/device` con `{ device_id, is_trusted: false }`.
   - Confirmación con `Dialog` de shadcn.
3. **Botón "Eliminar"** (admin-only, hard delete):
   - DELETE a `/api/dashboard/staff/device?id={id}`.
   - Solo si `is_trusted = false` (ya revocado).
4. **API nuevo endpoint:**
   - `PATCH /api/dashboard/staff/device` — revocar (soft).
   - `DELETE /api/dashboard/staff/device` — eliminar (hard, opcional).

---

### 2.4 — Tarjeta Digital de Fidelidad

**Nueva ruta:** `src/app/(public)/tarjeta/page.tsx`

**Diseño propuesto (tipo tarjeta física):**

```
┌─────────────────────────────────────┐
│  [Fondo con gradiente del brand]   │
│                                     │
│         🍣 [BRAND NAME]             │
│      Programa de Fidelidad           │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Nombre: Juan Pérez          │   │
│  │  Puntos: 142                 │   │
│  │  Tier: 🥉 Bronce             │   │
│  └─────────────────────────────┘   │
│                                     │
│  [████████████░░░░░░] 142/150 pts  │
│                                     │
│  Próximo: 🥉 Bronce — Bebida gratis │
│                                     │
│  ┌─────────────────────────────┐   │
│  │                             │   │
│  │      [QR GIGANTE]           │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  🔴 DILE AL MESERO QUE TE ESCANEE  │
│                                     │
└─────────────────────────────────────┘
```

**Cambios propuestos:**

1. **Nueva ruta pública:** `/tarjeta?phone=3001234567`
   - Sin autenticación (accesible por URL).
   - Protegida por rate limiting en API (ya existe en Vercel).
   - El QR generado es **efímero** (JWT 30 min) o **semi-permanente** (token rotativo diario).

2. **Barra de progreso tipo "thermometer"**:
   - `h-8` (32px), bordes redondeados, gradiente del brand.
   - Marcas visuales en cada umbral de tier (líneas verticales).
   - Texto: `"142 pts — faltan 8 para Bronce 🥉"`.

3. **QR grande** (280px) con borde pulse.

4. **Botón "Agregar a pantalla de inicio"**:
   - Instrucciones visuales para iOS/Android.
   - URL simple para bookmark (sin parámetros complejos).

5. **Datos en tiempo real**:
   - Fetch a `/api/public/customer-card?phone=...` al cargar.
   - Actualización automática cuando el mesero registra una visita (polling 10s o WebSocket si existe).

---

### 2.5 — Progreso de Puntos: Ultra Visual

**Archivos:** `PointsDisplay.tsx`, `TiersRoadmap.tsx`, tarjeta digital

**Cambios propuestos:**

1. **Barra de progreso principal** (en QR y en tarjeta):
   - Tamaño: `h-8` (32px) en lugar de `h-3`.
   - Gradient background: `#f59e0b → #E63946`.
   - Texto centrado en la barra: `"142 de 150 pts"` (blanco, bold, 14px).
   - Marcadores de tier: líneas verticales blancas en cada umbral (150, 350, 600, 1000).
   - Tooltip/marca: `"🥉 Bronce"` encima del marcador de 150.

2. **Animación de "ganaste puntos"** (en `CheckInSuccess`):
   - Cuando el mesero escanea y el polling detecta la visita:
     - Flash verde en toda la pantalla (0.3s).
     - Números flotando hacia arriba: `+58 pts` con animación de "levitación".
     - Barra se llena visualmente en 1s.

3. **Puntos por visita más evidentes**:
   - En `PointsDisplay`: badge `"+58 pts"` con fondo gradiente, 24px font.
   - Texto: `"Hoy sumaste +58 pts"` en lugar de `"Sumaste hoy"`.

---

## 3. Archivos que se Modificarían

| Archivo | Cambio | Líneas aprox |
|---------|--------|-------------|
| `src/components/features/check-in/CheckInForm.tsx` | Re-diseñar `customer_qr` step, mejorar `RewardsPreview` | +80/-40 |
| `src/components/features/check-in/PointsDisplay.tsx` | Barra gigante, animaciones, texto centrado | +30/-20 |
| `src/components/features/check-in/TiersRoadmap.tsx` | Marcadores de tier en barra, emojis grandes | +20/-10 |
| `src/app/(dashboard)/dashboard/staff/page.tsx` | Acciones para dispositivos | +40/-5 |
| `src/app/api/dashboard/staff/device/route.ts` (nuevo) | PATCH/DELETE de dispositivos | ~80 líneas |
| `src/app/(public)/tarjeta/page.tsx` (nuevo) | Tarjeta digital de fidelidad | ~200 líneas |
| `src/app/api/public/customer-card/route.ts` (nuevo) | API para datos de tarjeta | ~60 líneas |
| `src/lib/branding.ts` | Posiblemente agregar color de barra | 0-5 líneas |

---

## 4. Decisiones Pendientes

1. **¿El QR de la tarjeta es efímero (30 min) o semi-permanente?**
   - Efímero = más seguro, pero el cliente debe re-escanear cada vez.
   - Semi-permanente (token diario) = más usable, pero requiere lógica de rotación.

2. **¿La tarjeta se accede por URL con teléfono en claro (`/tarjeta?phone=...`) o por token corto (`/tarjeta?t=abc123`)?**
   - Teléfono en claro = simple pero expone datos.
   - Token = más seguro pero requiere enviar el token al cliente vía WhatsApp.

3. **¿El progreso usa puntos exactos o se redondea a "visitas equivalentes"?**
   - Puntos exactos = preciso pero abstracto.
   - "Visitas equivalentes" = más intuitivo pero menos preciso.

---

*Documento generado para aprobación antes de implementación.*
