# Feature: Design System Premium — "The Hospitality Editorial"

> **Estado:** Activo (en evolución)
> **Versión:** 1.0
> **Creado:** 2026-04-11
> **Archivos clave:** `src/app/globals.css`, `src/app/layout.tsx`
> **Referencia de diseño:** `Changes/DESIGN.md`

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

| Token | Hex | Uso |
|-------|-----|-----|
| `ivory` | `#F9F8F6` | Fondo base (marfil suave) |
| `primary-start` | `#FF4D6D` | Inicio gradiente botón CTA |
| `primary-end` | `#E63946` | Fin gradiente botón CTA |
| `on-surface` | `#1a1c1d` | Texto principal (nunca negro puro) |
| `on-surface-variant` | `#6b7280` | Texto secundario |
| `muted` | `#9ca3af` | Texto terciario / placeholders |
| `ghost-border` | `rgba(226,190,192,0.35)` | Borde inputs (20% opacidad) |

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
background: linear-gradient(135deg, #FF4D6D 0%, #E63946 100%) !important;
color: #ffffff !important;
box-shadow: 0 4px 16px rgba(230, 57, 70, 0.28);
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
Focus: `border-color: #FF4D6D` + glow `rgba(255,77,109,0.12)`.

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

---

## Páginas que usan este sistema

| Página | Clases aplicadas |
|--------|-----------------|
| `src/app/page.tsx` | `.premium-bg`, `.premium-card`, `.btn-premium`, `font-playfair`, `animate-fade-in-up` |
| `src/app/(auth)/login/page.tsx` | `.premium-bg`, `.premium-card`, `.btn-premium`, `.input-premium` |
| `src/app/(public)/check-in/page.tsx` | `.premium-bg` |
| `CheckInForm.tsx` | `.premium-card`, `.btn-premium`, `.input-premium` |
| `CheckInSuccess.tsx` | `.premium-card`, `.btn-secondary-premium` |

---

## Extensiones del Sistema (Dashboard)

Ver `docs/features/dashboard-metrics-redesign.md` para las extensiones aplicadas al panel administrativo: glassmorphism en sidebar/header, hover elevation en cards de métricas, float animation en burbujas, etc.
