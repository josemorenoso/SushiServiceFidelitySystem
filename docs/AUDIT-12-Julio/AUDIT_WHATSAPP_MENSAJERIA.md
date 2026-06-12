# AUDITORIA SISTEMA DE MENSAJERIA WHATSAPP

> **Fecha auditoria:** 12 de Julio de 2026
> **Auditor:** IA Cascade (modo auditoria, sin correcciones)
> **Alcance:** Todo el flujo de mensajeria Twilio/WhatsApp del sistema RestaurantQR
> **Caso pivote:** Cliente con 3 visitas, check-in QR staff_scan, recibe puntos, cruza tier Bronce, elige Mystery Box, gana premio, **NO recibe mensaje WhatsApp de confirmacion**.

---

## 1. RESUMEN EJECUTIVO

El sistema tiene **fallas estructurales de diseno** en la capa de mensajeria que explican por que un cliente puede completar todo el flujo (visita, puntos, tier, eleccion de premio) y nunca recibir el WhatsApp. Los errores no son solo "configuracion"; hay **huecos de observabilidad, ausencia de reintentos, falta de webhooks de estado, y tracking inconsistente** entre mensajes transaccionales (check-in) y mensajes de campana.

| Severidad | Hallazgo |
|-----------|----------|
| **CRITICA** | No hay webhook de status callback de Twilio. Se envian mensajes "al aire" sin saber si fueron entregados, leidos o fallaron en la red de WhatsApp. |
| **CRITICA** | Los mensajes transaccionales (check-in, welcome, mystery box) **no se persisten** en ninguna tabla. Si fallan, solo queda un `console.error` efimero en Vercel. |
| **ALTA** | No existe mecanismo de retry automatico para mensajes fallidos. |
| **ALTA** | No hay validacion previa de si un numero tiene WhatsApp activo antes de enviar. |
| **ALTA** | Opt-out (STOP/SALIR) no bloquea envios a nivel de base de datos; el sistema sigue intentando enviar a numeros que ya dieron de baja, generando errores 21610/63016. |
| **MEDIA** | `sendTemplateMessage` usa `.catch()` silencioso en `/api/mystery-box/resolve`, ocultando fallos sin alertar al admin ni al cliente. |
| **MEDIA** | Posible race condition en `awardPoints` (no atómico: SELECT -> UPDATE separados). |
| **MEDIA** | Inconsistencia de variables: algunos templates usan 3 variables, otros 4; si el admin configura mal el SID, el progressive retry de 21665 puede enviar con datos incompletos. |
| **BAJA** | El `rateLimit` es en memoria; en Vercel (serverless) no comparte estado entre instancias, permitiendo bypass teorico. |

---

## 2. ANALISIS DEL CASO ESPECIFICO: CLIENTE 3 VISITAS + MYSTERY BOX

### Flujo esperado

```
Cliente escanea QR -> Ingresa celular -> Muestra QR dinamico
  -> Mesero escanea con app -> POST /api/check-in (action=checkin, source=staff_scan)
    -> incrementVisit() -> createVisit() -> awardVisitPoints()
    -> evaluateNewTier() -> updateCustomerTier()
    -> envia WhatsApp tier_unlocked_template_sid (si esta configurado)
    -> responde JSON con tier_unlocked info

Cliente (polling /check-in/status) ve "Desbloqueaste Bronce"
  -> Elige Mystery Box en UI -> POST /api/mystery-box/resolve
    -> resolveMysteryBox() -> INSERT mystery_box_results
    -> envia WhatsApp mystery_box_result_template_sid (o golden_box_result_template_sid)
```

### Puntos de fallo en este flujo donde el WhatsApp puede perderse

> **Nota de descarte (confirmado por operaciones):** Las plantillas estan aprobadas en Twilio y los SIDs estan asignados en Dashboard > Ajustes. Por tanto, la causa "plantilla no configurada" se descarta. Las causas reales son las siguientes.

