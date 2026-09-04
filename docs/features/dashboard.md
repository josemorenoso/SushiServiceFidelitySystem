# Feature: Dashboard Administrativo

> **Estado:** Completo
> **Archivos clave:** `src/app/(dashboard)/`, `src/app/(auth)/login/page.tsx`
> **Dependencias:** @supabase/ssr, shadcn/ui

---

## Descripción
Panel administrativo protegido por Supabase Auth donde el admin del restaurante puede ver métricas, gestionar clientes, configurar recompensas y ver campañas.

## Objetivo
Dar al administrador visibilidad completa del programa de fidelidad: cuántos clientes hay, visitas recientes, cumpleañeros, clientes inactivos, historial de campañas.

## Autenticación
- **Email:** `admin@sushiservice.com`
- **Password:** (configurado en Supabase Auth)
- **Método:** Supabase Auth con email/password
- **Sesión:** Cookies HttpOnly vía `@supabase/ssr`
- **Protección:** Middleware redirige `/dashboard/*` → `/login` si no hay sesión

## Páginas
| Ruta | Descripción |
|------|-------------|
| `/login` | Login del admin |
| `/dashboard` | Métricas gamificadas (analytics, rankings, gráficas) |
| `/dashboard/customers` | Sección Black arriba + lista de clientes con búsqueda, filtros y paginación |
| `/dashboard/rewards` | Configuración de recompensas por visitas |
| `/dashboard/campaigns` | Campañas automáticas (birthday/reactivation) + ejecución manual + historial |
| `/dashboard/qr` | Generación y descarga de código QR para mesas |
| `/dashboard/templates` | Plantillas Twilio Content API — crear, sincronizar, ver estado de aprobación |
| `/dashboard/staff` | Gestión de meseros (PIN) y dispositivos de confianza |

## Gestión de dispositivos de confianza (`/dashboard/staff`)
Los dispositivos del local (celulares/tablets) se activan desde `/mesero` para escanear sin PIN. Desde la tabla de dispositivos del dashboard se pueden gestionar:
- **Revocar** (soft) — `PATCH /api/dashboard/staff/device` con `{ device_id }`. Pone `is_trusted = false`; el dispositivo deja de poder registrar visitas (la API de check-in exige `is_trusted = true`). Disponible mientras el dispositivo está activo.
- **Eliminar** (hard) — `DELETE /api/dashboard/staff/device?id={device_id}`. Borra la fila. Solo permitido si el dispositivo ya está revocado (devuelve 409 si sigue activo).
- Ambos endpoints requieren sesión de dashboard (Supabase Auth); la UI pide confirmación antes de ejecutar.

