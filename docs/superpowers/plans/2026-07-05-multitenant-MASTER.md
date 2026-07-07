# Multitenant — Archivo Maestro de Implementación

> **Este es el documento autoritativo.** Consolida las decisiones tomadas en la sesión de
> brainstorming del 2026-07-05 y ordena la ejecución. Los otros dos documentos son apéndices:
> - [`2026-06-23-multitenant-migration.md`](./2026-06-23-multitenant-migration.md) → detalle task-by-task (código de cada archivo).
> - [`2026-07-04-multitenant-PREFLIGHT.md`](./2026-07-04-multitenant-PREFLIGHT.md) → auditoría del SQL vs. esquema real. **Leer antes de correr migraciones.**
>
> **Fecha objetivo del corte:** esta noche (ventana 11pm–11am). Lunes entra cliente nuevo.

---

## 0. TL;DR — qué es esto y qué NO es

Migramos de **clone-por-cliente** (cada restaurante con su propio Supabase + Vercel + Twilio) a
**multitenant real**: un Supabase compartido, una app compartida, aislamiento por `tenant_id`.

**Realidad de arquitectura (verificada en el preflight, hallazgo #5):** el 95% del acceso a datos
usa `getServiceClient()` (SERVICE_ROLE_KEY), que **bypasa RLS**. Por eso **el RLS por sí solo NO
aísla los tenants.** El aislamiento real exige que **cada query de la app filtre/inserte `tenant_id`**
(Milestone 2). Correr solo las migraciones deja la app funcionando, pero **en mono-tenant** (todo
queda etiquetado como Sushi Service vía un DEFAULT puente).

> 🔴 **GATE DURO:** No se puede meter la data de Sushi Fun al Supabase compartido hasta que
> Milestone 2 (código tenant-aware) esté desplegado. Si se mete antes, el dashboard de Sushi Service
> —que usa service_role sin filtro— mostraría los clientes de AMBOS restaurantes mezclados, y cada
> check-in nuevo de Sushi Fun se guardaría como cliente de Sushi Service (por el DEFAULT). **Milestone
> 2 no es opcional para el objetivo de esta noche.**

---

## 1. Decisiones tomadas (definitivas)

| Tema | Decisión |
|------|----------|
| **Supabase compartido** | El proyecto **actual de Sushi Service** se convierte en el compartido. Las migraciones 00024–00028 corren ahí, en sitio. |
| **Resolución de tenant** | **Por dominio (host header)**, no por `/[slug]/` en la URL. Preserva los QR impresos de ambos restaurantes sin reimprimir. `tenants` gana columna `domain`. |
| **Dominios** | `clubsushiservice.constelarys.com` y `clubsushifun.constelarys.com` apuntan al mismo proyecto Vercel (el de Sushi Service). Cliente nuevo = subdominio nuevo al mismo proyecto. |
| **Twilio — Sushi Service** | Su cuenta actual pasa a ser la **cuenta master** de Cada1. `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` de la app apuntan a esta cuenta. |
| **Twilio — Sushi Fun** | Se queda con su **cuenta separada, intacta**. Solo guarda su SID/token propio en la fila `tenants`. (Recargarle saldo es aparte y urgente, no bloquea la migración.) |
| **Twilio — clientes nuevos** | Nacen como **subcuenta real** bajo el master de Sushi Service, fondeada con transferencia explícita de saldo (los balances de subcuenta son independientes). Límite: 1000 subcuentas (ampliable por soporte). |
| **Mover número de Sushi Fun a subcuenta** | **NO se hace ahora.** Twilio no tiene proceso self-service entre cuentas no relacionadas; requiere ticket a soporte + riesgo de re-aprobación de Meta. Queda para después, sin presión de fecha. |
| **n8n** | Se mantiene **1:1 por restaurante** (cada workflow sigue con su propio número Twilio). Solo se agrega `tenant_slug` hardcodeado. **Sin tocar el VPS** (ver §3). |
| **Rollback** | El Supabase + Vercel viejos de Sushi Fun quedan **apagados pero sin borrar**. Rollback = repuntar DNS + reactivar sus workflows n8n viejos. |

---

## 2. Inventario de cambios de código

### 2.1 Base de datos (Milestone 1) — SQL YA GENERADO ✅

Correr en el SQL Editor del Supabase de Sushi Service, **una por una, en orden**, revisando el `NOTICE`.
Detalle y queries de verificación en el [PREFLIGHT](./2026-07-04-multitenant-PREFLIGHT.md).

1. `00024_tenants.sql` — tabla `tenants` + `current_tenant_id()` + `is_super_admin()`.
2. `00025_add_tenant_id.sql` — `tenant_id` nullable en 18 tablas + drop de uniques globales.
3. `00026_multitenant_rls.sql` — drop dinámico de TODAS las políticas + `tenant_all_*`.
4. `00027_wallet.sql` — billetera COP.
5. `00028_seed_sushi_service.sql` — seed Sushi + backfill + DEFAULT puente + NOT NULL + uniques compuestos + tag `auth.users`.

**Cambio nuevo a agregar (no estaba en el plan de junio):** columna `domain` en `tenants`.
Crear `00029_tenant_domain.sql`:

```sql
-- 00029: dominio por tenant para resolución por host (multitenant sin /slug/ en URL).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS domain text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain) WHERE domain IS NOT NULL;

-- Asignar el dominio de Sushi Service (tenant sembrado en 00028).
UPDATE tenants SET domain = 'clubsushiservice.constelarys.com'
WHERE slug = 'sushi-service';
```

### 2.2 Código tenant-aware (Milestone 2) — EL TRABAJO REAL

**Principio:** toda función de servicio que lea o escriba datos recibe `tenantId` y lo aplica en la query.
Fuente del `tenantId`:
- **Rutas públicas / webhooks** → resuelto por dominio (middleware) o por `tenant_slug` del body (n8n).
- **Dashboard autenticado** → `app_metadata.tenant_id` del JWT (`current_tenant_id()` en RLS; en código, del user).

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `src/lib/tenant.ts` (nuevo) | `getTenantBySlug`, `getTenantByDomain`, `getTenantFromJwt`, `getTenantByMessagingService` | — |
| `src/middleware.ts` | Resolver tenant por `host` header → inyectar en request/headers | medio |
| `src/services/settings.service.ts` | 🔴 `getSettingValue`/`getMultipleSettings` ahora requieren `tenantId` (PK de `admin_settings` es `(key, tenant_id)`). Usado en TODAS partes. | **alto** |
| `src/services/customer.service.ts` | `findCustomerByPhone`, `createCustomer`, `incrementVisit`, `update*IfNull`, opt-out → filtrar/insertar `tenant_id` | alto |
| `src/services/visit.service.ts` | `createVisit` inserta `tenant_id` | medio |
| `src/services/points.service.ts` | `awardVisitPoints`, `awardWelcomeBonus` | medio |
| `src/services/reward-tiers.service.ts` | `evaluateNewTier`, `getNextTier`, `buildTiersRoadmap`, `updateCustomerTier` | medio |
| `src/services/campaign.service.ts` | `findBirthdayCustomers`, reactivación, `getOrCreateTodayCampaign`, `recordCampaignMessage`, etc. | medio |
| `src/app/api/check-in/**` | Resolver tenant por dominio, pasar a servicios | alto |
| `src/app/api/webhook/delivery/route.ts` | Leer `tenant_slug` del body → resolver tenant → filtrar todo | alto |
| `src/app/api/webhook/twilio-incoming/route.ts` | Resolver tenant por `To`/`MessagingServiceSid`; brand/link desde `tenant.config` (hoy usa `NEXT_PUBLIC_BRAND_NAME` global) | medio |
| `src/app/api/cron/birthday/route.ts` | Leer `?tenant=slug`, filtrar por `tenant_id` | bajo* |
| `src/app/api/cron/reactivation/route.ts` | Leer `?tenant=slug`, filtrar por `tenant_id` | bajo* |
| Dashboard analytics (hooks/queries) | Filtrar por `tenant_id` del JWT | alto |

\* *Sushi Fun no tiene los cron activos; baja urgencia. Pero el filtro debe existir antes de activarlos.*

### 2.3 Quitar el DEFAULT puente (después de M2)

Una vez el código inserta `tenant_id` explícitamente en todos lados, quitar los `DEFAULT` de las 18
tablas (ver 00028) para que un INSERT sin tenant **falle en vez de contaminar Sushi Service**.
Crear `00030_drop_tenant_defaults.sql` cuando M2 esté verificado.

### 2.4 Twilio subcuentas + billetera (Milestone 3) — para el cliente del lunes

`src/lib/twilio/subaccounts.ts`, `src/services/wallet.service.ts`, rutas `/api/super-admin/*` y panel.
Detalle completo en el [plan de junio, Milestone 2/Task 6–9](./2026-06-23-multitenant-migration.md).
No bloquea la migración de esta noche; se necesita antes de facturar/recargar al cliente nuevo.

---

## 3. n8n — cómo resolver las variables SIN tocar el VPS

### El problema (causa raíz)

Los 3 workflows referencian variables `$env.*` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`RESTAURANT_API_URL`, `WEBHOOK_DELIVERY_SECRET`, `CRON_SECRET`, `OPENAI_API_KEY`). En n8n las `$env`
son **globales al contenedor Docker** — un único valor por nombre para toda la instancia, inyectado en
el VPS vía docker-compose/Caddy. Antes, Sushi Fun necesitaba valores **distintos** (otro Supabase, otra
app, otro secret) → obligaba a meter variables nuevas con otros nombres y reiniciar el contenedor. **Esa
era la fricción que bloqueó activar Sushi Fun.**

