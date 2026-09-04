# ESTADO DEL PROYECTO — fuente única de verdad entre sesiones

> **Última actualización:** 2026-09-04 (merge de F7 a `main` + verificación completa)
> **Cómo usar este doc:** toda sesión nueva lo lee PRIMERO (antes de releer el repo entero).
> Toda sesión que cierre un bloque lo ACTUALIZA al final (foto, en-vuelo, deudas, checklist).
> Es el mecanismo anti-pérdida-de-detalles entre conversaciones — y el ahorro de tokens más barato que existe.
>
> **Sus dos documentos hermanos:**
> - [RUNBOOK-DEPLOY.md](RUNBOOK-DEPLOY.md) — los pasos exactos del despliegue, en orden, verificados contra el código. **Léelo el día del deploy y no improvises fuera de él.**
> - [ESTADO-REQUERIMIENTOS.md](ESTADO-REQUERIMIENTOS.md) — el estado real de §1–§25 del encargo de producto (auditado contra el código, no contra el requerimiento). Ahí vive §19 (escáner de meseros) y §18 (domicilios bajo coexistencia).

---

## 1. Foto actual (2026-09-04)

| Qué | Estado |
|-----|--------|
| Código en `main` local | F7 mergeado (`ec46d47`) — **17 commits adelante de `origin/main`, SIN pushear** |
| Verificación sobre el merge | ✅ `tsc` limpio · eslint 7 errores (los mismos preexistentes, React hooks) · `npm run build` OK · **vitest 14 archivos / 261 tests en verde** (= 200 base + 22 de db-errors + 39 de F7: no se perdió ni un test en el merge) |
| Código en producción | Anterior a TODO: multi-sede F3/F4/F7, §25 F2 y el fix de db-errors |
| Base de datos de producción | Aplicadas hasta la **00043**. ⚠️ **00044 (F4) y 00045 (F7) PENDIENTES** — van antes del deploy. La 00030 NUNCA aplicada (a propósito). La 00015 NO se aplica (reabre fuga) |
| Remoto correcto | `origin` = `SushiServiceFidelitySystem` ✅ (los remotos `fun` y `donalirio` NO son el destino) |
| Red de seguridad | rama `backup/pre-f7-merge` = `53555f0` (estado de `main` justo antes del merge de F7) |
| Deadline | ~2026-09-10 — onboarding de los 25 clientes de Zernio |

## 2. En vuelo AHORA MISMO

**Nada.** Las dos sesiones paralelas (db-errors y F7) cerraron y están mergeadas en `main`. El árbol está limpio.

Limpieza pendiente (trivial, cuando se quiera):
- `git worktree remove ../wt-f7-permisos` — ya mergeado, no hace falta.
- Worktree `port/sushi-fun-2.8` en el scratchpad — verificar si sigue vivo o se descarta.
- `git branch -d backup/pre-f7-merge` — solo después del deploy exitoso, no antes.

## 3. Hecho y mergeado en `main` local (nada en producción todavía)

- **v2.10.0 / F1+F2**: `restaurant_locations` ES la sede; 18 columnas de sede en 13 tablas de hechos (00041–00043; la 00043 sí está aplicada en prod).
- **v2.11.0 / F3**: el check-in averigua y escribe la sede (mesero → dominio → nada); geocerca muerta eliminada.
- **Auditoría 00030**: el DEFAULT puente a Sushi Service sigue vivo en 18 tablas; hoy no rompe nada (100% de INSERTs auditados pasan `tenant_id` explícito) pero no hay red de seguridad. Documentada, NO aplicada.
- **v2.12.0 / F4**: el mesero es de UNA sede (D11). ⚠️ La 00044 va aplicada en Supabase ANTES del deploy — al revés, TODOS los meseros reciben 403.
- **v2.12.1 / §25 Fase 2**: los domicilios salen de n8n y entran al producto (OpenAI dentro de Vercel). El webhook n8n queda de cáscara; `domicilios_whatsapp_v4.json` sigue ACTIVO en el VPS hasta el cutover.
- **`53555f0` / fix db-errors**: cierra el patrón "error de Supabase indistinguible de vacío" en auth del mesero (tier 1) y en las escrituras/plata (tier 2: settings, points, mystery-box, campaign, wallet, customer, redemption, reward-grant, send-queue, template, calendar, imported-contacts). Nuevo helper `src/lib/db-failure.ts`. `review.service.ts` ya estaba bien, sin cambios.
- **`1b0bc57` + `ec46d47` / F7**: permisos por sede (D10) y selector del panel. Migración `00045_permisos_por_sede.sql` (tabla `dashboard_user_locations`, 3 helpers SECURITY DEFINER, trigger que estampa `role='brand'` al nacer la 2ª sede, policies RESTRICTIVE autodescubiertas por catálogo). Tipo opaco `LocationScope` con `requireLocationScope()` como única fábrica; ~9 rutas pasan de `(tenantId)` a `(scope)`. `getFullAnalytics`/`getDashboardMetrics` partidos en `{ brand, location }`. Selector en `DashboardHeader` vía `LocationScopeContext` (localStorage, NO la URL — evita el CSR bailout de `useSearchParams()`). **D16 cerrada.** De paso arregló un hueco real del arnés de tests (`bootstrap.sql` no daba `USAGE ON SCHEMA auth` a `authenticated`).
- **Conflicto del merge** (único): `src/services/send-queue.service.ts` en `cancelQueueItemForTenant()`. Resuelto conservando la guarda de error de db-errors montada sobre la estructura `LocationScope` de F7 (`existsBase` + `applyLocationFilter`, con `error: existenteError` destructurado y `scope.tenantId` en el log).

