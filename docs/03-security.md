# Seguridad — RestaurantQR

## Autenticación
- **Método:** Supabase Auth (email + password) para administradores del dashboard
- **Flujo:** Login → Supabase genera JWT → se almacena en cookies HttpOnly vía `@supabase/ssr`
- **Sesión:** Manejo server-side con middleware de Next.js que refresca tokens automáticamente
- **Rutas públicas:** `/check-in` (no requiere auth — acceso por QR del restaurante), `/tarjeta` (tarjeta digital del cliente, identificado solo por celular — expone nombre + puntos + visitas, equivalente a `/api/check-in/status`)
- **Rutas protegidas:** `/dashboard/*` (requieren login de administrador)

## Autorización
- **Roles:** Un rol de Supabase Auth: `admin` (administradores del restaurante). Desde F7
  (multi-sede, D10) hay además un alcance de sede por encima de ese rol — ver
  § "Permisos de sede del dashboard" más abajo. No es un rol nuevo de Auth: es una tabla de
  aplicación que decide QUÉ FILAS ve un admin ya autenticado, no SI puede autenticarse.
- **Clientes:** No tienen cuenta de usuario — se identifican solo por número de celular. El número de celular actúa como identificador público (no como credencial secreta); los datos expuestos (nombre, puntos, visitas) son equivalentes a los que ya retorna `/api/check-in/status`
- **RLS:** Activado en todas las tablas. Las políticas limitan acceso según `auth.uid()` para admins
- **API Routes:** Los webhooks validan origen (números autorizados). Los cron jobs validan `CRON_SECRET`

## Helpers de RLS y el rol del AIOS Constelarys

Las policies multitenant se apoyan en dos funciones de la 00024 que leen el JWT:
`current_tenant_id()` e `is_super_admin()`. Las dos llaman a `auth.jwt()`, y ahi hay
una trampa que ya se cobro una vez.

El rol `aios_constelarys` (migracion 00035 v2) **no tiene USAGE sobre el schema `auth`**
—a proposito: es un rol de solo lectura para un sistema que corre en otra
infraestructura—. Como tampoco es dueno de las tablas ni tiene BYPASSRLS, sus `SELECT`
**si** evaluan las policies. Y sobre `tenants` conviven dos permisivas, que Postgres
combina con OR:

```sql
aios_constelarys_select_tenants  USING (true)              -- 00035 v2
super_admin_all_tenants          USING (is_super_admin())  -- 00024
```

**Que la primera sea `true` no salva a la segunda.** Postgres no garantiza cortocircuitar
el OR: al evaluar `is_super_admin()` en el contexto del rol que llama, `auth.jwt()`
revienta con `42501 permission denied for schema auth` y se cae el `SELECT` entero,
aunque la otra policy lo habria permitido.

La solucion es `SECURITY DEFINER` con `search_path` fijo, versionada en la **migracion
00040**. Es segura porque `auth.jwt()` lee `current_setting('request.jwt.claims')`, un
ajuste de **sesion** y no un permiso del rol: correr como `postgres` devuelve exactamente
los mismos claims del que llama. La funcion sigue respondiendo por el JWT del usuario.

### Reglas al tocar esto

1. **`search_path` fijo es obligatorio** en toda funcion `SECURITY DEFINER`. Sin el,
   quien pueda crear objetos cuela un `jwt()` propio en un schema anterior del path y
   secuestra la funcion.
2. **No revoques el EXECUTE a PUBLIC** de `is_super_admin()`. Las policies la invocan en
   el contexto de `anon` y `authenticated`: un REVOKE deja sin leer a la app entera.
3. **Nunca se arregla un 42501 ampliando GRANTs al rol del AIOS.** El arreglo va siempre
   en la funcion. Darle USAGE sobre `auth`, o BYPASSRLS, tira abajo el doble candado que
   la 00035 v2 monto a proposito (GRANT por columna **mas** RLS).

### Deuda abierta

`current_tenant_id()` tiene el mismo defecto y **sigue sin arreglar** (verificado el
2026-09-01 contra produccion: devuelve 42501). Hoy no rompe nada porque las dos unicas
tablas que el AIOS lee —`tenants` y `tenant_wallet_transactions`— tienen policies que
solo llaman a `is_super_admin()`. Pero el patron dominante del resto del esquema es
`USING (tenant_id = current_tenant_id() OR is_super_admin())`: **el dia que alguien le
agregue a una de esas tablas una policy `aios_constelarys_select_*` para que el panel la
lea, la lectura muere con el mismo 42501 silencioso.** Cambiarlo altera como se evalua el
RLS de cada tabla multitenant, asi que es una decision del dueno con su propia
verificacion, no un efecto colateral.

