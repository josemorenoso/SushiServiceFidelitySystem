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
| Deploy | Vercel (pendiente) | - |

## Estado del Proyecto
| Fase | Descripción | Estado |
|------|-------------|--------|
| 1 | Setup + Auth + Estructura base | [x] Completo |
| 2 | QR Check-in (Registro presencial) | [x] Completo (falta migración en Supabase) |
| 3 | Webhook Domicilios (WhatsApp + n8n + Google Contacts) | [x] Completo (falta config n8n) |
| 4 | Campañas y Automatizaciones (Cron) | [x] Completo (falta migración + CRON_SECRET) |
| 5 | Dashboard Administrativo | [x] Completo (falta crear usuario Supabase Auth) |
| 6 | Polish + Deploy | [ ] Pendiente |

## Principio Fundamental
> El sistema debe ser simple para el cliente final (solo ingresa su celular) y poderoso para el administrador (dashboard con métricas, campañas y gestión completa).
