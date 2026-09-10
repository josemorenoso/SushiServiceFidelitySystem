# Píxel de Meta

> **Estado:** viva (2026-09-10) · **Ruta / entrada:** todas las páginas de `src/app/(public)/` menos `/mesero/*` · **Migración:** ninguna

## Qué hace y para quién

Le cuenta a una cuenta publicitaria de Meta (Facebook e Instagram) que alguien abrió el enlace
de un restaurante, que se registró en el programa o que hizo check-in. Con eso se arman audiencias
—«los que se registraron este mes», «los que abrieron y no se registraron», «los que vuelven»— y se
les tiran campañas.

**Sirve a dos dueños distintos, y esa es toda la arquitectura de esta feature.**

## Cómo funciona

### Los dos píxeles

Un píxel solo alimenta a la cuenta que lo creó. Por eso «quién puede tirar campañas con estos datos»
es literalmente «de quién es el píxel», y hay dos:

| | De quién | Dónde se configura | Alcance |
|---|---|---|---|
| **Plataforma** | Cada1 | `NEXT_PUBLIC_META_PIXEL_ID` en Vercel | El MISMO en las 25 marcas |
| **Marca** | El restaurante | Panel → Configuración → **Píxel de Meta** (`tenants.config.integrations.meta_pixel_id`) | Solo esa marca |

Los dos se inicializan en la misma página y Meta reparte cada evento a ambos: no hay que disparar
nada dos veces. Si no hay ninguno de los dos, **no se carga un solo byte de Meta** — ni el script,
ni el `<noscript>`, ni la línea de aviso.

Cada evento viaja con el **slug de la marca** y el **id de la sede**, así que dentro de la cuenta de
Cada1 se puede segmentar por marca y por sede sin mezclar a nadie.

### Los archivos

| Archivo | Qué hace |
|---|---|
| `src/lib/meta-pixel.ts` | **Puro.** Valida el id, resuelve la lista de píxeles, decide qué rutas se miden y arma los parámetros de cada evento. Es la única fábrica de lo que sale hacia Meta |
| `src/lib/meta-pixel-server.ts` | Resuelve marca + sede + píxeles para el host de este request. `cache()` por request |
| `src/lib/host-context-server.ts` | El `resolveHostContext()` de este request, memoizado. Lo comparten el píxel y `getBrandingForHost()` |
| `src/components/features/analytics/MetaPixel.tsx` | El `<script>` de Meta y el `PageView` de cada navegación |
| `src/components/features/analytics/MetaPixelNote.tsx` | La línea chiquitita de aviso |
| `src/lib/meta-pixel-client.ts` | `trackMetaEvent()`. Falla en silencio si no hay `fbq` |
| `src/app/(public)/layout.tsx` | Monta las dos cosas. Existe solo para esto |

### Los eventos

| Evento | Cuándo | Cómo |
|---|---|---|
| `PageView` | Cada carga y cada navegación dentro de las páginas públicas medidas | `track` (estándar) |
| `CompleteRegistration` | Un cliente **nuevo** terminó de registrarse | `track` (estándar) |
| `CheckIn` | Un cliente ya registrado hace check-in | `trackCustom` (Meta no tiene un estándar para «volvió al local») |

El check-in **duplicado** no dispara nada: es el mismo cliente en la misma visita apretando de
nuevo, y contarlo infla la audiencia de «los que vuelven» con gente que no volvió.

## Decisiones y qué NO hacer

- **A Meta no le va ni un dato personal.** Ni el celular, ni el nombre, ni el correo, ni el
  cumpleaños, ni el id del cliente, ni los puntos. Lo único que sale es `tenant`, `location` y
  `content_category`, y sale por `buildMetaEventParams()`, que es la única puerta.
  `tests/unit/meta-pixel.test.ts` fija la lista de claves exacta: agregar una la pone roja.
  **Un evento que necesite un dato personal no se agrega solo: cambia la política de privacidad.**