### Por qué la migración lo elimina

Tras migrar, ambos restaurantes comparten **el mismo Supabase (el de Sushi Service), la misma app y los
mismos secrets**. Entonces **todos los `$env.*` valen igual para los dos**. Lo único que difiere por
restaurante es `tenant_slug`, que va **hardcodeado dentro del workflow**, no como variable. Como el VPS
ya tiene los valores de Sushi Service configurados —y ésos SON los valores compartidos— **no vuelves a
tocar el VPS/Docker/Caddy.**

> Las `$env` actuales de Sushi Service en el VPS ya son correctas:
> - `SUPABASE_URL` = Supabase de Sushi Service = **el compartido**. ✅ sin cambio.
> - `RESTAURANT_API_URL` = app de Sushi Service = **la compartida** (mismo proyecto Vercel). ✅ sin cambio.
> - `WEBHOOK_DELIVERY_SECRET` / `CRON_SECRET` / `SUPABASE_ANON_KEY` / `OPENAI_API_KEY` = compartidos. ✅ sin cambio.

### Activar Sushi Fun esta noche (cero VPS)

1. Su workflow `domicilios_whatsapp` **ya referencia los mismos `$env.*`** → no se toca ninguna variable.
2. En el nodo que hace `POST {{ $env.RESTAURANT_API_URL }}/api/webhook/delivery`, agregar al JSON body
   un campo fijo: `"tenant_slug": "sushi-fun"`.
