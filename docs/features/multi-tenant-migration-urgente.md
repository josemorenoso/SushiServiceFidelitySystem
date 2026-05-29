# Multi-Tenant Migration — URGENTE

> Estado: En análisis. Documento creado tras request de evaluación de arquitectura multi-tenant.

## Contexto

Evaluación de migración del modelo actual (clone-por-cliente) hacia una arquitectura multi-tenant real: un solo proyecto Supabase + Vercel con aislamiento por `restaurant_id`, o mantener clones independientes con una capa SaaS central.

## Alcance evaluado

1. **Supabase** — Agregar `restaurant_id` a todas las tablas y reescribir políticas RLS.
2. **Vercel (API)** — Resolver tenant por request y filtrar todas las queries.
3. **Twilio** — Subcuentas independientes vs. Messaging Services separados.
4. **Pagos** — Modelo wallet/prepago vs. suscripción fija.

## Decisión pendiente

Ver análisis completo en conversación y `docs/scalability-analysis.md`.