- **Las pantallas del mesero NO se miden** (`isMeasuredPath()`). No es una cuestión legal sino de
  calidad del dato: el mesero abre la pantalla de escaneo cuarenta veces por turno desde el celular
  del local. Medirlo mete al empleado en la audiencia con el perfil del cliente más fiel que existe,
  y después esa audiencia se usa para buscar gente parecida.
- **El aviso y el píxel salen del MISMO predicado.** `MetaPixelNote` usa `isMeasuredPath()` igual que
  `MetaPixel`. No puede existir una página que mida sin avisar, ni un aviso donde no se mide.
- **El id del píxel NO entra en `Branding`.** El comentario de cabecera de `src/lib/branding.ts` lo
  pide con todas las letras: la proyección pública de `config` no engorda "porque es útil". El píxel
  viaja por `getMetaPixelForHost()`, que es su propio camino.
- **De `integrations` se abrió UNA ruta y solo una.** Un id de píxel es un número público (se lee en
  el HTML) y no lo escribe ningún OAuth, así que entró a la whitelist. **Un token no entra ni a esa
  lista ni a `tenants.config`, nunca.** El argumento largo está en `src/lib/tenant-config-paths.ts`.
- **El dedupe de ids no es cosmético.** Si un restaurante pega por error el id de Cada1 en su campo,
  `fbq('init', X)` dos veces hace que Meta cuente cada evento **doble** en esa cuenta. No da error:
  se descubre semanas después mirando un número inflado.
- **`CheckIn` va por `trackCustom`.** Mandar un nombre inventado por `track` hace que Meta lo
  descarte en silencio.
- **Medir jamás rompe el flujo del cliente.** `trackMetaEvent()` no hace nada si `fbq` no existe
  (bloqueador de anuncios, script sin cargar, sin píxel configurado), y `getMetaPixelForHost()`
  devuelve «sin píxel» ante cualquier fallo. El cliente está parado en el local esperando sus puntos.

## Cómo se verifica

1. `npx vitest run tests/unit/meta-pixel.test.ts tests/unit/tenant-config-paths.test.ts` — 48 pruebas.
2. **En el navegador, con la extensión [Meta Pixel Helper](https://www.facebook.com/business/help/198406697184603):**
   abrir `/check-in` de una marca y comprobar que dispara `PageView`; registrarse con un celular
   nuevo y ver el `CompleteRegistration`; hacer check-in con uno ya registrado y ver el `CheckIn`.
3. Abrir `/mesero/scan` y comprobar que el Helper **no ve ningún píxel** y que la línea de aviso
   no aparece.
4. En el panel → Configuración → Píxel de Meta: pegar un id, guardar, recargar `/check-in` y ver
   **dos** píxeles en el Helper. Borrarlo y ver que vuelve a haber uno.
5. Sin `NEXT_PUBLIC_META_PIXEL_ID` y sin píxel de marca: el HTML no menciona `facebook.net`.

## Pendiente

- **NO verificado en el navegador** (2026-09-10): nada de la lista de arriba se corrió contra una
  página real. Falta además `NEXT_PUBLIC_META_PIXEL_ID` en Vercel — sin esa variable la feature
  está entera pero apagada.
- **La API de Conversiones de Meta no está**, y es la mitad que falta. El píxel corre en el
  navegador, así que un bloqueador de anuncios o el iOS de turno se lo comen y esos check-ins no se
  miden. La otra mitad —mandar el evento desde el servidor— es otra decisión: necesita un token por
  marca (que **no** va en `config`) y hashear identificadores, que es exactamente el dato personal
  que hoy no sale de acá.
- **`PUT /api/dashboard/tenant-config` autentica con `requireTenantId()`**, así que un
  `role='location'` puede cambiar el píxel de la marca entera. Es la misma deuda que se cerró el 09
  en `/api/dashboard/reward-tiers` (`exigirAlcanceDeMarca()`) y sigue abierta para TODA la config de
  la marca —logo, paleta, tarjeta, link de reseñas—, no solo para el píxel. No se tocó acá: arreglarlo
  es una sesión propia y cambia el comportamiento de seis pantallas.
