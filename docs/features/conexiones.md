# Conexiones — donde el negocio conecta su WhatsApp

> **Ruta:** `/dashboard/conexiones` · **Diseño:** `docs/superpowers/specs/2026-09-06-conexiones-design.md`
> **Migración:** `00054_conexiones.sql` · **Fases entregadas:** C1 y C2 (2026-09-07)

## Qué es

El **único** lugar del panel del cliente donde su negocio conecta una cuenta de un tercero.
Hoy WhatsApp; Google (responder reseñas) y Meta (campañas) entran como una tarjeta más el
día que existan. Por eso el apartado **no se llama «WhatsApp»**.

Antes de esto, el cliente no tenía ninguna pantalla que le dijera **por qué número sale su
WhatsApp**, y el alta entera vivía en el panel del operador: el operador le copiaba el
`authUrl` por WhatsApp y el dueño le dictaba de vuelta el `code` de Meta.

## Las cuatro cosas que responde

1. **Por qué número sale tu WhatsApp**, y con qué proveedor.
2. **Cuánto cupo te queda hoy** — reusa `/api/dashboard/line-budget` tal cual; la
   gobernanza de envío no se toca ni se duplica.
3. **A dónde llegan tus pedidos de domicilio** → enlace a `/dashboard/authorized-numbers`.
4. **Dónde están tus plantillas** → enlace a `/dashboard/templates`.

Más el interruptor de §18.e y, si la línea no está lista, el **alta**.

## Ámbito: MARCA, siempre

**Esta pantalla no se filtra por el selector de sede del encabezado (`LocationScope`).**
La línea es de la marca y la comparten todas las sedes (D6, re-cerrada el 2026-09-07: *un
número por marca*). Si se filtrara, elegir una sede escondería la línea y el cliente
creería que no tiene WhatsApp.

Y las plantillas **no se duplican por sede**: las 13 hablan del cliente y de sus puntos,
que son de la marca. Lo que cambia por sede viaja como **variable en el envío**, no como
una plantilla distinta aprobada aparte.

## Permisos: todos ven, solo el dueño actúa

| Quién | Ver | Actuar |
|---|---|---|
| Cualquier admin del tenant | ✅ | ❌ |
| El dueño (`tenants.owner_email` = su email de login) | ✅ | ✅ |
| Super-admin (el operador) | ✅ | ✅ |
| Nadie, si `owner_email IS NULL` | ✅ | ❌ — y **la pantalla lo dice** |

`isTenantOwner()` (`src/lib/tenant-owner.ts`) compara `lower(trim(...))` de los dos lados:
el email lo pega el operador en el alta y el otro lo teclea el dueño al registrarse; un
espacio o una mayúscula lo dejarían fuera de sus propios botones sin causa visible.

**Fail-closed en las tres puertas:** sin dueño registrado, sin coincidencia, **y ante un
fallo de base**. Esa última importa: sin destructurar `error`, un timeout del pooler daría
`data = null` — indistinguible de «este tenant no tiene dueño» — y ahí la diferencia entre
las dos lecturas es quién puede gastar dinero.

⚠️ `owner_email` **no es la cuenta de Meta**. Son dos identidades que no se tocan. Lo único
que tiene que coincidir es `owner_email` = el email con el que el dueño entra a `/login`.

⚠️ **Ningún tenant vivo tiene `owner_email` cargado hoy.** `aios_provision_tenant` lo acepta
pero es opcional. Hasta que el AIOS empiece a mandarlo, cada cliente nuevo nace con la
pantalla bloqueada — que es seguro, pero también es una llamada por cada alta.

## Los tres caminos del alta

| | **A · Coexistencia** | **B · Ya en Cloud API** | **C · Línea nueva** |
|---|---|---|---|
| Cómo se lo dice al cliente | «Ya atiendo por WhatsApp desde mi celular» | «Mi número ya está en la API» | «Quiero una línea nueva» |
| `onboarding` / `isCoexistence` | `business_app` / `true` | `api` / `false` | — |
| Compra | ninguna | ninguna | sí |
| **Implementado** | ✅ | ✅ | ❌ — lo rechaza el servidor, lo activa el asesor |

Los 25 restaurantes van por **A**. `onboarding` e `isCoexistence` salen del **mismo dato**
(`onboardingForRoute()`): no pueden contradecirse porque no son dos decisiones.

