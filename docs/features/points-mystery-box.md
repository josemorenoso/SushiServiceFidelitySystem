# Sistema de Puntos + Mystery Box — Diseño Completo

> **Estado:** Diseño aprobado — pendiente implementación
> **Fecha:** 2026-05-25
> **Versión objetivo:** v1.0.0 (reestructuración mayor)
> **Origen:** Análisis de falencias del sistema lineal de visitas + Investigation.md
> **Reemplaza:** Sistema de milestones por visita (`rewards.visit_milestone`)

---

## 1. Resumen Ejecutivo

Migración del sistema de recompensas lineales por visitas a un sistema de **puntos acumulativos con gamificación psicológica**. Incluye:

- **Puntos aleatorios por visita** (rango configurable, mínimo 3 visitas para primera recompensa)
- **Mystery Box** con probabilidades configurables y animación en web
- **Pity Timer** para evitar frustración por racha de premios bajos
- **Cap global de premios altos** (limita cuántos platos fuertes se entregan por período)
- **Reward Tiers acumulativos** (progresión sin reset, hasta BLACK)
- **Plantillas WhatsApp dopamínicas** con variables de puntos y progreso
- **Reactivación rediseñada** a 21 y 25 días con puntos como gancho

### Por qué el sistema anterior falla

| Problema | Causa raíz | Solución nueva |
|----------|-----------|----------------|
| Canibaliza ingresos | Visita de $10K = visita de $200K | Puntos fijos por visita pero con variabilidad aleatoria que genera engagement |
| Parasitario | Consumo mínimo = misma recompensa | Tiers acumulativos: más visitas = mejores premios |
| Predecible/aburrido | Milestones fijos, roadmap estático | Puntos aleatorios + Mystery Box + near-miss |
| Sin FOMO real | Mensajes informativos, no emocionales | Mensajes dopamínicos con puntos, streaks, casi-aciertos |

---

## 2. Modelo de Puntos

### 2.1 Acumulación

| Fuente | Puntos | Configurable | Notas |
|--------|--------|-------------|-------|
| **Visita QR** | Rango inteligente (default: 60–90, limitado cerca del umbral) | Sí (`admin_settings`) | Mín 3 visitas para primera recompensa |
| **Domicilio** | Mismo rango que QR | Sí | Mismo tratamiento |
| **Evento/Festival** | Bonus fijo (default: 25) | Sí, por evento | Se suma al registro del check-in del evento |
| **Campaña engagement** | Bonus fijo (default: 10) | Sí | Futuro: puntos por interacciones |
| **Registro inicial** | Bonus de bienvenida (default: 0) | Sí | Efecto "Endowed Progress" si se activa |

### 2.2 Matemáticas del algoritmo inteligente

**Restricción fundamental:** El cliente SIEMPRE necesita mínimo 3 visitas para alcanzar el primer tier.

**Psicología del enganche:**
1. **Visita 1:** Puntos altos (60-90) → Cliente piensa "con 2 visitas llego"
2. **Visita 2:** Sistema LIMITA para dejar al cliente 5-30 pts corto → "Casi lo logro, me falta poquito"
3. **Visita 3:** Cualquier cantidad cruza el umbral → PREMIO

```
PRIMER_UMBRAL = 150 puntos
POINTS_MIN = 60, POINTS_MAX = 90
SHORTFALL_MIN = 5, SHORTFALL_MAX = 30

Ejemplo real:
  Visita 1: balance=0, remaining=150 > 90 → random(60,90) = 78 → balance=78
  Visita 2: balance=78, remaining=72, 30 < 72 ≤ 90 → LIMITAR
    shortfall = random(5,30) = 18 → target = 72-18 = 54 → balance=132 (18 corto!)
  Visita 3: balance=132, remaining=18, ≤ 30 → random(18,90) = 45 → balance=177 → PREMIO! 🎉
```

### 2.3 Algoritmo de generación (`generateSmartVisitPoints`)