#### 2.1 Fallo en el check-in del mesero (POST /api/check-in)

**Archivo:** `src/app/api/check-in/route.ts:596-641`

```typescript
// El envio ocurre aqui:
if (newTier) {
  whatsappStatus = await sendCheckinTemplate(
    settings.tier_unlocked_template_sid,
    'tier_unlocked',
    cleaned,
    { '1': updated.name, '2': newTier.tier_name, '3': newTier.safe_reward_title, '4': tiersRoadmapText }
  )
}
```

**Problemas:**
- Si `sendTemplateMessage` falla por error de Twilio (variables mal formadas, codigo 21656, 21665, 63016, etc.), se loguea en consola y se devuelve `reason: 'twilio_error_or_unconfigured'`. No hay notificacion al dashboard ni al frontend.
- Este mensaje de "tier desbloqueado" **NO se guarda en ninguna tabla de la base de datos**. No hay rastro historico de que se intento enviar.

#### 2.2 Fallo en la resolucion de la Mystery Box (POST /api/mystery-box/resolve) — CAUSA PRINCIPAL

**Archivo:** `src/app/api/mystery-box/resolve/route.ts:88-108`

```typescript
if (choice === 'safe' && settings.reward_safe_template_sid) {
  await sendTemplateMessage(...).catch((err) => console.error('[MysteryBox] Error enviando WhatsApp safe:', err))
} else if (choice === 'mystery') {
  const templateSid = result.wasGolden ? settings.golden_box_result_template_sid : settings.mystery_box_result_template_sid
  if (templateSid) {
    await sendTemplateMessage(...)
      .catch((err) => console.error('[MysteryBox] Error enviando WhatsApp mystery:', err))
  }
}
```

**Problemas CRITICOS aqui:**
1. **`.catch()` silencioso:** Si `sendTemplateMessage` lanza una excepcion o retorna `null` (fallo de Twilio), el `.catch()` solo imprime en consola. La API responde `ok: true` al frontend como si todo hubiera funcionado. El cliente ve la animacion del premio en la web, pero **nunca se entera de que el WhatsApp fallo**.
2. **Sin tracking:** Este mensaje no se guarda en ninguna tabla. No hay forma de saber cuantos clientes eligieron mystery box y no recibieron confirmacion.

#### 2.3 Variables que pueden romper la plantilla

**Archivo:** `src/services/whatsapp.service.ts:55-59`

```typescript
const sanitize = (v: string) => v.replace(/\n/g, ' · ').replace(/\r/g, '').trim()
```

- El `roadmap` generado por `buildTiersRoadmap` contiene emojis y saltos de linea. Aunque se reemplaza `\n` por ` · `, el resultado puede superar los 1024 caracteres permitidos por Meta para una variable. Twilio devolveria error 21656 o similar.
- Si `customer.name` es `null` (raro, pero posible en datos legacy), la variable `{{1}}` seria la cadena `"null"`, lo cual Meta podria rechazar en ciertos casos.

#### 2.4 Problema de orden: Google Contacts sync despues del WhatsApp (correcto)

**Observacion positiva:** En `check-in/route.ts`, el codigo envia WhatsApp ANTES de `syncGoogleContact`. Esto es correcto: si el sync externo tarda o falla, no bloquea el mensaje al cliente. Esta bien disenado en ese aspecto.

---

## 3. AUDITORIA GENERAL DEL SISTEMA DE MENSAJERIA

### 3.1 Arquitectura de Envio

