# Feature: Reseñas de Google — pop-up con premio y tracking

**Última actualización:** 2026-07-13 (v2.5.0 — Bloque 3)
**Spec:** [`docs/superpowers/specs/2026-07-13-google-review-popup-design.md`](../superpowers/specs/2026-07-13-google-review-popup-design.md)
**Requerimiento:** R6, R6.a, R6.b, R6.c de [`REQUERIMIENTOS_JULIO_2026.md`](../requerimientos/REQUERIMIENTOS_JULIO_2026.md)

---

## Objetivo

Que el cliente deje una reseña en Google **a cambio de un premio real**, que ese premio se entregue por el
mismo camino que todos los demás, y que el dueño pueda **medir** si la estrategia funciona.

## Qué se intentó antes y por qué falló

| Versión | Qué era | Por qué falló |
|---------|---------|---------------|
| v1.0 — `GoogleReviewPopup` | Modal con overlay y **botón X** en la esquina | La gente lo cerraba **por reflejo a los 2 segundos**, sin leerlo. Quedó como código muerto (hallazgo 3.6) y se elimina en el Bloque 3. |
| v1.4 — `GoogleReviewCard` | Card **inline** tras 2.5s en la pantalla de éxito | Dejó de molestar, pero también dejó de existir: compite con los puntos, los tiers y el roadmap, y **no ofrece nada a cambio**. Sin tracking, nadie supo nunca cuánta gente la ignoró. Se elimina en el Bloque 3. |
| **v2.5 — `GoogleReviewModal`** | Modal **sin X**, con premio y con funnel | — |

La lección de las dos: **el problema nunca fue el formato, fue que pedir un favor no convierte.** El
modal vuelve, pero ahora ofrece algo y no se puede cerrar por reflejo.

---

## Cómo funciona

### 1. El gancho

> *"Gánate {premio} por dejarnos una reseña en Google"*

El premio sale del catálogo `campaign_rewards` (Dashboard → *Premios de campaña*) y se elige en
Ajustes → *Reseñas de Google*. **Si no hay premio configurado, el modal igual aparece** pidiendo la
reseña sin prometer nada — el sistema no se apaga solo porque el dueño no haya tocado un selector.
**Si no hay link de Google, no aparece nunca**: no hay a dónde mandar al cliente.

### 2. El modal (`GoogleReviewModal.tsx`)

**No tiene X. No se cierra al tocar fuera. No se cierra con Escape.** La única salida es un botón
explícito. Cuatro estados:

```
 OFERTA ──"Dejar reseña"──► PASOS ──"Ir a Google"──► ESPERA ──(vuelve)──► GRACIAS
   │                        1. muéstrale la reseña
   │                           al mesero
   │                        2. redime tu regalo
   │
   └──"La próxima lo hago"──► cierra (vuelve en el próximo check-in)
```

- **Espera → Gracias** se dispara con `visibilitychange`, cuando el cliente **vuelve a la pestaña**. No
  al tocar el botón: decirle "gracias por tu reseña" a alguien que aún no la ha escrito sería mentirle.
- La pantalla de gracias dice *"Gracias por dejarnos tus comentarios, te esperamos de regreso"* y le
  recuerda que le muestre la reseña al mesero para reclamar su premio (R6.c).
- **Si el check-in desbloqueó un tier, el modal espera** a que el cliente elija su Mystery Box. Taparle
  la elección del premio con una petición de reseña sería cambiar oro por cobre.

### 3. El premio: cero infraestructura nueva

Tocar el link llama a `grantReward({ grantType: 'campaign_prize', source: 'review' })`. A partir de ahí
**todo el camino ya existía** (Bloque 1, migración 00031):

```
  reseña ──► reward_grants ──► /mesero/rewards ──► reward_redemptions ──► métricas
            (banner en la      (el mesero lo       (mesa + mesero)
             tarjeta del        entrega)
             cliente)
```

