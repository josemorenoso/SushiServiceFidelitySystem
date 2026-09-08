# ESTADO — RestaurantQR / Cada1

> **Última actualización:** 2026-09-07, tarde (sesión "modo simple: misma carpeta, misma rama", Fable 5.1)
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
| Código | `origin/main` = `f003050` (pusheado el 2026-09-07 por decisión del dueño, con las 4 ramas del 07 dentro). **La carpeta está en `feat/multisede-aios`**, una rama que la sesión F8 creó el 07 encima de `main` (00056 + test + este método v3.1): **va a `main` por fast-forward** cuando F8 cierre. Quedaron SIN mergear a propósito `master`, `port/sushi-fun-2.8` y `sushi-sync`: líneas viejas o de otro producto |
| Verificación | ✅ Sobre `main` `f003050`: `tsc` limpio · **vitest 31 archivos / 502 tests** · `build` OK (79 páginas, 121 rutas) · eslint **7 errores preexistentes** (hooks y gráficas del panel). Lo de F8 lo verifica F8 al cerrar |
| Marcas vivas | **5**: sushi-service (542 clientes), demo-ventas (412), sushi-fun (251), don-alirio (244), cafe-frangal (8) |
| Base de datos de producción | Aplicadas hasta la **00046**. 🔴🔴 **CINCO sin aplicar y su código YA ESTÁ EN `origin/main`**: `00047`, `00050`, `00051`, `00053`, `00054` → §3.1. **Cada minuto sin correrlas es una función rota en producción.** La 00030 NUNCA aplicada (a propósito). La 00015 NO se aplica (reabre fuga) |
| Migraciones: dónde están | El directorio muestra **solo la rama puesta**; el inventario real y el número de la próxima los da `node scripts/proxima-migracion.mjs`. **Desde el 07 la única reserva es la fila del tablero (§2)**: un número citado en cualquier otro doc no reserva nada. `00048`, `00049`, `00052` y `00055` son huecos: no se rellenan |
| Crons | Los 5 en `vercel.json`, corriendo. `birthday` 18:00 y `reactivation` 20:00 UTC (= 13:00/15:00 Bogotá), verificado. ⚠️ **`reward-reminder` sigue en 16:00 UTC (11:00 Bogotá)**; la auditoría estimó ≈21:00 UTC. **Decisión del dueño** |
| n8n | Apagado. `domicilios_whatsapp_v4.json` sigue en el VPS pero ya no dispara |
| AIOS (`Level 2.0/aios-constelarys`) | `main` pusheado el 07 en `c962f27` (v1.5.2) y **desplegado**. ⚠️ `/salud` sale ENTERO EN GRIS hasta que corra la `00053` |
| Grafo | Hook post-commit instalado el 07 (`graphify hook status`): se actualiza solo en cada commit. ⚠️ 169 comunidades renombradas por su hub: `graphify label` las refresca (cuesta LLM, no se corrió) |
| Deadline | ~2026-09-10 — onboarding de los 25 clientes de Zernio |

## 2. En vuelo ahora mismo

> **Es el TABLERO.** Una fila por sesión viva, anotada y commiteada sola ANTES de tocar nada; se borra al cerrar.
> Dos filas no comparten archivo. La migración escrita acá es su ÚNICA reserva. Regla: `CLAUDE.md` § "modo simple".

| Sesión (qué, quién, cuándo) | Modelo | Archivos / carpetas que toca | Migración | Estado |
|---|---|---|---|---|
| _(vacío)_ | | | | |

## 3. Siguiente, en orden

1. 🔴🔴 **Correr las CINCO migraciones en Supabase producción. Es lo único urgente y no admite espera:**
   el código salió antes que el esquema. En el SQL Editor, el archivo completo, uno detrás del otro:
   **`00047`** (sin ella, guardar en `/dashboard/marca` y subir el logo fallan) →
   **`00050`** (sin ella, crear un evento da 42703) →
   **`00051`** (dominio cruzado; ⚠️ **puede ABORTAR sola** si un host apunta a dos marcas: NO se
   fuerza, se resuelve a quién pertenece cada host y las otras cuatro corren igual) →
   **`00053`** (sin ella el tablero del AIOS sale en gris y Domicilios dice "todavía no se está guardando") →
   **`00054`** (sin ella Conexiones responde **403**, que parece permisos y no lo es).
   La `00051` y la `00054` traen autoverificación: si algo queda a medias abortan con `FALTA: …`.
   **Lo visual (tarjeta, check-in, panel) no depende de ninguna: eso salió sano.**
