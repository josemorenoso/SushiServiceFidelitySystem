# Checklist para Prueba Real del Producto

## Estado: 🟡 Casi listo — faltan configuraciones externas

---

## 1. Supabase (Base de Datos)

### ✅ Ya hecho
- Schema diseñado (customers, visits, rewards, campaigns, campaign_messages, authorized_numbers)
- Migraciones SQL creadas (00001 a 00005)
- RLS policies definidas
- Tipos TypeScript generados

### 🔴 Pendiente
- [ ] **Ejecutar las migraciones** en la instancia de Supabase de producción
  ```
  supabase/migrations/00001_initial_schema.sql
  supabase/migrations/00002_authorized_numbers.sql
  supabase/migrations/00003_delivery_fields.sql
  supabase/migrations/00004_campaigns.sql
  supabase/migrations/00005_add_city.sql
  ```
- [ ] **Crear usuario admin** en Supabase Auth (email + password para login del dashboard)
- [ ] **Configurar rewards** iniciales en la tabla `rewards` (ej: visita 3 = postre gratis, visita 5 = rollo gratis, etc.)
- [ ] **Insertar número autorizado** en `authorized_numbers` (el número de WhatsApp de Twilio)

---

## 2. Twilio (WhatsApp)

### ✅ Ya hecho
- API de envío de mensajes integrada
- Billetera Twilio visible en dashboard
- Templates API integrada (crear, listar, ver estado aprobación)

### 🔴 Pendiente
- [ ] **Cuenta Twilio activa** con saldo (mín ~$5 USD para pruebas)
- [ ] **Número WhatsApp Business** aprobado por Meta
  - Mientras se aprueba, se puede usar el Sandbox de Twilio: `whatsapp:+14155238886`
  - Los usuarios deben enviar "join [keyword]" al sandbox primero
- [ ] **Plantillas aprobadas** por Meta/WhatsApp Business
  - Crear plantillas desde `/dashboard/templates` → enviarlas a aprobación
  - Meta tarda 24-48h en aprobar
  - Mientras tanto, se pueden enviar mensajes de sesión (24h window)
- [ ] **Configurar `.env.local`**:
  ```env
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
  TWILIO_AUTH_TOKEN=xxxxxxxxxx
  TWILIO_WHATSAPP_NUMBER=whatsapp:+1xxxxxxxxxx
  ```
- [ ] **Configurar MCP** (opcional, para gestión desde IDE): ver `docs/TWILIO_MCP_SETUP.md`

---

## 3. n8n (Automatización Domicilios)

### ✅ Ya hecho
- Webhook `/api/webhook/delivery` listo para recibir datos de n8n
- Procesa: nombre, celular, dirección, método de pago, monto, mensaje raw

### 🔴 Pendiente
- [ ] **Instancia n8n** corriendo (self-hosted o n8n.cloud)
- [ ] **Workflow: WhatsApp → Parseo → API**
  1. **Trigger:** Twilio Webhook (recibe mensajes de WhatsApp entrantes)
  2. **Parsear** el mensaje para extraer: nombre, celular, dirección, método de pago, monto
  3. **HTTP Request** POST a `https://TU_DOMINIO/api/webhook/delivery`
     - Header: `x-webhook-secret: TU_WEBHOOK_DELIVERY_SECRET`
     - Body:
     ```json
     {
       "nombre_cliente": "Juan Pérez",
       "celular": "3009876543",
       "direccion": "Calle 100 #15-20",
       "metodo_pago": "efectivo",
       "monto_total": 45000,
       "raw_message": "Pedido original..."
     }
     ```
- [ ] **Workflow: Google Contacts Sync** (opcional)
  - Sincronizar nuevos clientes con Google Contacts para backup
- [ ] **Configurar `.env.local`**:
  ```env
  WEBHOOK_DELIVERY_SECRET=tu_secreto_seguro
  N8N_GOOGLE_CONTACTS_WEBHOOK_URL=https://tu-n8n/webhook/google-contacts-sync
  ```
- [ ] **Darme la URL del webhook de n8n** para configurar el trigger de Twilio

---

## 4. Cron Jobs (Campañas Automáticas)

### ✅ Ya hecho
- `/api/cron/birthday` — felicitaciones de cumpleaños
- `/api/cron/reactivation` — reactivación a 21+ días inactivos

### 🔴 Pendiente
- [ ] **Configurar cron externo** que llame diariamente a:
  - `POST /api/cron/birthday` con header `Authorization: Bearer {CRON_SECRET}`
  - `POST /api/cron/reactivation` con header `Authorization: Bearer {CRON_SECRET}`
  - Opciones: Vercel Cron, cron-job.org, o workflow de n8n con Schedule Trigger
- [ ] **Configurar `.env.local`**:
  ```env
  CRON_SECRET=un_secreto_seguro_para_crons
  ```

---

## 5. Google Maps Review

### ✅ Ya hecho
- Popup dopamínico post check-in integrado
- Funciona para nuevos y recurrentes

### 🔴 Pendiente
- [ ] **Obtener link de reseñas de Google Maps** del negocio
  - Ve a Google Maps → Tu negocio → Compartir → Copiar link
  - O usa: `https://g.page/r/TU_PLACE_ID/review`
- [ ] **Configurar `.env.local`**:
  ```env
  NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL=https://g.page/r/TU_PLACE_ID/review
  ```

---

## 6. Deploy

### 🔴 Pendiente
- [ ] **Elegir hosting**: Vercel (recomendado) o alternativa
- [ ] **Subir variables de entorno** al hosting
- [ ] **Conectar dominio** personalizado (ej: app.sushiservice.com)
- [ ] **Generar QR code** desde `/dashboard/qr` apuntando a `https://TU_DOMINIO/check-in`
- [ ] **Imprimir QRs** para las mesas del restaurante

---

## 7. Billetera Twilio — Sincronización Real

### ✅ Ya hecho
- API `/api/dashboard/twilio-balance` consulta saldo real
- Dashboard muestra: saldo, costo/msg, mensajes disponibles

### Cómo funciona
1. La billetera se muestra automáticamente en `/dashboard/campaigns`
2. El saldo se obtiene de la API real de Twilio (`/2010-04-01/Accounts/{SID}/Balance.json`)
3. Para recargar: botón directo a [Twilio Console Billing](https://www.twilio.com/console/billing)
4. Costo estimado se calcula automáticamente: $0.0058 USD/msg × tipo de cambio COP

### 🔴 Para que funcione en producción
- [ ] Tener `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN` configurados
- [ ] Tener saldo positivo en la cuenta Twilio

---

## Resumen de Variables de Entorno Necesarias

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Twilio
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+1xxx

# Cron
CRON_SECRET=xxx

# Webhook
WEBHOOK_DELIVERY_SECRET=xxx

# Google
NEXT_PUBLIC_GOOGLE_MAPS_REVIEW_URL=https://g.page/r/xxx/review

# n8n (opcional)
N8N_GOOGLE_CONTACTS_WEBHOOK_URL=https://xxx
```

---

## Orden Recomendado de Setup

1. Ejecutar migraciones SQL en Supabase
2. Crear usuario admin en Supabase Auth
3. Configurar .env.local con todas las variables
4. Deploy a Vercel
5. Configurar Twilio (número, sandbox, templates)
6. Crear plantillas desde el dashboard
7. Configurar n8n workflows
8. Configurar cron jobs
9. Generar QRs e imprimir
10. Prueba end-to-end completa
