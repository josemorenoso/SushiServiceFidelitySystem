# Flujo Completo: Plantillas, Recompensas y Campañas

> **Fecha:** 2026-04-15 | **Versión:** 0.19.0
> **Objetivo:** Documento operativo para entender y configurar rápido.

---

## 1. Conceptos clave

### Plantillas WhatsApp (Twilio Content API)
- Son **mensajes pre-aprobados por Meta** que puedes enviar a clientes FUERA de la ventana de 24h.
- Se crean en Dashboard > Plantillas. Twilio las envía a Meta para aprobación (puede tardar 24-48h).
- **SOLO plantillas aprobadas** se pueden usar en campañas manuales.
- Variables disponibles: `{{1}}` = nombre, `{{2}}` = visitas, `{{3}}` = hint de próxima recompensa.

### Mensajes directos (free-text)
- Solo se pueden enviar **dentro de las 24h** después de que el cliente interactúa.
- Los mensajes de **bienvenida, welcome back, y recompensa** usan mensajes directos porque se envían justo cuando el cliente escanea el QR (dentro de la ventana de 24h).
- **NO necesitan aprobación de Meta.**

### Recompensas (Rewards)
- Se configuran en Dashboard > Recompensas.
- Cada recompensa tiene: **visita #** + **premio** + **template de mensaje** (auto-generado).
- Cuando un cliente alcanza una visita milestone, el sistema AUTOMÁTICAMENTE le envía el mensaje de recompensa por WhatsApp (free-text, dentro de la ventana de 24h del check-in).

### Campañas
- **Automáticas (cron):** Birthday y Reactivación — se ejecutan diariamente sin intervención.
- **Manuales:** Creadas por el admin en Dashboard > Campañas — usan plantillas aprobadas.

---

## 2. Flujo del Check-In (lo que pasa cuando un cliente escanea el QR)

```
Cliente escanea QR → Ingresa teléfono
                        │
         ┌──────────────┴──────────────┐
         │ ¿Ya registrado?             │
         │                             │
    SÍ ──┤                       NO ──┤
         │                             │
    ┌────▼────┐                  ┌─────▼─────┐
    │ CHECKIN │                  │ REGISTER  │
    │         │                  │           │
    │ +1 visita                  │ Crea cliente
    │ ¿Rate limit?               │ +1 visita
    │ (1/día)                    │           │
    │         │                  └─────┬─────┘
    └────┬────┘                        │
         │                        WhatsApp:
    ┌────▼────┐                  "¡Bienvenido!"
    │¿Milestone│                  (free-text)
    │ de reward?│
    │          │
    ├── SÍ ───► WhatsApp: "¡Felicidades {{name}}! Visita #X,
    │            ganaste: [premio]" (free-text, template de reward)
    │
    └── NO ───► WhatsApp: "¡Hola de nuevo {{name}}!
                 Visita #X. ¡Sigue acumulando!" (free-text)
```

### Mensajes por tipo de check-in:

| Situación | Mensaje | Tipo | Template necesaria? |
|-----------|---------|------|---------------------|
| Primera vez (registro) | "¡Hola {{name}}! Bienvenido a nuestro programa..." | Free-text | NO |
| Visita normal | "¡Hola de nuevo {{name}}! Visita #X..." | Free-text | NO |
| Visita = milestone reward | "¡Felicidades {{name}}! Visita #X, ganaste: [premio]" | Free-text (auto-generado) | NO |
| Rate limit (ya vino hoy) | Se muestra en pantalla, NO envía WhatsApp | UI only | NO |

**Importante:** Todos los mensajes de check-in son **free-text** porque se envían en el momento del escaneo (dentro de la ventana 24h). No necesitan plantilla aprobada.

---

## 3. Flujo de Recompensas

### ¿Cómo configurar recompensas?

1. Ve a **Dashboard > Recompensas**
2. Click **"Nueva Recompensa"**
3. Ingresa:
   - **Visita #:** La meta (ej: 3, 6, 9, 12)
   - **Premio:** Lo que gana el cliente (ej: "Rollo California gratis")
4. El sistema **auto-genera** el mensaje de WhatsApp
5. Verás vista previa del mensaje antes de crear

### ¿Qué pasa cuando un cliente llega a la meta?

