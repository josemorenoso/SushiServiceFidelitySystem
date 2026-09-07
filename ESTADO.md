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
| Base de datos de producción | Aplicadas hasta la **00046**. 🔴 **La `00047` (identidad visual) está SIN APLICAR y su código YA ESTÁ DESPLEGADO** — ver §3.1. Detrás van la **00050** (enlace del evento), la **00053** (salud) y la **00054** (Conexiones), las tres escritas y sin aplicar, con su código sin desplegar. La 00030 NUNCA aplicada (a propósito). La 00015 NO se aplica (reabre fuga) |
| Crons | Los 5 en `vercel.json`, corriendo. `birthday` 18:00 y `reactivation` 20:00 UTC (= 13:00/15:00 Bogotá), verificado. ⚠️ **`reward-reminder` sigue en 16:00 UTC (11:00 Bogotá)**: de los 3 del ROJO 1 se corrigieron 2. Su hora real no se pudo confirmar por retención de logs; la auditoría la estimó ≈21:00 UTC. **Decisión del dueño** |
| n8n | Apagado. `domicilios_whatsapp_v4.json` sigue en el VPS pero ya no dispara |
| Grafo | Al día sobre `7d5257c` (2026-09-07): 4.799 nodos, 8.365 aristas, 441 comunidades. ⚠️ Las comunidades cambiaron: los nombres se refrescan con `graphify label` (cuesta LLM) |
| Deadline | ~2026-09-10 — onboarding de los 25 clientes de Zernio |

## 2. En vuelo ahora mismo

**Capa visual v3 CERRADA en `feat/visual`** (worktree `.worktrees/visual`), **sin mergear ni
pushear** (2026-09-07 03:00): `e33daaa` · `54327f4` · `549168b` · `99508d2` · `0fed8f0` · `b75b198`.
Sale del `Kit Visual Cada1` del dueño (21st.dev). **Solo pinta: ni una regla de negocio, ni una
migración, ni un endpoint.** `tsc` limpio · build OK (76 páginas) · vitest 25/418 (los de `main`;
no incluye los tuyos) · eslint con sus 7 errores preexistentes.
Tocó: `features/wallet/*`, `features/check-in/*`, `ui/` (odómetro, shine-border, confeti, medalla),
`dashboard/MetricsCards.tsx` + `MiniSparkline.tsx`, `constants/wallet-card-theme.ts` +
`tier-medal-theme.ts`, `app/(public)/{tarjeta,check-in}` y `globals.css` **solo agregando al final**.
✅ **`DashboardSidebar.tsx` quedó intacto**, como estaba anotado: es de `-08` y `-86`.
⚠️ Al mergear, **§2 de este archivo choca**: las ramas del 07 metieron su línea en el mismo sitio.
Es conflicto de tablero, no de código. Y el grafo de `feat/visual` no está indexado (`graphify-out/`
vive en este checkout, que está en `feat/conexiones`): se corre al mergear.

**Lo demás, nada en vuelo.** QR Studio y plantillas cerraron en `main`, **sin pushear**: lo decide el dueño.

**Conexiones (C1 + C2) CERRADO en `feat/conexiones`, sin mergear** (2026-09-07): `ce5d249` y
`23e1a56`. `tsc` limpio · lint sin errores nuevos · **29 archivos / 468 tests en verde** · `build` OK.
🔴 **No se mergea ni se despliega hasta correr la `00054` en Supabase**: sin ella PostgREST da
42703 y la ruta responde **403**, que parece permisos y no lo es. → `docs/features/conexiones.md`.

📌 **Esta sección es el TABLERO.** Anotá tu territorio ANTES de escribir y commiteá esa línea sola;
si se cruza con una ya anotada, esperá. Al cerrar, borrala. Regla completa (incluido por qué `stash`
y `reset --hard` están prohibidos con otra sesión viva) en `CLAUDE.md` § "Trabajar en paralelo".

**Repo del AIOS**: `fix/coexistencia` (v1.4.0) subida y ahora **`feat/salud` (v1.5.0)** con el
tablero de salud, **sin mergear ni pushear**. Su `main` tampoco se pusheó — pushearlo despliega el
AIOS y es decisión del dueño. Parte en `…/docs/PARTE-COEXISTENCIA-2026-09-06.md`.
En ESTE repo, el trabajo del producto que lo alimenta vive en **`feat/salud-aios`** (la 00053),
también sin mergear: va detrás de `feat/conexiones`, que estaba antes.

## 3. Siguiente, en orden

