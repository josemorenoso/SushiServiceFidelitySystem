# Un número por sede, y las franquicias — diseño

> ⚠️ **ARCHIVADO por decisión del dueño (2026-10-14, noche): por ahora NO se construye.** Un número por marca, compartido
> por todas sus sedes («si acumula todo desde varias sedes no debería recibir mensajes desde varios números… eventualmente
> va a bloquear un número»; «simple es mejor, dejalo así»). D5-a, D5-c y D5-e decididas; D5-d («franquicia» en el AIOS)
> queda abierta; el conglomerado de marcas con un solo número es D5-f (`docs/PENDIENTES.md` §8). Lo que sigue vale como
> inventario verificado (qué emisor manda por dónde, el entrante de Zernio) para el día que se reabra.

> **Estado:** DISEÑO, sin código y sin migración escrita (parte 3 de `docs/prompts/2026-10-14-sedes-separadas.md` §5).
> **Fecha:** 2026-10-14 · **Modelo:** Opus 5.5 · **Para quién:** el comandante y las sesiones que construyan F9. El §0 y
> el §9 son para el dueño.
> **Verificado contra:** el producto en `d710862` y el AIOS (`Level 2.0/aios-constelarys`, solo lectura) en `4b88ab5`.
> Cada afirmación lleva archivo y línea de esos commits. Las rutas del AIOS se escriben `aios:/…`
> (= `Level 2.0/aios-constelarys/…`). `ESTADO.md` se cita por sección: sus líneas se corren con cada fila del tablero.
> Cuatro archivos los tiene a medio editar la parte C del ciclo el 14-10 (`queue-drain/route.ts`,
> `calendar.service.ts`, `cycle.service.ts` y `campaigns/manual/route.ts`): se citan como están en `d710862`, y sus
> líneas se van a correr.
> **No se llamó a Meta, a Zernio ni a Twilio.** Lo que depende de ellos y no está en el repo va marcado **«por
> verificar»** (§10).

**El pedido del dueño (14-10, textual):** *«Comparte número y datos sí, perfecto, pero hay cosas que son de cada
sede… Siempre van a compartir datos las franquicias y sucursales; lo que puede cambiar es que no compartan número, o
que alguna tenga número en coexistencia y otra tenga número comprado por Zernio.»*
(`docs/prompts/2026-10-14-sedes-separadas.md:27-29`)

---

## 0. La respuesta corta

1. **Hoy una marca tiene UNA línea.** Todo lo que envía, recibe o cuenta cupo la lee de la fila de la marca en
   `tenants`, y las plantillas tienen un puntero por marca en `admin_settings`. Si mañana se conectara un segundo
   número a una marca, no saldría nada por él, y lo que le escribieran se perdería sin rastro. Eso incluye los «SALIR»
   (§1.3).
2. **Lo que propongo:** una sede **puede** tener línea propia. Si no la tiene, usa la de la marca. Es el diseño del
   02-09 (`location_messaging`, multi-sede §6.3) con la corrección del 07-09: la línea vive en `tenant_connections` y la
   sede solo apunta a ella (conexiones §4.1).
3. **Qué número usa cada mensaje:**
   - Si hubo un acto (escaneo, registro, canje, domicilio), sale por la línea de esa sede.
   - Si no lo hubo (cumpleaños, ciclo, campañas), sale por la línea de la sede a la que el cliente fue la última vez.
     Si no se sabe, por la de la sede donde se registró. Si tampoco, por la de la marca.
   - Una respuesta dentro de las 24 h sale siempre por el número al que escribió el cliente.
   - La tabla completa está en el §3.
4. **Lo que no cambia:** los clientes, los puntos, los premios y el opt-out siguen siendo de la marca. Un «SALIR» a
   cualquiera de los números saca al cliente de **toda** la marca (Ley 1581).
5. **El costo de un número propio:** si el número vive en otra WABA, cuesta 16 aprobaciones más de Meta (8 cuando se
   haga B1). Además pide su propio método de pago, su nombre visible y su verificación, y arranca con un cupo bajo
   (250 al día). Si es comprado, se suma el alquiler mensual de Zernio, que todavía no se cobra en ningún lado (§8.3).
6. **El orden propuesto:**
   1. El entrante. Es barato y protege los «SALIR».
   2. Las líneas de cada sede y sus plantillas.
   3. El envío por línea, solo para los mensajes que tienen sede del acto.
   4. Los envíos masivos.
   5. Las franquicias en el AIOS.

   Con una sola línea por marca, que hoy es el caso de las 8 marcas vivas, cada fase deja todo **igual que hoy**.
7. **Las franquicias:** hoy, elegir «franquicia» en el AIOS crea una marca aparte por cada local, sin datos
   compartidos (§6.1). Con la regla del 14-10 eso se invierte: una franquicia es un **grupo** cuyas sedes pueden tener
   número, tarjeta y administrador propios.
8. **Cinco preguntas para el dueño**, cada una con su valor por defecto, en el §9.

---

## 1. Cómo funciona hoy: lo que habría que separar

### 1.1 La línea es una fila de `tenants`

| Qué | Dónde vive | Evidencia |
|---|---|---|
| Identidad y credenciales de la línea | 7 columnas de `tenants` en cada lectura de marca: `twilio_subaccount_sid`, `twilio_subaccount_auth_token`, `twilio_messaging_service_sid`, `twilio_whatsapp_number`, `messaging_provider`, `zernio_account_id` y `zernio_phone_number` (`zernio_profile_id` también viaja, pero el envío no la usa) | `src/lib/tenant.ts:19-20` |
| Lo que el envío recibe | `TenantMessagingContext`, hecho con esas columnas. No tiene sede ni línea | `src/services/whatsapp.service.ts:77-90` |
| Twilio o Zernio | Se elige por marca: `options.provider ?? tenant.messaging_provider` | `whatsapp.service.ts:388-392` |
| La cuenta de Twilio | La subcuenta de la marca, o el env si la marca es la master | `src/lib/twilio/tenant-credentials.ts:67-91` |
| La guarda de Zernio | Sin `zernio_account_id` o sin `zernio_phone_number` no sale nada. Nunca cae a Twilio | `whatsapp.service.ts:252` |
| El cupo diario | `reserveSendSlot(tenant.id, phone, clase)`: por marca | `whatsapp.service.ts:222`; `src/services/line-budget.service.ts:102-113` |
| `line_budget()` | Recibe solo `p_tenant` y lee el límite, el estado y la calidad de `tenants`. El consumo y el p95 transaccional se cuentan por marca | `supabase/migrations/00037_send_governance.sql:207`, `:226-229`, `:238-243`, `:272-282` |
| `reserve_send_slot()` | Candado `pg_advisory_xact_lock(hashtext(p_tenant))`: uno por marca | `00037:322`, `:341` |
| Salud de la línea | `syncTenantHealth()` lee el número de la marca y escribe en `tenants` el límite, la calidad y el estado | `src/services/line-health.service.ts:204`, `:303-371` |
| El número nuevo nace con | `messaging_daily_limit` = 250 | `00037:44` |

### 1.2 Las plantillas: un puntero por clave y por marca

- El puntero es `admin_settings` con PK `(key, tenant_id)` (`supabase/migrations/00028_seed_sushi_service.sql:63-64`).
  Su único escritor es `promoteVersion()` (`src/services/template.service.ts:1341`, upsert en `:1368-1378`).
