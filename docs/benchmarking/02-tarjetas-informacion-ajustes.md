# Benchmarking — Tarjetas: Información y Ajustes

> Competencia: herramienta de tarjetas de fidelidad tipo Apple Wallet / Google Wallet.
> Se identifica por el pie de la vista previa: **"Creado por: Novu App"**
> (`Benchmarking para CADA1/Tarjetas/Diseño/Ajustes/Captura de pantalla 2026-09-05 004645.png`).
> Lote: 4 capturas de "Información" + 16 de "Ajustes" = 20 imágenes, todas procesadas.

Contra nuestro código se cruzó: `docs/features/wallet-card.md`, `docs/features/design-system.md`,
`docs/ESTADO-REQUERIMIENTOS.md` y `graphify query`. Se leyó además `src/lib/branding.ts` para
verificar qué campos de marca existen hoy en el modelo (no solo en el doc).

---

## 1. Información

Panel de dos columnas: formulario a la izquierda, vista previa de un celular a la derecha con
botones de instalación (Apple Wallet, Google Wallet/Android, y un tercero tipo mensaje/enlace) a un
costado. La vista previa se actualiza en vivo con lo que se tipea. Arriba del celular, un pill
"Tarjeta inactiva" (punto rojo). Debajo del celular: "Activar" (botón gris/deshabilitado) y el aviso
"No se pueden emitir más de 10 tarjetas antes de que la plantilla de tarjetas no se active."

### Pantalla 1 — Campos base de la tarjeta
`Benchmarking para CADA1/Tarjetas/Diseño/Información/Captura de pantalla 2026-09-05 005119.png`

Qué hace: define los textos que el cliente ve en la tarjeta digital instalada (portada + reverso).

Campos, en orden, cada uno con icono de ayuda `(i)` y placeholder-ejemplo dentro del input:
- **Descripción de la tarjeta** — ej. cargado: "Obtén sellos para lograr recompensas". Es el título grande que se ve en el frente de la tarjeta (confirmado en la vista previa).
- **Cómo ganar un sello** — ej.: "Comprar cualquier cosa para obtener un sello".
- **Nombre de empresa** — placeholder "Nombre de empresa".
- **Descripción de la recompensa** — placeholder "Descripción de la recompensa".
- **Mensaje de sello ganado** — nota bajo la etiqueta: "Se requiere la etiqueta [#]". Valor: "¡Solo [#] para obtener tu recompensa!". Tiene selector de emoji y un ícono `</>` (variables/código).
- **Mensaje de recompensa ganada** — "¡Has ganado tu recompensa y te está esperando!".

Vista previa (celular): título grande centrado, luego lista compacta con label chico + valor: "Cómo ganar un sello", "Nombre de empresa", "Descripción de la recompensa", "Mensaje de sello ganado", "Mensaje de recompensa ganada", y más abajo "Número de sellos al emitir una tarjeta: Ejemplo: 100" y "Múltiples recompensas" (cortado, `[no legible]` el detalle final de esa fila).

Colores: fondo gris muy claro (`#f7f7f7` aprox.) en el panel de formulario, blanco puro en inputs, texto de placeholder en naranja/salmón claro. Botones de instalación: naranja sólido (Apple, aprox. `#E8630A`), gris claro (Android), gris claro (tercero). Tipografía sans-serif genérica (aspecto Inter/system-ui), sin diferenciación editorial.

### Pantalla 2 — Multi-recompensa y canje automático
`Benchmarking para CADA1/Tarjetas/Diseño/Información/Captura de pantalla 2026-09-05 005125.png`

- **Múltiples recompensas** — texto de ayuda: "Especificar, separando por comas, la cantidad del número de sellos recibidos que se acreditará a este premio. Si el campo se deja en blanco, la recompensa se acreditará cuando se alcance el número máximo de sellos." Input con placeholder "Ejemplo: 3,5,7".
- **¿Canjear recompensa automáticamente?** — radio Sí/No (No seleccionado por defecto en la captura). Ayuda: "Después de acumular el número requerido de sellos, la recompensa se canjeará automáticamente en la próxima visita".
- **Programa de referidos** — radio Activo/Inactivo (Activo seleccionado).
- **Obtenga una bonificación en el momento en que** — radio: "Primera visita / Tarjeta usada por un nuevo cliente" (seleccionado) / "Tarjeta que se emite a un nuevo cliente".
- **Conteo de sellos para referente** — selector numérico tipo stepper horizontal 0–10 (valor 1 marcado en negro).

