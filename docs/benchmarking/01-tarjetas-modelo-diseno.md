# Benchmarking — Modelos de tarjeta y editor de diseño visual

> Competencia observada: plataforma de tarjetas de fidelidad genérica (marca de agua "Creado por: Novu App" en el preview del móvil). No es un competidor restaurantero puro: es un SaaS de tarjetas Apple/Google Wallet para cualquier rubro (gimnasios, retail, restaurantes, etc.), lo que explica por qué ofrece modelos (cashback en dólares, tarjeta de regalo) que chocan con guardrails nuestros.
> Todas las capturas comparten el mismo layout de wizard: panel izquierdo "Tipo de tarjeta" (grid de 8 tarjetas seleccionables, cada una con badge verde "Alta retención" o azul "Lo mejor para la adquisición") + panel derecho con preview en vivo dentro de un mock de celular (iPhone o Android), iconos de Apple Wallet / Google Wallet / mensajería al costado, badge superior "🔴 Tarjeta inactiva", botón "Activar" (deshabilitado) y aviso "No se pueden emitir más de 10 tarjetas antes de que la plantilla de tarjetas no se active."

---

## Cupón

Función: cupón de descuento de un solo uso, con vencimiento explícito, sin ligarlo a puntos ni visitas.

- `Benchmarking para CADA1/Tarjetas/Diseño/Modelo de tarjeta/Cupón/Captura de pantalla 2026-09-05 004406.png` — vista colapsada del preview: header "Cupón Nº 1" a la izquierda, "Vencimiento" + "00.00.0000" a la derecha. Debajo, placeholder gris "Imagen de fondo". Luego etiqueta `[cortado, se intuye "DESCUENTO POR SU PRIMERA COMPRA"]` "DESCUENTO POR SU PRI..." con valor "10". Código de barras abajo, texto "Creado por: Novu App". Fondo blanco, tarjeta de esquinas redondeadas dentro de mock de iPhone (notch).
- `.../Cupón/Captura de pantalla 2026-09-05 004408.png` — vista "expandida" (Android, cámara punch-hole): header "Cupón Nº 1", título grande "Nombre de promoción" (placeholder editable), etiqueta `[cortado]` "DESCUENTO POR SU PRI..." valor "10", código de barras con número "630120-816-306" debajo, placeholder "Imagen de fondo" al final, botón "Detalles" (pill azul) fuera de la tarjeta.

Colores dominantes: blanco de fondo, texto azul para labels editables, texto naranja/ámbar para valores numéricos, negro para el código de barras. Tipografía sans-serif genérica, sin distinción visual fuerte entre secciones (todo en bloques separados por líneas finas grises).

---

## Descuento

Función: tarjeta de porcentaje de descuento acumulativo, con "estado" tipo tier (Bronce/Plata/etc., igual vocabulario que tiers de puntos).

- `.../Descuento/Captura de pantalla 2026-09-05 004302.png` — vista colapsada: header "Tarjeta de descue..." `[cortado, "descuento"]`, imagen de fondo placeholder, "EL PORCENTAJE ACTUAL ..." `[cortado]` = "1%", "ESTADO DE DESCUENTO ..." `[cortado]` = "Bronce". Código de barras. Debajo del móvil: badge "Tarjeta inactiva", botón "Activar" deshabilitado, aviso de límite de 10 tarjetas.
- `.../Descuento/Captura de pantalla 2026-09-05 004307.png` — panel izquierdo muestra el grid completo de 8 "Tipo de tarjeta" (ver tabla de tipos abajo). Vista expandida: "Tarjeta de descuento Nº 1", título "Hacer compras, aumentar el descuento", "EL PORCENTAJE ACTUAL..." "1%" / "ESTADO DE DESCUENTO..." "Bronce", código de barras "630120-816-306", imagen de fondo.
- `.../Descuento/Captura de pantalla 2026-09-05 004310.png` — misma vista con notificación push simulada superpuesta: burbuja gris "NOMBRE DE EMPRESA · ahora — Vista previa de nuestro servicio de Mensajes Push en el lado lateral con emojis" seguida de 3-4 emojis `[no legible, iconos pequeños — se intuyen un megáfono/mano/corazón]`.

**Grid completo "Tipo de tarjeta" (8 opciones, visible en esta y otras capturas):**