## 4. Deudas abiertas (no se cierran solas)

Multi-sede (detalle en `docs/features/multi-sede.md`):
- **D1** `config` sin whitelist de claves · **D2** trigger cruzado de una sola dirección · **D3** `is_primary` sin UNIQUE por tenant · **D4** diagrama ER de DB_SCHEMA obsoleto · **D5** conteo de migraciones desactualizado en comentarios · **D6** separación de una sede (aplazada por dueño) · **D7** premios sin precio → matriz D12 solo en conteos · **D8** adopción de histórico irreversible (solo con orden explícita) · **D9** el 409 de sede no acepta elección por API · **D12** campañas masivas con `location_id` NULL (es F6) · **D13** 5 columnas de sede aún vacías · **D15** FK simple en `staff_devices.staff_user_id` (mitigada con trigger) · **D17** las sedes no se crean/editan desde el producto (es F8, wizard AIOS).
- ~~D16~~ **cerrada por F7**: `/dashboard/staff` ya dibuja el `<select>` de sede que la API aceptaba desde F4.

**Rutas que F7 dejó SIN cablear a propósito** (razón en el código y en `docs/features/multi-sede.md` §3.quater): `send-queue` GET, `check-in-override`, `campaigns/manual`, `imported-contacts/confirm`, `campaigns/run-auto` — o pisaban terreno de F5/F6, o el patrón de degradación existente no tenía equivalente limpio en `requireLocationScope()`. Hasta que F6 llene `reward_grants`/`reward_redemptions`/`campaigns`, el filtro de sede en esas tablas es un **no-op seguro (fail-closed, no fail-open)**.

**Sitios shape-1 en `dashboard/**` — 19, CERRADOS** (sesión 2026-09-04 02:00, ver CHANGELOG.md).
Eran `const { data } = await supabase...` sin destructurar `error`: mismo patrón del bug ya
cerrado en el resto del código en `53555f0`. Los 19 se arreglaron con el mismo helper
(`src/lib/db-failure.ts`), sin excepciones — ninguno resultó falso positivo:
- ~~`src/app/api/dashboard/authorized-numbers/route.ts:56`~~ — dup-check antes del INSERT.
- ~~`src/app/api/dashboard/settings/route.ts:54`~~ — dup-check antes del UPDATE/INSERT.
- ~~`src/app/api/dashboard/reward-tiers/route.ts:70,105,118,186,272`~~ — dup-checks de umbral/Black y lectura de tier.
- ~~`src/app/api/dashboard/rewards/route.ts:65,88`~~ — dup-checks de recompensa/Black.
- ~~`src/app/api/dashboard/customers/[id]/next-reward/route.ts:25,34`~~ — lectura de cliente y siguiente tier.
- ~~`src/app/api/dashboard/staff/route.ts:66`~~ — lectura de `staff_devices` (lista del panel).
- ~~`src/app/api/dashboard/staff/device/route.ts:65`~~ — lectura de un dispositivo puntual.
- ~~`src/app/api/dashboard/campaigns/efficiency/route.ts:66,79,86`~~ — mensajes/visitas/settings para la métrica.
- ~~`src/app/api/dashboard/campaigns/manual/route.ts:129`~~ — lectura de audiencia antes de enviar (además deshace la campaña fantasma si falla).
- ~~`src/app/api/dashboard/twilio-metrics/route.ts:217`~~ — lectura de `customers` para el reporte (enriquecimiento opcional: se registra pero no tumba el reporte).
- ~~`src/app/api/dashboard/imported-contacts/route.ts:38`~~ — no era falso positivo: el `error` de esa query no se miraba en ningún otro sitio del archivo.

