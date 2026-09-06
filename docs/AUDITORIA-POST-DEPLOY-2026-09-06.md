# Auditoría post-deploy — 2026-09-06

> Encargo: 28 commits salieron de golpe a producción hoy (multi-sede F1-F7, §25 Fase 2, §19), y
> anoche se apagó n8n. Auditoría de **solo lectura**: nada de lo de abajo se confirmó ejecutando
> un cron, llamando a `/api/campaigns/*` ni escribiendo en la base. Se leyó código, migraciones,
> docs, y logs de Vercel de solo lectura (proyecto `sushi-service-fidelity-system`, team en plan
> **Pro** confirmado).
>
> **Hallazgo transversal, antes de entrar al detalle:** `ESTADO.md` y varios docs de feature
> (`docs/features/calendar.md`, `docs/features/staff-qr-scan.md`, `docs/ESTADO-REQUERIMIENTOS.md`,
> `docs/04-deployment.md`) describen un estado **anterior al deploy de hoy** — dicen "sin pushear",
> "esperando decisión del dueño", "Vercel Pro pendiente" cuando todo eso ya pasó. Esto no es solo
> higiene: es la razón por la que dos de los ROJO de abajo no se pueden cerrar sin que el dueño
> mire la base directamente — la documentación dejó de ser una fuente confiable del estado real.

## Resumen de veredictos

| Área | Punto | Veredicto |
|---|---|---|
| Crons diarios | Horario real de negocio corrido 5h en Bogotá, hoy | 🔴 ROJO — **urgente, ventana de horas** |
| §19 meseros | Estado de la migración `00046` en producción | 🔴 ROJO |
| §25 domicilios | `logDeliveryIntakeFailure()` sin persistencia ni alerta | 🔴 ROJO |
| Calendario | Cutover n8n → Vercel Cron (la ventana perdida) | 🟢 VERDE (mecanismo robusto, sin pérdida detectada) |
| Calendario | Presupuesto de envío y opt-out | 🟢 VERDE |
| Calendario | Hora de Bogotá en el picker del dashboard | 🟡 AMARILLO |
| Calendario | `calendar_event` no gotea en `send_queue` | 🟡 AMARILLO |
| Calendario | Claim de `executeAutoEvent()` sin chequear filas afectadas | 🟡 AMARILLO |
| Crons | Cutover de n8n ocurrió antes de confirmar Pasos 5-6 del runbook | 🟡 AMARILLO |
| §19 meseros | Meseros con `location_id` NULL, invisibles en el picker operativo | 🟡 AMARILLO |
| Docs | `ESTADO.md` y 4 docs más desactualizados sobre el deploy | 🟡 AMARILLO |
| §19 meseros | Alta sin teléfono, lista filtrada por sede | 🟢 VERDE |
| §25 domicilios | Camino del domicilio, fallo de `OPENAI_API_KEY`, JSON inválido de IA | 🟢 VERDE |
| Crons | `calendar-dispatch` y `queue-drain` corriendo ahora mismo | 🟢 VERDE |

---

## 🔴 ROJO 1 — Los 3 crons diarios van a disparar 5 horas antes de lo real, y el primero es HOY

**Evidencia (logs reales de Vercel y n8n, no supuesto):**
- n8n disparaba `birthday` a las `2026-09-04T18:00:00Z` y `2026-09-05T18:00:00Z` (POST, 200) — es decir **18:00 UTC = 13:00 Bogotá**.
- `vercel.json:3` declara `birthday` en `0 13 * * *` **UTC** = **08:00 Bogotá**.
- Mismo patrón confirmado para `reactivation`: n8n disparaba a `20:00 UTC` (`15:00 Bogotá`); `vercel.json:4` lo declara en `0 15 * * *` UTC (`10:00 Bogotá`).
- `reward-reminder` (`vercel.json:5`, `0 16 * * *` UTC = `11:00 Bogotá`) no se pudo confirmar por retención de logs, pero corre en la misma instancia n8n con el mismo patrón — es razonable esperar el mismo desfase de +5h (real probable ≈ `21:00 UTC` = `16:00 Bogotá`).
- `docs/04-deployment.md:97-124` asumió que copiar la expresión cron 1:1 "conserva la hora", pero la instancia de n8n corría con `GENERIC_TIMEZONE=America/Bogota`, no UTC — esa premisa era falsa.