1. 🔴 **Correr la `00047` en Supabase producción.** Es lo único urgente. Su código ya está vivo:
   sin ella, guardar en `/dashboard/marca` y subir el logo fallan. **Nada de lo anterior se rompe**
   —`--brand-primary` tiene su literal en `:root`— pero la feature nueva no funciona.
   Archivo: `supabase/migrations/00047_identidad_visual.sql`. Detrás van, cada una **antes** de
   desplegar su código: la **`00050`** (enlace del evento; si no, crear un evento da 42703), la
   **`00053`** (salud; sin ella el tablero del AIOS sale entero en gris) y la **`00054`**
   (Conexiones; sin ella la pantalla responde **403**, que parece permisos y no lo es). Viven en
   `feat/salud-aios` y `feat/conexiones`, sin mergear.
2. **Asignarle sede a los meseros que ya existen.** Todos tienen `location_id` NULL, así que **no
   aparecen en ningún escáner**: es lo que más se nota en la operación diaria. El trabajo está
   preparado en `SQL-PARA-CORRER/meseros-sin-sede/`; falta la DECISIÓN, persona por persona.
3. **Zernio E2E** con la cuenta ya limpia → desbloquea al primer cliente nuevo bajo
   coexistencia, y con él el onboarding de los 25 (wildcard DNS ya probado con Sushi Fun).
   Va con **`ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL`** = `…/event-media/5103017800669793459.jpg` en
   Vercel: sin ella las 2 de calendario salen bloqueadas, con el motivo escrito. El HEIC del
   bucket **no sirve** — Meta solo acepta JPEG/PNG.
4. **Responder §18.a–d** (`docs/DECISION-18-DOMICILIOS-COEXISTENCIA.md`): las últimas preguntas que
   bloquean el onboarding.
5. **De `docs/AUDITORIA-POST-DEPLOY-2026-09-06.md`** queda vivo el AMARILLO de
   `reward-reminder` (fila de Crons). El ROJO 3 lo cerró la 00053. Siguen stale
   `docs/ESTADO-REQUERIMIENTOS.md` y `docs/04-deployment.md`.
6. **Aplicar la 00030** en ventana tranquila (cierra el riesgo del DEFAULT puente).

**El norte, para tenerlo en cuenta al diseñar — NO se desarrolla todavía** (dueño, 2026-09-05): el
producto va hacia **automatizaciones dentro del restaurante**: conectar **Google** para responder
reseñas y **Meta** para campañas. Se anota para que ninguna decisión de hoy cierre esa puerta (sobre
todo en `tenants.config` y en cómo se guardan credenciales de terceros).

## 4. Bloqueado: solo lo puede destrabar el dueño

- **Correr la `00047`, la `00050`, la `00053` y la `00054`** (§3.1). Son migraciones sobre datos reales.
- **Pushear `main` del AIOS**, que lo despliega (§2).
- **Borrar el Supabase de Sushi Fun.** Se acordó esperar a un fin de semana de operación normal. El
  respaldo son los `SQL-PARA-CORRER/sushi-fun/*.sql` (1.421 filas), que **NO cubren** Auth, RLS ni
  storage. El Vercel viejo queda **pausado, no borrado**.
- **Las preguntas abiertas de producto** (§18.a–d, §16.a–e, §17.a–d, §15.b, §12, §9):
  la lista completa está en `docs/ESTADO-REQUERIMIENTOS.md`.
- **D6 RE-CERRADA — un número por marca, compartido** (2026-09-07): dos números son dos WABA, y
  eso arrastra plantillas duplicadas (24-72 h de aprobación cada una), cupo por línea y el
  entrante resuelto por dos cuentas. La 00048 `location_messaging` **sigue reservada y sin usar**.
  La plantilla es de la MARCA; la sede viaja en las variables. → `conexiones.md` §4.0.
- **Separación de una sede** (venta, franquicia, socio distinto) — aplazada por el dueño, 2026-09-02.
- **D21 CERRADA — un subdominio por sede** (2026-09-06): la ciudad va en el subdominio desde el
  principio y **todas las sedes son pares** (`laureles.marca.com`). No es opcional: con 2+ sedes el
  dominio RAÍZ deja de registrar clientes nuevos (409), así que una sede sin `domain` mata el
  registro. → `multi-sede.md` §3.5.

## 5. Hecho reciente

- **Conexiones: el cliente ve por qué número sale su WhatsApp, y da el alta él** (2026-09-07,
  **00054 sin aplicar, sin desplegar**): no tenía NINGUNA pantalla, y el alta se cerraba
  dictándole el `code` de Meta al operador. Tapaba dos cosas rotas: el `redirect_url` iba a
  `/api/webhook/zernio`, que solo exporta POST y le da **405** a un navegador; y
  `verification_required` —donde el alta se traba en silencio— no lo miraba nadie. El nonce del
  signup es NUESTRO: el `state` de Zernio no identifica al tenant. → `docs/features/conexiones.md`.
