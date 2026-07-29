# Feature: Tenant Demo (Ventas)

**Agregado:** v2.7.0 — 2026-07-29

## Objetivo

Que varios vendedores puedan mostrarle el dashboard real (no una maqueta) a un
prospecto, usando datos de un cliente real (Sushi Service, el más antiguo) para
que se vea creíble, **sin que sea físicamente posible** que un click durante la
demo le dispare un WhatsApp a un cliente de verdad.

> No confundir con `/demo` (`src/app/demo/page.tsx`, `DemoContext.tsx`) — esa es
> una landing-page teaser 100% estática (lee `public/demo-data.json`, sin login
> real, sin backend), pensada para visitantes anónimos y limitada a la pantalla
> de Métricas. Este feature es un tenant real, con dashboard completo (Clientes,
> Campañas, Recompensas, Calendario, Mesero) para el equipo de ventas.

## Diseño

Un tenant más (`tenants.is_demo = true`) con datos clonados de Sushi Service.
Login único compartido (Supabase Auth soporta sesiones concurrentes sin
problema — cada vendedor tiene su propia cookie/JWT).

**La garantía de seguridad vive en un solo punto**, no repartida por ruta:
`sendTemplateMessage()` en `src/services/whatsapp.service.ts` es el único
embudo de envío de TODO el sistema (campañas manuales, cron birthday/
reactivation/calendar-dispatch, bienvenida QR, tier unlocked, mystery box,
recordatorio de premios, domicilios). Si `tenant.is_demo`, la función:
1. Nunca llama a Twilio.
2. Registra el mensaje en `message_logs` con `status='sent'` y `twilio_sid=NULL`
   — así la UI se siente real (contador de campaña sube, aparece "enviado")
   sin que el trigger de billetera (`trg_debit_wallet`, solo dispara cuando
   `twilio_sid` deja de ser NULL) cobre nada.
3. Devuelve una respuesta simulada para que el caller siga su flujo normal.

Como cualquier ruta que envía un mensaje pasa por esta única función, no hace
falta excluir el tenant demo de los crons ni tocar cada endpoint — es
imposible saltarse el guard por accidente.

## Qué se clona (`scripts/seed-demo-tenant.sql`)

De Sushi Service (`tenants.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'`):
`customers`, `visits`, `reward_tiers`, `campaign_rewards`, `restaurant_events`,
`admin_settings` (crítico — sin esto no hay tiers ni plantillas configuradas,
ver `docs/DB_SCHEMA.md` sobre el hallazgo de don-alirio), `staff_users`,
`authorized_numbers`. Datos reales, sin anonimizar (decisión del dueño: es su
propio negocio, y de todas formas nunca sale un mensaje real).

**Deliberadamente NO se clonan** (arrancan vacíos a propósito, para que el
vendedor pueda crear una campaña/evento en vivo frente al prospecto):
`campaigns`, `campaign_messages`, `message_logs`, `reward_redemptions`,
`mystery_box_results`, `point_transactions`, `reward_grants`, `review_events`,
`staff_devices` (el device-trust es específico del tablet físico del cliente
real, no sirve clonado), `rewards` (tabla legacy de milestones, superada por
`reward_tiers`).

**Billetera:** se siembra un topup único de 50,000,000 COP — nunca se gasta de
verdad (el trigger de débito solo corre si `twilio_sid` no es NULL), existe
solo para que `canSendBulk()` no bloquee una campaña de demo con "saldo
insuficiente".

## Reset

El mismo script (`scripts/seed-demo-tenant.sql`) es idempotente: primero borra
todo lo que el uso normal del tenant demo generó (campañas de prueba, canjes
de mystery box, logs) y todo lo clonado, luego vuelve a clonar desde Sushi
Service. Correrlo antes de una demo importante o cuando los datos se sientan
"usados". Nunca toca Sushi Service (solo lectura de ahí).

Orden de borrado importa: `reward_redemptions.tier_id` es `ON DELETE RESTRICT`
(no cascada), así que se borra antes que `reward_tiers` — si se invierte el
orden, el reset falla con foreign key violation.

## Setup (una sola vez)

1. Aplicar `supabase/migrations/00034_demo_tenant_flag.sql` (columna
   `tenants.is_demo`).
2. Correr `scripts/seed-demo-tenant.sql` en el SQL Editor de Supabase — crea
   el tenant `demo-ventas` y clona los datos.
3. Supabase → Authentication → Users → Add user (email/password compartidos
   del equipo de ventas).
4. Tagear `raw_app_meta_data.tenant_id` de ese usuario con el id del tenant
   `demo-ventas` (SQL de ejemplo al final de `seed-demo-tenant.sql`) — mismo
   patrón que el onboarding normal, `docs/04-deployment.md` §6 Paso 5.
5. Opcional: agregar un dominio propio (`demo.constelarys.com`) en Vercel →
   Settings → Domains, igual que cualquier cliente nuevo (§6 Paso 4), para que
   el branding no se confunda con el de un cliente real.

## Archivos involucrados

| Archivo | Responsabilidad |
|---------|------------------|
| `supabase/migrations/00034_demo_tenant_flag.sql` | Columna `tenants.is_demo` |
| `scripts/seed-demo-tenant.sql` | Clonado + reset de datos |
| `src/services/whatsapp.service.ts` | Guard central — nunca llama a Twilio si `tenant.is_demo` |
| `src/lib/tenant.ts` | `TENANT_COLUMNS` incluye `is_demo` — se propaga solo a cada resolución de tenant |
| `src/types/tenant.types.ts` | `Tenant.is_demo` |
