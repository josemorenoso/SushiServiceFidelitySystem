# ESTADO — RestaurantQR / Cada1

> **Última actualización:** 2026-09-07, 00:05 (sesión "plantillas: enviar tal cual o editar", Opus 5)
> Toda sesión lo lee PRIMERO. Toda sesión que cierra un bloque lo ACTUALIZA al final. Límite: 150 líneas.
> Lo obsoleto se **saca**, no se tacha: un ítem tachado sigue costando tokens cada vez que alguien lee esto.
>
> **Sus dos hermanos:**
> - [docs/RUNBOOK-DEPLOY.md](docs/RUNBOOK-DEPLOY.md) — los pasos exactos del despliegue, en orden, verificados contra el código.
> - [docs/ESTADO-REQUERIMIENTOS.md](docs/ESTADO-REQUERIMIENTOS.md) — §1–§25 del encargo, auditados contra el código. Ahí vive **qué falta desarrollar**.

---

## 1. Foto actual

| Qué | Estado |
|-----|--------|
| Código | **`main` está 3 commits ADELANTE de `origin/main`** (plantillas, 2026-09-07): mergeado local, **sin pushear ni desplegar** (decisión del dueño). Lo del 05/06, incluido QR Studio, sí está en producción |
| Verificación | ✅ `tsc` limpio · eslint 7 errores preexistentes (React hooks, sin relación) · **vitest 25 archivos / 418 tests en verde** |
| Marcas vivas | **5**: sushi-service (542 clientes), demo-ventas (412), sushi-fun (251), don-alirio (244), cafe-frangal (8) |
| Base de datos de producción | Aplicadas hasta la **00046**. 🔴 **La `00047` (identidad visual) está SIN APLICAR y su código YA ESTÁ DESPLEGADO** — ver §3.1. La 00030 NUNCA aplicada (a propósito). La 00015 NO se aplica (reabre fuga) |
| Crons | Los 5 en `vercel.json`, corriendo. `birthday` 18:00 y `reactivation` 20:00 UTC (= 13:00/15:00 Bogotá), verificado. ⚠️ **`reward-reminder` sigue en 16:00 UTC (11:00 Bogotá)**: de los 3 del ROJO 1 se corrigieron 2. Su hora real no se pudo confirmar por retención de logs; la auditoría la estimó ≈21:00 UTC. **Decisión del dueño** |
| n8n | Apagado. `domicilios_whatsapp_v4.json` sigue en el VPS pero ya no dispara |
| Grafo | Al día sobre `918dadd` (2026-09-07): 4.640 nodos, 7.981 aristas, 416 comunidades |
| Deadline | ~2026-09-10 — onboarding de los 25 clientes de Zernio |

## 2. En vuelo ahora mismo

- **Conexiones — signup de WhatsApp del CLIENTE** · rama `feat/conexiones` · **00052** · territorio
  exacto en **§10.bis** de `docs/superpowers/specs/2026-09-06-conexiones-design.md`. Compartidos que
  toca, los únicos 4: `DashboardSidebar.tsx` (1 línea), `webhook/zernio/route.ts` (**aditivo**),
  `zernio/webhooks.ts` y `webhook/twilio-incoming/route.ts` (**aditivo**: un `if` justo antes del
  cooldown de la auto-respuesta, §18.e — el interruptor tiene que APAGAR algo o miente). Ese `if`
  va cerca de la **línea 361**, no de la 326 que declaró salud-aios: no se cruzan.
  **No toca envío, `tenants`, gobernanza, multi-sede, 00048/00049 ni el AIOS.**
  ⚠️ **La migración pasa de 00052 a 00054**: `scripts/proxima-migracion.mjs` ve la 00053 ya creada
  por salud-aios y la 00052 reservada en los docs, y manda usar la **00054**. Obedezco al script.

