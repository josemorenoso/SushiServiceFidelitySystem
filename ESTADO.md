# ESTADO — RestaurantQR / Cada1

> **Última actualización:** 2026-09-07, 09:30 (sesión "consolidación: las 4 ramas del 07 a `main`", Opus 5)
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
| Código | **`main` PUSHEADO a `origin` el 2026-09-07 (`3b5ec78..4d8ace1`, 41 commits)** — decisión del dueño, tomada sabiendo que las 5 migraciones siguen sin aplicar (§3.1). Lleva las 4 ramas del 07 dentro: `feat/salud-aios`, `feat/domicilios`, `feat/conexiones` y `feat/visual`. **Si la integración de git de Vercel está activa, esto ya desplegó a producción.** Local y remoto en sync. Rama de vistazo: `preview/capa-visual`, también en `origin`. Quedaron SIN mergear a propósito `master`, `port/sushi-fun-2.8` y `sushi-sync`: son líneas viejas o de otro producto, no parte de este trabajo |
| Verificación | ✅ Medido sobre `main` YA mergeado: `tsc` limpio · **vitest 31 archivos / 502 tests en verde** · `build` OK (79 páginas, 121 rutas) · eslint **7 errores preexistentes** (React hooks y gráficas del panel), **ninguno** en lo mergeado hoy |
| Marcas vivas | **5**: sushi-service (542 clientes), demo-ventas (412), sushi-fun (251), don-alirio (244), cafe-frangal (8) |
| Base de datos de producción | Aplicadas hasta la **00046**. 🔴🔴 **CINCO migraciones sin aplicar y el código de las cinco YA ESTÁ EN `origin/main`**: `00047` (identidad visual), `00050` (enlace del evento), `00051` (dominio cruzado), `00053` (salud + `delivery_intake_failures`) y `00054` (Conexiones). Ya no es "antes de desplegar": el código salió primero, así que **cada minuto sin correrlas es una función rota en producción** — ver §3.1. La 00030 NUNCA aplicada (a propósito). La 00015 NO se aplica (reabre fuga) |
| Migraciones: dónde están | **No falta ninguna.** `00048`, `00049` y `00052` son **huecos a propósito**: reservadas en docs y nunca escritas. El directorio muestra **solo la rama puesta**; el inventario real lo da `node scripts/proxima-migracion.mjs`, y el numero de la proxima **sale de el, nunca de este doc**: cualquier `000NN` escrito aca el script lo lee como RESERVA y lo saltea |
| Crons | Los 5 en `vercel.json`, corriendo. `birthday` 18:00 y `reactivation` 20:00 UTC (= 13:00/15:00 Bogotá), verificado. ⚠️ **`reward-reminder` sigue en 16:00 UTC (11:00 Bogotá)**: de los 3 del ROJO 1 se corrigieron 2. Su hora real no se pudo confirmar por retención de logs; la auditoría la estimó ≈21:00 UTC. **Decisión del dueño** |
| n8n | Apagado. `domicilios_whatsapp_v4.json` sigue en el VPS pero ya no dispara |
| Grafo | Al día sobre `main` con las 4 ramas dentro: **4.928 nodos / 8.697 aristas / 430 comunidades**. ⚠️ 169 comunidades quedaron renombradas por su hub: los nombres se refrescan con `graphify label` (cuesta LLM, no se corrió) |
| Deadline | ~2026-09-10 — onboarding de los 25 clientes de Zernio |

## 2. En vuelo ahora mismo

**NADA en vuelo. El tablero está vacío y el árbol limpio.** Las cuatro ramas del 07 cerraron y
están dentro de `main` (§1). Las ramas siguen existiendo por si hace falta mirarlas; borrarlas es
decisión del dueño. **`.worktrees/` quedó vacío**: el de `feat/visual` se quitó al mergear.

⚠️ **Al quitar ese worktree se vació `node_modules` de la raíz** — el del worktree estaba enlazado
al de la raíz y el borrado recursivo se fue por el enlace. **No se perdió nada del repo** (está en
`.gitignore`), se rehízo con `npm ci` y la verificación de §1 se repitió entera después. Si volvés
a usar worktrees: `npm ci` en la raíz apenas quites uno, antes de creer en un `tsc` verde.

📌 **Esta sección es el TABLERO.** Toda sesión anota acá su territorio (qué toca, en qué rama)
**antes** de escribir, y lo commitea solo; si se cruza con uno ya anotado, **espera y va después**.
Al cerrar, borra su línea. `stash` y `reset --hard` con otra sesión viva están **prohibidos**.
Regla completa en `CLAUDE.md` § "Trabajar en paralelo".

