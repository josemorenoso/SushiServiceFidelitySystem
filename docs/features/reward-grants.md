# Feature — Premios Otorgados (Reward Grants)

> **Estado:** ✅ COMPLETO (00031 aplicada). **2026-10-13 (S-1, sin migración):** el catálogo y la elección de «qué premio
> regala cada mensaje» viven juntos en **Recompensas › Premios para regalar** (§ «Dónde vive cada premio»); salieron de
> Campañas y de Ajustes, y las escrituras del catálogo exigen alcance de marca. **2026-10-13 (ciclo, fase 1B, migración 00071 sin aplicar):** `grantReward()`
> acepta un vencimiento exacto (`expiresAt`) y `skipReminder`; el recordatorio no sale para los `skip_reminder` (§ «El
> regalo del ciclo de recuperación»). **2026-10-15 (referidos, migración 00075 sin aplicar):** fuente `referral` con
> `referral_id`, el freno «un premio por referido y por persona» y el índice de un premio de campaña activo que deja de
> aplicar a `referral` (§ «Los premios de los referidos»).
> **Versión:** v2.3.0
> **Fecha:** 2026-07-11
> **Spec:** [`docs/superpowers/specs/2026-07-11-reward-grants-design.md`](../superpowers/specs/2026-07-11-reward-grants-design.md)
> **Requerimientos:** R1, R2, R3 de [`REQUERIMIENTOS_JULIO_2026.md`](../requerimientos/REQUERIMIENTOS_JULIO_2026.md)

---

## Objetivo

Dar al sistema el concepto que le faltaba: **un premio que le pertenece a un cliente y está pendiente de
reclamar**.

Hasta ahora el sistema sabía quién *ganó* un premio (`mystery_box_results`) y qué se *entregó*
(`reward_redemptions`), pero nada en el medio. De ese hueco salían tres problemas: el mesero no tenía
dónde registrar la entrega salvo en una ventana de 3 segundos imposible de acertar, los premios de
campaña no cabían en el schema, y el cliente no sabía que tenía un premio esperándolo.

## Descripción

`reward_grants` es un premio con dueño, estado y vencimiento opcional.

```
  GANAR                    TENER                      ENTREGAR
  mystery_box_results  →   reward_grants          →   reward_redemptions
  cron reactivación    →   (activo/redimido/          (mesa + mesero)
                            vencido)
```

Dos tipos:

| Tipo | Origen | Vence |
|------|--------|-------|
| `tier_prize` | El cliente cruzó el umbral de puntos y eligió Mystery Box o "a la segura". | No |
| `campaign_prize` | Se lo otorgó una campaña: reactivación agresiva, una **invitación con premio** (`source='invite'`, 00063, [`invite-campaigns.md`](invite-campaigns.md)) o un **referido** (`source='referral'`, 00075, [`referral-program.md`](referral-program.md)). | Sí, `expires_at` (la invitación puede no vencer: `window_days` NULL; el referido, a los días del programa) |

## Modelo de datos

Migración: `supabase/migrations/00031_reward_grants.sql`

- **`campaign_rewards`** — catálogo editable de premios de campaña (`title`, `description`, `is_active`).
- **`reward_grants`** — el premio otorgado. Ver el detalle de columnas e índices en el
  [spec §3](../superpowers/specs/2026-07-11-reward-grants-design.md).
- **`reward_redemptions`** — modificada: `tier_id` pasa a **nullable** (un premio de campaña no tiene
  tier) y gana `grant_id` con un **índice único parcial** que impide la doble entrega a nivel de base de
  datos.
- **`campaigns.source`** — el CHECK se amplía con `'reward_reminder'`.

El schema completo se refleja en [`DB_SCHEMA.md`](../DB_SCHEMA.md).

## Flujo de uso

### Premio de tier (Mystery Box / a la segura)

1. El mesero escanea → el cliente cruza el umbral de puntos.
2. El cliente elige Mystery Box o "a la segura" en su celular → `POST /api/mystery-box/resolve` →
   se crea el `mystery_box_result` **y el `reward_grant`**.