- **Salud por cliente en el AIOS (§24-A)** · rama `feat/salud-aios` en `.worktrees/salud` · **00053** ·
  semáforo de domicilios, envío, línea y crons. En ESTE repo toca **2 archivos y nada más**:
  `supabase/migrations/00053_*.sql` (tabla de fallos de intake §24-B + `aios_health()`, ambos NUEVOS)
  y `src/services/delivery.service.ts` (el INSERT dentro de `logDeliveryIntakeFailure()`). **Lee**
  `tenants`, `visits`, `message_logs`, `send_queue`, **no escribe en ninguna**. El grueso del trabajo
  vive en el **repo del AIOS**, que este repo ignora. **No toca la 00052, envío, gobernanza ni
  multi-sede.** ⚠️ **Cruce declarado con conexiones, de UNA PALABRA:** el embudo pasa a `async`, así
  que `webhook/zernio/route.ts:244` y `twilio-incoming/route.ts:326` ganan un `await` delante de
  `logDeliveryIntakeFailure(`. Nada más de esas dos rutas se toca.

**Lo demás, nada en vuelo.** QR Studio y plantillas cerraron en `main`, **sin pushear**: lo decide el dueño.

📌 **Esta sección es el TABLERO.** Anotá tu territorio ANTES de escribir y commiteá esa línea sola;
si se cruza con una ya anotada, esperá. Al cerrar, borrala. Regla completa (incluido por qué `stash`
y `reset --hard` están prohibidos con otra sesión viva) en `CLAUDE.md` § "Trabajar en paralelo".

**Repo del AIOS**: `fix/coexistencia` (v1.4.0) subida, pero **su `main` NO se pusheó** — pushearlo
despliega el AIOS y es decisión del dueño. Parte en `…/docs/PARTE-COEXISTENCIA-2026-09-06.md`.

## 3. Siguiente, en orden

1. 🔴 **Correr la `00047` en Supabase producción.** Es lo único urgente. Su código ya está vivo:
   sin ella, guardar en `/dashboard/marca` y subir el logo fallan. **Nada de lo anterior se rompe**
   —`--brand-primary` tiene su literal en `:root`— pero la feature nueva no funciona.
   Archivo: `supabase/migrations/00047_identidad_visual.sql`. Detrás va la **`00050`** (enlace del
   evento), que **debe aplicarse ANTES** de desplegar su código: si no, crear un evento da 42703.
2. **Asignarle sede a los meseros que ya existen.** Todos tienen `location_id` NULL, así que **no
   aparecen en ningún escáner**: es lo que más se nota en la operación diaria. El trabajo está
   preparado en `SQL-PARA-CORRER/meseros-sin-sede/`; falta la DECISIÓN, persona por persona.
3. **Zernio E2E** con la cuenta ya limpia → desbloquea al primer cliente nuevo bajo coexistencia.
   Con él va **`ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL`** = `…/event-media/5103017800669793459.jpg` en
   Vercel (la muestra que Meta YA aprobó en Twilio; el HEIC del bucket **no sirve**, Meta solo
   acepta JPEG/PNG). Sin ella las 2 de calendario salen bloqueadas, con el motivo escrito.
4. **Responder §18.a–d** (`docs/DECISION-18-DOMICILIOS-COEXISTENCIA.md`): las últimas preguntas que
   bloquean el onboarding.
5. **De `docs/AUDITORIA-POST-DEPLOY-2026-09-06.md` quedan vivos: ROJO 3** (un domicilio perdido no
   deja rastro: `logDeliveryIntakeFailure()` solo va a `console.error`) y el AMARILLO de
   `reward-reminder` (fila de Crons). Los 3 AMARILLO del calendario, cerrados (§5). Siguen stale:
   `docs/ESTADO-REQUERIMIENTOS.md` y `docs/04-deployment.md`.
6. **Aplicar la 00030** en ventana tranquila (cierra el riesgo del DEFAULT puente).
7. **Onboarding de los 25**: wildcard DNS ya resuelto y probado con Sushi Fun.

**El norte, para tenerlo en cuenta al diseñar — NO se desarrolla todavía** (dueño, 2026-09-05): el
producto va hacia **automatizaciones dentro del restaurante**: conectar **Google** para responder
reseñas y **Meta** para campañas. Se anota para que ninguna decisión de hoy cierre esa puerta (sobre
todo en `tenants.config` y en cómo se guardan credenciales de terceros).

