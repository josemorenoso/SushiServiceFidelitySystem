# Feature: Dashboard Métricas — Rediseño Visual Premium

> **Estado:** En desarrollo
> **Versión:** 1.0
> **Creado:** 2026-04-11
> **Archivos clave:** `src/app/(dashboard)/`, `src/components/dashboard/`, `src/components/layout/`
> **Depende de:** `docs/features/design-system.md`, `docs/features/dashboard.md`

---

## Descripción

Rediseño visual del panel de métricas del dashboard administrativo, elevando la experiencia a nivel "consola de mando de hotel 5 estrellas". Cada interacción visual tiene consecuencia inmediata y satisfactoria. Cada sombra es casi invisible. Cada transición es fluida.

---

## 1. Layout General (Estructura "Airy")

### Contenedor Principal
```css
.dashboard-bg {
  background-color: #F9F8F6;
  background-image: radial-gradient(ellipse at center, #ffffff 0%, #F9F8F6 70%);
}
```
Gradiente radial muy suave: blanco puro en el centro → marfil en los bordes. Genera profundidad sin color.

### Sidebar — Glassmorphism
```css
.glass-sidebar {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 4px 0 30px rgba(0, 0, 0, 0.03);
  border-right: none;
}
```

### Header — Glassmorphism
```css
.glass-header {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.03);
  border-bottom: none;
}
```

### Spacing
- Gap mínimo entre cards principales: `32px` (`gap-8`)
- Padding del contenedor principal: `p-8` en desktop

---

## 2. Cards de Métricas — "Dopamina Instantánea"

### Hover Elevation
```css
.metric-card {
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
.metric-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08);
}
```

### Tipografía de Números
```css
font-family: var(--font-inter);
font-weight: 700;
letter-spacing: -0.05em;
```

### Micro-gráficos (Sparklines)
- Componente: `MiniSparkline` (inline SVG)
- Técnica: `pathLength="1"` + `stroke-dasharray: 1` + `stroke-dashoffset` animado de 1 → 0
- Duración: `1.5s ease-out`
- Tipos de tendencia: `up`, `stable`, `down`
- Colores: heredados del color de acento de cada métrica

### Config por métrica
| Métrica | Icono | Color acento | Sparkline |
|---------|-------|--------------|-----------|
| Visitas Hoy | TrendingUp | `#10b981` (emerald) | `up` |
| QR Hoy | QrCode | `#3b82f6` (blue) | `stable` |
| Domicilios Hoy | ShoppingBag | `#8b5cf6` (purple) | `up` |
| Nuevos Hoy | UserPlus | `#06b6d4` (cyan) | `up` |
| Total Clientes | Users | `#6366f1` (indigo) | `up` |
| Frecuentes | Star | `#f59e0b` (amber) | `stable` |
| Cumpleaños | Cake | `#ec4899` (pink) | `stable` |

---

## 3. Clientes en Riesgo — "Bubble Interaction"

### Float Animation
```css
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-8px); }
}
```
Cada burbuja flota con duración diferente: `3s`, `3.7s`, `4.3s` para asincronía natural.

### Spring Expansion al Click
```css
@keyframes bubble-pop {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.15); }
  70%  { transform: scale(0.95); }
  100% { transform: scale(1.08); }
}
animation: bubble-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Quick Action Popover
- Se muestra al hacer click en una burbuja (Dialog de shadcn)
- Estilos premium: sin border duro, sombra difusa
- Botón "Enviar invitación": gradiente carmesí `#FF4D6D → #E63946`
- Lista de clientes en riesgo con scroll interno

### Colores pasteles desaturados
| Nivel | Color burbuja |
|-------|---------------|
| En Riesgo | `rgba(252, 165, 165, 0.6)` — rojo pastel |
| Perdidos | `rgba(253, 186, 116, 0.6)` — naranja pastel |
| Críticos | `rgba(167, 139, 250, 0.6)` — violeta pastel |

---

## 4. Gráficos y Tablas

### Barras (GrowthChart)
- `radius={[8, 8, 0, 0]}` — bordes redondeados superiores
- Barras actuales: color principal
- Barras "mes pasado" (si aplica): `opacity: 0.12` del color principal

### Tabla PowerRanking
- Sin bordes de celda (`border: none`)
- Hover por fila: `background: rgba(249, 248, 246, 0.8)`
- Transición: `200ms ease`
- Clase: `.ranking-row`

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/app/globals.css` | Clases `.dashboard-bg`, `.glass-sidebar`, `.glass-header`, `.metric-card`, `.ranking-row`, keyframes `float`, `bubble-pop` |
| `src/app/(dashboard)/layout.tsx` | Aplicar `.dashboard-bg` al main, `glass-*` a sidebar/header |
| `src/components/layout/DashboardSidebar.tsx` | Clase `.glass-sidebar`, íconos thin |
| `src/components/layout/DashboardHeader.tsx` | Clase `.glass-header` |
| `src/components/dashboard/MetricsCards.tsx` | `.metric-card`, `MiniSparkline`, tipografía de números |
| `src/components/dashboard/AtRiskBubbles.tsx` | Float animation, spring click, colores pastel, Dialog premium |
| `src/components/dashboard/GrowthChart.tsx` | `radius={[8, 8, 0, 0]}` en barras |
| `src/components/dashboard/PowerRanking.tsx` | Sin bordes, `.ranking-row` hover |

---

## Componentes nuevos

### `MiniSparkline`
Ubicación: `src/components/dashboard/MiniSparkline.tsx`
```tsx
interface MiniSparklineProps {
  trend: 'up' | 'down' | 'stable'
  color: string
}
```
SVG inline de 60x24px con path animado (stroke-dashoffset 1→0 en 1.5s).

---

## Notas de implementación

- `backdrop-filter` requiere que el fondo del contenedor padre NO sea `overflow: hidden` sin background — verificar en el layout.
- Las burbujas usan `animation-delay` diferente por índice para crear asincronía en el float.
- El spring animation se activa añadiendo/quitando una clase CSS vía `useState`.
- **No se modifica** la lógica de negocio ni los hooks de datos. Solo UI.
