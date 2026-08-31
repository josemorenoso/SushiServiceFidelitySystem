# Feature: Gobernanza de envío — presupuesto de línea

**Agregado:** v2.11.0 — 2026-08-30
**Migración:** `00037_send_governance.sql` (requiere `00036_zernio_provider.sql` aplicada antes)
**Spec:** [`docs/superpowers/specs/2026-08-30-gobernanza-de-envio-design.md`](../superpowers/specs/2026-08-30-gobernanza-de-envio-design.md)
**Ver también:** `docs/features/campaigns.md`, `docs/features/zernio-messaging.md`,
`docs/features/wallet-billing.md`, `docs/features/golden-bullet.md`

---

## Objetivo

Que **ninguna línea de WhatsApp pueda pasarse del límite diario de Meta**, y que una campaña masiva
nunca deje al restaurante sin capacidad para saludar a quien se registre esa tarde.

## El encuadre

> **El repo ya gobernaba la DEMANDA. No gobernaba la OFERTA.**

Antes de 00037 existían —y siguen existiendo— reglas que limitan **cuántos mensajes recibe una
persona**: `FREQUENCY_CAP_DAYS = 7`, `MONTHLY_MARKETING_CAP = 3`, el blackout pre-evento del
calendario y el opt-out. Todo eso se conserva sin cambios.

Lo que **no** existía era nada que supiera **cuántos mensajes puede emitir la línea**. Una campaña
recorría su lista completa (`campaigns/manual/route.ts` itera `finalEligible` entero; `BATCH_SIZE = 10`
es concurrencia, no un tope) y, pasado el límite de Meta, los envíos empezaban a fallar — degradando
la calidad de la línea principal del restaurante.

Son **ejes independientes**: un envío sale solo si el cliente lo permite **y** la línea tiene cupo.

## Las tres reglas de Meta que esto implementa

1. **Destinatarios ÚNICOS, ventana RODANTE de 24h.** Tres mensajes al mismo teléfono consumen **un**
   cupo, no tres. Por eso el conteo es `COUNT(DISTINCT phone)` sobre `now() - interval '24 hours'`, y
   no un contador por día calendario.
2. **Todas las categorías consumen el mismo cupo.** Una bienvenida (utility) pesa igual que una promo
   (marketing). **Esta es la razón de que exista la reserva.**
3. **El límite cambia por escalón y lo define Meta.** Por eso vive en
   `tenants.messaging_daily_limit` como dato sincronizable, **no** como constante en el código.

## El presupuesto

```
limite            = tenants.messaging_daily_limit          (default 250)
p95_transaccional = percentil 95 del consumo transaccional diario, últimos 14 días
reserva           = LEAST( GREATEST(piso, ceil(p95 * factor)), limite * max_pct )
presupuesto_campana = limite - reserva
```

Con los defaults (`limite = 250`, `piso = 70`) y un tenant sin historial: **180 de campaña libre**.

| Parámetro (`admin_settings`) | Default | Qué hace |
|---|---|---|
| `transactional_reserve_floor` | `70` | Piso de la reserva cuando no hay historial |
| `reserve_safety_factor` | `1.3` | Colchón sobre el p95 observado |
| `reserve_max_pct` | `50` | Techo: la reserva nunca se come más de la mitad del límite |

**Por qué no es un porcentaje fijo:** a 250/día reservar el 28 % es correcto; a 10.000/día reservar
2.800 sería absurdo — ningún restaurante hace 2.800 check-ins diarios. La fórmula se auto-calibra
contra el consumo real y solo usa el piso cuando el tenant es nuevo.

> **Nota de implementación:** el p95 se calcula sobre `message_logs` (larga vida), **no** sobre
> `send_reservations`, que se poda a 7 días y no alcanzaría para una ventana de 14.

## La reserva atómica

`sendTemplateMessage()` sigue siendo el **choke-point único**. La guarda va **después del opt-out** en
ambas ramas (Twilio y Zernio): un cliente que pidió SALIR no debe consumir uno de los cupos del día.

```
is_demo ──► (simulado, NO consume cupo)
   │
   ├─ zernio ─► config ─► opt-out ─► RESERVA ─► envío ─► (falla: release)
   └─ twilio ─► config ─► opt-out ─► RESERVA ─► envío ─► (falla: release)
```

**La atomicidad es obligatoria y vive en Postgres, no en TypeScript.** Las campañas envían en paralelo
(`BATCH_SIZE = 10`); un patrón leer-contar-insertar tiene una carrera que permite pasarse del límite.
`reserve_send_slot()` toma un `pg_advisory_xact_lock` por tenant que serializa la decisión y se libera
al cerrar la transacción (cada RPC de supabase-js es su propia transacción).

**No quitar ese lock.** Es lo único que impide pasarse del límite bajo carga.

### Fallo cerrado

