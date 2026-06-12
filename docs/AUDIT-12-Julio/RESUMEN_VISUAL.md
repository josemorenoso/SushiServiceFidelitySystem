# Resumen Visual — Auditoria WhatsApp 12-Julio

> Este documento resume los hallazgos clave de forma rapida y visual para que el equipo de operaciones y dev puedan actuar sin leer el audit completo.

---

## El Caso: Cliente 3 Visitas + Mystery Box = Sin WhatsApp

```
[Cliente escanea QR] -> [Mesero escanea QR del cliente]
  -> [POST /api/check-in] -> Visita registrada -> Puntos otorgados
    -> [Evalua tier] -> Cruza Bronce (150 pts) -> WhatsApp tier_unlocked (opcional)
      -> [Cliente elige Mystery Box en la web]
        -> [POST /api/mystery-box/resolve] -> Premio calculado -> DB insert
          -> [ENVIA WHATSAPP] ----> ??? FALLA AQUI ???
            -> [Cliente nunca recibe confirmacion]
```

### Por que falla el WhatsApp en este flujo (top 3 razones)

> **Descartado por operaciones:** Las plantillas estan aprobadas y los SIDs asignados en Dashboard. No es un problema de configuracion.

| # | Razon | Probabilidad | Quien lo nota |
|---|-------|--------------|---------------|
| 1 | **Twilio rechaza el envio** (variables mal — roadmap muy largo >1024 chars, error 21656/21665) y el `.catch()` en mystery-box/resolve lo oculta | **Alta** | Nadie. La API responde `ok: true`. Solo queda log efimero de Vercel. |
| 2 | **El mensaje sale de Twilio pero WhatsApp/Meta lo rechaza despues** (numero sin WhatsApp, bloqueado, opt-out). No hay webhook de status callback, nunca se detecta | Media | Solo si revisas Twilio Metrics dias despues. |
| 3 | **Race condition en puntos** (`awardPoints` no es atomico). Dos procesos simultaneos tocan el mismo cliente y uno de los envios se pierde | Baja-Media | Dificil de detectar sin logs de transacciones. |

---

## Mapa de Calor: Donde se pierden mensajes

| Fuente del mensaje | Guardado en DB? | Sabes si llego? | Puedes reintentar? | Riesgo |
|--------------------|-----------------|-----------------|--------------------|--------|
| Bienvenida (registro nuevo) | NO | NO | NO | 🔴 Alto |
| Puntos ganados (check-in) | NO | NO | NO | 🔴 Alto |
| Tier desbloqueado | NO | NO | NO | 🔴 Alto |
| Mystery Box resultado | NO | NO | NO | 🔴 **Critico** |
| Golden Box resultado | NO | NO | NO | 🔴 **Critico** |
| Premio seguro (safe) | NO | NO | NO | 🔴 Alto |
| Cumpleanos (cron) | SI (campaign_messages) | Parcial (status sent/failed) | NO | 🟡 Medio |
| Reactivacion (cron) | SI (campaign_messages) | Parcial | NO | 🟡 Medio |
| Campana manual | SI (campaign_messages) | Parcial | NO | 🟡 Medio |
| Evento calendario | SI (campaign_messages) | Parcial | NO | 🟡 Medio |

**Leyenda:**
- 🔴 = Mensaje enviado "al aire". Si falla, se pierde para siempre. No hay rastro.
- 🟡 = Se guarda si se "intento" enviar, pero no se sabe si realmente llego al telefono.

---

## Los 4 Problemas Estructurales

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. NO HAY WEBHOOK DE STATUS CALLBACK                            │
│    Twilio envia el mensaje y "ojala llegue".                    │
│    Nunca sabes si fue entregado, leido, o fallo en la red.      │
└─────────────────────────────────────────────────────────────────┘
                              |
┌─────────────────────────────────────────────────────────────────┐
│ 2. MENSAJES TRANSACCIONALES NO SE GUARDAN EN LA BASE DE DATOS   │
│    Solo las campanas (cumpleanos, reactivacion, manual)         │
│    tienen tabla campaign_messages.                               │
│    Check-in, welcome, mystery box: NADA.                       │
└─────────────────────────────────────────────────────────────────┘
                              |
┌─────────────────────────────────────────────────────────────────┐
│ 3. NO HAY RETRY AUTOMATICO                                      │
│    Si Twilio falla una vez, no se reintenta.                     │
│    El cliente queda sin mensaje sin remedio.                     │
└─────────────────────────────────────────────────────────────────┘
                              |
┌─────────────────────────────────────────────────────────────────┐
│ 4. OPT-OUT NO SE PERSISTE                                       │
│    Si un cliente responde "SALIR", Twilio lo bloquea,           │
│    pero tu base de datos no lo sabe.                            │
│    Sigues intentando enviar y generando errores.                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Checklist de Diagnostico Inmediato (para el caso concreto)

Si un cliente reporto "no me llego el WhatsApp", verifica en este orden:

> **Paso 0 (descartado):** Las plantillas estan aprobadas y asignadas en Dashboard > Ajustes. No perder tiempo aqui.

- [ ] **Twilio Console > Messaging > Logs:** Busca el numero del cliente en la fecha/hora del evento. Que dice el log?
  - `accepted` / `sent` → Twilio lo acepto. Si no hay `delivered` despues, el problema es en la red de WhatsApp (numero sin WhatsApp, bloqueado, opt-out).
  - `failed` / `undelivered` → Twilio rechazo el envio. Anota el `error_code`.
- [ ] **Vercel Logs (tiempo real):** Busca `[WhatsApp] FALLO envio template` o `[MysteryBox] Error enviando WhatsApp`. Esto confirma si el fallo fue en el envio (error visible) o si paso silencioso (`.catch()` oculto).
- [ ] **Base de datos:** Revisa `mystery_box_results` para ver si el premio si se registro (la DB funciona, falta el WhatsApp). Tambien revisa `point_transactions` para confirmar que los puntos se otorgaron.
- [ ] **Pregunta al cliente:** El numero que registraste, tiene WhatsApp activo? No fue cambiado o dado de baja? Alguna vez respondio "SALIR" o "STOP"?

---

## Cuanto afecta esto al negocio

| Impacto | Descripcion |
|---------|-------------|
| **Reclamaciones en caja** | Cliente gano premio pero no tiene WhatsApp para mostrar. El mesero debe creerle o buscar en el sistema. |
| **Perdida de confianza** | Cliente siente que "el sistema no funciona". Baja engagement. |
| **Metricas enganosas** | Dashboard muestra "X mystery boxes abiertas" pero no sabe cuantos WhatsApp fallaron. La tasa de redencion real es menor. |
| **Costo oculto** | Mensajes fallidos por opt-out o numeros invalidos siguen consumiendo requests (y potencialmente costo) sin resultado. |

---

## Proximos pasos sugeridos (prioridad)

1. **Hoy:** Revisar Dashboard > Ajustes y asegurar que todos los `*_template_sid` estan llenos.
2. **Esta semana:** Crear tabla de logs de mensajes transaccionales (ver `AUDIT_WHATSAPP_MENSAJERIA.md` seccion 8.1).
3. **Este mes:** Implementar webhook de status callback de Twilio.
4. **Este mes:** Agregar manejo visible de fallo en la UI de Mystery Box ("No pudimos enviarte el WhatsApp, muestra esta pantalla al mesero").

---

*Generado por auditoria automatica 12-Julio-2026.*
