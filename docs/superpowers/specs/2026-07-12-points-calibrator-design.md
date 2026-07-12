# Calibrador de puntos y umbrales — Diseño (Bloque 2)

> **Fecha:** 2026-07-12
> **Cubre:** R5 y hallazgo 3.3 de [`REQUERIMIENTOS_JULIO_2026.md`](../../requerimientos/REQUERIMIENTOS_JULIO_2026.md)
> **Estado:** diseño aprobado, pendiente de implementar
> **Migración de DB:** ninguna. Todas las keys de `admin_settings` ya existen.

---

## 1. El problema

El dueño de un café quiere que su premio de 150 puntos se gane en **5 visitas** en vez de 3. Hoy, para
lograr eso, tiene que traducir a mano una intención de negocio ("5 visitas") a **seis casillas numéricas
sueltas** en Dashboard → Ajustes → Sistema de Puntos:

| Casilla | Default |
|---------|---------|
| Puntos por visita — mín / máx | 60 / 90 |
| Bono de bienvenida — mín / máx | 75 / 90 |
| Shortfall — mín / máx | 5 / 30 |

Ninguna de las seis le dice en cuántas visitas cae el premio. **La traducción no existe en el producto.**
Y como el número de visitas no sale de una sola casilla sino de la interacción de las tres con el umbral
del tier, en la práctica nadie la calcula: se dejan los defaults.

### 1.1 La mecánica no hay que cambiarla (R5, decisión D8)

Está cerrado en §2/R5 del documento de requerimientos y se confirma aquí: el near-miss de
`generateSmartVisitPoints()` es **relativo a la distancia al umbral**, no a un número de visitas. El
algoritmo ya se autoajusta a cualquier configuración de puntos. **No hace falta una capa de
personalización de la mecánica. Hace falta un traductor.**

### 1.2 El bono de bienvenida es la palanca dominante, y el documento de requerimientos lo ignora

**La tabla de R5 está mal.** Afirma que la visita 1 otorga 25-35 puntos de visita. En el código, la
visita 1 **no otorga puntos de visita**: otorga el **bono de bienvenida**.
[`check-in/route.ts:410`](../../../src/app/api/check-in/route.ts) llama a `awardWelcomeBonus()` en el
registro y nunca a `awardVisitPoints()`. `awardVisitPoints()` solo corre en la acción `checkin`
(visitas 2 en adelante).

Con el bono default de 75-90 sobre un umbral de 150, **más de la mitad del premio se regala antes de que
el cliente vuelva una sola vez**. Eso es deliberado (Endowed Progress Effect) y no se toca. Pero tiene una
consecuencia que invalida la receta del documento: bajar los puntos por visita a 25-35 **dejando el bono
en 75-90** produce el premio en la visita **4**, no en la 5:

| Visita | Otorga | Acumulado | Faltan |
|--------|--------|-----------|--------|
| 1 | bono 75-90 | ~82 | 68 |
| 2 | 25-35 (lejos) | ~112 | 38 |
| 3 | 25-35 (lejos) | ~142 | **8** |
| 4 | cruza | **≥150** | — |

Y con un umbral de 150, metas de 6+ visitas serían **directamente imposibles** sin tocar el bono.

> **Conclusión de diseño: el calibrador tiene que proponer el bono de bienvenida junto con los puntos por
> visita.** Un calibrador que solo mueva `points_per_visit_min/max` promete N visitas y entrega N−1. Sería
> otra configuración fantasma, exactamente el pecado del hallazgo 3.3.

### 1.3 La cuenta cerrada no basta: hay que buscar el número

La fórmula directa (`bono + (N−1) × puntos ≈ umbral`) **falla por una visita** con frecuencia, porque el
cliente aterriza dentro de la banda del shortfall y el algoritmo le inserta un "casi lo logro" extra.
Verificado contra el algoritmo real, umbral 150, meta 5 visitas:

| Puntos/visita propuestos | Visita en la que cae el premio |
|--------------------------|-------------------------------|
| 29 (lo que da la fórmula cerrada) | **6** ❌ |
| 30 | 5 ✅ |
| 33 | 5 ✅ |
| 35 | 5 ✅ |

> **Conclusión de diseño: el calibrador no despeja, busca.** Barre candidatos, **simula cada uno con el
> algoritmo real** y se queda con el que aterriza el premio exactamente en la visita pedida. Como efecto
> secundario, la tabla que ve el dueño **no puede mentirle**: es el resultado de correr el mismo código
> que corre en producción.

---

## 2. Qué se construye

