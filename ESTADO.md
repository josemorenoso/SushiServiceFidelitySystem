# ESTADO — RestaurantQR / Cada1

> **Última actualización:** 2026-09-08, noche (cierre de la sesión de cambios pre-reunión, Fable 5.1)
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
| Código | **`main` = `origin/main` = `79fea79`, pusheado el 2026-09-08 (noche) por orden del dueño** — despliega en Vercel el alta del usuario del cliente (`/api/aios/tenant-admin`), **sin migración**. La carpeta sigue en `feat/multisede-aios` (= `main`). Sin mergear a propósito: `master`, `port/sushi-fun-2.8`, `sushi-sync` |
| Verificación | ✅ 2026-09-08 (tarde): `tsc` limpio · **vitest 34 archivos / 543 tests, 1 rojo** · eslint **7 errores preexistentes** (hooks y gráficas del panel, ninguno en lo tocado). ⚠️ El rojo es `tests/db/aios-health.test.ts` «active_days_28d cuenta DÍAS»: el helper mete «dos pedidos hoy» con `now() - 1h` y `now() - 2h`, así que **entre medianoche y las 2 a.m. el segundo cae en el día anterior** y cuenta 4 días en vez de 3. Es del reloj, no del código, y NO lo tocó nadie: se corrige eligiendo horas que no crucen medianoche. `build` no se corrió |
| Marcas vivas | **5**: sushi-service (542 clientes), demo-ventas (412), sushi-fun (251), don-alirio (244), cafe-frangal (8) |
| Base de datos de producción | ✅ **Aplicadas hasta la `00056`** (dueño, 2026-09-08: `00047`, `00050`, `00051`, `00053`, `00054` y `00056`, todas). El esquema ya alcanza al código de `main`. La 00030 NUNCA aplicada (a propósito). La 00015 NO se aplica (reabre fuga). Huecos: `00048`, `00049`, `00052`, `00055` |
| Migraciones: dónde están | El directorio muestra **solo la rama puesta**; el inventario real y el número de la próxima los da `node scripts/proxima-migracion.mjs`. **Desde el 07 la única reserva es la fila del tablero (§2)**: un número citado en cualquier otro doc no reserva nada. `00048`, `00049`, `00052` y `00055` son huecos: no se rellenan |
| Crons | Los 5 en `vercel.json`, corriendo. `birthday` 18:00 y `reactivation` 20:00 UTC (= 13:00/15:00 Bogotá), verificado. ⚠️ **`reward-reminder` sigue en 16:00 UTC (11:00 Bogotá)**; la auditoría estimó ≈21:00 UTC. **Decisión del dueño** |
| n8n | Apagado. `domicilios_whatsapp_v4.json` sigue en el VPS pero ya no dispara |
| AIOS (`Level 2.0/aios-constelarys`) | **`main` = `origin/main` = `4a5e01b` (v1.7.0), pusheado el 2026-09-08** y desplegándose. Lleva la v1.6.0 (un negocio con varios locales es UNA marca) y la v1.7.0 (tarjeta «Usuario del panel»). Sus migraciones ya estaban aplicadas |
| Grafo | Hook post-commit instalado el 07 (`graphify hook status`): se actualiza solo en cada commit. ⚠️ 169 comunidades renombradas por su hub: `graphify label` las refresca (cuesta LLM, no se corrió) |
| Deadline | ~2026-09-10 — onboarding de los 25 clientes de Zernio |

## 2. En vuelo ahora mismo

> **Es el TABLERO.** Una fila por sesión viva, anotada y commiteada sola ANTES de tocar nada; se borra al cerrar.
> Dos filas no comparten archivo. La migración escrita acá es su ÚNICA reserva. Regla: `CLAUDE.md` § "modo simple".

| Sesión (qué, quién, cuándo) | Modelo | Archivos / carpetas que toca | Migración | Estado |
|---|---|---|---|---|

## 3. Siguiente, en orden