| Icono | Nombre | Badge |
|---|---|---|
| engranaje | Estampilla | Alta retención (verde) |
| regalo | Premio | Alta retención (verde) |
| dos personas | Afiliación | Alta retención (verde) |
| % tachado | Descuento | Alta retención (verde) |
| $ | Devolución de dinero | Alta retención (verde) |
| etiqueta de precio | Cupón | Lo mejor para la adquisición (azul) |
| ticket/boleto | Suscripción | Lo mejor para la adquisición (azul) |
| $ | Tarjeta de regalo | Lo mejor para la adquisición (azul) |

Botón inferior "Continuar" (naranja, ancho completo, texto blanco).

---

## Devoluciones (Devolución de dinero / cashback)

Función: saldo de cashback acumulado, expresado en dinero, no en puntos ni visitas.

- `.../Devoluciones/Captura de pantalla 2026-09-05 004331.png` — panel izquierdo: subset del grid (Premio, Afiliación, Devolución de dinero seleccionada en negro, Cupón, Tarjeta de regalo). Vista colapsada: header "Tarjeta de reemb..." `[cortado, "reembolso"]` + "Puntos" "1000" a la derecha (etiqueta dice "Puntos" pese a ser un modelo de cashback — inconsistencia de la plantilla, no nuestra). "PORCENTAJE ACTUAL DE ..." "1%" / "ESTADO ACTUAL DE CASH..." "Bronce". Código de barras.
- `.../Devoluciones/Captura de pantalla 2026-09-05 004334.png` — vista expandida: "Tarjeta de reembolso Nº 1", título "Obtenga puntos de bonificación para cada compra.", "PORCENTAJE ACTUAL DE..." "1%" / "BALANCE" "30.00", código de barras "630120-816-306", imagen de fondo.
- `.../Devoluciones/Captura de pantalla 2026-09-05 004338.png` — misma vista con notificación push simulada (igual formato que en Descuento).

**Nota de choque con nuestro dominio:** este modelo expresa el premio como dinero (BALANCE en unidades monetarias). Nuestro guardrail dice explícitamente *"Ningún premio tiene precio: solo conteos y tasas, nunca pesos"* (`CLAUDE.md`). Este modelo entero es incompatible con esa decisión de producto.

---

## Estampilla

Función: tarjeta de sellos por visita (idéntica intención a nuestro `StampsGrid`).

- `.../Estampilla/Captura de pantalla 2026-09-05 004101.png` — vista colapsada: header "Tarjeta de sello Nº 1". Grid de 10 círculos (2 filas × 5 columnas) con ícono de estrella: 2 estrellas negras rellenas (activas) + 8 grises vacías (inactivas). "ACUMULA EN TUS VISITA..." `[cortado]` = "8 sellos" / "RECOMPENSAS DISPONIBL..." `[cortado]` = "2 recompen..." `[cortado]`. Código de barras. Nota: el conteo del grid (2/10 rellenos) no coincide con el texto "8 sellos" — son dos indicadores independientes en el mismo mock (probablemente datos de placeholder desincronizados, no un patrón a imitar).
- `.../Estampilla/Captura de pantalla 2026-09-05 004104.png` — vista expandida: título "Obtén sellos para lograr recompensas", "ACUMULA EN TUS VISITA..." "8 sellos" / "RECOMPENSAS DISPONI..." "2 recompensas", código de barras "630120-816-306", grid de estrellas debajo (mismo patrón 2 llenas / 8 vacías), botón "Detalles".
- `.../Estampilla/Captura de pantalla 2026-09-05 004107.png` — notificación push simulada superpuesta sobre tarjeta vacía (mismo formato genérico).

Iconografía: estrella negra rellena (activa) vs. gris con borde (inactiva) — incluye textura tipo estrella de 5 puntas, no un check ✓ como el nuestro.

---

## Membresía

Función: carnet de socio con nivel/tier y foto, más un límite de uso ("Visitas").

- `.../Membresia/Captura de pantalla 2026-09-05 004223.png` — vista colapsada: header "Tarjeta de membr..." `[cortado, "membresía"]` + "Vencimiento" "00.00.0000". "NOMBRE DEL MEMBRO" `[cortado, "MEMBRO" sin la "N" final visible]` = "Inmaculada" (nombre placeholder) junto a un círculo gris "FOTO" (placeholder de avatar circular). "NIVEL DE MEMBRESIA" = "Oro" / "LIMITES DISPONIBLES" = "8 Visitas". Código de barras.
- `.../Membresia/Captura de pantalla 2026-09-05 004228.png` — vista expandida: "Tarjeta de membresia Nº 1", título "Nombre de membresia", "NIVEL MEMBRESIA" "Oro" / "LIMITES DISPONIBLES" "8 Visitas", código de barras "630120-816-306", botón "Detalles".
- `.../Membresia/Captura de pantalla 2026-09-05 004230.png` — notificación push simulada (formato genérico repetido).

