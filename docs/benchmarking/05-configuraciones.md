# Benchmarking — Configuraciones (competencia: plataforma "NOVU")

> Fuente: 12 capturas en `Benchmarking para CADA1/Configuraciones/`. Plataforma de fidelización con
> tarjetas digitales, cuenta de prueba "Inmaculada Elizondo" en modo **Sandbox**. Marca: naranja (~`#E5702D`
> en botones y barra de navegación, `[se intuye, sin confirmar]` el hex exacto por compresión de la
> captura) sobre fondo gris claro (~`#F2F2F2`) y tarjetas blancas. Tipografía sans-serif genérica (estilo
> system-ui/Helvetica), sin distintivo propio. Layout: sidebar izquierdo de iconos (sin etiquetas de texto,
> solo iconografía) + barra superior de tabs naranja + contenido en tarjetas blancas con bordes rectos y
> sombra mínima. Sin estados de error visibles en ninguna captura; un estado vacío sí aparece (Webhooks).

Siete tabs de configuración: Configuración Personal, Integraciones, Servicios, Sobre nosotros, Webhooks,
RFM, Notificaciones. El lote de esta nota cubre las seis subcarpetas asignadas (Configuración Personal
queda como "raíz/general").

---

## 1. Raíz / general — Configuración Personal

`Benchmarking para CADA1/Configuraciones/Captura de pantalla 2026-09-05 005725.png`

Qué hace: datos de perfil del usuario dueño de la cuenta (no del tenant/negocio en sí — ver más abajo
"Sobre nosotros", que sí es el perfil del negocio).

Cómo se ve: dos columnas de formulario dentro de una tarjeta blanca, con un panel de foto de perfil
circular (placeholder gris con icono "+") a la izquierda. Barra superior oscura (~`#2E2B2B`) con logo
"NOVU" en naranja, selector de cuenta ("Cuenta actual: Sandbox" con badge naranja) e iconos de campana,
info, idioma (ES) y usuario. Debajo, la barra de tabs naranja con "Configuración Personal" resaltada en
blanco (tab activo = fondo blanco, texto oscuro; tabs inactivos = fondo naranja, texto blanco).

Textos literales de campos (columna izquierda): "Primer Nombre", "Apellido", "Información del contacto",
"Nombre de empresa", "Correo electrónico", "Teléfono" (con selector de país "ES" y prefijo "+34"), "Nueva
contraseña", "Repita la contraseña". Columna derecha: "Formato de fecha" (`DD-MM-YYYY`), "País"
(`Colombia`), "Idioma" (`Spanish`), "Zona horaria" (`(UTC+00:00) UTC`), "Moneda" (`US dollar (USD)`),
"Categoría de empresa" (vacío, placeholder "Categoría de empresa"). Debajo de la foto: "Quitar Imagen".

Datos de ejemplo visibles (cuenta de prueba, no reales): nombre "Inmaculada Elizondo", empresa "Hernádez
de Roig SA", correo `molun.store1+sandbox.6a9baa838154a2.85016373@gmail.com` — es la dirección de correo
de quien capturó las pantallas, con un alias `+sandbox...` generado por la plataforma de benchmarking; no
es un dato de un cliente real de la competencia.

Cruce con lo nuestro: no existe un equivalente exacto — nuestro modelo es multi-tenant con el tenant
resuelto por dominio (`getTenantByDomain()` / `resolveHostContext()`, `docs/features/multi-sede.md`), no
una cuenta de "usuario dueño" separada del negocio con moneda/zona horaria/idioma configurables por
persona. `docs/ESTADO-REQUERIMIENTOS.md` no tiene una sección de "perfil de usuario admin" en §1-§25.

---

## 2. Integraciones

`Benchmarking para CADA1/Configuraciones/Integraciones/Captura de pantalla 2026-09-05 005758.png`

Qué hace: conecta la plataforma con sistemas de punto de venta / pedidos externos para que las visitas o
compras del cliente final entren automáticamente al programa de fidelización, sin que el negocio las
tipee a mano.

Cómo se ve: banner verde superior ancho, texto "Contáctenos para conectar integraciones" (sugiere que la
activación real requiere soporte, no es self-service completo). Debajo, dos tarjetas lado a lado: "Plan"
(Plan Novu Elite, Pago anual, "3 Integraciones" disponibles) y "Clave API" (`sandbox-2a2e82987ce01eb41da187dee32052c1`
con botón "Copiar" e icono de engranaje). Más abajo, tabla "Aplicaciones activas" con columnas NOMBRE / ID
DE PLANTILLA / REGLA DE ACUMULACIÓN / CANALES DE ENTREGA — vacía en la captura. Al final, "Configuración
de aplicaciones": lista de integraciones disponibles con icono de inicial redondo y botón "Instalar":
**GloriaFood**, **Square**, **Shopify POS** (la lista sigue más abajo, cortada por el borde de la
captura — `[no legible]` si hay más filas debajo de Shopify POS).

