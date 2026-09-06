# Benchmarking — Dashboard de la competencia

> Lote: `Benchmarking para CADA1/Dashboard/` (15 capturas, 2026-09-05 00:33–00:35).
> Plataforma identificada por el logo del topbar: **NOVU** (naranja `#F97316` aprox., texto en mayúsculas, fuente sans-serif geométrica).
> Cuenta de demo/nueva: casi todos los widgets muestran `0`, `0%`, `0 US$` o el estado vacío `Not enough data here yet` (en inglés, sin traducir — inconsistencia de localización de ellos). Es una sola vista de **Tablero** recorrida con scroll: el header con topbar/sidebar solo aparece en la primera captura; el resto son secciones de la misma página.

## 0. Chrome general (topbar + sidebar)

`Benchmarking para CADA1/Dashboard/Captura de pantalla 2026-09-05 003334.png`

- **Topbar** (fondo gris oscuro casi negro, `#2E2E2E` aprox.): logo "NOVU" en naranja arriba a la izquierda. A la derecha: "Hola / Daniel" (saludo con nombre de usuario, dos líneas) con flecha de dropdown, luego 4 iconos circulares — campana (notificaciones), "i" (info/ayuda), un icono que parece de privacidad/bloqueo `[se intuye, sin confirmar]`, y avatar de perfil.
- **Sidebar** (fondo blanco, angosto, solo iconos, sin etiquetas de texto visibles): de arriba abajo — casa (naranja, activo/seleccionado = Tablero), un documento/tarjeta, un regalo con badge verde "NEW", personas (clientes/miembros), un chat/mensajes, un pin de ubicación, una persona (¿perfil/equipo?). Iconos sin texto: la función exacta de cada uno no es legible, solo se infiere por el pictograma — `[se intuye, sin confirmar]`.
- **Header de contenido:** título "Tablero" + toggle "Nuevo" / "Viejo" (dos versiones del dashboard conviven, la nueva está seleccionada). A la derecha, selector de rango de fechas con pills: "Hoy", "Últimos 7 días", "Últimas 4 semanas", "Últimos 6 meses", "Últimos 12 meses", "Mes hasta la fecha", "Periodo" (custom).
- Tipografía: sans-serif genérica (aspecto de sistema, Inter/similar), sin serifs en ningún texto observado.
- Iconografía: outline, minimalista, monocromo gris salvo el naranja de marca y los puntos de color de las leyendas de gráficos.

## 1. Resumen financiero / Ganancia (Hoy)

`Captura de pantalla 2026-09-05 003334.png`

- Card grande "Hoy - 05 Septiembre 2026" con toggle interno "Ganancia" / "Visitas" (pestañas, "Ganancia" seleccionada).
- Debajo, 3 métricas con bullet de color: "Ingresos brutos" (celeste), "Ingresos por fidelización" (azul), "Ingresos por referencias" (magenta) — cada una en "0 US$".
- Gráfico de líneas por hora (00:00 a 22:00, cada 2h) debajo, vacío (todo en 0).
- Columna derecha con 3 KPIs numéricos: "Nuevas visitas" (verde), "visitas repetidas" (azul), "Referencias" (rojo) — todos en 0.
- Fila de 4 tarjetas KPI con icono "i" y variación %: "Ingresos brutos" (0 US$, 0%), "Ingresos por fidelización" (0 US$, 0%), "Valor de vida del cliente" (0 US$, 0%), "Retorno de la inversión" ("1 US$ → 0 US$", 0%).
- Banner verde con icono, texto: *"Cada 1 US$ invertido te genera 0 US$ como retorno de la inversión"* — mensaje dinámico de ROI con botón de cerrar (×).
- Botón/tab inferior "Finanzas" (parece ser un acordeón o navegación a otra sección) + icono de expandir/contraer en la esquina inferior derecha.

## 2. Desglose de ingresos (Ingresos totales / Ingresos añadidos)

`Captura de pantalla 2026-09-05 003353.png`