- `template_versions` tiene `UNIQUE (tenant_id, provider_ref, language)`
  (`supabase/migrations/00039_template_catalog.sql:106-107`). Por eso dos WABA de la misma marca **no pueden** guardar
  la misma plantilla con el mismo nombre.
- **El que envía elige la plantilla antes de enviar.** Lee el puntero de la marca y se lo pasa a `sendTemplateMessage`
  como `contentSid`. Por ejemplo `src/app/api/check-in/route.ts:660` y `src/app/api/cron/birthday/route.ts:53-54`.
  - Son 22 archivos de `src/` fuera de `constants/` los que mencionan algún `*_template_sid`.
  - **La cola guarda la plantilla al encolar**: el drenador manda `item.template_sid` tal como quedó
    (`src/app/api/cron/queue-drain/route.ts:349-351`). Si la línea se eligiera recién al drenar, la plantilla tendría
    que resolverse en ese mismo momento.
- El catálogo son **16 plantillas por marca nueva** (`src/constants/template-catalog.ts:61`). El nombre del negocio va
  horneado en el texto antes de mandarlo a Meta (`{negocio}`, `template-catalog.ts:63-68`), así que la plantilla de
  una sede diría lo mismo que la de la marca.
- El estado de una plantilla Zernio llega por webhook y se resuelve **por la cuenta de la marca**: un evento de una
  segunda cuenta no encuentra marca y se descarta (`src/app/api/webhook/zernio/route.ts:656-666`). Una plantilla
  aprobada en la WABA de la sede no se promovería nunca.
- En Zernio una plantilla se crea con `accountId` obligatorio
  (`aios:/docs/zernio-api-contract.md:308-328`). Además, **un profile solo puede tener una cuenta
  por plataforma** (`zernio-api-contract.md:433`): cada número de WhatsApp necesita su propio profile.

### 1.3 El entrante: un número = una marca, y el de la sede no existe

| Camino | Cómo encuentra la marca | Evidencia |
|---|---|---|
| Zernio · `message.received` (opt-out, botones, domicilios) | `getTenantByZernioAccountId()`: solo `tenants.zernio_account_id`, con `.single()`. Si no encuentra, responde 200 y no hace nada | `src/lib/tenant.ts:329-345`; `webhook/zernio/route.ts:209-216` |
| Zernio · `message.sent` (el auto-chat) | La misma función. El auto-chat **ya es por línea** (`tenant_connections` por `tenant_id` + `zernio_account_id`), pero para llegar ahí hace falta resolver la marca primero | `webhook/zernio/route.ts:459-465`, `:484-489` |
| Zernio · estado de plantilla | La misma función | `webhook/zernio/route.ts:662` |
| Twilio · entrante | `getTenantByWhatsappNumber()`: solo `tenants.twilio_whatsapp_number`, con `.single()` | `src/lib/tenant.ts:310-326`; `src/app/api/webhook/twilio-incoming/route.ts:218-219` |

**El agujero que esto deja**, aunque nadie haya pedido todavía un segundo número:

- `tenant_connections` ya admite N líneas por marca (`supabase/migrations/00054_conexiones.sql:48`, `:97`).
- Pero una línea que no sea la principal **no está en `tenants`**. Lo que entra por ella no encuentra marca y se
  descarta en silencio: opt-outs que nunca se registran (riesgo legal), pedidos de domicilio y «sí» del Golden Bullet.
- El spec de multi-sede ya lo había avisado (`docs/superpowers/specs/2026-09-02-multisede-design.md:424-429`).

### 1.4 Lo que ya es de la sede y lo que ya está preparado

- **Ya es de la sede:** el enlace `wa.me` y el teléfono de domicilios (`restaurant_locations.config`,
  `src/lib/location-config-paths.ts:52-53`); el operador de domicilios (`authorized_numbers.location_id`, que el
  webhook lee en la misma consulta que lo autoriza: `webhook/zernio/route.ts:369-375`, `:399`).
- **La sede del cliente ya se guarda:**
  - `customers.origin_location_id` y `customers.last_visit_location_id` nacen en el alta
    (`src/services/customer.service.ts:63-66`).
  - La segunda se refresca en cada visita con sede conocida; un NULL no pisa la última sede buena
    (`customer.service.ts:101-103`).
- **La cola ya tiene la columna de sede:** `send_queue.location_id` (`00043_location_id_eventos.sql:122`) y
  `EnqueueItem.locationId` (`src/services/send-queue.service.ts:89`, escrita en `:164`). Pero `QueueRow` no la tiene
  (`send-queue.service.ts:99-123`) y el drenador no la usa (`queue-drain/route.ts:349-355`). Solo el calendario encola
  con sede (`calendar.service.ts:800`).
- **`message_logs` tiene dos columnas de sede** (`00043:116`, comentarios en `:299-302`):
  - `location_id` dice **a qué sede se imputa** el mensaje. Hoy la llenan solo el check-in y los domicilios
    (`src/services/message-log.service.ts:67`; los que la pasan, en el §3).
  - `line_location_id` dice **«la sede dueña de la línea»**. No la escribe nadie: en `src/` solo aparece en un
    comentario (`message-log.service.ts:41`).
- **Ya hay una mezcla de Twilio y Zernio en una misma marca**, para el Golden Bullet: `options.provider`
  (`whatsapp.service.ts:126-137`), que fija `goldenBulletProviderFor()`
  (`src/services/club-optin.service.ts:149-166`). Lo normal sale por Twilio y la difusión por la cuenta de Zernio.
  Las dos credenciales viven en la misma fila de `tenants`.
- **El opt-out es de la marca, por (celular, marca):** `setWhatsappOptOut()` (`customer.service.ts:195-200`) y
  `isPhoneOptedOut()` (`:266-280`), desde los dos webhooks (`webhook/zernio/route.ts:287-309`;
  `twilio-incoming/route.ts:301`). La política de privacidad nombra como responsable a la marca
  (`src/app/(public)/privacidad/page.tsx:36-38`).

### 1.5 El AIOS: un número por dueño

- El WhatsApp se aprovisiona **por cliente del AIOS**: un profile, un número y una cuenta en
  `clients.whatsapp_provisioning` (`aios:/supabase/migrations/00003_owners_sites_billing.sql:51-61`).
- Activar la mensajería en una segunda sede del mismo cliente **se rechaza**
  (`aios:/src/lib/actions/provisioning.ts:2018-2037`).
- ⚠️ **El motivo que da ese rechazo apunta a un arreglo equivocado** (`provisioning.ts:2032-2034`): dice que hace falta
  «quitar el índice único `idx_tenants_zernio_account_id`». El spec de multi-sede dice que quitarlo **sería un error
  grave**, porque el entrante se perdería en silencio (multi-sede §6.3, `2026-09-02-multisede-design.md:424-429`). Lo
  que hace falta es una unicidad que abarque las dos tablas (§5.3). Queda en `docs/PENDIENTES.md` como **AIOS-INDICE**.

---

## 2. El modelo que propongo

**La decisión base es D6 en su forma del 07-09 por la mañana, más la regla del 14-10.** La marca tiene N líneas. Cada
sede usa la de la marca, salvo que tenga una propia. Los datos se comparten siempre.

