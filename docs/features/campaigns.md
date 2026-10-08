# Feature: Campañas — Control de Tráfico Centralizado

**Última actualización:** 2026-10-08 (ciclo, fase 0: un fallo no calla, el insistente sale una vez, una sola escala de días)

> ⚠️ **Rediseño en diseño (2026-10-04, sin código todavía):** el recorrido de reactivación, las burbujas de riesgo y el
> calendario se reemplazan por **el ciclo de recuperación** (pipeline de 90 días con cinco toques, fatiga a las 6
> comunicaciones, dormido con un toque trimestral, «regalos que vencen», y campañas + calendario en una sola pantalla). El diseño,
> el diagnóstico y las fases están en `docs/superpowers/specs/2026-10-04-ciclo-de-recuperacion-design.md`. **La fase 0 ya
> está (2026-10-08, sin migración):** un envío fallido ya no calla al cliente, el «insistente» sale UNA vez mientras el
> cliente no vuelva (antes se repetía cada ~30 días sin tope) y la pantalla usa una sola escala de días. La medición está en
> `SQL-PARA-CORRER/ciclo-fase-0/`. **Lo que sigue abajo describe lo que el código hace HOY** y sigue siendo cierto hasta
> que se construya la fase 1.

---

## Novedades v2.9.0 (2026-09-08)

- **Pestaña "Premios"** en `/dashboard/campaigns`: el catálogo de premios de campaña (crear,
  listar, retirar/reactivar) que antes vivía en la página propia `/dashboard/campaign-rewards`
  ahora es una pestaña más, junto a Automáticas / Manuales / Historial. El componente se extrajo a
  `src/components/dashboard/CampaignRewardsCatalog.tsx` (mismo comportamiento, misma API
  `/api/dashboard/campaign-rewards`). `/dashboard/campaign-rewards` sigue existiendo pero ahora solo
  redirige a `/dashboard/campaigns?tab=premios` (`redirect()` de `next/navigation`), así que
  cualquier enlace viejo guardado sigue funcionando. La pestaña se preselecciona leyendo
  `window.location.search` en un `useEffect` — no `useSearchParams()`, que fuerza el CSR bailout en
  esta versión de Next.

## Novedades v2.8.0 (2026-08-10)

- **Filtro por días sin venir** en campañas manuales: `filters.minDays` (última visita hace N días o
  más) y `filters.maxDays` (hace M días o menos, día M completo incluido). Aplican en
  `estimate/route.ts` y `manual/route.ts` con el mismo criterio; ambos excluyen clientes sin
  `last_visit_at`. UI: dos inputs nuevos en `ManualCampaigns.tsx` + preset "Rescatar Perdidos" (26+
  días, justo después de la Recovery Zone).
- **Burbujas de riesgo con envío real** (`AtRiskBubbles.tsx`): antes el botón apuntaba a
  `/api/dashboard/campaigns/quick` (endpoint inexistente → 404 silencioso). Ahora el diálogo pide una
  plantilla aprobada, muestra los elegibles reales del día (estimador con el rango de días del nivel;
  hasta el 2026-10-08 Alerta 7-10, En riesgo 11-15, Crítico 16-21, Perdido 22+; desde entonces las
  bandas del ciclo, ver § «Una sola escala de días») y envía por
  `/api/dashboard/campaigns/manual`, respetando frequency cap, recovery zone, cap mensual y saldo.
- **`POST /api/dashboard/campaigns/run-auto`**: puente autenticado para "Ejecutar Ahora" (los crons
  exigen `CRON_SECRET`, que el navegador no conoce; antes el botón recibía 401 y la UI fingía éxito).
  El diálogo del dashboard ahora muestra enviados/fallidos/audiencia o el error real.
- **Paridad estimador ↔ envío**: el estimador ahora aplica también el filtro de canal
  (`source_channels`) y el envío manual excluye opt-outs en la query (antes se contaban como fallidos).
- **Ciclo de recuperación del cliente**: strip visual de 5 etapas en Campañas → Automáticas
  (Visita → Protegido 1-6d → Ventana manual 7-17d → Recuperación automática 18-25d → Rescate 26+d).
  Desde el 2026-09-06 las bandas se derivan de los días configurados por el tenant: los números de
  arriba son los que salen con los defaults (21 / 25). Hasta el 2026-10-08 decía «Protegido 1-7d» y
  el día 7 caía en dos cajas.

