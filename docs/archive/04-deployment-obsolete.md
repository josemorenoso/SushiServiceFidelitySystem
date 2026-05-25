# Deployment — RestaurantQR

> Este documento se llenará cuando se configure el proceso de deploy.

## Plataforma
- **Target:** Vercel (pendiente de configuración)

## Checklist Pre-Deploy
- [ ] `.env.local` NO está en el repositorio
- [ ] Variables de entorno configuradas en Vercel
- [ ] `SUPABASE_SERVICE_ROLE_KEY` solo en variables de servidor
- [ ] RLS activado en todas las tablas
- [ ] Build exitoso sin errores TypeScript
- [ ] Cron jobs configurados (Vercel Cron o externo)

## Variables de Entorno en Producción
| Variable | Configurada | Nota |
|----------|------------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | [ ] | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | [ ] | |
| `SUPABASE_SERVICE_ROLE_KEY` | [ ] | Solo server |
| `TWILIO_ACCOUNT_SID` | [ ] | Solo server |
| `TWILIO_AUTH_TOKEN` | [ ] | Solo server |
| `TWILIO_WHATSAPP_NUMBER` | [ ] | Solo server |
| `CRON_SECRET` | [ ] | Solo server |