```
tenant_connections   ── QUÉ LÍNEAS TIENE LA MARCA (ya existe, 00054)
  una fila por línea     número, camino (coexistencia / BYO / comprada), estado del alta, cuenta y profile de Zernio,
                         y (nuevo) las columnas de cupo y salud de la línea: límite diario, calidad, estado

location_messaging   ── QUÉ SEDE USA CUÁL (nueva)
  PK (location_id)       sin fila = la línea principal de la marca
                         con fila = esta sede sale por connection_id
```

Las reglas, en orden:

1. **La línea no tiene sede; es la sede la que apunta a una línea.** `tenant_connections` sigue sin `location_id`
   (`00054:31`). Una línea compartida por tres sedes son tres filas de `location_messaging`
   (`docs/superpowers/specs/2026-09-06-conexiones-design.md:285-287`).
2. **`location_messaging` sigue la regla transversal de multi-sede:**
   - `location_id` lleva FK compuesta `(location_id, tenant_id) → restaurant_locations (id, tenant_id) ON DELETE
     RESTRICT`.
   - `connection_id` también: `(connection_id, tenant_id) → tenant_connections (id, tenant_id)`. Para eso hace falta
     un `UNIQUE (id, tenant_id)` en `tenant_connections`, igual que la 00041 hizo con las sedes.
   - Pasar de compartida a propia es un `INSERT`; volver es un `DELETE` (multi-sede §6.3,
     `2026-09-02-multisede-design.md:412-415`).
3. **Las 14 columnas de línea de `tenants` no se MUDAN** (`2026-09-02-multisede-design.md:417-422`). `tenants` queda
   como reflejo de la principal, y cada línea secundaria lleva en `tenant_connections` las que le tocan.
   - Esto cumple la decisión del 07-09, «ahora se AGREGA, no se MUEVE» (`2026-09-06-conexiones-design.md:306-316`).
   - Como las secundarias son solo de Zernio (regla 5), no copian las 4 `twilio_*` ni `messaging_provider`. Sus
     `zernio_*` ya están en la fila (`zernio_profile_id`, `zernio_account_id`, `phone_e164`: `00054:69-72`). Lo nuevo son
     las 6 de cupo y salud: `messaging_daily_limit`, `messaging_limit_synced_at`, `quality_rating`, `line_status`,
     `line_status_reason` y `line_status_changed_at`.
   - Todos los lectores de hoy siguen leyendo `tenants`, que sigue siendo la principal.
   - **Un solo escritor** para las dos copias: `connection_apply_whatsapp()` ampliado, en una transacción
     (`docs/features/conexiones.md:116-129`). Dos escritores divergen.
4. **NULL = la principal**, en todos lados (`location_messaging` sin fila, `message_logs.line_id` NULL). Cualquiera
   sea su proveedor.
5. **Las líneas nuevas de una sede son solo de Zernio**, ya sea por coexistencia o compradas. La principal puede
   seguir en Twilio. Por qué:
   - Twilio está de salida: el AIOS da de alta en Zernio por defecto (`docs/features/zernio-messaging.md:103`) y la
     línea Twilio de Sushi Service muere (`ESTADO.md` §3 0.SUSHI).
   - Una línea Twilio por sede necesitaría un depósito para su `auth_token`, que hoy es una columna de `tenants` que
     viaja en cada lectura (`tenant.ts:19-20`).
   - `tenant_connections.provider` solo admite `'whatsapp_zernio'` (`00054:57`).
6. **Los datos no se tocan.** Clientes, puntos, premios, niveles, tarjeta, billetera, cupo de marketing por cliente y
   opt-out siguen siendo de la marca (`2026-09-02-multisede-design.md:57-89`).

---

## 3. Qué línea usa cada mensaje (punto 1)

### 3.1 La regla, en una función

```
lineaDeEnvio(marca, sedeDelEnvio)   →   location_messaging[sedeDelEnvio]  ??  la principal

sedeDelEnvio =
  1. la sede del ACTO (escaneo, registro, canje, domicilio)         ← si la hay
  2. customers.last_visit_location_id                                ← «donde viene yendo»
  3. customers.origin_location_id                                    ← donde se registró
  4. NULL → la principal
```

**¿Sirve la cascada del §6.1 del spec de multi-sede para elegir la línea? Sí, con tres ajustes:**

- **La misma función para las dos cosas.** El §6.1 (`2026-09-02-multisede-design.md:374-398`) diseñó la cascada para
  **imputar** un envío masivo a una sede, y la dejó para F6 (`whatsapp.service.ts:59-61`). Elegir la línea es otra
  pregunta con la misma respuesta. Tiene que ser **una sola función pura**: si la imputación dice Laureles y la línea
  sale por Envigado, el informe y la factura de Meta no cuadran.
- **El final es la principal, no «sin línea».** Para imputar, el NULL se muestra como «sin sede». Para enviar, el NULL
  sale por la principal: es lo que pasa hoy con todos.
- **La sede se fija al encolar y la línea se decide al enviar.**
  - La sede del envío se calcula y se guarda en `send_queue.location_id` al encolar. Es la regla del §6.1 («estampada
    al enviar y congelada para siempre», `2026-09-02-multisede-design.md:376`), adelantada al momento de encolar.
  - La línea y su plantilla se resuelven al drenar, a partir de esa sede, porque entre encolar y drenar la línea puede
    congelarse o la plantilla aprobarse.
  - El drenador **no** vuelve a calcular la cascada desde el cliente. Si lo hiciera, un cliente que fue a la otra sede
    esa misma tarde cambiaría de número a mitad de campaña.

**Por qué la última visita y no el origen:** «un mensaje de reactivación existe para que la persona vuelva, y va a
volver a donde viene yendo» (`2026-09-02-multisede-design.md:385-388`). El costo es que quien alterna entre las dos
sedes puede recibir campañas de los dos números. Es la pregunta 1 del §9.

### 3.2 Mensaje por mensaje

Hay 11 llamadas a `sendTemplateMessage` fuera de `whatsapp.service.ts`, y ninguna otra plantilla sale por fuera
(`whatsapp.service.ts:357-364` es el único punto de salida).

