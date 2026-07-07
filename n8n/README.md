# Guía de Workflows n8n — Constelarys Fidelity System

> ⚠️ **v2.4.0 — multitenant:** este doc describe un workflow **compartido por todos los
> clientes** (ya no uno por cliente). Onboardear un cliente nuevo NO requiere duplicar
> workflows ni crear variables `[CLIENTE]_*` — ver `docs/04-deployment.md` §5 y §6 para el
> detalle completo. El único requisito es que el nodo HTTP que llama a
> `/api/webhook/delivery` (workflow 1, abajo) incluya el campo `tenant_slug` en el body.

## Resumen

- **n8n** = recibe mensajes WhatsApp (Twilio) + IA extrae datos + Google Contacts sync
- **Next.js API** = toda la lógica de DB (clientes, visitas, recompensas, campañas), ya
  multitenant — resuelve el cliente por `tenant_slug` (delivery) o `?tenant=` (crons)

**Workflows a crear:**
1. `domicilios_whatsapp_v4` — ⭐ **RECOMENDADO** — Parseo con IA (texto libre)
2. `google_contacts_sync` — Sync QR check-in → Google Contacts
3. `domicilios_whatsapp_v3` — (legacy, parseo con regex — solo si no quieres usar IA)

---

## WORKFLOW 1: `domicilios_whatsapp_v4` — Parseo con IA (RECOMENDADO)

**Archivo JSON:** `n8n/domicilios_whatsapp_v4.json`
**Importar en n8n:** Settings → Import from File → selecciona el JSON

### ¿Por qué v4?

El v3 requería que el mesero enviara el mensaje en formato exacto (nombre en línea 1, celular en línea 2, etc.). Si cambiaba el orden o el formato, fallaba.

El v4 usa **OpenAI (gpt-4o-mini)** para entender texto libre. El mesero puede escribir como quiera:
- "Pedido para Juan cel 3001234567 calle 100 #15 efectivo 35mil"
- "nombre: María\ntel 300-123-4567\nCra 5 #10\ntransferencia\n$42.000"
- "cliente pedro 3109876543 barrio kenedy casa 5 pago nequi total 28000"

La IA extrae los campos automáticamente.

### Flujo (8 nodos):

```
WhatsApp (Twilio) → Webhook → Extraer remitente + body
  → Validar remitente en authorized_numbers (Supabase)
  → [NO autorizado] → Responder 403
  → [SÍ autorizado] → OpenAI extrae JSON del mensaje
  → Parsear/validar respuesta IA (celular obligatorio)
  → POST /api/webhook/delivery (datos estructurados)
  → Responder TwiML al mesero (✅ o ❌)
```

### Variables de entorno de n8n requeridas:
| Variable | Valor | Dónde configurar |
|----------|-------|-----------------|
| `SUPABASE_URL` | URL del proyecto Supabase compartido | n8n → Settings → Variables |
| `SUPABASE_ANON_KEY` | Anon key de Supabase | n8n → Settings → Variables |
| `APP_URL` | URL de la app (cualquier dominio del proyecto Vercel compartido, ej: `https://clubsushiservice.constelarys.com`) | n8n → Settings → Variables |
| `WEBHOOK_SECRET` | Secret compartido con Next.js (`WEBHOOK_DELIVERY_SECRET`) | n8n → Settings → Variables |
| `OPENAI_API_KEY` | API Key de OpenAI | n8n → Settings → Variables |

> Estas variables ya NO llevan prefijo por cliente (`[CLIENTE]_`) — son un único set
> compartido por todos los tenants. Ver `docs/04-deployment.md` §5.

> ⚠️ **Multitenant:** el body que llega a este workflow (reenviado por
> `/api/webhook/twilio-incoming`) trae un campo `tenant_slug` que identifica al cliente. El
> nodo HTTP Request que hace `POST /api/webhook/delivery` **debe incluir ese campo** en el
> JSON que arma, además de los campos que extrae la IA (`phone`, `name`, `city`, `address`,
> etc.) — si falta, `/api/webhook/delivery` responde 404 "Tenant no encontrado". Ver
> `docs/04-deployment.md` §5 (W1) para el detalle de la expresión n8n exacta.

### Paso a paso:

1. **Importar** `n8n/domicilios_whatsapp_v4.json` en n8n
2. **Configurar las 5 variables** de entorno en n8n → Settings → Variables (una sola vez,
   compartidas por todos los clientes)
3. **Agregar `tenant_slug`** al nodo que llama a `/api/webhook/delivery` (ver nota arriba)
4. **Activar** el workflow y copiar la URL del webhook
5. **En Vercel**: pegar esa URL en `N8N_DOMICILIOS_WEBHOOK_URL` (una sola vez, sirve para
   todos los tenants — el webhook de Twilio-incoming ya resuelve el tenant antes de reenviar)
6. **Insertar números autorizados** en Supabase (con el `tenant_id` del cliente correspondiente):
   ```sql
   INSERT INTO authorized_numbers (phone, name) VALUES
   ('3155578231', 'Mesero 1'),
   ('3011640544', 'Mesero 2');
   ```

### Costo de OpenAI por mensaje:
- **gpt-4o-mini**: ~$0.00015 USD por mensaje (~150 input tokens + 80 output tokens)
- 100 domicilios/día = **$0.015 USD/día** = ~$0.45 USD/mes = **~$1.800 COP/mes**

### Google Contacts (NOTA):
El v4 **no incluye** Google Contacts inline como el v3. En su lugar, el webhook `/api/webhook/delivery` ya dispara el sync a n8n via `google_contacts_sync` workflow (flujo separado, más limpio).

---

## WORKFLOW 2 (LEGACY): `domicilios_whatsapp_v3` (Domicilios sin IA)

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
