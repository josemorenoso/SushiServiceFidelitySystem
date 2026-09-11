# Plantillas de WhatsApp — catálogo estándar, un solo estilo y edición sin huecos

> **Estado:** implementado (v2.12.0, 2026-08-30) · **Alcance:** solo tenants `messaging_provider='zernio'`
> **Requerimiento:** `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` §12 (primera prioridad del proyecto)
> **Migración:** `supabase/migrations/00039_template_catalog.sql`

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
| 1 | **Un catálogo estándar de 13 plantillas**, igual para todo tenant nuevo | `src/constants/template-catalog.ts` |
| 2 | **Un solo estilo.** Hubo tres hasta el 2026-09-10; el dueño los quitó (*"siempre cálido, nada de eso sirve"*) | `TEMPLATE_STYLES = ['calido']` |
| 3 | **El dueño edita sus propias plantillas**, con advertencia de responsabilidad y registro de quién y cuándo | `template_versions.edited_by` / `disclaimer_accepted_at` |
| 4 | ~~El estilo es sugerencia, no candado~~ **Retirado el 2026-09-10** con los estilos. `admin_settings.template_style` ya no se lee; `applyStyleToCatalog()` y `StyleSelector` se borraron | — |
| 5 | **Banco de textos fijo** (13). Sin LLM por ahora. Lo que varía por `business_type` es solo el emoji | `src/constants/template-texts.ts` |
| 6 | **Solo tenants nuevos por Zernio.** Los 4 tenants Twilio no se tocan | `assertZernioTenant()` |

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

**El invariante que sostiene todo:** `promoteVersion()` es el **único** punto del sistema que escribe
`admin_settings.<settings_key>`, y solo corre cuando Meta ya dijo `APPROVED`.

## El alta de un negocio nuevo: enviar tal cual o editar

`aios_provision_tenant` **no siembra ningún `*_template_sid`**: un tenant recién creado llega a esta
pantalla con las 13 vacías. Hasta 2026-09-06 el único camino que las creaba en bloque era el de
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

## Las 13 plantillas

Port fiel de `scripts/twilio-create-text-templates.mjs` (11) + `twilio-create-media-templates.mjs` (2),
vía `Level 2.0/aios-constelarys/src/lib/zernio/templates-catalog.ts`.

| Plantilla | `settings_key` | Categoría | Variables |
|---|---|---|---|
| Bienvenida | `welcome_template_sid` | UTILITY | 3 |
| Puntos sumados — lejos | `points_earned_far_template_sid` | MARKETING | 4 |
| Puntos sumados — cerca | `points_earned_near_template_sid` | MARKETING | 4 |
| Nivel desbloqueado (premio seguro) | `reward_safe_template_sid` | MARKETING | 4 |
| Mystery Box — resultado | `mystery_box_result_template_sid` | MARKETING | 4 |
| Golden Box — resultado | `golden_box_result_template_sid` | MARKETING | 3 |
| Cumpleaños | `birthday_template_sid` | MARKETING | 2 |
| Reactivación suave | `reactivation_no_reward_template_sid` | MARKETING | 3 |
| Reactivación insistente | `reactivation_aggressive_template_sid` | MARKETING | 3 |
| Campaña → domicilio | `campaign_presencial_to_domicilio_template_sid` | MARKETING | 3 |
| Campaña → presencial | `campaign_domicilio_to_presencial_template_sid` | MARKETING | 3 |
| Evento con imagen | `event_template_image_sid` | MARKETING | 5 + header |
| Evento con video | `event_template_video_sid` | MARKETING | 5 + header |

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

**Son 13 textos.** Lo único que varía por `business_type` es el emoji horneado. Cada texto es una
aprobación de Meta aparte.