| Componente | Archivo | Rol | Estado |
|------------|---------|-----|--------|
| Cliente Twilio | `src/services/whatsapp.service.ts` | Envio via Twilio SDK + Content API | Funcional pero sin persistencia |
| Webhook entrante | `src/app/api/webhook/twilio-incoming/route.ts` | Recibe mensajes de meseros (domicilios) y auto-replies | OK |
| Webhook domicilios | `src/app/api/webhook/delivery/route.ts` | Recibe datos de n8n, crea cliente/visita, envia WhatsApp | OK, mismos riesgos que check-in |
| Check-in | `src/app/api/check-in/route.ts` | Registro + visita + puntos + WhatsApp | **Riesgo: sin tracking** |
| Mystery Box | `src/app/api/mystery-box/resolve/route.ts` | Resuelve premio + envia WhatsApp | **Riesgo: .catch silencioso** |
| Cron Cumpleanos | `src/app/api/cron/birthday/route.ts` | Busca cumpleaneros + envia plantilla | OK, guarda en campaign_messages |
| Cron Reactivacion | `src/app/api/cron/reactivation/route.ts` | Busca inactivos + envia plantilla | OK, guarda en campaign_messages |
| Campanas manuales | `src/app/api/dashboard/campaigns/manual/route.ts` | Envia campana segmentada | OK, guarda en campaign_messages |
| Eventos calendario | `src/services/calendar.service.ts` | Ejecuta evento programado | OK, guarda en campaign_messages |
| Metricas Twilio | `src/app/api/dashboard/twilio-metrics/route.ts` | Consulta historial de Twilio API | **Riesgo: consulta pasiva, no webhook** |

### 3.2 Tablas de Base de Datos Relacionadas

| Tabla | Usada para | Problema |
|-------|-----------|----------|
| `campaign_messages` | Tracking de campanas (birthday, reactivation, manual, calendar) | **NO incluye mensajes transaccionales** (check-in, welcome, mystery box) |
| `customers` | Datos del cliente + `last_campaign_at` | No tiene campo `whatsapp_opt_out` ni `last_whatsapp_error` |
| `visits` | Historial de visitas | No enlaza con mensajes enviados en esa visita |
| `mystery_box_results` | Resultados de mystery box | No tiene campo `confirmation_whatsapp_sent` |
| `point_transactions` | Puntos otorgados | No enlaza con mensajes |
| `admin_settings` | Config de template SIDs | No hay validacion de que los SIDs existen en Twilio |
| *(ausente)* | Logs de mensajes transaccionales | **NO EXISTE** |
| *(ausente)* | Webhook status callback | **NO EXISTE** |
| *(ausente)* | Tabla de opt-outs confirmados | **NO EXISTE** |

### 3.3 Variables de Entorno Criticas

| Variable | Donde se usa | Riesgo si falta |
|----------|-------------|-----------------|
| `TWILIO_ACCOUNT_SID` | `whatsapp.service.ts` | `sendTemplateMessage` retorna `null`, mensaje no enviado |
| `TWILIO_AUTH_TOKEN` | `whatsapp.service.ts`, `twilio-incoming` | Sin auth, no se envian ni se validan webhooks |
| `TWILIO_WHATSAPP_NUMBER` | `whatsapp.service.ts` | `null`, mensaje no enviado |
| `WEBHOOK_DELIVERY_SECRET` | `delivery/route.ts` | Rechaza todos los webhooks de domicilios |
| `CRON_SECRET` | `birthday`, `reactivation` | No protege los cron (aunque Vercel los llama internamente) |

**Observacion:** Si alguna de estas variables falta o es incorrecta en produccion, el sistema falla silenciosamente. No hay alerta ni health-check que valide la conectividad con Twilio al iniciar.

---

## 4. HALLAZGOS DETALLADOS POR ARCHIVO

### 4.1 `src/services/whatsapp.service.ts`

**Lineas auditadas:** 1-108

| Linea | Hallazgo | Severidad |
|-------|----------|-----------|
| 28-38 | `getTwilioClient()` retorna `null` si faltan env vars. No hay throw ni alerta. | MEDIA |
| 55-59 | Sanitizacion de `\n` a ` · ` es util, pero no protege contra strings vacios o `null`. | MEDIA |
| 66-105 | Progressive retry por error 21665 es inteligente, pero si reduce variables a 1, el mensaje pierde contexto (ej: solo envia nombre, sin puntos ni premio). | MEDIA |
| 88-103 | Logueo de errores de Twilio con codigo y status es bueno, pero va a stdout. En Vercel, esto desaparece tras el cold-start. | ALTA |
| Global | No hay `statusCallback` en `client.messages.create`. Twilio nunca notificara entrega/fallo real. | **CRITICA** |