**Por qué es urgente:** el `vercel.json` con estos horarios recién llegó a producción hoy (primer deploy con los 5 crons: `2026-09-06T05:54:30Z`). El cron `birthday` va a disparar por primera vez bajo esta configuración a las **13:00 UTC de HOY** — clientes reales van a recibir el mensaje de cumpleaños **5 horas más temprano** (8:00 AM en vez de 1:00 PM Bogotá) sin que nadie haya decidido ese cambio de horario de cara al cliente.

**Arreglo propuesto (sin implementar):** decidir con el dueño si se acepta el nuevo horario o se corrige `vercel.json` para conservar la hora real de negocio:
```json
{ "path": "/api/cron/birthday", "schedule": "0 18 * * *" },
{ "path": "/api/cron/reactivation", "schedule": "0 20 * * *" },
{ "path": "/api/cron/reward-reminder", "schedule": "0 21 * * *" }
```
Si se corrige, hay que pushear y desplegar **antes de las 13:00 UTC de hoy** para que el primer disparo ya salga a la hora correcta.

**Paso para el dueño (no ejecutado por esta auditoría):** revisar en Vercel → Logs, después de las 13:00/15:00/16:00 UTC de hoy, si `birthday`/`reactivation`/`reward-reminder` devolvieron 200 y a qué hora.

---

## 🔴 ROJO 2 — No se puede confirmar si la migración `00046` (§19) está aplicada en producción

**El commit de merge `5badf79` (autor humano, hoy) dice:** *"La 00046 ya esta aplicada en produccion."*

**Pero 4 documentos, tocados en el mismo commit, dicen lo contrario:**
- `ESTADO.md:37` — "la migración `00046` está escrita y SIN APLICAR"
- `CHANGELOG.md` (entrada `[2026-09-05]`) — "Migración `00046`: escrita y SIN APLICAR."
- `docs/features/staff-qr-scan.md:4,80,929` — "SIN APLICAR... lo decide el dueño"
- `docs/ESTADO-REQUERIMIENTOS.md:31` — "escrita y SIN aplicar"

Esto viola la propia regla del proyecto ("un doc que dejó de ser verdad se corrige en el mismo commit"): o el mensaje de merge miente, o faltó corregir 4 documentos. No hay acceso a Supabase en esta auditoría para resolverlo directamente, y los logs de Vercel no aportan señal (cero tráfico real a `/api/staff/waiters`, `/api/staff/device/register` desde el deploy — el smoke test del Paso 5 del runbook todavía no se corrió).

**Impacto concreto si NO está aplicada:** el check-in normal de meseros con teléfono **no se rompe** (esas rutas usan columnas de la `00044`, no de la `00046`). Lo que sí se rompe, en silencio: el **alta de un mesero sin teléfono** (`src/app/api/dashboard/staff/route.ts:152-166`) — el `INSERT` con `phone: null` fallaría con `23502` (NOT NULL violation), código no manejado en el `catch` (líneas 173-192), y caería a un 500 genérico "Ocurrió un error creando el mesero". Es decir: se rompería justo la función estrella de §19, no el check-in existente.

**Arreglo propuesto (sin ejecutar) — correr en el SQL Editor de Supabase, solo lectura:**
```sql
select is_nullable from information_schema.columns
 where table_name = 'staff_users' and column_name = 'phone';

select conname from pg_constraint
 where conname = 'staff_users_identidad_minima';

select indexname from pg_indexes
 where indexname = 'staff_users_nombre_sede_key';
```
Si falta cualquiera de las tres, aplicar `supabase/migrations/00046_escaner_meseros.sql` (es idempotente, con guardas `IF NOT EXISTS`). Después, corregir `ESTADO.md`, `CHANGELOG.md`, `docs/features/staff-qr-scan.md` y `docs/ESTADO-REQUERIMIENTOS.md` en el mismo commit que confirme el estado real.

