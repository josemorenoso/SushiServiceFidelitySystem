# Auditoría — qué falta para escalar a 1000 clientes (producto + AIOS) — 2026-09-28

> **Encargo del dueño:** *«Tengo este software y el Cada1 AIOS, que es desde donde creo y cargo nuevos clientes:
> audita y dime qué me hace falta para que sea mejor, más fácil de implementar, de rastrear, para escalar a 1000
> clientes»*, con el Método Maestro LuisRAI v3.1.
>
> **Cómo se hizo (método §9, plantilla «Una auditoría»):** solo lectura del producto (`feat/multisede-aios` en
> `9ca5ac1`) y del AIOS (`aios-constelarys` en `c7e6dd5`, v1.13.1). Seis auditores Sonnet, uno por frente (alta ·
> rastreo · escala · aislamiento · operación · proceso), con salida fija y `ruta:línea`; tres refutadores Sonnet que
> abrieron cada evidencia para intentar tumbarla, y una revisión Opus directa de los dos hallazgos críticos (AISLA-1 y
> AISLA-2), del barrido de funciones `SECURITY DEFINER` y de `.mcp.json` (con los valores enmascarados). **No se
> corrigió nada. No se tocó producción**: el MCP de Supabase no estaba autorizado, así que todo lo que depende de la
> base real dice «no verificable». `graphify` no se pudo usar: `graphify.exe` lo bloquea el Control de aplicaciones de
> Windows (ver PROC-10).
>
> **Veredictos:** ✅ CONFIRMADO · ✏️ CORREGIDO (existe, pero el alcance o la severidad cambian) · ❌ REFUTADO ·
> 👁️ verificado por Opus (doc, diseño o hallazgo propio). **68 hallazgos únicos: 49 ✅ · 12 ✏️ · 1 ❌ · 6 👁️.**

---

## 0. En una pantalla

**El código está sano para 5-25 marcas; lo que no llega a 1000 es la operación.** El aislamiento de las escrituras es
bueno (ningún INSERT de `src/` olvida el `tenant_id`), los pasos del alta son idempotentes y la documentación es
honesta. Pero:

| Qué | El número | De dónde sale |
|---|---|---|
| Dar de alta una marca | **~17 acciones del operador + 2 traspasos a mano + 2 esperas de terceros**; mínimo 1-3 días (Meta) | Auditor de alta, tabla §2.1 |
| Saber en qué paso quedó cada alta | **Ninguna pantalla lo muestra**: hay que abrir las fichas una por una | ALTA-4 ✅ |
| Mantener una marca viva | **~85 min/marca/mes** de trabajo humano (estimado, con supuestos) → ~35 h/mes a 25 marcas, **~142 h/mes a 100** (una persona entera), **~1.417 h/mes a 1000 (≈ 9 personas)** | Auditor de operación, §2.5 |
| Enterarse de que algo falla | **0 canales de aviso** (ni correo, ni WhatsApp, ni Slack) y **0 tracking de errores**: ~431 `console.*` que nadie junta | RASTREO-1 ✅, RASTREO-4 ✅ |
| Depender de una persona | **18 de 31** ítems de la cola (`ESTADO.md` §3) y **7 de 7** de los bloqueados esperan al dueño | PROC-4 👁️ |
| Plantillas de Meta a 1000 marcas | 13 por marca = **13.000 aprobaciones** (8.000 con la propuesta de bajar a 8) | `docs/PENDIENTES-PLANTILLAS.md` |
| Primer cuello técnico | `queue-drain` da una vuelta a **~100-150 marcas con cola** por ciclo de 15 min (estimado a 100 ms por viaje) | ESCALA-6 ✅ |

**Y hay dos agujeros entre marcas que se cierran antes que todo lo demás** (§1): uno vivo en producción hoy, y otro
en una migración que está en la cola para aplicarse.

---

## 1. 🔴 Urgente: antes de la próxima alta

### 1.1 AISLA-1 ✅ (Opus + refutador) — `/api/mystery-box/resolve` regala premios sin límite y cruza marcas. **Vivo en producción.**

La cadena, eslabón por eslabón (nada la corta):

1. `POST /api/mystery-box/resolve` es público: sin sesión y sin límite de tasa (el archivo no importa `rate-limit`).
   Toma `tier_id` del body (`src/app/api/mystery-box/resolve/route.ts:21`).
2. La marca sale del host (`:39`) y el cliente se busca dentro de ella (`:48`), pero el nivel se busca con
   `getTierById(tier_id)` (`:57`), que **no filtra por marca** (`src/services/reward-tiers.service.ts:147-160`). Es la
   única lectura por `id` de `src/services/` sin su `.eq('tenant_id', …)`.
3. La ruta solo compara puntos contra el umbral (`:67`). **Nunca compara `tier.tenant_id` con la marca del host.**
4. `resolveMysteryBox()` escribe `mystery_box_results` y `grantReward()` escribe `reward_grants` en la marca del host
   con el `tier_id` ajeno (`src/services/mystery-box.service.ts:311-360`, `src/services/reward-grant.service.ts:63-105`).
   Las FK de `tier_id` son simples (`00013_points_mystery_box.sql:70`, `00031_reward_grants.sql:49`): el motor no lo frena.