| Mensaje | Dónde se envía | ¿Conoce la sede hoy? | Línea propuesta |
|---|---|---|---|
| Bienvenida y puntos del check-in, «Nivel desbloqueado» | `sendCheckinTemplate` (`check-in/route.ts:115`, envío en `:133-137`). Lo llaman la bienvenida `:669`, el nivel `:1027`, la bienvenida verificada `:1039` y los puntos `:1053` y `:1068` | **Sí.** `regLocation` (`:556-561`) y `visitLocation` (`:926-932`), con la precedencia mesero → aparato → host. Las dos viajan como `locationId` | La de la sede del acto. Un mesero rotativo usa la sede del aparato |
| Domicilio: bienvenida, nivel y puntos | `sendDeliveryTemplate` (`src/services/delivery.service.ts:212`, envío en `:228`) | **Sí.** `deliveryLocation` (`:307`), que sale de `authorized_numbers.location_id` | La de la sede del pedido (el conflicto con el número de entrada, en el §5.3) |
| Premio seguro, caja misteriosa, caja dorada | `src/app/api/mystery-box/resolve/route.ts:217` y `:239` | **La conoce y no la pasa**: `locationId` sale de `resolveHostContext` (`:100`) y no llega al `logContext` | La de la sede del host (el canje se hace parado en la sede) |
| Visita concedida a mano desde el panel | `src/app/api/dashboard/check-in-override/route.ts:111` y `:128` | **No, a propósito** (`:79-85`). Además no deja `logContext`: no queda fila en `message_logs` | Cascada (2-3-4): no hay sede del acto |
| Recordatorio de premio | `src/app/api/cron/reward-reminder/route.ts:212` | No | Cascada |
| Cumpleaños | `src/app/api/cron/birthday/route.ts:122` | No, a propósito (`:114-119`). El cliente se lee entero, así que las dos sedes ya están en memoria | Cascada |
| Reactivación (camino viejo, ciclo apagado) | `src/app/api/cron/reactivation/route.ts:255` y `:336` | No | Cascada |
| Toques del ciclo | Los encola `cycle.service.ts:735` con `locationId: null` (`:728`; el toque nace sin sede en `:647`) y salen por el drenador | No | Cascada, guardada al encolar |
| Campaña manual | Envío inmediato `campaigns/manual/route.ts:296`; encola en `:361-379`, sin sede | No | Cascada, guardada al encolar. Si se filtra por sede, la de esa sede |
| Evento del calendario | Inmediato: `executeAutoEvent` (`calendar.service.ts:584`, envío en `:733`), **sin** la sede. En cola: `:800`, **con** `event.location_id` | Sí, si el evento es de una sede (`audience_scope='location'`) | Evento de una sede: la de esa sede. Evento de toda la marca: cascada por cliente |
| Golden Bullet: prueba y difusión | Prueba: `imported-contacts/test-send/route.ts:111`. Difusión: el drenador (`queue-drain/route.ts:343-355`) | No: un contacto importado no es cliente y no tiene sede | **La que elija el operador para esa base**, por defecto la principal. Reemplaza al `golden_bullet_provider` de hoy (§5.4) |
| Regalo manual del ciclo | La parte C lo está construyendo el 14-10 (`cycle-gift.service.ts`, sin commitear) y encola sin sede | — | Cascada |
| Respuesta dentro de las 24 h: el acuse del «sí» y el del «SALIR» y el aviso de domicilio que queda pendiente (18.c) | Zernio: `contestarEnConversacion()` (`webhook/zernio/route.ts:136`, envío en `:145`). Twilio: TwiML en la misma respuesta (`twilio-incoming/route.ts:267-350`, `:405`) | — | **Siempre la línea por la que entró.** La conversación y su ventana son de ese número; no hay otra opción |

**Lo que el inventario destapó y hay que arreglar antes de mudar los masivos (F9.4).** No son bugs de hoy: con una
línea no cambian qué número sale. Pero el envío por línea se apoya en ellos:

1. **El drenador pierde la sede dos veces:** `QueueRow` no tiene `location_id` (`send-queue.service.ts:99-123`) y el
   envío no pasa `locationId` (`queue-drain/route.ts:354`). El calendario es lo único que encola con sede, y esa sede no
   llega a `message_logs`. El comentario de la columna promete que «se copia a `message_logs.location_id` al enviar
   (F6)» (`00043:308`), y no se hace.
2. **La caja misteriosa y el envío inmediato del calendario conocen la sede y no la pasan** (`mystery-box/resolve/route.ts:100`;
   `calendar.service.ts:733`). Los puntos 1 y 2 quedan en `docs/PENDIENTES.md` como **N-SEDE-ENVIO**.
3. **`check-in-override` no deja `logContext`** (`check-in-override/route.ts:111`, `:128`). Por eso se clasifica como
   `'manual'`: `classifyMessageType(logContext?.messageType ?? 'manual')` (`whatsapp.service.ts:221`) le cobra a un
   mensaje transaccional («Nivel desbloqueado» y puntos son `transactional`; `manual` es `campaign`:
   `src/constants/messaging.ts:29-31`, `:46`) el cupo de campañas. Es un bug de hoy, chico, y va a
   `docs/PENDIENTES.md` como **N-OVERRIDE-LOG**.

---

## 4. Plantillas (punto 2)

### 4.1 Cuántas aprobaciones más por sede

| Caso | Aprobaciones de Meta | Por qué |
|---|---|---|
| La sede comparte la línea de la marca (el de hoy) | **0** | Una WABA, un juego de plantillas (`2026-09-06-conexiones-design.md:215-239`: «la plantilla es de la marca, la sede viaja en las variables») |
| Número propio **en otra WABA** (en qué WABA queda una coexistencia depende de lo que se elija en el Embedded Signup: por verificar, §10) | **16** del catálogo (`template-catalog.ts:61`), **8** si se construye B1 (decidida en `docs/PENDIENTES.md` §8 B1, sin construir: §3.1 fila 4). Más las de la Biblioteca y la del Golden Bullet que esa sede vaya a usar | Las plantillas son de la WABA. Con Zernio se crean por `accountId` (`zernio-api-contract.md:328`) |
| Número propio **en la MISMA WABA** que la marca | **0, si se confirma** que dos números de una WABA comparten plantillas también por Zernio | **Por verificar** (§10): Meta guarda las plantillas en la WABA, pero el contrato de Zernio crea y lista por `accountId` y no dice si una segunda cuenta de la misma WABA las ve. Tampoco está verificado que el Embedded Signup de coexistencia deje meter el número en una WABA que ya existe |

Cada aprobación tarda de 24 a 72 h, y se mandan juntas con el botón «Enviar los N juntos a Meta» (`ESTADO.md` §3
0.PLANTILLAS). Con eso, el estreno de una línea nueva es un viaje de 1 a 3 días, no 16.

### 4.2 Cómo lo vive Plantillas

- **Sigue siendo una pantalla y un catálogo**, con los textos de la marca. La sede no tiene textos propios (pregunta 2
  del §9). Lo mismo vale para la Biblioteca.
- Con 2 o más líneas aparece arriba **un selector de línea**: «La de la marca · Envigado». Cada línea tiene su estado
  por plantilla y su botón «Enviar los N juntos a Meta». Con una línea, la pantalla queda exactamente como hoy.
- **El selector de sede del encabezado no la cambia.** Las plantillas son de la línea y la línea es de la marca. Es la
  misma regla que Conexiones (`docs/features/conexiones.md:27-32`).

### 4.3 El puntero `*_template_sid`, que hoy es por marca

- **`admin_settings` no cambia:** sigue siendo el puntero de la **principal**, y `promoteVersion()` sigue siendo su
  único escritor (regla de `CLAUDE.md`).
- **Para las líneas secundarias**, una tabla nueva: `line_template_pointers (tenant_id, connection_id, settings_key,
  provider_ref)`, con PK `(connection_id, settings_key)` y FK compuesta a la línea.
  - También la escribe **solo** `promoteVersion()`. Hay dos tablas destino y un solo escritor; la PK de `admin_settings`
    no se toca (`2026-09-02-multisede-design.md:438-444`).
- **`template_versions` gana `connection_id` (NULL = la principal).** Sus índices únicos se reescriben con
  `COALESCE(connection_id, tenant_id)`, porque dos NULL no colisionan (la trampa de `CLAUDE.md` y
  `2026-09-02-multisede-design.md:446-449`).
  - Sin esto, la misma `bienvenida` no se puede guardar para las dos WABA (`00039:106-107`).