- Panel izquierdo "Ingresos totales" con badge "0 US$" y "0%" + icono "−" (indicador de tendencia neutra/sin cambio). Desglose en lista con bullets de color:
  - "Ingresos por miembros recurrentes" (violeta) — 0 US$
  - "Ingresos por nuevos miembros" (celeste) — 0 US$
  - "Ingresos por miembros referidos" (magenta) — 0 US$
  - "Ingresos de clientes desconocidos" (gris) — 0 US$
  - Línea "Total" — 0 US$ (con línea punteada de separación tipo factura).
- Panel derecho "Ingresos añadidos" con badge "0 US$", "0%", gráfico de dona/pie vacío (centro "0 / Total"), leyenda: "Miembros leales" (violeta), "Referencias" (magenta).

## 3. Inversión y ROI

`Captura de pantalla 2026-09-05 003404.png`

- Panel izquierdo "Inversión total" (badge naranja "0 US$", 0%): desglose "Pago de plataforma" (violeta) y "Costo de las recompensas" (naranja/rojo) — Total 0 US$.
- Panel derecho "Retorno de la inversión" (badge violeta "0 US$", 0%): fórmula visual "Inversión total" − "Ingresos añadidos" = "Ganancia" (0 US$ cada uno).

## 4. Tendencias temporales (visitas, ingresos, clientes activos, gasto)

`Captura de pantalla 2026-09-05 003415.png`, `003422.png`

- 4 cards en grilla 2×2: "Tendencia de visitas", "Tendencia de ingresos", "Tendencia de clientes activos", "Tendencia del gasto promedio".
- Todas comparten el mismo estado vacío: icono de sol/flor (línea, gris) + texto en inglés **"Not enough data here yet"** — sin traducir al español, inconsistencia de ellos.
- Cada card tiene el icono "i" de ayuda arriba a la derecha (patrón repetido en todo el dashboard: cada widget explica su métrica al hover/click del ícono info).

## 5. Actuación (engagement) y actividad horaria

`Captura de pantalla 2026-09-05 003429.png`

- Banda "Actuación" (parece un acordeón/sección colapsable, con icono de expandir a la derecha) con 3 KPIs: "Tasa de matriculación" 100% (0%), "Tasa de participación" 100% (0%), "Tasa de abandono" 0% (0%).
- "Tasa de retención de clientes" (gráfico vacío) y "Actividad del tiempo" — este último aclara **"Tu hora local GMT -05:00"**, sugiere un heatmap de actividad por hora/día (equivalente a nuestro heatmap), vacío en esta captura.

## 6. Adquisición de miembros y canales

`Captura de pantalla 2026-09-05 003437.png`

- KPI "0 — Total de no miembros (estimado)" (0%).
- "Nuevos clientes por meses" (gráfico de barras/línea temporal, vacío).
- "Canales de instalación de tarjetas" (vacío) — sugiere tracking de por dónde el cliente instaló la tarjeta digital (wallet): QR, link directo, etc. `[se intuye, sin confirmar]`, sin datos para verificar categorías reales.

## 7. Demografía de clientes

`Captura de pantalla 2026-09-05 003443.png`

- "Edad de los clientes" y "Género": dos cards vacías, formato de gráfico no determinable sin datos (probablemente barras o dona) — `[no legible]` el tipo exacto de chart.

## 8. Ranking de clientes

`Captura de pantalla 2026-09-05 003447.png`

- "Los 5 mejores miembros" con toggle "Ganancia" / "Visitas" (pestañas, "Ganancia" seleccionada) — tabla/lista vacía en esta captura, sin filas de ejemplo visibles.

## 9. Reseñas y comentarios

`Captura de pantalla 2026-09-05 003453.png`, `003459.png`

- "Calificación de retroalimentación" (con subtítulo "Todo el tiempo" = filtro de periodo) y "Calificación total de comentarios": ambas vacías.
- "Comentarios" con filtro por número de estrellas: pills "1", "2", "3", "4", "5", "Todos" (seleccionado) + subtítulo "Todo el tiempo".
- "Reseñas de Google recopiladas": card dedicada a trackear reseñas de Google específicamente (separada de "comentarios" genéricos, que parecen ser feedback interno/NPS).