**Nota relacionada:** dado que `ESTADO.md` quedó desactualizado sobre el deploy en general, vale la pena que el dueño también re-confirme `00044` y `00045` con el mismo tipo de query — no asumir que "como el runbook las pedía antes del código" ya están aplicadas.

---

## 🔴 ROJO 3 — Un domicilio perdido hoy no deja ningún rastro persistente ni dispara ninguna alerta

Con n8n apagado, `logDeliveryIntakeFailure()` (`src/services/delivery.service.ts:540-550`) es el ÚNICO lugar donde se registra un fallo de intake de domicilio. Su implementación completa:

```ts
export function logDeliveryIntakeFailure(args: {...}): void {
  console.error(
    `[Delivery][FALLO] reason=${args.reason} tenant=${args.tenant.slug} operador=${args.operatorPhone ?? 'desconocido'} detalle="${args.detail}" mensaje="${args.rawMessage.slice(0, 300)}"`
  )
}
```

**Escribe únicamente a `console.error` — no hay ningún INSERT a base de datos**, y la tabla de §24-B (pensada para esto) **no existe**: grep de `delivery_intake_failures|delivery_failed|domicilios_fallidos` contra las 46 migraciones no encuentra ninguna coincidencia; solo aparece mencionada como pendiente en `docs/features/delivery-webhook.md:222-224` y `docs/features/delivery-ai-parsing.md:146-150`.

**No hay ninguna alerta activa** sobre ese log: `docs/04-deployment.md:462-463` sugiere que el prefijo `[Delivery][FALLO]` "sirve para montar una alerta de log en Vercel sin tocar código" — pero es una idea, no algo configurado. Grep del repo por integraciones de log drain / Slack / monitoring no encuentra nada real. Y como el `try/catch` que la rodea igual responde 200, es probable que ni siquiera aparezca en el agrupador de "Runtime Errors" de Vercel (se confirmó que los 4 grupos de error de los últimos 7 días son de otras rutas, ninguno de `[Delivery][FALLO]`).

**Por qué esto es distinto a antes:** antes, si algo fallaba en el camino de n8n, existía el propio historial de ejecuciones de n8n como rastro adicional. Hoy §25 Fase 2 es el único camino (confirmado: cero tráfico a `/api/webhook/delivery` en los últimos 2 días; los domicilios entran directo por Twilio/Zernio → `processDeliveryMessage()`), y ese rastro alternativo ya no existe. La visibilidad es 100% *pull*: el dueño tiene que ir a buscar el log a mano, sin que nada se lo avise.

**Paso para el dueño, hoy (no ejecutado por esta auditoría):**
1. Vercel → proyecto `sushi-service-fidelity-system` → **Observability/Logs**.
2. Confirmar ahí la política de retención de Runtime Logs vigente en el plan Pro.
3. Filtrar por `[Delivery][FALLO]` para ver si ya se acumularon fallos desde que se apagó n8n.
4. Repetir esta revisión manualmente varias veces al día mientras no exista una tabla o alerta real.

**Arreglo propuesto (sin implementar):**
- Migración §24-B: tabla `delivery_intake_failures` (`tenant_id` FK `ON DELETE RESTRICT`, `operator_phone`, `reason`, `detail`, `raw_message`, `created_at`, índice `(tenant_id, created_at)`).
- `logDeliveryIntakeFailure()` (`delivery.service.ts:540`) hace el INSERT ahí, además de mantener el `console.error` (con manejo fail-open si la tabla no existe todavía, mismo patrón que `isDuplicateZernioEvent()` atrapando `42P01`).
- Configurar una alerta real de Vercel (Log Drain o regla de Observability) sobre `[Delivery][FALLO]` con salida a Slack/email.

---

## 🟡 AMARILLO