- **El webhook de estado de plantilla** resuelve **(marca, línea)** por la cuenta (§5.3) y promueve la versión de esa
  línea.
- **Quién lee el puntero:**
  - Hoy cada emisor lee `admin_settings` por su cuenta (22 archivos, §1.2). Propongo un solo resolvedor,
    `resolverEnvio(marca, sedeDelEnvio, settingsKey)`, que devuelva la línea, su contexto de envío y el puntero de esa
    línea. Los emisores dejan de leer `admin_settings` directo para enviar.
  - Las pantallas que solo muestran el puntero pueden seguir leyendo directo.
  - Con una línea, `resolverEnvio()` devuelve lo mismo que hoy, byte a byte. Un test lo fija.

### 4.4 Si la línea de la sede no tiene la plantilla aprobada

**Ese mensaje sale por la principal**, que sí la tiene. Se registra el motivo en `message_logs`, por ejemplo
`line_fallback = 'plantilla_sin_aprobar'`.

- **Por qué no se envía por la línea de la sede:** con el puntero de otra WABA el envío falla al 100 %
  (`2026-09-02-multisede-design.md:438-444`).
- **Lo bueno de esta regla:** una línea nueva **se estrena plantilla por plantilla**. El primer día no cambia nada, y
  cada mensaje se muda a la línea de la sede cuando Meta lo aprueba.
- **No vale para el cupo ni para una línea congelada** (§5.1).

---

## 5. Cupo, opt-out, entrante y la mezcla de proveedores (punto 3)

### 5.1 Cupo por línea

- **`line_budget()` y `reserve_send_slot()` pasan a ser por línea.**
  - ⚠️ No se les agrega un parámetro. Agregarlo crea una **sobrecarga** y la llamada vieja da 42725 (trampa de
    `CLAUDE.md`).
  - Se crean `line_budget_of(p_tenant, p_line)` y `reserve_send_slot_of(p_tenant, p_line, p_phone, p_class)`, y las de
    hoy quedan como cáscaras con `p_line = NULL` (= la principal).
  - El candado pasa a `hashtext(tenant || ':' || COALESCE(línea, tenant))`. Es la clave que calcula la misma función
    que cuenta el cupo (`2026-09-02-multisede-design.md:431-436`).
- **La línea tiene que quedar escrita en dos tablas más**, además de las 6 columnas de cupo y salud de
  `tenant_connections` (§2, regla 3):
  - `send_reservations.line_id`, para contar el consumo de 24 h por línea.
  - `message_logs.line_id`, para el p95 transaccional de 14 días por línea.
- ⚠️ **`message_logs.line_location_id` (00043) es la llave equivocada y no se usa.**
  - Se pensó como «la sede dueña de la línea» (`00043:301-302`), pero en este modelo **una línea no tiene sede**: puede
    servir a varias (§2, regla 1).
  - La llave correcta es la línea: `message_logs.line_id`, con FK compuesta a `tenant_connections`. NULL = la principal.
  - La migración que cree `line_id` **vuelve a escribir el comentario de `line_location_id`** («obsoleta: ver
    `line_id`»), en el mismo commit (regla de `CLAUDE.md`). Nadie la escribió nunca, así que no hay datos que mudar.
- **Sin pasar de una línea a otra por cupo o calidad.**
  - Si la línea de Envigado está congelada o sin cupo, sus campañas esperan. No se van por la principal: eso le
    comería el cupo a la principal y mezclaría la calidad de las dos líneas.
  - Lo transaccional sigue la regla de hoy: `frozen` deja el cupo de campañas en 0 (`00037:61`, `:291-296`) y lo
    transaccional sale con su reserva.
  - La única excepción es la plantilla sin aprobar (§4.4).
- **El tope de marketing por cliente sigue siendo de la marca**: 3 al mes y 7 días entre uno y otro (A2;
  `getCustomersAtMonthlyCap()`, `src/services/campaign.service.ts:650`). Si fuera por línea, un cliente de las dos
  sedes recibiría 6.
- **Por verificar (§10):** si el límite diario de Meta es del número o del portafolio comercial. El repo lo trata como
  del número: «Meta asigna el escalón y la calidad al NÚMERO» (`2026-09-02-multisede-design.md:419-421`). Si Meta lo
  calcula por portafolio, dos números del mismo portafolio comparten un techo, y el cupo por línea necesita además un
  tope común.

### 5.2 Opt-out: de la marca, sin negociación

- **«SALIR» a cualquier número saca al cliente de toda la marca.** Ya es así: `(celular, tenant_id)`
  (`customer.service.ts:195-200`, `:266-280`).
  - Argumento legal: el consentimiento se da al responsable, y el responsable es la marca
    (`privacidad/page.tsx:36-38`; `2026-09-02-multisede-design.md:451-464`).
  - Si fuera por número, revocarle a Envigado dejaría a Laureles escribiéndole a alguien que dijo «no».
- **Lo que sí cambia es que el «SALIR» tiene que llegar.** Hoy, a una segunda línea, no llega (§1.3). Por eso F9.1 va
  primero.
- **La confirmación sale por la línea por la que entró.** En Twilio es TwiML y ya es así. En Zernio todavía no se
  contesta: es la deuda de `webhook/zernio/route.ts:278-283`, no de este diseño.
- `consent_events.location_id` sigue sin escritor (`docs/features/multi-sede.md:1147`). La sede de un consentimiento
  sería **evidencia, no permiso**. No es de este diseño.

### 5.3 El webhook entrante: qué marca, qué línea, qué sede

**La marca y la línea, por la cuenta:**

- Una función nueva, `getLineByZernioAccount(accountId) → { tenant, connection }`. Busca primero en
  `tenant_connections` y después en `tenants.zernio_account_id`, para las altas anteriores a la 00054.
- La usan `message.received`, `message.sent` y `template.status_updated`.
- `getTenantByZernioAccountId()` se queda con su firma, como cáscara.
- **La unicidad se extiende a las dos tablas**, no se quita:
  - Ya hay índices globales en cada una (`00036:67`; `00054:109`).
  - Falta la regla cruzada: una cuenta que está en `tenants` de la marca A no puede estar en `tenant_connections` de
    la marca B. Va con un trigger y `pg_advisory_xact_lock` (`2026-09-02-multisede-design.md:424-429`).
  - Es lo opuesto de lo que dice el rechazo del AIOS (§1.5).
- **Twilio no cambia:** no hay líneas Twilio de sede (§2, regla 5), así que `getTenantByWhatsappNumber()` sigue igual.

**Qué sede, según lo que entra:**

| Lo que entra | Sede | Regla |
|---|---|---|
| Un pedido de domicilio | **1.** la del operador (`authorized_numbers.location_id`) → **2.** la de la línea, solo si esa línea sirve a UNA sede → **3.** NULL | La misma idea que el check-in: el actor autenticado le gana a la señal débil (`docs/features/multi-sede.md:324-336`). El número de entrada hace el papel del host. Si el operador es de Laureles y escribió a la línea de Envigado, gana Laureles. La discrepancia se puede guardar en `visits.location_conflict = true`, pero hoy esa columna significa «el QR decía otra sede» (`docs/features/multi-sede.md:293-295`): ampliarla a «la señal débil decía otra sede» lo decide y lo documenta la sesión de F9.3 |
| El auto-chat | Lo mismo: ya es por línea (`webhook/zernio/route.ts:484-489`), y a partir de ahí es un pedido más | — |
| «SALIR», «sí» o «no» del Golden Bullet | **Ninguna: es de la marca** | El consentimiento es de la marca (§5.2). La respuesta sale por la misma línea |
| Estado de una plantilla | **La línea**, no la sede | §4.3 |