---

## Nota de infraestructura (v1.4.1 — 2026-07-05) — ⚠️ superada el 2026-09-02, ver abajo

`/api/cron/birthday` y `/api/cron/reactivation` (lógica de negocio sin cambios, ver más abajo)
eran invocados EN PARALELO por dos disparadores: el cron nativo de Vercel (`vercel.json`) y un
workflow n8n del mismo nombre. El código ya los des-duplicaba vía `hasRecentCampaignMessage()`
(el cliente final nunca recibió mensajes repetidos), pero se decidió dejar **n8n como único
disparador** para simplificar operación y eliminar el riesgo latente de carrera. `vercel.json`
quedó con `"crons": []`. Detalle completo → `docs/04-deployment.md` §2 y §5.

## Nota de infraestructura (2026-09-02) — la vuelta atrás

La decisión de julio se revierte: los **5 crons vuelven a `vercel.json`** (`birthday` a las
`0 13 * * *`, `reactivation` a las `0 15 * * *`, más `reward-reminder`, `calendar-dispatch` y
`queue-drain`). Las cadencias son un calco 1:1 de las que ya tenían los Schedule Trigger de n8n:
**cero cambio de horario y cero cambio de código de negocio** — los endpoints ya exportaban `GET`
y Vercel Cron manda exactamente el `Authorization: Bearer $CRON_SECRET` que valida
`validateCronSecret()`.

**Por qué se revierte** (§25.1 de requerimientos): n8n es un punto único de fallo sin alarma —
si el VPS se cae se detienen cumpleaños, reactivación, recordatorios, calendario y la cola de
goteo, y nadie se entera; el de cumpleaños ni siquiera es recuperable. Y el plan **Hobby de
Vercel prohíbe el uso comercial**, que es exactamente lo que este producto hace.

**Estado real:** el commit es local y sin push. Hoy el disparador vivo **sigue siendo n8n**; el
disparo por Vercel empieza al desplegar a producción con plan Pro activo.

> **La lección de julio no se tira, se convierte en regla:** por cada entrada que se agrega a
> `vercel.json` se apaga su Schedule Trigger en n8n **en el mismo movimiento**, y se comprueba en
> la UI de n8n. Los dos encendidos a la vez = doble disparo. Y ojo: `hasRecentCampaignMessage()`
> protege a `birthday` y `reactivation`, pero `calendar-dispatch` no tiene equivalente.

---

## Objetivo

Coordinar el envío de mensajes entre campañas automáticas (cumpleaños, reactivación) y manuales (masivas) para evitar que un cliente reciba múltiples mensajes en periodos cortos, preservando la experiencia y la efectividad del flujo de fidelización.

---

## Arquitectura: Tres Reglas de Validación

### Regla 1 — Master Cap Global (7 días)

**Campo:** `customers.last_campaign_at` (timestamptz)

**Principio:** Ningún cliente puede recibir un mensaje (manual ni automático) si fue contactado hace menos de `FREQUENCY_CAP_DAYS` días.

**Implementación:**
- `findInactiveCustomers()` filtra por `last_campaign_at IS NULL OR last_campaign_at < now - 7d`
- `manual/route.ts` filtra en JS post-query con el mismo criterio
- `estimate/route.ts` aplica el mismo filtro en la query SQL (count exacto)
- **Todo envío exitoso** actualiza `customers.last_campaign_at` via `updateCustomerLastCampaignAt()`

---

### Regla 2 — Jerarquía de Mensajes / Zona de Recuperación

**Principio:** Los clientes dentro de la ventana de recuperación están en el radar del cron de reactivación. Las campañas manuales los excluyen automáticamente para no interrumpir ese flujo personalizado de mayor conversión.

**La ventana NO es fija (desde 2026-09-06).** Se DERIVA por tenant de los días de reactivación que el dueño configuró en Ajustes, vía `getRecoveryZoneConfig(tenantId)` → `deriveRecoveryZone(soft, aggressive)`:

```
startDays = max(FREQUENCY_CAP_DAYS, soft - RECOVERY_ZONE_LEAD_DAYS)   // lead = 3
endDays   = max(aggressive, startDays)
```

