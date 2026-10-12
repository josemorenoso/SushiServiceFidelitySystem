# Plantillas de WhatsApp — un solo libro, una sola pantalla, edición sin huecos

> **Estado:** implementado (v2.12.0, 2026-08-30) · **«Un solo libro», 2026-10-11:** la pantalla sirve a
> Twilio y a Zernio, el panel reconoce lo que ya está en la WABA, el catálogo pasa de 13 a 16 y hay una
> Biblioteca para campañas · **Alcance del editor (versiones, `promoteVersion()`):** marcas Zernio
> **Requerimiento:** `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §12 (primera prioridad del proyecto) ·
> decisiones B3–B6 del dueño (`docs/PENDIENTES.md` §8) · prompt `docs/prompts/2026-10-11-plantillas-un-solo-libro.md`
> **Migración:** `supabase/migrations/00039_template_catalog.sql` (el 2026-10-11 no hizo falta ninguna)

## El problema que resuelve

Tres cosas distintas, que el dueño juntó en un solo pedido:

1. **Cada alta terminaba con un set de plantillas distinto**, según quién lo armara a mano. Textual:
   *"desde el principio me han cargado como un loco"*.
2. **No existía el concepto de tono.** El único tono era el que se escribió para Sushi Service.
3. **Editar una plantilla era imposible sin dejar un hueco.** Meta no deja editar in-place una
   plantilla aprobada: solo se puede crear otra y volver a someterla. Hacerlo de la forma obvia
   (borrar y recrear) deja al negocio 24-72h sin poder enviar ese mensaje.

## Las 6 decisiones cerradas (2026-08-30)

Son **decisiones tomadas**, no supuestos. No volver a preguntarlas ni cambiarlas sin el dueño.

| # | Decisión | Dónde vive en el código |
|---|----------|-------------------------|
| 1 | **Un catálogo estándar**, igual para todo tenant nuevo: 13 hasta el 2026-10-11, **16** desde entonces (`CATALOG_SIZE`) | `src/constants/template-catalog.ts` |
| 2 | **Un solo estilo.** Hubo tres hasta el 2026-09-10; el dueño los quitó (*"siempre cálido, nada de eso sirve"*) | `TEMPLATE_STYLES = ['calido']` |
| 3 | **El dueño edita sus propias plantillas**, con advertencia de responsabilidad y registro de quién y cuándo | `template_versions.edited_by` / `disclaimer_accepted_at` |
| 4 | ~~El estilo es sugerencia, no candado~~ **Retirado el 2026-09-10** con los estilos. `admin_settings.template_style` ya no se lee; `applyStyleToCatalog()` y `StyleSelector` se borraron | — |
| 5 | **Banco de textos fijo** (16). Sin LLM por ahora. Lo que varía por `business_type` es solo el emoji | `src/constants/template-texts.ts` |
| 6 | **El editor es solo para Zernio.** Los textos aprobados de los tenants Twilio no se tocan. Desde el 2026-10-11 ven la MISMA pantalla: crean lo que les falta y eligen la plantilla de cada mensaje, sin editor | `assertZernioTenant()` |

Y la que ordena todo el diseño — **Pregunta 1, resuelta**:

> *"que se cree primero la nueva y una vez quede aprobada se cambie y automáticamente se modifique,
> pero luego de aprobarla, para nunca arriesgarnos a perder un mensaje"*.

## El flujo real, paso a paso

Lo que el dueño ve: escribe, guarda, y le dicen que el cambio está en camino.
Lo que pasa por debajo:

```
1. El dueño guarda una edición
   → se CREA una plantilla nueva en Zernio (nombre nuevo: bienvenida_v2)
   → se somete a Meta
   → se registra en template_versions con status='pending'
   ⛔ admin_settings.welcome_template_sid NO SE TOCA

2. Meta revisa (24-72h)
   → TODOS los envíos siguen usando la plantilla vieja. Cero huecos.

3a. Meta aprueba
   → llega el webhook whatsapp.template.status_updated (status: APPROVED)
   → applyProviderTemplateStatus() → promoteVersion():
       · la vieja pasa a status='retired', is_current=false
       · la nueva pasa a status='approved', is_current=true
       · ✅ admin_settings.welcome_template_sid = 'bienvenida_v2'
   → desde el siguiente envío, sale el texto nuevo

3b. Meta rechaza
   → la versión pendiente pasa a status='rejected' con el motivo
   → la vigente NO se toca: sigue enviándose
   → la pantalla se lo dice al dueño con el motivo, para que corrija