3. El premio aparece en **`/mesero/rewards`** (Premios pendientes).
4. El mesero pone la mesa y toca **Entregar** → `POST /api/reward-redeem` con el `grant_id`.
5. Queda registrado en `/dashboard/redemptions` con la mesa y el nombre del mesero.

**El paso 3 es el arreglo.** Antes, la única ventana para registrar la entrega eran los 3 segundos
posteriores al escaneo — cuando el cliente todavía no había elegido su premio.

### El regalo del ciclo de recuperación (fase 1B, 2026-10-13)

En las marcas con el ciclo ENCENDIDO el regalo no lo otorga el cron sino el **drenador de la cola, al enviar**, y solo si
el mensaje salió (`campaigns.md` § «El ciclo encendido», `send-governance.md` § «Los toques del ciclo en el drenador»):

- **Vencimiento exacto.** `grantReward({ expiresAt })`: el «vence el domingo» que dice el mensaje que acaba de salir
  (`expiresOnSunday()` del día del envío, cierre del domingo en Bogotá, mínimo 5 días). `expiresAt` manda sobre
  `windowDays`; los demás llamadores no cambian (`windowDays` sigue igual).
- **El pequeño vence sin recordatorio** (H2, decisión A3): `grantReward({ skipReminder: true })` graba
  `reward_grants.skip_reminder = true` (00071) y `findGrantsDueForReminder()` no lo devuelve. **No** se sella
  `reminder_sent_at`: diría que salió un recordatorio que nunca salió. El fuerte (rescate y segundo trimestral) sí lleva
  su recordatorio. Con los dos recordatorios, ni el ritmo mensual cabía en 3 mensajes al mes (spec §13).
- `source = 'reactivation'`, `grant_type = 'campaign_prize'`, `campaign_reward_id` = el premio elegido al decidir el
  toque, `campaign_id` = la campaña del día. El índice de un premio de reactivación activo por cliente sigue valiendo: el
  drenador no manda un toque con regalo a quien ya tiene uno vivo (lo pospone hasta el día siguiente a que venza), y un
  `duplicate_active` por carrera deja el toque enviado sin regalo nuevo.
- **El día real del recordatorio del fuerte:** el cron corre a las 11:00 de Bogotá y toma lo que vence dentro de
  `reward_reminder_days_before` (2) días desde esa hora; con vencimiento el domingo a las 23:59:59, la primera corrida
  que lo toma es la del **sábado** (`diaDelRecordatorio()`, `cycle-engine.ts`). La validación de los ritmos simula ese
  día.

### Los premios de los referidos (2026-10-15, 00075)

Un referido da DOS premios, cada uno una fila con `source = 'referral'` y `referral_id`
([`referral-program.md`](referral-program.md)):

- **El regalo del amigo** (`customer_id` = el amigo): se otorga AL REGISTRARSE por `/r/{código}`, con
  `granted_location_id` = la sede del registro, y se entrega en su visita #1, como una invitación.
- **El premio de quien lo trajo** (`customer_id` = quien invitó): se otorga cuando el MESERO valida la primera visita del
  amigo (`completar_referido()` decide una vez), con `granted_location_id` = la sede de ESA visita.