### Pantalla 3 — Referidos (continuación) y enlaces
`Benchmarking para CADA1/Tarjetas/Diseño/Información/Captura de pantalla 2026-09-05 005130.png`

- **Conteo de sellos para el nuevo cliente** — mismo selector stepper 0–10 (valor 1). Ayuda: "Establecer el recuento de sellos, que el cliente gana para la instalación de tarjetas a través del programa de referencia".
- **Enlaces activos** `(i)` — tabla de una fila: columnas "Tipo" (select "Seleccione ti...", vacío), "Enlace" (input vacío), "Texto" (input vacío), icono de basura para borrar la fila. Botón ancho naranja **"Añadir enlace"**.
- **Enlaces de retroalimentación** `(i)` — "Agregue sus enlaces comerciales. Ayuda a recopilar comentarios de los clientes y aumentar su calificación." Botón naranja **"Añadir enlace"**.

### Pantalla 4 — Legal y emisor
`Benchmarking para CADA1/Tarjetas/Diseño/Información/Captura de pantalla 2026-09-05 005138.png`

- **Enlace para redirección después de la instalación de la tarjeta** — ayuda: "El usuario será redirigido a esta URL después de instalar la tarjeta (la configuración se aplica solo a las tarjetas instaladas en Apple Wallet)". Input tipo URL vacío.
- **Términos de Uso** `(i)` — con toggle activo (verde) para mostrarlos. Textarea con 6 puntos numerados, texto literal:
  1. Consigue 1 sello por cada compra que hagas.
  2. Acumula 10 sellos para obtener una recompensa.
  3. La validez de las tarjetas, sellos y premios es ilimitada.
  4. Los sellos y las recompensas no se pueden cambiar, devolver, reemplazar ni comprar con efectivo.
  5. Las tarjetas no se pueden transferir ni combinar con otras tarjetas.
  6. La empresa tiene derecho a rechazar los servicios.
- **Enlace a términos y condiciones completos (opcional)** `(i)` — placeholder: "Ingrese la dirección de URL del enlace a las reglas de uso del servicio en su sitio".
- **Información del emisor** `(i)` — tres campos: "Nombre de empresa", "Correo electrónico", teléfono con selector de país (bandera "ES" +34 en la captura).
- Botón final ancho naranja **"Finalizar"**.

---

## 2. Ajustes

Mismo layout de dos columnas (formulario + preview de celular). 16 capturas cubren, en orden, un
flujo largo de configuración operativa de la tarjeta de sellos. Se agrupa por sub-tema porque no hay
pestañas visibles (es scroll continuo de un solo panel "Ajustes").

### 2.1 Tipo de código y programa de recompensas (base)
`Benchmarking para CADA1/Tarjetas/Diseño/Ajustes/Captura de pantalla 2026-09-05 004645.png`

- **Tipo de código de barras** — radio: PDF 417 / QR Code (PDF417 seleccionado en la captura).
- **Programa de recompensas** — radio con descripción inline por opción:
  - "Sellos (Otorga sellos según tus reglas)" — seleccionado.
  - "Gasto (Otorgue sellos según el gasto del cliente.)"
  - "Productos (Entregar sellos en función de la mercancía contenida en el recibo)"
  - "Visita (Otorgue sellos en función de las visitas de los clientes.)"
