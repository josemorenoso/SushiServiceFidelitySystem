# Benchmarking — Tarjetas / Plantillas (competencia: "Novu App")

> Fuente: `Benchmarking para CADA1/Tarjetas/` (15 imágenes: 13 en `Plantillas/` + 2 sueltas).
> Producto identificado: **Novu App** (texto "Creado por: Novu App" en el pie de cada tarjeta mock).
> Es un SaaS genérico de tarjetas de fidelidad **multi-rubro** (no específico de restaurantes): scooters,
> barberías, odontología, taxis, etc. conviven en la misma galería.
> Documento de solo lectura. No se tocó código.

---

## 1. Galería "Plantillas" (`Tarjetas/Plantillas/`, 13 capturas)

### 1.1 Qué es la pantalla (aplica a las 13 capturas por igual)

Grilla horizontal de tarjetas mock dentro de un frame de iPhone. Cada capturas de pantalla contiene
entre 7 y 8 plantillas (una por rubro/industria), en orden alfabético por nombre de rubro en español.
Encabezado "Plantillas" (fuente serif oscura) con selector "Todos" arriba a la derecha
(`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003819.png`).

**Estructura repetida de cada tarjeta mock** (idéntica en las 13 capturas, solo cambian color/ícono/foto):
- Header superior de la tarjeta: franja de color sólido (o foto de fondo) con el **nombre del rubro**
  en texto pequeño blanco/oscuro, alineado a la izquierda.
- Grilla de íconos 2×5 (10 íconos totales) dentro de círculos, temáticos al rubro (ver detalle por
  grupo abajo). Representan los "sellos" de visita.
- Debajo de la grilla, dos etiquetas cortadas por overflow de texto: `"ACUMULA EN TUS VISITA…"` y
  `"RECOMPENSAS DISPONI…"` — el texto completo no se ve en ninguna captura, **`[no legible]`** el
  literal completo.
- Debajo de cada etiqueta: `"Sin datos"` (estado vacío, ambos campos).
- Zona blanca inferior con un **código de barras 1D** (no QR) con overlay de texto encima, borroso/
  pixelado a propósito en todas las capturas — **`[no legible]`** el texto sobre el barcode en las 13
  capturas de `Plantillas/` y en las 2 capturas sueltas.
- Pie: `"Creado por: Novu App"` + ícono pequeño.
- Debajo del teléfono: nombre del rubro (texto negro, bold) + botón naranja `"Abrir"` ancho completo.
- Primera tarjeta de la izquierda (visible solo en la primera captura): placeholder gris redondeado con
  un ícono de estrella/sparkle centrado, rótulo `"Crear tarjeta"`, botón outline `"Desde cero"`.

**Colores dominantes de la interfaz de galería:** fondo general blanco/gris muy claro (`~#F5F5F5`),
botón de acción naranja (`~#E8792A`/`~#EA7A2E` aprox., mismo tono en las 13 capturas), tipografía de
títulos de rubro en negro/gris oscuro. Cada tarjeta-mock individual usa un color o foto de fondo propio
del rubro (paleta muy variada, sin sistema de color único — ver detalle por grupo).

**Iconografía:** estilo *flat line icon* o *duotono relleno*, un ícono distinto por rubro repetido 10
veces (ej. bicicletas para "Alquiler de bicicletas", tijeras/cabezas para "Barbería", dientes para
"Odontología"). En varios casos el fondo de la grilla de íconos es una foto de stock relacionada al
rubro (ej. platos de comida en "Almuerzo de negocios") en vez de color sólido.

### 1.2 Detalle por captura (agrupado, cita la ruta de archivo)

**Captura `003819.png`** — Almuerzo de negocios (marfil, íconos de platos sobre foto de comida),
Alquilar un scooter (marrón `~#8B7355`, íconos de scooter), Alquiler de ATV (marrón oscuro `~#3E2723`,
fotos de ATV), Alquiler de bicicletas (gris oscuro `~#4A4A4A`, fotos de bicicletas), Alquiler de coches
(amarillo `~#F4C500`, íconos "RENT"), Alquiler de equipos (azul `~#1E5FA8`, patrón textil azul/blanco),
Alquiler de patines (gris `~#8C8C8C`, patrón rojo/azul).
`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003819.png`