```typescript
function generateSmartVisitPoints(currentPoints, nextThreshold, min, max) {
  const remaining = nextThreshold - currentPoints

  // CASO 1: Lejos — ni con máximo llega → dar alto (60-90)
  if (remaining > max) return randomTriangular(min, max)

  // CASO 2: Podría cruzar — LIMITAR para dejar 5-30 corto
  if (remaining > SHORTFALL_MAX) {
    const shortfall = random(SHORTFALL_MIN, SHORTFALL_MAX)
    return clamp(remaining - shortfall, MINIMUM_VISIBLE_POINTS, max)
  }

  // CASO 3: Ya cerca (≤30) — dar suficiente para cruzar
  return randomTriangular(max(remaining, MINIMUM_VISIBLE_POINTS), max)
}
```

---

## 3. Reward Tiers (Progresión Acumulativa)

Los puntos **NO se resetean**. Cada umbral desbloquea una recompensa. El admin configura:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `point_threshold` | `integer` | Puntos acumulados necesarios (ej: 150, 350, 600, 1000) |
| `tier_name` | `text` | Nombre del tier (ej: "Bronce", "Plata", "Oro", "BLACK") |
| `safe_reward_title` | `text` | Premio seguro (ej: "Bebida gratis") |
| `mystery_box_enabled` | `boolean` | Si este tier tiene opción de Mystery Box |
| `mystery_prizes` | `jsonb` | Array de premios con probabilidades (ver §4) |
| `sort_order` | `integer` | Orden de progresión |

### Ejemplo de configuración default

| Tier | Puntos | Safe Reward | Mystery Box |
|------|--------|-------------|-------------|
| 🥉 Bronce | 150 | Bebida gratis | Bebida 70% · Postre 25% · Plato Fuerte 5% |
| 🥈 Plata | 350 | Postre gratis | Postre 65% · Plato Fuerte 25% · Experiencia 10% |
| 🥇 Oro | 600 | Plato Fuerte gratis | Plato Fuerte 60% · Experiencia 30% · Super Premio 10% |
| 🖤 BLACK | 1000 | Experiencia Chef | Golden Box siempre (sin tier bajo) |

**Nota:** Los premios y umbrales son 100% configurables por el dueño del restaurante desde el Dashboard.

---

## 4. Mystery Box

### 4.1 Mecánica

1. Cliente llega al umbral de puntos → pantalla web muestra opciones:
   - **Opción A (Segura):** Premio garantizado del tier
   - **Opción B (Mystery Box):** Ruleta con probabilidades
2. Si elige B → animación de ruleta en web → revela premio
3. Resultado se registra en DB + se envía plantilla WhatsApp de confirmación

### 4.2 Estructura de premios (jsonb)

```json
{
  "prizes": [
    { "title": "Bebida gratis", "probability": 70, "emoji": "☕" },
    { "title": "Postre del chef", "probability": 25, "emoji": "🍰" },
    { "title": "Plato fuerte gratis", "probability": 5, "emoji": "🍽️", "global_cap": 5, "cap_period": "month" }
  ]
}
```

### 4.3 Cap Global de Premios Altos

Para proteger márgenes, los premios de alto valor tienen un límite global:

- **`global_cap`**: Máximo de este premio que se pueden entregar en el período
- **`cap_period`**: `"month"` | `"week"` | `"total"`
- Cuando se alcanza el cap, ese premio se redistribuye al tier inferior

Ejemplo: Si `Plato fuerte` tiene `global_cap: 5, cap_period: "month"` y ya se entregaron 5 este mes:
- El 5% que iría a Plato Fuerte se redistribuye → Postre sube de 25% a 30%
- Probabilidades efectivas: Bebida 70%, Postre 30%, Plato Fuerte 0%

### 4.4 Near-Miss Effect (Efecto Casi-Acierto)

Cuando el cliente NO gana el premio top, el mensaje muestra que "estuvo cerca":

```
🎲 Girando tu Mystery Box...

[☕ Bebida] — [🍰 Postre] — [🍽️ PLATO FUERTE] — [☕ Bebida]

¡Ufff! La ruleta paró a un pelo del Plato Fuerte 🤯
Hoy te llevas: ☕ Bebida gratis

¡Estuviste cerquísima, la próxima es la vencida!
```

