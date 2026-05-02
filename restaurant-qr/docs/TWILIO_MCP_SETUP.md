# Configuración Twilio MCP Server

## ¿Qué es?
El Twilio Alpha MCP Server permite que la IA (Cascade/Windsurf) interactúe directamente con tu cuenta de Twilio para:
- Crear/editar plantillas de WhatsApp
- Verificar estado de aprobación de plantillas
- Consultar saldo de la cuenta
- Listar números telefónicos
- Enviar mensajes de prueba

## Credenciales Necesarias

Necesitas **3 valores** de tu cuenta Twilio:

### 1. Account SID
- Entra a [Twilio Console](https://console.twilio.com/)
- En el Dashboard principal, copia tu **Account SID** (empieza con `AC...`)

### 2. API Key SID
- Ve a **Account > API keys & tokens > Create API Key**
- O usa: https://console.twilio.com/us1/account/keys-credentials/api-keys
- Tipo: **Standard**
- Copia el **SID** (empieza con `SK...`)

### 3. API Secret
- Se muestra **una sola vez** al crear la API Key
- ⚠️ Guárdalo inmediatamente

## Pasos de Configuración

### 1. Edita `.windsurf/mcp_config.json`

Reemplaza los placeholders en la línea de credenciales:

```
"TWILIO_ACCOUNT_SID/TWILIO_API_KEY:TWILIO_API_SECRET"
```

Con tus valores reales:
```
"ACxxxxxxxxxx/SKxxxxxxxxxx:your_api_secret_here"
```

### 2. Agrega al `.env.local` (si no los tienes)

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
TWILIO_API_KEY=SKxxxxxxxxxx
TWILIO_API_SECRET=your_api_secret
```

### 3. Reinicia Windsurf
Después de editar el `mcp_config.json`, reinicia el IDE para que cargue el MCP server.

## Servicios Habilitados

| Servicio | Tags | Uso |
|----------|------|-----|
| `twilio_api_v2010` | Messages, Phone Numbers, Balance | Envío de SMS/WhatsApp, consulta de saldo |
| `twilio_content_v1` | Content, ApprovalRequest | Crear plantillas, solicitar aprobación |
| `twilio_messaging_v1` | Service, Template | Gestionar servicios de mensajería |

## Verificación

Una vez configurado, pídele a Cascade:
- "Lista mis números de Twilio"
- "Muéstrame el saldo de mi cuenta Twilio"
- "Lista las plantillas de contenido de Twilio"

Si responde con datos reales, está funcionando correctamente.

## Seguridad
- ⚠️ **NUNCA** commitear `mcp_config.json` con credenciales reales
- El archivo ya está en `.gitignore`
- Las credenciales solo se usan localmente por el MCP server