Cruce con lo nuestro: no tenemos integraciones de POS. Nuestro único ingreso de datos externos automatizado
es el webhook de domicilios por WhatsApp (`docs/features/delivery-webhook.md`) y el check-in por QR — no
hay conector a GloriaFood, Square ni Shopify POS, ni panel de "aplicaciones instalables". `docs/API_DOCS.md`
confirma que los únicos webhooks de entrada son `/api/webhook/delivery`, `/api/webhook/twilio-incoming` y
`/api/webhook/zernio` — ninguno es un marketplace de integraciones de punto de venta.

---

## 3. Notificaciones

`Benchmarking para CADA1/Configuraciones/Notificaciones/Captura de pantalla 2026-09-05 010120.png`

Qué hace: dos grupos separados — notificaciones **al operador/dueño de la cuenta** (informes) y
notificaciones **al cliente final** (transaccionales).

Cómo se ve: misma barra de tabs naranja arriba ("Notificaciones" resaltado en blanco). Dos secciones con
título en negro sobre fondo blanco, cada casilla en su propia fila con checkbox verde (activado) o gris
(desactivado) a la izquierda del texto:

- "Tu configuración de notificaciones": **"Informe de estadísticas semanales (email)"** — checkbox
  activado (verde con check blanco); **"Informe de estadísticas semanales (telegram)"** — checkbox
  desactivado, con nota gris debajo: *"Para recibir informes a través de Telegram, debe conectar el bot a
  su cuenta de empresa."*
- "Configuración de notificaciones al cliente": **"Correos electrónicos transaccionales"** — checkbox
  desactivado, sin nota adicional.

No hay más campos ni botón de "Guardar" visible en la captura — el guardado parece ser inmediato al tocar
el checkbox (patrón de toggle, no de formulario).

Cruce con lo nuestro: no tenemos informe periódico (semanal ni de ningún período) al dueño del tenant, ni
por email ni por Telegram — es una funcionalidad ausente por completo (`grep` en `docs/` por "informe
semanal"/"resumen semanal"/"weekly" no encontró nada). Sí tenemos "correos electrónicos transaccionales"
en el sentido amplio, pero por WhatsApp, no email: la tabla de `message_class_map` en
`docs/features/send-governance.md` (clase `transactional`, prioridad P0: `welcome`, `checkin`,
`tier_unlocked`, `points_earned_*`, `safe_reward`, `mystery_box`, `golden_box`, `delivery`, `low_balance`)
es el equivalente funcional — mismo concepto (mensajes automáticos disparados por eventos del cliente),
canal distinto (WhatsApp vs. email) y sin un toggle general de encendido/apagado por tipo expuesto al
dueño del tenant en una sola pantalla (nuestros equivalentes son los `admin_settings.*_template_sid`
repartidos en `dashboard/templates` y `dashboard/campaigns`, no un panel de notificaciones dedicado).

---

## 4. RFM (segmentación Recencia-Frecuencia)

`Benchmarking para CADA1/Configuraciones/RFM/Captura de pantalla 2026-09-05 010049.png`
`Benchmarking para CADA1/Configuraciones/RFM/Captura de pantalla 2026-09-05 010055.png`

Qué hace: segmentación automática de clientes por dos ejes configurables — **Frecuencia** (número de
visitas/compras) y algo que la propia pantalla llama indistintamente **"Actualidad"** (en el subtítulo
explicativo) y **"Frescura"** (en cada campo de formulario) — la R de "Recencia" del modelo RFM clásico,
medida en días desde la última compra. **No hay eje de Monto/Valor monetario visible** en ninguna de las
dos capturas — pese a llamarse "RFM", los formularios solo muestran rangos de Frecuencia y Frescura/
Actualidad, nunca de dinero. `[se intuye, sin confirmar]` que la "M" de RFM no está implementada en esta
pantalla, o vive en otro lado no capturado.

Cómo se ve: título "Configuración de RFM", subtítulo con las dos definiciones textuales:
*"Frecuencia: visitas (con qué frecuencia sus clientes le compran)"* y *"Actualidad: días (hace cuánto
tiempo que sus clientes le compraron algo)"*. Debajo, una barra de aviso: *"Cambiar la configuración
volverá a calcular todos los segmentos"*. Luego, una grilla de tarjetas blancas — una por segmento — cada
una con cuatro inputs numéricos (Frecuencia de / Frecuencia a / Frescura de / Frescura a) y un botón
"Guardar" naranja al pie de cada tarjeta (el guardado es **por segmento**, no global).

