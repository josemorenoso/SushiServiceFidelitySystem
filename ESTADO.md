# ESTADO — RestaurantQR / Cada1

> **Última actualización:** 2026-09-06, 15:00 (sesión "los 3 AMARILLO del calendario", Opus 5)
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
| Verificación | ✅ `tsc` limpio · eslint 7 errores preexistentes (React hooks, sin relación) · **vitest 24 archivos / 400 tests en verde** |
| Marcas vivas | **5**: sushi-service (542 clientes), demo-ventas (412), sushi-fun (251), don-alirio (244), cafe-frangal (8) |
| Base de datos de producción | Aplicadas hasta la **00046**. 🔴 **La `00047` (identidad visual) está SIN APLICAR y su código YA ESTÁ DESPLEGADO** — ver §3.1. La 00030 NUNCA aplicada (a propósito). La 00015 NO se aplica (reabre fuga) |
| Crons | Los 5 en `vercel.json`, corriendo. `birthday` 18:00 y `reactivation` 20:00 UTC (= 13:00/15:00 Bogotá), verificado. ⚠️ **`reward-reminder` sigue en 16:00 UTC (11:00 Bogotá)**: de los 3 del ROJO 1 se corrigieron 2. Su hora real no se pudo confirmar por retención de logs; la auditoría la estimó ≈21:00 UTC. **Decisión del dueño** |
| n8n | Apagado. `domicilios_whatsapp_v4.json` sigue en el VPS pero ya no dispara |
| Grafo | Al día: `graphify update .` corrido el 2026-09-06 tras el commit del enlace (4.562 nodos, 7.855 aristas) |
| Deadline | ~2026-09-10 — onboarding de los 25 clientes de Zernio |

## 2. En vuelo ahora mismo

**El árbol NO está limpio y lo comparten VARIAS sesiones a la vez** (hubo un `git reset --hard`
que borró trabajo sin commitear: commitear temprano es la única red). El enlace del evento ya está
en `315a265`; sigue suelto lo demás del calendario (§5). **Nada se pushea hasta separar por rama.**

**Repo del AIOS** (`Level 2.0/aios-constelarys`, remoto propio): la rama `fix/coexistencia`
(v1.4.0) está subida pero **su `main` NO se pusheó** — tiene un commit suelto
(`la sede se crea SIEMPRE, aunque no haya coordenadas`) que está respaldado dentro de esa rama.
Pushear ese `main` despliega el AIOS: es decisión del dueño. Parte completo en
`Level 2.0/aios-constelarys/docs/PARTE-COEXISTENCIA-2026-09-06.md`.

## 3. Siguiente, en orden

1. 🔴 **Correr la `00047` en Supabase producción.** Es lo único urgente. Su código ya está vivo:
   sin ella, guardar en `/dashboard/marca` y subir el logo fallan. **Nada de lo anterior se rompe**
   —`--brand-primary` tiene su literal en `:root`— pero la feature nueva no funciona.
   Archivo: `supabase/migrations/00047_identidad_visual.sql`. Detrás va la **`00050`** (enlace del
   evento), que **debe aplicarse ANTES** de desplegar su código: si no, crear un evento da 42703.
2. **Asignarle sede a los meseros que ya existen.** Todos tienen `location_id` NULL, así que **no
   aparecen en ningún escáner**. Es lo que más se nota en la operación diaria.
3. **Arreglar el modal "Crear Mesero"** (`dashboard/staff/page.tsx`): su subtítulo todavía dice que
   el PIN es "para que el mesero inicie sesión", que es del mundo pre-§19 y contradice sus propios
   textos de ayuda. Y el formulario no reacciona al campo *Rol*: debería pedir Celular y PIN solo
   para supervisor/admin, y para un mesero solo Nombre + Sede (obligatoria, con la única sede
   preseleccionada si la marca tiene una). Lo pidió el dueño el 2026-09-06.
4. **Zernio E2E** con la cuenta ya limpia → desbloquea al primer cliente nuevo bajo coexistencia.
5. **Responder §18.a–d** (`docs/DECISION-18-DOMICILIOS-COEXISTENCIA.md`, con opciones y consecuencias).
   Son las últimas preguntas que bloquean el onboarding.
