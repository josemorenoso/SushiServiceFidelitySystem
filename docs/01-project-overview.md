# RestaurantQR — Plataforma de Fidelización y CRM

## Visión
Plataforma integral (Full-Stack) de fidelización, CRM y automatización de marketing para un restaurante. Permite registrar clientes presenciales vía QR, captar clientes de domicilios por WhatsApp, ejecutar campañas automatizadas/manuales con Twilio y administrar todo desde un Dashboard centralizado.

## Objetivos
- Registrar clientes presenciales mediante códigos QR en mesa con flujo de bienvenida automatizado
- Procesar clientes de domicilios a través de mensajes de WhatsApp reenviados por meseros
- Enviar campañas de marketing automatizadas (cumpleaños, reactivación) y manuales (masivas segmentadas) vía Twilio/WhatsApp
- Proveer un Dashboard administrativo para gestión de clientes, métricas, recompensas y campañas

## Stack Técnico
| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend | React | 19.2.4 |
| Framework | Next.js (App Router) | 16.2.2 |
| Backend | API Routes (Next.js) | - |
| Base de datos | Supabase (PostgreSQL) | - |
| Auth | Supabase Auth | - |
| Estilos | TailwindCSS | 4.x |
| Componentes UI | shadcn/ui + Lucide React | latest |
| Mensajería | Twilio SDK (WhatsApp) | - |
| Deploy | Vercel | Producción |

## Estado del Proyecto
| Fase | Descripción | Estado |
|------|-------------|--------|
| 1 | Setup + Auth + Estructura base | ✅ Completo |
| 2 | QR Check-in (Registro presencial) | ✅ Completo |
| 3 | Webhook Domicilios (WhatsApp + n8n + Google Contacts) | ✅ Completo — n8n en producción |
| 4 | Campañas y Automatizaciones (Cron) | ✅ Completo — Vercel crons configurados |
| 5 | Dashboard Administrativo | ✅ Completo — Twilio conectado |
| 6 | Deploy Vercel + Fixes post-deploy | ✅ v0.24.0 — Control de tráfico, frequency cap, recovery zone |
| 7 | UX Check-in mejorado | ✅ v0.25–0.29 — Dropdowns, combobox ciudad, consentimiento legal |
| 8 | Modelo clone-por-cliente | ✅ En producción — Sushi Service desplegado |
| 9 | Radar de Segmentos + dashboard auto-refresh | ✅ v0.25.0 — SegmentRadar en campañas |
| 10 | Sistema de Puntos + Mystery Box | ✅ v1.0.0–v1.0.2 — Algoritmo inteligente de 3 visitas, tiers acumulativos, pity timer, global caps. Fix v1.0.2: API resistente a fallos, teléfono correcto, puntos en welcome, feedback mystery box |

## Modelo de Despliegue
El sistema funciona como **clone-por-cliente**: cada restaurante tiene su propio proyecto Supabase + proyecto Vercel + rama GitHub, todos compartiendo una única cuenta Twilio (Messaging Service centralizado). La configuración por cliente se gestiona vía variables de entorno en Vercel.

## Principio Fundamental
> El sistema debe ser simple para el cliente final (solo ingresa su celular) y poderoso para el administrador (dashboard con métricas, campañas y gestión completa).
