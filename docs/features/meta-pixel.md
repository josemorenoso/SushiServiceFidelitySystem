# Píxel de Meta

> **Estado:** viva (píxel 2026-09-10 · API de Conversiones 2026-09-11) · **Ruta / entrada:** todas las páginas de `src/app/(public)/` menos `/mesero/*`, y `POST /api/check-in` desde el servidor · **Migración:** 00061 (`tenant_integration_secrets`)

## Qué hace y para quién

Le cuenta a una cuenta publicitaria de Meta (Facebook e Instagram) que alguien abrió el enlace
de un restaurante, que se registró en el programa o que hizo check-in. Con eso se arman audiencias
—«los que se registraron este mes», «los que abrieron y no se registraron», «los que vuelven»— y se
les tiran campañas, y Meta busca gente parecida.

**Sirve a dos dueños distintos, y esa es la mitad de la arquitectura de esta feature.** La otra
mitad es que cada evento viaja **por dos caminos**: el píxel del navegador y la API de Conversiones
desde el servidor, unidos por un `event_id`.

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

### Los dos caminos: navegador y servidor

El píxel corre en el navegador del cliente, y ahí un bloqueador de anuncios o el iOS de turno se lo
comen: ese check-in no se mide. Por eso, desde el 2026-09-11, **`POST /api/check-in` manda el mismo
evento desde el servidor** por la API de Conversiones, en `after()` de Next (después de responder,
nunca antes). Y como el servidor no tiene las cookies del navegador, ese evento lleva **el celular
del cliente hasheado con SHA-256** — es lo que Meta compara contra sus propios celulares hasheados.

| | Píxel (navegador) | API de Conversiones (servidor) |
|---|---|---|
| Lo dispara | `trackMetaEvent()` en `check-in/page.tsx` | `scheduleMetaConversion()` en `api/check-in/route.ts` |
| Identifica al cliente por | las cookies de Meta que ya tenía | `ph` = SHA-256 del celular con 57 delante, + `country` |
| Señales técnicas | Meta las toma solas | IP, user-agent, `_fbp`, `_fbc` — **solo si el pedido salió del navegador del cliente** |
| Con qué token | ninguno (el id del píxel alcanza) | `META_CONVERSIONS_ACCESS_TOKEN` (Cada1) y `tenant_integration_secrets` (marca) |
| Se une al otro por | `event_id` = `meta_event_id` de la respuesta | `event_id` = `reg-<customer.id>` o `visit-<visit.id>` |

**El `event_id` es determinista** (`metaEventIdForRegistration()`, `metaEventIdForVisit()` en
`meta-pixel.ts`) porque el navegador del cliente a veces dispara MUCHO después que el servidor: con
check-in por mesero, el registro responde `registered_pending_scan`, el cliente muestra su QR, y recién
cuando el mesero escanea la pantalla pasa a «bienvenido». Con el id derivado de la fila, los dos lo
calculan solos y Meta los une (ventana de 48 h). `/api/check-in/status` devuelve el de la visita para
que el navegador lo use.

**Con el mesero, el servidor manda el celular hasheado y NADA más.** El pedido HTTP de un
`source: 'staff_scan'` lo hace el celular del **mesero**: su IP, su user-agent y su `_fbp` pegados al
celular del cliente le enseñarían a Meta que el navegador del mesero es ese cliente, y el siguiente,
y el siguiente. `buildConversionEvent()` recibe `browser: null` en ese caso y hay un test que lo fija.

**La primera visita no es «volver».** El servidor manda `CheckIn` solo desde la segunda visita
(`updated.total_visits > 1`); la primera es el cierre del registro, que ya se mandó como
`CompleteRegistration`. Si no, todo cliente nuevo entraría a la audiencia de «los que vuelven».

### Los archivos

| Archivo | Qué hace |
|---|---|
| `src/lib/meta-pixel.ts` | **Puro.** Valida el id, resuelve la lista de píxeles, decide qué rutas se miden y arma los parámetros de cada evento. Es la única fábrica de lo que sale hacia Meta |
| `src/lib/meta-pixel-server.ts` | Resuelve marca + sede + píxeles para el host de este request. `cache()` por request |
| `src/lib/host-context-server.ts` | El `resolveHostContext()` de este request, memoizado. Lo comparten el píxel y `getBrandingForHost()` |
| `src/components/features/analytics/MetaPixel.tsx` | El `<script>` de Meta y el `PageView` de cada navegación |
| `src/components/features/analytics/MetaPixelNote.tsx` | La línea chiquitita de aviso |
| `src/lib/meta-pixel-client.ts` | `trackMetaEvent(event, surface, eventId)`. Falla en silencio si no hay `fbq` |
| `src/app/(public)/layout.tsx` | Monta las dos cosas. Existe solo para esto |
| `src/lib/meta-conversions.ts` | **Sin base ni entorno.** Hashea el celular, arma el evento del servidor (`buildConversionEvent()`, la única fábrica), lee `_fbp`/`_fbc` e IP, valida el token, y hace el POST con un `fetch` inyectable |
| `src/lib/meta-conversions-server.ts` | Resuelve los destinos (plataforma + marca, cada uno con SU token) y manda. `readBrandConversionsToken()` distingue «sin token» de «la tabla no existe» |
| `src/app/api/check-in/route.ts` | `scheduleMetaConversion()` en el registro y en el check-in, dentro de `after()` |
| `src/app/api/check-in/status/route.ts` | Devuelve `meta_event_id` de la visita reciente |
| `src/app/api/dashboard/meta-conversions/route.ts` | GET «¿hay token?» / PUT guardar o borrar. **Nunca devuelve el token** |
| `supabase/migrations/00061_secretos_de_integracion.sql` | `tenant_integration_secrets`: RLS sin políticas, solo service role |

