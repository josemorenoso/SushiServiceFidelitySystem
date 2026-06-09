# Spec — Fidelización Visual Fase 1 ("A prueba de imbéciles")

> **Estado:** ✅ Diseño aprobado — listo para plan de implementación
> **Fecha:** 2026-06-08
> **Versión objetivo:** v1.3.0
> **Base:** `docs/features/visual-loyalty-ux-audit.md` (auditoría previa)
> **Restricción:** NO push/PR a GitHub. Todo local.

---

## 0. Objetivo

El cliente promedio NO entiende el sistema: escanea el QR, ve su código, no sabe que debe
mostrárselo al mesero, lo cierra y se va → **visitas fantasma** (cliente registrado, 0 visitas
contadas). La competencia usa tarjetas Apple/Google Wallet con nombre, sellos de visita y QR:
algo visual e inmediato.

**Meta Fase 1:** que al escanear el QR el cliente vea algo tan claro y gamificado que (a) entienda
que debe pedirle al mesero que lo escanee, y (b) sienta dopamina por su progreso. Sin pasos extra,
sin texto gris, sin ambigüedad.

**Premisa de diseño:** asumir cero atención y cero lectura. Jerarquía visual brutal: una sola
acción dominante por pantalla.

---

## 1. Alcance

### Incluido (Fase 1)
- **A.** Rediseño del step `customer_qr` → tarjeta tipo wallet con banner imperativo, QR grande,
  sellos de visitas, termómetro de puntos y dopamina al confirmar.
- **B.** Premios grandes y entendibles en el registro (rediseño de `RewardsPreview`), mostrando el
  rango variable de puntos por visita como gatillo de gamificación.
- **C.** Revocar/eliminar dispositivos de confianza desde el dashboard de staff.

### Excluido (Fase 2 — documentado, NO se construye ahora)
- Tarjeta digital permanente accesible fuera del check-in.
- Envío de tarjeta/perfil por WhatsApp con link permanente.
- Tarjetas/cupones personalizados creados desde el dashboard para recompensas específicas.

---

## 2. Hechos del backend (verificados en código)

No se requieren APIs nuevas para A; sí un endpoint nuevo para C y un cambio mínimo para B.

- `POST /api/check-in` acción `lookup` ya devuelve:
  `customer { id, name, total_visits, current_tier, total_points }` y `qr_token`.
  → [src/app/api/check-in/route.ts:253-265](../../src/app/api/check-in/route.ts)
- `GET /api/public/reward-tiers` devuelve array de
  `{ tier_name, point_threshold, safe_reward_title, is_black, sort_order }`.
  → [src/app/api/public/reward-tiers/route.ts](../../src/app/api/public/reward-tiers/route.ts)
- El polling que detecta cuando el mesero registra la visita YA existe (cada 5s) en
  [CheckInForm.tsx:144-186](../../src/components/features/check-in/CheckInForm.tsx).
- Rango de puntos por visita vive en `admin_settings` con claves
  `points_per_visit_min` / `points_per_visit_max`.
  → [src/services/points.service.ts:97-106](../../src/services/points.service.ts)

**Cálculo de "próximo premio" y progreso:** se hace 100% en el cliente combinando `total_points`
(del lookup) con los `point_threshold` de los tiers (del endpoint público). No hay estado nuevo en DB.

---

## 3. Sección A — Tarjeta wallet en `customer_qr`

**Archivo:** `src/components/features/check-in/CheckInForm.tsx` (step `customer_qr`, líneas ~547-611).
Se extrae a un componente propio `CustomerCard.tsx` para mantener el archivo enfocado (Mandamiento II
y VI: separar responsabilidades; el archivo ya es grande).

### Layout (de arriba a abajo)
1. **Header de branding:** logo + nombre del local (usar `BRAND_NAME` de `@/lib/branding`).
2. **Saludo:** `¡Hola, {name}!` (grande, font-playfair).
3. **Banner imperativo (la acción dominante):**
   - Fondo `#E63946`, texto blanco 18px bold, centrado, esquinas redondeadas.
   - Icono `ScanLine` (Lucide) con `animate-pulse`.
   - Copy: **"DILE AL MESERO QUE TE ESCANEE ESTE QR"** + subtexto "Si no, NO sumás puntos".
