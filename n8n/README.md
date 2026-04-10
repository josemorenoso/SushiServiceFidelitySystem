# Guía de Workflows n8n — RestaurantQR

## Resumen: ¿Qué cambió vs tu workflow v2?

Tu workflow v2 hacía **todo** en n8n (parseo, Google Contacts, Supabase). Ahora el flujo se **divide**:
- **n8n** = recibe Twilio + parsea + Google Contacts
- **Next.js API** = toda la lógica de DB (clientes, visitas, recompensas, campañas)

**Necesitas crear 2 workflows nuevos** (no modificar el v2):

---

## WORKFLOW 1: `domicilios_whatsapp_v3` (Domicilios)

**Archivo JSON:** `n8n/domicilios_whatsapp_v3.json`
**Importar en n8n:** Settings → Import from File → selecciona el JSON

### Flujo (15 nodos):

1. **Webhook Domicilio** → recibe POST de Twilio (path: `/domicilios`)
2. **Extraer Remitente** → limpia el `From` de WhatsApp, extrae los últimos 10 dígitos
3. **Validar Remitente en DB** → HTTP GET a Supabase `authorized_numbers` buscando el teléfono con `is_active=true` (ya NO es hardcoded)
4. **Remitente Autorizado?** → IF: si la respuesta tiene resultados → continuar, si no → rechazar
5. **Responder No Autorizado** → (rama false) responde JSON 403
6. **Parsear Mensaje Pedido** → (rama true) extrae del Body: `nombre_cliente`, `celular`, `direccion`, `metodo_pago`, `monto_total`. Valida que celular sea 10 dígitos colombiano
7. **Buscar en Google Contacts** → HTTP GET a Google People API buscando por celular
8. **Contacto Existe?** → IF: si hay resultados
9. **Crear Contacto Nuevo** → (rama false) HTTP POST a Google People API con nombre + teléfono + dirección
10. **Comparar Datos Contacto** → (rama true) compara nombre y dirección actuales vs nuevos
11. **Necesita Actualizar?** → IF: si hay cambios
12. **Actualizar Contacto** → (rama true) HTTP PATCH a Google People API
13. **Merge Google Contacts** → une las ramas de crear/actualizar/skip
14. **Registrar en RestaurantQR API** → HTTP POST a tu app `/api/webhook/delivery` con los datos parseados + header `x-webhook-secret`
15. **Responder OK Domicilio** → responde TwiML XML con confirmación

### Variables de entorno de n8n requeridas:
| Variable | Valor | Dónde configurar |
|----------|-------|-----------------|
| `SUPABASE_URL` | `https://ijgajxoqmjdveeknabsa.supabase.co` | n8n → Settings → Variables |
| `SUPABASE_ANON_KEY` | Tu anon key de Supabase | n8n → Settings → Variables |
| `RESTAURANT_API_URL` | URL de tu app Next.js (ej: `https://tu-app.vercel.app` o `http://localhost:3000`) | n8n → Settings → Variables |
| `WEBHOOK_DELIVERY_SECRET` | Un secret que inventes (mismo valor en `.env.local` de Next.js) | n8n → Settings → Variables |

### Paso a paso para configurar:

1. **Importar el workflow:**
   - En n8n → hamburger menu → Import from File → `domicilios_whatsapp_v3.json`

2. **Configurar variables de entorno:**
   - En n8n → Settings → Variables → crea las 4 variables de arriba

3. **Configurar credencial Google OAuth2:**
   - En n8n → Credentials → Add Credential → OAuth2 API
   - Configura con tu Google Cloud Console (People API habilitada)
   - Asigna esta credencial a los 3 nodos de Google Contacts (Buscar, Crear, Actualizar)

4. **Activar el workflow:**
   - Toggle "Active" arriba a la derecha
   - Copia la URL del webhook (la necesitas en Twilio)

5. **Configurar Twilio:**
   - En Twilio → WhatsApp Sandbox → Webhook URL → pega la URL de n8n
   - Método: POST

