# Changelog — RestaurantQR

> Formato: [Semantic Versioning](https://semver.org/)
> Cada entrada incluye: fecha, tipo, archivos afectados, request original.

---

## [1.0.1] — 2026-05-25 — Algoritmo inteligente de puntos + Plantillas dopamínicas v1.0

### Changed

**Algoritmo de puntos inteligente (`points.service.ts`):**
- `generateSmartVisitPoints()` reemplaza al random simple. Visita 1: 60-90 pts (alto, crea ilusión de 2 visitas). Visita 2: sistema limita para dejar 5-30 pts corto del umbral. Visita 3: garantiza cruzar → PREMIO.
- `awardVisitPoints()` ahora consulta tiers para encontrar el próximo umbral y usa el algoritmo inteligente.
- Nuevas constantes: `DEFAULT_POINTS_SHORTFALL_MIN=5`, `DEFAULT_POINTS_SHORTFALL_MAX=30`, `MINIMUM_VISIBLE_POINTS=15`.
- Rango default actualizado: `DEFAULT_POINTS_PER_VISIT_MIN=60`, `DEFAULT_POINTS_PER_VISIT_MAX=90`.

**Plantillas WhatsApp (`docs/PLANTILLAS.md`):**
- Reescritura completa de PLANTILLAS.md para sistema de puntos. 13 plantillas (11 texto + 2 media).
- Tono dopamínico: cálido, cercano, enérgico. Eliminado lenguaje genérico ("estás a un paso 👊").
- Todas las plantillas ahora incluyen puntos actuales, progreso, y anticipación de mystery box.
- Plantilla "cerca": "¡Casi lo lograste! La próxima visita tenés tu bebida o si querés probar suerte, la Mystery Box 🎲"
- Plantilla "lejos": muestra roadmap completo de tiers con emojis.
- Reactivación en 2 niveles: suave (21d) y agresiva (25d+) ambas con puntos.

**Migración seeds:**
- `00013_points_mystery_box.sql` — Seeds actualizados: `points_per_visit_min=60`, `points_per_visit_max=90`.

**Feature doc:**
- `docs/features/points-mystery-box.md` — Sección 2.2 reescrita con matemáticas del algoritmo inteligente y ejemplo paso a paso.

### Archivos afectados
- `src/services/points.service.ts`
- `src/constants/rewards.ts`
- `docs/PLANTILLAS.md` *(reescritura completa)*
- `docs/features/points-mystery-box.md`
- `supabase/migrations/00013_points_mystery_box.sql`
- `CHANGELOG.md`

---

## [1.0.0] — 2026-05-25 — Sistema de Puntos + Mystery Box (reestructuración mayor)

### Added

**Base de datos (migración 00013):**
- `supabase/migrations/00013_points_mystery_box.sql` — Nuevas tablas: `reward_tiers` (progresión acumulativa por puntos), `point_transactions` (historial de puntos), `mystery_box_results` (resultados de cajas), `mystery_box_global_caps` (límites globales de premios altos). Nuevas columnas en `customers`: `total_points`, `current_tier`, `mystery_box_low_streak`, `last_points_awarded_at`. Columnas legacy-compat en `rewards`: `point_threshold`, `tier_id`. Seeds: 4 tiers default (Bronce/Plata/Oro/BLACK), admin_settings de puntos, global cap de platos fuertes.

**Servicios:**
- `src/services/points.service.ts` — Generación de puntos aleatorios con distribución triangular, `awardVisitPoints()`, `awardWelcomeBonus()`, `awardPoints()`, `getPointsConfig()`, `getPointHistory()`.
- `src/services/mystery-box.service.ts` — Resolución de Mystery Box con probabilidades ponderadas, Pity Timer (Golden Box), global caps con redistribución automática, near-miss effect, `resolveMysteryBox()`, `isPityTimerActive()`, `selectPrize()`, `applyGoldenBox()`.
- `src/services/reward-tiers.service.ts` — CRUD de tiers, evaluación de umbrales (`evaluateNewTier()`), roadmap de tiers (`buildTiersRoadmap()`), `getNextTier()`, `getCurrentTier()`.

**Endpoints:**
- `src/app/api/mystery-box/resolve/route.ts` — POST: resuelve mystery box o safe reward, envía plantilla WhatsApp, registra resultado.

**Tipos:**
- `src/types/database.types.ts` — Nuevos tipos: `PointTransaction`, `PointTransactionSource`, `RewardTier`, `MysteryPrize`, `MysteryBoxResult`, `MysteryBoxChoice`, `MysteryBoxGlobalCap`, `GlobalCapPeriod`.

**Constantes:**
- `src/constants/rewards.ts` — `REACTIVATION_AGGRESSIVE_DAYS=25`, `DEFAULT_POINTS_PER_VISIT_MIN/MAX`, `DEFAULT_WELCOME_BONUS_POINTS`, `DEFAULT_EVENT_BONUS_POINTS`, `DEFAULT_PITY_TIMER_THRESHOLD`, `POINT_SOURCES`.

**Documentación:**
- `docs/features/points-mystery-box.md` — Documento de diseño completo: modelo de puntos, reward tiers, mystery box, pity timer, global caps, flujo del cliente, plantillas, plan de implementación.

### Changed
- `src/app/api/check-in/route.ts` — Integrado sistema de puntos: otorga puntos aleatorios por visita, evalúa tier progression, responde con `tier_unlocked` o `points_earned`, mantiene fallback legacy a plantillas de visitas.
- `src/app/api/cron/reactivation/route.ts` — Dos niveles de reactivación: suave (21d) con plantilla original + agresivo (25d+) con puntos y tier info.

### Archivos afectados
- `supabase/migrations/00013_points_mystery_box.sql` *(nuevo)*
- `src/services/points.service.ts` *(nuevo)*
- `src/services/mystery-box.service.ts` *(nuevo)*
- `src/services/reward-tiers.service.ts` *(nuevo)*
- `src/app/api/mystery-box/resolve/route.ts` *(nuevo)*
- `src/types/database.types.ts`
- `src/constants/rewards.ts`
- `src/app/api/check-in/route.ts`
- `src/app/api/cron/reactivation/route.ts`
- `docs/features/points-mystery-box.md` *(nuevo)*

### Request original
> Reestructuración del sistema de fidelización: migrar de milestones lineales por visita a sistema de puntos aleatorios acumulativos con Mystery Box (ruleta de probabilidades), Pity Timer (Golden Box tras racha de premios bajos), global caps para premios de alto valor, reward tiers progresivos (Bronce→Plata→Oro→BLACK), reactivación en dos niveles (21d suave + 25d agresivo), tono dopamínico Meta-compliant.

---

## [0.35.0] — 2026-05-24 — Plantillas WhatsApp con media + auto-compresión + cron calendar-dispatch

### Added

**Auto-compresión de imágenes (`sharp`):**
- `src/app/api/dashboard/calendar/media-upload/route.ts` — Imágenes subidas al bucket se comprimen automáticamente con `sharp`: resize a max 1920×1920px (sin ampliar), output JPEG 80%, progressive. El dueño puede subir hasta 30 MB de entrada; el sistema garantiza que el resultado quede bien bajo el límite de 5 MB de WhatsApp. Videos: se mantiene la validación de 16 MB directa con mensaje de error descriptivo. Respuesta ahora incluye `bytes` (comprimido), `original_bytes`, `compressed` (boolean).
- `package.json` — `sharp ^0.34.5` como dependencia de producción (ya estaba en el lockfile).

**Plantillas de media Twilio (`twilio/media`):**
- `scripts/twilio-create-media-templates.mjs` — Script de setup que crea dos plantillas tipo `twilio/media` en Twilio Content API: `evento_imagen_<brand>` (imagen JPG/PNG) y `evento_video_<brand>` (MP4). Variables: `{{1}}`=nombre cliente, `{{2}}`=restaurante, `{{3}}`=título evento, `{{4}}`=fecha, `{{5}}`=CTA, `{{6}}`=URL del media (dinámica al enviar). Auto-envía para aprobación Meta con categoría MARKETING. Imprime los SIDs para agregar en `admin_settings`.

**Path de envío de eventos del calendario:**
- `src/services/campaign.service.ts` — Nueva función `createCalendarCampaign({ name, templateSid, mediaUrl, mediaType, filters })`: crea campaign con `type='manual'` y `source='calendar'` para que cuente en el cap mensual de marketing.
- `src/services/calendar.service.ts` — Nueva función `executeAutoEvent(eventId)`: idempotente (marca el evento como `sent` antes de enviar para evitar doble despacho), resuelve template SID desde `admin_settings` (`event_template_image_sid` / `event_template_video_sid`), aplica `filterByMonthlyCap`, crea campaign record, envía template con variables `{{1}}-{{6}}`, registra mensajes, finaliza campaign, actualiza `last_campaign_at`. Si falla, rollback a `status='failed'`. Devuelve `{ sent, failed, excluded_monthly_cap, campaign_id }`.

**Cron de despacho automático:**
- `src/app/api/cron/calendar-dispatch/route.ts` — GET/POST protegido con `CRON_SECRET`. Busca eventos `send_mode='auto'` + `status='scheduled'` + `scheduled_send_at <= now()` vía `findDueAutoEvents()`. Llama a `executeAutoEvent()` por cada uno. Idempotente: cada evento ya se auto-marca como `sent` en la primera ejecución. Responde con totales agregados.
- `vercel.json` — Cron `*/15 * * * *` en `/api/cron/calendar-dispatch` (cada 15 minutos, latencia máxima de 15 min desde el `scheduled_send_at` configurado).

### Changed
- `src/services/calendar.service.ts` — Actualizado el jsdoc de alcance (ya no es stub) + imports de `settings.service`, `campaign.service`, `whatsapp.service`.

### Archivos afectados
- `src/app/api/dashboard/calendar/media-upload/route.ts`
- `src/services/campaign.service.ts`
- `src/services/calendar.service.ts`
- `src/app/api/cron/calendar-dispatch/route.ts` *(nuevo)*
- `scripts/twilio-create-media-templates.mjs` *(nuevo)*
- `vercel.json`

### Request original
> Variables de plantilla sin conflicto (cada plantilla tiene su propio scope `{{1}}-{{N}}`). Auto-compresión de imágenes para dueños que no saben cuánto pesa un archivo. Plantillas de festival/promo independientes de las de recompensa. Cron de dispatch de eventos programados.

---

## [0.34.1] — 2026-05-24 — Fix: tipo canónico RestaurantEvent para evitar error de build en Vercel

### Fixed
- `src/app/(dashboard)/dashboard/calendar/page.tsx` — Eliminada interfaz local `RestaurantEvent`; ahora importa el tipo canónico desde `@/types/database.types`. Resuelve error TypeScript de parámetros incompatibles al pasar el evento a `EventDetailDrawer`.
- `src/components/dashboard/Calendar/CalendarMonthView.tsx` — Mismo fix: eliminada interfaz local, importa `RestaurantEvent` desde `@/types/database.types`.
- `src/components/dashboard/Calendar/EventDetailDrawer.tsx` — Eliminada interfaz local + `TYPE_COLORS`/`STATUS_LABELS` locales. Importa `RestaurantEvent`, `EventType`, `EventStatus` desde `@/types/database.types`.

### Archivos afectados
- `src/app/(dashboard)/dashboard/calendar/page.tsx`
- `src/components/dashboard/Calendar/CalendarMonthView.tsx`
- `src/components/dashboard/Calendar/EventDetailDrawer.tsx`

### Request original
> Build de Vercel fallaba: "Type 'RestaurantEvent' is missing the following properties" — tres archivos definían su propia interfaz local, TypeScript las trataba como tipos nominalmente distintos.

---

## [0.34.0] — 2026-05-24 — Calendario operativo de eventos (data layer + UI)

### Added

**Base de datos:**
- `supabase/migrations/00012_calendar_events_and_media.sql` — Tabla `restaurant_events` (id, title, description, event_date, event_time, event_type, send_mode, scheduled_send_at, filters, media_url, media_type, content_sid, campaign_id, status, blackout_days, created_at, updated_at). Índices sobre date, status, scheduled_send_at. RLS activado. Columnas nuevas en `campaigns`: `source`, `media_url`, `media_type`. Bucket público `event-media` en Supabase Storage.

**Constantes:**
- `src/constants/rewards.ts` — `MONTHLY_MARKETING_CAP = 3`, `MONTHLY_CAP_SOURCES`, `DEFAULT_PRE_EVENT_BLACKOUT_DAYS = 5`.

**Tipos:**
- `src/types/database.types.ts` — Tipos `CampaignSource`, `EventType`, `EventSendMode`, `EventStatus`, `EventMediaType`, interfaz `RestaurantEvent`. Extendida interfaz `Campaign` con `source`, `media_url`, `media_type`. Extendida `Database` con `restaurant_events`.

**Servicios:**
- `src/services/calendar.service.ts` — CRUD de eventos: `createEvent`, `listEvents`, `getEvent`, `updateEvent`, `cancelEvent`. Helpers: `findCustomersForEvent`, `findDueAutoEvents`. Sin lógica de envío (path de plantillas con media pausa pendiente aprobación Meta).
- `src/services/campaign.service.ts` — Nuevas funciones: `getCustomersAtMonthlyCap`, `filterByMonthlyCap`, `getActiveBlackouts`.

**Endpoints (API):**
- `src/app/api/dashboard/calendar/events/route.ts` — `GET ?from=&to=` (listar rango), `POST` (crear evento).
- `src/app/api/dashboard/calendar/events/[id]/route.ts` — `GET` (detalle), `PATCH` (actualizar título/descripción), `DELETE` (cancelar).
- `src/app/api/dashboard/calendar/media-upload/route.ts` — `POST` (upload a bucket `event-media`, valida MIME + tamaño), `DELETE` (borrar asset del bucket).

**Frontend:**
- `src/app/(dashboard)/dashboard/calendar/page.tsx` — Página principal del calendario: navegación de mes, barra de stats (total/planeados/programados/enviados), integra `CalendarMonthView`, `EventCreateDialog`, `EventDetailDrawer`.
- `src/components/dashboard/Calendar/CalendarMonthView.tsx` — Grid mensual lunes-first, pills coloreados por tipo de evento, indicadores de blackout, highlight del día actual, leyenda.
- `src/components/dashboard/Calendar/EventCreateDialog.tsx` — Formulario completo: título, descripción, fecha+hora, tipo de evento, modo de envío (remind/auto), fecha de auto-envío, MediaUploader, filtros de audiencia (ciudad, visitas min/max), días de blackout.
- `src/components/dashboard/Calendar/EventDetailDrawer.tsx` — Sheet lateral: preview de media, metadata del evento, edición inline (título/descripción), cancelación suave.
- `src/components/dashboard/Calendar/MediaUploader.tsx` — Drag-drop, validación MIME (JPG/PNG/MP4) y tamaño (5MB/16MB), preview, integración con `/api/dashboard/calendar/media-upload`.
- `src/components/layout/DashboardSidebar.tsx` — Nuevo ítem "Calendario" (con icono `CalendarDays`) entre Campañas y Código QR.

**Documentación:**
- `docs/features/calendar.md` — Feature doc completo: scope, decisiones de diseño, estado actual (qué funciona, qué está pausado pendiente Meta).
- `docs/DB_SCHEMA.md` — Nuevas secciones: tabla `restaurant_events`, columnas nuevas de `campaigns`, bucket `event-media`, migración 00012.
- `docs/API_DOCS.md` — 7 nuevos endpoints del calendario documentados.

### Changed
- `docs/features/gamificacion-y-qr-fisico.md` — Agregado al repo (doc de investigación sobre gamificación y QR físico).

### Notes
- El path de auto-envío (plantillas `twilio/media` + cron `calendar-dispatch`) está deliberadamente excluido de este release. Depende de aprobación de Meta para plantillas con media (24-72h). Ver `docs/features/calendar.md` sección "Pendiente".
- Monthly marketing cap (3 msg/mes/cliente) y pre-event blackout están implementados en servicios pero no aplicados todavía en los endpoints de campañas manuales — se conectarán en el siguiente sprint.

### Request original
> "Desarrolla el calendario, no toques nada de las plantillas. Construye el front end y sube solo a esa repo que te pasé."

---

## [0.33.0] — 2026-05-12 — Nivel BLACK: tier máximo configurable en programa de fidelidad

### Added
- `supabase/migrations/00011_rewards_black_tier.sql` — Columna `is_black` (boolean, default false) en tabla `rewards`. Marca el nivel BLACK (tier máximo del programa).
- `src/types/database.types.ts` — Campo `is_black: boolean` en interfaz `Reward`.
- `src/components/features/check-in/CheckInForm.types.ts` — `is_black?: boolean` en `RoadmapItem` y en el campo `reward` de `CheckInResult`.
- `src/components/features/check-in/CheckInSuccess.types.ts` — `is_black?: boolean` en `RoadmapItem` y en `reward` de `CheckInSuccessProps`.
- `src/services/reward.service.ts` — `getUpcomingRewards` ahora devuelve `is_black`. `buildRewardsRoadmap` muestra `👑 BLACK` con corona cuando el reward es nivel BLACK, tanto si es el siguiente como si aparece en la lista de después.
- `src/app/api/dashboard/rewards/route.ts` — POST acepta `is_black: true`; valida que no exista ya una recompensa BLACK activa (409 si hay conflicto). PATCH acepta `is_black`.
- `src/app/api/check-in/route.ts` — La respuesta del check-in incluye `is_black` en el objeto reward para que el frontend muestre la celebración correcta.
- `src/app/(dashboard)/dashboard/rewards/page.tsx` — Tabla muestra badge dorado `👑 BLACK` en la fila del nivel black; diálogo de creación incluye toggle "Nivel BLACK" con descripción.
- `src/components/features/check-in/CheckInSuccess.tsx` — Pantalla especial dark/gold para cuando el cliente alcanza el nivel BLACK. En el roadmap, el ítem BLACK muestra corona y estilo diferenciado.

### Changed
- `src/app/api/cron/birthday/route.ts` — Ahora incluye `roadmap` como `{{2}}` en las variables de la plantilla de cumpleaños.
- `src/app/api/cron/reactivation/route.ts` — `no_reward` mode: añade `roadmap` como `{{2}}`. `with_reward` mode: corregido gap de variable secuencial; ahora `{{2}}`=premio, `{{3}}`=roadmap (antes enviaba `{{1}}` y `{{3}}` sin `{{2}}`, que Meta rechaza).
- `docs/PLANTILLAS.md` — Documento nuevo con las 8 plantillas, tabla de variables, reglas Meta, flujo completo y checklist.

---

## [0.32.0] — 2026-05-12 — Radar fix, templates con samples, ciudad en delivery, números autorizados

### Fixed
- `src/app/api/dashboard/campaigns/segments/route.ts` — **Radar mostrando 0 clientes**: el query builder de Supabase es mutable; reusar la misma variable `base` en `Promise.all` causaba que los filtros se apilaran en el mismo objeto. Ahora usa `getBase()` que crea un builder fresco por cada query.

### Added
- `src/app/(dashboard)/dashboard/templates/page.tsx` — **Valores de ejemplo para variables**: al crear una plantilla con `{{1}}`, `{{2}}`, etc. aparecen inputs para definir samples obligatorios. Sin esto, Meta aprueba la plantilla solo para mensajes de sesión (24h) pero no para outbound marketing. Botón cambiado de "Crear y Enviar" → "Enviar a Aprobación de WhatsApp".
- `src/app/api/dashboard/authorized-numbers/route.ts` — API GET (listar) + POST (crear) números autorizados de meseros.
- `src/app/api/dashboard/authorized-numbers/[id]/route.ts` — API PATCH (toggle activo) + DELETE (eliminar).
- `src/app/(dashboard)/dashboard/authorized-numbers/page.tsx` — Página completa para gestionar meseros: tabla con toggle activo/inactivo, eliminar, agregar via dialog.
- `src/components/layout/DashboardSidebar.tsx` — Link "Meseros" con icono ShieldCheck en sidebar.
- `src/services/customer.service.ts` — `updateCustomerCityIfNull()` para actualizar ciudad de cliente existente si la recibe desde delivery.

### Changed
- `src/app/api/webhook/delivery/route.ts` — Ahora acepta campo `ciudad` en el payload. Si el cliente es nuevo, se guarda como `city`. Si ya existe y no tiene ciudad, se actualiza.

---

## [0.31.0] — 2026-05-11 — UX: filtros de clientes, edición de cliente, tabs campañas, Settings unificado

### Added
- `src/app/(dashboard)/dashboard/customers/page.tsx` — Barra de filtros por Canal (QR / Domicilio / Ambos), Nivel (Plata / Oro / Platino / Black) y Estado (Activos / Recuperación / Perdidos). Los filtros se envían como query params y se resetea la paginación al cambiar cualquier filtro.
- `src/services/dashboard.service.ts` — `getCustomers` acepta parámetros `source`, `tier` y `status` para filtrar clientes en la DB.
- `src/app/api/dashboard/customers/route.ts` — Extrae y pasa los nuevos parámetros de filtro al servicio.
- `src/app/api/dashboard/customers/[id]/route.ts` — `PATCH` endpoint para editar datos del cliente: `name`, `birthday`, `city`, `accepts_marketing`.
- `src/components/dashboard/CustomerDetailDialog.tsx` — Modo edición activado por botón lápiz en el header. Permite editar nombre, cumpleaños, ciudad y consentimiento de marketing. Guarda vía `PATCH /api/dashboard/customers/[id]`.

### Changed
- `src/app/(dashboard)/dashboard/campaigns/page.tsx` — Reestructurado con tabs (shadcn Tabs): **Automáticas** (campañas cron + TwilioWallet), **Manuales** (ManualCampaigns), **Historial** (tabla). El SegmentRadar queda sobre los tabs como vista global.
- `src/app/(dashboard)/dashboard/settings/page.tsx` — Reemplazados todos los `<input>` nativos con shadcn `<Input>`, botones HTML con `<Button>`, y `<select>` estilizado con clases Tailwind consistentes con el design system. Eliminada la dependencia de `input-premium`.

---

## [0.30.0] — 2026-05-10 — Múltiples correcciones post-deploy (heatmap, n8n chat hook, rewards UI, segments radar)

### Fixed
- `src/services/dashboard.service.ts` — Heatmap usaba `getDay()`/`getHours()` en UTC, causando un desfase de 5 horas para Colombia (UTC-5). Ahora convierte a `America/Bogota` via `Intl` nativo antes de extraer día y hora.
- `n8n/domicilios_whatsapp_v4.json` — Nodo `parse_dom_1`: solo buscaba remitente en `From/from/sender` (campos de Twilio). Cuando se usa un n8n Chat Trigger no existe campo `From` → lanzaba error. Ahora también soporta `chatInput`/`message` para el body, y extrae el celular del cuerpo del mensaje si no hay remitente en los campos estándar (regex: `celular: 3XXXXXXXXX`, `+57 3XXXXXXXXX`, o número suelto de 10 dígitos).
- `src/app/(dashboard)/dashboard/rewards/page.tsx` — Eliminada columna "Mensaje WhatsApp" (`message_template`) de la tabla: los mensajes los define la plantilla Twilio, no este campo. Eliminados: `buildPreviewTemplate`, `previewTemplate`, bloque de vista previa verde en el dialog, e import `MessageSquare`.
- `src/app/(dashboard)/dashboard/rewards/page.tsx` — Typo: "autom**á**ticamente" → "automaticamente" (sin acento) en `CardDescription` y `DialogDescription`.
- `src/app/api/dashboard/campaigns/segments/route.ts` — Filtro `accepts_marketing` ahora incluye `NULL` (clientes legacy registrados antes de la migración de consentimiento). Antes `.eq('accepts_marketing', true)` excluía todos los NULL → radar mostraba 0 clientes.
- `src/app/api/dashboard/campaigns/segments/route.ts` — Segmento "Perdidos": `last_visit_at IS NULL` ahora incluido con `.or('last_visit_at.is.null,...')`. Clientes sin ninguna visita registrada ya aparecen en el segmento correcto.

---

## [0.29.0] — 2026-05-10 — Dashboard auto-refresh cada 60 segundos

### Fixed
- `src/hooks/useDashboardAnalytics.ts` — El hook cargaba datos una sola vez al montar. Si clientes se registraban con el dashboard ya abierto, las métricas quedaban desactualizadas hasta recargar la página. Ahora hace polling cada 60 segundos con `cache: 'no-store'`.

---

## [0.28.0] — 2026-05-10 — Consentimiento de marketing desmarcado por defecto (legal)

### Fixed
- `src/components/features/check-in/CheckInForm.tsx` — El checkbox `accepts_marketing` arrancaba marcado (`true`), lo que viola la Ley 1581 de 2012 (Colombia) que exige consentimiento explícito, previo e informado. Ahora inicia desmarcado (`false`) y el botón de registro permanece deshabilitado hasta que el usuario lo acepte activamente.

---

## [0.27.0] — 2026-05-10 — Ciudad con combobox autocomplete

### Changed
- `src/components/features/check-in/CheckInForm.tsx` — Reemplaza el input de texto libre para ciudad por un combobox con lista de ~70 ciudades colombianas. El usuario escribe la primera letra y ve hasta 6 sugerencias filtradas. Elimina errores de ortografía como "Medellin", "Medelli", "Envigdo".

---

## [0.26.0] — 2026-05-10 — Selector de cumpleaños con 3 dropdowns + popup reseña sin incentivo

### Changed
- `src/components/features/check-in/CheckInForm.tsx` — Reemplaza `input[type=date]` (dispara calendario nativo del browser) por 3 selects independientes: Día / Mes / Año. Combina el valor en formato `YYYY-MM-DD` antes de enviarlo a la API. Elimina import `Calendar` de lucide-react.
- `src/components/features/check-in/GoogleReviewPopup.tsx` — Elimina el bloque "INCENTIVO ESPECIAL / rollo cortesía" que prometía un premio no autorizado. Reemplaza con mensaje cálido que valora la opinión sin prometer nada. Limpia el footer "para reclamar el incentivo".

---

## [0.25.0] — 2026-05-09 — Radar de Segmentos en campañas + webhook anti-idiotas mejorado

### Added
- `src/components/dashboard/SegmentRadar.tsx` — Componente de 4 tarjetas que muestra en tiempo real: Disponibles (0-17d), Zona Recuperación (18-25d), Perdidos (25+d), En Espera (<7d cap). Incluye porcentajes y tips de acción para cada segmento. Auto-refresh con botón manual.
- `src/app/api/dashboard/campaigns/segments/route.ts` — Endpoint `GET /api/dashboard/campaigns/segments` que calcula los 4 segmentos usando `FREQUENCY_CAP_DAYS`, `RECOVERY_ZONE_START_DAYS`, `RECOVERY_ZONE_END_DAYS`. Protegido por Supabase Auth.
- `docs/features/campaigns.md` — Documento completo del sistema de campañas y control de tráfico.

### Changed
- `src/app/(dashboard)/dashboard/campaigns/page.tsx` — Integra `<SegmentRadar />` en la parte superior de la página de campañas.
- `src/app/api/webhook/twilio-incoming/route.ts` — Auto-responder mejorado con detección de intención (pedido, horario, ubicación) y enlace wa.me configurable via `RESTAURANT_WHATSAPP_LINK`. Manejo defensivo de STOP/BAJA/ALTA.
- `.env.example` — Agrega `RESTAURANT_WHATSAPP_LINK`, `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_BRAND_SHORT`, `NEXT_PUBLIC_BRAND_TAGLINE`.
- `scripts/twilio-setup.mjs` — CLI para configurar Twilio via REST API (Messaging Service, webhook URL).

---

## [0.24.0] — 2026-05-09 — Control de Tráfico Centralizado (Constelarys Fidelity System)

### Request original
> "Evitar colisión entre campañas manuales y crons automáticos. Implementar: Master Cap global 7 días, Jerarquía de Mensajes con Zona de Recuperación, y Reset por Interacción."

### Problem solved
Los motores de envío (cron reactivación y campañas manuales) operaban sin comunicarse entre sí, permitiendo que un cliente recibiera múltiples mensajes en días consecutivos.

### Added — `src/constants/rewards.ts`
- `FREQUENCY_CAP_DAYS = 7` — Constante única y centralizada para el cap global (antes hardcodeada en manual/route.ts)
- `RECOVERY_ZONE_START_DAYS = 18` — Inicio de la Zona de Recuperación
- `RECOVERY_ZONE_END_DAYS = 25` — Fin de la Zona de Recuperación

### Added — `src/services/campaign.service.ts`
- `updateCustomerLastCampaignAt(customerIds[])` — Bulk update de `last_campaign_at` para todos los enviados de un cron

### Changed — `src/services/campaign.service.ts`
- `findInactiveCustomers()` ahora filtra también por `last_campaign_at`: clientes contactados en los últimos 7 días quedan excluidos del cron de reactivación

### Changed — `src/app/api/cron/reactivation/route.ts`
- Recolecta `sentCustomerIds` durante el loop de envío
- Llama `updateCustomerLastCampaignAt()` antes de `finalizeCampaign()` para actualizar el frequency cap global

### Changed — `src/app/api/cron/birthday/route.ts`
- Mismo patrón: recolecta `sentCustomerIds` y llama `updateCustomerLastCampaignAt()`

### Changed — `src/app/api/dashboard/campaigns/manual/route.ts`
- Importa `FREQUENCY_CAP_DAYS`, `RECOVERY_ZONE_START_DAYS`, `RECOVERY_ZONE_END_DAYS` desde constants (eliminada constante local)
- Añade `last_visit_at` al select de clientes para poder evaluar la Recovery Zone
- Aplica exclusión de Recovery Zone (clientes 18-25 días sin visitar) después del frequency cap
- Response incluye nuevo campo `totalSkippedRecoveryZone`

### Changed — `src/app/api/dashboard/campaigns/estimate/route.ts`
- Aplica frequency cap y Recovery Zone en el count SQL para que el estimado sea exacto

### Added — `docs/features/campaigns.md`
- Documento completo del Control de Tráfico Centralizado: reglas, tabla de decisión, flujos por tipo, constantes

---

## [0.23.0] — 2026-05-07 — Plantillas WhatsApp granulares (near/far + reactivación con/sin regalo)

### Request original
> "Variables {{1}}-{{4}}, visit_milestone NULL, near/far, reactivación con/sin regalo, campañas con rewardId. La plantilla controla el texto, el código sólo pasa el título del premio en {{3}}."

### Added — 4 nuevos settings en `admin_settings`
- `welcome_back_near_template_sid` — Visita con próximo premio en visit+1
- `welcome_back_far_template_sid` — Visita con próximo premio en visit+2 o más
- `reactivation_no_reward_template_sid` — Reactivación "te echamos de menos" (sólo {{1}})
- `reactivation_with_reward_template_sid` — Reactivación "vuelve y gana X" ({{1}}, {{3}})
- `reactivation_reward_id` — UUID del reward fijo a ofrecer en reactivación

### Added — Funciones en `reward.service.ts`
- `getRewardTitle(nextReward)` — devuelve sólo el título (`'más beneficios'` si no hay)
- `getRemainingForReward(currentVisits, nextReward)` — distancia al próximo premio (Infinity si no hay)
- `getRewardById(id)` — fetch reward por uuid

### Changed — Variables de plantillas (BREAKING para plantillas que asumían frase completa en {{3}})
- `{{3}}` ahora es **título del premio** (sin frase). Las plantillas Twilio deben rediseñarse para incluir el contexto: "ganas: {{3}}", "podrás ganar: {{3}}", etc.
- `welcome_back_template_sid` queda como fallback legacy si las near/far no están configuradas.
- `reactivation_template_sid` queda como fallback legacy.

### Changed — Lógica de envío
- `check-in/route.ts`: elige near/far según `remaining === 1` o `≥2`. Pasa `{{3}} = nextReward.title`.
- `webhook/delivery/route.ts`: misma lógica near/far.
- `cron/reactivation/route.ts`: 3 modos (with_reward, no_reward, legacy). Si admin configura `reactivation_reward_id` + `reactivation_with_reward_template_sid` usa el modo with_reward.
- `dashboard/campaigns/manual/route.ts`: body acepta `rewardId?: 'auto' | string | 'none'`.

### Changed — `rewards.visit_milestone` ahora nullable
- Permite crear rewards sin milestone (sólo para reactivación o campañas).
- Migración: `00010_rewards_optional_milestone.sql` — `DROP NOT NULL` + índice único parcial.
- POST `/api/dashboard/rewards`: acepta `visit_milestone === null`.
- PATCH `/api/dashboard/rewards`: ahora también permite actualizar `title` y `visit_milestone`.

### Removed
- `buildRewardTemplate()` en `rewards/route.ts` (generaba texto con `{{name}}` que confundía al admin).

### Deprecated
- `buildRewardHint()` en `reward.service.ts` (reemplazado por `getRewardTitle`). Conservado 1 release de transición.

### Files
- ✏️ `src/services/reward.service.ts`
- ✏️ `src/types/database.types.ts` (Reward.visit_milestone: number | null)
- ✏️ `src/app/api/check-in/route.ts`
- ✏️ `src/app/api/webhook/delivery/route.ts`
- ✏️ `src/app/api/cron/reactivation/route.ts`
- ✏️ `src/app/api/dashboard/campaigns/manual/route.ts`
- ✏️ `src/app/api/dashboard/rewards/route.ts`
- ✏️ `src/app/(dashboard)/dashboard/settings/page.tsx`
- ➕ `supabase/migrations/00010_rewards_optional_milestone.sql`
- ✏️ `docs/DB_SCHEMA.md`, `docs/features/qr-checkin.md`, `docs/features/delivery-webhook.md`, `docs/features/flujo-plantillas-recompensas-campanas.md`

### Operación (admin debe hacer)
1. Ejecutar migración `00010_rewards_optional_milestone.sql` en Supabase.
2. Crear/editar 6 plantillas en Twilio con sintaxis `{{1}}, {{2}}, {{3}}` (no `{{name}}`):
   - `bienvenida_primera_visita` — sólo {{1}}
   - `visita_recurrente_cerca_premio` — {{1}}, {{2}}, {{3}}
   - `visita_recurrente_lejos_premio` — {{1}}, {{2}}, {{3}}
   - `ganaste_premio` — {{1}}, {{2}}, {{3}}
   - `feliz_cumpleanos` — sólo {{1}}
   - `reactivacion_sin_regalo` — sólo {{1}}
   - `reactivacion_con_regalo` — {{1}}, {{3}}
3. En Dashboard > Ajustes, asignar los 7 SIDs nuevos + recompensa de reactivación.

---

## [0.21.0] — 2026-04-16 — TEMPLATE-ONLY WhatsApp + Campañas Black + Google Contacts Doc

### BREAKING — Eliminado free-text WhatsApp por completo
- **Problema:** No existe ventana de 24h porque el cliente NUNCA envía un mensaje WhatsApp al negocio (solo escanea QR). Los mensajes free-text NUNCA serían entregados por Meta.
- **Solución:** Todos los mensajes ahora usan PLANTILLAS APROBADAS vía Twilio Content API.
- Se eliminó `sendWhatsApp()` (free-text) de `whatsapp.service.ts`
- Se eliminaron todas las funciones wrapper (sendWelcomeMessage, sendRewardMessage, etc.)
- Solo queda `sendTemplateMessage(phone, contentSid, variables)` como único punto de envío

### Added — 5 plantillas configurables en Dashboard > Ajustes
- `welcome_template_sid` — Registro nuevo ({{1}}=nombre)
- `welcome_back_template_sid` — Visita recurrente ({{1}}=nombre, {{2}}=visitas, {{3}}=hint)
- `reward_template_sid` — Milestone recompensa ({{1}}=nombre, {{2}}=visitas, {{3}}=premio)
- `birthday_template_sid` — Cron cumpleaños ({{1}}=nombre)
- `reactivation_template_sid` — Cron reactivación ({{1}}=nombre, {{2}}=visitas, {{3}}=hint)
- Componente `TemplateSelector` reutilizable con hint de variables y preview

### Added — Settings service compartido
- Nuevo `src/services/settings.service.ts` con `getSettingValue()` y `getMultipleSettings()`
- Elimina duplicación de código en crons y check-in

### Changed — Cron birthday/reactivation sin fallback free-text
- Si no hay plantilla configurada → NO envía, retorna error claro
- Ya no existe fallback a free-text (que nunca funcionaría)

### Added — Campañas exclusivas Black
- Preset "Exclusiva Black" (minVisits=10) en campañas manuales
- Preset "Cerca de un Premio" (minVisits=2, maxVisits=9) para motivar visitas

### Changed — Delivery webhook migrado a plantillas
- `webhook/delivery/route.ts` ahora usa `sendTemplateMessage` + `getMultipleSettings`
- Añadido Google Contacts sync al delivery

### Added — Documentación Google Contacts sync
- `docs/n8n-workflows/README.md` — Workflow 4: paso a paso para crear en n8n
- Incluye: payload completo, nodos a crear, variable de entorno

### Changed — Documentación actualizada
- `docs/features/flujo-plantillas-recompensas-campanas.md` — Reescrito completamente: eliminada info de 24h, todo refleja plantillas
- Mapeo estándar de variables documentado por tipo de mensaje

**Archivos modificados/creados:**
- `src/services/whatsapp.service.ts` — Solo sendTemplateMessage, eliminado free-text
- `src/services/settings.service.ts` — NUEVO: getSettingValue + getMultipleSettings
- `src/app/api/check-in/route.ts` — Usa plantillas + settings service
- `src/app/api/webhook/delivery/route.ts` — Usa plantillas + Google sync
- `src/app/api/cron/birthday/route.ts` — Sin fallback, usa settings service
- `src/app/api/cron/reactivation/route.ts` — Sin fallback, usa settings service + reward hint
- `src/app/(dashboard)/dashboard/settings/page.tsx` — 5 template selectors + TemplateSelector component
- `src/components/dashboard/ManualCampaigns.tsx` — Presets Black exclusive + cerca de premio
- `docs/features/flujo-plantillas-recompensas-campanas.md` — Reescrito
- `docs/n8n-workflows/README.md` — +Workflow 4 Google Contacts

---

## [0.20.0] — 2026-04-16 — Bug Fix Crítico + Tiers sin Nuevo + Cron Templates + Welcome Hint

### Fixed — Bug Crítico Check-in (registro no avanzaba)
- **Causa raíz:** `createVisit` enviaba `table_number: null` a Supabase, pero migración 00009 no estaba ejecutada → columna inexistente → error 500
- **Fix 1:** `visit.service.ts` ahora solo incluye `table_number` en el insert si es non-null
- **Fix 2:** `check-in/route.ts` register: `createVisit` ahora es best-effort (try/catch), no bloquea el registro si falla
- El cliente se crea correctamente y la UI avanza al éxito aunque la visita falle

### Changed — Tiers: Eliminado "Nuevo", todos inician en Plata
- Plata: 0+ visitas (desde la primera)
- Oro: 4+ visitas
- Platino: 7+ visitas
- Black: 10+ visitas
- **Impacto:** Black se alcanza en 10 visitas (antes eran 12+3 de "Nuevo" = 15 percibidas)

### Added — Beneficios Black editables desde Ajustes
- Nueva sección en Settings con editor de beneficios (agregar/editar/eliminar)
- Se guardan como JSON en `admin_settings` key `black_benefits`
- `BlackTierSection` lee los beneficios dinámicamente desde props
- Dashboard pasa benefits de settings a BlackTierSection

### Added — Campañas automáticas con plantilla seleccionable
- En Settings: selectores de plantilla Twilio aprobada para cumpleaños y reactivación
- Se guardan como `birthday_template_sid` y `reactivation_template_sid` en `admin_settings`
- Cron birthday: si hay template SID, usa `sendTemplateMessage` (funciona fuera de 24h)
- Cron reactivation: mismo patrón; fallback a free-text si no hay template

### Changed — Welcome Back incluye hint de próxima recompensa
- Check-in API: busca `getNextReward()` y envía hint en respuesta
- WhatsApp welcome back: incluye "🎁 En tu visita X ganas: [premio]"
- Pantalla de éxito: muestra card verde con hint de próxima recompensa

### Changed — Google Contacts sync mejorado
- Payload ahora incluye: birthday, city, totalVisits (datos organizados de Supabase)
- El flujo es: QR→Supabase→n8n webhook→Google Contacts (usa datos limpios de DB)

**Archivos modificados:**
- `src/services/visit.service.ts` — Fix: table_number condicional
- `src/app/api/check-in/route.ts` — Fix: createVisit best-effort + nextReward hint
- `src/constants/rankings.ts` — Eliminado Nuevo, Plata(0) Oro(4) Platino(7) Black(10)
- `src/app/(dashboard)/dashboard/settings/page.tsx` — Reescrito: +beneficios Black +plantillas cron
- `src/app/api/cron/birthday/route.ts` — Lee template SID de settings
- `src/app/api/cron/reactivation/route.ts` — Lee template SID de settings
- `src/services/whatsapp.service.ts` — sendWelcomeBackMessage +rewardHint
- `src/services/google-contacts-sync.service.ts` — Payload expandido
- `src/components/dashboard/BlackTierSection.tsx` — Benefits dinámicos + 10 visitas
- `src/components/dashboard/CustomerDetailDialog.tsx` — Gradients actualizados
- `src/components/features/check-in/CheckInSuccess.tsx` — Muestra nextRewardHint
- `src/components/features/check-in/CheckInSuccess.types.ts` — +nextRewardHint
- `src/components/features/check-in/CheckInForm.types.ts` — +nextReward en CheckInResult
- `src/app/(public)/check-in/page.tsx` — Pasa nextRewardHint a CheckInSuccess
- `src/app/(dashboard)/dashboard/page.tsx` — Fetch blackBenefits + useEffect

---

## [0.19.0] — 2026-04-15 — QR Mesa + Power System v2 + Black Tier + Dashboard Reorder

### Added — QR por Mesa
- Cada mesa genera su propio QR con parámetro `?mesa=N`
- Selector de mesas con botones + vista previa por mesa
- Botón "Descargar TODAS las mesas" (batch)
- `table_number` almacenado en cada visita para analytics
- Migración `00009_table_number.sql`
- Anti-fraude: detección de 3+ registros seguidos con misma mesa (preparado)

### Changed — Sistema de Poder v2
- Nuevo: 🥈 Plata(3) → 🥇 Oro(6) → ⚜️ Platino(9) → 👑 Black(12)
- Eliminado: Diamante, Bronce, Nuevo tiene minVisits=0
- Colores Black: fondo negro con dorado (#FFD700)
- `LEVEL_THRESHOLDS` exportado para reuso

### Added — Sección Clientes Black
- Componente `BlackTierSection.tsx` con diseño dark/gold premium
- Lista de clientes Black con avatar, visitas, badge VIP
- Click abre CustomerDetailDialog
- Panel de beneficios: 15% descuento, eventos exclusivos, prioridad
- Empty state elegante cuando no hay clientes Black

### Changed — Dashboard Layout Reordenado
- Arriba: MetricsCards → Tiers + ROI → BlackTierSection
- Medio: VisitsChart → PowerRanking → Growth + AtRisk
- Abajo: Heatmap → AcquisitionChannel → ReactivationRate
- Charts que necesitan datos históricos movidos al final

### Fixed — Ticket Promedio
- Settings PUT: cambiado de upsert a update/insert explícito
- Agregado formato COP en tiempo real debajo del input
- Error handling visible si falla el guardado
- Instrucción clara: "Ingresa en pesos colombianos (ej: 60000)"

### Added — Documentación de flujos
- `docs/features/flujo-plantillas-recompensas-campanas.md`
- Flujo completo: check-in, recompensas, campañas auto/manual
- Sistema de recompensas recomendado (visitas 3,5,6,8,9,10,12,15,20)
- 4 plantillas recomendadas para aprobar en Twilio
- Problemas conocidos documentados

**Archivos creados:**
- `src/components/dashboard/BlackTierSection.tsx`
- `supabase/migrations/00009_table_number.sql`
- `docs/features/flujo-plantillas-recompensas-campanas.md`

**Archivos modificados:**
- `src/constants/rankings.ts` — Power System v2
- `src/app/(dashboard)/dashboard/page.tsx` — Layout reordenado + BlackTierSection
- `src/app/(dashboard)/dashboard/qr/page.tsx` — QR por mesa completo
- `src/app/(dashboard)/dashboard/settings/page.tsx` — Bug fix + formato COP
- `src/app/api/dashboard/settings/route.ts` — update/insert explícito
- `src/app/api/check-in/route.ts` — table_number en flujo
- `src/components/features/check-in/CheckInForm.tsx` — lee ?mesa= de URL
- `src/services/visit.service.ts` — tableNumber param
- `src/types/database.types.ts` — table_number en Visit
- `src/components/dashboard/CustomerDetailDialog.tsx` — gradient colors actualizados

---

## [0.18.0] — 2026-04-15 — Customer Detail + Rewards CRUD + Consent + Frequency Cap

### Added — Customer Detail Dialog
- Componente `CustomerDetailDialog.tsx` con info completa del cliente
- Click en filas de PowerRanking y Clientes abre el detalle
- Muestra: nombre, teléfono, ciudad, cumpleaños, tier, visitas, canal, inactividad
- Muestra próxima recompensa (API `GET /api/dashboard/customers/:id/next-reward`)
- Asignar visitas manualmente (cantidad + razón) desde el dialog
- API `GET /api/dashboard/customers/:id` para detalle individual

### Added — Rewards CRUD (crear/borrar/activar)
- Botón "Nueva Recompensa" → Dialog con visita # + premio
- Auto-genera template de WhatsApp con vista previa en tiempo real
- Toggle activar/desactivar recompensa (PATCH)
- Eliminar recompensa con confirmación (DELETE)
- API: POST, DELETE, PATCH en `/api/dashboard/rewards`

### Added — Consentimiento de comunicaciones
- Checkbox en formulario de registro: "Acepto ser parte de la familia..."
- Campo `accepts_marketing` (boolean, default true) en customers
- Migración `00008_accepts_marketing.sql`
- Icono ✕ en lista de clientes para los que no aceptan marketing
- CustomerDetailDialog muestra estado de opt-in/opt-out

### Changed — Campañas: auto-excluyen clientes sin consentimiento
- Campañas manuales (`/api/dashboard/campaigns/manual`) filtran `accepts_marketing=true`
- Estimación de audiencia (`/api/dashboard/campaigns/estimate`) filtra `accepts_marketing=true`
- Cron reactivación excluye clientes con `accepts_marketing=false`
- Cron cumpleaños NO filtra (transaccional, no marketing)

### Changed — Frequency capping verificado
- Campañas manuales: 7 días entre marketing por cliente via `last_campaign_at`
- Cron birthday/reactivation: NO afectados (usan `hasRecentCampaignMessage` por tipo)
- Solo campañas marketing actualizan `last_campaign_at`

### Changed — Hook `useDashboardAnalytics` con refetch
- Agregado `refetch()` para recargar datos después de acciones admin

**Archivos creados:**
- `src/components/dashboard/CustomerDetailDialog.tsx`
- `src/app/api/dashboard/customers/[id]/route.ts`
- `src/app/api/dashboard/customers/[id]/next-reward/route.ts`
- `supabase/migrations/00008_accepts_marketing.sql`

**Archivos modificados:**
- `src/types/database.types.ts` — accepts_marketing en Customer
- `src/services/customer.service.ts` — createCustomer con accepts_marketing
- `src/app/api/check-in/route.ts` — pasar accepts_marketing
- `src/components/features/check-in/CheckInForm.tsx` — checkbox consentimiento
- `src/components/dashboard/PowerRanking.tsx` — onCustomerClick prop
- `src/app/(dashboard)/dashboard/page.tsx` — CustomerDetailDialog + handleCustomerClick
- `src/app/(dashboard)/dashboard/customers/page.tsx` — rows clickable + opt-out badge
- `src/app/(dashboard)/dashboard/rewards/page.tsx` — CRUD completo
- `src/app/api/dashboard/rewards/route.ts` — POST, DELETE, PATCH
- `src/app/api/dashboard/campaigns/manual/route.ts` — filtro accepts_marketing
- `src/app/api/dashboard/campaigns/estimate/route.ts` — filtro accepts_marketing
- `src/services/campaign.service.ts` — findInactiveCustomers excluye opted-out
- `src/hooks/useDashboardAnalytics.ts` — refetch()

---

## [0.17.0] — 2026-04-15 — Métricas avanzadas + ROI + Heatmap + Ajustes

### Added — 4 nuevas gráficas/métricas + página de Ajustes

**Tasa de Reactivación (`ReactivationRateChart.tsx`):**
- Gráfica ComposedChart: barras (enviados vs volvieron) + línea (tasa %)
- Cruza campaign_messages + visits para medir ROI real de campañas de reactivación
- Últimos 6 meses, badge con tasa promedio global

**Card ROI Estimado (`ROICard.tsx`):**
- Fórmula: clientes_reactivados × ticket_promedio
- Muestra retorno estimado del sistema en COP
- Link directo a /dashboard/settings para ajustar ticket promedio

**Mapa de Calor de Visitas (`VisitHeatmap.tsx`):**
- Heatmap Día × Hora (7 días × horas 8am-10pm)
- Últimos 6 meses de visitas
- Tooltips con conteo, leyenda de colores, diseño responsive

**Canal de Adquisición por Mes (`AcquisitionChannelChart.tsx`):**
- Stacked bar: QR vs Domicilio por mes (últimos 6 meses)
- Basado en customers.source_channels

**Página de Ajustes (`/dashboard/settings`):**
- Configuración de ticket promedio (COP)
- API PUT /api/dashboard/settings para guardar configuración
- Tabla admin_settings (key-value) con RLS

**Navegación:**
- Nuevo item "Ajustes" en sidebar y header mobile

### Migración SQL requerida
- `supabase/migrations/00007_admin_settings.sql` — Ejecutar en Supabase

### Archivos creados
- `src/components/dashboard/ReactivationRateChart.tsx`
- `src/components/dashboard/ROICard.tsx`
- `src/components/dashboard/VisitHeatmap.tsx`
- `src/components/dashboard/AcquisitionChannelChart.tsx`
- `src/app/(dashboard)/dashboard/settings/page.tsx`
- `src/app/api/dashboard/settings/route.ts`
- `supabase/migrations/00007_admin_settings.sql`

### Archivos modificados
- `src/types/analytics.types.ts` — HeatmapCell, AcquisitionChannel, ReactivationData, ROIEstimate
- `src/services/dashboard.service.ts` — getFullAnalytics ampliado (heatmap, acquisition, reactivation, ROI)
- `src/lib/demo-analytics.ts` — Demo data para las 4 nuevas métricas
- `src/app/(dashboard)/dashboard/page.tsx` — Integra los 4 nuevos componentes
- `src/components/layout/DashboardSidebar.tsx` — Nav item Ajustes
- `src/components/layout/DashboardHeader.tsx` — Nav item Ajustes (mobile)

**Build:** ✅ 29 rutas, 0 errores

> **Request original:** Añadir gráficas: Tasa de Reactivación, ROI Estimado, Heatmap Día×Hora, Canal de Adquisición por Mes, y apartado de ticket promedio en Ajustes

---

## [0.16.0] — 2026-04-14 — Demo auto-login

### Added — Ruta /demo para acceso directo al dashboard sin formulario de login

**Archivos creados:**
- `src/app/demo/page.tsx` — Página client que hace signInWithPassword con credenciales demo y redirige a /dashboard
- `docs/features/demo-login.md` — Documentación de la feature

**Variables de entorno requeridas:**
- `NEXT_PUBLIC_DEMO_EMAIL` — Email del usuario demo
- `NEXT_PUBLIC_DEMO_PASSWORD` — Contraseña del usuario demo

**Request original:** Crear link de demo para landing page que auto-loguea al dashboard

---

## [0.15.0] — 2026-04-11 — Rediseño visual premium (Dashboard Métricas)

### Changed — Identidad visual del panel administrativo: glassmorphism, burbujas animadas, sparklines

**Layout y estructura:**
- `src/app/(dashboard)/layout.tsx` — `dashboard-bg` (fondo marfil + gradiente radial al centro), padding generoso `p-6 md:p-8`
- `src/app/(dashboard)/dashboard/page.tsx` — `space-y-8` (32px+ entre secciones), título Playfair Display
- `src/components/layout/DashboardSidebar.tsx` — Glassmorphism `rgba(255,255,255,0.72)` + `backdrop-filter: blur(20px)`, icono CTA con gradiente carmesí, nav items con gradiente en activo
- `src/components/layout/DashboardHeader.tsx` — Glassmorphism idéntico al sidebar, sin border-bottom

**MetricsCards:**
- `src/components/dashboard/MetricsCards.tsx` — `.metric-card` con hover `translateY(-4px)` + sombra profunda, números Inter 700 `letter-spacing: -0.05em`, sparklines animados por card
- `src/components/dashboard/MiniSparkline.tsx` — **NUEVO**: SVG inline 60×22px, animación `stroke-dashoffset` 1→0 en 1.5s ease-out, tipos `up/down/stable`

**Burbujas en Riesgo:**
- `src/components/dashboard/AtRiskBubbles.tsx` — Colores pasteles desaturados (rojo/naranja/violeta), float animation asincrónica (3.1s/3.8s/4.5s), spring `bubble-pop` al click, Dialog premium sin bordes duros con header coloreado según burbuja, botón de envío con gradiente carmesí

**Gráficos y Ranking:**
- `src/components/dashboard/VisitsChart.tsx` — `.dashboard-card` reemplaza `Card` de shadcn, título Playfair
- `src/components/dashboard/GrowthChart.tsx` — `.dashboard-card`, barras `radius={[8,8,0,0]}`
- `src/components/dashboard/CustomerTiers.tsx` — `.dashboard-card`
- `src/components/dashboard/PowerRanking.tsx` — `.dashboard-card`, sin bordes de celda, `.ranking-row` hover suave `rgba(249,248,246,0.9)`

**globals.css — Nuevas clases:**
- `.dashboard-bg`, `.glass-sidebar`, `.glass-header`, `.metric-card`, `.dashboard-card`, `.ranking-row`, `.sparkline-path`, `.bubble-float`
- Keyframes: `float`, `bubble-pop`, `draw-sparkline`
- Utilities: `animate-float`, `animate-bubble-pop`

### Archivos creados
- `src/components/dashboard/MiniSparkline.tsx` — Componente sparkline animado
- `docs/features/design-system.md` — Documentación del sistema de diseño premium
- `docs/features/dashboard-metrics-redesign.md` — Especificación del rediseño

### Archivos modificados
- `src/app/globals.css` — Clases y keyframes del dashboard
- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/components/layout/DashboardSidebar.tsx`
- `src/components/layout/DashboardHeader.tsx`
- `src/components/dashboard/MetricsCards.tsx`
- `src/components/dashboard/AtRiskBubbles.tsx`
- `src/components/dashboard/VisitsChart.tsx`
- `src/components/dashboard/GrowthChart.tsx`
- `src/components/dashboard/CustomerTiers.tsx`
- `src/components/dashboard/PowerRanking.tsx`

### Request original
> Modificar la sección de métricas: 1) Layout "Airy" con fondo #F9F8F6 gradiente radial, sidebar/topnav glassmorphism blur(20px), spacing mínimo 32px. 2) Cards con hover translateY(-4px), sparklines animados 1.5s ease-out, tipografía Inter 700 letter-spacing -0.05em. 3) Burbujas en riesgo: colores pasteles, float animation, spring elastic al click, Quick Action Popover con gradiente carmesí. 4) Gráficas de barras rounded radius:8px, tablas sin bordes, hover por fila completa.

---

## [0.14.0] — 2026-04-11 — Rediseño visual premium (páginas públicas)

### Changed — Identidad visual completa de páginas públicas y login

**Fuentes:**
- `layout.tsx` — Reemplazado Geist Sans por Inter + Playfair Display (Google Fonts)
- `globals.css` — `--font-sans: var(--font-inter)` · `--font-heading: var(--font-playfair-display)`

**Sistema de diseño premium (globals.css):**
- Keyframe `fade-in-up` para entrada suave desde 20px abajo
- Utility `font-playfair` · utility `animate-fade-in-up`
- `.premium-bg` — Fondo marfil `#F9F8F6` con textura noise SVG (opacity 0.02)
- `.premium-card` — `border-radius: 24px`, `box-shadow: 0 10px 40px rgba(0,0,0,0.04)`
- `.btn-premium` — Gradiente `#FF4D6D → #E63946`, hover `scale(1.02)`, transición 300ms cubic-bezier
- `.btn-secondary-premium` — Glassmorphism blanco con backdrop-blur 12px
- `.input-premium` — Ghost border `rgba(226,190,192,0.35)`, focus glow rojo

**Páginas rediseñadas:**
- `src/app/page.tsx` — Landing: orbs decorativos, card premium, badge animado, botón gradiente
- `src/app/(auth)/login/page.tsx` — Login: inputs nativos, sin shadcn Card, Playfair en título
- `src/app/(public)/check-in/page.tsx` — Fondo marfil, header de marca premium
- `src/components/features/check-in/CheckInForm.tsx` — Labels metadata, inputs ghost, botón gradiente
- `src/components/features/check-in/CheckInSuccess.tsx` — Cards con gradiente verde/rojo, ícono dorado para recompensa

**Iconografía:**
- Todos los íconos de páginas públicas: `strokeWidth={1.25}` o `{1.5}` (ultra-thin)

**Git:**
- Branch: `feat/visual-redesign` (main preservado como backup)

### Archivos afectados
- `src/app/layout.tsx` — Fuentes Inter + Playfair Display
- `src/app/globals.css` — Sistema premium completo
- `src/app/page.tsx` — Rediseño landing
- `src/app/(auth)/login/page.tsx` — Rediseño login
- `src/app/(public)/check-in/page.tsx` — Rediseño wrapper check-in
- `src/components/features/check-in/CheckInForm.tsx` — Rediseño formulario
- `src/components/features/check-in/CheckInSuccess.tsx` — Rediseño pantalla de éxito

### Docs afectados
- `docs/features/design-system.md` — CREADO (sistema de diseño premium)

### Request original
> Quiero modificar la pagina principal, todo lo que es la pagina de panel admin/registrar visita - ingresar numero y pagina de registro de visita. Fundamentos Estéticos: Fondo #F9F8F6 (Marfil Suave), Card Central con border-radius 24px, Tipografía Playfair Display para títulos, Botón Primario gradiente #FF4D6D a #E63946 con scale(1.02) en hover, Micro-interacciones: fade-in slide-up 20px.

---

## [0.13.0] — 2026-04-11 10:30

### Added — Lógica de recompensas en plantillas, source_channels, frequency capping

**Variables automáticas en plantillas de campaña:**
- `reward.service.ts` — `getNextReward(visits)` busca siguiente recompensa activa
- `reward.service.ts` — `buildRewardHint(visits, reward)` genera texto: "En tu visita 5 ganas: Sushi Tiger Gratis (te faltan 2)"
- Campañas manuales ahora envían `{{1}}=nombre`, `{{2}}=visitas`, `{{3}}=próxima recompensa` automáticamente

**Envío REAL de mensajes en campañas:**
- `whatsapp.service.ts` — `sendTemplateMessage(phone, contentSid, variables)` usa Twilio Content API
- `campaigns/manual/route.ts` — Reescrito completo: envía mensajes reales, registra twilio_sid, error_message por cada destinatario

**Segmentación por canal de origen:**
- `customers.source_channels` — 'qr' | 'delivery' | 'both'
- Se actualiza automáticamente en check-in (QR) y delivery webhook
- Si un cliente usa ambos canales → se marca como 'both'
- Migración SQL con backfill basado en historial de visitas

**Frequency capping (anti-spam):**
- `customers.last_campaign_at` — Fecha de última campaña marketing recibida
- Campañas manuales excluyen clientes contactados en los últimos 7 días
- Response incluye `totalSkippedFrequencyCap` para transparencia

**Warnings en creación de plantillas:**
- Advertencia desplegable sobre aprobación de Meta + qué evitar
- Recomendaciones desplegables para plantillas exitosas

### Migración SQL requerida
- `00006_source_channels_frequency_cap.sql` — Ejecutar en Supabase

### Archivos afectados
- `src/services/reward.service.ts` — getNextReward, buildRewardHint
- `src/services/whatsapp.service.ts` — sendTemplateMessage (Content API)
- `src/services/customer.service.ts` — source param en createCustomer/incrementVisit
- `src/app/api/dashboard/campaigns/manual/route.ts` — Envío real + freq cap
- `src/app/api/check-in/route.ts` — Pasa source='qr'
- `src/app/api/webhook/delivery/route.ts` — Pasa source='delivery'
- `src/types/database.types.ts` — source_channels, last_campaign_at
- `src/app/(dashboard)/dashboard/templates/page.tsx` — Warnings desplegables
- `supabase/migrations/00006_source_channels_frequency_cap.sql` — Nueva migración
- `docs/DB_SCHEMA.md` — Actualizado

**Build:** ✅ 28 rutas, 0 errores

> **Request original:** Lógica recompensas en variables, segmentador qr/delivery, frequency capping, warnings en plantillas

---

## [0.12.0] — 2026-04-10 23:30

### Fixed — Templates mostrando "Borrador" en dashboard

**Templates approval status (Fix crítico):**
- `api/dashboard/templates/route.ts` — Reescrito parseo de approval status:
  - Intenta `approval_requests.status` (directo)
  - Intenta `approval_requests.whatsapp.status` (nested)
  - Si sigue en "draft" → fetch individual a `/Content/{sid}/ApprovalRequests/whatsapp`
- Ahora retorna ambos nombres de campo: `name`/`friendly_name` y `status`/`approval_status`
- `ManualCampaigns.tsx` ya puede filtrar por `approval_status === 'approved'` correctamente
- Plantillas aprobadas en Twilio ahora se muestran como "Aprobada" en el dashboard

### Changed — Niveles de clientes: metales preciosos

**Tier names actualizados:**
- `constants/rankings.ts` — Diamante(25+) > Platino(18+) > Oro(12+) > Plata(7+) > Bronce(3+) > Nuevo(1+)
- Emojis, gradientes y colores actualizados para cada nivel
- Impacta: CustomerTiers, PowerRanking, analytics

### Archivos afectados
- `src/app/api/dashboard/templates/route.ts` — Fix approval status
- `src/constants/rankings.ts` — Nuevos tier names
- `src/app/(dashboard)/dashboard/templates/page.tsx` — Status map actualizado

**Build:** ✅ 28 rutas, 0 errores

> **Request original:** Plantillas aprobadas en Twilio aparecen como borradores; cambiar tiers anime por metales preciosos

---

## [0.11.0] — 2026-04-10 22:50

### Fixed — Login, QR Preview, Política Meta WhatsApp

**Login múltiples clicks (Fix):**
- `login/page.tsx` — Reemplazado `router.push()` por `window.location.href` para full-page reload
- Las cookies de Supabase Auth ahora se envían correctamente en la primera navegación
- Eliminado `useRouter` innecesario

**QR no aparece en vista previa (Fix):**
- `dashboard/qr/page.tsx` — Reemplazado `<canvas>` por `<img src={dataUrl}>` 
- Eliminada race condition: `QRCode.toCanvas` se llamaba antes de que el canvas estuviera en el DOM
- QR ahora se muestra inmediatamente al cargar la página

**Campañas: Selector de plantillas aprobadas (Fix — Política Meta):**
- `ManualCampaigns.tsx` — Eliminado textarea de "mensaje personalizado" 
- Reemplazado por selector de plantillas aprobadas de Twilio Content API
- Meta/WhatsApp requiere pre-approved templates para mensajes business-initiated fuera del service window de 24h
- Si no hay plantillas aprobadas → muestra advertencia con link a sección Plantillas
- Botón "Sincronizar" para refrescar lista de plantillas desde Twilio

### Added — Rate Limiting Check-in + Admin Override

**Rate limiting check-in (máx 1/día):**
- `api/check-in/route.ts` — Ventana de duplicados aumentada de 60min a 1440min (24h)
- Mensaje claro: "Solo puedes registrar una visita por día"

**Admin override para visitas extra:**
- `api/dashboard/check-in-override/route.ts` — Endpoint protegido (Admin JWT)
- Permite registrar visita adicional con motivo, saltando el rate limit
- La visita queda registrada con nota "Override admin: [razón]"

### Archivos afectados
- `src/app/(auth)/login/page.tsx` — Fix login
- `src/app/(dashboard)/dashboard/qr/page.tsx` — Fix QR preview
- `src/components/dashboard/ManualCampaigns.tsx` — Template selector
- `src/app/api/check-in/route.ts` — Rate limit 24h
- `src/app/api/dashboard/check-in-override/route.ts` — Nuevo endpoint

**Build:** ✅ 28 rutas, 0 errores

> **Request original:** Fix login multi-click, QR vacío, campañas con mensaje libre viola política Meta, agregar rate limit check-in 1/día + admin override

---

## [0.10.0] — 2026-04-10 16:30

### Added — Conexión Twilio Real, Vercel Crons, n8n Workflows, Diagnóstico

**Conexión Twilio Real:**
- Credenciales cargadas en `.env.local` — conexión verificada ($20 USD saldo)
- `api/dashboard/twilio-balance/route.ts` — `force-dynamic`, `cache: no-store`, logging mejorado
- `api/dashboard/templates/route.ts` — `force-dynamic`, `cache: no-store`
- `api/health/twilio/route.ts` — Endpoint diagnóstico sin auth para verificar conexión Twilio

**Vercel Cron Jobs:**
- `vercel.json` — Cron config: birthday 8AM UTC, reactivation 10AM UTC
- `api/cron/birthday/route.ts` — Añadido handler GET (Vercel crons usan GET)
- `api/cron/reactivation/route.ts` — Añadido handler GET

**n8n Workflows:**
- `docs/n8n-workflows/01-delivery-webhook.json` — Workflow importable para registro de domicilios
- `docs/n8n-workflows/README.md` — Guía de setup, variables, y test rápido
- URL n8n: `https://n8n.almojabananet.me`

**Google Maps Review:**
- `.env.example` actualizado con URL real: `https://share.google/XDfNCZIn7QFQaAME9`
- Variable `N8N_BASE_URL` añadida a `.env.example`

### Changed
- `docs/API_DOCS.md` — Añadidos: `/api/health/twilio`, GET en crons, `/api/dashboard/templates`
- `docs/02-architecture.md` — Añadidos: `vercel.json`, variables env faltantes
- `docs/features/dashboard.md` — Templates actualizado de "Beta" a "Twilio Content API"

### Archivos afectados
- 10 archivos modificados/creados

**Build:** ✅ 0 errores

> **Request original:** "Ya cargué las credenciales y reinicié el server" + configurar n8n, crons, Google Maps, y probar conexión Twilio

---

## [0.9.0] — 2026-04-09 10:00

### Added — Twilio MCP, Plantillas Real, Imágenes Japonesas, Checklist Producción

**Twilio MCP Server:**
- `.windsurf/mcp_config.json` — Configuración para `@twilio-alpha/mcp`
- Servicios: `twilio_api_v2010`, `twilio_content_v1`, `twilio_messaging_v1`
- Tags: Messages, Phone Numbers, Balance, Content, ApprovalRequest, Templates
- `docs/TWILIO_MCP_SETUP.md` — Guía paso a paso de configuración
- `.gitignore` actualizado para proteger credenciales MCP

**Plantillas Twilio (producción):**
- `api/dashboard/templates/route.ts` — GET (listar) + POST (crear + auto-submit aprobación)
- Integración con Twilio Content API v1
- Dashboard muestra: SID, nombre, categoría, estado de aprobación (approved/pending/rejected/draft)
- Crear plantilla → se envía automáticamente para aprobación de WhatsApp
- Botón "Sincronizar Twilio" para refrescar estados
- Reemplaza la versión Beta local anterior

**AtRisk Bubbles (fix visual):**
- Revertido de ScatterChart a 4-5 burbujas grandes agrupadas por nivel de riesgo
- Ahora muestra: count, avg visitas, avg días inactivo por grupo
- Click en burbuja → dialog con lista de clientes + envío de campaña directa

**Imágenes japonesas integradas:**
- 5 imágenes copiadas a `public/images/` (bonsai, templo, pagoda, kanji, bambú)
- Landing (`/`): pagoda top-right, bonsai bottom-left como watermarks sutiles
- Check-in (`/check-in`): bonsai top-right, bambú bottom-left
- Login (`/login`): kanji center-right, templo bottom-left
- Fondos mejorados: `bg-gradient-to-br from-red-50 via-white to-stone-50`
- Cards con `backdrop-blur-sm bg-white/90 shadow-xl`

**Checklist de Producción:**
- `docs/PRUEBA_REAL_CHECKLIST.md` — Documento completo de TODO lo necesario para prueba real
- Cubre: Supabase, Twilio, n8n, Cron, Google Maps, Deploy, variables de entorno

### Archivos afectados
- 12 archivos modificados/creados, 1 API nueva (templates), 1 doc nuevo

**Build:** ✅ 26 rutas, 0 errores

---

## [0.8.0] — 2026-04-08 16:15

### Added — Google Reviews, Campañas Manuales, Plantillas, Twilio Wallet, Bubble Chart

**Google Review Popup (post check-in):**
- `GoogleReviewPopup.tsx` — Popup ultra dopamínico con estrellas interactivas, animaciones, incentivo visual
- Aparece 2.5s después del check-in (nuevos + recurrentes, no duplicados)
- Estrellas clicables → abre Google Maps review en pestaña nueva
- Incentivo: "rollo cortesía" por dejar reseña
- Variable env: `NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL`

**Campo Ciudad en Registro:**
- `CheckInForm.tsx` — Campo ciudad con icono MapPin
- `customer.service.ts` — `createCustomer` acepta `city`
- `check-in/route.ts` + `webhook/delivery/route.ts` — Envían city al crear
- `database.types.ts` — `Customer.city: string | null`
- Migración SQL: `00005_add_city.sql` con índice parcial

**Campañas Manuales (`ManualCampaigns.tsx`):**
- Filtros: ciudad, visitas min/max, edad min/max, tipo de cliente (QR/delivery/todos)
- 2 campañas predefinidas: "Invitar al Restaurante" + "Invitar a pedir Domicilio"
- Estimador de audiencia en tiempo real (debounced 500ms)
- Costo estimado por campaña (USD + COP)
- Dialog de confirmación antes de enviar
- API `/api/dashboard/campaigns/estimate` — cuenta clientes matching
- API `/api/dashboard/campaigns/manual` — crea y ejecuta campaña manual

**Twilio Wallet (`TwilioWallet.tsx`):**
- API `/api/dashboard/twilio-balance` — consulta saldo real de Twilio
- Muestra: saldo USD/COP, costo por mensaje, mensajes disponibles, link a recarga
- `CampaignCostEstimate` — componente reutilizable para estimar costos

**Plantillas de Mensajes (`/dashboard/templates`) — Beta:**
- CRUD local de plantillas con variables ({{name}}, {{visits}}, etc.)
- 6 plantillas predefinidas (bienvenida, recompensa, cumpleaños, reactivación, restaurante, domicilio)
- Vista previa WhatsApp-style con datos de ejemplo
- Categorías: marketing, utilidad, auth
- Badge "Beta" — próxima integración con Twilio Content Templates

**Bubble Chart de Clientes en Riesgo:**
- `AtRiskBubbles.tsx` reescrito con Recharts ScatterChart
- Eje X: días sin visitar, Eje Y: total de visitas, Z (tamaño): visitas acumuladas
- Colores por nivel de riesgo, tooltip con detalle del cliente
- Leyenda clickeable para enviar campaña al grupo

**Navegación:** Nuevo item "Plantillas" en sidebar y header mobile

### Archivos afectados
- 15 archivos modificados/creados, 3 APIs nuevas, 1 migración SQL

**Build:** ✅ 25 rutas, 0 errores

---

## [0.7.0] — 2026-04-08 11:14

### Changed — Branding Sushi Service + Estética Japonesa + Campañas + QR

**Tema Rojo/Blanco Japonés:**
- `globals.css` — Primary color cambiado a rojo japonés (oklch hue 25), secondary/accent/ring ajustados
- Backgrounds de landing, check-in y login: gradiente `from-red-50 to-white`

**Branding "Sushi Service":**
- `layout.tsx` — Metadata: título y descripción actualizados
- `page.tsx` — Landing rebrandeada con UtensilsCrossed icon
- `check-in/page.tsx` — Nombre y subtítulo "Programa de fidelidad"
- `login/page.tsx` — Logo + nombre en card de login
- `DashboardSidebar.tsx` — Nombre + icono en sidebar
- `DashboardHeader.tsx` — Nombre en header y menú mobile

**Campañas Mejoradas (`/dashboard/campaigns`):**
- Sección de campañas automáticas activas (Cumpleaños + Reactivación)
- Cada campaña muestra: descripción, frecuencia cron, template de mensaje, última ejecución
- Botón "Ejecutar Ahora" con dialog de confirmación para disparar campañas manualmente
- Historial de campañas ejecutadas (tabla existente mejorada)

**Generador de QR (`/dashboard/qr`):**
- Generación de QR code con librería `qrcode` (rojo oscuro sobre blanco)
- Vista previa en canvas con branding Sushi Service
- Descarga como PNG (600x600)
- Copiar URL del check-in
- Link para probar el check-in

**Navegación:**
- Nuevo item "Código QR" en sidebar y menú mobile

**Dependencias:** qrcode, @types/qrcode

**Build:** ✅ Compila sin errores (21 rutas)

### Archivos afectados
- 9 archivos modificados, 1 archivo creado

---

## [0.6.0] — 2026-04-08 09:44

### Changed — Dashboard: Rediseño Gamificado con Analytics Avanzados

**Concepto:** Dashboard adictivo con métricas accionables, sistema de poder estilo anime, burbujas de riesgo interactivas y modo demostración.

**Nuevos componentes (src/components/dashboard/):**
- `MetricsCards.tsx` — 7 tarjetas de métricas reales (QR, domicilios, nuevos, frecuentes, cumpleaños)
- `VisitsChart.tsx` — Gráfica de área: visitas diarias QR vs Domicilios (30 días)
- `GrowthChart.tsx` — Gráfica compuesta: nuevos clientes + acumulado (30 días)
- `CustomerTiers.tsx` — Barras de progreso por nivel de poder (Leyenda→Novato)
- `AtRiskBubbles.tsx` — Burbujas interactivas por grupo de riesgo (7-10, 11-15, 16-21, 22+ días)
- `PowerRanking.tsx` — Top 20 clientes con ranking anime (Leyenda, Dios, Maestro, Guerrero, Aprendiz, Novato)
- `DemoToggle.tsx` — Toggle de modo demostración

**Sistema de Rankings (src/constants/rankings.ts):**
- 6 niveles de poder: Leyenda(25+), Dios(20+), Maestro(12+), Guerrero(7+), Aprendiz(3+), Novato(1+)
- 4 niveles de riesgo: Alerta(7-10d), En riesgo(11-15d), Crítico(16-21d), Perdido(22+d)

**Modo Demostración:**
- `src/contexts/DemoContext.tsx` — Estado global con localStorage persistence
- `src/lib/demo-analytics.ts` — Computación client-side de analytics desde JSON
- `src/hooks/useDashboardAnalytics.ts` — Hook unificado (real API o demo data)
- `public/demo-data.json` — Placeholder para datos demo (1500 clientes)
- `src/types/analytics.types.ts` — Tipos compartidos para analytics

**API:**
- `GET /api/dashboard/analytics` — Analytics completos (server-side)
- `src/services/dashboard.service.ts` — getFullAnalytics() con computación de tiers, risk, ranking

**Dependencias:** recharts (gráficas), dialog (shadcn/ui)

**Build:** ✅ Compila sin errores (20 rutas)

### Archivos afectados
- 14 archivos creados, 3 archivos modificados

---

## [0.5.0] — 2026-04-08 08:40

### Added — Feature: Dashboard Administrativo (FASE 5)

**Autenticación:**
- `src/app/(auth)/login/page.tsx` — Página de login con Supabase Auth
- Middleware protege `/dashboard/*` → redirige a `/login`

**Layout:**
- `src/components/layout/DashboardSidebar.tsx` — Sidebar con navegación
- `src/components/layout/DashboardHeader.tsx` — Header con menú mobile + logout
- `src/app/(dashboard)/layout.tsx` — Layout completo con sidebar + header

**Páginas del Dashboard:**
- `/dashboard` — Métricas: total clientes, visitas hoy/semana, cumpleaños, inactivos, últimos registros
- `/dashboard/customers` — Tabla de clientes con búsqueda y paginación
- `/dashboard/rewards` — Tabla de recompensas por visitas
- `/dashboard/campaigns` — Historial de campañas ejecutadas

**API Routes (protegidas por auth):**
- `GET /api/dashboard/metrics` — Métricas generales
- `GET /api/dashboard/customers` — Lista paginada con búsqueda
- `GET /api/dashboard/rewards` — Lista de recompensas
- `GET /api/dashboard/campaigns` — Historial de campañas

**Servicios:**
- `src/services/dashboard.service.ts` — getDashboardMetrics, getCustomers, getRewards

**UI Components (shadcn/ui):**
- table, badge, separator, tabs, skeleton, avatar, dropdown-menu, sheet

**Landing:**
- `src/app/page.tsx` — Reemplazada landing default de Next.js con RestaurantQR home

**Build:** ✅ Compila sin errores (19 rutas)

### Archivos afectados
- 14 archivos creados, 4 archivos modificados

---

## [0.4.0] — 2026-04-08 08:30

### Added — Feature: Campañas y Cron Jobs (FASE 4)

**Migración SQL:**
- `supabase/migrations/00004_campaigns.sql` — Tablas campaigns + campaign_messages + índices + RLS

**Servicios:**
- `src/services/campaign.service.ts` — findBirthdayCustomers, findInactiveCustomers, getOrCreateTodayCampaign, hasRecentCampaignMessage, recordCampaignMessage, finalizeCampaign
- `src/lib/validators/cron.ts` — Validación de CRON_SECRET

**API Routes (Cron Jobs):**
- `src/app/api/cron/birthday/route.ts` — Envía felicitaciones a cumpleañeros del día (1 vez/año)
- `src/app/api/cron/reactivation/route.ts` — Envía reactivación a inactivos 21+ días (1 vez/30 días)

**WhatsApp:**
- `src/services/whatsapp.service.ts` — Nuevas funciones: sendBirthdayMessage, sendReactivationMessage, sendCampaignMessage

**Tipos:**
- `src/types/database.types.ts` — CampaignMessage.error_message añadido

**Build:** ✅ Compila sin errores

### Archivos afectados
- 4 archivos creados, 4 archivos modificados

---

## [0.3.0] — 2026-04-08 08:02

### Added — Feature: Webhook Domicilios + Google Contacts Sync (FASE 3)

**Decisión arquitectónica:** Arquitectura híbrida n8n + Next.js
- n8n = orquestador de Twilio + Google Contacts
- Next.js API = lógica de negocio (DB, visitas, recompensas)

**Migraciones SQL:**
- `supabase/migrations/00002_authorized_numbers.sql` — Tabla authorized_numbers + RLS
- `supabase/migrations/00003_delivery_fields.sql` — Campos delivery en visits (address, payment_method, amount, raw_message)

**Servicios:**
- `src/services/google-contacts-sync.service.ts` — Fire-and-forget trigger a n8n para sync Google Contacts
- `src/services/delivery.service.ts` — Parseo de mensajes WhatsApp + extracción de teléfono
- `src/lib/validators/twilio.ts` — Validación de firma Twilio (utilidad)

**API Route:**
- `src/app/api/webhook/delivery/route.ts` — POST: recibe datos parseados de n8n, crea/actualiza cliente + visita + recompensas

**Actualización Check-in:**
- `src/app/api/check-in/route.ts` — Añadido Google Contacts sync vía n8n en register y checkin

**Workflows n8n:**
- `n8n/domicilios_whatsapp_v3.json` — Twilio → parse → authorized_numbers DB → Google Contacts → nuestra API → TwiML response
- `n8n/google_contacts_sync.json` — Recibe trigger de QR check-in → Google Contacts search/create/update

**Mejoras vs workflow v2 del usuario:**
- Números autorizados ahora se validan contra DB (no hardcodeados)
- Credenciales de Supabase/Google usan env vars de n8n (no hardcodeadas)
- Usa nuestro Supabase unificado
- Integración bidireccional: QR y delivery sincronizan Google Contacts

### Archivos afectados
- 8 archivos creados, 4 archivos modificados
- `docs/features/delivery-webhook.md` — Creado y actualizado
- `docs/DB_SCHEMA.md` — Migraciones 2 y 3 registradas
- `docs/API_DOCS.md` — Endpoint delivery documentado
- `docs/01-project-overview.md` — Estado actualizado
- `src/types/database.types.ts` — Visit type con campos delivery
- `src/services/visit.service.ts` — createVisit con campos delivery
- `.env.example` — Nuevas variables: WEBHOOK_DELIVERY_SECRET, N8N_GOOGLE_CONTACTS_WEBHOOK_URL

**Build:** ✅ Compila sin errores

### Request original
> Necesito que los contactos estén creados/actualizados en Google Contacts

---

## [0.2.0] — 2026-04-07 22:09

### Added — Feature: QR Check-in (FASE 2)

**Migración SQL:**
- `supabase/migrations/00001_initial_schema.sql` — Tablas customers, visits, rewards + RLS + trigger handle_updated_at + seed de 3 recompensas (visita 3, 5, 7)

**Servicios (lógica de negocio):**
- `src/services/customer.service.ts` — findByPhone, create, incrementVisit
- `src/services/visit.service.ts` — createVisit, getRecentVisit (anti-duplicado 1h)
- `src/services/reward.service.ts` — checkRewardForVisit
- `src/services/whatsapp.service.ts` — sendWelcome, sendReward, sendWelcomeBack (Twilio, best-effort)

**API Route:**
- `src/app/api/check-in/route.ts` — POST con 3 acciones: lookup, register, checkin

**UI Components:**
- `src/components/features/check-in/CheckInForm.tsx` — Formulario de celular + registro
- `src/components/features/check-in/CheckInForm.types.ts` — Tipos
- `src/components/features/check-in/CheckInSuccess.tsx` — Pantalla de éxito + recompensa
- `src/components/features/check-in/CheckInSuccess.types.ts` — Tipos
- `src/components/features/check-in/index.ts` — Barrel export
- `src/app/(public)/check-in/page.tsx` — Página completa con flujo de estados

**Utilidades:**
- `src/lib/validators/phone.ts` — Validación celular colombiano + formato WhatsApp

**shadcn/ui componentes añadidos:**
- `src/components/ui/input.tsx`, `card.tsx`, `label.tsx`, `sonner.tsx`

**Build:** ✅ Compila sin errores

### Archivos afectados
- 16 archivos creados
- `docs/features/qr-checkin.md` — Creado (documentación de feature)
- `docs/DB_SCHEMA.md` — Actualizado (migración registrada)
- `docs/API_DOCS.md` — Actualizado (endpoint check-in documentado)
- `docs/01-project-overview.md` — Actualizado (estado de fases)

### Request original
> Sigue con la fase 2 el qr check in

---

## [0.1.0] — 2026-04-07 16:00

### Added — Setup Inicial (Método AInnovate FASE 1)

**Documentación:**
- `docs/01-project-overview.md` — Visión, objetivos, stack (Next.js 16.2.2, React 19.2.4, Supabase, Twilio), estado del proyecto
- `docs/02-architecture.md` — Estructura de carpetas, stack completo con versiones reales, ADRs, convenciones, flujos de datos
- `docs/03-security.md` — Autenticación (Supabase Auth), autorización, variables de entorno, validaciones, reglas
- `docs/04-deployment.md` — Template de deployment (Vercel, pendiente de configurar)
- `docs/DB_SCHEMA.md` — Esquema completo: 6 tablas (customers, visits, rewards, campaigns, campaign_messages, authorized_numbers), diagrama ER Mermaid, RLS, triggers
- `docs/API_DOCS.md` — 9 endpoints documentados (health, check-in, webhook, cron x2, dashboard x4)
- `docs/SKILLS.md` — Registro de 7 skills n8n disponibles en el IDE
- `docs/features/` — Carpeta para features (se llena en FASE 2)

**Reglas para 6 IDEs:**
- `.windsurfrules` — Windsurf/Cascade
- `CLAUDE.md` — Claude Code
- `.cursorrules` — Cursor
- `.clinerules` — Cline/Continue
- `.github/copilot-instructions.md` — GitHub Copilot
- `.aider.conf.yml` — Aider

**Proyecto Next.js:**
- Inicializado con `create-next-app@16.2.2` (App Router, TypeScript, TailwindCSS v4)
- shadcn/ui inicializado (Button + utils generados)
- Dependencias: `@supabase/supabase-js`, `@supabase/ssr`, `twilio`, `lucide-react`
- Estructura de carpetas: `src/app/(public)`, `src/app/(dashboard)`, `src/app/api/`, `src/lib/supabase/`, `src/lib/twilio/`, `src/types/`, `src/constants/`, `src/services/`, `src/hooks/`, `src/components/{ui,layout,features}`
- Supabase client/server/middleware configurados
- Middleware de auth para proteger `/dashboard/*`
- API Routes placeholder: health, webhook/delivery, cron/birthday, cron/reactivation
- Tipos TypeScript para todas las tablas de DB
- `.env.example` con todas las variables necesarias
- `.gitignore` configurado (excluye .env* excepto .env.example)

**Build:** ✅ Compila sin errores (TypeScript + Next.js)

### Archivos creados (32 archivos)
- `docs/` — 7 archivos de documentación + 1 carpeta features
- 6 archivos de reglas para IDEs
- `CHANGELOG.md`, `METODO_AINNOVATE.md`, `.env.example`
- `src/app/(public)/check-in/page.tsx`
- `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/api/health/route.ts`, `src/app/api/webhook/delivery/route.ts`
- `src/app/api/cron/birthday/route.ts`, `src/app/api/cron/reactivation/route.ts`
- `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`
- `src/lib/twilio/client.ts`
- `src/middleware.ts`
- `src/types/database.types.ts`
- `src/constants/rewards.ts`

### Request original
> Lee el archivo METODO_AINNOVATE.md completo y sigue las instrucciones de la FASE 1. Mi proyecto es una plataforma integral (Full-Stack) de fidelización, CRM y automatización de marketing para un restaurante. Stack: Next.js (App Router) + Supabase + TailwindCSS + Shadcn/UI + Twilio SDK.
