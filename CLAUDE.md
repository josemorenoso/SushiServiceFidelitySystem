# RestaurantQR / Cada1 — reglas para la IA (Método Maestro LuisRAI v3)

> El método completo está en `METODO_MAESTRO_LUISRAI.md`. Acá va solo lo de este proyecto.
> **El estado vivo está en `ESTADO.md` (raíz). Leelo primero, siempre.**
> Sus hermanos: `docs/RUNBOOK-DEPLOY.md` (el deploy paso a paso) y `docs/ESTADO-REQUERIMIENTOS.md` (§1–§25 auditados contra el código).

## Qué es
Sistema de fidelización multi-tenant y multi-sede para restaurantes: check-in por QR, tarjeta digital,
campañas de WhatsApp, premios y domicilios. Un despliegue, 25+ marcas. **El principio que no se negocia:
un dato de la marca A jamás se ve ni se atribuye a la marca B.**

## Guardrails universales
- `ESTADO.md` es la única lectura obligatoria. Los demás docs se abren cuando se tocan (mapa abajo).
  Para entender algo antes de leer archivos: `graphify query "…"`. Antes de tocar un hub: `graphify affected "…"`.
- Solo lo pedido. Ambigüedad que cambia el resultado → preguntar; duda menor → decidir, hacerlo y decirlo.
- Nada destructivo sin confirmación: push, deploy, migraciones en producción, borrar datos o ramas. Un commit local no la necesita.
- Los secretos viven en `.env` (`.env.example` lleva los nombres, nunca los valores). Nunca en código, docs ni logs.
- Si el pedido choca con la arquitectura documentada: parar, explicar el choque, esperar.
- Un comentario o un doc que dejó de ser verdad se corrige en el MISMO commit.
- Ningún servicio externo se dispara sin que el dueño sepa (Twilio, Zernio, OpenAI, Supabase de producción).
- Cerrar sesión = `ESTADO.md` + entrada de `CHANGELOG.md` (≤15 líneas) + el doc de la feature si cambió el comportamiento + `graphify update .`.
- Lo repetitivo (auditorías, inventarios, barridos) va a subagentes Sonnet o Haiku, nunca al modelo caro.

## Guardrails del dominio (romperlos cuesta datos reales)
- **Todo INSERT lleva `tenant_id` explícito.** La 00030 nunca se aplicó: 18 tablas conservan el DEFAULT puente de la 00028 → un INSERT que lo olvide se va **calladito a Sushi Service**, sin error.
- **Toda columna de sede es NULLABLE y lleva FK COMPUESTA `(location_id, tenant_id)` ON DELETE RESTRICT.** Una FK simple deja atribuir un hecho de la marca A a una sede de la marca B y el motor no se queja.
- **`location_id` NULL = "sede desconocida", y se muestra. Nunca backfillear.** Única excepción: `restaurant_events.audience_scope`, donde el alcance es EXPLÍCITO (`brand` exige NULL, `location` exige NOT NULL). `visits.location_source` y `location_id` van juntos (lo impone un CHECK); `visits.location_conflict` es TRI-ESTADO (NULL = no se evaluó, no `false`).
- **Las migraciones 00044 y 00045 se aplican en Supabase ANTES de desplegar el código que las usa.** Al revés: PostgREST devuelve 42703 y **todos los meseros reciben 403**.
- **Un mesero es de UNA sede (D11).** La sede vive en la FILA (`staff_users.location_id`), **nunca en el JWT**. `staff_users_phone_tenant_key (phone, tenant_id)` es D11 en el motor: no se toca. El 403 «estás en el enlace de otra sede» es del LOGIN (después del PIN), no del check-in: ahí gana el mesero y la discrepancia solo se registra en `visits.location_conflict`.
- **`promoteVersion()` es el ÚNICO escritor de `admin_settings.*_template_sid`.** `fillEmptyPointer()` es aditivo: solo rellena claves vacías, nunca cambia un puntero vivo.
- **El prompt de domicilios es el literal de n8n salvo la ciudad**, que sale de `tenants.config.delivery_default_city`. Hornear una ciudad se la escribe en `customers.city` a los 25 tenants. `parseDeliveryAiJson()` es PURA y replica un nodo probado en producción: no se "mejora" sin medir (`"45.000"` → `45` es comportamiento CONOCIDO; la defensa vive en el prompt).
- **`logDeliveryIntakeFailure()` es el único embudo por el que se pierde un domicilio.** Cuando §24-B cree la tabla, el INSERT va ahí dentro y en ningún otro sitio. `/api/webhook/delivery` es una CÁSCARA sobre `registerDeliveryOrder()`: su contrato no se cambia mientras n8n lo llame.
- **`src/constants/messaging.ts` es espejo de `message_class_map`**: se cambian los dos lados o ninguno. Igual con el contrato de variables `{{n}}` de `template-catalog.ts`, que es fijo.
- **Prohibido hornear emojis de rubro en `template-texts.ts`** (usar `${emoji}`; hay un test que lo vigila). Los textos `calido` no se tocan sin decisión del dueño.
- **`OPENAI_API_KEY` es server-only** y `src/lib/openai/client.ts` es el único sitio que instancia el SDK.
- Premios: `reward_grants.granted_location_id` y `reward_redemptions.redeemed_location_id` son DOS sedes distintas (dónde se ganó / dónde se entregó). Ningún premio tiene precio: solo conteos y tasas, **nunca pesos**.
- "Quién es Black" difiere hoy entre la tarjeta (`src/lib/black-tier.ts`) y el panel (`POWER_RANKS`, 10+ visitas). Es la deuda 17.b: no se unifica por cuenta propia.

