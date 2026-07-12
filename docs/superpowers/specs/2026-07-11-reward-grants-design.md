# Spec — Premios otorgados, entrega y reactivación agresiva (Bloque 1)

> **Estado:** ✅ APROBADO — listo para implementar
> **Fecha:** 2026-07-11
> **Requerimientos que cubre:** R1, R2, R3 + hallazgos 3.1, 3.2, 3.4 de
> [`REQUERIMIENTOS_JULIO_2026.md`](../../requerimientos/REQUERIMIENTOS_JULIO_2026.md)

---

## 1. El problema

El sistema tiene un hueco conceptual. Sabe **quién ganó** un premio (`mystery_box_results`) y sabe **qué
se entregó** (`reward_redemptions`), pero no tiene ningún objeto que represente *"este cliente tiene un
premio suyo, pendiente de reclamar"*.

De ese hueco salen los tres síntomas:

1. El mesero no tiene ninguna pantalla que mirar, así que la entrega solo se puede registrar durante los
   3 segundos posteriores al escaneo — cuando el cliente **todavía no eligió su premio** (hallazgo 3.1).
2. Un premio de campaña no cabe en ningún lado: `reward_redemptions.tier_id` es `NOT NULL` y un premio de
   campaña no tiene tier (hallazgo 3.2).
3. El cliente no tiene forma de saber que tiene un premio esperándolo.

## 2. La solución: el premio otorgado

Se introduce **`reward_grants`**: un premio que le pertenece a un cliente, con estado y vencimiento
opcional. Es la pieza que va en el medio.

```
  GANAR                    TENER                      ENTREGAR
  ─────                    ─────                      ────────
  mystery_box_results  →   reward_grants          →   reward_redemptions
  (el cliente eligió)      (activo / vencido)         (el mesero entregó,
  cron reactivación    →   ← NUEVO                     con mesa y nombre)
  (la campaña otorgó)
```

`reward_redemptions` **no cambia de propósito**: sigue siendo el registro de la entrega física, con su
mesa y su mesero. Lo que cambia es que ahora *siempre hay algo que entregar* y *siempre hay dónde
tocarlo*.

Dos fuentes alimentan `reward_grants`:

| Tipo | Origen | Vence |
|------|--------|-------|
| `tier_prize` | El cliente cruzó el umbral de puntos y eligió Mystery Box o "a la segura". | No |
| `campaign_prize` | La reactivación agresiva se lo otorgó. (Más adelante: reseñas, referidos, promos.) | Sí — `expires_at` |

Y un catálogo, **`campaign_rewards`**: los premios de campaña que el dueño edita en el dashboard
("1/2 sushi gratis", "Postre cortesía"). Es la misma infraestructura que van a reusar los referidos y las
promos.

---

## 3. Modelo de datos

Migración: `supabase/migrations/00031_reward_grants.sql`

### 3.1 `campaign_rewards` (nueva)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid` PK | |
| `tenant_id` | `uuid` NOT NULL | FK `tenants` ON DELETE CASCADE |
| `title` | `text` NOT NULL | Lo que ve el cliente: "1/2 sushi gratis" |
| `description` | `text` NULL | Notas internas para el mesero |
| `is_active` | `boolean` NOT NULL DEFAULT `true` | |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

Índice: `(tenant_id, is_active)`.