5. El único anti-duplicado de `reward_grants` es para `campaign_prize` (`00031_reward_grants.sql:82-84`); `tier_prize`
   no tiene ninguno.
6. Sale un WhatsApp por la línea de la marca del host con el nombre y el premio del nivel (`route.ts:145,167`).

**Qué logra alguien:** cualquier cliente real de una marca (registrarse es trivial) se genera premios **sin límite**, con
los niveles de su marca o con los de otra (los `id` de nivel los expone `GET /api/check-in/status`, `:213`). Cada
llamada crea un premio pendiente que el mesero ve para entregar, y un WhatsApp que paga la marca. Es el mismo endpoint
que `ESTADO.md` §3 0.BETA/0.GAMMA dejaba «sin verificar»: está verificado, y cruza marcas.

**Qué haría falta:** `getTierById(tierId, tenantId)` con su `.eq('tenant_id', …)` (404 si no coincide), límite de tasa
en la ruta y una guarda de reclamo para `tier_prize` (el `claimed_tier_key` de la 00059 o un UNIQUE parcial). Micro.

### 1.2 AISLA-2 ✅ latente (Opus + refutador) — **la 00067 y la 00057 NO se aplican tal cual**

- `00067_aios_attach_zernio_account.sql:92` y `00057_aios_lee_sedes.sql:126` revocan EXECUTE **solo `FROM PUBLIC`**.
- En Supabase, toda función nueva del esquema `public` nace con EXECUTE para `anon` y `authenticated` por privilegios
  por defecto. El propio repo lo documentó y lo tuvo que cerrar a posteriori en `00038_send_queue_drain.sql:336-369`:
  *«`aios_provision_tenant(jsonb)`: CREA TENANTS, y hoy es invocable con la clave pública del navegador»*.
- `aios_attach_zernio_account` es `SECURITY DEFINER` y **no tiene ninguna guarda sobre quién la llama**
  (`00067:36-89`). Aplicada tal cual, cualquiera con la anon key (va en el JS público) llama
  `POST /rest/v1/rpc/aios_attach_zernio_account` y reescribe `zernio_profile_id/account_id/phone_number` de cualquier
  marca en Twilio **sabiendo solo su slug, que es su subdominio**. Resultado: corta la difusión por Zernio de esa marca
  (sabotaje trivial) y, si se conoce un `account_id` válido sin dueño, los entrantes de esa cuenta se atribuirían a la
  marca equivocada. La 00057 filtraría las sedes de cualquier marca (lectura).
- Barrido Opus de las **35** funciones `SECURITY DEFINER` de las migraciones: fuera de estas dos, las que escriben
  revocan bien (la 00064 y la 00066 son el modelo: `FROM PUBLIC, anon, authenticated`). Las cinco restantes sin revoke
  explícito son helpers de RLS (`is_super_admin`, `can_see_location`…) o un trigger: no preocupan.
- **Hoy es riesgo de archivo**: ninguna de las dos figura aplicada (`ESTADO.md` §1; la 00057 sigue en §3 0.ter). Pero
  la 00067 está en la cola (0.SUSHI, paso 2).

**Qué haría falta:** `REVOKE ALL … FROM PUBLIC, anon, authenticated` en las dos (una línea cada una) **antes** de
aplicarlas, y un test de base que falle si alguna `SECURITY DEFINER` queda ejecutable por `anon` (el arnés tendría que
imitar los privilegios por defecto de Supabase, que el Postgres embebido no trae).

### 1.3 Otros cuatro que no esperan a la ola que les toca

| ID | Qué | Evidencia | Arreglo |
|---|---|---|---|
| OPUS-2 👁️ | `logs-2026-09-24-06-48-56.csv` (1,7 MB, export de Zernio **con el texto de los pedidos**) está en la raíz del repo, sin versionar y **sin ignorar** (`git status` → `??`). Un `git add -A` de cualquier herramienta lo publica en GitHub (Ley 1581) | `.gitignore` cubre `Contactos/` pero no `*.csv` | Sacarlo del repo e ignorar `logs-*.csv` |
| OPER-4 ✅ (peor) | El `PUT /api/dashboard/settings` escribe cualquier `key` sin validar y **sin exigir rol de marca**: un administrador de sede pisa un `*_template_sid` vigente de toda la marca. Es uno de los **cinco** escritores de punteros de plantilla, aunque `promoteVersion()` se declara el único | `src/app/api/dashboard/settings/route.ts:39-49`; los otros: `template.service.ts:651-699`, `twilio-catalog.service.ts:284-320`, `00036:261`, pegado manual | `exigirAlcanceDeMarca()` como en `reward-tiers` (09), y lista cerrada de claves |
| ESCALA-3 ✅ | El webhook de Zernio **espera a OpenAI** (timeout 8 s, peor caso ~16 s) antes de responder, contra los 5 s que pide Zernio; **10 fallos seguidos apagan el webhook para TODAS las marcas Zernio** (el propio código lo dice), y todas las marcas nuevas van por Zernio | `src/app/api/webhook/zernio/route.ts:289-296,640-641`; `src/constants/delivery-ai.ts:33-40`; no hay `after()` en la ruta | Responder 200 y leer el pedido fuera del request (`after()` o cola) |
| ESCALA-4 ✅ | `getFullAnalytics()` trae `customers`, las `visits` de 6 meses y **todo** `campaign_messages` sin `.limit/.range`: PostgREST corta en 1000 filas **en silencio**. Quedan mal el mapa de calor día × hora y la tasa de reactivación de cualquier marca que pase las 1000 filas (probablemente ya Sushi Service; no verificable sin la base) | `src/services/dashboard.service.ts:210,213,215` → `/api/dashboard/analytics` | Agregar en SQL (RPC) en vez de traer filas |