Este texto se genera en la web. En WhatsApp se envía una versión limpia como plantilla.

### 4.5 Pity Timer (Temporizador de Lástima)

| Condición | Acción |
|-----------|--------|
| 2 mystery boxes seguidas con premio del tier más bajo | Siguiente mystery box → **Golden Box** |
| Golden Box | Elimina tier más bajo, redistribuye probabilidades |

Ejemplo Golden Box para tier Bronce:
- Normal: Bebida 70%, Postre 25%, Plato 5%
- Golden: Postre 80%, Plato 20% (bebida eliminada)

Se trackea en `customers.mystery_box_low_streak` (contador).

---

## 5. Flujo del Cliente (Nuevo)

```
REGISTRO NUEVO
└── Escanea QR → Registra datos → Recibe bonus bienvenida (configurable)
    └── WhatsApp: plantilla bienvenida con puntos iniciales + roadmap de tiers

VISITA FRECUENTE (cada check-in)
└── Escanea QR → Web muestra RULETA DE PUNTOS (animación, revela pts ganados)
    ├── NO alcanza umbral → Web muestra progreso + próximo tier
    │   └── WhatsApp: plantilla "sumaste X puntos, te faltan Y para [tier]"
    │
    └── SÍ alcanza umbral → Web muestra CHOICE:
        ├── Opción A (Segura) → Web confirma premio
        │   └── WhatsApp: plantilla "ganaste [premio seguro]"
        │
        └── Opción B (Mystery Box) → ¿Pity Timer activo?
            ├── NO → Mystery Box normal → Animación ruleta → Premio
            │   └── WhatsApp: plantilla "abriste mystery box → [premio]"
            │
            └── SÍ → GOLDEN BOX (sin tier bajo) → Animación → Premio
                └── WhatsApp: plantilla "Golden Box → [premio]"

AUTOMATIZACIONES
├── Cumpleaños (cron 8am) → plantilla con puntos actuales
├── Día 18-21 sin visitar → Reactivación suave (puntos + roadmap)
├── Día 22-25 sin visitar → Reactivación agresiva (pérdida de racha + puntos)
├── Día 25+ → Reactivación urgente (última oportunidad)
└── Evento programado → plantilla con bonus de puntos del evento

CAMPAÑAS MANUALES
├── Pueden ofrecer multiplicador de puntos ("Doble puntos este sábado")
├── Incluyen puntos actuales del cliente en el mensaje
└── Campañas BLACK: exclusivas para tier máximo
```

---

## 6. Plantillas WhatsApp (Nuevo Tono)

### Principios de tono

- **Cálido y cercano** — tutear, usar nombre, emojis con moderación
- **Enérgico** — frases activas, verbos de acción, exclamaciones naturales
- **Dopamínico** — números visibles, progreso claro, anticipación
- **Meta-safe** — sin urgencia falsa, sin pérdidas exageradas, sin mayúsculas excesivas

### Variables por plantilla (nuevo mapeo)

| Slot | `{{1}}` | `{{2}}` | `{{3}}` | `{{4}}` |
|------|---------|---------|---------|---------|
| **Bienvenida** | Nombre | Puntos iniciales | Roadmap tiers | — |
| **Puntos sumados (lejos)** | Nombre | Puntos ganados hoy | Puntos totales | Roadmap tiers |
| **Puntos sumados (cerca)** | Nombre | Puntos ganados hoy | Puntos totales | Próximo premio |
| **Alcanzó reward (safe)** | Nombre | Tier alcanzado | Premio ganado | Roadmap tiers |
| **Mystery Box resultado** | Nombre | Tier | Premio mystery box | Roadmap tiers |
| **Golden Box resultado** | Nombre | Premio golden box | Roadmap tiers | — |
| **Reactivación 21d (suave)** | Nombre | Puntos actuales | Próximo tier | — |
| **Reactivación 25d (agresiva)** | Nombre | Puntos actuales | Lo que pierde | — |
| **Cumpleaños** | Nombre | Puntos actuales | — | — |
| **Campaña manual** | Nombre | Puntos actuales | Próximo tier | — |