### 3.2 `reward_grants` (nueva)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | `uuid` PK | |
| `tenant_id` | `uuid` NOT NULL | FK `tenants` ON DELETE CASCADE |
| `customer_id` | `uuid` NOT NULL | FK `customers` ON DELETE CASCADE |
| `grant_type` | `text` NOT NULL | CHECK `tier_prize \| campaign_prize` |
| `source` | `text` NOT NULL | CHECK `mystery_box \| safe_choice \| reactivation \| review \| manual` |
| `prize_title` | `text` NOT NULL | **Snapshot.** Si el dueño renombra el premio del catálogo, lo ya otorgado no cambia. |
| `tier_id` | `uuid` NULL | FK `reward_tiers` ON DELETE SET NULL. Solo para `tier_prize`. |
| `mystery_box_result_id` | `uuid` NULL | FK `mystery_box_results` ON DELETE SET NULL. Solo para `tier_prize`. |
| `campaign_reward_id` | `uuid` NULL | FK `campaign_rewards` ON DELETE SET NULL. Solo para `campaign_prize`. |
| `campaign_id` | `uuid` NULL | FK `campaigns` ON DELETE SET NULL. Trazabilidad: qué corrida lo otorgó. |
| `status` | `text` NOT NULL DEFAULT `'active'` | CHECK `active \| redeemed \| expired` |
| `expires_at` | `timestamptz` NULL | **NULL = no vence.** Los premios de tier no vencen. |
| `reminder_sent_at` | `timestamptz` NULL | Para no mandar el recordatorio dos veces. |
| `redemption_id` | `uuid` NULL | FK `reward_redemptions` ON DELETE SET NULL. Se llena al entregar. |
| `granted_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `redeemed_at` | `timestamptz` NULL | |

**Índices e integridad:**

- `(tenant_id, customer_id, status)` — la consulta caliente del cliente y del mesero.
- `(tenant_id, status, expires_at)` — el cron de recordatorio y el barrido de vencidos.
- **Anti-duplicado de campaña:**
  `UNIQUE (customer_id, source) WHERE status = 'active' AND grant_type = 'campaign_prize'`
  Un cliente no puede tener dos premios de reactivación activos a la vez. Deliberadamente **no** aplica a
  `tier_prize`: un cliente sí podría desbloquear dos tiers antes de que le entreguen el primero, y un
  índice único ahí rompería el check-in con un `23505`.

### 3.3 `reward_redemptions` (modificada)

- **`tier_id` pasa a `NULL`ABLE.** Es el fix del hallazgo 3.2. Los premios de tier lo siguen llenando; los
  de campaña, no.
- **Nueva columna `grant_id uuid NULL`** → FK `reward_grants` ON DELETE SET NULL.
- **Nuevo índice único parcial:** `UNIQUE (grant_id) WHERE grant_id IS NOT NULL`.
  Esta es la defensa contra la doble entrega: si dos meseros tocan "Entregar" sobre el mismo premio al
  mismo tiempo, el segundo `INSERT` choca con un `23505` y `recordRedemption()` ya sabe traducirlo a
  `already_redeemed` ([`redemption.service.ts:89`](../../../src/services/redemption.service.ts)). **La
  garantía está en la base de datos, no en la UI.**

### 3.4 Trigger `mark_grant_redeemed()`

Al insertar en `reward_redemptions` con `grant_id` no nulo, marca el grant como `redeemed`, sella
`redeemed_at` y guarda el `redemption_id`. Mismo patrón que el `mark_mystery_box_redeemed()` que ya
existe ([`00022_reward_redemptions.sql:69-86`](../../../supabase/migrations/00022_reward_redemptions.sql)),
que se conserva intacto.

### 3.5 `campaigns.source` (modificada)

El CHECK se amplía con `'reward_reminder'`, para que la corrida del recordatorio quede registrada como
una campaña más y sea auditable.

### 3.6 Backfill

Todo `mystery_box_results` con `redeemed = false` genera un `reward_grant` activo de tipo `tier_prize`.
Los premios que los clientes ya eligieron y nadie les entregó **no se pierden**: aparecen en la lista del
mesero desde el primer día.

---

## 4. Los tres puntos de contacto

Los tres escriben en el mismo modelo. Un solo camino de datos, tres puertas.

### 4.1 Pantalla "Premios pendientes" (mesero) — **el arreglo de la carrera**

Ruta nueva: `/mesero/rewards`. Enlazada desde el dashboard del mesero con un contador de pendientes.

Muestra **solo premios de clientes presentes** (decisión D4): grants `active` cuyo cliente tiene un
check-in en las últimas **6 horas**. La lista se mantiene corta y accionable durante el servicio.

Cada fila: nombre y teléfono del cliente, título del premio, badge de origen (`MYSTERY` / `SEGURO` /
`CAMPAÑA`), hace cuánto se otorgó, y — si es de campaña — cuánto le falta para vencer. Un input de mesa y
un botón **Entregar**.

Al entregar: `POST /api/reward-redeem` con el `grant_id`. El mesero se atribuye solo, desde su sesión de
staff (`resolveStaffAuth` ya devuelve el `staffId`,
[`reward-redeem/route.ts:27-78`](../../../src/app/api/reward-redeem/route.ts)).

**Esto elimina la condición de carrera de raíz:** ya no importa si el cliente abrió su Mystery Box 5
segundos o 5 minutos después del escaneo. El premio queda ahí, esperando, hasta que alguien lo entregue.

Polling cada 20s para que un premio recién elegido aparezca sin recargar.

### 4.2 En el escaneo (mesero)

`RewardAlert` deja de ser el único camino y pasa a ser un atajo. Se reescribe para consultar
**`reward_grants` activos** en vez de `mystery_box_results`, y para poder mostrar **más de uno**.

El caso que gana con esto es el premio de campaña: ese grant **ya existe antes de que el cliente
llegue**, así que al escanear salta inmediatamente y no hay carrera que valga. Un toque y entregado.

Se le añade un polling corto (cada 3s, máximo 60s) para cubrir también el Mystery Box elegido justo
después del escaneo, mientras el mesero siga en la pantalla. Es un extra, no la garantía — la garantía es
la lista de §4.1.

### 4.3 En la tarjeta del cliente (R3)

`CustomerCard` gana un bloque bajo sus visitas y puntos:

```
  ┌──────────────────────────────────┐
  │  🎁  DISPONIBLE                  │
  │  1/2 sushi gratis                │
  │  Vence en 3 días · 18 de julio   │
  │  Muéstrale esto al mesero        │
  └──────────────────────────────────┘
