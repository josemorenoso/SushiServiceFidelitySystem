# Feature: QR Studio (Generador de QR personalizable para imprimir)

> **Estado:** Implementado (v1.6.0)
> **Archivos clave:** `src/app/(dashboard)/dashboard/qr/page.tsx`, `src/lib/utils/qr-poster.ts`
> **Dependencias:** `qrcode` (ya instalada) — todo el render es client-side con `<canvas>`, sin servicios externos

---

## Descripción
Evolución de la página "Código QR por Mesa" a un **QR Studio**: el dueño del negocio genera material imprimible (QR de mesa, póster, cartel) **dopaminico y vistoso** sin necesidad de un diseñador, eligiendo:

1. **Tema visual** según el tipo de negocio (patrón de iconos de fondo + paleta de colores)
2. **Tamaño de impresión** a 300 DPI (mesa, A5, A4 póster, A3 cartel, cuadrado para pizarra)
3. **Textos personalizables** (titular gancho + subtítulo)
4. Color de acento, logo y número de mesa (ya existentes)

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

## Persistencia
Preferencias en `localStorage` (igual que antes): `qr_color`, `qr_logo_dataurl` + nuevas `qr_theme`, `qr_size`, `qr_headline`, `qr_subline`.

## Componentes / Archivos
| Archivo | Responsabilidad |
|---------|----------------|
| `src/lib/utils/qr-poster.ts` | Lógica pura de render: temas, tamaños, `composeQrPoster()` |
| `src/app/(dashboard)/dashboard/qr/page.tsx` | UI del QR Studio (selección de tema/tamaño/textos, preview, descargas) |

## Restricciones
- El logo sigue limitado a 500 KB (se superpone al centro del QR, ECC `H` tolera 30% de oclusión).
- "Descargar todas las mesas" usa el tema/tamaño seleccionados.
- Los emojis del patrón se renderizan con la fuente del sistema operativo — pueden variar levemente entre equipos (no afecta el QR).

## Pendiente
- [ ] (Futuro) Subir patrones/imágenes de fondo propias del cliente
- [ ] (Futuro) Export a PDF multi-página con todas las mesas