Con los defaults (21 / 25) da exactamente **18-25**, los mismos valores fijos de antes: ningún tenant que no haya tocado sus días cambia de comportamiento. Pero si baja el toque suave a 15, la zona baja a **12-20** con él. Antes no se movía, y los días 15-17 quedaban sin proteger: una campaña manual podía pisarle el mensaje al cron el mismo día del toque.

**Zona de Recuperación:** `last_visit_at < now - startDays AND last_visit_at >= now - endDays`

**Implementación** (los cuatro sitios leen la MISMA ventana del tenant; si divergen, el panel miente sobre lo que se envía):
- `manual/route.ts` excluye clientes en la zona de recuperación y reporta `totalSkippedRecoveryZone`
- `estimate/route.ts` aplica el mismo filtro para que el estimado sea exacto
- `queue-drain/route.ts` la re-evalúa al momento del envío (el cliente pudo volver mientras esperaba en la cola)
- `segments/route.ts` la usa para los conteos del radar de segmentos
- Los crons automáticos NO aplican esta restricción (ellos son la razón de la zona)

---

### Regla 3 — Reset por Interacción (ya existente)

**Principio:** Si un cliente hace check-in o pide domicilio, `last_visit_at` se actualiza y lo excluye automáticamente del cron de reactivación.

**Implementación:** Ya funciona. `findInactiveCustomers()` filtra `last_visit_at < now - suave` (los días del suave de la marca; 21 por defecto), por lo que cualquier visita reciente los saca del pool automáticamente. Y como el tope del insistente se cuenta **desde la última visita**, quien vuelve empieza un recorrido nuevo con su suave y su insistente.

---

## Flujo de Toma de Decisiones (por tipo de campaña)

### Cron Reactivación (`/api/cron/reactivation`)

Corre todos los días a las **20:00 UTC = 15:00 Bogotá** (`vercel.json`). «Ejecutar ahora» llama a esta
misma ruta (`/api/dashboard/campaigns/run-auto`), así que obedece las mismas reglas.

```
getReactivationDaysConfig()            → { suave, insistente }   (21 / 25 por defecto)
findInactiveCustomers(suave)
  → last_visit_at < suave días atrás, accepts_marketing, sin opt-out
  → last_campaign_at IS NULL OR < 7 días atrás          [cap de frecuencia]
Se parten en dos por last_visit_at:
  menos de `insistente` días → PASS 1 (suave)
  más de `insistente` días   → PASS 2 (insistente)
filterByMonthlyCap()                                    [3 al mes, en cada pass]

PASS 1 — suave, por cliente:
  → hasRecentCampaignMessage(type=reactivation, 30d)    [dedup: solo lo que SALIÓ]
  → sendTemplateMessage() → recordCampaignMessage()

PASS 2 — insistente, por cliente (solo si hay plantilla insistente):
  → yaRecibioElInsistente(last_visit_at, insistente)    [UNA vez mientras no vuelva]
  → sendTemplateMessage() → recordCampaignMessage() → grantReward() si hay premio

Al final: updateCustomerLastCampaignAt(enviados) · finalizeCampaign()
```

**El insistente sale una sola vez mientras el cliente no vuelva** (N4, 2026-10-08). Antes el PASS 2 usaba
la misma dedup de 30 días que el suave: contaba el suave (el insistente salía al día ~51 en vez del 25) y
después lo dejaba repetirse cada ~30 días **para siempre**, con su premio y su recordatorio. Como suave e
insistente comparten `campaigns.type` y `message_type` (`'reactivation'`), `yaRecibioElInsistente()` los
distingue por **cuándo** salieron: un mensaje de reactivación que salió después de
`last_visit_at + insistente` días solo puede ser el insistente, porque el suave solo sale antes. Filtra
`campaigns.source = 'reactivation'` para no contar el recordatorio de premio (que es `type =
'reactivation'` con `source = 'reward_reminder'`). Si la marca sube sus días de insistente después de un
envío, un insistente viejo puede quedar por debajo del umbral nuevo y salir **uno** más: es el borde
aceptado hasta la fase 1, que guarda cada toque con su etapa.

**El día real del insistente.** El cap de 7 días separa los dos toques: quien recibió el suave al día 21
recibe el insistente al día 28 o 29, no al 25. Por eso la pantalla dice «insistente al día 25, una sola
vez (y nunca a menos de 7 días del suave)».