- **¿Cómo quieres recompensar a tus clientes?** — ayuda: "Por ejemplo: obtiene una recompensa 10 US$." Botón ancho naranja **"Agregar recompensa"**.
- **Promociones** — botón ancho naranja **"Crear promoción"**.
- Vista previa: tarjeta de sellos con grid 2×5 de estrellas (2 rellenas de 10, negro/gris), texto "Tarjeta de sello Nº 1", footer "ACUMULA EN TUS VISITA..." "8 sellos" / "RECOMPENSAS DISPONIB..." "2 recompen...", y un código de barras PDF417 renderizado debajo con "Creado por: Novu App" al pie.

### 2.2 Detalle de recompensa (al presionar "Agregar recompensa")
`Benchmarking para CADA1/Tarjetas/Diseño/Ajustes/Captura de pantalla 2026-09-05 004706.png`

- **Nombre de la recompensa** — placeholder "Nombre del nivel de recompensa" (obligatorio, asterisco), ícono de basura para eliminar el bloque.
- **Tipo de recompensa** — select, valor mostrado "Orden (valor absolut)" `[texto de la UI de la competencia tal cual, con typo/truncado — parece "valor absoluto"]`.
- **Valor de recompensa** — input numérico con prefijo "$", valor ejemplo 10.00.

### 2.3 Modal "Crear promoción"
`Benchmarking para CADA1/Tarjetas/Diseño/Ajustes/Captura de pantalla 2026-09-05 004713.png`

Modal con dos tabs: **Configuración** (activa) / **Avance**. Campos:
- **Nombre** — obligatorio.
- **Descripción**.
- **Campos personalizados** — sección colapsable (chevron).
- **Notificaciones push** — sección colapsable (chevron).
- **Ajustes** — subtítulo, con:
  - **Imagen (960 × 252 px)** obligatoria — dropzone con botón naranja "Seleccione Archivo".
  - **Fecha desde** / **Fecha hasta** — date pickers, ambos obligatorios.
  - **Límite por miembro** / **Usos globales máximos** — inputs numéricos.
- Botones: **"Entregar"** (naranja) / **"Cancelar"** (blanco con borde).

### 2.4 Vigencia de tarjeta y de sellos
`Benchmarking para CADA1/Tarjetas/Diseño/Ajustes/Captura de pantalla 2026-09-05 004721.png` y `.../004729.png` y `.../004732.png`

- **Fecha de vencimiento de la tarjeta** `(i)` — radio: "Ilimitado" (seleccionado) / "Plazo definido" / "Plazo definido después de la emisión de la tarjeta".
- **Duración del sello** `(i)` — radio: "Ilimitado" (seleccionado) / "Plazo definido después de sellos ganados".
- Al elegir "Plazo definido...", aparece un tooltip **"Términos de la fecha de vencimiento del sello"** y dos selects: número (1) + unidad ("Días").

### 2.5 Ubicaciones e internacionalización
`Benchmarking para CADA1/Tarjetas/Diseño/Ajustes/Captura de pantalla 2026-09-05 004736.png` y `.../004741.png`

- **Ubicación** `(i)` — estado vacío: "Todavía no has creado ninguna ubicación" + botón naranja **"Añade una ubicación"**. (Esto sugiere que su multi-sede es opcional/plano y se agrega manualmente, no estructural como el nuestro.)
- **Idioma** — select, "Spanish (es)".
- **Formato de fecha** — select, "DD/MM/YYYY".
- **Separador de miles** — select, "Espacio".
- **Separador decimal** — select, "Coma".
- **Cantidad de compra al cobrar** — toggle (activo/verde): "Requiere que se especifique la cantidad de la compra al cargar".

### 2.6 Formulario de emisión de tarjeta (captura de datos del cliente)
`Benchmarking para CADA1/Tarjetas/Diseño/Ajustes/Captura de pantalla 2026-09-05 004753.png`

- **Comentar al acumular** — toggle (inactivo en captura): "Requiere un comentario al acreditar".
- **Formulario de emisión de tarjeta** `(i)` — tabla de campos configurable, columnas: "Tipo de campo" (select) / "Nombre del campo" (input) / "Requerido" (toggle) / "Único" (toggle) / basura.
  Filas precargadas: "Nombre" (Requerido ON), "Apellido" (Requerido ON), "Teléfono" (Único ON, Requerido OFF), "Correo electrónico" (Requerido ON), "Fecha de nacimiento" (Requerido ON).
  Botón ancho naranja **"Agregue campo"**.