Es el único modelo con placeholder de foto de perfil (círculo "FOTO"), algo que ningún otro modelo de la competencia ni nuestra tarjeta usan.

---

## Premio

Función: tarjeta de puntos/recompensa con balance y progreso al siguiente nivel — el más parecido conceptualmente a nuestro sistema de puntos + tiers.

- `.../Premio/Captura de pantalla 2026-09-05 004145.png` — panel izquierdo con Premio seleccionado (negro). Vista colapsada: header "Tarjeta de recom..." `[cortado, "recompensa"]` + "Balance" "500". Imagen de fondo. "RECOMPENSA" = "Sin datos" (placeholder vacío) / "AL SIGUIENTE NIVEL" = "500". Código de barras.
- `.../Premio/Captura de pantalla 2026-09-05 004149.png` — vista expandida: "Tarjeta de recompensa Nº 1", título "Nombre de recompensa", "RECOMPENSA" "Sin datos" / "BALANCE" "30", código de barras "630120-816-306", botón "Detalles".
- `.../Premio/Captura de pantalla 2026-09-05 004156.png` — notificación push simulada (formato genérico).

---

## Suscripción

Función: tarjeta de "visitas restantes" ligada a un plan pago recurrente — mecánicamente igual a un grid de sellos, solo que cuenta visitas consumibles de una suscripción en vez de premiar acumulación.

- `.../Suscripción/Captura de pantalla 2026-09-05 004448.png` — vista colapsada: header "Tarjeta de suscripción Nº 1". Grid de estrellas (2×5, 2 activas negras / 8 inactivas grises, mismo widget que Estampilla). "EL NUMERO ACTUAL DE P..." `[cortado]` = "10" / "EL NUMERO TOTAL DE VISI..." `[cortado]` = "2". Código de barras.
- `.../Suscripción/Captura de pantalla 2026-09-05 004451.png` — vista expandida: título "Gastar visitas y obtener puntos de bonificación.", mismos campos "10" / "2", código de barras "630120-816-306", grid de estrellas debajo, botón "Detalles".

Nota: usa el mismo componente visual (grid de estrellas) que Estampilla — la diferencia entre "Estampilla" y "Suscripción" es solo la etiqueta de negocio (premio por acumulación vs. consumo de cupo pago), no el widget.

---

## Tarjeta regalo

Función: saldo prepago en dinero, transferible/regalable.

- `.../Tarjeta regalo/Captura de pantalla 2026-09-05 004431.png` — panel izquierdo con "Tarjeta de regalo" seleccionada (negro). Vista colapsada: header "Tarjeta de regalo ..." `[cortado]` + "Balance de regalos ..." `[cortado]` = "1800 US$". Imagen de fondo. "*NOMBRE*" = "Sin datos". Código de barras.
- `.../Tarjeta regalo/Captura de pantalla 2026-09-05 004434.png` — vista expandida: "Tarjeta de regalo Nº 1", título "Nombre de promoción", "*NOMBRE*" "Sin datos" / "BALANCE" "30.00", código de barras "630120-816-306", imagen de fondo, botón "Detalles".

**Nota de choque con nuestro dominio:** balance expresado en dólares ("1800 US$"). Mismo choque que "Devolución de dinero" contra el guardrail *"nunca pesos"*.

---

## Diseño (editor visual de la tarjeta)

Función: panel de configuración visual que se aplica a cualquiera de los 8 tipos de tarjeta (observado en el contexto de Estampilla, a juzgar por los campos "sellos").

