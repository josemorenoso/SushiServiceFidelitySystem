# Resolución de la Auditoría WhatsApp 12-Julio

> **Fecha:** 2026-06-12
> **Versión:** 1.7.0
> **Alcance de esta entrega:** Bloque 1 (tareas 1-4) — resuelve de raíz el caso del cliente que gana un premio y no recibe el WhatsApp, y deja la base de tracking para los siguientes bloques.

---

## Tareas resueltas (1-4)

| # | Tarea | Estado | Archivos |
|---|-------|--------|----------|
| 1 | Quitar `.catch()` silencioso en `mystery-box/resolve` + devolver `whatsapp_sent` | ✅ | `src/app/api/mystery-box/resolve/route.ts` |
| 2 | UI de fallback en Mystery Box si el WhatsApp falla | ✅ | `src/components/features/check-in/CheckInSuccess.tsx`, `MysteryBoxResult.tsx` |
| 3 | Tabla `message_logs` para TODOS los mensajes | ✅ | `supabase/migrations/00020_message_logs.sql`, `src/types/database.types.ts` |
| 4 | Persistir cada envío en `message_logs` desde `whatsapp.service.ts` | ✅ | `src/services/whatsapp.service.ts`, `src/services/message-log.service.ts`, `src/app/api/check-in/route.ts` |

### Detalle

**Tarea 1 — Causa principal del caso.** El envío de WhatsApp en `mystery-box/resolve` usaba `.catch(err => console.error(...))`, por lo que un fallo de Twilio (variables, opt-out, número sin WhatsApp) quedaba oculto y la API respondía `ok: true`. Ahora el envío se captura en un `try/catch` explícito y la respuesta incluye:
- `whatsapp_sent: boolean`
- `whatsapp_reason?: string` (`no_template_configured` | `twilio_error_or_unconfigured` | mensaje de excepción)

**Tarea 2 — Fallback visible.** Si `whatsapp_sent=false`, tanto la card de premio seguro como `MysteryBoxResult` muestran: _"No pudimos enviarte el WhatsApp. Muestra esta pantalla al mesero para reclamar tu premio."_ El premio sigue siendo válido (ya está en `mystery_box_results`); el cliente no queda sin forma de reclamarlo. Además se oculta el texto genérico que afirmaba que el WhatsApp fue enviado.

**Tarea 3 — Tabla `message_logs`.** Persiste todos los mensajes (no solo campañas). Estados `pending/sent/delivered/failed/undelivered`. La columna `delivered_at` queda preparada para el webhook de status callback (tarea 5). Ver `docs/DB_SCHEMA.md`.

**Tarea 4 — Persistencia en el envío.** `sendTemplateMessage` acepta un `logContext` opcional (`{ customerId, messageType }`); cuando se provee, registra el intento en `message_logs` con el estado y el `error_code` de Twilio. Es retrocompatible: los callers sin `logContext` (crons, campañas, delivery) se comportan igual que antes. Quedan registrados ya: welcome, tier_unlocked, points_earned_near/far (check-in) y safe_reward/mystery_box/golden_box (mystery box).

> **Nota de migración:** ejecutar `00020_message_logs.sql` en Supabase antes/junto al deploy. Si la tabla no existe, `recordMessageLog` solo loguea el error y NO rompe el envío (best-effort).

---

## Pendiente (próximos bloques)

| # | Tarea | Bloque | DB |
|---|-------|--------|-----|
| 5 | Webhook `POST /api/webhook/twilio-status` + `statusCallback` → llena `delivered_at` | 2 | usa 00020 |
| 6 | Endpoint `/api/health` (valida Twilio + SIDs no vacíos) | 2 | No |
| 7 | Widget Dashboard: plantillas sin configurar + envíos recientes (lee `message_logs`) | 2 | No |
| 8 | Opt-out persistente (`customers.whatsapp_opt_out_at`) | 3 | Sí |
| 9 | Retry con backoff (`message_retry_queue` + cron) | 3 | Sí |
| 10 | Atomicidad en `awardPoints` (RPC) | 3 | Sí |
| 11 | Prechequeo de número / marcar 63003/63015 | 3 | Sí |
| 12 | Límite de longitud en `buildTiersRoadmap` (<1024) | 3 | No |
| 13 | Rate-limit en Redis/Upstash | 4 | No |
| 14 | Remover código legacy (`VISIT_MILESTONES`, `buildRewardHint`, tabla `rewards`) | 4 | Sí |
| 15 | Unificar documentación de plantillas | 4 | No |

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