**El camino se congela** una vez declarado el número o abierto el signup. La regla vive en
el **motor** (trigger de la 00054), no solo en la UI: del lado del cliente una pestaña vieja
apuntando a otro camino es mucho más probable.

## Aislamiento — lo que impide que los mensajes de una marca salgan por el número de otra

1. **El nonce es NUESTRO.** El `state` que devuelve Zernio
   (`"user123-profile456-timestamp-callbackurl"`) lleva un timestamp y una URL pública: es
   adivinable y **no identifica al tenant**. Se genera un nonce propio de 32 bytes
   (`crypto.randomBytes`), se guarda en la fila, y al volver se comprueba que exista **y que
   sea de la marca de la sesión**. Un `code` sin nonce válido → **409, sin cerrar nada**.
   El nonce **nunca viaja al navegador**: `CONNECTION_COLUMNS` lo excluye a propósito.
2. **`expectedPhoneNumber` siempre que haya número declarado.** Es la única verificación
   real de que se conectó esa línea y no otra.
3. **Tres índices únicos** en la 00054: `zernio_account_id` (global), `signup_nonce`
   (global) y `(tenant_id, phone_e164)`. Los dos primeros son globales a propósito: dos
   marcas reclamando la misma cuenta harían que el webhook resolviera el tenant equivocado.
4. **`ZERNIO_API_KEY` es server-only.** Es una llave del *Team*: abre todos los profiles.
   El navegador del cliente habla solo con nuestras rutas.
5. **Nada en `tenants.config`**, que es público y viaja al navegador en cada página.

## Un cuerpo, dos puertas

```
connection_apply_whatsapp(tenant_id, profile, account, phone)   ← SECURITY DEFINER
    escribe tenants.messaging_provider='zernio' + los 3 zernio_*
    + la fila de tenant_connections, TODO en una transacción
    ├── aios_activate_whatsapp(slug, …)          → cáscara, para el rol aios_constelarys
    └── /api/dashboard/conexiones/whatsapp/code  → para el dueño, con su tenant de sesión
```

Si Conexiones fuera un segundo escritor con su propia validación, un día un tenant quedaría
con `messaging_provider='zernio'` y sin `account_id` — el caso exacto que `sendViaZernio()`
corta con `zernio_not_configured`. **`activa` exige cuenta Y número**, y el flip del
proveedor ocurre en esa misma transacción, nunca antes.

⚠️ La 00054 hace `DROP FUNCTION aios_activate_whatsapp(text,text,text,text)` **antes** del
`CREATE`. En Postgres, cambiarle el cuerpo a una función con parámetros distintos crea una
**SOBRECARGA** (42725), no un reemplazo — pasó con `log_review_shown_deduped()`.

## Rutas

| Ruta | Quién | Qué |
|---|---|---|
| `GET /api/dashboard/conexiones` | cualquier admin | Estado de todas las tarjetas. **Objeto plano** — las tarjetas futuras son claves nuevas, nunca elementos de una lista (la lección de `/api/dashboard/location`) |
| `POST …/whatsapp/camino` | dueño | Fija `route`. 409 si está congelado o si es el camino C |
| `POST …/whatsapp/numero` | dueño | Declara el número. Acepta `3001234567` y lo lleva a E.164 |
| `POST …/whatsapp/signup` | dueño | Genera el `authUrl` con nonce propio |
| `POST …/whatsapp/code` | dueño | Cierra la conexión. Es la puerta del callback **y** de la escotilla |
| `POST …/whatsapp/auto-respuesta` | dueño | El interruptor de §18.e |
| `GET /dashboard/conexiones/whatsapp/callback` | dueño | La **página** que recibe el redirect de Meta |

Todas resuelven el tenant **de la sesión**, jamás de un parámetro.

## El interruptor de la auto-respuesta (§18.e)

Vive en `admin_settings` con la clave **`whatsapp_auto_reply_enabled`** — PK
`(key, tenant_id)`, por eso C1 no llevó migración. **No** va en `tenants.config`, que es
público y lo edita el propio tenant.

**El default es PRENDIDA**, y es a propósito: el producto no sabe hoy qué tenants son
coexistentes (ese dato vive en el AIOS), así que elegir «apagada» cambiaría en silencio el
comportamiento vivo de las marcas de Twilio. Solo el literal `'false'` apaga.

