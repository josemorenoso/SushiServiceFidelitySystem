# Flujo Completo: Plantillas, Recompensas y Campañas

> **Fecha:** 2026-04-16 | **Versión:** 0.21.0
> **Objetivo:** Documento operativo para entender y configurar rápido.

---

## 1. Conceptos clave

### ⚠️ REGLA FUNDAMENTAL: Solo plantillas aprobadas

**NO existe ventana de 24h en este sistema.** La ventana de 24h de WhatsApp Business solo se abre cuando el CLIENTE envía un mensaje al número del negocio. En nuestro flujo, el cliente escanea un QR y registra datos en un formulario web — **nunca envía un mensaje de WhatsApp**.

Por tanto: **TODOS los mensajes de WhatsApp (bienvenida, welcome back, recompensa, cumpleaños, reactivación, campañas) DEBEN usar plantillas aprobadas por Meta vía Twilio Content API.**

Si una plantilla no está configurada para un tipo de mensaje, ese mensaje simplemente NO se envía (se loguea advertencia).

### Plantillas WhatsApp (Twilio Content API)
- Son **mensajes pre-aprobados por Meta**.
- Se crean en Dashboard > Plantillas. Twilio las envía a Meta para aprobación (24-48h).
- Se asignan a cada tipo de mensaje en Dashboard > Ajustes.

### Mapeo estándar de variables

| Tipo de mensaje | Variable {{1}} | Variable {{2}} | Variable {{3}} |
|----------------|----------------|----------------|----------------|
| **welcome** (registro) | nombre | — | — |
| **welcome_back** (visita) | nombre | total visitas | hint próxima recompensa |
| **reward** (milestone) | nombre | total visitas | nombre del premio |
| **birthday** (cron) | nombre | — | — |
| **reactivation** (cron) | nombre | total visitas | hint próxima recompensa |
| **campaign** (manual) | nombre | total visitas | hint próxima recompensa |

**Al crear plantillas en Twilio, usa `{{1}}`, `{{2}}`, `{{3}}` sabiendo qué valor tendrá cada una.**

### Recompensas (Rewards)
- Se configuran en Dashboard > Recompensas.
- Cada recompensa tiene: **visita #** + **premio**.
- Cuando un cliente alcanza un milestone, el sistema envía la plantilla `reward` con `{{3}}=nombre del premio`.

### Campañas
- **Automáticas (cron):** Birthday y Reactivación — requieren plantilla configurada en Ajustes.
- **Manuales:** Dashboard > Campañas — plantilla aprobada + filtros de segmentación.
- **Black exclusivas:** Preset predefinido para clientes con 10+ visitas.

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
         │                        WhatsApp PLANTILLA:
    ┌────▼────┐                  welcome_template_sid
    │¿Milestone│                  {{1}}=nombre
    │ de reward?│
    │          │
    ├── SÍ ───► WhatsApp PLANTILLA: reward_template_sid
    │            {{1}}=nombre, {{2}}=visitas, {{3}}=premio
    │
    └── NO ───► WhatsApp PLANTILLA: welcome_back_template_sid
                 {{1}}=nombre, {{2}}=visitas, {{3}}=hint recompensa
```

### Mensajes por tipo de check-in:

| Situación | Plantilla en Ajustes | Variables |
|-----------|---------------------|-----------|
| Primera vez (registro) | `welcome_template_sid` | {{1}}=nombre |
| Visita normal | `welcome_back_template_sid` | {{1}}=nombre, {{2}}=visitas, {{3}}=hint |
| Visita = milestone reward | `reward_template_sid` | {{1}}=nombre, {{2}}=visitas, {{3}}=premio |
| Rate limit (ya vino hoy) | No envía — solo UI | — |

**Si la plantilla no está configurada en Ajustes, el mensaje NO se envía** (se loguea warning).

---

## 3. Flujo de Recompensas

### ¿Cómo configurar recompensas?

1. Ve a **Dashboard > Recompensas**
2. Click **"Nueva Recompensa"**
3. Ingresa:
   - **Visita #:** La meta (ej: 3, 6, 9, 12)
   - **Premio:** Lo que gana el cliente (ej: "Rollo California gratis")
4. El sistema auto-genera el mensaje para preview, pero el envío real usa la plantilla `reward_template_sid`.

### ¿Qué pasa cuando un cliente llega a la meta?

```
Cliente hace check-in → Sistema incrementa visitas → ¿total_visits == milestone?
                                                            │
                                                    SÍ ─────┤
                                                            │
                                            Lee reward_template_sid de Ajustes
                                            Envía plantilla con:
                                            {{1}}=nombre, {{2}}=visitas, {{3}}=premio
