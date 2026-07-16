# Spec — Billetera prepagada por tenant: débito, corte, recargas y avisos

> **Fecha:** 2026-07-13
> **Feature doc:** `docs/features/wallet-billing.md` (se crea con el Bloque 1)
> **Depende de:** 00024 (tenants), 00027 (wallet), 00020 (message_logs)
> **Estado:** propuesta — pendiente de aprobación

---

## 1. El problema

> *"Un cliente acabó de transferirme 50,000 pesos y recargué en la cuenta matriz 100,000, pero ¿cómo la
> subcuenta se atribuye los 50? ¿Dónde anoto yo cuando me depositan? ¿Cómo rastreo cuánto han usado?"*

Hoy el operador vende mensajes a $70 COP y le dice al cliente *"con 50,000 te alcanza para tanto"* —
**pero ese número no lo calcula ni lo verifica nadie.** No existe rastreo. Tres cosas están rotas:

1. **No hay débito.** [`00027_wallet.sql`](../../../supabase/migrations/00027_wallet.sql) registra las
   entradas (`topup` / `adjustment` / `refund`) pero **nada registra el consumo**. Por eso
   `tenant_wallet_balance_cop()` no devuelve un saldo: devuelve el **total histórico depositado**. El
   número solo sube.
2. **No hay corte.** Un tenant sin saldo puede disparar una campaña de 2,000 contactos y el costo lo
   absorbe el operador, en silencio.
3. **No hay aviso.** El cliente se entera de que se quedó sin mensajes cuando sus campañas ya dejaron de
   salir — o nunca se entera.

### 1.1 El malentendido que hay que deshacer primero

**Twilio no reparte saldo entre subcuentas.** El balance vive en la cuenta padre; las subcuentas
consumen de ese pool común y se facturan al padre. **No existe "la subcuenta tiene 50,000"** — no es una
limitación de este proyecto, es cómo funciona Twilio. Lo único que Twilio expone por subcuenta es el
*consumo* (Usage Records API).

**Conclusión:** la atribución del dinero **tiene que vivir en nuestra base de datos**. El balance de
Twilio deja de ser una cuenta que haya que explicarle a nadie — pasa a ser **el inventario del
operador**. Es un dato interno de margen, no el saldo del cliente.

### 1.2 El modelo de negocio (define todo lo demás)

**Saldo prepago a tarifa propia.** El operador le vende mensajes al cliente a **su** precio (COP fijo).
Lo que Twilio le cobre a él es su costo y su margen — al cliente no le afecta.

La consecuencia buena: **el riesgo cambiario se queda del lado del operador** y el cliente ve un precio
estable en COP. La TRM deja de importarle al cliente.

### 1.3 Hallazgo colateral: se está vendiendo por debajo del costo

A la TRM hardcodeada (4200) el costo real es **$73.5 COP/mensaje** (Meta $0.0125 + Twilio $0.005 =
$0.0175 USD). Se está cobrando **$70**. **El margen es negativo:** entre más se vende, más se pierde.

La tarifa por defecto de este spec es **$100 COP/mensaje** (~26% de margen). Además el número que se le
comunica al cliente queda redondo: **50,000 = 500 mensajes** (contra los 714 irregulares de hoy).

---

## 2. La decisión que ahorra la mitad del trabajo

