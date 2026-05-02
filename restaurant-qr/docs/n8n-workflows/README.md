# Workflows de n8n para Sushi Service

## Instancia: https://n8n.almojabananet.me

---

## Workflow 1: Registro de Domicilios (WhatsApp → API)

**Archivo:** `01-delivery-webhook.json`

### Flujo
```
Twilio WhatsApp → n8n Webhook → Parsear Mensaje → POST /api/webhook/delivery → OK
```

### Pasos para configurar

#### 1. Importar el workflow
1. Abre https://n8n.almojabananet.me
2. Ve a **Workflows** → **Import from file**
3. Selecciona `01-delivery-webhook.json`

#### 2. Configurar variables de entorno en n8n
Ve a **Settings** → **Variables** y crea:

| Variable | Valor |
|----------|-------|
| `APP_URL` | `https://TU_DOMINIO_VERCEL` (ej: `https://sushi-service.vercel.app`) |
| `WEBHOOK_DELIVERY_SECRET` | El mismo secreto que tienes en `.env.local` |

#### 3. Activar el workflow
1. Click en el toggle para **activar** el workflow
2. Copia la **URL del webhook** que te da n8n (algo como `https://n8n.almojabananet.me/webhook/sushi-delivery`)

#### 4. Configurar Twilio para enviar a n8n
1. Ve a [Twilio Console → Messaging → WhatsApp Senders](https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders)
2. En tu número de WhatsApp, configura:
   - **When a message comes in:** `https://n8n.almojabananet.me/webhook/sushi-delivery`
   - **Method:** POST

### Formato de mensaje esperado
El parser es flexible, pero el formato ideal es:
```
Pedido de Juan Pérez
Dirección: Calle 100 #15-20
Pago: Efectivo
Total: $45000
```

Si el formato varía, ajusta el nodo "Parsear Mensaje" en n8n.

---

## Workflow 2: Cron de Cumpleaños (alternativa a Vercel Cron)

Si prefieres no usar Vercel Cron, puedes crear un workflow en n8n:

### Configuración manual
1. **Trigger:** Schedule → Todos los días a las 8:00 AM (Colombia = UTC-5 → 13:00 UTC)
2. **HTTP Request:**
   - Method: `POST`
   - URL: `{{$env.APP_URL}}/api/cron/birthday`
   - Headers: `Authorization: Bearer {{$env.CRON_SECRET}}`

---

## Workflow 3: Cron de Reactivación (alternativa a Vercel Cron)

1. **Trigger:** Schedule → Todos los días a las 10:00 AM (15:00 UTC)
2. **HTTP Request:**
   - Method: `POST`
   - URL: `{{$env.APP_URL}}/api/cron/reactivation`
   - Headers: `Authorization: Bearer {{$env.CRON_SECRET}}`

---

## Workflow 4: Google Contacts Sync (Supabase → Google)

**Estado del código:** ✅ Implementado en `src/services/google-contacts-sync.service.ts`
**Estado del workflow n8n:** ⚠️ PENDIENTE de crear

### Cómo funciona

Cada vez que un cliente se registra o hace check-in (QR o delivery), el sistema envía un POST al webhook de n8n con todos los datos del cliente. n8n debe crear o actualizar el contacto en Google Contacts.

```
Cliente escanea QR → Supabase (crear/actualizar) → POST webhook n8n → n8n crea/actualiza Google Contact
```

### Payload que envía el sistema

```json
{
  "celular": "+573001234567",
  "nombre_cliente": "Juan Pérez",
  "cumpleanos": "1990-05-15",
  "ciudad": "Bogotá",
  "total_visitas": 5,
  "direccion": "Calle 100 #15-20",
  "source": "qr",
  "action": "created"
}
```

### Pasos para crear el workflow en n8n

#### 1. Crear nuevo workflow "Google Contacts Sync"

#### 2. Nodo 1: Webhook (trigger)
- **Method:** POST
- **Path:** `google-contacts-sync`
- **Response Mode:** Immediately

#### 3. Nodo 2: IF (¿action = created?)
- Condición: `{{$json.action}}` equals `created`
- **True** → Nodo 3A (crear contacto)
- **False** → Nodo 3B (actualizar contacto)

#### 4. Nodo 3A: Google Contacts — Create Contact
- **Autenticación:** OAuth2 con cuenta de Google del negocio
- **Campos a mapear:**
  - Name: `{{$json.nombre_cliente}}`
  - Phone: `{{$json.celular}}`
  - Birthday: `{{$json.cumpleanos}}`
  - Notes: `Visitas: {{$json.total_visitas}} | Ciudad: {{$json.ciudad}} | Fuente: {{$json.source}}`
  - Group: "Clientes Sushi Service" (crear grupo en Google Contacts primero)

#### 5. Nodo 3B: Google Contacts — Update Contact
- **Buscar por:** teléfono (`{{$json.celular}}`)
- **Actualizar:** Name, Notes (con visitas actualizadas)

#### 6. Activar y copiar URL del webhook
- La URL será algo como: `https://n8n.almojabananet.me/webhook/google-contacts-sync`

#### 7. Configurar variable de entorno en Vercel
```
N8N_GOOGLE_CONTACTS_WEBHOOK_URL=https://n8n.almojabananet.me/webhook/google-contacts-sync
```

### Notas importantes
- El sync es **fire-and-forget**: si n8n falla, el flujo principal (check-in/delivery) NO se rompe
- El timeout es de 10 segundos
- Si `N8N_GOOGLE_CONTACTS_WEBHOOK_URL` no está configurada, el sync simplemente se omite con un log warning

---

## Variables de entorno necesarias en n8n

| Variable | Descripción |
|----------|-------------|
| `APP_URL` | URL de tu app en Vercel (sin / al final) |
| `WEBHOOK_DELIVERY_SECRET` | Secreto compartido para autenticar el webhook |
| `CRON_SECRET` | Secreto para autenticar los cron jobs (solo si usas n8n para crons) |

---

## Test rápido

Para probar el webhook sin WhatsApp real:

```bash
curl -X POST https://n8n.almojabananet.me/webhook-test/sushi-delivery \
  -H "Content-Type: application/json" \
  -d '{"Body": "Pedido de Test User\nDirección: Calle 123\nPago: Efectivo\nTotal: $30000", "From": "whatsapp:+573001234567"}'
```