### Plantilla: Bienvenida (nuevo)

```
¡Hola {{1}}! 🎉

Bienvenid@ a la familia de [Restaurante] — ya eres parte del club

Arrancas con *{{2}} puntos* de regalo 🎁

En cada visita sumas puntos y desbloqueas premios reales 👇

{{3}}

¡Nos vemos pronto!

— El equipo de [Restaurante]
```

### Plantilla: Puntos Sumados (lejos del premio)

```
¡Hola {{1}}! 👋

Hoy sumaste *+{{2}} puntos* 🔥
Tu saldo: *{{3}} puntos*

{{4}}

¡Cada visita te acerca más, seguí sumando!

— [Restaurante]
```

### Plantilla: Puntos Sumados (cerca — falta 1 visita)

```
¡{{1}}, estás que lo logras! 🔥

Hoy sumaste *+{{2}} puntos*
Tu saldo: *{{3}} puntos*

Estás a un paso de desbloquear *{{4}}* — la próxima visita puede ser la definitiva 👊

— [Restaurante]
```

### Plantilla: Alcanzó Reward (opción safe)

```
¡{{1}}, lo lograste! 🏆

Desbloqueaste el nivel *{{2}}* y elegiste ir a la segura

Tu premio: *{{3}}* — muéstrale este mensaje al mesero para reclamar 🎁

{{4}}

— [Restaurante]
```

### Plantilla: Mystery Box Resultado

```
¡{{1}}, abriste la Mystery Box del nivel *{{2}}*! 🎲

Tu premio: *{{3}}* — muéstrale este mensaje al mesero 🎁

{{4}}

¡Seguí sumando puntos para tu próximo premio!

— [Restaurante]
```

### Plantilla: Golden Box Resultado

```
¡{{1}}, hoy tenías la *Golden Box* activada! ✨🎲

Tu premio: *{{2}}* — muéstrale este mensaje al mesero 🎁

{{3}}

La suerte está de tu lado 🍀

— [Restaurante]
```

### Plantilla: Reactivación 21 días (suave)

```
¡Hola {{1}}! 👋

Hace rato no te vemos y tus *{{2}} puntos* siguen esperándote

Tu próximo premio: *{{3}}* — no dejes que se enfríe el impulso 🔥

Pásate cuando quieras, siempre hay algo bueno en el menú

— [Restaurante]
```

### Plantilla: Reactivación 25 días (agresiva)

```
{{1}}, tus *{{2}} puntos* llevan tiempo sin moverse 👀

Estás a nada de desbloquear *{{3}}* — sería una lástima dejarlo ahí

Volvé esta semana y seguí sumando, tu progreso no se pierde 💪

— [Restaurante]
```

### Plantilla: Cumpleaños

```
¡Feliz cumpleaños {{1}}! 🎂🎉

De parte de [Restaurante] — hoy mereces algo especial

Vení esta semana, mencioná tu cumple en caja y llevate tu *sorpresa* 🎁

Tus puntos: *{{2}}* — seguís sumando 🔥

— [Restaurante]
```

---

## 7. Cambios en Base de Datos

### 7.1 Nuevas columnas en `customers`

| Columna | Tipo | Default | Descripción |
|---------|------|---------|-------------|
| `total_points` | `integer` | `0` | Puntos acumulados totales (nunca se resetean) |
| `current_tier` | `text` | `NULL` | Tier actual del cliente (ej: 'bronce', 'plata', 'oro', 'black') |
| `mystery_box_low_streak` | `integer` | `0` | Racha consecutiva de premios del tier más bajo en mystery box (pity timer) |
| `last_points_awarded_at` | `timestamptz` | `NULL` | Última vez que se le dieron puntos (anti-abuse) |