## 4. Bloqueado: solo lo puede destrabar el dueño

- **Correr la `00047` y la `00050`** (§3.1). Son migraciones sobre datos reales.
- **Pushear `main` del AIOS**, que lo despliega (§2).
- **Borrar el Supabase de Sushi Fun.** Se acordó esperar a un fin de semana de operación normal. El
  respaldo son los `SQL-PARA-CORRER/sushi-fun/*.sql` (1.421 filas), que **NO cubren** Auth, RLS ni
  storage. El Vercel viejo queda **pausado, no borrado**.
- **Las preguntas abiertas de producto** (§18.a–d, §16.a–e, §17.a–d, §15.b, §12, §9):
  la lista completa está en `docs/ESTADO-REQUERIMIENTOS.md`.
- **D6 CERRADA** (2026-09-05): la línea de WhatsApp es **N líneas por marca y la sede no obliga a
  ninguna** — se elige al enviar. El eje es el cupo, no la geografía. `docs/features/multi-sede.md` §5.
- **Separación de una sede** (venta, franquicia, socio distinto) — aplazada por el dueño, 2026-09-02.
- **D21 CERRADA — un subdominio por sede** (2026-09-06): la ciudad va en el subdominio desde el
  principio y **todas las sedes son pares** (`laureles.marca.com`). No es opcional: con 2+ sedes el
  dominio RAÍZ deja de registrar clientes nuevos (409), así que una sede sin `domain` mata el
  registro. → `multi-sede.md` §3.5.

## 5. Hecho reciente

- **Plantillas: enviar tal cual o editar** (2026-09-07): un alta nueva dejaba las 13 vacías y el único
  camino masivo solo se abría al CAMBIAR de estilo — con el default `calido`, 13 ediciones a mano. Cada
  fila tiene ya «Enviar a Meta» (texto del catálogo, sin casilla: no lo escribió el dueño) y «Editar».
- **El `SALIR` se ve y se contesta** (2026-09-06): `setWhatsappOptOut()` devolvía `void`, así que
  "marqué a un cliente" y "no había a quién marcar" (cero filas, un éxito para Postgres) llegaban
  idénticos: el log decía "persistido" con el panel en cero y las dos eran ciertas. Ahora devuelve
  `matched`, y al cliente se le contesta por TwiML. → `docs/features/twilio-opt-out.md`.
- **Los 3 AMARILLO del calendario** (2026-09-06): **(1)** la hora del picker se leía en la zona del
  navegador; la conversión vive ya solo en `src/lib/timezone.ts`. **(2)** `calendar_event` **gotea por
  `send_queue`**: antes lo que excedía el cupo se perdía como `failed`. **(3)** el reclamo no contaba
  filas y dos corridas creían ganar; lo cierra `claimScheduledEvent()` (`calendar-claim.test.ts`).
- **Enlace del evento** (2026-09-06): `link_url` (00050, **sin aplicar**) va dentro de `{{5}}` para no
  re-aprobar en las 25. Imagen de la master **approved**; **Sushi Fun no la tiene**; video **rejected**.
- **La Recovery Zone se deriva de los días del tenant** (2026-09-06): era fija 18–25 con días de
  reactivación configurables; bajar el suave a 15 dejaba 15–17 sin proteger.
- **D2 cerrada — el dominio cruzado va en las DOS direcciones** (2026-09-06, `00051`): faltaba el
  trigger simétrico sobre `tenants`; sin él una marca podía tomar el subdominio de la sede de OTRA.
- **El alta de un mesero la gobierna el ROL** (2026-09-06): pedía Celular y PIN aunque eligieras
  "Mesero", un modelo que §19 ya había borrado. Ahora `waiter` = Nombre + Sede; `supervisor`/`admin`
  = además Celular y PIN. El panel MARCA a los que no tienen sede: no salen en ningún escáner.