- `Benchmarking para CADA1/Tarjetas/Diseño/Diseño/Captura de pantalla 2026-09-05 005017.png` — sección "Diseño" (título) con ícono de ayuda (tooltip "i"). Campo "Recuento de sellos" (también con tooltip): fila de 30 píldoras circulares numeradas 1 a 30; las primeras 10 están rellenas en negro (seleccionadas/activas), 11-30 en gris claro con borde (disponibles pero no elegidas). Es un selector de "cuántos sellos tiene el ciclo de la tarjeta", configurable de 1 a 30.
- `.../Diseño/Captura de pantalla 2026-09-05 005026.png` — dos selectores lado a lado: "Sello activo" (dropdown con ícono + texto "Estrella" y flecha) y "Sello inactivo" (dropdown igual, "Estrella"). Debajo de cada uno, una zona de carga de archivo con ícono de "subir imagen" punteado y botón naranja "Seleccione Archivo". Texto de ayuda: **"Minimo SilleSize 200x200 píxeles. Solo formato PNG. 3 megabytes"** `[transcripción literal, incluye error tipográfico "SilleSize" de la competencia — no es nuestro]`.
- `.../Diseño/Captura de pantalla 2026-09-05 005042.png` — dropdown "Sello activo" desplegado mostrando una lista de iconos genéricos (no gastronómicos): Estrella (resaltada/seleccionada, en azul), Abarcar, Afeitado, Almuerzo, Amor, Ancla, Anillo (scrollbar visible, lista más larga, orden alfabético). A la derecha, "Sello inactivo" ya con "Ancla" seleccionado + su zona de carga. Debajo empiezan a asomar los campos "Logo" e "Icono".
- `.../Diseño/Captura de pantalla 2026-09-05 005045.png` — tres campos de carga de imagen: "Logo" (zona de carga + "Seleccione Archivo"; ayuda: "Tamaño recomendado: 480x150 píxeles. La altura mínima es de 150 px. Solo formato PNG. 3 megabytes"), "Icono" (ayuda: "Tamaño de icono recomendado: 512x512 píxeles. La imagen debe ser cuadrada. Solo formato PNG. 3 megabytes"), "Fondo debajo de los sellos" (ayuda: "El tamaño mínimo de archivo es de 1125 x 432 píxeles. Solo formato PNG. 3 megabytes").
- `.../Diseño/Captura de pantalla 2026-09-05 005051.png` — sección "Colores": 6 pares de swatch + input hex:
  - "Fondo de la tarjeta" `#FFFFFF`
  - "Color de texto" `#1F1E1F`
  - "Fondo de sello" `#EAEAED`
  - "Color del contorno" `#AAAAAA`
  - "Sello activo" `#1F1E1F`
  - "Sello inactivo" `#AAAAAA`
  - "Fondo debajo de los sellos" `#F6F6F6`

  Debajo, sección "Nombre de los campos": dos pares dropdown ("Campo") + input de texto libre ("Nombre del campo"):
  - Campo "Usa los sellos hasta obtener una recompensa" → Nombre del campo (texto editable): "Acumula en tus visitas para obtener tu recompensa"
  - Campo "Recompensas disponibles" → Nombre del campo (texto editable): "Recompensas disponibles"

  Es decir: los textos fijos que aparecen en la tarjeta (las etiquetas junto a cada dato) son reescribibles por el dueño del negocio, campo por campo.
- `.../Diseño/Captura de pantalla 2026-09-05 005054.png` — dos toggles (verde = encendido): "Mostrar logotipo en el formulario de emisión de tarjeta" (ON) y "Mostrar color de fondo en el formulario de emisión de tarjetas" (ON), ambos con tooltip "i". Botón final "Continuar" (naranja, ancho completo).

Paleta dominante del editor: fondo gris muy claro (`#F7F7F8` aprox.), texto de labels en naranja/ámbar oscuro para títulos de sección, azul para elementos interactivos (dropdowns, valores), negro para inputs seleccionados/activos. Sin bordes duros marcados: separación por líneas finas grises horizontales entre secciones (similar en espíritu a la regla "sin bordes duros" de nuestro design-system, aunque la competencia sí usa `1px solid` gris tenue para separar bloques).

---

## Tabla de síntesis

