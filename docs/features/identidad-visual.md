# Identidad visual por marca — §5, §6 y §3

> **Estado:** 🟢 Implementado (rama `feat/tarjeta-visual`)
> **Migración:** `00047_identidad_visual.sql` — **escrita, SIN aplicar**
> **Cubre:** §5 (personalización de la pantalla del teléfono + tarjeta), §6 (logo y paleta),
> §3 (persistir la config del QR Studio)
> **Hermanos:** [`design-system.md`](design-system.md) · [`wallet-card.md`](wallet-card.md) · [`qr-studio.md`](qr-studio.md)

---

## Qué resuelve

Hasta esta versión, las 25 marcas del despliegue compartían **una sola piel**. El rojo
`#FF4D6D → #E63946` no salía de ninguna configuración: estaba horneado en cuatro clases de
`globals.css` y en unos cuantos `style={{ color: "#1a1c1d" }}` sueltos. Un restaurante podía cambiar
su nombre y su link de reseñas; su cara, no.

Lo que se agrega **no es una paleta nueva**. El sistema de diseño sigue siendo el sistema
(Playfair + Inter, marfil `#F9F8F6`, gradiente rojo, radio 24 px, objetivos táctiles de 44 px). Lo
que se agrega es que cada marca pueda **poner la suya encima**, y que la que no lo haga se vea
exactamente igual que ayer.

---

## El principio de toda la feature

> **Un tenant sin color propio no cambia ni un píxel.**

Está fijado por prueba (`tests/unit/brand-palette.test.ts`, bloque *"un tenant SIN marca propia"*) y
es lo que permitió tocar la pantalla que ven los clientes de los 25 sin pedirle permiso a nadie.
Se sostiene en tres decisiones:

1. Los valores de `:root` en `globals.css` son **los literales de hoy**, copiados uno por uno.
2. `resolveBranding()` solo **deriva** algo cuando el tenant eligió un color. Sin color elegido
   devuelve los literales, no una derivación que "casi" coincide.
3. `brandCssVars()` emite **solo lo que cambió**. Un tenant sin marca propia recibe `{}`.

---

## Cómo se guarda (y la puerta que se dejó abierta)

`tenants.config` es un único jsonb. Hasta ahora todas sus claves eran planas. Lo nuevo vive en
**espacios con nombre**:

```jsonc
{
  "brand_name": "La Huerta",          // ← claves planas de siempre, intactas
  "delivery_default_city": "Envigado",
  "card_bg": "linear-gradient(…)",

  "branding": {                        // ← §5/§6, lo edita el panel
    "logo_url": "https://…/brand-assets/<tenant_id>/logo-<ts>.png",
    "primary": "#0a7c4a",
    "primary_end": "#095f39",
    "surface": "#f9f8f6",
    "ink": "#1a1c1d",
    "card_bg": "linear-gradient(…)",   // escape avanzado
    "page_bg": "linear-gradient(…)"
  },

  "qr_studio": {                       // ← §3, antes solo en localStorage
    "theme": "sushi", "size": "a4", "accent": "",
    "headline": "…", "subline": "…", "tables": 14
  },

  "integrations": { }                  // ← RESERVADO. No construido. Ver abajo.
}
```

### Por qué espacios y no más claves planas

El siguiente inquilino de este jsonb ya tiene nombre: **las cuentas de Google y de Meta que el
restaurante va a conectar** (decisión del dueño, 2026-09-05). Con todo plano, `google_account_id` y
`meta_page_id` acabarían mezclados con `brand_name` a un descuido de `resolveBranding()` — que es
justamente la función **cuya salida viaja al navegador en cada página**. Con espacios, cada bloque es
una unidad que se lee, se escribe y se audita sola.

**Dos reglas que valen desde ya, aunque `integrations` esté vacío:**

1. **Ahí NUNCA va un token.** Lo que puede vivir en `config.integrations` es metadato no secreto: el
   id de la cuenta conectada, cuándo se conectó, qué permisos dio. Las credenciales van en su propia
   tabla, con RLS, fuera de `config`.
2. **Ese espacio no se abre agregando una línea a la whitelist.** Lo escribirá su propio flujo de
   OAuth. Hay una prueba que lo fija (`tenant-config-paths.test.ts`).

### El merge tiene que ser profundo

El `||` de jsonb mezcla **solo el primer nivel**. Con espacios eso deja de servir, y de la peor manera:

```
config  = {"branding": {"primary": "#ff4d6d", "logo_url": "https://…"}}
patch   = {"branding": {"primary": "#0a7c4a"}}
config || patch
  →     {"branding": {"primary": "#0a7c4a"}}      ← el logo DESAPARECIÓ
```

Sin error y sin aviso. Por eso la **00047** agrega `jsonb_deep_merge()` y
`merge_tenant_config_deep()`. La versión superficial (`merge_tenant_config`, 00032) **se conserva
tal cual**: agregarle un parámetro habría creado una sobrecarga y dejado ambigua (42725) toda llamada
vieja — la trampa que ya costó `log_review_shown_deduped()`.