### 4.2 `src/app/api/check-in/route.ts`

**Lineas auditadas:** 1-717

| Linea | Hallazgo | Severidad |
|-------|----------|-----------|
| 93-115 | `sendCheckinTemplate` retorna status detallado, pero solo se usa para incluirlo en el JSON de respuesta. No se persiste. | MEDIA |
| 379-393 | Welcome WhatsApp en registro nuevo: si `pendingStaffScan=true`, NO se envia welcome. Eso es correcto por diseno, pero el mesero debe saber que tiene que escanear para que el cliente reciba su primer mensaje. | BAJA |
| 596-641 | Envio de WhatsApp para tier desbloqueado / puntos / welcome. Todo `best-effort`. Si falla, el cliente sigue viendo la UI de exito. | ALTA |
| 643-654 | `syncGoogleContact` despues del WhatsApp. Orden correcto. | Positivo |

### 4.3 `src/app/api/mystery-box/resolve/route.ts`

**Lineas auditadas:** 1-136

| Linea | Hallazgo | Severidad |
|-------|----------|-----------|
| 54-62 | Valida que cliente tiene puntos suficientes, pero **no valida que el tier no haya sido ya reclamado** por este cliente. | MEDIA |
| 88-94 | Envio safe: `.catch()` silencioso. Si falla, la API responde `ok: true` de todos modos. | **CRITICA** |
| 95-108 | Envio mystery/golden: `.catch()` silencioso. Mismo problema. | **CRITICA** |
| 110-127 | La respuesta JSON no incluye ningun campo sobre el estado del envio de WhatsApp. | ALTA |

### 4.4 `src/app/api/webhook/delivery/route.ts`

**Lineas auditadas:** 1-248

| Linea | Hallazgo | Severidad |
|-------|----------|-----------|
| 34-49 | `sendDeliveryTemplate` ignora el valor de retorno de `sendTemplateMessage`. No sabe si fallo. | MEDIA |
| 141-147 | Welcome bonus para nuevos clientes domicilio: si falla, se loguea pero continua. | BAJA |
| 155-163 | `awardVisitPoints` para existentes: si falla, usa fallback 0 puntos. Eso es correcto para no romper el flujo, pero el cliente no recibe puntos ni mensaje de puntos. | MEDIA |
| 182-210 | Logica de envio de WhatsApp para domicilio: no hay `else` si `targetSid` es undefined (ya hay un log de warning en linea 208). | BAJA |

### 4.5 `src/services/points.service.ts`

**Lineas auditadas:** 1-257

| Linea | Hallazgo | Severidad |
|-------|----------|-----------|
| 117-167 | `awardPoints` no es atómico. Hace SELECT de `total_points`, luego UPDATE. En escenarios de concurrencia (raro pero posible si dos meseros escanean el mismo QR casi simultaneamente), podria perderse una transaccion. | MEDIA |
| 173-209 | `awardVisitPoints` lee `currentPoints` de la DB en lugar de usar el parametro. Eso es robusto, pero significa que si `awardPoints` fallo por race condition, este metodo lee datos inconsistentes. | BAJA |
| 214-233 | `awardWelcomeBonus` usa `getPointsConfig()` que lee de `admin_settings`. Si la DB tiene latencia, esto anade tiempo al request de registro. | BAJA |

### 4.6 `src/services/campaign.service.ts`

**Lineas auditadas:** 1-346