| Qué hace la competencia | Cómo se ve | Qué tenemos nosotros | Brecha | ¿Vale la pena? |
|---|---|---|---|---|
| Selector de "tipo de tarjeta" (8 modelos: estampilla, premio, afiliación, descuento, cashback, cupón, suscripción, gift card) antes de diseñar | Grid de 8 tarjetas clicables con badge de retención/adquisición | Un solo modelo fijo: puntos + sellos híbrido (`WalletCard.tsx`, `StampsGrid.tsx`) | Sin equivalente — no existe "elegir modelo de tarjeta" en nuestro producto | IGNORAR — nuestro negocio es un solo restaurante-tenant con una mecánica de fidelidad ya decidida (puntos+sellos), no un catálogo de plantillas para distintos rubros |
| Tarjeta de sellos por visita (Estampilla) | Grid de círculos con ícono de estrella, activo/inactivo | `StampsGrid.tsx`, grid 5×2, check ✓ en vez de estrella, fijo en 10 | Mecánica idéntica; iconografía distinta (✓ vs. estrella) | YA LO TENEMOS MEJOR — nuestro grid está integrado con puntos/tiers y con el tema Black; el de la competencia es un widget aislado sin esa integración |
| Recuento de sellos configurable (1 a 30) | Fila de píldoras numeradas, click para fijar el ciclo | `STAMPS_COUNT = 10` hardcodeado en `wallet-card.md` (fórmula fija) | Real: el dueño no puede cambiar cuántas visitas completan un ciclo de sellos sin tocar código | ADAPTAR — la idea (selector visual del largo del ciclo) es buena, pero implica reconciliar con los umbrales de `reward_tiers` (puntos), que hoy son independientes del conteo de sellos; no es un cambio trivial |
| Selector de ícono de sello (activo/inactivo) desde una librería genérica de iconos | Dropdown con lista alfabética de iconos no temáticos (Abarcar, Afeitado, Almuerzo, Ancla...) | Ícono fijo (✓ o ✓ dorado en tema Black) en `StampsGrid.tsx` | Sin selector de ícono; nuestro ✓ está ligado a la semántica de "check-in cumplido" | IGNORAR — la librería de iconos de la competencia ni siquiera es gastronómica; cambiar nuestro check por un ícono arbitrario le resta claridad semántica sin ganancia real |
| Carga de logo, ícono cuadrado y fondo-bajo-sellos (imágenes por tenant) | 3 zonas de drag & drop con specs de tamaño/formato | No existe: `wallet-card.md` dice explícitamente "color de tarjeta hardcodeado en brand red... branding configurable pendiente"; confirmado también en `ESTADO-REQUERIMIENTOS.md` §5 = NO EMPEZADO | Coincide con una brecha ya documentada por nosotros mismos (Fase E) | ADAPTAR — la necesidad ya está reconocida (§5, Fase E); la ejecución de la competencia (3 campos de upload con specs claras de tamaño) es un buen punto de partida cuando el dueño decida abordarlo |
| 8 campos de color con hex editable (fondo, texto, sello activo/inactivo, contorno, fondo bajo sellos) | Inputs de texto + swatch, sin selector visual de color (color picker nativo) | Paleta fija en `design-system.md` (`#F9F8F6`, `#FF4D6D→#E63946`, `#1a1c1d`...), "Sin config por restaurante en esta fase (YAGNI)" | Misma brecha que arriba: personalización de marca por tenant no implementada | ADAPTAR — mismo caso que la carga de imágenes: la ejecución de la competencia es simple (7-8 hex inputs) y podría servir de referencia mínima si el dueño prioriza esto sobre otras 24 secciones pendientes |
| Reescritura de las etiquetas de texto fijo de la tarjeta ("Recompensas disponibles", etc.) por el dueño | Dropdown de campo + input de texto libre | Todo el texto de la tarjeta está hardcodeado en componentes (`WalletCard.tsx`) y en `template-texts.ts` para WhatsApp, con guardrail explícito de no hornear textos sin decisión del dueño | Sin editor de copy en la tarjeta web; si se traduce, colisiona con la regla "textos cálido no se tocan sin decisión del dueño" | IGNORAR por ahora — no hay pedido del dueño de volver editable el copy de la tarjeta, y agregar un editor de textos libres multiplica superficie de QA (emojis horneados, etc.) sin que nadie lo haya solicitado |
| Toggles "mostrar logo / mostrar color de fondo en el formulario de emisión" | Switch verde con tooltip | No aplica — no tenemos un "formulario de emisión de tarjeta" (nuestra tarjeta se genera automáticamente al registrar el cliente, no hay flujo manual de "emitir") | Sin equivalente porque el modelo de producto es distinto (self-service vs. emisión administrada) | IGNORAR — es una opción de un flujo de emisión manual de tarjetas que nuestro producto no tiene ni necesita (la tarjeta nace del check-in, no de un formulario administrativo) |
| Pases reales de Apple Wallet / Google Wallet (íconos visibles en cada preview) | Botones naranja/gris junto al mock del celular | Solo una página web con estética de wallet (`/tarjeta`); no se genera un `.pkpass` ni un objeto de Google Wallet real | Real: nuestra tarjeta no vive en la app nativa Wallet del teléfono, solo en el navegador | ADAPTAR (a futuro, alto costo) — está fuera del alcance actual (`wallet-card.md` no lo menciona ni en "Próximas Fases"); requeriría certificados PassKit y una integración de Google Wallet API — evaluar solo si el dueño lo pide explícitamente |
| Estado "Tarjeta inactiva" + botón "Activar" + límite "no más de 10 tarjetas" | Badge rojo + botón deshabilitado + texto de aviso | No existe estado inactivo/activo de plantilla de tarjeta en nuestro sistema (un tenant tiene un único diseño de tarjeta, siempre activo) | Sin equivalente — modelo de "plantillas de tarjeta que se activan" no aplica a nuestro single-template-per-tenant | IGNORAR — es un artefacto del modelo multi-plantilla de la competencia (10 tarjetas por cuenta); nosotros no tenemos ese límite ni esa noción |
| Modelo "Descuento" (% acumulado con tier Bronce/Plata) | Card con "PORCENTAJE ACTUAL" + "ESTADO" | Nuestros tiers son por puntos (`reward_tiers.point_threshold`), no por porcentaje de descuento | No es lo mismo: descuento % vs. premio por umbral de puntos | IGNORAR — cambiar de "premio por umbral" a "% de descuento acumulado" es un modelo de negocio distinto, no decidido por el dueño |
| Modelo "Devolución de dinero" (cashback en pesos) | Balance en dinero (`BALANCE 30.00`) | No existe — guardrail explícito: "Ningún premio tiene precio: solo conteos y tasas, nunca pesos" | Conflicto directo de diseño, no una brecha a cerrar | IGNORAR — contradice una decisión de producto ya tomada |
| Modelo "Tarjeta de regalo" (saldo prepago en US$) | Balance en dólares | No existe; no es un requerimiento documentado en §1–§25 | Mismo choque que cashback (dinero explícito) | IGNORAR — mismo guardrail "nunca pesos"; además es un modelo de negocio (prepago/gift card) no solicitado |
| Modelo "Membresía" con foto de socio y "límites disponibles" (cupo de visitas) | Círculo placeholder "FOTO" + nivel + límite | `WalletCard.tsx` muestra nombre, puntos, tier y lista de tiers, pero sin foto de perfil | Foto de perfil no existe en nuestra tarjeta | IGNORAR — no hay captura ni almacenamiento de foto de cliente en el flujo de check-in; agregarlo es una feature nueva sin pedido del dueño |
| Modelo "Suscripción" (cupo de visitas pagas, visualizado con el mismo grid de estrellas que Estampilla) | Mismo widget que sellos, distinta etiqueta de negocio | No aplica — no tenemos modelo de suscripción paga | Sin equivalente; modelo de negocio distinto (pago recurrente vs. fidelidad gratuita) | IGNORAR — fuera del alcance de un programa de fidelidad de check-in |
| Modelo "Cupón" (descuento único con vencimiento, desacoplado de puntos) | Card simple: título + "vencimiento" + valor + código de barras | Los premios de campaña (`reward_grants` tipo `campaign_prize`) ya tienen `expires_at` y aparecen en la tarjeta del cliente como banner "Disponible... vence en X días" (`reward-grants.md`) | El backend de vencimiento ya existe; falta el "look" de tarjeta-cupón independiente en la wallet | YA LO TENEMOS MEJOR en el motor (grants con vencimiento, anti-doble-entrega); la presentación tipo cupón visual no existe pero el dato subyacente sí — no hace falta copiar el modelo, solo eventualmente el estilo visual si el dueño lo pide |

---

## No legible

- Emojis en las 4 capturas de "notificación push" simulada (Descuento, Estampilla, Membresía, Premio): `Vista previa de nuestro servicio de Mensajes Push en el lado lateral con emojis 🎉📱🔥🎊 [no legible con certeza — los emoji son demasiado pequeños para identificarlos uno a uno]`.
- Ninguna otra imagen quedó sin poder transcribir su contenido principal; los campos truncados por la propia UI de la competencia (p. ej. "Tarjeta de descue...", "EL PORCENTAJE ACTUAL ...") se anotaron inline como `[cortado]` con la lectura más probable, no como "no legible" — es un límite de ancho de columna del editor de la competencia, no un problema de la captura.