- `grantReward({ referralId, grantedLocationId })`: las dos columnas solo se nombran cuando vienen; los demás llamadores no
  cambian (siguen dejando `granted_location_id` en NULL: deuda #13).
- **`idx_reward_grants_referral_once UNIQUE (referral_id, customer_id)`**: un premio por referido y por persona, para siempre.
  Un segundo intento vuelve como `duplicate_active` (la misma condición esperada de siempre).
- **El índice de un premio de campaña ACTIVO por cliente y fuente ya no aplica a `referral`**: quien trae a tres amigos que
  vienen antes de que reclame el primero tiene tres premios. Para las demás fuentes, la misma regla.
- Si el premio elegido para el referido se retiró del catálogo (o no es de la marca), no se otorga nada y queda en el log.

### Premio de campaña (reactivación agresiva, camino viejo: marcas con el ciclo apagado)

1. El cron agresivo envía el WhatsApp y **otorga el premio** con `expires_at = hoy + N días`.
2. El cliente ve *"Disponible: 1/2 sushi gratis — vence en 3 días"* en su tarjeta, cada vez que la abre.
3. Si no vuelve, a los `N - días_antes` recibe **un** recordatorio (cron diario, sujeto al cap mensual).
4. Cuando vuelve y el mesero lo escanea, el premio **le salta en la pantalla** → un toque, entregado.
5. Si no vuelve nunca, el grant queda `expired` y cuenta en "Vencidos sin reclamar".

## API / Endpoints

| Método | Ruta | Auth | Qué hace |
|--------|------|------|----------|
| `GET` | `/api/staff/pending-rewards` | Staff (JWT o device) | Grants activos de clientes con check-in en las últimas 6h |
| `POST` | `/api/reward-redeem` | Staff | Registra la entrega. Ahora acepta `grant_id`. |
| `GET` | `/api/check-in/status` | Pública | Ahora devuelve `active_grants[]` |
| `POST` | `/api/mystery-box/resolve` | Pública | Ahora otorga el grant además del resultado |
| `GET` | `/api/dashboard/campaign-rewards` | Cualquier sesión de la marca | El catálogo (`?active=true` solo los activos). Un fallo de base es un 500, no `[]` (S-1) |
| `POST/PATCH/DELETE` | `/api/dashboard/campaign-rewards` | **Super usuario de la marca** (`exigirAlcanceDeMarca()`) | Crear, editar, retirar. Un administrador de sede (`role='location'`) recibe 403; desde S-1 (antes `requireTenantId()` lo dejaba cambiar el catálogo de toda la marca) |
| `GET` | `/api/dashboard/redemptions/summary` | Admin | Ahora incluye métricas de grants |
| `GET/POST` | `/api/cron/reward-reminder` | `CRON_SECRET` | Barrido de vencidos + recordatorio. **Hoy lo dispara n8n**; ya declarado en `vercel.json` (`0 16 * * *`) — ver «Disparo del cron de recordatorio» al final. |

Detalle completo en [`API_DOCS.md`](../API_DOCS.md).

## UI / Pantallas

| Pantalla | Ruta | Quién |
|----------|------|-------|
| **Premios pendientes** | `/mesero/rewards` | Mesero |
| Alerta de premio al escanear | `/mesero/confirm` | Mesero |
| Banner "Disponible" con cuenta regresiva | `/check-in` (tarjeta del cliente) | Cliente |
| **Catálogo de premios para regalar** | `/dashboard/rewards?tab=premios` (Recompensas › Premios para regalar). `/dashboard/campaigns?tab=premios` y `/dashboard/campaign-rewards` redirigen ahí (S-1, 2026-10-13) | Admin (un administrador de sede lo ve, no lo cambia) |
| Métricas de otorgados/redimidos/vencidos | `/dashboard/redemptions` | Admin |
| **Para qué se usa cada premio**: regalo fuerte (+ ventana y recordatorio), regalo pequeño, premio por reseña | `/dashboard/rewards?tab=premios`, arriba del catálogo (S-1; antes `/dashboard/settings`, que ahora deja una tarjeta que lleva allá) | Super usuario de la marca |

## Dónde vive cada premio (S-1, 2026-10-13)

Antes eran cuatro lugares; ahora el dueño tiene uno para crear el premio y elegir para qué se usa:

| Qué | Dónde se elige | Clave de `admin_settings` |
|---|---|---|
| Premios por puntos (niveles, caja misteriosa) | Recompensas › Niveles y premios | `reward_tiers` (otra tabla; **no se unifica**, C3) |
| **Regalo fuerte** (reactivación insistente **y** rescate del ciclo) | Recompensas › Premios para regalar | `aggressive_reward_id` + `aggressive_reward_window_days`. El ciclo lo lee como fuerte mientras `cycle_strong_reward_id` esté vacío (`normalizeCycleSettings()`): **una sola elección para los dos caminos** |
| **Regalo pequeño** (el del mensaje «Le regalamos algo», ciclo) | Recompensas › Premios para regalar | `cycle_small_reward_ids` (el selector edita el primero) |
| **Premio por reseña** | Recompensas › Premios para regalar | `review_reward_id` + `review_reward_window_days` |
| **Recordatorio antes de que venza** | Recompensas › Premios para regalar (dentro del regalo fuerte) | `reward_reminder_enabled` + `reward_reminder_days_before` (el mensaje, en Plantillas) |
| Premio de una invitación | Recompensas › Invitaciones: se **elige del catálogo** o se escribe libre | `qr_campaigns.reward_title` (texto; ver [`invite-campaigns.md`](invite-campaigns.md)) |
| **Referidos**: el premio de quien invita y el regalo del amigo | Recompensas › **Referidos**: un premio del catálogo (el mismo selector), puntos o nada | `referral_referrer_reward_*`, `referral_referred_reward_*` (los escribe solo `PUT /api/dashboard/referrals`; [`referral-program.md`](referral-program.md)) |

- **C2 — «temporal» no es un tipo nuevo**: es la ventana de reclamo que ya existía. La pantalla lo dice donde se elige un premio
  que vence («vence a los 7 días»; con el ciclo encendido, «vence el domingo»).
- **Un premio retirado o que ya no está en el catálogo de la marca** no deja el selector vacío (vacío querría decir «sin
  premio»): se muestra con «Este premio ya no está activo: elige otro». Quienes lo consumen ya lo tratan como sin premio:
  la reactivación (`is_active`), la reseña (`getReviewConfig()`) y el ciclo (`premiosDelCiclo()`).
- Un **administrador de sede** ve los selectores y el catálogo, deshabilitados y sin «Guardar»: los premios son de la marca.
- Lo que NO se movió (C1 dice «después»): puntos, Black, ticket promedio, check-in y el link de reseñas siguen en Ajustes;
  los topes globales de la caja misteriosa (`mystery_box_global_caps`) siguen sin pantalla.
- Código: `src/components/dashboard/{PremiosParaRegalarPanel,RewardUsageSelectors,CampaignRewardsCatalog}.tsx` y la lógica pura
  en `src/lib/premios-para-regalar.ts`. Tests: `tests/unit/{recompensas-un-solo-lugar,campaign-rewards-permisos}.test.ts`.

## Configuración (`admin_settings`)

| Key | Default | Qué es |
|-----|---------|--------|
| `aggressive_reward_id` | — | Premio del catálogo para la reactivación agresiva (y, sin `cycle_strong_reward_id`, el regalo fuerte del ciclo) |
| `aggressive_reward_window_days` | `7` | Días de ventana desde el envío (el ciclo vence el domingo) |
| `cycle_small_reward_ids` | — | Regalo(s) pequeño(s) del ciclo; el selector edita el primero |
| `review_reward_id` / `review_reward_window_days` | — / `30` | Premio por reseña y su ventana |
| `reward_reminder_enabled` | `false` | Encender/apagar el recordatorio |
| `reward_reminder_days_before` | `2` | Cuántos días antes de vencer (desde la hora del cron, 11:00: con un vencimiento a las 23:59 el aviso sale el día anterior a ese plazo) |
| `reward_reminder_template_sid` | — | Plantilla de Twilio del recordatorio |

**Reemplaza** a `reactivation_aggressive_reward_id`, que apuntaba a la tabla `rewards` legacy y **no tenía
UI** — había que escribirlo a mano en la base de datos.

## Plantillas de Twilio

**Reactivación agresiva** (`reactivation_aggressive_template_sid`):
`{{1}}` nombre · `{{2}}` puntos · `{{3}}` próximo tier · `{{4}}` premio · `{{5}}` **fecha límite** *(nueva)*

**Recordatorio** (`reward_reminder_template_sid`):
`{{1}}` nombre · `{{2}}` premio · `{{3}}` días restantes

`sendTemplateMessage()` reintenta con una variable menos ante el error 21665 de Twilio, así que una
plantilla agresiva de 4 variables sigue funcionando sin cambios.

## Restricciones

- **Los dos relojes son independientes.** La ventana del premio (`aggressive_reward_window_days`) no se
  deriva de los días de reactivación (`reactivation_aggressive_days`). Subir la reactivación agresiva de
  25 a 45 días no toca la ventana del premio.
- **Un premio con `skip_reminder` no lleva recordatorio** (00071): es el regalo pequeño del ciclo.
- **El recordatorio es exento del cap de frecuencia de 7 días, pero sujeto al cap mensual de 3.** Sin la
  excepción del cap de 7 días nunca se enviaría con ventanas cortas; sin el cap mensual sería spam.
- **Con la plantilla sin aprobar, no se intenta (PL-2-a, 2026-10-12).** En Twilio el puntero
  `reward_reminder_template_sid` se escribe al crear la plantilla, con Meta todavía revisándola. El cron le
  pregunta a Twilio si está aprobada antes de mandar; si no lo está (o Twilio no contesta), ese día no se
  intenta y **no cuenta como fallido**, así que la revisión no gasta los 3 intentos del premio. Zernio y la
  marca demo no preguntan. Detalle en `campaigns.md` § «Tope de reintentos».
- **La lista del mesero solo muestra clientes presentes** (check-in en las últimas 6h). Los premios de
  campaña de clientes que aún no han venido existen, pero solo saltan a la pantalla del mesero cuando el
  cliente llega.
- **Un cliente no puede tener dos premios de reactivación activos a la vez** (índice único parcial). Sí
  puede tener varios premios de tier pendientes, y varios de referidos (uno por amigo que vino; 00075).
- **La defensa contra la doble entrega está en la base de datos**, no en la UI: índice único parcial sobre
  `reward_redemptions(grant_id)`.
- **Aislamiento por tenant:** toda query filtra `tenant_id` explícitamente. El proyecto usa service-role,
  que ignora RLS por diseño — el filtrado es responsabilidad del código.

## Estado de implementación

- [x] Migración `00031_reward_grants.sql` (tablas, índices, trigger, backfill)
- [x] `reward-grant.service.ts` + `campaign-reward.service.ts`
- [x] `POST /api/reward-redeem` acepta `grant_id`; `tier_id` opcional
- [x] `/api/staff/pending-rewards` + pantalla `/mesero/rewards` (con contador en su dashboard)
- [x] `RewardAlert` lee grants y soporta varios
- [x] Banner "Disponible" en la tarjeta del cliente
- [x] Cron de reactivación otorga el premio + `{{5}}` fecha límite
- [x] Cron `/api/cron/reward-reminder` + workflow `n8n/cron_reward-reminder.json`
- [x] Catálogo en `/dashboard/rewards?tab=premios` (antes pestaña de Campañas y, antes, página propia `/dashboard/campaign-rewards`; las dos rutas viejas redirigen)
- [x] Selectores de qué premio usa cada mensaje en la misma pestaña (antes en Ajustes) + métricas en Recompensas › Redenciones
- [x] `DB_SCHEMA.md`, `API_DOCS.md`, `CHANGELOG.md` actualizados

## Pendiente de despliegue

- [ ] **Aplicar la migración 00031 en Supabase.** Hasta entonces, `/mesero/rewards` y el catálogo
      devuelven error (la UI degrada con un toast, no revienta).
- [ ] **Crear las plantillas de Twilio** y aprobarlas: la agresiva necesita `{{4}}` premio y
      `{{5}}` fecha límite; el recordatorio es una plantilla nueva.
- [x] **Importar `n8n/cron_reward-reminder.json`** en n8n y activarlo. — Hecho: el workflow
      **"Cron Recordatorio de Premios"** está activo en n8n y es quien dispara el recordatorio hoy.
- [ ] **Desplegar `vercel.json` a producción con el plan Pro activo** y, en el **mismo movimiento**,
      apagar el Schedule Trigger de **"Cron Recordatorio de Premios"** en n8n. Ver «Disparo del cron de
      recordatorio» al final.
- [ ] **Crear los premios del catálogo** en Recompensas › Premios para regalar y elegir uno como «Regalo fuerte» (en la
      misma pestaña, arriba del catálogo).

## Deja listo para después

El catálogo y el motor de grants **son la infraestructura de los referidos, las promos y la recompensa por
reseña**. Ninguno tendrá que tocar la entrega, la atribución al mesero, el vencimiento ni las métricas:
solo otorgar un grant con otro `source`. Se cumplió con las invitaciones (`invite`, 00063) y con los referidos
(`referral`, 00075): la entrega, el mesero y las métricas no cambiaron (solo ganaron su etiqueta).

---

## Correcciones de auditoría (v2.5.1)

- **`grantReward({ windowDays })` — `0` ya no significa "no vence".** La condición anterior
  (`windowDays && windowDays > 0`) colapsaba `0` con "omitido" y producía un grant **permanente**
  (`expires_at: null`). Ahora: `null`/`undefined` = no vence; un número —incluido `0`— SÍ define ventana
  (0 o negativo = vence de inmediato). Ningún caller pasa 0 hoy, pero el default silencioso era peligroso.
- **`recordRedemption` — filtro `tenant_id` en la rama de mystery box.** La validación por
  `mystery_box_result_id` buscaba la fila solo por `id`; ahora filtra también por `tenant_id`, igual que la
  rama de `grant_id`. Defensa consistente contra IDOR entre tenants (antes se apoyaba solo en `customer_id`).
- **Cron de recordatorio en lotes.** `reward-reminder` enviaba en serie (un `await` de red por candidato).
  Ahora usa lotes paralelos (`BATCH_SIZE=10`, mismo patrón que `campaigns/manual`): 20-50 premios pasan de
  10-25 s a unos pocos segundos.

- **`reward-redeem` vuelve a aceptar la entrada manual del mesero (`staff_override`).** La 00031 empezó a
  exigir `grant_id` o `mystery_box_result_id` para que los índices únicos impidan la doble entrega, pero eso
  rompía el shape legacy `staff_override` (solo `tier_id` + `prize_title`, sin ancla), que devolvía 400.
  Ahora `staff_override` está **exento** del requisito de ancla: es un registro de auditoría escrito a mano
  (p. ej. una integración de POS), no un flujo automático, así que la protección de doble entrega no aplica
  a ese caso. El resto de orígenes siguen obligados a venir anclados.

---

## Disparo del cron de recordatorio (2026-09-02)

`/api/cron/reward-reminder` **no cambió ni una línea de código** en este movimiento: sigue exportando `GET`
y `POST` y sigue validando `CRON_SECRET`. Vercel Cron invoca el `GET` mandando solo el header
`Authorization: Bearer $CRON_SECRET`, que es exactamente lo que ya espera `validateCronSecret()`. Lo único
que cambia es **quién lo llama**.

- **Hoy lo llama n8n.** El workflow **"Cron Recordatorio de Premios"** (`n8n/cron_reward-reminder.json`)
  lo dispara a las **16:00 UTC = 11:00 de Colombia**.
- **En este commit se declara en `vercel.json`.** El archivo, que hasta ahora era literalmente
  `{"crons": []}`, pasa a declarar `/api/cron/reward-reminder` con **`0 16 * * *`**: un calco 1:1 de la
  expresión que ya tenía el Schedule Trigger de n8n. **Cero cambio de cadencia y cero cambio de hora** — la
  expresión ya estaba en UTC, no hay que sumarle las 5 horas de Colombia.
- **Todavía no dispara desde Vercel.** El commit es local y sin push: el equipo estaba en plan Hobby, que
  solo admite crons diarios, y las expresiones `*/15` que entran en el mismo `vercel.json`
  (`/api/cron/calendar-dispatch` y `/api/cron/queue-drain`) hacen **fallar el build**. El push espera a que
  el dueño confirme que el plan Pro está activo. Es decir: **queda declarado en `vercel.json`; el disparo
  efectivo empieza cuando se despliegue a producción con Pro activo.**

> ⚠️ **Un cron en `vercel.json` y su Schedule Trigger de n8n encendidos a la vez = doble disparo.** Por eso
> el trigger de "Cron Recordatorio de Premios" se apaga en el **mismo movimiento** del despliegue, ni antes
> ni después. Hoy sigue encendido, que es lo correcto mientras Vercel no dispare.

El VPS de n8n **no se apaga**: sigue sirviendo los domicilios (webhook en caliente hacia
`N8N_DOMICILIOS_WEBHOOK_URL`). Sólo se apagan los Schedule Trigger de los crons migrados; esa es la Fase 2
y aún no ha ocurrido.