### 2.1 La perilla

Dashboard → Ajustes → Sistema de Puntos deja de abrir con seis casillas y abre con **una pregunta**:

```
  ¿En cuántas visitas quieres que tus clientes
   se ganen su primer premio?          [ 5 ▼ ]  visitas

  Así lo vive tu cliente:
     Visita 1   +35  (bienvenida)   →   35 pts
     Visita 2   +30                 →   65 pts
     Visita 3   +30                 →   95 pts
     Visita 4   +27                 →  122 pts   ← "te faltan 28, casi lo logras"
     Visita 5   +28                 →  150 pts   🎁 PREMIO

  ⚠ Cambiar esto no recalcula los puntos de tus clientes actuales.

  ▸ Ajustes avanzados                                        [ Guardar ]
```

Al cambiar el número de visitas, la tabla se redibuja sola y las seis casillas de abajo se rellenan con
la propuesta. **No hay botón de "calcular".**

Las seis casillas actuales **no desaparecen**: se pliegan bajo *Ajustes avanzados*, prellenadas con lo
que la perilla decidió y editables a mano. Quien toque una a mano ve la tabla recalcularse en vivo con
sus números.

### 2.2 El umbral de referencia

El umbral es el `point_threshold` **más bajo entre los tiers activos** — el primer premio que el cliente
puede ganar. Se lee de `GET /api/dashboard/reward-tiers` (ya existe; hoy la página de Ajustes no lo
consulta, hay que añadir el fetch).

