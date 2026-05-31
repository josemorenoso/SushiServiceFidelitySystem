# Flujo Completo: Plantillas, Recompensas y Campañas

> **Fecha:** 2026-05-07 | **Versión:** 0.23.0
> **Objetivo:** Documento operativo para entender y configurar rápido.

> **Cambios v0.23.0:** Plantillas WhatsApp granulares.
> - Welcome Back se divide en `near` (faltan 1) y `far` (faltan ≥2).
> - Reactivación se divide en `with_reward` y `no_reward`.
> - `{{3}}` ahora siempre es **título del premio** (no una frase). La plantilla controla el texto.
> - `rewards.visit_milestone` es nullable (recompensas sólo para reactivación/campañas).
> - Campañas manuales aceptan `rewardId` ('auto' | uuid | 'none').

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

### Mapeo estándar de variables (v0.23.0)

| Tipo de mensaje | {{1}} | {{2}} | {{3}} |
|----------------|--------|--------|--------|
| **welcome** (registro nuevo) | nombre | — | — |
| **welcome_back_near** (faltan 1 al premio) | nombre | total visitas | título próximo premio |
| **welcome_back_far** (faltan ≥2 al premio) | nombre | total visitas | título próximo premio |
| **reward** (milestone alcanzado) | nombre | total visitas | título del premio ganado |
| **birthday** (cron) | nombre | — | — |
| **reactivation_no_reward** (cron, sin regalo) | nombre | — | — |
| **reactivation_with_reward** (cron, con regalo fijo) | nombre | — | título del premio |
| **campaign** (manual, modo `auto`) | nombre | total visitas | título próximo premio del cliente |
| **campaign** (manual, modo `uuid`) | nombre | total visitas | título de un premio fijo elegido |
| **campaign** (manual, modo `none`) | nombre | total visitas | — |

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

## 8. Configuración necesaria en Dashboard > Ajustes (v1.1.9)

| Key en admin_settings | Tipo de mensaje | Variables |
|----------------------|-----------------|-----------|
| `welcome_template_sid` | Bienvenida (registro nuevo) | {{1}}=nombre, {{2}}=puntos iniciales, {{3}}=roadmap tiers |
| `birthday_template_sid` | Cumpleaños (cron) | {{1}}=nombre, {{2}}=puntos actuales |
| `reactivation_no_reward_template_sid` | Reactivación SIN regalo (suave 21d) | {{1}}=nombre, {{2}}=puntos actuales, {{3}}=próximo tier |
| `reactivation_with_reward_template_sid` | Reactivación CON regalo | {{1}}=nombre, {{3}}=título premio fijo |
| `reactivation_aggressive_template_sid` | Reactivación AGRESIVA (25d+) | {{1}}=nombre, {{2}}=puntos actuales, {{3}}=próximo tier |
| `reactivation_reward_id` | UUID del reward fijo para reactivación | — |
| `points_earned_far_template_sid` | Puntos sumados (lejos del premio) | {{1}}=nombre, {{2}}=puntos ganados, {{3}}=puntos totales, {{4}}=roadmap tiers |
| `points_earned_near_template_sid` | Puntos sumados (cerca del premio) | {{1}}=nombre, {{2}}=puntos ganados, {{3}}=puntos totales, {{4}}=próximo premio |
| `tier_unlocked_template_sid` | Tier desbloqueado (antes de elegir safe/mystery) | {{1}}=nombre, {{2}}=tier, {{3}}=premio seguro, {{4}}=roadmap tiers |
| `reward_safe_template_sid` | Premio seguro (cliente eligió "a la segura") | {{1}}=nombre, {{2}}=tier, {{3}}=premio ganado, {{4}}=roadmap tiers |
| `mystery_box_result_template_sid` | Mystery Box resultado | {{1}}=nombre, {{2}}=tier, {{3}}=premio mystery box, {{4}}=roadmap tiers |
| `golden_box_result_template_sid` | Golden Box resultado (pity timer) | {{1}}=nombre, {{2}}=premio golden box, {{3}}=roadmap tiers |

### Problemas resueltos (v0.21.0)
1. ~~Cron birthday/reactivation usan free-text~~ → ✅ Ahora usan plantillas, sin fallback free-text
2. ~~Welcome back NO incluye hint de recompensa~~ → ✅ Incluye hint en {{3}}
3. ~~Check-in usa free-text~~ → ✅ Todos los mensajes usan plantillas
4. ~~No hay campañas Black~~ → ✅ Preset "Exclusiva Black" en campañas manuales

### Problemas resueltos (v0.23.0)
1. ~~Mismo welcome_back para "te falta 1" y "te faltan 5"~~ → ✅ near/far separados
2. ~~Reactivación siempre con hint genérico~~ → ✅ admin elige sin regalo (6a) o con regalo fijo (6b)
3. ~~Campaña manual no permite elegir qué reward mostrar~~ → ✅ body acepta `rewardId: 'auto' | uuid | 'none'`
4. ~~`buildRewardHint` genera frase completa, no permite que la plantilla controle el texto~~ → ✅ `getRewardTitle()` devuelve sólo el título; la plantilla decide la frase
5. ~~`rewards.visit_milestone` obligatorio impide rewards sólo-reactivación~~ → ✅ nullable