### Hora de Bogotá en el picker del calendario
El servidor compara correctamente instantes absolutos (`restaurant_events.scheduled_send_at` es `timestamptz`, `findDueAutoEvents()` usa `scheduled_send_at <= now()` con ISO — `src/services/calendar.service.ts:301-314`). El punto flojo es la entrada/salida en el dashboard:
- `EventCreateDialog.tsx:283-289,143-145` usa `<input type="datetime-local">` sin huso y lo convierte con `new Date(scheduledSendAt).toISOString()` — se interpreta en la zona horaria del navegador del admin, no en `-05:00` fijo.
- `EventDetailDrawer.tsx:73-83` muestra la hora con `toLocaleString('es-CO', {...})` sin `timeZone: 'America/Bogota'`.
**Arreglo propuesto:** fijar `-05:00` explícito al construir el instante en `EventCreateDialog.tsx:144`, y pasar `timeZone: 'America/Bogota'` en los `toLocaleString`/`toLocaleDateString` que muestran la hora al admin. Bogotá no tiene horario de verano, así que el offset fijo es seguro indefinidamente.

### `calendar_event` no gotea en `send_queue`
`executeAutoEvent()` (`calendar.service.ts:452-627`) pasa por el mismo choke-point que cualquier campaña (`sendTemplateMessage()`, opt-out y presupuesto incondicionales — esto es lo que da el 🟢 al punto de gobierno de envíos). Pero `docs/features/send-governance.md:301` confirma que `calendar_event` **no** encola en `send_queue` (Bloque 2): si un evento tiene más destinatarios que presupuesto de campaña restante ese día, los que exceden el cupo **fallan** (`recordCampaignMessage(status:'failed')`) en vez de diferirse al día siguiente, a diferencia de una campaña manual. Un festival con audiencia grande puede dejar gente sin invitación si el presupuesto diario ya estaba consumido.

### Claim de `executeAutoEvent()` no verifica filas afectadas
```ts
const { error: claimError } = await supabase
  .from('restaurant_events')
  .update({ status: 'sent' })
  .eq('id', eventId)
  .eq('status', 'scheduled') // guard against race condition
if (claimError) throw new Error(...)
```
(`calendar.service.ts:464-470`) — solo revisa `error`, no `data.length`. Si dos disparadores llaman a `executeAutoEvent()` para el mismo evento casi al mismo instante, ambos pueden creer que ganaron la carrera y enviar dos veces. `docs/features/send-governance.md:243-249` ya documenta que `calendar-dispatch` es de los 4 crons que NO toleran doble disparo (a diferencia de `queue-drain`, que sí, vía `FOR UPDATE SKIP LOCKED`). Hoy el riesgo es bajo (n8n ya está apagado, un solo disparador vivo), pero es una fragilidad real del código. **Arreglo propuesto:** agregar `.select()` al update y verificar `data?.length === 1` antes de continuar, o mover el claim a una función SQL con `FOR UPDATE SKIP LOCKED` como ya hace `claim_send_queue()`.

### El cutover de n8n ocurrió antes de confirmar los Pasos 5-6 del runbook
Evidencia de logs: último POST de n8n a `calendar-dispatch` fue `2026-09-06T05:45:00Z`; el deploy con los 5 crons de Vercel recién llegó a producción a las `05:54:30Z`. n8n se apagó **antes** de que el código nuevo siquiera existiera en producción, no después de confirmar el smoke test como pide `docs/RUNBOOK-DEPLOY.md` Paso 7. Los 5 crons devolvieron 401 en su primer intento (`05:55:56-58Z`, `CRON_SECRET` mal puesta) y se autocorrigieron solos ~5 minutos después sin nuevo deploy — probablemente alguien corrigió la env var a mano. Esta vez no hubo pérdida detectable (hueco de ~15 min, sin datos huérfanos por diseño), pero el patrón —apagar la red de respaldo antes de confirmar que la nueva vía funciona— es el que el propio runbook advierte evitar.

### Meseros con `location_id` NULL, invisibles en el picker operativo
`GET /api/staff/waiters` (`src/app/api/staff/waiters/route.ts:88`) filtra por un `location_id` concreto — un mesero con `location_id = NULL` nunca hace match. La respuesta es `{ ok: true, waiters: [] }` (no un error), y `WaiterPicker.tsx:68-73` muestra **"Todavía no hay meseros dados de alta en esta sede. Se crean desde el panel, solo con el nombre"** — mensaje engañoso, porque sí hay meseros, solo que sin sede. En el panel de administración (`GET /api/dashboard/staff`, sin filtrar por sede) el dueño SÍ los ve, marcados "Sin sede", y puede asignarles sede editándolos uno por uno. **Hoy, con el 100% de los meseros en `location_id = NULL` (según `ESTADO.md`), el check-in con mesero no va a poder atribuir ninguna visita en ninguna sede hasta que se haga esa asignación manual.**

