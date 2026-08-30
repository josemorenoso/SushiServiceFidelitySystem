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

**Sin detalles todavía.** El dueño no especificó qué cambios necesita — queda pendiente que los
describa antes de que cualquier IA empiece a investigar o codear este frente (Mandamiento I: ante
duda, preguntar — no asumir alcance).

**Preguntas:**
- ¿Qué de la pantalla o el flujo actual de Campañas no funciona o no alcanza?
- ¿Es una queja de UI (cómo se ve o se usa) o de funcionalidad (qué puede o no puede hacer una
  campaña hoy)?
- ¿Tiene relación con el cambio de plantillas de §12 (por ejemplo, elegir el estilo de una campaña
  puntual) o es un problema aparte?

---

## Handoff — cómo continuar sin releer el repo entero

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
3. **§12 (Plantillas) tiene preguntas URGENTES sin responder — no empezar a codear ese frente hasta
   tener las respuestas del dueño** (ver la lista numerada en §12).
4. **§13 (Campañas) no tiene alcance definido todavía** — preguntarle al dueño antes de investigar o
   codear.
5. Para cada una de las 7 mejoras §3–§9, las preguntas listadas en su sección son decisiones del
   dueño, no ambigüedad técnica — no asumir la respuesta.

**Todo lo que dice "sin trackear en git" o "sin commitear" en este documento** (`scripts/seed-new-tenant.sql`,
`scripts/alta-frangal.sql`, `Level 2.0/` [irrelevante, ignorar], y los ~10 archivos con diff pendiente)
seguía así al momento de esta investigación (2026-08-28) — si esta fecha ya pasó, correr `git status`
antes de asumir que sigue igual.

**Este documento se generó con una auditoría de 10 agentes en paralelo** (Twilio/acoplamiento,
arquitectura multitenant, calendario, QR, referidos, personalización check-in, branding/plantillas,
puntos/niveles, push/FCM, y visión general del proyecto) — ninguno tuvo acceso a Supabase en vivo (el
MCP requiere autorización OAuth no disponible en esa sesión), así que todo lo aquí descrito está
verificado contra **código y migraciones versionadas**, no contra datos reales en producción. Si algo
de este documento no coincide con lo que ves en el dashboard real, la base de datos manda.