```
Cliente hace check-in → Sistema incrementa visitas → ¿total_visits == milestone?
                                                            │
                                                    SÍ ─────┤
                                                            │
                                            Envía mensaje de recompensa
                                            por WhatsApp (free-text):
                                            "¡Felicidades Juan! 🎉 Has completado
                                            tu visita #6 a Sushi Service.
                                            Te has ganado: Rollo California gratis.
                                            ¡Reclama tu premio en tu próxima visita! 🍣"
```

### ¿Qué pasa con los que están CERCA de la recompensa?

El **mensaje de welcome back** (visita normal sin recompensa) dice:
> "¡Hola de nuevo {{name}}! 😊 Visita #X. ¡Sigue acumulando para ganar premios! 🌟"

**Actualmente NO dice cuánto le falta.** Para mejorarlo, se debe modificar `sendWelcomeBackMessage` para incluir el hint de próxima recompensa. Esto es lo que vamos a mejorar.

### ¿Y en campañas manuales?

Cuando envías una campaña manual, el sistema automáticamente calcula la variable `{{3}}` como:
- Si le falta 1 visita: `"¡En tu próxima visita ganas: [premio]!"`
- Si le faltan 2+: `"En tu visita #X ganas: [premio] (te faltan Y)"`
- Si no hay más rewards: `"¡Sigue acumulando visitas para premios!"`

---

## 4. Campañas Automáticas (Cron)

### 🎂 Cumpleaños
- **Cuándo:** Todos los días a las 8AM UTC (Vercel cron)
- **A quién:** Clientes cuya fecha de cumpleaños coincide con HOY
- **Protección:** No repite si ya envió en los últimos 365 días
- **Tipo:** Transaccional (NO filtra `accepts_marketing`)
- **Mensaje actual (free-text):**
  > "¡Feliz cumpleaños {{name}}! 🎂🎉 De parte de todo nuestro equipo, te deseamos un día increíble. Pasa por el restaurante y reclama tu sorpresa de cumpleaños. ¡Te esperamos!"

**⚠️ PROBLEMA:** Este mensaje se envía como free-text. Si el cliente no ha interactuado en >24h, Meta lo rechazará. **Para cumpleaños se DEBE usar una plantilla aprobada.** Esto se debe corregir.

### 🔄 Reactivación
- **Cuándo:** Todos los días a las 10AM UTC (Vercel cron)
- **A quién:** Clientes inactivos >7 días + `accepts_marketing=true`
- **Protección:** No repite si ya envió reactivación en los últimos 30 días
- **Tipo:** Marketing (SÍ filtra `accepts_marketing`)
- **Mensaje actual (free-text):**
  > "¡Hola {{name}}! 👋 Te extrañamos en el restaurante. Ha pasado un tiempo desde tu última visita. ¡Vuelve pronto y sigue acumulando premios! Tu próxima visita te acerca más a una recompensa especial. 🌟"

**⚠️ PROBLEMA:** Mismo problema que cumpleaños — usa free-text pero estos clientes llevan >7 días sin interactuar. **Se DEBE usar plantilla aprobada.** Esto se debe corregir.

### 📢 Campañas Manuales
- **Cuándo:** Cuando el admin decide
- **A quién:** Clientes que cumplan los filtros + `accepts_marketing=true` + no recibió campaña en 7 días
- **Tipo:** Marketing
- **Usa:** Plantillas aprobadas (Content API) ✅ **Correcto**
- **Variables automáticas:** `{{1}}=nombre`, `{{2}}=visitas`, `{{3}}=hint recompensa`

---

## 5. Plantillas Recomendadas para Aprobar en Twilio

Necesitas crear y aprobar estas plantillas en **Dashboard > Plantillas**:

### Plantilla 1: Reactivación
**Nombre:** `reactivacion_nivel`
**Categoría:** MARKETING
**Cuerpo:**
```
¡Hola {{1}}! 👋 Te extrañamos en Sushi Service.

🏆 Tu nivel actual: {{2}}
🎯 Próxima meta: {{3}}

¡Vuelve y sigue subiendo de nivel! Tu próxima visita te acerca a premios exclusivos. 🍣
```

### Plantilla 2: Cumpleaños
**Nombre:** `cumpleanos_premio`
**Categoría:** UTILITY (transaccional)
**Cuerpo:**
```
¡Feliz cumpleaños {{1}}! 🎂🎉

De parte de todo el equipo de Sushi Service, te deseamos un día increíble.

🎁 Pasa hoy por el restaurante y reclama tu sorpresa de cumpleaños.

¡Te esperamos! 🍣
```

