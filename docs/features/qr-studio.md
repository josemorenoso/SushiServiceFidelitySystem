# Feature: QR Studio (el QR imprimible de cada sede)

> **Estado:** Implementado (v1.8.0 — el Studio se reduce a **una sede, un QR, en SVG**)
> **Archivos clave:** `src/app/(dashboard)/dashboard/qr/page.tsx`, `src/lib/utils/qr-svg.ts`,
> `src/app/api/dashboard/qr-locations/route.ts`
> **Decisiones que lo gobiernan:** [`DECISIONES-QR-Y-SEDE-2026-09-06.md`](../DECISIONES-QR-Y-SEDE-2026-09-06.md) — D-QR-1, D-QR-3 y D-QR-4
> **Hermanos:** [`multi-sede.md`](multi-sede.md) (de dónde sale la sede) · [`staff-qr-scan.md`](staff-qr-scan.md) (dónde vive ahora la mesa)
> **Dependencias:** `qrcode` (ya instalada). Todo el render es client-side, sin servicios externos.

---

## Qué hace hoy

Elegís una **sede** y bajás su QR de check-in en **SVG** (y en PNG, como respaldo). Nada más.

Un SVG es vector: no tiene resolución. El mismo archivo sirve para un sticker de 5 cm y para una
pancarta de 3 m. El diseño de la pieza lo arma quien sepa —el diseñador del restaurante, Canva, la
imprenta— con el QR adentro.

## Por qué hace MENOS que antes

Hasta el 2026-09-06 esta pantalla armaba pósters completos: 8 temas de negocio, 5 tamaños de
impresión a 300 DPI, titular, subtítulo, color de acento, logo al centro y **un QR distinto por cada
mesa**, todo dibujado en un `<canvas>`.

**Veredicto del dueño:** *"la gente no va a imprimir con los diseños, es muy básico"*. Eran 583
líneas sosteniendo algo que nadie mandaba a imprenta.

### El póster está EN PAUSA, no borrado (D-QR-3)

| Qué | Dónde quedó |
|---|---|
| `src/lib/utils/qr-poster.ts` | **Intacto en el repo.** Ya no lo importa ninguna pantalla; sí lo sigue usando el test espejo de la whitelist |
| `qr_studio.theme/size/accent/headline/subline/tables` | **Siguen en la whitelist** de `src/lib/tenant-config-paths.ts` y **siguen guardados** en `tenants.config` de los tenants que ya los tenían. Nada se borró |
| `QR_THEME_IDS` / `QR_SIZE_IDS` | Siguen siendo espejo de `QR_THEMES` / `QR_SIZES`, con su test |

Volver a encender los diseños es revertir un commit, no reconstruir una feature. **El rediseño
visual del QR queda fuera de alcance** hasta que el dueño lo defina.

## Un QR por SEDE, y por qué no hay alternativa (D-QR-1)

> *"si todos los primeros escaneos son libres, no se va a saber de ninguna manera en qué sede están"*

Un cliente **nuevo** no tiene tarjeta digital, así que **no hay ningún QR de cliente que el mesero
pueda escanear**. Su primera visita es obligatoriamente el flujo del cartel (`/check-in`), y ahí el
cartel es la **única** señal de sede que existe.

**La sede se resuelve del HOST, nunca de un parámetro.** No existe ni va a existir `?sede=`. Por eso
el QR de una sede es su subdominio:

```
https://laureles.clubsushx.constelarys.com/check-in
```

### Una sede sin subdominio no tiene QR, y la pantalla lo dice

`checkInUrlForDomain()` devuelve `null` si la sede no tiene `domain`, y la pantalla la muestra
**deshabilitada** con un aviso.

⚠️ **No es una restricción cosmética.** Con 2+ sedes activas, el dominio **raíz** deja de registrar
clientes nuevos: `pickLocationForHost()` devuelve `requiresChoice` y `/api/check-in` responde **409**
pidiendo elegir sede. Un QR impreso sobre el dominio raíz sería un cartel que **no registra a
nadie** — y eso no se descubre hasta que ya está pegado en la pared.

La sede principal de cada tenant vivo **ya tiene** subdominio: la `00042` le copió el `tenants.domain`
que ya está impreso en los QR viejos (cero reimpresión). Las sedes nuevas reciben el suyo al darlas
de alta (F8, wizard del AIOS).

