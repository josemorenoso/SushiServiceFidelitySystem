# ESTADO — RestaurantQR / Cada1

> **Última actualización:** 2026-09-06, 19:30 (sesión "orden: todo a `main` y a producción", Opus 5)
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
| Código | **`main` = `origin/main` = producción.** Todo lo de 2026-09-05/06 está mergeado, pusheado y desplegado. No queda nada en ramas salvo `respaldo/*` (código de mayo que ya no compila) |
| Verificación | ✅ `tsc` limpio · eslint 7 errores preexistentes (React hooks, sin relación) · **vitest 24 archivos / 406 tests en verde** |
| Marcas vivas | **5**: sushi-service (542 clientes), demo-ventas (412), sushi-fun (251), don-alirio (244), cafe-frangal (8) |
| Base de datos de producción | Aplicadas hasta la **00046**. 🔴 **La `00047` (identidad visual) está SIN APLICAR y su código YA ESTÁ DESPLEGADO** — ver §3.1. La 00030 NUNCA aplicada (a propósito). La 00015 NO se aplica (reabre fuga) |
| Crons | Los 5 en `vercel.json`, corriendo. `birthday` 18:00 y `reactivation` 20:00 UTC (= 13:00/15:00 Bogotá), verificado. ⚠️ **`reward-reminder` sigue en 16:00 UTC (11:00 Bogotá)**: de los 3 del ROJO 1 se corrigieron 2. Su hora real no se pudo confirmar por retención de logs; la auditoría la estimó ≈21:00 UTC. **Decisión del dueño** |
| n8n | Apagado. `domicilios_whatsapp_v4.json` sigue en el VPS pero ya no dispara |
| Grafo | Al día sobre `f90282f` (2026-09-06): 4.585 nodos, 7.877 aristas, 418 comunidades |
| Deadline | ~2026-09-10 — onboarding de los 25 clientes de Zernio |

## 2. En vuelo ahora mismo

**Nada en vuelo en este repo.** Todo el trabajo del 05/06 está mergeado a `main` y `main` está
**pusheado a `origin`**, que es lo que despliega en Vercel. El árbol principal vuelve a estar en
`main` y limpio, y las ramas ya mergeadas se borraron.

📌 **Esta sección es el TABLERO.** Toda sesión anota acá su territorio (qué toca, en qué rama)
**antes** de escribir, y lo commitea solo; si se cruza con uno ya anotado, **espera y va después**.
Al cerrar, borra su línea. `stash` y `reset --hard` con otra sesión viva están **prohibidos**: hoy
barrieron 12 archivos. Regla completa en `CLAUDE.md` § "Trabajar en paralelo".

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

- **El `SALIR` se ve y se contesta** (2026-09-06): `setWhatsappOptOut()` devolvía `void`, así que
  "marqué a un cliente" y "no había a quién marcar" (cero filas, un éxito para Postgres) llegaban
  idénticos: el log decía "persistido" con el panel en cero y las dos eran ciertas. Ahora devuelve
  `matched`, y al cliente se le contesta por TwiML. → `docs/features/twilio-opt-out.md`.
- **Los 3 AMARILLO del calendario** (2026-09-06): **(1)** la hora del picker se leía en la zona del
  navegador; la conversión vive ahora solo en `src/lib/timezone.ts` (el servidor siempre estuvo bien).
  **(2)** `calendar_event` **ya gotea por `send_queue`**: antes lo que excedía el cupo se perdía como
  `failed`. **(3)** el reclamo del despacho no contaba filas afectadas y dos corridas creían ganar;
  lo cierra `claimScheduledEvent()`, con 8 reclamos simultáneos en `tests/db/calendar-claim.test.ts`.
- **Enlace del evento + plantillas verificadas** (2026-09-06): `link_url` (00050, **sin aplicar**)
  viaja dentro de `{{5}}` para no re-aprobar en las 25 marcas. La de imagen de la master está
  **approved**; **Sushi Fun no tiene ninguna `twilio/media` y ahí NO sale**; video **rejected**.
- **La Recovery Zone se deriva de los días del tenant** (2026-09-06): era fija 18–25 aunque los días
  de reactivación son configurables; bajar el suave a 15 dejaba 15–17 sin proteger.
- **D2 cerrada — el dominio cruzado va en las DOS direcciones** (2026-09-06, `00051`): faltaba el
  trigger simétrico sobre `tenants`; sin él una marca podía tomar el subdominio de la sede de OTRA.
- **El alta de un mesero la gobierna el ROL** (2026-09-06): pedía Celular y PIN aunque eligieras
  "Mesero", un modelo que §19 ya había borrado. Ahora `waiter` = Nombre + Sede; `supervisor`/`admin`
  = además Celular y PIN. El panel MARCA a los que no tienen sede: no salen en ningún escáner.
- **Sushi Fun absorbido como tenant** (2026-09-06): 1.421 filas, cero cruces, las otras 4 intactas.
  Conserva **su cuenta de Twilio**. Pendientes: su Supabase y su Vercel (§4).
- **Firma de Twilio por tenant** (2026-09-06): se validaba con el token master → **todo entrante de
  un tenant con cuenta propia daba 403** y los `SALIR` se perdían.

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
