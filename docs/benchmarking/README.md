# Benchmarking de la competencia — índice

Fuente: `Benchmarking para CADA1/` (98 capturas, competidor identificado en casi todas: **Novu App** /
`app.novuapp.ai`, SaaS genérico de tarjetas de fidelidad multi-rubro, no específico de restaurantes).

Método: cada lote se procesó por separado (para no degradar la lectura), citando cada observación con
la ruta exacta del archivo. Regla dura aplicada en los 6 documentos: lo cortado, borroso o ambiguo se
marcó `[no legible]` o `[se intuye, sin confirmar]` — nunca como hecho. Ver la lista completa al final
de este índice.

## Documentos

| Archivo | Área | Capturas |
|---|---|---|
| [01-tarjetas-modelo-diseno.md](01-tarjetas-modelo-diseno.md) | Modelos de tarjeta (Cupón, Descuento, Devoluciones, Estampilla, Membresía, Premio, Suscripción, Tarjeta regalo) + editor de diseño visual | 27 |
| [02-tarjetas-informacion-ajustes.md](02-tarjetas-informacion-ajustes.md) | Textos de la tarjeta, referidos, reglas de acumulación, formulario de emisión, límites operativos | 20 |
| [03-tarjetas-plantillas.md](03-tarjetas-plantillas.md) | Galería de plantillas por rubro + pantallas de entrada al módulo | 15 |
| [04-dashboard.md](04-dashboard.md) | Tablero: finanzas, tendencias, segmentación, reseñas, referidos | 15 |
| [05-configuraciones.md](05-configuraciones.md) | Perfil, Integraciones, Notificaciones, RFM, Servicios, Webhooks | 12 |
| [06-automatizacion-scaner-roles.md](06-automatizacion-scaner-roles.md) | Automatización, App Scáner (mesero), Gerentes, Geo-Push, Base de clientes | 8 |
| [OPORTUNIDADES.md](OPORTUNIDADES.md) | Sintesis final: 15 mejoras ordenadas por impacto/esfuerzo | — |

**Total: 97 capturas citadas por ruta** (el pedido original decía 98; el conteo real de archivos no
`desktop.ini` en `Benchmarking para CADA1/` es 97 — cada lote confirmó su carpeta con `Glob` antes de
leer, no hay ninguna captura fuera de alcance).

## Choque de fondo, transversal a los 6 lotes

Novu está construido alrededor de **dinero**: ingresos brutos, ROI, cashback en US$, tarjeta de regalo
prepaga, ingreso por monto de compra escaneado. Nuestro guardrail de dominio es el opuesto y explícito
(`CLAUDE.md`): *"Ningún premio tiene precio: solo conteos y tasas, nunca pesos."* Toda fila de las tablas
de síntesis marcada **IGNORAR** por este motivo no es una omisión nuestra — es un choque con una decisión
de producto ya tomada. No se recomienda revisar esa decisión sin que el dueño lo pida.

## Lo que ya tenemos mejor (confirmado en más de un lote)

- Heatmap de actividad con zona horaria Colombia ya resuelta (ellos, vacío, sin verificar que funcione).
- `StampsGrid` integrado con puntos/tiers/tema Black (ellos, widget aislado sin esa integración).
- Multi-sede estructural (`FK compuesta`, `resolveHostContext()`) vs. su lista plana de direcciones.
- Gobernanza de envío con reserva atómica (`send-governance.md`) vs. "conectar cuenta" simple.
- Exportar/Importar CSV de clientes: mismo alcance, sin brecha.

## Brechas reales más grandes (sin choque de guardrail)

- **Referidos**: no implementado (`docs/features/referral-program.md` = PLAN). Confirmado como hueco en
  los lotes 02, 04 y 06 — es la brecha que más veces aparece de forma independiente.
- **Branding de tarjeta por tenant**: el modelo ya tiene `cardBg`/`pageBg` en `src/lib/branding.ts`, pero
  sin UI en `dashboard/settings` — brecha de interfaz, no de arquitectura (lote 02).
- **Informe periódico al dueño** (email/Telegram en su caso, WhatsApp en el nuestro): no existe en
  absoluto (lote 05).
- **Webhooks de salida** y **segmentación RFM configurable**: no existen; en ambos casos requieren
  decisión de producto del dueño antes de estimar esfuerzo (lotes 05 y 06).

## Todo lo marcado `[no legible]` o `[se intuye, sin confirmar]`

- **Lote 1**: emojis en las 4 capturas de notificación push simulada (Descuento, Estampilla, Membresía, Premio) — demasiado pequeños para identificar.
- **Lote 2**: fila "Múltiples recompensas" cortada en `Información/005119.png`; valor de "Tipo de recompensa" truncado en `Ajustes/004706.png` ("Orden (valor absolut)"); posible duplicado de política de privacidad en `Ajustes/004825.png` sin confirmar.
- **Lote 3**: texto completo de "ACUMULA EN TUS VISITA…" / "RECOMPENSAS DISPONI…" en las 13 capturas de `Plantillas/`; texto superpuesto sobre el código de barras en las 15 capturas del lote; "2 recompen…" cortado en `Tarjetas/004040.png`; función de 3 íconos circulares (Apple/reloj/compartir) en la misma captura, sin tooltip visible.
- **Lote 4**: función exacta de los íconos de sidebar sin etiqueta y del tercer ícono del topbar (`Dashboard/003334.png`); tipo de gráfico en las cards vacías de demografía, canales, puntos y referidos (varias capturas, todas sin datos); contenido detrás del tab "Finanzas"; formato real de "Comentarios" y "Reseñas de Google recopiladas" (`003459.png`).
- **Lote 5**: lista de integraciones cortada en "Shopify POS" (`Integraciones/005758.png`), sin saber si hay más filas; función del elemento "SANDBOX" repetido en el borde de `Servicios/005833.png`; posible typo "CONTACIÓN DE EVENTOS" en el listado de Webhooks; hex de colores de marca aproximados, no verificados contra CSS real.
- **Lote 6**: etiqueta "Coogle Pay" en la columna Dispositivo de `Base de clientes/005421.png` — probable error de captura por "Google Pay", sin confirmar.

Ninguno de estos huecos bloquea las recomendaciones de `OPORTUNIDADES.md`: son detalles menores de UI de
la competencia, no brechas nuestras.