3. Su trigger de Twilio ya apunta al número de Sushi Fun → se deja igual.
4. Activar. Listo.

Sushi Service: mismo cambio, `"tenant_slug": "sushi-service"`, en su workflow.

### Onboarding de cliente nuevo (cero VPS)

1. Duplicar los 3 workflows plantilla.
2. Cambiar un string hardcodeado: `"tenant_slug": "nuevo-cliente"`.
3. Apuntar el trigger de Twilio del workflow al número de la subcuenta nueva.
4. Activar.

**Único caso futuro en que tocarías el VPS:** rotar un secret compartido o cambiar la URL del Supabase/app
compartidos. Nunca por-restaurante.

### Cambio en el código que habilita esto

`/api/webhook/delivery` debe **leer `tenant_slug` del body**, resolver el `tenant_id`, y filtrar/insertar
con él. Los cron leen `?tenant=slug` de la URL. Sin este cambio, el `tenant_slug` del workflow se ignora.

---

## 4. Runbook del corte (ventana 11pm–11am)

### Fase A — Preparación (durante el día, SIN tocar producción)

- [ ] Terminar Milestone 2 (código tenant-aware) en la rama `fix/auditoria-julio-2026`.
- [ ] Crear `00029_tenant_domain.sql`.
- [ ] `npx tsc --noEmit` limpio.
- [ ] Probar local: check-in + delivery + dashboard resolviendo tenant por dominio/slug.
- [ ] Preparar el dump de datos de Sushi Fun (`pg_dump --data-only` de las 18 tablas de negocio).
- [ ] Tener listo el script que inyecta `tenant_id = <uuid-sushi-fun>` en cada INSERT del dump.
- [ ] Listar los usuarios admin/mesero de Sushi Fun a recrear (normalmente 1–3).

