# Feature: Design System Premium — "The Hospitality Editorial"

> **Estado:** Activo (en evolución)
> **Versión:** 1.1 — los colores pasan a variables CSS sustituibles por tenant (§5/§6)
> **Creado:** 2026-04-11 · **Actualizado:** 2026-09-06
> **Archivos clave:** `src/app/globals.css`, `src/app/layout.tsx`, `src/lib/brand-css.ts`
> **Referencia de diseño:** `Changes/DESIGN.md` · **Personalización por marca:** [`identidad-visual.md`](identidad-visual.md)

---

## Descripción

Sistema de diseño visual premium orientado a la hostelería de lujo. El concepto rector es **"The Digital Maître d'"**: una interfaz que se siente como un servicio, no como una herramienta. Implementado con TailwindCSS v4 + clases CSS premium no capas.

---

## Fuentes

| Rol | Fuente | Variable CSS | Pesos |
|-----|--------|--------------|-------|
| Títulos / Display | Playfair Display | `--font-playfair-display` | 400, 600, 700 |
| Cuerpo / Botones | Inter | `--font-inter` | Variable (300–700) |
| Código | Geist Mono | `--font-geist-mono` | — |

**Uso:**
- Clase `font-playfair` → aplica Playfair Display
- `letter-spacing: -0.02em` en Display y Headline
- `letter-spacing: 0.05em` + `text-transform: uppercase` en labels/metadata

---

## Paleta de Colores

**Desde §5/§6 son variables CSS, no literales.** Los valores no cambiaron: lo que cambió es que
ahora se pueden sustituir por tenant. Ver [`identidad-visual.md`](identidad-visual.md).

| Variable CSS | Hex | Uso | ¿La marca la puede cambiar? |
|---|---|---|---|
| `--brand-surface` | `#F9F8F6` | Fondo base (marfil suave) | ✅ |
| `--brand-primary` | `#FF4D6D` | Inicio gradiente botón CTA | ✅ |
| `--brand-primary-end` | `#E63946` | Fin gradiente botón CTA | ✅ |
| `--brand-on-primary` | `#ffffff` | Texto ENCIMA del gradiente | derivado (`onColor()`) |
| `--brand-ink` | `#1a1c1d` | Texto principal (nunca negro puro) | ✅ |
| `--brand-ink-soft` | `#6b7280` | Texto secundario | ❌ escala del sistema |
| `--brand-ink-muted` | `#9ca3af` | Texto terciario / placeholders | ❌ escala del sistema |
| `--brand-ink-faint` | `#d1d5db` | Texto de ayuda | ❌ escala del sistema |
| `--brand-radius` | `24px` | Radio de la card premium | ❌ |
| — | `rgba(226,190,192,0.35)` | Borde inputs (20% opacidad) | ❌ |

> ⚠️ **Un color nuevo en una clase premium se define en `:root` PRIMERO.** Un hex horneado dentro de
> la clase vuelve a ser un color que ninguna marca puede cambiar — el problema exacto que §5 vino a
> resolver. Lo mismo vale para un `style={{ color: "#…" }}` en una pantalla pública.

**Los grises no son de marca a propósito.** `--brand-ink-soft/-muted/-faint` son la escala tipográfica
del sistema: existen como variables para que las pantallas dejen de hornear hex, no para que cada
restaurante elija su gris. Solo se estampan por tenant las cuatro de arriba marcadas ✅.

---

## Clases CSS Premium

Definidas en `src/app/globals.css` fuera de `@layer` (mayor especificidad que Tailwind).

### `.premium-bg`
```css
background-color: #F9F8F6;
background-image: url("data:image/svg+xml,..."); /* noise SVG opacity 0.02 */
```
Fondo marfil con textura de ruido sutil (papel premium).

### `.premium-card`
```css
background: #ffffff;
border-radius: 24px;
box-shadow: 0 10px 40px rgba(0, 0, 0, 0.04);
border: none !important;
```
Card central flotante. Sombra ultra-difusa que imita luz natural.

### `.btn-premium`
```css
background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-end) 100%) !important;
color: var(--brand-on-primary) !important;
box-shadow: 0 4px 16px rgba(var(--brand-primary-end-rgb), 0.28);
transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1), ...
```
Hover: `scale(1.02)` + sombra más intensa. Disabled: `opacity: 0.65`.

### `.btn-secondary-premium`
```css
background: rgba(255, 255, 255, 0.85) !important;
backdrop-filter: blur(12px);
```
Botón secundario glassmorphism.

### `.input-premium`
```css
background: #ffffff !important;
border: 1px solid rgba(226, 190, 192, 0.35) !important;
```
Focus: `border-color: var(--brand-primary)` + glow `rgba(var(--brand-primary-rgb), 0.12)`.

---

## Animaciones

### `animate-fade-in-up`
```css
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
animation: fade-in-up 0.55s cubic-bezier(0.4, 0, 0.2, 1) both;
```
Aplicar en el contenedor principal de cada página pública para entrada suave.

---

## Reglas del Sistema (The "No-Line" Rule)

1. **Sin bordes duros** — Nunca `1px solid` para seccionar. Usar background shifts o box-shadow.
2. **Sin negro puro** — Siempre `#1a1c1d` como color de texto más oscuro.
3. **Sin sombras visibles** — Si se puede ver dónde termina la sombra, es muy oscura.
4. **Iconos ultra-thin** — `strokeWidth={1.25}` o `{1.5}` en lucide-react.
5. **Gradientes en CTAs** — Botones primarios siempre con gradiente, nunca flat fill.
6. **Ningún hex nuevo horneado en pantalla pública** — va a `:root` como `--brand-*` (§5/§6).

---

## Páginas que usan este sistema

| Página | Clases aplicadas |
|--------|-----------------|
| `src/app/page.tsx` | `.premium-bg`, `.premium-card`, `.btn-premium`, `font-playfair`, `animate-fade-in-up` |
| `src/app/(auth)/login/page.tsx` | `.premium-bg`, `.premium-card`, `.btn-premium`, `.input-premium` |
| `src/app/(public)/check-in/page.tsx` | `.premium-bg` |
| `CheckInForm.tsx` | `.premium-card`, `.btn-premium`, `.input-premium` |
| `CheckInSuccess.tsx` | `.premium-card`, `.btn-secondary-premium` |
| `dashboard/marca/page.tsx` | Editor de la marca del tenant + vista previa en vivo (§5/§6) |

---

## Extensiones del Sistema (Dashboard)

Ver `docs/features/dashboard-metrics-redesign.md` para las extensiones aplicadas al panel administrativo: glassmorphism en sidebar/header, hover elevation en cards de métricas, float animation en burbujas, etc.