```

### Hint de próxima recompensa

El **mensaje de welcome back** incluye un hint automático en `{{3}}`:
- Si le falta 1 visita: `"¡En tu próxima visita ganas: [premio]!"`
- Si le faltan 2+: `"En tu visita #X ganas: [premio] (te faltan Y)"`
- Si no hay más rewards: `"¡Sigue acumulando visitas para premios!"`

Este mismo hint se usa en campañas manuales y reactivación.

---

## 4. Campañas Automáticas (Cron)

### 🎂 Cumpleaños
- **Cuándo:** Todos los días a las 8AM UTC (Vercel cron)
- **A quién:** Clientes cuya fecha de cumpleaños coincide con HOY
- **Protección:** No repite si ya envió en los últimos 365 días
- **Tipo:** Transaccional (NO filtra `accepts_marketing`)
- **Plantilla:** `birthday_template_sid` (configurar en Ajustes)
- **Variables:** `{{1}}=nombre`
- **Sin plantilla configurada:** NO envía, retorna error indicando que falta configurar

### 🔄 Reactivación
- **Cuándo:** Todos los días a las 10AM UTC (Vercel cron)
- **A quién:** Clientes inactivos >7 días + `accepts_marketing=true`
- **Protección:** No repite si ya envió reactivación en los últimos 30 días
- **Tipo:** Marketing (SÍ filtra `accepts_marketing`)
- **Plantilla:** `reactivation_template_sid` (configurar en Ajustes)
- **Variables:** `{{1}}=nombre, {{2}}=visitas, {{3}}=hint recompensa`
- **Sin plantilla configurada:** NO envía, retorna error

### 📢 Campañas Manuales
- **Cuándo:** Cuando el admin decide
- **A quién:** Clientes que cumplan los filtros + `accepts_marketing=true` + no recibió campaña en 7 días
- **Tipo:** Marketing
- **Usa:** Plantilla seleccionada por el admin al crear la campaña
- **Variables automáticas:** `{{1}}=nombre`, `{{2}}=visitas`, `{{3}}=hint recompensa`

### 👑 Campañas Exclusivas Black
- Preset predefinido en campañas manuales: **"Exclusiva Black"**
- Filtra automáticamente: `minVisits=10` (solo clientes Black)
- Usa la plantilla que el admin seleccione

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
                    │  3. Asigna plantillas en Ajustes │
                    │  4. Configura ticket promedio     │
                    └──────────┬──────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
    ┌─────▼─────┐      ┌──────▼──────┐     ┌──────▼──────┐
    │ CHECK-IN  │      │ CRON AUTO   │     │ CAMPAÑA     │
    │ (QR scan) │      │ (diario)    │     │ MANUAL      │
    │           │      │             │     │ (admin)     │
    │ Reward?   │      │ Birthday    │     │ Plantilla   │
    │ → PLANTILLA│     │ Reactivación│     │ aprobada    │
    │ aprobada  │      │ (PLANTILLA) │     │ + filtros   │
    └───────────┘      └─────────────┘     └─────────────┘

    TODOS los mensajes usan PLANTILLAS APROBADAS.
    Sin plantilla = no se envía mensaje.
```

---

## 8. Configuración necesaria en Dashboard > Ajustes

| Key en admin_settings | Tipo de mensaje | Variables |
|----------------------|-----------------|-----------|
| `welcome_template_sid` | Bienvenida (registro nuevo) | {{1}}=nombre |
| `welcome_back_template_sid` | Bienvenido de vuelta | {{1}}=nombre, {{2}}=visitas, {{3}}=hint |
| `reward_template_sid` | Recompensa (milestone) | {{1}}=nombre, {{2}}=visitas, {{3}}=premio |
| `birthday_template_sid` | Cumpleaños (cron) | {{1}}=nombre |
| `reactivation_template_sid` | Reactivación (cron) | {{1}}=nombre, {{2}}=visitas, {{3}}=hint |

### Problemas resueltos (v0.21.0)
1. ~~Cron birthday/reactivation usan free-text~~ → ✅ Ahora usan plantillas, sin fallback free-text
2. ~~Welcome back NO incluye hint de recompensa~~ → ✅ Incluye hint en {{3}}
3. ~~Check-in usa free-text~~ → ✅ Todos los mensajes usan plantillas
4. ~~No hay campañas Black~~ → ✅ Preset "Exclusiva Black" en campañas manuales