4. **QR:** `QRCodeSVG` a **270px** (sube de 240), envuelto en borde rojo con `animate-pulse`.
5. **Termómetro de puntos (héroe del progreso):**
   - Barra `h-8` (32px), gradiente `#f59e0b → #E63946`, esquinas redondeadas.
   - Texto superpuesto centrado: `"{total_points} / {nextThreshold} pts"` (blanco, bold).
   - Animación de llenado al montar (≈1.2s ease-out).
   - Debajo: emoji del próximo tier + `"Te faltan {N} pts: {safe_reward_title}"`.
   - Si ya es el tier máximo (no hay próximo): barra llena + "¡Nivel máximo! 🎉".
   - **Decisión del usuario:** NO se muestran sellos de visitas (confunden con los puntos).
     El progreso es solo por puntaje.
6. **Próximas recompensas (camino completo):** reusar el componente existente
   [`TiersRoadmap`](../../src/components/features/check-in/TiersRoadmap.tsx) debajo del termómetro,
   pasándole `tiers` + `total_points`. Ya muestra cada tier con estado (alcanzado/próximo/bloqueado),
   pts que faltan, premio seguro y si tiene Mystery Box. Así el cliente ve TODO lo que viene, no solo
   el siguiente premio.
7. **Expira en 30 minutos:** texto chico, gris claro (se conserva).
8. **Volver:** texto gris, sin fondo, peso mínimo (se conserva, des-enfatizado).

### Dopamina al confirmar
El polling existente llama `onCheckInSuccess` cuando el mesero registra. **Antes** de la transición a
`CheckInSuccess`, mostrar un overlay full-screen ~1.5s:
- Flash verde + `"✅ ¡Listo!"` + `"+{points_awarded} pts"` flotando hacia arriba.
- Luego continúa el flujo normal a `CheckInSuccess`.

Implementación: estado local `justConfirmed` en el componente de la tarjeta; al detectar visita en el
polling, set `justConfirmed` con los puntos, esperar la animación, luego invocar `onCheckInSuccess`.
El `points_awarded` ya viene en la respuesta del status poll (`data.points_awarded`).

### Datos que necesita el componente
- Del lookup: `name`, `total_visits`, `total_points`, `current_tier`.
- De `/api/public/reward-tiers`: lista de tiers (ya se fetchea en `CheckInForm` para `previewTiers`;
  se pasa por props para no duplicar fetch).
- **Cambio mínimo backend:** `TiersRoadmap` requiere `mystery_box_enabled` por tier, que hoy el
  endpoint público NO incluye. Agregar `mystery_box_enabled` al payload de
  `/api/public/reward-tiers` (campo no sensible). Actualizar el tipo `TierPreview` en
  `CheckInForm.tsx` y `RewardsPreview.tsx` para incluirlo (opcional, default false).

---

## 4. Sección B — Premios grandes en el registro

**Archivo:** `src/components/features/check-in/RewardsPreview.tsx` (rediseño) + mostrarlo también en
el step `register` (hoy solo aparece en `phone`).

### Cambios
1. **Título grande:** "Ganás premios reales en cada visita 👇".
2. **Tarjetas grandes en carrusel horizontal** (scroll-x en móvil), una por tier:
   - Emoji 40px (`getTierEmoji`), nombre del tier 18-20px bold.
   - Premio seguro (`safe_reward_title`).
   - Umbral en pts (`point_threshold`).
   - Mini-barra del color del tier (decorativa).
3. **Rango de puntos por visita (gamificación):** badge visible
   `"Cada visita: +{min} a +{max} pts"`. El copy enfatiza la variabilidad para activar el gatillo
   ("a veces ganás más y te acercás más rápido").
4. **Mystery Box explicada:** línea con 🎲 — "En cada premio elegís ir a la segura o arriesgar con la
   Mystery Box".