No incluido (ya arreglado antes, sin relación con esta lista): `src/app/api/dashboard/location/route.ts` — comentario de cabecera documentando que este bug exacto se arregló ahí en F4.

Fuera de multi-sede:
- **00030 sin aplicar**: DEFAULT puente → un INSERT sin `tenant_id` se va calladito a Sushi Service. Decidir ventana (la auditoría ya confirmó que hoy es seguro aplicarla).
- **17.b**: "quién es Black" difiere entre la tarjeta (`black-tier.ts`) y el dashboard (`POWER_RANKS`, 10+ visitas).
- **§25 Fase 1**: crons escritos en `vercel.json` pero ⚠️ los dos `*/15` ROMPEN el build en plan Hobby — no pushear sin Vercel Pro activo; y cron en Vercel + Schedule Trigger n8n activos a la vez = doble disparo.
- **§25 Fase 2 pendiente de activar**: crear `OPENAI_API_KEY` en Vercel → deploy → prueba real → apagar VPS.
- **§25 Fase 3** diferida: Google Contacts OAuth propio (opcional).

## 5. Camino a producción (en ORDEN — no saltarse pasos)

1. ~~Aterrizar sesión db-errors~~ ✅ `53555f0`
2. ~~Aterrizar F7 y mergear~~ ✅ `ec46d47`
3. ~~Suite completa sobre `main` mergeado~~ ✅ tsc / eslint / build / 261 tests
4. **← AQUÍ VAS. CONGELAR features.** Solo pulido visual en bloques chicos y baratos (tarjeta, dashboard, mesero — con `docs/features/design-system.md`). Nada de features nuevas hasta después del deploy.
5. **Pre-deploy**: confirmar Vercel **Pro** activo (por los crons `*/15`) · `OPENAI_API_KEY` creada en Vercel · `git remote -v` una vez más · push a `origin` (SushiServiceFidelitySystem).
6. **Migraciones ANTES del código**: aplicar **00044** y luego **00045** en Supabase producción, en ese orden, ANTES de que el deploy del código las necesite.
7. **Deploy** → smoke test con Sushi Service real: check-in con mesero, tarjeta, panel (incluido el selector de sede nuevo), un domicilio de prueba.
8. **Cutover n8n**: apagar los 5 Schedule Triggers (los crons ya viven en Vercel) → probar domicilios en el producto → apagar VPS.
9. **Aplicar 00030** en ventana tranquila (cierra el riesgo del DEFAULT puente).
10. **Onboarding de los 25** (wildcard DNS ya decidido; provisioning por tenant).

Después del deploy, en bloques chicos: 17.b y las deudas D1–D5. (Los 19 shape-1 del panel se cerraron el 2026-09-04, ver §4.)

## 6. Reglas de trabajo (ahorro de tokens y de sustos)

- **Una sesión pesada a la vez** sobre el mismo territorio. Paralelo solo con territorios disjuntos y declarados en §2.
- **Cerrar las sesiones viejas.** Una sesión de 18 h acumula un contexto enorme y **cada mensaje re-factura todo ese historial**: preguntar en una sesión vieja cuesta muchísimo más que abrir una nueva que lea este doc.
- **Ultracode APAGADO** para el día a día. Workflows multi-agente solo para la auditoría única pre-lanzamiento, con modelos baratos.
- **Modelo por defecto para implementar: Sonnet** (`/model sonnet`). Fable/Opus solo para decisiones de diseño, merges delicados o revisión final.
- **Prompts con alcance cerrado**: nombrar archivos, nombrar el doc a actualizar, definir "terminado". Nada de "revisa todo el repo".
- Toda sesión termina actualizando ESTE doc + CHANGELOG.