### 2.7 UTM / atribución de enlaces
`Benchmarking para CADA1/Tarjetas/Diseño/Ajustes/Captura de pantalla 2026-09-05 004818.png`

- **UTM** `(i)` — ayuda: "Al crear un enlace UTM, puede especificar la cantidad de sellos/puntos de bienvenida que se otorgarán al emitir la tarjeta. También puede especificar la fecha de vencimiento de los sellos/puntos de bienvenida. Esta configuración tendrá prioridad sobre la configuración de la plantilla de la tarjeta."
- Campos: "Nombre de la fuente", "Número de sellos al emitir una tarjeta: 0", "Fecha de vencimiento de los sellos/puntos de bienvenida. Fecha de vencimiento actual de los sellos: 1 Días" (dos selects: Valor / Unidad), sección colapsable "Campos adicionales".
- Botón ancho naranja **"Añade un enlace con una etiqueta UTM"**.

### 2.8 Teléfono, privacidad y consentimiento
`Benchmarking para CADA1/Tarjetas/Diseño/Ajustes/Captura de pantalla 2026-09-05 004825.png`

- **Máscara telefónica** `(i)` — select de país, "Colombia" en la captura.
- **Política de privacidad** `(i)` — toggle activo. Textarea con texto literal: "Estoy de acuerdo en que mis datos personales se pueden usar y proporcionar para fines de marketing directo."
- **Consentimiento para el procesamiento de datos personales** `(i)` — toggle activo, sin textarea propia visible en esta fila (el texto está en el bloque de abajo).
- **Política de privacidad (texto completo)** — textarea con el mismo texto que arriba (repetido/duplicado en la captura — podría ser plantilla corta vs. plantilla larga, `[se intuye, sin confirmar]`).

### 2.9 Botones de instalación y límites operativos
`Benchmarking para CADA1/Tarjetas/Diseño/Ajustes/Captura de pantalla 2026-09-05 004833.png`, `.../004848.png`, `.../004852.png`

- **Botón de instalación de Google Wallet** — toggle activo: "Muestre el botón de pago de Google en el formulario de instalación de la tarjeta".
- **Botón de instalación de PWA** — toggle activo: "Mostrar el botón PWA en el formulario de instalación de la tarjeta".
- **Limite el número de tarjetas emitidas** — input numérico, ayuda "0 - Sin límites".
- **Instalación de la tarjeta mediante enlace compartido** — toggle activo. Ayuda: "La regla solo aplica a enlaces compartidos. Se permitirá la instalación en un enlace individual."
- **Limite el número de acumulaciones de sellos por día** — input numérico, "0 - Sin límites".
- **Número de sellos al emitir una tarjeta** `(i)` — input numérico, 0.
- **Número de sellos de cumpleaños** — input numérico, 0 (sugiere bono automático de sellos en el cumpleaños del cliente).
- **Analítica** `(i)` — textarea vacía grande (probable inyección de script/tag manager).
- **Meta Ads** — campo "Pixel ID", placeholder vacío.
- Botón final ancho naranja **"Continuar"**.

### 2.10 Variantes de "¿Cómo ganan sellos sus clientes?" según el tipo de programa
`Benchmarking para CADA1/Tarjetas/Diseño/Ajustes/Captura de pantalla 2026-09-05 004908.png`, `.../004911.png`, `.../004916.png`

Estas tres son la misma sección de "Programa de recompensas" pero con cada radio distinto seleccionado, mostrando su sub-formulario asociado (probablemente al final del flujo, revisando cada modo):