---

## 2. Hallazgos por objetivo

### 2.1 Más fácil de IMPLEMENTAR (el alta y el AIOS)

El camino real, reconstruido del código: formulario del AIOS (~38 campos) → crear el tenant → verificar el dominio →
elegir camino de WhatsApp → profile de Zernio → registrar el número → **link de Embedded Signup copiado a mano** → el
dueño del negocio lo completa en Meta → registrar en Cloud API → crear 13 plantillas → **Meta tarda 24-72 h** →
«Actualizar estado» a mano → registrar webhook → activar el proveedor → cargar los `*_template_sid` → crear el usuario
del panel y **mandarle las credenciales a mano**. El check-in funciona con solo tres de esos pasos; el primer WhatsApp
necesita todos. Aparte, y fuera del AIOS: la llamada de venta, la demo, el setup por Notion y la capacitación.

| ID | Sev. | Hallazgo | Evidencia | Veredicto |
|---|---|---|---|---|
| ALTA-3 | 🔴 | **El AIOS es de un solo usuario**: la RLS deja a cualquier `authenticated` ver todo; no se puede sumar un operador sin rehacer permisos | AIOS `README.md:387-388`, `supabase/migrations/00001_init.sql:129-135` | ✅ |
| AISLA-3 | 🔴 | Sin MFA en el AIOS (cero `mfa/totp/aal` en `src/`): **una sesión robada resetea la contraseña de admin de cualquier marca** (`resetPassword`). Es diseño razonado (no expone la service role), pero a 1000 marcas es la puerta única | AIOS `src/lib/product-auth.ts:93-191`, `src/lib/auth.ts:35-75` | ✅ |
| ALTA-1 | 🔴 | **La 00064 sigue sin aplicar**: sin ella no se puede borrar ni reiniciar un alta rota (Tepuy se arregló con SQL a mano) | `ESTADO.md:20`; `src/app/api/aios/tenant-delete/route.ts:199-224` | ✅ |
| ALTA-4 | 🟠 | **No hay tablero de altas**: `/clientes` es de cobranza; todo bloqueo cae en un único «Falta un paso» | AIOS `src/lib/data/sites.ts:180-214`, `ClientsList.tsx` | ✅ |
| ALTA-7 | 🟠 | La UI promete *«Meta contesta en horas (a lo sumo un día)»*; la realidad documentada es 24-72 h (Planeta Wings: 0/13 a las 4 h). El operador deja de mirar y el alta queda a medias | AIOS `src/components/clients/WhatsappWizard.tsx:739` | ✅ |
| ALTA-2 | 🟠 | **El primer WhatsApp puede no salir sin que nadie se entere**: `no_template_configured` viaja en el JSON del check-in pero ninguna pantalla lo lee | `src/app/api/check-in/route.ts:114-147`; `CheckInSuccess.tsx` solo lee el de mystery-box | ✏️ (no es solo un `console.warn`; el efecto es el mismo) |
| OPER-5 | 🟠 | `tier_unlocked_template_sid` y `reward_reminder_template_sid` no están en ninguno de los dos catálogos → **en Zernio, subir de nivel y el recordatorio de premio no mandan nada, nunca** | `src/constants/template-catalog.ts` (13 entradas); `cron/reward-reminder/route.ts:71` sale con `sent:0` | ✅ |
| OPER-6 | 🟠 | **Dos catálogos de 13 plantillas** (producto y AIOS), copiados a mano, sin test que los compare; ya hubo un incidente (sushi horneado en una barbería, 09-09) | AIOS `src/lib/zernio/templates-catalog.ts:1-30,85-219` | ✅ |
| ALTA-5 | 🟡 | No hay alta en lote de negocios nuevos: `/clientes/importar` solo engancha tenants que ya existen | AIOS `src/lib/actions/import.ts:22-146` | ✅ |
| ALTA-6 | 🟡 | Tepuy nació como dos marcas y se recuperó con cirugía SQL sobre dos Supabase, con reloj corriendo | `ESTADO.md:264-272`, `SQL-PARA-CORRER/tepuy-una-marca/` | 👁️ |
| OPER-3 | 🟡 | `owner_email` vacío en las 5 marcas vivas → **Conexiones solo la opera el super-admin**. El campo sí existe en el alta nueva y sí llega a `tenants.owner_email`, pero es opcional, y `tenant-admin` no lo escribe | `src/lib/tenant-owner.ts:86-129`; AIOS `SiteBrandFields.tsx:152-161`; `provisioning.ts:1330-1336` | ✏️ (ver ALTA-10) |
| ALTA-10 | — | «El alta no pide `owner_email`» | Se captura en «Marca y operación» y llega vía `provisionTenant()` | ❌ |
| ALTA-9 | 🟡 | `docs/operaciones/PROCESO_VENTAS_IMPLEMENTACION.md` no menciona el AIOS ni una vez y promete «máximo 48 h» | `:46,201` | ✅ |
| OPER-9 | 🟡 | `DELEGACION_GUIDE.md` instruye crear **un Supabase y una cuenta Twilio por cliente** (arquitectura vieja) y el precio se contradice entre dos docs. Es justo el doc que debería permitir contratar a alguien | `DELEGACION_GUIDE.md:75-109`; `PROCESO_VENTAS…:44` vs `04-deployment.md:1016-1022` | ✅ |
| ALTA-11 | ⚪ | «Registrar webhook» se pide por cada propietario aunque es global al Team | AIOS `src/lib/zernio/client.ts:532-540`, `provisioning.ts:953-985` | ✅ |
| ALTA-12 | ⚪ | `scripts/seed-new-tenant.sql` sigue enseñando el `UPDATE auth.users` a mano, sin mencionar `POST /api/aios/tenant-admin` | `:172-205` | ✅ |

