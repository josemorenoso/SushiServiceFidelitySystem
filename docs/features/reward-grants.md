# Feature — Premios Otorgados (Reward Grants)

> **Estado:** ✅ COMPLETO — pendiente de aplicar la migración 00031 en producción
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
| `campaign_prize` | Se lo otorgó una campaña (hoy: reactivación agresiva). | Sí, `expires_at` |

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

### Premio de campaña (reactivación agresiva)

1. El cron agresivo envía el WhatsApp y **otorga el premio** con `expires_at = hoy + N días`.
2. El cliente ve *"Disponible: 1/2 sushi gratis — vence en 3 días"* en su tarjeta, cada vez que la abre.
3. Si no vuelve, a los `N - días_antes` recibe **un** recordatorio (cron n8n, sujeto al cap mensual).
4. Cuando vuelve y el mesero lo escanea, el premio **le salta en la pantalla** → un toque, entregado.
5. Si no vuelve nunca, el grant queda `expired` y cuenta en "Vencidos sin reclamar".

## API / Endpoints

| Método | Ruta | Auth | Qué hace |
|--------|------|------|----------|
| `GET` | `/api/staff/pending-rewards` | Staff (JWT o device) | Grants activos de clientes con check-in en las últimas 6h |
| `POST` | `/api/reward-redeem` | Staff | Registra la entrega. Ahora acepta `grant_id`. |
| `GET` | `/api/check-in/status` | Pública | Ahora devuelve `active_grants[]` |
| `POST` | `/api/mystery-box/resolve` | Pública | Ahora otorga el grant además del resultado |
| `GET/POST/PATCH/DELETE` | `/api/dashboard/campaign-rewards` | Admin | CRUD del catálogo |
| `GET` | `/api/dashboard/redemptions/summary` | Admin | Ahora incluye métricas de grants |
| `GET/POST` | `/api/cron/reward-reminder` | `CRON_SECRET` | Barrido de vencidos + recordatorio. **Disparado por n8n.** |

Detalle completo en [`API_DOCS.md`](../API_DOCS.md).

## UI / Pantallas

| Pantalla | Ruta | Quién |
|----------|------|-------|
| **Premios pendientes** | `/mesero/rewards` | Mesero |
| Alerta de premio al escanear | `/mesero/confirm` | Mesero |
| Banner "Disponible" con cuenta regresiva | `/check-in` (tarjeta del cliente) | Cliente |
| **Catálogo de premios de campaña** | `/dashboard/campaign-rewards` | Admin |
| Métricas de otorgados/redimidos/vencidos | `/dashboard/redemptions` | Admin |
| Config: premio de reactivación, ventana, recordatorio | `/dashboard/settings` | Admin |

## Configuración (`admin_settings`)

| Key | Default | Qué es |
|-----|---------|--------|
| `aggressive_reward_id` | — | Premio del catálogo para la reactivación agresiva |
| `aggressive_reward_window_days` | `7` | Días de ventana desde el envío |
| `reward_reminder_enabled` | `false` | Encender/apagar el recordatorio |
| `reward_reminder_days_before` | `2` | Cuántos días antes de vencer |
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
- **El recordatorio es exento del cap de frecuencia de 7 días, pero sujeto al cap mensual de 3.** Sin la
  excepción del cap de 7 días nunca se enviaría con ventanas cortas; sin el cap mensual sería spam.
- **La lista del mesero solo muestra clientes presentes** (check-in en las últimas 6h). Los premios de
  campaña de clientes que aún no han venido existen, pero solo saltan a la pantalla del mesero cuando el
  cliente llega.
- **Un cliente no puede tener dos premios de reactivación activos a la vez** (índice único parcial). Sí
  puede tener varios premios de tier pendientes.
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
- [x] Catálogo `/dashboard/campaign-rewards`
- [x] Config en Ajustes + métricas en `/dashboard/redemptions`
- [x] `DB_SCHEMA.md`, `API_DOCS.md`, `CHANGELOG.md` actualizados

## Pendiente de despliegue

- [ ] **Aplicar la migración 00031 en Supabase.** Hasta entonces, `/mesero/rewards` y el catálogo
      devuelven error (la UI degrada con un toast, no revienta).
- [ ] **Crear las plantillas de Twilio** y aprobarlas: la agresiva necesita `{{4}}` premio y
      `{{5}}` fecha límite; el recordatorio es una plantilla nueva.
- [ ] **Importar `n8n/cron_reward-reminder.json`** en n8n y activarlo.
- [ ] **Crear los premios del catálogo** en `/dashboard/campaign-rewards` y elegir uno en
      Ajustes > Premio de Reactivación Agresiva.

## Deja listo para después

El catálogo y el motor de grants **son la infraestructura de los referidos, las promos y la recompensa por
reseña**. Ninguno tendrá que tocar la entrega, la atribución al mesero, el vencimiento ni las métricas:
solo otorgar un grant con otro `source`.