## 10. Segmentación de clientes (tipo RFM)

`Captura de pantalla 2026-09-05 003505.png`, `003540.png`

- "Total de clientes por segmentos": gráfico de línea/dispersión con 10 segmentos nombrados en la leyenda, cada uno con color propio:
  **Principiantes** (celeste), **Crecimientos** (azul claro), **Campeones** (azul), **Dudoso** (amarillo), **Medio** (ámbar), **Leal** (violeta), **Durmiendo** (gris), **En riesgo** (rojo), **Necesita atención** (rojo oscuro), **Inactivo** (bordó).
- "Ingresos totales por segmentos", "Ingresos promedio/cliente por segmentos", "Compras totales por segmentos": mismos 10 segmentos, ejes vacíos (0 US$ en cada uno).
- Esto es un modelo de segmentación tipo RFM (Recency/Frequency/Monetary) con 10 categorías fijas, aplicado transversalmente a ingresos, visitas y compras.

## 11. Puntos y recompensas

`Captura de pantalla 2026-09-05 003545.png`

- Dos cards: "Puntos" y "Recompensas", ambas vacías (mismo patrón de estado vacío). No se distingue el tipo de gráfico ni columnas por falta de datos.

## 12. Programa de referidos

`Captura de pantalla 2026-09-05 003551.png`

- 4 KPIs: "0 — Tarjetas instaladas por referidos" (0%), "0 — Nuevos miembros referidos" (0%), "0% — Conversión de referencias" (0%), "0 US$ — Ingresos por referencias" (0%).
- Dos gráficos debajo: "Tarjetas instaladas por referidos" y "Nuevos miembros referidos" (ambos vacíos, forma no determinable).

## No legible

- El propósito exacto de cada icono de la sidebar (documento/tarjeta, regalo "NEW", chat, pin, persona) — sin etiquetas de texto visibles, solo pictogramas. `Captura de pantalla 2026-09-05 003334.png`
- El tercer icono del topbar (posible privacidad/modo oculto) — forma ambigua a esta resolución. `Captura de pantalla 2026-09-05 003334.png`
- Tipo de gráfico (barra, dona, línea) en "Edad de los clientes", "Género", "Canales de instalación de tarjetas", "Puntos", "Recompensas", "Tarjetas instaladas por referidos", "Nuevos miembros referidos": todas están vacías (`Not enough data here yet`), sin ejes ni forma dibujada que permita confirmarlo. `Captura de pantalla 2026-09-05 003437.png`, `003443.png`, `003545.png`, `003551.png`
- Qué hay detrás del botón/tab "Finanzas" al pie de la primera captura (¿navega a otra sección, o es un acordeón?). `Captura de pantalla 2026-09-05 003334.png`
- Contenido completo de "Comentarios" y "Reseñas de Google recopiladas" — sin ejemplos de datos, no se ve el formato de una reseña individual (texto, estrellas, avatar). `Captura de pantalla 2026-09-05 003459.png`

---

## Tabla de síntesis