### 2.2 Más fácil de RASTREAR

La vara: con 1000 marcas, ¿puede una persona saber cada mañana, sin abrir logs, qué marcas están enfermas, desde cuándo
y por qué? **Hoy no.** Todo es «ir a mirar», y hay señales que ni mirando se ven.

| Qué pasa | Dónde queda | ¿Quién lo ve? | ¿Avisa? |
|---|---|---|---|
| Un cron falla o no corre | En ningún lado: se **infiere** de `MAX(message_logs.created_at)` **global** | Dueño en `/salud` (tira de crons) | No |
| Falla un WhatsApp (Twilio) | **No queda**: `message_logs.status` se queda en `sent` para siempre | Nadie | No |
| Falla un WhatsApp (Zernio) | `message_logs.status` por webhook | Dueño en `/salud`, restaurante en Métricas | No |
| Meta pausa o rechaza una plantilla | Zernio: `admin_settings` (PAUSED solo `console.warn`). Twilio: **nada** | Casi nadie | No |
| Domicilio perdido | `delivery_intake_failures` (00053) ✔ | Dueño y restaurante, abriendo la pantalla | No («la alarma solo se PINTA») |
| Saldo agotado / cupo agotado | Ledger y `line_budget()` ✔ | Abriendo la pantalla | No |
| Error 500 | Solo `console.error` → log de Vercel (retención corta, sin SQL) | Nadie | No |
| Firma de webhook inválida | **Nada**: 401/403 sin una línea de log | Nadie | No |