### Documentación desactualizada respecto al deploy real
`ESTADO.md`, `docs/features/calendar.md`, `docs/features/staff-qr-scan.md`, `docs/ESTADO-REQUERIMIENTOS.md` y `docs/04-deployment.md` describen un estado pre-deploy (código sin pushear, Vercel Pro pendiente, §19 esperando decisión) que ya fue superado por los hechos. Esto no es solo cosmético: es la causa directa de que el ROJO 2 (migración `00046`) no se pueda cerrar sin acceso a la base — la documentación dejó de ser la fuente de verdad que el propio método del proyecto exige que sea.

---

## 🟢 VERDE (breve, para no diluir lo de arriba)

- **§25 Fase 2 — flujo completo:** un domicilio entra hoy directo por Twilio o Zernio (`processDeliveryMessage()`), sin pasar por `/api/webhook/delivery` (confirmado sin tráfico real en 2 días). Fallo de `OPENAI_API_KEY` lanza `OpenAIConfigError` manejado explícitamente, nunca un 500 mudo (`src/lib/openai/client.ts:40-44`, `delivery-ai.service.ts:216-227`). JSON inválido de la IA siempre lanza con motivo real vía `parseDeliveryAiJson()` (`delivery-ai.service.ts:132-174`); el celular se valida dos veces antes de tocar la base — no hay camino a una orden corrupta.
- **§19 — alta sin teléfono y lista filtrada por sede:** la regla "sin celular, sede obligatoria" está en el código (`src/app/api/dashboard/staff/route.ts:120-132`), y `GET /api/staff/waiters` falla cerrado (409) si no hay sede resuelta, nunca devuelve meseros de otra sede (`staff/waiters/route.ts:70-90`).
- **Calendario — presupuesto y opt-out:** `calendar-dispatch` no tiene atajo propio, pasa por el mismo `sendTemplateMessage()` que cualquier campaña, con opt-out y reserva de cupo incondicionales en ambos proveedores (Twilio/Zernio). El mecanismo de recuperación de eventos vencidos (`scheduled_send_at <= now()`, sin cota inferior) nunca huerfaniza un evento — llega tarde, no se pierde.
- **Crons — `calendar-dispatch` y `queue-drain`:** confirmados corriendo ahora mismo por logs reales de Vercel (200 cada 15 min desde las 06:00 UTC de hoy).

---

## Qué hacer ahora, en orden

1. **HOY, antes de las 13:00 UTC (08:00 Bogotá):** decidir el horario real de `birthday`/`reactivation`/`reward-reminder` en `vercel.json` (ROJO 1) y, si se corrige, pushear/desplegar antes de esa hora.
2. **Confirmar en Supabase (solo lectura)** si `00046` está aplicada (ROJO 2, queries arriba) — y de paso reconfirmar `00044`/`00045` ya que la documentación no es confiable sobre el estado del deploy.
3. **Asignar `location_id`** a cada mesero existente desde `dashboard/staff` (uno por uno, no hay bulk hoy) y activar al menos un dispositivo por sede desde `/mesero`.
4. **Correr el smoke test del Paso 5** del runbook para el flujo de mesero — los logs muestran que todavía no se hizo desde este deploy.
5. **Revisar los logs de Vercel** filtrando `[Delivery][FALLO]` para ver si ya hay domicilios perdidos acumulados desde el apagón de n8n (ROJO 3), y repetir esa revisión a mano varias veces al día hasta que exista la tabla de §24-B.
6. En bloques chicos, sin apuro: tabla `delivery_intake_failures` + alerta real de log (ROJO 3), fix del claim de `executeAutoEvent()` (AMARILLO), fix de zona horaria del picker del calendario (AMARILLO).
7. Cerrar la sesión actualizando `ESTADO.md`, `CHANGELOG.md`, y los docs de feature tocados, para que dejen de describir un estado que ya pasó.