- **Sushi Fun absorbido como tenant** (2026-09-06): 1.421 filas, cero cruces, las otras 4 intactas.
  Conserva **su cuenta de Twilio**. Pendientes: su Supabase y su Vercel (§4).
- Lo anterior a esto (§19, F7/F4/F3, identidad visual) está desplegado y vive en `CHANGELOG.md`.

## 6. Deudas y límites conocidos

**Multi-sede** (`docs/features/multi-sede.md`): **D1** `restaurant_locations.config` sin whitelist ·
**D3** `is_primary` sin UNIQUE por tenant · **D4** diagrama ER de DB_SCHEMA obsoleto · **D5** conteo de
migraciones stale en comentarios · **D7** premios sin precio · **D8** adopción de histórico
irreversible · **D9** el 409 de sede no acepta elección por API · **D12** campañas masivas con
`location_id` NULL (es F6) · **D13** 5 columnas de sede vacías · **D15** FK simple en
`staff_devices.staff_user_id` (mitigada con trigger) · **D17** las sedes no se crean desde el producto.

**Rutas que F7 dejó SIN cablear a propósito**: `send-queue` GET, `check-in-override`,
`campaigns/manual`, `imported-contacts/confirm`, `campaigns/run-auto`. Hasta que F6 llene esas
tablas, el filtro de sede ahí es **no-op seguro (fail-closed, no fail-open)**.

**De §19**: **D18** el token del aparato es el fingerprint del navegador y es la ÚNICA credencial del
local — el dueño lo aceptó · **D19** un mesero sin teléfono en dos sedes cuenta como dos · **D20**
quién activó un aparato solo queda en `device_name` y `trusted_at`.

**Fuera de multi-sede:**
- **00030 sin aplicar**: DEFAULT puente → un INSERT sin `tenant_id` se va calladito a Sushi Service.
  Y **17.b**: "quién es Black" difiere entre la tarjeta (`black-tier.ts`) y el panel (`POWER_RANKS`).
- **Domicilios perdidos sin rastro** (ROJO 3): `logDeliveryIntakeFailure()` solo va a `console.error`,
  la tabla de §24-B no existe y no hay alerta. Con n8n apagado es el único registro.
- **00048 y 00049 están RESERVADAS**, no libres: son de multi-sede (`…/2026-09-02-multisede-design.md`
  §6.3 y §7.2) y las dos dependen de una decisión del dueño. El número se saca con el script.
- **Choques de migración en ramas muertas**: `sushi-sync` (00015) y `port/sushi-fun-2.8` (00028).
- **Catálogo de producto sin empezar** (referidos, push, fatiga, §7, §8, §18): no es deuda técnica.
  Ver `docs/ESTADO-REQUERIMIENTOS.md`.

## 7. Reglas de esta casa

- **El número de una migración NO se elige mirando `supabase/migrations/`** — ese directorio solo
  muestra tu rama. Se saca con `node scripts/proxima-migracion.mjs`. La 00048 chocó por saltarse esto.
- **La migración se aplica ANTES de desplegar el código que la usa.** Con la 00047 se hizo al revés
  y salió barato de casualidad; con la 00044 habría dado 403 a todos los meseros.
- **Paralelo sí, a ciegas no**: el territorio se declara en §2 antes de escribir; si se cruza, va en fila.
- **Cerrar las sesiones viejas.** Cada mensaje re-factura todo el historial.
- **El grafo antes que el grep**: `graphify query` cuesta 1-2 k tokens; leer "los relevantes", 30-80 k.
- **Modelo por defecto para implementar: Sonnet.** Opus solo para diseño, merges delicados o la
  revisión final. Haiku para auditorías e inventarios.
- **Prompts con alcance cerrado**: tarea · guardrails · criterio de término. Nada de "revisá todo el repo".
- **Nada de carpetas fuera del proyecto.** Los respaldos van a GitHub (dueño, 2026-09-06).
- Toda sesión termina actualizando ESTE doc + `CHANGELOG.md` (≤15 líneas) + `graphify update .`.