| Linea | Hallazgo | Severidad |
|-------|----------|-----------|
| 86-108 | `hasRecentCampaignMessage` usa join con `campaigns` por tipo. Funciona correctamente. | Positivo |
| 221-255 | `getCustomersAtMonthlyCap` cuenta mensajes `sent` del mes. No cuenta los mensajes transaccionales (bienvenida, check-in, mystery box) porque no estan en `campaign_messages`. Esto es correcto por diseno, pero significa que un cliente podria recibir 3 campanas + N mensajes transaccionales. | BAJA (por diseno) |

### 4.7 `src/app/api/cron/reactivation/route.ts`

**Lineas auditadas:** 1-260

| Linea | Hallazgo | Severidad |
|-------|----------|-----------|
| 114-170 | Pass 1 (suave): si `sendTemplateMessage` retorna `null`, se marca como `failed` en `campaign_messages`. Bien. | Positivo |
| 176-223 | Pass 2 (agresiva): si `aggressiveSid` esta definido pero `aggressiveRewardTitle` no, igual envia con {{1}},{{2}},{{3}}. La variable {{4}} solo se anade si existe. Bien. | Positivo |
| 225 | `updateCustomerLastCampaignAt` solo actualiza clientes a los que se les envio con exito (`sent`). Bien. | Positivo |

### 4.8 `src/app/api/cron/birthday/route.ts`

**Lineas auditadas:** 1-110

| Linea | Hallazgo | Severidad |
|-------|----------|-----------|
| 46 | Proteccion de 365 dias: `hasRecentCampaignMessage(customer.id, 'birthday', 365)`. Esto evita enviar dos mensajes en anios bisiestos? Si el cumpleanos es 29-feb, no se enviaria en anios no bisiestos. Edge case. | BAJA |
| 51 | `buildTiersRoadmap` puede generar texto largo. Twilio limita variables a 1024 caracteres. Si el restaurante tiene 10+ tiers, el roadmap podria excederse. | MEDIA |

### 4.9 `src/app/api/webhook/twilio-incoming/route.ts`

**Lineas auditadas:** 1-167

| Linea | Hallazgo | Severidad |
|-------|----------|-----------|
| 84-86 | Manejo defensivo de STOP/START/SALIR. Devuelve 200. Esto evita que Twilio reintente. | Positivo |
| 129-157 | Cooldown de 4 horas para auto-replies. Bien pensado. | Positivo |
| 92-127 | Forwarding a n8n para meseros autorizados. Si `n8nUrl` no esta configurado, responde con error visible al mesero. | Positivo |
| Global | **No actualiza ningun campo en `customers`** cuando detecta un opt-out por keyword. El webhook ignora el mensaje, pero no marca al cliente como "no enviar mas". | **CRITICA** |

---

## 5. PROBLEMAS DE SEGURIDAD Y CONFIGURACION

### 5.1 Sin validacion de numero WhatsApp

Antes de enviar una plantilla, el sistema no verifica si el numero destino tiene Whats Business API activo. Twilio eventualmente fallara con codigos como 63003 (no tiene WhatsApp), 63015 (no registrado), o 21610 (opt-out). Estos errores se loguean pero no se actua sobre ellos.

**Recomendacion:** Implementar prechequeo con Twilio Lookup API (caracteristica "whatsapp" disponible en algunos mercados) o al menos capturar y marcar los errores 63003/63015 para no reintentar a esos numeros.

### 5.2 Opt-out sin persistencia

El webhook entrante maneja palabras clave de opt-out pero no guarda el estado. Twilio Messaging Service SI maneja opt-out a nivel de numero (bloquea envios futuros), pero el sistema propio no lo sabe. Esto causa:
- El dashboard muestra al cliente como "activo" aunque Twilio lo bloqueara.
- Las metricas internas (`twilio-metrics`) detectan opt-outs por error_code, pero es reactivo, no preventivo.
- Si se migra a otro proveedor o se cambia el numero de Twilio, los opt-outs se pierden.

### 5.3 Webhook de delivery status ausente