- **Salud por cliente en el AIOS** (2026-09-07, §24-A, **sin desplegar**): no existía ninguna
  señal de que un cliente se hubiera roto — nos enterábamos cuando llamaba. `/salud` pone las
  sedes con cuatro bombillos, ordenadas por gravedad. **Gris no es verde**, el umbral del
  silencio sale del historial de CADA marca, y los crons van aparte porque corren una vez para
  las 25. Los umbrales viven en el AIOS: afinar uno no puede costar una migración.
- **Un domicilio perdido deja rastro** (2026-09-07, ROJO 3, **sin desplegar**): `delivery_intake_
  failures` (00053). El INSERT va dentro de `logDeliveryIntakeFailure()`, que pasa a `async`. Sin
  esa tabla, "llegaron tres pedidos y se perdieron" y "hoy no pidió nadie" eran el mismo dato.
- **Plantillas: enviar tal cual o editar** (2026-09-07): un alta nueva dejaba las 13 vacías y el único
  camino masivo solo se abría al CAMBIAR de estilo — con el default `calido`, 13 ediciones a mano. Cada
  fila tiene ya «Enviar a Meta» (texto del catálogo, sin casilla: no lo escribió el dueño) y «Editar».
- **Enlace del evento** (2026-09-06): `link_url` (00050, **sin aplicar**) va dentro de `{{5}}` para no
  re-aprobar en las 25. Imagen de la master **approved**; **Sushi Fun no la tiene**; video **rejected**.
- **Sushi Fun absorbido como tenant** (2026-09-06): 1.421 filas, cero cruces, las otras 4 intactas.
  Conserva **su cuenta de Twilio**. Pendientes: su Supabase y su Vercel (§4).
- Lo anterior a esto (§19, F7/F4/F3, identidad visual) está desplegado y vive en `CHANGELOG.md`.

## 6. Deudas y límites conocidos

**Multi-sede** — las 12 deudas abiertas (D1, D3–D5, D7–D9, D12, D13, D15, D17) están listadas una
por una en `docs/features/multi-sede.md`. Las que muerden hoy: **D9** el 409 de sede no acepta
elección por API, **D12** campañas masivas con `location_id` NULL (es F6), **D17** las sedes no se
crean desde el producto.

**Las 5 rutas que F7 dejó SIN cablear a propósito** (`send-queue` GET, `check-in-override`,
`campaigns/manual`, `imported-contacts/confirm`, `campaigns/run-auto`): hasta que F6 llene esas
tablas, el filtro de sede ahí es **no-op seguro — fail-closed, no fail-open**.

**De §19**: **D18** el token del aparato es el fingerprint del navegador y es la ÚNICA credencial
del local (el dueño lo aceptó) · **D19** un mesero sin teléfono en dos sedes cuenta como dos ·
**D20** quién activó un aparato solo queda en `device_name` y `trusted_at`.

**Fuera de multi-sede:**
- **00030 sin aplicar**: DEFAULT puente → un INSERT sin `tenant_id` se va calladito a Sushi Service.
  Y **17.b**: "quién es Black" difiere entre la tarjeta (`black-tier.ts`) y el panel (`POWER_RANKS`).
- **El rastro del domicilio perdido está ESCRITO pero no aplicado**: `delivery_intake_failures`
  (00053) todavía no corrió en producción, así que hasta que corra sigue habiendo cero registro.
- **Los webhooks de Conexiones no se han visto llegar.** El header **SÍ está confirmado** desde el
  2026-09-07: es `X-Zernio-Signature` y `verifyZernioSignature()` ya lo lee. Faltan las otras dos —
  que `ZERNIO_WEBHOOK_SECRET` COINCIDA con la Secret Key del panel (hoy el «Send test» recibe
  NUESTRO 401) y suscribir los 6 `whatsapp.number.*` (`registerWebhook()` es idempotente POR URL).
- **Ningún tenant tiene `owner_email`**: `aios_provision_tenant` lo acepta pero es opcional, así
  que hoy Conexiones solo la opera el super-admin. Fail-closed y la pantalla lo dice, pero es una
  llamada por cada alta hasta que el AIOS lo mande.
- **00048 y 00049 están RESERVADAS**, no libres: son de multi-sede (`…/2026-09-02-multisede-design.md`
  §6.3 y §7.2) y las dos dependen de una decisión del dueño. El número se saca con el script.
- **Choques de migración en ramas muertas**: `sushi-sync` (00015) y `port/sushi-fun-2.8` (00028).
- **Catálogo de producto sin empezar** (referidos, push, fatiga, §7, §8, §18): no es deuda
  técnica. Ver `docs/ESTADO-REQUERIMIENTOS.md`.

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