## Trampas verificadas (tu memoria está desactualizada)
| Librería / servicio | Lo que el modelo cree | Lo que es verdad (verificado) |
|---|---|---|
| Supabase JS | `const { data } = await supabase…` alcanza | Si hay error, `data` es `null`: **indistinguible de "vacío"**. Destructurar siempre `error` y pasarlo por `src/lib/db-failure.ts` (2026-09-04) |
| Postgres | agregarle un parámetro a una función es `CREATE OR REPLACE` | Crea una **SOBRECARGA**: la llamada vieja pasa a ser ambigua (42725) dentro de un `catch` que solo loguea. Exige `DROP` primero — pasó con `log_review_shown_deduped()` (2026-09-04) |
| Postgres | un UNIQUE sobre una columna protege la unicidad | **Los NULL no colisionan entre sí.** Volver nullable una columna con UNIQUE apaga la garantía en silencio (es el choque de §19 con D11) |
| Vercel Hobby | los crons de `vercel.json` son gratis | Los dos `*/15` **hacen fallar el build** sin plan Pro. Y un cron acá + su Schedule Trigger en n8n activos a la vez = **doble disparo** (2026-09-02) |
| PostgREST | una columna que falta da un error visible | Devuelve 42703 y la ruta responde **403** — parece un problema de permisos y no lo es |
| Next.js 16 | `useSearchParams()` es gratis | Fuerza el CSR bailout. Por eso el selector de sede guarda en `localStorage` y no en la URL |
| Next.js (esta versión) | tu API de memoria sirve | Tiene breaking changes: leer `node_modules/next/dist/docs/` antes de escribir |
| `/api/dashboard/location` | devuelve la lista de sedes | Su contrato es un **OBJETO PLANO**; devolver la lista rompe `dashboard/settings/page.tsx` en silencio |
| n8n | ya no se usa | `domicilios_whatsapp_v4.json` sigue **ACTIVO** en el VPS y es lo único que lo mantiene vivo. Los 5 `cron_*.json` están en retirada (ya declarados en `vercel.json`) |

## Comandos
`npm run dev` · `npm run build` · `npx tsc --noEmit` · `npm run lint` · `npx vitest run` (14 archivos / 261 tests)
`graphify query "…"` · `graphify affected "…"` · `graphify update .` (después de commitear; AST solo, sin costo)

## Dónde está cada cosa
| Si tocás… | Leé antes |
|---|---|
| Check-in, mesero, QR físico | `docs/features/qr-checkin.md` + `staff-qr-scan.md` |
| Domicilios (webhook, IA, intake) | `docs/features/delivery-webhook.md` + `delivery-ai-parsing.md` |
| Plantillas de WhatsApp | `docs/features/whatsapp-templates.md` + `docs/PLANTILLAS.md` |
| Campañas, opt-out, cola y presupuesto de envío | `docs/features/campaigns.md` + `send-governance.md` |
| Panel / dashboard | `docs/features/dashboard.md` |
| Tarjeta del cliente | `docs/features/wallet-card.md` + `design-system.md` |
| Premios, redenciones, escaneo del mesero | `docs/features/reward-grants.md` + `redemption-tracking.md` |
| Calendario de eventos | `docs/features/calendar.md` |
| Cualquier `location_id`, sedes, `resolveHostContext()` | `docs/features/multi-sede.md` (diseño: `docs/superpowers/specs/2026-09-02-multisede-design.md`) |
| Mensajería Zernio | `docs/features/zernio-messaging.md` |
| Puntos y mystery box | `docs/features/points-mystery-box.md` |
| Billetera y cobro | `docs/features/wallet-billing.md` · Reseñas de Google: `review-flow.md` |
| Tablas, RLS, migraciones | `docs/DB_SCHEMA.md` |
| Endpoints | `docs/API_DOCS.md` · Auth, secretos, aislamiento: `docs/03-security.md` |
| Deploy, crons, n8n, `vercel.json` | `docs/04-deployment.md` + `docs/RUNBOOK-DEPLOY.md` |
| Arnés de tests, `vitest.config.mts` | `docs/features/testing.md` |
| Qué falta del encargo de producto (§1–§25) | `docs/ESTADO-REQUERIMIENTOS.md` + `docs/requerimientos/REQUERIMIENTOS_AGOSTO_2026.md` |

Lo que no está en esta tabla, lo responde el grafo: `graphify query "…"`.