6. **De `docs/AUDITORIA-POST-DEPLOY-2026-09-06.md` quedan vivos: ROJO 3** (un domicilio perdido no
   deja rastro) y el AMARILLO de `reward-reminder` (fila de Crons). Los 3 AMARILLO del calendario,
   cerrados (§5). Sin corregir todavía: `docs/ESTADO-REQUERIMIENTOS.md` y `docs/04-deployment.md`.
7. **Aplicar la 00030** en ventana tranquila (cierra el riesgo del DEFAULT puente).
8. **Onboarding de los 25**: wildcard DNS ya resuelto y probado con Sushi Fun.

**El norte, para tenerlo en cuenta al diseñar — NO se desarrolla todavía** (dueño, 2026-09-05):
el producto va hacia **automatizaciones dentro del restaurante**: conectar la cuenta de **Google**
para responder reseñas y la de **Meta** para campañas. Nada se codea ahora; se anota para que
ninguna decisión de hoy cierre esa puerta (sobre todo en `tenants.config` y en cómo se guardan
credenciales de terceros).

## 4. Bloqueado: solo lo puede destrabar el dueño

- **Correr la `00047`** (§3.1). Es una migración sobre datos reales.
- **Pushear `main` del AIOS**, que lo despliega (§2).
- **Borrar el Supabase de Sushi Fun.** El dueño quiere cerrarlo ya; se acordó esperar a que el
  `SALIR` esté verificado y a un fin de semana de operación normal. Lo que existe hoy como respaldo
  son los `SQL-PARA-CORRER/sushi-fun/*.sql` (1.421 filas, verificadas contra un Postgres real).
  **NO cubren** el usuario de Auth, RLS ni storage. El Vercel viejo queda **pausado, no borrado**.
- **Las preguntas abiertas de producto** (§18.a–d, §16.a–e, §17.a–d, §15.b, §12, §9):
  la lista completa está en `docs/ESTADO-REQUERIMIENTOS.md`.
- **D6 CERRADA** (2026-09-05): la línea de WhatsApp es **N líneas por marca y la sede no obliga a
  ninguna** — se elige al enviar. El eje es el cupo, no la geografía. `docs/features/multi-sede.md` §5.
- **Separación de una sede** (venta, franquicia, socio distinto) — aplazada por el dueño, 2026-09-02.

## 5. Hecho reciente

- **Los 3 AMARILLO del calendario** (2026-09-06): **(1)** la hora del picker se leía en la zona del
  navegador; la conversión vive ahora solo en `src/lib/timezone.ts` (el servidor siempre estuvo bien).
  **(2)** `calendar_event` **ya gotea por `send_queue`** — antes lo que excedía el cupo del día se
  marcaba `failed` y se perdía. **(3)** el reclamo del despacho no miraba las filas afectadas, así que
  dos corridas creían ganar y despachaban dos veces; lo cierra `claimScheduledEvent()` y lo reproduce
  `tests/db/calendar-claim.test.ts` con 8 reclamos simultáneos. → `docs/features/calendar.md`.
- **Sushi Fun absorbido como tenant** (2026-09-06): 1.421 filas desde su propio Supabase, cero cruces
  de marca, las otras 4 marcas intactas. Conserva **su cuenta de Twilio** (3 columnas en `tenants`).
  Pendientes: borrar su Supabase (§4) y el Vercel viejo tras 7 días. → `docs/PARTE-SUSHI-FUN-2026-09-06.md`.
- **Enlace del evento + plantillas verificadas** (2026-09-06): `link_url` (00050, **sin aplicar**)
  viaja dentro de `{{5}}` para no re-aprobar plantillas en las 25 marcas. Contra Twilio: la de imagen
  de la master está **approved** y dinámica; **Sushi Fun, con cuenta propia, no tiene ninguna
  `twilio/media` y ahí NO sale**. Video: **rejected**. → `docs/features/calendar.md`.
- **Firma de Twilio por tenant** (2026-09-06): se validaba siempre con el token master, pero Twilio
  firma con el de la cuenta dueña del número → **todo entrante de un tenant con cuenta propia daba
  403** y los `SALIR` se perdían. Ahora resuelve el tenant por `To`; fuera la puerta trasera de `dev`.
- **Identidad visual por marca** (2026-09-06): logo y un color desde `/dashboard/marca`, del que se
  derivan gradientes, sello y QR. `tenants.config` gana whitelist **por ruta** y reserva
  `integrations`. Migración renumerada 00048 → **00047** (el 48 era de F9). → `identidad-visual.md`.