### Cambio backend mínimo para el rango
Exponer `points_per_visit_min` / `points_per_visit_max` de `admin_settings` de forma pública.
**Decisión:** NO romper la forma del endpoint actual (`/api/public/reward-tiers` devuelve un array y
`RewardsPreview` lo consume así). Crear endpoint nuevo y liviano:
- `GET /api/public/points-range` → `{ min: number, max: number }`.
- Rate-limited igual que el de tiers. Cache 60s. Fallback a defaults si falla.
- `RewardsPreview` (o `CheckInForm`) lo fetchea y pasa por props.

---

## 5. Sección C — Revocar/eliminar dispositivos

**Archivo UI:** `src/app/(dashboard)/dashboard/staff/page.tsx` (tabla de dispositivos ~líneas 445-483).
**Archivo API nuevo:** `src/app/api/dashboard/staff/device/route.ts`.

### UI
- Agregar columna **"Acciones"** a la tabla de dispositivos.
- **Revocar** (soft): visible si `is_trusted = true`. Pone `is_trusted = false`. El dispositivo deja
  de poder registrar visitas (la API de check-in ya exige `is_trusted = true`).
- **Eliminar** (hard): visible si `is_trusted = false` (ya revocado). Borra la fila.
- Ambos con confirmación (`Dialog`/confirm existente en la página — reusar patrón de `confirmDelete`
  de meseros).

### API
Seguir el patrón de auth del resto de `/api/dashboard/*` (sesión de dashboard, no pública).
- `PATCH /api/dashboard/staff/device` body `{ device_id }` → set `is_trusted = false`.
- `DELETE /api/dashboard/staff/device?id={device_id}` → delete (solo si ya `is_trusted = false`).
- Validar que el `device_id` exista. Responder 200/404/403 según corresponda.

---

## 6. Estilos y convenciones

- TailwindCSS para clases en JSX; lógica de cálculo (próximo tier, %, sellos) en funciones puras
  separadas dentro del componente o en un helper. (Mandamiento II)
- TypeScript estricto, sin `any`. (Mandamiento IX)
- Reusar `@/lib/branding`, `@/lib/tier-emojis`, componentes UI existentes.
- Nada hardcodeado que deba ser configurable (rango de puntos viene de settings).

---

## 7. Criterios de aceptación

- [ ] Al escanear el QR como cliente existente, la pantalla muestra: banner rojo imperativo, QR ≥270px,
      sellos de visitas, termómetro con puntos reales y próximo premio. (A)
- [ ] El banner "dile al mesero que te escanee" es el elemento de mayor jerarquía visual. (A)
- [ ] Cuando el mesero registra la visita, el cliente ve la animación de "+X pts" antes del éxito. (A)
- [ ] En el registro (phone y register), los premios se ven como tarjetas grandes con emoji, premio,
      pts, y el rango "+min a +max pts" por visita. (B)
- [ ] La Mystery Box está explicada en el registro. (B)
- [ ] El dashboard permite Revocar y Eliminar dispositivos de confianza, con confirmación. (C)
- [ ] Un dispositivo revocado ya no puede registrar visitas. (C)
- [ ] `npm run build` / typecheck pasan sin errores. No se sube nada a GitHub.

---

## 8. Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `src/components/features/check-in/CustomerCard.tsx` (nuevo) | Tarjeta wallet: banner + QR + termómetro + `TiersRoadmap` |
| `src/components/features/check-in/CheckInForm.tsx` | Usar `CustomerCard`, pasar tiers/datos por props |
| `src/components/features/check-in/RewardsPreview.tsx` | Rediseño tarjetas grandes + rango + mystery box |
| `src/app/api/public/reward-tiers/route.ts` | Agregar `mystery_box_enabled` al payload |
| `src/app/api/public/points-range/route.ts` (nuevo) | Exponer rango de puntos por visita |
| `src/app/(dashboard)/dashboard/staff/page.tsx` | Columna Acciones + revocar/eliminar dispositivos |
| `src/app/api/dashboard/staff/device/route.ts` (nuevo) | PATCH revocar / DELETE eliminar dispositivo |
| `docs/features/qr-checkin.md` | Actualizar UI/pantallas |
| `docs/features/dashboard.md` | Documentar gestión de dispositivos |
| `CHANGELOG.md` | Entrada v1.3.0 |

---

*Spec para aprobación del usuario antes de escribir el plan de implementación.*