**Captura `003826.png`** — Arte (beige, íconos de pinceles sobre foto abstracta), Bar (violeta sólido
`~#4B2E83`, íconos de tragos), Barbería (negro `#000`, íconos de cortes de pelo), Bienes para mascotas
(crema, foto de gatos), Bienes para niños (rosa pálido `~#F6D9EC`, íconos infantiles sobre foto),
Billar (verde `~#2E7D32`, íconos de bolas de billar), Bolos (azul marino `~#1B2A4A`, foto de bolos),
Bolsas y accesorios (beige, foto de bolsos).
`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003826.png`

**Captura `003831.png`** — Cafetería (blanco, foto de café con íconos de tazas azules), Camión de
comida (marrón rojizo, foto de comida callejera), Canchas de Tennis (verde `~#1B5E20`/rojo, íconos de
pelotas), Capacitación (rosa muy pálido, íconos de libro/proyector sobre foto), Cargadores (azul
`~#2E5C9A`, íconos de batería), Centro Médico (celeste pálido, íconos rojos de cruz médica), Centro de
trabajo (verde lima `~#C6E000`, íconos variados sobre foto), Cine (azul marino oscuro `~#2A2550`,
íconos rosados de entretenimiento).
`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003831.png`

**Captura `003836.png`** — Club nocturno (violeta oscuro `~#2E1A47`, patrón geométrico), Cocina
oriental (rosa/coral `~#F0637A`, foto de comida asiática), Cuidado de las cejas (magenta `~#B0208A`,
foto de cejas), Cuidado de pestañas (magenta vivo `~#E6007E`, foto de pestañas), Cursos de cocina
(crema, foto de utensilios de cocina), Depilación (lila pálido `~#F0D6F5`, íconos de depilación sobre
foto), Desayuno (amarillo `~#F5C518`, foto de desayuno), Educación (dorado `~#DDAA22`, íconos de
graduación).
`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003836.png`

**Captura `003840.png`** — El viaje en el tranvía (beige, íconos de tranvía), El viaje en tren (celeste
pálido, foto con trenes rojos), Electricista (gris claro, foto de cables/componentes), Elevadores y
Funiculares (blanco, íconos de ascensor), Entrega de agua (azul `~#1565C0`, íconos de bidones), Entrega
de comida (crema, foto de delivery), Entretenimiento (turquesa `~#0D9E9E`, íconos rosados/celestes),
Esquí (blanco, foto de esquiadores).
`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003840.png`

**Captura `003845.png`** — Estacionamiento de alquiler (negro, íconos de autos), Estudio óptico
(blanco, foto de anteojos), Excursiones (naranja `~#F0895A`, foto de senderismo), Fitness (negro,
íconos verdes de pesas), Gasolinera (amarillo `~#F5C518`, íconos de surtidor), Gimnasio (crema, foto de
gimnasio), Go-karting (amarillo vivo `~#F5D000`, foto de karting a cuadros), Hamburguesa (naranja
`~#F0A93C`, foto de hamburguesas).
`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003845.png`

**Captura `003849.png`** — Heladería (verde lima `~#C6E000`, íconos de helado), Hostal (durazno
pálido, foto de casas), Hotel (beige, foto de hotel), Imprenta (azul marino `~#151A4A`, íconos
multicolor de impresora), Jardin de Niños (crema, foto floral con íconos amarillos), Joyas (negro,
íconos de diamantes), La medicina (celeste `~#3BA7D6`, íconos médicos), Lavado de autos (blanco/gris,
foto de autos).
`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003849.png`

**Captura `003854.png`** — Lentes oculares (blanco, foto de ojos), Limpieza en seco (turquesa
`~#2FBFAE`, íconos de tintorería), Manicura (rosa pálido `~#F5D5D5`, foto de uñas), Maquillaje (magenta
`~#D6007A`, foto de maquillaje), Materiales de construcción (blanco, íconos amarillos sobre foto),
Misiones (amarillo `~#F0D000`, íconos verdes/negros), Muebles (crema, foto de muebles), Muro de
escalada (gris, foto de pared de escalada).
`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003854.png`

**Captura `003859.png`** — Música (rojo `~#E5424B`, íconos de notas musicales), Narguile (violeta
`~#4A2E7A`, íconos), Odontología (blanco, íconos de dientes celestes), Panadería (crema, foto de pan),
Paracaidismo (azul `~#1565C0`, foto de cielo), Parrilla (rojo `~#D62B1E`, foto de carne), Personal de
mantenimiento (gris, íconos naranjas sobre foto), Piscina (celeste `~#3BC4E0`, íconos azules).
`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003859.png`