## Permisos de sede del dashboard (F7, D10)

Migración `supabase/migrations/00045_permisos_por_sede.sql`. Doc completo:
`docs/features/multi-sede.md` §3.quater. Resumen de lo que importa para seguridad:

**El aislamiento real NO está en el RLS.** Verificado que en toda la app hay **una sola** lectura
de datos por el camino autenticado (`src/app/api/dashboard/twilio-metrics/route.ts:217`); las
otras ~55 corren con `service_role`, que se salta el RLS por definición. El aislamiento lo hace el
tipo opaco `LocationScope` (`src/lib/location-scope.ts`): las firmas de los servicios pasan de
`(tenantId: string)` a `(scope: LocationScope)`, y ese tipo **solo** lo puede fabricar
`requireLocationScope()`, que resuelve el alcance en el servidor. Ningún otro código puede
construir uno con un literal o un `as` — lleva una marca de un `Symbol()` real, creado y no
exportado en ese módulo.

**Las tres redes, en orden de fuerza real:**

1. El compilador — una ruta que se olvida del filtro no compila.
2. `getUnscopedServiceClient()` (`src/lib/supabase/unscoped.ts`) — el nombre feo hace visible,
   en el `import`, cuándo una lectura decide ser de la marca a propósito.
3. `tests/unit/location-scope-allowlist.test.ts` — falla si aparece un import nuevo de (2) que
   nadie revisó. Es la red más débil: detecta el olvido después de escribirlo.

**El RLS sí se actualizó, como red barata.** La 00045 crea `dashboard_user_locations` (el
alcance de cada usuario) y, sobre cada tabla de `public` con `tenant_id` **y** `location_id` a la
vez (autodescubierta por catálogo, `restaurant_events` excluida a propósito — ahí NULL significa
"toda la marca", no "sede desconocida"), una policy `AS RESTRICTIVE`:

```sql
CREATE POLICY sede_visible_<tabla> ON <tabla> AS RESTRICTIVE FOR ALL TO authenticated
  USING      (is_super_admin() OR can_see_location(location_id))
  WITH CHECK (is_super_admin() OR can_see_location(location_id));
```

`RESTRICTIVE`, no una permisiva nueva, a propósito: Postgres combina las permisivas con OR y les
aplica AND con las restrictivas. Sobre la `tenant_all_*` de la 00026 (`T ∨ S`), esto da
`(T ∨ S) ∧ (S ∨ C) ≡ S ∨ (T ∧ C)` sin **DROPear ni reescribir** una sola policy existente — y una
policy `RESTRICTIVE` es matemáticamente incapaz de conceder, solo de quitar filas: "no puede
conceder más de lo que concedía antes" pasa de promesa a propiedad del motor.

**Los tres helpers nuevos** (`current_dashboard_user_id()`, `tenant_active_location_count()`,
`can_see_location()`) nacen `SECURITY DEFINER` con `search_path` fijo — la Regla nº1 de esta
sección — y **conservan** el `EXECUTE` a PUBLIC — la Regla nº2: las policies los invocan como
`anon`/`authenticated`, y revocárselo las dejaría sin leer. `can_see_location()` llama
`current_tenant_id()` (00024, la que tiene el defecto documentado arriba) **desde dentro de su
propio contexto `SECURITY DEFINER`**, donde sí resuelve sin 42501 — eso NO arregla la deuda de
`current_tenant_id()` para el resto del esquema, solo la rodea en este único camino.

**El fail-safe (§5.1) está implementado DOS VECES a propósito**, en dos motores distintos:
`can_see_location()` en SQL (para el RLS) y `decideLocationScope()` en TypeScript puro (para el
camino real, `service_role`). Sin fila y ≤1 sede activa de la marca → ve la marca; sin fila y ≥2
→ 403; `role='brand'` → todo, incluido el cubo *"Sin sede"*; `role='location'` → solo sus sedes,
**nunca** `location_id IS NULL`. Un fail-safe absoluto ("sin fila, nada") habría dejado fuera a
los admins de los 4 tenants vivos el día del despliegue; el trigger
`trg_restaurant_locations_estampa_marca` estampa `role='brand'` a los usuarios existentes en el
instante en que nace la 2ª sede, para que el 403 sea la red y no el camino normal.

