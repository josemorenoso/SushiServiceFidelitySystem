# Feature: Billetera prepagada por tenant (saldo, débito, corte y recargas)

**Última actualización:** 2026-07-13 (Bloques 1, 2 y 3a)
**Spec:** [`docs/superpowers/specs/2026-07-13-wallet-billing-design.md`](../superpowers/specs/2026-07-13-wallet-billing-design.md)
**Migraciones:** `00027_wallet.sql` (entradas) + `00033_wallet_debits.sql` (débito, tarifa, corte)

---

## Objetivo

Que el operador de Cada1 sepa **cuánto saldo tiene cada tenant** y **cuánto ha consumido**, que el
saldo baje solo con cada mensaje enviado a la tarifa del tenant, y que **una campaña masiva se bloquee
cuando el tenant no tiene con qué pagarla** — para que el operador no termine absorbiendo el gasto.

## El malentendido que resuelve

**Twilio no reparte saldo entre subcuentas.** Todas consumen del mismo bote (la cuenta matriz) y se
facturan al padre. No existe "meterle 50,000 a la subcuenta". Por eso **el saldo de cada tenant lo lleva
nuestra base de datos**, no Twilio. El balance de Twilio es el *inventario del operador*, no el saldo de
un cliente — y por eso solo lo ve el super-admin.

## Modelo de negocio

**Prepago a tarifa propia.** El operador le vende mensajes al tenant a un precio fijo en COP
(`tenants.price_per_message_cop`, default **$100**). Lo que Twilio le cobre al operador (~$73.5 COP a la
TRM actual) es su costo y su margen. El tenant ve un precio estable; el riesgo cambiario se queda del
lado del operador.

---

## Cómo funciona

### 1. El débito (Bloque 1)

Todos los envíos pasan por un embudo único: `recordMessageLog()` → `INSERT message_logs`. Un **trigger de
Postgres** (`trg_debit_wallet`, migración 00033) cuelga de ahí y, cuando el mensaje tiene `twilio_sid`
(= Twilio lo aceptó = Twilio nos cobró), inserta un movimiento `debit` negativo en
`tenant_wallet_transactions` por la tarifa del tenant.

```
  cualquier envío ─► sendTemplateMessage() ─► recordMessageLog() ─► INSERT message_logs
                                                                          │  trigger (misma transacción)
                                                                          ▼
                                              INSERT tenant_wallet_transactions (debit, −$100)
```

Por qué trigger y no una llamada desde el código: `recordMessageLog()` es *best-effort* (envuelto en
try/catch para nunca romper un envío). Un débito best-effort que falla en silencio = mensajes gratis. El
trigger ocurre en la **misma transacción** que el log: o quedan los dos o ninguno. **Nunca divergen.**

**Idempotencia por constraint, no por lógica:** `UNIQUE (message_log_id)`. Aunque el webhook de estado se
reintente, un mensaje se cobra una sola vez. El propio trigger además salta si `OLD.twilio_sid` ya existía.

**Qué NO se cobra:** mensajes que nunca salieron (opt-out, Twilio mal configurado → sin `twilio_sid`), y
los avisos de la plataforma (`message_type = 'low_balance'`).

### 2. El saldo (siempre derivado)

- **Saldo COP** = `SUM(amount_cop)` → función `tenant_wallet_balance_cop()` (ya existía en 00027).
- **Mensajes disponibles** = `saldo ÷ tarifa` → función `tenant_messages_available()`. **No se almacena:**
  el dinero es la verdad, los mensajes son una vista. Guardar un contador aparte se desincronizaría al
  primer ajuste o cambio de tarifa.

El tenant ve su saldo en `WalletCard` (pestaña Campañas y panel de mensajería del dashboard). El
super-admin ve el de todos en **Billeteras** (`/dashboard/admin/wallets`).

### 3. El corte (Bloque 2)

`canSendBulk(tenantId, count)` se llama **antes** de cada envío masivo. Si no alcanza, responde **409**
con `{ balanceCop, pricePerMessage, messagesAvailable, recipients, shortfallCop }` para que la UI diga
*"te faltan $X para esta campaña de N contactos"*.