Los 9 segmentos (nombres literales, con sus rangos por defecto vistos en las capturas):

| Segmento | Frecuencia (de–a) | Frescura/días (de–a) |
|---|---|---|
| Requiere atención | 8–12 | 61–90 |
| RFM - leal - regular | 8–12 | 31–60 |
| RFM - Campeones | 8–12 | 0–30 |
| RFM - En riesgo | 4–7 | 61–90 |
| RFM - Medio (límite) | 4–7 | 31–60 |
| RFM - Crecimientos | 4–7 | 0–30 |
| RFM - Dormido | 1–3 | 61–90 |
| RFM - Dudoso | 1–3 | 31–60 |
| RFM - principiantes | 1–3 | 0–30 |

Los rangos forman una grilla 3×3 (Frecuencia alta/media/baja × Frescura reciente/media/antigua) — un RF
matricial clásico sin el eje de Monto.

Cruce con lo nuestro: **no existe segmentación RFM en el código.** `grep -ri "RFM|recency|recencia"` sobre
todo el repo (excluyendo `node_modules`) solo encontró una coincidencia irrelevante en `package-lock.json`.
`docs/ESTADO-REQUERIMIENTOS.md` tampoco menciona RFM en ninguna de sus 25 secciones. Lo más parecido que
tenemos es la lógica de campañas por inactividad de `docs/features/campaigns.md`: cortes fijos por días
sin visitar (`REACTIVATION_DAYS=21`, `RECOVERY_ZONE_START/END=18/25`, filtro manual `minDays`/`maxDays` en
campañas), y el ranking `POWER_RANKS` (10+ visitas) para "clientes Black/VIP" (`docs/ESTADO-REQUERIMIENTOS.md`
§17). Son ejes de un solo criterio a la vez (solo días, o solo visitas) y con umbrales hardcodeados en
constantes de código (`src/constants/rewards.ts`), no una matriz configurable por el dueño del tenant
desde el panel, ni con nombres de segmento persistentes por cliente.

---

## 5. Servicios

`Benchmarking para CADA1/Configuraciones/Servicios/Captura de pantalla 2026-09-05 005833.png`

Qué hace: catálogo de canales de mensajería que el negocio puede conectar con sus propias credenciales
(bring-your-own-account), para que los envíos salgan con su remitente propio en vez del compartido de la
plataforma.

Cómo se ve: barra de búsqueda arriba ("Ingrese el nombre del servicio"), luego una grilla 2×3 de tarjetas
blancas iguales: logo del proveedor a la derecha, nombre en negrita, párrafo descriptivo, link
"Instrucciones:" con URL del proveedor, y botón naranja ancho "Conectar Cuenta" al pie. Nótese el detalle
visual de captura: la fila de tags grises "SANDBOX" repetida horizontalmente pegada al borde superior —
parece un artefacto/badge de modo sandbox renderizado mal o cortado, no un elemento de navegación real.
`[se intuye, sin confirmar]` su función exacta.

Las 6 tarjetas, con su texto literal:
- **Twilio SMS** — *"Conecte su cuenta Twilio para configurar su propio nombre de remitente SMS. La
  facturación de SMS se cobra por separado a las tarifas de su operador."* Instrucciones: `https://twilio.com/`
- **Mailgun** — *"Conecte su cuenta de Mailgun para personalizar el nombre de su propio remitente de
  correo electrónico. La facturación por correo electrónico se cobra por separado a las tarifas del
  operador."* Instrucciones: `https://mailgun.com/`
- **Custom SMTP** — *"Conecte su cuenta de SMTP para personalizar el nombre de su propio remitente de
  correo electrónico."* (sin link de instrucciones)
- **WhatsApp Bot** — *"Agregue WhatsApp Bot para conectar el bot."* Instrucciones: `https://www.whatsapp.com/`
- **Facebook Messenger** — *"Agrega Facebook Messenger para conectar el bot."* Instrucciones:
  `https://www.messenger.com/`
- **Telegram Bot** — *"Agrega Telegram para conectar el bot."* Instrucciones: `https://core.telegram.org/bots/api`