`tests/db/identidad-visual.test.ts` incluye la prueba de contraste: la misma escritura con el merge
plano **sí** borra el logo. Está ahí para que nadie "simplifique" volviendo a la función vieja.

---

## Un color, no siete

La competencia (`docs/benchmarking/01-tarjetas-modelo-diseno.md`) pide **siete hex sueltos**: fondo de
tarjeta, color de texto, fondo de sello, color de contorno, sello activo, sello inactivo, fondo bajo
los sellos. Un dueño de restaurante no debería tener que saber qué es un "contorno de sello".

Acá se pide **uno**, y de lo demás se encarga `src/lib/brand-palette.ts` (funciones puras, con
pruebas):

| Se deriva | Función | Por qué no se pregunta |
|---|---|---|
| Segundo tono del gradiente | `deriveGradientEnd()` | Es el principal un 12 % más oscuro — la misma relación que tiene el par de la casa |
| Gradiente de la tarjeta (4 paradas) | `deriveCardGradient()` | Nadie escribe un `linear-gradient` de cuatro paradas a mano |
| Fondo de página de la tarjeta | `derivePageGradient()` | Tiene que ser de la misma familia y mucho más apagado, o la tarjeta no flota |
| ✓ del sello | `deriveStampCheck()` | Va sobre un sello blanco: si no es oscuro, desaparece |
| Color del QR | `qrSafe()` | Se oscurece hasta 7:1 contra el blanco. Un QR amarillo no lo lee ninguna cámara |
| Texto sobre el botón | `onColor()` | Ver abajo |

### `onColor()` y una asimetría deliberada

Sobre el rojo de la casa (`#FF4D6D`) el blanco da **3.2:1** y la tinta **5.3:1**. Por contraste puro,
"el mejor" sería el texto oscuro. Y sin embargo `onColor('#ff4d6d')` devuelve blanco.