### 5.4 Twilio y Zernio en la misma marca

- **Coexistencia más número comprado, los dos en Zernio** (el caso del dueño): ya cabe. `tenant_connections.route`
  es por fila (`00054:62`) y cada línea es su propio profile (`zernio-api-contract.md:433`). Lo que falta es lo de
  §2–§5, igual para los dos caminos.
  - ⚠️ **Choca con una decisión cerrada:** «la línea comprada se comparte, no se le asigna a una sede»
    (`2026-09-06-conexiones-design.md:756`, decisión 5). Lo del 14-10 la reemplaza. Además, comprar desde el producto
    (camino C) **no está construido** (`docs/features/conexiones.md:188`) y el alquiler mensual tampoco: en todo el
    repo no hay nada de `line_rental`. Hoy un número se compra desde el AIOS.
- **Twilio (la principal) más Zernio (la sede):** cabe con la regla 5 del §2. Hoy ya pasa en el Golden Bullet:
  `tenants` lleva las dos credenciales y `options.provider` elige (`club-optin.service.ts:149-166`). Con el envío por
  línea, **el proveedor sale de la línea** y no de una opción del que envía.
  - `options.provider` se queda como está, **y lo sigue fijando solo el Golden Bullet** (regla de `CLAUDE.md`). Cuando
    exista la línea de la difusión (§3.2), deja de hacer falta y se retira.
  - Mientras tanto, «Golden Bullet por Zernio» es **la difusión saliendo por la línea de Zernio**, sea la principal o
    no.

---

## 6. Las franquicias y el AIOS (punto 4)

### 6.1 Lo que hace hoy «franquicia»

- `site_model` admite tres valores, `single | group | franchise` (`aios:/supabase/migrations/00009_sede_unica_grupo_franquicia.sql:65-71`).
  Según su propio comentario, «gobierna el FLUJO del panel, NO el agrupamiento» (`00009:73-80`).
- **En el código solo `group` cambia algo.** «Franquicia» se comporta igual que «un solo local», salvo por los textos:
  - `attachableBrands()` devuelve vacío para todo lo que no sea grupo (`aios:/src/lib/brands.ts:113-121`).
  - Solo un grupo le da subdominio de sede al local (`aios:/src/lib/actions/provisioning.ts:1501-1504`).
  - Solo un grupo engancha una sede a una marca que ya existe (`siteAttachLocation`, `aios:/src/lib/actions/provisioning.ts:1658`, que llama
    a `aios_add_location` en `aios:/src/lib/product-db.ts:1232-1240`).
- **Resultado: cada local de una franquicia es una marca aparte del producto.** `siteCreateTenant`
  (`aios:/src/lib/actions/provisioning.ts:1351`) → `provisionTenant` (`:1526`) → `aios_provision_tenant`
  (`aios:/src/lib/product-db.ts:1003-1008`).
- **Lo que el AIOS le dice al operador:**
  - «Cada local es un negocio aparte con su propia marca: NO comparten clientes ni puntos, y cada uno lleva su propio
    número» (`aios:/src/lib/actions/field-readers.ts:81-82`).
  - «Los clientes y los puntos de un local no existen en los otros» (`aios:/src/components/clients/SiteModelField.tsx:119-128`).
- **Una corrección de fuente:** el prompt (`docs/prompts/2026-10-14-sedes-separadas.md:188-190`) dice que esto está en
  el §2.bis de `docs/features/multi-sede.md`. **No está ahí:** ese §2.bis cuenta el bug de Tepuy (un tenant por sede) y
  no menciona franquicias. La fuente es el `CHANGELOG.md` del AIOS, v1.9.0 (`aios:/CHANGELOG.md:285-328`),
  y la 00009 del AIOS.

### 6.2 Lo que cambia con «siempre comparten datos»

La regla del 14-10 hace que **una franquicia sea un grupo**: una marca y un tenant, con los clientes y los puntos
compartidos. Lo que distingue a una franquicia es **qué tiene propio cada sede**, y nada de eso es nuevo:

| Lo propio de la sede | Dónde está | Estado |
|---|---|---|
| Su número | Este diseño (F9) | Diseñado |
| Su tarjeta | Parte 2 del prompt de sedes separadas | En diseño |
| Su administrador, que solo ve su sede | `role='location'` (00045, `docs/features/multi-sede.md:640-647`) | Ya existe |
| Su mensualidad | `clients.billing_mode = 'per_site'`: una mensualidad por sede (`aios:/supabase/migrations/00006_billing_mode.sql:54-59`) | Ya existe, y es el default |
| Sus mensajes (billetera) | La billetera es de la marca y se desglosa por sede (D4, `2026-09-02-multisede-design.md:37`). `tenant_wallet_transactions.location_id` existe y está vacía (`docs/features/multi-sede.md:1147`) | Billetera por sede: **no diseñada** (pregunta 3) |

**La propuesta para el AIOS (fase F9.5, en el repo del AIOS; hoy solo se leyó):**

1. **`franchise` deja de crear marcas aparte.** Pasa a comportarse como `group` para enganchar sedes. En concreto:
   - `attachableBrands()` cambia la condición `!== "group"` por `=== "single"`.
   - `esGrupo` pasa a ser «no es un solo local».
   - El guardia de `00009` deja compartir el `tenant_slug` también en una franquicia.
2. **Lo que agrega la franquicia sobre el grupo** es que el asistente ofrezca, por defecto, «esta sede trae su propio
   número» y «esta sede tiene su administrador».
3. **El WhatsApp pasa a ser por sede cuando la sede lo trae.** Hoy `clients.whatsapp_provisioning` es uno por cliente
   (§1.5).
   - La línea de la marca se queda ahí.
   - La de una sede va a `client_locations.provisioning`, con su propio profile de Zernio, porque es uno por número
     (`zernio-api-contract.md:433`).
   - Se levanta el rechazo de la segunda activación (`provisioning.ts:2018-2037`) y se corrige su texto (§1.5).
4. **Se reescriben los textos que dicen «no comparten clientes ni puntos»** (`field-readers.ts:81-82`;
   `SiteModelField.tsx:119-128`). Con la regla del 14-10 son falsos.

**Las franquicias que ya existan como marcas separadas no se fusionan solas.**

- Fusionar dos tenants es «fusionar clientes, puntos y tiers a mano» (`docs/features/multi-sede.md:56-58`), y además
  los opt-outs y los consentimientos de cada uno.
- Antes de F9.5 hay que **saber si hay alguna**, con una consulta de solo lectura en el Supabase **del AIOS**:
  `SELECT id, business_name FROM clients WHERE site_model = 'franchise';`
- Si hay alguna, la fusión es una sesión aparte, con su propio diseño.

### 6.3 El riesgo legal de compartir datos entre franquiciados