Cruce con lo nuestro: nosotros sí tenemos un concepto equivalente de "más de un proveedor de mensajería
por tenant" — `docs/features/zernio-messaging.md` documenta el ruteo `tenants.messaging_provider`
(`twilio` / `zernio`), pero es **uno de los dos por tenant, elegido por nosotros al aprovisionar**, no un
catálogo self-service de 6 canales que el dueño del negocio conecta con sus propias credenciales de SMS,
email (Mailgun/SMTP) o bots de Messenger/Telegram. No tenemos canal de email en absoluto (ni transaccional
ni de campañas), ni Facebook Messenger, ni Telegram. Nuestro alcance es exclusivamente WhatsApp (Twilio o
Zernio) más el SMS solo como fallback dentro de Twilio si existiera (no confirmado en los docs leídos).

**Nota fuera de foco del lote pero visible en la carpeta Webhooks** (`Captura de pantalla 2026-09-05
005924.png`, archivo ubicado por error o por continuidad de flujo dentro de esa subcarpeta): es en
realidad la pantalla **"Sobre nosotros"**, el perfil del negocio (no del usuario): Nombre de empresa
("DOT MKT LLC"), Dirección, código postal, Ciudad, País, Estado, Teléfono, Correo electrónico, y enlaces a
Facebook/Instagram/Twitter/Telegram (estos tres últimos vacíos, marcados con "-"). Se documenta acá porque
apareció en el lote de Webhooks y no tiene subcarpeta propia asignada. Cruce: nuestro equivalente disperso
es `tenants.config` (branding) — no hay una pantalla única "Sobre nosotros" con estos campos de dirección
física/redes sociales en el dashboard.

---

## 6. Webhooks

`Benchmarking para CADA1/Configuraciones/Webhooks/Captura de pantalla 2026-09-05 005951.png` (listado)
`Benchmarking para CADA1/Configuraciones/Webhooks/Captura de pantalla 2026-09-05 005955.png` (modal, scroll 1)
`Benchmarking para CADA1/Configuraciones/Webhooks/Captura de pantalla 2026-09-05 010001.png` (modal, scroll 2)
`Benchmarking para CADA1/Configuraciones/Webhooks/Captura de pantalla 2026-09-05 010006.png` (modal, scroll 3)
`Benchmarking para CADA1/Configuraciones/Webhooks/Captura de pantalla 2026-09-05 010008.png` (modal, scroll 4)

Qué hace: **webhooks de salida** — el dueño del negocio registra una URL propia y elige a qué eventos de
la plataforma quiere suscribirse; cuando ocurren, la plataforma le hace un POST a esa URL. Es lo opuesto
de nuestro caso de uso (nosotros solo tenemos webhooks de *entrada*: recibimos, no emitimos).

### Listado (`005951.png`)
Tabla vacía con columnas **URL / ESTADO / CONTACIÓN DE EVENTOS** (sic — probablemente typo de "Notificación
de eventos" o similar en el original, transcrito literal: `[se intuye, sin confirmar]` si es error de la
plataforma o de la captura). Paginación "Mostrar 10/20/50/100" con "10" seleccionado, y contador "Mostrar 0
desde 0". Botón naranja "Agregar webhook" arriba a la derecha. Estado vacío sin ilustración ni mensaje
adicional — solo la tabla en blanco.

### Modal "Agregar webhook" (4 capturas de scroll)
Campo único arriba: **"URL"** (input de texto, obligatorio — asterisco rojo). Debajo, sección "Eventos":
una lista con scroll de checkboxes, cada evento con nombre en español (negro) y su identificador técnico
en inglés debajo (gris, tipo `PascalCase` + `Event`) — sin agrupar por categoría visualmente, es una lista
plana larga. Al pie: toggle "Estado" (verde = activo, visto encendido en las 4 capturas) y botones
"Agregar webhook" (naranja) / "Cancelar" (blanco con borde).

**Catálogo completo de eventos disponibles** (orden de aparición al hacer scroll, texto literal + su
identificador):