6. **Configurar Next.js:**
   - En tu `.env.local` agrega: `WEBHOOK_DELIVERY_SECRET=el-mismo-secret-que-pusiste-en-n8n`

7. **Insertar números autorizados en Supabase:**
   ```sql
   INSERT INTO authorized_numbers (phone, name) VALUES
   ('3155578231', 'Mesero 1'),
   ('3011640544', 'Mesero 2');
   ```

---

## WORKFLOW 2: `google_contacts_sync` (Sync desde QR Check-in)

**Archivo JSON:** `n8n/google_contacts_sync.json`

### Flujo (8 nodos):

1. **Webhook Google Contacts Sync** → recibe POST de nuestra API (path: `/google-contacts-sync`)
2. **Buscar en Google Contacts** → HTTP GET a Google People API buscando por celular
3. **Contacto Existe?** → IF: si hay resultados
4. **Crear Contacto** → (rama false) HTTP POST crea contacto con nombre + teléfono
5. **Comparar Datos** → (rama true) compara nombre y dirección actuales vs nuevos
6. **Necesita Actualizar?** → IF: si hay cambios
7. **Actualizar Contacto** → (rama true) HTTP PATCH actualiza datos
8. **No Necesita Update** → (rama false) no-op

### Paso a paso:

1. **Importar:** igual que workflow 1
2. **Credencial Google:** asignar la misma credencial OAuth2
3. **Activar** y copiar la URL del webhook
4. **En tu `.env.local`:**
   ```
   N8N_GOOGLE_CONTACTS_WEBHOOK_URL=https://tu-n8n.com/webhook/google-contacts-sync
   ```

Ahora cuando un cliente hace check-in por QR, nuestra API automáticamente dispara este webhook y n8n crea/actualiza el contacto en Google Contacts.

---

## Diagrama de Flujo Completo

```
                    ┌─────────────────────────────┐
                    │       TWILIO (WhatsApp)       │
                    └──────────────┬───────────────┘
                                   │ POST webhook
                                   ▼
                    ┌─────────────────────────────┐
                    │  n8n: domicilios_whatsapp_v3 │
                    │  - Extraer remitente          │
                    │  - Validar en authorized_nums │
                    │  - Parsear mensaje            │
                    │  - Google Contacts sync       │
                    └──────────────┬───────────────┘
                                   │ POST /api/webhook/delivery
                                   ▼
┌──────────┐     ┌─────────────────────────────┐     ┌──────────┐
│  Cliente  │────▶│     Next.js API               │────▶│ Supabase │
│  (QR)    │     │  - /api/check-in              │     │   DB     │
└──────────┘     │  - /api/webhook/delivery      │     └──────────┘
                 │  - /api/cron/birthday          │
                 │  - /api/cron/reactivation      │
                 └──────────────┬───────────────┘
                                │ POST webhook (best-effort)
                                ▼
                 ┌─────────────────────────────┐
                 │  n8n: google_contacts_sync    │
                 │  - Buscar contacto            │
                 │  - Crear o actualizar         │
                 └─────────────────────────────┘
```

---

## Tu workflow v2 vs v3: diferencias clave

| Aspecto | v2 (tu original) | v3 (nuevo) |
|---------|------------------|------------|
| Números autorizados | Hardcoded en el código | Consulta `authorized_numbers` en Supabase |
| Supabase | Proyecto separado (`vadqeazuuarznnurpokq`) | Proyecto unificado (`ijgajxoqmjdveeknabsa`) |
| Credenciales | Hardcoded en nodos | Variables de entorno de n8n |
| Lógica de DB | n8n llama RPC + inserta directamente | n8n llama nuestra API, la API maneja todo |
| Google Contacts | Solo domicilios | Domicilios + QR Check-in |
| Recompensas | No evaluaba | La API evalúa automáticamente |
| Respuesta | JSON simple | TwiML (Twilio lo muestra al mesero) |