El gate está en `twilio-incoming/route.ts`, **antes** del cooldown de 4 h: apagado, no se
toca `auto_reply_cooldown`, así que un tenant silenciado no le consume la ventana a nadie
(esa tabla no tiene `tenant_id` — defecto conocido). **Ante un fallo de base se contesta
igual**: un timeout no puede volverse un silencio nuevo para los clientes de un restaurante.

Solo el camino Twilio contesta; el webhook de Zernio nunca mandó una auto-respuesta. La
pantalla lo dice en vez de ofrecerle a un tenant Zernio apagar algo que no está prendido.

## Los seis eventos del webhook

| Evento | `status` |
|---|---|
| `whatsapp.number.verification_required` | `verificacion_pendiente` ← **el que hoy se perdía** |
| `whatsapp.number.activated` / `.reactivated` | `activa` si están cuenta y número; si no, `conectada` |
| `whatsapp.number.suspended` | `suspendida` |
| `whatsapp.number.released` | `liberada` |
| `whatsapp.number.kyc_submitted` | `kyc_pendiente` |

El handler resuelve la conexión por `zernio_account_id`, luego por `zernio_profile_id`, y
por último conserva el match actual contra `tenants.zernio_account_id`. Es **aditivo**: no
toca `handleMessageReceived()`, ni el opt-out, ni los domicilios, ni el dedup, ni el
**200 siempre** (un 5xx hace que Zernio desactive el webhook a los 10 fallos, y eso costaría
los pedidos de todos los tenants Zernio).

## Lo que NO hace

- **No enruta el envío.** Da de alta líneas; elegir por cuál sale cada mensaje es **F9**.
  Con dos líneas activas sigue saliendo todo por la principal.
- **No hay línea por sede.** No se creó `location_messaging` (la 00048 sigue reservada).
- **No compra** (camino C): sin tarifa de reventa decidida, y ninguno de los 25 lo usa.
- **No implementa `select-phone-number`**, pero lo detecta y avisa al operador.
- **No usa `/v1/connect/whatsapp/credentials`** (§3.c): re-suscribe la WABA del cliente a un
  callback de Zernio y corta el que ya tuviera. En coexistencia eso es inaceptable.

## Antes de que esto se mueva solo — prerequisitos abiertos

1. 🔴 **`ZERNIO_WEBHOOK_SECRET` tiene que COINCIDIR con la *Secret Key* del panel.** El header
   ya NO es el riesgo: quedó **CONFIRMADO el 2026-09-07 como `X-Zernio-Signature`** — lo dice el
   propio panel de Zernio debajo del campo, y `verifyZernioSignature()` ya lo lee tal cual, sin
   tocar una línea de código (diseño §9.1). Lo que sigue abierto es el secreto: el «Send test»
   del panel recibe hoy **nuestro 401**, y eso solo puede ser la variable sin configurar en
   Vercel o distinta de la del panel. ⚠️ Las variables de entorno solo toman efecto en un
   despliegue NUEVO. Por eso el estado también se puede avanzar a mano.
2. 🔴 **`registerWebhook()` es idempotente POR URL**: los seis eventos nuevos no se aplican
   solos sobre un webhook ya creado. Hay que borrarlo y volver a registrarlo.
3. 🔴 **Aplicar la 00054 en Supabase ANTES de desplegar su código.** Si no, PostgREST
   devuelve 42703 y la ruta responde **403** — parece permisos y no lo es. El `GET` degrada
   blando a propósito, así que la parte de C1 sigue viva.
4. 🟡 **La prueba E2E con Zernio**: nada de coexistencia se ha ejercido contra la API real.

## Pruebas

| Archivo | Qué cuida |
|---|---|
| `tests/unit/conexiones-permisos.test.ts` | `emailsMatch()` fail-closed, el default del interruptor, y que la tarjeta cargue para Twilio y para Zernio |
| `tests/unit/conexiones-nonce.test.ts` | Que el nonce sea largo, único y no repetido; que `onboarding` e `isCoexistence` no puedan contradecirse |
| `tests/db/conexiones.test.ts` | Que el interruptor de una marca no toque el de otra |
| `tests/db/conexiones-alta.test.ts` | Los tres índices únicos, el congelado del camino y `connection_apply_whatsapp()` — incluido que una marca **no** pueda apropiarse de la cuenta de otra |