**Captura `003903.png`** — Pizzería (amarillo, foto de pizza), Plomero (blanco, foto de tuberías),
Presente (azul marino `~#2C3E63`, íconos de flechas/regalo), Productos (gris oscuro `~#333333`, íconos
de check verde/amarillo), Productos cosméticos (magenta `~#E5007E`, íconos), Refaccionarias (blanco,
foto de repuestos), Renta (blanco, íconos de llaves), Rentar un apartamento (crema, foto de casas).
`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003903.png`

**Captura `003907.png`** — Reparación de equipos (blanco, íconos azules de tuerca), Reparación de
locales (marrón dorado `~#B8964F`, íconos de herramientas), Restaurante (marrón oscuro `~#3A2418`, foto
de comida), Restaurante de Comida Marina (crema, foto de pescado), Rollos de sushi (negro, foto de
sushi), Sala de masaje (rosa fuerte `~#E5007A`, foto de masajes), Salón de spa (blanco, foto floral
rosa), Sauna (marrón `~#4A2E1A`, foto de sauna).
`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003907.png`

**Captura `003912.png`** — Seguridad (escrito **"Sequridad"**, con typo, en la interfaz de la
competencia; violeta `~#3B2A8C`, íconos de candado), Servicio de auto (blanco, íconos naranjas de
llave), Servicio de coche 5 ruedas (gris, foto de autos), Servicio de limpieza (celeste pálido, foto de
limpieza), Servicios (amarillo vivo `~#F0E000`, íconos de estrella), Servicios jurídicos (crema, íconos
de balanza), Shawarma (marrón, foto de comida árabe), Solárium (amarillo `~#F0C000`, foto playera).
`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003912.png`

**Captura `003917.png`** — Tabla de snow (blanco, foto de snowboard), Taxi (amarillo `~#F5C518`, foto
de taxis a cuadros), Textil (gris, foto de telas), Tienda de flores (rosa pálido, foto de flores),
Tienda de regalos (rojo `~#C81E1E`, íconos de regalo), Tienda de ropa (blanco, foto de ropa), Tienda de
zapatos (blanco, foto de zapatos), Tienda en línea (blanco, foto de carritos de compra).
`Benchmarking para CADA1/Tarjetas/Plantillas/Captura de pantalla 2026-09-05 003917.png`

**Nota:** ninguna plantilla es específica de "restaurante con marca propia" más allá del nombre de
rubro — no hay logo, ni tipografía custom, ni ícono propio de negocio. El único elemento "premium"
disponible por plantilla es el color/foto de fondo y el ícono genérico del rubro.

---

## 2. Capturas sueltas de `Tarjetas/`

### 2.1 `Captura de pantalla 2026-09-05 003750.png` — Pantalla de entrada al módulo de tarjeta

Layout de dos columnas: sidebar izquierdo angosto con íconos (inicio, tarjeta — resaltado en naranja
como sección activa, regalo con badge `"0"` y etiqueta verde `"NEW"`, contactos, chat, compartir/red,
ubicación, perfil, configuración). Barra superior naranja (`~#E8792A`) con dos pestañas: `"Plantillas"`
(activa, fondo blanco) y `"Promociones"` (fondo oscuro `~#2A2A2A`).

Contenido principal: badge con punto verde y texto `"Tarjeta activada"`. Debajo, un placeholder de
tarjeta vertical gris claro (`~#E8E8E8`), bordes muy redondeados, con un ícono de estrella/sparkle de 4
puntas centrado (probable estado vacío/loading — **`[se intuye, sin confirmar]`** que sea loading y no
un ícono decorativo fijo). Debajo: título `"Crear tarjeta"` y dos botones apilados: `"Plantilla"`
(naranja, ancho completo) y `"Desde cero"` (blanco con borde, ancho completo).
`Benchmarking para CADA1/Tarjetas/Captura de pantalla 2026-09-05 003750.png`

### 2.2 `Captura de pantalla 2026-09-05 004040.png` — Selección de "Tipo de tarjeta" (flujo "Desde cero")

Pantalla de configuración con dos paneles. Izquierda: título `"Tipo de tarjeta"` con ícono de info (ⓘ),
línea divisoria fina, y una grilla 3×3 (8 opciones) de tipos de tarjeta, cada una con ícono + nombre +
badge de color:

| Opción | Ícono | Badge |
|---|---|---|
| Estampilla | engranaje/sello | `Alta retención` (verde) — **seleccionada** (fondo negro, único con estado activo) |
| Premio | regalo | `Alta retención` (verde) |
| Afiliación | dos personas | `Alta retención` (verde) |
| Descuento | símbolo de porcentaje | `Alta retención` (verde) |
| Devolución de dinero | símbolo `$` | `Alta retención` (verde) |
| Cupón | etiqueta/ticket | `Lo mejor para la adquisición` (azul) |
| Suscripción | ticket | `Lo mejor para la adquisición` (azul) |
| Tarjeta de regalo | tarjeta con `$` | `Lo mejor para la adquisición` (azul) |

Botón inferior ancho completo `"Continuar"` (naranja).

Derecha: preview en vivo dentro de un frame de iPhone. Badge superior con punto rojo: `"Tarjeta
inactiva"`. Tarjeta mock: título `"Tarjeta de sello Nº 1"`, grilla 2×5 de **estrellas** (fila superior
rellena en negro, fila inferior en contorno/vacía — a diferencia de la galería de Plantillas, que usa
íconos temáticos por rubro, acá el ícono default es una estrella). Etiquetas `"8 sellos"` / `"2
recompen…"` (cortado — **`[no legible]`** el texto completo, probablemente "2 recompensas"). Código de
barras 1D borroso al pie — **`[no legible]`**. Pie `"Creado por: Novu App"`.

Debajo del teléfono: botón gris deshabilitado `"Activar"`, y texto de ayuda: *"No se pueden emitir más
de 10 tarjetas antes de que la plantilla de tarjetas no se active"* (la redacción es confusa/parece
traducción automática — transcripto literal). A la derecha del teléfono, 3 botones circulares
apilados: ícono de Apple/Wallet (naranja, resaltado), ícono de reloj/smartwatch, ícono de
compartir/mensaje — **`[se intuye, sin confirmar]`** que correspondan a exportar a Apple Wallet /
Google Wallet / compartir por link, ya que no hay tooltip visible.
`Benchmarking para CADA1/Tarjetas/Captura de pantalla 2026-09-05 004040.png`

---

## 3. Cruce contra lo nuestro

Fuentes revisadas: `docs/features/wallet-card.md`, `docs/features/design-system.md`,
`docs/ESTADO-REQUERIMIENTOS.md` (§5 "Personalización pantalla teléfono + tarjeta" — **NO EMPEZADO**;
§6 "Branding + wizard de plantillas" — **PARCIAL**, falta logo/paleta/wizard), y
`docs/features/visual-loyalty-ux-audit.md` (auditoría previa que ya proponía una tarjeta tipo
Apple/Google Wallet, hoy implementada). También corrí `graphify query` — lo más cercano a un
"selector de estilo" que existe hoy es `src/components/dashboard/templates/StyleSelector.tsx`, pero es
para elegir tono/estilo de **mensajes de WhatsApp** (plantillas de texto), no para la tarjeta visual del
cliente. No hay ningún componente ni ruta de "galería de plantillas de tarjeta" en el código.

