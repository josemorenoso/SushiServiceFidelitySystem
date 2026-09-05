# RESTAURANTQR — Reglas para IA (Método AInnovate v2)

> **ATENCIÓN IA:** Este proyecto usa Documentation-Driven Development.
> **ANTES** de escribir CUALQUIER línea de código, DEBES leer los docs relevantes.
> Documento completo del método: `METODO_AINNOVATE.md` (raíz del proyecto)

## Protocolo Obligatorio (antes de cada cambio)
0. **LEER `docs/ESTADO.md` PRIMERO — antes que nada.** Es la foto viva del proyecto: qué está hecho, qué hay en vuelo (para no pisar a otra sesión), qué deudas siguen abiertas y cuál es el siguiente paso. Sus dos hermanos: `docs/RUNBOOK-DEPLOY.md` (los pasos del despliegue, en orden) y `docs/ESTADO-REQUERIMIENTOS.md` (estado real de §1–§25 auditado contra el código). **Toda sesión que cierre un bloque ACTUALIZA `docs/ESTADO.md` al terminar.** Saltarse este paso es lo que hace que se pierdan detalles entre conversaciones y que cada sesión vuelva a leer medio repo.
1. LEER `docs/01-project-overview.md`
2. LEER `docs/02-architecture.md`
3. IDENTIFICAR qué feature se modifica
4. LEER `docs/features/[feature].md`
5. Si NO existe doc para la feature → CREARLO antes de codear
6. Si se toca DB → LEER `docs/DB_SCHEMA.md`
7. Si se toca API → LEER `docs/API_DOCS.md`
8. Si se toca auth/seguridad → LEER `docs/03-security.md`

## Los 12 Mandamientos del Vibe Coding (INVIOLABLES)
| # | Mandamiento | Regla |
|---|-------------|-------|
| I | NO ALUCINARÁS | Solo implementar exactamente lo pedido. Ante duda → PREGUNTAR |
| II | SEPARARÁS LÓGICA DE ESTILOS | Nunca mezclar en el mismo archivo. Con TailwindCSS clases en JSX, lógica de negocio separada |
| III | DOCUMENTARÁS CADA CAMBIO | Ningún cambio sin su doc correspondiente |
| IV | ACTUALIZARÁS EL CHANGELOG | Cada request → nueva entrada |
| V | DOCUMENTARÁS LA DB | Cada cambio de schema → DB_SCHEMA.md |
| VI | SEGUIRÁS LA ESTRUCTURA | No crear archivos fuera de la estructura |
| VII | USARÁS EL SISTEMA DE ESTILOS | Respetar el design system de TailwindCSS |
| VIII | PROTEGERÁS CREDENCIALES | Nada hardcodeado, todo en .env |
| IX | TIPARÁS TODO | TypeScript estricto, cero `any` |
| X | VALIDARÁS ANTES DE ENTREGAR | Checklist obligatorio |
| XI | MANTENDRÁS CONSISTENCIA | Seguir convenciones existentes |
| XII | COMUNICARÁS CON CLARIDAD | Resumen de acciones al terminar |

## 4 Leyes de Operación
1. **LEER ANTES DE ACTUAR** — Consultar docs antes de cualquier cambio
2. **NO ROMPER LO QUE FUNCIONA** — Detenerse si hay conflicto con la arquitectura
3. **DOCUMENTACIÓN CONTINUA** — Actualizar docs + CHANGELOG después de cada cambio
4. **SEGURIDAD** — Nunca deploy/push/cambios destructivos sin confirmación

## Documentación del Proyecto
| Doc | Cuándo leerlo |
|-----|--------------|
| `docs/01-project-overview.md` | SIEMPRE (visión, stack, estado) |
| `docs/02-architecture.md` | SIEMPRE (estructura, convenciones) |
| `docs/03-security.md` | Si se toca auth, credenciales, RLS |
| `docs/04-deployment.md` | Si se toca deploy, CI/CD |
| `docs/DB_SCHEMA.md` | Si se toca base de datos |
| `docs/API_DOCS.md` | Si se toca endpoints/API |
| `docs/SKILLS.md` | ANTES de implementar cualquier feature nueva |
| `docs/features/*.md` | El doc de la feature que se modifica |