| ID | Sev. | Hallazgo | Evidencia | Veredicto |
|---|---|---|---|---|
| RASTREO-1 | 🔴 | **Cero canales de aviso** en los dos repos (ni correo, ni WhatsApp, ni Telegram, ni Slack); el AIOS no tiene ni crons. Todo es pantalla que hay que abrir | `src/app/api/dashboard/domicilios/resumen/route.ts:6`; grep negativo en `package.json` y `src/` de ambos | ✅ (= OPER-2) |
| RASTREO-4 | 🔴 | **Sin tracking de errores ni log drain**: ~431 `console.*` en el producto (337 error), 6 en el AIOS; el log de Vercel «se retiene poco, no se consulta por SQL» | `00053_salud_por_cliente.sql:51-52` | ✅ |
| RASTREO-2 | 🔴 | **Twilio sin status callback, a propósito**: `StatusCallback: ''` al aprovisionar → `aios_health()` cuenta ~0 fallos en toda marca Twilio, falle lo que falle | `scripts/twilio-setup.mjs:80`; `message-log.service.ts:52-75`; `00053:240-251` | ✅ (peor) |
| RASTREO-3 | 🔴 | Plantilla rechazada o pausada en Twilio: cero rastro (`paused_templates: []` fijo). En Zernio, PAUSED solo deja un `console.warn` | `line-health.service.ts:350-353`; `template.service.ts:754,844` | ✅ (más ancho) |
| RASTREO-5 | 🟠 | La señal de «el cron corrió» es un `MAX` **global** sin filtrar por marca: con 1000, una sola marca activa tapa 999 crons muertos. No existe tabla de corridas | `00053_salud_por_cliente.sql:120-146` | ✅ |
| RASTREO-7 | 🟠 | **No hay bitácora de auditoría** («quién cambió qué») en ninguno de los dos repos | grep `audit_log/created_by/changed_by` | ✅ |
| OPER-7 | 🟠 | El gasto de **OpenAI** no se mide ni se limita por marca (una sola key, cero contadores) | `src/lib/openai/client.ts:32-56` | ✅ |
| OPER-8 | 🟠 | El gasto de **Zernio** se factura al Team entero, sin saldo por marca: una marca ruidosa consume el de todas | `docs/features/zernio-messaging.md:209-229` | ✅ |
| RASTREO-8 | 🟡 | `/salud` del AIOS: sin refresco (a propósito) y sin paginar; a 1000 son 1000 filas en una lista | AIOS `src/app/(app)/salud/page.tsx:12-16`, `HealthBoardList.tsx` | ✅ |
| RASTREO-9 | 🟡 | `aios_health()` recalcula **6** `LEFT JOIN LATERAL` por marca en cada carga, sin caché | `00053:127-267`; AIOS `src/lib/data/health.ts` | ✏️ (6, no 5) |
| RASTREO-10 | 🟡 | Saldo bajo sin aviso: la infraestructura existe (`low_balance_notified_at`) pero nada la escribe ni manda `low_balance` | `wallet.service.ts:225-244`, `00033_wallet_debits.sql:22-93` | ✅ |
| RASTREO-12 | 🟡 | Firma inválida de webhook: rechazo sin log. Diagnosticar «por qué esta marca dejó de recibir domicilios» es adivinar | `twilio-incoming/route.ts:202-232`, `webhook/zernio/route.ts:786-800` | ✅ |
| RASTREO-6 | ⚪ | El CSV de logs del 24 no es de Vercel sino de Zernio (4.133 filas, todas `success`): el export manual no podía mostrar un error del producto | encabezados y conteos | ✅ |
| RASTREO-11 | ⚪ | `twilio-metrics` corta en 5×1000 mensajes | `route.ts:94-95,280` — **sí avisa** con un banner ámbar (`TwilioMessagesPanel.tsx:383-388`) | ✏️ |

### 2.3 ESCALAR a 1000 marcas (técnico)

| Cuello de botella | Se rompe a ~N marcas | La cuenta | Veredicto |
|---|---|---|---|
| Webhook Zernio con OpenAI adentro (§1.3) | Ya marginal hoy | 8 s de IA contra 5 s de presupuesto; 10 fallos = apagón compartido | ✅ |
| Analítica truncada (§1.3) | Por marca, apenas pasa 1000 filas | Límite de PostgREST | ✅ |
| `queue-drain` | **~100-150 con cola a la vez** | Hasta 23 viajes en serie por marca y vuelta ≈ 2,3 s → 240 s ÷ 2,3 s ≈ 104 | ✅ (inferido) |
| `birthday` / `reactivation` / `reward-reminder` | Bajos cientos (depende de las conexiones del plan) | `Promise.allSettled` sobre **todas** las marcas en el mismo segundo, sin `maxDuration` ni cursor | ✅ |

| ID | Sev. | Hallazgo | Evidencia | Veredicto |
|---|---|---|---|---|
| ESCALA-1 | 🔴 | Los crons diarios disparan **todas las marcas a la vez** sin `maxDuration`, sin presupuesto de tiempo ni cursor: la marca que no entra ese día no manda nada, y nadie se entera. `calendar-dispatch` recorre eventos en serie, también sin `maxDuration` | `cron/birthday/route.ts:129-130`, `reactivation/route.ts:359-360`, `reward-reminder/route.ts:213-214`; `getActiveTenants()` no pagina | ✅ |
| ESCALA-7 | 🔴 | **Sin anti-duplicado atómico**: `campaign_messages` no tiene ningún UNIQUE en las 68 migraciones, y tanto `hasRecentCampaignMessage()` como `getOrCreateTodayCampaign()` son «leer y después escribir». Dos corridas solapadas = el mismo WhatsApp dos veces | `campaign.service.ts:107-175`; `00004_campaigns.sql:32-33` | ✅ (peor) |
| ESCALA-6 | 🟠 | `queue-drain` chequea el opt-out **uno por uno** (el bloque de al lado ya usa `.in()`) | `queue-drain/route.ts:403-411` | ✅ |
| ESCALA-8 | 🟠 | Resolver marca y sede por host cuesta **2-3 consultas en cada request**, sin caché entre requests | `src/lib/tenant.ts:171-189`; `host-context-server.ts:1-24` | ✅ |
| ESCALA-9 | 🟠 | El límite de tasa vive **en memoria de cada instancia** (su comentario lo dimensiona para «3 restaurantes»): a más tráfico, más instancias y menos límite real | `src/lib/rate-limit.ts:1-17` | ✅ (= AISLA-4) |
| ESCALA-2 | 🟠 | El Supabase **del AIOS** es Nano y ya dio Gateway Timeout (`generate_due_payments`, `/clientes/[id]`). **El tier del Supabase del producto no está documentado en ningún lado** (los docs dicen «Free tier») | `ESTADO.md:51-55` | ✏️ (no es el del producto) |
| ESCALA-11 | 🟡 | Sin índices compuestos en `campaigns` y `campaign_messages` | `00025_add_tenant_id.sql:21-29` — `visits` y `message_logs` **sí** los tienen desde la 00053 | ✏️ |
| ESCALA-10 | 🟡 | Las políticas RLS llaman `current_tenant_id()` / `is_super_admin()` sin `(select …)`, hasta la 00063. Impacto bajo hoy (casi todo va por service role) | `00026_multitenant_rls.sql:46-51` | ✅ |
| ESCALA-5 | ⚪ | El `matcher` del middleware no excluye `/api/*`; pero `getUser()` **no sale a la red sin cookie**, así que webhooks y crons no pagan el viaje. Aparte: en Next 16 `middleware` se llama `proxy` (el AIOS ya migró; el producto no) | `src/middleware.ts:8-12`; `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` | ✏️ |
| ESCALA-12 | ⚪ | `docs/features/scalability-analysis.md` miente: dice 60 s de tope (el código usa 300), que n8n dispara los crons y «¿se va a caer? No» | `:20-21,108` | ✅ |