El premio vence a los `review_reward_window_days` días (default 30).

**El premio se otorga al tocar el link, sin verificar que la reseña exista.** No es un agujero: el paso 1
que el cliente lee es *"muéstrale la reseña al mesero"*, y **el mesero es el verificador**, igual que con
cualquier otro premio. Google no ofrece ninguna API para confirmarlo; cualquier otra cosa sería teatro.

### 4. La memoria (R6.b)

El navegador del check-in es *stateless* — cero `localStorage`, cero cookies. El cliente se identifica
**solo por teléfono**, así que la memoria **tiene que vivir en la base de datos** (si viviera en el
navegador, se rompería en cuanto el cliente abriera su tarjeta desde otro teléfono):

| Columna en `customers` | Efecto |
|---|---|
| `google_review_clicked_at` | Fue a Google → **nunca más** se le muestra el modal. |
| `google_review_postponed_at` | Tocó "La próxima lo hago" → **sí** se le vuelve a mostrar, en su próximo check-in. |

**Caso borde:** si clickeó el link y luego dejó vencer el premio, el modal **no vuelve**. Es correcto —
ya fue a Google. El premio vencido queda en las métricas como lo que fue: una reseña que nadie cobró.

### 5. El funnel (R6.a)

Es la **primera tabla de eventos del sistema** — no había ningún analytics en el repo (hallazgo 3.7).

`review_events` guarda tres acciones: `shown`, `clicked`, `postponed`. El `shown` lo sella el propio
endpoint del prompt, **deduplicado a 12 horas** para que recargar la pantalla no infle las impresiones.

El dueño ve, en Dashboard → *Redenciones*:

```
  Se mostró 240 veces  →  38 fueron a Google (16%)  →  29 reclamaron el premio (76%)
```

Las dos tasas miden cosas distintas y hay que poder separarlas: la primera es el **gancho** (¿convence el
premio?), la segunda es la **operación** (¿el mesero está cerrando el ciclo?). Un 3% en la primera es un
problema de incentivo; un 20% en la segunda es un problema de servicio.

---

## Configuración (Dashboard → Ajustes → Reseñas de Google)

| Campo | Dónde se guarda | Default |
|---|---|---|
| **Link de reseñas de Google** | `tenants.config.google_maps_url` (jsonb) | — (sin él, no hay pop-up) |
| **Recompensa por reseña** | `admin_settings.review_reward_id` | vacío (pop-up sin premio) |
| **Ventana del premio (días)** | `admin_settings.review_reward_window_days` | 30 |

El link **no** vive en `admin_settings` a propósito: `resolveBranding()` lo lee de `tenants.config`, y
duplicarlo crearía dos fuentes de verdad. Se escribe con `PUT /api/dashboard/tenant-config`, que tiene una
**whitelist de claves** para que el dashboard no pueda pisar el resto del branding por accidente.

---

## API

| Endpoint | Quién lo llama | Qué hace |
|---|---|---|
| `GET /api/check-in/review-prompt?phone=` | La pantalla de éxito del cliente | Decide si mostrar el modal. Sella el evento `shown` (dedupe 12h). |
| `POST /api/check-in/review-action` | El modal | `{ phone, action: 'clicked' \| 'postponed' }`. En `clicked`: sella la columna, **otorga el premio** y registra el evento con su `grant_id`. Rate-limited por teléfono. |
| `GET /api/dashboard/review-metrics?from&to` | Dashboard → Redenciones | El funnel. |
| `PUT /api/dashboard/tenant-config` | Ajustes | Escribe `google_maps_url` en `tenants.config` (whitelist). |

**Por qué un endpoint propio y no la respuesta del check-in:** en el flujo real
(`checkin_mode = staff_verified`) el `POST /api/check-in` lo hace **el celular del mesero**; la pantalla del
cliente la alimenta el **polling de `/api/check-in/status`**. Colgar el prompt de ese polling —que corre
cada 5 segundos— dispararía un evento `shown` por segundo. Un endpoint propio es agnóstico del modo de
check-in.