**Un hueco que esta fase encontró en el arnés de tests, no en producción:**
`tests/setup/bootstrap.sql` creaba el rol `authenticated` pero nunca le daba `USAGE ON SCHEMA
auth` (Supabase real sí se lo da). Sin ese GRANT, `tests/db/multisede-permisos.test.ts` —la
primera prueba de este repo en correr RLS completo con `SET ROLE authenticated`— habría fallado
con un `42501` que era del arnés, no del esquema. Se agregó el GRANT al bootstrap.

## Variables de Entorno
| Variable | Exposición | Protección |
|----------|-----------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente (pública) | Solo lectura vía RLS |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente (pública) | Limitada por políticas RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor | NUNCA exponer al cliente |
| `TWILIO_ACCOUNT_SID` | Solo servidor | En .env.local |
| `TWILIO_AUTH_TOKEN` | Solo servidor | En .env.local |
| `TWILIO_WHATSAPP_NUMBER` | Solo servidor | En .env.local |
| `CRON_SECRET` | Solo servidor | Valida peticiones a /api/cron/* |
| `WEBHOOK_DELIVERY_SECRET` | Solo servidor | Fail-closed: sin él `/api/webhook/delivery` responde 503 |
| `OPENAI_API_KEY` | Solo servidor | Parseo con IA de los domicilios. **NUNCA con prefijo `NEXT_PUBLIC_`.** Solo la lee `src/lib/openai/client.ts`, desde API Routes |

## Validaciones de Entrada
- **Número de celular:** Formato colombiano validado (10 dígitos, prefijo 3)
- **Nombre:** Sanitizado, longitud mínima 2 caracteres
- **Fecha de nacimiento:** Formato válido, no futura
- **Webhook de domicilios:** Valida que el número remitente esté en `authorized_numbers` **del
  tenant que resuelve el número destino** (`.eq('tenant_id', ...)` a mano: el `service_role` no
  aísla). Desde la Fase 2 de §25 el mensaje del operador se parsea **dentro del producto** con
  OpenAI y se registra sin salir a n8n; el texto libre del operador **nunca** se interpola en
  SQL ni se ejecuta — va al `user` message del modelo y todo lo que vuelve pasa por
  `parseDeliveryAiJson()`, que valida tipo por tipo. Ver `docs/features/delivery-ai-parsing.md`
- **Fallos de domicilio:** ninguno es silencioso. Todo pedido que no llega a la base deja una
  línea `[Delivery][FALLO]` con el motivo real (§24). El detalle técnico del error **no** se le
  muestra al operador: recibe una categoría de acción («reenvía el pedido» / «avisa al
  administrador»), nunca el mensaje crudo de OpenAI
- **Cron jobs:** Valida header `Authorization: Bearer {CRON_SECRET}`
- **Webhook de Zernio** (`/api/webhook/zernio`, tenants `messaging_provider='zernio'`): firma HMAC-SHA256
  obligatoria (`X-Zernio-Signature`, alias `X-Late-Signature`) contra `ZERNIO_WEBHOOK_SECRET`, comparación
  en tiempo constante. Zernio trata su propia firma como OPCIONAL (solo firma si se configuró un
  `secret` al crear el webhook) — este proyecto la exige SIEMPRE: sin header o sin
  `ZERNIO_WEBHOOK_SECRET` configurado, se rechaza con 401 en vez de aceptar el webhook sin firmar. Ver
  `src/lib/zernio/webhooks.ts` y `docs/features/zernio-messaging.md`.

## Rate Limiting

| Ruta | Límite | Mecanismo |
| ---- | ------ | --------- |
| `POST /api/check-in` | lookup 30/min, register 5/h, checkin 20/min por IP | `rateLimit()` en-memoria |
| `GET /api/check-in/status` | 40/min por **teléfono** | `rateLimit()` en-memoria (anti-enumeración) |
| `GET /api/public/customer-card` | 30 req/min por IP | `rateLimit()` en-memoria |
| `GET /tarjeta` (SSR) | 30 req/min por IP | `rateLimit()` al inicio del Server Component |
| `POST /api/webhook/delivery` | 60/min por IP | `rateLimit()` en-memoria |

> **`/api/check-in/status` se limita por teléfono, no por IP**, a propósito: el celular del cliente hace polling cada 5s (~12/min) mientras espera al mesero, y varios clientes comparten el WiFi del local o el NAT del operador móvil. Limitar por IP rompería el polling legítimo; limitar por teléfono bloquea la enumeración de la base (probar números secuenciales para extraer nombre/puntos/visitas) sin afectar el uso real.

> El rate-limit en memoria no se comparte entre instancias de Vercel (serverless). Para producción a escala real, migrar a Upstash Redis. Para el MVP (3 restaurantes, ~100 check-ins/día) es suficiente como barrera anti-abuse.

## Aislamiento entre tenants — el DEFAULT puente de `tenant_id` (00028/00030)

**Auditado 2026-09-03** (`docs/superpowers/specs/2026-09-03-default-puente-tenant.md`, doc
completo con inventario línea por línea). Resumen para quien busque esto por seguridad:

`customers.tenant_id` y otras 17 columnas (ver lista abajo) tienen hoy en producción un
`DEFAULT` puesto por `supabase/migrations/00028_seed_sushi_service.sql:49` que apunta al UUID
de Sushi Service (`a1b2c3d4-e5f6-7890-abcd-ef1234567890`). Es un puente deliberado de julio de
2026 para que el código pre-multitenant siguiera insertando sin pasar `tenant_id`. La migración
que lo retira, `supabase/migrations/00030_drop_tenant_defaults.sql`, **existe en el repo pero
nunca se aplicó** — verificado por el dueño contra la base real.

**Mientras el DEFAULT siga puesto:** cualquier `INSERT` a una de las 18 tablas
(`customers`, `visits`, `rewards`, `authorized_numbers`, `campaigns`, `campaign_messages`,
`admin_settings`, `restaurant_events`, `restaurant_locations`, `reward_tiers`,
`point_transactions`, `mystery_box_results`, `mystery_box_global_caps`, `staff_users`,
`staff_devices`, `message_logs`, `reward_redemptions`, `imported_contacts`) que por descuido no
pase `tenant_id` **no falla — cae calladito en Sushi Service**, sin error, sin log, indistinguible
de un dato legítimo de ese tenant hasta que alguien lo vea en el dashboard equivocado. Es una fuga
silenciosa entre tenants, no un bug que se note solo.

**Estado auditado del código (2026-09-03):** las 26 escrituras `.insert()`/`.upsert()` de `src/`
a esas 18 tablas, las 4 funciones `SECURITY DEFINER` del AIOS (`aios_provision_tenant` y
relacionadas, `supabase/migrations/00036_zernio_provider.sql`) y los 3 scripts de onboarding
manual (`scripts/seed-new-tenant.sql`, `scripts/alta-frangal.sql`, `scripts/seed-demo-tenant.sql`)
pasan `tenant_id` explícito en el 100% de los casos — ninguno depende del DEFAULT hoy. El riesgo
no es que algo se rompa al quitarlo; es que **nada avisa** si un código futuro, un script ad-hoc o
una edición manual en el Table Editor de Supabase se olvida de `tenant_id` mientras el puente siga
ahí. Ver el doc de la auditoría para la secuencia segura de la ventana, el SQL de solo lectura
para detectar datos ya mal atribuidos, y la reversión (una sola línea de `SET DEFAULT` por tabla,
sin pérdida de datos).

**Regla para quien toque estas 18 tablas de aquí en adelante:** todo `INSERT`/`UPSERT` nuevo
DEBE pasar `tenant_id` explícito, exactamente como ya lo hace cada caso existente — el DEFAULT no
es una red de seguridad a la que apoyarse, es una deuda pendiente de cerrar.

## Fallos silenciosos de base de datos — error indistinguible de vacío

**Auditado y cerrado 2026-09-03** (sesión de corrección dedicada, fuera de `dashboard/**` y
`supabase/migrations/`). Resumen del patrón para que no vuelva a colarse.

`supabase-js` **no lanza excepciones**: devuelve `{ data, error }`. Todo el código que escribía

```ts
const { data: x } = await supabase.from('staff_users')…
if (!x) return no_autorizado()
```

hacía que un timeout del pooler, una policy de RLS o una columna que no existe (`42703` — el
caso real si una migración se despliega en el orden equivocado, ver `00044` en
`docs/features/multi-sede.md`) produjeran **exactamente el mismo `null`** que "no lo encontré".
El código seguía por la rama del caso feliz-vacío: sin log, sin alerta y sin fallar. Un fallo de
base quedaba indistinguible de un resultado vacío legítimo.

Tres formas del mismo bug, de más a menos común:
- **Sin destructurar `error`** — `const { data: x } = await supabase...`.
- **`error` destructurado pero nunca comprobado**, o fundido con el caso vacío en el mismo `if`.
- **El resultado de un `.insert()`/`.update()` descartado entero** — una ESCRITURA que puede
  fallar sin que nadie se entere; peor que en una lectura, porque no hay reintento posible.

**Lo que NO es este bug:** en muchísimos sitios `null` significa legítimamente "no existe" y esa
rama es correcta. El arreglo nunca fue "todo `null` es un fallo" — fue que el error deje de
compartir esa rama con el vacío.

### El helper — `src/lib/db-failure.ts`

```ts
import { isDbFailure, isNoRows, logDbFailure } from '@/lib/db-failure'

const { data, error } = await supabase.from('staff_users').select(...).maybeSingle()
if (isDbFailure(error)) {
  logDbFailure({ scope: 'StaffAuth', reason: 'staff_lookup_error', error, context: { tenant: tenant.slug } })
  return NextResponse.json({ error: 'Problema técnico', message: '…' }, { status: 503 })
}
if (!data) { /* la rama de "no existe" de siempre, sigue siendo correcta */ }
```

- `isDbFailure(error)` es `true` para un fallo real y `false` para `PGRST116` (el "cero filas"
  de `.single()`) — por eso el patrón recomendado es `.maybeSingle()` en vez de `.single()`: un
  vacío legítimo llega como `{ data: null, error: null }` y todo `error` que quede es de verdad.
- `logDbFailure()` escribe en el formato que ya usaba el repo: `[Scope][FALLO] reason=… code=…
  detalle="…"` (el mismo que `[Delivery][FALLO]` de `delivery.service.ts`, que es el precedente
  de este arreglo — Fase 2 de §25, sobre `authorized_numbers`).

### La regla

Si hay `error`, se registra con contexto y **se falla de forma visible** (se propaga con
`throw`, o la ruta responde con un status distinto al del caso vacío — típicamente **503**, no
el 401/403/404 que usaría el vacío). Perder algo en silencio es peor que fallar ruidosamente —
es la promesa de §24 del doc de requerimientos. El 503 importa tanto como el log: si un fallo de
auth responde el mismo 401/403 que una credencial mala, el usuario concluye que se equivocó y
reintenta con la misma credencial buena — el incidente queda invisible aunque esté en el log.

**Dónde ya está aplicado** (ver `CHANGELOG.md`, entrada de esta sesión, para la lista completa):
autenticación de mesero y dispositivo (`staff-auth.ts`, `check-in/route.ts`, `staff/login`,
`staff/me`, `staff/stats`, `staff/device/register`, `staff/device/verify`), resolución de
tenant/sede (`lib/tenant.ts`), `settings.service.ts` (ahora **lanza** en error real — antes un
fallo de base podía apagar `checkin_mode='staff_verified'` en silencio), y los servicios de
escritura de puntos, premios, campañas, billetera y cola de envío.

**Dónde queda pendiente:** el resto de `src/app/api/dashboard/**` (fuera del alcance de esta
sesión — ver `ESTADO.md` §4 para la lista concreta archivo:línea que le toca a la sesión
de multi-sede F7).

**Tests:** `tests/unit/db-failure.test.ts` — compara explícitamente "vacío" vs "fallo" sobre los
mismos call sites (`settings.service.ts`, `staff-auth.ts`), para que una regresión futura que
vuelva a fundir los dos casos ponga la suite en rojo.

## Reglas INVIOLABLES
- NUNCA hardcodear credenciales en el código
- NUNCA exponer `SUPABASE_SERVICE_ROLE_KEY` en el cliente
- NUNCA desactivar RLS sin autorización explícita
- NUNCA hacer deploy sin checklist de seguridad
- SIEMPRE validar input en servidor (no confiar en cliente)
- SIEMPRE usar tipos TypeScript para prevenir inyección
- SIEMPRE sanitizar datos de WhatsApp antes de guardar en DB
- SIEMPRE validar origen de webhooks (números autorizados)
