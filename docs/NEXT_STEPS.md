# NEXT_STEPS — Contexto para nueva conversación

> **Última actualización:** 2026-04-11 v0.12.0
> **Lee primero:** `METODO_AINNOVATE.md` (reglas IA) → este archivo (contexto)

---

## Estado actual del sistema

**Versión:** 0.12.0 | **Deploy:** Vercel (producción) | **Build:** ✅ 28 rutas, 0 errores

### Infraestructura operativa
- **Vercel:** Proyecto conectado a GitHub, deploy automático
- **Supabase:** PostgreSQL + Auth (usuario admin creado)
- **Twilio:** Cuenta conectada ($20 saldo), 7 plantillas aprobadas en WhatsApp
- **n8n:** https://n8n.almojabananet.me — workflow delivery en producción
- **WhatsApp Business:** En verificación por Meta (pendiente aprobación del nombre)
- **Vercel Crons:** `vercel.json` configurado (birthday 8AM, reactivation 10AM UTC)
- **CRON_SECRET:** Debe estar en env vars de Vercel

### URLs importantes
- **Dashboard:** https://restaurant-fidelity-system-9tirrpmc1-josemorenosos-projects.vercel.app/dashboard
- **n8n:** https://n8n.almojabananet.me
- **Google Maps Review:** https://share.google/XDfNCZIn7QFQaAME9

---

## Fixes completados (v0.11.0 + v0.12.0)

| Fix | Archivo | Detalle |
|-----|---------|---------|
| Login multi-click | `login/page.tsx` | `window.location.href` en vez de `router.push` |
| QR vacío en preview | `dashboard/qr/page.tsx` | `<img>` en vez de `<canvas>` (race condition) |
| Campañas: mensaje libre → plantillas | `ManualCampaigns.tsx` | Selector de plantillas aprobadas, no textarea |
| Rate limit check-in | `api/check-in/route.ts` | Máx 1 visita/día (1440 min) |
| Admin override check-in | `api/dashboard/check-in-override/route.ts` | Endpoint protegido para visitas extra |
| Templates "Borrador" | `api/dashboard/templates/route.ts` | Fetch approval status por SID individual |
| Tiers → metales preciosos | `constants/rankings.ts` | 💎Diamante > ⚜️Platino > 🥇Oro > 🥈Plata > 🥉Bronce > ✨Nuevo |

---

## PENDIENTES CRÍTICOS para MVP de producción

### 🔴 Sin esto NO se puede cobrar
1. **Envío real de mensajes en campañas** — `campaigns/manual/route.ts` crea records pero NO envía por Twilio. Implementar `twilio.messages.create()` con la plantilla seleccionada
2. **Frequency capping** — Campo `last_campaign_at` en `customers` + check 7 días entre campañas/marketing por cliente
3. **Opt-out / STOP** — Manejar respuesta "STOP" → marcar `opted_out = true` → excluir de campañas
4. **Google Contacts sync real** — Crear workflow n8n que reciba webhook y cree/actualice contacto. Agregar `N8N_GOOGLE_CONTACTS_WEBHOOK_URL` en env vars
5. **Error handling de envío** — Registrar errores de Twilio por mensaje, reintentos, status de delivery

### 🟡 Alto valor (diferenciador)
6. **Dashboard público del cliente** — URL `/mi-cuenta/{phone}` con visitas, nivel, próxima recompensa
7. **Notificación pre-recompensa** — "¡Te falta 1 visita para tu premio!"
8. **Cupón con código único** — QR de cupón verificable, no solo "ven y pide"
9. **Reportes semanales por email** al admin
10. **Onboarding WhatsApp** — Primer mensaje con botón "Aceptar comunicaciones"

### 🟢 Fase 2
11. Referral program (código de amigo)
12. A/B testing de plantillas
13. Integración POS
14. WhatsApp Flows (menú interactivo)
15. Multi-sucursal

---

## Decisiones tomadas

- **Creación de plantillas:** Se mantiene en el dashboard (crea en Twilio Content API + auto-submit aprobación). Se recomendó agregar warnings visibles sobre riesgo de rechazo.
- **Plantillas en campañas:** Solo se pueden usar plantillas con `approval_status === 'approved'`. No se permite mensaje libre.
- **Rate limit check-in:** 1 por día (24h). Override vía endpoint admin `POST /api/dashboard/check-in-override`.
- **Tiers de clientes:** Diamante(25+) > Platino(18+) > Oro(12+) > Plata(7+) > Bronce(3+) > Nuevo(1+).
- **Anti-spam Meta:** Máx 250 conversaciones/24h (número nuevo). Escala con quality rating. Recomendado: 1 campaña marketing/semana por cliente.

---

## Archivos clave para contexto rápido

| Para entender... | Lee... |
|------------------|--------|
| Visión y stack | `docs/01-project-overview.md` |
| Estructura carpetas | `docs/02-architecture.md` |
| Endpoints API | `docs/API_DOCS.md` |
| Schema DB | `docs/DB_SCHEMA.md` |
| Seguridad/Auth | `docs/03-security.md` |
| Historial cambios | `CHANGELOG.md` (últimas 3 versiones) |
| Reglas para IA | `METODO_AINNOVATE.md` |
| **Este archivo** | `docs/NEXT_STEPS.md` ← estado actual + pendientes |
