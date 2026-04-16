# NEXT_STEPS — Contexto para nueva conversación

> **Última actualización:** 2026-04-16 v0.21.0
> **Lee primero:** `METODO_AINNOVATE.md` (reglas IA) → este archivo (contexto)

---

## Estado actual del sistema

**Versión:** 0.21.0 | **Deploy:** Vercel (producción) | **Build:** ✅ 33 rutas, 0 errores

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

## Nuevas features (v0.13.0–v0.17.0)

| Versión | Feature | Detalle |
|---------|---------|--------|
| v0.21.0 | TEMPLATE-ONLY WhatsApp + Campañas Black | Eliminado free-text, 5 plantillas configurables en Ajustes, presets Black+NearReward, Google Contacts doc |
| v0.20.0 | Bug Fix Crítico + Tiers v3 | Fix registro QR, Plata(0)→Oro(4)→Platino(7)→Black(10), beneficios editables, welcome hint |
| v0.19.0 | QR Mesa + Power System v2 + Black Tier | QR por mesa, sección Black premium, dashboard reordenado, bug ticket promedio |
| v0.18.0 | Customer Detail + Rewards CRUD + Consent + Freq Cap | Dialog perfil cliente, CRUD recompensas, checkbox consentimiento, frequency capping, opt-out badges |
| v0.17.0 | Dashboard Analytics Expansion | 4 nuevas gráficas: Reactivación, ROI, Heatmap, Adquisición + Settings page |
| v0.16.0 | Demo auto-login | Ruta /demo para acceso directo |

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
| Tiers v3 (sin Nuevo) | `constants/rankings.ts` | 🥈Plata(0) > 🥇Oro(4) > ⚜️Platino(7) > 👑Black(10) |

---

## PENDIENTES CRÍTICOS para MVP de producción

### 🔴 Sin esto NO se puede cobrar
1. ~~**Envío real de mensajes en campañas**~~ ✅ v0.21.0 — Usa sendTemplateMessage con Content API
2. ~~**Frequency capping**~~ ✅ v0.18.0 — 7 días entre marketing
3. ~~**Opt-out / Consent**~~ ✅ v0.18.0 — Checkbox + accepts_marketing. Falta: webhook STOP de WhatsApp
4. **Google Contacts sync en n8n** — Código listo, falta crear workflow en n8n. Ver `docs/n8n-workflows/README.md` (Workflow 4)
5. **Ejecutar migraciones 008 y 009** — `accepts_marketing` + `table_number` en Supabase
6. **Crear plantillas en Twilio** — Necesitas al menos 5 plantillas aprobadas por Meta (welcome, welcome_back, reward, birthday, reactivation). Luego asignarlas en Ajustes.
7. **Agregar `N8N_GOOGLE_CONTACTS_WEBHOOK_URL`** en env vars de Vercel

### 🟡 Alto valor (diferenciador)
1. **Dashboard público del cliente** — URL `/mi-cuenta/{uuid}` con visitas, nivel, card por tier
2. **Anti-fraude mesa** — Detección: 3+ registros seguidos misma mesa = sospechoso
3. **Eventos exclusivos Black** — Admin crea eventos solo para Black con notificación WhatsApp
4. **Cupón con código único** — QR de cupón verificable
5. **Reportes semanales por email** al admin
6. **Webhook STOP de WhatsApp** — Auto opt-out cuando el cliente responde STOP

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
- **Tiers de clientes (v0.20.0):** Plata(0+) > Oro(4+) > Platino(7+) > Black(10+). Sin tier "Nuevo".
- **WhatsApp (v0.21.0):** TODOS los mensajes usan plantillas aprobadas. No existe ventana de 24h en este sistema. Sin plantilla = no se envía.
- **Variables de plantilla:** {{1}}=nombre, {{2}}=visitas, {{3}}=hint/premio (estándar para todos los tipos).
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
