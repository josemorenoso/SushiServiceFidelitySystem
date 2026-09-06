# ESTADO — RestaurantQR / Cada1

> **Última actualización:** 2026-09-05 (sesión "§19 escáner de meseros", Opus 5)
> Toda sesión lo lee PRIMERO. Toda sesión que cierra un bloque lo ACTUALIZA al final. Límite: 150 líneas.
> Lo obsoleto se **saca**, no se tacha: un ítem tachado sigue costando tokens cada vez que alguien lee esto.
>
> **Sus dos hermanos:**
> - [docs/RUNBOOK-DEPLOY.md](docs/RUNBOOK-DEPLOY.md) — los pasos exactos del despliegue, en orden, verificados contra el código. **Léelo el día del deploy y no improvises fuera de él.**
> - [docs/ESTADO-REQUERIMIENTOS.md](docs/ESTADO-REQUERIMIENTOS.md) — §1–§25 del encargo de producto, auditados contra el código. Ahí vive **qué falta desarrollar** (§18 domicilios bajo coexistencia, §19 escáner de meseros, referidos, push, fatiga, branding).

---

## 1. Foto actual (2026-09-05)

| Qué | Estado |
|-----|--------|
| Código en `main` local | F7 mergeado + migración al método — **24 commits adelante de `origin/main`, SIN pushear** (`git rev-list --count origin/main..main` para el número de hoy) |
| Verificación | ✅ `tsc` limpio · eslint 7 errores (los mismos preexistentes, React hooks) · **vitest 14 archivos / 261 tests en verde** |
| Código en producción | Anterior a TODO: multi-sede F3/F4/F7, §25 F2 y el fix de db-errors |
| Base de datos de producción | Aplicadas hasta la **00043**. ⚠️ **00044 (F4) y 00045 (F7) PENDIENTES** — van antes del deploy. La 00030 NUNCA aplicada (a propósito). La 00015 NO se aplica (reabre fuga) |
| Remoto correcto | `origin` = `SushiServiceFidelitySystem` ✅ (los remotos `fun` y `donalirio` NO son el destino) |
| Red de seguridad | rama `backup/pre-f7-merge` = `53555f0` (estado de `main` justo antes del merge de F7) |
| Método | **Maestro LuisRAI v3** (`METODO_MAESTRO_LUISRAI.md`). El AInnovate v2 está en `docs/archive/` |
| Grafo | 2.252 nodos · 5.198 aristas · 289 comunidades, sobre `4124ea3` (2026-09-05). **49,8x menos tokens por consulta** (~3 k vs ~150 k). `docs/archive/` queda FUERA a propósito. `graphify update .` después de cada commit (AST, sin costo); `graphify extract` solo después de una ola |
| Deadline | ~2026-09-10 — onboarding de los 25 clientes de Zernio |

## 2. En vuelo ahora mismo

**Nada corriendo.** `main` está limpio y con la suite en verde.

⏳ **ESPERANDO DECISIÓN DEL DUEÑO — rama `feat/staff-scanner-19` (worktree `../wt-staff-scanner-19`)**
**§19, el escáner de meseros**, completo y aprobado por el dueño sobre un mockup de las 10
pantallas. El aparato es del LOCAL (un login, una vez, con PIN de supervisor), el mesero se elige
en CADA operación y la lista va filtrada por sede. Sin PIN del mesero: el dueño lo quitó el
2026-09-05 y con él se cayeron 19.e y §19.7. **Verificado**: `tsc` limpio, eslint con los mismos 7
errores preexistentes, **15 archivos / 278 tests** (eran 14/261; +17, ninguno perdido).
⚠️ **La migración `00046` está escrita y SIN APLICAR** — aplicarla la decide el dueño, y va
DESPUÉS de la 00044 y la 00045. Spec: `docs/superpowers/specs/2026-09-05-staff-scanner-19-design.md`.
Un paso manual pendiente al desplegar: **asignarle sede a cada mesero existente** desde el panel
(hoy todos tienen `location_id` NULL y no saldrían en ninguna lista).

