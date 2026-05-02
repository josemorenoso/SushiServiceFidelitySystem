# Seguridad — RestaurantQR

## Autenticación
- **Método:** Supabase Auth (email + password) para administradores del dashboard
- **Flujo:** Login → Supabase genera JWT → se almacena en cookies HttpOnly vía `@supabase/ssr`
- **Sesión:** Manejo server-side con middleware de Next.js que refresca tokens automáticamente
- **Rutas públicas:** `/check-in` (no requiere auth — acceso por QR del restaurante)
- **Rutas protegidas:** `/dashboard/*` (requieren login de administrador)

## Autorización
- **Roles:** Solo un rol: `admin` (administradores del restaurante)
- **Clientes:** No tienen cuenta de usuario — se identifican solo por número de celular
- **RLS:** Activado en todas las tablas. Las políticas limitan acceso según `auth.uid()` para admins
- **API Routes:** Los webhooks validan origen (números autorizados). Los cron jobs validan `CRON_SECRET`

## Variables de Entorno
| Variable | Exposición | Protección |
|----------|-----------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente (pública) | Solo lectura vía RLS |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente (pública) | Limitada por políticas RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor | NUNCA exponer al cliente |
| `TWILIO_ACCOUNT_SID` | Solo servidor | En .env.local |
| `TWILIO_AUTH_TOKEN` | Solo servidor | En .env.local |
| `TWILIO_WHATSAPP_NUMBER` | Solo servidor | En .env.local |
| `CRON_SECRET` | Solo servidor | Valida peticiones a /api/cron/* |

## Validaciones de Entrada
- **Número de celular:** Formato colombiano validado (10 dígitos, prefijo 3)
- **Nombre:** Sanitizado, longitud mínima 2 caracteres
- **Fecha de nacimiento:** Formato válido, no futura
- **Webhook de domicilios:** Valida que el número remitente esté en `authorized_numbers`
- **Cron jobs:** Valida header `Authorization: Bearer {CRON_SECRET}`

## Reglas INVIOLABLES
- NUNCA hardcodear credenciales en el código
- NUNCA exponer `SUPABASE_SERVICE_ROLE_KEY` en el cliente
- NUNCA desactivar RLS sin autorización explícita
- NUNCA hacer deploy sin checklist de seguridad
- SIEMPRE validar input en servidor (no confiar en cliente)
- SIEMPRE usar tipos TypeScript para prevenir inyección
- SIEMPRE sanitizar datos de WhatsApp antes de guardar en DB
- SIEMPRE validar origen de webhooks (números autorizados)
