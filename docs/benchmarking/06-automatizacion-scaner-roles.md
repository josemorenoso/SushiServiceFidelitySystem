# Benchmarking — Automatización, App Scáner, Gerente, CEO Push, Base de Clientes

> Lote de 8 capturas de un competidor (marca visible: **NOVU**, `app.novuapp.ai`). Documento solo
> descriptivo — no se toca código. Citas con ruta de archivo entre backticks.

---

## 1. Automatización

### 1.1 Bandeja de conversaciones

`Benchmarking para CADA1/Automatización/Captura de pantalla 2026-09-05 005507.png`

- **Qué hace:** bandeja de mensajería tipo inbox, con carpetas "Tus conversaciones", "Favoritos",
  "Enviado", "Recibió", "Abrió", "No leído", "Respondió" — cada una con contador (todas en `0`).
  Tres columnas: lista de carpetas, lista de conversaciones, panel de detalle.
- **Cómo se ve:** franja superior naranja (~`#E8622C`, aproximado) a todo el ancho. Fondo blanco,
  texto gris oscuro, links activos en azul ("Tus conversaciones", "Enviado"). Iconografía lineal
  gris (sobres, estrella, flechas). Tipografía sans-serif estándar.
- **Textos literales:** "Bandeja de entr…" (recortado, probablemente "Bandeja de entrada"), "Tus
  conversaciones", "Favoritos", "Enviado", "Recibió", "Abrió", "No leído", "Respondió", "Sin
  conversaciones", "Seleccionar conversación", "Sin detalles".
- **Estado vacío:** las tres columnas muestran estado vacío con icono de globo de chat y texto
  explicativo — no hay datos de ejemplo cargados.
- **Ambigüedad:** esta pantalla no muestra ningún elemento de "automatización" en sí (reglas,
  disparadores). Está en la carpeta que nos dieron como "Automatización", pero funcionalmente es un
  **inbox de conversaciones** (probablemente de WhatsApp/mensajería del mismo panel). `[se intuye,
  sin confirmar]` que se relaciona con automatización porque las respuestas automáticas aparecerían
  acá como conversaciones.

### 1.2 Constructor visual de automatización

`Benchmarking para CADA1/Automatización/Captura de pantalla 2026-09-05 005546.png`

- **Qué hace:** editor visual (canvas con grilla de puntos, zoom `+`/`-`/`100%`) para armar un flujo
  de automatización. Un nodo inicial trae el nombre de la automatización ("Luis Moreno" — dato de
  prueba del usuario, no un texto de producto) y un nodo "Generar" con la instrucción "Seleccione el
  disparador que desencadena la automatización" y un botón "Seleccionar disparador".
- **Cómo se ve:** fondo blanco con grilla de puntos gris claro (estética tipo n8n/Zapier/Make).
  Tarjetas blancas con sombra suave y borde redondeado. Acento naranja (~`#E8622C`) en el botón
  primario. Sidebar izquierda oscura angosta con iconos: casa, recibo/documento, regalo (badge
  naranja "0" + etiqueta verde "NEW"), personas, chat, persona con "+" (resaltado en naranja =
  sección activa), pin de ubicación, persona, engranaje. Arriba a la derecha: icono de "play"
  (▶, probablemente ejecutar/previsualizar) y botón "atrás".
- **Textos literales:** "Generar", "Seleccione el disparador que desencadena la automatización",
  "Seleccionar disparador", "atrás", "100%".
- **Campos:** un input de texto libre (nombre de la automatización) + el nodo "Generar" con su único
  campo de acción: elegir disparador.

### 1.3 Selector de disparador

`Benchmarking para CADA1/Automatización/Captura de pantalla 2026-09-05 005556.png`

- **Qué hace:** lista desplegable de tipos de disparador para la automatización.
- **Cómo se ve:** tres filas blancas apiladas, separadas por línea gris fina, cada una con texto a
  la izquierda y chevron `>` a la derecha (patrón de navegación a submenú).
- **Textos literales:** "Bonos que expiran", "Manual", "Programado".
- **Campos/opciones visibles:** exactamente esas tres opciones de disparador. No se ve contenido de
  cada una (submenú no capturado).

---

## 2. App Scáner

Marca del producto: **NOVU** (`app.novuapp.ai/scan`), app web (PWA) para el mesero.

### 2.1 Pantalla de escaneo / acumulación

`Benchmarking para CADA1/App Scaner/Screenshot_20260905_011539_Chrome.jpg`