**Un fallo no calla** (N3, 2026-10-08). Las dos dedups cuentan solo `status IN ('sent','delivered')`
(`ESTADOS_QUE_SALIERON`). Los crons graban el envío fallido con `sent_at`, y antes eso bastaba para
callar al cliente 30 días (reactivación) o 360 (cumpleaños). Un fallo de base en cualquiera de las dos
**lanza** (log `[Campaign][FALLO]`): la marca sale con `ok: false` en la respuesta del cron, en vez de
volver a escribirle a quien ya recibió el mensaje.

### Cron Cumpleaños (`/api/cron/birthday`)

Corre todos los días a las **18:00 UTC = 13:00 Bogotá** (`vercel.json`).

**El saludo sale hasta DOS DÍAS ANTES del cumpleaños** (dueño, 2026-09-24) — **pero solo con la
plantilla que lo dice bien** (2026-10-04). El texto aprobado de siempre dice «¡Feliz cumpleaños!», y
mandarlo dos días antes es decirlo mal. Por eso son dos plantillas y el cron elige por marca
(`elegirPlantillaDeCumpleanos()`, `src/services/campaign.service.ts`):

| La marca tiene… | Plantilla | A quién saluda |
|---|---|---|
| `birthday_upcoming_template_sid` **aprobada** | «Cumpleaños — dos días antes» | quien cumple entre hoy y dentro de `BIRTHDAY_LEAD_DAYS` (= 2) días |
| solo `birthday_template_sid` (o la nueva en revisión) | «¡Feliz cumpleaños!» | quien cumple hoy, como siempre |
| ninguna | — | nadie (`ok: false` con el motivo) |

En Zernio el puntero solo existe aprobado. En Twilio se escribe al crear la plantilla, así que el cron
le pregunta a Twilio (`isTwilioTemplateApproved()`); ante la duda, usa la vieja. **El cambio es solo**:
el día que Meta aprueba la nueva, esa marca pasa a saludar dos días antes.

**Una ventana, no un día exacto.** Con «hoy + 2» exacto, el día del cambio se quedaba sin saludo quien
cumplía mañana o pasado. Con la ventana `[hoy, hoy+2]` ese día entran los tres y cada uno recibe un
saludo; después, cada cliente entra a la ventana dos días antes y la dedup impide repetirlo. Si el cron
falla un día, al siguiente igual saluda.

```
elegirPlantillaDeCumpleanos()        → { sid, diasDeAnticipacion: 2 | 0 }
findBirthdayCustomers(diasDeAnticipacion)
  → cumpleaños (mes-día) entre hoy y hoy + diasDeAnticipacion
  → accepts_marketing = true, sin opt-out, paginado de a 1.000
  (NO aplica frequency cap — cumpleaños tiene prioridad absoluta)

Por cada cliente:
  → hasRecentCampaignMessage(type=birthday, BIRTHDAY_DEDUPE_DAYS = 360d)   [dedup anual, solo lo que SALIÓ]
  → sendTemplateMessage()
  → recordCampaignMessage()

Al final del loop:
  → updateCustomerLastCampaignAt(sentCustomerIds)
  → respuesta por marca con `plantilla: 'se_acerca' | 'el_dia'`
```

### Campaña Manual (`/api/dashboard/campaigns/manual`)
```
Fetch clientes con filtros (ciudad, visitas, edad, canal)
  → accepts_marketing = true

Post-filtro en JS:
  1. Frequency Cap: excluir si last_campaign_at < 7 días atrás
  2. Recovery Zone: excluir si last_visit_at cae en la ventana del tenant
     (derivada de sus días de reactivación; 18-25 con los defaults)

sendTemplateMessage() en batches de 10
  → bulk update last_campaign_at para enviados
  → bulk insert campaign_messages

Response incluye:
  - totalSent
  - totalFailed
  - totalSkippedFrequencyCap
  - totalSkippedRecoveryZone   ✅ NUEVO
```

---

## Constantes y Settings Configurables