0.ter **Aplicar la `00057` en Supabase** (una línea: `GRANT USAGE ON SCHEMA auth TO aios_constelarys`).
   Sin ella el AIOS **no puede leer las sedes**: el paso 3 del alta («Verificar el subdominio») falla con
   `42501 permission denied for schema auth` en todo negocio con dos locales. No bloquea el alta —el paso 3
   solo comprueba—, pero deja la verificación a ojo. → `docs/features/multi-sede.md` §3.sexies.
0. **`AIOS_ADMIN_PROVISION_SECRET` en los DOS Vercel**, la MISMA cadena — el dueño la estaba cargando el 08,
   con el código ya desplegado. Sin ella el producto responde **503** y la tarjeta «Usuario del panel» se ve
   pero dice que está apagada. Comprobarla dando de alta a **Pedacito de Amor**, que espera su usuario;
   si algo falla, el SQL de `docs/features/alta-usuario-admin.md` §7 hace lo mismo a mano.
0.bis **Tepuy nació como DOS marcas** (`clubtepuylaureles` 01:48 y `clubtepuyenvigado` 01:53): el alta salió con
   el AIOS **v1.5.2**, que creaba un tenant por sede; la v1.6.0 quedó desplegada a las ~01:59. **Decisión del
   dueño (08): se borran las dos y se rehace como UNA marca con dos sedes, compartiendo un solo número.**
   Los QR ya están impresos, así que los dos subdominios se reusan TAL CUAL, ahora como dominio de cada SEDE,
   y la marca estrena `clubtepuy.constelarys.com` (el raíz manda aunque una sede lo repita: sería el 409).
   Paso a paso en `SQL-PARA-CORRER/tepuy-una-marca/LEEME.md` (el 02 va en el Supabase del **AIOS**).
   **Corre prisa**: los dos subdominios responden, y el primer check-in convierte esto en otro problema.
   La clienta pidió **un celular por sede**: eso es **F9** (`location_messaging`, cupo y plantillas por línea)
   y choca con **D6**; por ahora comparten línea. Sin decidir.
1. ✅ **Las seis migraciones (00047–00056) del producto y la `00007` del AIOS están aplicadas** (dueño, 2026-09-08).
   Del AIOS queda **desplegar la v1.6.0** (mergear `feat/multisede-aios` → `main` del AIOS), que lo está puliendo
   otra sesión del dueño el 08. Recién ahí se da de alta Tepuy y la sede 2 engancha.
1.bis **Pusheado `c96bce5` a `main` el 08 (noche).** Falta la mirada del dueño: abrir `/dashboard/marca` (ahora "Tarjeta principal"), cargar redes/sellos de una marca y abrir
   su `/tarjeta` en un celular. Sin config nueva, ninguna marca cambia.
2. **Smoke test** del `docs/RUNBOOK-DEPLOY.md` §5 con Sushi Service real, apenas terminen las cinco:
   crear un evento con enlace, abrir Conexiones, y mirar la tarjeta en un celular.
3. **Asignarle sede a los meseros que ya existen.** Todos tienen `location_id` NULL, así que **no aparecen
   en ningún escáner**. Preparado en `SQL-PARA-CORRER/meseros-sin-sede/`; falta la DECISIÓN, persona por persona.
4. **Zernio E2E** con la cuenta ya limpia → desbloquea al primer cliente nuevo bajo coexistencia. ⚠️ **Se intentó
   el 08 y no se puede desde esta máquina**: la `ZERNIO_API_KEY` de `.env.local` responde **401** a todo GET
   (`/v1/profiles`, `/v1/phone-numbers`, `/v1/api-keys`), `.env.local` no tiene credenciales de Supabase, y no
   hay un teléfono propio al que mandar. Hace falta: la key vigente (la de Vercel), el `accountId` de la marca
   Zernio y un número del dueño para `scripts/zernio-sandbox-test.mjs --account … --to …`. Con él va
   **`ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL`** = `…/event-media/5103017800669793459.jpg` en Vercel (la muestra
   que Meta YA aprobó; el HEIC del bucket **no sirve**). Sin ella las 2 de calendario salen bloqueadas.
5. **`owner_email` está vacío en las 5 marcas**: Conexiones **solo la opera el super-admin** (`isTenantOwner()`
   es fail-closed y la pantalla lo dice). Una llamada por cada alta hasta que el AIOS lo mande.