### 2.4 Aislamiento entre marcas (lo que no se negocia)

**Lo bueno, confirmado:** las 45 escrituras (`.insert`/`.upsert`) de `src/` fijan `tenant_id` explícito, también las
~19 nuevas desde el 03-09. El riesgo de la 00030 sigue siendo la **falta de red**, no el código de hoy. Las tablas
nuevas de las últimas 15 migraciones tienen RLS sin `USING (true)`, y todas las `SECURITY DEFINER` fijan `search_path`.

| ID | Sev. | Hallazgo | Veredicto |
|---|---|---|---|
| AISLA-1 | 🔴 | §1.1 | ✅ |
| AISLA-2 | 🔴 | §1.2 | ✅ latente |
| AISLA-5 | ⚪ | `webhook/delivery` compara el secreto con `!==` (los otros tres validadores usan `timingSafeEqual`), y ese secreto es uno solo para todas las marcas (`route.ts:48-71`) | ✅ |
| AISLA-8 | ⚪ | `getEvent()` (`calendar.service.ts:220-229`) y varios `update` de `customer.service.ts` van por `id` sin `tenant_id`; **los cuatro llamadores re-chequean la marca**. Defensa en profundidad, no agujero | ✏️ |
| AISLA-7 | ⚪ | El `.gitignore` del AIOS cubre `.env`, `.env.local`, `.env*.local` y `.env.production`, pero no otros sufijos (`.env.staging`) | ✏️ |
| OPUS-1 | 🟡 | `.mcp.json` está versionado **sin secretos** (solo `project_ref` y `features`, revisado con los valores enmascarados), pero **sin `read_only=true`** y con `database,development,branching`: una sesión de IA que lo autorice puede ejecutar SQL y aplicar migraciones en ese proyecto (sin staging, probablemente producción) | ✏️ (el refutador no lo abrió; Opus sí) |

### 2.5 Operación del negocio (lo que de verdad frena el 1000)

| Tarea recurrente por marca | Hoy la hace | Min/mes (estimado) | ¿Se puede sacar del dueño? |
|---|---|---|---|
| Revisar saldo y calidad de línea, avisar | El dueño | 20 | Automatizar (aviso de saldo bajo) |
| Cobrar y marcar pagado | El dueño, tras ver la transferencia | 8 | Pasarela (Wompi, «Bloque 5» sin construir) |
| Plantillas rechazadas o pausadas | El dueño, pantalla por pantalla | 10 | Aviso automático |
| Reactivar una línea frenada | El dueño, con motivo | 5 | Asistente con criterio (es humano por diseño) |
| Conexiones en nombre del cliente | Solo el super-admin | 3 | Sí, con `owner_email` cargado |
| Editar una plantilla a pedido | El dueño | 7 | Parcial (Meta exige su firma) |
| Revisar domicilios perdidos | El dueño | 10 | Asistente con checklist |
| Soporte y reporte de resultados | El dueño | 20 | Asistente (si los docs estuvieran al día) |
| «Olvidé mi contraseña» | El dueño | 2 | Autoservicio (falta el SMTP) |
| **Total** | | **~85** | |

| ID | Sev. | Hallazgo | Evidencia | Veredicto |
|---|---|---|---|---|
| OPER-1 | 🔴 | **El cobro es 100 % manual** («Marcar pagado») y **nada suspende una marca por mora**: `is_overdue` es solo una etiqueta | AIOS `src/lib/actions/payments.ts:100-158`, `00003_owners_sites_billing.sql:190-242` | ✅ |
| PROC-4 | 🔴 | **Todo cuelga de una persona**: 18/31 de la cola y 7/7 de lo bloqueado esperan al dueño; hay ítems abiertos desde el 07-09 | `ESTADO.md` §3-§4 | 👁️ |
| OPER-10 | ⚪ | `04-deployment.md` §8 («costos por cliente») no tiene Zernio ni OpenAI | `:960-1004` | ✅ |
| OPER-11 | ⚪ | Reactivar una línea frenada es siempre humano, **a propósito** (es lo que hace seguro el sondeo horario): a 1000 hace falta un playbook, no automatizarlo | `docs/features/send-governance.md:419-424` | 👁️ |
| OPER-12 | ⚪ | `imported-contacts.service.ts:60` redeclara `USD_TO_COP = 4200` pese a que `src/constants/wallet.ts:14` dice haberla centralizado: el costo estimado del Golden Bullet no sigue la TRM | | ✅ |