Definidas en `src/constants/rewards.ts` (fallbacks):

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `REACTIVATION_DAYS` | 21 | Fallback: días para reactivación suave |
| `REACTIVATION_AGGRESSIVE_DAYS` | 25 | Fallback: días para reactivación agresiva |
| `FREQUENCY_CAP_DAYS` | 7 | Mínimo de días entre mensajes por cliente |
| `RECOVERY_ZONE_START_DAYS` | 18 | Fallback: inicio zona de recuperación (la real se deriva por tenant) |
| `RECOVERY_ZONE_END_DAYS` | 25 | Fallback: fin zona de recuperación (la real se deriva por tenant) |
| `RECOVERY_ZONE_LEAD_DAYS` | 3 | Días que la zona abre antes del toque suave |

> `rewards.ts` también aloja las constantes del pop-up de reseñas (`DEFAULT_REVIEW_REWARD_WINDOW_DAYS`,
> `REVIEW_SHOWN_DEDUPE_HOURS`): pertenecen a **[review-flow.md](review-flow.md)**, no a este doc.

### Días de Reactivación Configurables (v1.4.0 — Req 6A)

Los días de reactivación ya NO están fijos: se leen de `admin_settings` vía
`getReactivationDaysConfig()` en `src/services/settings.service.ts`:

| Setting key | Default (fallback) | Editable en |
|-------------|--------------------|-------------|
| `reactivation_soft_days` | 21 | Dashboard > Ajustes > Reactivación de Clientes |
| `reactivation_aggressive_days` | 25 | Dashboard > Ajustes > Reactivación de Clientes |

Reglas de validación:
- Ambos deben ser enteros positivos; si no, se usa el fallback.
- La agresiva debe ser > suave; si no, el backend la fuerza a `suave + 4` y la UI bloquea el guardado.
- `findInactiveCustomers(reactivationDays)` ahora acepta el valor como parámetro (default `REACTIVATION_DAYS`).
- La normalización (parseo, fallbacks, `agresiva > suave`) vive en `normalizeReactivationDays()` en
  `src/constants/rewards.ts`, no en el service: la tarjeta del ciclo de recuperación corre en el
  navegador y tiene que llegar al mismo número que el cron. Con dos copias de la regla, la pantalla
  anunciaría un día distinto del que se envía.

**Lo que arrastran estos dos valores (2026-09-06):** la Recovery Zone se deriva de ellos
(`deriveRecoveryZone()`, ver Regla 2) y las cinco bandas del "Ciclo de recuperación del cliente" en
Campañas → Automáticas se calculan con esa derivación. Cambiar los días en Ajustes ahora mueve
las tres cosas a la vez: el mensaje del cron, la ventana protegida y lo que muestra el panel.

### Una sola escala de días (2026-10-08)

Hasta hoy el dueño veía tres relojes en la misma pantalla: las burbujas (`RISK_LEVELS`, fijas: 7-10 /
11-15 / 16-21 / 22+), la tira «Ciclo de recuperación» (derivada de sus días) y el cron (21 y 25). Ahora
las bandas salen de **una** función, `deriveCycleBands()` (`src/constants/rankings.ts`), que usa las
mismas que el cron (`normalizeReactivationDays()` → `deriveRecoveryZone()`):

| Banda | Días (fórmula) | Con los defaults 21 / 25 | Con 15 / 20 |
|---|---|---|---|
| Reciente | 0 … `FREQUENCY_CAP_DAYS`−1 | 0-6 | 0-6 |
| Ventana | `FREQUENCY_CAP_DAYS` … inicio de la zona − 1 | 7-17 | 7-11 |
| Recuperación | la zona del cron | 18-25 | 12-20 |
| Perdido | fin de la zona + 1 … | 26+ | 21+ |

La leen la tira de Campañas, el panel (`getFullAnalytics()` arma `atRiskGroups` con los días de la
marca, que lee de `admin_settings` en la misma consulta que `avg_ticket`), el demo (`RISK_LEVELS` = las
bandas con los defaults) y la burbuja (su estimador y su envío filtran por el rango de la banda, que la
página le pasa con los días de la marca). Las burbujas son las bandas **sin «Reciente»**. Si el suave
es muy temprano (≤ 10) la Ventana queda vacía y no se muestra. Test:
`tests/unit/ciclo-fase-0-una-escala.test.ts`.

**Lo que todavía NO lee esta escala** (fuera del alcance de la fase 0): el preset «Rescatar Perdidos»
de `ManualCampaigns.tsx` (`minDays: '26'` fijo), el filtro Activo / Inactivo / Perdido de Clientes
(`getCustomers()`, 18 y 25 fijos) y el contador de inactivos de `getDashboardMetrics()` (21 fijo). Con
los defaults dicen lo mismo; con días propios, no.