### 7.2 Nueva tabla: `point_transactions`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | `uuid` PK | |
| `customer_id` | `uuid` FK | Referencia a customers |
| `points` | `integer` | Cantidad de puntos (+/-) |
| `source` | `text` | 'visit_qr', 'visit_delivery', 'event_bonus', 'campaign_bonus', 'welcome_bonus', 'admin_adjustment' |
| `reference_id` | `uuid` | ID de visita/evento/campaña que originó los puntos |
| `balance_after` | `integer` | Saldo de puntos después de esta transacción |
| `created_at` | `timestamptz` | |

### 7.3 Nueva tabla: `reward_tiers`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | `uuid` PK | |
| `tier_name` | `text` | Nombre del tier ('Bronce', 'Plata', etc.) |
| `point_threshold` | `integer` UNIQUE | Puntos acumulados necesarios |
| `safe_reward_title` | `text` | Premio seguro (ej: 'Bebida gratis') |
| `mystery_box_enabled` | `boolean` | Si tiene mystery box |
| `mystery_prizes` | `jsonb` | Array de premios con probabilidades |
| `is_black` | `boolean` | TRUE = tier BLACK (último tier) |
| `sort_order` | `integer` | Orden de display |
| `is_active` | `boolean` | Si está activo |
| `created_at` | `timestamptz` | |

### 7.4 Nueva tabla: `mystery_box_results`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | `uuid` PK | |
| `customer_id` | `uuid` FK | |
| `tier_id` | `uuid` FK | Tier en el que se abrió la box |
| `choice` | `text` | 'safe' o 'mystery' |
| `prize_title` | `text` | Premio obtenido |
| `prize_tier_index` | `integer` | Índice del premio en el array (0=más bajo, N=más alto) |
| `was_golden` | `boolean` | Si fue Golden Box (pity timer) |
| `created_at` | `timestamptz` | |

### 7.5 Nueva tabla: `mystery_box_global_caps`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | `uuid` PK | |
| `tier_id` | `uuid` FK | Tier al que pertenece |
| `prize_title` | `text` | Nombre del premio limitado |
| `max_per_period` | `integer` | Máximo entregas por período |
| `period` | `text` | 'week', 'month', 'total' |
| `current_count` | `integer` | Contador actual (se resetea según período) |
| `period_start` | `timestamptz` | Inicio del período actual |
| `created_at` | `timestamptz` | |

### 7.6 Cambios en tabla `rewards` (compatibilidad)

La tabla `rewards` actual se mantiene por compatibilidad pero se marca como **legacy**. La nueva fuente de verdad es `reward_tiers`. Se añade:

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `point_threshold` | `integer` | NULL = legacy (usa visit_milestone). Si tiene valor, funciona con el nuevo sistema de puntos. |
| `tier_id` | `uuid` FK | Referencia al reward_tier si aplica |

### 7.7 Nuevos keys en `admin_settings`

| Key | Default | Descripción |
|-----|---------|-------------|
| `points_per_visit_min` | `40` | Mínimo de puntos aleatorios por visita |
| `points_per_visit_max` | `65` | Máximo de puntos aleatorios por visita |
| `welcome_bonus_points` | `0` | Puntos de bienvenida (Endowed Progress) |
| `event_bonus_points` | `25` | Puntos bonus por asistir a evento |
| `pity_timer_threshold` | `2` | Rachas de tier bajo antes de Golden Box |
| `points_system_enabled` | `true` | Feature flag para migración gradual |

---

## 8. Cambios en APIs

### 8.1 `POST /api/check-in` (modificar)

**Flujo nuevo:**
1. `action: 'checkin'` → genera puntos aleatorios → `point_transactions` INSERT
2. Calcula si alcanza algún umbral nuevo de `reward_tiers`
3. Si alcanza umbral → responde con `{ rewardUnlocked: true, tier, safeReward, mysteryBoxAvailable }`
4. Si NO alcanza → responde con `{ rewardUnlocked: false, pointsEarned, totalPoints, nextTier, pointsRemaining }`