⏳ **ESPERANDO DECISIÓN DEL DUEÑO — rama `feat/pulido-visual` (worktree `../wt-pulido-visual`)**
Pulido visual de las pantallas de cara al cliente, commit `206f067`. **Verificado**: solo presentación
(cero cambios en services, API o migraciones), `tsc` limpio, build OK, 261 tests, y **ensayo de merge
sin conflictos** contra `main`. Qué hace: unifica los 5 CTA rojos del mesero con `.btn-premium` del
design system, agranda a 44px 6 objetivos táctiles que estaban en ~36px, hace que toda la tarjeta del
check-in sea el área táctil (antes solo la línea de texto), y agranda la "×" de ciudad. **NO se mergea
hasta que el dueño lo mire** — el detalle por pantalla está en `docs/PULIDO-VISUAL.md` de esa rama.
Para mergear: `git merge --no-ff feat/pulido-visual`.

Limpieza trivial pendiente: `git worktree remove ../wt-f7-permisos` (ya mergeado) · el worktree
`port/sushi-fun-2.8` del scratchpad quedó *prunable* · `git branch -d backup/pre-f7-merge` **solo
después del deploy exitoso**.

## 3. Siguiente, en orden (camino a producción — no saltarse pasos)

1. **← AQUÍ VAS. Features CONGELADAS**, con UNA excepción que ordenó el dueño: **§19 ya está construido** en `feat/staff-scanner-19` (ver §2). No se mergea ni se aplica su migración sin que él lo diga. Fuera de eso, solo pulido visual en bloques chicos (`docs/features/design-system.md`).
2. **Pre-deploy** (micro): confirmar Vercel **Pro** activo (por los crons `*/15`) · `OPENAI_API_KEY` creada en Vercel · `git remote -v` una vez más · push a `origin`.
3. **Migraciones ANTES del código** (micro): aplicar **00044** y luego **00045** en Supabase producción, en ese orden.
4. **Deploy** → smoke test con Sushi Service real: check-in con mesero, tarjeta, panel (incluido el selector de sede nuevo), un domicilio de prueba.
5. **Cutover n8n** (feature): apagar los 5 Schedule Triggers (los crons ya viven en `vercel.json`) → probar domicilios en el producto → apagar el VPS.
6. **Aplicar la 00030** en ventana tranquila (cierra el riesgo del DEFAULT puente).
7. **Onboarding de los 25** (ola): wildcard DNS ya decidido; provisioning por tenant.
8. Después del deploy, en bloques chicos: **mergear §19** y aplicar su `00046`, **17.b**, las deudas
   D1–D5, y el catálogo de producto que prioriza el dueño en `docs/ESTADO-REQUERIMIENTOS.md`
   (**§18** es ahora la que más pesa para vender: §19 ya está hecho).

**El norte, para tenerlo en cuenta al diseñar — NO se desarrolla todavía** (dueño, 2026-09-05):
el producto va hacia **automatizaciones dentro del restaurante**. Dos concretas ya nombradas: que el
restaurante conecte su cuenta de **Google** para responder reseñas automáticamente, y su cuenta de
**Meta** para campañas especiales. Nada de esto se codea ahora; se anota para que ninguna decisión de
hoy cierre esa puerta (sobre todo en `tenants.config` y en cómo se guardan credenciales de terceros).

## 4. Bloqueado: solo lo puede destrabar el dueño

- **Vercel Pro activo** — sin él los dos crons `*/15` de `vercel.json` hacen fallar el build.
- **`OPENAI_API_KEY` en Vercel** — sin ella §25 Fase 2 (domicilios dentro del producto) no se activa.
- **Aplicar 00044 y 00045** en Supabase producción — es una migración sobre datos reales.
- **Mirar `feat/pulido-visual`** en el navegador y decidir si se mergea.
- **Las preguntas abiertas de producto** (§18.a–d, §16.a–e, §17.a–d, §3, §15.b, §12, §5, §9):
  la lista completa está en `docs/ESTADO-REQUERIMIENTOS.md`. Ninguna bloquea el deploy; todas bloquean
  el trabajo que venga después. **§19 ya no está acá**: el dueño cerró su modelo el 2026-09-05, sus
  cinco preguntas se resolvieron en el spec y la feature está construida.