### 2.6 MEJORAR: proceso, despliegue y el Método

| Regla del método | Lo que dice | Lo que hay hoy | ¿Se cumple? |
|---|---|---|---|
| §3 `ESTADO.md` | ≤ 150 líneas | **563** (3,8×) | No |
| Apéndice B `CLAUDE.md` | ≤ 100 líneas | **126**, y su «25 archivos / 418 tests» es hoy 54/814 | No |
| §3.1 CHANGELOG | ≤ 15 líneas por entrada | 2 de las últimas 10 se pasan (16 y 19 líneas con texto; el auditor contó los blancos y dijo 7 — corregido por Opus) | Casi |
| §6.1 worktrees | Excepción, en `.worktrees/`, declarado, borrado el mismo día | `.kilo/worktrees/ivy-city` (Kilo), detached en `311bbe9`, **3+ días**, sin fila en §2 | No |
| §2.2 grafo | Siempre al día | El hook reconstruye (usa un `python.exe` fijado), pero **`graphify query/affected` no corre**: `graphify.exe` bloqueado por el Control de aplicaciones de Windows | Parcial |
| §4 «push y deploy son del dueño» | Push simple de `main` | Se cumple, pero desplegar una parte exigió rehacer 4 commits sobre `origin/main` (documentado y deliberado) | Sí, con fricción |

| ID | Sev. | Hallazgo | Evidencia | Veredicto |
|---|---|---|---|---|
| PROC-1 | 🔴 | **Sin CI en ningún repo** (ni `.github/`, ni pre-commit, ni pre-push): un commit roto en `main` se despliega solo | `.git/hooks/` de ambos | ✅ |
| PROC-3 | 🔴 | **Sin staging**: cada migración y cada smoke test se hacen en producción («Smoke test **en producción** con Sushi Service real») | `docs/RUNBOOK-DEPLOY.md:137-148` | ✅ |
| PROC-2 | 🔴 | **Nadie sabe por herramienta qué migración está aplicada**: `schema_migrations` está vacía (se pegan a mano en el editor SQL) y el sondeo llega hasta la 00043 de 68; la única fuente es la prosa de `ESTADO.md` | `scripts/check-migraciones-1-catalogo.sql:1-8,52` | ✅ |
| PROC-5 | 🟠 | **El AIOS —que puede borrar una marca entera— no tiene un solo test** ni grafo (la `.graphifyignore` del producto dice que sí tiene grafo, y no existe) | AIOS `package.json`; `.graphifyignore:9-10` | ✅ |
| PROC-7 | 🟠 | Ningún test ejercita el handler de un **cron** | grep en `tests/`. Los webhooks de Zernio y Twilio **sí** tienen `POST()` probado | ✏️ |
| PROC-8 | 🟡 | `main` y la rama divergen (4 commits con el mismo contenido y otro SHA) por un despliegue parcial | `git log origin/main..HEAD` | ✏️ (deliberado y documentado) |
| PROC-9 | 🟡 | `ESTADO.md` a 3,8× su límite: cada sesión paga varias veces lo previsto antes de escribir una letra | 563 líneas | ✅ |
| PROC-6 | 🟡 | Worktree de Kilo suelto (ver tabla del método) | `git worktree list` | ✅ |
| PROC-10 | 🟡 | `graphify.exe` bloqueado por el Control de aplicaciones de Windows | `.git/hooks/post-commit:59` | ✅ |
| PROC-11 | ⚪ | Docs que mienten: `CLAUDE.md:97` (tests), `vitest.config.mts:32` («37 migraciones»), `docs/04-deployment.md:199-209` (vercel.json viejo), `ESTADO.md:22` («Los 5» crons; son 6) | | ✅ |
| PROC-12 | ⚪ | vitest fija el puerto 55432 sin detectar otra corrida: el síntoma es «No test files found» | `tests/setup/global-postgres.ts:59,73` | ✅ |

---

## 3. Lo que está bien y no hay que tocar

- **Escrituras con marca explícita**: las 45 de `src/` fijan `tenant_id`; `delivery_intake_failures` nació sin DEFAULT
  puente, con RLS y `REVOKE UPDATE, DELETE`.
- **El alta es «un clic, un paso»**: cada paso del wizard es su propio Server Action, idempotente y reintentable; el
  modo simulación es «pegajoso» (AIOS `src/lib/actions/provisioning.ts:1-98`, `provisioning-state.ts:104-118`).