Twilio puede enviar webhooks cuando un mensaje cambia de estado: `queued` -> `sent` -> `delivered` -> `read` (o `failed`/`undelivered`). El sistema **no tiene endpoint para recibir estos eventos**.

Consecuencias:
- `campaign_messages.status` nunca pasa de `sent` a `delivered`.
- No se sabe cuantas horas despues de "enviado" realmente llego.
- No se puede implementar logica de "si no se entrego en 24h, reintentar".
- El dashboard de metricas (`twilio-metrics`) tiene que hacer polling a la API de Twilio, lo cual es lento y limitado a 30 dias.

### 5.4 Secrets sin rotacion ni health-check

Las variables `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` se leen en cada request. No hay un endpoint `/health` que valide que Twilio responde correctamente con esas credenciales.

---

## 6. RIESGOS DE RENDIMIENTO Y ESCALABILIDAD

### 6.1 Google Contacts sync bloqueante

En `check-in/route.ts` y `delivery/route.ts`, `syncGoogleContact` se hace con `await` (aunque tiene timeout de 10s). Si n8n esta lento, esto retrasa la respuesta al cliente y al mesero. El comentario dice "Vercel mata fire-and-forget", por eso se hizo await. Esto es un trade-off conocido pero problematico.

### 6.2 Consulta de tiers repetida

`buildTiersRoadmap` se llama multiples veces en el mismo request (check-in, mystery box, etc.) y cada vez hace `getAllTiers()` que consulta la DB. No hay cache en memoria para los tiers. Con pocos tiers (4) es insignificante, pero con muchos restaurantes o tiers podria sumar.

### 6.3 Rate limit en memoria

`src/lib/rate-limit.ts` usa un `Map` en memoria. En Vercel, cada serverless function es una instancia separada. Un atacante podria distribuir requests entre multiples IPs/headers para bypass parcial del rate limit. Para el volumen actual (~100 check-ins/dia/restaurante) es aceptable, pero no escala.

---

## 7. INCONSISTENCIAS Y DEDOS DE CODIGO MUERTO

### 7.1 Documentacion desactualizada

- `docs/features/flujo-plantillas-recompensas-campanas.md` (v0.23.0) aun describe el sistema antiguo basado en `visit_milestone` y recompensas por visita, no por puntos. Las variables descritas en ese doc no coinciden con las actuales (p. ej., ya no existe `welcome_back_near_template_sid` en el codigo actual de check-in; ahora es `points_earned_near_template_sid`).
- `docs/PLANTILLAS.md` (v1.0.2) SI esta actualizado, pero hay dos documentos coexistiendo con informacion contradictoria.

### 7.2 Codigo legacy no removido

- `src/services/reward.service.ts` tiene funciones `@deprecated` (`buildRewardHint`) pero siguen siendo usadas por `reactivation/route.ts` en modo `legacy`.
- `src/constants/rewards.ts` define `VISIT_MILESTONES` como `@deprecated` pero sigue exportandose.
- `rewards` tabla sigue existiendo con `visit_milestone` aunque el sistema principal usa `reward_tiers`.

### 7.3 Comentarios de codigo en desuso

En `check-in/route.ts` hay un bloque grande comentado (lineas 191-226) sobre geolocalizacion. Esto genera ruido y confusion.

---

## 8. RECOMENDACIONES (SIN IMPLEMENTAR)

> Nota del auditor: Estas son recomendaciones de diseno para corregir los hallazgos. No se implementaran en esta auditoria.

### 8.1 Inmediatas (Resuelven el caso del cliente)

1. **Agregar tabla `message_logs`** (o `whatsapp_logs`) para TODOS los mensajes, no solo campanas:
   - `id`, `customer_id`, `message_type` (welcome, checkin, tier_unlocked, mystery_box, safe, golden, birthday, reactivation, manual, event), `template_sid`, `variables` (jsonb), `status` (pending, sent, delivered, failed, undelivered), `twilio_sid`, `error_code`, `error_message`, `sent_at`, `delivered_at`, `created_at`.
   - Esto permite auditar por que un cliente no recibio un mensaje.

