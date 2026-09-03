# Requerimientos — Agosto 2026: Migración a Zernio + 7 Mejoras de Producto

> **Estado:** 🔵 CONTEXTO RECOPILADO — pendiente de decisiones finales y desarrollo. Nada de esto está codeado todavía.
> **Fecha:** 2026-08-28
> **Origen:** solicitud directa del dueño del producto (chat) + auditoría de código con 10 agentes en paralelo
> **Método:** AInnovate v2 (Documentation-Driven Development)

Este documento es la **fuente de verdad** de lo pedido el 28-ago-2026. El encargo tiene dos partes:
(A) dejar de depender de Twilio y migrar a **Zernio** para que dar de alta un cliente nuevo sea
self-service, y (B) siete mejoras de producto que hoy están a medias o directamente sin construir.
El propio dueño pidió explícitamente que este documento **no incluyera código todavía** — solo
contexto, archivos exactos a revisar, y las preguntas que le corresponden a él responder antes de
que una IA empiece a desarrollar.

> **📌 ¿Eres una IA que retoma este trabajo?**
> Lee primero **[§0](#0-contexto-y-decisiones-ya-tomadas-2026-08-28)** y el **[Handoff final](#handoff--cómo-continuar-sin-releer-el-repo-entero)**.
> Cada sección de abajo ya cita rutas de archivo exactas y líneas — no hace falta re-grepear el
> repo para orientarse, solo para verificar que el código no cambió desde esta fecha.

---

## 0. Contexto y decisiones ya tomadas (2026-08-28)

**Tenants activos hoy** (según el dueño): Sushi Fun, Sushi Service Barra, Don Alirio Café de Origen,
Frangal Café Francés (cortesía, sin Twilio/WhatsApp). Cruzado con el código: Sushi Fun sigue en
**infraestructura legacy separada** (su propio Supabase/Vercel/repo, nunca entró al multitenant —
ver §2). Sushi Service, Don Alirio y Frangal SÍ comparten el proyecto multitenant. **"Sushi Service
Barra" no se pudo identificar en el código** — no hay certeza de si es una sede (`restaurant_locations`)
del tenant Sushi Service o un tenant propio; queda como pregunta abierta en §2.

**Por qué migrar:** dar de alta un cliente nuevo hoy son 9 pasos manuales repartidos entre la consola
de Twilio, Meta Business Suite (verificar negocio, comprar/activar el chip físico, crear el número),
Vercel y el editor SQL de Supabase. Si se omite un paso el sistema falla en silencio — el cliente
sigue sumando puntos pero nunca puede recibir el mensaje de premio. Objetivo con Zernio: que el
cliente compre su línea y quede conectada como sender sin ese proceso manual.

**Zernio, confirmado:** es `zernio.com`. La home general engaña — se presenta como una API de gestión
de redes sociales — pero `zernio.com/phone-numbers` y `docs.zernio.com` confirman que SÍ es lo que
describe el dueño: compra self-service de línea en **54 países** (Colombia **US$16–21/mes**), con
**Calls/SMS/WhatsApp como canales activables sobre el mismo número**, KYC gestionado por Zernio,
**API REST completa + SDKs** (Node/Python/Go/Ruby/Java/PHP/.NET/Rust) con aprovisionamiento
programático, autenticación por API key (`sk_...` como Bearer), webhooks, y WhatsApp descrito como
"Templates, broadcasts, flows, groups, and calling". **No alcancé a leer la documentación específica
de WhatsApp de Zernio en profundidad** (solo la home de números y el resumen general de la doc) — antes
de diseñar la integración hace falta esa lectura dedicada (ver preguntas en §1).

**Decisiones de infraestructura ya tomadas por el dueño:**
- Repo/Vercel: **nuevo** repo (esta copia) + **nuevo** proyecto Vercel para los tenants que se den de
  alta con Zernio.
- Supabase: **el mismo** multitenant que ya comparten Sushi Service/Don Alirio/Frangal
  (`bredfyugmjjctxysnasw`) — no se crea una base nueva. Los tenants viejos (Twilio) y nuevos (Zernio)
  conviven en la misma base.
- Prioridad: **Zernio primero**. Las 7 mejoras de producto (§3–§9) quedan documentadas aquí como
  **urgentes para atacar inmediatamente después**, no en paralelo.
- Los 4 tenants actuales (Twilio) **se quedan en el sistema viejo** mientras se ejecuta la migración;
  no hay fecha aún para pasarlos a Zernio uno por uno.

**Descartado:** la carpeta sin trackear `Level 2.0/Upgrading.md` (plan de "AIOS Constelarys", un
back-office interno de ventas/CRM en un repo aparte, `luisraiAIOS`) es de **otro proyecto** y el dueño
confirmó que no es relevante aquí. Ignorarla — no borrarla sin preguntar, pero no es contexto de esta
tarea.

---

## 1. Migración de mensajería: Twilio → Zernio

**Resumen del acoplamiento actual.** NO existe una interfaz `MessagingProvider` reemplazable. Hay un
único choke-point real para el envío (`whatsapp.service.ts`), pero el modelo de datos que expone hacia
afuera es 100% Twilio-shaped (ver abajo), y hay ~15 archivos de infraestructura más sin ninguna capa
de abstracción. El núcleo de negocio (puntos, tiers, wallet, campañas, calendario) **no depende de
Twilio en sí**, solo del contrato "enviar plantilla X con variables Y" — así que si Zernio soporta un
modelo de plantillas + variables razonablemente parecido, se puede envolver todo detrás de una interfaz
nueva sin tocar ese núcleo. Si el modelo es sustancialmente distinto, también hay que tocar los
~10 call-sites de negocio que arman las variables en formato Twilio.

**Choke-point de envío:**
| Archivo | Qué hace |
|---|---|
| `src/services/whatsapp.service.ts` | Único lugar que hace `import('twilio')` y `client.messages.create`. Expone `sendTemplateMessage(phone, contentSid, variables, tenant, ...)`. Reintento propio atado al código de error **21665** de Twilio. Resuelve credenciales del tenant (subcuenta o fallback a master) — **duplicado** respecto a `lib/twilio/tenant-credentials.ts` y a una tercera copia en `calendar.service.ts`. |
| `src/lib/twilio/client.ts` | Cliente Twilio a nivel de módulo (cuenta master). |
| `src/lib/twilio/tenant-credentials.ts` | Segunda implementación de "resolver credenciales por tenant con fallback a master". |
| `src/lib/twilio/media.ts` | Codifica reglas de la Twilio Content API para el flyer del calendario (media solo variable después del dominio; ContentSid y MediaUrl mutuamente excluyentes). |
| `src/lib/validators/twilio.ts` | `validateTwilioSignature()` — reimplementa la firma HMAC-SHA1 exacta de Twilio. No reutilizable para otro esquema de firma. |

**Sin ninguna abstracción, acoplados directo a la Twilio REST API (`fetch()` crudo):**
| Archivo | Qué hace |
|---|---|
| `src/app/api/webhook/twilio-incoming/route.ts` | Webhook entrante: valida firma Twilio, parsea `whatsapp:+57...`, responde en **TwiML (XML)** crudo, reenvía el body form-encoded a n8n (que también espera formato Twilio: `Body`/`From`/`To`). |
| `src/app/api/dashboard/templates/route.ts` + `[sid]/submit/route.ts` | Feature completo de gestión de plantillas del dashboard — 100% contra la Twilio Content API cruda (crear `twilio/text`, auto-submit a aprobación WhatsApp). |
| `src/app/api/dashboard/twilio-balance/route.ts` + `src/app/api/health/twilio/route.ts` | Balance de la cuenta master vía `api.twilio.com/.../Balance.json`. |
| `src/app/api/dashboard/twilio-metrics/route.ts` | ~275 líneas: pagina `Messages.json`, calcula entregabilidad/opt-outs, `describeTwilioError()` hardcodea 15 códigos de error de Twilio/WhatsApp. Sin dato propio equivalente salvo `message_logs`. |
| `src/services/calendar.service.ts` (`assertEventTemplateUsable()`) | Fetch directo a `content.twilio.com/v1/Content/{sid}` para validar que la plantilla del evento esté aprobada. |
| `scripts/twilio-setup.mjs`, `twilio-create-text-templates.mjs`, `twilio-create-media-templates.mjs` | Alta de tenant nuevo (~744 líneas): crea Messaging Service, vincula número, configura opt-out, crea las 13 plantillas — todo vía REST crudo a Twilio. |
| `scripts/validate-env.mjs` | Exige `TWILIO_ACCOUNT_SID`/`AUTH_TOKEN`/`WHATSAPP_NUMBER` como variables obligatorias en cualquier build. |

**Modelo de datos con nombres/semántica Twilio (relevante si se decide generalizar el esquema):**
- `tenants`: `twilio_subaccount_sid`, `twilio_subaccount_auth_token`, `twilio_messaging_service_sid`, `twilio_whatsapp_number` — el concepto de "subcuenta" es específico de Twilio y puede no existir en Zernio.
- `message_logs`: columnas `template_sid`, `twilio_sid`. El **trigger de cobro de la billetera**
  (`debit_wallet_on_message_sent()`, migración `00033_wallet_debits.sql`) se dispara
  `AFTER INSERT OR UPDATE OF twilio_sid` — cobra cuando esa columna deja de ser NULL. Funcionalmente
  solo necesita "un ID de mensaje del proveedor, no-nulo", pero el nombre de columna es Twilio.
- `campaign_messages.twilio_sid`, `restaurant_events`/`campaigns.content_sid`, `admin_settings.event_template_image_sid/video_sid`.
- La **billetera en sí** (`src/services/wallet.service.ts`) es agnóstica de proveedor — no llama a
  Twilio en ningún punto, solo lleva el ledger en Postgres.

### Investigación de `docs.zernio.com` (2026-08-29/30) — respuestas a las 6 preguntas

Hecha con 4 agentes en paralelo, solo documentación pública (sin API key, sin cuenta real). Fuente
principal: el spec OpenAPI público en `docs.zernio.com/api/openapi` (~48.500 líneas), no solo las
páginas de marketing. **Hallazgo de encuadre importante:** Zernio no es un BSP de WhatsApp puro como
Twilio — su producto central es una API unificada de mensajería/publicación para **16 plataformas
sociales** (Instagram, Facebook, Telegram, etc.); WhatsApp + SMS + números de teléfono son un módulo
más dentro de eso. No cambia la viabilidad, pero sí el encuadre: no es un competidor 1:1 de Twilio,
es una plataforma más grande de la que solo usaríamos una porción.

**1. ¿Plantillas con ID opaco + variables posicionales, o nombradas?**
Ninguna de las dos como se planteaba la pregunta. El identificador es `name` (slug propio, ej.
`order_confirmation`) + `language` — no un SID opaco tipo Twilio; para migrar hay que mapear cada
`ContentSid` actual a un `name`+`language` nuevo. Y soporta **ambos** estilos de variable
(`parameter_format: POSITIONAL | NAMED`), pero al ENVIAR, los valores siempre van como **un array
plano en orden de aparición** (`templateParams: [valor1, valor2, ...]`), no como el diccionario
`{'1': ..., '2': ...}` que arma `whatsapp.service.ts` hoy. **Sí hay que tocar los ~10 call-sites** de
negocio — no hay forma de evitarlo, cambia la forma del dato que arman.

**2. ¿Concepto de subcuenta por cliente?**
No como en Twilio. Jerarquía real: **Team** (cuenta madre, un solo billing owner) → **Profile**
(la unidad de aislamiento — la propia Zernio lo recomienda como "un profile por cliente tuyo", calza
con nuestro modelo de 1 restaurante = 1 tenant) → **Account** (el número/canal individual dentro de
un profile). Pero el modelo de credenciales es **una sola API key para toda la integración**, con
aislamiento por **filtrado de `profileId`** en cada request — no credenciales completamente separadas
por cliente como Twilio SID+Token. Existen "scoped API keys" limitadas a uno o varios `profileIds`
con permiso `read`/`read-write` (nada más granular). **Sin confirmar sin cuenta real:** si una key con
scope limitado de verdad bloquea (403) el acceso directo por ID a recursos de otro profile, o solo
filtra listados — y si la facturación/saldo es un pool único por Team o algo por profile.

**3. ¿Firma de webhooks y formato de respuesta?**
HMAC-SHA256 sobre el body crudo, header `X-Zernio-Signature` (alias legado `X-Late-Signature`).
**Ojo: la firma es OPCIONAL** — si no configuras un `secret` al crear el webhook, Zernio manda sin
firmar. Nuestro handler nuevo debe exigir configurarla siempre y rechazar si falta, no asumir que
Zernio la fuerza como Twilio. Respuesta esperada: **cualquier `2xx` en menos de 5 segundos**, sin
body ni formato particular — nada de TwiML. Reintentos: hasta 7 por evento (backoff hasta 24h), y el
webhook completo se **desactiva solo tras 10 fallos consecutivos**. El payload es un **sobre JSON
anidado** (`{id, event, message: {...}, conversation: {...}, account: {...}, timestamp}`), nada
parecido al `Body`/`From`/`To` plano de Twilio.

**4. ¿n8n puede recibir el payload de Zernio tal cual?**
No. Confirmado que el formato es estructuralmente distinto (punto 3) — **hay que traducir** en el
nuevo endpoint (ya no se llamaría `twilio-incoming`) antes de reenviar a n8n, o adaptar el workflow de
n8n para leer el sobre nuevo. No es un simple passthrough como hoy.

**5. ¿El self-service cubre la verificación de Meta de punta a punta?**
**No del todo — y esto es lo más importante de toda la investigación.** Hay dos trámites distintos
que no hay que confundir: (a) el **KYC de Zernio** es regulatorio del número telefónico (el país lo
exige), nada que ver con Meta; (b) la **conexión a WABA con Meta** sí requiere que el negocio final
(cada restaurante-tenant) pase, al menos una vez, por el **Embedded Signup de Meta** — login de
Facebook + crear/conectar su WABA — igual que con Twilio hoy. El titular de marketing ("no Meta
Business verification process") se refiere a que evitas el App Review clásico y la verificación
formal con checkmark verde como bloqueante para *empezar* a enviar, no a que el restaurante no toque
nada de Meta. **Conclusión: la fricción de "ir a Meta Business Suite" no desaparece del todo con
Zernio — se reduce (Zernio orquesta el Embedded Signup dentro de su propio flujo), pero sigue
existiendo el paso de que el dueño del restaurante haga login con Facebook.** Hay una ruta alterna
("Headless Credentials") con un token de System User de Meta ya creado a mano — tampoco evita a Meta,
solo mueve el contacto fuera de Zernio.

**6. ¿Renombrar `twilio_sid`/`twilio_subaccount_*`?**
Sigue siendo una decisión de diseño nuestra, no algo que la doc de Zernio resuelva — ver la
recomendación de mantenerla pendiente hasta la fase de diseño técnico (spec).

### Lo que solo se puede confirmar con una cuenta real (no con doc pública)

1. El JSON exacto del header de media en el envío dentro de una conversación ya abierta (la doc dice
   que se "reenvía sin cambios" al formato nativo de Meta, pero no lo muestra literal).
2. **Si el payload del webhook trae `profileId`** (o algo resoluble) para enrutar un mensaje entrante
   al restaurante correcto sin una llamada extra a la API — no confirmado en la doc pública y es
   **crítico** para nuestro caso multi-tenant.
3. Si existe algún evento/campo de opt-out de WhatsApp más allá de inferirlo del código de error
   131026 dentro de `message.failed` (SMS sí tiene opt-out formal; WhatsApp no, en lo público).
4. Los límites reales de mensajería de una WABA que pasó por Embedded Signup pero no completó la
   verificación formal de negocio — si alcanzan para nuestro volumen o tarde o temprano cada tenant
   va a necesitar verificarse formalmente igual.
5. La tabla completa de precios por "cuenta conectada" pasadas las primeras 2 gratis, y el detalle
   del sandbox (si se pueden probar plantillas reales sin comprar número).

Todo esto se resuelve en cuanto tengamos la API key y una cuenta de prueba — sigue pendiente que el
dueño la comparta.

### Prueba real con la API key (2026-08-30, solo lectura)

El dueño compartió una API key real. Se guardó en `.env.local` (nunca en este doc, nunca en git) y se
hicieron 4 llamadas GET de solo lectura (`/v1/profiles`, `/v1/accounts`, `/v1/phone-numbers`,
`/v1/api-keys`) — nada de compra ni de creación de recursos, respetando la decisión de "todavía no
compres número".

**Hallazgo que cambia una decisión: esta NO es una cuenta Zernio nueva dedicada a Cada1 — es una
cuenta ya existente del dueño, compartida con al menos otro proyecto.** Evidencia: el único `profile`
que existe (`Default`) ya tiene conectada una cuenta de Instagram personal/de otro negocio, y hay una
**segunda API key en la misma cuenta llamada "Luis RAIOS"** — coincide con el `luisraiAIOS` mencionado
en `Level 2.0/Upgrading.md` (el AIOS de otra empresa del dueño). No es un problema de seguridad — es
su propia cuenta — pero si los tenants de Cada1 se dan de alta como `profile` dentro de esta MISMA
cuenta/Team, la facturación de Zernio se mezcla: según la investigación de doc pública, Zernio cobra
a nivel de Team completo, no hay saldo/factura separado por profile.

Dato aparte, no relacionado con Cada1: la respuesta de `GET /v1/api-keys` devuelve el valor completo
de la primera key creada en el campo `firstApiKey`, en texto plano — comportamiento de la propia API
de Zernio (no algo que hicimos aquí), pero vale la pena que el dueño sepa que esa key ya viajó dos
veces en claro (su mensaje + esta respuesta).

**Bueno:** `phone-numbers` confirma `numbers: []` — ningún número comprado todavía. Y hay un
**número de sandbox ya disponible, sin costo**: `+12029087457`, con una plantilla `sandbox_start`
lista — se puede usar para resolver varias de las preguntas de la lista de arriba (formato real de
webhook, comportamiento de envío) sin gastar nada.

**Decisión pendiente del dueño antes de seguir probando:** ¿los tenants de Cada1 van como `profile`
nuevos dentro de esta MISMA cuenta/Team de Zernio (más simple, pero mezcla facturación con el otro
proyecto), o se crea una cuenta/Team de Zernio dedicada solo a Cada1 (aislamiento limpio, como se
decidió para el AIOS y su Supabase separado — mismo principio)? La API pública no expone forma de
crear un Team nuevo (`GET /v1/team` y `/v1/teams` no existen) — si se quiere una cuenta aparte, sería
un signup manual con otro correo, no algo automatizable con esta key.

También se confirmó, leyendo la plantilla de un tercero por accidente al listar
`/v1/whatsapp/templates?accountId=<sandbox>`: **el número de sandbox (`+12029087457`) es compartido
entre TODOS los desarrolladores que prueban Zernio**, no es exclusivo de esta cuenta — se vieron
plantillas de otros negocios (aviso de deploy, recibo de pago, recordatorio de cita). No se creó
ninguna plantilla ni se envió ningún mensaje ahí — es zona compartida de terceros, no nuestra para
experimentar libremente.

### Código escrito (2026-08-30) — módulo aislado, sin conectar a la app todavía

Se construyó el primer módulo real de la integración, en `src/lib/zernio/` (`client.ts`,
`messaging.ts`, `webhooks.ts`) — ver el detalle completo en la entrada **v2.9.0 del CHANGELOG**.
Typecheck y lint limpios. **A propósito, esto NO toca nada existente**: `whatsapp.service.ts` y los
~10 call-sites de negocio siguen 100% en Twilio, sin ningún cambio — es la pieza nueva construida
aparte, no un swap todavía.

**Lo que falta antes de conectar esto a un flujo real:**
1. La decisión de cuenta/Team de arriba.
2. Probar `sendZernioTemplateMessage()` de punta a punta contra un número de WhatsApp real que haya
   aceptado recibir el mensaje de prueba (no se puede hacer sin un número verificado a mano — no se
   le manda un WhatsApp a un número al azar).
3. Recién con eso funcionando, diseñar el swap real: dónde vive la nueva interfaz
   `MessagingProvider` (para que Twilio y Zernio convivan mientras se migra tenant por tenant), y
   tocar uno por uno los ~10 call-sites — esa parte si es cirugía sobre código en producción y merece
   su propio spec técnico antes de tocarla, no se hace de un tirón.

**Docs relacionados a leer si se toca esta área:** `docs/04-deployment.md` (runbook de alta, incluye
que hoy hay que detectar manualmente cuál de dos modelos de aprovisionamiento de Twilio tiene la
cuenta del cliente), `docs/03-security.md`, `docs/DB_SCHEMA.md`, `docs/features/wallet-billing.md`,
`docs/features/twilio-opt-out.md`, `docs/AUDIT-12-Julio/AUDIT_WHATSAPP_MENSAJERIA.md`.

---

## 2. Arquitectura multi-tenant (contexto base para todo lo demás)

El proyecto pasó de "clone-por-cliente" (un Supabase+Vercel+repo por restaurante) a **multitenant
real en julio 2026** (v2.3.0–v2.4.2): **un solo proyecto Vercel** y **un solo Supabase compartido**
(el que originalmente era de Sushi Service, `bredfyugmjjctxysnasw`), con aislamiento por columna
`tenant_id` en 18 tablas.

- Resolución del tenant: rutas públicas por **dominio** (`getTenantByDomain`), dashboard por
  **`app_metadata.tenant_id` del JWT**, webhooks/n8n por **`tenant_slug`** o `MessagingServiceSid`,
  crons de sistema aceptan `?tenant=slug` opcional (si se omite, procesan TODOS los tenants activos).
- **No hay middleware central** que resuelva el tenant — cada ruta lo hace por su cuenta
  (`src/middleware.ts` solo refresca la sesión de Supabase).
- Marca/branding vive en `tenants.config` (jsonb), resuelto por `resolveBranding()` en
  `src/lib/branding.ts` — ver detalle en §5/§6.
- **RLS no aísla en la práctica**: las políticas `tenant_all_*` (`00026_multitenant_rls.sql`) existen,
  pero ~95% del acceso usa `service_role` (`getServiceClient()`), que **bypasa RLS por diseño** — el
  aislamiento real depende de que cada servicio filtre `tenant_id` a mano.
- **Sushi Fun quedó fuera**: nunca entró a la tabla `tenants` compartida, sigue en infraestructura
  legacy propia (su Supabase/Vercel/repo). El plan maestro de julio (`docs/superpowers/plans/2026-07-05-multitenant-MASTER.md`)
  tenía un "GATE DURO" para migrarla esa misma noche, pero se usó esa ventana para Don Alirio en su
  lugar y Sushi Fun quedó pendiente — sin que ningún doc confirme si se abandonó o solo se pospuso.
- **Frangal** se sumó en agosto 2026 (v2.8.2) como el primer tenant dado de alta *sin* Twilio/WhatsApp,
  vía `scripts/seed-new-tenant.sql` (genérico, sin trackear en git) y su instancia concreta
  `scripts/alta-frangal.sql`.
- Alta de tenant a nivel de datos hoy = correr ese script SQL a mano en el editor de Supabase, más
  pasos manuales fuera de él: usuario en Supabase Auth + tag `tenant_id` en su JWT, dominio en Vercel,
  y (si tiene WhatsApp) credenciales Twilio → recargar billetera → cargar `template_sid`.

**⚠️ Importante:** `docs/01-project-overview.md` y `docs/02-architecture.md` — los dos documentos que
`CLAUDE.md` marca como lectura obligatoria **SIEMPRE** — están **desactualizados**: siguen describiendo
el modelo viejo clone-por-cliente (ADR-005) como vigente. La fuente de verdad real hoy es
`docs/04-deployment.md`. Recomiendo actualizar esos dos docs antes de que alguien más los use como
referencia (mandamiento III/XI).

**Preguntas abiertas:**
- ¿Qué es exactamente "Sushi Service Barra"? No se encontró en el código — ¿es una sede
  (`restaurant_locations`) de Sushi Service, o un tenant propio que falta dar de alta?
- ¿Se retoma la migración de Sushi Fun al multitenant compartido, o queda permanentemente separada
  (tiene cuenta Twilio propia, no subcuenta)? Afecta si entra o no en el alcance de la migración a
  Zernio.

---

## 3. Personalización del QR

Hay **dos QRs distintos** — conviene confirmar a cuál se refiere la queja de "muy básico" antes de
tocar nada:

1. **QR Studio** (`/dashboard/qr`, menú "Código QR") — el que se imprime para las mesas. **Ya está
   bastante completo** (v1.6.0, sin cambios pendientes): 8 temas visuales por tipo de negocio, 5
   tamaños a 300 DPI, textos editables, color de acento, logo superpuesto con alta corrección de
   errores, descarga individual o masiva por mesa. Lógica en `src/lib/utils/qr-poster.ts`, UI en
   `src/app/(dashboard)/dashboard/qr/page.tsx`, doc en `docs/features/qr-studio.md`. Limitación real:
   temas cerrados (no hay editor libre de forma de módulos/marco/fondo propio), y **la config se
   guarda solo en `localStorage`** — no persiste por tenant en Supabase, se pierde al cambiar de
   equipo. El menú lo llama solo "Código QR", no "QR Studio", lo que puede explicar que no se conozca
   la feature completa.
2. **QR de la tarjeta digital** (`CustomerCard.tsx`, línea ~181, `<QRCodeSVG value={qrUrl} size={210}
   level="M" />` vía `qrcode.react`) — el que el cliente le muestra al mesero en cada visita. Este
   **sí es 100% básico**: sin color, sin logo, tamaño fijo, cero opciones.

**Pregunta:** ¿la queja es sobre el QR Studio (mesa) o sobre el QR de la tarjeta (mesero)? Si es el
Studio, ¿qué falta específicamente — forma de los módulos (dots/redondeado), marco con
call-to-action, fondo/foto propia del local, o simplemente no se sabía que ya existían temas/logo?

---

## 4. Programa de referidos

**No hay nada implementado.** Es únicamente un documento de diseño,
`docs/features/referral-program.md`, con encabezado explícito **"Estado: PLAN — NO IMPLEMENTADO"**.
No existen tablas, endpoints, páginas públicas (`/r/[code]`) ni pantalla de dashboard. Lo único que
existe es infraestructura genérica pensada para reutilizarse después: `campaign_rewards`/
`reward_grants` (migración `00031_reward_grants.sql`) y un valor `'manual'` reservado (no específico
de referidos) en el enum `GrantSource` (`src/types/database.types.ts`). Cero menciones de "referid" en
todo el `CHANGELOG.md`.

Para que sea usable end-to-end falta: schema (tablas de códigos/relaciones referidor-referido),
servicio, endpoints, landing pública, pantalla de configuración en dashboard, y plantillas de WhatsApp
nuevas (que requieren aprobación de Meta, 24–72h).

El propio plan (`docs/features/referral-program.md`, sección 8) deja 3 decisiones sin resolver:
tipo de recompensa por defecto (puntos vs. producto), si se permite referir en modo check-in "auto", y
qué plantillas nuevas se necesitan.

---

## 5. Personalización de la pantalla de teléfono + tarjeta de cliente recurrente

Son dos componentes distintos dentro de `/check-in`:

- **Pantalla 1 — ingreso de celular**: `src/components/features/check-in/CheckInForm.tsx`
  (bloque `step === 'phone'`) envuelto por `src/app/(public)/check-in/page.tsx`. **Prácticamente todo
  hardcodeado**: título "Bienvenido", textos, y colores inline en hex — cero uso de `useBranding()`
  salvo `branding.name`. La "piel" roja/rosa (#FF4D6D/#E63946) viene de clases CSS globales
  (`.premium-bg`, `.premium-card`, `.btn-premium`, `.input-premium` en `src/app/globals.css`), fijas
  para **todos** los tenants.
- **Pantalla del cliente recurrente**: `src/components/features/check-in/CustomerCard.tsx` — sí usa
  `useBranding()` (`cardBg`, `pageBg`, `name`, `staffLabel` interpolado), pero el copy exacto
  ("¡Hola, {name}!", "Este código expira en 30 minutos") sigue fijo en el código.

El sistema de branding por tenant **ya existe** (`src/lib/branding.ts` + `TenantConfig` en
`src/types/tenant.types.ts`, resuelto por dominio), pero el dashboard **solo permite editar un campo**:
`EDITABLE_KEYS = ['google_maps_url']` en `src/app/api/dashboard/tenant-config/route.ts`. Todo lo demás
(nombre, gradientes, staff label, colores) se siembra una sola vez por SQL al dar de alta el tenant
(`scripts/seed-new-tenant.sql`) y no tiene UI de edición posterior.

**Preguntas:**
- ¿"Personalizar" significa que el dueño del restaurante lo edite desde su dashboard (hay que ampliar
  `EDITABLE_KEYS` + construir UI en `settings/page.tsx`), o basta con que ustedes lo configuren por
  tenant vía SQL al alta?
- Hoy no existe campo `logo_url` en `TenantConfig` ni en ningún lado — ¿se necesita subir logo
  persistente (Supabase Storage), o los colores/gradiente bastan?
- ¿El color de la pantalla de teléfono debe salir de un campo nuevo (`accent_color`) o reutilizar
  `cardBg`/`pageBg`?

---

## 6. Sistema de branding + generación de plantillas ("wizard" de paleta/logo/tono)

> ⚠️ **La parte de "plantillas + tono" de esta sección se adelantó y se convirtió en la PRIMERA
> PRIORIDAD del proyecto — ver §12.** Lo que sigue aquí abajo describe el problema original
> (incluido el diagnóstico de que el concepto de tono no existe en absoluto); §12 lo acota a solo
> plantillas (sin logo ni paleta) y agrega el requisito de "editar = borrar y recrear". Lo de
> logo/paleta de esta sección sigue en su prioridad original, después de §12–§13 y de §3–§9.

Existe una base de datos parcial (`tenants.config` + `TenantConfig`) y una pieza de UI suelta con
paletas por tipo de negocio (`QR_THEMES` en `src/lib/utils/qr-poster.ts`, 8 temas completos con
bg/gradiente/paleta/emojis), pero **nada está conectado a un flujo de onboarding**, y el concepto de
**"tono/estilo comunicativo" (cariñoso vs. elegante-distante) no existe en absoluto** — ni en DB, ni en
código, ni en documentación. La única mención de "tono" en todo el repo es una regla **fija y global**
en `docs/PLANTILLAS.md" ("Tono: Cálido, cercano, enérgico...") que no es configurable por tenant ni se
lee desde ningún código — es solo una instrucción para el humano que redacta la plantilla a mano.

Las plantillas de WhatsApp se escriben 100% a mano (`src/app/(dashboard)/dashboard/templates/page.tsx`,
un `<textarea>` de texto libre) y se suben una por una a la Twilio Content API. No hay ningún motor que
genere copy a partir de branding/tono.

Estimación: **~25–35% reutilizable**. Lo que sí sirve de base: el modelo `tenants.config` + el patrón
de merge/whitelist (`merge_tenant_config` RPC) del endpoint de tenant-config, y `QR_THEMES` como banco
de paletas por tipo de negocio (aunque hoy es un array estático en código, no en DB, y no está
enlazado a `tenants.business_type`).

**Preguntas:**
- ¿El wizard escribe directo en `tenants.config` (ampliando `EDITABLE_KEYS`), o hace falta una
  estructura nueva de tokens de color (primario/secundario/acento) en vez de los dos strings de
  gradiente actuales?
- ¿La generación de plantillas a partir del tono se plantea vía LLM (con revisión humana antes de
  someter a aprobación de Meta) o vía una librería de plantillas fijas por combinación
  tono×tipo-de-negocio? Cada variante de texto nueva es una aprobación de Meta de 24–72h — esto
  condiciona mucho el diseño.
- ¿El logo debe persistirse server-side (Supabase Storage) y reutilizarse en tarjeta digital +
  mensajes de WhatsApp, o se mantiene el patrón actual (solo local, solo para el póster QR)?

---

## 7. Calendario de eventos — el mensaje hardcodeado

**Causa raíz exacta del problema reportado.** El texto del WhatsApp es SIEMPRE el mismo: un único
`TEMPLATE_BODY` hardcodeado en `scripts/twilio-create-media-templates.mjs` (línea 132) —
*"...tiene el placer de invitarte a vivir una noche especial..."* — aprobado por Meta como texto
literal, con solo 5 variables de texto + 1 de media. El campo `event_type`
(`'promo'|'festival'|'activacion'|'aniversario'|'otro'`) se captura al crear el evento y se persiste,
pero en `src/services/calendar.service.ts` **nunca se lee para elegir plantilla ni variable** — solo
pinta un badge de color en la UI (`EventDetailDrawer.tsx`, `CalendarMonthView.tsx`). El campo
`event_time` igual: se captura, se muestra en el drawer, pero `formatEventDate()` solo usa
`event_date` — la hora **nunca llega al mensaje**, así que no hay lógica de mañana/tarde/noche.

Por tenant solo existen 2 settings de plantilla (`event_template_image_sid`,
`event_template_video_sid` en Ajustes) — uno por **tipo de media**, no por tipo de evento ni franja
horaria. Cambiar el copy exige crear una plantilla Twilio nueva y re-someterla a aprobación de Meta
(24–72h).

**El pipeline de envío en sí ya quedó arreglado** (v2.8.0/v2.8.1/v2.8.3, incluida una entrada sin
commitear): se resolvieron 5 bugs de "por qué el evento no salía" (callejón sin salida en modo
recordatorio por defecto, status inconsistente, campañas huérfanas, reintento que rompía la variable
del flyer, path de media con barras). **Ninguno de esos fixes tocó el contenido del mensaje** — es
justamente el segundo problema, todavía sin resolver.

**Dato adicional de riesgo:** según el propio doc (verificado contra Twilio el 2026-08-21), **solo la
cuenta master (Sushi Service) tiene una plantilla `twilio/media` dinámica aprobada** — la subcuenta de
Don Alirio no tiene ninguna, así que el envío con imagen no funciona ahí todavía.

**Preguntas:**
- ¿Se espera variantes de copy por `event_type`, por franja horaria, o ambas? Determina cuántas
  plantillas nuevas hay que crear y someter a Meta (cada variante de texto = una aprobación aparte de
  24–72h), o si basta con una variable de texto adicional dentro del body ya aprobado.
- ¿Vale la pena resolver el `content_sid` por combinación `media_type + event_type`
  (ej. `event_template_image_festival_sid`), replicando el patrón ya usado para imagen/video?
- ¿Hay plan para que cada tenant nuevo tenga su propia plantilla de imagen aprobada (hoy solo
  funciona en la cuenta master)?

---

## 8. Puntos y niveles — qué pasa al superar el tier máximo (ej. 10 visitas)

**Comportamiento exacto hoy — es un vacío de producto agravado por un bug técnico, no una decisión de
diseño:**

1. `src/services/points.service.ts`, `awardVisitPoints()` (líneas ~158-162): busca el siguiente tier
   con `tiers.find((t) => t.point_threshold > currentPoints)`. Si el cliente ya superó **todos** los
   tiers, no encuentra nada → cae a un **umbral hardcodeado `?? 150`**, un valor legacy sin relación
   con la config real del tenant.
2. `src/lib/points-engine.ts`, `generateSmartVisitPoints()`: con ese `remaining` muy negativo, el
   cliente **sigue recibiendo entre 15 y `visitMax` puntos por visita, indefinidamente** — el contador
   NO se detiene ni se reinicia, sigue creciendo sin límite ni propósito, como efecto colateral del
   fallback, no por diseño.
3. `src/services/reward-tiers.service.ts` (`evaluateNewTier`, `getNextTier`): una vez superados todos
   los thresholds, nunca vuelve a disparar un tier nuevo, y `getNextTier` devuelve `null` para
   siempre — expuesto tal cual (**`next_tier: null`, sin ningún mensaje de "nivel máximo"**) en
   `check-in/route.ts`, `check-in/status/route.ts` y el panel del dueño
   (`dashboard/customers/[id]/next-reward/route.ts`).
4. El roadmap de tiers que se manda por WhatsApp (`buildTiersRoadmap`) queda estático para siempre con
   todos los ✅.
5. La única forma de que exista un "siguiente nivel" es que el dueño **cree manualmente** un tier
   nuevo con `point_threshold` mayor desde `/dashboard/rewards` — no hay automatismo ni techo dinámico.

**Conclusión directa:** no reinicia, no detiene por diseño (sigue sumando por el bug del fallback), y
no tiene ningún concepto automático de "nivel superior" — depende 100% de que el dueño agregue tiers a
mano. `docs/features/points-mystery-box.md` documenta que los puntos "no se resetean" pero no dice
nada sobre qué pasa después del tier más alto.

**Preguntas:**
- ¿Se espera un "prestige loop" automático (reiniciar puntos + badge/multiplicador al superar el tier
  más alto), o simplemente que el dashboard permita tiers ilimitados y se arregle el fallback
  hardcodeado?
- ¿Qué debe pasar con las plantillas de WhatsApp (`tier_unlocked`, roadmap) cuando no hay `next_tier`
  — un mensaje de "nivel máximo alcanzado" en vez de silencio?
- Como mínimo, aunque no se diseñe el "nivel superior" todavía: ¿corregimos el fallback `?? 150` para
  que use el `point_threshold` más alto configurado en vez de un número legacy? Es un bug independiente
  de la decisión de producto.

---

## 9. Notificaciones Push (FCM)

**Nivel de preparación: cero.** No hay ni una sola pieza de infraestructura push/PWA — sin dependencia
(`firebase`/`web-push`/`next-pwa`), sin `manifest.json`, sin service worker, sin columna de DB para
tokens, sin variables `FIREBASE_*`/`VAPID_*`. `grep` de `push|firebase|fcm|vapid|service.?worker|manifest`
en todo `src/` → **0 resultados**.

Dos cosas a tener en cuenta antes de invertir en esto:
- El diseño actual del check-in es **deliberadamente stateless** (documentado en `docs/DB_SCHEMA.md`:
  "cero localStorage, cero cookies", cliente identificado solo por teléfono, para que la tarjeta
  funcione igual desde cualquier celular). El modelo push exige justo lo contrario: un token
  persistente atado a un dispositivo/navegador concreto.
- `docs/AUDITORIA_VENTAS_COMPETENCIA_JUNIO_2026.md` argumenta explícitamente que en Colombia "todos
  desactivan las push" y que WhatsApp gana frente a competidores que sí usan push — es decir, la
  propia documentación estratégica actual va en contra de este canal. No es un bloqueo, pero conviene
  tener claro el caso de uso antes de construirlo (Mandamiento I: ante duda, preguntar).

**Preguntas:**
- ¿Push es para el cliente final (comensal) o para el dashboard del admin/mesero (alertas internas)?
  Cambia radicalmente el diseño (token por customer vs. por staff_user/device — ya existe un concepto
  similar para meseros, `X-Device-Token`/`staff_devices`, pero es de autenticación, no de
  notificación, y no es reutilizable directo).
- Si es para el cliente final: dado lo que dice la auditoría de competencia, ¿cuál es el caso de uso
  concreto que justifica sumarlo además de WhatsApp?
- ¿Se acepta romper el principio de "check-in stateless" para asociar un token a un customer, o se
  busca un modelo alterno (token efímero solo durante la sesión del navegador)?
- ¿Firebase sería un proyecto único compartido entre tenants (como la cuenta Twilio hoy) o uno por
  cliente?

---

## 10. Housekeeping detectado durante la investigación (no es parte del encargo, pero conviene resolverlo antes de empezar)

- **Hay trabajo ya redactado pero sin commitear** en la rama `fix/auditoria-julio-2026`: dos entradas
  completas de `CHANGELOG.md` (v2.8.2 — alta de Frangal sin Twilio; v2.8.3 — fix de que el calendario
  "no salía nunca" en modo recordatorio) con su código y docs correspondientes
  (`calendar.service.ts`, `whatsapp.service.ts`, rutas de dispatch/media-upload, `EventDetailDrawer.tsx`,
  `branding.ts`, `tenant.types.ts`, página de privacidad, `docs/04-deployment.md`, `docs/API_DOCS.md`,
  `docs/features/calendar.md`). Antes de empezar cualquier cosa nueva sobre calendario o branding,
  **hay que decidir si eso se commitea, se revisa, o se descarta** — no tocarlo a ciegas.
- `docs/01-project-overview.md` y `docs/02-architecture.md` (lectura obligatoria "SIEMPRE" según
  `CLAUDE.md`) están **desactualizados** respecto al multitenant real — ver §2.
- `docs/DB_SCHEMA.md` no incluye en su índice principal las tablas de puntos/mystery box
  (`reward_tiers`, `point_transactions`, `mystery_box_results`, `mystery_box_global_caps`) ni
  `tenant_wallet_transactions`, pese a ser features maduras en producción — deuda documental.
- Hay una carpeta `"Landing Page"` marcada como **borrada** en el working tree (`git status`: `D`) sin
  commitear — no se investigó qué contenía ni si el borrado fue intencional. No restaurar ni confirmar
  el borrado sin preguntarle al dueño.
- `package.json` sigue en `version: "0.1.0"`, no sincronizado con el versionado semántico v2.8.x que
  lleva `CHANGELOG.md` — cosmético, no bloqueante.

---

## 11. AIOS Constelarys — CRM mínimo interno + motor de alta automatizada (decidido 2026-08-29)

**Secuencia decidida en esta sesión:** se pausa el desarrollo activo de Zernio (§1, que ya estaba en
diseño) para resolver primero esto. Motivo: hay **2 clientes nuevos esperando alta** (uno con 2 sedes,
otro con 1), y hoy el dueño no tiene ninguna herramienta para darlos de alta ni para saber quién le
debe — el dolor es más urgente que terminar de diseñar Zernio. Se retoma Zernio inmediatamente después.

**Es un proyecto SEPARADO** (repo propio, Supabase propio, NO vive dentro de este repo). Nace de la
carpeta sin trackear `Level 2.0/Upgrading.md` (raíz de este repo, `?? "Level 2.0/"` en `git status`,
fechada 2026-08-10) — de ahí se toma la idea general (AIOS Constelarys, back-office para gestionar
clientes de Cada1) pero **NO el alcance completo** de ese documento: para v1 se descarta el fork de
`luisraiAIOS`, el modelo de equipo/roles, el pipeline de leads y el bot de Telegram, porque el uso es
de **una sola persona** (el dueño) por ahora.

**Alcance v1 confirmado por el dueño, textual:** *"dar de alta a los clientes, ver que clientes
actualmente tengo, cuando deberían pagarme y un registro de sus datos adicionales, lo más sencillo que
se pueda."*

**Visión final (no es todo v1, pero condiciona el diseño para no pintarse en una esquina):** el "dar de
alta" debe evolucionar hacia que el cliente final (el restaurante) prácticamente se registre solo.
Fases previstas por el dueño:
1. **(v1, ahora)** El panel de AIOS automatiza (a) la creación del tenant en el Supabase del producto
   — equivalente a correr `scripts/seed-new-tenant.sql` a mano — y (b) el aprovisionamiento del número
   en Zernio (compra de línea + activación de WhatsApp). Disparado desde el panel por el dueño de
   Cada1, no por el cliente final todavía.
2. **(después)** Automatizar también la personalización (plantillas de WhatsApp, branding visual) como
   parte del mismo flujo de alta.
3. **(visión final, no v1)** El propio dueño del restaurante se auto-registra sin intervención de
   Cada1 — converge con el "self-service" de la migración a Zernio (§1).

**Enfoque técnico elegido tras comparar 2 opciones (fork de `luisraiAIOS` vs. build mínimo desde
cero):** build mínimo desde cero — Next.js + Supabase nuevo y propio. Conexión al Supabase del
producto con un **rol restringido** (nunca la service key, nunca acceso a `customers`/`visits`), solo
para leer tenants/saldos y, en v1, insertar el alta.

**Modelo de datos propuesto v1 (a confirmar):**
- `clients`: nombre del negocio, `tenant_slug` (referencia blanda al tenant real en el Supabase del
  producto), plan, precio mensual, sedes, estado (activo/inactivo), datos adicionales (ver pregunta 5
  abajo).
- `payments`: `client_id`, monto, `due_date`, `paid_at` — el estado de "debe" es que `paid_at` sea
  `null` (no hace falta columna de estado aparte), patrón tomado directo de `Level 2.0/Upgrading.md`.

### Decisiones tomadas la noche del 2026-08-29 (antes de escribir ningún código de app)

El dueño frenó explícitamente el desarrollo de interfaz esta noche: **"tú no vas a desarrollar, deja
todas estas instrucciones en el documento; que cree todos los SQL y yo inicio mañana un nuevo
proyecto."** Se respeta el hard-gate del proceso de brainstorming (sin código sin spec aprobada) —
lo único que se produjo esta noche son los dos archivos SQL de abajo y esta documentación. **Ni una
línea de la app (ni del AIOS ni de Zernio) está escrita todavía.**

- Supabase del AIOS: el dueño lo crea él mismo mañana en supabase.com y pasa URL + keys — no se usó
  el MCP de Supabase (no está autorizado en esta sesión).
- Repo/Vercel del AIOS: **no se crea esta noche**. Cuando haya código, arranca local.
- Zernio: **no se compra ningún número todavía** — se simulará/mockeará esa parte cuando empiece el
  desarrollo real, hasta tener las 6 preguntas técnicas de §1 resueltas.
- Datos adicionales por cliente: se usa la lista por defecto propuesta (ver schema abajo).

### Lo que sí se produjo esta noche (lo pedido: "que cree todos los SQL")

1. **`Level 2.0/aios-constelarys/supabase/migrations/00001_init.sql`** — el schema completo del AIOS
   propio: tablas `clients` (nombre, `tenant_slug` de referencia blanda, plan, precio, estado,
   contacto/NIT/dirección/notas), `client_locations` (sedes), `payments` (`due_date`/`paid_at`, sin
   columna de estado — "debe" es que `paid_at` sea `null`), la vista `clients_pending_payments`
   ("a quién le tengo que cobrar", calculada de fechas, no escrita a mano — criterio de aceptación de
   Level 2.0/Upgrading.md §7), trigger de `updated_at`, y RLS de un solo dueño (`authenticated` = todo
   permitido, con nota explícita de que hay que revisar esto antes de sumar una segunda persona). Para
   un proyecto Supabase NUEVO — no correrlo contra el Supabase del producto.
2. **`supabase/migrations/00035_aios_constelarys_role.sql`** (este repo, el del producto) — crea el
   rol `aios_constelarys` (sin LOGIN hasta activarlo a mano con una contraseña propia, nunca commiteada)
   con GRANT + políticas RLS propias: SELECT en `tenants`/`tenant_wallet_transactions`, INSERT en
   `tenants`/`reward_tiers`/`admin_settings`/`restaurant_locations`. Sin BYPASSRLS a propósito — doble
   candado (GRANT y RLS), así que aunque alguien amplíe un GRANT por error más adelante, sigue sin
   poder leer `customers`/`visits`. Instrucciones de activación al final del propio archivo. Documentado
   en `docs/DB_SCHEMA.md` (fila 35 del historial de migraciones).

### Qué falta definir antes de escribir código de integración real (app)

1. **API key de Zernio** — el dueño la tiene pero aún no la compartió.
2. **Las 6 preguntas técnicas de Zernio de §1** siguen sin resolver (formato de variables, concepto de
   subcuenta, firma de webhooks, si el self-service cubre a Meta de punta a punta, etc.) — necesarias
   para que el paso "aprovisionar número en Zernio" del flujo de alta funcione de verdad y no solo en
   apariencia.
3. **Aplicar los dos archivos SQL de arriba** — el 00001 en el Supabase nuevo del AIOS (que el dueño
   crea mañana) y el 00035 en el Supabase del producto (este repo), activando el rol con una
   contraseña propia.
4. **Decidir el stack/hosting exacto del AIOS** (Next.js + Vercel, igual que el producto, es lo
   asumido por defecto — confirmar si aplica).
5. **El flujo real de "alta"** (crear tenant + sedes + tiers + admin_settings desde el AIOS, imitando
   `scripts/seed-new-tenant.sql`) todavía no está diseñado a nivel de código — el rol/permisos ya
   existen (punto 2), falta el diseño del formulario y la función que arma el INSERT.

---

## 12. Plantillas de WhatsApp — mismo set para todos + 3 estilos + edición (decidido PRIMERA PRIORIDAD, 2026-08-29 noche)

> ## ✅ IMPLEMENTADO — v2.12.0, 2026-08-30
>
> Doc de feature: **`docs/features/whatsapp-templates.md`** · Migración: `00039_template_catalog.sql`
> (la **00039**, no la 00038: esa la tomó `00038_send_queue_drain.sql`).
>
> Las 6 decisiones del dueño están implementadas tal cual. Tres cosas que conviene saber sin releer
> todo:
>
> 1. **El detector de aprobación resultó ser un webhook, no un poll.** El contrato verificado de
>    Zernio documenta `whatsapp.template.status_updated` con su payload exacto. Hay que **agregar ese
>    evento** a la config de webhooks del Team en Zernio (`POST /v1/webhooks/settings`).
> 2. **No se borra la plantilla vieja del proveedor.** El contrato verificado de Zernio no expone un
>    DELETE de plantillas, y esa doc prohíbe inventar rutas. Se deja de apuntarla y se marca
>    `retired`, que resuelve el problema real. La plantilla queda huérfana en la WABA, sin costo.
> 3. **Los textos `calido` conservan el 🍣 de Sushi Service.** La decisión 2 dice "sin cambios en el
>    default", así que no se tocó — pero en un tenant que no sea de comida japonesa se ve fuera de
>    lugar. **Es una decisión pendiente del dueño**, no un olvido.
>
> Queda sin implementar (fuera de §12): generación con LLM (respuesta 5: "banco fijo, llm luego"),
> aviso proactivo al dueño cuando Meta rechaza, y qué hacer si Meta **pausa** una plantilla ya vigente
> (material del Bloque 3 de gobernanza de envío).

**Decisión del dueño, textual:** *"desde el principio me han cargado como un loco"* (las plantillas).
Se reprioriza por encima de TODO lo demás en esta lista, incluidas las 7 mejoras de §3–§9 y por
delante de seguir puliendo la migración a Zernio. Antes de tocar cualquier otra cosa de producto, se
resuelve esto.

### Qué se pide

1. **Un solo set base de plantillas, igual para todos los tenants.** Hoy cada alta termina con un
   conjunto de plantillas ligeramente distinto según quién lo haya armado a mano al momento de crear
   el tenant — eso es lo que "carga como loco" al dueño. Se necesita UN catálogo estándar (las 13
   plantillas ya identificadas en `scripts/twilio-create-text-templates.mjs` /
   `twilio-create-media-templates.mjs`, y ya portadas para Zernio en
   `Level 2.0/aios-constelarys/src/lib/zernio/templates-catalog.ts`) que se cree siempre igual para
   cualquier tenant nuevo.
2. **Tono por defecto: cálido** — el actual, documentado en `docs/PLANTILLAS.md`. Sin cambios en el
   default.
3. **Agregar 2 estilos nuevos, seleccionables además de *cálido*:** un estilo ***elegante*** y un
   estilo ***urbano***. Quien dé de alta el tenant elige uno de los 3 y el catálogo completo (las 13
   plantillas) se crea con ese estilo.
4. **Edición desde el dashboard, con una experiencia de usuario específica** — textual del dueño:
   - **Para el dueño del restaurante:** entra al apartado de Plantillas, ve una plantilla existente,
     la edita como si fuera un documento — cambia texto, tal vez el estilo — y guarda. Debe sentirse
     como una edición simple, nunca como "estoy creando algo nuevo".
   - **Para el sistema:** por debajo, NO es una edición — es **borrar la plantilla anterior y crear
     una nueva** en su lugar. Las plantillas de WhatsApp, una vez aprobadas por Meta, no se pueden
     editar in-place (ni en Twilio ni en Zernio) — solo se puede crear una plantilla nueva y volver a
     someterla a aprobación. El sistema debe ocultarle esa complejidad al usuario.
5. **El apartado de "Plantillas" del dashboard cambia** para soportar todo lo anterior — hoy
   (`src/app/(dashboard)/dashboard/templates/page.tsx`) es un `<textarea>` de texto libre por
   plantilla, sin concepto de estilo ni de catálogo estándar. Esto ya estaba señalado como gap en §6
   ("el concepto de tono/estilo comunicativo... no existe en absoluto") — este pedido lo saca de ahí y
   lo prioriza aparte, acotado solo a plantillas (sin logo ni paleta todavía).

### ⚠️ URGENTE — antes de implementar, esto necesita respuesta del dueño

> El propio dueño pidió dejar esto anotado explícitamente: *"el usuario para completar el apartado de
> plantillas requiere de cambios, preguntar cuáles son para implementar."* Estas son las preguntas
> concretas que hay que resolver antes de que cualquier IA empiece a codear este frente (Mandamiento
> I: ante duda, preguntar — no asumir ninguna de estas respuestas):

1. **¿Qué pasa con el envío mientras la plantilla nueva está pendiente de aprobación** (24–72h en
   Twilio; puede ser instantáneo si es "library template" en Zernio, ver §1)? ¿Se sigue enviando con
   la plantilla vieja hasta que la nueva quede aprobada, o se bloquea ese tipo de mensaje mientras
   tanto?
2. **¿El estilo se elige una sola vez por tenant** (las 13 plantillas van todas con el mismo estilo) **o
   se puede mezclar** — por ejemplo, bienvenida en tono cálido y campañas en tono urbano?
3. **¿Quién puede cambiar el estilo o editar una plantilla puntual:** ¿el dueño de cada restaurante
   desde su propio dashboard, o solo el equipo de Cada1? Cambia por completo el diseño de permisos del
   apartado.
4. **¿El estilo se guarda como configuración del tenant** (para que si más adelante se agrega una
   plantilla nueva al catálogo, nazca ya con el estilo correcto sin que nadie tenga que elegirlo de
   nuevo)?
5. **¿Cómo se redactan los textos de los 2 estilos nuevos (elegante, urbano)?** ¿Un humano los escribe
   una vez y quedan fijos, se generan con LLM con revisión humana antes de someter a Meta (ver el
   prompt P4 ya preparado en `docs/requerimientos/PROMPTS_SESIONES_BARATAS.md`), o es un banco de
   textos fijos por combinación estilo × tipo de negocio (restaurant/barbershop/beauty_salon)? Cada
   texto nuevo es una aprobación de Meta aparte.
6. **¿Esto aplica retroactivamente a los 4 tenants que ya tienen plantillas en Twilio** (recrearlas
   con el catálogo estándar) **o solo a los tenants que se den de alta de aquí en adelante** (vía
   Zernio)?

### ✅ RESPUESTAS DEL DUEÑO (2026-08-30) — 5 de 6 cerradas

Las respuestas de abajo son **decisiones tomadas**. No volver a preguntarlas ni asumir otra cosa.

**2 · Un solo estilo por tenant.** Textual: *"no puedes enviar un mensaje con tono urbano y uno cálido,
no tiene el más mínimo sentido, aquí tenemos que definir realmente un estilo, no podemos tirarnos una
cagada total"*. Las 13 plantillas del tenant van **todas** con el mismo estilo. No se mezcla.

**3 · El dueño del restaurante puede editar sus plantillas.** Textual: *"el dueño puede, si se las
llegan a bloquear va a ser su culpa, ahí se lo especificamos"*. ⇒ Requisito de producto derivado: el
apartado debe **mostrar esa advertencia de responsabilidad** antes de guardar una edición, y dejar
constancia de quién editó y cuándo. Sin ese registro, "es su culpa" no se puede sostener después.

**4 · El estilo se guarda como SUGERENCIA, no como candado.** Textual: *"que ese estilo se guarde como
sugerencia"*. Significa:
- `admin_settings.template_style` es el **default** con el que nace cada plantilla nueva del catálogo.
- El dueño puede cambiarlo cuando quiera, y al cambiarlo se le ofrece **re-aplicarlo a todo el
  catálogo** (respondiendo a su pregunta *"¿qué sucede si el dueño quiere cambiar todo?"*: sí, se puede
  cambiar todo, pero es una acción explícita, no automática).
- Re-aplicar un estilo = **13 aprobaciones nuevas de Meta**. La pantalla tiene que decirlo antes de
  confirmar, no después.

**5 · Banco de textos fijo ahora; LLM después.** Textual: *"banco fijo, llm luego"*. Los textos de
*elegante* y *urbano* se escriben una vez y quedan fijos. El prompt P4 de
`PROMPTS_SESIONES_BARATAS.md` queda para una fase posterior.
> **Alcance del banco:** el estilo **NO varía por `business_type`.** Lo específico del negocio va en
> variables (`{{1}}` = nombre del local, etc.), no en el texto aprobado. Así el banco es de
> **13 plantillas × 2 estilos = 26 textos**, no 78 (13 × 2 × 3 tipos de negocio). Cada texto es una
> aprobación de Meta aparte, así que la diferencia entre 26 y 78 es real en tiempo y en riesgo.

**6 · Solo tenants nuevos. Los 4 de Twilio no se tocan.** Textual: *"los 4 tenants que están con
twilio déjalos así, ni los toques"*. Sushi Service, Don Alirio, Frangal y Demo conservan sus
plantillas actuales tal cual. El catálogo estándar aplica a los tenants que se den de alta vía Zernio
de aquí en adelante.

### ✅ Pregunta 1 — RESUELTA (2026-08-30)

La pregunta original no se entendió, y con razón: no era sobre tenants viejos vs. nuevos. Es sobre
**el hueco que abre una edición dentro de un mismo tenant**.

El punto 4 de "Qué se pide" (arriba) dice que **editar = borrar la plantilla anterior y crear una
nueva**, porque Meta no deja editar una plantilla aprobada in-place. Entonces:

> Don Alirio edita su plantilla de bienvenida el lunes. La nueva entra en revisión de Meta
> (24–72h). El martes un cliente escanea el QR. **¿Qué se le envía?**

Con "borrar y crear", la vieja ya no existe y la nueva no está aprobada → **ese cliente no recibe
nada**.

**DECISIÓN DEL DUEÑO:** *"que se cree primero la nueva y una vez quede aprobada se cambie y
automáticamente se modifique, pero luego de aprobarla, para nunca arriesgarnos a perder un mensaje"*.

O sea: **la vieja NO se borra hasta que Meta apruebe la nueva.** El flujo real, por debajo:

1. El dueño edita y guarda → se **crea** la plantilla nueva y se somete a Meta. La vieja sigue vigente.
2. Mientras Meta revisa (24–72h), **todos los envíos siguen usando la vieja**. Cero huecos.
3. Cuando Meta aprueba → el puntero cambia **automáticamente** a la nueva, y recién ahí se borra la
   vieja.
4. Si Meta **rechaza** → la vieja sigue vigente y al dueño se le avisa. El sistema nunca queda sin
   plantilla utilizable.

**Nunca se pierde un mensaje.** Y el dueño no ve nada de esto — que es lo que pide el punto 4
(*"debe sentirse como una edición simple, nunca como 'estoy creando algo nuevo'"*).

**Implica en el modelo de datos:** `admin_settings` tiene que poder guardar la plantilla **vigente** y
la **pendiente** a la vez (hoy solo guarda una: `*_template_sid`), más el estado de la pendiente. Y
hace falta algo que detecte la aprobación para disparar el cambio de puntero — webhook del proveedor
si existe, o poll. Es el mismo mecanismo que el Bloque 3 de la gobernanza de envío necesita para leer
el estado de las plantillas: **conviéne construirlos juntos.**

### Relación con lo ya documentado

Este pedido recorta, con prioridad máxima, lo que ya estaba planteado en **§6** (el wizard de
branding/tono) — pero acotado solo a las plantillas de mensajería (sin logo ni paleta de colores por
ahora) y con el requisito nuevo de "editar = borrar y recrear" que §6 no contemplaba. Cuando esto se
implemente, §6 debe actualizarse para no duplicar el trabajo.

---

## 13. Apartado de Campañas — modificación pendiente de especificar (decidido SEGUNDA PRIORIDAD, 2026-08-29 noche)

El dueño pidió modificar el apartado de Campañas
(`src/app/(dashboard)/dashboard/campaigns/*`, `src/app/api/dashboard/campaigns/*` — ver
`docs/features/campaigns.md`), en segundo lugar de prioridad: inmediatamente después de §12
(Plantillas) y antes de §3–§9.

> **ACTUALIZACIÓN 2026-08-30 — esta sección ya tiene dirección: ver §15 y §16.** El dueño
> describió lo que falta: usabilidad ("que entiendan estúpidamente fácil cómo se usa"), eliminar o
> completar las dos campañas fantasma, mover las burbujas del dashboard aquí, y sobre todo el
> **pipeline del recorrido del cliente** (§16), que es el cambio de fondo. Las preguntas de abajo
> quedan parcialmente respondidas; las que siguen abiertas están en §15 y §16.

**Sin detalles todavía** (al 2026-08-29). El dueño no especificó qué cambios necesita — queda pendiente
que los describa antes de que cualquier IA empiece a investigar o codear este frente (Mandamiento I:
ante duda, preguntar — no asumir alcance).

**Preguntas:**
- ¿Qué de la pantalla o el flujo actual de Campañas no funciona o no alcanza?
- ¿Es una queja de UI (cómo se ve o se usa) o de funcionalidad (qué puede o no puede hacer una
  campaña hoy)?
- ¿Tiene relación con el cambio de plantillas de §12 (por ejemplo, elegir el estilo de una campaña
  puntual) o es un problema aparte?

---

## 14. Dashboard — limpieza (pedido 2026-08-30)

**Toca la base de envío:** NO. Es UI pura, no retrasa nada.

1. **Eliminar la sección de clientes Black del dashboard principal.** No se borra el componente: se
   **mueve** al apartado de Clientes (ver §17). Hoy `BlackTierSection` se renderiza en
   `src/app/(dashboard)/dashboard/page.tsx:77`.
2. **Reducir el resumen de clientes a 15.** Hoy son 20:
   `src/services/dashboard.service.ts:270` → `customers.slice(0, 20)`. Cambia a `slice(0, 15)`.

**Sin preguntas abiertas.** Ambos son cambios de una línea.

---

## 15. Campañas — usabilidad y campañas fantasma (pedido 2026-08-30)

**Toca la base de envío:** PARCIALMENTE (el punto 2 define si nacen tipos de mensaje nuevos).

**Textual del dueño:** *"hacer que entiendan estúpidamente fácil cómo se usa"*.

1. **Rediseño de usabilidad del apartado de Campañas.** Este es el §13 que quedó "sin alcance
   definido" — ahora tiene dirección: la pantalla debe explicarse sola. Sigue **sin detalle
   suficiente** para codear: falta saber qué específicamente confunde hoy.

2. **Campañas fantasma.** Textual: *"hay campañas como invitar a restaurante los que piden domi o
   invitar a que pidan domi los que van a restaurante, que no tienen plantillas y no van a poder
   usarse, son básicamente de mentira"*.

   **Verificado:** existen como presets en `src/components/dashboard/ManualCampaigns.tsx:73` e
   `:83` — `invite_restaurant` (filtro `source: 'delivery_only'`) e `invite_delivery` (filtro
   `source: 'qr_only'`). Los **filtros** sí están implementados; lo que falta es la plantilla
   aprobada de Meta con ese mensaje.

   **Decisión requerida:** ¿se **eliminan** los dos presets, o se **crean las plantillas** que les
   faltan y se vuelven reales? Si se crean, son 2 plantillas nuevas al catálogo de §12 y 2 entradas
   nuevas en la tabla de clases/prioridad del spec de gobernanza de envío (§3.3).

3. **Mover las burbujas flotantes al apartado de Campañas.** Textual: *"considerando el día a día del
   cliente deberíamos eliminar las burbujas flotantes catalogadas por días en el dashboard y meterla
   en el área de campañas"*. Hoy `AtRiskBubbles` se renderiza en
   `src/app/(dashboard)/dashboard/page.tsx:85`. Es un movimiento, no un borrado — el componente ya
   dispara campañas de reactivación desde ahí.

**Preguntas abiertas:**
- 15.a ¿Qué específicamente no se entiende hoy del apartado de Campañas? ¿Es la pantalla (cómo se ve)
  o el modelo mental (qué hace cada campaña y cuándo usarla)?
- 15.b Los dos presets fantasma: ¿eliminar o crearles plantilla?

---

## 16. Fatiga y pipeline del recorrido del cliente (pedido 2026-08-30) — ⚠️ TOCA LA BASE

**Toca la base de envío:** SÍ, de lleno. Reemplaza y amplía la §3.6 del spec
`docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md` (Bloque 7).

**Este es el requerimiento de mayor calado de los nueve.** No es una regla más: es un modelo distinto.

### 16.1 Regla de fatiga

**Textual:** *"si un cliente recibe 6 comunicaciones y no vuelve, se elimina de lista de mensajes
hasta que vuelve a escanear"*.

Es una regla de **fatiga acumulada sin conversión**, que hoy no existe en ninguna forma. Lo que existe
(`FREQUENCY_CAP_DAYS = 7`, `MONTHLY_MARKETING_CAP = 3`) limita el *ritmo*, no el *total sin respuesta*.
Un cliente puede recibir 3 mensajes al mes indefinidamente sin volver jamás.

La regla es además excelente para el quality rating: los clientes que no responden son exactamente los
que terminan bloqueando o reportando. Apagarlos protege la línea.

### 16.2 El pipeline roto

**Textual:** *"ahorita el pipeline se rompe, un recordatorio de cumple (si aplica) una campaña a los 21
días y una a los 25, exageradamente cerca, si está de viaje, en trabajo intenso o incluso con una
diarrea no le da ni tiempo de pensar en ir en 4 días de diferencia... además, el pipeline a la segunda
que es campaña agresiva se rompe, hasta ahí llega"*.

**Verificado, el dueño tiene razón en los dos puntos:**

- `REACTIVATION_DAYS = 21` y `REACTIVATION_AGGRESSIVE_DAYS = 25` (`src/constants/rewards.ts:4` y `:7`)
  → 4 días de separación. Son configurables en `admin_settings`, pero el default es ese.
- Después de la agresiva (día 25) **no hay nada más**. `RECOVERY_ZONE_END_DAYS = 25`. El preset manual
  `rescue_lost` (26+ días) existe pero es **manual** — nadie lo dispara solo. El recorrido automático
  termina ahí.

**Lo que se pide:** *"tener como una especie de pipeline del recorrido del cliente que se va reiniciando
a medida el cliente pida por domi o asista al restaurante"*.

Es una **máquina de estados del ciclo de vida del cliente**, con:
- etapas ordenadas y separación configurable entre ellas,
- **reinicio** del recorrido ante una conversión (visita por QR **o** pedido por domicilio),
- un estado terminal de fatiga (16.1) que saca al cliente de todo envío,
- reingreso solo por un nuevo escaneo.

### 16.3 Relación con el spec de gobernanza de envío

La §3.6 de ese spec propone una **matriz de cooldown por clase** — que es un caso particular, y más
pobre, de lo que se pide aquí. **Esa sección queda superada.** El Bloque 7 del plan de implementación
deja de ser "frecuencia configurable" y pasa a ser **"pipeline del recorrido del cliente"**, con spec
propio.

**No bloquea los Bloques 1–4** (presupuesto de línea, cola, salud, consentimiento): esos gobiernan la
*oferta* (cuántos puede emitir la línea) y este gobierna la *demanda* (a quién y cuándo). Son ejes
independientes. El trabajo de lanzamiento sigue su curso.

**Preguntas abiertas:**
- 16.a ¿Cuáles son las etapas del recorrido y a cuántos días cada una? El dueño dice que 21 y 25 están
  muy cerca, pero no dijo cuáles serían los números correctos.
- 16.b ¿Las 6 comunicaciones de la regla de fatiga cuentan **todas** las clases (incluidos cumpleaños y
  recordatorio de premio) o solo las de marketing (`MONTHLY_CAP_SOURCES`)?
- 16.c ¿El contador de 6 se reinicia con la visita, o también con el paso del tiempo (ej. al año)?
- 16.d ¿"Vuelve a escanear" incluye pedir domicilio, o es literalmente solo el QR? El texto del reinicio
  dice "pida por domi o asista", pero el del reingreso dice "vuelve a escanear" — hay que unificarlo.
- 16.e ¿Qué pasa con un cliente ya fatigado hoy? ¿Backfill retroactivo o la regla aplica de aquí en
  adelante?

---

## 17. Clientes Black / VIP — lógica real y tarjeta distintiva (pedido 2026-08-30)

**Toca la base de envío:** NO directamente. Salvo que el "beneficio permanente" implique mensajes.

**Textual:** *"la pantalla negra de clientes VIP tiene que quedar dentro del apartado de clientes y
esta lógica tiene que estar bien definida"*.

1. **Mover `BlackTierSection` del dashboard a `dashboard/customers`** (contraparte de §14.1).
2. **Al entrar a Black, la tarjeta del cliente en su celular cambia a negro y dorado**, con distintivo
   claro de Black. Toca `src/app/(public)/tarjeta/page.tsx` y el sistema de diseño
   (`docs/features/design-system.md`, `docs/features/visual-loyalty-fase1-spec.md`).
3. **Beneficio permanente** al llegar a Black — no un premio de una vez, sino algo que se mantiene.
   Esto es nuevo: hoy `reward_tiers` otorga premios por umbral, no beneficios permanentes.
4. **Definir clara y fácilmente las recompensas reales y las visitas/puntos necesarios** para llegar a
   Black, desde el dashboard.

**Verificado:** hoy "Black" está hardcodeado como *10+ visitas* en el preset `black_exclusive`
(`ManualCampaigns.tsx:93`, filtro `minVisits: '10'`). No es configurable por tenant.

**Preguntas abiertas:**
- 17.a ¿Qué es un "beneficio permanente"? ¿Descuento fijo, puntos multiplicados, acceso a premios
  exclusivos, otra cosa? Define el modelo de datos entero.
- 17.b ¿El umbral de Black se define por visitas, por puntos, o por cualquiera de los dos?
- 17.c ¿Se puede caer de Black si el cliente deja de venir, o es permanente de por vida?
- 17.d ¿Black es el tier máximo o habrá más arriba? (§8 de este documento ya preguntaba qué pasa al
  superar el tier máximo — está relacionado y sigue sin responder.)

---

## 18. Domicilios bajo coexistencia (pedido 2026-08-30) — ⚠️ TOCA LA BASE

**Toca la base de envío:** SÍ. Cambia por dónde entran los pedidos.

**Textual:** *"ahorita ni yo mismo sé bien cómo explicarle al cliente cómo funciona... de ahora en
adelante vamos a usar coexistence con los restaurantes, eso quiere decir que su mismo número va a ser
el que envíe los mensajes, entonces, si tenían que enviar antes el cuadro al número alternativo, ahora
¿a dónde van a enviar ese cuadro o cómo vamos a hacer?"*

**El problema es real y es consecuencia directa de la decisión de coexistencia.** Hoy el flujo de
domicilios funciona así (verificado):

- Un mesero//operador autorizado (`authorized_numbers`) le manda el "cuadro" del pedido por WhatsApp
  al número del sistema.
- El webhook (`twilio-incoming` o `zernio`) detecta que el remitente está en `authorized_numbers` y
  reenvía el mensaje a n8n (workflow W1), que lo parsea y crea el pedido.
- Ver `docs/features/delivery-webhook.md` y `docs/features/delivery-ai-parsing.md`.

Con coexistencia, **el número que recibe es la línea principal del restaurante** — la misma por la que
hablan con sus clientes. El "cuadro" del pedido caería en la misma bandeja que la conversación con los
comensales.

**Además:** el webhook de Zernio **ya no puede responder auto-reply de texto libre**
(`docs/features/zernio-messaging.md`, sección "Pendiente"), así que la confirmación al operador
tampoco funciona igual que con Twilio.

**Lo que se pide:** *"una parte reservada para domicilios para explicarles cómo funciona y conectar
algo si hace falta"* — es decir, un apartado propio en el dashboard que documente y configure el flujo.

**Preguntas abiertas (bloqueantes, ninguna asumible):**
- 18.a ¿El "cuadro" sigue entrando por WhatsApp a la línea principal, o se mueve a otro canal (un
  formulario web en el dashboard, un número aparte, integración directa con su POS)?
- 18.b Si sigue por WhatsApp: ¿cómo se distingue el cuadro de un pedido de un mensaje de un cliente
  real, ahora que llegan al mismo número? Hoy se distingue por `authorized_numbers`, lo cual **sigue
  funcionando** — hay que confirmar si eso basta.
- 18.c ¿Qué se le responde al operador cuando el tenant es Zernio y no hay texto libre disponible?
  ¿Una plantilla de confirmación aprobada?
- 18.d ¿Qué debe contener exactamente el apartado nuevo de Domicilios: solo explicación, o también
  configuración (números autorizados, formato del cuadro, pruebas)?

---

## 19. Escáner QR — un dispositivo por local, PIN por mesero, atribución (pedido 2026-08-30)

**Toca la base de envío:** NO. Es un subsistema aparte y grande — merece **spec propio**.

### 19.1 Corrección importante: esto NO se construye desde cero

El dueño planteó esto como si el sistema de meseros no existiera. **Sí existe**, desde la migración
`00018_staff_qr_scan.sql`:

| Ya existe | Dónde |
|---|---|
| `staff_users` (name, `phone` UNIQUE, `pin` **hasheado con bcrypt**, `role`, `is_active`) | `00018:9` |
| `staff_devices` (`staff_user_id`, `device_fingerprint`, **`device_name`**, `is_trusted`, `expires_at`) | `00018:29` |
| Login con `phone` + `pin` | `src/app/api/staff/login/route.ts` |
| Rutas `device`, `login`, `me`, `pending-rewards`, `stats` | `src/app/api/staff/` |
| **Captura del número de mesa** | `src/app/(public)/mesero/confirm/page.tsx:284` |

**Lo que se pide no es construir: es invertir el modelo.** Hoy el **dispositivo pertenece a un mesero**
(`staff_devices.staff_user_id`). Lo que se pide es que el **dispositivo pertenezca al restaurante** y
el mesero se elija **por operación**. `device_name` ya existe y cubre la "nota de quién es el celular".

### 19.2 Lo que se pide

1. **Un solo inicio de sesión por celular**, con usuario y clave **del administrador**. Todos los
   celulares comparten el mismo acceso. Se elimina el alta de un login por mesero.
2. **Los meseros se dan de alta solo con un PIN de 4 dígitos** — sin teléfono, sin celular propio.
   *(Implica que `staff_users.phone`, hoy `NOT NULL UNIQUE`, deja de ser obligatorio.)*
3. **Nota del dispositivo:** al activar un celular nuevo, el administrador deja anotado de quién es.
   *(`staff_devices.device_name` ya lo soporta.)*
4. **Al escanear un cliente:** se pide **mesa** (ya existe) y se **selecciona el mesero** que atiende.
   Habilita la métrica de cuántos QR escaneó cada mesero, para incentivos.
5. **Al entregar un premio: dos botones — "Redimir ahora" o "Acumular".** Textual: *"por si se les
   olvidó escanear al principio y de pronto tienen una bebida, van a preferir redimir en el siguiente
   premio"*. Se decide con el cliente en la mesa.
6. **Al redimir: se escoge quién redime y qué mesa, y se exige el PIN de ese mesero.** Razón textual:
   *"para llevar un registro bien claro de quién fue y que nadie pueda registrar premios a nombre de
   otros meseros"*.
7. **El PIN en la redención debe poder activarse y desactivarse** desde el apartado de escaneo, *"por
   si el dueño no quiere que se tengan que estar acordando de la clave"*.

### 19.3 Observación de diseño del dueño, que vale la pena registrar

Textual: *"sí se podrán registrar QR a nombre de otros meseros pero nadie lo va a hacer porque es una
estupidez regalar tu premio a otro, así ellos mismos van a cuidar sus claves"*.

Es una decisión deliberada: **la atribución del escaneo NO se protege con PIN, solo la redención.** El
incentivo económico hace el trabajo del control de acceso en un lado, y el PIN lo hace en el otro.
Registrado a propósito para que nadie "arregle" después el hueco de atribución creyendo que es un bug.

**Preguntas abiertas:**
- 19.a ¿El usuario y clave del administrador es el mismo login del dashboard, o uno aparte solo para
  los celulares?
- 19.b ¿Qué pasa con los `staff_users` que hoy existen con teléfono y PIN? ¿Migración o alta de cero?
- 19.c Si el PIN de redención está desactivado, ¿igual se pide **elegir** el mesero (para la
  atribución) o se salta el paso entero?
- 19.d "Acumular" — ¿qué significa exactamente en el modelo de datos? ¿El premio queda pendiente y
  disponible indefinidamente, o mantiene la ventana de vencimiento que hoy tiene
  (`docs/features/reward-grants.md`)?
- 19.e ¿Cuántos intentos de PIN fallidos antes de bloquear? Hoy no hay límite documentado.

---
## Handoff — cómo continuar sin releer el repo entero

> ### ⚠️ ACTUALIZACIÓN 2026-08-30 — leer esto ANTES del orden de trabajo de abajo
>
> **Se decidió coexistencia** (los mensajes salen por la línea principal de WhatsApp de cada
> restaurante, no por un número aparte). Eso hizo aparecer un frente nuevo que no estaba en este
> documento y que es **prerrequisito de las 25 altas**:
>
> **`docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md`** — gobernanza de envío.
> El repo gobierna la *demanda* (cuántos mensajes recibe una persona: cap de 7 días, cap mensual de 3)
> pero **no gobierna la oferta** (cuántos puede emitir la línea: Meta limita a N destinatarios únicos
> por 24h rodantes, y nada en el código lo sabe). Sus Bloques 1–4 bloquean el lanzamiento.
>
> **Decisiones ya cerradas ahí** (no volver a abrirlas):
> - **D-1:** Golden Bullet se permite, bajo régimen especial (§3.4.1 del spec).
> - **D-2:** se apaga el débito de billetera para tenants Zernio — Meta le factura directo al
>   restaurante, cobrarle además $100 COP/mensaje sería cobrarle dos veces. El modelo pasa a
>   suscripción mensual variable. La billetera de los 4 tenants Twilio **no se toca**.
>
> **Requerimientos nuevos del 2026-08-30:** §14 a §19 de este documento. De los seis, **§16 (fatiga +
> pipeline del recorrido del cliente) y §18 (domicilios bajo coexistencia) tocan la base de envío**;
> §16 además **supera la §3.6 del spec de gobernanza** y necesita spec propio. §19 (escáner QR) es un
> subsistema aparte, también con spec propio — y **ojo: el sistema de meseros con PIN ya existe**
> (migración `00018`), lo que se pide es invertir el modelo, no construirlo.
>
> **Estado de la infraestructura de pruebas (verificado 2026-08-30):** el proyecto **no tiene ninguna**
> — no hay vitest/jest, ni un solo archivo de test, y `package.json` solo expone `lint` y `build`.
> Tampoco hay Supabase CLI (`supabase/config.toml` no existe): las migraciones se aplican **a mano en
> el SQL Editor**. Cualquier plan que exija TDD tiene que montar esa infraestructura primero.


**Orden de trabajo acordado con el dueño (actualizado 2026-08-29, noche):** la migración a Zernio
(§1, con §2 como contexto obligatorio de arquitectura) ya tiene código implementado y commiteado —
ver el propio §1 y §11 — pendiente de que el dueño complete el checklist de despliegue (Supabase del
AIOS, migraciones 00035/00036, activar el rol, variables de entorno) y una prueba piloto con un
número real. **La prioridad de lo que sigue cambió: §12 (Plantillas) primero, §13 (Campañas) segundo,
y solo después las mejoras §3–§9** en el orden en que fueron pedidas, salvo que el dueño vuelva a
priorizar distinto.

**Antes de escribir código en cualquier frente:**
1. ✅ Housekeeping de §10 resuelto (el WIP de calendario/Frangal se revisó con code review y se
   commiteó — ver CHANGELOG v2.8.2/v2.8.3/v2.9.1).
2. ✅ Acceso a la cuenta Zernio obtenido y las 6 preguntas técnicas de §1 respondidas — ver la
   investigación completa y el código escrito dentro de §1.
3. ✅ **§12 (Plantillas): las 6 preguntas urgentes están RESPONDIDAS** (2026-08-30, ver el bloque
   "RESPUESTAS DEL DUEÑO" dentro de §12). **§12 está desbloqueado para codear.** Sigue siendo la
   PRIMERA PRIORIDAD de producto.
4. **§13 (Campañas) no tiene alcance definido todavía** — preguntarle al dueño antes de investigar o
   codear.
5. Para cada una de las 7 mejoras §3–§9, las preguntas listadas en su sección son decisiones del
   dueño, no ambigüedad técnica — no asumir la respuesta.

**Todo lo que dice "sin trackear en git" o "sin commitear" en este documento** (`scripts/seed-new-tenant.sql`,
`scripts/alta-frangal.sql`, `Level 2.0/` [irrelevante, ignorar], y los ~10 archivos con diff pendiente)
seguía así al momento de esta investigación (2026-08-28) — si esta fecha ya pasó, correr `git status`
antes de asumir que sigue igual.

## 20. Decisiones del dueño — 2026-08-30 (segunda tanda)

> Cuatro decisiones tomadas después de publicado el spec de gobernanza de envío. **Dos de ellas
> corrigen el spec**, no lo complementan: si el spec y esta sección se contradicen, **manda esta
> sección**.

---

### D-7 · Golden Bullet: el techo del bloque es el presupuesto de campaña completo

**Textual:** *"en el área de golden bullet debemos de tomar el total de clientes y poder dividirlos en
bloques de la cantidad que queramos respetando siempre el límite de la cuenta, ejemplo máximo 180 si
tenemos 250 y si tenemos 500 máximo x número porque hay restaurantes que van a querer cargar hasta
7000 y a estos no van a poder despertarlos en un solo día"*.

⚠️ **Esto REEMPLAZA la §3.4.1 del spec** (`docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md`)
en dos puntos concretos:

| | Spec §3.4.1 (superado) | Decisión D-7 (vigente) |
|---|---|---|
| Sub-cap diario | `15 %` del presupuesto de campaña → ~27/día a escalón 250 | **el presupuesto de campaña completo** → 180 de 250 |
| Puerta de entrada | exigía `messaging_daily_limit > 250` | **se elimina**: a escalón 250 también se puede |
| Puerta de calidad | `line_status='active'` y `quality_rating='green'` | **se conserva sin cambios** |
| Congelamiento al primer amarillo | sí | **se conserva sin cambios** |
| Frase de confirmación escrita | sí | **se conserva sin cambios** |

`admin_settings.golden_bullet_pct` deja de tener sentido como sub-cap y **no debe implementarse**.

**Lo que SÍ hay que construir — el divisor de bloques.** Es la parte nueva del pedido:

1. El operador ve el **total de contactos** cargados (pueden ser 7.000).
2. El operador **elige el tamaño del bloque diario**. No lo elige el sistema.
3. El sistema **acota** esa elección al cupo real: `bloque = LEAST(elegido, presupuesto_campana)`.
   El tope se recalcula con el límite vigente de la línea — no es la constante 180. A escalón 2.000 el
   tope es ~1.930; a escalón 250 es 180.
4. Antes de confirmar, la pantalla muestra **cuántos días va a tardar y en qué fecha termina**.
   7.000 contactos a 180/día son **39 días**. El dueño tiene que verlo antes de decir que sí, y ventas
   tiene que saberlo para no prometer resultados el mismo día.

**Consecuencia comercial que hay que decir en voz alta:** Golden Bullet dejó de ser una bala. Es un
goteo de semanas o meses. Una base de 7.000 en una línea de 250 no se despierta — se despierta en mes
y medio, y solo si la calidad aguanta verde todo ese tiempo.

**Riesgo que el dueño acepta al elegir esta opción:** con el techo en el presupuesto completo, un
Golden Bullet a full puede consumir **todo** el cupo de campaña del día y dejar sin mensaje a los
clientes que SÍ consintieron (cumpleaños, reactivación, recordatorios). La reserva transaccional sigue
protegida — bienvenidas y check-in nunca se ven afectados. Si esto molesta en producción, la salida es
que el operador elija un bloque menor, no un cambio de código.

---

### D-8 · Backfill de consentimiento: tres periodos, no uno

**Textual:** *"tenemos la fecha de ingreso al sistema de los clientes no? pon ahí la fecha de ingreso y
que aprobaron, no es mentira porque todos dieron consentimiento explícito"*.

**Correcto para la mayoría de la base, pero no para toda.** Verificado contra git: el checkbox de
consentimiento **no fue siempre obligatorio**.

| Periodo | Estado del checkbox | Texto exacto que vio el cliente |
|---|---|---|
| Antes de **2026-05-10** | **pre-marcado y opcional** (`useState(true)`, sin `disabled`) | "Acepto ser parte de la familia y recibir regalos, recompensas y comunicaciones por WhatsApp" |
| **2026-05-10** → **2026-06-03** | desmarcado y obligatorio (commit `c844c28`) | igual que el anterior |
| Desde **2026-06-03** | desmarcado y obligatorio (commit `203a3d3`) | "Acepto recibir regalos, recompensas y comunicaciones por WhatsApp. He leído y acepto la Política de Privacidad." |

Un checkbox **pre-marcado no es consentimiento explícito** — ni para Meta ni bajo la Ley 1581 de
habeas data. Los clientes anteriores al 2026-05-10 consintieron por **no desmarcar**, que es opt-out
por omisión.

**Decisión aplicada:** se hace el backfill como pidió el dueño — un evento `opt_in` por cliente con
`occurred_at = customers.created_at` — con **dos correcciones sobre lo que decía el spec §3.7**:

1. **`consent_text` NO va en `null`.** Va el texto real del periodo que le corresponde a ese
   `created_at`, reconstruido de git (tabla de arriba). El spec decía `consent_text=null`; era
   innecesariamente pesimista.
2. **`evidence.explicit` distingue los dos regímenes:**

```jsonc
// created_at >= 2026-05-10
{ "backfill": true, "explicit": true,  "method": "checkbox_required",   "source": "git:c844c28" }
// created_at <  2026-05-10
{ "backfill": true, "explicit": false, "method": "checkbox_prechecked", "source": "git:pre-c844c28" }
```

`explicit:false` no apaga a nadie ni les corta mensajes hoy. Es la diferencia entre tener y no tener
una defensa el día que Meta o la SIC pregunte por un número concreto.

**Falta un dato que solo se puede sacar de producción** — cuántos clientes caen en el periodo
pre-mayo:

```sql
SELECT t.slug,
       COUNT(*) FILTER (WHERE c.created_at <  '2026-05-10') AS sin_consentimiento_explicito,
       COUNT(*) FILTER (WHERE c.created_at >= '2026-05-10') AS con_consentimiento_explicito
  FROM customers c JOIN tenants t ON t.id = c.tenant_id
 GROUP BY t.slug ORDER BY 2 DESC;
```

Si el primer número es marginal, esto es una nota al pie. Si es la mitad de la base, hay que decidir
aparte qué hacer con ellos — pero eso se decide **con el número a la vista**, no antes.

---

### D-9 · Alta sin checkbox: el mesero cuenta, la importación no

**El agujero:** `src/app/api/check-in/route.ts:366` hace `accepts_marketing: body.accepts_marketing ?? true`.
El formulario público sí exige el check, pero **cualquier otra vía que omita el campo crea un cliente
consentido sin habérselo pedido nunca**.

**Decisión:**

| Canal | ¿Cuenta como consentimiento? | `channel` en `consent_events` |
|---|---|---|
| Formulario público de check-in | SÍ (ya exige el check) | `checkin_qr` |
| Alta hecha por el mesero | **SÍ** — hubo contacto presencial, se le puede preguntar | `staff` |
| Alta manual desde el dashboard | SÍ, con el mismo criterio que el mesero | `manual` |
| Importación / Golden Bullet | **NO, nunca** | `import` |

El `?? true` **se conserva** para las vías presenciales, pero la ruta de importación debe pasar
`accepts_marketing: false` de forma explícita y registrar el evento con `channel='import'` y la
responsabilidad del dueño como evidencia (§2.1 del spec).

---

### D-10 · Regla de las 6 comunicaciones: es una PAUSA, no un opt-out

**Textual (§16.1):** *"si un cliente recibe 6 comunicaciones y no vuelve, se elimina de lista de
mensajes hasta que vuelve a escanear"*.

**Decisión:** el cliente se **suprime de campañas**, pero su consentimiento **sigue vigente**.

- **NO** se toca `customers.accepts_marketing`.
- **NO** se escribe nada en `consent_events` — no hubo un cambio de consentimiento, hubo un cambio de
  comportamiento nuestro.
- **NO** hace falta ampliar el `CHECK` de `consent_events.channel` con `'system'`.
- Al volver a escanear, **se reactiva solo**, sin pedirle nada al cliente.

La fatiga vive en su propio contador, separado del consentimiento. Son dos ejes distintos: el
consentimiento dice *si podemos*, la fatiga dice *si conviene*. Mezclarlos obligaría a re-pedir un
permiso que el cliente nunca retiró.

**Sigue abierta la 16.d:** ¿"vuelve a escanear" incluye pedir a domicilio, o es literalmente solo el
QR? Sin eso no se puede codear el reinicio del contador.

---

## 21. Panel del AIOS — dónde y en qué condición está cada negocio (pedido 2026-08-31)

**Textual:** *"tengo que poder seleccionar los que usen twilio o estén en otro supabase, para saber
en qué lugar y condición están · los créditos disponibles para mensaje están escondidos, necesito que
esté visible a primera vista, es lo que tengo que estar más pendiente · los cobros, por propietario,
tengo que poder definirlo ahí mismo; si hay varias sedes y el pago es a propietario él tiene que ser
capaz de ver igualmente cuál consumió qué"*.

**Estado: RESUELTO — AIOS v1.3.0 (migraciones 00005 y 00006 del AIOS).**

Contexto que lo disparó: Sushi Service y Don Alirio llevan meses mandando WhatsApp por **Twilio**, y
Sushi Fun vive en **su propio Supabase/Vercel**, nunca entró al multitenant (§2). El panel solo sabía
representar una forma de existir —sede con tenant compartido esperando el alta de Zernio— así que a
los tres les mostraba eternamente "falta el último paso de instalar WhatsApp".

Lo implementado, en `Level 2.0/aios-constelarys/`:

1. **Condición por sede** (`client_locations.platform` + `.messaging`). Dónde vive (`shared` /
   `external`) y con qué manda (`pending` / `none` / `twilio` / `zernio`). Un CHECK impide que una
   sede `external` tenga `tenant_slug`: buscarlo en la base compartida devolvería "no existe" para
   siempre. El wizard de Zernio solo se despliega si alguna sede lo espera; los pasos que no aplican
   salen **«No aplica»**, no «Pendiente».
2. **Créditos a primera vista.** Tarjeta primera en `/clientes`, columna en la lista, línea por sede.
   Con una corrección de fondo: el crédito **no sale del mismo lado según el proveedor**. Twilio gasta
   billetera (`saldo / precio_por_mensaje`); Zernio gasta cupo de línea de Meta, porque la migración
   00037 del producto (decisión D-2) apagó su billetera y su saldo es 0 por diseño. Se lee de
   `aios_line_health()`.
3. **`clients.billing_mode`**: `per_site` o `consolidated` (UN cobro por el grupo). Cambiar de modo no
   cobra dos veces —cada rama del motor se salta los períodos que la otra ya cubrió— y la sección
   "Cobro y consumo por sede" muestra el desglose aunque el cobro sea uno solo.

**Pendiente del dueño:** revisar la condición de las sedes importadas. El backfill marca `twilio` a
todo tenant preexistente (es correcto: `messaging_provider` tiene DEFAULT `'twilio'`), pero los de
cortesía sin WhatsApp —Frangal— hay que pasarlos a **«Sin WhatsApp»** a mano. Ese dato es comercial y
no está en ninguna columna que se pueda leer.

---

## 22. Franquicias — varios propietarios sobre la misma marca (anticipado 2026-08-31, NO es v1)

**Textual:** *"a futuro es posible que entremos en tema de franquicia, en esta parte vamos a tener un
proyecto para el mismo restaurante con varios propietarios cada uno encargado de su fase"*.

**No se construyó nada.** Se anota acá para que las decisiones de hoy no cierren la puerta, que es lo
único que el dueño pidió al mencionarlo.

**Qué encaja ya:** el modelo propietario → sedes del AIOS soporta que cada franquiciado sea un
`clients` propio con sus sedes, su día de corte y su modo de cobro. Del lado del producto, cada sede
ya es un tenant con su marca, su billetera y su número. Un franquiciado nuevo es un alta más.

**Qué falta y por qué no es trivial:**

1. **No existe el nivel "marca".** `clients` es el propietario; no hay una entidad por encima que
   agrupe a los franquiciados de un mismo restaurante. Sin ella no se puede responder "cuánto vende
   la marca completa" ni compartir catálogo de plantillas entre franquiciados.
2. **Las plantillas hornean el nombre del negocio.** Los 11 textos interpolan `brandName` dentro del
   cuerpo que Meta aprueba, así que dos franquiciados de la misma marca con nombres distintos
   necesitan **plantillas distintas aprobadas por separado** — no se comparten. Si la marca es la
   misma cadena exacta, sí se podrían compartir, pero cada uno tiene su propia WABA.
3. **Un número por propietario, no por marca.** El wizard de Zernio crea profile + número a nivel de
   `clients`. Cuatro franquiciados = cuatro números y cuatro facturas de Meta. Es probablemente lo
   correcto (cada uno responde por su línea), pero es una decisión, no un accidente.
4. **`idx_tenants_zernio_account_id`** ya bloquea que dos tenants compartan cuenta Zernio — el mismo
   índice que hoy impide activar la segunda sede de un propietario (§7.3 del spec del AIOS). Con
   franquicias el problema se multiplica.
5. **Los puntos del cliente son por tenant.** Un comensal que visita dos sedes de la misma marca
   acumula dos saldos separados. Para una franquicia eso puede ser exactamente lo que se quiere (cada
   franquiciado paga sus propios premios) o exactamente lo que no. **Es la pregunta más cara de las
   cinco** y hay que responderla antes de escribir código.

**Preguntas para el dueño, cuando toque:**

- ¿Los puntos son de la marca o de la sede? Determina si hace falta un identificador de cliente
  compartido entre tenants — el cambio de schema más grande de toda esta lista.
- ¿Quién paga a Cada1: cada franquiciado por su lado, o el franquiciante por todos? Si es lo segundo,
  `billing_mode = 'consolidated'` ya lo cubre; si es lo primero, ya funciona hoy.
- ¿Un franquiciado puede editar sus propias plantillas, o el franquiciante fija el mensaje de la
  marca? Hoy el permiso es por tenant, así que por defecto cada uno edita las suyas.

## 23. Un cliente, varias sedes — mismo recorrido, datos separados (pedido 2026-09-01) — ⚠️ TOCA LA BASE

> Pedido textual del dueño: *"cómo hacemos cuando es más de una sede para que
> independientemente de si comparten número o es separado, los clientes tengan el mismo
> recorrido en las dos sedes, pero separemos al mismo tiempo los datos para cada dashboard.
> Osea si voy a la sede Envigado y acumulo 70 puntos no voy a ir a la de Laureles a empezar
> de 0. El punto es tener un seguimiento porque es mi recompensa por asistir a cualquiera de
> las sedes."*

**Esto responde la pregunta abierta de §22**: los puntos son **de la marca**, no de la sede.
Y §22 ya advertía que esa respuesta implica *"el cambio de schema más grande de toda esta
lista"*.

### Los dos hechos que definen el problema (verificados contra la base, 2026-09-01)

**1. La identidad del cliente es POR TENANT.**

```sql
ALTER TABLE customers ADD CONSTRAINT customers_phone_tenant_key UNIQUE (phone, tenant_id);
```

(migración `00028`). El mismo celular en dos tenants son **dos filas distintas** de
`customers`, cada una con sus `total_visits`, y `point_transactions.customer_id` cuelga de
esa fila. Como el AIOS modela hoy **1 sede = 1 tenant**, la segunda sede arranca en cero. Es
exactamente el síntoma que reporta el dueño, y no es un bug: es el modelo actual funcionando
como se diseñó.

**2. Ningún evento sabe en qué sede ocurrió.**

`restaurant_locations` existe desde la `00014` y tiene `tenant_id`, `lat`, `lon`,
`radius_meters` — pero **`visits` NO tiene `location_id`**. Tampoco `point_transactions`,
`reward_grants`, `reward_redemptions` ni `review_events`. La tabla se usa solo en
`/api/dashboard/location`, y la comprobación de geocerca de `src/app/api/check-in/route.ts`
está **comentada** (≈líneas 226-237).

**La consecuencia incómoda: hoy NINGUNO de los dos modelos sirve.**

| | ¿Puntos compartidos? | ¿Dashboard por sede? |
|---|---|---|
| 1 sede = 1 tenant (modelo actual del AIOS) | ❌ arranca de 0 | ✅ natural |
| 1 marca = 1 tenant, sedes en `restaurant_locations` | ✅ natural | ❌ **imposible: los eventos no guardan la sede** |

Cualquier solución tiene que tocar la base. No hay atajo de configuración.

### Las dos arquitecturas posibles

**Opción A — 1 marca = 1 tenant · sede = `restaurant_locations`** *(recomendada)*

Los puntos se comparten solos, porque es la misma fila de `customers`. Lo que hay que
construir es la **separación**, no la unión:

1. `location_id uuid NULL REFERENCES restaurant_locations(id)` en `visits`,
   `point_transactions`, `reward_grants`, `reward_redemptions`, `review_events`. NULL =
   histórico anterior a esto, o sede desconocida.
2. El check-in tiene que **saber en qué sede está**. Hoy el tenant se resuelve por *host*
   (`getTenantByDomain`), así que un tenant = un subdominio = un QR. Con varias sedes hace
   falta que el QR distinga la sede — un parámetro en la URL, un QR por sede, o revivir la
   geocerca que está comentada. **Decisión de producto, no técnica.**
3. Filtro por sede en el dashboard, con "todas las sedes" como default.
4. **Mensajería:** hoy vive en `tenants` (`messaging_provider`, `zernio_account_id` — con
   índice ÚNICO —, subcuenta Twilio). Con un tenant por marca, las sedes comparten número
   por construcción. Para soportar *"número separado por sede"* la config de mensajería
   tiene que poder bajar al nivel de sede. Esto engancha con §14.1 y §14.2 del spec de alta
   (`docs/superpowers/specs/2026-08-30-alta-negocios-design.md`), que ya listaban como
   pendientes justo eso: quitar el único de `idx_tenants_zernio_account_id` y desambiguar a
   qué sede pertenece un mensaje entrante.
5. **El AIOS cambia de modelo:** `client_locations.tenant_slug` deja de ser 1:1. Varias
   sedes del mismo propietario apuntarían al MISMO tenant, y cada una a su
   `restaurant_locations`. `provisionTenant()` crea el tenant en la primera sede y solo
   agrega una `location` en las siguientes.

**Opción B — mantener 1 sede = 1 tenant y compartir el cliente entre tenants**

Exige una entidad "marca/grupo" por encima de `tenants` y una identidad de cliente
compartida entre ellos. Rompe el aislamiento por RLS que monta la `00026` (que es la
garantía de que un negocio no ve los datos de otro), la unicidad `(phone, tenant_id)`, y
todo servicio que asume que un cliente pertenece a un tenant. **Más riesgo, más superficie,
y a cambio solo evita el punto 5 de la Opción A.** No se recomienda.

### Preguntas para el dueño — hay que responderlas ANTES de escribir código

1. **Un premio ganado en Envigado, ¿se puede redimir en Laureles?** Si los puntos son de la
   marca, lo natural es que sí — pero el costo lo asume una sede concreta y eso hay que
   poder verlo en su dashboard.
2. **¿Cómo sabe el sistema en qué sede está el cliente?** QR distinto por sede, parámetro en
   la URL, o geocerca (hoy comentada). Determina el punto 2 de la Opción A.
3. **¿Un login por sede, o un login con selector de sede?** Hoy el JWT lleva `tenant_id`; si
   el tenant pasa a ser la marca, el permiso "solo mi sede" no existe todavía.
4. **¿La billetera y el cupo de línea son de la marca o de la sede?** Comercialmente ya está
   medio resuelto: `clients.billing_mode` del AIOS distingue `per_site` de `consolidated`.
5. **¿Hay ya algún negocio con más de una sede, o esto llega con los 25?** Cambia si esto es
   una migración de datos existentes o solo un modelo para altas nuevas.

### Qué NO hacer

- **No** empezar por el schema. La pregunta 2 (cómo se identifica la sede en el check-in)
  decide si `location_id` se puede llenar de verdad; sin esa respuesta, la columna nace
  vacía y el dashboard por sede sigue sin poder existir.
- **No** tocar los 4 tenants Twilio (Sushi Service, Don Alirio, Frangal, Demo) al migrar.
  Los cuatro son de una sola sede, así que la Opción A les aplica sin cambios: su tenant
  pasa a ser "la marca" y su sede actual es su única `restaurant_locations`.


### 23.bis — Verificado contra la base REAL (2026-09-02) y las 8 preguntas que faltaban

> El §23 se escribió con una auditoría de 10 agentes **sin acceso a Supabase**. Esta ampliación
> sale de tres sondas de **solo lectura** contra la base de producción (`AIOS_PRODUCT_DB_URL`,
> rol `aios_constelarys`) y del Supabase del AIOS con sesión real, más un mapeo de 17 agentes
> sobre 8 dimensiones del producto. Corrige y agranda el diagnóstico; no lo reemplaza.
>
> **Documento de decisiones para el dueño** (lenguaje de negocio, sin tecnicismos):
> <https://claude.ai/code/artifact/1fc931a7-2845-46e5-b974-60e33048d6b0>

#### Lo que la base confirma, y lo que agranda

| Afirmación del §23 | Veredicto contra la base |
|---|---|
| `customers_phone_tenant_key UNIQUE (phone, tenant_id)` | **Confirmado** — existe tal cual. |
| A las 5 tablas de eventos les falta `location_id` | **Confirmado y AGRANDADO**: no hay **ni una** columna `location*`/`sede*`/`branch*`/`store*` en **todo el schema `public`**. No son 5 tablas: es la base entera. |
| `restaurant_locations` existe | **Confirmado** — con `lat`, `lon`, `radius_meters`, `is_active`, `tenant_id`. |
| `aios_set_domain()` no existe | **Confirmado** — solo hay 5 funciones `aios_*`, todas SECURITY DEFINER. |
| La 00040 está aplicada | **Confirmado** — `is_super_admin()` es SECURITY DEFINER; `current_tenant_id()` **no** lo es (de ahí el 42501 del rol del AIOS). |

Datos nuevos que **cambian el tamaño del trabajo**:

- **27 tablas tienen FK a `tenants`. Cero a `restaurant_locations`.** Esa es la superficie real
  del modelo actual.
- **No existe NINGUNA vista SQL en `public`.** Todo el cálculo de métricas se hace en TypeScript
  (`dashboard.service.ts`). Un filtro por sede **no obliga a reescribir vistas** — abarata mucho
  la Opción A frente a lo que se temía.
- **32 policies de RLS: 27 invocan `current_tenant_id()` y 29 `is_super_admin()`.** Si el permiso
  "solo mi sede" se mete en RLS son 27 policies; si se resuelve en la capa de consulta, son 0.
  Eso convierte la pregunta 3 en una decisión de costo, no de gusto.
- **El aislamiento real NO lo da el RLS.** La app corre casi todo con `service_role` (55 archivos);
  lo que separa negocios son **144 `.eq('tenant_id', …)` repartidos en 48 archivos**. Cualquier
  filtro por sede hereda ese patrón — y su modo de fallo: el que se olvide filtra de más, sin error.
- **Volumen del histórico** (estimación del planificador, no un `COUNT`): `visits` ~1581,
  `customers` ~1176, `point_transactions` ~991, `review_events` ~685, `reward_grants` ~221,
  `reward_redemptions` ~1. El backfill de `location_id` es trivial.
- **El rol `aios_constelarys` no tiene NI UN privilegio a nivel de tabla.** Solo `SELECT` a nivel de
  **columna** sobre 13 columnas de `tenants` y 5 de `tenant_wallet_transactions`, más `EXECUTE`
  sobre las 5 funciones `aios_*`. Consecuencia directa para el punto 5 de la Opción A: para que el
  AIOS agregue una sede a un tenant existente hace falta una **función SECURITY DEFINER nueva**
  (tipo `aios_add_location(slug, location jsonb) RETURNS uuid`, más una de lectura). No hay camino
  de INSERT directo, y ampliar GRANTs es justo lo que cerró la 00035 v2.

#### Pregunta 5 — RESPONDIDA con datos

**No hay hoy ningún negocio con más de una sede.** En el AIOS: 3 propietarios (Sushi Service,
Don Alirio, Frangal), **una sede cada uno**, cero `tenant_slug` repetidos, los tres en
`billing_mode = 'per_site'`. En el producto: `restaurant_locations` tiene **~1 fila en total**
entre los 4 tenants.

→ **Esto NO es una migración de datos. Es un modelo para las altas nuevas** — el escenario barato.
Con una condición de calendario que vale plata: si uno de los negocios que entra tiene dos sedes y
se da de alta **antes** de resolver esto, se convierte en el caso caro (dos tenants que después hay
que fundir a mano, chocando con `customers_phone_tenant_key`).

#### La CUARTA vía para identificar la sede (el §23 solo listaba tres)

El §23 planteó QR por sede / parámetro en la URL / geocerca. Las tres comparten un defecto que el
mapeo destapó: **quien escribe la fila de `visits` no es el celular del cliente, es el del mesero.**
`check-in/route.ts:529-537` rechaza `action:'checkin'` salvo `source==='staff_scan'`, y el POST sale
de `mesero/confirm/page.tsx:154-164`, cuyo body **no lleva ni el host ni la URL del cliente**. Por eso
cualquier señal puesta del lado del cliente llega al `lookup` pero **no** al momento en que se escribe
el evento. Y la geocerca comentada (`route.ts:209-244`) mide el GPS del **cliente**: aun reviviéndola
mide a la persona equivocada, además de que su query no filtra `tenant_id` y usa `.single()`, así que
con dos sedes revienta.

**Cuarta vía: la sede la porta el dispositivo del mesero** (`staff_devices.location_id`).

- Toca el punto exacto de escritura, con una señal **autenticada que el cliente no puede falsificar**.
- `staff_devices` ya existe por tenant, ya lo activa el supervisor con su PIN, y su token ya viaja en
  cada request que crea una visita (`mesero/confirm/page.tsx:138-144`).
- Cuesta: una columna, un paso más en `/api/staff/device/register`, y sumarla a los dos SELECT que el
  check-in ya hace (`route.ts:556-588`).
- **§19.2 ya pedía invertir el modelo a "el dispositivo pertenece al restaurante"** — es el mismo
  trabajo, no uno extra.
- Hueco: el registro de un cliente **nuevo** en modo `auto` no pasa por auth de mesero
  (`route.ts:325-403`). Se tapa combinándola con `?sede=`. **Las vías no son excluyentes.**

**Ninguna de las cuatro cubre los domicilios**, que entran por n8n sin nadie parado en un local.

#### Las 8 preguntas que el §23 no hizo

1. **¿Las sedes son del mismo dueño y la misma razón social, o puede haber franquiciado/socio por
   sede? ¿Y si mañana una se separa?** — Es LA pregunta. El §22 ya había decidido lo contrario para
   franquicias ("cada franquiciado es un tenant propio"). Si la 2ª sede es franquicia, la Opción A le
   entrega a uno la base de clientes, el saldo, el número y el libro de consentimiento del otro.
2. **¿Cada sede tiene su ficha de Google, su teléfono de domicilios y su Instagram?** — Los cuatro son
   UN campo en `tenants.config`. Con un tenant por marca, todas las reseñas caen en la misma ficha, y
   `customers.google_review_clicked_at` (una fila por cliente) hace que quien reseñó Envigado nunca
   vea el pop-up de Laureles.
3. **¿Los domicilios salen de cocina central o cada sede despacha su zona?** — El webhook ya recibe
   `direccion` y `ciudad`. Si cada sede despacha su zona, la sede es derivable; si hay cocina central,
   `location_id` debe ser un valor fijo y explícito, no NULL.
4. **¿El menú y los precios son iguales?** — `avg_ticket` es una sola clave de `admin_settings` y
   alimenta 3 reportes de plata (`roiEstimate`, eficiencia de campañas, ROI del Golden Bullet).
5. **¿Un evento del calendario es de una sede o de la marca?** — `restaurant_events` no tiene sede y
   `findCustomersForEvent()` arma la audiencia con `.eq('tenant_id')`. El filtro `city` **no sirve de
   proxy**: es la ciudad del CLIENTE.
6. **¿Un mesero puede trabajar en las dos sedes?** — Si rotan, la cuarta vía deja de ser confiable y
   el backfill retroactivo vía `visits.registered_by_staff_id` deja de ser válido.
7. **¿Las dos sedes ofrecen los mismos premios y umbrales?** — `reward_tiers` tiene único
   `(point_threshold, tenant_id) WHERE is_active`: con un tenant por marca, premios distintos por
   sede son **inexpresables**, no incómodos.
8. **¿La 2ª sede abre con el mismo QR, o se imprime material nuevo?** — La 00029 eligió el dominio
   justamente para "preservar los QR impresos". Reimprimir es plata y logística.

#### Riesgos que nadie había puesto sobre la mesa

- **La Opción A es de una sola vía.** No existe ninguna función de merge ni de split en las 40
  migraciones. Fundir es un INSERT; separar es una migración con reglas de negocio inventadas al
  vuelo (¿de quién son los puntos, el saldo, los opt-outs?).
- **Los reportes de plata van a MENTIR, no a fallar.** Si se agrega `location_id` solo a las 5 tablas
  del §23 y se dejan `customers.total_visits`, `last_visit_at` y `avg_ticket` como están, varias
  pantallas mezclan numerador de sede con denominador de marca. No lanzan excepción, no rompen nada,
  no hay un solo test que lo cubra.
- **El cron de reactivación se apaga solo para la segunda sede.** `cron/reactivation/route.ts:158-161`
  parte la audiencia por `customers.last_visit_at`, que pasa a ser de la marca: un cliente fiel a
  Envigado **nunca** entra en el rescate de Laureles. No es un número mal mostrado, es una campaña que
  deja de enviarse en silencio. Igual `cron/birthday`.
- **Habeas data.** La política pública declara a `brand_name` responsable del tratamiento, y
  `consent_events` es append-only por diseño. La Opción A reescribe de facto a nombre de quién se
  otorgó cada consentimiento histórico, y no se puede corregir sin destruir su valor probatorio.
- **Sin red.** `tests/` tiene 6 archivos y **ninguno toca** `customers`, `visits`, puntos, check-in,
  redención ni dashboard. Además `tests/setup/bootstrap.sql:8` declara derivarse de "los 37 archivos
  de supabase/migrations" y hoy hay 40: el harness ya arrastra 3 migraciones de deriva.

#### Zonas acopladas que el §23 no inventarió

`restaurant_events` + `calendar.service.ts:262-287` (audiencia de marca) · `imported-contacts.service.ts:456-482`
(el ROI del Golden Bullet usa `customers.total_visits`, que pasa a ser de la marca) ·
`tenants.config` → `whatsapp_link` y `delivery_phone` (`branding.ts:75-88`, el auto-reply de WhatsApp
le da al comensal de Laureles el teléfono de Envigado) · `docs/features/referral-program.md:86-128`
(el plan aprobado de referidos no tiene ni `tenant_id`: si se construye después, nace roto) ·
`scripts/twilio-setup.mjs` (un número, un cliente).

**Verificado en negativo, para poder tacharla:** no hay notificaciones push ni PWA — cero resultados
de `web-push`/`firebase`/`onesignal`/`serviceWorker`/`manifest` en `src/` y `package.json`. Todo el
contacto con el cliente pasa por WhatsApp.

#### Lo único que sigue sin poder comprobarse

`SELECT phone, count(DISTINCT tenant_id) FROM customers GROUP BY phone HAVING count(*)>1` — o sea, si
hoy ya hay teléfonos repetidos entre tenants. El rol del AIOS no puede leer `customers` (42501: las
policies llaman a `current_tenant_id()`, que no es SECURITY DEFINER) y el `.env.local` del producto no
tiene `SUPABASE_SERVICE_ROLE_KEY`. **Hace falta el service role del producto para cerrarlo.** No es
bloqueante: con 0 negocios multi-sede, el caso solo importaría si un mismo cliente frecuenta dos
negocios distintos, que es otro escenario.



## 24. n8n visible y domicilios auditables (pedido 2026-09-01) — el fallo silencioso

> Pedido textual del dueño: *"en AIOS tengo que ser capaz de ver que el N8N esté funcionando, y
> para cada dashboard en el área de domicilio tenemos que ver qué clientes se han cargado,
> porque ahorita hay algo muy cierto: si usamos el flujo y no se carga nadie, se da cuenta. Y
> tenemos que ver cómo vamos a seguir usando ese flujo para todos los demás restaurantes."*

El dueño está describiendo un **fallo silencioso**, y tiene razón: hoy no existe ninguna señal.
Si n8n se cae, nadie se entera hasta que un cliente reclama.

### 24.1 Cuánto depende de n8n (verificado)

n8n no mueve solo los domicilios. En `n8n/` viven **9 workflows**, y cinco de ellos son los
crons del producto — Vercel Hobby no los corre:

| Workflow | Qué pasa si n8n está caído |
|---|---|
| `cron_queue-drain.json` (W4) | La cola de goteo deja de drenar: las campañas que exceden el cupo se quedan encoladas |
| `cron_birthday.json` | Nadie recibe su mensaje de cumpleaños. **Irrecuperable**: el cumpleaños ya pasó |
| `cron_reactivation.json` | Se detiene la reactivación de clientes en riesgo |
| `cron_reward-reminder.json` | Los premios vencen sin avisar al cliente |
| `cron_calendar-dispatch.json` | Los eventos programados no salen |
| `domicilios_whatsapp_v3/v4.json` | No entra ningún pedido de domicilio |
| `google_contacts_sync.json` | Los contactos dejan de sincronizarse |

**Ninguno avisa cuando falla.** El de cumpleaños es el peor: no hay reintento posible.

### 24.2 El flujo de domicilios, tal como es hoy

1. El operador manda el "cuadro" del pedido por WhatsApp al número del sistema.
2. `twilio-incoming` o `zernio` ve que el remitente está en `authorized_numbers` y reenvía a n8n.
3. n8n parsea con IA y hace `POST /api/webhook/delivery`.
4. Ese endpoint crea o encuentra el cliente, registra `visits.source = 'delivery'`, otorga
   puntos y manda el mensaje.

**Lo que ya existe** (no hay que construirlo): `visits.source = 'delivery'`,
`customers.source_channels` (`qr` / `delivery` / `both`), y dos gráficas que ya desglosan por
canal — `AcquisitionChannelChart.tsx` y `VisitsChart.tsx`.

**Lo que falta** es justo lo que el dueño pide: la lista de **qué clientes entraron por
domicilio**, y sobre todo **la alarma de silencio**. Una gráfica en cero se lee igual que "hoy
no hubo pedidos"; no distingue "el flujo está roto" de "fue un martes flojo".

### 24.3 Lo que se pide

**A. En el AIOS — semáforo de n8n por sede.** El AIOS ya tiene la fila de tarjetas y el
semáforo por sede (v1.3.0); esto es una señal más. Mínimo viable: *cuándo fue la última vez que
n8n tocó a este tenant*. Los crons ya escriben en `message_logs` y la cola en `send_queue`, así
que el dato se puede derivar sin instrumentar nada nuevo.

**B. En el dashboard de cada restaurante — apartado de domicilios.** Qué clientes se cargaron,
cuándo, y con qué pedido. Más la alarma: *"llevas N días sin un solo pedido de domicilio,
cuando tu promedio es M"*. La comparación tiene que ser contra el propio historial del tenant —
un umbral fijo le sirve a Sushi Service y no a una barbería.

**C. Cómo escala el flujo a los otros restaurantes.** Es la parte que menos definida está y
engancha con **§18**: con coexistencia el "cuadro" del pedido cae en la misma bandeja que las
conversaciones con comensales, y el webhook de Zernio ya no puede responder texto libre. Hoy
hay dos versiones del workflow (`v3` y `v4`) y **no está documentado cuál es la vigente ni qué
cambió**, lo cual es un problema por sí solo si hay que replicarlo 25 veces.

### Preguntas para el dueño — antes de escribir código

1. **¿Cuántos días de silencio son "está roto"?** ¿Fijo, o derivado del promedio del tenant?
2. **¿Quién recibe la alarma: tú en el AIOS, o el restaurante en su dashboard?** Cambia dónde
   se construye. Al restaurante puede alarmarlo un día flojo.
3. **¿`v3` o `v4` es el workflow vigente?** Sin eso, replicarlo a 25 clientes es adivinar.
4. **¿El apartado de domicilios es solo lectura, o desde ahí se configura el flujo?** §18 pedía
   *"una parte reservada para domicilios para explicarles cómo funciona y conectar algo si hace
   falta"* — eso último suena a configuración.
5. **¿Un restaurante sin domicilios debe ver el apartado?** Si no, hace falta una bandera por
   tenant que diga si tiene el flujo activo.

### Nota de diseño

Vale más una señal tosca y visible que una métrica fina que nadie mira. **La alarma de silencio
(B) es la que resuelve el problema que el dueño describió**; la lista de clientes cargados es lo
que permite confirmar que volvió a funcionar. Si hay que priorizar, la alarma va primero.


## 25. Migración n8n → Vercel (decidido 2026-09-02) — el VPS deja de ser un punto único de fallo

> Request original del dueño: *"Vamos a migrar todo el sistema de N8N hacia Vercel, voy a ir
> comprando la suscripción pero tú tienes que documentar todo"*. Motivación textual previa:
> *"prefiero pagar Vercel que n8n"*.

### 25.1 Por qué — y el motivo real no son los crons

Hay dos razones, y la segunda pesa más que la primera:

1. **n8n es un punto único de fallo sin alarma** (§24). Si el VPS `n8n.almojabananet.me` se
   cae, se detienen cumpleaños, reactivación, recordatorios de premio, calendario y la cola de
   goteo — y nadie se entera. El de cumpleaños es irrecuperable: el cumpleaños ya pasó.

2. **El plan Hobby de Vercel PROHÍBE el uso comercial.** Textual de
   `vercel.com/docs/limits/fair-use-guidelines` (consultado 2026-09-02):

   > *"**Hobby teams** are restricted to non-commercial personal use only. All commercial usage
   > of the platform requires either a Pro or Enterprise plan."*

   Define uso comercial incluyendo explícitamente *"receiving payment to create, update, or
   host the site"*. El producto se cobra a los restaurantes, así que hoy está en infracción.
   Vercel pausa cuentas por esto. Con 25 clientes, una pausa los tumba a todos a la vez —
   incluido el AIOS, que vive en el mismo equipo.

   **Este es el argumento decisivo, por encima de los crons.**

### 25.2 Corrección: `docs/04-deployment.md` estaba desactualizado

Ese doc decía que Hobby soporta *"2 crons diarios"* y que un tercero exigiría Pro. **Ya no es
cierto** — hay changelog propio de Vercel (*"Cron jobs now support 100 per project on every
plan"*). Números vigentes al 2026-09-02:

| | Crons por proyecto | Intervalo mínimo | Precisión |
|---|---|---|---|
| Hobby | 100 | 1 vez al día | ±59 min |
| **Pro** | **100** | **1 vez por minuto** | al minuto |

Lo único que Hobby limita hoy es la **frecuencia**, no la cantidad. Y **Pro se cobra por
EQUIPO**, no por proyecto: US$20/mes de platform fee (1 seat que despliega + US$20 de crédito
de uso + 1 TB de transferencia + 10M edge requests) cubre los ~20 proyectos del equipo
`josemorenosos-projects`, incluidos el producto y el AIOS.

Coste marginal de los crons: los dos de `*/15` suman ~5.760 invocaciones/mes, a US$0,60 por
millón. Es ruido frente al crédito incluido.

### 25.3 Inventario: qué hay que mover y cuánto cuesta cada cosa

| Workflow n8n | Qué es | Endpoint destino | Trabajo |
|---|---|---|---|
| `cron_birthday` (`0 13 * * *`) | cron | `/api/cron/birthday` | **cero código** |
| `cron_reactivation` (`0 15 * * *`) | cron | `/api/cron/reactivation` | **cero código** |
| `cron_reward-reminder` (`0 16 * * *`) | cron | `/api/cron/reward-reminder` | **cero código** |
| `cron_calendar-dispatch` (`*/15`) | cron | `/api/cron/calendar-dispatch` | **cero código** · exige Pro |
| `cron_queue-drain` (`*/15`) | cron | `/api/cron/queue-drain` | **cero código** · exige Pro |
| `domicilios_whatsapp_v4` | webhook + IA | hoy reenvía a n8n | **código real** |
| `google_contacts_sync` | webhook + Google API | hoy reenvía a n8n | **lo más difícil** |

**Los 5 crons no necesitan una línea de código nueva.** Verificado el 2026-09-02:

- Los 5 endpoints ya existen en `src/app/api/cron/` y los 5 exportan `GET`, que es el método
  que invoca Vercel Cron.
- `validateCronSecret()` (`src/lib/validators/cron.ts`) espera
  `Authorization: Bearer $CRON_SECRET` — **exactamente** el header que Vercel Cron envía solo.
  Es el contrato documentado de Vercel, así que no hay que tocar la autenticación; sí hay que
  no romperla.
- `CRON_SECRET` ya está en las variables del proyecto.
- Los crons aceptan `?tenant=` opcional y sin él procesan todos los tenants activos, así que
  basta **una entrada por endpoint**, no una por cliente.

O sea, la Fase 1 es editar `vercel.json` (hoy literalmente `{"crons": []}`) y apagar n8n.

### 25.4 Fases

**Fase 1 — los 5 crons.** Solo configuración. Requiere Pro por los dos de `*/15`; los otros
tres cabrían incluso en Hobby.

    {
      "crons": [
        { "path": "/api/cron/birthday",          "schedule": "0 13 * * *" },
        { "path": "/api/cron/reactivation",      "schedule": "0 15 * * *" },
        { "path": "/api/cron/reward-reminder",   "schedule": "0 16 * * *" },
        { "path": "/api/cron/calendar-dispatch", "schedule": "*/15 * * * *" },
        { "path": "/api/cron/queue-drain",       "schedule": "*/15 * * * *" }
      ]
    }

> ⚠️ **CORRECCIÓN 2026-09-02 — esta advertencia estaba INVERTIDA. NO sumar 5 horas.**
>
> Lo que decía este bloque: *"los workflows de n8n corren en hora de Bogotá… hay que sumar 5
> horas"*. **Es falso, y seguirlo habría sido el error real de la migración**: desplazaría los
> tres crons diarios a 18:00/20:00/21:00 UTC = 1pm/3pm/4pm en Colombia.
>
> **Lo que dicen los propios JSON del repo** (verificado archivo por archivo el 2026-09-02):
> las expresiones diarias **ya llevan la conversión a UTC horneada**.
>
> - `n8n/cron_reward-reminder.json:20` — `"notes": "16:00 UTC = 11:00 Colombia…"`, con
>   `"expression": "0 16 * * *"`. Lo dice el propio autor del workflow.
> - `n8n/cron_queue-drain.json:20` — *"Cada 15 min es indiferente a la zona horaria (a
>   diferencia de los crons diarios, que llevan la conversión UTC→Colombia dentro de la
>   expresión)"*.
> - `cron_birthday.json` — nodo «Diario 8am» con `0 13 * * *` (13 UTC = 8am Colombia). ✔
> - `cron_reactivation.json` — nodo «Diario 10am» con `0 15 * * *` (15 UTC = 10am). ✔
>
> **Conclusión: copiar las expresiones VERBATIM es lo correcto.** Es lo que hace la Fase 1.
>
> **Lo que sigue sin poder verificarse desde el repo:** ninguno de los 5 JSON declara clave
> `timezone` (su `settings` solo trae `executionOrder`), así que la hora **efectiva** dependía
> del `GENERIC_TIMEZONE` de la instancia. La intención documentada es UTC, pero eso es
> intención, no configuración. **Prueba empírica, 30 segundos, hacerla antes de desplegar:**
> abrir *Executions* de «Cron Cumpleaños» en n8n y mirar la hora de la última corrida. ~13:00
> ⇒ la instancia era UTC y la migración no mueve nada; ~08:00 ⇒ era hora local, hoy los
> mensajes salen a la 1pm y hay que restar 5 horas antes de desplegar.
>
> Las cadencias `*/15` no se ven afectadas en ningún caso.

**Fase 2 — domicilios.** Hoy `twilio-incoming` (`route.ts:130`) y `zernio` (`route.ts:171`)
reenvían a `N8N_DOMICILIOS_WEBHOOK_URL`. n8n extrae remitente y texto, llama a OpenAI
(`gpt-4o-mini`), parsea el JSON y hace `POST /api/webhook/delivery` — endpoint que **ya existe
y ya crea el cliente, la visita y los puntos**. Migrar = mover esos pasos al producto y llamar
al servicio directamente en vez de dar la vuelta por HTTP.

No hay cliente de OpenAI en el repo (verificado: cero referencias). El prompt de extracción
está en `docs/features/delivery-ai-parsing.md`.

**Fase 3 — Google Contacts.** La más difícil y la única realmente opcional. Son 8 nodos que
hablan con la Google People API (buscar, crear, comparar, actualizar) con la credencial OAuth
guardada en n8n. Llevarlo a Vercel exige implementar OAuth2 con refresh token propio.
`syncGoogleContact()` ya es fire-and-forget y hace no-op si falta
`N8N_GOOGLE_CONTACTS_WEBHOOK_URL`, así que **se puede dejar en n8n o apagar sin romper nada**.
No bloquea las fases 1 y 2.

### 25.5 El riesgo que ya se materializó una vez

**No pueden correr los dos a la vez.** `docs/04-deployment.md` registra que `birthday` y
`reactivation` se disparaban desde Vercel *y* desde n8n al mismo tiempo. **El cliente final
nunca recibió mensajes repetidos** —`hasRecentCampaignMessage()` los des-duplicaba— pero el
trabajo se hacía dos veces y quedaba un riesgo de carrera si los dos disparos coincidían al
segundo. Por eso `"crons": []` es la decisión vigente desde 2026-07-05.

Que exista esa red de seguridad **no autoriza a saltarse la regla**: la des-duplicación cubre
las campañas, no necesariamente la cola de goteo ni el calendario, que llegaron después.

Regla de la migración: **por cada entrada que se agrega a `vercel.json`, se desactiva su
Schedule Trigger en n8n en el mismo movimiento**, no después. Y se comprueba en la UI de n8n
que quedó inactivo — no se asume.

### 25.6 Qué se gana en observabilidad (parte de §24 sale gratis)

Vercel registra cada ejecución de cron con su resultado, y `vercel crons ls` los lista. Eso
responde *"¿está vivo?"* sin construir nada — la mitad de lo que pide §24. **La otra mitad
sigue haciendo falta**: la alarma de silencio de domicilios, porque un cron vivo que procesa
cero pedidos se ve igual que uno vivo con pedidos.

### 25.7 Preguntas abiertas — RESPONDIDAS por el dueño el 2026-09-02

Las cuatro quedaron cerradas. Se dejan con su respuesta para que nadie las re-pregunte:

1. **¿Se migra Google Contacts o se apaga?** → **Ninguna de las dos: se difiere.** La Fase 3 no
   se hace ahora, y cuando se haga el diseño pedido es **otro**: un botón para que el propio
   cliente conecte SU cuenta de Google. La credencial OAuth compartida que hoy vive en n8n **no
   se replica**. No bloquea nada (`syncGoogleContact()` ya es fire-and-forget y hace no-op si
   falta la variable de entorno).
2. **¿`v3` o `v4` es el workflow de domicilios vigente?** → **`domicilios_whatsapp_v4.json`**.
   `v3` queda documentado como histórico. (Los dos registran el mismo webhook path `domicilios`,
   así que solo uno puede estar activo a la vez.)
3. **¿Se apaga el VPS de n8n al terminar?** → **Sí, pero SOLO cuando la Fase 2 esté en
   producción.** Durante la Fase 1 el VPS sigue encendido sirviendo domicilios. Apagarlo antes
   rompe los pedidos **en silencio** en el canal Zernio (`webhook/zernio/route.ts:186` devuelve
   200 vacío) — es exactamente el fallo que denuncia §24.
4. **¿La cadencia `*/15` sigue siendo la correcta?** → **Sí, se mantiene tal cual.** No se toca
   en esta migración.

**Y una quinta decisión, sobre el orden de ejecución:** la Fase 1 se deja **commiteada en local
sin push**. El push y el deploy esperan a que el dueño confirme que el plan **Pro está activo**,
porque con Hobby una expresión `*/15` hace fallar el build de `main` — y un build roto no tumba
producción (Vercel mantiene el último deploy bueno) pero bloquea cualquier deploy posterior.

### 25.8 Estado de ejecución

| Fase | Estado | Qué falta |
|---|---|---|
| **Fase 1 — los 5 crons** | ✅ **escrita y commiteada en local (2026-09-02)** | Confirmar Pro → push a `main` → `vercel crons ls` (5 entradas) → `vercel crons run /api/cron/birthday` y revisar el log → apagar los 5 Schedule Trigger en n8n y **comprobarlo en su UI** |
| **Fase 2 — domicilios** | ⬜ sin empezar | Traer al producto lo que hace `domicilios_whatsapp_v4.json` (extraer remitente y texto, OpenAI `gpt-4o-mini`, parsear, registrar). `/api/webhook/delivery` ya existe: llamar al servicio directamente, no dar la vuelta por HTTP. Exige añadir dependencia y variable de entorno de OpenAI (hoy no existen). **Bloquea el apagado del VPS.** Al migrarlo, arreglar también el fallo silencioso de `webhook/zernio:186` |
| **Fase 3 — Google Contacts** | ⏸️ diferida | Ver respuesta 1 |

> Recordatorio del **orden**, que es donde más fácil se cuela un error: el VPS se apaga
> **después** de la Fase 2, no después de la Fase 1. Los 5 Schedule Trigger se apagan en la
> Fase 1; el VPS sigue vivo sirviendo W1.


---

**Este documento se generó con una auditoría de 10 agentes en paralelo** (Twilio/acoplamiento,
arquitectura multitenant, calendario, QR, referidos, personalización check-in, branding/plantillas,
puntos/niveles, push/FCM, y visión general del proyecto) — ninguno tuvo acceso a Supabase en vivo (el
MCP requiere autorización OAuth no disponible en esa sesión), así que todo lo aquí descrito está
verificado contra **código y migraciones versionadas**, no contra datos reales en producción. Si algo
de este documento no coincide con lo que ves en el dashboard real, la base de datos manda.