| Qué hace la competencia | Cómo se ve | Qué tenemos nosotros | Brecha | ¿Vale la pena? |
|---|---|---|---|---|
| Galería de ~100+ plantillas prediseñadas por rubro (color + ícono + foto de fondo) para elegir la tarjeta al alta | Grilla de mocks de teléfono, botón `Abrir`, `Crear tarjeta` → `Plantilla`/`Desde cero` | Color de tarjeta fijo (gradiente rojo de marca) sin selector; §6 confirma que falta el wizard | Sí — coincide exacto con §6 (falta logo, paleta, wizard) | **ADAPTAR**: no tiene sentido copiar 100 plantillas multi-rubro (somos solo restaurantes), pero sí adaptar la idea de un selector visual de paleta/ícono al dar de alta un tenant nuevo |
| Grid 2×5 (10 íconos) como "sellos" de progreso | Íconos temáticos por rubro en círculos, sin animación, siempre en estado `Sin datos` (mock) | `StampsGrid.tsx` ya usa la misma grilla 2×5=10, con lógica de ciclos, animación `stamp-pop` y tema Black dorado | No hay brecha — coincidencia de patrón, no de ejecución | **YA LO TENEMOS MEJOR**: la competencia muestra el patrón sin datos reales ni animación; el nuestro está implementado con lógica de negocio y estados |
| Código de barras 1D en la tarjeta | Barcode clásico, con texto superpuesto ilegible en las 15 capturas | Solo QR (`docs/features/wallet-card.md`: "Meseros usan cámara de celular; barcode necesita lector láser") | No — decisión ya tomada y documentada | **YA LO TENEMOS MEJOR / IGNORAR**: cambiar a barcode requeriría hardware que el restaurante no tiene |
| Selector "Tipo de tarjeta" (Estampilla, Premio, Afiliación, Descuento, Devolución de dinero, Cupón, Suscripción, Tarjeta de regalo) | Grilla de 8 tarjetas de opción con ícono + badge de categoría (`Alta retención` / `Lo mejor para la adquisición`) | Solo modelo de puntos + sellos; no hay cupón, descuento, cashback ni suscripción como "tipo de tarjeta" | Sí, pero es un cambio de **modelo de negocio**, no de plantilla visual — no está en el alcance de §5/§6 tal como están redactados | No puedo juzgar la brecha real sin una decisión de producto — **no adivino**: esto es insumo para una futura conversación de alcance, no un ítem de diseño |
| Entrada al módulo con tabs `Plantillas`/`Promociones` y flujo `Plantilla` vs `Desde cero` | Sidebar + tabs + botones apilados | No existe un "módulo" de configuración de tarjeta para el dueño del restaurante; la tarjeta es fija por código | Sí — relacionado a §5/§6 | **ADAPTAR**: la idea de ofrecer "Plantilla" vs "Desde cero" es un patrón de UX razonable para un futuro configurador, aunque el diseño visual de Novu (flat, genérico) no es el que seguiríamos |
| Preview en vivo del teléfono mientras se elige el tipo/plantilla | Panel derecho con mock actualizado en tiempo real | No hay configurador, por lo tanto no hay preview | Sí — mismo hueco que arriba | **ADAPTAR**: patrón útil a futuro si se construye el wizard de §6 |
| Estética visual: flat, colores planos por rubro, íconos línea genéricos, tarjetas con esquinas redondeadas simples | Sin gradientes, sin tipografía distintiva, sombras de mockup genéricas | Sistema "Hospitality Editorial": gradiente de marca, Playfair Display + Inter, sin bordes duros, sin negro puro (`docs/features/design-system.md`) | No — nuestra dirección de diseño ya es más premium y specific al rubro hospitality | **IGNORAR**: la estética de Novu apunta a un SaaS genérico multi-rubro de bajo costo, no aporta a la identidad "Digital Maître d'" que ya tenemos definida |
| Botones de exportar (Apple Wallet / smartwatch / compartir) junto al preview | 3 íconos circulares al costado del teléfono | `docs/features/wallet-card.md` marca "PWA / Agregar a inicio: no implementado" y no hay integración con Apple/Google Wallet real | Sí, es una limitación ya documentada (Fase D/E, fuera de esta fase) | **ADAPTAR** a futuro: no es plantilla visual sino integración (PassKit/Google Wallet API); vale la pena evaluarlo como ítem de roadmap, no como cambio de diseño inmediato |
| Límite de tarjetas antes de activar plantilla ("No se pueden emitir más de 10 tarjetas...") | Texto de ayuda bajo botón `Activar` deshabilitado | No aplica — nuestro modelo es un tenant = una tarjeta de marca, no multi-plantilla por emitir | No aplica, modelos de negocio distintos | **IGNORAR**: es una restricción propia del modelo "una plantilla por campaña" de Novu, no compatible con nuestro modelo de tenant único |

---

## No legible

- Texto completo de las etiquetas `"ACUMULA EN TUS VISITA…"` y `"RECOMPENSAS DISPONI…"` — cortado por
  overflow en las 13 capturas de `Plantillas/`.
- Texto superpuesto sobre el código de barras — borroso/pixelado a propósito en las 15 capturas
  (13 de `Plantillas/` + las 2 sueltas).
- `"2 recompen…"` en `Captura de pantalla 2026-09-05 004040.png` — cortado, probablemente "2
  recompensas" pero no confirmado.
- Función exacta de los 3 íconos circulares (Apple/reloj/compartir) junto al preview en
  `Captura de pantalla 2026-09-05 004040.png` — sin tooltip visible, marcado como
  `[se intuye, sin confirmar]` en la sección 2.2.