```

**El invariante que sostiene todo:** en una marca Zernio, `promoteVersion()` es el **único** punto del
sistema que escribe `admin_settings.<settings_key>`, y solo corre cuando Meta ya dijo `APPROVED`. El
`PUT /api/dashboard/settings` lo respeta: ahí cambiar un puntero Zernio da 400 (ver «Guardas» abajo). En
las Twilio el dueño elige la plantilla de cada mensaje en Plantillas («Elegir otra», que usa ese mismo
`PUT`); `fillEmptyPointer()` rellena solo una clave vacía al crear.

## El alta de un negocio nuevo: enviar tal cual o editar

`aios_provision_tenant` **no siembra ningún `*_template_sid`**: un tenant recién creado llega a esta
pantalla con todos los mensajes vacíos. Hasta 2026-09-06 el único camino que las creaba en bloque era el de
cambiar de estilo (ya retirado), que solo aparecía al elegir un estilo DISTINTO al actual. Un negocio
que quisiera el texto estándar **no tenía ningún botón**: eran 13 ediciones a mano para mandar
textos que nadie quería cambiar. Reportado por el dueño.

Ahora cada mensaje sin enviar muestra **dos salidas**:

| Botón | Qué manda | Advertencia de responsabilidad |
|---|---|---|
| **Enviar a Meta** | El texto del catálogo para el estilo del negocio, tal cual | **No.** El texto es nuestro |
| **Editar** | Lo que escriba el dueño, con las variables protegidas | **Sí**, como siempre |

**Por qué «Enviar a Meta» no pide la casilla.** La decisión 3 (*"si se las llegan a bloquear va a ser
su culpa, ahí se lo especificamos"*) es sobre **el texto que escribe él**. Cuando aprieta "Enviar a
Meta" el texto sale de `template-texts.ts`: no hay nada que pueda aceptar sobre una redacción ajena, y
estampar `disclaimer_accepted_at` ahí sería un registro falso — justo lo que la columna existe para
evitar. Queda **NULL**, y `edited_by` sigue guardando quién apretó. Es también lo que distingue las
dos filas al auditarlas: una aceptación fechada significa que alguien redactó.

**El body NO viaja desde el cliente** en ese camino: `POST …/[key]/submit` no lee cuerpo y resuelve el
texto en el servidor con el estilo del tenant. Si lo aceptara, sería el `PUT` sin la casilla — es
decir, la forma de saltarse la decisión 3 desde la consola del navegador.

Todo lo demás lo comparten: `submitTemplateBody()` es el tronco único, así que las dos rutas pasan por
la misma validación de variables, la misma regla de "una pendiente por plantilla" y el mismo
`createAndSubmit()`. **`promoteVersion()` sigue siendo el único que mueve el puntero**, y solo con el
`APPROVED` de Meta: enviar tal cual no adelanta nada.

**"Enviar a Meta" solo existe mientras el mensaje no tenga nada vivo ni nada en revisión.** Reemplazar
un mensaje que ya se está enviando pasa SIEMPRE por el editor, con su advertencia.

### Plantillas aprobadas en Meta que el sistema no conocía: «Activar» (2026-10-02)

El alta por el AIOS puede crear las 13 **en Meta** sin dejar filas en `template_versions` ni punteros.
Meta las aprueba, el webhook no encuentra versión registrada (`sin versión registrada`) y el slot
queda vacío: el panel decía «Pendiente de enviar», **el envío no las usaba** (check-in sin puntero =
`no_template_configured`) y «Enviar a Meta» chocaba con *"Ya existe contenido en Spanish para esta
plantilla"*. Le pasó a Planeta Wings: 12 aprobadas, sin un solo «puntos sumados» enviado.

`getTemplateCatalogState()` ahora lee la WABA real (`listZernioTemplates`) y, para cada slot VACÍO
(sin vigente, sin pendiente, sin puntero), busca con `findAdoptable()` una plantilla **APROBADA** del
idioma del catálogo, con nombre `baseName` o `baseName_vN` (gana el N más alto), con **exactamente** las
variables `{{1}}..{{N}}` de la definición y la misma portada (ninguna, imagen o video). Una versión que
retiramos nosotros no vuelve. Si la encuentra, la entrada trae `approvedInWaba` y la pantalla muestra
«Aprobado, falta activarlo» con un botón **Activar** (y uno para activar todas).

`POST …/[key]/adopt` (`adoptApprovedTemplate()`) **no escribe el puntero**: registra la versión como
`pending` (reutilizando la fila `failed` que deja un «Enviar a Meta» que chocó con ese nombre, porque
`(tenant_id, provider_ref, language)` es único) y la pasa por `applyProviderTemplateStatus()` con
`APPROVED`, la misma puerta que el webhook → `promoteVersion()`. Lo dispara el dueño, nunca solo: desde
ese momento el mensaje les llega a sus clientes. `disclaimer_accepted_at` queda NULL (el texto no lo
escribió él).

Al final de la pantalla va la **lista real de la WABA** (`wabaTemplates`), con nombre, estado de Meta,
si es del Golden Bullet y qué mensaje la está usando. Es la única excepción al vocabulario sin nombres
técnicos de esta pantalla, pedida por el dueño: sin ella no había dónde ver si una plantilla salió.

### Un solo libro: lo que ya está en la WABA y el panel no sabía (2026-10-11)

«Activar» resolvía las APROBADAS. Quedaba el resto del alta por el AIOS (Planeta Wings, 12-09): las que
estaban **en revisión** se veían «Pendiente de enviar» y «Enviar a Meta» chocaba por nombre; cuando Meta
las aprobaba, el webhook las descartaba (`sin versión registrada`); y las que el AIOS sí apuntó se veían
«Activo, pero no tenemos su texto». Ahora `getTemplateCatalogState()`, ANTES de dibujar, pasa cada mensaje
por `reconciliarConLaWaba()` (PURA) y aplica lo que diga:

| Acción | Cuándo | Qué escribe |
|---|---|---|
| `vigente` | Puntero sin fila y en la WABA hay una APROBADA con ese nombre | La fila como vigente, con su texto y su categoría REALES. **No toca el puntero** (ya apunta ahí) |
| `pendiente` | Mensaje vacío y en la WABA hay una en revisión (`PENDING`/`IN_APPEAL`) que sirve | La fila `pending`: el webhook la encuentra al aprobarse y `promoteVersion()` mueve el puntero |
| `rechazada` | Mensaje que el panel nunca tocó y en la WABA hay una rechazada que sirve | La fila `rejected` con el motivo de Meta (`getZernioTemplateStatus`) |
| `aprobar` / `rechazar` | Una pendiente del panel que Meta ya resolvió y cuyo webhook no llegó | El veredicto por `applyProviderTemplateStatus()`, como si hubiera llegado |

Reglas: «sirve» = nombre base o `_vN` (gana el N más alto), idioma del catálogo, la misma portada y
EXACTAMENTE las variables del contrato (`cuerpoCompatible()`); un `failed` con ese nombre no la tapa (es
el «Enviar a Meta» que chocó, y su fila se reutiliza); la categoría que se guarda es la de **Meta**, que
recategoriza (la «bienvenida» de Planeta Wings se pidió UTILITY y quedó MARKETING). Una **aprobada** para
un mensaje vacío **no** se registra sola: activarla hace que el mensaje empiece a llegar, y eso lo decide
el dueño con «Activar». Lo que se registró viaja en `reconocidas` y la pantalla lo cuenta en un aviso.

Cada mensaje trae además `enWhatsApp`: lo que dice el proveedor de la plantilla en uso (estado real,
categoría de Meta, texto). Con eso la pantalla dice «Pausado por Meta» —antes una PAUSED era invisible— y
«WhatsApp la clasificó como Marketing (se pidió Utilidad)».

**Es la pantalla la que hace de webhook de respaldo**, al abrirse: no hay cron. Lee la WABA con el caché
de 60 s de P1-a (N16).

### El 400 «ya existe»: se adopta, nunca «vuelve a intentarlo más tarde»

Si Zernio contesta **400** al crear, `adoptarLaQueYaExiste()` lee la WABA EN VIVO. Si la plantilla con
ese nombre está ahí, es de este mensaje y sirve, se ADOPTA con su estado y su categoría reales y el dueño
lee «Ya existe en tu cuenta de WhatsApp una plantilla llamada …»: aprobada → queda activa (por
`promoteVersion()`); en revisión → pendiente, se activa sola; rechazada → anotada con el motivo (409).
Nunca con un mensaje VIVO (sería reemplazarlo por un texto que el dueño no escribió: 409 que lo dice) y
solo si el texto es el mismo o lo que se mandaba era el del catálogo tal cual. Si la WABA no la tiene, el
400 fue por otra cosa y sigue el camino de siempre: el motivo del proveedor, sin «más tarde».
`nextProviderRef()` ya miraba la unión de `template_versions` y la WABA (2026-10-02).

### Las 2 de evento y su media de muestra

Las del calendario llevan cabecera de imagen/video, y Meta **descarga** un archivo de muestra para
revisarlas (`ZERNIO_TEMPLATE_SAMPLE_*_URL`, ver Configuración). Cuando falta, `blockedReason` viaja en
la respuesta del catálogo y la pantalla **deshabilita el botón con el motivo a la vista**, en vez de
dejar que el dueño lo apriete y se coma un 409 por una variable de entorno que no puede tocar. Las
otras 11 no se enteran.

## El detector de aprobación

**Es un webhook, no un poll.** El contrato verificado de Zernio
(`Level 2.0/aios-constelarys/docs/zernio-api-contract.md` §5) documenta el evento
`whatsapp.template.status_updated` con su payload exacto, incluido el `account.accountId` que resuelve
el tenant. Se recibe en `src/app/api/webhook/zernio/route.ts`.

Configuración necesaria en Zernio (`POST /v1/webhooks/settings`): el evento
`whatsapp.template.status_updated` tiene que estar en la lista `events`. Es a nivel de Team, no por
cuenta — si ya está configurado para los eventos de mensajes, hay que **agregarle** este.

**Puerta única:** todo lo que sepa de un cambio de estado entra por
`applyProviderTemplateStatus()` en `template.service.ts`. Está aislado a propósito:

> El **Bloque 3 de la gobernanza de envío** (`docs/features/send-governance.md`) necesita leer el
> estado de las plantillas del mismo tenant para su `/api/cron/line-health`. Cuando exista, debe
> llamar a esta función con lo que devuelva `GET /v1/whatsapp/templates`, **no** escribir su propia
> promoción. `refreshTemplateStatusFromProvider()` ya deja ese camino armado para una plantilla suelta.

**No hay poll periódico, y es deliberado.** El webhook es el camino documentado; montar un cron
duplicado antes de verlo fallar en producción es trabajo que puede no hacer falta.

## Los 16 mensajes

Los 11 de texto originales son el port fiel de `scripts/twilio-create-text-templates.mjs`; las 2 de evento
se reescribieron el 2026-09-10; «Cumpleaños — dos días antes» entró el 2026-10-04; y las tres últimas, el
2026-10-11, **juntas**, para que cada marca haga UN solo viaje a Meta (decisión B6).

| Plantilla | `settings_key` | Categoría | Variables |
|---|---|---|---|
| Bienvenida | `welcome_template_sid` | UTILITY | 3 |
| Puntos sumados — lejos | `points_earned_far_template_sid` | MARKETING | 4 |
| Puntos sumados — cerca | `points_earned_near_template_sid` | MARKETING | 4 |
| **Nivel desbloqueado** (2026-10-11) | `tier_unlocked_template_sid` | MARKETING | 4: nombre · nivel · premio seguro · camino |
| Premio seguro — confirmación | `reward_safe_template_sid` | MARKETING | 4 |
| Mystery Box — resultado | `mystery_box_result_template_sid` | MARKETING | 4 |
| Golden Box — resultado | `golden_box_result_template_sid` | MARKETING | 3 |
| **Recordatorio de premio** (2026-10-11) | `reward_reminder_template_sid` | MARKETING | 3: nombre · premio · días que le quedan |
| Cumpleaños — dos días antes | `birthday_upcoming_template_sid` | MARKETING | 2 |
| Reactivación suave | `reactivation_no_reward_template_sid` | MARKETING | 3 |
| Reactivación insistente | `reactivation_aggressive_template_sid` | MARKETING | 3 |
| **Regalo que vence** (2026-10-11) | `gift_expiring_template_sid` | MARKETING | 4: nombre · regalo · fecha límite · camino |
| Campaña → domicilio | `campaign_presencial_to_domicilio_template_sid` | MARKETING | 3 |
| Campaña → presencial | `campaign_domicilio_to_presencial_template_sid` | MARKETING | 3 |
| Evento con imagen | `event_template_image_sid` | MARKETING | 5 + header |
| Evento con video | `event_template_video_sid` | MARKETING | 5 + header |

### Las tres del 2026-10-11 (decisiones B3 y B6)

- **«Nivel desbloqueado»** y **«Recordatorio de premio»** las consumía el código sin que el catálogo las
  definiera (`docs/PENDIENTES-PLANTILLAS.md` §1.2). En una marca Zernio, subir de nivel era **silencio
  total** (check-in, domicilios y el override del panel la mandan EN VEZ de «puntos sumados») y el cron
  `reward-reminder` salía sin hacer nada. Su contrato es el que ya mandaban sus emisores. «Premio seguro —
  confirmación» se llamaba «Nivel desbloqueado — premio seguro»: se renombró para no tener dos filas iguales.
- **«Regalo que vence»** es la del ciclo de recuperación (texto literal del spec §4). **Nadie la envía
  todavía**: quién la usa y el adaptador a la insistente son de la fase 1B. Entra ya para que el viaje a
  Meta sea uno (`p1a-plantillas-paridad.test.ts` la tiene en `SIN_EMISOR_TODAVIA`).
- Las legacy `reactivation_with_reward_template_sid` y `reactivation_template_sid` **no entran**: las
  retira la fase 1B. Siguen como excepciones de la paridad, con ese motivo escrito.
- Los tres textos son nuevos, en tono cálido, sin emoji de rubro, y pasan las 5 reglas y el 3N+1. **El
  dueño los ve en el panel antes de mandarlos**: nada se somete solo. El AIOS NO los tiene en su copia
  (eso cambia con B7, otra sesión).

### Una plantilla reemplazada: el cumpleaños del día mismo (2026-10-04)

`TEMPLATE_CATALOG` tiene **17 entradas**, y un negocio nuevo necesita **16** (`CATALOG_SIZE`). La de más es
`birthday` («¡Feliz cumpleaños!», `birthday_template_sid`), marcada `replacedBy: 'birthday_upcoming'`.
El saludo pasó a salir hasta dos días antes, y ese texto dicho dos días antes está mal. Como un texto
aprobado no se reescribe, la redacción nueva es **otra** plantilla con **otro** puntero.

- **Una entrada reemplazada no se ofrece a quien no la tiene.** En Zernio, `getTemplateCatalogState()` la
  muestra solo si la marca tiene algo de ella (vigente, en revisión, puntero o una aprobada que activar), y
  `submitSuggestedTemplate()` contesta 409. En Twilio, `getStandardCatalogReport()` la omite si no tiene
  puntero, y `createStandardTemplate()` contesta 400.
- **Nadie la borra.** Las marcas que la tienen la siguen usando, y el cron elige por marca
  (`elegirPlantillaDeCumpleanos()`): con `birthday_upcoming` **aprobada** manda esa, hasta dos días antes;
  si no, la vieja el día mismo. En Zernio, puntero = aprobada (lo garantizan `promoteVersion()` y el AIOS).
  En Twilio el panel escribe el puntero al CREAR, así que el cron pregunta a Twilio
  (`isTwilioTemplateApproved()`); ante la duda, la vieja.
- **El mismo contrato de variables en las dos** (un test lo fija): el cron les manda los mismos valores.
- El AIOS crea la nueva en lugar de la vieja desde la v1.14.0: Tepuy y toda marca nueva nacen con ella.

### El contrato de variables es sagrado

El emisor (check-in, crons, campañas, calendario) manda un diccionario posicional fijo. Un texto
puede reordenar la prosa; **nunca** agregar, quitar ni resignificar un `{{n}}`. Cambiar la aridad en
`TEMPLATE_CATALOG` rompe el envío de todos los tenants a la vez.

`validateTemplateBody()` lo hace cumplir en el editor, en la API y en el test.

## Un solo estilo (desde el 2026-09-10)

Hubo tres —`calido`, `elegante`, `urbano`— y el dueño los redujo a uno, textual: *"siempre cálido,
nada de eso sirve"*. `calido` es el port literal del catálogo que estuvo en producción con Twilio.
`TEMPLATE_STYLES` sigue siendo una lista de un elemento porque `template_versions.style` y su CHECK
(00039) aceptan los nombres viejos: una fila histórica con `elegante` no rompe nada, y
`personalizado` sigue significando "el dueño lo editó a mano".

**Son 16 textos.** Lo único que varía por `business_type` es el emoji horneado. Cada texto es una
aprobación de Meta aparte.

⚠️ **El AIOS lleva una COPIA de 13 de estos textos** (no tiene las tres del 2026-10-11) (`Level 2.0/aios-constelarys/src/lib/zernio/
templates-catalog.ts`) porque es un repo aparte y es quien crea las plantillas al dar de alta un
cliente. Se regenera desde la fuente con un script, no a mano. El 09 esa copia creó 12 plantillas con
🍣 horneado porque nunca recibió el arreglo del emoji por rubro: si un texto cambia acá, hay que
traerlo allá en el mismo día.

### El emoji de marca (v2.15.0)

Los textos `calido` nacieron para Sushi Service y traían **🍣 horneado dentro del texto**. Como Meta
aprueba el cuerpo LITERAL, ese sushi le llegaba igual a una barbería. El dueño lo señaló y autorizó
el cambio: *"hay que tener cuidado con que contenga stickers de sushi o algo porque se hardcodean
para todos"*.

Hoy ese lugar lo ocupa `${emoji}`, que resuelve `resolveTemplateEmoji(business_type, override)` en el
momento de **construir** el cuerpo — antes de someterlo a Meta, exactamente igual que el nombre del
negocio:

| `business_type` | Emoji |
|---|---|
| `restaurant` | 🍽️ |
| `barbershop` | 💈 |
| `beauty_salon` | 💅 |
| cualquier otro | ✨ |

Override por tenant: `tenants.config.template_emoji`.

**No es una variable `{{n}}`.** El contrato de variables no cambió: el emisor manda los mismos
valores en el mismo orden y no sabe nada del emoji. Era el requisito explícito del dueño al autorizar
el cambio (*"asegúrate que sigamos usando toda nuestra lógica de plantillas y variables"*).

Tres reglas que hay que preservar:

1. **`resolveTemplateEmoji()` nunca devuelve vacío.** Los textos lo pegan junto a otro emoji
   (`🎉${emoji}`) o después de una palabra; una cadena vacía dejaría un espacio suelto dentro de un
   texto **ya aprobado**, imposible de arreglar sin re-someterlo. Un tenant que no quiera emoji edita
   sus textos, que es justo lo que la pantalla permite.
2. **`buildTemplateBody()` y `detectTemplateStyle()` reciben el MISMO emoji.** Si difirieran, un
   texto sin editar se detectaría como `personalizado` y la pantalla le diría al dueño que dejó de
   usar el estilo que sí está usando. `emojiOf(tenant)` en `template.service.ts` es la única fuente.
3. **Nada de emojis de un rubro concreto en `template-texts.ts`.**
   `tests/unit/template-catalog.test.ts` recorre todo el banco y falla si aparece
   🍣 🍕 🍔 🌮 ☕ 🍜 🥢 💈 💅 o 🍽️ horneado.

Cambiar el emoji **no cambia las plantillas ya aprobadas**: el texto que Meta aprobó es literal. Solo
afecta a las que se creen o se re-sometan después.

## Modelo de datos

`admin_settings.<settings_key>` **sigue siendo el puntero vigente y su contrato no cambia**: todo el
camino de envío lo lee igual que ayer, y no se tocó ni una línea de ese camino. Lo nuevo:

- **`template_versions`** — la vigente, la pendiente, el historial, y quién editó qué y cuándo.
- **`admin_settings.template_style`** — ya no se lee (los estilos se retiraron el 2026-09-10). Puede quedar en filas viejas.

**Por qué una tabla y no más claves en `admin_settings`:** `admin_settings` es key-value y no tiene
dónde registrar autor ni fecha, que es requisito duro de la decisión 3 (sin registro, *"es su culpa"*
no se sostiene después). Además, el versionado así es **aditivo**: con `template_versions` vacía, el
sistema envía exactamente como hoy.

Detalle de columnas e índices: `docs/DB_SCHEMA.md`.

### Invariantes en la base, no solo en la UI

| Índice | Qué garantiza |
|---|---|
| `idx_template_versions_one_current` | Una sola vigente por slot — `admin_settings` nunca queda ambiguo |
| `idx_template_versions_one_pending` | Una sola edición en revisión por slot — dos pendientes competirían por el mismo puntero al aprobarse |
| `idx_template_versions_provider_ref` | Nombres únicos por tenant — el nombre es único por WABA en Meta |

## Nombres de las versiones

El nombre de una plantilla es único por WABA, y la vieja **sigue existiendo** mientras la nueva se
revisa. Por eso cada versión necesita nombre propio: `bienvenida` → `bienvenida_v2` → `bienvenida_v3`.

`nextProviderRef()` mira `template_versions`, el puntero actual de `admin_settings` **y los nombres
que de verdad hay en la WABA** (desde el 2026-10-02). Esto importa: un tenant dado de alta por el AIOS
puede tener el puntero puesto y **cero filas** en `template_versions`, o directamente las plantillas
creadas en Meta sin nada acá; reusar ese nombre hace fallar la creación contra Zernio. Un nombre
escrito por el dueño que ya existe en la WABA se corta con 409 antes de llamar a Zernio.

### El dueño puede escribir el nombre (desde el 2026-09-12)

`nextProviderRef()` solo ve lo que el producto sabe. Planeta Wings tenía 13 plantillas creadas de golpe
por el AIOS que quedaron «en revisión» sin salir nunca (el dueño ya lo había visto en dos restaurantes:
72 h y nada), y el panel intentaba crear `bienvenida` otra vez → Zernio 400. La salida fue crearlas
**de a una, con otro nombre**, así que el editor tiene un campo **«Nombre en WhatsApp»**:

- Viene lleno con `suggestedName` (= lo que `nextProviderRef()` elegiría). Se toca solo cuando choca.
- Se normaliza al escribir (`normalizeTemplateName()`: minúsculas, sin tildes, espacios → `_`) y se
  valida con `validateTemplateName()` (regla de Meta `^[a-z][a-z0-9_]*$`, ≤ 512). Las dos son puras,
  en `template-catalog.ts`, con test.
- El `PUT …/catalog/[key]` acepta `name` opcional; `submitTemplateBody()` lo valida y rechaza con 409
  uno que este negocio ya usó (cualquier fila de `template_versions` o cualquier puntero): casi seguro
  sigue en la WABA. Lo que no sabe el producto lo rechaza Meta, y desde el mismo día un **400 de
  Zernio ya no dice «vuelve a intentarlo más tarde»** (no es transitorio): dice el motivo del proveedor
  y manda a Editar para cambiar el nombre.
- «Enviar a Meta» (el botón sin editor) sigue con el nombre automático: si choca, el 400 lo dice.
- **El puntero no cambia por el nombre**: lo escribe `promoteVersion()` al aprobarse, como siempre.

## Guardas (ola P1-a, 2026-10-11)

- **Solo la marca toca las plantillas (N5 y N5-bis).** `PUT …/catalog/[key]`, `POST …/submit` y
  `POST …/adopt` (P1-a) y, desde el 2026-10-11, las de Twilio —`POST /api/dashboard/templates`,
  `POST …/[sid]/submit` y `POST …/standard`— pasan por `exigirAlcanceDeMarca()`: un administrador de UNA
  sede recibe 403 (las plantillas y sus punteros son de la marca). El operador de Cada1 pasa. Test:
  `plantillas-twilio-permisos.test.ts`.
- **Ajustes acepta una lista cerrada (OPER-4).** `src/lib/settings-keys.ts`: las claves que escriben
  las pantallas, leídas del código (test `p1a-settings-claves.test.ts`, que desde el 2026-10-11 suma los
  punteros del catálogo cuando Plantillas los escribe con `entry.definition.settingsKey`). Otra clave =
  400. Un puntero de una marca Zernio = 400 con el porqué; el MISMO valor que ya tiene = 200 sin escribir.
  **OPER-4-bis cerrado (2026-10-11):** Ajustes ya no tiene los desplegables ni el «Guardar» que tragaba
  ese 400; en Plantillas, un error al elegir se muestra.
- **La pantalla no llama a la WABA en cada carga (N16).** `getTemplateCatalogState()` guarda el
  listado 60 s por marca (`WABA_CACHE_MS`), en la memoria del proceso: sin infraestructura nueva. En
  Vercel cada instancia tiene el suyo, así que lo peor es una lectura de más, nunca un dato de más de
  60 s. Se invalida al crear o someter (`createAndSubmit()`, salga bien o mal) y en
  `applyProviderTemplateStatus()` (webhook de Meta y «Usar la aprobada»). Someter, adoptar y validar
  un nombre siguen leyendo la WABA EN VIVO: ahí un listado viejo decidiría mal.
- **Twilio se lista entero (N23).** `src/lib/twilio/content-list.ts` sigue `meta.next_page_url`
  (solo de `content.twilio.com`) y es todo o nada: si una página falla, la ruta contesta el error de
  siempre en vez de una lista cortada. Lo usan `GET /api/dashboard/templates` y el reporte «Del set
  estándar te faltan» (`twilio-catalog.service.ts`), que con 100+ veía punteros vivos como huérfanos.
- **Paridad catálogo ↔ código (OPER-6).** `p1a-plantillas-paridad.test.ts` falla si el código nombra
  un puntero que el catálogo no define. Desde el 2026-10-11 quedan **dos** excepciones, las legacy
  `reactivation_with_reward_template_sid` y `reactivation_template_sid` (las retira la fase 1B del ciclo),
  y un puntero del catálogo sin emisor todavía, `gift_expiring_template_sid` (`SIN_EMISOR_TODAVIA`: el
  test obliga a sacarlo de ahí cuando la 1B lo empiece a mandar).
- `fetchPointers()` ya no confunde un fallo de lectura con «no hay punteros» (lanza 500): con los
  punteros vacíos, «Usar la aprobada» creía libre un mensaje que se estaba enviando.

## Archivos

| Archivo | Rol |
|---|---|
| `src/constants/template-catalog.ts` | Estructura de los 16 + validación (también la de las libres: `validarPlantillaLibre`) + preview |
| `src/constants/template-texts.ts` | Banco de textos (uno por mensaje) |
| `src/types/template.types.ts` | Tipos compartidos (evita el ciclo catálogo ↔ textos) |
| `src/services/template.service.ts` | Zernio: estado, reconciliación con la WABA, edición, promoción, detector, libres |
| `src/services/twilio-catalog.service.ts` | Twilio: `getTwilioCatalogState()` (la pantalla única), crear lo que falta, `fillEmptyPointer()` |
| `src/lib/template-library.ts` | Qué plantilla es de la Biblioteca y qué mensaje usa cada una |
| `src/lib/zernio/templates.ts` | Adaptador REST de Zernio (crear / consultar) |
| `src/app/api/dashboard/templates/catalog/route.ts` | `GET` estado del catálogo (los dos proveedores) |
| `src/app/api/dashboard/templates/route.ts` | `GET` la cuenta entera (con `biblioteca`/`en_uso_por`) · `POST` una libre, Twilio o Zernio |
| `src/app/api/dashboard/templates/catalog/[key]/route.ts` | `PUT` editar una plantilla |
| `src/app/api/dashboard/templates/catalog/[key]/submit/route.ts` | `POST` enviar el texto del catálogo tal cual |
| `src/app/api/dashboard/templates/catalog/[key]/adopt/route.ts` | `POST` activar la aprobada que ya estaba en la WABA |
| `src/lib/settings-keys.ts` | La lista cerrada del `PUT` de Ajustes y la regla de los punteros |
| `src/lib/twilio/content-list.ts` | Todas las páginas de la Content API de Twilio |
| `src/app/api/webhook/zernio/route.ts` | Recibe `whatsapp.template.status_updated` |
| `src/app/(dashboard)/dashboard/templates/page.tsx` | Las dos pestañas |
| `src/components/dashboard/templates/TemplateCatalogEditor.tsx` | Mensajes automáticos (los dos proveedores) |
| `src/components/dashboard/templates/TemplateEditorDialog.tsx` | El editor tipo documento (Zernio) |
| `src/components/dashboard/templates/TemplateLibrary.tsx` | Biblioteca para campañas (ex `TwilioTemplateManager`) |
| `src/components/dashboard/templates/TemplateSelector.tsx` | El desplegable «elige una aprobada» (venía de Ajustes) |
| `tests/unit/template-catalog.test.ts` | Los textos contra las reglas de Meta |
| `tests/unit/plantillas-*.test.ts` | Un solo libro: WABA, pantalla única, biblioteca, permisos Twilio |

## La UX: por qué el vocabulario es el que es

§12 punto 6: *"debe sentirse como una edición simple, nunca como 'estoy creando algo nuevo'"*.

- El dueño ve **"mensajes"**, no "plantillas". Ve **"Activo"** y **"Revisando un cambio"**, no
  `approved`/`pending`. Nunca ve un SID, un nombre técnico ni la palabra "versión".
- No elige categoría, idioma ni valores de ejemplo: todo eso lo pone el catálogo. El nombre lo puede
  cambiar en el editor (2026-09-12) y solo hace falta cuando el sugerido choca.
- Las variables no se explican como `{{1}}` — son fichas con nombre ("Nombre del cliente") que se
  insertan con un clic donde está el cursor.
- La vista previa muestra el mensaje **ya armado con datos de ejemplo**, que es lo que quiere juzgar.

**Lo único de la mecánica real que sí se le cuenta** es lo que le afecta: que el cambio tarda 1-3 días
y que mientras tanto sus clientes siguen recibiendo el mensaje anterior. Ocultarle eso lo dejaría
creyendo que ya cambió.

### Marcas Twilio: la misma pantalla (2026-10-11)

Hasta el 2026-10-11 la pantalla se bifurcaba (`GET …/catalog` contestaba 409 a Twilio y caía al gestor
Twilio, con la tarjeta «Del set estándar te faltan N» y Ajustes › Plantillas aparte para asignar). Ahora
`GET …/catalog` les contesta con `getTwilioCatalogState()`, la MISMA forma que a Zernio:

| Estado de la fila | Qué significa | Botón |
|---|---|---|
| Pendiente de enviar | No hay puntero | **Enviar a Meta** (`POST …/standard`: crea con el texto del catálogo, la somete y `fillEmptyPointer()` deja el puntero) — las 2 de evento no, con el motivo a la vista |
| Sin enviar a Meta | La plantilla asignada existe pero nunca se sometió | **Enviar a Meta** (`POST …/[sid]/submit`) |
| En revisión de WhatsApp | Twilio la tiene en revisión | — |
| Activo | Aprobada | — |
| Rechazado por WhatsApp | Rechazada, con el motivo de Meta a la vista | **Elegir otra** |
| Pausado por Meta | Meta la frenó | **Elegir otra** |
| Apunta a una plantilla que ya no existe | Twilio no conoce ese ContentSid | **Elegir otra** |

**«Elegir otra»** está en todas las filas Twilio: el desplegable que vivía en Ajustes
(`TemplateSelector`, con las aprobadas de la cuenta en `elegibles`) y el `PUT /api/dashboard/settings`
de siempre. Y la reactivación «con premio» del sistema anterior (puntero + premio fijo), que no está en el
catálogo, quedó en un bloque plegado «Sistema antiguo» al final: así ninguna marca pierde forma de asignar
algo que asignaba en Ajustes. **No hay editor en Twilio**: sus textos aprobados no se tocan (decisión 6).

**Estrictamente aditivo** sigue siendo crear: `createStandardTemplate()` solo llena huecos y jamás
reemplaza, reescribe ni re-somete una existente. `fillEmptyPointer()` escribe el puntero al CREAR (antes de
la aprobación) y se niega si ya hay valor; los presets de Campañas exigen además que la plantilla esté
aprobada (`isPresetSendable()`), y el cron de cumpleaños, el cron `reward-reminder` y el check-in (al cruzar de
nivel) lo preguntan (`isTwilioTemplateApproved()`; los dos últimos desde PL-2-a, 2026-10-12).

**Ajustes › Plantillas WhatsApp** perdió los 15 desplegables y su «Guardar». Queda una tarjeta que lleva a
Plantillas, porque varios avisos del sistema (calendario, crons) todavía dicen «configúrala en Ajustes».

### La Biblioteca para campañas (decisiones B4 y B5, 2026-10-11)

Pestaña aparte en Plantillas (`TemplateLibrary`, el gestor Twilio de siempre, con el mismo aspecto):
las plantillas que el dueño crea para una campaña puntual, reutilizables, **en los dos proveedores**.

- **No hay tabla nueva.** La cuenta de WhatsApp ya es donde viven (WABA o Content API). Lo que faltaba era
  separarlas: `clasificarParaLaBiblioteca()` marca `biblioteca` (ningún mensaje automático la usa y, en
  Zernio, su nombre no es el de un mensaje del catálogo) y `en_uso_por`. La lista muestra primero las de
  campaña y, plegadas, las de los mensajes automáticos: es también la lista entera de la cuenta que el
  dueño pidió el 2026-10-02.
- **Una marca Zernio ya puede crear una libre** (B5): `POST /api/dashboard/templates` →
  `crearPlantillaLibreZernio()` → el `POST /v1/whatsapp/templates` verificado (contrato §4), el mismo del
  catálogo. No puede llamarse como un mensaje del catálogo (`bienvenida_v7`: el panel la confundiría con
  una versión) ni repetir un nombre de la WABA.
- **Una sola regla** para las libres, en el formulario y en el servidor (`validarPlantillaLibre()`):
  nombre de Meta, variables sin huecos, línea de SALIR en MARKETING, 3 palabras fijas por variable + 1 y un
  ejemplo por variable. Antes la ruta Twilio no exigía SALIR ni variables sin huecos (§1.9).
- **Campañas → Mensaje libre** lista primero «De tu biblioteca» y después «De tus mensajes automáticos».
  Lo que rellena es lo de siempre: `{{1}}` nombre, `{{2}}` puntos, `{{3}}` próximo premio (N23-bis).

## Configuración

| Variable de entorno | Requerida | Para qué |
|---|---|---|
| `ZERNIO_API_KEY` | Sí (ya existía) | Crear y consultar plantillas |
| `ZERNIO_WEBHOOK_SECRET` | Sí (ya existía) | Verificar la firma del webhook de aprobación |
| `ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL` | Solo para `evento_imagen` | URL pública de la imagen de muestra que Meta revisa |
| `ZERNIO_TEMPLATE_SAMPLE_VIDEO_URL` | Solo para `evento_video` | Ídem, para video |

Sin las dos últimas, las 11 plantillas de texto funcionan igual y las 2 de evento salen con el botón
**deshabilitado y el motivo escrito en su fila** (`blockedReason`); si algo llegara igual al servicio,
`createAndSubmit()` corta con un 409. Meta **descarga** el archivo de muestra: no se puede inventar
una URL, tiene que ser pública sin firma y parecerse a lo que la plantilla dice ser. El intento de
video de la cuenta master quedó `rejected` con *"Error downloading invalid media URL"*.

Las dos son **de una sola vez para todo el despliegue**, no por tenant: solo las mira Meta al aprobar.
Cada evento real manda después su propia imagen.

⚠️ **`Zernio respondió 502: Media upload failed: fetch failed` no es un problema de la plantilla.**
Es Zernio diciendo que no pudo **bajar** el archivo de esa variable. Pasó el 2026-09-09 con
`evento_imagen` mientras `evento_video` se creaba sin problema, o sea que la URL del video estaba
bien y la de la imagen no. Se diagnostica en diez segundos: abrí la URL de la variable en una
pestaña de incógnito. Si no te muestra el archivo, no existe en el bucket `event-media` o el nombre
no coincide (típico: se subió `.png` y la variable dice `.jpg`). La variable va en las env de **este**
software, no en las del AIOS, y el bucket tiene que ser el del proyecto `bredfyugmjjctxysnasw`.

## Lo que falta / decisiones no tomadas

- **No se borra la plantilla vieja del proveedor.** §12 dice que al aprobar la nueva "se borra la
  vieja". El contrato verificado de Zernio **no expone un DELETE de plantillas** (§4: crear, listar,
  consultar) y esa doc prohíbe explícitamente inventar rutas. Lo que sí se hace —dejar de apuntarla y
  marcarla `retired`— resuelve el problema real; la plantilla queda huérfana en la WABA, sin costo ni
  efecto sobre el envío. **Si Zernio confirma un endpoint de borrado, el gancho es `retired_at`.**
- **Una versión `retired` no revive** (2026-09-10). Si Meta aprueba con retraso una plantilla que ya
  se había retirado, `applyProviderTemplateStatus()` **ignora** esa aprobación: promoverla pisaría el
  puntero con el mensaje viejo y degradaría a la vigente sin que nadie apretara nada, y entre la
  edición y el veredicto de Meta caben 72 horas. Antes solo se miraba `is_current`.
- **Meta puede PAUSAR una plantilla ya vigente** por baja calidad. §12 no dice qué hacer con eso y no
  se inventó una política: el puntero no se toca. Desde el 2026-10-11 **se ve** (la fila dice «Pausado
  por Meta»), pero nadie avisa ni deja de enviar. Es material del Bloque 3 de gobernanza de envío.
- **No hay aviso proactivo al dueño** cuando Meta rechaza: se entera al entrar a la pantalla. Mandarle
  un correo o un WhatsApp no está en §12.
- **Generación de textos con LLM** — §12 respuesta 5: *"banco fijo, llm luego"*. El prompt P4 de
  `PROMPTS_SESIONES_BARATAS.md` queda para una fase posterior.
- **Los tenants Twilio** no reciben el editor tipo documento: sus plantillas existentes no se tocan
  (decisión 6, textual: "déjalos así, ni los toques"). Rellenan huecos y eligen; no editan.
- **Las 2 plantillas de evento (media) no se pueden crear desde la pantalla en Twilio.** Llevan
  header de imagen/video y siguen dependiendo de `scripts/twilio-create-media-templates.mjs` o de la
  consola; la fila lo dice y, aprobada, se elige con «Elegir otra».
- **Una plantilla libre no deja registro de quién la creó** (no hay fila en `template_versions`: no es de
  ningún mensaje). La advertencia de responsabilidad de la decisión 3 cubre el editor del catálogo.
- **En Twilio el puntero se escribe al CREAR** (`fillEmptyPointer()`), no al aprobarse: es lo deliberado
  desde v2.15.0. Un envío con la plantilla aún en revisión falla en Meta, así que los emisores preguntan por
  la aprobación: los presets, el cron de cumpleaños, el cron `reward-reminder` (si no está aprobada ese día no
  se intenta y no cuenta como fallido) y el check-in al cruzar de nivel (cae a «puntos sumados»). Los dos
  últimos son de PL-2-a (2026-10-12), que cerró el caso caro: antes cada día de revisión del recordatorio
  contaba como un fallido y al tercero ese premio se quedaba sin recordatorio para siempre. **Siguen sin
  preguntar** el check-in manual del panel (`check-in-override`) y el registro de un domicilio
  (`delivery.service.ts`), que mandan «Nivel desbloqueado» tal cual: en una marca Twilio con la plantilla en
  revisión es un mensaje perdido (sin reintento ni tope). Cerrarlo de raíz es `docs/PENDIENTES.md` PL-2.
- **Reemplazar una plantilla Twilio rechazada** no tiene botón propio: se crea una corregida en la
  Biblioteca y, aprobada, se elige con «Elegir otra».
- **No se agregó botón de opt-out a las plantillas MARKETING.** Meta lo pide para marketing desde
  2024, pero las 11 que hay ya están **aprobadas con la línea de texto** *"Responde SALIR…"*, y
  cambiar el componente obligaría a re-someter las 11 (24-72 h cada una) sin evidencia de que haga
  falta. Si Meta empieza a rechazar plantillas nuevas por esto, el cambio es en
  `src/lib/zernio/templates.ts` (hoy declara "sin footer y sin botones").

## Relación con otros docs

- **§6 del requerimiento** (wizard de branding/tono) queda parcialmente resuelto: el tono ya existe.
  Falta logo y paleta. **§6 debe actualizarse para no duplicar este trabajo.**
- `docs/PLANTILLAS.md` sigue siendo la referencia del tono cálido y de la tabla de variables por
  plantilla; es la versión en prosa del contrato que ahora vive tipado en `TEMPLATE_CATALOG`.
- `docs/features/zernio-messaging.md` — el envío por Zernio, que consume los punteros que esta feature
  mantiene.
- `docs/features/send-governance.md` — Bloque 3, que debe reusar `applyProviderTemplateStatus()`.