**Sede del mesero (F7, D11, deuda #16 cerrada):** los diálogos de Crear/Editar dibujan un
`<select>` de sede (solo si la marca tiene al menos una sede activa) y la tabla muestra la sede
de cada mesero como badge — `location_id` NULL se ve como *"Sin sede"*, nunca se adivina. El
`PATCH` ya rechazaba con 409 mover a un mesero con dispositivos en otra sede (trigger D11); el
formulario ahora lo avisa antes de que el admin lo intente.

## Componentes
| Componente | Responsabilidad |
|-----------|----------------|
| `DashboardLayout` | Sidebar + header + protección + DemoProvider |
| `DashboardSidebar` | Navegación lateral (Sushi Service branding) |
| `MetricsCards` | 7 tarjetas de métricas reales |
| `VisitsChart` | Gráfica de área: visitas QR vs Domicilios |
| `GrowthChart` | Gráfica compuesta: nuevos clientes + acumulado |
| `CustomerTiers` | Barras de niveles de poder |
| `AtRiskBubbles` | Burbujas interactivas de clientes en riesgo. **Desde v2.14.0 vive en `/dashboard/campaigns` → pestaña Manuales**, no en el panel de métricas (§15.3). v2.8.0: el diálogo pide plantilla aprobada, muestra elegibles reales del día y envía por `/api/dashboard/campaigns/manual` con el rango de días del nivel (`RISK_LEVELS`) como filtro. Colores derivados del `color` del grupo (antes un mapa con nombres desalineados los dejaba grises) |
| `BlackTierSection` | Panel negro/dorado de clientes Black (`rank === 'Black'`, 10+ visitas) + beneficios de `admin_settings.black_benefits`. **Desde v2.14.0 vive en `/dashboard/customers`**, no en el panel de métricas (§14.1 / §17.1) |
| `PowerRanking` | Top clientes con ranking anime (`TOP_CUSTOMERS_LIMIT` = 15 desde v2.14.0) |
| `DemoToggle` | Toggle modo demostración |
| `ManualCampaigns` | Campañas manuales con filtros y predefinidas. Un preset predefinido solo se dibuja si su plantilla está aprobada (ver «Campañas predefinidas» abajo) |
| `TwilioWallet` | Saldo Twilio + calculadora de costos |
| `GoogleReviewPopup` | Popup post check-in para reseñas Google Maps |
| `LoginForm` | Formulario de login |

## Branding
- Nombre: **Sushi Service**
- Tema: Rojo japonés + blanco (oklch primary hue 25)
- Icono: `UtensilsCrossed` de Lucide
- QR color: rojo oscuro (#991B1B) sobre blanco

## Reordenamiento del panel — v2.14.0 (`REQUERIMIENTOS_AGOSTO_2026.md` §14, §15, §17)

El dueño pidió vaciar el panel de métricas de lo que no se mira a diario y llevarlo al apartado
donde se **actúa** sobre eso. Nada se borró: las dos secciones se movieron enteras, con los mismos
datos y el mismo comportamiento.

| Sección | Antes | Ahora | Requerimiento |
|---------|-------|-------|---------------|
| `BlackTierSection` | `/dashboard`, entre ROI y la gráfica de visitas | `/dashboard/customers`, arriba del buscador | §14.1 la saca, §17.1 la pone — *"la pantalla negra de clientes VIP tiene que quedar dentro del apartado de clientes"* |
| `AtRiskBubbles` | `/dashboard`, en rejilla con `GrowthChart` | `/dashboard/campaigns` → pestaña **Manuales**, encima de `ManualCampaigns` | §15.3 — *"deberíamos eliminar las burbujas flotantes catalogadas por días en el dashboard y meterla en el área de campañas"* |

**Por qué la pestaña Manuales y no otro sitio:** el diálogo de la burbuja publica en
`/api/dashboard/campaigns/manual`, exactamente igual que `ManualCampaigns`. Es un envío manual a un
segmento; queda al lado del resto de envíos manuales. Moverla a otra pestaña es cambiar de sitio un
bloque JSX, si el dueño la prefiere en otro lado.

**Consecuencias técnicas del movimiento:**
- `/dashboard/customers` y `/dashboard/campaigns` ahora llaman `useDashboardAnalytics()`. Es el
  mismo hook y el mismo endpoint que ya usaba el panel: los Black salen de `topCustomers` y las
  burbujas de `atRiskGroups`, no de la lista paginada ni del historial de campañas.
- `GrowthChart` quedó a ancho completo en `/dashboard` (era media rejilla junto a las burbujas).
- El resumen de clientes bajó de 20 a 15 filas (§14.2): `TOP_CUSTOMERS_LIMIT` en
  `src/constants/rankings.ts`, consumido por `dashboard.service.ts` y `demo-analytics.ts` — los dos,
  para que el modo demo no enseñe un panel que el cliente no va a tener. Ningún componente asumía 20.

## Campañas predefinidas — la regla de la plantilla (§15.2)

El dueño detectó dos campañas que se ofrecían sin poder enviar nada: *"hay campañas como invitar a
restaurante los que piden domi o invitar a que pidan domi los que van a restaurante, que no tienen
plantillas y no van a poder usarse, son básicamente de mentira"*. Los **filtros** de esos presets sí
estaban implementados; lo que faltaba era la plantilla aprobada por Meta con ese mensaje.

**15.b RESUELTA (2026-08-31): se les crea la plantilla.** El dueño lo pidió textualmente —*"a ese
apartado le faltan las plantillas de invitar a restaurante los que piden por domicilio · invitar a
domicilio los que piden por restaurante"*. No se elimina ningún preset.

La regla de abajo **no cambia** y sigue siendo la que decide qué se dibuja; lo que cambia es que
ahora hay un camino en la interfaz para cumplirla sin SQL ni scripts: la tarjeta «Del set estándar te
faltan N» en `/dashboard/templates` (negocios Twilio) crea la plantilla y deja el puntero listo. En
cuanto Meta aprueba, **el preset reaparece solo, sin tocar código** — que es exactamente lo que esta
regla estaba diseñada para permitir. Ver `docs/features/whatsapp-templates.md` § "Completar huecos
del set estándar".

La regla es genérica a propósito y sirve igual para las dos salidas:

- Un preset que declara `templateSettingKey` se muestra **solo** si esa clave de `admin_settings`
  apunta a un SID que existe y está **aprobado** (y no es de media — el camino de campañas no puede
  enviar plantillas `twilio/media`).
- Un preset **sin** `templateSettingKey` no depende de ninguna plantilla propia: es un atajo de
  segmentación que funciona con cualquier plantilla aprobada que el operador elija abajo, así que
  siempre se muestra.

| Preset | `templateSettingKey` | Estado hoy |
|--------|----------------------|------------|
| `invite_restaurant` (filtro `source: 'delivery_only'`) | `campaign_domicilio_to_presencial_template_sid` | Oculto hasta que la plantilla esté aprobada. Se crea desde `/dashboard/templates` |
| `invite_delivery` (filtro `source: 'qr_only'`) | `campaign_presencial_to_domicilio_template_sid` | Ídem |
| `black_exclusive` | — | Visible |
| `near_reward` | — | Visible |
| `rescue_lost` | — | Visible |

Los dos SIDs son los del catálogo estándar de §12 (`campaign_domicilio_to_presencial` y
`campaign_presencial_to_domicilio`). Efecto: mientras no exista la plantilla, el preset no se dibuja;
en cuanto Meta la aprueba **reaparece sin tocar código**.

⚠️ **El efecto secundario que costó el diagnóstico:** un preset oculto se ve igual que un preset que
nunca existió. El dueño reportó que "faltaban las plantillas" precisamente porque la campaña había
desaparecido de la pantalla sin decir por qué. Por eso la tarjeta de huecos vive en la pantalla de
Plantillas y nombra la consecuencia: *"mientras falte una, la campaña que la usa no aparece en el
apartado de Campañas"*.

La predicción vive en `isPresetSendable()` (`src/components/dashboard/ManualCampaigns.tsx`), función
pura y fuera del JSX. Si ningún preset es enviable, la pantalla lo dice y deja los filtros manuales
disponibles: no se queda en blanco.

## El selector de sede — multi-sede F7 (D10)

Doc completo: `docs/features/multi-sede.md` §3.quater. Resumen para quien trabaje en el panel:

- **`DashboardHeader`** dibuja `LocationSelector` (`src/components/layout/LocationSelector.tsx`),
  alimentado por `LocationScopeContext` (`src/contexts/LocationScopeContext.tsx`). La selección
  vive en `localStorage` — mismo patrón que `DemoContext` — **no en la URL**: `(dashboard)` no
  tiene `loading.tsx`/Suspense en ninguna de sus 14 páginas, y `useSearchParams()` ahí forzaría un
  CSR bailout del segmento entero.
- El selector se calla solo si no hay entre qué elegir (`role='location'` de una sola sede, sin
  acceso a "Todas" ni a "Sin sede"). *"Todas las sedes"* solo se dibuja a un usuario de marca.
- Cualquier página nueva que necesite el filtro llama `useLocationScope()` y anexa
  `queryParam`/`selection` a su propio `fetch()` — no hay un wrapper central de fetch en este
  repo (ver `docs/02-architecture.md`), así que cada consumidor lo hace a mano, como ya hacían
  `customers/page.tsx` o `redemptions/page.tsx` con sus otros filtros.
- **No todas las rutas del panel están cableadas.** El servidor SIEMPRE resuelve el alcance con
  `requireLocationScope()` (nunca confía en lo que mande el navegador), pero solo las rutas que
  leen tablas con `location_id` aplican `applyLocationFilter()` — la lista exacta, y por qué
  algunas quedaron fuera a propósito, está en `docs/features/multi-sede.md` § "Qué rutas quedaron
  con filtro, y cuáles no".

### `getDashboardMetrics` / `getFullAnalytics` — `{ brand, location }`

Desde F7 el JSON de `/api/dashboard/analytics` (y el de `/api/dashboard/metrics`, sin consumidores
hoy) viene partido en dos objetos. `MetricsCards` sigue recibiendo un `summary` PLANO — cada página
lo arma con `{ ...data.brand.summary, ...data.location.summary }` justo antes de pasarlo, que es el
único punto donde números de marca y de sede se tocan. El resto de componentes (`CustomerTiers`,
`VisitsChart`, `PowerRanking`, `GrowthChart`, `VisitHeatmap`, `AcquisitionChannelChart`,
`ReactivationRateChart`) no cambiaron: siguen recibiendo el mismo array/objeto de siempre, solo que
ahora sale de `.brand.X` o de `.location.X` según de qué tabla venga.

## Notas de implementación

### Heatmap — Zona horaria Colombia
El heatmap de visitas (`src/services/dashboard.service.ts`) convierte `created_at` (UTC) a `America/Bogota` (UTC-5) usando `Intl` nativo antes de extraer `getDay()` y `getHours()`. Sin esta conversión las visitas de las 9 AM Colombia aparecerían en la franja de las 14hs (UTC).

## Restricciones
- Solo admins autenticados acceden al dashboard
- La ruta `/check-in` NO requiere auth (es pública)
- Credenciales NUNCA hardcodeadas en código
- El QR del restaurante apunta a `/check-in` directamente
- Modo demo carga datos de `public/demo-data.json` (client-side)