## La mesa ya no está acá (D-QR-4)

El QR por mesa codificaba `?mesa=N` y terminaba en `visits.table_number`. **Ese dato no se perdió: se
mudó.** Ahora la mesa la elige el **mesero** al escanear, en `/mesero/confirm` — entrada numérica,
**opcional, nunca bloquea el check-in**.

- `visits.table_number` y la migración `00009` **no se tocan**: el histórico vive ahí.
- `CheckInForm.tsx` **sigue leyendo `?mesa=N`** de la URL. Es compatibilidad, no una feature viva:
  hay carteles por mesa ya pegados en mesas reales y mientras existan siguen trayendo su número.
  **No es código muerto — está comentado como tal para que nadie lo borre.**
- En el autoservicio (cliente escaneando el cartel) la mesa ya no se conoce, y está bien: la mesa
  solo se sabe cuando hay un mesero de por medio.

## Tres decisiones del archivo que parecen estéticas y no lo son

1. **Negro sobre blanco.** Máximo contraste, y es lo que mejor imprime cualquier imprenta. El color
   de la marca va en el diseño **alrededor** del QR: un acento claro sobre fondo claro es un código
   que no escanea, y se descubre tarde.
2. **Corrección de errores `H`** (~30% recuperable). Es lo que deja meter un logo en el centro sin
   romper el código. El archivo sale preparado aunque el rediseño no esté hecho.
3. **Quiet zone de 4 módulos.** Es lo que exige la norma. Recortarla es la causa número uno de un QR
   impreso que no escanea.

El `<svg>` sale con `width`/`height` en **milímetros** *y* con su `viewBox` intacto: solo el viewBox
lo deja a merced de cada programa, solo las medidas lo vuelven rígido. Las dos cosas juntas.

## Componentes / Archivos
| Archivo | Responsabilidad |
|---------|----------------|
| `src/lib/utils/qr-svg.ts` | Puro: `buildQrSvg()`, `buildQrPngDataUrl()`, `checkInUrlForDomain()` y el tipo `QrLocation` |
| `src/app/api/dashboard/qr-locations/route.ts` | GET de las sedes activas **con su `domain`**. Ver abajo por qué es una ruta nueva |
| `src/app/(dashboard)/dashboard/qr/page.tsx` | UI: selector de sede, vista previa, descarga SVG/PNG |
| `src/lib/utils/qr-poster.ts` | **Congelado** (D-QR-3). El póster de temas y mesas, en pausa |
| `tests/unit/qr-svg.test.ts` | Fija que la sede viaja en el host, que sin subdominio no hay QR y que el SVG conserva su `viewBox` |

### Por qué `/api/dashboard/qr-locations` y no una de las rutas que ya existían

- **`/api/dashboard/location`** devuelve un **objeto plano** con la sede principal. Su contrato está
  congelado: devolver una lista rompe `dashboard/settings/page.tsx` en silencio.
- **`/api/dashboard/location-scope`** sí devuelve la lista, pero su `LocationOption`
  (`src/lib/location-scope-shared.ts`) alimenta el selector de **todo** el panel. Agregarle `domain`
  mueve un hub por una pantalla sola.

La ruta nueva es de solo lectura y no comparte tipo con nadie. Devuelve **todas** las sedes activas
de la marca, incluidas las que no tienen subdominio: quien imprime el material de una sede necesita
ver justamente eso.

## Restricciones
- Sin sedes activas no hay nada que imprimir, y la pantalla lo dice en vez de mostrar un QR vacío.
- El PNG de respaldo sale a 2000×2000 px (≈16,9 cm a 300 DPI), **sin tema, sin textos y sin logo**:
  es el mismo QR, no el póster viejo.
- El SVG se descarga por `Blob` y no por `data:` — un `data:` largo lo truncan algunos navegadores.

## Pendiente
- [x] ~~Persistir la config por tenant~~ → §3 (2026-09-06); la config sigue guardada aunque la UI esté en pausa
- [x] ~~SVG + un QR por sede + sacar las mesas del QR~~ → 2026-09-06
- [ ] **Rediseño visual del QR** — fuera de alcance hasta que el dueño lo defina (D-QR-3)
- [ ] Subdominio automático al dar de alta una sede — es **F8**, wizard del AIOS (D-QR-1)
