# Resolución de la Auditoría WhatsApp 12-Julio

> **Fecha:** 2026-06-12
> **Versión:** 1.8.0 (bloque 1-4 en 1.7.0; opt-out persistente en 1.8.0)
> **Alcance entregado:** Tareas 1-4 (tracking + fallback) y tarea 8 (opt-out persistente). El resto queda registrado abajo como pendiente.

---

## Tareas resueltas

| # | Tarea | Estado | Archivos |
|---|-------|--------|----------|
| 1 | Quitar `.catch()` silencioso en `mystery-box/resolve` + devolver `whatsapp_sent` | ✅ v1.7.0 | `src/app/api/mystery-box/resolve/route.ts` |
| 2 | UI de fallback en Mystery Box si el WhatsApp falla | ✅ v1.7.0 | `src/components/features/check-in/CheckInSuccess.tsx`, `MysteryBoxResult.tsx` |
| 3 | Tabla `message_logs` para TODOS los mensajes | ✅ v1.7.0 | `supabase/migrations/00020_message_logs.sql`, `src/types/database.types.ts` |
| 4 | Persistir cada envío en `message_logs` desde `whatsapp.service.ts` | ✅ v1.7.0 | `src/services/whatsapp.service.ts`, `src/services/message-log.service.ts`, `src/app/api/check-in/route.ts` |
| 8 | Opt-out persistente (`whatsapp_opt_out_at`) + verificación antes de enviar | ✅ v1.8.0 | `supabase/migrations/00021_customer_whatsapp_opt_out.sql`, `src/services/customer.service.ts`, `src/services/whatsapp.service.ts`, `src/app/api/webhook/twilio-incoming/route.ts` |
| 6-7 | Observabilidad de entrega (health + widget) | ✅ Ya existía | Cubierto por el panel `TwilioMessagesPanel` / `twilio-metrics` (consulta la API de Twilio en vivo). Ver nota abajo. |

**Tarea 8 — Opt-out persistente.** El webhook entrante ahora llama a `setWhatsappOptOut(phone)` cuando llega un keyword de opt-out (SALIR/STOP/BAJA…) y a `clearWhatsappOptOut(phone)` con un opt-in (ALTA/START). `sendTemplateMessage` verifica `isPhoneOptedOut(phone)` antes de enviar y omite el mensaje (lo registra en `message_logs` con `error_code='opted_out_local'`) para no malgastar envíos ni generar errores 21610. También apaga `accepts_marketing` para excluirlo de campañas.

> **Sobre tareas 6-7:** el dashboard ya tiene el panel **Mensajería WhatsApp** (`twilio-metrics`) con enviados/entregados/leídos/fallidos, desglose de fallos por código y detección de opt-outs. Cubre la *visibilidad* a nivel agregado, así que NO se reimplementan. Su límite: es consulta a la API de Twilio (máx ~90 días, sin atribución por tipo de mensaje ni lógica reactiva). Eso solo lo resolvería la tarea 5 (webhook), que queda como opcional.

### Detalle

**Tarea 1 — Causa principal del caso.** El envío de WhatsApp en `mystery-box/resolve` usaba `.catch(err => console.error(...))`, por lo que un fallo de Twilio (variables, opt-out, número sin WhatsApp) quedaba oculto y la API respondía `ok: true`. Ahora el envío se captura en un `try/catch` explícito y la respuesta incluye:
- `whatsapp_sent: boolean`
- `whatsapp_reason?: string` (`no_template_configured` | `twilio_error_or_unconfigured` | mensaje de excepción)

**Tarea 2 — Fallback visible.** Si `whatsapp_sent=false`, tanto la card de premio seguro como `MysteryBoxResult` muestran: _"No pudimos enviarte el WhatsApp. Muestra esta pantalla al mesero para reclamar tu premio."_ El premio sigue siendo válido (ya está en `mystery_box_results`); el cliente no queda sin forma de reclamarlo. Además se oculta el texto genérico que afirmaba que el WhatsApp fue enviado.

**Tarea 3 — Tabla `message_logs`.** Persiste todos los mensajes (no solo campañas). Estados `pending/sent/delivered/failed/undelivered`. La columna `delivered_at` queda preparada para el webhook de status callback (tarea 5). Ver `docs/DB_SCHEMA.md`.

**Tarea 4 — Persistencia en el envío.** `sendTemplateMessage` acepta un `logContext` opcional (`{ customerId, messageType }`); cuando se provee, registra el intento en `message_logs` con el estado y el `error_code` de Twilio. Es retrocompatible: los callers sin `logContext` (crons, campañas, delivery) se comportan igual que antes. Quedan registrados ya: welcome, tier_unlocked, points_earned_near/far (check-in) y safe_reward/mystery_box/golden_box (mystery box).

> **Nota de migración:** ejecutar en Supabase antes/junto al deploy: `00020_message_logs.sql` y `00021_customer_whatsapp_opt_out.sql`. Si `message_logs` no existe, `recordMessageLog` solo loguea el error y NO rompe el envío (best-effort). Si falta la columna `whatsapp_opt_out_at`, `isPhoneOptedOut` devuelve `false` (no bloquea envíos) y `setWhatsappOptOut` solo loguea.

---

## Pendiente (ordenado por valor neto)

> Tareas 6-7 cubiertas por el panel existente; tareas 1-4 y 8 ya entregadas. Lo que queda:

| Prioridad | # | Tarea | Por qué importa | DB |
|-----------|---|-------|-----------------|-----|
| 🟠 Media | 12 | Truncar `buildTiersRoadmap` a <1024 chars | Reduce los fallos 21656 ("contenido inválido") que ya aparecen en el panel | No |
| 🟠 Media | 10 | Atomicidad en `awardPoints` (RPC `total_points + $1`) | Cierra la race condition de puntos | Sí |
| 🟡 Baja | 9 | Retry con backoff (`message_retry_queue` + cron 15 min) | Reintenta fallos en vez de perderlos | Sí |
| 🟡 Baja | 11 | Prechequeo de número / marcar 63003/63015 | Evita reintentos a números sin WhatsApp | Sí |
| ⚪ Opcional | 5 | Webhook `POST /api/webhook/twilio-status` + `statusCallback` → llena `delivered_at` | Historial permanente (>90d) + atribución por tipo/cliente + base para retry/opt-out reactivos | usa 00020 |
| ⚪ Limpieza | 13 | Rate-limit en Redis/Upstash | Consistente entre instancias serverless | No |
| ⚪ Limpieza | 14 | Remover código legacy (`VISIT_MILESTONES`, `buildRewardHint`, tabla `rewards`) | Reduce confusión | Sí |
| ⚪ Limpieza | 15 | Unificar documentación de plantillas (deprecar `flujo-plantillas-recompensas-campanas.md`) | Una sola fuente de verdad | No |

---

## Cómo diagnosticar ahora un "no me llegó el WhatsApp"

Con `message_logs` el diagnóstico ya no depende de logs efímeros de Vercel:

```sql
-- Últimos mensajes de un cliente
SELECT created_at, message_type, status, error_code, error_message, twilio_sid
FROM message_logs
WHERE phone = '3001234567'
ORDER BY created_at DESC
LIMIT 20;
```

- `status='sent'` + `twilio_sid` → Twilio lo aceptó (la entrega real la confirmará el webhook de la tarea 5).
- `status='failed'` + `error_code` → causa exacta (21610 opt-out, 21656 formato, 63003/63015 sin WhatsApp, `twilio_not_configured`).