**Flujo register:**
1. Crea cliente con `total_points = welcome_bonus_points`
2. Si bonus > 0, inserta `point_transactions` con source `welcome_bonus`

### 8.2 `POST /api/mystery-box/resolve` (nuevo)

**Body:** `{ customerId, tierId, choice: 'safe' | 'mystery' }`

**Lógica:**
1. Valida que el cliente efectivamente alcanzó el tier
2. Si `choice === 'safe'` → registra resultado → envía plantilla WhatsApp
3. Si `choice === 'mystery'`:
   a. Verifica pity timer → ¿Golden Box?
   b. Verifica global caps → ajusta probabilidades si algún premio está capeado
   c. Genera resultado con probabilidades ajustadas
   d. Registra en `mystery_box_results`
   e. Actualiza `mystery_box_low_streak` del cliente
   f. Actualiza `mystery_box_global_caps` si aplica
   g. Envía plantilla WhatsApp con resultado

### 8.3 Cron reactivation (modificar)

**Niveles:**
- **Día 21:** Reactivación suave — "tus X puntos te esperan, estás cerca de [tier]"
- **Día 25:** Reactivación agresiva — "X puntos sin moverse, no dejes enfriar tu progreso"

### 8.4 Dashboard rewards (modificar)

Nuevo endpoint o sección para CRUD de `reward_tiers` con configuración de mystery box.

---

## 9. Cambios en UI (Check-In)

### 9.1 Pantalla post check-in: Ruleta de Puntos

```
┌────────────────────────────┐
│     🎰 ¡Girando puntos!    │
│                            │
│    [ ANIMACIÓN RULETA ]    │
│    números girando...      │
│                            │
│      +58 PUNTOS 🔥         │
│                            │
│   Total: 142 / 150 pts     │
│   ████████████░░  95%      │
│                            │
│   🥉 Bronce a 8 puntos     │
│                            │
│        [Continuar]         │
└────────────────────────────┘
```

### 9.2 Pantalla de elección (cuando alcanza umbral)

```
┌────────────────────────────┐
│  🏆 ¡DESBLOQUEASTE BRONCE! │
│                            │
│  Elige tu recompensa:      │
│                            │
│  ┌──────────────────────┐  │
│  │  A. ☕ IR A LA SEGURA │  │
│  │  Bebida gratis (100%) │  │
│  └──────────────────────┘  │
│                            │
│  ┌──────────────────────┐  │
│  │  B. 🎁 MYSTERY BOX   │  │
│  │  ☕70% 🍰25% 🍽️5%   │  │
│  └──────────────────────┘  │
│                            │
└────────────────────────────┘
```

### 9.3 Pantalla Mystery Box (animación)

```
┌────────────────────────────┐
│     🎲 MYSTERY BOX          │
│                            │
│  [ ANIMACIÓN DE DADOS ]    │
│  / RULETA GIRANDO          │
│                            │
│     ✨ 🍰 POSTRE ✨         │
│     del chef               │
│                            │
│  ¡Ufff! Estuviste a un     │
│  pelo del Plato Fuerte 🤯  │
│                            │
│  Muéstrale este mensaje    │
│  al mesero para reclamar   │
│                            │
│        [Listo ✓]           │
└────────────────────────────┘
```

---

## 10. Integración con Ciclo de 30 Días + Calendario

### Loop del cliente en la vida real

```
SEMANA 1-2: Visitas activas
├── Check-in → puntos aleatorios → dopamina
├── ¿Alcanza tier? → Mystery Box / Safe → recompensa
└── Mensaje WhatsApp con puntos en cada visita

SEMANA 2-3: Desaceleración natural
├── Día 14-18: Sin visita → Normal (no se hace nada)
├── Día 18-21: Recovery Zone → Reservado para reactivación
└── Día 21: Reactivación suave → "tus puntos te esperan"

SEMANA 3-4: Riesgo de pérdida
├── Día 22-25: Reactivación agresiva → "no dejes enfriar"
├── Día 25+: Última oportunidad → "tu progreso se enfría"
└── Si vuelve: puntos aleatorios → reinicio del ciclo

EVENTOS (interrumpen el ciclo)
├── Calendario programa evento → clientes reciben invitación con bonus de puntos
├── Blackout previo al evento → no se envían campañas manuales
└── Si asisten: bonus de puntos → acelera progresión
```