- **Qué hace:** tras escanear el QR del cliente, muestra su tarjeta de sellos y permite acumular
  sellos ingresando el monto de la compra, o cambiar a la pestaña de canje.
- **Cómo se ve:** header naranja (~`#E8622C`) con logo "NOVU" centrado, icono de cámara a la
  izquierda, menú hamburguesa a la derecha. Debajo, "Cliente:" en gris + nombre en negro grande
  ("Molun Store" — cuenta de prueba propia del usuario). Imagen de tarjeta de sellos: foto de comida
  de fondo con 10 círculos blancos con icono de cubiertos (tenedor/cuchillo), en dos filas de 5.
  Selector tipo tab "Acumular" (activo, blanco) / "Canjear" (inactivo, gris). Recuadro gris con
  número grande "12,22" y leyenda "Ingrese el monto de la compra, USD" — es un input numérico.
  Botón ancho naranja "Acumular Sellos".
- **Textos literales:** "Cliente:", "Molun Store", "Acumular", "Canjear", "Ingrese el monto de la
  compra, USD", "Acumular Sellos", "Información del cliente" (título de la sección siguiente,
  cortado al pie).
- **Campos y opciones:** toggle Acumular/Canjear, input numérico de monto en USD, botón de
  confirmación. El proceso de sumar recompensa está atado a un **monto de compra**, no a la sola
  visita.
- **Dato sensible:** la captura expone el correo real del usuario (`molun.store1@gmail.com`) en la
  siguiente pantalla — es su propia cuenta de prueba, no de un tercero.

### 2.2 Información del cliente y de la tarjeta

`Benchmarking para CADA1/App Scaner/Screenshot_20260905_011550_Chrome.jpg`

- **Qué hace:** ficha de detalle del cliente escaneado, con sus datos personales y el estado de su
  tarjeta de fidelidad.
