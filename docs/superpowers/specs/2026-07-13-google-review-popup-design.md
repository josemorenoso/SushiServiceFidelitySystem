# Spec — Pop-up de reseñas de Google con tracking (Bloque 3)

> **Fecha:** 2026-07-13
> **Bloque:** 3 de [`REQUERIMIENTOS_JULIO_2026.md`](../../requerimientos/REQUERIMIENTOS_JULIO_2026.md)
> **Cubre:** R6, R6.a, R6.b, R6.c + hallazgos 3.6, 3.7, 3.8
> **Feature doc:** [`docs/features/review-flow.md`](../../features/review-flow.md)

---

## 1. El problema

> *"En el aspecto de reseñas de Google, la gente no las está dejando [...] antes estaba la x en la
> esquina y la gente literal a los 2 segundos que salía lo cerraba instintivamente [...] ahora un pop up
> que diga algo como 'gánate X por dejarnos una reseña en Google'."*

Tres cosas fallan hoy y ninguna es de diseño gráfico:

1. **No hay gancho.** La card actual (`GoogleReviewCard.tsx`) pide un favor. Nadie deja una reseña por
   favor; la deja por algo.
2. **No hay memoria.** El navegador del check-in es *stateless* (cero `localStorage`, cero cookies: el
   cliente se identifica solo por teléfono). Al que ya reseñó se le vuelve a pedir, y eso quema.
3. **No hay medición.** No existe analytics en el repo — ni PostHog, ni GA, ni tabla de eventos. Nadie
   sabe si la estrategia funciona.

## 2. La decisión que ahorra la mitad del trabajo

**El premio por reseña no necesita infraestructura nueva.** Reutiliza entero el motor del Bloque 1:

```
  GANAR                       TENER                     ENTREGAR
  reseña (source: 'review') → reward_grants          →  reward_redemptions
                              (ya existe)               (mesa + mesero, ya existe)
```

`source: 'review'` **ya está en el CHECK** de la migración 00031. Dejar reseña llama a
`grantReward({ grantType: 'campaign_prize', source: 'review' })` y a partir de ahí todo corre solo: el
premio le sale al cliente en el banner "Disponible" de su tarjeta, le aparece al mesero en
`/mesero/rewards`, se entrega con el mismo botón, y cae en las métricas de redención con su atribución
de mesa y mesero. **No se toca la entrega, ni el vencimiento, ni las métricas.**

Lo único que se construye es lo que no existe: **el gate** (a quién se le muestra), **el funnel** (medir)
y **la UI de Ajustes** (link de Google + elegir la recompensa).

### Sobre la confianza: el premio se otorga al tocar el link, sin verificar la reseña

No es un agujero, es el flujo que pidió el dueño: el paso 1 de la pantalla es *"muéstrale la reseña al
mesero"*. **El mesero es el verificador**, igual que con cualquier otro premio. Google no expone ninguna
API que permita confirmar que un usuario concreto dejó una reseña, así que cualquier otra opción sería
teatro. El índice único parcial `(customer_id, source) WHERE status='active' AND grant_type='campaign_prize'`
de la 00031 ya impide que un cliente acumule dos premios de reseña.

---

## 3. Decisiones de diseño

