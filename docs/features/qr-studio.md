# Feature: QR Studio (Generador de QR personalizable para imprimir)

> **Estado:** Implementado (v1.7.0 — §3: la config deja de vivir en `localStorage`)
> **Archivos clave:** `src/app/(dashboard)/dashboard/qr/page.tsx`, `src/lib/utils/qr-poster.ts`
> **Hermano:** [`identidad-visual.md`](identidad-visual.md) — el logo y el color de la marca
> **Dependencias:** `qrcode` (ya instalada) — todo el render es client-side con `<canvas>`, sin servicios externos

---

## Descripción
Evolución de la página "Código QR por Mesa" a un **QR Studio**: el dueño del negocio genera material imprimible (QR de mesa, póster, cartel) **dopaminico y vistoso** sin necesidad de un diseñador, eligiendo:

1. **Tema visual** según el tipo de negocio (patrón de iconos de fondo + paleta de colores)
2. **Tamaño de impresión** a 300 DPI (mesa, A5, A4 póster, A3 cartel, cuadrado para pizarra)
3. **Textos personalizables** (titular gancho + subtítulo)
4. Color de acento y número de mesa (ya existentes). **El logo ya no es de esta página**: es el de la
   marca, se administra en `/dashboard/marca` (§6) y acá solo se muestra cuál se va a estampar

## Objetivo
Eliminar la dependencia de diseñar un material nuevo para cada cliente del modelo clone-por-cliente. Cada restaurante/barbería/café arma su pieza en minutos desde el dashboard.

## Temas disponibles (`QR_THEMES`)
| ID | Negocio | Patrón de fondo (emojis) | Paleta |
|----|---------|--------------------------|--------|
| `restaurante` | Restaurante | 🍽️ 🍷 🔥 🥘 | Rojo cálido sobre crema |
| `barberia` | Barbería | 💈 ✂️ 🪒 | Azul marino + rojo barber |
| `cafe` | Café | ☕ 🥐 🫘 | Café/marrón sobre beige |
| `bar` | Bar / Cocteles | 🍸 🍹 🍻 | Violeta neón sobre oscuro |
| `pizzeria` | Pizzería | 🍕 🧀 🍅 | Verde/rojo italiano |
| `sushi` | Sushi | 🍣 🥢 🍱 | Negro + rojo japonés |
| `postres` | Postres / Heladería | 🍰 🍦 🧁 | Rosa pastel |
| `elegante` | Premium / BLACK | ✦ ✧ ★ | Negro + dorado |

Cada tema define: fondo, opacidad/iconos del patrón, gradiente del header, color del QR, color de textos y fondo de la tarjeta del QR.

## Tamaños de impresión (`QR_SIZES`) — 300 DPI
| ID | Uso | Físico | Píxeles |
|----|-----|--------|---------|
| `mesa` | Tent card / mesa | 10×15 cm | 1181×1772 |
| `cuadrado` | Sticker / pizarra | 12×12 cm | 1417×1417 |
| `a5` | Media carta | 14.8×21 cm | 1748×2480 |
| `a4` | Póster | 21×29.7 cm | 2480×3508 |
| `a3` | Cartel grande | 29.7×42 cm | 3508×4961 |

> El render es proporcional: el layout se calcula en unidades relativas al ancho/alto del canvas, por lo que cualquier tamaño sale nítido. Costo de cómputo: solo el canvas del navegador (sin tokens externos).

## Layout del póster (de arriba hacia abajo)
1. Fondo del tema + patrón de emojis en grilla diagonal (baja opacidad)
2. Nombre del negocio (header, color del tema)
3. **Titular gancho** editable (default: "¡GANA PREMIOS GRATIS!") — grande, color de acento
4. Subtítulo editable (default: "Escanea, regístrate y suma puntos en cada visita")
5. Tarjeta blanca redondeada con sombra que contiene el **QR** (+ logo al centro, ECC H)
6. CTA: "Sólo escanea el QR y regístrate"
7. Etiqueta de mesa (MESA N / GENERAL) prominente

## Persistencia — §3

**Antes:** seis claves de `localStorage` (`qr_color`, `qr_logo_dataurl`, `qr_theme`, `qr_size`,
`qr_headline`, `qr_subline`). El diseño que el restaurante mandó a imprenta se perdía al cambiar de
equipo, de navegador o al limpiar el caché, y nadie podía reimprimir la misma pieza.

**Ahora:** `tenants.config.qr_studio` (`theme`, `size`, `accent`, `headline`, `subline`, `tables`),
por `PUT /api/dashboard/tenant-config` con un botón **"Guardar diseño"** explícito. Viaja con la
cuenta.

**Migración de lo que había:** la primera vez que se abre la página sin config en el servidor, se
sube lo que hubiera en `localStorage` y después se limpian esas claves. Si la subida falla, el
`localStorage` **se deja donde está** — es lo único que queda del diseño y borrarlo sería perderlo.
`qr_logo_dataurl` solo se borra: su reemplazo es `branding.logo_url`.

> ⚠️ `loadImage()` de `qr-poster.ts` pone `crossOrigin = 'anonymous'` en las imágenes remotas. El
> póster se arma en un `<canvas>` y se exporta con `toDataURL()`; dibujar ahí una imagen de otro
> origen sin permiso CORS deja el canvas *tainted* y `toDataURL()` lanza `SecurityError`, tirando la
> descarga entera. Con el logo en un data URL nunca pasó; con el logo en Storage, pasa siempre. En
> los data URL no se toca.

## Componentes / Archivos
| Archivo | Responsabilidad |
|---------|----------------|
| `src/lib/utils/qr-poster.ts` | Lógica pura de render: temas, tamaños, `composeQrPoster()` |
| `src/app/(dashboard)/dashboard/qr/page.tsx` | UI del QR Studio (selección de tema/tamaño/textos, preview, descargas) |
| `src/lib/tenant-config-paths.ts` | Valida `qr_studio.*` en el server. ⚠️ Su `QR_THEME_IDS` / `QR_SIZE_IDS` son **espejo** de `QR_THEMES` / `QR_SIZES`: se cambian los dos lados o ninguno (hay un test que los compara) |

## Restricciones
- El logo lo acota la ruta de subida (`/api/dashboard/brand-logo`): entrada de hasta 8 MB, guardado
  como PNG de 512 px como máximo. Se superpone al centro del QR, ECC `H` tolera 30 % de oclusión.
- El número de mesas está acotado a 1–200 en el server (`qr_studio.tables`).
- "Descargar todas las mesas" usa el tema/tamaño seleccionados.
- Los emojis del patrón se renderizan con la fuente del sistema operativo — pueden variar levemente entre equipos (no afecta el QR).

## Pendiente
- [x] ~~Persistir la config por tenant~~ → hecho en §3 (2026-09-06)
- [ ] (Futuro) Subir patrones/imágenes de fondo propias del cliente
- [ ] (Futuro) Export a PDF multi-página con todas las mesas