- **Cómo se ve:** mismo header naranja NOVU. Dos bloques con títulos en negro bold ("Información del
  cliente", "Información de la tarjeta") y filas etiqueta-valor separadas por líneas grises finas,
  etiqueta a la izquierda en gris, valor a la derecha en negro.
- **Textos literales / campos, uno por uno:**
  - Información del cliente: `"Nombre"` → Molun, `Apellido` → Store, `Teléfono` → 573011568923,
    `Correo electrónico` → molun.store1@gmail.com, `Fecha de nacimiento` → 2009-02-21.
  - Información de la tarjeta: `Sellos activos:` → 0, `Recompensas disponibles:` → 0, `Última
    recompensa recibida:` → "-", `Última acumulación:` → "-", `Fecha de vencimiento de la tarjeta:`
    → "-", `Fecha de instalación de la tarjeta:` → 05-09-2026, `Número de serie:` → 873710-630-138,
    `Aplicación:` → PWA.
- **Nota de diseño:** el competidor emite un **número de serie** por tarjeta instalada y registra
  qué tipo de app la instaló (PWA). No se ve paginación ni más campos debajo (corte de pantalla).

---

## 3. Gerente

`Benchmarking para CADA1/Gerente/Captura de pantalla 2026-09-05 005655.png`

- **Qué hace:** modal "Agregar gerente" sobre la pantalla de listado "Gerentes" — alta de un usuario
  administrador secundario con acceso a una sede.
- **Cómo se ve:** fondo de la pantalla de listado atenuado (overlay gris semitransparente) detrás
  del modal blanco centrado, con sombra y esquinas redondeadas. Misma sidebar oscura de iconos que
  en 1.2, con el icono de "persona con check" resaltado en naranja (sección activa = Gerentes).
  Botones superiores de la pantalla de fondo: "Aplicación de escáner" (link azul subrayado),
  "Descargar informe", "Agregar gerente" (naranja, el que abre el modal). Buscador con lupa. Tabla
  con columnas NOMBRE DE USUARIO, FECHA DE CREACIÓN, [UBI]CACIÓN (cortada), ESTADO — vacía ("Mostrar
  0 desde 0 usuarios").
- **Textos literales del modal:** "Agregar gerente" (título), "Nombre completo", "Correo
  electrónico", selector de código de país "ES" + "+34", "La contraseña debe contener al menos 6
  caracteres", "Contraseña", "Repita la contraseña", "Seleccione su ubicación", "Notas", "Enviar
  acceso al correo electrónico" (con toggle activado, verde), botones "Agregar gerente" (naranja) /
  "Cancelar".
- **Campos, uno por uno:** Nombre completo* (obligatorio, marcado con `*`), Correo electrónico*,
  código de país + Teléfono*, Contraseña* (con icono de mostrar/ocultar), Repita la contraseña*,
  Ubicación (dropdown, para asignar sede), Notas (textarea libre), toggle de envío de acceso por
  correo.
- **Iconografía:** ojo tachado para mostrar/ocultar contraseña, flecha hacia abajo en el selector de
  ubicación, "X" para cerrar el modal.

---

## 4. CEO Push

`Benchmarking para CADA1/CEO push/Captura de pantalla 2026-09-05 005629.png`

- **Qué hace:** configuración de notificaciones push por geolocalización ("Geo-Push"): el cliente
  con la app/tarjeta instalada recibe un mensaje en la pantalla de bloqueo al entrar en un radio
  físico alrededor de una ubicación del restaurante.
- **Cómo se ve:** misma sidebar oscura, ahora con el icono de pin de ubicación resaltado en naranja.
  Columna izquierda: título "Ubicación" + badge azul redondeado "Geo-empush en área de 100 metros
  (330 pies)", texto explicativo en gris, botón ancho naranja "Añade una ubicación". Columna
  derecha: mockup de un teléfono (contorno negro) con un badge verde "● Tarjeta activada" arriba, y
  dentro de la pantalla del mockup una notificación de bloqueo simulada: título bold "NOMBRE DE
  EMPRESA" + "ahora" a la derecha, cuerpo "Vista previa de nuestro servicio de Mensajes Push en el
  lado lateral con emojies 🍜 🍜 🍕🍔" (emojis de comida renderizados). Debajo del mockup, en azul:
  "Geo-Push disponible solo para dispositivos iOS".
- **Textos literales:** "Ubicación", "Geo-empush en área de 100 metros (330 pies)", "En su plan
  disponibles 10 ubicaciones. En el radio de 330 pies de la ubicación, los usuarios pueden ver su
  mensaje Geo-Push en la pantalla de bloqueo.", "Añade una ubicación", "Tarjeta activada", "NOMBRE
  DE EMPRESA", "ahora", "Vista previa de nuestro servicio de Mensajes Push en el lado lateral con
  emojies 🍜 🍜 🍕🍔", "Geo-Push disponible solo para dispositivos iOS".
- **Restricción de plataforma declarada por el propio competidor:** Geo-Push solo funciona en iOS.
- **Nombre de carpeta vs. contenido:** la carpeta se llama "CEO push" pero la pantalla no distingue
  ningún rol "CEO" — es la configuración general de Geo-Push dentro del mismo panel de administrador
  (mismo sidebar que Gerente). `[se intuye, sin confirmar]` que el nombre de carpeta es una etiqueta
  propia de quien tomó la captura (el push como herramienta que le importa al dueño/CEO), no un rol
  del producto.

---

## 5. Base de clientes

`Benchmarking para CADA1/Base de clientes/Captura de pantalla 2026-09-05 005421.png`

- **Qué hace:** listado/CRM de clientes con métricas resumen, filtros guardados/segmentos y tabla
  detallada por cliente.
- **Cómo se ve:** título "Base de clientes" + tres botones a la derecha ("Exportar", "Importar",
  "Agregar clientes" en naranja). Debajo, cuatro tarjetas KPI en una fila: número grande + etiqueta
  chica gris. Debajo, una fila de chips/filtros rápidos con icono cada uno. Debajo, un dropdown
  "Acciones" + buscador. Tabla con encabezados en mayúscula gris y una sola fila de datos de
  ejemplo.
- **Textos literales — KPIs:** "1 / Total de los clientes", "1 / Tarjetas instaladas", "2 /
  Transacciones con tarjetas", "☆☆☆☆☆ / Calificación de Comentarios" (5 estrellas vacías, sin
  puntaje).
- **Textos literales — chips de filtro:** "▽ Mis filtros", "Mis segmentos", "♡ Saludable", "🏷
  Lealtad", "⚡ Rfm-segmentos", "Comunicación", además de un `+` (agregar filtro) y un ícono de
  engranaje (configurar columnas, se intuye).
- **Columnas de la tabla, una por una:** NOMBRE DE USUARIO, FECHA DE CREACIÓN (con flecha de orden),
  FECHA DE NACIMIENTO, TELÉFONO, CALIFICACIÓN DE COMENTARIOS, UTM, DISPOSITIVO, TARJETAS DE
  CLIENTES, SEGMENTO, CAMPOS PERSONALIZADOS.
- **Fila de ejemplo:** avatar circular negro con iniciales "KB", nombre "K Bs", fecha de creación
  "05-09-2026 05:53", fecha de nacimiento "12-02-2001", teléfono "+573133313131", calificación
  vacía, UTM = etiqueta "qr", Dispositivo = etiqueta "Coogle Pay" `[no legible — probable error de
  captura/OCR, se lee "Coogle" con C, posiblemente "Google Pay"]`, Tarjetas de clientes = etiqueta
  "Tarjeta de sello Nº 1", Segmento = vacío, Campos personalizados = link "Detalles".
  - Nota: el teléfono de la fila de ejemplo es un número de prueba distinto al de la cuenta usada en
    App Scáner (2.2) — son dos clientes de prueba distintos, no la misma persona.
- **Paginación:** "Mostrar 10 / 20 / 50 / 100", "Mostrando 1 desde 1 usuarios".
- **Colores:** blanco de fondo, texto negro/gris, acento naranja en el botón primario y en algunos
  chips activos, mismo naranja (~`#E8622C`) consistente con el resto del panel.

---

## Cruce contra lo nuestro

### Automatización

Docs leídos: `docs/features/campaigns.md`, `docs/features/send-governance.md`.

Nosotros **sí automatizamos** (cumpleaños, reactivación, recordatorio de premio, eventos de
calendario, drenado de cola de envíos — `docs/features/campaigns.md`, `docs/features/send-governance.md`),
pero todo vive en **crons de servidor fijos en código** (`src/app/api/cron/*`), configurables solo
en parámetros puntuales (`admin_settings`: días de reactivación, límites de reserva). **No existe un
constructor visual de automatizaciones** donde el propio dueño arme "cuando pase X, hacer Y" sin
tocar código. El disparador "Bonos que expiran" del competidor no tiene equivalente directo: lo más
cercano es `reward-reminder` (recordatorio de premio por vencer), que es un cron fijo, no una regla
autoservicio.

### App Scáner

Docs leídos: `docs/features/staff-qr-scan.md`, `docs/features/qr-checkin.md`, y
`docs/ESTADO-REQUERIMIENTOS.md` §19 (Escáner QR de meseros).

Diferencias de modelo:
- **Unidad de recompensa:** Novu trabaja con **sellos por monto de compra** (ingresás el monto en
  USD y acumulás sellos hacia una tarjeta de 10). Nosotros trabajamos con **puntos por visita**
  (cantidad aleatoria por visita, tiers acumulativos Bronce/Plata/Oro/BLACK) — no hay paso de
  ingresar un monto de compra en el flujo de escaneo (`docs/features/staff-qr-scan.md` Paso 3).
- **Acumular vs. Canjear como toggle en la misma pantalla de escaneo:** Novu lo resuelve en una sola
  pantalla con tabs. Nosotros separamos: el escaneo del mesero solo registra visita/puntos
  (`/mesero/scan` → `/mesero/confirm`); la redención de premios es otro flujo
  (`docs/features/reward-grants.md` / `redemption-tracking.md`, no leídos en detalle en este lote).
- **Coincidencia fuerte con nuestra propia decisión de producto:** el §19 de
  `docs/ESTADO-REQUERIMIENTOS.md` (cerrado por el dueño el 2026-09-05) pide exactamente el modelo
  que Novu ya tiene en producción: **el aparato es del restaurante** (no de un mesero con login
  propio), **el mesero se elige en cada operación** (para trackear eficiencia), y **el PIN protege
  solo la redención**, no el escaneo/acumulación. Hoy nuestro sistema es al revés: el dispositivo o
  el login pertenece a un mesero (`staff_devices.staff_user_id`, `staff_users.phone` obligatorio) —
  es exactamente lo que §19 pide invertir. Ver el choque documentado con D11
  (`staff_users_phone_tenant_key`) en el mismo §19.
- **Datos de tarjeta que ellos exponen y nosotros no mostramos en el scanner:** número de serie de
  tarjeta, fecha de instalación, tipo de app (PWA). Nuestro modelo no emite "tarjetas" con número de
  serie — la identidad del cliente es su teléfono.

### Gerente

Docs leídos: `docs/features/dashboard.md`, `docs/features/staff-dashboard-frontend.md` (no
encontrado con ese nombre exacto — se usó `dashboard.md`), `docs/ESTADO-REQUERIMIENTOS.md`.

**No tenemos equivalente.** Nuestro dashboard tiene **un solo usuario admin** por tenant, autenticado
con Supabase Auth (email/password fijo, `docs/features/dashboard.md` sección Autenticación) — no hay
alta de gerentes ni de usuarios secundarios del panel con su propio login y sede asignada. Lo más
cercano que existe es `staff_users` (meseros con PIN, rol `waiter | supervisor | admin` en el
schema — `docs/features/staff-qr-scan.md`), pero esos usuarios son para la **app de escaneo**
(`/mesero`), no para entrar al dashboard administrativo. Confirmado también por `graphify query
"roles gerente panel permisos"`: no aparece ningún nodo de "gerente" ni de roles multiusuario del
panel — solo resultados sobre permisos de sede (F7/D10, selector de ubicación) y el schema de
`staff_users`, que son cosas distintas.

### CEO push

Docs leídos: `docs/features/dashboard.md`, `docs/ESTADO-REQUERIMIENTOS.md`.

**No tenemos nada de esto.** `docs/ESTADO-REQUERIMIENTOS.md` §9 dice textual: *"Notificaciones Push
(FCM) — NO EMPEZADO — Cero infraestructura (sin firebase/vapid/fcm en `src/`)"*. Novu va todavía más
allá de un push simple: ofrece **Geo-Push** (push por proximidad geográfica a una sede, límite de 10
ubicaciones en su plan, restringido a iOS). Nuestro canal de reactivación por cercanía/inactividad
hoy es 100% WhatsApp (`docs/features/campaigns.md`), no push ni geolocalizado. Brecha total, y no es
menor: activar esto exigiría entrar a `docs/ESTADO-REQUERIMIENTOS.md` §9 desde cero (infraestructura
FCM/APNs) más una capa de geofencing que hoy no existe en ningún lado del código.

### Base de clientes

Docs leídos: `docs/ESTADO-REQUERIMIENTOS.md`, y lectura directa de
`src/app/(dashboard)/dashboard/customers/page.tsx` (no hay doc de feature dedicado a "CRM/listado de
clientes" — se buscó y no existe `docs/features/customers.md` ni similar).

`graphify query "listado de clientes CRM base de clientes filtros segmentos RFM"` no devolvió ningún
nodo de código o doc con segmentación RFM ni "segmentos guardados" — solo nodos conceptuales del
producto en general (CRM, puntos, mystery box). Confirma que **no existe RFM en el repo**.

Nuestro `/dashboard/customers` (leído directo) sí tiene: búsqueda por nombre/teléfono, filtro por
tier, por fuente (`sourceFilter`) y por estado, exportar CSV, importar CSV, y la sección Black
arriba (`BlackTierSection`). **Lo que Novu tiene y nosotros no:**
- **Segmentos guardados / "Mis filtros"**: filtros reutilizables nombrados por el usuario. Nosotros
  solo tenemos filtros de sesión (tier/fuente/estado), no guardables.
- **RFM (Recency-Frequency-Monetary) como segmentación nativa** ("Rfm-segmentos"): no existe en
  nuestro schema ni en servicios (`campaign.service.ts` filtra por días sin venir y edad, pero no
  computa un score RFM ni lo expone como filtro).
- **Calificación de comentarios (reviews) integrada a la fila del cliente**: nosotros tenemos el
  flujo de reseñas de Google (`review-flow.md`, no leído en detalle en este lote) pero no aparece
  como columna en la tabla de clientes.
- **Columna "Dispositivo" / "UTM" por cliente**: no tenemos tracking de canal de adquisición a nivel
  de fila de cliente (sí tenemos `source` para visitas/campañas, pero no UTM ni dispositivo de
  instalación).
- **"Campos personalizados"**: no existe la noción de campo custom por tenant en `customers`.

---

## Síntesis

| Qué hace la competencia | Cómo se ve | Qué tenemos nosotros | Brecha | ¿Vale la pena? |
|---|---|---|---|---|
| Constructor visual de automatizaciones (disparador → acción) | Canvas con grilla de puntos, nodos, zoom, disparadores: Bonos que expiran / Manual / Programado | Crons fijos en código (`birthday`, `reactivation`, `reward-reminder`, `calendar-dispatch`, `queue-drain`) | Total: no hay autoservicio, todo cambio de regla es código + deploy | **IGNORAR** por ahora — es una reconstrucción de producto grande (motor de reglas + UI de flujo); no hay evidencia en `ESTADO-REQUERIMIENTOS.md` de que el dueño lo haya pedido |
| Inbox de conversaciones con carpetas (favoritos, enviado, abrió, no leído, respondió) | Tres columnas, estados vacíos con icono | No existe bandeja de conversaciones en el dashboard; el estado de mensajes vive en `message_logs` sin UI de inbox | Media: tenemos el dato (`message_logs`), no la UI de bandeja | **ADAPTAR** — una vista de solo-lectura sobre `message_logs` con esos mismos filtros (enviado/abrió/respondió) sería barata si el dato de "abrió" ya existe (verificar antes) |
| App de escaneo: dispositivo del restaurante, mesero se elige por operación, PIN solo para redimir | PWA con header de marca, toggle Acumular/Canjear, monto de compra | `staff_qr_scan`: dispositivo/login por mesero, sin selección de mesero por operación, sin distinción Acumular/Canjear | Coincide con nuestro propio §19 ya decidido por el dueño (2026-09-05) | **COPIAR** — literalmente es el modelo que el dueño ya aprobó para §19; usar esta captura como referencia visual del flujo al escribir el spec |
| Acumulación atada a monto de compra (sellos por USD gastado) | Input numérico "Ingrese el monto de la compra, USD" | Puntos por visita, aleatorios, sin relación con el monto gastado | El dueño no pidió esto; nuestro modelo es a propósito "sin pesos" en premios (CLAUDE.md: "Ningún premio tiene precio") | **IGNORAR** — choca con una regla de dominio explícita del proyecto |
| Ficha de cliente con número de serie de tarjeta, fecha de instalación, tipo de app | Lista etiqueta-valor | No emitimos "tarjetas" con serie; identidad = teléfono | No aplica directo — modelos de producto distintos (ellos con wallet-pass físico/serial, nosotros con teléfono) | **IGNORAR** |
| Alta de gerentes/usuarios secundarios del panel, con sede asignada y envío de acceso por correo | Modal con nombre, correo, teléfono con código de país, contraseña, ubicación, notas, toggle de envío | Un solo admin por tenant (Supabase Auth); `staff_users` es para meseros, no para el dashboard | Total: no hay multiusuario de panel | **ADAPTAR** — no se puede juzgar el esfuerzo sin decisión previa del dueño sobre si quiere multiusuario de dashboard (hoy no está en ningún §; no evaluar sin preguntar) |
| Geo-Push (notificación en pantalla de bloqueo por proximidad a una sede, solo iOS) | Badge de radio en metros, mockup de notificación, límite de ubicaciones por plan | Nada — `docs/ESTADO-REQUERIMIENTOS.md` §9: "Cero infraestructura (sin firebase/vapid/fcm)" | Total, y de las más caras: exige FCM/APNs + geofencing, dos capas nuevas | **IGNORAR** por ahora — §9 ya está catalogado como NO EMPEZADO y de baja prioridad (no bloquea deploy); requiere decisión explícita del dueño antes de dimensionar |
| Filtros guardados / "Mis segmentos" reutilizables | Chips en la barra de filtros | Filtros de sesión (tier/fuente/estado), no guardables | Media: la UI de filtros ya existe, falta persistirlos | **ADAPTAR** — guardar combinaciones de filtro por tenant es incremento chico sobre lo que ya hay en `customers/page.tsx` |
| Segmentación RFM nativa | Chip "Rfm-segmentos" | No existe cálculo RFM en ningún servicio | Total: no hay score RFM en el schema | No se puede juzgar el esfuerzo sin ver el estándar RFM que el dueño querría (recency/frequency/monetary con "monetary" chocando otra vez con la regla "premios sin precio") — **no evaluar sin preguntar** |
| Calificación de comentarios como columna del cliente | Estrellas vacías en la tabla | Reseñas de Google existen (`review-flow.md`) pero no como columna en `/dashboard/customers` | Baja: es una columna más sobre datos que ya se recolectan (a confirmar en `review-flow.md`, no leído en este lote) | **ADAPTAR** — sujeto a confirmar que el dato ya está disponible por cliente |
| Exportar / Importar clientes (CSV) | Botones "Exportar", "Importar", "Agregar clientes" | Ya tenemos Exportar CSV e Importar CSV en `/dashboard/customers/page.tsx` | Ninguna | **YA LO TENEMOS MEJOR** — mismo alcance, sin brecha visible |

## No legible

- `Benchmarking para CADA1/Base de clientes/Captura de pantalla 2026-09-05 005421.png` — la etiqueta
  de la columna "Dispositivo" en la fila de ejemplo se lee "Coogle Pay" (con C); no se pudo
  confirmar si es un error de la captura/render o el texto real de la plataforma. Se documentó
  literal, marcado `[no legible]` sobre la ortografía exacta.
