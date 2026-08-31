# Plantillas de WhatsApp — catálogo estándar, 3 estilos y edición sin huecos

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
| 2 | **Un solo estilo por tenant.** No se mezcla — *"no puedes enviar un mensaje con tono urbano y uno cálido"* | `StyleSelector.tsx` ofrece una sola elección global |
| 3 | **El dueño edita sus propias plantillas**, con advertencia de responsabilidad y registro de quién y cuándo | `template_versions.edited_by` / `disclaimer_accepted_at` |
| 4 | **El estilo es SUGERENCIA, no candado.** Se puede cambiar; re-aplicarlo a las 13 es explícito y avisa que son 13 aprobaciones nuevas | `admin_settings.template_style` + `applyStyleToCatalog()` |
| 5 | **Banco de textos fijo** (13 × 3 = 39). Sin LLM por ahora. El estilo NO varía por `business_type` | `src/constants/template-texts.ts` |
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

El emisor (check-in, crons, campañas, calendario) manda un diccionario posicional fijo y **no sabe qué
estilo tiene el tenant**. Un estilo puede reordenar la prosa; **nunca** agregar, quitar ni resignificar
un `{{n}}`. Cambiar la aridad en `TEMPLATE_CATALOG` rompe el envío de los 3 estilos a la vez.

`validateTemplateBody()` lo hace cumplir en el editor, en la API y en el test.

## Los 3 estilos

| Estilo | Registro | Nota |
|---|---|---|
| `calido` | Cercano y enérgico | **El default. Port literal del catálogo en producción** — §12 respuesta 2: "sin cambios en el default" |
| `elegante` | Sobrio, casi sin emojis, sin exclamaciones | Nuevo |
| `urbano` | Directo, frases cortas, cero formalidad | Nuevo |

**Son 39 textos, no 117:** el estilo NO varía por `business_type`. Lo específico del negocio viaja en
variables. Cada texto es una aprobación de Meta aparte, así que la diferencia entre 39 y 117 es real
en tiempo y en riesgo.

> ⚠️ **Observación para el dueño (no resuelta a propósito):** los textos `calido` traen 🍣 horneado —
> nacieron para Sushi Service. En un tenant que no sea de comida japonesa, ese emoji se ve fuera de
> lugar. No se tocó porque la decisión 2 dice explícitamente "sin cambios en el default"; cambiarlo es
> una decisión del dueño, no nuestra. `elegante` y `urbano` sí nacen neutrales al tipo de negocio.

## Modelo de datos

`admin_settings.<settings_key>` **sigue siendo el puntero vigente y su contrato no cambia**: todo el
camino de envío lo lee igual que ayer, y no se tocó ni una línea de ese camino. Lo nuevo:

- **`template_versions`** — la vigente, la pendiente, el historial, y quién editó qué y cuándo.
- **`admin_settings.template_style`** — el estilo default del tenant.

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
| `src/app/api/dashboard/templates/style/route.ts` | `PUT` cambiar estilo (± re-aplicar) |
| `src/app/api/webhook/zernio/route.ts` | Recibe `whatsapp.template.status_updated` |
| `src/components/dashboard/templates/TemplateCatalogEditor.tsx` | La pantalla (Zernio) |
| `src/components/dashboard/templates/TemplateEditorDialog.tsx` | El editor tipo documento |
| `src/components/dashboard/templates/StyleSelector.tsx` | Estilo + confirmación de re-aplicar |
| `src/components/dashboard/templates/TwilioTemplateManager.tsx` | La pantalla anterior, intacta |
| `tests/unit/template-catalog.test.ts` | Las 39 combinaciones contra las reglas de Meta |

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

## Configuración

| Variable de entorno | Requerida | Para qué |
|---|---|---|
| `ZERNIO_API_KEY` | Sí (ya existía) | Crear y consultar plantillas |
| `ZERNIO_WEBHOOK_SECRET` | Sí (ya existía) | Verificar la firma del webhook de aprobación |
| `ZERNIO_TEMPLATE_SAMPLE_IMAGE_URL` | Solo para `evento_imagen` | URL pública de la imagen de muestra que Meta revisa |
| `ZERNIO_TEMPLATE_SAMPLE_VIDEO_URL` | Solo para `evento_video` | Ídem, para video |

Sin las dos últimas, las 11 plantillas de texto funcionan igual y las 2 de evento devuelven un error
claro al intentar crearlas. Meta **descarga** el archivo de muestra: no se puede inventar una URL.

## Lo que falta / decisiones no tomadas

- **No se borra la plantilla vieja del proveedor.** §12 dice que al aprobar la nueva "se borra la
  vieja". El contrato verificado de Zernio **no expone un DELETE de plantillas** (§4: crear, listar,
  consultar) y esa doc prohíbe explícitamente inventar rutas. Lo que sí se hace —dejar de apuntarla y
  marcarla `retired`— resuelve el problema real; la plantilla queda huérfana en la WABA, sin costo ni
  efecto sobre el envío. **Si Zernio confirma un endpoint de borrado, el gancho es `retired_at`.**
- **Meta puede PAUSAR una plantilla ya vigente** por baja calidad. §12 no dice qué hacer con eso y no
  se inventó una política: se registra y se avisa en el log, el puntero no se toca. Es material del
  Bloque 3 de gobernanza de envío.
- **No hay aviso proactivo al dueño** cuando Meta rechaza: se entera al entrar a la pantalla. Mandarle
  un correo o un WhatsApp no está en §12.
- **Generación de textos con LLM** — §12 respuesta 5: *"banco fijo, llm luego"*. El prompt P4 de
  `PROMPTS_SESIONES_BARATAS.md` queda para una fase posterior.
- **Los 4 tenants Twilio** no reciben el catálogo estándar. Decisión 6, textual: "déjalos así, ni los
  toques".

## Relación con otros docs

- **§6 del requerimiento** (wizard de branding/tono) queda parcialmente resuelto: el tono ya existe.
  Falta logo y paleta. **§6 debe actualizarse para no duplicar este trabajo.**
- `docs/PLANTILLAS.md` sigue siendo la referencia del tono cálido y de la tabla de variables por
  plantilla; es la versión en prosa del contrato que ahora vive tipado en `TEMPLATE_CATALOG`.
- `docs/features/zernio-messaging.md` — el envío por Zernio, que consume los punteros que esta feature
  mantiene.
- `docs/features/send-governance.md` — Bloque 3, que debe reusar `applyProviderTemplateStatus()`.