- **El AIOS nunca tiene la service role del producto**: escribe solo por funciones `SECURITY DEFINER` con nombre, con
  un rol restringido, y traduce cada error de Postgres a español (AIOS `src/lib/product-db.ts`).
- **`queue-drain` está hecho para escala**: round-robin por marca, presupuesto de tiempo, cursor y
  `FOR UPDATE SKIP LOCKED`. Es el molde para los otros crons.
- **Cero variables de Vercel por marca nueva**: todo lo de una marca vive en filas (`tenants`, `config`), y
  `reserve_send_slot()` con `pg_advisory_xact_lock` hace imposible pasarse del cupo de Meta.
- **`src/lib/db-failure.ts`** separa «falló la base» de «no hay filas», y el semáforo del AIOS usa umbrales por marca.

## 4. Lo que no se pudo verificar (y qué hace falta)

- **Todo lo de producción**: qué migraciones están aplicadas hoy (sobre todo si la 00057 ya corrió: `ESTADO.md` se
  contradice), `owner_email` de hoy, cuánto pesa `campaign_messages` en Sushi Service, el tier del Supabase del producto.
  Hace falta autorizar el MCP de Supabase **en modo lectura** o una consulta del dueño.
- **Costos reales** (Twilio, Zernio, OpenAI, Supabase, Vercel) y los **límites de tasa** de las cuentas: están en las
  consolas, no en el código.
- **Explotabilidad en vivo de AISLA-1**: la cadena se verificó leyendo cada eslabón; no se ejecutó ningún request.
- **Los minutos de §2.5** son estimados con supuestos declarados, no medidos: no existe registro de tiempo.

---

## 5. Propuesta de olas para llegar a 1000 (la cola la ordena el dueño)

**Ola 0 — esta semana (micro; sin migración nueva salvo corregir la 00067/00057):**
AISLA-1 (marca en `getTierById`, límite de tasa, guarda de reclamo) · AISLA-2 (REVOKE completo + test) · sacar el CSV
del repo · OPER-4 (rol de marca en el `PUT` de settings) · AISLA-5 (`timingSafeEqual`) · ALTA-7 (texto 24-72 h).

**Ola 1 — rastrear (antes de pasar de 25 marcas):**
tracking de errores (Sentry, o log drain de Vercel a algo consultable) · tabla de corridas de cron **por marca** · un
**resumen diario que le llegue solo al dueño** (WhatsApp o correo) con las marcas en rojo, desde cuándo y por qué,
armado sobre `aios_health()` · status callback de Twilio → `message_logs.status` y sondeo de plantillas Twilio ·
`no_template_configured` y los demás motivos visibles en `/salud` · bitácora de auditoría · contador de gasto por
marca (OpenAI y Zernio) · log en cada firma inválida.

**Ola 2 — implementar (que el alta y el día a día no pasen por una persona):**
tablero de altas (esperando a Meta · esperando al cliente · con error · lista) con aviso a las 72 h · AIOS
multiusuario con roles, MFA y registro de cada `reset_password` · **un solo catálogo de plantillas** (el AIOS llama al
producto) con `tier_unlocked` y `reward_reminder`, y bajar de 13 a 8 aprobaciones · `owner_email` obligatorio y cargado
en las 5 vivas · «olvidé mi contraseña» · aplicar la 00064 (y la 00058/00059/00061) · cobro con pasarela, corte por
mora y aviso de saldo bajo · reescribir `DELEGACION_GUIDE.md`, `PROCESO_VENTAS_IMPLEMENTACION.md` y
`seed-new-tenant.sql` contra el flujo real del AIOS, para que un asistente pueda dar altas.

**Ola 3 — escala técnica (antes de ~100 marcas):**
los crons diarios con el patrón de `queue-drain` (lotes, presupuesto, cursor) o un reparto durable de una ejecución por
marca · UNIQUE anti-duplicado en `campaign_messages` y en la campaña del día · webhook de Zernio que responde antes de
llamar a OpenAI · analítica agregada en SQL · opt-out en lote en `queue-drain` · caché corta de la marca por host y
límite de tasa compartido (Redis) · índices en `campaigns`/`campaign_messages` y `(select …)` en las políticas ·
confirmar el tier del Supabase del producto, subir el del AIOS y **probar con 1000 marcas sintéticas en staging**.

**Ola 4 — proceso (que no dependa de acordarse):**
CI (`tsc`, `lint` y `vitest` en cada push a `main`, antes del deploy) · staging (Supabase + Vercel preview) donde cada
migración se aplica primero · migraciones con registro real (CLI de Supabase) o el sondeo extendido a la 00068 · tests
del AIOS (las acciones que escriben) y de los handlers de cron · flags para desplegar a medias sin rehacer commits ·
podar `ESTADO.md` (563 → 150) y `CLAUDE.md` (126 → 100) · borrar el worktree de Kilo · permitir `graphify` en el
Control de aplicaciones · MCP de Supabase con `read_only=true` · `middleware.ts` → `proxy.ts` · sacar del carril del
dueño las tareas de la cola que no necesitan su firma.