6. **Subdominio sin tenant muestra Sushi Service** (comprobado el 07 con `pedacitodeamorclub.constelarys.com`):
   `getBrandingForHost()` cae a `DEFAULT_BRANDING` (`NEXT_PUBLIC_BRAND_*`). Sin fuga de datos, pero un cliente
   que abre su enlace antes del alta ve otra marca. **Qué mostrar (404, página neutra) es decisión del dueño.**
7. **De §18 quedan DOS** (`docs/DECISION-18-DOMICILIOS-COEXISTENCIA.md`): **18.e** (a los clientes de Sushi Fun
   se les contesta que ese número «es exclusivo para mensajes automáticos») y **18.c** (plantilla de fallo de Zernio).
8. **De `docs/AUDITORIA-POST-DEPLOY-2026-09-06.md`** queda vivo el AMARILLO de `reward-reminder` (Crons). El
   ROJO 3 está entero en `main` y vive solo hasta que corra la 00053. Siguen stale: `docs/ESTADO-REQUERIMIENTOS.md`
   (además da por abierta la **18.e**, que ya está hecha en Conexiones C1) y `docs/04-deployment.md`.
9. **Aplicar la 00030** en ventana tranquila (cierra el riesgo del DEFAULT puente).
10. **Onboarding de los 25**: wildcard DNS ya resuelto y probado con Sushi Fun.

**El norte — NO se desarrolla todavía** (dueño, 2026-09-05): automatizaciones dentro del restaurante, **Google** para
reseñas y **Meta** para campañas. Ninguna decisión de hoy cierra esa puerta (`tenants.config`, credenciales de terceros).

## 4. Bloqueado: solo lo puede destrabar el dueño

- **Borrar las ramas locales ya mergeadas** (`feat/salud-aios`, `feat/domicilios`, `feat/conexiones`, `feat/visual`,
  `preview/capa-visual`) y el **stash** olvidado de `fix/opt-out-visible` (`git stash show -p stash@{0}` para mirarlo).
- **Borrar el Supabase de Sushi Fun.** Esperar a un fin de semana de operación normal. El respaldo son los
  `SQL-PARA-CORRER/sushi-fun/*.sql` (1.421 filas), que **NO cubren** Auth, RLS ni storage. El Vercel viejo queda **pausado**.
- **Las preguntas abiertas de producto** (§18.a–d, §16.a–e, §17.a–d, §15.b, §12, §9): `docs/ESTADO-REQUERIMIENTOS.md`.
- **Separación de una sede** (venta, franquicia, socio distinto) — aplazada por el dueño, 2026-09-02.
- Decisiones ya CERRADAS que no se reabren: **D6** (N líneas por marca, la sede no obliga a ninguna; `multi-sede.md` §5) ·
  **D21** (un subdominio por sede, todas pares; con 2+ sedes el dominio RAÍZ deja de registrar, 409; `multi-sede.md` §3.5).

## 5. Hecho reciente

- **El subdominio de una sede ya resuelve la marca en TODO lo público** (2026-09-08, sin migración,
  **en `main`**): la tarjeta, `/api/check-in/status`, `/api/mystery-box/resolve` y las tres rutas de
  `/api/public/*` resolvían con `getTenantByDomain()` (solo `tenants.domain`) y respondían **404** en el
  subdominio de una sede; el branding caía a `DEFAULT_BRANDING`, o sea **el cliente veía Sushi Service al
  escanear el QR de su sede**. Nuevo `getTenantByHost()`, que es el cuerpo que ya usaba
  `resolveHostContext()`. Lo destapó Tepuy. → `docs/features/multi-sede.md` §3.quinquies.
- **El cliente ya nace con usuario** (2026-09-08, sin migración, **en `main` y pusheado**): el AIOS dejaba la marca
  completa y el cliente abría su enlace **sin con qué entrar**. Ahora `POST /api/aios/tenant-admin`
  (llave: `x-aios-secret`, **503 sin la variable**) + tarjeta «Usuario del panel» del AIOS v1.7.0. Nunca da
  `super_admin`, nunca reatribuye un usuario de otra marca (409), nunca cambia una contraseña existente; con
  2+ sedes crea la fila `role='brand'` que evita el 403. → `docs/features/alta-usuario-admin.md`.