### Fase B — Corte (desde 11pm)

1. [ ] **Pausar** los workflows n8n de ambos restaurantes (Twilio reintenta webhooks fallidos; un apagado corto es seguro).
2. [ ] Correr `00024 → 00025 → 00026 → 00027 → 00028 → 00029` en el Supabase de Sushi Service, verificando cada `NOTICE`.
3. [ ] Verificar con las queries del PREFLIGHT (18 tablas con tenant_id, 18 políticas `tenant_all_*`, cero clientes sin tenant, admins tageados).
4. [ ] Insertar tenant **Sushi Fun**: `INSERT INTO tenants (slug, name, business_type, domain, is_active) VALUES ('sushi-fun', 'Sushi Fun', 'restaurant', 'clubsushifun.constelarys.com', true);` + guardar su SID/token Twilio.
5. [ ] Importar el dump de Sushi Fun con `tenant_id` inyectado (los UUID de filas no chocan entre proyectos).
6. [ ] Recrear usuarios admin/mesero de Sushi Fun en el Auth compartido, con `app_metadata.tenant_id = <uuid-sushi-fun>`.
7. [ ] **Deploy** de la app compartida (Vercel de Sushi Service) con los cambios de M2.
8. [ ] Agregar el dominio `clubsushifun.constelarys.com` al proyecto Vercel compartido (repuntar su CNAME).
9. [ ] En n8n: agregar `tenant_slug` a cada workflow (§3) y **reactivar**.
10. [ ] **Quitar los DEFAULT** (`00030`) una vez confirmado que los writes traen `tenant_id`.

### Fase C — Smoke test de aislamiento (antes de 11am)

> Objetivo: probar en vivo que ningún dato cruza entre Sushi Service y Sushi Fun.
> Si CUALQUIER paso falla → rollback (ver abajo). NO declarar go-live hasta que todos pasen.

**Paso 0 — Re-login de admins.** Cada admin cierra y vuelve a iniciar sesión (el JWT necesita
`app_metadata.tenant_id`). Sin esto el dashboard se ve vacío.

**Paso 1 — Baseline en SQL (antes de tocar nada).** En el SQL Editor:
```sql
-- Conteo por tenant. Anota estos números.
SELECT t.slug, count(c.id) AS clientes
FROM tenants t LEFT JOIN customers c ON c.tenant_id = t.id
GROUP BY t.slug ORDER BY t.slug;

-- No debe haber NADA sin tenant en las tablas clave:
SELECT 'customers' tbl, count(*) FROM customers WHERE tenant_id IS NULL
UNION ALL SELECT 'visits', count(*) FROM visits WHERE tenant_id IS NULL
UNION ALL SELECT 'staff_users', count(*) FROM staff_users WHERE tenant_id IS NULL
UNION ALL SELECT 'admin_settings', count(*) FROM admin_settings WHERE tenant_id IS NULL;
-- Esperado: 0 en las 4.
```