⚠️ **El AIOS lleva una COPIA de estos 13 textos** (`Level 2.0/aios-constelarys/src/lib/zernio/
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
   `tests/unit/template-catalog.test.ts` recorre las 39 combinaciones y falla si aparece
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

`nextProviderRef()` mira tanto `template_versions` como el puntero actual de `admin_settings`. Esto
importa: un tenant dado de alta por el AIOS (`aios_set_template_settings()`) tiene el puntero puesto y
**cero filas** en `template_versions`; reusar ese nombre haría fallar la creación contra Zernio.

## Archivos

| Archivo | Rol |
|---|---|
| `src/constants/template-catalog.ts` | Estructura de las 13 + validación + preview |
| `src/constants/template-texts.ts` | Banco de 39 textos |
| `src/types/template.types.ts` | Tipos compartidos (evita el ciclo catálogo ↔ textos) |
| `src/services/template.service.ts` | Toda la lógica: estado, edición, promoción, detector |
| `src/lib/zernio/templates.ts` | Adaptador REST de Zernio (crear / consultar) |
| `src/app/api/dashboard/templates/catalog/route.ts` | `GET` estado del catálogo |
| `src/app/api/dashboard/templates/catalog/[key]/route.ts` | `PUT` editar una plantilla |
| `src/app/api/dashboard/templates/catalog/[key]/submit/route.ts` | `POST` enviar el texto del catálogo tal cual |
| `src/app/api/webhook/zernio/route.ts` | Recibe `whatsapp.template.status_updated` |
| `src/components/dashboard/templates/TemplateCatalogEditor.tsx` | La pantalla (Zernio) |
| `src/components/dashboard/templates/TemplateEditorDialog.tsx` | El editor tipo documento |
| `src/components/dashboard/templates/TwilioTemplateManager.tsx` | La pantalla anterior, intacta |
| `tests/unit/template-catalog.test.ts` | Los 13 textos contra las reglas de Meta |

## La UX: por qué el vocabulario es el que es

§12 punto 6: *"debe sentirse como una edición simple, nunca como 'estoy creando algo nuevo'"*.

- El dueño ve **"mensajes"**, no "plantillas". Ve **"Activo"** y **"Revisando un cambio"**, no
  `approved`/`pending`. Nunca ve un SID, un nombre técnico ni la palabra "versión".
- No elige nombre, categoría, idioma ni valores de ejemplo: todo eso lo pone el catálogo.
- Las variables no se explican como `{{1}}` — son fichas con nombre ("Nombre del cliente") que se
  insertan con un clic donde está el cursor.
- La vista previa muestra el mensaje **ya armado con datos de ejemplo**, que es lo que quiere juzgar.

**Lo único de la mecánica real que sí se le cuenta** es lo que le afecta: que el cambio tarda 1-3 días
y que mientras tanto sus clientes siguen recibiendo el mensaje anterior. Ocultarle eso lo dejaría
creyendo que ya cambió.

### Tenants Twilio

La pantalla se bifurca por proveedor: `GET /api/dashboard/templates/catalog` responde **409** si el
negocio no es Zernio, y `page.tsx` cae al `TwilioTemplateManager` — la pantalla anterior, movida a un
componente **sin un solo cambio de comportamiento**. El guardarraíl de verdad no está en la UI sino en
`assertZernioTenant()`, dentro del servicio, para que ninguna ruta pueda saltárselo.

#### Completar huecos del set estándar (v2.15.0)

Encima de esa pantalla se dibuja **«Del set estándar te faltan N»**
(`StandardCatalogGaps.tsx` → `twilio-catalog.service.ts` → `/api/dashboard/templates/standard`).

Existe por un reporte concreto del dueño: *"al apartado le faltan las plantillas de invitar a
restaurante los que piden por domicilio e invitar a domicilio los que piden por restaurante"*. Las
dos **sí están** en el catálogo y en el script de alta de Twilio, pero ese script solo corrió
completo en algunas altas —el problema original de §12— y sus presets en `ManualCampaigns.tsx` se
ocultan solos mientras su `admin_settings.*_template_sid` no apunte a una plantilla aprobada
(§15.2). Resultado: una campaña que no se podía lanzar y ninguna pista de por qué.

**Es estrictamente aditivo y no contradice la decisión 6** (*"los 4 tenants Twilio déjalos así, ni
los toques"*): crea las que faltan y jamás reemplaza, reescribe ni re-somete una existente.

| Estado | Qué significa | Qué se puede hacer |
|---|---|---|
| `missing` | No hay puntero en `admin_settings` | Crear con un click |
| `orphan` | Hay puntero, pero Twilio no conoce ese ContentSid | Nada automático: repuntar una plantilla viva es una decisión |
| `pending` | Creada, esperando a Meta | Esperar |
| `approved` | Funcionando | Nada |

**El invariante del puntero se mantiene y se afina.** `promoteVersion()` sigue siendo el único que
**cambia** un `admin_settings.*_template_sid` que ya tiene valor, y solo tras la aprobación de Meta —
así ningún negocio se queda 24-72 h sin ese mensaje. `fillEmptyPointer()` solo **rellena una clave
vacía** y se niega en redondo si encuentra un valor: rellenar un hueco no puede abrir uno.

Escribir el puntero antes de la aprobación es seguro y deliberado: `isPresetSendable()` exige además
que el SID esté en la lista de aprobadas de Twilio, así que el preset sigue oculto hasta que Meta
responda — y cuando responda, aparece solo, sin que nadie tenga que volver a entrar.

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
  se inventó una política: se registra y se avisa en el log, el puntero no se toca. Es material del
  Bloque 3 de gobernanza de envío.
- **No hay aviso proactivo al dueño** cuando Meta rechaza: se entera al entrar a la pantalla. Mandarle
  un correo o un WhatsApp no está en §12.
- **Generación de textos con LLM** — §12 respuesta 5: *"banco fijo, llm luego"*. El prompt P4 de
  `PROMPTS_SESIONES_BARATAS.md` queda para una fase posterior.
- **Los 4 tenants Twilio** no reciben el catálogo estándar *completo*: sus plantillas existentes no
  se tocan (decisión 6, textual: "déjalos así, ni los toques"). Desde v2.15.0 sí pueden **rellenar
  los huecos** —crear las que nunca se les crearon— desde su propia pantalla. Lo que sigue sin
  existir para ellos es el editor tipo documento.
- **Las 2 plantillas de evento (media) no se pueden crear desde la pantalla de Twilio.** Llevan
  header de imagen/video y siguen dependiendo de `scripts/twilio-create-media-templates.mjs`. La
  tarjeta las muestra como informativas, sin botón.
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