- **Mirar `feat/staff-scanner-19`** y decidir si se mergea, y **cuándo se aplica la `00046`**.
- **D6 CERRADA** (2026-09-05): la línea de WhatsApp es **N líneas por marca y la sede no obliga a
  ninguna** — se elige al enviar. En la práctica, una sola para todas. El eje es el cupo (calentar una
  línea nueva), no la geografía. Detalle en `docs/features/multi-sede.md` §5, deuda 6.bis.
- **Separación de una sede** (venta, franquicia, socio distinto) — aplazada por el dueño, 2026-09-02.

## 5. Hecho reciente

- **§19 — el escáner de meseros** (2026-09-05, sin mergear): invertido el modelo del aparato. `staff_users.phone` pasa a NULLABLE y la llave de identidad (19.f) se **complementa** en vez de reemplazarse: el UNIQUE de teléfono se conserva y se le suman un CHECK de identidad mínima y un UNIQUE parcial `(marca, sede, nombre)`. Nuevas `GET /api/staff/waiters` y `/locations`; eliminada `POST /api/staff/login`. `resolveStaffAuth` deja de atribuir desde la sesión.
- **Migración al Método Maestro v3** (2026-09-05): `ESTADO.md` a la raíz, `CLAUDE.md` de 161 a **78 líneas** sin perder una sola trampa, borradas las 5 copias de reglas por IDE, `AGENTS.md` y README reales. Grafo completado (le faltaban 145 archivos de la corrida que se cortó) y `docs/archive/` sacado de su alcance: devolvía docs obsoletos mezclados con el código vivo. Nada se borró: lo viejo está en `docs/archive/`.
- **`ec46d47` / F7**: permisos por sede (D10) y selector del panel. Migración `00045` (tabla `dashboard_user_locations`, 3 helpers SECURITY DEFINER, trigger que estampa `role='brand'` al nacer la 2ª sede, policies RESTRICTIVE autodescubiertas por catálogo). Tipo opaco `LocationScope` con `requireLocationScope()` como única fábrica; ~9 rutas pasan de `(tenantId)` a `(scope)`. Selector en `DashboardHeader` vía `LocationScopeContext` (localStorage, NO la URL). **D16 cerrada.** De paso arregló un hueco del arnés de tests (`bootstrap.sql` no daba `USAGE ON SCHEMA auth` a `authenticated`).
- **`53555f0` + los 19 de `dashboard/**`**: cerrado el patrón "error de Supabase indistinguible de vacío" en todo el código. Nuevo helper `src/lib/db-failure.ts`.
- **v2.12.1 / §25 Fase 2**: los domicilios salen de n8n y entran al producto (OpenAI dentro de Vercel). El webhook n8n queda de cáscara; `domicilios_whatsapp_v4.json` sigue ACTIVO en el VPS hasta el cutover.
- **v2.12.0 / F4**: el mesero es de UNA sede (D11). ⚠️ La 00044 va aplicada ANTES del deploy — al revés, TODOS los meseros reciben 403.
- **v2.11.0 / F3**: el check-in averigua y escribe la sede (mesero → dominio → nada); geocerca muerta eliminada.
- **v2.10.0 / F1+F2**: `restaurant_locations` ES la sede; 18 columnas de sede en 13 tablas de hechos (00041–00043; la 00043 sí está aplicada en prod).
- **Auditoría 00030**: el DEFAULT puente a Sushi Service sigue vivo en 18 tablas; hoy no rompe nada (100% de INSERTs auditados pasan `tenant_id` explícito) pero no hay red de seguridad.

## 6. Deudas y límites conocidos