**Paso 2 — Check-in por dominio.** Con un teléfono de prueba **T1**:
- Escanear/abrir el check-in en `clubsushifun.constelarys.com` y registrar **T1**.
- Verificar que cayó en Sushi Fun, NO en Sushi Service:
```sql
SELECT phone, tenant_id, (SELECT slug FROM tenants WHERE id = c.tenant_id) AS tenant
FROM customers c WHERE phone = 'T1';
-- Esperado: tenant = 'sushi-fun'
```
- Repetir con teléfono **T2** en `clubsushiservice.constelarys.com` → debe caer en `sushi-service`.
- **Cross-check clave:** el mismo T1 en el dominio de Sushi Service debe crear un cliente NUEVO
  (no encontrar el de Sushi Fun). Confirma que el teléfono ya no es único global.

**Paso 3 — Delivery por número Twilio.** Enviar un mensaje de domicilio de prueba al número de
**cada** restaurante (vía su workflow n8n con su `tenant_slug`). Verificar que cada cliente cae en
su tenant y que el WhatsApp de respuesta sale del **número correcto** (el de ese restaurante).

**Paso 4 — Aislamiento del dashboard.** Login como admin de Sushi Fun → el conteo de clientes debe
coincidir con el baseline de Sushi Fun (Paso 1), **no** con la suma. Abrir lista de clientes,
campañas, staff, reward-tiers, ajustes → nada de Sushi Service visible. Repetir con admin de Sushi Service.

**Paso 5 — Campañas/crons.** Disparar el cron de cumpleaños con `?tenant=sushi-fun` → revisar
`campaign_messages`/`message_logs`: solo clientes de Sushi Fun, `tenant_id` correcto:
```sql
SELECT tenant_id, count(*) FROM message_logs
WHERE created_at > now() - interval '15 min' GROUP BY tenant_id;
```

**Paso 6 — Quitar el DEFAULT puente.** Solo si TODO lo anterior pasó: correr `00030_drop_tenant_defaults.sql`.
Vuelve a hacer un check-in de prueba → debe seguir funcionando (confirma que los writes traen tenant_id).

### Rollback

Si algo cruza datos o falla: DNS de `clubsushifun.constelarys.com` de vuelta a su Vercel viejo +
reactivar sus workflows n8n viejos (apuntando a su Supabase viejo). Nada se borró. Los datos
importados a Sushi Fun en el compartido se pueden dejar (aislados) o borrar por `tenant_id`.

### Rollback

DNS de `clubsushifun.constelarys.com` de vuelta a su Vercel viejo + reactivar sus workflows n8n viejos
(apuntando a su Supabase viejo). Nada se borró.

---

## 5. Riesgos abiertos

| Riesgo | Mitigación |
|--------|-----------|
| M2 no alcanza a terminarse hoy | Sin M2 no entra Sushi Fun sin mezclar datos. Si no alcanza, el cliente del lunes puede entrar como subcuenta nueva/limpia mientras Sushi Fun espera; decidir con tiempo, no a las 3am. |
| `settings.service` toca demasiadas llamadas | Es el cambio de mayor superficie. Hacerlo primero y compilar antes de seguir. |
| Saldo Twilio de Sushi Fun en $0 | Independiente de la migración; recargar su cuenta separada. Avisar al dueño antes de cualquier cambio que afecte su número. |
| Mensajes entrantes durante el corte | Ventana anunciada + Twilio reintenta. No cambiar webhook a mitad de mensaje. |
| Google Contacts sync | Nunca se activó; ignorar por ahora. |

---

## 6. Estado

- [x] Migraciones 00024–00028 generadas y auditadas (PREFLIGHT).
- [ ] `00029_tenant_domain.sql`.
- [ ] Milestone 2 (código tenant-aware).
- [ ] `00030_drop_tenant_defaults.sql`.
- [ ] Milestone 3 (Twilio subcuentas + billetera) — para facturar al cliente nuevo.