### Los eventos

| Evento | Cuándo | Cómo |
|---|---|---|
| `PageView` | Cada carga y cada navegación dentro de las páginas públicas medidas | `track` (estándar). Solo navegador |
| `CompleteRegistration` | Un cliente **nuevo** terminó de registrarse | `track` (estándar). Navegador + servidor |
| `CheckIn` | Un cliente ya registrado hace check-in (de la 2.ª visita en adelante) | `trackCustom` (Meta no tiene un estándar para «volvió al local»). Navegador + servidor |

El check-in **duplicado** no dispara nada: es el mismo cliente en la misma visita apretando de
nuevo, y contarlo infla la audiencia de «los que vuelven» con gente que no volvió.

## Decisiones y qué NO hacer

- **A Meta le va el celular hasheado, y nada más de la persona** (dueño, 2026-09-11). Desde el
  navegador no sale ningún dato personal (`buildMetaEventParams()`: `tenant`, `location`,
  `content_category`). Desde el servidor sale `ph` (SHA-256 del celular) y `country`
  (`buildConversionEvent()`); **no** el nombre, el correo, el cumpleaños, la ciudad, los puntos ni
  el id del cliente. Los dos tests fijan la lista exacta de claves: agregar una los pone rojos.
  **«Hasheado» no es «anónimo»**: Meta se entera de que ese celular es cliente de ese restaurante.
  La casilla del check-in lo dice y la política de privacidad (§7) también, con esas palabras.
  **Un dato personal nuevo en cualquiera de los dos lados cambia la política de privacidad.**
- **El token de la marca NO va en `tenants.config`.** `config` viaja al navegador. El token vive en
  `tenant_integration_secrets` (00061), que solo lee el service role, y ningún endpoint lo devuelve.
  Un `access_token` en `config.integrations` es la fuga que la regla 1 de ese espacio existe para
  evitar.
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

0. **Aplicar la `00061` en Supabase y poner `META_CONVERSIONS_ACCESS_TOKEN` en Vercel.** Sin la
   tabla, el panel responde 503 al guardar el token de una marca y el servidor solo manda al píxel
   de Cada1 (si tiene token). Sin la variable, el servidor no manda nada al de Cada1.
1. `npx vitest run tests/unit/meta-pixel.test.ts tests/unit/meta-conversions.test.ts tests/unit/tenant-config-paths.test.ts` — 65 pruebas.
   La suite de base (`tests/db/*`) aplica la 00061 en un Postgres real: si el SQL no corre, se cae ahí.
2. **En el navegador, con la extensión [Meta Pixel Helper](https://www.facebook.com/business/help/198406697184603):**
   abrir `/check-in` de una marca y comprobar que dispara `PageView`; registrarse con un celular
   nuevo y ver el `CompleteRegistration`; hacer check-in con uno ya registrado y ver el `CheckIn`.
3. Abrir `/mesero/scan` y comprobar que el Helper **no ve ningún píxel** y que la línea de aviso
   no aparece.
4. En el panel → Configuración → Píxel de Meta: pegar un id, guardar, recargar `/check-in` y ver
   **dos** píxeles en el Helper. Borrarlo y ver que vuelve a haber uno.
5. Sin `NEXT_PUBLIC_META_PIXEL_ID` y sin píxel de marca: el HTML no menciona `facebook.net`.
6. **La API de Conversiones, sin ensuciar los números:** poner `META_CONVERSIONS_TEST_EVENT_CODE`
   con el código de la pestaña **Probar eventos** del Administrador de eventos, registrarse con un
   celular nuevo y ver ahí el `CompleteRegistration` con «Servidor» como origen y `ph` en
   «Parámetros de coincidencia»; hacer check-in con uno ya registrado y ver el `CheckIn`. Con el
   píxel del navegador activo, los dos eventos deben aparecer **deduplicados** (mismo `event_id`).
   Quitar la variable al terminar.
7. Un check-in **por mesero** (`/mesero/confirm`): en «Probar eventos», el `CheckIn` del servidor
   trae `ph` y `country` y **no** trae IP ni user-agent.

## Pendiente

- **NO verificado en el navegador ni contra Meta** (2026-09-11): nada de la lista de arriba se
  corrió contra una página real ni contra el Administrador de eventos. Faltan en Vercel
  `NEXT_PUBLIC_META_PIXEL_ID` y `META_CONVERSIONS_ACCESS_TOKEN`, y en Supabase la `00061`.
- **Los clientes que ya existían no aceptaron esto.** La casilla nueva la marcan los que se registran
  desde hoy; los anteriores aceptaron WhatsApp y nada más. Sus check-ins **sí** se mandan con el
  celular hasheado (el servidor no distingue). Si el dueño quiere separarlos, hace falta guardar la
  versión del consentimiento por cliente (`consent_events` ya existe) y filtrar en
  `scheduleMetaConversion()`; hoy no se hace.
- **`META_GRAPH_API_VERSION` = v23.0.** Meta la retira en ~2027; cuando la API responda 400 con
  `code: 2635`, se sube en `meta-conversions.ts`.
- **`PUT /api/dashboard/tenant-config` autentica con `requireTenantId()`**, así que un
  `role='location'` puede cambiar el píxel de la marca entera. Es la misma deuda que se cerró el 09
  en `/api/dashboard/reward-tiers` (`exigirAlcanceDeMarca()`) y sigue abierta para TODA la config de
  la marca —logo, paleta, tarjeta, link de reseñas—, no solo para el píxel. No se tocó acá: arreglarlo
  es una sesión propia y cambia el comportamiento de seis pantallas.
