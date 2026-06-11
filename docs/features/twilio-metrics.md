# Feature: Dashboard de Métricas de Twilio (Mensajería WhatsApp)

**Última actualización:** 2026-06-10 (v1.5.1 — panel colapsable dentro de Métricas)

---

## Objetivo

Dar visibilidad al administrador sobre la entrega real de mensajes WhatsApp: enviados, entregados, leídos, fallidos, opt-outs y evolución temporal — sin depender de la consola de Twilio.

---

## Arquitectura

**Fuente de datos:** Twilio Messages API (`GET /2010-04-01/Accounts/{sid}/Messages.json`) consultada on-demand. **No** requiere status callbacks ni almacenamiento local — el estado (`delivered`, `read`, `failed`, `undelivered`) lo mantiene Twilio y se lee en tiempo real.

```
/dashboard (página Métricas)
  → <TwilioMessagesPanel> (colapsado tras un botón; carga diferida)
      → GET /api/dashboard/twilio-metrics?days=30   (solo al abrir por 1ª vez)
          → Twilio Messages API (hasta 5 páginas × 1000 msgs, filtro DateSent>=)
          → Supabase customers (mapeo teléfono → nombre para opt-outs)
```

> **Ubicación (v1.5.1):** la mensajería ya no es una página/nav propio. Vive como un panel colapsable al final de la página de Métricas (`/dashboard`), oculto tras un botón "Mensajería WhatsApp". La llamada a la Twilio Messages API (lenta) **solo** se dispara cuando el usuario abre el panel — no penaliza la carga del dashboard.

### Detección de Opt-Outs (doble vía)

1. **Inbound con keyword:** mensajes entrantes cuyo body coincide con los keywords del Messaging Service (`SALIR`, `STOP`, `BAJA`, etc. — ver `docs/features/twilio-opt-out.md`).
2. **Outbound rechazado:** mensajes salientes con `error_code` 21610 o 63016 (destinatario opt-out).

Se deduplica por teléfono (últimos 10 dígitos) y se cruza con `customers` para mostrar el nombre.

### Métricas calculadas

| Métrica | Cálculo |
|---------|---------|
| Enviados | Total outbound en el rango |
| Entregados | `delivered` + `read` (read implica entrega) |
| Tasa de entrega | entregados / enviados |
| Leídos | status `read` (WhatsApp read receipts) |
| Tasa de lectura | leídos / entregados |
| Fallidos | `failed` + `undelivered` |
| En tránsito | `queued` + `accepted` + `sending` + `sent` |
| Timeline | Conteo diario por estado (gráfico de área con recharts) |

### Limitaciones conocidas

- **Tasa de lectura:** solo disponible si el cliente tiene confirmaciones de lectura activas en WhatsApp; el valor real es un piso, no un techo.
- **Rango máximo 90 días, 5.000 mensajes:** si se supera, el response marca `truncated: true` y la UI lo advierte.
- **Opt-outs históricos:** solo se detectan dentro del rango consultado (Twilio no expone la lista de bloqueados vía API).

---

## API

**`GET /api/dashboard/twilio-metrics?days={7|30|90}`** — Auth: Admin Cookie (Supabase session)

Ver response completo en `docs/API_DOCS.md`.

---

## Archivos Involucrados

| Archivo | Responsabilidad |
|---------|----------------|
| `src/app/api/dashboard/twilio-metrics/route.ts` | Endpoint: fetch Twilio + agregación + opt-outs |
| `src/components/dashboard/TwilioMessagesPanel.tsx` | UI: panel colapsable (carga diferida) con KPIs, gráfico recharts, tabla opt-outs, saldo |
| `src/app/(dashboard)/dashboard/page.tsx` | Métricas: monta `<TwilioMessagesPanel>` al final |
| `src/components/dashboard/TwilioWallet.tsx` | Reusado: saldo y costo por mensaje |

---

## Pendientes / Ideas futuras

- Status callback webhook de Twilio → persistir estados en `campaign_messages` (métricas históricas sin límite de rango y atribución por campaña).
- Sincronizar opt-outs detectados → `customers.accepts_marketing = false` automático.
- Alertas si la tasa de fallos supera un umbral.