El calibrador **no propone mover el umbral.** Es el número que el dueño usa como gancho ("150 puntos y te
ganas el premio") y su CRUD vive en Ajustes → Premios. Si no hay ningún tier activo, el calibrador se
oculta y muestra: *"Crea primero un premio para poder calibrar."*

### 2.3 Cuando la meta es imposible

Con umbral 150 no se puede llegar en 9 visitas: cada visita tendría que dar menos de
`MINIMUM_VISIBLE_POINTS` (15). En ese caso el calibrador **no guarda una mentira**: muestra el rango
alcanzable y la salida.

> ⚠ Con un umbral de 150 puntos no es posible llegar en 9 visitas — cada visita daría menos de 15 puntos
> y se vería sospechoso. **Con este umbral puedes elegir entre 3 y 7 visitas.** Si quieres más, sube el
> umbral de tu premio en Ajustes → Premios.

---

## 3. Arquitectura

### 3.1 El motor puro — `src/lib/points-engine.ts` (nuevo)

Hoy el algoritmo vive en `points.service.ts`, que importa `@supabase/supabase-js` en el módulo. Un
componente de cliente no puede importarlo sin arrastrar el cliente de Supabase al bundle del navegador.

Se extrae **el cálculo puro** a `src/lib/points-engine.ts`: **cero I/O, cero imports más allá de
`@/constants/rewards`.** Lo importan el servicio (producción) y el componente del dashboard (simulación).
`points.service.ts` re-exporta `generateSmartVisitPoints` para no romper a nadie.

```ts
export interface PointsEngineConfig {
  visitMin: number
  visitMax: number
  welcomeMin: number
  welcomeMax: number
  shortfallMin: number
  shortfallMax: number
}

/** Fuente de azar inyectable. Devuelve [0, 1). */
export type Rng = () => number

/** El algoritmo de producción. Sin cambios de comportamiento; ahora recibe el shortfall y el azar. */
export function generateSmartVisitPoints(
  currentPoints: number,
  nextThreshold: number,
  cfg: PointsEngineConfig,
  rng?: Rng,           // default: Math.random
): number

/** El bono de bienvenida, extraído de awardWelcomeBonus para que el simulador use el mismo código. */
export function generateWelcomeBonusPoints(cfg: PointsEngineConfig, rng?: Rng): number
```

**El simulador no es una copia del algoritmo.** Llama a las mismas funciones con `rng = () => 0.5`, lo que
las hace determinísticas y devuelve el valor central de cada rango:

- `randomTriangular(min, max)` con `u = 0.5` → devuelve exactamente el promedio del rango.
- El sorteo de shortfall con `u = 0.5` → devuelve el punto medio de la banda.

Es literalmente **el cliente mediano**, calculado por el código de producción. Si mañana alguien cambia el
algoritmo, la tabla del dashboard cambia con él. No hay forma de que se desincronicen.

```ts
export interface SimulatedVisit {
  visit: number
  points: number
  accumulated: number
  remaining: number      // al umbral, DESPUÉS de esta visita (0 si ya cruzó)
  isWelcome: boolean     // visita 1 — bono de bienvenida, no puntos de visita
  isNearMiss: boolean    // quedó corto pero dentro de la banda del shortfall → "casi lo logras"
  isReward: boolean      // cruzó el umbral → 🎁
}

/** Corre el recorrido completo de un cliente nuevo hasta que gana el premio. */
export function simulateJourney(
  cfg: PointsEngineConfig,
  threshold: number,
  opts?: { maxVisits?: number; rng?: Rng },   // maxVisits default 12
): SimulatedVisit[]

/** Con esta config, ¿en qué visita cae el premio? null si no cae en maxVisits. */
export function deriveRewardVisit(cfg: PointsEngineConfig, threshold: number): number | null

/** El buscador: qué configuración aterriza el premio EXACTAMENTE en targetVisits. */
export function calibrate(
  threshold: number,
  targetVisits: number,
  shortfall: Pick<PointsEngineConfig, 'shortfallMin' | 'shortfallMax'>,
): CalibrationResult

export interface CalibrationResult {
  achieved: boolean
  config: PointsEngineConfig          // si !achieved, la más cercana a la meta
  journey: SimulatedVisit[]
  achievableVisits: number[]          // p.ej. [3,4,5,6,7] — para el mensaje de "imposible"
}
```

**Cómo busca `calibrate()`:**

1. Barre el promedio de puntos por visita `p` desde `MINIMUM_VISIBLE_POINTS` (15) hasta `threshold`.
2. Para cada `p`, deriva una config completa:
   - `visitMin/Max = p × (1 ∓ CALIBRATOR_VISIT_SPREAD)` — spread 0.2, reproduce el 60-90 default sobre p=75
   - `welcomeMin/Max` alrededor de `p × CALIBRATOR_WELCOME_FACTOR` (1.1) con spread 0.1 — reproduce el
     75-90 default. El bono se mantiene **proporcionalmente más generoso que una visita normal**: es lo que
     conserva el Endowed Progress Effect a cualquier escala.
   - shortfall: el que el dueño ya tiene configurado (el calibrador **no lo toca**).
3. Simula con `deriveRewardVisit()` y agrupa los `p` por la visita en la que cae el premio.
4. Devuelve la **mediana** de los `p` que aciertan la meta (el centro de la banda que funciona, no el borde).
5. Si ninguno acierta → `achieved: false` + `achievableVisits` con las metas que sí tienen solución.

Un barrido son ≤ ~200 iteraciones de un bucle de ≤ 12 pasos. Corre en el navegador en microsegundos, en
cada cambio de la perilla, sin endpoint.

Constantes nuevas en `src/constants/rewards.ts`: `CALIBRATOR_WELCOME_FACTOR`, `CALIBRATOR_VISIT_SPREAD`,
`CALIBRATOR_WELCOME_SPREAD`, `CALIBRATOR_MIN_VISITS` (3), `CALIBRATOR_MAX_VISITS` (10).

### 3.2 El arreglo del hallazgo 3.3 — la configuración fantasma

Hoy `getPointsConfig()` ([`points.service.ts:89-111`](../../../src/services/points.service.ts)) **no lee
`shortfall_min` ni `shortfall_max`** de `admin_settings`, y `generateSmartVisitPoints()` usa siempre las
constantes `DEFAULT_POINTS_SHORTFALL_MIN/MAX`. El dueño configura el "casi lo logro" en Ajustes, se guarda
bien, y no pasa nada.

- `getPointsConfig()` pasa a leer las dos keys y a devolver un `PointsEngineConfig` completo.
- `awardVisitPoints()` se lo pasa entero a `generateSmartVisitPoints()`.
- **Saneamiento defensivo en el motor** (los valores llegan de una tabla key-value de strings): si
  `shortfallMin > shortfallMax`, o alguno es ≤ 0, o `NaN` → se cae a los defaults de `constants/rewards.ts`.
  El motor nunca revienta ni devuelve puntos negativos por una config corrupta.

### 3.3 El componente — `src/components/dashboard/PointsCalibrator.tsx` (nuevo)

Componente **presentacional y controlado**. No hace fetch, no guarda, no conoce `admin_settings`.

```ts
interface PointsCalibratorProps {
  threshold: number | null          // null → no hay tier activo, se muestra el aviso y nada más
  config: PointsEngineConfig        // los seis valores, ya parseados por el padre
  onChange: (cfg: PointsEngineConfig) => void
  disabled?: boolean
}
```

- Al montar (y cuando cambia `config` desde fuera), deriva la visita actual con `deriveRewardVisit()` y
  preselecciona la perilla. **Si el dueño no toca la perilla, no se le cambia ni un número.**
- Al cambiar la perilla: `calibrate()` → `onChange(resultado.config)`. El padre actualiza sus seis inputs.
- La tabla se renderiza siempre desde `simulateJourney(config, threshold)` — la config **efectiva**, venga
  de la perilla o de una edición manual en *Ajustes avanzados*. Un solo camino de datos, sin estados que
  puedan discrepar entre sí.

**Estilos:** dashboard, no check-in público. Se usa `.dashboard-card`, `Input`/`Button` de shadcn y la
paleta que ya usa la sección Sistema de Puntos (`#a855f7` morado). El sistema visual paralelo de
`.premium-card` es solo del flujo público — aquí no aplica (Mandamiento VII).

### 3.4 La página de Ajustes — `src/app/(dashboard)/dashboard/settings/page.tsx`

- Añadir `fetch('/api/dashboard/reward-tiers')` al `Promise.all` de carga y quedarse con el
  `point_threshold` mínimo entre los tiers activos.
- Montar `<PointsCalibrator>` arriba de la sección Sistema de Puntos.
- Mover los seis inputs existentes (puntos, bienvenida, shortfall) dentro de un `<details>` **Ajustes
  avanzados**. El pity timer y el switch de encendido se quedan fuera: no son parte de la calibración.
- `handleSavePoints()` **no cambia**: sigue guardando las mismas ocho keys. La perilla solo altera el
  estado de React de los seis inputs; el guardado ya funciona.

---

## 4. Lo que NO se hace

| Ítem | Motivo |
|------|--------|
| Cambiar la mecánica de puntos | Decisión D8. El near-miss ya es relativo al umbral. |
| Mover el `point_threshold` desde el calibrador | Es el gancho psicológico del dueño y tiene su propio CRUD en Ajustes → Premios. |
| Recalcular el historial de puntos de clientes existentes | Fuera de alcance y peligroso. Se avisa explícitamente en la UI. |
| Mostrar distribuciones / porcentajes de fiabilidad | El azar del algoritmo es sano pero no es una decisión de negocio. La tabla muestra el cliente mediano. |
| Migración de DB | Ninguna necesaria: las seis keys ya existen en `admin_settings`. |
| Endpoint nuevo | Ninguno: el motor es puro y corre en el navegador; el umbral sale de un endpoint que ya existe. |

---

## 5. Verificación

1. **Determinismo del simulador:** `simulateJourney()` con `rng = () => 0.5` debe ser reproducible y su
   última fila debe tener `isReward: true`.
2. **El calibrador cumple su promesa:** para cada umbral de {100, 150, 300, 500} y cada meta de 3 a 8,
   si `calibrate()` devuelve `achieved: true`, entonces `deriveRewardVisit(resultado.config, umbral)`
   **debe ser exactamente la meta**. Es la invariante central: el número que ve el dueño es el número que
   vive el cliente.
3. **No regresión de los defaults:** con la config default (60-90 / 75-90 / 5-30) y umbral 150,
   `deriveRewardVisit()` debe devolver **3** — el comportamiento actual de producción.
4. **Config corrupta:** `generateSmartVisitPoints()` con `shortfallMin > shortfallMax`, con ceros o con
   `NaN` devuelve puntos válidos (≥ `MINIMUM_VISIBLE_POINTS`) sin lanzar.
5. `npx tsc --noEmit` limpio, `npx next build` verde, `npx eslint` sin errores nuevos (el árbol ya tiene 14
   preexistentes en `useDashboardAnalytics.ts` y `useStaffAuth.ts`).

---

## 6. Documentación a actualizar

| Doc | Qué |
|-----|-----|
| `docs/features/points-mystery-box.md` | El calibrador, el motor puro, y la corrección de §2.3 (la visita 1 es el bono, no puntos de visita). |
| `CHANGELOG.md` | Entrada nueva citando el request textual de R5. |
| `CLAUDE.md` | Tabla de lookup: `src/lib/points-engine.ts` y `src/components/dashboard/PointsCalibrator.tsx`. |
| `docs/requerimientos/REQUERIMIENTOS_JULIO_2026.md` | Marcar Bloque 2 completo y **corregir la tabla de R5**, que ignora el bono de bienvenida. |
| `docs/API_DOCS.md` | Sin cambios: no hay endpoints nuevos. |
| `docs/DB_SCHEMA.md` | Sin cambios: no hay migración. |