```

Si el grant no vence (premio de tier), se omite la cuenta regresiva. Si hay varios, se listan.

Los datos ya viajan: `GET /api/check-in/status` gana un campo `active_grants[]`. Es la misma llamada que
`CheckInForm` ya hace cada 5s, así que **no hay coste de red nuevo** — el bloque aparece solo cuando el
premio se otorga.

Esto es lo que hace la campaña agresiva de verdad: el cliente ve su premio y su cuenta regresiva cada vez
que abre su tarjeta, y llega **pidiéndolo** en vez de esperar a que el mesero se acuerde.

---

## 5. La reactivación agresiva con premio (R1)

### 5.1 Configuración (Dashboard > Ajustes > Reactivación)

Tres campos nuevos, sobre el `admin_settings` key-value que ya existe:

| Key | Ejemplo | Qué es |
|-----|---------|--------|
| `aggressive_reward_id` | uuid | Premio del catálogo `campaign_rewards`. **Reemplaza a `reactivation_aggressive_reward_id`**, que apuntaba a la tabla `rewards` legacy y no tenía UI (hallazgo 3.4). |
| `aggressive_reward_window_days` | `7` | Días de ventana desde el envío. |
| `reactivation_aggressive_template_sid` | ya existe | Plantilla de Twilio. |

Y una página nueva para el catálogo: **Dashboard > Premios de campaña** (CRUD simple).

### 5.2 Qué cambia en el cron

En [`src/app/api/cron/reactivation/route.ts`](../../../src/app/api/cron/reactivation/route.ts), PASS 2
(el bloque agresivo, líneas 198-248):

Tras un envío exitoso, **se otorga el premio en la misma iteración**: se crea un `reward_grant` de tipo
`campaign_prize`, `source = 'reactivation'`, con `expires_at = now() + aggressive_reward_window_days` y el
`campaign_id` de la corrida.

Si el cliente **ya tiene** un grant de reactivación activo, no se le otorga otro (lo garantiza el índice
único de §3.2, y el código lo comprueba antes para no gastar el intento).

Variables de la plantilla agresiva — se añade la fecha límite:

| Var | Antes | Ahora |
|-----|-------|-------|
| `{{1}}` | nombre | nombre |
| `{{2}}` | puntos | puntos |
| `{{3}}` | próximo tier | próximo tier |
| `{{4}}` | título del premio | título del premio |
| `{{5}}` | — | **fecha límite** ("18 de julio") |

`sendTemplateMessage()` ya reintenta con una variable menos ante el error 21665 de Twilio
([`whatsapp.service.ts:125-187`](../../../src/services/whatsapp.service.ts)), así que un tenant con una
plantilla de 4 variables sigue funcionando sin tocar nada.

### 5.3 Los dos relojes son independientes (D6)

El vencimiento del premio (`aggressive_reward_window_days`) **no se deriva** de los días de reactivación
(`reactivation_aggressive_days`). Subir la reactivación agresiva de 25 a 45 días no toca la ventana del
premio, y viceversa. Son dos conceptos que no tienen por qué moverse juntos.

---

## 6. El recordatorio de vencimiento

Endpoint nuevo: `/api/cron/reward-reminder`, protegido por `validateCronSecret()` y **disparado por
n8n** — igual que `reactivation` y `birthday`, con `vercel.json` en `"crons": []`. Acepta `?tenant=<slug>`
o recorre todos los tenants activos con `Promise.allSettled`, exactamente el patrón que ya usan los otros
crons.

**Qué hace, en orden:**

1. **Barrido de vencidos.** Marca `status = 'expired'` todo grant `active` con `expires_at < now()`. Esto
   mantiene las métricas honestas (§7) sin necesidad de un cron aparte.
2. **Busca candidatos.** Grants `active`, con `expires_at` dentro de los próximos `N` días,
   `reminder_sent_at IS NULL`, cuyo cliente **no ha vuelto** desde que se le otorgó
   (`customers.last_visit_at < granted_at`).
3. **Aplica el cap mensual** con `filterByMonthlyCap()`, que ya existe.
4. **Envía** y sella `reminder_sent_at`.

**Caps (decisión D5):**

- **Exento** del cap de frecuencia de 7 días. Sin esta excepción el recordatorio **nunca** se enviaría con
  ventanas de 5-7 días, que son justo las que generan urgencia. Es la misma excepción que ya tiene
  cumpleaños.
- **Sujeto** al cap mensual de 3 mensajes de marketing. Se añade `'reward_reminder'` a
  `MONTHLY_CAP_SOURCES` en [`src/constants/rewards.ts`](../../../src/constants/rewards.ts). Un cliente
  nunca recibe más de 3 mensajes de marketing al mes, pase lo que pase.

**Configuración (Ajustes):**

| Key | Default | Qué es |
|-----|---------|--------|
| `reward_reminder_enabled` | `false` | Encender/apagar. |
| `reward_reminder_days_before` | `2` | Cuántos días antes de vencer. |
| `reward_reminder_template_sid` | — | Plantilla de Twilio. |

Variables: `{{1}}` nombre, `{{2}}` título del premio, `{{3}}` días restantes.

Si `reward_reminder_enabled` es `false` o falta la plantilla, el cron hace el barrido de vencidos y sale
sin enviar nada. Se puede dejar el workflow de n8n corriendo aunque el recordatorio esté apagado.

---

## 7. Qué ve el dueño

`/dashboard/redemptions` ya existe y ya tiene las columnas de **mesa** y **mesero**
([`RedemptionsTable.tsx:96-97`](../../../src/components/dashboard/RedemptionsTable.tsx)) — estaban vacías
solo porque la fila nunca se creaba. Con esto se llenan solas. **No hay que construir esas columnas: hay
que hacer que existan las filas.**

Se le añaden arriba las métricas que hoy no existen y que son las que responden *"¿la reactivación
agresiva realmente trae gente?"*:

| Métrica | Cómo se calcula |
|---------|-----------------|
| **Premios otorgados** | grants creados en el rango |
| **Redimidos** | grants `redeemed` en el rango |
| **Vencidos sin reclamar** | grants `expired` en el rango |
| **Tasa de redención** | redimidos / otorgados, **segmentada por `source`** |

La segmentación por origen es la que importa: la tasa de redención de `source = 'reactivation'` es,
literalmente, el porcentaje de clientes dormidos que la campaña despertó.

---

## 8. Archivos

### Nuevos

| Archivo | Qué es |
|---------|--------|
| `supabase/migrations/00031_reward_grants.sql` | Tablas, índices, trigger, backfill |
| `src/services/reward-grant.service.ts` | `grantReward`, `getActiveGrants`, `getPendingGrantsForPresentCustomers`, `expireGrants`, `findGrantsDueForReminder`, `getGrantMetrics` |
| `src/services/campaign-reward.service.ts` | CRUD del catálogo |
| `src/app/api/staff/pending-rewards/route.ts` | Lista del mesero (auth de staff) |
| `src/app/api/dashboard/campaign-rewards/route.ts` | CRUD del catálogo (auth de admin) |
| `src/app/api/cron/reward-reminder/route.ts` | Cron n8n: barrido + recordatorio |
| `src/app/(public)/mesero/rewards/page.tsx` | Pantalla "Premios pendientes" |
| `src/components/features/staff/PendingRewardsList.tsx` | La lista |
| `src/components/features/check-in/AvailableRewardBanner.tsx` | El bloque "Disponible" de la tarjeta |
| `src/app/(dashboard)/dashboard/campaign-rewards/page.tsx` | Catálogo de premios |
| `src/components/dashboard/GrantMetricsCards.tsx` | Métricas de otorgados/redimidos/vencidos |

### Modificados

| Archivo | Cambio |
|---------|--------|
| `src/services/redemption.service.ts` | `recordRedemption` acepta `grantId`; `tierId` pasa a opcional |
| `src/app/api/reward-redeem/route.ts` | Acepta `grant_id`; valida que el grant sea del tenant y esté activo |
| `src/app/api/mystery-box/resolve/route.ts` | Además del `mystery_box_result`, otorga el `reward_grant` |
| `src/app/api/check-in/status/route.ts` | Devuelve `active_grants[]` |
| `src/app/api/cron/reactivation/route.ts` | PASS 2 otorga el premio con `expires_at`; `{{5}}` = fecha límite |
| `src/components/features/staff/RewardAlert.tsx` | Lee grants; soporta varios; polling corto |
| `src/components/features/check-in/CustomerCard.tsx` | Monta `AvailableRewardBanner` |
| `src/app/(public)/mesero/dashboard/page.tsx` | Enlace a "Premios pendientes" con contador |
| `src/app/(dashboard)/dashboard/settings/page.tsx` | Sección premio de reactivación + recordatorio |
| `src/app/(dashboard)/dashboard/redemptions/page.tsx` | Monta `GrantMetricsCards` |
| `src/app/api/dashboard/redemptions/summary/route.ts` | Añade métricas de grants |
| `src/constants/rewards.ts` | `MONTHLY_CAP_SOURCES += 'reward_reminder'`; defaults de ventana y recordatorio |
| `src/types/database.types.ts` | `RewardGrant`, `CampaignReward`; `RewardRedemption.tier_id` nullable + `grant_id` |
| `src/lib/branding.ts` *(si aplica)* | — |

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| **Doble entrega** — dos meseros tocan "Entregar" a la vez. | Índice único parcial en `reward_redemptions(grant_id)`. La garantía está en la base de datos; el `23505` ya se traduce a `already_redeemed`. |
| **Romper el check-in** — el nuevo `INSERT` de grant falla y tumba el flujo de puntos. | El otorgamiento del grant en `mystery-box/resolve` va en un `try/catch` que **no** propaga: si falla, el cliente igual ve su premio y el grant se puede reconstruir. El check-in nunca se cae por esto. |
| **Premios de campaña duplicados** si el cron corre dos veces. | Índice único parcial `(customer_id, source) WHERE status='active' AND grant_type='campaign_prize'`, más la comprobación previa en código. |
| **Premios pendientes históricos perdidos** al desplegar. | Backfill en la migración (§3.6). |
| **El tenant tiene una plantilla agresiva de 4 variables** y ahora mandamos 5. | `sendTemplateMessage()` ya reintenta con una variable menos ante el 21665. Degrada, no rompe. |
| **La lista del mesero se llena de gente que no está.** | Acotada a check-in en las últimas 6 horas (D4). |
| **Aislamiento entre tenants.** | Toda query de grants filtra por `tenant_id` explícitamente. El proyecto usa service-role, que **ignora RLS por diseño** ([`DB_SCHEMA.md:685-689`](../../DB_SCHEMA.md)) — el filtrado es responsabilidad del código, sin excepción. |

## 10. Cómo se verifica

1. **Migración** aplica limpia y el backfill crea grants para los `mystery_box_results` pendientes.
2. **Flujo Mystery Box:** cliente cruza umbral → elige caja → el premio aparece en `/mesero/rewards` →
   el mesero pone mesa y entrega → aparece en `/dashboard/redemptions` **con mesa y con nombre del
   mesero**. Este es el test que hoy falla.
3. **Doble entrega:** dos pestañas de mesero tocan "Entregar" sobre el mismo premio → la segunda recibe
   `409 already_redeemed`, no una segunda fila.
4. **Reactivación agresiva:** correr el cron contra un cliente inactivo → llega el WhatsApp con la fecha →
   el grant existe con `expires_at` correcto → el cliente ve "Disponible" y la cuenta regresiva en su
   tarjeta → al escanear, le salta al mesero.
5. **Recordatorio:** grant a punto de vencer, cliente que no volvió → sale un solo mensaje, se sella
   `reminder_sent_at`, y una segunda corrida **no** manda otro.
6. **Cap mensual:** un cliente que ya recibió 3 mensajes de marketing este mes **no** recibe el
   recordatorio.
7. **Vencimiento:** pasado `expires_at`, el grant queda `expired`, desaparece de la tarjeta del cliente y
   de la lista del mesero, y cuenta en "Vencidos sin reclamar".

---

## 11. Lo que este bloque deja listo para después

El catálogo `campaign_rewards` y el motor `reward_grants` **son la infraestructura de los referidos, las
promos y la recompensa por reseña**. Ninguno de esos tres necesitará tocar la entrega, la atribución al
mesero, el vencimiento ni las métricas: solo tendrán que otorgar un grant con otro `source`.

- **Reseñas (Bloque 3):** dejar reseña → `grantReward(source: 'review')`. La entrega ya funciona.
- **Referidos:** el amigo hace su primera visita → `grantReward(source: 'manual')` al que refirió.
- **Promos (R4):** otorgar un grant a un segmento en vez de a un cliente reactivado.