| # | Decisión | Alternativa descartada |
|---|----------|------------------------|
| **B3-D1** | **El prompt vive en su propio endpoint** (`GET /api/check-in/review-prompt`), no en la respuesta del check-in. | Colgarlo del `POST /api/check-in`: **no funciona**. En el flujo real (`checkin_mode = staff_verified`) ese POST lo hace *el celular del mesero*; la pantalla del cliente la alimenta el **polling de `/api/check-in/status`**. Y colgarlo del status —que se llama cada 5s— dispararía un evento `shown` por segundo. Un endpoint propio es agnóstico del modo de check-in y no toca `check-in/route.ts`, que además ya está siendo modificado por otra IA (gotcha #9). |
| **B3-D2** | **Estado en columnas de `customers`, funnel en tabla `review_events`.** | Solo columnas: no hay denominador, no se puede calcular tasa de conversión. Solo tabla: obliga a una query extra en el camino caliente. Cada una hace lo que la otra no puede. |
| **B3-D3** | **El pop-up aparece aunque no haya premio configurado** (copy adaptado, sin prometer nada). Sin **link de Google** no aparece nunca. | Exigir premio: el pop-up se apagaría solo si el dueño no configura nada — exactamente el problema de fondo del §1 del requerimiento ("los dueños no están dando uso a la herramienta"). |
| **B3-D4** | **Al que pospuso se le vuelve a mostrar en su próximo check-in.** Al que clickeó, nunca más. | Cooldown de N visitas: otra perilla que configurar. Como el check-in es ~1 vez al día, "próximo check-in" ya significa en la práctica "una vez por visita". |
| **B3-D5** | **El premio por reseña vence** (ventana configurable, default 30 días). | No vencer: un premio de hace 8 meses le seguiría saltando al mesero, e infla para siempre el contador de "activos". |
| **B3-D6** | **El modal espera a que termine la elección de Mystery Box.** | Montarlo de inmediato taparía la parte más valiosa del flujo (elegir premio) con una petición de reseña. |
| **B3-D7** | **La pantalla de gracias se dispara al recuperar el foco** (`visibilitychange`), no al tocar el botón. | Mostrarla al instante sería mentir: diría "gracias por tu reseña" a alguien que todavía no la ha escrito. |

---

## 4. Datos — migración `00032`

### 4.1 Columnas en `customers` (el gate)

```sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS google_review_clicked_at   timestamptz DEFAULT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS google_review_postponed_at timestamptz DEFAULT NULL;
```

El check-in ya carga la fila del cliente, así que decidir si mostrar el modal cuesta **cero queries
extra**. `clicked_at != NULL` → nunca más (R6.b). `postponed_at` es informativo (el gate no lo mira:
al que pospuso se le vuelve a mostrar, decisión B3-D4).

### 4.2 Tabla `review_events` (el funnel)

```sql
CREATE TABLE review_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  action     text NOT NULL CHECK (action IN ('shown', 'clicked', 'postponed')),
  grant_id   uuid DEFAULT NULL REFERENCES reward_grants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_events_funnel ON review_events (tenant_id, action, created_at DESC);
CREATE INDEX idx_review_events_customer ON review_events (customer_id, action, created_at DESC);
```

Es la primera tabla de eventos del sistema (hallazgo 3.7). Deliberadamente **no** es una tabla de
analytics genérica: tiene tres acciones y un CHECK que las cierra. Una tabla `events (name, payload jsonb)`
sería más "flexible" y por eso mismo imposible de consultar sin adivinar qué se guardó.

RLS con el patrón multitenant de la 00031 (`tenant_all_review_events`).

### 4.3 El evento `shown` se deduplica

`GET /api/check-in/review-prompt` sella el `shown`. Si el cliente recarga la pantalla de éxito, no debe
contar dos impresiones. Guarda: **no se registra un `shown` si ya hay uno de ese cliente en las últimas
12 horas.** Con eso, "impresiones" ≈ "visitas en las que se le mostró", que es el denominador que hace
honesta la tasa de conversión.

---

## 5. Configuración

| Clave (`admin_settings`) | Default | Qué es |
|---|---|---|
| `review_reward_id` | `''` | Id del catálogo `campaign_rewards`. Vacío = pop-up sin premio. |
| `review_reward_window_days` | `30` | Días que tiene el cliente para reclamarlo. |

El **link de Google** no va aquí: vive en `tenants.config.google_maps_url` (jsonb), que es de donde lo lee
`resolveBranding()`. Duplicarlo en `admin_settings` crearía dos fuentes de verdad. Se edita con un endpoint
nuevo, `PUT /api/dashboard/tenant-config`, con **whitelist de claves** (hoy solo `google_maps_url`): el
dashboard no puede pisar el branding entero por accidente.

Constante nueva en `src/constants/rewards.ts`: `DEFAULT_REVIEW_REWARD_WINDOW_DAYS = 30`.

---

## 6. El flujo

```
 check-in exitoso
        │
        ├─ (si hay tier desbloqueado) → el cliente elige Mystery Box / premio seguro
        │                                  el modal ESPERA (B3-D6)
        ▼
 GET /api/check-in/review-prompt?phone=…
        │  ¿hay google_maps_url?  ¿clicked_at es NULL?
        ├─ no ─→ no se muestra nada
        └─ sí ─→ log 'shown' (dedupe 12h) → { show: true, reward_title, google_url }
                        │
                        ▼
              ┌──────────────────────┐
              │   MODAL (sin X)      │
              │  "Gánate {premio}    │
              │   por una reseña"    │
              └──────────────────────┘
                 │                │
   "Dejar reseña"│                │"La próxima lo hago"
                 ▼                ▼
        ┌────────────────┐   POST review-action {postponed}
        │ PASOS 1 · 2    │   → sella postponed_at, log evento
        │ 1 muéstrale la │   → cierra (vuelve en el próximo check-in)
        │   reseña al    │
        │   mesero       │
        │ 2 redime tu    │
        │   regalo       │
        │ [Ir a Google]  │
        └────────────────┘
                 │
                 ▼
   POST review-action {clicked}
   → sella clicked_at
   → grantReward(source:'review', windowDays)
   → log evento con grant_id
   → window.open(googleReviewUrl)
                 │
                 ▼  (visibilitychange: el cliente vuelve a la pestaña)
        ┌────────────────────────────┐
        │ "Gracias por dejarnos tus  │
        │  comentarios, te esperamos │
        │  de regreso"               │
        │ + "muéstrale tu reseña al  │
        │    mesero para reclamar X" │
        └────────────────────────────┘
```

**Elegibilidad (server-side, nunca en el cliente):**

- Hay `google_maps_url` configurado (si no, no hay a dónde mandarlo → no se muestra).
- `customer.google_review_clicked_at IS NULL` (R6.b).
- El cliente existe en este tenant.

**No se muestra** en check-in duplicado (igual que hoy).

**Caso borde documentado:** si el cliente clickea el link y luego deja vencer el premio sin reclamarlo, el
pop-up **no le vuelve a salir**. Es correcto: ya fue a Google. Pedirle otra reseña sería absurdo, y el
premio vencido queda contado en las métricas como lo que fue — una reseña que nadie cobró.

**Caso borde de `grantReward`:** si devuelve `duplicate_active` (el cliente ya tenía un premio de reseña
activo), se trata como éxito y se sigue adelante. Un premio que ya existe no es un error.

---

## 7. Superficie de código

| Pieza | Archivo | Estado |
|---|---|---|
| Migración | `supabase/migrations/00032_review_tracking.sql` | ➕ |
| Tipos (`ReviewEvent`, `ReviewAction`, `ReviewPromptState`, `ReviewFunnel`) | `src/types/database.types.ts` | 🔄 |
| Constante de la ventana | `src/constants/rewards.ts` | 🔄 |
| Servicio: gate, eventos, grant, funnel | `src/services/review.service.ts` | ➕ |
| Endpoint del prompt (+ log `shown`) | `src/app/api/check-in/review-prompt/route.ts` | ➕ |
| Endpoint de acción (click / postpone) | `src/app/api/check-in/review-action/route.ts` | ➕ |
| Modal | `src/components/features/check-in/GoogleReviewModal.tsx` | ➕ |
| Montaje + espera al Mystery Box | `src/components/features/check-in/CheckInSuccess.tsx` | 🔄 |
| Card inline vieja | `src/components/features/check-in/GoogleReviewCard.tsx` | 🗑️ |
| Modal muerto de la "X" (hallazgo 3.6) | `src/components/features/check-in/GoogleReviewPopup.tsx` | 🗑️ |
| Ajustes: link, recompensa, ventana (hallazgo 3.8) | `src/app/(dashboard)/dashboard/settings/page.tsx` | 🔄 |
| Escritura de `tenants.config` (whitelist) | `src/app/api/dashboard/tenant-config/route.ts` | ➕ |
| Métricas del funnel | `src/app/api/dashboard/review-metrics/route.ts` | ➕ |
| Card del funnel en el dashboard | `src/components/dashboard/ReviewFunnelCard.tsx` | ➕ |

**No se toca** `src/app/api/check-in/route.ts` — a propósito (B3-D1 + gotcha #9).

### El funnel que verá el dueño

```
  Se mostró 240 veces  →  38 fueron a Google (16%)  →  29 reclamaron el premio (76%)
```

La primera tasa mide el **gancho** (¿el copy y el premio convencen?). La segunda mide la **entrega**
(¿el mesero está cerrando el ciclo?). Son dos problemas distintos y hay que poder distinguirlos: un 3%
en la primera es un problema de incentivo; un 20% en la segunda es un problema de operación.

---

## 8. Seguridad

- Los dos endpoints públicos resuelven el tenant **por dominio** (`getTenantByDomain`) y filtran
  `tenant_id` en cada query. Sin excepción (el service-role ignora RLS por diseño).
- `POST /api/check-in/review-action` es público y otorga un premio → **rate limit por teléfono**
  (patrón de `/api/check-in/status`: `rateLimit('review-action:${phone}', …)`). El daño potencial ya
  está acotado por partida doble: `clicked_at` solo se sella una vez y el índice único de la 00031
  impide un segundo premio de reseña activo. El rate limit es la tercera capa.
- El teléfono es el único identificador (no hay sesión). Es el mismo modelo de confianza que
  `/api/mystery-box/resolve`, que ya otorga premios con solo el teléfono. No se introduce una superficie
  nueva.

---

## 9. Verificación

- `npx tsc --noEmit` limpio.
- `npx next build` verde.
- `npx eslint` sin errores nuevos (el árbol ya arrastra 14 preexistentes en `useDashboardAnalytics.ts` y
  `useStaffAuth.ts`).
- Recorrido manual del flujo: check-in → modal → pasos → link → gracias; y check-in → "la próxima lo
  hago" → el modal vuelve en el siguiente check-in y no en el mismo.

## 10. Tareas del dueño tras el despliegue

| # | Tarea | Si no se hace |
|---|-------|---------------|
| 1 | **Aplicar `supabase/migrations/00032_review_tracking.sql`** | El pop-up no se muestra y el endpoint devuelve error (la UI degrada en silencio, no revienta el check-in). |
| 2 | **Pegar el link de Google** en Ajustes → *Reseñas de Google* | El pop-up **no aparece nunca**: no hay a dónde mandar al cliente. |
| 3 | *(Opcional)* **Elegir la recompensa** por reseña | El pop-up sale igual, pero sin gancho: pide el favor en vez de ofrecer algo. |
