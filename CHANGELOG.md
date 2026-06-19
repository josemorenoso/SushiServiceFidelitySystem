# Changelog — RestaurantQR

> Formato: [Semantic Versioning](https://semver.org/)
> Cada entrada incluye: fecha, tipo, archivos afectados, request original.

---

## [DOCS] — 2026-06-17 — docs: auditoria completa de ventas, competencia y actualización de pricing

> Request: auditura como dueño de negocio, analizar competencia directa, definir prioridades y actualizar precios a modelo único antes de invertir en pauta publicitaria.

### Added
- `docs/AUDITORIA_VENTAS_COMPETENCIA_JUNIO_2026.md` — Documento maestro con:
  - Estado actual de marca (crisis de identidad RestaurantQR/Constelarys/Cada1).
  - Auditoria de Instagram (@cada_1_: 3 publicaciones, 2 seguidores, link caído).
  - Auditoria de landing page (diseño excelente pero precio desactualizado, sin demo QR, sin sección "Sin apps").
  - Análisis competitivo detallado de 4 rivales: Clubify, TrackingTable, Loyalz Club, Dardo.
  - Matriz comparativa 8×5 con ventajas y debilidades.
  - 4 diferenciadores inimitables de Cada1.
  - Plan de acción en 4 fases (Fundamentos → Instagram → Material de ventas → Autoridad → Pauta).
  - Checklist "Listo para pauta" con 13 items bloqueantes.
  - Mensaje de ventas recomendado con headlines y sección de diferenciadores.

### Changed
- `CONTEXTO_PAGINA_WEB.md` — pricing actualizado de 3 planes ($89K/$149K/$249K) a modelo único: setup $1.200.000 + mensualidad $250.000.
- `docs/operaciones/PROCESO_VENTAS_IMPLEMENTACION.md` — precio de cierre actualizado a $250K/mes + $1.2M setup.
- Tabla comparativa de diferenciadores en `CONTEXTO_PAGINA_WEB.md` — fila "Sin app" fusionada con "Sin Wallet" para enfatizar ventaja sobre Clubify/Loyalz/Dardo.

### Decisiones de negocio documentadas
- Nombre comercial unificado: **Cada1**. `RestaurantQR` y `Constelarys` quedan como técnicos/internos.
- Precio único sin planes: setup $1.200.000 COP + $250.000 COP/mes. Margen operativo alto (costo real ~$8-20 USD/mes por cliente).
- No invertir en pauta hasta completar Fase 0 (5 items bloqueantes) + Fase 1 (Instagram mínimo viable).
- Diferenciador principal a comunicar: **"Sin app, sin wallet, sin depender de Apple ni Google"** — ninguna competencia lo dice.

---

## [2.1.0] — 2026-06-17 — feat: activación del auto-envío del calendario (scheduler n8n + dispatch manual)

> Request: resolver los bloqueantes del calendario de eventos — el cron `calendar-dispatch` nunca corría, la UI mostraba un mensaje obsoleto ("el path de envío no está cableado"), no había forma de disparar/reintentar un evento manualmente, y no se advertía si faltaban las plantillas Twilio. Decisión: disparar el cron desde n8n self-hosted (no Vercel) para no pagar plan Pro.

### Fixed
- `src/components/dashboard/Calendar/EventDetailDrawer.tsx` — eliminado el mensaje obsoleto "El path de envío todavía no está cableado…"; ahora explica que el envío es automático y ofrece envío manual.
- `src/app/api/dashboard/calendar/events/[id]/route.ts` — corregido comentario obsoleto del PATCH que afirmaba que el envío inmediato no estaba disponible.

### Added
- `src/app/api/dashboard/calendar/events/[id]/dispatch/route.ts` — endpoint POST (auth admin) para disparar manualmente el auto-envío de un evento. Acepta status `scheduled` (envío anticipado) y `failed` (reintento, rearmando a `scheduled` antes de ejecutar `executeAutoEvent`).
- `EventDetailDrawer` — botón "Enviar ahora" / "Reintentar envío" para eventos auto en estado `scheduled`/`failed`, con resumen de resultado (enviados/fallidos/excluidos por cap).
- `EventDetailDrawer` — alerta proactiva cuando falta la plantilla Twilio requerida (`event_template_image_sid` / `event_template_video_sid` según `media_type`), leída desde `/api/dashboard/settings`.

### Infra
- El auto-envío del calendario se dispara desde **n8n self-hosted** (Schedule cada 15 min → HTTP POST a `/api/cron/calendar-dispatch` con `Authorization: Bearer CRON_SECRET`). NO se agregó a `vercel.json` a propósito: `*/15` + ser el 3er cron exigiría plan Vercel Pro. `birthday` y `reactivation` siguen en Vercel cron (2 crons diarios → caben en Hobby).
- Requiere `CRON_SECRET` configurado igual en Vercel (prod) y en la credencial Header Auth de n8n.

### Notes
- El envío real con media sigue dependiendo de que Meta apruebe las plantillas `twilio/media`.

---

## [DOCS] — 2026-06-17 — docs: consolidación de documentación de infraestructura en un solo doc central

> Request: purgar y unificar todos los archivos de implementación/despliegue en un único doc central organizado por plataforma (Vercel, Supabase, Twilio, n8n).

### Added
- `docs/04-deployment.md` — doc central único que reemplaza los 4 archivos archivados. Secciones: arquitectura, Vercel (env vars, crons), Supabase (23 migraciones), Twilio (números, Messaging Service, webhooks, opt-out API), n8n (W1 delivery, W2 calendar-dispatch con JSON importable, W3 google-contacts-sync), onboarding paso a paso, checklist, costos y riesgos.

### Removed (archivados en `docs/archive/`)
- `docs/INFRAESTRUCTURA.md` → `docs/archive/INFRAESTRUCTURA-obsolete.md`
- `docs/DEPLOYMENT_GUIDE.md` → `docs/archive/DEPLOYMENT_GUIDE-obsolete.md`
- `docs/CONFIGURACIONES_TWILIO_SISTEMA.md` → `docs/archive/CONFIGURACIONES_TWILIO_SISTEMA-obsolete.md`
- `docs/n8n-workflows/README.md` → `docs/archive/n8n-workflows-README-obsolete.md`

### Changed
- `docs/features/calendar.md` — scheduler actualizado a n8n self-hosted; endpoint dispatch añadido.
- `docs/API_DOCS.md` — añadido `POST .../dispatch`, sección "Cron: Calendar Dispatch".
- `docs/SKILLS.md` — sección "Infraestructura externa" con n8n self-hosted.
- `CLAUDE.md` — lookup table: `src/lib/twilio/*` y `scripts/twilio-setup.mjs` apuntan a `docs/04-deployment.md` (antes apuntaban al doc archivado).
- `.windsurfrules` — mismas correcciones de lookup + entrada nueva para `scripts/twilio-setup.mjs`.
- `METODO_AINNOVATE.md` — nuevo registro en "Historial de Aplicación".

---

## [DOCS] — 2026-06-15 — docs: documento recopilatorio para presentación al cliente (Sushi Service)

> Request: recopilar toda la información del proyecto para que otra IA arme un documento/PDF de presentación al cliente, incluyendo lo logrado en 2 semanas, cómo funciona, características principales y transformación del negocio.

### Added
- `docs/PRESENTACION_CLIENTE_SushiService.md` — Documento recopilatorio completo con:
  - Métricas reales del sistema en producción (193 clientes, 7 visitas hoy, ROI $272.000 COP).
  - Timeline de versiones v1.0.0 a v2.0.0 (hitos en ~2 semanas).
  - Flujo del ecosistema (cliente presencial, domicilio, dashboard admin).
  - Características principales: campañas automáticas, sistema de puntos + Mystery Box, verificación QR por mesero, campañas masivas, control total de clientes, métricas en tiempo real.
  - Sección de transformación del negocio (antes vs. después).
  - Stack técnico y datos clave para la presentación.

### Notes
- Sin cambios de código del sistema. Solo documentación recopilatoria para uso comercial/presentación.

---

## [2.0.0] — 2026-06-12 — feat: tracking de redención física de premios + Golden Bullet (importación masiva)

> Request: desarrollar el requerimiento `docs/features/REQUIREMENT_AUDIT_redemptions_bulk_import.md` — (A) trazabilidad de la entrega física de premios para cuadrar con el POS, y (B) importación masiva de contactos externos con envío de un solo disparo, bloqueo anti-reenvío y ROI automático.

### Added — Feature A: Redención física de premios
- `supabase/migrations/00022_reward_redemptions.sql` — tabla `reward_redemptions` (cliente, premio, mesero, mesa, ref. POS, origen) + índices + RLS + índice único anti-duplicado por `mystery_box_result_id` + trigger `mark_mystery_box_redeemed`. Añade `redeemed`/`redeemed_at` a `mystery_box_results`.
- `src/services/redemption.service.ts` — `recordRedemption()`, `getRedemptions()`, `getRedemptionSummary()`, `getPendingReward()`/`hasPendingReward()`, `getCustomerRedemptions()`.
- `src/app/api/reward-redeem/route.ts` — POST staff (Bearer JWT / X-Device-Token) para registrar la entrega física.
- `src/app/api/dashboard/redemptions/route.ts` + `/summary/route.ts` — listado con filtros y resumen agrupado (por premio/hora/mesero) para cuadrar con POS.
- `src/app/(dashboard)/dashboard/redemptions/page.tsx`, `src/components/dashboard/RedemptionsTable.tsx`, `RedemptionSummaryCards.tsx` — dashboard con filtros de fecha, heatmap de turnos y export CSV.
- `src/components/features/staff/RewardAlert.tsx` — alerta "Cliente tiene premio pendiente" + botón "Registrar Entrega" en la pantalla del mesero (integrada en `/mesero/confirm`).

### Added — Feature B: Golden Bullet (importación masiva)
- `supabase/migrations/00023_imported_contacts.sql` — tabla `imported_contacts` (separada de `customers`) + columna `customers.imported_contact_id` para trazabilidad + RLS + seed feature flag `golden_bullet_enabled` y `twilio_cost_per_message_usd`.
- `src/services/imported-contacts.service.ts` — `validateCSV()` (sin insertar), `confirmImport()` (envío en batches de 10), `listBatches()`, `getBatchStats()`, `getBatchRoi()`, `markConverted()`, bloqueo anti-reenvío vía `getExistingPhones()`.
- `src/app/api/dashboard/imported-contacts/{validate,confirm,stats,roi}/route.ts` + `route.ts` — validar CSV, confirmar/enviar, listar lotes, estadísticas y ROI por lote (todos Admin Cookie + feature flag en los mutantes).
- `src/app/(dashboard)/dashboard/imported-contacts/page.tsx` + `ImportedContactsUploader.tsx`, `ImportedContactsCostEstimator.tsx`, `ImportedContactsHistory.tsx` — wizard de 5 pasos (subir → validar → costo → plantilla → confirmar) e historial con ROI.
- `public/plantilla_golden_bullet.csv` — plantilla descargable.

### Changed
- `src/app/api/check-in/status/route.ts` — añade `pending_reward` y `customer.id` a la respuesta para alimentar la alerta del mesero.
- `src/app/api/check-in/route.ts` — en `action:'register'`, detecta si el teléfono provino de un contacto importado y lo marca como `converted`, guardando `customers.imported_contact_id` (activa el ROI).
- `src/app/api/mystery-box/resolve/route.ts` + `src/services/mystery-box.service.ts` — el resultado incluye `result_id`/`resultId` para vincular la redención física.
- `src/components/layout/DashboardSidebar.tsx` — nuevos ítems "Redenciones" y "Golden Bullet".
- `src/types/database.types.ts` — interfaces `RewardRedemption`, `ImportedContact`, campos `redeemed`/`redeemed_at` en `MysteryBoxResult`, `imported_contact_id` en `Customer`, entradas en `Database['public']['Tables']`.

### Fixed
- Las migraciones 00022/00023 originales usaban `CREATE POLICY IF NOT EXISTS` (sintaxis NO soportada por Postgres) → reescritas con patrón `DROP POLICY IF EXISTS` + `CREATE POLICY`. La 00023 referenciaba `imported_contacts` en una FK de `customers` antes de crear la tabla → reordenado.

### Docs
- `docs/features/redemption-tracking.md` y `docs/features/golden-bullet.md` — nuevos documentos de feature.
- `docs/DB_SCHEMA.md` — tablas `reward_redemptions`, `imported_contacts`, columnas nuevas, migraciones 00022/00023.
- `docs/API_DOCS.md` — nuevos endpoints documentados.

### Notes
- **Acción manual:** ejecutar las migraciones `00022` y `00023` en Supabase.
- **Feature flag:** Golden Bullet viene **desactivado** (`golden_bullet_enabled='false'`); actívalo en `admin_settings` para usarlo.
- La plantilla de Golden Bullet debe ser `MARKETING` aprobada por Meta y SIN link de registro.

---

## [1.8.0] — 2026-06-12 — feat: opt-out persistente de WhatsApp (resuelve auditoría 12-Julio, tarea 8)

> Request: resolver la primera tarea pendiente prioritaria (opt-out persistente) y registrar el resto del pendiente. El sistema detectaba opt-outs pero no los bloqueaba: seguía enviando a quien respondió SALIR, generando errores 21610/63016.

### Added
- `supabase/migrations/00021_customer_whatsapp_opt_out.sql` — columna `customers.whatsapp_opt_out_at` (timestamptz, nullable) + índice parcial `WHERE whatsapp_opt_out_at IS NOT NULL`.
- `src/services/customer.service.ts` — `setWhatsappOptOut(phone)`, `clearWhatsappOptOut(phone)`, `isPhoneOptedOut(phone)`. Todas best-effort (no rompen el flujo; `isPhoneOptedOut` devuelve `false` ante error de DB para no bloquear envíos legítimos).

### Changed
- `src/app/api/webhook/twilio-incoming/route.ts` — al recibir un keyword de **opt-out** (SALIR/STOP/BAJA/CANCELAR/FUERA…) persiste `whatsapp_opt_out_at = now()` y `accepts_marketing = false`; un keyword de **opt-in** (ALTA/START/ACEPTO…) limpia el opt-out y reactiva marketing. Antes solo devolvía 200 sin tocar la base de datos.
- `src/services/whatsapp.service.ts` — `sendTemplateMessage` verifica `isPhoneOptedOut(phone)` **antes de enviar**; si el cliente está en opt-out, omite el envío (no gasta el mensaje ni genera 21610) y lo registra en `message_logs` con `error_code='opted_out_local'`.
- `src/types/database.types.ts` — `whatsapp_opt_out_at` en `Customer` + `Insert`.

### Docs
- `docs/DB_SCHEMA.md` — columna en `customers`, índice y migración 00021.
- `docs/features/twilio-opt-out.md` — sección "Opt-out persistente (v1.8.0)".
- `docs/AUDIT-12-Julio/RESOLUCION.md` — tarea 8 marcada como resuelta; pendiente reordenado por valor neto (tareas 6-7 marcadas como cubiertas por el panel `twilio-metrics`).

### Notes
- **Acción manual:** ejecutar las migraciones `00020` y `00021` en Supabase.
- El opt-out bloquea **todos** los envíos (transaccionales y campañas), coherente con el bloqueo a nivel de cuenta de Twilio. Los premios siguen siendo reclamables vía el fallback visual de la UI (v1.7.0).

---

## [1.7.0] — 2026-06-12 — feat: tracking de mensajes WhatsApp + fallback visible en Mystery Box (resuelve auditoría 12-Julio, bloque 1-4)

> Request: resolver el bloque de tareas 1–4 de la auditoría 12-Julio — el caso del cliente que gana un premio en Mystery Box y nunca recibe el WhatsApp de confirmación, sin que nadie se entere del fallo.

### Added
- `supabase/migrations/00020_message_logs.sql` — **nueva tabla `message_logs`** que persiste TODOS los mensajes WhatsApp (transaccionales y de campaña): `customer_id`, `phone`, `message_type`, `template_sid`, `variables`, `status` (pending/sent/delivered/failed/undelivered), `twilio_sid`, `error_code`, `error_message`, `sent_at`, `delivered_at`. Incluye índices y RLS (admin lee, service inserta/actualiza). La columna `delivered_at` queda lista para el futuro webhook de status callback. _(Tarea 3)_
- `src/services/message-log.service.ts` — servicio `recordMessageLog()` best-effort (un fallo de escritura nunca rompe el envío). _(Tarea 4)_
- `src/types/database.types.ts` — interfaz `MessageLog`, tipos `MessageLogStatus`/`MessageLogType` y entrada `message_logs` en `Database`.

### Fixed
- `src/app/api/mystery-box/resolve/route.ts` — **eliminado el `.catch()` silencioso** que ocultaba los fallos de WhatsApp y respondía `ok:true` aunque el cliente no recibiera nada (causa principal del caso reportado). Ahora el envío se captura y la respuesta incluye `whatsapp_sent: boolean` y `whatsapp_reason`. _(Tarea 1)_

### Changed
- `src/services/whatsapp.service.ts` — `sendTemplateMessage` acepta un `logContext` opcional (`{ customerId, messageType }`) y persiste cada intento en `message_logs` con su estado y código de error de Twilio. Sin `logContext` el comportamiento es idéntico al anterior (retrocompatible). _(Tarea 4)_
- `src/app/api/check-in/route.ts` — `sendCheckinTemplate` ahora propaga `customerId` al `logContext`, de modo que welcome / tier_unlocked / points_earned_near / points_earned_far quedan registrados en `message_logs`. _(Tarea 4)_
- `src/components/features/check-in/CheckInSuccess.tsx` y `MysteryBoxResult.tsx` — **fallback visual**: si `whatsapp_sent=false`, se muestra "No pudimos enviarte el WhatsApp. Muestra esta pantalla al mesero para reclamar tu premio" y se oculta el texto que afirma que el WhatsApp fue enviado. _(Tarea 2)_

### Docs
- `docs/DB_SCHEMA.md` — tabla `message_logs` (índice, ER, sección, migración 00020, resumen RLS).
- `docs/AUDIT-12-Julio/RESOLUCION.md` — documento de seguimiento: qué se resolvió (1-4) y qué queda pendiente (5-15).
- `docs/features/points-mystery-box.md` — nota sobre `whatsapp_sent` y persistencia en `message_logs`.

### Pendiente (siguientes bloques de la auditoría)
- Webhook de status callback (`/api/webhook/twilio-status`) + `statusCallback` en `messages.create` para llenar `delivered_at`. _(Tarea 5)_
- Endpoint `/api/health` + widget de plantillas sin configurar. _(Tareas 6-7)_
- Opt-out persistente, retry con backoff, prechequeo de número, atomicidad en `awardPoints`. _(Tareas 8-12)_

---

## [AUDIT] — 2026-07-12 — audit: auditoria completa del sistema de mensajeria WhatsApp

> Request: un cliente con 3 visitas recibio puntos, llego al premio, escogio mystery box, gano bebida gratis, pero nunca recibio el mensaje de WhatsApp. Auditar todo el sistema de mensajes sin hacer correcciones.

### Audited (sin cambios de codigo)
- `src/services/whatsapp.service.ts` — envio de plantillas Twilio, progressive retry, manejo de errores
- `src/app/api/check-in/route.ts` — flujo completo de check-in, envio de WhatsApp de bienvenida/puntos/tier desbloqueado
- `src/app/api/mystery-box/resolve/route.ts` — resolucion de premio y envio de WhatsApp de confirmacion (safe/mystery/golden)
- `src/app/api/webhook/delivery/route.ts` — webhook de domicilios y envio de WhatsApp
- `src/app/api/cron/birthday/route.ts` — cron de cumpleanos y tracking en campaign_messages
- `src/app/api/cron/reactivation/route.ts` — cron de reactivacion suave/agresiva y tracking en campaign_messages
- `src/app/api/dashboard/campaigns/manual/route.ts` — campanas manuales y tracking en campaign_messages
- `src/services/campaign.service.ts` — tracking de mensajes de campana (campaign_messages)
- `src/services/points.service.ts` — otorgamiento de puntos, transacciones, algoritmo inteligente
- `src/services/mystery-box.service.ts` — pity timer, global caps, seleccion de premios
- `src/services/reward-tiers.service.ts` — evaluacion de tiers y roadmaps
- `src/app/api/webhook/twilio-incoming/route.ts` — manejo de mensajes entrantes, opt-out, forwarding a n8n
- `src/app/api/dashboard/twilio-metrics/route.ts` — consulta pasiva de metricas desde Twilio API
- `src/lib/rate-limit.ts` — rate limiting en memoria
- `docs/PLANTILLAS.md` — documentacion de plantillas v1.0.2
- `docs/features/flujo-plantillas-recompensas-campanas.md` — documentacion legacy v0.23.0
- `docs/DB_SCHEMA.md` — esquema de tablas relevantes a mensajeria

### Hallazgos criticos (documentados)
- **Sin webhook de status callback de Twilio:** no se recibe notificacion de entrega/fallo real. La tabla campaign_messages nunca se actualiza a `delivered`.
- **Mensajes transaccionales no se persisten:** check-in, welcome, tier_unlocked, mystery_box, safe, golden — ninguno se guarda en DB. Si falla, solo queda log efimero de Vercel.
- **`.catch()` silencioso en mystery-box/resolve:** si el envio de WhatsApp falla, la API responde `ok: true` al frontend. El cliente nunca sabe que no le llegara el mensaje.
- **No hay retry automatico:** cualquier fallo es definitivo.
- **Opt-out no persistente:** el webhook entrante maneja keywords pero no marca al cliente en la base de datos.
- **Race condition en puntos:** `awardPoints` hace SELECT -> UPDATE no atomico.
- **Rate limit en memoria:** en Vercel serverless no comparte estado entre instancias.

### Added (docs)
- `docs/AUDIT-12-Julio/AUDIT_WHATSAPP_MENSAJERIA.md` — informe tecnico completo de auditoria (severidad, lineas exactas, recomendaciones).
- `docs/AUDIT-12-Julio/RESUMEN_VISUAL.md` — resumen ejecutivo visual con mapa de calor, checklist de diagnostico y proximos pasos.

---

## [1.6.2] — 2026-06-11 — fix: doble conteo de puntos en primera visita verificada por mesero

> Request: al activar "pedir QR desde el principio" (check-in verificado por mesero), un cliente nuevo terminaba con 138 pts en su primera visita (90 de bienvenida + 48 de la visita) cuando debía recibir solo ~90. Corregir sin alterar el funcionamiento del modo normal.

### Fixed
- `src/app/api/check-in/route.ts` — **register:** cuando la primera visita queda pendiente del escaneo del mesero (`pendingStaffScan=true`, modo `staff_verified` + `checkin_first_visit_free=false`), ya NO se otorga el bono de bienvenida ni se envía el WhatsApp en el registro. El bono previo + los puntos de la visita causaban doble conteo (90+48=138). Ahora los puntos se asignan una sola vez, en el escaneo del mesero.

### Added
- `src/app/api/check-in/route.ts` — **checkin:** en la primera visita verificada por el mesero (`isFirstVisit`, detectado por `total_visits === 0` antes del incremento) se envía la plantilla de **bienvenida** (`welcome_template_sid`) en lugar de la de "sumaste puntos", para que el cliente nuevo no parezca frecuente.
- `src/components/features/check-in/CheckInForm.tsx` — el polling muestra la pantalla de **bienvenida** (no "¡volviste!") cuando detecta que la visita registrada es la primera (`total_visits === 1`).
- `src/app/(public)/check-in/page.tsx` — `handleRegisterSuccess` envuelto en `useCallback` para estabilizar el efecto de polling (ahora también depende de él).

### Notes
- **Sin impacto en el modo `auto` (normal):** `pendingStaffScan` solo es `true` en `staff_verified` + primera visita no libre; en modo auto el cliente nuevo recibe su bono y WhatsApp en el registro exactamente como antes, e `isFirstVisit` nunca se activa en `checkin` (los clientes nuevos ya tienen `total_visits ≥ 1`).
- Para que el WhatsApp de bienvenida salga en este flujo, debe estar configurado `welcome_template_sid` en Dashboard → Ajustes (sin fallback si falta).

---

## [1.5.2] — 2026-06-10 — feat: desglose de fallos por motivo en Mensajería

> Request: entender por qué hay 59 mensajes fallidos — el panel solo contaba los fallos sin explicar la causa.

### Added
- `src/app/api/dashboard/twilio-metrics/route.ts` — agrega `failureBreakdown` al response: agrupa los outbound `failed`/`undelivered` por `error_code` con descripción legible (`describeTwilioError`: número inválido, sin WhatsApp, opt-out, plantilla rechazada, etc.).
- `src/components/dashboard/TwilioMessagesPanel.tsx` — nueva sección "¿Por qué fallaron?" (tabla cantidad/motivo/código) visible solo cuando hay fallos.

---

## [1.5.1] — 2026-06-10 — refactor: Mensajería como panel colapsable dentro de Métricas

> Request: mover la sección de Mensajería al área de Métricas detrás de un botón que se deba presionar para ver (que no esté plenamente visible).

### Added
- `src/components/dashboard/TwilioMessagesPanel.tsx` — panel colapsable con la UI completa de Mensajería WhatsApp (KPIs, gráfico de área, tabla de opt-outs, selector 7/30/90 días, `TwilioWallet`). **Carga diferida:** la consulta a la Twilio Messages API solo se dispara cuando el usuario abre el panel por primera vez, para no penalizar la carga del dashboard.

### Changed
- `src/app/(dashboard)/dashboard/page.tsx` — monta `<TwilioMessagesPanel>` al final de la página de Métricas, colapsado tras un botón "Mensajería WhatsApp".
- `src/components/layout/DashboardSidebar.tsx` y `DashboardHeader.tsx` — removido el nav item "Mensajería" (y el icono `MessageCircle` sin uso); ahora se accede desde Métricas.

### Removed
- `src/app/(dashboard)/dashboard/mensajes/page.tsx` — página standalone eliminada; su contenido vive ahora en el panel colapsable.

---

## [1.5.0] — 2026-06-10 — feat: Dashboard de Métricas de Twilio (Req P2.3)

> Request: desarrollar P2.3 (Dashboard Twilio) de `docs/requerimientos/REQUERIMIENTOS_SISTEMA.md`. Solo este P2.

### Added
- `src/app/api/dashboard/twilio-metrics/route.ts` — endpoint que consulta la Twilio Messages API en tiempo real (hasta 5 páginas × 1000 msgs, rango 1-90 días): conteos por estado (enviados/entregados/leídos/fallidos/no entregados/en tránsito), tasas de entrega y lectura, timeline diario, y detección de opt-outs por doble vía (keyword inbound SALIR/STOP/... + error 21610/63016 outbound) con mapeo a nombres de `customers`. Auth: Admin Cookie. Tipado estricto sin `any`.
- `src/app/(dashboard)/dashboard/mensajes/page.tsx` — página "Mensajería WhatsApp": 4 KPI cards, gráfico de área (recharts, ya en deps) con evolución diaria, tabla de opt-outs con cliente/motivo/fecha, selector de rango 7/30/90 días, advertencia si los datos están truncados, y `TwilioWallet` (saldo) reusado.
- `docs/features/twilio-metrics.md` — doc de la feature (arquitectura, limitaciones, pendientes).

### Changed
- `src/components/layout/DashboardSidebar.tsx` y `DashboardHeader.tsx` — nav item "Mensajería" (`/dashboard/mensajes`, icono `MessageCircle`).
- `docs/API_DOCS.md` — endpoint `/api/dashboard/twilio-metrics` documentado (tabla + sección con response).

### Notes
- Sin cambios de DB: las métricas se leen on-demand de Twilio (no requiere status callbacks ni almacenamiento local).
- Limitación: read rate depende de confirmaciones de lectura del cliente WhatsApp; opt-outs solo detectables dentro del rango consultado (Twilio no expone lista de bloqueados vía API).

---

## [1.4.0] — 2026-06-10 — feat: requerimientos P1 (reactivación configurable, rediseño reseñas, rediseño campañas)

> Request: desarrollar los 3 requerimientos P1 de `docs/requerimientos/REQUERIMIENTOS_SISTEMA.md` (P1.1 días reactivación configurables, P1.2 rediseño review UX, P1.3 rediseño módulo campañas).

### Added
- `src/components/features/check-in/GoogleReviewCard.tsx` — card inline de solicitud de reseña (reemplaza el modal `GoogleReviewPopup`): sin overlay ni X (elimina "instinct close"), CTA a Google siempre habilitado con microcopy explícito, rating interno opcional separado visualmente con disclaimer "NO es la reseña de Google", estado de confirmación post-clic.
- `src/services/settings.service.ts` — `getReactivationDaysConfig()`: lee `reactivation_soft_days`/`reactivation_aggressive_days` de `admin_settings` con fallback a constantes y validación (agresiva > suave, si no → suave+4).
- `docs/features/review-flow.md` — doc de la feature de reseñas.
- `docs/requerimientos/REQUERIMIENTOS_SISTEMA.md` — reorganizado en secciones P1/P2/P3 con checks de desarrollo por requerimiento.

### Changed
- `src/services/campaign.service.ts` — `findInactiveCustomers(reactivationDays?)` ahora acepta días como parámetro (default `REACTIVATION_DAYS`).
- `src/app/api/cron/reactivation/route.ts` — usa días configurables vía `getReactivationDaysConfig()` para cutoffs suave/agresivo; response incluye `reactivation_soft_days` y `reactivation_aggressive_days`. Removido import de `REACTIVATION_AGGRESSIVE_DAYS`.
- `src/app/(dashboard)/dashboard/settings/page.tsx` — nueva sección "Reactivación de Clientes" con inputs de días suave/agresiva, validación en UI (agresiva > suave) y guardado en `admin_settings`.
- `src/app/(dashboard)/dashboard/campaigns/page.tsx` — rediseño UX: fila de KPIs del mes (campañas, mensajes, última ejecución), badge de estado real por campaña automática (Activa/Sin plantilla según settings), preview real del body de la plantilla Twilio configurada (en card y en dialog de confirmación), días de reactivación dinámicos en la descripción, botón "Ejecutar Ahora" deshabilitado sin plantilla, estados del historial traducidos al español, link directo a Ajustes.
- `src/components/features/check-in/CheckInSuccess.tsx` — usa `GoogleReviewCard` inline (entre el mensaje de WhatsApp y el botón "Nuevo check-in") en lugar del popup modal; timer de aparición 4s → 2.5s.

### Notes
- `src/components/features/check-in/GoogleReviewPopup.tsx` queda DEPRECADO sin referencias (no se eliminó — pendiente autorización).
- Nuevas keys en `admin_settings` (sin migración — tabla key/value): `reactivation_soft_days`, `reactivation_aggressive_days`. Documentadas en `docs/DB_SCHEMA.md` y `docs/API_DOCS.md`.
- Docs actualizados: `docs/features/campaigns.md`, `docs/features/review-flow.md` (nuevo), `docs/DB_SCHEMA.md`, `docs/API_DOCS.md`.

---

## [1.3.0] — 2026-06-08 — feat: fidelización visual Fase 1 ("a prueba de imbéciles")

> Request: el cliente no entiende que debe mostrar el QR al mesero (visitas fantasma), los premios se ven chiquitos, no se pueden eliminar dispositivos. Objetivo: tarjeta visual estilo wallet, premios grandes, gestión de dispositivos.

### Added
- `src/components/features/check-in/CustomerCard.tsx` — tarjeta tipo wallet que reemplaza la pantalla del QR del cliente: banner rojo imperativo "DILE AL MESERO QUE TE ESCANEE", QR 270px con borde pulsante, termómetro de puntos gigante (h-8) con animación de llenado, camino completo de recompensas (reusa `TiersRoadmap`), y overlay de dopamina "+X pts" cuando el mesero registra la visita.
- `src/app/api/public/points-range/route.ts` — endpoint público que expone el rango de puntos por visita (`{ min, max }`) desde `admin_settings`. Rate limited 60/min por IP, cache 60s. Usado como gatillo de gamificación en el registro.
- `src/app/api/dashboard/staff/device/route.ts` — `PATCH` (revocar, soft → `is_trusted=false`) y `DELETE` (eliminar, hard, solo si ya revocado) de dispositivos de confianza. Protegido por sesión de dashboard.

### Changed
- `src/components/features/check-in/RewardsPreview.tsx` — rediseño completo: tarjetas grandes en carrusel horizontal (emoji 40px, premio, pts), título destacado, badge del rango de puntos por visita, y explicación de la Mystery Box. Ahora se muestra también en el step `register` (antes solo en `phone`).
- `src/components/features/check-in/CheckInForm.tsx` — usa `CustomerCard` para el step `customer_qr`; fetch del rango de puntos; overlay de dopamina ~1.6s antes de pasar a la pantalla de éxito; `RewardsPreview` con `pointsRange` en `phone` y `register`. Removidos imports sin uso (`QRCodeSVG`, `STAFF_LABEL`).
- `src/app/api/public/reward-tiers/route.ts` — el payload público ahora incluye `mystery_box_enabled` (requerido por `TiersRoadmap` en la tarjeta).
- `src/components/features/check-in/TiersRoadmap.tsx` — `mystery_box_enabled` ahora opcional en el tipo (compatibilidad con el payload público).
- `src/app/(dashboard)/dashboard/staff/page.tsx` — columna "Acciones" en la tabla de dispositivos con botones Revocar (si activo) y Eliminar (si revocado), con confirmación y toasts.

### Notes
- Fase 2 (documentada, NO implementada): tarjeta digital permanente accesible fuera del check-in, envío por WhatsApp con link permanente, y tarjetas/cupones personalizados desde el dashboard.
- Decisión de producto: NO se usan "sellos de visitas" — el progreso es solo por puntaje (termómetro), para no confundir con los puntos.
- Spec: `docs/features/visual-loyalty-fase1-spec.md`. Plan: `docs/superpowers/plans/2026-06-08-visual-loyalty-fase1.md`.

---

## [1.2.6] — 2026-06-03 — feat: preview dinámica de recompensas + política de privacidad (Ley 1581)

### Added
- `src/app/api/public/reward-tiers/route.ts` — endpoint público (sin auth) que expone los tiers activos para la preview del check-in. Rate limited 60/min por IP.
- `src/components/features/check-in/RewardsPreview.tsx` — componente que muestra los tiers reales (nombre, puntos, premio seguro) debajo del botón Continuar en el paso del celular. Carga dinámica desde DB; si falla, no bloquea el formulario.
- `src/app/(public)/privacidad/page.tsx` — página de política de privacidad (Ley 1581 Colombia). Usa `BRAND_NAME` para personalización por clon. Link de contacto vía `RESTAURANT_WHATSAPP_LINK`.

### Changed
- `src/components/features/check-in/CheckInForm.tsx` — step 'phone': fetch de tiers al montar, render de `RewardsPreview` si hay tiers disponibles. Checkbox de consentimiento ahora incluye link a `/privacidad` (Política de Privacidad).

---

## [1.2.5] — 2026-06-03 — feat: NEXT_PUBLIC_STAFF_ROLE_LABEL + script validate-env + Notion Paso a Paso

### Added
- `src/lib/branding.ts` — nuevas exportaciones `STAFF_LABEL` y `STAFF_LABEL_PLURAL` leídas de `NEXT_PUBLIC_STAFF_ROLE_LABEL` (default: `Mesero`). Permite adaptar el sistema a cualquier tipo de negocio sin tocar código.
- `scripts/validate-env.mjs` — validador de entorno ejecutable antes de cada deploy. Verifica variables requeridas, formatos (JWT length, prefijo whatsapp:) y conexión real a Supabase.
- `.env.example` — nueva variable `NEXT_PUBLIC_STAFF_ROLE_LABEL=Mesero` documentada.

### Changed
- `src/components/layout/DashboardSidebar.tsx` — nav label "Meseros QR" ahora usa `STAFF_LABEL_PLURAL` (retrocompatible).
- `src/components/layout/DashboardHeader.tsx` — ídem.
- `src/app/(public)/mesero/page.tsx` — título "App del Mesero" → `App del ${STAFF_LABEL}`.
- `src/app/(public)/mesero/dashboard/page.tsx` — badge de sesión usa `STAFF_LABEL`.
- `src/components/features/check-in/CheckInForm.tsx` — textos cliente-facing ("Muéstrale este código a tu mesero") usan `STAFF_LABEL`.
- `src/components/features/check-in/CheckInSuccess.tsx` — ídem.
- `src/components/features/check-in/MysteryBoxResult.tsx` — ídem.

### Notes
- Cambio 100% retrocompatible. Sin `NEXT_PUBLIC_STAFF_ROLE_LABEL` configurada, el sistema se comporta exactamente igual que antes.
- Para barberías: agregar `NEXT_PUBLIC_STAFF_ROLE_LABEL=Barbero` en Vercel.

---

## [1.2.4] — 2026-06-02 — Docs: Sistema de operaciones, pipeline de ventas y guía de delegación

### Added

**Documentos operativos para escalar implementaciones y delegar:**
- `docs/operaciones/PROCESO_VENTAS_IMPLEMENTACION.md` — Pipeline completo de ventas e implementación por cliente nuevo. 5 fases: Lead → Reunión → Setup (2 días) → Cliente Activo → Offboarding. Incluye scripts de mensajes, tiempos estimados, y checklist pre-launch.
- `docs/operaciones/ESTRUCTURA_NOTION.md` — Especificación exacta de 4 bases de datos para Notion: Leads y Clientes, Tareas de Implementación, Inventario Técnico (restringido), y Seguimiento Mensual. Incluye propiedades, vistas, plantillas de tareas pre-creadas, y flujo de trabajo diario/semanal/mensual.
- `docs/operaciones/DELEGACION_GUIDE.md` — 11 tareas delegables a un asistente virtual medio tiempo ($1.5M–$2.5M COP/mes). Cada tarea incluye instrucciones exactas, tiempo estimado, nivel de riesgo, mensajes copy-paste, y lo que NO se puede delegar (cierre de venta, deploy final, fixes técnicos).

---

## [1.2.3] — 2026-06-01 — Feature: ROI demo con 32 reactivados + 23% atracción de campaña

### Added

**Demo ROI desglosado (solo modo demo — dashboard real sin cambios):**
- `src/lib/demo-analytics.ts`: ROI fijo con `DEMO_REACTIVATED = 32` y `DEMO_CAMPAIGN_RATE = 23%`. Calcula `retentionROI`, `campaignROI` y `estimatedROI` combinado.
- `src/components/dashboard/ROICard.tsx`: rediseñado para mostrar desglose en dos filas cuando los datos incluyen `campaignAttractionRate` (solo en modo demo). Modo real queda igual.
- `src/types/analytics.types.ts`: campos opcionales `campaignAttractionRate`, `newFromCampaigns`, `campaignROI`, `retentionROI` en `ROIEstimate`.

### Added

**Credenciales Supabase:**
- `.env.local`: creado con template completo comentado — pegar URL, anon key y service role para operaciones locales y CLI.

---

## [1.2.2] — 2026-06-01 — Config: opt-out keyword SALIR + documentación de replicación

### Changed

**Twilio Console — Opt-Out Management:**
- Agregado `SALIR` como keyword de opt-out en el Messaging Service `SushiService-Fidelity` (vía API REST). Este es el keyword que usan todas las plantillas del sistema para la instrucción de desuscripción.
- Keywords de opt-out ahora: `STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, BAJA, CANCELAR, SALIR`.
- Keywords de opt-in: `START, YES, UNSTOP, ALTA, ACEPTO`.
- Keywords de help: `HELP, INFO, AYUDA`.

### Docs

- **`docs/features/twilio-opt-out.md`** (nuevo): documentación completa del feature con:
  - Estado actual de keywords configurados.
  - Método 1: consola web.
  - Método 2: script PowerShell reproducible vía API REST.
  - Checklist de replicación para nuevo cliente.
- **`docs/CONFIGURACIONES_TWILIO_SISTEMA.md`**: actualizada la sección 3 (Opt-Out) con `SALIR` y el snippet de API REST para replicación rápida.

---

## [1.2.1] — 2026-05-31 — Fix: auditoría del sistema de plantillas WhatsApp

### Fixed

**`src/app/(dashboard)/dashboard/settings/page.tsx`:**
- **Causa raíz (slot huérfano):** el backend (`check-in`, `webhook/delivery`, `check-in-override`) lee y envía `tier_unlocked_template_sid`, pero el Dashboard NUNCA guardaba esa key → al cruzar un tier no salía mensaje en el momento del cruce.
- **Fix:** agregado el selector **"Tier desbloqueado (al cruzar nivel)"** con estado, carga y `saveSetting('tier_unlocked_template_sid', ...)`.

**`src/app/api/check-in/route.ts`:**
- **Visibilidad de fallos:** `sendCheckinTemplate` ahora devuelve `{ sent, templateType, reason }` y la respuesta del check-in incluye un objeto `whatsapp` con el estado real del envío. Antes los fallos de Twilio se tragaban en silencio (puntos subían, mensaje no llegaba, sin rastro).
- **Fallo near→far eliminado:** si el cliente está "cerca" pero `points_earned_near_template_sid` no está configurado, ya NO se manda por error la plantilla "lejos"; se reporta `no_template_configured`.
- **Orden de envío:** el WhatsApp se envía ANTES del sync de Google Contacts (webhook externo) para que su latencia/timeout nunca impida la entrega del mensaje.

**`src/services/whatsapp.service.ts`:**
- En el fallo de envío se loguea el **código de error de Twilio** (`code`/`status`/`moreInfo`) — p.ej. 63016 (opt-out), 21655 (contentSid inválido), 63007 (número fuera de WhatsApp) — para diagnosticar por qué no llega un mensaje.

### Docs
- `docs/PLANTILLAS.md`: documentado el slot `tier_unlocked_template_sid` y aclarado el flujo de **dos mensajes** en el cruce de tier (al cruzar vs. tras elegir premio).

### Nota de configuración
- Tras desplegar, en **Dashboard → Ajustes** hay que asignar la plantilla al nuevo slot "Tier desbloqueado" (si se desea mensaje en el cruce) y verificar que "Puntos sumados (cerca)" siga asignado.

---

## [1.2.0] — 2026-05-31 — Fix: puntos en 0, premio no aparece y crash scan→confirm

### Fixed

**`src/app/api/check-in/status/route.ts`:**
- **Causa raíz (puntos +0):** la consulta a `point_transactions` filtraba por columnas inexistentes `visit_id` y `type`. La tabla usa `reference_id` (id de la visita) y `source`. Resultado: `points_awarded` siempre era `0` aunque el saldo total fuera correcto.
- **Fix:** consulta corregida a `.eq('reference_id', visitId).in('source', ['visit_staff','visit_qr','visit_delivery'])`.
- **Nuevo:** el endpoint ahora calcula y devuelve `tier_unlocked` — el tier de mayor umbral que el cliente superó y aún no reclamó (sin fila en `mystery_box_results`). Esto entrega el flujo de premio al celular del cliente vía polling y auto-recupera unlocks perdidos.

**`src/components/features/check-in/CheckInForm.tsx`:**
- El polling ahora lee `data.tier_unlocked` y emite `message: 'tier_unlocked'` cuando corresponde (antes hardcodeaba `'points_earned'` e ignoraba el tier). El cliente ya ve la elección safe vs Mystery Box.

**`src/app/(public)/mesero/scan/page.tsx`:**
- **Causa raíz (crash / "page couldn't load" / tener que tocar "volver"):** html5-qrcode lanza un error SÍNCRONO `Cannot stop, scanner is not running or paused` al llamar `stop()` cuando el scanner ya no está activo, provocando un `unhandledrejection` que rompía la navegación scan→confirm en móvil.
- **Fix:** nuevo helper `safeStopScanner()` que verifica `getState()` y atrapa la excepción. Se usa en el teardown, al navegar tras escanear, al alternar modo manual.
- El modo manual ahora limpia `sessionStorage` para no mostrar un cliente obsoleto.

**`src/app/(public)/mesero/confirm/page.tsx`:**
- El lazy initializer ya NO borra `sessionStorage` en el primer render (se perdía el nombre del cliente al recargar). Ahora se limpia solo tras registrar la visita con éxito.

### Docs
- `docs/API_DOCS.md`: documentado el campo `tier_unlocked` y la consulta corregida de `point_transactions`.

---

## [1.1.9] — 2026-05-31 — Fix: crash React #310 en check-in de cliente registrado

### Fixed

**`src/components/features/check-in/CheckInForm.tsx`:**
- **Causa raíz:** El `useEffect` del polling automático estaba ubicado DESPUÉS de dos `return` condicionales (`step === 'phone'` y `step === 'register'`), violando las Reglas de Hooks de React.
- En el primer render (`step = 'phone'`) React registraba N hooks; al cambiar a `step = 'customer_qr'` detectaba N+1 hooks y lanzaba el error #310 ("Rendered fewer hooks than expected").
- **Fix:** El `useEffect` del polling se movió ANTES de todos los `return` condicionales, junto con los demás hooks del componente.

**`src/app/(public)/check-in/page.tsx`:**
- `handleCheckInSuccess` envuelto en `useCallback` para evitar que la referencia cambie en cada render y reinicie innecesariamente el intervalo de polling.

---

## [1.1.8] — 2026-05-31 — Fix: selectores de plantillas faltantes en Dashboard > Ajustes

### Fixed

**`src/app/(dashboard)/dashboard/settings/page.tsx`:**
- **Agregados 7 nuevos selectores** de plantillas WhatsApp faltantes para el sistema de puntos + Mystery Box:
  - `reward_safe_template_sid` — Premio seguro (cliente eligió "a la segura")
  - `mystery_box_result_template_sid` — Resultado de Mystery Box normal
  - `golden_box_result_template_sid` — Resultado de Golden Box (pity timer)
  - `points_earned_far_template_sid` — Puntos sumados (lejos del premio)
  - `points_earned_near_template_sid` — Puntos sumados (cerca del premio)
  - `tier_unlocked_template_sid` — Tier desbloqueado (antes de elegir safe/mystery)
  - `reactivation_aggressive_template_sid` — Reactivación agresiva (25d+)
- **Eliminados 3 selectores legacy** que el backend ya no usaba (código muerto que confundía la UI):
  - `welcome_back_near_template_sid` — Visita: cerca de premio (legacy)
  - `welcome_back_far_template_sid` — Visita: lejos de premio (legacy)
  - `reward_template_sid` — Ganaste premio milestone (legacy)
- Los selectores nuevos se agrupan visualmente bajo "Sistema de Puntos + Mystery Box".
- El `handleSaveTemplates` ahora persiste solo las keys activas en `admin_settings`.

**`docs/features/flujo-plantillas-recompensas-campanas.md`:**
- Actualizada la tabla de configuración en sección 8: agregadas las 7 nuevas keys y removidas las 3 legacy.

---

## [1.1.7] — 2026-05-31 — Feat: polling automático para flujo completo del cliente post-QR

### Added

**`src/app/api/check-in/status/route.ts`:**
- Nuevo endpoint `GET /api/check-in/status?phone=XXX` que devuelve el estado del cliente + su visita más reciente (últimos 5 minutos).
- Incluye: `hasRecentVisit`, `customer` (name, total_visits, total_points), `points_awarded`, `next_tier`, `tiers`.

**`src/components/features/check-in/CheckInForm.tsx`:**
- Cuando el cliente está en el step `customer_qr` (mostrando su QR), se inicia polling automático cada 5 segundos al nuevo endpoint.
- Cuando detecta una visita recién registrada (`hasRecentVisit: true`), transiciona automáticamente a `onCheckInSuccess`, mostrando la pantalla de éxito con puntos, visitas y roadmap de tiers.
- Indicador visual "Esperando confirmación del mesero..." mientras hace polling.
- Cleanup del intervalo al desmontar el componente.

---

## [1.1.6] — 2026-05-31 — Fix: accessibility warnings en input de mesa

### Fixed

**`src/app/(public)/mesero/confirm/page.tsx`:**
- Agregado `id="table-number"` y `name="table_number"` al input de número de mesa.
- Agregado `htmlFor="table-number"` al `<label>` para eliminar warnings de accesibilidad del browser.

---

## [1.1.5] — 2026-05-31 — Feat: capturador de errores para diagnosticar crashes del mesero

### Added

**`src/app/(public)/mesero/error.tsx`:**
- Nuevo Next.js Error Boundary para la ruta `/mesero/**` que captura cualquier error de React y muestra el mensaje + stack trace en pantalla, en vez del genérico "This page couldn't load".

**`src/app/(public)/mesero/scan/page.tsx` & `src/app/(public)/mesero/confirm/page.tsx`:**
- `window.addEventListener('error')` y `window.addEventListener('unhandledrejection')` para capturar errores de librerías externas (como `html5-qrcode`) y mostrarlos en la UI del celular.

---

## [1.1.4] — 2026-05-31 — Fix: race condition en scanner QR del mesero

### Fixed

**`src/app/(public)/mesero/scan/page.tsx`:**
- Agregado `navigatingRef` para prevenir que `handleScan` se ejecute múltiples veces si el scanner dispara callbacks duplicados.
- `handleScan` ahora detiene el scanner (`await stop() + clear()`) **antes** de llamar `router.push`, eliminando la race condition que causaba el crash "This page couldn't load" al desmontar el componente mientras `Html5Qrcode` aún estaba activo.
- Reset de `navigatingRef.current = false` cuando el decode del QR falla, permitiendo reintentar.

---

## [1.1.3] — 2026-05-31 — Fix: diagnóstico de error de conexión en lookup de clientes existentes

### Fixed

**`src/components/features/check-in/CheckInForm.tsx`:**
- Catch de `handlePhoneSubmit` ahora loguea el error real en consola y muestra el mensaje original en lugar de ocultarlo bajo "Error de conexión".

**`src/app/api/check-in/route.ts`:**
- Logging en lookup de clientes existentes: console.log antes/después de `generateCustomerQRToken` y console.error en el catch.
- Fallbacks defensivos en la respuesta del cliente: `name || 'Cliente'`, `total_visits ?? 0`, `total_points ?? 0`.

---

## [1.1.2] — 2026-05-30 — Dashboard admin para gestión de meseros QR

### Added

**`src/app/(dashboard)/dashboard/staff/page.tsx` — Frontend CRUD de meseros para admin:**
- Tabla de meseros con nombre, celular, rol, estado, último login.
- Crear mesero con nombre, celular, PIN numérico (4-6 dígitos) y rol (mesero / supervisor / admin).
- Editar mesero: cambiar nombre, rol y restablecer PIN.
- Activar / desactivar mesero con toggle.
- Eliminar mesero con confirmación.
- Tabla de dispositivos de confianza registrados (nombre, activado por, estado, último uso, expiración).

**`src/components/layout/DashboardSidebar.tsx`:**
- Nuevo item de navegación "Meseros QR" (`/dashboard/staff`) con icono `UserCog`.
- Item previo "Meseros" renombrado a "Autorizados Domicilio" para diferenciar sistemas.

### Changed

**`src/app/api/dashboard/staff/route.ts`:**
- Auth unificado de Bearer token a cookie-based (`createClient` de `@/lib/supabase/server`), consistente con todas las demás APIs del dashboard.

---

## [1.1.1] — 2026-05-30 — Auto-checkin eliminado: solo mesero registra visitas

### Changed

**`src/components/features/check-in/CheckInForm.tsx`:**
- Cliente frecuente siempre genera QR dinámico. El auto-checkin directo fue eliminado.
- El mesero es el único que puede registrar visitas escaneando el QR del cliente.

**`src/app/api/check-in/route.ts`:**
- `action: 'checkin'` siempre requiere `source: 'staff_scan'` con autenticación válida de mesero.
- El modo `checkin_mode` ya no determina si el cliente puede auto-registrarse; solo controla si la primera visita de nuevos clientes requiere mesero (`checkin_first_visit_free=false`).

---

## [1.1.0] — 2026-05-30 — Staff QR Scan: verificación presencial mesero-cliente con QR dinámico

### Added

**Sistema de verificación presencial de dos pasos (cliente → mesero):**
- `src/app/(public)/mesero/page.tsx` — Login del mesero (PIN de 4-6 dígitos) + activación de dispositivo de confianza.
- `src/app/(public)/mesero/dashboard/page.tsx` — Dashboard del mesero con stats del día y botón de escaneo.
- `src/app/(public)/mesero/scan/page.tsx` — Escáner QR con `html5-qrcode`, modo manual fallback, linterna.
- `src/app/(public)/mesero/confirm/page.tsx` — Confirmación post-escaneo: datos del cliente + input mesa + registro de visita.
- `src/hooks/useStaffAuth.ts` — Hook de autenticación dual: JWT de mesero (8h) o device_token de confianza.
- `src/lib/utils/qrcode.ts` — Generación y verificación de tokens JWT efímeros (`jose`) para QR dinámico del cliente (TTL 5 min).
- `src/app/api/staff/login/route.ts` — Login mesero: phone + PIN → JWT firmado con `STAFF_JWT_SECRET`.
- `src/app/api/staff/me/route.ts` — Validación de sesión JWT o device_token.
- `src/app/api/staff/stats/route.ts` — Visitas registradas hoy por mesero/dispositivo.
- `src/app/api/staff/device/register/route.ts` — Activar celular/tablet del restaurante como dispositivo de confianza (requiere PIN de supervisor).
- `src/app/api/staff/device/verify/route.ts` — Verificación silenciosa de device_token.
- `src/app/api/dashboard/staff/route.ts` — CRUD de meseros para admin (crear, listar, toggle activo, reset PIN, eliminar).
- `supabase/migrations/00015_staff_qr_scan.sql` — Tablas `staff_users`, `staff_devices`, FK `visits.registered_by_staff_id`, settings `checkin_mode` y `checkin_first_visit_free`, RLS, trigger `updated_at`.

**Modo de check-in configurable:**
- `checkin_mode`: `'auto'` (flujo actual) o `'staff_verified'` (requiere mesero).
- `checkin_first_visit_free`: `'true'` (default) permite primera visita libre; `'false'` requiere mesero incluso para nuevos.

**Rate limit dual:**
- Capa base por IP + capa adicional por `staff_id` o `device_token` cuando `source = 'staff_scan'` (máx 10/min).

**Cap de 24h entre check-ins ELIMINADO:**
- Antes: `getRecentVisit(customer.id, 1440)` rechazaba check-ins del mismo cliente dentro de 24h.
- Ahora: los clientes pueden acumular visitas ilimitadas por día. Cada visita otorga puntos y evalúa tiers.
- La restricción solo existía en `action = 'checkin'` (cliente existente); registro de nuevos clientes nunca tuvo cap.

### Changed

**`/api/check-in/route.ts` — Flujo extendido para staff_verified:**
- `action: 'lookup'` retorna `checkin_mode`, `checkin_first_visit_free` y `customer.id`.
- `action: 'register'` respeta `checkin_first_visit_free=false`: rechaza 403 si no hay auth de mesero en modo `staff_verified`.
- `action: 'checkin'` acepta `source: 'staff_scan'`, `registered_by_staff_id`, `device_token`, `token` (QR JWT).
- Omite validación de geolocalización cuando `source = 'staff_scan'`.
- Rechaza check-in de cliente existente en modo `staff_verified` sin mesero autenticado → 403.
- Valida firma y expiración del QR token (`STAFF_QR_JWT_SECRET`) server-side.

**`src/components/features/check-in/CheckInForm.tsx` — QR dinámico del cliente:**
- En modo `staff_verified`, cliente existente ve QR dinámico con token JWT firmado (`sub: customer_id`).
- Pantalla `customer_qr` con datos del cliente, tier, visitas, puntos.

**Servicios actualizados:**
- `src/services/visit.service.ts` — `source` ampliado a `'qr' | 'delivery' | 'staff_scan'`, `getRecentVisit` sin filtro por source (evita duplicados cruzados).
- `src/services/points.service.ts` — `awardVisitPoints` mapea `staff_scan` → `visit_staff`.
- `src/services/customer.service.ts` — `incrementVisit` acepta `staff_scan`.
- `src/types/database.types.ts` — Tipos `StaffUser`, `StaffDevice`, `PointTransactionSource` con `visit_staff`.

### Security

- QR dinámico no expone datos crudos: payload enmascarado en JWT firmado con expiración 5 min.
- Validación de TTL obligatoriamente en servidor (`/api/check-in`), nunca solo en frontend.
- PIN de mesero hasheado con `bcryptjs` (10 salt rounds).
- Dispositivo de confianza: supervisor activa una vez con PIN, mesero no necesita login diario.
- Traza completa: cada visita `staff_scan` queda ligada a `registered_by_staff_id`.

### Environment

- `.env.example` — Nuevas variables: `STAFF_JWT_SECRET`, `STAFF_QR_JWT_SECRET`.

### Dependencies

- `jose` (v6.2.3) — JWT edge-compatible para auth de meseros y QR dinámico.
- `bcryptjs` (v3.0.3) — Hash de PINs.
- `qrcode.react` (v4.2.0) — QR dinámico del cliente.
- `html5-qrcode` (v2.3.8) — Escaneo QR del mesero.

---

## [1.0.9] — 2026-05-30 — HOTFIX: Webhook de delivery enviaba mensajes con formato legacy de milestones

### Fixed

**Webhook de domicilios migrado al sistema de puntos:**
- `src/app/api/webhook/delivery/route.ts`: Reemplazada toda la lógica legacy de `reward.service.ts` (`checkRewardForVisit`, `getNextReward`, `buildRewardsRoadmap`) por el sistema de puntos (`awardVisitPoints`, `evaluateNewTier`, `getNextTier`, `buildTiersRoadmap`).
- **Otorgamiento de puntos en domicilios**: Ahora las visitas de delivery otorgan puntos aleatorios inteligentes (`awardVisitPoints`) y evalúan si el cliente cruza un nuevo tier (`evaluateNewTier`).
- **Puntos de bienvenida en domicilios**: Los clientes nuevos de delivery ahora reciben `awardWelcomeBonus` (antes no recibían nada).
- **Plantillas WhatsApp actualizadas**: Eliminadas `welcome_back_near/far_template_sid` y `reward_template_sid` (legacy). Ahora se usan `points_earned_near_template_sid`, `points_earned_far_template_sid` y `tier_unlocked_template_sid` — igual que el check-in QR.
- **Variables corregidas**: Los mensajes ahora envían `pointsAwarded`, `newBalance` y `tiersRoadmap` en lugar de `total_visits`, `rewardTitle` y `roadmap` de milestones.
- **Respuesta JSON**: Incluye `total_points` y `tier_unlocked` en lugar de `reward` legacy.

### Archivos afectados
- `src/app/api/webhook/delivery/route.ts`

---

## [1.0.8] — 2026-05-30 — Tiers dinámicos: nombres y emojis editables por el admin

### Changed

**Tiers renombrados y umbrales ajustados:**
- `supabase/migrations/00016_ensure_default_tiers.sql`: Tiers default ahora son **Plata (150 pts) → Oro (300 pts) → Diamante (450 pts) → BLACK (1000 pts)**. Anteriormente eran Bronce/Plata/Oro/BLACK con umbrales 150/350/600/1000.

**Emojis dinámicos por posición, no por nombre:**
- `src/lib/tier-emojis.ts` — **NUEVO**: Utilidad `getTierEmoji(index, isBlack)` que devuelve emojis según la posición ordenada del tier (`🥉`, `🥈`, `🥇`, `💎`, `👑`, `⭐`, `🎯`). El tier BLACK siempre usa `🖤`.
- `src/components/features/check-in/TiersRoadmap.tsx`: Reemplazado mapa hardcodeado `tierEmojis['Bronce']` por `getTierEmoji(index, tier.is_black)`. Ahora el admin puede renombrar tiers (ej: "Diamante 1", "Diamante 2") y los emojis siguen correctos.
- `src/app/(dashboard)/dashboard/rewards/page.tsx`: Mismo cambio — emojis dinámicos en la tabla del dashboard.
- `src/services/reward-tiers.service.ts`: `buildTiersRoadmap()` usa `getTierEmoji()` en lugar de mapa por nombre.

**¿Por qué esto importa?**
El dueño ya puede crear, renombrar y eliminar tiers desde el dashboard (`/dashboard/rewards`). Con emojis dinámicos, cualquier nombre funciona visualmente: "Plata", "Oro", "Diamante", "Diamante VIP", "Esmeralda", etc. No hay límite de cantidad de tiers (más allá del sentido comercial).

### Fixed

**Tiers legacy duplicados en base de datos:**
- `supabase/migrations/00017_cleanup_legacy_tiers.sql` — **NUEVO**: Desactiva tiers duplicados creados porque la migración 00016 usó `ON CONFLICT (point_threshold)` y los umbrales viejos (350, 600) no conflictaron con los nuevos (150, 300, 450). Resultado: aparecían 6 tiers en lugar de 4. Esta migración desactiva los obsoletos y reordena `sort_order`.

### Archivos afectados
- `src/lib/tier-emojis.ts`
- `src/components/features/check-in/TiersRoadmap.tsx`
- `src/app/(dashboard)/dashboard/rewards/page.tsx`
- `src/services/reward-tiers.service.ts`
- `supabase/migrations/00016_ensure_default_tiers.sql`
- `supabase/migrations/00017_cleanup_legacy_tiers.sql`

---

## [1.0.7] — 2026-05-30 — HOTFIX: Check-in duplicados, residuos legacy, permisos RLS

### Fixed

**Cap de 24 horas eliminado (bug crítico):**
- `src/app/api/check-in/route.ts`: `getRecentVisit(customer.id, 0.5)` → `1440`. El comentario "30 segundos para testing" nunca se cambió en producción, permitiendo check-ins ilimitados.

**Residuos del sistema legacy de recompensas por visitas:**
- `src/app/api/check-in/route.ts`: Eliminado import y lógica legacy de `reward.service.ts` (`checkRewardForVisit`, `getNextReward`, `buildRewardsRoadmap`, `getUpcomingRewards`). El endpoint ya no evalúa recompensas basadas en `visit_milestone` ni devuelve `reward`/`roadmap` legacy en la respuesta JSON.
- `src/components/features/check-in/CheckInSuccess.tsx`: Eliminada sección "Tus próximos premios" que mostraba `roadmap` basado en visitas (imágenes del bug: #3 Soda, #4 Postre, etc.). Eliminado `nextRewardHint` legacy.
- `src/app/(public)/check-in/page.tsx`: Eliminados `roadmap` y `nextRewardHint` del estado, handlers y props de `CheckInSuccess`.
- `src/components/features/check-in/CheckInForm.types.ts`: `reward`, `nextReward`, `roadmap` ahora opcionales en `CheckInResult`/`RegisterResult` para reflejar el API actual.
- `src/components/features/check-in/CheckInSuccess.types.ts`: Eliminados `roadmap` y `nextRewardHint` de las props.

**WhatsApp variables mal mapeadas:**
- `src/app/api/check-in/route.ts`: Eliminado el **LEGACY FALLBACK** que usaba plantillas de visitas (`welcome_back_*`) con variables de visitas cuando no había plantillas de puntos configuradas. Este fallback causaba que `{{2}}` = total_visits (ej: 2) apareciera como "+2 puntos" y `{{3}}` = título de recompensa apareciera como saldo. Ahora si no hay template de puntos, solo se loguea advertencia y NO se envía mensaje incorrecto.

**Error `permission denied for table customers`:**
- `supabase/migrations/00015_service_role_policies.sql`: **NUEVA MIGRACIÓN**. Agrega políticas RLS explícitas para `service_role` en `customers` y `visits` (SELECT, INSERT, UPDATE). Las tablas creadas en 00001 no tenían políticas de service role, lo que causaba denegación de permisos en producción cuando el service client intentaba leer/escribir.

**Tier Bronce desaparecido / empieza en Plata:**
- `supabase/migrations/00016_ensure_default_tiers.sql`: **NUEVA MIGRACIÓN**. Inserta o actualiza los 4 tiers default (Bronce 150pts, Plata 350pts, Oro 600pts, BLACK 1000pts) garantizando que existan y estén activos con premios y umbrales correctos. Resuelve el problema donde el primer tier visible era Plata porque Bronce había sido desactivado o eliminado en la DB.

**Webhook opt-out "SALIR":**
- `src/app/api/webhook/twilio-incoming/route.ts`: Agregados `SALIR` y `NO` a la lista de keywords de opt-out. El template de WhatsApp dice "Responde SALIR para no recibir más mensajes" pero el webhook no manejaba esta palabra en español. Ahora devuelve 200 silencioso en lugar del mensaje genérico automático.

### Archivos afectados
- `src/app/api/check-in/route.ts`
- `src/components/features/check-in/CheckInSuccess.tsx`
- `src/components/features/check-in/CheckInSuccess.types.ts`
- `src/app/(public)/check-in/page.tsx`
- `src/components/features/check-in/CheckInForm.types.ts`
- `src/app/api/webhook/twilio-incoming/route.ts`
- `supabase/migrations/00015_service_role_policies.sql`
- `supabase/migrations/00016_ensure_default_tiers.sql`

---

## [1.0.6] — 2026-05-28 — Script bulk para crear plantillas Twilio de texto

### Added

**Script — Creación masiva de plantillas de texto:**
- `scripts/twilio-create-text-templates.mjs` — **NUEVO**: Crea las 11 plantillas `twilio/text` de golpe en Twilio Content API. Lee `NEXT_PUBLIC_BRAND_NAME` del env, reemplaza `[Restaurante]` automáticamente, crea cada plantilla con sus samples correctos, y envía cada una a aprobación de Meta con su categoría (UTILITY/MARKETING). Al finalizar imprime un mapeo `settings_key → SID` listo para copiar a `admin_settings`.

**Documentación:**
- `docs/PLANTILLAS.md`: Checklist actualizado — las plantillas de texto (1-11) ahora se crean vía script bulk, no manualmente por Dashboard.

---

## [1.0.6-1] — 2026-05-28 — Fix: Plantillas twilio/media rechazadas por formato inválido

### Fixed

**Script — twilio-create-media-templates.mjs:**
- `media: ['{{6}}']` → `media: [sampleMediaUrl]`. Twilio Content API **no acepta variables `{{N}}`** dentro del array `media`; requiere una URL real de ejemplo. Este era el motivo del rechazo "(tipo no textual)" sin explicación adicional.

**Backend — whatsapp.service.ts:**
- `sendTemplateMessage()` ahora acepta un cuarto parámetro opcional `mediaUrl`. Cuando se envía una plantilla `twilio/media`, Twilio usa `mediaUrl` para sobreescribir la URL de ejemplo aprobada con la URL dinámica del evento (imagen/video del bucket `event-media`).

**Backend — calendar.service.ts:**
- `executeAutoEvent` ahora pasa `mediaUrl` al enviar mensajes de evento, conectando el pipeline completo de envío con media dinámica.

**Documentación:**
- `docs/features/calendar.md`: Pipeline de envío movido de "pausado" a "implementado (pendiente aprobación Meta)".

---

## [1.0.5-3] — 2026-05-28 — Geolocalización desactivada a STANDBY

### Changed

**Frontend — Geolocalización desactivada:**
- `src/components/features/check-in/CheckInForm.tsx`: El componente ya no pide GPS ni envía `lat`/`lon`. Toda la lógica de `verifyLocation()`, estados de ubicación y bloques visuales están comentados como standby. El check-in fluye normalmente sin fricción.

**Backend — Validación GPS desactivada:**
- `src/app/api/check-in/route.ts`: Toda la sección de validación de geolocalización (consulta a `geo_strict_mode`, `restaurant_locations`, cálculo de distancia Haversine) está comentada como standby. El bloque que guardaba `checkin_lat`/`lon`/`distance` en `customers` también está comentado.

**Dashboard — Sección en "Próximamente":**
- `src/app/(dashboard)/dashboard/settings/page.tsx`: La sección "Ubicación del Local" ahora muestra un overlay oscuro con badge "Próximamente" y el texto "Validación por GPS desactivada temporalmente". Los inputs permanecen debajo (opacity 30%, disabled) como standby visual.

### Archivos afectados
- `src/components/features/check-in/CheckInForm.tsx`
- `src/app/api/check-in/route.ts`
- `src/app/(dashboard)/dashboard/settings/page.tsx`

---

## [1.0.5-2] — 2026-05-28 — GPS opcional + Toggle modo estricto en Dashboard

### Changed

**Frontend — GPS ya no bloquea el check-in:**
- `src/components/features/check-in/CheckInForm.tsx`: Si el GPS falla o el usuario lo niega, el check-in continúa sin `lat`/`lon` en vez de bloquearse. El mensaje de error cambia a advertencia suave (amarillo): "No pudimos verificar tu ubicación. Puedes continuar de todos modos." El botón "Continuar" ya no se deshabilita por falta de GPS.

**Backend — Validación GPS condicional:**
- `src/app/api/check-in/route.ts`: Consulta el setting `geo_strict_mode` desde `admin_settings`. Solo retorna 403 si `geo_strict_mode === 'true'` Y no hay `lat`/`lon` en el body. Por defecto (modo relajado) el check-in siempre permite continuar, con o sin GPS.

**Dashboard — Toggle modo estricto:**
- `src/app/(dashboard)/dashboard/settings/page.tsx`: Checkbox "Modo estricto: requerir GPS para hacer check-in" en la sección de Ubicación del Local. Guardado en `admin_settings` key `geo_strict_mode`. Default: desactivado.

### Archivos afectados
- `src/components/features/check-in/CheckInForm.tsx`
- `src/app/api/check-in/route.ts`
- `src/app/(dashboard)/dashboard/settings/page.tsx`

---

## [1.0.5] — 2026-05-28 — Geolocalización anti QR-scam + Dashboard ubicación

### Added

**Frontend — Geolocalización en CheckInForm:**
- `src/components/features/check-in/CheckInForm.tsx`: Pide GPS antes de enviar formulario. Estados visuales: requesting (amarillo), verified (verde), denied (rojo con botón reintentar). Envía `lat` y `lon` en el body del POST a `/api/check-in` en lookup, checkin y register.

**Backend — Validación de distancia en check-in:**
- `src/app/api/check-in/route.ts`: Recibe `lat` y `lon` del body. Consulta `restaurant_locations` para obtener coordenadas del local. Calcula distancia con `calculateDistanceMeters()`. Si `distance > radius_meters` → retorna 403 "Fuera del local". Guarda `checkin_lat`, `checkin_lon`, `checkin_distance_meters` en `customers` tras check-in exitoso.

**API — Endpoint de ubicación del restaurante:**
- `src/app/api/dashboard/location/route.ts` — **NUEVO**: GET (leer ubicación activa) y PUT (actualizar lat/lon/radius/address) para `restaurant_locations`. Auth requerida.

**Dashboard — Sección de ubicación en Ajustes:**
- `src/app/(dashboard)/dashboard/settings/page.tsx`: Nueva sección "Ubicación del Local" con inputs para latitud, longitud, radio (metros) y dirección. Carga datos desde `/api/dashboard/location` al iniciar. Guarda con PUT al mismo endpoint.

**Documentación:**
- `docs/DB_SCHEMA.md`: Tabla `restaurant_locations`, columnas geolocalización en `customers`, migración 00014.
- `docs/API_DOCS.md`: Endpoints GET/PUT `/api/dashboard/location`.

---

## [1.0.5-1] — 2026-05-28 — Fix: Migración y helper de geolocalización faltantes

### Fixed

**Archivos de geolocalización reconstruidos:**
- `supabase/migrations/00014_geolocation.sql` — **RESTAURADO**: Contiene ALTER TABLE `customers` (columnas `checkin_lat`, `checkin_lon`, `checkin_distance_meters`), CREATE TABLE `restaurant_locations`, índice parcial `idx_customers_checkin_location`, RLS policies, trigger `handle_updated_at` y seed data de la sede principal. Este archivo había desaparecido del directorio de migraciones.
- `src/lib/utils/geolocation.ts` — **CREADO**: Helper con `getCurrentPosition()` (wrapper promisificado de `navigator.geolocation`) y `calculateDistanceMeters()` (fórmula Haversine). El build fallaba porque `check-in/route.ts` y `CheckInForm.tsx` lo importaban pero el archivo no existía.

### Archivos afectados
- `supabase/migrations/00014_geolocation.sql`
- `src/lib/utils/geolocation.ts`

---

## [1.0.4] — 2026-05-25 — Fix plantillas WhatsApp + Customer Journey + Roadmap visual de tiers

### Fixed

**Variables de plantillas WhatsApp corregidas:**
- `src/app/api/cron/birthday/route.ts`: `{{2}}` ahora envía `buildTiersRoadmap(customer.total_points)` (puntos actuales) en vez de `buildRewardsRoadmap(customer.total_visits)` (visitas legacy).
- `src/app/api/cron/reactivation/route.ts` (suave): `{{2}}` ahora envía puntos actuales, `{{3}}` envía premio próximo del tier. Antes solo enviaba 2 variables con roadmap de visitas.
- `src/app/api/cron/reactivation/route.ts` (agresiva): Ahora envía `{{4}}` con recompensa especial configurada (`reactivation_aggressive_reward_id`). Nuevo setting disponible.
- `src/app/api/dashboard/campaigns/manual/route.ts`: `{{2}}` ahora envía `customer.total_points` en vez de `customer.total_visits`.
- `src/app/api/webhook/delivery/route.ts`: Plantilla de bienvenida ahora envía 3 variables (nombre, puntos, roadmap tiers) igual que el check-in QR.

**Customer Journey — Cap mensual y frequency cap:**
- `src/app/api/dashboard/campaigns/manual/route.ts`: Agregado `filterByMonthlyCap()` → campañas manuales ahora respetan el límite de 3 mensajes/marketing por mes por cliente. Reporta `totalSkippedMonthlyCap`.
- `src/app/api/cron/reactivation/route.ts`: Agregado `filterByMonthlyCap()` tanto para clientes suaves (21d) como agresivos (25d+). Reactivaciones ahora cuentan para el cap mensual.
- `src/services/campaign.service.ts`: `getOrCreateTodayCampaign()` ahora establece `source: type` (birthday/reactivation) en vez de dejar el default 'manual'. Esto corrige el conteo del monthly cap.
- `src/app/api/dashboard/campaigns/manual/route.ts`: Agregado `getActiveBlackouts()` para pre-event blackout. Campañas manuales ahora reportan `totalSkippedBlackout`.

**UI Check-in — Roadmap visual de tiers:**
- `src/components/features/check-in/TiersRoadmap.tsx` — **NUEVO** componente visual que muestra todos los tiers con: emoji, nombre, umbral de puntos, premio seguro, indicador Mystery Box, estado visual (✅ alcanzado / 🔥 próximo / 🔒 bloqueado).
- `src/app/api/check-in/route.ts`: Ahora devuelve `tiers: allTiers` en la respuesta de check-in.
- `src/components/features/check-in/CheckInSuccess.tsx`: Integrado `<TiersRoadmap>` debajo de `<PointsDisplay>`. El cliente ve su camino completo de recompensas.

**Documentación:**
- `docs/PLANTILLAS.md`: Agregada sección "Requisito de Opt-Out (Obligatorio para Meta)" con tabla de todas las plantillas que requieren opt-out y opciones de implementación.
- Variables de reactivación agresiva actualizadas: ahora incluye `{{4}}` para recompensa especial.

### Archivos afectados
- `src/app/api/cron/birthday/route.ts`
- `src/app/api/cron/reactivation/route.ts`
- `src/app/api/dashboard/campaigns/manual/route.ts`
- `src/app/api/webhook/delivery/route.ts`
- `src/app/api/check-in/route.ts`
- `src/services/campaign.service.ts`
- `src/components/features/check-in/TiersRoadmap.tsx` *(nuevo)*
- `src/components/features/check-in/CheckInSuccess.tsx`
- `src/components/features/check-in/CheckInSuccess.types.ts`
- `src/components/features/check-in/CheckInForm.types.ts`
- `src/components/features/check-in/index.ts`
- `src/app/(public)/check-in/page.tsx`
- `docs/PLANTILLAS.md`

---

## [1.0.3] — 2026-05-25 — Dashboard: Tiers CRUD + Configuración de Puntos + Mystery Box

### Added

**API REST de Reward Tiers (`src/app/api/dashboard/reward-tiers/route.ts`):**
- Nuevo endpoint GET/POST/PATCH/DELETE para CRUD completo de `reward_tiers`.
- GET lista todos los tiers (incluidos inactivos) ordenados por `sort_order`.
- POST valida umbral único, probabilidades suman 100%, BLACK único activo.
- PATCH actualiza cualquier campo con validación individual.
- DELETE soft-delete (desactiva) si hay clientes, hard-delete si no hay y se pide explícitamente.

**Dashboard de Tiers (`src/app/(dashboard)/dashboard/rewards/page.tsx`):**
- Reescritura completa de la página legacy de milestones por visita.
- Tabla de tiers con columnas: Emoji, Umbral (pts), Premio Seguro, Mystery Box ON/OFF, Estado, Acciones (editar/toggle/eliminar).
- Dialog de creación/edición con: nombre del tier, umbral de puntos, premio seguro, toggle BLACK, toggle Mystery Box.
- Si Mystery Box ON: tabla dinámica de premios con emoji, título y probabilidad %. Validación en tiempo real de que las probabilidades sumen 100%.
- Eliminación con advertencia de soft-delete si hay clientes asociados.

**Configuración de Puntos en Settings (`src/app/(dashboard)/dashboard/settings/page.tsx`):**
- Nueva sección "Sistema de Puntos" con feature flag toggle.
- Campos configurables: puntos por visita (min/max), puntos de bienvenida (min/max), shortfall (min/max), pity timer threshold.
- Todos los valores se guardan en `admin_settings` y se leen por los servicios de backend.

### Changed

**Welcome bonus aleatorio (`src/services/points.service.ts`):**
- `getPointsConfig()` ahora lee `welcome_bonus_points_min` y `welcome_bonus_points_max` (antes era un solo `welcome_bonus_points`).
- `awardWelcomeBonus()` genera puntos aleatorios en el rango `[min, max]` (antes era valor fijo).

**Constantes (`src/constants/rewards.ts`):**
- `DEFAULT_WELCOME_BONUS_POINTS` cambiado de `0` a `75` (mínimo del rango de bienvenida).
- Nuevo `DEFAULT_WELCOME_BONUS_POINTS_MAX = 90`.

### Archivos afectados
- `src/app/api/dashboard/reward-tiers/route.ts` *(nuevo)*
- `src/app/(dashboard)/dashboard/rewards/page.tsx` *(reescrito)*
- `src/app/(dashboard)/dashboard/settings/page.tsx`
- `src/constants/rewards.ts`
- `src/services/points.service.ts`
- `docs/features/points-mystery-box.md`
- `docs/DB_SCHEMA.md`
- `CHANGELOG.md`

### Request original
> Dashboard de Tiers + Configuración de Puntos + Mystery Box. Transformar `/dashboard/rewards` de milestones legacy a CRUD completo de tiers con Mystery Box. Agregar sección de puntos en settings. Welcome bonus aleatorio 75-90.

---

## [1.0.2] — 2026-05-25 — Fix: flujo check-in + gamificación (integración y robustez)

### Fixed

**API de check-in resistente a fallos (`src/app/api/check-in/route.ts`):**
- `buildTiersRoadmap()`, `getAllTiers()`, `evaluateNewTier()`, `getNextTier()`, `getUpcomingRewards()`, `buildRewardsRoadmap()` ahora envueltos en `try/catch`.
- Si el sistema de puntos/tiers falla (tablas no existen, migración 00013 no ejecutada), el registro y check-in básico siguen funcionando en vez de devolver 500.

**Teléfono pasa correctamente al componente de éxito:**
- `CheckInForm` ahora pasa `phone` explícitamente en todos los callbacks (`onLookupResult`, `onRegisterSuccess`, `onCheckInSuccess`).
- Eliminado `lastPhone` y anti-patrón `document.querySelector('input[type="tel"]')` de `page.tsx`.
- `CheckInSuccess` recibe `customerPhone` correctamente → los botones de safe/mystery en `RewardChoice` ahora funcionan.

**Puntos visibles para clientes nuevos (`CheckInSuccess.tsx`):**
- `isPointsBased` ahora incluye `'welcome'`.
- Los clientes que se registran por primera vez ven sus puntos de bienvenida + barra de progreso hacia el primer tier.

**Feedback de errores en Mystery Box (`CheckInSuccess.tsx`):**
- `toast.error()` cuando: no hay teléfono, API responde `ok: false`, o error de red.
- Antes el botón simplemente no hacía nada sin feedback visual.

**Duplicados correctamente manejados:**
- Status 429 de la API ahora se mapea a `message: 'duplicate'` en vez de `'welcome_back'`.
- `page.tsx` maneja el tipo `'duplicate'` mostrando "Ya registraste tu visita hoy".

**Tipos TypeScript:**
- `CheckInResult.message` ahora incluye `'duplicate'`.
- `MysteryBoxResponse` ahora incluye `message?: string`.
- Variables `welcomeRoadmap`, `allTiers`, `upcomingRewards` correctamente tipadas en `route.ts`.

### Archivos afectados
- `src/app/api/check-in/route.ts`
- `src/components/features/check-in/CheckInForm.types.ts`
- `src/components/features/check-in/CheckInForm.tsx`
- `src/app/(public)/check-in/page.tsx`
- `src/components/features/check-in/CheckInSuccess.tsx`

### Request original
> Mira estoy trancado en un problema, analiza mi repo y ve mi codigo original... al entrar en el nuevo desarrollo antes pasabamos de la pagina en la que recopilamos los datos (nombre, celular, ciudad etc) pero no tiraba ruleta ni nada, parecia un desarrollo vacio... ahora ni siquiera pasa de la tabla donde pide los datos.

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