| Qué hace la competencia | Cómo se ve | Qué tenemos nosotros | Brecha | ¿Vale la pena? |
|---|---|---|---|---|
| Resumen financiero del día con ROI, ingresos brutos/fidelización/referencias, banner "cada $1 invertido genera $X" | Card destacada arriba de todo, toggle Ganancia/Visitas, gráfico horario, banner verde dinámico | No existe: `docs/features/reward-grants.md` es explícito — "ningún premio tiene precio: solo conteos y tasas, nunca pesos" (guardrail de dominio) | Total. Es una decisión de producto nuestra, no un olvido. | **IGNORAR** — choca de frente con un guardrail documentado (`CLAUDE.md`: "Ningún premio tiene precio: solo conteos y tasas, nunca pesos"). Adoptarlo exige que el dueño cambie esa decisión primero. |
| Selector de rango de fechas con pills (Hoy/7d/4sem/6m/12m/MTD/Periodo custom) | Pills horizontales arriba a la derecha del tablero | `MetricsCards`/`VisitsChart`/etc. no documentan un selector de rango equivalente en `docs/features/dashboard.md` — el panel usa datos fijos por endpoint (`getFullAnalytics()`) | No confirmado sin ver el código de cada gráfico; el doc no menciona filtro de fecha global | **ADAPTAR** — un selector de periodo global es una mejora de usabilidad barata y no choca con ningún guardrail. Vale la pena evaluarlo con el dueño. |
| Desglose de ingresos por tipo de miembro (recurrente/nuevo/referido/desconocido) | Lista con bullets de color + gráfico de dona | No aplica — no medimos ingresos (ver fila 1) | Mismo choque que la fila 1 | **IGNORAR** — mismo guardrail de "sin pesos". |
| Segmentación de clientes en 10 categorías tipo RFM (Principiantes, Crecimientos, Campeones, Dudoso, Medio, Leal, Durmiendo, En riesgo, Necesita atención, Inactivo) | Gráfico de línea con leyenda de 10 colores, replicado en 4 vistas (clientes, ingresos, ingreso promedio, compras) | Tenemos `POWER_RANKS` (rankings.ts, niveles de poder) y `RISK_LEVELS` (grupos en riesgo por días, ahora en `/dashboard/campaigns`), y el tier "Black" (10+ visitas) — pero son 2-3 categorías, no una segmentación RFM de 10 niveles | Grande. Nuestra segmentación es más simple y está repartida en 2 pantallas distintas, no unificada | **ADAPTAR** — una segmentación más rica (tipo RFM) mejora la orientación de campañas, pero antes hay que resolver la deuda 17.b ("quién es Black" difiere entre tarjeta y panel) para no sumar una tercera fuente de verdad de niveles. |
| Tendencias temporales (visitas, ingresos, clientes activos, gasto promedio) como 4 gráficos separados | Grilla 2×2 de cards, estado vacío ilustrado | Tenemos `VisitsChart` (área QR vs Domicilios) y `GrowthChart` (nuevos clientes + acumulado) — cubre visitas y clientes, no "gasto promedio" (no aplica sin precios) ni "ingresos" | Parcial — gasto promedio no aplica por el guardrail de "sin pesos"; visitas/clientes ya cubiertos | **YA LO TENEMOS MEJOR** (para visitas/clientes) — nuestros gráficos ya combinan QR+Domicilios y nuevos+acumulado en menos cards. |
| "Actividad del tiempo" (heatmap horario, con aclaración de zona horaria local) | Card con leyenda "Tu hora local GMT-05:00", vacía | `VisitHeatmap` ya existe y ya resuelve el mismo problema (conversión UTC→América/Bogotá documentada en `docs/features/dashboard.md` "Heatmap — Zona horaria Colombia") | Ninguna — ya lo tenemos y con el mismo cuidado de zona horaria | **YA LO TENEMOS MEJOR** — el nuestro ya está resuelto y documentado; el de ellos ni siquiera tiene datos para confirmar que funciona. |
| Engagement: tasa de matriculación, participación, abandono, retención | 3 KPIs + 2 gráficos (retención, actividad) | No hay equivalente directo documentado en `dashboard.md`; lo más cercano es `ReactivationRateChart` (tasa de reactivación) | Parcial — tenemos reactivación pero no matriculación/participación/abandono como KPIs propios | **ADAPTAR** — tasa de abandono (churn) complementaría bien `AtRiskBubbles`/`RISK_LEVELS`, que ya identifican al cliente en riesgo pero no resumen un % agregado. |
| Demografía (edad, género) | 2 cards, vacías, tipo de gráfico no confirmable | No existe — no se recolecta edad/género del cliente en el modelo actual (`docs/DB_SCHEMA.md` no se revisó campo a campo, pero no aparece en ningún doc de feature) | Requiere primero decidir si se captura ese dato en el registro (impacto en formulario de check-in) | **IGNORAR** por ahora — no es un dato que hoy se recolecte; agregarlo es una decisión de producto más grande que una mejora de panel. No adivinamos si el dueño lo quiere. |
| Reseñas de Google + calificación de comentarios + filtro por estrellas | 2 KPIs, filtro de estrellas (1-5 + Todos), card "Reseñas de Google recopiladas" | Tenemos `GoogleReviewModal` (pop-up post check-in con premio, `docs/features/review-flow.md`) pero **no** un panel de dashboard que agregue/visualice las reseñas recolectadas | El flujo de captura existe; falta el panel de reporting sobre lo capturado | **ADAPTAR** — ya se capturan datos de reseña (funnel del modal); armar un widget que los agregue en el dashboard es una extensión natural, no una feature nueva. |
| Programa de referidos: tarjetas instaladas, nuevos miembros referidos, conversión, ingresos por referencia | 4 KPIs + 2 gráficos | `docs/features/referral-program.md` — **Estado: PLAN, NO IMPLEMENTADO** | Total, pero ya está diseñado y aprobado, solo falta desarrollo | **ADAPTAR** (a futuro) — cuando se implemente el programa de referidos ya planeado, estos KPIs (conversión, instalaciones, nuevos miembros) son el tablero natural que le falta. No hay nada que copiar hoy porque la base ni existe. |
| Canales de instalación de tarjeta (wallet) | Card vacía, sin categorías visibles | No documentado en `dashboard.md`; `AcquisitionChannelChart` existe mencionado en el código (`docs/features/dashboard.md` línea de componentes de `getFullAnalytics`) pero es de *adquisición de cliente*, no de *canal de instalación de wallet* específicamente | No confirmado sin ver `AcquisitionChannelChart` en detalle | **No podemos juzgar la brecha** sin abrir el componente — no se adivina si "canal de adquisición" y "canal de instalación de tarjeta" son la misma cosa en nuestro sistema. |
| Puntos y Recompensas como widgets propios del tablero principal | 2 cards vacías, sin distinguir contenido | Tenemos sistema de puntos y mystery box completo (`docs/features/points-mystery-box.md`) y `reward-grants.md`, pero como páginas propias (`/dashboard/rewards`), no como widget resumen en el tablero principal | Es de organización de la información, no de funcionalidad faltante | **YA LO TENEMOS MEJOR** en profundidad (Mystery Box, grants con dos sedes — ganada/entregada), pero **ADAPTAR** la idea de un resumen compacto en el tablero principal si el dueño quiere verlo de un vistazo sin entrar a `/dashboard/rewards`. |
| Icono "i" (info/ayuda) en cada widget explicando la métrica | Repetido en absolutamente todos los widgets del tablero | No confirmado — no se relevó si `MetricsCards` u otros componentes tienen tooltips de ayuda | No se puede juzgar sin revisar cada componente | **ADAPTAR** — es barato (un tooltip) y mejora la curva de aprendizaje del dueño/admin sin conocimiento técnico. |
| Toggle "Nuevo" / "Viejo" para dos versiones del dashboard | Pills junto al título "Tablero" | No aplica — no tenemos (ni necesitamos) dos versiones convivientes del panel | Ninguna, es deuda técnica de ellos (migración en curso), no una feature a copiar | **IGNORAR** — es un artefacto de su propia migración interna, no una funcionalidad de producto. |

## Notas finales

- La cuenta capturada está prácticamente sin datos ("Not enough data here yet" en casi todos los widgets), así que el **contenido real** de gráficos con datos, formato exacto de "Comentarios" o "Reseñas de Google" individuales, y las categorías reales de "Canales de instalación de tarjetas" quedaron sin poder confirmarse — quedó documentado en `## No legible`.
- El choque más importante contra nuestra arquitectura es el modelo de negocio: NOVU está construido alrededor de **ingresos y ROI en dinero** (ingresos brutos, valor de vida del cliente, retorno de inversión, costo de recompensas). Nuestro sistema tiene la decisión contraria y explícita: "Ningún premio tiene precio: solo conteos y tasas, nunca pesos" (`CLAUDE.md`). Cualquier fila de la tabla de arriba marcada como ligada a "ingresos"/"US$" no se copia sin que el dueño decida cambiar esa premisa de fondo — no es una mejora incremental, es un cambio de modelo.