- **Gasto** seleccionado → "¿Cómo ganan sellos sus clientes?" con ejemplo "Por ejemplo: 1 sello por cada 1 US$ gastado" y fórmula editable: `$ [0.00] = [0] Sellos`.
- **Productos** seleccionado → mismo título, ejemplo "Ej: 2 sellos por 1 artículo", pero en vez de inputs muestra un banner naranja de bloqueo: **"La función solo está disponible con la integración de Toast conectada"** (feature gateada a integración POS de terceros).
- **Visita** seleccionado → ejemplo "Ej: 10 sellos por cada visita", fórmula `[1] Visita = [0] Sellos`, más un checkbox **"Restringir a 1 check-in por cliente por día"**.

Colores/tipografía en todo "Ajustes": idénticos a "Información" — fondo gris claro, cards blancas, acentos naranja (`#E8630A` aprox.) en botones primarios, verde en toggles activos y en radios seleccionados, azul/naranja/violeta alternados en el texto de ayuda (parece resaltado automático de palabras clave, no un criterio de diseño intencional).

---

## 3. Tabla de síntesis

| Qué hace la competencia | Cómo se ve | Qué tenemos nosotros | Brecha | ¿Vale la pena? |
|---|---|---|---|---|
| Textos de tarjeta editables (título, cómo ganar sello, mensajes de sello/recompensa ganada) con preview en vivo | Panel + celular mockup lado a lado | Textos de `WalletCard`/`CustomerCard` son fijos en componente; sin panel de edición ni preview en vivo | Total: no existe UI de edición de copys de la tarjeta | **ADAPTAR** — bajo esfuerzo relativo (son strings), pero exige nueva superficie de admin; no está en el encargo (§5 "NO EMPEZADO") |
| Múltiples recompensas por hitos de sellos (3,5,7...) | Input de lista separada por comas | `reward_tiers` con `point_threshold` por nivel (más flexible, basado en puntos no en sellos) | Nuestro modelo es de puntos, más rico para tiers; no mapea 1:1 a "sellos por compra" | **YA LO TENEMOS MEJOR** — points+tiers es superior a un contador de sellos plano |
| Canje automático de recompensa en próxima visita | Toggle Sí/No | No existe; el canje lo hace el mesero al escanear (`reward_redemptions`) | Automatizar canje cambiaría el flujo de control del mesero — riesgo de negocio, no solo UI | **IGNORAR** — choca con el diseño de "el mesero valida en persona" |
| Programa de referidos (bono de sellos a referente y referido, activo/inactivo) | Radios + stepper 0–10 | No implementado (`docs/features/referral-program.md` = "PLAN — NO IMPLEMENTADO"; §4 ESTADO-REQUERIMIENTOS "NO EMPEZADO") | Coincide con brecha ya documentada, sin código nuestro que cruzar | **COPIAR** (a mediano plazo) — es exactamente el §4 pendiente, y la competencia valida el patrón (bono a ambos lados, toggle simple) |
| Enlaces activos / enlaces de retroalimentación (reseñas) configurables por fila | Tabla dinámica tipo/enlace/texto | Tenemos `googleReviewUrl` fijo (una sola URL) vía branding/tenant config, editable solo en `dashboard/settings` (`google_maps_url`) | Ellos permiten N enlaces tipados; nosotros solo 1 (reseñas Google) | **IGNORAR/ADAPTAR menor** — cubrimos el caso de uso real (reseñas); generalizar a N enlaces es sobre-ingeniería sin pedido explícito |
| Redirección post-instalación en Apple Wallet | URL configurable | No aplica: no tenemos passes de Apple/Google Wallet reales (nuestra "tarjeta" es una página web `/tarjeta`, no un `.pkpass`) | Brecha de arquitectura, no de config | **IGNORAR** — depende de construir passes nativos, fuera de alcance actual |
| Términos de uso editables con toggle mostrar/ocultar | Textarea con 6 puntos numerados | Existe `/(public)/privacidad/page.tsx` estático; no hay editor en dashboard | Contenido legal fijo en código vs. editable por el dueño | **IGNORAR** — cambia con decisión del dueño, no con frecuencia; no justifica UI |
| Datos del emisor (empresa, email, teléfono) | 3 inputs | `tenants.config` ya guarda datos de marca (`brand_name`, etc.) pero sin email/teléfono de emisor específico para el pase | Menor, cosmético | **IGNORAR** |
| Tipo de código: PDF417 o QR | Radio | Solo QR (decisión de diseño documentada: "Meseros usan cámara de celular; barcode necesita lector láser" en `wallet-card.md`) | Decisión ya tomada y justificada | **YA LO TENEMOS MEJOR** — PDF417 exige hardware que no tenemos ni queremos |
| 4 modos de acumulación: Sellos / Gasto / Productos / Visita | Radio con sub-formulario por modo | Tenemos "Visita" (1 visita = 1 sello, fórmula fija) vía `StampsGrid`; no tenemos "Gasto" ni "Productos" (Productos, en su propio producto, está gateado a integración POS "Toast") | Ellos cubren más modelos de negocio; "Productos" ni ellos lo resuelven sin POS externo | **ADAPTAR parcial** — "Gasto" (1 sello por $X) podría interesar a tenants de consumo alto-ticket; "Productos" IGNORAR (requiere integración POS que no tenemos) |
| Vigencia de tarjeta / vigencia de sello (ilimitado vs. plazo) | Radios + selects número+unidad | No existe expiración de sellos/tarjeta; ciclo se reinicia solo cada 10 visitas (`STAMPS_COUNT`) | Ellos permiten "vencer" sellos no usados; nosotros no vencemos nada | **IGNORAR** — vencer sellos es hostil al cliente y no está pedido; nuestro reinicio por ciclo ya resuelve la repetición |
| Gestión de ubicaciones dentro del builder de tarjeta (alta manual, vacío por defecto) | Card vacía + botón "Añade una ubicación" | Multi-sede estructural completo: `location_id` NULLABLE + FK compuesta `(location_id, tenant_id)`, `resolveHostContext()`, `docs/features/multi-sede.md` | Nuestro modelo es infraestructura real (aislamiento por tenant+sede); el de ellos es una lista plana de direcciones para mostrar en el pase | **YA LO TENEMOS MEJOR** — no es comparable en profundidad |
| Idioma / formato de fecha / separadores de miles y decimales | 4 selects | No existe (sistema en español fijo, sin locale configurable) | Brecha real si se vende fuera de Colombia con formato de número distinto | **IGNORAR** — los 25 tenants actuales son mismo país/idioma; prematuro |
| "Cantidad de compra al cobrar" obligatoria al acreditar | Toggle | No aplica — no manejamos montos en check-in (premios sin precio, por decisión de dominio: "Ningún premio tiene precio: solo conteos y tasas, nunca pesos") | Choque directo con guardrail de dominio propio | **IGNORAR** — contradice una decisión de producto ya tomada explícitamente |
| Formulario de emisión de tarjeta configurable (qué campos pedir, requerido/único) | Tabla dinámica de campos | Fijo en código: `CheckInForm.tsx` pide nombre + teléfono (ver `docs/features/qr-checkin.md`); no hay campo de fecha de nacimiento capturable hoy salvo lo que ya exista en `customers` | Ellos permiten configurar qué se pide por tenant; nosotros tenemos un único formulario para todos | **ADAPTAR** con cautela — más campos (cumpleaños) habilitarían el cron de cumpleaños con mejor cobertura, pero antes hay que confirmar si `customers` ya guarda fecha de nacimiento (`[no verificado en este lote]`) |
| UTM con bono de sellos/puntos de bienvenida al emitir por una fuente específica | Formulario dedicado | No existe tracking de UTM ni bono de bienvenida diferenciado por canal | Podría ayudar a medir qué canal de adquisición trae más altas | **ADAPTAR a futuro** — bajo impacto inmediato, no bloquea nada del roadmap actual |
| Máscara telefónica por país | Select de país | Tenemos `validatePhone()` (`src/lib/validators/phone.ts`) — no se confirmó en este lote si soporta múltiples países o solo Colombia | `[no verificado en este lote]` | No se puede juzgar sin leer `phone.ts` — **fuera de este lote** |
| Política de privacidad + consentimiento de marketing con toggles | 2 toggles + 2 textareas | Existe página estática `/(public)/privacidad/page.tsx` y manejo de consentimiento en `imported-contacts.service.ts` / `ImportedContactsUploader.tsx` (para importación, no para alta por check-in) | Cubrimos el caso de importación; no el de alta orgánica vía QR | **ADAPTAR** — si se piden más datos personales (cumpleaños, email) en el check-in, un checkbox de consentimiento se vuelve necesario por cumplimiento, no solo por paridad competitiva |
| Botón de instalación Google Wallet / PWA configurable | 2 toggles | No aplica: sin `.pkpass`/Google Wallet real ni `manifest.json` de PWA (confirmado: `wallet-card.md` marca "PWA / Agregar a inicio: no implementado") | Coincide con limitación ya documentada | **IGNORAR por ahora** — depende de construir passes/PWA real, más grande que un toggle |
| Límite de tarjetas emitidas / límite de acumulaciones por día | 2 inputs numéricos | No existe límite de emisión; sí existe intento de límite de check-ins diarios en el modo "Visita" de ellos (checkbox "Restringir a 1 check-in por cliente por día") — nuestro `/api/check-in` no confirmado en este lote si ya limita a 1/día | `[no verificado en este lote]` — requiere leer `check-in/route.ts` para no adivinar | No se puede juzgar sin ese archivo — **fuera de este lote** |
| Número de sellos de cumpleaños (bono automático) | Input numérico | Existe cron de cumpleaños (`src/app/api/cron/birthday/route.ts`) pero es de mensajería/campaña, no de bono de sellos/puntos automático | Función distinta con el mismo disparador (fecha de nacimiento) | **ADAPTAR** — si el cron de cumpleaños ya dispara un mensaje, sumarle puntos/sellos automáticos es una extensión natural, pero requiere decisión de negocio (cuántos, y si compite con campañas manuales) |
| Analítica (script embebido) + Meta Ads Pixel ID | 2 campos | No existe inyección de scripts de terceros en la tarjeta pública | Bajo valor: nuestra tarjeta es interna al flujo del negocio, no una landing de marketing masivo | **IGNORAR** |
| Color/gradiente de tarjeta configurable | No se vio explícitamente en las 20 capturas de este lote (sí lo hay en otras pantallas de "Diseño" fuera del alcance de este encargo) | **Ya existe en el modelo**: `Branding.cardBg` / `Branding.pageBg` en `src/lib/branding.ts`, resueltos por tenant vía `resolveBranding()` — pero **sin UI**: `dashboard/settings/page.tsx` solo edita `google_maps_url` | El campo existe en el tipo y el resolver; nadie lo expone en un formulario. Es una brecha de UI, no de modelo | **ADAPTAR** — cerrar la brecha es agregar 2 inputs de color al settings existente, no tocar el modelo. Nota: esto contradice la nota "Sin config por restaurante en esta fase (YAGNI)" de `wallet-card.md` línea 25, que ya quedó desactualizada por el código — señalarlo al dueño |

---

## No legible

- `Benchmarking para CADA1/Tarjetas/Diseño/Información/Captura de pantalla 2026-09-05 005119.png` — el final de la fila "Múltiples recompensas" en la vista previa del celular está cortado por el borde de pantalla; no se pudo confirmar el texto completo que sigue.
- `Benchmarking para CADA1/Tarjetas/Diseño/Ajustes/Captura de pantalla 2026-09-05 004706.png` — el valor del select "Tipo de recompensa" se lee "Orden (valor absolut)", truncado; se transcribió tal cual aparece, probablemente "Orden (valor absoluto)" pero no se puede confirmar sin ampliar el dropdown.
- `Benchmarking para CADA1/Tarjetas/Diseño/Ajustes/Captura de pantalla 2026-09-05 004825.png` — no queda claro si "Política de privacidad" (toggle 1) y "Política de privacidad (texto completo)" son dos plantillas distintas (corta/larga) o el mismo texto duplicado por error de captura de pantalla del competidor; se marca `[se intuye, sin confirmar]` en el cuerpo del documento.
