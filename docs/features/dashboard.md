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
| `/dashboard` | Métricas gamificadas (analytics, rankings, burbujas de riesgo) |
| `/dashboard/customers` | Lista de clientes con búsqueda y paginación |
| `/dashboard/rewards` | Configuración de recompensas por visitas |
| `/dashboard/campaigns` | Campañas automáticas (birthday/reactivation) + ejecución manual + historial |
| `/dashboard/qr` | Generación y descarga de código QR para mesas |
| `/dashboard/templates` | Plantillas Twilio Content API — crear, sincronizar, ver estado de aprobación |

## Componentes
| Componente | Responsabilidad |
|-----------|----------------|
| `DashboardLayout` | Sidebar + header + protección + DemoProvider |
| `DashboardSidebar` | Navegación lateral (Sushi Service branding) |
| `MetricsCards` | 7 tarjetas de métricas reales |
| `VisitsChart` | Gráfica de área: visitas QR vs Domicilios |
| `GrowthChart` | Gráfica compuesta: nuevos clientes + acumulado |
| `CustomerTiers` | Barras de niveles de poder |
| `AtRiskBubbles` | Burbujas interactivas de clientes en riesgo |
| `PowerRanking` | Top 20 clientes con ranking anime |
| `DemoToggle` | Toggle modo demostración |
| `ManualCampaigns` | Campañas manuales con filtros y predefinidas |
| `TwilioWallet` | Saldo Twilio + calculadora de costos |
| `GoogleReviewPopup` | Popup post check-in para reseñas Google Maps |
| `LoginForm` | Formulario de login |

## Branding
- Nombre: **Sushi Service**
- Tema: Rojo japonés + blanco (oklch primary hue 25)
- Icono: `UtensilsCrossed` de Lucide
- QR color: rojo oscuro (#991B1B) sobre blanco

## Notas de implementación

### Heatmap — Zona horaria Colombia
El heatmap de visitas (`src/services/dashboard.service.ts`) convierte `created_at` (UTC) a `America/Bogota` (UTC-5) usando `Intl` nativo antes de extraer `getDay()` y `getHours()`. Sin esta conversión las visitas de las 9 AM Colombia aparecerían en la franja de las 14hs (UTC).

## Restricciones
- Solo admins autenticados acceden al dashboard
- La ruta `/check-in` NO requiere auth (es pública)
- Credenciales NUNCA hardcodeadas en código
- El QR del restaurante apunta a `/check-in` directamente
- Modo demo carga datos de `public/demo-data.json` (client-side)