---

## 11. Plan de Implementación por Fases

### Fase 1: Base de datos + Backend core (PRIMERO)
- [ ] Migración SQL: nuevas tablas + columnas
- [ ] `src/services/points.service.ts` — generación de puntos, transacciones
- [ ] `src/services/mystery-box.service.ts` — resolución, pity timer, global caps
- [ ] `src/services/reward-tiers.service.ts` — CRUD de tiers, evaluación de umbrales
- [ ] Actualizar `src/constants/rewards.ts` con constantes del nuevo sistema
- [ ] Tipos TypeScript (`point_transactions`, `reward_tiers`, `mystery_box_results`, etc.)

### Fase 2: API + Check-in flow (SEGUNDO)
- [ ] Modificar `POST /api/check-in` para generar puntos y evaluar tiers
- [ ] Crear `POST /api/mystery-box/resolve`
- [ ] Modificar UI de check-in: ruleta de puntos + pantalla de elección + mystery box
- [ ] Dashboard: CRUD de reward tiers con mystery box config

### Fase 3: Plantillas + Reactivación (TERCERO)
- [ ] Crear todas las plantillas nuevas en Twilio
- [ ] Actualizar `PLANTILLAS.md` con nuevo mapeo
- [ ] Modificar cron de reactivación para usar puntos
- [ ] Crear plantilla de reactivación agresiva (25d)
- [ ] Actualizar cron de cumpleaños con puntos

### Fase 4: Dashboard + Polish (CUARTO)
- [x] Fix v1.0.2: API resistente a fallos, teléfono correcto, puntos en welcome, feedback mystery box
- [ ] Sección de configuración de puntos en Dashboard > Ajustes
- [ ] Métricas de mystery box en Dashboard > Analytics
- [ ] Migración de datos existentes (visit_milestone → reward_tiers)

---

## 12. Archivos que se modifican/crean

### Nuevos
- `supabase/migrations/00013_points_mystery_box.sql`
- `src/services/points.service.ts`
- `src/services/mystery-box.service.ts`
- `src/services/reward-tiers.service.ts`
- `src/app/api/mystery-box/resolve/route.ts`
- `src/components/features/check-in/PointsDisplay.tsx`
- `src/components/features/check-in/RewardChoice.tsx`
- `src/components/features/check-in/MysteryBoxResult.tsx`

### Modificados
- `src/types/database.types.ts` — nuevas interfaces
- `src/constants/rewards.ts` — nuevas constantes de puntos
- `src/services/reward.service.ts` — adaptar a tiers (mantener compat)
- `src/services/customer.service.ts` — añadir lógica de puntos
- `src/services/visit.service.ts` — registrar point_transaction al crear visita
- `src/app/api/check-in/route.ts` — flujo de puntos + tier evaluation + try/catch en servicios de tiers
- `src/app/api/cron/reactivation/route.ts` — dos niveles con puntos
- `src/services/whatsapp.service.ts` — sin cambios (ya es genérico)
- `src/components/features/check-in/CheckInForm.tsx` — pasa phone en callbacks
- `src/components/features/check-in/CheckInForm.types.ts` — callbacks reciben phone
- `src/components/features/check-in/CheckInSuccess.tsx` — isPointsBased incluye 'welcome', toast.error en mystery box
- `src/app/(public)/check-in/page.tsx` — elimina lastPhone/document.querySelector
- `docs/DB_SCHEMA.md` — nuevas tablas
- `docs/PLANTILLAS.md` — nuevo mapeo completo
- `docs/features/flujo-plantillas-recompensas-campanas.md` — actualizar
- `CHANGELOG.md` — entradas v1.0.0, v1.0.1, v1.0.2

---

*Última actualización: 2026-05-25*