**Multi-sede** (detalle en `docs/features/multi-sede.md`): **D1** `config` sin whitelist de claves ·
**D2** trigger cruzado de una sola dirección · **D3** `is_primary` sin UNIQUE por tenant · **D4**
diagrama ER de DB_SCHEMA obsoleto · **D5** conteo de migraciones desactualizado en comentarios ·
**D7** premios sin precio → matriz D12 solo en conteos · **D8** adopción de histórico irreversible
(solo con orden explícita) · **D9** el 409 de sede no acepta elección por API · **D12** campañas
masivas con `location_id` NULL (es F6) · **D13** 5 columnas de sede aún vacías · **D15** FK simple en
`staff_devices.staff_user_id` (mitigada con trigger) · **D17** las sedes no se crean ni se editan
desde el producto (es F8, wizard AIOS).

**Rutas que F7 dejó SIN cablear a propósito** (razón en el código y en `docs/features/multi-sede.md`
§3.quater): `send-queue` GET, `check-in-override`, `campaigns/manual`, `imported-contacts/confirm`,
`campaigns/run-auto`. Hasta que F6 llene `reward_grants`/`reward_redemptions`/`campaigns`, el filtro de
sede en esas tablas es un **no-op seguro (fail-closed, no fail-open)**.

**De §19** (detalle en el spec `2026-09-05-staff-scanner-19-design.md` §10): **D18** el token
del aparato es el fingerprint del navegador, y con §19 pasa a ser la ÚNICA credencial del local —
el dueño decidió dejarlo así · **D19** un mesero sin teléfono dado de alta en dos sedes cuenta como
dos meseros y su métrica se parte; la base ya no puede saber que son la misma persona · **D20**
quién activó un aparato deja de quedar en `staff_user_id`, solo en `device_name` y `trusted_at`.
⚠️ **Un mesero en DOS sedes sería caro**: choca con D11, que vive en la FK compuesta, en el trigger
de la 00044 y en el índice nuevo. Si el dueño lo pide, cambiar la llave es barato ANTES de aplicar
la 00046 y caro después.

**Fuera de multi-sede:**
- **00030 sin aplicar**: DEFAULT puente → un INSERT sin `tenant_id` se va calladito a Sushi Service.
- **17.b**: "quién es Black" difiere entre la tarjeta (`black-tier.ts`) y el panel (`POWER_RANKS`, 10+ visitas).
- **§25 Fase 1**: los crons ya están en `vercel.json`, pero los dos `*/15` rompen el build sin Pro, y cron en Vercel + Schedule Trigger n8n a la vez = doble disparo.
- **§25 Fase 3** diferida: Google Contacts OAuth propio (opcional).
- **Catálogo de producto sin empezar**: 7 de 20 secciones auditadas (referidos, push, fatiga, branding, §19…). No son deuda técnica: es catálogo. Ver `docs/ESTADO-REQUERIMIENTOS.md`.

## 7. Reglas de esta casa

- **Una sesión pesada a la vez** por territorio. Paralelo solo con territorios disjuntos, cada uno en su worktree y declarado en §2.
- **Cerrar las sesiones viejas.** Cada mensaje re-factura todo el historial: preguntar en una sesión de 18 h cuesta muchísimo más que abrir una nueva que lea este doc.
- **El grafo antes que el grep**: `graphify query "…"` cuesta 1-2 k tokens; leer "los archivos relevantes" cuesta 30-80 k.
- **Modelo por defecto para implementar: Sonnet.** Fable/Opus solo para diseño, merges delicados o la revisión final de una ola. Haiku para auditorías, inventarios y el grafo.
- **Ultracode y los workflows multi-agente: apagados** salvo para una auditoría puntual.
- **Prompts con alcance cerrado**: tarea · guardrails · criterio de término. Nada de "revisá todo el repo".
- Toda sesión termina actualizando ESTE doc + `CHANGELOG.md` (≤15 líneas) + `graphify update .`.