| Evento (texto visible) | Identificador |
|---|---|
| Actualización del saldo de la tarjeta | `CardBalanceUpdatedEvent` |
| Fecha de expiración de la tarjeta | `CardExpiredEvent` |
| Tarjeta instalada | `CardInstalledEvent` |
| Tarjeta emitida | `CardIssuedEvent` |
| Tarjeta eliminada | `CardRemovedEvent` |
| Tarjeta escaneada | `CardScannedEvent` |
| Creación de la empresa | `CompanyCreatedEvent` |
| Eliminar una empresa | `CompanyRemovedEvent` |
| Cupón Canjeado | `CouponRedeemedEvent` |
| Cliente creado | `CustomerCreatedEvent` |
| Referencia agregada | `CustomerReferralCreatedEvent` |
| Transición del cliente al nuevo segmento RFM | `CustomerSegmentLinkedEvent` |
| Revisión enviada | `FeedbackCreatedEvent` |
| Creación de un gerente | `ManagerCreatedEvent` |
| Eliminar a un gerente | `ManagerRemovedEvent` |
| Finalización no exitosa del pago | `PaymentCompletedFailedEvent` |
| Éxito de finalización del pago | `PaymentCompletedSuccessfulEvent` |
| Pago devuelto | `PaymentRefundedEvent` |
| La finalización no exitosa de un pago de recurrencia | `RecurrentPaymentCompletedFailedEvent` |
| Creación de pago para la tarifa | `TariffPaymentCreatedEvent` |
| Activación de plantilla | `UserTemplateActivatedEvent` |
| Creando una plantilla | `UserTemplateCreatedEvent` |
| Desactivando una plantilla | `UserTemplateDeactivatedEvent` |
| Eliminar una plantilla | `UserTemplateRemovedEvent` |
| Actualizar una plantilla | `UserTemplateUpdatedEvent` |

24 eventos confirmados en total (puede haber alguno más entre el corte de "Creación de la empresa" al
final de la captura 1 y su reaparición completa al inicio de la captura 2 — se solapan sin pérdida
aparente; igual solapan `RecurrentPaymentCompletedFailedEvent` y `TariffPaymentCreatedEvent` entre
capturas 3 y 4, confirmando que no falta ninguno entre esos dos tramos).