Una franquicia suele ser **otra empresa**. Si los franquiciados comparten la base, la pregunta de la Ley 1581 es
**quién es el responsable del tratamiento**:

- Hoy la política nombra a la marca (`privacidad/page.tsx:36-38`).
- Si cada franquiciado es su propio responsable, compartir la base entre ellos es una transferencia que el cliente
  tiene que autorizar. Es el mismo tipo de problema que llevó a apagar el píxel de Cada1 (`ESTADO.md` §3, «El norte»).
- **No lo resuelve el código.** Antes de dar de alta la primera franquicia con datos compartidos, la política y el
  texto del consentimiento tienen que decir que los datos son de la marca y se usan en todas sus sedes, incluidas las
  franquiciadas. Eso lo revisa un abogado (pregunta 4).

---

## 7. Lo que ya existe y choca (punto 5)

| Qué | Dónde | Choque | Qué hacer |
|---|---|---|---|
| **D6** (multi-sede): la línea de WhatsApp | `docs/features/multi-sede.md:1140` (cerrada el 05-09: N líneas, la sede no obliga) · `2026-09-06-conexiones-design.md:243-260` y `:760` (reabierta el 07-09 por la mañana, decisión 9) · `:200-213` (re-cerrada el 07-09 por la tarde: un número por marca) · `ESTADO.md` §4 (cerrada, «no se reabre») | El 14-10 el dueño dijo «lo que puede cambiar es que no compartan número» | **D6 queda reabierta por el dueño, en la forma de la decisión 9: la sede PUEDE tener línea propia, y sin fila usa la de la marca.** Hasta construir F9 sigue saliendo un número por marca. Corregí la línea de `ESTADO.md` §4 en el mismo commit que este spec. Cuando se construya cada fase, sus docs dejan de decir «un número por marca» (`00054:31`, `:97`; `docs/features/conexiones.md:29-32`) |
| **F9 / `location_messaging`** | `2026-09-06-conexiones-design.md:271-296` y `:674` (C-D6 = F9) | La forma final se discutió en dos docs, y la 00048 que tenía reservada **ya es un hueco** | La forma es la del §2: un mapa sede → línea, con las columnas de línea en `tenant_connections`. **La 00048 no se usa**: los huecos no se rellenan (`ESTADO.md` §1). Cada migración sale de `node scripts/proxima-migracion.mjs` al construirla (hoy diría 00074, pero no queda reservada) |
| **0.THETA**: «un celular por sede» no está construido | `ESTADO.md` §3 0.THETA | Ninguno: este spec es su diseño | Sigue abierto hasta F9.3 |
| **D9** (multi-sede): cada sede despacha su zona | `2026-09-02-multisede-design.md:42`; `authorized_numbers.location_id` en el webhook (`webhook/zernio/route.ts:369-375`) | Con número por sede, la sede del pedido tiene dos señales: el operador y la línea | Gana el operador; la línea es la señal débil (§5.3) |
| **Deuda #9** (el 409 de sede no acepta elegir por API) | `docs/features/multi-sede.md:1143` | Ninguno: el registro de clientes no entra por WhatsApp | — |
| **Decisión 5 de Conexiones** («la línea comprada se comparte») | `2026-09-06-conexiones-design.md:756` | El 14-10 una sede puede tener número comprado | Reemplazada (§5.4) |
| Conexiones §4.1 dice que «`authorized_numbers` es por tenant, no por sede (00002)» | `2026-09-06-conexiones-design.md:357-358` | **Ya no es verdad:** la 00043 le dio `location_id` (`docs/features/multi-sede.md:245`) y el panel la escribe | Es una sección «conservada, no vigente». Queda dicho aquí y no se toca ese doc (no es de mi territorio) |
| `message_logs.line_location_id` | `00043:116`, `:301-302` | La llave es «la sede de la línea», que no existe en este modelo | Se reemplaza por `line_id` (§5.1) |
| El rechazo del AIOS pide quitar `idx_tenants_zernio_account_id` | `aios:/src/lib/actions/provisioning.ts:2032-2034` | El spec de multi-sede dice que quitarlo pierde el entrante (`2026-09-02-multisede-design.md:424-429`) | Unicidad cruzada (§5.3) y texto nuevo en F9.5 |
| Los textos de «franquicia» en el AIOS | `field-readers.ts:81-82`; `SiteModelField.tsx:119-128` | Prometen marcas sin nada compartido | F9.5 (§6.2) |
| **D7** (mismos precios y menú; «lo genuinamente distinto se separa en dos tenants») | `2026-09-02-multisede-design.md:40` | Para las franquicias, la salida de D7 era separar en dos tenants. El 14-10 eso ya no vale | Los datos se comparten. Si una franquicia necesita catálogo de premios propio, ya existe por sede (`docs/features/multi-sede.md:911-933`) |
| La cascada §6.1, aplazada a **F6** | `whatsapp.service.ts:59-61`; `docs/features/multi-sede.md:1146` | F9.4 la necesita para elegir la línea | **F6 (la imputación) y F9.4 (la línea) usan la misma función.** La que llegue primero la escribe |
| `options.provider` (solo el Golden Bullet) | `CLAUDE.md`; `whatsapp.service.ts:126-137` | Con el envío por línea, el proveedor sale de la línea | La regla se mantiene hasta que el Golden Bullet tenga su línea de difusión (§5.4) |

---

## 8. Fases, migraciones, riesgos y costo (punto 6)

### 8.1 Fases

**La regla de todas:** con una sola línea por marca no cambia ni un envío, y un test lo fija. Es el interruptor de
compatibilidad de multi-sede (`2026-09-02-multisede-design.md:550-559`), llevado a las líneas.

| Fase | Qué | Migración | Por qué en este lugar |
|---|---|---|---|
| **F9.0** | Decir claro que las sedes comparten el número: «Las N sedes comparten el WhatsApp {número}» | — | Ya está en la parte 1 (prompt §3, punto 5) |
| **F9.1 · El entrante** | `getLineByZernioAccount()` para `message.received`, `message.sent` y `template.status_updated`; unicidad cruzada de cuentas con trigger; `UNIQUE (id, tenant_id)` en `tenant_connections`. El opt-out no se toca | **1** | **Va primero porque es lo único que protege algo vivo.** Cualquier segunda línea conectada, aunque sea por error en el AIOS, hoy pierde los «SALIR». Es barata, no le pide nada a Meta y con una línea queda byte a byte igual |
| **F9.2 · Las líneas de cada sede y sus plantillas** | `location_messaging`; las columnas de línea en `tenant_connections` con un solo escritor; `template_versions.connection_id` con los índices `COALESCE`; `line_template_pointers` y `promoteVersion()` por línea. Conexiones lista las líneas con «La usan: …» y el dueño asigna sede → línea. Plantillas con selector de línea | **1** | Todavía no se envía nada por la línea nueva. Su objetivo es que las plantillas se aprueben **antes** de que haga falta enviar con ellas (1 a 3 días) |
| **F9.3 · El envío por línea, con sede del acto** | `resolverEnvio()`; `line_budget_of` y `reserve_send_slot_of` (funciones nuevas, sin sobrecarga); `send_reservations.line_id` y `message_logs.line_id`; salud por línea; la bajada a la principal si falta la plantilla (§4.4). Solo mudan check-in, registro, canje y domicilio | **1** | Son los mensajes que ya conocen su sede (§3.2), uno por cliente y en el momento: el menor alcance posible para estrenar |
| **F9.4 · Los masivos** | La cascada única (F6 + F9) al encolar; `QueueRow` y el drenador con la sede; cumpleaños, recordatorio, ciclo, manual, calendario y override; la línea de la difusión del Golden Bullet | — (o 1 si el Golden Bullet guarda su línea por base) | Es la mitad cara del volumen (`2026-09-02-multisede-design.md:394-398`) y la que puede hacerle llegar a un cliente mensajes de dos números |
| **F9.5 · Franquicias en el AIOS** | §6.2, en el repo del AIOS | La del AIOS que haga falta | Depende de que F9.2 exista, para que la línea de una sede tenga a dónde ir |

