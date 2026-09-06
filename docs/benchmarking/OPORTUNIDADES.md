# Oportunidades — 15 mejoras ordenadas por impacto/esfuerzo

Foco: tarjeta visual e interna, y referidos — lo que más mueve la venta a los 25 clientes actuales.
Orden: de mayor a menor (impacto en la venta) ÷ (esfuerzo). Fuente completa por ítem en los 6 documentos
de `docs/benchmarking/`.

1. **Agregar 2 inputs de color en `dashboard/settings`** para `Branding.cardBg`/`pageBg` — ya existen en `src/lib/branding.ts` y en `resolveBranding()`, solo falta la UI. Cierra parte de §5/§6 sin tocar el modelo de datos. (`01-tarjetas-modelo-diseno.md`, `02-tarjetas-informacion-ajustes.md`)
2. **Sumar carga de logo (PNG) al mismo panel de settings**, reusando el campo de branding existente. Efecto visible inmediato en cada demo comercial. (`01-tarjetas-modelo-diseno.md`)
3. **Implementar el programa de referidos ya diseñado en `docs/features/referral-program.md`**: bono de puntos/sellos a referente y referido, con un toggle activo/inactivo — es la brecha más citada de todo el benchmarking (aparece en 3 de 6 lotes) y el §4 pendiente. (`02`, `04`, `06`)
4. **Informe semanal por WhatsApp al dueño** con los KPIs que el dashboard ya calcula (visitas, nuevos clientes, canjes). Cero canal nuevo, solo un cron + una plantilla — la competencia lo hace por email/Telegram sin más lógica que la que nosotros ya tenemos. (`05-configuraciones.md`)
5. **Panel de reseñas de Google agregadas en el dashboard**: el dato ya se captura en el flujo de `GoogleReviewModal`, falta visualizarlo en una card del tablero. (`04-dashboard.md`)
6. **Columna "Calificación" en `/dashboard/customers`**: mismo dato de reseña, expuesto por fila de cliente en vez de solo en el modal. (`06-automatizacion-scaner-roles.md`)
7. **Selector de rango de fechas global en el dashboard** (Hoy / 7 días / 30 días / 12 meses). Mejora de usabilidad barata, sin chocar ningún guardrail de dominio. (`04-dashboard.md`)
8. **Hacer configurable el largo del ciclo de sellos** (hoy `STAMPS_COUNT=10` fijo). Da flexibilidad comercial real al vender a restaurantes con frecuencia de visita muy distinta entre sí — requiere reconciliar con `reward_tiers`, no es trivial. (`01-tarjetas-modelo-diseno.md`)
9. **Wizard de paleta con preview en vivo al dar de alta un tenant nuevo** (selector de color + logo, mock de teléfono actualizándose). Acorta el onboarding comercial de cada cliente nuevo. (`03-tarjetas-plantillas.md`)
10. **Checkbox de consentimiento explícito en el check-in** si se agrega algún campo de dato personal nuevo (p. ej. cumpleaños) — requisito de cumplimiento antes del punto 11, no opcional. (`02-tarjetas-informacion-ajustes.md`)
11. **Bono automático de puntos/sellos en el cumpleaños del cliente**: el cron de cumpleaños ya envía el mensaje, falta que también acredite el bono — extensión de algo que ya corre. (`02-tarjetas-informacion-ajustes.md`)
12. **Tablero de KPIs de referidos** (instalaciones, conversión, nuevos miembros) una vez implementado el punto 3 — es lo que se muestra en la demo de venta, no solo el backend. (`04-dashboard.md`)
13. **Filtros guardados ("Mis segmentos") en `/dashboard/customers`**: incremento chico sobre los filtros de sesión (tier/fuente/estado) que ya existen. (`06-automatizacion-scaner-roles.md`)
14. **Usar el modelo del App Scanner de la competencia como referencia visual** al escribir el spec de §19 (ya cerrado por el dueño el 2026-09-05): dispositivo del restaurante, mesero elegido por operación, PIN solo en la redención — es exactamente lo que Novu ya tiene en producción. (`06-automatizacion-scaner-roles.md`)
15. **Evaluar segmentación tipo RFM con nombres de segmento persistentes** (Campeones, En riesgo, Dormido) recién después de resolver la deuda 17.b ("quién es Black" difiere hoy entre tarjeta y panel) — si no, se suma una tercera fuente de verdad de niveles. (`04-dashboard.md`, `05-configuraciones.md`)

## Fuera de esta lista, a propósito

Cashback en dinero, tarjeta de regalo prepaga, ingresos/ROI en US$, acumulación por monto de compra,
Geo-Push, integraciones POS (GloriaFood/Square/Shopify) y webhooks de salida: todas chocan con un
guardrail de dominio ya decidido (**"ningún premio tiene precio"**) o representan una categoría de
producto distinta sin pedido del dueño. Quedan documentadas en los 6 lotes como **IGNORAR**, no como
oportunidad — copiarlas exigiría revertir una decisión de producto, no una mejora incremental.