**`recordMessageLog()` ya es el embudo único de todos los envíos.**
([`message-log.service.ts:42`](../../../src/services/message-log.service.ts#L42))

Transaccionales, campañas, cumpleaños, calendario, Golden Bullet, recordatorios — **todo** pasa por ahí,
y **siempre con `tenant_id`**. No hay que instrumentar N caminos de envío: hay que colgarse de uno.

```
  cualquier envío ──► sendTemplateMessage() ──► recordMessageLog() ──► INSERT message_logs
                                                                              │
                                                                    trigger ──┘
                                                                              ▼
                                                        INSERT tenant_wallet_transactions (debit, -$100)
```

Y la segunda mitad del regalo: **`tenant_wallet_balance_cop()` ya está bien escrita.** Es
`SUM(amount_cop)`. Hoy da un número inflado únicamente porque nadie inserta negativos. **No hay que
reescribirla — hay que empezar a restar.**

---

## 3. Decisiones de diseño

| # | Decisión | Alternativa descartada |
|---|----------|------------------------|
| **W-D1** | **El ledger se lleva en dinero (COP), no en créditos ni en "mensajes".** Los mensajes disponibles se **calculan** (`saldo ÷ tarifa`), nunca se almacenan. | Un contador de mensajes aparte del dinero: son dos fuentes de verdad que **se desincronizan** al primer ajuste manual, reembolso o cambio de tarifa, y nadie sabrá cuál creer. El dinero es lo que se transfiere, lo que cobra la pasarela y lo que se reembolsa. Es la verdad contable. |
| **W-D2** | **El débito es un trigger de Postgres sobre `message_logs`**, no una llamada desde el servicio. | Una llamada más desde el código: `recordMessageLog()` es **best-effort** — vive envuelta en try/catch para nunca romper un envío ([message-log.service.ts:61](../../../src/services/message-log.service.ts#L61)). Un débito best-effort que falla en silencio = **mensajes gratis**. Como trigger, el débito ocurre en la **misma transacción** que el log: o quedan los dos, o no queda ninguno. Es imposible que diverjan, y ningún camino de envío futuro se puede "olvidar" de cobrar. |
| **W-D3** | **Se cobra cuando `twilio_sid` deja de ser NULL** — o sea, cuando **Twilio aceptó** el mensaje. | Cobrar al `delivered`: Twilio cobra al aceptar, no al entregar. Cobraríamos menos de lo que pagamos. Cobrar al intentar: un mensaje bloqueado por opt-out o por Twilio mal configurado **nunca sale y no cuesta** — cobrarlo sería robarle al cliente. |
| **W-D4** | **Idempotencia por constraint, no por lógica.** `UNIQUE (message_log_id)` en el ledger. | Chequear "¿ya lo cobré?" en código: es una condición de carrera esperando a pasar. Con el UNIQUE, cobrar dos veces el mismo mensaje es **matemáticamente imposible**, aunque un webhook se reintente tres veces. (Postgres permite múltiples NULL en un UNIQUE, así que las recargas —que no tienen `message_log_id`— conviven sin problema.) |
| **W-D5** | **La tarifa es una columna de `tenants`** (`price_per_message_cop`), **no una clave de `tenants.config`**. | `config` (jsonb) **lo edita el propio tenant** vía `PUT /api/dashboard/tenant-config`. Si la tarifa vive ahí, **un cliente puede ponerse su propio precio en $1**. La tarifa es dato de facturación: columna, con escritura restringida a super-admin. |
| **W-D6** | **Corte mixto:** las **campañas masivas** se bloquean sin saldo; los **transaccionales** (bienvenida, check-in, premio) **siempre salen**, aunque dejen el saldo en negativo. | Corte duro total: dejar a un cliente final sin su mensaje de bienvenida por un problema de cobranza entre el operador y el restaurante es una mala experiencia que **no le pertenece al comensal**. Solo aviso: el daño real es una campaña de 2,000 contactos que no se debió mandar; eso hay que frenarlo. El saldo negativo por transaccionales es de centavos y se cobra en la siguiente recarga. |
| **W-D7** | **Cada débito guarda su precio** (`unit_price_cop`), no solo el total. | Solo el total: al subir la tarifa, el histórico queda inauditable — no se puede reconstruir *a qué precio* se cobró cada mensaje. Con el snapshot, cambiar la tarifa nunca reescribe el pasado. |
| **W-D8** | **El histórico NO se cobra retroactivo.** El ledger arranca en cero el día de la migración. | Cobrar los `message_logs` viejos: nadie acordó esa tarifa, y dejaría a los tenants existentes en negativo profundo el día uno. |
| **W-D9** | **La pasarela (Wompi) NO recarga Twilio.** Son dos flujos de dinero **independientes** que nunca se tocan. | Encadenarlos: no existe forma de que un cobro en Wompi dispare una recarga en Twilio. Y no hace falta — **Twilio tiene auto-recharge nativo** con tarjeta del operador. La cuenta matriz se rellena sola por su lado. |
| **W-D10** | **Los mensajes de la plataforma (`low_balance`) no se cobran.** | Cobrarlos: se le estaría cobrando al cliente el mensaje que le avisa que no tiene saldo — y en el peor caso, empujándolo más al negativo. |

### 3.1 Los dos flujos de dinero (nunca se cruzan)

```
  FLUJO A — el cliente le paga al operador          FLUJO B — el operador le paga a Twilio
  ═══════════════════════════════════════          ══════════════════════════════════════
  Restaurante                                       Operador
      │ Nequi / PSE / tarjeta                           │ tarjeta (auto-recharge nativo)
      ▼                                                 ▼
  Wompi ──webhook──► topup (+50,000 COP)            Cuenta matriz Twilio (pool)
      │                    en NUESTRA DB                 │
      ▼                                                 ▼
  Banco del operador                                Subcuentas consumen del pool
```

**Lo único que los conecta es el operador vigilando su propio margen.** Por eso el saldo Twilio real
solo lo ve el super-admin: es inventario, no es el saldo de nadie.

---

## 4. Datos — migración `00033_wallet_debits.sql`

### 4.1 Tarifa y contacto del dueño (`tenants`)

| Columna | Tipo | Null | Default | Descripción |
|---------|------|------|---------|-------------|
| `price_per_message_cop` | `numeric` | NO | `100` | Lo que el tenant **paga por mensaje**. `CHECK (> 0)`. Solo super-admin escribe. |
| `low_balance_threshold_msgs` | `int` | NO | `100` | Umbral del aviso: se avisa cuando quedan ≤ N mensajes. |
| `low_balance_notified_at` | `timestamptz` | SÍ | `NULL` | Anti-spam del aviso. **Se limpia (`NULL`) en cada recarga.** |
| `owner_phone` | `text` | SÍ | `NULL` | A quién se le avisa (WhatsApp). |
| `owner_email` | `text` | SÍ | `NULL` | Copia por correo. |

### 4.2 El ledger (`tenant_wallet_transactions`)

| Columna | Tipo | Null | Descripción |
|---------|------|------|-------------|
| `type` | `text` | NO | **Se agrega `'debit'`** al CHECK existente (`topup`/`adjustment`/`refund`/`debit`). |
| `message_log_id` | `uuid` | SÍ | FK → `message_logs(id)`. **`UNIQUE`** → la idempotencia (W-D4). NULL en recargas. |
| `unit_price_cop` | `numeric` | SÍ | Snapshot de la tarifa al momento del cobro (W-D7). |
| `quantity` | `int` | SÍ | `1` en débitos por mensaje. Deja la puerta abierta a débitos agregados. |
| `source` | `text` | SÍ | `manual` \| `wompi` \| `system`. CHECK. |
| `external_ref` | `text` | SÍ | ID de la transacción Wompi o referencia del Nequi. **`UNIQUE (source, external_ref)`** → un pago no se puede acreditar dos veces. |

**Signo:** `amount_cop` positivo = entra plata; negativo = consumo. El saldo sigue siendo
`SUM(amount_cop)` — **`tenant_wallet_balance_cop()` no se toca.**

### 4.3 El trigger

```sql
CREATE OR REPLACE FUNCTION debit_wallet_on_message_sent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_price numeric;
BEGIN
  -- Solo cobramos lo que Twilio aceptó (W-D3): es cuando Twilio nos cobra a nosotros.
  IF NEW.twilio_sid IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.twilio_sid IS NOT NULL THEN RETURN NEW; END IF;

  -- Los mensajes de la plataforma no se le cobran al tenant (W-D10).
  IF NEW.message_type = 'low_balance' THEN RETURN NEW; END IF;

  SELECT price_per_message_cop INTO v_price FROM tenants WHERE id = NEW.tenant_id;
  IF v_price IS NULL THEN RETURN NEW; END IF;

  INSERT INTO tenant_wallet_transactions
    (tenant_id, type, amount_cop, unit_price_cop, quantity,
     message_log_id, source, created_by, notes)
  VALUES
    (NEW.tenant_id, 'debit', -v_price, v_price, 1,
     NEW.id, 'system', 'system', NEW.message_type)
  ON CONFLICT (message_log_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- El ledger NUNCA puede tumbar el registro de un mensaje ya enviado.
  RAISE WARNING '[wallet] débito fallido para message_log %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_debit_wallet
  AFTER INSERT OR UPDATE OF twilio_sid ON message_logs
  FOR EACH ROW EXECUTE FUNCTION debit_wallet_on_message_sent();
```

> **El `EXCEPTION` no es opcional.** Es lo que mantiene la filosofía existente: el mensaje ya salió al
> cliente final; que la contabilidad falle **no puede** hacer desaparecer su registro. Se pierde un
> cobro (visible en el `WARNING`), no una auditoría.

### 4.4 Mensajes disponibles (derivado, W-D1)

```sql
CREATE OR REPLACE FUNCTION tenant_messages_available(p_tenant_id uuid)
RETURNS int LANGUAGE sql STABLE AS $$
  SELECT GREATEST(0, FLOOR(tenant_wallet_balance_cop(p_tenant_id) / t.price_per_message_cop))::int
  FROM tenants t WHERE t.id = p_tenant_id
$$;
```

---

## 5. Bloque 1 — El débito

**Entregable:** cada mensaje enviado resta del saldo de su tenant. Nada visible todavía.

- Migración `00033` completa (§4).
- `src/services/wallet.service.ts` (nuevo):
  - `getBalanceCop(tenantId)` → `number`
  - `getMessagesAvailable(tenantId)` → `number`
  - `canSendBulk(tenantId, count)` → `{ ok, balance, needed, shortfall }`
  - `recordTopup({ tenantId, amountCop, source, externalRef, notes, createdBy })`
  - `listTransactions(tenantId, { limit, offset })`
- La TRM 4200, hoy **hardcodeada en dos archivos distintos**
  ([`imported-contacts.service.ts:30`](../../../src/services/imported-contacts.service.ts#L30) y
  [`twilio-balance/route.ts:6`](../../../src/app/api/dashboard/twilio-balance/route.ts#L6)), pasa a ser un
  único `admin_setting` (`usd_cop_rate`). **Solo se usa para el reporte de margen del super-admin** — al
  cliente ya no le afecta (§1.2).

**Verificación:** hacer un check-in real → aparece la fila `debit` con `-100` y su `message_log_id`.
Reejecutar el webhook de status → **no** aparece una segunda fila.

---

## 6. Bloque 2 — Saldo visible y corte

### 6.1 El bug de seguridad que se arregla aquí

[`GET /api/dashboard/twilio-balance`](../../../src/app/api/dashboard/twilio-balance/route.ts) autentica
al usuario pero **no lo filtra por tenant**: lee las env vars `TWILIO_*` (cuenta **matriz**) y le
devuelve **el saldo global del operador a cualquier tenant autenticado**. Hoy un restaurante puede ver
el inventario completo de Cada1.

**Se parte en dos endpoints:**

| Endpoint | Quién | Qué devuelve |
|----------|-------|--------------|
| `GET /api/dashboard/wallet` | cualquier admin del tenant | Su saldo COP, sus mensajes disponibles, su tarifa, su consumo del mes, sus últimos movimientos. |
| `GET /api/admin/twilio-balance` | **solo super-admin** | El saldo real de la cuenta matriz Twilio + margen (usando `usd_cop_rate`). |

### 6.2 El corte (W-D6)

`canSendBulk()` se llama **antes** de cada envío masivo:

| Camino | Se bloquea sin saldo |
|--------|----------------------|
| `POST /api/dashboard/campaigns/manual` | **Sí** |
| Golden Bullet (`imported-contacts.service`) | **Sí** — ya estima costo; ahora además valida saldo |
| `GET /api/cron/birthday` | **Sí** |
| `GET /api/cron/calendar-dispatch` | **Sí** |
| `GET /api/cron/reward-reminder` | **Sí** |
| Check-in, bienvenida, tier, mystery box, premio | **No** — siempre salen (W-D6) |

Error uniforme cuando no alcanza: `409` con `{ error, balanceCop, needed, shortfall, messagesAvailable }`
para que la UI diga *"te faltan $32,000 para esta campaña de 500 contactos"*, no *"error"*.

### 6.3 UI

- `src/components/dashboard/WalletCard.tsx` (nuevo) — **reemplaza a `TwilioWallet.tsx`**, que hoy le
  muestra el saldo matriz al tenant. Saldo COP, mensajes restantes, barra de consumo, últimos movimientos.
- `src/components/dashboard/SuperAdminWallets.tsx` (nuevo) — tabla de todos los tenants: saldo, consumo del
  mes, margen, último pago. Es el panel donde el operador ve **quién le debe y quién está por quedarse sin
  saldo**.

---

## 7. Bloque 3 — Recargas

### 7.1 Manual (3a)

`POST /api/admin/wallet/topup` — **solo super-admin.** Body: `{ tenantId, amountCop, notes, externalRef }`.
Inserta `topup` con `source: 'manual'` y limpia `low_balance_notified_at`.

Es literalmente el formulario donde el operador anota *"me llegaron 50,000 por Nequi, referencia
M12345"*. **Responde la pregunta original: aquí es donde se anota el depósito.**

### 7.2 Wompi (3b)

**Paquetes** (COP, en `src/constants/wallet.ts`): 50,000 · 100,000 · 200,000 · 500,000. Los mensajes de
cada paquete **se derivan** de la tarifa del tenant (W-D1), no se hardcodean.

| Endpoint | Qué hace |
|----------|----------|
| `POST /api/dashboard/wallet/checkout` | Genera la transacción Wompi para el tenant con una `reference` única. Devuelve la URL de pago. |
| `POST /api/webhook/wompi` | **Valida la firma.** Si el evento es aprobado → `recordTopup({ source: 'wompi', externalRef: <transaction.id> })`. La idempotencia la da el `UNIQUE (source, external_ref)` (W-D4), no la lógica. |

> ⚠️ **A verificar contra la documentación oficial de Wompi antes de implementar:** el nombre exacto del
> evento, el algoritmo de firma del webhook y el shape del payload. **No se codean de memoria** — este
> spec define el *flujo*, no la API de Wompi.

Seguridad del webhook: mismo patrón que
[`docs/features/delivery-webhook.md`](../../features/delivery-webhook.md) — firma obligatoria, y el
`tenant_id` se resuelve **desde la `reference` guardada**, nunca desde el body del request.

---

## 8. Bloque 4 — Avisos de saldo bajo

**Cron diario** `GET /api/cron/wallet-alerts`:

```
para cada tenant activo:
    disponibles = tenant_messages_available(tenant)
    si disponibles <= low_balance_threshold_msgs
       y low_balance_notified_at es NULL o > 72h:
           enviar plantilla 'low_balance' a owner_phone
           enviar email a owner_email
           low_balance_notified_at = now()
```

- **Plantilla Twilio nueva `low_balance`:** `{{1}}` = negocio, `{{2}}` = mensajes restantes, `{{3}}` = link
  de recarga. Requiere aprobación de Meta (~24-48h) → **se solicita al empezar el Bloque 1**, no al llegar
  al Bloque 4, para que no sea el cuello de botella.
- Sale por la **cuenta matriz** y **no se cobra** (W-D10).
- `low_balance_notified_at` se limpia en cada recarga → si recarga y vuelve a bajar, se le avisa de nuevo.
- Además, banner persistente en el dashboard del tenant mientras esté por debajo del umbral.

---

## 9. Casos borde

| Caso | Comportamiento |
|------|----------------|
| Mensaje aceptado por Twilio pero luego `undelivered` | **No se reembolsa.** Twilio ya cobró. Queda visible en `message_logs`. |
| Tenant se va a saldo negativo por transaccionales | Permitido (W-D6). Se muestra en rojo y el super-admin lo ve en su panel. |
| El operador sube la tarifa | Solo afecta a los débitos **futuros**. El histórico conserva su `unit_price_cop` (W-D7). |
| El tenant usa la cuenta matriz (sin subaccount) | **Irrelevante para el cobro.** El débito es contable y depende de `tenant_id`, no de qué credenciales Twilio se usaron. |
| Webhook de Wompi reintentado 3 veces | Una sola recarga: `UNIQUE (source, external_ref)`. |
| Webhook de status de Twilio actualiza un log ya cobrado | Un solo débito: `UNIQUE (message_log_id)`. |
| Campaña de 500 con saldo para 300 | **Se bloquea entera** (409). No se envía parcial: media campaña es peor que ninguna y deja al tenant en negativo. |

---

## 10. Pruebas

- **Trigger:** insert con `twilio_sid` → 1 débito. Update del mismo → sigue habiendo 1. Insert sin
  `twilio_sid` (opt-out) → 0 débitos. `message_type = 'low_balance'` → 0 débitos.
- **Saldo:** topup 50,000 + 3 mensajes a 100 → saldo 49,700, disponibles 497.
- **Corte:** saldo 10,000 (100 msgs) + campaña de 500 → 409 con `shortfall: 40000`. El mismo tenant hace
  check-in → **el mensaje sale igual**.
- **Idempotencia:** el mismo `external_ref` de Wompi dos veces → una sola fila.
- **Aislamiento:** un admin del tenant A pega `GET /api/admin/twilio-balance` → **403**.

---

## 11. Fuera de alcance

Facturación electrónica / DIAN · suscripciones recurrentes (todo es prepago) · multi-moneda · reventa de
saldo entre tenants · reembolsos automáticos por mensajes no entregados.

---

## 12. Orden de implementación

| # | Bloque | Por qué en este orden |
|---|--------|-----------------------|
| 1 | **Débito** (§5) | Es el cimiento. Sin saldo real no existe corte, ni aviso, ni razón para cobrar. |
| — | *Solicitar la plantilla `low_balance` a Meta* | Tarda 24-48h. Se pide **aquí** para que no bloquee el Bloque 4. |
| 2 | **Saldo visible + corte** (§6) | Cierra la fuga de dinero **y** el bug de seguridad del saldo matriz expuesto. |
| 3 | **Recarga manual** (§7.1) | Es donde se anota el depósito. Cierra el ciclo completo sin depender de terceros. |
| 4 | **Avisos** (§8) | Ya con saldo real y con la plantilla aprobada. |
| 5 | **Wompi** (§7.2) | Lo último: es una optimización del Bloque 3, no un requisito. Todo funciona sin él. |

**Con los bloques 1-3 el sistema ya es correcto y auditable.** Los bloques 4 y 5 son comodidad — el 4
para el cliente, el 5 para el operador.

---

## 13. Decisiones que necesitan tu visto bueno

| # | Decisión | Default propuesto |
|---|----------|-------------------|
| 1 | Débito por **trigger** en vez de llamada desde el código (W-D2) | Trigger |
| 2 | Tarifa como **columna** de `tenants` en vez de `config` jsonb (W-D5) | Columna |
| 3 | **Tarifa inicial** | **$100 COP/mensaje** (hoy: $70, costo: $73.5 → margen negativo) |
| 4 | Corte **mixto**: campañas sí, transaccionales no (W-D6) | Mixto |
| 5 | El histórico **no** se cobra retroactivo (W-D8) | No se cobra |