Dato relevante para el cruce con RFM: el evento **`CustomerSegmentLinkedEvent`** ("Transición del cliente
al nuevo segmento RFM") confirma que la segmentación de la sección 4 SÍ dispara automatización — cuando un
cliente cambia de segmento RFM, se puede notificar a un sistema externo.

Cruce con lo nuestro: no tenemos webhooks de salida configurables por el dueño del tenant en absoluto.
`docs/API_DOCS.md` y `docs/features/delivery-webhook.md` describen únicamente webhooks de **entrada**
(`/api/webhook/delivery`, `/api/webhook/twilio-incoming`, `/api/webhook/zernio`) protegidos por secreto
compartido o firma HMAC — el flujo inverso (nosotros avisando a un tercero) no existe como funcionalidad
de producto; lo más cercano es el disparo puntual y no configurable a n8n para Google Contacts
(`google-contacts-sync.service.ts`, fire-and-forget, sin URL configurable por el dueño ni catálogo de
eventos).

---

## Tabla de síntesis

| Qué hace la competencia | Cómo se ve | Qué tenemos nosotros | Brecha | ¿Vale la pena? |
|---|---|---|---|---|
| Perfil de usuario (idioma, zona horaria, moneda, formato de fecha) separado del perfil del negocio | Formulario de 2 columnas + avatar | No existe — solo `tenants.config` de branding | Total: no hay concepto de "usuario admin" con preferencias propias | **IGNORAR** — nuestro modelo es un dueño = un tenant; no hay multi-usuario con preferencias regionales distintas documentado en ningún §. |
| Pantalla "Sobre nosotros" (dirección física, redes sociales del negocio) | Tabla de datos de solo lectura aparente | Disperso en `tenants.config`, sin pantalla dedicada | Media: dato que podría ya existir pero sin UI propia | **ADAPTAR** si el dueño quiere una pantalla de perfil de negocio unificada — bajo esfuerzo, sin tocar arquitectura. |
| Marketplace de integraciones POS (GloriaFood, Square, Shopify POS) con clave API propia | Tarjetas con botón "Instalar", banner "contáctenos" | Nada — nuestro único ingreso automatizado es WhatsApp (domicilios) y QR | Total | **IGNORAR por ahora** — no hay evidencia en §1-§25 de que el dueño pida integrar POS; es una categoría de producto distinta (fidelización vs. omnicanalidad de canales). Si en el futuro se pide, es una feature nueva grande, no un ajuste. |
| Canales de notificación adicionales (SMS propio, email vía Mailgun/SMTP, Messenger, Telegram) con credenciales BYO | Grilla de 6 tarjetas, "Conectar Cuenta" | Solo WhatsApp (Twilio o Zernio, uno por tenant, no BYO) | Alta: cero canales fuera de WhatsApp | **ADAPTAR parcialmente** — un canal de email transaccional (ej. recibo o bienvenida) podría tener valor, pero email no está en ningún § del requerimiento; no inventar sin decisión del dueño. |
| Informe de estadísticas semanal al dueño (email / Telegram) | Dos checkboxes con nota de requisito | No existe ningún resumen periódico automático | Total | **COPIAR** — bajo costo relativo (ya tenemos KPIs calculados en `dashboard/campaigns` y datos de `message_logs`; falta solo el disparo periódico y el canal). Encaja con el espíritu de §16 (pipeline/fatiga) y con el interés declarado del dueño en visibilidad operativa. Sujeto a que el dueño lo priorice — no está en ningún § actual. |
| Notificaciones transaccionales al cliente final, on/off | Un checkbox simple | Tenemos el equivalente funcional en WhatsApp (`message_class_map` clase `transactional`, P0), pero sin panel de encendido/apagado expuesto al dueño | Baja-media: el motor ya existe, falta el control expuesto | **YA LO TENEMOS MEJOR** en motor (presupuesto de línea, reservas atómicas, clases con prioridad — ver `docs/features/send-governance.md`) — lo que falta es solo la superficie de UI, no lógica. |
| Segmentación RFM configurable (Frecuencia × Frescura, 9 segmentos con rangos editables) | 9 tarjetas con 4 inputs numéricos + Guardar por tarjeta | No existe. Tenemos reglas de un solo eje (`REACTIVATION_DAYS`, `RECOVERY_ZONE_*`, `POWER_RANKS`) hardcodeadas en constantes | Alta: sin matriz configurable, sin eje de Monto tampoco en la competencia | **ADAPTAR** — la idea de segmentos con nombre persistente por cliente (Campeones, En riesgo, Dormido...) mejora la comunicación con el dueño frente a nuestros umbrales invisibles en código; implementar como extensión de `campaign.service.ts`/`reward-tiers.service.ts`, no reemplazo. Requiere decisión del dueño (no está en §1-§25) y no resuelve la falta del eje Monto, que tampoco tiene la competencia. |
| Webhooks de salida configurables (24 eventos, URL propia, toggle activo/inactivo) | Modal con checklist scrollable + input URL | No existe — solo webhooks de entrada | Total | **ADAPTAR con cautela** — útil para integraciones futuras (BI externo, CRM del dueño), pero antes hay que decidir qué eventos de negocio emitir (visita, redención, tier desbloqueado son los candidatos naturales, análogos a `CardScannedEvent`/`CouponRedeemedEvent`/`CustomerCreatedEvent`). No urgente: no está en ningún § y el AIOS Constelarys ya cubre la integración externa que sí se decidió construir (`docs/features/zernio-messaging.md` §"Contrato con el AIOS"). |
| Doble proveedor de mensajería por tenant (Twilio / Zernio), elegido al aprovisionar | — (no es pantalla de configuración del dueño, es interno) | Ya lo tenemos, con arquitectura más robusta: choke-point único (`sendTemplateMessage()`), invariantes de seguridad, gobernanza de envío con reserva atómica | — | **YA LO TENEMOS MEJOR** — la competencia no expone gobernanza de presupuesto de línea ni reservas atómicas en las capturas vistas; nuestro `send-governance.md` (Bloque 1-2 hecho) es más sofisticado que un simple "conectar cuenta". |

---

## No legible

- `Benchmarking para CADA1/Configuraciones/Integraciones/Captura de pantalla 2026-09-05 005758.png`:
  la lista de "Configuración de aplicaciones" está cortada en "Shopify POS" — no se puede confirmar si hay
  más integraciones debajo (`[no legible]`).
- `Benchmarking para CADA1/Configuraciones/Webhooks/Captura de pantalla 2026-09-05 005833.png` (la fila de
  tags grises "SANDBOX" repetidos en el borde superior de la captura de Servicios): función exacta de ese
  elemento **no confirmada** — `[se intuye, sin confirmar]` que es un artefacto de captura o un badge de
  modo ambiente mal renderizado.
- Encabezado "CONTACIÓN DE EVENTOS" en `Captura de pantalla 2026-09-05 005951.png`: transcrito literal;
  probable error tipográfico del original (`[se intuye, sin confirmar]` la palabra correcta).
- Hex de colores de marca: aproximados a partir de la captura comprimida, no verificados contra CSS real
  (`[se intuye, sin confirmar]`).