### Rediseño UI del Módulo de Campañas (v1.4.0 — Req 5)

`src/app/(dashboard)/dashboard/campaigns/page.tsx`:
- **KPIs del mes**: campañas ejecutadas, mensajes enviados, última ejecución.
- **Badge de estado real** por campaña automática: `Activa` (verde, plantilla configurada) o `Sin plantilla` (rojo) según `admin_settings`.
- **Preview real del mensaje**: muestra el body de la plantilla Twilio configurada (fetch a `/api/dashboard/templates`), también en el dialog de confirmación antes de ejecutar.
- **Días dinámicos**: la descripción de Reactivación muestra los días configurados (no hardcoded).
  Desde el 2026-09-06 también las bandas del "Ciclo de recuperación del cliente": antes salían de
  `RECOVERY_ZONE_START_DAYS`/`END_DAYS` fijas y no se movían al cambiar las fechas en Ajustes.
- **Botón "Ejecutar Ahora" deshabilitado** si no hay plantilla configurada.
- **Historial traducido**: estados en español (Finalizada/En curso/Borrador/Fallida).
- Separación explícita Automáticas / Manuales / Historial vía tabs (ya existía, se mantiene).
- Link directo a Ajustes para configurar plantillas y días.

---

## Archivos Involucrados

| Archivo | Responsabilidad |
|---------|----------------|
| `src/constants/rewards.ts` | Constantes de timing |
| `src/services/campaign.service.ts` | `findInactiveCustomers()`, `updateCustomerLastCampaignAt()`, las dedups (`hasRecentCampaignMessage()`, `yaRecibioElInsistente()`) |
| `src/constants/rankings.ts` | `deriveCycleBands()` / `deriveRiskLevels()` — la escala única de días |
| `src/services/settings.service.ts` | `getReactivationDaysConfig()` — días configurables |
| `src/app/api/cron/reactivation/route.ts` | Cron reactivación (días configurables) |
| `src/app/(dashboard)/dashboard/settings/page.tsx` | UI de configuración de días |
| `src/app/(dashboard)/dashboard/campaigns/page.tsx` | UI rediseñada del módulo (incluye la pestaña Premios) |
| `src/components/dashboard/CampaignRewardsCatalog.tsx` | Catálogo de premios de campaña (pestaña Premios) |
| `src/app/(dashboard)/dashboard/campaign-rewards/page.tsx` | Ruta vieja: redirige a `campaigns?tab=premios` |
| `src/app/api/cron/birthday/route.ts` | Cron cumpleaños |
| `src/app/api/dashboard/campaigns/manual/route.ts` | Campañas manuales |
| `src/app/api/dashboard/campaigns/estimate/route.ts` | Estimado de audiencia |

---

## Tabla de Decisión de Envío

| Situación del cliente | Cron Reactivación | Cron Cumpleaños | Campaña Manual |
|-----------------------|:-----------------:|:---------------:|:--------------:|
| Antes de la zona (< 18 días con los defaults) | ❌ no inactivo | según cumpleaños | ✅ elegible |
| Dentro de la zona (18-25 con los defaults) | ✅ elegible* | según cumpleaños | ❌ excluido |
| Pasada la zona (> 25 días con los defaults) | ✅ elegible* | según cumpleaños | ✅ elegible |
| Recibió mensaje hace < 7 días | ❌ excluido | ❌ excluido** | ❌ excluido |
| Ya recibió el insistente desde su última visita | ❌ excluido (solo el insistente) | según cumpleaños | ✅ elegible |
| Un envío anterior FALLÓ | ✅ se reintenta | ✅ se reintenta | según filtros |
| `accepts_marketing = false` | ❌ excluido | ❌ excluido | ❌ excluido |

*Sujeto al frequency cap de 7 días
**El cron de cumpleaños usa dedup por `campaign_messages` (`BIRTHDAY_DEDUPE_DAYS`, 360 días), no por `last_campaign_at`.
La ventana es de 360 y no de 365 **a propósito**: el año en que el envío se adelantó dos días el hueco
contra el saludo anterior es de 363, y 365 habría saltado a todo cliente saludado el año pasado sin
registrar un solo error — la campaña habría quedado muda un año entero