- **§19 — el escáner es del local** (2026-09-05, desplegado): un login por aparato, el mesero se elige
  en cada operación y la lista va filtrada por sede. `staff_users.phone` pasa a NULLABLE y la llave de
  identidad se **complementa**, no se reemplaza. Eliminada `POST /api/staff/login`.
- **F7 / F4 / F3**: permisos por sede (D10, `00045`), el mesero es de UNA sede (D11, `00044`), y el
  check-in escribe la sede. Todo aplicado y desplegado.

## 6. Deudas y límites conocidos

**Multi-sede** (`docs/features/multi-sede.md`): **D1** `restaurant_locations.config` sin whitelist ·
**D2** trigger cruzado de una dirección · **D3** `is_primary` sin UNIQUE por tenant · **D4** diagrama
ER de DB_SCHEMA obsoleto · **D5** conteo de migraciones desactualizado en comentarios · **D7** premios
sin precio · **D8** adopción de histórico irreversible · **D9** el 409 de sede no acepta elección por
API · **D12** campañas masivas con `location_id` NULL (es F6) · **D13** 5 columnas de sede vacías ·
**D15** FK simple en `staff_devices.staff_user_id` (mitigada con trigger) · **D17** las sedes no se
crean ni se editan desde el producto (es F8, wizard AIOS).

**Rutas que F7 dejó SIN cablear a propósito**: `send-queue` GET, `check-in-override`,
`campaigns/manual`, `imported-contacts/confirm`, `campaigns/run-auto`. Hasta que F6 llene esas
tablas, el filtro de sede ahí es **no-op seguro (fail-closed, no fail-open)**.

**De §19**: **D18** el token del aparato es el fingerprint del navegador y es la ÚNICA credencial del
local — el dueño lo aceptó · **D19** un mesero sin teléfono en dos sedes cuenta como dos · **D20**
quién activó un aparato solo queda en `device_name` y `trusted_at`.

**Fuera de multi-sede:**
- **00030 sin aplicar**: DEFAULT puente → un INSERT sin `tenant_id` se va calladito a Sushi Service.
- **17.b**: "quién es Black" difiere entre la tarjeta (`black-tier.ts`) y el panel (`POWER_RANKS`).
- **Domicilios perdidos sin rastro**: `logDeliveryIntakeFailure()` solo va a `console.error`, la tabla
  de §24-B no existe y no hay alerta. Con n8n apagado es el único registro. Es el ROJO 3 de la auditoría.
- **Choques de número de migración en ramas muertas**: `sushi-sync` (00015) y `port/sushi-fun-2.8`
  (00028) chocan con `main`. No se mergean sin renumerar; lo más probable es que se borren.
- **Catálogo de producto sin empezar**: referidos, push, fatiga, §8, §18. No es deuda técnica: es
  catálogo. Ver `docs/ESTADO-REQUERIMIENTOS.md`.

## 7. Reglas de esta casa

- **El número de una migración NO se elige mirando `supabase/migrations/`** — ese directorio solo
  muestra tu rama. Se saca con `node scripts/proxima-migracion.mjs`, que mira todas las ramas vivas
  y las reservas de los docs. Hoy la 00048 chocó por saltarse esto.
- **La migración se aplica ANTES de desplegar el código que la usa.** Hoy se hizo al revés con la
  00047 y salió barato de casualidad; con la 00044 habría dado 403 a todos los meseros.
- **Una sesión pesada a la vez** por territorio. Paralelo solo con territorios disjuntos, declarados en §2.
- **Cerrar las sesiones viejas.** Cada mensaje re-factura todo el historial.
- **El grafo antes que el grep**: `graphify query "…"` cuesta 1-2 k tokens; leer "los archivos
  relevantes" cuesta 30-80 k.
- **Modelo por defecto para implementar: Sonnet.** Fable/Opus solo para diseño, merges delicados o la
  revisión final de una ola. Haiku para auditorías, inventarios y el grafo.
- **Prompts con alcance cerrado**: tarea · guardrails · criterio de término. Nada de "revisá todo el repo".
- **Nada de carpetas fuera del proyecto.** Los respaldos van a GitHub (dueño, 2026-09-06).
- Toda sesión termina actualizando ESTE doc + `CHANGELOG.md` (≤15 líneas) + `graphify update .`.