| Camino | ¿Se bloquea sin saldo? |
|--------|------------------------|
| Campaña manual (`POST /api/dashboard/campaigns/manual`) | **Sí** |
| Golden Bullet (`confirmImport`) | **Sí** |
| Check-in, bienvenida, tier, mystery box, premio (transaccionales) | **No** — siempre salen |

Es **corte mixto** (spec W-D6): lo que quema el presupuesto es una campaña masiva, y eso se frena. Un
transaccional suelto cuesta centavos y no se le niega a un comensal por un tema de cobranza entre el
operador y el restaurante — puede dejar el saldo levemente en negativo, que se cobra en la próxima recarga.

> ⚠️ **Pendiente (Bloque 2, fase 2):** los crons masivos (`birthday`, `reactivation`, `calendar-dispatch`,
> `reward-reminder`) todavía **no** consultan `canSendBulk`. En la práctica están acotados (solo envían a
> quien cumple años hoy, etc.), pero el spec los marca para agregar el guard por-tenant.

### 4. Las recargas (Bloque 3a — manual)

**Aquí es donde el operador anota el depósito.** Panel **Billeteras** → botón *Recargar* en la fila del
tenant → diálogo: monto (con montos rápidos 50k/100k/200k/500k), referencia del pago (Nequi ID) y nota.
Al asignar, `recordTopup()` inserta un `topup` `source: 'manual'` y limpia `low_balance_notified_at`.

Idempotencia: `UNIQUE (source, external_ref)` → registrar la misma referencia dos veces no acredita el
pago dos veces.

> **Bloques futuros (no implementados):** autoservicio con Wompi (Bloque 5) y avisos automáticos de saldo
> bajo por WhatsApp (Bloque 4). Ver el spec.

---

## Seguridad

- **`price_per_message_cop` es columna de `tenants`, no `config` jsonb.** `config` lo edita el propio
  tenant; si la tarifa viviera ahí, un cliente podría ponerse su precio en $1. La tarifa solo la escribe
  el super-admin.
- **Fix del saldo matriz expuesto:** `GET /api/dashboard/twilio-balance` devolvía el saldo de la cuenta
  matriz (inventario del operador) a **cualquier** admin de tenant. Ahora solo el super-admin ve el
  balance; los demás reciben únicamente las constantes de costo (`restricted: true`). Las vistas del
  tenant usan `WalletCard` (su propio saldo COP), no el matriz.
- Las rutas `/api/admin/*` exigen `requireSuperAdmin()` (rol `super_admin` en el JWT). La página
  `/dashboard/admin/wallets` hace `redirect('/dashboard')` si no es super-admin.

## Archivos

| Archivo | Rol |
|---------|-----|
| `supabase/migrations/00033_wallet_debits.sql` | Débito (trigger), tarifa/umbral/contacto en `tenants`, `tenant_messages_available()` |
| `src/constants/wallet.ts` | Tarifa default, TRM centralizada (antes duplicada), paquetes |
| `src/services/wallet.service.ts` | `getBalanceCop`, `getMessagesAvailable`, `canSendBulk`, `recordTopup`, `listTenantWallets`, `getWalletSummary` |
| `src/lib/admin.ts` | `isSuperAdmin()`, `requireSuperAdmin()` |
| `src/app/api/admin/wallet/topup/route.ts` | Registrar recarga manual (super-admin) |
| `src/app/api/admin/wallets/route.ts` | Estado de todas las billeteras (super-admin) |
| `src/app/api/dashboard/wallet/route.ts` | Saldo del tenant actual |
| `src/components/dashboard/SuperAdminWallets.tsx` | Panel + diálogo de recarga |
| `src/components/dashboard/WalletCard.tsx` | Tarjeta de saldo del tenant |
| `src/app/(dashboard)/dashboard/admin/wallets/page.tsx` | Página (gate super-admin) |