### Plantilla 3: Bienvenida nivel
**Nombre:** `bienvenida_nivel`
**Categoría:** MARKETING
**Cuerpo:**
```
¡Hola {{1}}! 🎉 Acabas de subir al nivel {{2}} en Sushi Service.

🏆 Nuevo nivel: {{2}}
📊 Visitas totales: {{3}}

¡Sigue acumulando para desbloquear beneficios exclusivos! 🍣
```

### Plantilla 4: Campaña general
**Nombre:** `promo_general`
**Categoría:** MARKETING
**Cuerpo:**
```
¡Hola {{1}}! 🍣

{{2}}

Tu nivel actual: {{3}}
¡Te esperamos en Sushi Service!
```

---

## 6. Sistema de Recompensas Recomendado

### Progresión con el nuevo sistema de niveles (Plata → Oro → Platino → Black)

| Visita # | Nivel alcanzado | Recompensa sugerida | Estrategia |
|----------|-----------------|---------------------|------------|
| 3 | 🥈 **PLATA** | 10% descuento en tu próxima visita | Primera recompensa = hook inmediato |
| 5 | (Plata) | Bebida gratis (gaseosa/té) | Mantener momentum entre niveles |
| 6 | 🥇 **ORO** | Entrada gratis (edamame/gyoza) | Celebrar el ascenso |
| 8 | (Oro) | Postre gratis | Mantener engagement |
| 9 | ⚜️ **PLATINO** | Rollo California gratis | Premio significativo por ser Platino |
| 10 | (Platino) | 2x1 en cualquier rollo | Incentivo fuerte pre-Black |
| 12 | 🖤 **BLACK** | Combo Black completo gratis + 15% descuento permanente | EL premio máximo |
| 15 | (Black) | Invita a un amigo gratis | Referral natural |
| 20 | (Black) | Experiencia chef privada / Cena especial | Exclusividad máxima |

### Reglas de oro:
1. **Visita 3 (primer nivel):** Recompensa INMEDIATA para generar dopamina. El cliente debe sentir que valió la pena volver.
2. **Entre niveles:** 1 recompensa intermedia para que no sienta que "falta mucho" para el siguiente nivel.
3. **Al subir de nivel:** Recompensa MEJOR que las intermedias. Debe sentir la diferencia.
4. **Black:** Recompensa MEMORABLE + beneficio permanente. El cliente debe sentirse VIP.
5. **Post-Black:** Recompensas de experiencia, no solo comida. Exclusividad > descuento.

### Para configurar en el sistema:
1. Dashboard > Recompensas > Nueva Recompensa
2. Crea cada una con la visita # y el premio
3. El sistema auto-genera el mensaje de WhatsApp
4. Cuando el cliente llegue a esa visita, recibe el mensaje automáticamente

---

## 7. Flujo completo resumido

```
                    ┌─────────────────────────────────┐
                    │     CONFIGURACIÓN (Admin)        │
                    │                                  │
                    │  1. Crea recompensas (visita+premio)
                    │  2. Crea plantillas (Twilio)     │
                    │  3. Configura ticket promedio     │
                    └──────────┬──────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
    ┌─────▼─────┐      ┌──────▼──────┐     ┌──────▼──────┐
    │ CHECK-IN  │      │ CRON AUTO   │     │ CAMPAÑA     │
    │ (QR scan) │      │ (diario)    │     │ MANUAL      │
    │           │      │             │     │ (admin)     │
    │ Reward?   │      │ Birthday    │     │ Plantilla   │
    │ → msg auto│      │ Reactivación│     │ aprobada    │
    │ (free-text)│      │ (plantilla) │     │ + filtros   │
    └───────────┘      └─────────────┘     └─────────────┘
```

---

## 8. Problemas conocidos a corregir

1. **Cron birthday/reactivation usan free-text** → Debe usar plantillas aprobadas (fuera de ventana 24h)
2. **Welcome back NO incluye hint de recompensa** → Agregar "¡Te falta 1 visita para [premio]!"
3. **Plantillas de Twilio requieren aprobación** → Crear las 4 plantillas recomendadas y esperar aprobación
4. **Ticket promedio:** Bug donde el valor guardado no se refleja en el dashboard (investigar)