**Migraciones:** son 3 del producto (F9.1, F9.2 y F9.3) y quizás una cuarta en F9.4. **Ninguna está reservada.** Cada
número sale de `node scripts/proxima-migracion.mjs` el día que se construye. La 00048 no se usa. Cada una se aplica en
Supabase **antes** de desplegar el código que la usa (`CLAUDE.md`: al revés, PostgREST da 42703 y la ruta responde
403).

### 8.2 Riesgos

1. **Entrantes perdidos en silencio** mientras no exista F9.1. Lo cierra F9.1, y por eso va primero.
2. **Una plantilla de otra WABA sin aprobar hace fallar el 100 % de los envíos** de esa línea. Lo cubre §4.4.
3. **El cliente recibe mensajes de dos números.** Puede confundirse o bloquear uno, y un bloqueo baja la calidad de
   una línea que nace con cupo bajo (250, `00037:44`). Un dato real: a Sushi Service la difusión desde un número que la
   gente no conocía la tomaron «por número falso» (`ESTADO.md` §3 0.SUSHI). **Un número comprado que nadie conoce
   tiene ese mismo riesgo.** El de coexistencia, que es el WhatsApp de siempre de la sede, no.
4. **El cupo de Meta podría ser del portafolio y no del número** (§5.1, por verificar).
5. **Se duplica el marketing** si el tope por cliente se volviera por línea. No se vuelve (§5.1).
6. **Dos copias de las columnas de línea** que se separan. Lo evita el escritor único (§2, regla 3).
7. **La trampa 42725** si se le agrega un parámetro a `line_budget()` o a `reserve_send_slot()`. Lo evitan las
   funciones nuevas con cáscara (§5.1).
8. **El riesgo legal de las franquicias** (§6.3).
9. **La operación:** cada línea nueva pide los gestos que Tepuy lleva días resolviendo con su único número: método de
   pago, nombre visible y verificación del negocio (`ESTADO.md` §3 0.AIOS).

### 8.3 Lo que le cuesta al dueño

- **Desarrollo:** unas 5 sesiones, una por fase (F9.2 puede pedir dos), más el cierre de cada una. F9.1 es la más
  chica.
- **Por cada sede con número propio, una sola vez:**
  - De 16 a 8 aprobaciones de Meta si el número vive en otra WABA; 0 si la misma WABA sirve (§4.1, por verificar). Se
    mandan con un botón y tardan de 1 a 3 días.
  - El nombre visible: de 1 a 3 días de revisión de Meta (`zernio-api-contract.md:297`).
  - El método de pago y la verificación del negocio de esa WABA.
- **Por cada sede con número propio, todos los meses:**
  - **Coexistencia:** nada por el número.
  - **Comprado en Zernio:** el alquiler mensual. El contrato trae 500 centavos para Colombia como **ejemplo**, y aclara
    que son «datos vivos» que el spec no fija (`zernio-api-contract.md:84`, `:98`). Hoy no lo cobra ninguna billetera:
    `line_rental` está diseñado (`2026-09-06-conexiones-design.md:543-571`) y no construido.
  - **Meta:** cobra por mensaje, igual con uno o dos números, hasta donde sabemos (por verificar en su factura). Cada
    WABA paga con su propio método de pago.
- **El cupo:** la línea nueva arranca en 250 destinatarios al día y sube con su calidad. Mientras tanto, lo de esa sede
  sale más lento que lo de la marca.

---

## 9. Lo que tiene que decidir el dueño

Son cinco preguntas, cada una con lo que pasa si no contestas. Lo técnico ya lo decidí yo y está escrito arriba (la
regla de la casa, `docs/PENDIENTES.md` §8).

| # | La pregunta | Si no contestas |
|---|---|---|
| **1** | Un cliente que va a las dos sedes: **¿por qué número le llegan el cumpleaños, el ciclo y las campañas?** | **El de la sede a la que fue la última vez** (si esa sede no tiene número propio, el de la marca). Lo del momento (bienvenida, puntos, premio, domicilio) sale siempre por el número de la sede donde pasó |
| **2** | Una sede con número propio: **¿usa los mismos textos de plantillas que la marca, o puede tener los suyos?** | **Los mismos textos**, mandados a Meta con un botón para su número. Textos propios por sede duplican el trabajo de cada cambio y no los pidió nadie |
| **3** | **¿Quién paga el número propio de una sede** (el alquiler si es comprado, y los mensajes)? | **La billetera de la marca**, con el gasto de cada sede a la vista en el desglose. Una billetera por sede (lo que querría un franquiciado que paga lo suyo) es otro diseño |
| **4** | En el AIOS, **«franquicia» deja de crear marcas separadas y pasa a ser un grupo** cuyas sedes pueden tener número, tarjeta y administrador propios. ¿De acuerdo? | **Sí.** Las franquicias que ya existan como marcas aparte no se fusionan solas (§6.2), y antes de la primera franquicia con datos compartidos un abogado revisa la política de privacidad (§6.3) |
| **5** | **¿Cuándo?** | **F9.1 ya** (es chica y protege los «SALIR»). F9.2 a F9.5 cuando una marca concreta pida su segundo número con fecha. Hoy es Tepuy (pidió un celular por sede: `ESTADO.md` §3 0.bis), y conviene que antes su primer número ya esté mandando (pago, nombre visible y verificación pendientes: `ESTADO.md` §3 0.AIOS) |

---

## 10. Lo que no se pudo verificar desde el repo

Hay que confirmarlo antes de la fase que lo usa. Ninguno de estos puntos frena F9.1.

| Qué | Antes de | Cómo |
|---|---|---|
| Si dos números de **la misma WABA** comparten plantillas también por Zernio (si una segunda cuenta las ve y puede enviarlas), y si el Embedded Signup de coexistencia deja meter el número en una WABA que ya existe | F9.2 | Preguntarle al soporte de Zernio. Si la respuesta es sí, una sede con número propio en la misma WABA cuesta 0 aprobaciones |
| Si el límite diario de Meta es del **número** o del **portafolio comercial** | F9.3 | Documentación de Meta o soporte de Zernio |
| Lo que Meta cobra por mensaje con dos números en dos WABA | F9.3 | La primera factura |
| El precio real del número comprado en Colombia y su KYC | Comprar el primero | `GET /v1/phone-numbers/countries` real (`zernio-api-contract.md:75`) |
| Cuántos clientes del AIOS están como `franchise` | F9.5 | La consulta del §6.2, en el Supabase del AIOS |