2. **Eliminar `.catch()` silencioso** en `/api/mystery-box/resolve/route.ts`:
   - Usar `try/catch` que guarde el fallo en `message_logs`.
   - Responder al frontend con un campo `whatsapp_sent: boolean` para que la UI pueda mostrar "Tu premio es X. (No pudimos enviarte el WhatsApp, muestra esta pantalla al mesero)".

3. **Webhook de status callback**:
   - Crear `POST /api/webhook/twilio-status`.
   - Registrar en `message_logs` cuando Twilio notifique `delivered`, `failed`, `undelivered`, `read`.
   - Configurar `statusCallback` en `client.messages.create`.

4. **Validar templates configurados**:
   - Endpoint `/api/health` que valide que todos los `*_template_sid` en `admin_settings` corresponden a plantillas aprobadas en Twilio (o al menos que no estan vacios).
   - Dashboard widget que muestre "X plantillas pendientes de configurar".

### 8.2 Medio plazo

5. **Manejo de opt-out persistente:**
   - Agregar columna `customers.whatsapp_opt_out_at` (timestamp).
   - Actualizar desde webhook entrante cuando se detecte keyword de opt-out.
   - Verificar antes de cada envio.

6. **Retry automatico con backoff:**
   - Cola de mensajes fallidos (podria ser una tabla `message_retry_queue` con `retry_at`, `attempts`).
   - Cron cada 15 minutos que reintente mensajes `failed` con `attempts < 3`.

7. **Prechequeo de numero WhatsApp:**
   - Antes del primer envio a un numero nuevo, usar Twilio Lookup (si el plan lo permite) o capturar errores 63003/63015 y marcar el numero como invalido.

8. **Atomicidad en puntos:**
   - Usar RPC de Supabase o transaccion SQL para `UPDATE customers SET total_points = total_points + $1` en lugar de SELECT + UPDATE separados.

### 8.3 Largo plazo

9. **Migrar rate-limit a Redis/Upstash** para que sea consistente entre instancias.
10. **Unificar documentacion:** Deprecar `flujo-plantillas-recompensas-campanas.md` o actualizarlo para que coincida con v1.0.3+.
11. **Remover codigo legacy** (`reward.service.ts` funciones deprecadas, `VISIT_MILESTONES`, campos legacy de `rewards`).

---

## 9. CONCLUSION

El sistema **funciona correctamente en el camino feliz**, pero esta disenado con una filosofia `best-effort` que asume que si un mensaje de WhatsApp falla, no es grave. Para un restaurante, **el WhatsApp es el recibo del cliente**. Si un cliente gana un premio y no recibe el mensaje, no puede reclamarlo. Esto genera friccion en el punto de venta, confusion del mesero, y mala experiencia.

El caso reportado (cliente 3 visitas + mystery box sin WhatsApp) es **altamente reproducible** bajo estas condiciones (confirmado: plantillas SI estan configuradas y aprobadas):
- Twilio rechaza el envio por error de variables (roadmap demasiado largo, error 21656) o error 21665 (count mismatch), y el `.catch()` lo oculta.
- Twilio acepta el envio pero WhatsApp/Meta lo rechaza despues (numero sin WhatsApp, bloqueado, opt-out). Como no hay webhook de status, nunca se detecta.
- Race condition: dos procesos simultaneos tocan el mismo cliente y uno de los envios se pierde.

> **Nota:** La causa "plantilla no configurada" se descarta por confirmacion directa del equipo de operaciones. Los SIDs estan asignados en Dashboard > Ajustes.

**Severidad global del subsistema de mensajeria:** **ALTA**. Requiere intervencion de arquitectura para ser confiable en produccion.

---

*Fin del informe de auditoria.*