No es un descuido. El CTA blanco sobre gradiente es **el sistema de diseño** (regla 5, *"gradientes en
CTAs"*), está en producción, y ningún dueño pidió cambiarlo. Si `onColor()` maximizara el contraste, un
tenant que eligiera exactamente ese mismo rojo vería un botón **distinto** del de un tenant que no
eligió nada — una incoherencia que no la ve nadie más que nosotros.

La regla es: **se respeta el blanco mientras siga siendo legible (≥ 3:1, el piso de WCAG 1.4.11 para
componentes de interfaz), y se cambia a tinta solo cuando deja de serlo.** Un amarillo `#FFD60A` da
1.4:1 con blanco: ahí sí cambia.

Que el par de la casa esté por debajo de los 4.5:1 de texto normal es una deuda **previa** a esta
feature, no algo que introduzca. El panel avisa cuando el par elegido queda ahí, que es donde esa
conversación corresponde: con el dueño, antes de guardar.

---

## Las piezas

| Archivo | Qué hace |
|---|---|
| `src/lib/brand-palette.ts` | **Aritmética de color.** Puro, sin React, sin negocio. `normalizeHex`, `shade`, `contrastRatio`, `onColor`, `qrSafe`, los tres `derive*` |
| `src/lib/branding.ts` | **El resolver.** `resolveBranding(config) → Branding`. La proyección PÚBLICA de `tenants.config` |
| `src/lib/brand-css.ts` | **El puente al CSS.** `brandCssVars(branding)` → las `--brand-*` que el root layout estampa en `<html>` |
| `src/lib/tenant-config-paths.ts` | **La whitelist.** Qué rutas puede tocar el panel y cómo se valida cada una |
| `src/app/globals.css` | Los tokens `:root` y las cuatro clases premium leyéndolos |
| `src/components/features/branding/BrandMark.tsx` | El logo (o el ícono de siempre) en las pantallas públicas |
| `src/components/dashboard/BrandPreview.tsx` | La vista previa en vivo del panel |
| `src/app/(dashboard)/dashboard/marca/page.tsx` | La pantalla de edición |
| `src/app/api/dashboard/brand-logo/route.ts` | Subida y borrado del logo |
| `src/app/api/dashboard/tenant-config/route.ts` | Lectura y escritura de las rutas de `config` |

### El truco de las variables CSS

La "piel" de la pantalla del teléfono no vive en ningún componente: vive en `.premium-bg`,
`.premium-card`, `.btn-premium` y `.input-premium`, que llevan `!important` para ganarle a Tailwind.
Ningún componente las puede pisar.

La solución es que las clases lean variables, `:root` las defina con los valores de hoy, y el root
layout estampe en `<html>` **solo las que este tenant cambió**. Resultado: una marca nueva cambia
**toda pantalla que use las clases premium** sin tocar un componente.

> ⚠️ Si agregás un color a una clase premium, **definilo en `:root` primero**. Un hex horneado dentro
> de la clase vuelve a ser un color que ninguna marca puede cambiar — que es el problema que §5 vino
> a resolver.

---

## §3 — el QR Studio deja de vivir en el navegador

La config del póster (tema, tamaño, textos, acento, número de mesas) estaba en seis claves de
`localStorage`. Eso significa que el diseño que el restaurante mandó a imprenta **se perdía** al
cambiar de equipo, de navegador o al limpiar el caché, y nadie podía reimprimir la misma pieza.

Ahora vive en `config.qr_studio` y viaja con la cuenta. Lo que hubiera en `localStorage` **no se
tira**: la primera vez que se abre la página sin config en el servidor, se sube y después se limpia
(si la subida falla, el `localStorage` se deja donde está — es lo único que queda del diseño).

**El logo dejó de ser de esa página.** Antes se subía ahí y quedaba en un `localStorage` propio, así
que el póster y la tarjeta del cliente podían tener logos distintos. Ahora es el logo de la marca, se
administra en `/dashboard/marca`, y el QR Studio solo muestra cuál va a estampar.

Dos detalles que parecen menores y no lo son:

- **`crossOrigin = 'anonymous'` en `loadImage()`.** El póster se arma en un `<canvas>` y se exporta
  con `toDataURL()`. Dibujar ahí una imagen de otro origen sin permiso CORS deja el canvas *tainted*
  y `toDataURL()` lanza `SecurityError`: la descarga entera se cae. Con el logo en `localStorage`
  (un data URL) nunca pasó; con el logo en Storage, pasa siempre. En los data URL **no** se toca.
- **El menú dice "QR Studio", no "Código QR".** El propio §3 sospecha que el nombre viejo es la razón
  de que nadie encontrara los temas, los tamaños de imprenta ni el logo que ya existían.

### El QR de la tarjeta

§3 lo describía como *"100% básico: sin color, sin logo, tamaño fijo, cero opciones"*. Ahora lleva el
color de la marca (pasado por `qrSafe()`) y el logo en el centro, con `level="H"` — el 30 % de
redundancia que hace falta para que un logo encima no lo vuelva ilegible. Con el `level="M"` de
antes, poner un logo lo habría roto.

---

## El logo

Vive en el bucket público `brand-assets`, en `<tenant_id>/logo-<ts>.png`.

- **El prefijo `tenant_id` lo impone la ruta de subida**, desde `requireTenantId()` y nunca desde el
  cuerpo de la petición. Es lo que hace verificable de un vistazo que la marca A no escribe sobre el
  logo de la marca B.
- **Bucket público** porque el logo se dibuja en tres sitios que no pueden autenticarse: el check-in,
  la tarjeta y el canvas del póster. Es el logo comercial del restaurante, el mismo que está en su
  fachada.
- **Se re-codifica siempre a PNG con `sharp`**, acotado a 512 px. Tres razones, en orden: un SVG en un
  bucket público es un vector de XSS (por eso el formato ni se acepta); el logo va sobre gradientes
  oscuros y necesita canal alfa, que el JPEG no tiene; y así el dueño no tiene que redimensionar nada.
- **El nombre lleva timestamp** para que el CDN no sirva el anterior. Sin eso, cambiar de logo "no
  hace nada" durante toda la vida del caché.
- **Los logos viejos se barren** en cada subida: el bucket no es un archivo histórico.
- **Ni el POST ni el DELETE escriben `tenants.config`.** El único escritor de `branding.logo_url` es
  el endpoint de config. Un solo escritor por clave.

---

## Lo que NO se hizo, y por qué

| Idea | Decisión |
|---|---|
| Editor de los textos fijos de la tarjeta ("Recompensas disponibles"…) | **No.** El benchmarking ya lo marcó IGNORAR: nadie lo pidió y multiplica la superficie de QA. Los textos `calido` no se tocan sin decisión del dueño |
| Selector del largo del ciclo de sellos (`STAMPS_COUNT = 10`) | **No.** Exige reconciliar con los umbrales de `reward_tiers`, que hoy son independientes del conteo de sellos. Es la oportunidad nº 8, no es trivial y no es §5/§6 |
| Los 7 hex sueltos de la competencia | **No.** Un color y derivaciones — ver arriba |
| Pases reales de Apple/Google Wallet | **No.** Fuera de alcance; exige certificados PassKit |
| `branding` por SEDE | **No.** La marca es de la marca. Ninguna columna de esta feature lleva `location_id` |

---

## Cómo se prueba

| Archivo | Qué fija |
|---|---|
| `tests/unit/brand-palette.test.ts` | Que un tenant sin color no cambie · que un color claro no rompa el CTA ni el QR · que basura en `config` caiga al default |
| `tests/unit/tenant-config-paths.test.ts` | Que la whitelist no deje pasar `brand_name` ni `integrations.*` · las validaciones por tipo · el espejo de ids con `qr-poster.ts` |
| `tests/db/identidad-visual.test.ts` | El merge profundo · que guardar un color no borre el logo ni las integraciones · que escribir la marca de un tenant no toque la del otro · que el bucket exista y sea público |

---

## Al desplegar

1. **La 00047 va ANTES del código.** Sin ella, `merge_tenant_config_deep` no existe y todo guardado
   desde `/dashboard/marca` y desde el QR Studio devuelve error; el bucket tampoco existe y la subida
   del logo falla.
2. Su orden dentro de la cola de migraciones: **después de la 00044, la 00045 y la 00046.**
3. No hay paso manual después: sin config nueva, todos los tenants siguen viéndose igual.