---

## Archivos

| Archivo | Rol |
|---|---|
| `supabase/migrations/00032_review_tracking.sql` | Columnas del gate + tabla `review_events` |
| `src/services/review.service.ts` | Gate, eventos, otorgamiento del premio, funnel |
| `src/app/api/check-in/review-prompt/route.ts` | ¿Se muestra? + evento `shown` |
| `src/app/api/check-in/review-action/route.ts` | Click / posponer |
| `src/components/features/check-in/GoogleReviewModal.tsx` | El modal (4 estados) |
| `src/components/features/check-in/CheckInSuccess.tsx` | Lo monta, y lo hace esperar al Mystery Box |
| `src/app/api/dashboard/review-metrics/route.ts` | Funnel |
| `src/components/dashboard/ReviewFunnelCard.tsx` | Funnel en el dashboard |
| `src/app/api/dashboard/tenant-config/route.ts` | Link de Google (whitelist sobre `tenants.config`) |

**Eliminados:** `GoogleReviewCard.tsx` (la reemplaza el modal) y `GoogleReviewPopup.tsx` (código muerto,
hallazgo 3.6).

---

## Estilos

El flujo público de check-in **no usa shadcn/Dialog**. Usa clases propias de `src/app/globals.css`
(`.premium-card`, `.btn-premium`, `.premium-bg`) con estilos inline para los gradientes de marca. Es un
sistema visual paralelo al del dashboard y el modal lo respeta (Mandamiento VII).

---

## Correcciones de auditoría (v2.5.1)

Cuatro correcciones de la revisión previa al despliegue. Ninguna cambia el flujo; cierran huecos de borde.

- **Idempotencia real del premio (R6.b).** `registerReviewClick()` ahora consulta
  `customers.google_review_clicked_at` **antes** de otorgar. El índice único de la 00031 solo bloqueaba
  mientras el grant seguía activo: una vez redimido o vencido, repetir el POST público acuñaba un premio
  nuevo. El sello `clicked_at` es el candado permanente. Si el cliente ya fue a Google, se le devuelve su
  premio activo (si sigue vivo) sin crear otro.
- **Un link vacío apaga el pop-up de verdad.** El gate ya **no** lee la URL vía `resolveBranding()` (que
  cae al default del entorno, el link de la cuenta maestra). Distingue `undefined` (nunca configurado → usa
  el default del entorno, comportamiento de la cuenta maestra) de `''` (vaciado a propósito → apagado). Sin
  esto, un tenant que borraba su link mandaba a sus clientes a la ficha de Google de otro negocio.
- **No se promete un premio que no existe.** Ante un `db_error` al otorgar, se devuelve `prize_title: null`
  y la pantalla de gracias solo muestra el regalo que el servidor **realmente** otorgó (`grantedPrize`, no
  el teaser configurado). En `duplicate_active` se devuelve el premio activo existente **con su `expires_at`
  real**, para que la cuenta regresiva no desaparezca en un reintento/doble-tap.
- **Merge atómico del link (`tenant-config`).** El PUT ya no hace lectura → merge-en-JS → escritura de
  `tenants.config`; usa la función `merge_tenant_config(uuid, jsonb)` de la 00032 (`config = config ||
  patch`), que es atómica y no puede perder una escritura concurrente sobre el branding.
- **Dedupe de `shown` en una sola sentencia.** `logReviewShown()` era un check-then-act (SELECT + INSERT,
  dos idas a la base) con una ventana en la que dos peticiones casi simultáneas inflaban el denominador del
  funnel. Ahora usa la función `log_review_shown_deduped(uuid, uuid, int)` de la 00032
  (`INSERT ... WHERE NOT EXISTS`): una sola ida a la base y la ventana de carrera reducida a lo que dura la
  sentencia. Es un contador de impresiones, no dinero, así que no se busca atomicidad perfecta.