A diferencia de `recordMessageLog()` —que es best-effort y nunca debe romper un envío—, la guarda de
presupuesto **falla cerrado**: si no se puede confirmar que hay cupo, **no se envía**
(`error_code = 'budget_check_failed'`).

Es deliberado. Perder un mensaje de bienvenida por una caída de la base es un problema menor;
pasarse del límite de Meta repetidamente le restringe el número al cliente — y con coexistencia, ese
número es su línea principal de atención.

Por la misma razón, el `release` es best-effort: desperdiciar un cupo nunca le restringe el número a
nadie; pasarse sí.

## Clases y prioridades

Fuente única de verdad: la tabla `message_class_map`, con espejo en
[`src/constants/messaging.ts`](../../src/constants/messaging.ts). **Si agregas un tipo, agrégalo en
los dos lados.**

| Prioridad | Clase | Tipos |
|---|---|---|
| P0 | `transactional` | `welcome`, `checkin`, `tier_unlocked`, `points_earned_near`, `points_earned_far`, `safe_reward`, `mystery_box`, `golden_box`, `delivery`, `low_balance` |
| P1 | `campaign` | `birthday`, `reward_reminder`, `calendar_event`, `event` |
| P2 | `campaign` | `reactivation` |
| P3 | `campaign` | `manual` |
| P4 | `campaign` | `import` (Golden Bullet) |

**P1 es sensible al tiempo, no "importante":** un cumpleaños entregado mañana no vale nada.

Un `message_type` desconocido cae en `campaign` / P3 — la opción **conservadora**: queda sujeto al
presupuesto de campaña (más estrecho) en vez de poder consumir la reserva transaccional.

## La billetera, para tenants Zernio (decisión D-2)

`debit_wallet_on_message_sent()` ahora **se salta a los tenants `messaging_provider = 'zernio'`**. Con
Zernio, Meta le factura los mensajes directo al restaurante contra el método de pago de su propia
WABA; cobrarle además la tarifa de la billetera sería cobrarle dos veces. El modelo comercial pasa a
suscripción mensual variable.

**La billetera de los 4 tenants Twilio (Sushi Service, Don Alirio, Frangal, Demo) queda intacta** — el
trigger es copia fiel del de `00033` con una sola guarda añadida, incluido su `EXCEPTION WHEN OTHERS`
(el ledger nunca puede tumbar el registro de un mensaje ya enviado).

**Detalle que hace esto posible ahora y no antes:** la billetera también funcionaba como freno de
gasto (*"una campaña masiva se bloquea cuando el tenant no tiene con qué pagarla"*). El presupuesto de
línea la reemplaza en esa función, y frena contra el límite real de Meta en vez de contra el saldo.

## Superficie para el AIOS

Patrón de `00035`/`00036`: el rol `aios_constelarys` no gana acceso directo a ninguna tabla, solo
`EXECUTE` sobre funciones `SECURITY DEFINER`.

| Función | Qué hace |
|---|---|
| `aios_line_health(p_slug)` | Lectura. Sin `p_slug` devuelve **todas** las líneas: calidad, estado, límite, consumo 24h, cupo disponible, profundidad de cola. Es el tablero de emergencia. |
| `aios_set_line_status(p_slug, p_status, p_reason)` | Congela o reactiva una línea. **Exige motivo no vacío**, que queda en el historial. |

## Archivos

- `supabase/migrations/00037_send_governance.sql`
- `src/constants/messaging.ts`
- `src/services/line-budget.service.ts`
- `src/services/whatsapp.service.ts` (guarda en ambas ramas + release en fallo)
- `src/app/api/dashboard/line-budget/route.ts`

## Pendiente (bloques siguientes del spec)

Esta entrega es el **Bloque 1** (presupuesto) más el **Bloque 8** (retiro de billetera Zernio). La
migración `00037` ya crea las tablas de los bloques siguientes, pero **el código que las usa todavía
no existe**:

- **Bloque 2 — cola de goteo.** `send_queue` existe; falta `/api/cron/queue-drain`, el workflow W4 de
  n8n y el encolado desde campañas y crons. **Hoy, una campaña que excede el presupuesto simplemente
  falla el resto de los envíos en vez de repartirlos en días.**
- **Bloque 3 — salud y frenos.** `line_health_snapshots` y `tenants.quality_rating` existen y
  `line_budget()` ya respeta `throttled`/`frozen`, pero **nada los escribe todavía**: falta
  `/api/cron/line-health` y el workflow W5.
- **Bloque 4 — consentimiento.** `consent_events` existe; falta escribir en él desde check-in y
  webhooks, y el backfill.
- **Bloque 5 — régimen de Golden Bullet** (§3.4.1 del spec).

El scheduler de los bloques 2 y 3 son **workflows de n8n**, no crons de Vercel: `vercel.json` tiene
`"crons": []` a propósito (ver `docs/04-deployment.md` §5).