- **Cambios pre-reunión** (2026-09-08, `596fb5b`, **en `main` y pusheado**, sin migración): "Identidad visual" pasa a
  **"Tarjeta principal"**; la tarjeta muestra símbolo del sello (20), decoración de contorno (6), redes, perfil de
  Google, descripción, contacto/horario y políticas, plegados (`CardExtras`/`CardMotif`/`StampIcon`; se guarda en
  `config.card.*` + `instagram_url`/`whatsapp_link` por la whitelist, listas cerradas para los dibujos). **Sin config
  no cambia nada.** Premios de campaña vive como pestaña de Campañas (la ruta vieja redirige). Domicilios: cuadro
  modelo con "Copiar modelo" y pasos plegables. → `docs/features/identidad-visual.md`, `campaigns.md`, `delivery-dashboard.md`.
- **El AIOS aprende lo que es una sede** (2026-09-07, F8, **rama `feat/multisede-aios` en los DOS repos, sin
  mergear**): el AIOS creaba **un tenant por cada sede**, así que un negocio con dos locales nacía como dos
  MARCAS — el cliente perdía sus puntos al cambiar de local y el WhatsApp no se podía compartir. Producto:
  **`00056`** (`aios_add_location`, `aios_set_location`, `SELECT` por columnas sobre `restaurant_locations`) +
  **`aios_provision_tenant` reemplazada**, porque no escribía `slug` ni `domain` en las sedes y un alta de dos
  sedes nacía **creada pero muerta** (sin subdominio, el registro responde 409). AIOS v1.6.0: `site_model`,
  `product_location_id`, el paso 2 con dos caminos (crear la marca / engancharse) y la plata contada **una vez
  por marca**. 18 comprobaciones nuevas contra Postgres real.
  → `docs/features/multi-sede.md` §2.bis · `Level 2.0/aios-constelarys/docs/DECISION-MULTISEDE-2026-09-07.md`.
- **Método v3.1: modo simple** (2026-09-07): todas las sesiones en esta carpeta y en la misma rama, territorios por
  archivo en §2, commit solo de lo propio por nombre, sin `checkout`/`stash`/`reset --hard`, una sola sesión verifica
  al cierre. Hook post-commit de graphify instalado. El script de migraciones solo lee reservas del §2. `.worktrees/` fuera.
- **Un domicilio perdido deja rastro** (2026-09-07, ROJO 3, **en `main`, sin desplegar**): `delivery_intake_failures`
  (00053). El INSERT vive dentro de `logDeliveryIntakeFailure()`, que pasa a `async`. Con ella va `aios_health()`.
- **El apartado de Domicilios** (2026-09-07, §18.d + §24.3-B, **en `main`**): `/dashboard/domicilios` separa
  «llegaron tres y se perdieron» de «hoy no pidió nadie», y «no hubo fallos» de «no pudimos leer» y de «falta la
  00053». Solo lectura, sin migración, no manda mensajes. → `docs/features/delivery-dashboard.md`.
- **Conexiones: el cliente conecta su propio WhatsApp** (2026-09-07, **en `main`**, 00054). Destapó que el
  `redirect_url` apuntaba a `/api/webhook/zernio` (405 a un navegador) y que `verification_required` no lo miraba
  nadie. Nonce del `state` NUESTRO; `isTenantOwner()` fail-closed. → `docs/features/conexiones.md`.
- **Capa visual v3** (2026-09-07, **en `main`**): tarjeta, check-in y panel. **Solo pinta.** Fuera los emojis del
  sistema y ~20 hex horneados. **Sin probar en un teléfono real**: falta la pasada visual del dueño.
- **Plantillas: enviar tal cual o editar** (2026-09-07): cada fila tiene «Enviar a Meta» y «Editar».
- **Lo del 2026-09-06, desplegado** (detalle en `CHANGELOG.md`): `SALIR` visible y contestado · los 3 AMARILLO del
  calendario · Recovery Zone · alta de mesero por ROL · Sushi Fun absorbido (1.421 filas). Con migración sin aplicar:
  enlace del evento (00050) y dominio cruzado simétrico D2 (00051). Lo anterior (§19, F7/F4/F3, identidad visual) está desplegado.