## Tabla de Lookup
| Archivo que se modifica | Doc que se debe leer |
|------------------------|---------------------|
| `src/app/(public)/check-in/*` | `docs/features/qr-checkin.md` |
| `src/components/features/check-in/*` | `docs/features/qr-checkin.md` |
| `src/app/api/webhook/delivery/*` | `docs/features/delivery-webhook.md` + `docs/03-security.md` (⚠️ desde la Fase 2 de §25 es una CÁSCARA sobre `registerDeliveryOrder()`: la lógica NO vive aquí. Su contrato NO se cambia — lo sigue llamando n8n hasta que el dueño apague el VPS) |
| `src/services/delivery.service.ts` | `docs/features/delivery-webhook.md` + `docs/features/delivery-ai-parsing.md` (⚠️ `processDeliveryMessage()` es el intake completo y `logDeliveryIntakeFailure()` es el ÚNICO embudo por el que se pierde un domicilio — cuando §24-B cree la tabla, el INSERT va AHÍ DENTRO y en ningún otro sitio) |
| `src/services/delivery-ai.service.ts` | `docs/features/delivery-ai-parsing.md` (⚠️ `parseDeliveryAiJson()` es PURA y replica el nodo «Parsear Respuesta IA» de n8n, probado en producción: no se "mejora" sin medir. `"45.000"` → `45` es comportamiento CONOCIDO, la defensa está en el prompt) |
| `src/constants/delivery-ai.ts` | `docs/features/delivery-ai-parsing.md` (⚠️ el prompt es el LITERAL de n8n salvo la ciudad, que sale de `tenants.config.delivery_default_city` — hornear una ciudad aquí se la escribe en `customers.city` a los 25 tenants) |
| `src/lib/openai/client.ts` | `docs/features/delivery-ai-parsing.md` + `docs/03-security.md` (único sitio que instancia el SDK; `OPENAI_API_KEY` es server-only) |
| `src/app/api/webhook/twilio-incoming/*` | `docs/features/campaigns.md` + `docs/03-security.md` |
| `src/app/api/cron/*` | `docs/features/campaigns.md` |
| `src/app/api/dashboard/campaigns/*` | `docs/features/campaigns.md` |
| `src/app/(dashboard)/dashboard/campaigns/*` | `docs/features/campaigns.md` |
| `src/app/(dashboard)/*` | `docs/features/dashboard.md` |
| `src/components/dashboard/*` | `docs/features/dashboard.md` |
| `src/components/dashboard/BlackTierSection.tsx` | `docs/features/dashboard.md` (lo renderiza `/dashboard/customers`, NO el panel de métricas — §14.1/§17.1) |
| `src/components/dashboard/AtRiskBubbles.tsx` | `docs/features/dashboard.md` + `docs/features/campaigns.md` (lo renderiza `/dashboard/campaigns` → pestaña Manuales, NO el panel — §15.3) |
| `src/components/dashboard/ManualCampaigns.tsx` | `docs/features/dashboard.md` (§15.2: un preset solo se dibuja si su plantilla está aprobada) + `docs/features/campaigns.md` |
| `src/constants/rankings.ts` | `docs/features/dashboard.md` (`TOP_CUSTOMERS_LIMIT` = tamaño del resumen de clientes) |
| `src/app/(public)/tarjeta/*` | `docs/features/wallet-card.md` + `docs/features/design-system.md` |
| `src/components/features/wallet/*` | `docs/features/wallet-card.md` + `docs/features/design-system.md` |
| `src/lib/black-tier.ts` | `docs/features/wallet-card.md` (única definición de "quién es Black" en la tarjeta — ojo: el dashboard usa `POWER_RANKS`, 10+ visitas; la 17.b sigue abierta) |
| `src/constants/wallet-card-theme.ts` | `docs/features/wallet-card.md` + `docs/features/design-system.md` (solo colores — nada de lógica) |
| `src/hooks/useDashboardAnalytics.ts` | `docs/features/dashboard.md` |
| `src/lib/supabase/*` | `docs/02-architecture.md` + `docs/03-security.md` |
| `src/lib/twilio/*` | `docs/02-architecture.md` + `docs/04-deployment.md` |
| `src/lib/zernio/*` | `docs/features/zernio-messaging.md` (conectado a `whatsapp.service.ts` desde v2.10.0 — ya NO es un módulo aislado) |
| `src/app/api/webhook/zernio/*` | `docs/features/zernio-messaging.md` + `docs/03-security.md` |
| `src/services/*` | `docs/features/[feature].md` correspondiente |
| `src/services/whatsapp.service.ts` | `docs/features/zernio-messaging.md` (ruteo por proveedor) + `docs/features/campaigns.md` |
| `src/services/line-budget.service.ts` | `docs/features/send-governance.md` + `docs/DB_SCHEMA.md` |
| `src/services/template.service.ts` | `docs/features/whatsapp-templates.md` + `docs/DB_SCHEMA.md` (⚠️ `promoteVersion()` es el ÚNICO escritor de `admin_settings.*_template_sid`) |
| `src/constants/template-catalog.ts` | `docs/features/whatsapp-templates.md` + `docs/PLANTILLAS.md` (⚠️ el contrato de variables `{{n}}` es fijo — cambiarlo rompe el envío de los 3 estilos) |
| `src/constants/template-texts.ts` | `docs/features/whatsapp-templates.md` (banco de 39 textos; `calido` NO se toca sin decisión del dueño · ⚠️ PROHIBIDO hornear emojis de un rubro — usa `${emoji}`, hay un test que lo vigila) |
| `src/services/twilio-catalog.service.ts` | `docs/features/whatsapp-templates.md` § "Completar huecos" (⚠️ ADITIVO: `fillEmptyPointer()` solo rellena claves vacías; `promoteVersion()` sigue siendo el único que CAMBIA un puntero vivo) |
| `src/app/api/dashboard/templates/standard/*` | `docs/features/whatsapp-templates.md` + `docs/API_DOCS.md` (espejo Twilio de `/catalog`) |
| `src/components/dashboard/templates/StandardCatalogGaps.tsx` | `docs/features/whatsapp-templates.md` + `docs/features/dashboard.md` §15.2 (un preset oculto se ve igual que uno inexistente) |
| `src/components/dashboard/OptOutPanel.tsx` | `docs/features/campaigns.md` (lee `customers.whatsapp_opt_out_at`, NO Twilio — funciona con los dos proveedores) |
| `src/app/api/dashboard/opt-outs/*` | `docs/API_DOCS.md` + `docs/features/campaigns.md` |
| `src/lib/zernio/templates.ts` | `docs/features/whatsapp-templates.md` + `Level 2.0/aios-constelarys/docs/zernio-api-contract.md` §4 (NO inventar rutas) |
| `src/app/api/dashboard/templates/catalog/*` | `docs/features/whatsapp-templates.md` + `docs/API_DOCS.md` |
| `src/app/api/dashboard/templates/style/*` | `docs/features/whatsapp-templates.md` + `docs/API_DOCS.md` |
| `src/app/(dashboard)/dashboard/templates/*` | `docs/features/whatsapp-templates.md` (Zernio) — la pantalla Twilio de `TwilioTemplateManager.tsx` NO se toca |
| `src/components/dashboard/templates/*` | `docs/features/whatsapp-templates.md` |
| `src/constants/messaging.ts` | `docs/features/send-governance.md` (espejo de `message_class_map` — cambiar SIEMPRE los dos lados) |
| `src/app/api/dashboard/line-budget/*` | `docs/features/send-governance.md` + `docs/API_DOCS.md` |
| `src/app/api/cron/queue-drain/*` | `docs/features/send-governance.md` + `docs/04-deployment.md` (lo dispara n8n, NO Vercel) |
| `src/app/api/cron/line-health/*` | `docs/features/send-governance.md` + `docs/04-deployment.md` |
| `src/services/send-queue.service.ts` | `docs/features/send-governance.md` + `docs/DB_SCHEMA.md` (cola de goteo, Bloque 2) |
| `src/app/api/cron/queue-drain/*` | `docs/features/send-governance.md` + `docs/04-deployment.md` §5 W4 (lo dispara n8n, NO Vercel) |
| `src/app/api/dashboard/send-queue/*` | `docs/features/send-governance.md` + `docs/API_DOCS.md` |
| `tests/**` | `docs/features/testing.md` (ANTES de tocar el harness de Postgres o el bootstrap) |
| `vitest.config.mts` | `docs/features/testing.md` |
| `src/constants/rewards.ts` | `docs/features/campaigns.md` + `docs/features/calendar.md` + `docs/features/points-mystery-box.md` |
| `src/lib/points-engine.ts` | `docs/features/points-mystery-box.md` |
| `src/services/points.service.ts` | `docs/features/points-mystery-box.md` |
| `src/components/dashboard/PointsCalibrator.tsx` | `docs/features/points-mystery-box.md` |
| `supabase/migrations/*.sql` | `docs/DB_SCHEMA.md` |
| `src/app/api/**` | `docs/API_DOCS.md` + `docs/features/[feature].md` |
| `scripts/twilio-setup.mjs` | `docs/04-deployment.md` |
| `vercel.json` | `docs/04-deployment.md` §2 + §25 de `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` (⚠️ declara los 5 crons desde 2026-09-02 — un cron aquí y su Schedule Trigger en n8n activo a la vez = doble disparo · ⚠️ los dos `*/15` **hacen fallar el build en plan Hobby**: no pushear sin Pro activo) |
| `n8n/*.json` | `docs/04-deployment.md` §5 + §25 (los 5 `cron_*.json` están **en retirada**, ya declarados en `vercel.json`; `domicilios_whatsapp_v4.json` sigue ACTIVO y es lo único que mantiene vivo el VPS) |
| `src/app/(dashboard)/dashboard/calendar/*` | `docs/features/calendar.md` |
| `src/components/dashboard/Calendar/*` | `docs/features/calendar.md` |
| `src/app/api/dashboard/calendar/*` | `docs/features/calendar.md` + `docs/API_DOCS.md` |
| `src/services/calendar.service.ts` | `docs/features/calendar.md` + `docs/DB_SCHEMA.md` + `docs/features/zernio-messaging.md` (validación de plantilla y media provider-aware) |
| `src/app/api/cron/calendar-dispatch/*` | `docs/features/calendar.md` |
| `src/services/reward-grant.service.ts` | `docs/features/reward-grants.md` + `docs/DB_SCHEMA.md` |
| `src/services/campaign-reward.service.ts` | `docs/features/reward-grants.md` |
| `src/services/redemption.service.ts` | `docs/features/reward-grants.md` + `docs/features/redemption-tracking.md` |
| `src/app/api/reward-redeem/*` | `docs/features/reward-grants.md` + `docs/03-security.md` |
| `src/app/api/staff/pending-rewards/*` | `docs/features/reward-grants.md` |
| `src/app/api/cron/reward-reminder/*` | `docs/features/reward-grants.md` + `docs/features/campaigns.md` |
| `src/app/api/dashboard/campaign-rewards/*` | `docs/features/reward-grants.md` + `docs/API_DOCS.md` |
| `src/app/(public)/mesero/*` | `docs/features/reward-grants.md` + `docs/features/staff-qr-scan.md` |
| `src/components/features/staff/*` | `docs/features/reward-grants.md` + `docs/features/staff-qr-scan.md` |
| `src/app/(dashboard)/dashboard/campaign-rewards/*` | `docs/features/reward-grants.md` |
| `src/app/(dashboard)/dashboard/redemptions/*` | `docs/features/reward-grants.md` + `docs/features/redemption-tracking.md` |
| `src/services/review.service.ts` | `docs/features/review-flow.md` + `docs/DB_SCHEMA.md` |
| `src/app/api/check-in/review-prompt/*` | `docs/features/review-flow.md` + `docs/API_DOCS.md` |
| `src/app/api/check-in/review-action/*` | `docs/features/review-flow.md` + `docs/features/reward-grants.md` |
| `src/components/features/check-in/GoogleReviewModal.tsx` | `docs/features/review-flow.md` |
| `src/app/api/dashboard/review-metrics/*` | `docs/features/review-flow.md` + `docs/API_DOCS.md` |
| `src/app/api/dashboard/tenant-config/*` | `docs/features/review-flow.md` + `docs/02-architecture.md` |
| `src/components/dashboard/ReviewFunnelCard.tsx` | `docs/features/review-flow.md` |
| `src/services/wallet.service.ts` | `docs/features/wallet-billing.md` + `docs/DB_SCHEMA.md` |
| `src/lib/admin.ts` | `docs/features/wallet-billing.md` + `docs/03-security.md` |
| `src/constants/wallet.ts` | `docs/features/wallet-billing.md` |
| `src/app/api/admin/wallet/*` | `docs/features/wallet-billing.md` + `docs/API_DOCS.md` + `docs/03-security.md` |
| `src/app/api/admin/wallets/*` | `docs/features/wallet-billing.md` + `docs/API_DOCS.md` |
| `src/app/api/dashboard/wallet/*` | `docs/features/wallet-billing.md` + `docs/API_DOCS.md` |
| `src/app/api/dashboard/twilio-balance/*` | `docs/features/wallet-billing.md` + `docs/03-security.md` |
| `src/components/dashboard/SuperAdminWallets.tsx` | `docs/features/wallet-billing.md` |
| `src/components/dashboard/WalletCard.tsx` | `docs/features/wallet-billing.md` |
| `src/app/(dashboard)/dashboard/admin/wallets/*` | `docs/features/wallet-billing.md` |
| `supabase/migrations/000{41..49}*.sql` | `docs/superpowers/specs/2026-09-02-multisede-design.md` §4 (⚠️ el set de migraciones de multi-sede esta CONSOLIDADO ahi: cada `location_id` va NULLABLE y con FK COMPUESTA `(location_id, tenant_id)` — una FK simple deja apuntar a la sede de otra marca) + `docs/DB_SCHEMA.md` |
| `src/lib/tenant.ts` | `docs/superpowers/specs/2026-09-02-multisede-design.md` §3 (⚠️ `getTenantByDomain` CONSERVA su firma; la sede viaja por `resolveHostContext()` — cambiar la firma toca 16 archivos de golpe) |
| `src/app/api/dashboard/location/*` | `docs/features/multi-sede.md` §3.ter (✅ **ARREGLADO en F4**: elige la sede principal con el MISMO orden que `getActiveLocations()` y COMPRUEBA el error de la sonda. ⚠️ El bug NO era el `.single()`, era que el PUT descartaba el error — por eso `.maybeSingle()` a secas no habria arreglado nada. ⚠️ El contrato es un OBJETO PLANO: devolver la lista rompe `dashboard/settings/page.tsx` en silencio) |
| `docs/features/multi-sede.md` | ES EL DOC DE LA FEATURE multi-sede: leerlo ANTES de tocar `restaurant_locations`, cualquier `location_id` o `resolveHostContext()`. Resume las fases, lo que ya esta en la base (F1) y las 8 deudas abiertas que NO se cierran por cuenta propia. El diseno completo sigue en `docs/superpowers/specs/2026-09-02-multisede-design.md` |
| `supabase/migrations/00043_location_id_eventos.sql` | `docs/features/multi-sede.md` § "Columnas de sede en las tablas de eventos" + `docs/DB_SCHEMA.md` (⚠️ agrega 18 columnas VACIAS a 13 tablas de hechos. NO backfillear: NULL = "sede desconocida" y SE MUESTRA. NO leerlas desde TypeScript todavia — eso es F3) |
| `visits` / `point_transactions` / `review_events` / `message_logs` / `send_queue` / `consent_events` / `campaigns` / `authorized_numbers` / `tenant_wallet_transactions` (columnas `*location_id`) | `docs/features/multi-sede.md` (⚠️ toda columna de sede es NULLABLE y lleva FK COMPUESTA `(col, tenant_id)` ON DELETE RESTRICT — una FK simple deja atribuir un hecho de la marca A a una sede de la marca B y el motor no dice nada) |
| `restaurant_events` (`audience_scope`) | `docs/features/multi-sede.md` + `docs/features/calendar.md` (⚠️ UNICA tabla donde NULL **no** significa "sede desconocida": aqui el alcance es EXPLICITO — `brand` exige `location_id` NULL, `location` lo exige NOT NULL) |
| `visits` (`location_source`, `location_conflict`) | `docs/features/multi-sede.md` (⚠️ `location_source` y `location_id` van JUNTOS o no van, lo impone un CHECK. `location_conflict` es TRI-ESTADO: NULL = no se evaluo, no `false`) |
| `reward_grants.granted_location_id` / `reward_redemptions.redeemed_location_id` | `docs/features/reward-grants.md` + `docs/features/multi-sede.md` (⚠️ son DOS sedes distintas: donde se GANO y donde se ENTREGO. Cruzarlas es la matriz origen→destino de D12; ningun premio tiene precio, asi que solo hay conteos y tasas, NUNCA pesos) |: leerlo ANTES de tocar `restaurant_locations`, cualquier `location_id` o `resolveHostContext()`. Resume las fases, lo que ya esta en la base (F1) y las 8 deudas abiertas que NO se cierran por cuenta propia. El diseno completo sigue en `docs/superpowers/specs/2026-09-02-multisede-design.md` |
| `supabase/migrations/00044_meseros_por_sede.sql` | `docs/features/multi-sede.md` §3.ter + `docs/DB_SCHEMA.md` (⚠️ **F4, aun NO aplicada en produccion — va ANTES de desplegar el codigo de F4**, al reves el check-in pide una columna inexistente, PostgREST da 42703 y responde 403 a TODOS los meseros. Trae `staff_users.location_id`, `staff_devices.location_id`, el UNIQUE del `device_fingerprint`, 2 triggers de coherencia D11, y el `CREATE OR REPLACE` de `enqueue_send_queue` + el **DROP+CREATE** de `log_review_shown_deduped`) |
| `staff_users.location_id` / `staff_devices.location_id` | `docs/features/multi-sede.md` §3.ter (⚠️ **D11: un mesero es de UNA sede**. NULL = "sin sede asignada" y SE MUESTRA — NO backfillear, un mesero con NULL trabaja igual que siempre. `staff_users_phone_tenant_key (phone, tenant_id)` NO se toca: es D11 en el motor. La sede vive en la FILA y **nunca en el JWT** del mesero) |
| `src/app/api/staff/login/route.ts` | `docs/features/multi-sede.md` §3.ter + `docs/features/staff-qr-scan.md` (⚠️ el **403 «estas en el enlace de otra sede»** es del LOGIN, NO del check-in: en el check-in gana el mesero y la discrepancia solo se REGISTRA en `visits.location_conflict`. El 403 va DESPUES del PIN, si no filtra que celulares existen) |
| `log_review_shown_deduped()` | `docs/features/multi-sede.md` §3.ter (⚠️ **anadirle un parametro NO es `CREATE OR REPLACE`: crea una SOBRECARGA** y la llamada de 3 args de `review.service.ts` pasa a ser ambigua — 42725 dentro de un `catch` que solo escribe en consola. Exige DROP primero. ⚠️ El dedupe es por (tenant, cliente), **NO por sede**, a proposito) |
| `supabase/migrations/00030_drop_tenant_defaults.sql` | `docs/superpowers/specs/2026-09-03-default-puente-tenant.md` + `docs/03-security.md` § "Aislamiento entre tenants" (⚠️ NUNCA se aplico: `customers.tenant_id` y otras 17 columnas siguen con el DEFAULT puente de la 00028 apuntando a Sushi Service — un INSERT que olvide `tenant_id` en esas 18 tablas se va calladito a Sushi, sin error. El codigo de hoy ya pasa `tenant_id` explicito en el 100% de los casos auditados; la deuda es la ausencia de red de seguridad para el proximo que no lo haga) |