1.bis 🔴 **Multi-sede (F8): ESCRITO en las dos ramas, falta correrlo y desplegarlo.** Ya no es trabajo,
   es despliegue. **La `00056` va con las otras cinco** (después de la `00054`), y el **orden entre repos no
   es negociable**: `00056` en Supabase del producto → `00007` en el Supabase del AIOS → recién ahí desplegar
   el AIOS v1.6.0. Al revés, `aios_add_location` no existe y el enganche de la sede 2 responde «falta aplicar
   la migración 00056». Ramas: `feat/multisede-aios` en los dos repos, **sin mergear ni pushear**.
   La decisión (opción B, del dueño) está en `Level 2.0/aios-constelarys/docs/DECISION-MULTISEDE-2026-09-07.md`:
   el `tenant_slug` se queda en la sede y las sedes de una marca lo repiten, porque **un propietario puede
   tener varias marcas** y `clients` es una sola fila. **La marca no es una tabla: es el `tenant_slug`.**
   ⚠️ **Tepuy no se da de alta hasta que esto esté corrido y desplegado** (dueño, 2026-09-07).
2. **Smoke test** del `docs/RUNBOOK-DEPLOY.md` §5 con Sushi Service real, apenas terminen las cinco:
   crear un evento con enlace, abrir Conexiones, y mirar la tarjeta en un celular.
3. **Asignarle sede a los meseros que ya existen.** Todos tienen `location_id` NULL, así que **no aparecen
   en ningún escáner**. Preparado en `SQL-PARA-CORRER/meseros-sin-sede/`; falta la DECISIÓN, persona por persona.
4. **Zernio E2E** con la cuenta ya limpia → desbloquea al primer cliente nuevo bajo coexistencia. Con él va
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
   y `docs/04-deployment.md`.
9. **Aplicar la 00030** en ventana tranquila (cierra el riesgo del DEFAULT puente).
10. **Onboarding de los 25**: wildcard DNS ya resuelto y probado con Sushi Fun.

**El norte — NO se desarrolla todavía** (dueño, 2026-09-05): automatizaciones dentro del restaurante, **Google** para
reseñas y **Meta** para campañas. Ninguna decisión de hoy cierra esa puerta (`tenants.config`, credenciales de terceros).

## 4. Bloqueado: solo lo puede destrabar el dueño

- **Correr la `00047`, `00050`, `00051`, `00053` y `00054`** (§3.1). Son migraciones sobre datos reales.
- **Pushear `main`**, que despliega. Siempre DESPUÉS de las migraciones. La sesión de cierre lo pide con el hash.
- **Borrar las ramas locales ya mergeadas** (`feat/salud-aios`, `feat/domicilios`, `feat/conexiones`, `feat/visual`,
  `preview/capa-visual`) y el **stash** olvidado de `fix/opt-out-visible` (`git stash show -p stash@{0}` para mirarlo).
- **Borrar el Supabase de Sushi Fun.** Esperar a un fin de semana de operación normal. El respaldo son los
  `SQL-PARA-CORRER/sushi-fun/*.sql` (1.421 filas), que **NO cubren** Auth, RLS ni storage. El Vercel viejo queda **pausado**.
- **Las preguntas abiertas de producto** (§18.a–d, §16.a–e, §17.a–d, §15.b, §12, §9): `docs/ESTADO-REQUERIMIENTOS.md`.
- **Separación de una sede** (venta, franquicia, socio distinto) — aplazada por el dueño, 2026-09-02.
- Decisiones ya CERRADAS que no se reabren: **D6** (N líneas por marca, la sede no obliga a ninguna; `multi-sede.md` §5) ·
  **D21** (un subdominio por sede, todas pares; con 2+ sedes el dominio RAÍZ deja de registrar, 409; `multi-sede.md` §3.5).

## 5. Hecho reciente

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