## 6. Deudas y límites conocidos

**Multi-sede** (`docs/features/multi-sede.md`): **D1** `restaurant_locations.config` sin whitelist · **D3** `is_primary`
sin UNIQUE por tenant · **D4** diagrama ER de DB_SCHEMA obsoleto · **D5** conteo de migraciones stale en comentarios ·
**D7** premios sin precio · **D8** adopción de histórico irreversible · **D9** el 409 de sede no acepta elección por API ·
**D12** campañas masivas con `location_id` NULL (es F6) · **D13** 5 columnas de sede vacías · **D15** FK simple en
`staff_devices.staff_user_id` (mitigada con trigger) · **D17** ⚠️ **media cerrada por la `00056`**: el AIOS ya
puede crear y editar sedes; desde el PANEL DEL CLIENTE siguen sin poderse (solo la principal y solo sus coordenadas).

**Rutas que F7 dejó SIN cablear a propósito**: `send-queue` GET, `check-in-override`, `campaigns/manual`,
`imported-contacts/confirm`, `campaigns/run-auto`. El filtro de sede ahí es **no-op seguro (fail-closed)** hasta F6.

**De §19**: **D18** el token del aparato es el fingerprint del navegador y la ÚNICA credencial del local (aceptado) ·
**D19** un mesero sin teléfono en dos sedes cuenta como dos · **D20** quién activó un aparato solo queda en `device_name`.

**Fuera de multi-sede:**
- **00030 sin aplicar**: DEFAULT puente → un INSERT sin `tenant_id` se va calladito a Sushi Service.
  Y **17.b**: "quién es Black" difiere entre la tarjeta (`black-tier.ts`) y el panel (`POWER_RANKS`).
- **Domicilios perdidos sin rastro** (ROJO 3): entero en `main`, pero **no sirve hasta que corra la 00053**.
- **Huecos de migración**: `00048` y `00049` los citó el diseño de multi-sede (F9, F10) y nunca se escribieron;
  `00052` y `00055` los fabricó el script viejo al leer una cita como reserva. Ninguno se rellena.
- **Choques de migración en ramas muertas**: `sushi-sync` (00015) y `port/sushi-fun-2.8` (00028).
- **Catálogo de producto sin empezar** (referidos, push, fatiga, §7, §8, §18): `docs/ESTADO-REQUERIMIENTOS.md`.

## 7. Reglas de esta casa

- **Cada sesión abre y cierra igual** (`CLAUDE.md` § "Cada sesión"): al abrir, fila en §2 commiteada sola; al cerrar,
  tsc · lint · tests, fila borrada, `CHANGELOG.md` (≤15 líneas), `graphify update .`, commit por nombre.
- **Varias a la vez: misma carpeta, misma rama, territorios por archivo.** Nadie cambia de rama, nadie hace `stash`
  ni `reset --hard`, nadie hace `git add -A`. Una corrida de tests a la vez. Worktrees solo como excepción declarada.
- **El número de una migración sale de `node scripts/proxima-migracion.mjs`** y se escribe en la fila del §2: esa es la reserva.
- **La migración se aplica ANTES de desplegar el código que la usa.** Con la 00047 se hizo al revés y salió barato
  de casualidad; con la 00044 habría dado 403 a todos los meseros.
- **Push y deploy son del dueño.** Un push de `main` despliega.
- **Cerrar las sesiones viejas.** Cada mensaje re-factura todo el historial.
- **El grafo antes que el grep**: `graphify query` cuesta 1-2 k tokens; leer "los relevantes", 30-80 k.
- **Modelo por defecto para implementar: Sonnet.** Opus para diseño, planificar el día y el cierre. Haiku para auditorías.
- **Prompts con alcance cerrado**: tarea · guardrails · criterio de término. Nada de "revisá todo el repo".
- **Nada de carpetas fuera del proyecto.** Los respaldos van a GitHub (dueño, 2026-09-06).