**Repo del AIOS**: ✅ **`main` PUSHEADO el 2026-09-07 en `9bc3167` (v1.5.0), por orden del dueño** —
lleva el tablero de salud y, detrás, la coexistencia (v1.4.0) y el arreglo de la sede sin
coordenadas. **El AIOS está desplegado.** ⚠️ **`/salud` sale ENTERO EN GRIS hasta que se corra la
`00053`** — no rompe nada del resto del panel, pero no sirve.

## 3. Siguiente, en orden

1. 🔴🔴 **Correr las CINCO migraciones en Supabase producción. Es lo único urgente y ya no
   admite espera:** el 2026-09-07 el dueño decidió pushear `main` **antes** de correrlas, así que
   el orden natural quedó invertido y el código está vivo sin su esquema. En el SQL Editor, el
   archivo completo, uno detrás del otro:
   **`00047`** (sin ella, guardar en `/dashboard/marca` y subir el logo fallan) →
   **`00050`** (sin ella, crear un evento da 42703) →
   **`00051`** (dominio cruzado; ⚠️ **puede ABORTAR sola** si ya hay un host apuntando a dos
   marcas: si aborta, NO se fuerza — se resuelve a quién pertenece cada host primero, y las otras
   cuatro corren igual) →
   **`00053`** (sin ella el tablero del AIOS sale en gris y Domicilios dice "todavía no se está
   guardando") →
   **`00054`** (sin ella Conexiones responde **403**, que parece permisos y no lo es).
   La `00051` y la `00054` traen autoverificación al final: si algo queda a medias abortan con
   `FALTA: …`. **Lo visual (tarjeta, check-in, panel) no depende de ninguna: eso salió sano.**
2. **Smoke test** del `docs/RUNBOOK-DEPLOY.md` §5 con Sushi Service real, apenas terminen las
   cinco: crear un evento con enlace, abrir Conexiones, y mirar la tarjeta en un celular.
3. **Asignarle sede a los meseros que ya existen.** Todos tienen `location_id` NULL, así que **no
   aparecen en ningún escáner**: es lo que más se nota en la operación diaria. El trabajo está
   preparado en `SQL-PARA-CORRER/meseros-sin-sede/`; falta la DECISIÓN, persona por persona.
4. **Zernio E2E** con la cuenta ya limpia → desbloquea al primer cliente nuevo bajo coexistencia.
   Con él va **`ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL`** = `…/event-media/5103017800669793459.jpg` en
   Vercel (la muestra que Meta YA aprobó en Twilio; el HEIC del bucket **no sirve**, Meta solo
   acepta JPEG/PNG). Sin ella las 2 de calendario salen bloqueadas, con el motivo escrito.
5. **`owner_email` está vacío en las 5 marcas**, así que hoy Conexiones **solo la opera el
   super-admin**: `isTenantOwner()` es fail-closed y la pantalla lo dice. Es una llamada por cada
   alta hasta que el AIOS lo mande.
6. **De §18 quedan DOS** (`docs/DECISION-18-DOMICILIOS-COEXISTENCIA.md`): **18.e** —hoy el sistema
   le contesta a los clientes de Sushi Fun que ese número «es exclusivo para mensajes
   automáticos», por su línea real— y **18.c**, la plantilla de fallo de Zernio. 18.a, 18.b y 18.d
   las cerraron los hechos y el código.
7. **De `docs/AUDITORIA-POST-DEPLOY-2026-09-06.md` queda vivo el AMARILLO de `reward-reminder`**
   (fila de Crons). El **ROJO 3** está **entero en `main`** —tabla, `INSERT` y pantalla— y sigue
   vivo **solo hasta que la 00053 corra en Supabase**. Los 3 AMARILLO del calendario, cerrados
   (§5). Siguen stale: `docs/ESTADO-REQUERIMIENTOS.md` y `docs/04-deployment.md`.
8. **Aplicar la 00030** en ventana tranquila (cierra el riesgo del DEFAULT puente).
9. **Onboarding de los 25**: wildcard DNS ya resuelto y probado con Sushi Fun.

**El norte, para tenerlo en cuenta al diseñar — NO se desarrolla todavía** (dueño, 2026-09-05): el
producto va hacia **automatizaciones dentro del restaurante**: conectar **Google** para responder
reseñas y **Meta** para campañas. Se anota para que ninguna decisión de hoy cierre esa puerta (sobre
todo en `tenants.config` y en cómo se guardan credenciales de terceros).

## 4. Bloqueado: solo lo puede destrabar el dueño

- **Correr la `00047`, `00050`, `00051`, `00053` y `00054`** (§3.1–2). Son migraciones sobre datos reales.
- **Pushear `main` del producto**, que lo despliega. Va DESPUÉS de las migraciones (§3.2).
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

- **Un domicilio perdido deja rastro** (2026-09-07, ROJO 3, **en `main`, sin desplegar**):
  `delivery_intake_failures` (00053). El INSERT va dentro de `logDeliveryIntakeFailure()`, que
  pasa a `async`. Sin esa tabla, «llegaron tres pedidos y se perdieron» y «hoy no pidió nadie»
  eran el mismo dato. Con ella va `aios_health()`, que le da al AIOS conteos por marca sin un solo
  GRANT nuevo sobre una tabla. Lo trajo `feat/salud-aios`.
- **El apartado de Domicilios** (2026-09-07, §18.d + §24.3-B, **en `main`, sin desplegar**): lo que
  de verdad arregla no es el hueco en el menú — **«llegaron tres pedidos y se perdieron» y «hoy no
  pidió nadie» eran el mismo dato**, cero filas en `visits`. `/dashboard/domicilios` los separa, y
  separa además «no hubo fallos» de «no pudimos leer» y de «falta la 00053»: un cero solo se pinta
  cuando es cierto. Muestra **a qué número manda el operador el cuadro en ESA marca**, reusa
  `/dashboard/authorized-numbers` tal cual, y su alarma de silencio deriva el umbral **del
  historial de cada marca**. **Solo lectura, sin migración y no manda ni un mensaje.**
  → `docs/features/delivery-dashboard.md`.
- **Conexiones: el cliente conecta su propio WhatsApp** (2026-09-07, **en `main`, sin desplegar**,
  migración **00054**): el dueño no tenía NINGUNA pantalla que le dijera por qué número sale su
  WhatsApp, y el alta se cerraba por fuera del producto. Ese rodeo tapaba dos cosas rotas: el
  `redirect_url` apuntaba a `/api/webhook/zernio`, que solo exporta POST y le da **405** a un
  navegador, y `whatsapp.number.verification_required` —donde el alta se traba EN SILENCIO— llegaba
  al webhook y no lo miraba nadie. El nonce del `state` es NUESTRO e `isTenantOwner()` es
  fail-closed: todos VEN, solo el dueño ACTÚA. → `docs/features/conexiones.md`.
- **Capa visual v3** (2026-09-07, **en `main`, sin desplegar**): la tarjeta del cliente, el
  check-in y el panel. **Solo pinta** — ni una regla de negocio, ni una migración, ni un endpoint.
  Salen los emojis del sistema (🥉🥈🥇💎), que cada teléfono dibuja distinto, y de paso se cierran
  ~20 hex horneados en pantalla pública (la fuga de §5). **Sin probar en un teléfono real**: falta
  la pasada visual del dueño.
- **Plantillas: enviar tal cual o editar** (2026-09-07): un alta nueva dejaba las 13 vacías y el
  único camino masivo se abría solo al CAMBIAR de estilo — con el default `calido`, 13 ediciones a
  mano. Cada fila tiene ya «Enviar a Meta» y «Editar».
- **Lo del 2026-09-06, ya desplegado** (detalle entero en `CHANGELOG.md`): el `SALIR` se ve y se
  contesta (`setWhatsappOptOut()` devolvía `void`, así que "marqué a un cliente" y "no había a
  quién marcar" llegaban idénticos) · los 3 AMARILLO del calendario (zona horaria, `calendar_event`
  goteando por `send_queue`, reclamo con `claimScheduledEvent()`) · la Recovery Zone derivada de
  los días del tenant · el alta de mesero gobernada por el ROL, con los sin-sede MARCADOS · Sushi
  Fun absorbido (1.421 filas, cero cruces; conserva su Twilio, §4).
  Con migración **sin aplicar**: el **enlace del evento** (`link_url` dentro de `{{5}}`, 00050) y
  **D2, el dominio cruzado simétrico** (00051) — sin el trigger sobre `tenants` una marca podía
  tomar el subdominio de la sede de OTRA.
- Lo anterior (§19, F7/F4/F3, identidad visual) está desplegado y vive en `CHANGELOG.md`.

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
- **Domicilios perdidos sin rastro** (ROJO 3): **escrito y entero en `main`** —tabla, `INSERT`
  dentro de `logDeliveryIntakeFailure()` y pantalla—, pero **no sirve hasta que la 00053 se corra
  en Supabase**: hasta entonces el INSERT no tiene dónde escribir, ese `console.error` es el único
  registro y, con n8n apagado, no hay otro.
- **00048, 00049 y 00052 son HUECOS a propósito**, no migraciones perdidas: las dos primeras están
  RESERVADAS para multi-sede (`…/2026-09-02-multisede-design.md` §6.3 y §7.2) y dependen de una
  decisión del dueño; la 00052 la reservó el diseño de Conexiones y al final se escribió como
  00054. **Un hueco es gratis; dos archivos con el mismo número, no.** El número sale del script.
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
